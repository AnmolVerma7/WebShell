# Command Prompt Shell

A fully interactive virtual terminal built in React + Vite. Runs entirely in the browser — no server, no install. Features a virtual filesystem, command history, tab autocomplete, SSH simulation with animated cinematic, a live `top` process monitor, a modal `nano` text editor, mechanical key sounds, filesystem mutation, pipes, aliases, a boot-sequence animation, and a rich Tweaks panel.

---

## Getting Started

```bash
npm install
npm run dev        # http://localhost:5173
```

Build for deployment:

```bash
npm run build      # outputs to dist/
npm run preview    # serve the production build locally
```

### GitHub Pages (live site)

This repo includes [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml): every push to `main` builds with `npm ci` / `npm run build` and deploys `dist/` to **GitHub Pages**.

**One-time setup:** in the repo on GitHub go to **Settings → Pages → Build and deployment**, set **Source** to **GitHub Actions** (not “Deploy from a branch”). After the first successful workflow run, the site URL is shown on the workflow run and under **Settings → Pages** (typically `https://<user>.github.io/WebShell/`).

The terminal starts in `/home/user`. Type `help` to see all available commands, or `man <command>` for detailed help on any specific command. All Tweaks settings (theme, font, prompt, sounds, etc.) are persisted in `localStorage` under `shell.tweaks.v1`.

---

## Commands

### Navigation
| Command | Description |
|---------|-------------|
| `pwd` | Print current working directory |
| `ls [path]` | List directory contents |
| `ls -a [path]` | Include hidden files (dotfiles) |
| `ls -l [path]` | Long format with file type and size |
| `ls -la [path]` | Combined: long format + hidden files |
| `cd <path>` | Change directory |
| `cd ..` | Go up one directory |
| `cd /` | Go to root |
| `cd ~` | Go to home (`/home/user`) |
| `cd -` | Return to previous directory |

### Files
| Command | Description |
|---------|-------------|
| `cat <file ...>` | Print file contents (multiple files concatenated) |
| `exec <file>` | Execute a binary or script |
| `touch <file ...>` | Create empty file(s); no-op if file already exists |
| `mkdir <dir>` | Create a directory |
| `mkdir -p <dir>` | Create directory and all parent directories |
| `rm <file>` | Remove a file |
| `rm -r <dir>` | Remove a directory recursively |
| `rm -f <path>` | Force removal (suppress missing-file errors) |
| `rm -rf <path>` | Recursive + force |
| `mv <src> <dst>` | Move or rename a file/directory |
| `mv <src...> <dir>` | Move multiple sources into a directory |
| `cp <src> <dst>` | Copy a file |
| `cp -r <src> <dst>` | Copy a directory recursively |

### Search
| Command | Description |
|---------|-------------|
| `grep <pattern> <file ...>` | Search files for lines matching a regex |
| `grep -i <pattern> <file>` | Case-insensitive match |
| `grep -n <pattern> <file>` | Show line numbers |

### System
| Command | Description |
|---------|-------------|
| `whoami` | Print current user |
| `date` | Print current date and time |
| `echo <message>` | Print a message |
| `clear` | Clear the terminal (also: `Ctrl+L`) |
| `history` | Show full command history |
| `top` | Live process monitor — updating header (clock, uptime, load avg, mem) and process table, sorted by CPU. Press `q`, `Esc`, or `Ctrl+C` to exit. |
| `help` | List all commands and keyboard shortcuts |
| `man <command>` | Show detailed manual page for a command |

