// Terminal React component.
//
// Terminal modes:
//   normal     — interactive prompt; user types commands, output streams above
//   animating  — a command is replaying a timed sequence (boot, ssh cinematic);
//                input is suppressed until it completes
//   live       — a command owns the screen and renders frames on an interval
//                (e.g. top); only q / Esc / Ctrl+C exits
//   editor     — the modal NanoEditor replaces the entire terminal until the
//                user saves and/or exits

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { makeFS, cloneFS, parentOf } from './filesystem.jsx';
import { parseLine } from './parser.jsx';
import { completeInput } from './autocomplete.jsx';
import { playKeySound, soundForKey } from './sounds.jsx';
import { COMMANDS } from './commands.jsx';
import { NanoEditor } from './editor.jsx';
import { buildBootSteps } from './boot.jsx';

// Flatten a command's `out` into plain strings for the next pipe stage.
// Most commands emit strings; `ls` / `vfs` emit rows of { text, kind } objects.
function pipeLinesFromResult(result) {
  const lines = [];
  for (const o of (result.out || [])) {
    if (typeof o === 'string') lines.push(o);
    else if (
      Array.isArray(o) && o.length &&
      typeof o[0] === 'object' && o[0] !== null && 'text' in o[0]
    ) {
      lines.push(o.map((seg) => seg.text).join('  '));
    }
  }
  return lines;
}

function parsePromptLabel(label) {
  const s = (label || 'user@workstation').trim() || 'user@workstation';
  const at = s.indexOf('@');
  if (at > 0) return { user: s.slice(0, at), host: s.slice(at + 1) || 'workstation' };
  return { user: s, host: 'workstation' };
}

const DEFAULT_WELCOME = "shell v0.9.2   \u2014   type 'help' to get started";

