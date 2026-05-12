// Nano-style modal text editor for the virtual filesystem.
// Self-contained: owns its own buffer, cursor, hidden input, and key handler.
// Terminal hands it a file (name, displayPath, content, segs) plus onSave/onExit.
import { useState, useEffect, useRef, useCallback } from 'react';
import { playKeySound, soundForKey } from './sounds.jsx';

function NanoEditor({ name, displayPath, content, theme, onSave, onExit }) {
  const [buffer, setBuffer] = useState(() => (content == null ? [''] : content.split('\n')));
  const [cursor, setCursor] = useState({ row: 0, col: 0 });
  const [modified, setModified] = useState(false);
  const [status, setStatus] = useState('');
  const [exitPrompt, setExitPrompt] = useState(false);
  const [clipboard, setClipboard] = useState('');

  const inputRef = useRef(null);
  const activeLineRef = useRef(null);
  const lineCount = buffer.length;

  // Focus the hidden input on mount so it captures all keys.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Keep the active line in view as the cursor moves.
  useEffect(() => {
    activeLineRef.current?.scrollIntoView({ block: 'nearest' });
  }, [cursor.row]);

  // Auto-clear ephemeral status messages.
  useEffect(() => {
    if (!status) return;
    const t = setTimeout(() => setStatus(''), 2500);
    return () => clearTimeout(t);
  }, [status]);

  const save = useCallback(() => {
    const newContent = buffer.join('\n');
    onSave(newContent);
    setModified(false);
    setStatus(`[ Wrote ${buffer.length} line${buffer.length === 1 ? '' : 's'} ]`);
  }, [buffer, onSave]);

  const tryExit = useCallback(() => {
    if (modified) setExitPrompt(true);
    else onExit();
  }, [modified, onExit]);

  const insertText = useCallback((text) => {
    if (!text) return;
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    setBuffer(buf => {
      const next = [...buf];
      const line = next[cursor.row] || '';
      const before = line.slice(0, cursor.col);
      const after  = line.slice(cursor.col);
      if (lines.length === 1) {
        next[cursor.row] = before + lines[0] + after;
      } else {
        next[cursor.row] = before + lines[0];
        const middle = lines.slice(1, -1);
        const tail = lines[lines.length - 1] + after;
        next.splice(cursor.row + 1, 0, ...middle, tail);
      }
      return next;
    });
    if (lines.length === 1) {
      setCursor(c => ({ ...c, col: c.col + lines[0].length }));
    } else {
      setCursor(c => ({
        row: c.row + lines.length - 1,
        col: lines[lines.length - 1].length,
      }));
    }
    setModified(true);
  }, [cursor.row, cursor.col]);

  const handleKey = (e) => {
    // Play the click sound for any key (feels right for an editor)
    const snd = soundForKey(e);
    if (snd) playKeySound(snd);

    // --- Exit-on-modified prompt ('Save modified buffer? y/n/c') ---
    if (exitPrompt) {
      e.preventDefault();
      if (e.key === 'y' || e.key === 'Y') { save(); onExit(); return; }
      if (e.key === 'n' || e.key === 'N') { onExit(); return; }
      if (e.key === 'c' || e.key === 'C' || e.key === 'Escape') { setExitPrompt(false); return; }
      return;
    }

    // --- Ctrl shortcuts ---
    if (e.ctrlKey || e.metaKey) {
      const k = e.key.toLowerCase();
      if (k === 'x') { e.preventDefault(); tryExit(); return; }
      if (k === 'o' || k === 's') { e.preventDefault(); save(); return; }
      if (k === 'k') {
        e.preventDefault();
        setClipboard(buffer[cursor.row] || '');
        setBuffer(buf => {
          if (buf.length === 1) return [''];
          const next = [...buf];
          next.splice(cursor.row, 1);
          return next;
        });
        setCursor(c => ({
          row: Math.min(c.row, Math.max(0, buffer.length - 2)),
          col: 0,
        }));
        setModified(true);
        return;
      }
      if (k === 'u') {
        e.preventDefault();
        if (clipboard) {
          setBuffer(buf => {
            const next = [...buf];
            next.splice(cursor.row, 0, clipboard);
            return next;
          });
          setCursor(c => ({ row: c.row + 1, col: 0 }));
          setModified(true);
        }
        return;
      }
      if (k === 'v') {
        // Allow paste via clipboard API; fall back to onPaste handler.
        e.preventDefault();
        if (navigator.clipboard && navigator.clipboard.readText) {
          navigator.clipboard.readText().then(t => insertText(t)).catch(() => {});
        }
        return;
      }
      if (k === 'a') { e.preventDefault(); setCursor(c => ({ ...c, col: 0 })); return; }
      if (k === 'e') { e.preventDefault(); setCursor(c => ({ ...c, col: (buffer[c.row] || '').length })); return; }
      // unrecognised ctrl combo — let it go to browser
      return;
    }

    // --- Navigation ---
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setCursor(c => {
        if (c.col > 0) return { ...c, col: c.col - 1 };
        if (c.row > 0) return { row: c.row - 1, col: (buffer[c.row - 1] || '').length };
        return c;
      });
      return;
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      setCursor(c => {
        const lineLen = (buffer[c.row] || '').length;
        if (c.col < lineLen) return { ...c, col: c.col + 1 };
        if (c.row < buffer.length - 1) return { row: c.row + 1, col: 0 };
        return c;
      });
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor(c => {
        if (c.row === 0) return c;
        const r = c.row - 1;
        return { row: r, col: Math.min(c.col, (buffer[r] || '').length) };
      });
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor(c => {
        if (c.row >= buffer.length - 1) return c;
        const r = c.row + 1;
        return { row: r, col: Math.min(c.col, (buffer[r] || '').length) };
      });
      return;
    }
    if (e.key === 'Home') { e.preventDefault(); setCursor(c => ({ ...c, col: 0 })); return; }
    if (e.key === 'End')  { e.preventDefault(); setCursor(c => ({ ...c, col: (buffer[c.row] || '').length })); return; }
    if (e.key === 'PageUp') {
      e.preventDefault();
      setCursor(c => {
        const r = Math.max(0, c.row - 10);
        return { row: r, col: Math.min(c.col, (buffer[r] || '').length) };
      });
      return;
    }
    if (e.key === 'PageDown') {
      e.preventDefault();
      setCursor(c => {
        const r = Math.min(buffer.length - 1, c.row + 10);
        return { row: r, col: Math.min(c.col, (buffer[r] || '').length) };
      });
      return;
    }

    // --- Editing ---
    if (e.key === 'Enter') {
      e.preventDefault();
      setBuffer(buf => {
        const next = [...buf];
        const line = next[cursor.row] || '';
        next[cursor.row] = line.slice(0, cursor.col);
        next.splice(cursor.row + 1, 0, line.slice(cursor.col));
        return next;
      });
      setCursor(c => ({ row: c.row + 1, col: 0 }));
      setModified(true);
      return;
    }
    if (e.key === 'Backspace') {
      e.preventDefault();
      setBuffer(buf => {
        const next = [...buf];
        if (cursor.col > 0) {
          next[cursor.row] = (next[cursor.row] || '').slice(0, cursor.col - 1) + (next[cursor.row] || '').slice(cursor.col);
        } else if (cursor.row > 0) {
          const prev = next[cursor.row - 1] || '';
          next[cursor.row - 1] = prev + (next[cursor.row] || '');
          next.splice(cursor.row, 1);
        }
        return next;
      });
      setCursor(c => {
        if (c.col > 0) return { ...c, col: c.col - 1 };
        if (c.row > 0) return { row: c.row - 1, col: (buffer[c.row - 1] || '').length };
        return c;
      });
      setModified(true);
      return;
    }
    if (e.key === 'Delete') {
      e.preventDefault();
      setBuffer(buf => {
        const next = [...buf];
        const line = next[cursor.row] || '';
        if (cursor.col < line.length) {
          next[cursor.row] = line.slice(0, cursor.col) + line.slice(cursor.col + 1);
        } else if (cursor.row < next.length - 1) {
          next[cursor.row] = line + (next[cursor.row + 1] || '');
          next.splice(cursor.row + 1, 1);
        }
        return next;
      });
      setModified(true);
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      setBuffer(buf => {
        const next = [...buf];
        const line = next[cursor.row] || '';
        next[cursor.row] = line.slice(0, cursor.col) + '    ' + line.slice(cursor.col);
        return next;
      });
      setCursor(c => ({ ...c, col: c.col + 4 }));
      setModified(true);
      return;
    }

    // --- Printable character ---
    if (e.key.length === 1 && !e.altKey) {
      e.preventDefault();
      const ch = e.key;
      setBuffer(buf => {
        const next = [...buf];
        const line = next[cursor.row] || '';
        next[cursor.row] = line.slice(0, cursor.col) + ch + line.slice(cursor.col);
        return next;
      });
      setCursor(c => ({ ...c, col: c.col + 1 }));
      setModified(true);
      return;
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const text = (e.clipboardData && e.clipboardData.getData('text')) || '';
    if (text) insertText(text);
  };

  const renderLine = (line, i) => {
    const isActive = i === cursor.row;
    if (!isActive) {
      return (
        <div key={i} className="editor-line">
          <span className="editor-gutter" style={{ color: theme.dim }}>{String(i + 1).padStart(4, ' ')}  </span>
          <span>{line || '\u00a0'}</span>
        </div>
      );
    }
    const safeLine = line == null ? '' : line;
    const before = safeLine.slice(0, cursor.col);
    const after  = safeLine.slice(cursor.col);
    return (
      <div key={i} className="editor-line editor-line--active" ref={activeLineRef}>
        <span className="editor-gutter editor-gutter--active" style={{ color: theme.user }}>
          {String(i + 1).padStart(4, ' ')}{'  '}
        </span>
        <span>{before}</span>
        <span className="editor-cursor" style={{ background: theme.fg, color: theme.bg }}>
          {after.charAt(0) || '\u00a0'}
        </span>
        <span>{after.slice(1)}</span>
      </div>
    );
  };

  return (
    <div className="editor-root" style={{ background: theme.bg, color: theme.fg }} onClick={() => inputRef.current?.focus()}>
      <div className="editor-header" style={{ background: theme.fg, color: theme.bg }}>
        <span><strong>nano v1.0</strong> &nbsp; File: {displayPath}{modified ? '  Modified' : ''}</span>
        <span>{lineCount} line{lineCount === 1 ? '' : 's'}</span>
      </div>

      <div className="editor-body" style={{ background: theme.bg, color: theme.fg }}>
        {buffer.map(renderLine)}
      </div>

      <div className="editor-status" style={{ color: theme.dim }}>
        {exitPrompt
          ? <span style={{ color: theme.err }}>Save modified buffer? &nbsp;<strong>Y</strong> Yes &nbsp; <strong>N</strong> No &nbsp; <strong>C</strong> Cancel</span>
          : (status || `Ln ${cursor.row + 1}, Col ${cursor.col + 1}`)}
      </div>

      <div className="editor-help" style={{ background: theme.fg, color: theme.bg }}>
        <span className="editor-hint"><strong>^O</strong> Save</span>
        <span className="editor-hint"><strong>^X</strong> Exit</span>
        <span className="editor-hint"><strong>^K</strong> Cut line</span>
        <span className="editor-hint"><strong>^U</strong> Paste line</span>
        <span className="editor-hint"><strong>^V</strong> Paste clip</span>
        <span className="editor-hint"><strong>^A/^E</strong> Line ends</span>
      </div>

      <input
        ref={inputRef}
        className="term-hidden-input"
        value=""
        onChange={() => {}}
        onKeyDown={handleKey}
        onPaste={handlePaste}
        autoFocus
        spellCheck={false}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
      />
    </div>
  );
}

export { NanoEditor };