### Editor
| Command | Description |
|---------|-------------|
| `nano <file>` | Open a file in the modal text editor (see [Editor](#editor) below) |
| `edit <file>` | Alias for `nano` |

### Filesystem Visualization
| Command | Description |
|---------|-------------|
| `vfs` | Print a color-coded directory tree of cwd |
| `vfs <path>` | Tree starting at a specific path |
| `vfs -a` | Include hidden files (dotfiles) |
| `vfs -d` | Directories only |
| `vfs -s` | Show file sizes |
| `vfs -L <n>` | Limit depth to N levels |

The current directory is marked with `← you are here` in the tree (toggleable via Tweaks → Layout).

### Aliases
| Command | Description |
|---------|-------------|
| `alias` | List all defined aliases |
| `alias name=value` | Define an alias |
| `unalias <name>` | Remove an alias |

**Example:**
```
alias ll="ls -la"
alias gohome="cd ~"
ll /etc
```

### Remote
| Command | Description |
|---------|-------------|
| `ssh <ip>` | Connect to a remote host |
| `disconnect` | End the current remote session |

---

## Keyboard Shortcuts

### Input Editing
| Key | Action |
|-----|--------|
| `←` / `→` | Move cursor left / right |
| `Home` | Jump to start of line |
| `End` | Jump to end of line |
| `Ctrl+A` | Jump to start of line |
| `Ctrl+E` | Jump to end of line |
| `Ctrl+K` | Delete from cursor to end of line |
| `Ctrl+W` | Delete word before cursor |
| `Backspace` | Delete character before cursor |

### History
| Key | Action |
|-----|--------|
| `↑` | Previous command in history |
| `↓` | Next command in history (or back to live input) |

### Terminal Control
| Key | Action |
|-----|--------|
| `Tab` | Autocomplete command or path |
| `Tab` (ambiguous) | Show list of all completions |
| `Ctrl+C` | Cancel current input |
| `Ctrl+L` | Clear screen |
| `Enter` | Execute command |

---

## Command Chaining & Pipes

Commands can be chained or piped on a single line:

| Syntax | Behavior |
|--------|----------|
| `cmd1 ; cmd2` | Run `cmd1`, then always run `cmd2` |
| `cmd1 && cmd2` | Run `cmd1`, only run `cmd2` if `cmd1` succeeded |
| `cmd1 \| cmd2` | Pipe stdout of `cmd1` as stdin to `cmd2` |

**Examples:**
```
cd /home/user/projects && ls
echo "hello" ; echo "world"
cat /var/log/system.log | grep auth
ls | grep .sh
history | grep ssh
cat notes.md | grep -i todo
```

Pipe chains can be combined with `&&` and `;` for complex one-liners.

---

## Tab Autocomplete

- **At the command position** — completes command names (`hel` → `help`)
- **After a command** — completes file and directory paths
- **Partial match** — extends to the longest common prefix
- **Ambiguous match** — prints all candidates and keeps current input
- Directories are completed with a trailing `/` so you can keep chaining

---

## Boot Sequence

When the page loads with **boot animation** enabled (default), the terminal streams a BIOS / kernel / userland boot log over ~2.8 seconds before showing the welcome banner. The input prompt is hidden until the animation finishes.

The boot log uses **real, non-sensitive host info** pulled from the browser, falling back gracefully when a value isn't exposed:

| Line | Source |
|------|--------|
| `CPU ............ ok  (N logical cores)` | `navigator.hardwareConcurrency` |
| `RAM ............ ok  (~N GiB device memory)` | `navigator.deviceMemory` (Chromium-only) |
| `Display ........ ok  (WxH @ DPRx)` | `window.screen` + `devicePixelRatio` |
| `Network ........ ok  (4G, X Mbps, Yms rtt)` | `navigator.connection` (Chromium-only) |
| `Locale ......... ok  (lang, IANA-tz)` | `navigator.language`, `Intl.DateTimeFormat().resolvedOptions().timeZone` |
| `loading kernel for <OS> via <browser> ...` | derived from `navigator.platform` + UA |

Disable in **Tweaks → Effects → boot animation on load**.

---

## Editor

A modal Nano-style text editor lives at `nano <file>` (and its `edit <file>` alias). It takes over the terminal until you exit, writes back into the in-memory virtual filesystem on save, and works in both local and SSH-remote contexts.

### Opening files

```
nano /home/user/documents/notes.md     # edit existing file
nano hello.txt                         # create new file at cwd (only persisted on save)
edit src/main.c                        # alias works the same way
```

The editor refuses to open:

- **Directories** — `Is a directory`
- **Executable nodes** (the seed FS marks `*.sh` and `bin/diag` as `type='exec'`) — `binary file (use cat or exec)`

> **Why can't I edit `hello.sh` or `backup.sh`?** Those are seeded as `type='exec'` nodes whose only output is what `exec` prints. Any *new* `.sh` file you create with `touch` or `nano` is a regular `type='file'` node and is freely editable. `.c` and other source files in the seed FS are also editable. Unifying exec + file (so seeded scripts become editable scripts) is a Tier 4 item.

### Interface

- **Top bar** (inverse): `nano v1.0  File: /full/path/name  Modified` plus a line count on the right.
- **Body**: 4-character line-number gutter, the active line highlighted, a block cursor that shows the character under it inverted.
- **Status line**: `Ln L, Col C` by default. After saving you briefly see `[ Wrote N lines ]`. On modified-exit it turns into a save-prompt rendered in the theme's err color.
- **Help bar** (inverse): the most useful shortcuts always visible at the bottom.

### Key bindings

| Key | Action |
|-----|--------|
| Arrow keys | Move the cursor |
| `Home` / `End` | Jump to line start / end |
| `Ctrl+A` / `Ctrl+E` | Jump to line start / end (chord style) |
| `PageUp` / `PageDown` | Jump 10 lines |
| `Enter` | Insert newline at cursor |
| `Backspace` / `Delete` | Remove character (joins lines at boundaries) |
| `Tab` | Insert 4 spaces |
| `Ctrl+K` | Cut current line (to internal clipboard) |
| `Ctrl+U` | Paste the cut line back |
| `Ctrl+V` | Paste from system clipboard (Chromium asks for permission once) |
| `Ctrl+O` / `Ctrl+S` | Save buffer to file |
| `Ctrl+X` | Exit. If modified, prompts to save: **Y** save+exit, **N** discard+exit, **C** / `Esc` cancel and keep editing |

### Behavior notes

- Edits in a remote session (after `ssh <ip>`) write back to that remote's root, not your local FS.
- Closing the browser tab or hard-reloading **loses unsaved changes** — there's no autosave.
- The internal cut/paste clipboard (`Ctrl+K` / `Ctrl+U`) is one line at a time, like real nano.
- No search/replace, no go-to-line, no syntax highlighting (yet) — those are easy follow-ons.

---

## Virtual Filesystem

The shell has a fully navigable, mutable in-memory filesystem. All changes are session-only and reset on page reload. Use `vfs` to visualize the full tree at any time.

```
/
├── home/
│   └── user/
│       ├── .shellrc
│       ├── documents/
│       │   ├── readme.txt
│       │   ├── notes.md
│       │   └── budget.csv
│       └── projects/
│           ├── hello.sh       ← executable
│           ├── backup.sh      ← executable
│           └── src/
│               ├── main.c
│               └── util.c
├── var/
│   └── log/
│       └── system.log
├── etc/
│   ├── hosts
│   └── motd
└── bin/
    └── diag               ← executable
```

> Use `touch`, `mkdir`, `rm`, `mv`, `cp` to modify this tree during your session. Use `vfs` to see changes reflected live.

### File type colors
Each theme colors file types distinctly in `ls` and `vfs` output:

| Type | Description |
|------|-------------|
| **Directory** | Highlighted (blue/cyan depending on theme) |
| **Executable / script** | Accent color (green/yellow) |
| **.sh / .py / .c / .js** | Script color |
| **.log / .err / .out** | Dimmed |
| **.csv / .dat / .json / .db** | Data color |
| **.txt / .md / .rst** | Default foreground |

---

## SSH — Remote Hosts

Use `ssh <ip>` to connect to a simulated remote machine. The connection plays a **~3-second cinematic** — TCP handshake, protocol/kex/cipher banner, a stable RSA-style SHA256 fingerprint per host, key auth, login banner — before the prompt switches to the remote user and host. Use `disconnect` to return (instant).

The input prompt is hidden while the cinematic plays. Unknown IPs play a shorter ~1.8s failed-connection variant ending in `No route to host`.

| IP | Host | User | Contents |
|----|------|------|----------|
| `10.0.4.12` | vault | admin | `/root/secrets.txt`, `/root/ledger.dat` |
| `10.0.4.20` | archive | guest | `/pub/manifest.txt` |
| `192.168.1.5` | printer | svc | `/queue/job-0041.ps` |

> All three hosts are also listed in `/etc/hosts`. Unknown IPs fail with a realistic connection error.

You can `nano` files on a remote — edits write back to the remote root for as long as that SSH session is active.

---

## Tweaks Panel

Open via the gear button in the top-right corner. All settings are persisted across reloads in `localStorage` under `shell.tweaks.v1`. A **Reset to defaults** button at the bottom of the panel clears the stored value.

### Theme
| Theme | Style |
|-------|-------|
| **phosphor** | Classic green-on-dark CRT |
| **hacker** | Pure black with matrix greens, cyan dirs, orange data, hot accents |
| **monokai** | VS Code Monokai dark — yellow, green, cyan, orange |
| **claude** | Deep navy/indigo with warm sand text, copper user, violet path |
| **cyberpunk** | Near-black with hot pink, electric cyan, neon violet, yellow exec |
| **AV Cyberpunk** | Portfolio palette — deep blue-black, signature red user/script/error, electric cyan host/dir/path |

### Font
| Font | Style |
|------|-------|
| JetBrains Mono | Clean modern monospace |
| IBM Plex Mono | Sharp technical monospace |
| Fira Code | Ligature-friendly monospace |
| Courier Prime | Classic typewriter feel |
| VT323 | Retro pixel terminal |
| Rajdhani | Condensed sans-serif |

### Other Controls
| Control | Description |
|---------|-------------|
| Font size | 11px – 26px slider |
| Layout → Borderless | Removes window chrome for a raw fullscreen terminal look |
| Layout → vfs "← you are here" | Toggle the current directory marker in `vfs` output |
| Effects → Scanlines | Adds CRT scanline overlay |
| Effects → Text glow | Adds phosphor glow to terminal text |
| Effects → Boot animation on load | Toggle the BIOS / kernel / userland boot sequence on startup |
| Welcome message → show on start | Toggle the welcome banner |
| Welcome message → text | Custom banner text shown above the first prompt |
| Key sounds → Enabled | Toggle all key sounds on/off |
| Key sounds → Volume | Controls space / backspace / enter sound volume |
| Keypress volume | Independent volume for regular key presses (1.5× amplified via Web Audio) |
| Prompt | Customize your prompt label. Supports `user`, `user@host`, or any freeform string |
| Reset to defaults | Clears `localStorage` and restores every tweak to its built-in default |

---

## Key Sounds

Four distinct mechanical sounds mapped to key types:

| Key | Sound |
|-----|-------|
| Regular keys (letters, numbers, symbols) | `cream-press` — boosted 1.5× via Web Audio GainNode |
| Space | `cream-space-press` |
| Backspace / Delete | `cream-backspace-press` |
| Enter | `cream-enter-press` |

Space, backspace, and enter volumes are controlled together by the main volume slider. Keypress volume is independently adjustable. All sounds can be muted globally.

---

## Cursor Behavior

- Block cursor tracks exact caret position mid-line
- Blinks only when the browser window is focused
- Solid block when the window is in the background
- Selection highlight shown when text is highlighted in input

---

## Output

- All terminal output is **selectable** — drag to select, copy with `Ctrl+C` / `Cmd+C`
- `ls` output uses **fixed-width monospace columns** padded to the longest filename
- `vfs` output uses **tree connectors** (`├──`, `└──`, `│`) with per-type coloring
- New output **smooth-scrolls** to the bottom

---

## Architecture

```
package.json          npm scripts (dev, build, preview) + React + Vite deps
vite.config.js        Vite config (port, base, build target)
index.html            Vite entry — loads Google Fonts + /src/main.jsx
src/
  main.jsx            React root: createRoot(...).render(<App />)
  App.jsx             Top-level: tweaks state, theme wiring, stage/window
                      /chrome layout, tweaks toggle button
  defaults.jsx        TWEAK_DEFAULTS + localStorage load/save/clear helpers
                      (the single source of truth for tweak shape)
  themes.jsx          THEMES palettes (incl. AV Cyberpunk) + FONTS stacks
  tweaks.jsx          TweaksPanel React component (UI only — pulls data
                      from themes.jsx)
  styles.css          All app CSS (stage, terminal, tweaks panel, editor)
  filesystem.jsx      Virtual FS tree + REMOTES + path utilities
                      (cloneFS / parentOf for immutable FS mutation)
  parser.jsx          Tokenizer: quoted args, ; && and | chaining
  autocomplete.jsx    Tab completion for commands and paths
  sounds.jsx          Web Audio press engine + HTMLAudio pool for other keys
  boot.jsx            getHostInfo() + buildBootSteps() — assembles the
                      animated boot sequence from real navigator data
  commands.jsx        Command registry: each command is a defineCommand({
                      name, synopsis, summary, man, run, hideFromHelp? })
                      entry. COMMANDS / MAN_PAGES / help text are all
                      derived from that single array.
  terminal.jsx        Terminal React component: scrollback, cursor, key
                      handling, animation/live/editor mode primitives,
                      FS save logic
  editor.jsx          NanoEditor — modal text editor: buffer, cursor,
                      keymap, cut/paste/clipboard, modified-exit prompt
public/
  assets/
    key-press.mp3
    key-backspace.mp3
    key-enter.mp3
    key-space.mp3
```

### How to add a command

A new command is a single entry in the `cmdDefs` array in `src/commands.jsx`:

```js
defineCommand({
  name: 'whoami',
  synopsis: 'whoami',
  summary: 'current user',
  man: ['NAME', '    whoami — print current user'],
  run: (args, { state }) => ({ out: [state.user] }),
}),
```

That's the only edit. `help`, `man whoami`, and the COMMANDS lookup are all derived from this entry. Set `hideFromHelp: true` to keep the command runnable but omit it from `help` output (used today for `ssh`, which is documented under "ssh hosts:" instead).

### How to add a tweak

1. Add a default in `src/defaults.jsx → TWEAK_DEFAULTS`.
2. Add a control in `src/tweaks.jsx → TweaksPanel` that reads `tweaks.<key>` and calls `setTweaks({ <key>: value })`.
3. Wire its effect where it acts (`App.jsx` for theme/font/sound, `terminal.jsx` for runtime behavior like `bootAnimation`).

### How to add a theme

Add an entry to `THEMES` in `src/themes.jsx`. Each theme must define every color key (`bg`, `chrome`, `chromeBorder`, `fg`, `dim`, `prompt`, `user`, `host`, `path`, `exec`, `err`, `dir`, `file`, `script`, `log`, `data`). The Tweaks panel picks it up automatically.

### Three terminal modes

`terminal.jsx` manages three mutually-exclusive states above the normal command-prompt mode:

1. **Animating** — non-blocking timed output via `runAnimation(steps)`. Used by the boot sequence and the SSH cinematic. While `animating > 0` the prompt is hidden and key input is swallowed.
2. **Live** — a command takes over the scroll region with a re-rendered "frame" on an interval, via `startLive({ render, intervalMs })`. Used by `top`. Exits on `q` / `Esc` / `Ctrl+C`.
3. **Editor** — `NanoEditor` replaces the terminal entirely, with its own hidden input + key handler. Used by `nano` / `edit`. Save calls back into terminal state via `saveEditorFile(segs, fromRemote, content)`.

Commands signal these modes by returning a shape from `run()`: `{ animate: [...] }`, `{ live: { ... } }`, or `{ editor: { ... } }`.

---

## Roadmap

### Tier 3 — Immersion ✅ done

- ✅ SSH cinematic: animated connection sequence + RSA fingerprint banner
- ✅ `top` — live fake process monitor with updating CPU/RAM stats
- ✅ Boot sequence mode on first load (with real host info: CPU cores, RAM, display, network, locale, OS, browser)
- ✅ `nano` / `edit` — modal in-terminal text editor with cut/paste, clipboard, modified-exit prompt; writes back to the virtual FS

### Tier 4 — Architecture

- Environment variables (`export`, `$VAR` expansion in commands)
- True shell script execution (parse + run `.sh` files line by line) — also unifies the `file` / `exec` node types so seeded `*.sh` become editable scripts
- Redirect operators (`>`, `>>`, `<`)
- Background jobs (`&`, `jobs`, `fg`, `bg`)
- Editor follow-ons: search/replace (`^W`/`^\\`), go-to-line (`^_`), syntax highlighting