function Terminal({ theme, promptLabel, tweaks }) {
  const [state, setState] = useState(() => {
    const { user, host } = parsePromptLabel(promptLabel);
    return {
      root: makeFS(),
      cwd: ['home', 'user'],
      prevCwd: ['home', 'user'],
      remote: null,
      history: [],
      user,
      host,
    };
  });

  const welcomeText   = (tweaks && tweaks.welcome) || DEFAULT_WELCOME;
  const showWelcome   = !tweaks || tweaks.showWelcome !== false;
  const bootAnimation = showWelcome && !!(tweaks && tweaks.bootAnimation);
  const [lines, setLines] = useState(() => {
    if (!showWelcome) return [];
    if (bootAnimation) return []; // boot animation will fill the screen
    const ruler = '-'.repeat(Math.max(welcomeText.length + 4, 50));
    return [
      { kind: 'raw', text: ruler },
      { kind: 'raw', text: '  ' + welcomeText },
      { kind: 'raw', text: ruler },
      { kind: 'raw', text: '' },
    ];
  });

  const [input, setInput] = useState('');
  const [cursorPos, setCursorPos] = useState(0);
  const [histIdx, setHistIdx] = useState(-1);
  const [savedInput, setSavedInput] = useState('');
  const [liveFrame, setLiveFrame] = useState(null);
  const [animating, setAnimating] = useState(false);
  const [editor, setEditor] = useState(null);

  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const liveRef = useRef(null);
  const bootRanRef = useRef(false);
  const animCountRef = useRef(0);
  const [focused, setFocused] = useState(() => document.hasFocus());

  // Track window focus for cursor blink
  useEffect(() => {
    const onFocus = () => setFocused(true);
    const onBlur  = () => setFocused(false);
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur',  onBlur);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur',  onBlur);
    };
  }, []);

  // Sync cursor from the hidden input's native selection
  const syncCursor = useCallback(() => {
    requestAnimationFrame(() => {
      if (inputRef.current) setCursorPos(inputRef.current.selectionStart ?? 0);
    });
  }, []);

  // Set cursor to a specific position in the hidden input + state
  const moveCursorTo = useCallback((pos) => {
    requestAnimationFrame(() => {
      if (inputRef.current) {
        inputRef.current.setSelectionRange(pos, pos);
        setCursorPos(pos);
      }
    });
  }, []);

  // Sync promptLabel → user/host (outside remote session)
  useEffect(() => {
    if (state.remote) return;
    const { user, host } = parsePromptLabel(promptLabel);
    setState(s => ({ ...s, user, host }));
  }, [promptLabel]);

  // Smooth-scroll to bottom on new output
  useEffect(() => {
    if (scrollRef.current)
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [lines]);

  // Focus input on click anywhere in terminal
  const focusInput = () => inputRef.current?.focus();

  const currentPrompt = useMemo(() => {
    if (state.remote) {
      return {
        user: state.remote.user,
        host: state.remote.host,
        path: '/' + state.remote.cwd.join('/'),
        remote: true,
      };
    }
    return {
      user: state.user,
      host: state.host,
      path: '/' + state.cwd.join('/'),
      remote: false,
    };
  }, [state]);

  const appendLines = useCallback((newLines) => {
    setLines(prev => [...prev, ...newLines]);
  }, []);

  // Run a sequence of timed output / state-update steps without blocking the chain.
  // step shape: { delay, line?, lines?, setState? }
  // While any animation is in flight, the input prompt is suppressed and keys
  // are swallowed so output doesn't interleave with user typing.
  const runAnimation = useCallback((steps) => {
    if (!steps || steps.length === 0) return;
    animCountRef.current += 1;
    setAnimating(true);

    let cum = 0;
    for (const step of steps) {
      cum += step.delay || 0;
      setTimeout(() => {
        if (step.setState) setState(prev => step.setState(prev));
        if (step.line) appendLines([step.line]);
        if (step.lines) appendLines(step.lines);
      }, cum);
    }
    // small grace pause after the final line so the prompt doesn't slam back in
    setTimeout(() => {
      animCountRef.current = Math.max(0, animCountRef.current - 1);
      if (animCountRef.current === 0) setAnimating(false);
    }, cum + 120);
  }, [appendLines]);

  // Enter "live" mode: a command takes over the terminal, rendering its own frame
  // until the user presses q / Esc / Ctrl+C.
  const stopLive = useCallback(() => {
    if (liveRef.current && liveRef.current.id) clearInterval(liveRef.current.id);
    liveRef.current = null;
    setLiveFrame(null);
  }, []);

  const startLive = useCallback((config) => {
    setLiveFrame(config.render());
    const intervalMs = config.intervalMs || 1500;
    const id = setInterval(() => {
      setLiveFrame(config.render());
    }, intervalMs);
    liveRef.current = { id, config };
  }, []);

  // Cleanup live-mode interval on unmount
  useEffect(() => () => stopLive(), [stopLive]);

  // --- Editor mode (nano / edit) ---
  const startEditor = useCallback((config) => {
    setEditor(config);
  }, []);
  const stopEditor = useCallback(() => {
    setEditor(null);
    // Refocus the terminal input after the editor unmounts.
    setTimeout(() => inputRef.current && inputRef.current.focus(), 0);
  }, []);
  // Persist editor content back into the virtual filesystem.
  const saveEditorFile = useCallback((segs, fromRemote, newContent) => {
    setState(prev => {
      const inRemote = !!prev.remote && fromRemote;
      const root = inRemote ? prev.remote.root : prev.root;
      const cloned = cloneFS(root);
      const p = parentOf(cloned, segs);
      if (!p) return prev; // shouldn't happen — command validated parent on open
      p.parent.children[p.name] = { type: 'file', name: p.name, content: newContent };
      if (inRemote) return { ...prev, remote: { ...prev.remote, root: cloned } };
      return { ...prev, root: cloned };
    });
  }, []);

  // Boot animation on first mount
  useEffect(() => {
    if (bootRanRef.current) return;
    if (!bootAnimation) return;
    bootRanRef.current = true;
    runAnimation(buildBootSteps(welcomeText));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runLine = useCallback((raw) => {
    const trimmed = raw.trim();
    appendLines([{ kind: 'prompt', prompt: currentPrompt, text: raw }]);
    if (!trimmed) return;

    // Tokenize + group segments into pipe chains, separated by ; and &&.
    //
    // parseLine attaches `sep` to each segment as the operator AFTER it:
    //   '|'   more commands in this pipe
    //   ';'   end chain; next segment is a new chain (always runs)
    //   '&&'  end chain; next segment runs only if this chain succeeded
    //   null  end of input
    //
    // Example:  cat a | grep x ; echo done
    //   → two chains: [cat, grep] then [echo], with chain.sep null then ';'
    const allSegs = parseLine(trimmed);
    const chains = [];
    let curPipe = [];
    let pendingBetween = null;

    for (const seg of allSegs) {
      curPipe.push(seg);
      if (seg.sep === '|') continue;
      chains.push({ segs: curPipe, sep: pendingBetween });
      curPipe = [];
      pendingBetween = (seg.sep === ';' || seg.sep === '&&') ? seg.sep : null;
    }
    if (curPipe.length) chains.push({ segs: curPipe, sep: pendingBetween });

    let lastOk = true;
    let curState = { ...state, history: [...state.history, trimmed] };
    const outBatch = [];

    const applyStateUpdate = (updater) => {
      curState = typeof updater === 'function' ? updater(curState) : { ...curState, ...updater };
    };

    const expandAlias = (seg) => {
      const aliases = curState.aliases || {};
      const val = aliases[seg.cmd];
      if (!val) return seg;
      const expanded = parseLine(val + (seg.args.length ? ' ' + seg.args.join(' ') : ''));
      return expanded[0] || seg;
    };

    const runSeg = (seg, pipedInput) => {
      const resolved = expandAlias(seg);
      const cmd = COMMANDS[resolved.cmd];
      if (!cmd) return { out: [`${resolved.cmd}: command not found`], err: true };
      // pass piped input via ctx so commands can consume it
      const result = cmd.run(resolved.args, { state: curState, setState: applyStateUpdate, pipedInput, tweaks: window.__shellTweaks });
      return result;
    };

    let abortChain = false;
    for (const chain of chains) {
      if (abortChain) break;
      // short-circuit &&
      if (chain.sep === '&&' && !lastOk) continue;

      // run pipe chain
      let pipedInput = null;
      let result = { out: [], err: false };
      for (const seg of chain.segs) {
        if (!seg.cmd) continue;
        result = runSeg(seg, pipedInput);
        // collect output as plain lines for the next pipe stage
        pipedInput = pipeLinesFromResult(result);
      }

      // flush final result of pipe chain
      if (result.effect === 'clear') {
        setLines([]);
        outBatch.length = 0;
      } else if (result.animate) {
        // schedule timed output without blocking remaining chain
        runAnimation(result.animate);
      } else if (result.live) {
        // hand control to a live command (e.g. top); stop here
        if (outBatch.length) { appendLines(outBatch); outBatch.length = 0; }
        startLive(result.live);
        abortChain = true;
      } else if (result.editor) {
        // hand control to the modal editor (nano/edit); stop here
        if (outBatch.length) { appendLines(outBatch); outBatch.length = 0; }
        startEditor(result.editor);
        abortChain = true;
      } else {
        for (const o of (result.out || [])) {
          if (typeof o === 'string') outBatch.push({ kind: result.err ? 'err' : 'out', text: o });
          else if (Array.isArray(o)) outBatch.push({ kind: result.segments ? 'segments' : 'grid', items: o });
        }
      }
      lastOk = !result.err;
    }

    if (outBatch.length) appendLines(outBatch);
    setState(curState);
  }, [state, currentPrompt, appendLines, runAnimation, startLive, startEditor]);

  const handleKeyDown = (e) => {
    const snd = soundForKey(e);
    if (snd) playKeySound(snd);

    // --- Live mode (top, etc.): intercept everything; only exit keys do anything ---
    if (liveFrame) {
      e.preventDefault();
      if (
        e.key === 'q' || e.key === 'Q' ||
        e.key === 'Escape' ||
        (e.ctrlKey && (e.key === 'c' || e.key === 'C'))
      ) {
        stopLive();
      }
      return;
    }

    // --- Animating (boot, ssh cinematic, etc.): swallow keys until done ---
    if (animating) {
      e.preventDefault();
      return;
    }

    // --- Enter ---
    if (e.key === 'Enter') {
      e.preventDefault();
      runLine(input);
      setInput('');
      setCursorPos(0);
      setHistIdx(-1);
      setSavedInput('');
      return;
    }

    // --- Tab: autocomplete ---
    if (e.key === 'Tab') {
      e.preventDefault();
      const res = completeInput(input, state);
      if (!res) return;
      if (res.type === 'apply') {
        setInput(res.newInput);
        moveCursorTo(res.newInput.length);
        return;
      }
      if (res.type === 'list') {
        appendLines([
          { kind: 'prompt', prompt: currentPrompt, text: input },
          { kind: 'grid', items: res.matches.map(m => ({
            text: m, kind: m.endsWith('/') ? 'dir' : 'file'
          })) },
        ]);
        return;
      }
    }

    // --- History: up/down ---
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const hist = state.history;
      if (!hist.length) return;
      const next = histIdx === -1 ? hist.length - 1 : Math.max(0, histIdx - 1);
      if (histIdx === -1) setSavedInput(input);
      setHistIdx(next);
      const val = hist[next];
      setInput(val);
      moveCursorTo(val.length);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const hist = state.history;
      if (histIdx === -1) return;
      const next = histIdx + 1;
      if (next >= hist.length) {
        setHistIdx(-1);
        setInput(savedInput);
        moveCursorTo(savedInput.length);
      } else {
        setHistIdx(next);
        const val = hist[next];
        setInput(val);
        moveCursorTo(val.length);
      }
      return;
    }

    // --- Cursor movement: left/right/home/end ---
    if (e.key === 'ArrowLeft') {
      // let native input handle selection, then sync
      syncCursor();
      return;
    }
    if (e.key === 'ArrowRight') {
      syncCursor();
      return;
    }
    if (e.key === 'Home') {
      e.preventDefault();
      moveCursorTo(0);
      return;
    }
    if (e.key === 'End') {
      e.preventDefault();
      moveCursorTo(input.length);
      return;
    }

    // --- Ctrl shortcuts ---
    if (e.ctrlKey) {
      if (e.key === 'a') { e.preventDefault(); moveCursorTo(0); return; }
      if (e.key === 'e') { e.preventDefault(); moveCursorTo(input.length); return; }
      if (e.key === 'k') {
        // delete from cursor to end
        e.preventDefault();
        const newVal = input.slice(0, cursorPos);
        setInput(newVal);
        moveCursorTo(newVal.length);
        return;
      }
      if (e.key === 'w') {
        // delete word before cursor
        e.preventDefault();
        const before = input.slice(0, cursorPos);
        const trimmed2 = before.replace(/\S+\s*$/, '');
        const newVal = trimmed2 + input.slice(cursorPos);
        setInput(newVal);
        moveCursorTo(trimmed2.length);
        return;
      }
      if (e.key === 'l') { e.preventDefault(); setLines([]); return; }
      if (e.key === 'c') {
        e.preventDefault();
        appendLines([{ kind: 'prompt', prompt: currentPrompt, text: input + '^C' }]);
        setInput('');
        setCursorPos(0);
        setHistIdx(-1);
        return;
      }
    }
  };

  const handleChange = (e) => {
    if (liveFrame || animating) return; // ignore input while terminal is busy
    setInput(e.target.value);
    syncCursor();
  };

  // Split input around cursor for rendering
  const before = input.slice(0, cursorPos);
  const after  = input.slice(cursorPos);

  if (editor) {
    return (
      <NanoEditor
        name={editor.name}
        displayPath={editor.displayPath}
        content={editor.content}
        theme={theme}
        onSave={(newContent) => saveEditorFile(editor.segs, editor.fromRemote, newContent)}
        onExit={stopEditor}
      />
    );
  }

  return (
    <div className="term-root" style={{ background: theme.bg, color: theme.fg }} onClick={focusInput}>
      <div className="term-scroll" ref={scrollRef}>
        {liveFrame
          ? liveFrame.map((ln, i) => <Line key={i} line={ln} theme={theme} />)
          : (
            <>
              {lines.map((ln, i) => <Line key={i} line={ln} theme={theme} />)}
              {/* Live input line — hidden while an animation is streaming */}
              {!animating && (
                <div className="term-line">
                  <Prompt p={currentPrompt} theme={theme} />
                  <span className="term-input-wrap">
                    <span className="term-input-text">{before}</span>
                    <span className={`term-cursor${focused ? ' term-cursor--blink' : ''}`} style={{ background: theme.fg }} />
                    <span className="term-input-text">{after}</span>
                  </span>
                </div>
              )}
            </>
          )
        }
        {/* Hidden input stays mounted so keys always reach the handler */}
        <input
          ref={inputRef}
          className="term-hidden-input"
          value={input}
          onChange={handleChange}
          onSelect={syncCursor}
          onKeyDown={handleKeyDown}
          autoFocus
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
        />
      </div>
    </div>
  );
}

function Prompt({ p, theme }) {
  return (
    <span className="term-prompt">
      <span style={{ color: theme.user }}>{p.user}</span>
      <span style={{ color: theme.prompt }}>@</span>
      <span style={{ color: theme.host }}>{p.host}</span>
      <span style={{ color: theme.prompt }}>:</span>
      <span style={{ color: theme.path }}>{p.path}</span>
      <span style={{ color: theme.prompt }}>$ </span>
    </span>
  );
}

function Line({ line, theme }) {
  if (line.kind === 'raw') {
    return <div className="term-line selectable"><span style={{ color: theme.dim }}>{line.text || '\u00a0'}</span></div>;
  }
  if (line.kind === 'prompt') {
    const p = line.prompt;
    return (
      <div className="term-line selectable">
        <Prompt p={p} theme={theme} />
        <span style={{ color: theme.fg }}>{line.text}</span>
      </div>
    );
  }
  if (line.kind === 'err') {
    return <div className="term-line selectable"><span style={{ color: theme.err }}>{line.text || '\u00a0'}</span></div>;
  }
  if (line.kind === 'segments') {
    return (
      <div className="term-line selectable">
        {line.items.map((it, i) => (
          <span key={i} style={{ color: theme[it.kind] || theme.fg, whiteSpace: 'pre' }}>{it.text}</span>
        ))}
      </div>
    );
  }
  if (line.kind === 'grid') {
    // Fixed-width columns: pad to longest name + 2 spaces
    const maxLen = line.items.reduce((m, it) => Math.max(m, it.text.length), 0);
    const colW = maxLen + 2;
    return (
      <div className="term-line term-cols selectable">
        {line.items.map((it, i) => (
          <span key={i} style={{ color: theme[it.kind] || theme.fg, minWidth: `${colW}ch` }}>
            {it.text}
          </span>
        ))}
      </div>
    );
  }
  return <div className="term-line selectable"><span style={{ color: theme.fg }}>{line.text || '\u00a0'}</span></div>;
}

export { Terminal };
