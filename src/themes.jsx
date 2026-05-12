// Theme palettes and font stacks.
//
// Adding a new theme: add an entry to THEMES. Each theme must define every
// color key listed below — anything missing will fall back to text-color in
// the UI. Themes are referenced by their object key from tweaks.theme.
//
// Color keys:
//   bg            terminal background
//   chrome        window chrome (title bar) background
//   chromeBorder  border between chrome / terminal / window edge
//   fg            default foreground text
//   dim           dim text (timestamps, dividers, "raw" boot lines)
//   prompt        prompt punctuation (@ : $)
//   user          username segment in prompt
//   host          hostname segment in prompt
//   path          path segment in prompt
//   exec          executable / "you are here" highlight
//   err           error text and edit-prompt
//   dir           ls/vfs: directory color
//   file          ls/vfs: regular file color
//   script        ls/vfs: scripts/executables (.sh .py .js …)
//   log           ls/vfs: log files and tree branches
//   data          ls/vfs: structured data files (.csv .json …)
//
// Adding a new font: add an entry to FONTS. The key is what's displayed in
// the Tweaks panel, the value is the CSS font-family stack.

const THEMES = {
  phosphor: {
    name: 'phosphor',
    bg: 'oklch(0.16 0.01 250)',
    chrome: 'oklch(0.22 0.008 250)',
    chromeBorder: 'oklch(0.30 0.01 250)',
    fg: 'oklch(0.88 0.12 145)',
    dim: 'oklch(0.60 0.05 145)',
    prompt: 'oklch(0.55 0.03 145)',
    user: 'oklch(0.82 0.15 85)',
    host: 'oklch(0.78 0.14 200)',
    path: 'oklch(0.78 0.14 240)',
    exec: 'oklch(0.82 0.15 30)',
    err: 'oklch(0.70 0.18 25)',
    dir:  'oklch(0.78 0.14 240)',
    file: 'oklch(0.88 0.12 145)',
    script: 'oklch(0.82 0.15 85)',
    log:  'oklch(0.65 0.06 145)',
    data: 'oklch(0.78 0.10 200)',
  },
  hacker: {
    name: 'hacker',
    bg: '#000000',
    chrome: '#0a0a0a',
    chromeBorder: '#1c1c1c',
    fg: '#00ff41',
    dim: '#005c17',
    prompt: '#007a1f',
    user: '#00ff41',
    host: '#00cc33',
    path: '#00ff41',
    exec: '#ccff00',
    err: '#ff2222',
    dir:  '#00ffff',
    file: '#00cc33',
    script: '#ccff00',
    log:  '#007a1f',
    data: '#ff9900',
  },
  monokai: {
    name: 'monokai',
    bg: '#272822',
    chrome: '#1e1f1c',
    chromeBorder: '#3b3c37',
    fg: '#f8f8f2',
    dim: '#75715e',
    prompt: '#75715e',
    user: '#a6e22e',
    host: '#66d9e8',
    path: '#e6db74',
    exec: '#fd971f',
    err: '#f92672',
    dir:  '#66d9e8',
    file: '#f8f8f2',
    script: '#a6e22e',
    log:  '#75715e',
    data: '#e6db74',
  },
  claude: {
    name: 'claude',
    bg: 'oklch(0.14 0.02 260)',
    chrome: 'oklch(0.19 0.025 260)',
    chromeBorder: 'oklch(0.28 0.03 260)',
    fg: 'oklch(0.92 0.01 80)',
    dim: 'oklch(0.52 0.02 260)',
    prompt: 'oklch(0.55 0.04 260)',
    user: 'oklch(0.78 0.14 60)',
    host: 'oklch(0.72 0.12 280)',
    path: 'oklch(0.75 0.10 220)',
    exec: 'oklch(0.80 0.16 50)',
    err: 'oklch(0.68 0.18 25)',
    dir:  'oklch(0.75 0.10 220)',
    file: 'oklch(0.92 0.01 80)',
    script: 'oklch(0.80 0.16 50)',
    log:  'oklch(0.52 0.02 260)',
    data: 'oklch(0.78 0.14 60)',
  },
  cyberpunk: {
    name: 'cyberpunk',
    bg: '#0d0d12',
    chrome: '#12121a',
    chromeBorder: '#2a1a3a',
    fg: '#f0e6ff',
    dim: '#4a3a5a',
    prompt: '#6a3a8a',
    user: '#ff2d78',
    host: '#00fff5',
    path: '#bd00ff',
    exec: '#ffe600',
    err: '#ff2d78',
    dir:  '#00fff5',
    file: '#f0e6ff',
    script: '#ffe600',
    log:  '#4a3a5a',
    data: '#ff6b00',
  },
  'AV Cyberpunk': {
    name: 'AV Cyberpunk',
    bg: '#050810',
    chrome: '#0a0e18',
    chromeBorder: '#1a1f2e',
    fg: '#d8f0ff',
    dim: '#2a4858',
    prompt: '#8a1a2a',
    user: '#ff2d40',
    host: '#00e5ff',
    path: '#00d4ff',
    exec: '#ff3a55',
    err: '#ff1f3a',
    dir:  '#00e5ff',
    file: '#d8f0ff',
    script: '#ff2d40',
    log:  '#3a5868',
    data: '#ffaa33',
  },
};

const FONTS = {
  'JetBrains Mono': `'JetBrains Mono', ui-monospace, Menlo, monospace`,
  'IBM Plex Mono': `'IBM Plex Mono', ui-monospace, Menlo, monospace`,
  'Fira Code': `'Fira Code', ui-monospace, Menlo, monospace`,
  'Courier Prime': `'Courier Prime', 'Courier New', monospace`,
  'VT323': `'VT323', monospace`,
  'Rajdhani': `'Rajdhani', sans-serif`,
};

export { THEMES, FONTS };
