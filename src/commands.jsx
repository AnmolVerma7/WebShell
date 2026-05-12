// Command registry.
//
// ─────────────────────────────────────────────────────────────────────────
// Adding a command:
//   1. Add a defineCommand({...}) entry to cmdDefs (in the appropriate
//      section below). That's it — `help`, `man <name>`, and the COMMANDS
//      / MAN_PAGES lookups are derived from this single source.
//   2. If the command shouldn't appear in `help` output, set
//      `hideFromHelp: true` (it remains runnable; ssh uses this).
//
// Removing a command: delete its entry. Nothing else to touch.
//
// Renaming a command: change `name` (and `synopsis` if needed). User-facing
// references update automatically.
//
// ─────────────────────────────────────────────────────────────────────────
// defineCommand spec:
//   name          string  — the word users type
//   synopsis      string  — usage line shown in help (e.g. 'ls [-la] [path]')
//   summary       string  — one-line description in help
//   man           string[]?— man page lines for `man <name>` (omit to skip)
//   hideFromHelp  bool?    — true → keep runnable but hide from help listing
//   run           (args, ctx) => Result
//
// ctx = { state, setState, pipedInput, tweaks }
//   state    : { cwd, prevCwd, root, remote, history, user, host, aliases? }
//   setState : (updater | partial) → void  (applies during this command line)
//   pipedInput : string[] | null  (stdout of previous pipe stage, if any)
//
// Result fields (any combination):
//   out        string[] | mixed[]  — lines to print (strings or item arrays)
//   err        boolean             — render as error / mark chain as failed
//   effect     'clear'             — clear the screen
//   animate    Step[]              — schedule timed output (boot, ssh cinematic)
//   live       LiveConfig          — take over terminal in live mode (top)
//   editor     EditorConfig        — open the modal editor (nano)
//   segments   true                — out items are segment arrays, not grids
//   grid       true                — out items are grid arrays (ls)
// ─────────────────────────────────────────────────────────────────────────

import {
  REMOTES, resolvePath, nodeAt, displayPath, cloneFS, parentOf,
} from './filesystem.jsx';

// ───────────────────────── constants ─────────────────────────

// Stable RSA-style fingerprints per remote host (cosmetic — ssh cinematic).
// Unknown hosts get a randomly-generated one.
const FINGERPRINTS = {
  '10.0.4.12':   'eK2nF+vPxA9bM3jLqRsT8wYz1HcD4uXgEa7tB6oR2vM',
  '10.0.4.20':   'fQ7rZ8xMaC5pK1nLqEsT3wXz9HcF6uYgKb4tA9oQ7vL',
  '192.168.1.5': 'gT3sW2xPbH8mN4kLrFsU6wYz5HdG1uVhMc9tD2oS5vK',
};

// ───────────────────────── helpers ─────────────────────────

// Pick the right (root, cwd) pair for the current session — remote vs local.
function activeView(state) {
  if (state.remote) return { root: state.remote.root, cwd: state.remote.cwd };
  return { root: state.root, cwd: state.cwd };
}

// Classify a FS node into a display kind for theming.
function fileKind(node) {
  if (node.type === 'dir') return 'dir';
  if (node.type === 'exec') return 'script';
  const ext = node.name.includes('.') ? node.name.split('.').pop().toLowerCase() : '';
  if (['log', 'err', 'out'].includes(ext)) return 'log';
  if (['csv', 'dat', 'json', 'xml', 'db'].includes(ext)) return 'data';
  if (['sh', 'py', 'js', 'rb', 'pl', 'c', 'h'].includes(ext)) return 'script';
  if (['md', 'txt', 'rst'].includes(ext)) return 'file';
  return 'file';
}

// Clone the active FS, apply a mutation, return the new root (or an error).
function mutateFS(state, mutator) {
  const { root } = activeView(state);
  const cloned = cloneFS(root);
  const result = mutator(cloned);
  if (result && result.err) return { err: result.err };
  return { newRoot: cloned };
}

// Build a new state object with the given root swapped in (remote- or local-aware).
function applyNewRoot(state, newRoot) {
  if (state.remote) return { ...state, remote: { ...state.remote, root: newRoot } };
  return { ...state, root: newRoot };
}

function randomFingerprint() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  for (let i = 0; i < 43; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

// Shared implementation for nano / edit. Validates the target path against
// the active filesystem and returns an editor-mode result.
function editorOpen(args, state) {
  if (!args.length) return { out: ['nano: missing file operand'], err: true };
  const target = args[0];
  const { root, cwd } = activeView(state);
  const segs = resolvePath(target, cwd);
  if (!segs.length) return { out: ['nano: cannot edit /: is a directory'], err: true };

  const node = nodeAt(root, segs);
  if (node && node.type === 'dir')  return { out: [`nano: ${target}: Is a directory`], err: true };
  if (node && node.type === 'exec') return { out: [`nano: ${target}: binary file (use cat or exec)`], err: true };

  // Parent must exist so we can write a new file back into it.
  const p = parentOf(root, segs);
  if (!p) return { out: [`nano: ${target}: No such file or directory`], err: true };

  return {
    editor: {
      name: segs[segs.length - 1],
      displayPath: displayPath(segs),
      content: node ? (node.content || '') : '',
      segs,
      isNew: !node,
      fromRemote: !!state.remote,
    },
  };
}

// ───────────────────── help: footer + builder ─────────────────────

// Footers appended after the auto-generated command list.
const HELP_FOOTERS = [
  '',
  'chaining:',
  '  cmd1 ; cmd2        run sequentially',
  '  cmd1 && cmd2       run cmd2 only if cmd1 succeeded',
  '  cmd1 | cmd2        pipe stdout of cmd1 as stdin to cmd2',
  '',
  'keyboard:',
  '  Tab                autocomplete command or path',
  '  \u2191 / \u2193              walk history',
  '  \u2190 / \u2192              move cursor',
  '  Home / End         jump to start / end of line',
  '  Ctrl+A / Ctrl+E    start / end of line',
  '  Ctrl+K             delete to end of line',
  '  Ctrl+W             delete word before cursor',
  '  Ctrl+C             cancel input',
  '  Ctrl+L             clear screen',
  '',
  'ssh hosts:',
  '  10.0.4.12          vault   (admin)',
  '  10.0.4.20          archive (guest)',
  '  192.168.1.5        printer (svc)',
];

// Format: '  ' + synopsis.padEnd(19) + ' ' + summary  (preserves existing layout)
function buildHelpLines() {
  const out = ['commands:'];
  for (const c of cmdDefs) {
    if (c.hideFromHelp) continue;
    out.push('  ' + c.synopsis.padEnd(19) + ' ' + c.summary);
  }
  out.push(...HELP_FOOTERS);
  return out;
}

// Identity wrapper that gives editors structural awareness of each command spec.
function defineCommand(spec) { return spec; }

// ─────────────────────────── commands ───────────────────────────

const cmdDefs = [

  // ── docs ──
  defineCommand({
    name: 'help',
    synopsis: 'help',
    summary: 'this message',
    man: [
      'NAME',
      '    help — list commands and shortcuts',
      '',
      'SYNOPSIS',
      '    help',
      '',
      'DESCRIPTION',
      '    Prints the command summary, chaining operators, keyboard',
      '    shortcuts, and known SSH hosts. For detailed information on',
      '    a specific command, use `man <command>`.',
      '',
      'SEE ALSO',
      '    man',
    ],
    run: () => ({ out: buildHelpLines() }),
  }),

  // ── navigation ──
  defineCommand({
    name: 'ls',
    synopsis: 'ls [-la] [path]',
    summary: 'list directory  (-a hidden, -l long)',
    man: [
      'NAME',
      '    ls — list directory contents',
      '',
      'SYNOPSIS',
      '    ls [-la] [path]',
      '',
      'OPTIONS',
      '    -a    include hidden entries (names starting with .)',
      '    -l    long format: type marker, size, and name',
      '',
      'DESCRIPTION',
      '    Without a path, lists the current directory. Entries are sorted',
      '    with directories first, then files alphabetically. Directories',
      '    are suffixed with /, and each entry is colored by file kind',
      '    (dir, file, script, log, data — see Tweaks panel for palette).',
      '',
      '    Listing a path that resolves to a file (not a directory) prints',
      '    just its name.',
      '',
      'EXAMPLES',
      '    ls',
      '    ls -a /etc',
      '    ls -la /home/user',
    ],
    run: (args, { state }) => {
      const { root, cwd } = activeView(state);
      let showHidden = false;
      let longFmt = false;
      const positional = [];
      for (const a of args) {
        if (a.startsWith('-') && a.length > 1) {
          if (a.includes('a')) showHidden = true;
          if (a.includes('l')) longFmt = true;
        } else positional.push(a);
      }
      const target = positional[0] || '.';
      const segs = resolvePath(target, cwd);
      const node = nodeAt(root, segs);
      if (!node) return { out: [`ls: cannot access '${target}': No such file or directory`], err: true };
      if (node.type !== 'dir') return { out: [node.name] };
      const entries = Object.values(node.children || {})
        .filter(n => showHidden || !n.name.startsWith('.'))
        .sort((a, b) => {
          if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
      if (entries.length === 0) return { out: [] };
      if (longFmt) {
        const lines = entries.map(n => {
          const mark = n.type === 'dir' ? 'd' : (n.type === 'exec' ? '-x' : '-');
          const size = n.type === 'file' ? String(n.content.length).padStart(6) :
                       n.type === 'exec' ? '  exec' : '   dir';
          return `${mark.padEnd(3)} ${size}  ${n.name}${n.type === 'dir' ? '/' : ''}`;
        });
        return { out: lines, nodes: entries };
      }
      return { out: [entries.map(n => ({
        text: n.name + (n.type === 'dir' ? '/' : ''),
        kind: fileKind(n)
      }))], grid: true };
    },
  }),

  defineCommand({
    name: 'cd',
    synopsis: 'cd <path>',
    summary: 'change directory  (/ .. ~ -)',
    man: [
      'NAME',
      '    cd — change directory',
      '',
      'SYNOPSIS',
      '    cd [path]',
      '',
      'DESCRIPTION',
      '    Changes the working directory. With no argument, returns to',
      '    /home/user (the seeded home). A failed cd leaves the current',
      '    cwd unchanged.',
      '',
      'SPECIAL TARGETS',
      '    ~       home directory (/home/user)',
      '    -       previous directory (toggles)',
      '    ..      parent directory',
      '    /       filesystem root',
      '    .       current directory (no-op)',
      '',
      'NOTES',
      '    Inside an SSH session, cd navigates the remote filesystem.',
      '    The local cwd is preserved and restored on disconnect.',
    ],
    run: (args, { state, setState }) => {
      const target = args[0] || '/home/user';
      const inRemote = !!state.remote;
      const root = inRemote ? state.remote.root : state.root;
      const cwd  = inRemote ? state.remote.cwd  : state.cwd;
      const prev = inRemote ? state.remote.prevCwd : state.prevCwd;
      const segs = resolvePath(target, cwd, prev);
      const node = nodeAt(root, segs);
      if (!node) return { out: [`cd: ${target}: No such file or directory`], err: true };
      if (node.type !== 'dir') return { out: [`cd: ${target}: Not a directory`], err: true };
      if (inRemote) setState(s => ({ ...s, remote: { ...s.remote, cwd: segs, prevCwd: s.remote.cwd } }));
      else          setState(s => ({ ...s, cwd: segs, prevCwd: s.cwd }));
      return { out: [] };
    },
  }),

  defineCommand({
    name: 'pwd',
    synopsis: 'pwd',
    summary: 'print working directory',
    man: [
      'NAME',
      '    pwd — print working directory',
      '',
      'SYNOPSIS',
      '    pwd',
      '',
      'DESCRIPTION',
      '    Prints the absolute path of the current working directory.',
    ],
    run: (args, { state }) => ({ out: [displayPath(state.cwd)] }),
  }),

  // ── files ──
  defineCommand({
    name: 'cat',
    synopsis: 'cat [file ...]',
    summary: 'print files or piped lines',
    man: [
      'NAME',
      '    cat — concatenate and print files',
      '',
      'SYNOPSIS',
      '    cat <file...>',
      '    cat            (read lines from a pipe when no files given)',
      '',
      'DESCRIPTION',
      '    With one or more paths, prints each file in order. Errors',
      '    (missing file, directory, or exec/binary node) are reported',
      '    inline and do not stop processing of the remaining files.',
      '',
      '    With no arguments on a **pipe** (e.g. `echo hi | cat`), prints',
      '    the lines received from the previous command — same idea as',
      '    Unix cat reading stdin.',
      '',
      '    With no arguments and **no** pipe, prints an error.',
      '',
      '    Shell redirection (`2>/dev/null`, `>file`) is not implemented;',
      '    tokens like `2>/dev/null` are treated as ordinary path names.',
      '',
      '    To run an executable node, use `exec`. To edit a file, use',
      '    `nano` or `edit`.',
      '',
      'EXAMPLES',
      '    cat /etc/motd',
      '    echo hello | cat',
      '    cat documents/readme.txt documents/notes.md',
      '',
      'SEE ALSO',
      '    exec, nano',
    ],
    run: (args, { state, pipedInput }) => {
      if (args.length === 0) {
        if (pipedInput != null) return { out: pipedInput.length ? [...pipedInput] : [] };
        return { out: ['cat: missing file operand'], err: true };
      }
      const { root, cwd } = activeView(state);
      const outLines = [];
      let err = false;
      for (const a of args) {
        const segs = resolvePath(a, cwd);
        const node = nodeAt(root, segs);
        if (!node)                  { outLines.push(`cat: ${a}: No such file or directory`); err = true; continue; }
        if (node.type === 'dir')    { outLines.push(`cat: ${a}: Is a directory`);             err = true; continue; }
        if (node.type === 'exec')   { outLines.push(`cat: ${a}: binary file (use exec)`);     err = true; continue; }
        for (const line of node.content.split('\n')) outLines.push(line);
      }
      return { out: outLines, err };
    },
  }),

  defineCommand({
    name: 'exec',
    synopsis: 'exec <file>',
    summary: 'run an executable',
    man: [
      'NAME',
      '    exec — run an executable node',
      '',
      'SYNOPSIS',
      '    exec <file>',
      '',
      'DESCRIPTION',
      '    Runs an executable filesystem node (type=exec) and prints its',
      '    canned output. Executable nodes are seeded into the virtual',
      '    filesystem (for example /bin/diag and the *.sh scripts under',
      '    /home/user/projects) — they are not interpreted, their output',
      '    is fixed at creation time.',
      '',
      '    Regular files (type=file) cannot be executed. Use `cat` to',
      '    view them, or `nano` / `edit` to modify them.',
      '',
      'EXAMPLES',
      '    exec /bin/diag',
      '    exec /home/user/projects/hello.sh',
      '',
      'SEE ALSO',
      '    cat, nano',
    ],
    run: (args, { state }) => {
      if (args.length === 0) return { out: ['exec: missing file operand'], err: true };
      const { root, cwd } = activeView(state);
      const target = args[0];
      const segs = resolvePath(target, cwd);
      const node = nodeAt(root, segs);
      if (!node) return { out: [`exec: ${target}: No such file or directory`], err: true };
      if (node.type === 'dir') return { out: [`exec: ${target}: Is a directory`], err: true };
      if (node.type !== 'exec') return { out: [`exec: ${target}: Permission denied (not executable)`], err: true };
      return { out: (node.output || '').split('\n') };
    },
  }),

  defineCommand({
    name: 'echo',
    synopsis: 'echo <msg>',
    summary: 'print a message',
    man: [
      'NAME',
      '    echo — print arguments',
      '',
      'SYNOPSIS',
      '    echo [args...]',
      '',
      'DESCRIPTION',
      '    Joins all arguments with a single space and prints the result.',
      '    Single- and double-quoted arguments preserve their internal',
      '    whitespace; the surrounding quotes are stripped by the parser.',
      '',
      'EXAMPLES',
      "    echo hello world",
      "    echo 'spaces  preserved  here'",
    ],
    run: (args) => ({ out: [args.join(' ')] }),
  }),

  // ── session / system ──
  defineCommand({
    name: 'whoami',
    synopsis: 'whoami',
    summary: 'current user',
    man: [
      'NAME',
      '    whoami — print the current user',
      '',
      'SYNOPSIS',
      '    whoami',
      '',
      'DESCRIPTION',
      '    Prints the user portion of the prompt (the value before @).',
      '    Inside an SSH session, prints the remote user.',
      '',
      '    The local user can be customised in the Tweaks panel under',
      '    "Prompt" — use the form user@host.',
    ],
    run: (args, { state }) => ({ out: [state.user] }),
  }),

  defineCommand({
    name: 'date',
    synopsis: 'date',
    summary: 'current date/time',
    man: [
      'NAME',
      '    date — print the current date and time',
      '',
      'SYNOPSIS',
      '    date',
      '',
      'DESCRIPTION',
      '    Prints the local date and time in BSD/Linux style:',
      '        "Day Mon DD HH:MM:SS YYYY"',
      '',
      '    The value is sourced from the browser at the moment the command',
      '    runs — no formatting flags are supported.',
    ],
    run: () => {
      const d = new Date();
      const pad = n => String(n).padStart(2, '0');
      const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return { out: [`${days[d.getDay()]} ${months[d.getMonth()]} ${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ${d.getFullYear()}`] };
    },
  }),

  defineCommand({
    name: 'true',
    synopsis: 'true',
    summary: 'do nothing, succeed (for && chains)',
    man: [
      'NAME',
      '    true — exit successfully with no output',
      '',
      'SYNOPSIS',
      '    true',
      '',
      'DESCRIPTION',
      '    Always succeeds (no error flag). Use in tests such as',
      '    `true && echo ok` or to pad a pipeline.',
    ],
    run: () => ({ out: [] }),
  }),

  defineCommand({
    name: 'false',
    synopsis: 'false',
    summary: 'do nothing, fail (for && chains)',
    man: [
      'NAME',
      '    false — exit unsuccessfully with no output',
      '',
      'SYNOPSIS',
      '    false',
      '',
      'DESCRIPTION',
      '    Always fails (sets the error flag so `&&` skips the rest).',
      '    Example: `false && echo skipped` prints nothing after false.',
    ],
    run: () => ({ out: [], err: true }),
  }),

  defineCommand({
    name: 'clear',
    synopsis: 'clear',
    summary: 'clear screen',
    man: [
      'NAME',
      '    clear — clear the screen',
      '',
      'SYNOPSIS',
      '    clear',
      '',
      'DESCRIPTION',
      '    Removes all output from the scrollback and shows a fresh prompt.',
      '    Command history is preserved.',
      '',
      '    Equivalent to pressing Ctrl+L.',
    ],
    run: () => ({ out: [], effect: 'clear' }),
  }),

  defineCommand({
    name: 'history',
    synopsis: 'history',
    summary: 'show command history',
    man: [
      'NAME',
      '    history — show command history',
      '',
      'SYNOPSIS',
      '    history',
      '',
      'DESCRIPTION',
      '    Lists previously-entered commands with sequence numbers, oldest',
      '    first. The history is per-session — it is wiped on reload and',
      '    not persisted to localStorage.',
      '',
      '    At the prompt, walk through history with ↑ / ↓; press ↓ past',
      '    the newest entry to return to your in-progress line.',
      '',
      '    Pairs well with grep:',
      '        history | grep ssh',
    ],
    run: (args, { state }) => ({
      out: state.history.map((h, i) => `  ${String(i + 1).padStart(4)}  ${h}`),
    }),
  }),

  // ── FS mutation ──
  defineCommand({
    name: 'touch',
    synopsis: 'touch <file ...>',
    summary: 'create empty file(s)',
    man: [
      'NAME',
      '    touch — create empty files',
      '',
      'SYNOPSIS',
      '    touch <file...>',
      '',
      'DESCRIPTION',
      '    Creates each named file with empty content if it does not yet',
      '    exist. Existing files are left unchanged (timestamps are not',
      '    tracked in this filesystem).',
      '',
      '    Files created with touch are regular type=file nodes and can',
      '    be edited with nano. The parent directory must already exist —',
      '    use `mkdir -p` to create nested paths first.',
      '',
      'EXAMPLES',
      '    touch new.txt',
      '    touch a.txt b.txt c.txt',
      '',
      'SEE ALSO',
      '    mkdir, nano',
    ],
    run: (args, { state, setState }) => {
      if (!args.length) return { out: ['touch: missing file operand'], err: true };
      const { cwd } = activeView(state);
      const m = mutateFS(state, (root) => {
        for (const a of args) {
          const segs = resolvePath(a, cwd);
          const p = parentOf(root, segs);
          if (!p) return { err: `touch: cannot touch '${a}': No such file or directory` };
          if (!p.parent.children[p.name])
            p.parent.children[p.name] = { type: 'file', name: p.name, content: '' };
        }
      });
      if (m.err) return { out: [m.err], err: true };
      setState(s => applyNewRoot(s, m.newRoot));
      return { out: [] };
    },
  }),

  defineCommand({
    name: 'mkdir',
    synopsis: 'mkdir [-p] <dir>',
    summary: 'make directory',
    man: [
      'NAME',
      '    mkdir — make directories',
      '',
      'SYNOPSIS',
      '    mkdir [-p] <dir...>',
      '',
      'OPTIONS',
      '    -p    create parent directories as needed; do not fail if the',
      '          target already exists as a directory',
      '',
      'DESCRIPTION',
      '    Without -p, mkdir fails if any parent directory is missing or',
      '    the target already exists. With -p, the full path is created',
      '    in one shot and existing intermediates are tolerated.',
      '',
      'EXAMPLES',
      '    mkdir notes',
      '    mkdir -p src/lib/util',
    ],
    run: (args, { state, setState }) => {
      const flags = args.filter(a => a.startsWith('-'));
      const paths = args.filter(a => !a.startsWith('-'));
      const mkparents = flags.some(f => f.includes('p'));
      if (!paths.length) return { out: ['mkdir: missing operand'], err: true };
      const { cwd } = activeView(state);
      const m = mutateFS(state, (root) => {
        for (const a of paths) {
          const segs = resolvePath(a, cwd);
          if (mkparents) {
            let cur = root;
            for (const s of segs) {
              if (!cur.children[s]) cur.children[s] = { type: 'dir', name: s, children: {} };
              else if (cur.children[s].type !== 'dir')
                return { err: `mkdir: cannot create '${a}': File exists` };
              cur = cur.children[s];
            }
          } else {
            const p = parentOf(root, segs);
            if (!p) return { err: `mkdir: cannot create directory '${a}': No such file or directory` };
            if (p.parent.children[p.name]) return { err: `mkdir: cannot create directory '${a}': File exists` };
            p.parent.children[p.name] = { type: 'dir', name: p.name, children: {} };
          }
        }
      });
      if (m.err) return { out: [m.err], err: true };
      setState(s => applyNewRoot(s, m.newRoot));
      return { out: [] };
    },
  }),

  defineCommand({
    name: 'rm',
    synopsis: 'rm [-rf] <path>',
    summary: 'remove file or directory',
    man: [
      'NAME',
      '    rm — remove files or directories',
      '',
      'SYNOPSIS',
      '    rm [-rf] <path...>',
      '',
      'OPTIONS',
      '    -r, -R    recursive — required to remove directories',
      '    -f        force — ignore missing paths and suppress not-found',
      '              errors',
      '',
      'DESCRIPTION',
      '    Removes each path. Without -r, attempting to remove a directory',
      '    is rejected. With -f, removing a non-existent path is silent.',
      '',
      '    rm refuses to operate on / (the filesystem root). There is no',
      '    confirmation prompt and no undo — removed nodes are gone for',
      '    this session.',
      '',
      'EXAMPLES',
      '    rm old.txt',
      '    rm -r build',
      '    rm -rf .cache stale',
    ],
    run: (args, { state, setState }) => {
      const flags = args.filter(a => a.startsWith('-'));
      const paths = args.filter(a => !a.startsWith('-'));
      const recursive = flags.some(f => f.includes('r') || f.includes('R'));
      const force = flags.some(f => f.includes('f'));
      if (!paths.length) return { out: ['rm: missing operand'], err: true };
      const { cwd } = activeView(state);
      const errors = [];
      const m = mutateFS(state, (root) => {
        for (const a of paths) {
          const segs = resolvePath(a, cwd);
          if (!segs.length) { errors.push(`rm: cannot remove '/': is root`); continue; }
          const p = parentOf(root, segs);
          if (!p || !p.parent.children[p.name]) {
            if (!force) errors.push(`rm: cannot remove '${a}': No such file or directory`);
            continue;
          }
          if (p.parent.children[p.name].type === 'dir' && !recursive) {
            errors.push(`rm: cannot remove '${a}': Is a directory (use -r)`);
            continue;
          }
          delete p.parent.children[p.name];
        }
      });
      if (m.err) return { out: [m.err], err: true };
      setState(s => applyNewRoot(s, m.newRoot));
      return { out: errors, err: errors.length > 0 };
    },
  }),

  defineCommand({
    name: 'mv',
    synopsis: 'mv <src> <dst>',
    summary: 'move or rename',
    man: [
      'NAME',
      '    mv — move or rename files and directories',
      '',
      'SYNOPSIS',
      '    mv <src...> <dst>',
      '',
      'DESCRIPTION',
      '    If dst is an existing directory, each src is moved into it,',
      '    keeping its original name. Otherwise dst is treated as the new',
      '    path: src is renamed (and possibly relocated) to dst.',
      '',
      '    With multiple sources, dst MUST be an existing directory; any',
      '    other case is an error.',
      '',
      'EXAMPLES',
      '    mv old.txt new.txt',
      '    mv a.txt b.txt c.txt archive/',
    ],
    run: (args, { state, setState }) => {
      if (args.length < 2) return { out: ['mv: missing destination operand'], err: true };
      const dst = args[args.length - 1];
      const sources = args.slice(0, -1);
      const { cwd } = activeView(state);
      const m = mutateFS(state, (root) => {
        const dstSegs = resolvePath(dst, cwd);
        const dstNode = nodeAt(root, dstSegs);
        const dstIsDir = dstNode && dstNode.type === 'dir';
        if (sources.length > 1 && !dstIsDir)
          return { err: `mv: target '${dst}' is not a directory` };
        for (const src of sources) {
          const srcSegs = resolvePath(src, cwd);
          const sp = parentOf(root, srcSegs);
          if (!sp || !sp.parent.children[sp.name])
            return { err: `mv: cannot stat '${src}': No such file or directory` };
          const node = sp.parent.children[sp.name];
          if (dstIsDir) {
            dstNode.children[node.name] = node;
          } else {
            const dp = parentOf(root, dstSegs);
            if (!dp) return { err: `mv: cannot move to '${dst}': No such file or directory` };
            dp.parent.children[dp.name] = { ...node, name: dp.name };
          }
          delete sp.parent.children[sp.name];
        }
      });
      if (m.err) return { out: [m.err], err: true };
      setState(s => applyNewRoot(s, m.newRoot));
      return { out: [] };
    },
  }),

  defineCommand({
    name: 'cp',
    synopsis: 'cp [-r] <src> <dst>',
    summary: 'copy file or directory',
    man: [
      'NAME',
      '    cp — copy files and directories',
      '',
      'SYNOPSIS',
      '    cp [-r] <src...> <dst>',
      '',
      'OPTIONS',
      '    -r, -R    copy directories recursively (required for type=dir)',
      '',
      'DESCRIPTION',
      '    If dst is an existing directory, each src is copied into it,',
      '    keeping its original name. Otherwise dst is the destination',
      '    path: src is copied to dst.',
      '',
      '    With multiple sources, dst MUST be an existing directory.',
      '    Copying a directory without -r is an error.',
      '',
      'EXAMPLES',
      '    cp readme.txt backup.txt',
      '    cp -r src/ src-snapshot/',
    ],
    run: (args, { state, setState }) => {
      const flags = args.filter(a => a.startsWith('-'));
      const paths = args.filter(a => !a.startsWith('-'));
      const recursive = flags.some(f => f.includes('r') || f.includes('R'));
      if (paths.length < 2) return { out: ['cp: missing destination operand'], err: true };
      const dst = paths[paths.length - 1];
      const sources = paths.slice(0, -1);
      const { cwd } = activeView(state);
      const m = mutateFS(state, (root) => {
        const dstSegs = resolvePath(dst, cwd);
        const dstNode = nodeAt(root, dstSegs);
        const dstIsDir = dstNode && dstNode.type === 'dir';
        if (sources.length > 1 && !dstIsDir)
          return { err: `cp: target '${dst}' is not a directory` };
        for (const src of sources) {
          const srcSegs = resolvePath(src, cwd);
          const srcNode = nodeAt(root, srcSegs);
          if (!srcNode) return { err: `cp: cannot stat '${src}': No such file or directory` };
          if (srcNode.type === 'dir' && !recursive)
            return { err: `cp: -r not specified; omitting directory '${src}'` };
          const copy = cloneFS(srcNode);
          if (dstIsDir) {
            dstNode.children[srcNode.name] = copy;
          } else {
            const dp = parentOf(root, dstSegs);
            if (!dp) return { err: `cp: cannot copy to '${dst}': No such file or directory` };
            copy.name = dp.name;
            dp.parent.children[dp.name] = copy;
          }
        }
      });
      if (m.err) return { out: [m.err], err: true };
      setState(s => applyNewRoot(s, m.newRoot));
      return { out: [] };
    },
  }),

  // ── search ──
  defineCommand({
    name: 'grep',
    synopsis: 'grep [-in] <pat> <file>',
    summary: 'search for pattern',
    man: [
      'NAME',
      '    grep — search files or piped input for a pattern',
      '',
      'SYNOPSIS',
      '    grep [-in] <pattern> [file...]',
      '',
      'OPTIONS',
      '    -i    case-insensitive match',
      '    -n    prefix each matching line with its 1-based line number',
      '',
      'DESCRIPTION',
      '    The pattern is interpreted as a JavaScript regular expression.',
      '    Each matching line is printed. With multiple files, each output',
      '    line is prefixed with "filename:". With -n, each line is also',
      '    prefixed with "lineNumber:".',
      '',
      '    With no file arguments, grep reads from piped stdin instead:',
      '        history | grep ssh',
      '        cat /etc/hosts | grep -i vault',
      '',
      'NOTES',
      '    Invalid regex patterns are reported with the JavaScript parser',
      '    error message. To match a literal special character, escape it',
      '    with a backslash (e.g. grep "\\." file).',
      '',
      'EXAMPLES',
      "    grep -n TODO src/main.c",
      "    grep -i error /var/log/system.log",
    ],
    run: (args, { state, pipedInput }) => {
      const flags = args.filter(a => a.startsWith('-'));
      const positional = args.filter(a => !a.startsWith('-'));
      const ignoreCase = flags.some(f => f.includes('i'));
      const lineNums  = flags.some(f => f.includes('n'));
      if (!positional.length) return { out: ['grep: usage: grep [-in] <pattern> [file...]'], err: true };
      const [pattern, ...files] = positional;
      const { root, cwd } = activeView(state);
      let re;
      try { re = new RegExp(pattern, ignoreCase ? 'i' : ''); }
      catch (e) { return { out: [`grep: invalid pattern: ${e.message}`], err: true }; }
      const out = [];
      let anyMatch = false, anyErr = false;

      // No files given → grep over piped stdin.
      if (!files.length) {
        const lines = pipedInput || [];
        lines.forEach((line, i) => {
          if (re.test(line)) {
            anyMatch = true;
            out.push((lineNums ? `${i+1}:` : '') + line);
          }
        });
        return { out, err: !anyMatch && !anyErr };
      }

      const multi = files.length > 1;
      for (const f of files) {
        const node = nodeAt(root, resolvePath(f, cwd));
        if (!node)                  { out.push(`grep: ${f}: No such file or directory`); anyErr = true; continue; }
        if (node.type === 'dir')    { out.push(`grep: ${f}: Is a directory`);             anyErr = true; continue; }
        if (node.type === 'exec')   { out.push(`grep: ${f}: binary file`);                anyErr = true; continue; }
        (node.content || '').split('\n').forEach((line, i) => {
          if (re.test(line)) {
            anyMatch = true;
            out.push((multi ? `${f}:` : '') + (lineNums ? `${i+1}:` : '') + line);
          }
        });
      }
      return { out, err: anyErr };
    },
  }),

  // ── aliases ──
  defineCommand({
    name: 'alias',
    synopsis: 'alias [k=v]',
    summary: 'define or list aliases',
    man: [
      'NAME',
      '    alias — define or list command aliases',
      '',
      'SYNOPSIS',
      '    alias                       list all defined aliases',
      '    alias <name>                show the value of one alias',
      "    alias <name>='<value>'      define or replace an alias",
      '',
      'DESCRIPTION',
      '    Defines a per-session shorthand. When you type an aliased name,',
      '    the value is substituted, re-tokenised, and any arguments you',
      '    passed are appended.',
      '',
      '    Aliases live in session state only — they are not persisted',
      '    across reloads, and they do not appear in the COMMANDS lookup.',
      '',
      'EXAMPLES',
      "    alias ll='ls -la'",
      "    alias up='cd ..'",
      "    alias gh='grep -in'",
      '    alias',
      '',
      'SEE ALSO',
      '    unalias',
    ],
    run: (args, { state, setState }) => {
      const aliases = state.aliases || {};
      if (!args.length) {
        const lines = Object.entries(aliases).map(([k,v]) => `alias ${k}='${v}'`);
        return { out: lines.length ? lines : ['(no aliases defined)'] };
      }
      const raw = args.join(' ');
      const eq = raw.indexOf('=');
      if (eq < 0) {
        const v = aliases[raw];
        return v ? { out: [`alias ${raw}='${v}'`] } : { out: [`alias: ${raw}: not found`], err: true };
      }
      const name = raw.slice(0, eq).trim();
      let val = raw.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
      setState(s => ({ ...s, aliases: { ...(s.aliases || {}), [name]: val } }));
      return { out: [] };
    },
  }),

  defineCommand({
    name: 'unalias',
    synopsis: 'unalias <name>',
    summary: 'remove alias',
    man: [
      'NAME',
      '    unalias — remove one or more aliases',
      '',
      'SYNOPSIS',
      '    unalias <name...>',
      '',
      'DESCRIPTION',
      '    Removes each named alias. Unknown names produce an error but',
      '    do not stop processing of the remaining names.',
      '',
      'SEE ALSO',
      '    alias',
    ],
    run: (args, { state, setState }) => {
      if (!args.length) return { out: ['unalias: missing name'], err: true };
      const aliases = { ...(state.aliases || {}) };
      const errs = [];
      for (const name of args) {
        if (!(name in aliases)) errs.push(`unalias: ${name}: not found`);
        else delete aliases[name];
      }
      setState(s => ({ ...s, aliases }));
      return { out: errs, err: errs.length > 0 };
    },
  }),

  // ── docs (lookup-driven) ──
  defineCommand({
    name: 'man',
    synopsis: 'man <cmd>',
    summary: 'show manual page',
    man: [
      'NAME',
      '    man — show the manual page for a command',
      '',
      'SYNOPSIS',
      '    man <command>',
      '',
      'DESCRIPTION',
      '    Prints the manual page for <command>. Run `help` to see the',
      '    full list of available commands.',
      '',
      'SEE ALSO',
      '    help',
    ],
    run: (args) => {
      if (!args.length) return { out: ['What manual page do you want?'], err: true };
      const page = MAN_PAGES[args[0]];
      return page ? { out: page } : { out: [`No manual entry for ${args[0]}`], err: true };
    },
  }),

  // ── visualization ──
  defineCommand({
    name: 'vfs',
    synopsis: 'vfs [-adsL N] [path]',
    summary: 'visualize directory tree',
    man: [
      'NAME',
      '    vfs — visualize the directory tree',
      '',
      'SYNOPSIS',
      '    vfs [-a] [-d] [-s] [-L N] [path]',
      '',
      'OPTIONS',
      '    -a        include hidden entries (names starting with .)',
      '    -d        directories only — skip files',
      '    -s        show file sizes in bytes; (exec) for executable nodes',
      '    -L N      limit recursion depth to N levels',
      '    -<N>      shorthand for -L N  (e.g. -2 means -L 2)',
      '',
      'DESCRIPTION',
      '    Prints an ASCII tree of the named directory (or the current',
      '    directory by default), followed by a summary line counting',
      '    directories and files visited. Entries are colored by file',
      '    kind to match `ls`.',
      '',
      '    When the rendered tree contains the current working directory,',
      '    a "← you are here" marker is added next to the matching folder.',
      '    Toggle this in the Tweaks panel (Layout > vfs "← you are here"',
      '    marker).',
      '',
      'EXAMPLES',
      '    vfs',
      '    vfs -a /home/user',
      '    vfs -L 2',
      '    vfs -ds /',
    ],
    run: (args, { state, tweaks }) => {
      const flags = args.filter(a => a.startsWith('-'));
      const positional = args.filter(a => !a.startsWith('-'));
      const showHidden = flags.some(f => f.includes('a'));
      const dirsOnly   = flags.some(f => f.includes('d'));
      const showSize   = flags.some(f => f.includes('s'));
      const showHere   = tweaks && tweaks.vfsHere !== false;

      // Depth: -L N or -<digit>
      let maxDepth = Infinity;
      for (let i = 0; i < flags.length; i++) {
        const f = flags[i];
        if (f === '-L') { const n = parseInt(args[args.indexOf(f) + 1], 10); if (!isNaN(n)) maxDepth = n; }
        const m = f.match(/^-(\d+)$/);
        if (m) maxDepth = parseInt(m[1], 10);
      }
      const cleanPositional = positional.filter(p => !/^\d+$/.test(p));

      const { root, cwd } = activeView(state);
      const target = cleanPositional[0] || '.';
      const segs = resolvePath(target, cwd);
      const start = nodeAt(root, segs);
      if (!start) return { out: [`vfs: ${target}: No such file or directory`], err: true };
      if (start.type !== 'dir') return { out: [`vfs: ${target}: Not a directory`], err: true };

      const out = [];
      const startPath = displayPath(segs) || '/';
      const cwdPath   = displayPath(cwd)  || '/';

      let dirCount = 0, fileCount = 0;

      const rootIsHere = showHere && startPath === cwdPath;
      out.push([
        { text: startPath, kind: 'dir' },
        ...(rootIsHere ? [{ text: '  ← you are here', kind: 'exec' }] : []),
      ]);

      const walk = (node, prefix, depth, currentPath) => {
        if (depth > maxDepth) return;
        const entries = Object.values(node.children || {})
          .filter(n => showHidden || !n.name.startsWith('.'))
          .filter(n => !dirsOnly || n.type === 'dir')
          .sort((a, b) => {
            if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
            return a.name.localeCompare(b.name);
          });
        entries.forEach((child, i) => {
          const last = i === entries.length - 1;
          const branch = last ? '└── ' : '├── ';
          const nextPrefix = prefix + (last ? '    ' : '│   ');
          const label = child.name + (child.type === 'dir' ? '/' : '');
          const childPath = currentPath === '/' ? '/' + child.name : currentPath + '/' + child.name;
          const sizeStr = showSize && child.type === 'file' ? `  (${child.content.length}b)` :
                          showSize && child.type === 'exec' ? '  (exec)' : '';
          const isHere = showHere && child.type === 'dir' && childPath === cwdPath;
          out.push([
            { text: prefix + branch, kind: 'log' },
            { text: label, kind: fileKind(child) },
            ...(sizeStr ? [{ text: sizeStr, kind: 'log' }] : []),
            ...(isHere ? [{ text: '  ← you are here', kind: 'exec' }] : []),
          ]);
          if (child.type === 'dir') { dirCount++; walk(child, nextPrefix, depth + 1, childPath); }
          else fileCount++;
        });
      };
      walk(start, '', 1, startPath);

      out.push([{ text: '', kind: 'log' }]);
      out.push([{ text: `${dirCount} director${dirCount === 1 ? 'y' : 'ies'}, ${fileCount} file${fileCount === 1 ? '' : 's'}`, kind: 'log' }]);
      return { out, segments: true };
    },
  }),

  // ── live monitor ──
  defineCommand({
    name: 'top',
    synopsis: 'top',
    summary: 'live process monitor (q to exit)',
    man: [
      'NAME',
      '    top — live process monitor',
      '',
      'SYNOPSIS',
      '    top',
      '',
      'DESCRIPTION',
      '    Takes over the terminal in live mode, rendering a fake process',
      '    table that re-renders every 1.5 seconds. The header shows the',
      '    clock, uptime, task count, %CPU breakdown, and memory totals.',
      '    Rows are sorted by %CPU descending, with values jittered each',
      '    tick so the display feels alive.',
      '',
      '    The process list differs between local and remote sessions to',
      '    match the host you are connected to: a small init/sshd/bash/top',
      '    set on remote vault/archive/printer, and a fuller set including',
      '    nginx/postgres/redis on the local workstation.',
      '',
      '    While top is running, all keyboard input is intercepted — only',
      '    the exit keys do anything.',
      '',
      'KEYS',
      '    q, Q                exit',
      '    Escape              exit',
      '    Ctrl+C              exit',
    ],
    run: (args, { state }) => {
      const startTime = Date.now();
      const baseUptimeMs = 4218000 + Math.floor(Math.random() * 60000);

      const remoteUser = state.remote ? state.remote.user : (state.user || 'user');
      const procs = state.remote ? [
        { pid: 1,    user: 'root',       cpu: 0.0, mem: 0.4, time: '0:00.42', cmd: '/sbin/init' },
        { pid: 392,  user: 'root',       cpu: 0.1, mem: 0.7, time: '0:01.18', cmd: 'sshd: listening' },
        { pid: 615,  user: 'root',       cpu: 0.0, mem: 0.3, time: '0:00.31', cmd: 'cron' },
        { pid: 884,  user: remoteUser,   cpu: 0.4, mem: 1.2, time: '0:02.45', cmd: '-bash' },
        { pid: 1042, user: remoteUser,   cpu: 1.1, mem: 0.9, time: '0:03.18', cmd: 'top' },
      ] : [
        { pid: 1,    user: 'root',       cpu: 0.0, mem: 0.5, time: '0:01.23', cmd: '/sbin/init' },
        { pid: 412,  user: 'root',       cpu: 0.1, mem: 1.2, time: '0:04.18', cmd: '/usr/sbin/sshd -D' },
        { pid: 891,  user: 'root',       cpu: 0.0, mem: 0.3, time: '0:00.42', cmd: 'cron' },
        { pid: 1024, user: remoteUser,   cpu: 1.2, mem: 2.4, time: '0:08.91', cmd: '-bash' },
        { pid: 1342, user: remoteUser,   cpu: 3.4, mem: 5.1, time: '0:12.04', cmd: 'shell' },
        { pid: 2105, user: remoteUser,   cpu: 0.8, mem: 1.8, time: '0:02.55', cmd: 'node /opt/agent/index.js' },
        { pid: 2310, user: 'www-data',   cpu: 0.4, mem: 2.0, time: '0:06.10', cmd: 'nginx: worker process' },
        { pid: 2890, user: 'postgres',   cpu: 0.6, mem: 8.3, time: '0:09.81', cmd: 'postgres: 14/main: idle' },
        { pid: 3201, user: 'redis',      cpu: 0.2, mem: 1.1, time: '0:03.92', cmd: 'redis-server *:6379' },
        { pid: 4500, user: remoteUser,   cpu: 12.7,mem: 4.5, time: '0:18.43', cmd: 'compiler-srv --watch' },
      ];
      const loadAvg = [0.42, 0.55, 0.68];

      const jitter = (val, min, max, amt) => {
        const next = val + (Math.random() - 0.5) * 2 * amt;
        return Math.max(min, Math.min(max, next));
      };
      const pad  = (n, w) => String(n).padStart(w, ' ');
      const padR = (n, w) => String(n).padEnd(w, ' ');
      const z2   = (n) => String(n).padStart(2, '0');
      const fmtClock = (d) => `${z2(d.getHours())}:${z2(d.getMinutes())}:${z2(d.getSeconds())}`;
      const fmtUptime = (ms) => {
        const s = Math.floor(ms / 1000);
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = s % 60;
        if (h) return `${h}:${z2(m)}`;
        return `0:${z2(m)}.${z2(sec)}`;
      };

      return {
        live: {
          intervalMs: 1500,
          render: () => {
            procs.forEach(p => {
              p.cpu = jitter(p.cpu, 0, 99, 1.6);
              p.mem = jitter(p.mem, 0.1, 30, 0.4);
            });
            loadAvg[0] = jitter(loadAvg[0], 0.0, 4, 0.10);
            loadAvg[1] = jitter(loadAvg[1], 0.0, 4, 0.05);
            loadAvg[2] = jitter(loadAvg[2], 0.0, 4, 0.03);

            const sorted = [...procs].sort((a, b) => b.cpu - a.cpu);
            const cpuTotal = sorted.reduce((s, p) => s + p.cpu, 0);
            const cpuIdle  = Math.max(0, 100 - cpuTotal);
            const memUsedPct = sorted.reduce((s, p) => s + p.mem, 0);
            const memTotal = 8192;
            const memUsed = Math.floor(memTotal * memUsedPct / 100);
            const memFree = memTotal - memUsed;

            const header = [
              `top - ${fmtClock(new Date())}  up ${fmtUptime(Date.now() - startTime + baseUptimeMs)},  1 user,  load average: ${loadAvg.map(v => v.toFixed(2)).join(', ')}`,
              `Tasks: ${pad(sorted.length, 3)} total,   1 running,  ${pad(sorted.length - 1, 2)} sleeping,   0 stopped,   0 zombie`,
              `%Cpu(s): ${pad(cpuTotal.toFixed(1), 5)} us,   0.3 sy,   0.0 ni,  ${pad(cpuIdle.toFixed(1), 5)} id,   0.0 wa`,
              `MiB Mem :  ${pad(memTotal, 6)} total,  ${pad(memFree, 6)} free,  ${pad(memUsed, 6)} used,    256 buff/cache`,
              '',
              '  PID USER       %CPU  %MEM     TIME+ COMMAND',
            ];
            const rows = sorted.map(p =>
              `${pad(p.pid, 5)} ${padR(p.user, 10)} ${pad(p.cpu.toFixed(1), 5)} ${pad(p.mem.toFixed(1), 5)} ${pad(p.time, 9)} ${p.cmd}`
            );
            const footer = ['', '  (press q, Esc, or Ctrl+C to exit)'];

            return [
              ...header.map(text => ({ kind: 'raw', text })),
              ...rows.map(text => ({ kind: 'out', text })),
              ...footer.map(text => ({ kind: 'raw', text })),
            ];
          },
        },
      };
    },
  }),

  // ── editor ──
  defineCommand({
    name: 'nano',
    synopsis: 'nano <file>',
    summary: 'edit a file  (^O save, ^X exit)',
    man: [
      'NAME',
      '    nano — modal text editor for the virtual filesystem',
      '',
      'SYNOPSIS',
      '    nano <file>',
      '    edit <file>              (alias)',
      '',
      'DESCRIPTION',
      '    Opens <file> in a full-screen modal editor. If the file does',
      '    not exist, an empty buffer is opened and the file is created',
      '    only on save.',
      '',
      '    nano refuses to open directories or executable nodes (type=exec',
      '    — e.g. the seeded *.sh scripts and /bin/diag). Files created',
      '    with `touch` or `nano` are regular type=file nodes and are',
      '    freely editable.',
      '',
      '    Saves write the buffer back into the active filesystem — local',
      '    or remote — depending on where the file was opened from. While',
      '    the editor is open, terminal commands are suspended.',
      '',
      'NAVIGATION',
      '    ← → ↑ ↓                  move the cursor',
      '    Home / End               start / end of line',
      '    PageUp / PageDown        jump 10 lines',
      '    Ctrl+A / Ctrl+E          start / end of line',
      '',
      'EDITING',
      '    Enter                    insert newline at cursor',
      '    Backspace                delete the character before the cursor',
      '    Delete                   delete the character at the cursor',
      '    Tab                      insert 4 spaces',
      '    Ctrl+K                   cut the current line into the internal',
      '                             clipboard',
      '    Ctrl+U                   paste the cut line back',
      '    Ctrl+V                   paste from the system clipboard',
      '',
      'FILE',
      '    Ctrl+O, Ctrl+S           save buffer to file',
      '    Ctrl+X                   exit. If the buffer was modified, you',
      '                             will be prompted with',
      '                             "Save modified buffer?":',
      '                               Y         save and exit',
      '                               N         discard and exit',
      '                               C, Esc    cancel and keep editing',
      '',
      'STATUS',
      '    The status bar shows "Ln L, Col C" during editing. After a',
      '    save it briefly shows "[ Wrote N lines ]". The modified-exit',
      '    prompt is rendered in the err color.',
      '',
      'NOTES',
      '    Paste uses the system clipboard via Ctrl+V or the OS paste menu',
      '    (routed through the onPaste handler). Multi-line clipboard',
      '    content is inserted with newlines preserved.',
      '',
      'SEE ALSO',
      '    edit, touch, cat',
    ],
    run: (args, { state }) => editorOpen(args, state),
  }),

  defineCommand({
    name: 'edit',
    synopsis: 'edit <file>',
    summary: 'edit a file  (alias for nano)',
    man: [
      'NAME',
      '    edit — alias for nano',
      '',
      'SYNOPSIS',
      '    edit <file>',
      '',
      'DESCRIPTION',
      '    Identical to `nano <file>`. See the nano manual page for the',
      '    full keymap and behavior.',
      '',
      'SEE ALSO',
      '    nano',
    ],
    run: (args, { state }) => editorOpen(args, state),
  }),

  // ── remote ──
  defineCommand({
    name: 'ssh',
    synopsis: 'ssh <ip>',
    summary: 'connect to a remote host',
    man: [
      'NAME',
      '    ssh — connect to a remote host',
      '',
      'SYNOPSIS',
      '    ssh <ip>',
      '',
      'DESCRIPTION',
      '    Plays a short animated connection cinematic — TCP handshake,',
      '    protocol + cipher banner, server key fingerprint (stable per',
      '    host), publickey authentication, and a welcome banner with a',
      '    fake last-login timestamp. Keyboard input is suppressed for',
      '    the duration of the animation.',
      '',
      '    On success, the prompt switches to the remote user@host and',
      '    every filesystem command (ls, cd, cat, vfs, nano, etc.) operates',
      '    on the remote tree. Your local cwd, FS, and aliases are',
      '    preserved and restored when you `disconnect`.',
      '',
      '    Connecting to an unknown IP plays a brief failure cinematic',
      '    ending in "No route to host" and leaves the local session',
      '    untouched.',
      '',
      'HOSTS',
      '    10.0.4.12       vault   (admin)   — secrets, ledger.dat',
      '    10.0.4.20       archive (guest)   — public mirror',
      '    192.168.1.5     printer (svc)     — print queue',
      '',
      'NOTES',
      '    Only one remote session may be active at a time. Use',
      '    `disconnect` before connecting to another host.',
      '',
      'SEE ALSO',
      '    disconnect',
    ],
    hideFromHelp: true, // documented separately under "ssh hosts:" in help
    run: (args, { state }) => {
      if (args.length === 0) return { out: ['ssh: missing host operand'], err: true };
      if (state.remote) return { out: [`ssh: already connected to ${state.remote.host} — disconnect first`], err: true };
      const ip = args[0];
      const rec = REMOTES[ip];

      // Unknown host: short cinematic ending in a connection failure.
      if (!rec) {
        return {
          animate: [
            { delay: 0,    line: { kind: 'out', text: `ssh: connecting to ${ip}:22 ...` } },
            { delay: 600,  line: { kind: 'out', text: 'ssh: TCP handshake [SYN → ... no reply]' } },
            { delay: 1200, line: { kind: 'err', text: `ssh: connect to host ${ip} port 22: No route to host` } },
          ],
          err: true,
        };
      }

      const fingerprint = FINGERPRINTS[ip] || randomFingerprint();
      const newRoot = rec.fs();
      return {
        animate: [
          { delay: 0,   line: { kind: 'out', text: `ssh: connecting to ${ip}:22 ...` } },
          { delay: 350, line: { kind: 'out', text: 'ssh: TCP handshake [SYN → SYN-ACK → ACK]' } },
          { delay: 320, line: { kind: 'out', text: 'ssh: protocol SSH-2.0-OpenSSH_9.6' } },
          { delay: 300, line: { kind: 'out', text: 'ssh: kex curve25519-sha256, cipher chacha20-poly1305@openssh.com' } },
          { delay: 350, line: { kind: 'out', text: 'ssh: server key fingerprint:' } },
          { delay: 60,  line: { kind: 'out', text: `    SHA256:${fingerprint}` } },
          { delay: 450, line: { kind: 'out', text: 'ssh: known host — fingerprint match' } },
          { delay: 400, line: { kind: 'out', text: 'ssh: authenticating (publickey) ...' } },
          { delay: 500, line: { kind: 'out', text: 'ssh: handshake ok' } },
          { delay: 120, line: { kind: 'raw', text: '' } },
          {
            delay: 200,
            setState: (s) => ({
              ...s,
              remote: { ip, host: rec.host, user: rec.user, root: newRoot, cwd: [], prevCwd: [] },
            }),
            line: { kind: 'raw', text: `Welcome to ${rec.host} (${ip})` },
          },
          { delay: 100, line: { kind: 'raw', text: 'Last login: Fri Apr 17 22:04:11 2026 from workstation' } },
          { delay: 0,   line: { kind: 'raw', text: '' } },
        ],
      };
    },
  }),

  defineCommand({
    name: 'disconnect',
    synopsis: 'disconnect',
    summary: 'end remote session',
    man: [
      'NAME',
      '    disconnect — end the current remote session',
      '',
      'SYNOPSIS',
      '    disconnect',
      '',
      'DESCRIPTION',
      '    Closes the active SSH session and restores the local prompt,',
      '    cwd, and filesystem. The remote filesystem tree is discarded —',
      '    save any nano buffer with Ctrl+O before disconnecting if you',
      '    want changes to persist for the remainder of the session.',
      '',
      '    With no active session, disconnect is a no-op (returns an',
      '    error).',
      '',
      'SEE ALSO',
      '    ssh',
    ],
    run: (args, { state, setState }) => {
      if (!state.remote) return { out: ['disconnect: not connected to any host'], err: true };
      const host = state.remote.host;
      setState(s => ({ ...s, remote: null }));
      return { out: [`Connection to ${host} closed.`] };
    },
  }),
];

// ───────────── derive runtime lookups from the registry ─────────────

const COMMANDS = {};
const MAN_PAGES = {};
for (const c of cmdDefs) {
  COMMANDS[c.name] = { desc: c.summary, run: c.run };
  if (c.man) MAN_PAGES[c.name] = c.man;
}

export { COMMANDS, MAN_PAGES };
