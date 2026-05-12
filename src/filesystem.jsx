// Virtual filesystem — tree of nodes
// node = { type: 'dir'|'file'|'exec', name, children?, content?, output? }

const makeFS = () => ({
  type: 'dir', name: '', children: {
    'home': { type: 'dir', name: 'home', children: {
      'user': { type: 'dir', name: 'user', children: {
        'documents': { type: 'dir', name: 'documents', children: {
          'readme.txt': { type: 'file', name: 'readme.txt', content:
`Welcome to the shell.

This is a self-contained virtual terminal. Every file here lives
in memory — nothing persists beyond this session.

Try:  help
      ls /
      cd /home/user/projects
      cat notes.md
      ssh 10.0.4.12
`},
          'notes.md': { type: 'file', name: 'notes.md', content:
`# Notes

- Tab completes paths and commands
- Arrow up/down walks history
- Chain commands with && or ;
- cd - returns to previous directory
- cat accepts relative or absolute paths
`},
          'budget.csv': { type: 'file', name: 'budget.csv', content:
`month,income,expenses,net
jan,4200,3180,1020
feb,4200,2940,1260
mar,4350,3510,840
apr,4200,3220,980
`}
        }},
        'projects': { type: 'dir', name: 'projects', children: {
          'hello.sh': { type: 'exec', name: 'hello.sh', output:
`[hello.sh] booting...
[hello.sh] hello, world.
[hello.sh] exit 0`},
          'backup.sh': { type: 'exec', name: 'backup.sh', output:
`[backup] scanning /home/user ...
[backup] archived 247 files (18.4 MB)
[backup] wrote /var/backups/snap-2026-04-18.tar.gz
[backup] done.`},
          'src': { type: 'dir', name: 'src', children: {
            'main.c': { type: 'file', name: 'main.c', content:
`#include <stdio.h>

int main(void) {
    puts("compiled output");
    return 0;
}
`},
            'util.c': { type: 'file', name: 'util.c', content:
`/* small utility routines */

int add(int a, int b) { return a + b; }
int mul(int a, int b) { return a * b; }
`}
          }}
        }},
        '.shellrc': { type: 'file', name: '.shellrc', content:
`# shell startup
export PS1="\\u@\\h:\\w$ "
alias ll="ls -la"
`}
      }}
    }},
    'var': { type: 'dir', name: 'var', children: {
      'log': { type: 'dir', name: 'log', children: {
        'system.log': { type: 'file', name: 'system.log', content:
`2026-04-18 08:12:04  boot  kernel loaded
2026-04-18 08:12:05  boot  mounting /
2026-04-18 08:12:06  net   eth0 up
2026-04-18 08:12:08  auth  user login: user
2026-04-18 09:44:21  net   outbound ssh -> 10.0.4.12
`}
      }}
    }},
    'etc': { type: 'dir', name: 'etc', children: {
      'hosts': { type: 'file', name: 'hosts', content:
`127.0.0.1    localhost
10.0.4.12    vault
10.0.4.20    archive
192.168.1.5  printer
`},
      'motd': { type: 'file', name: 'motd', content:
`--------------------------------------------------
  shell v0.9.2   —   type 'help' to get started
--------------------------------------------------
`}
    }},
    'bin': { type: 'dir', name: 'bin', children: {
      'diag': { type: 'exec', name: 'diag', output:
`[diag] cpu ............ ok
[diag] memory ......... ok (2.1G / 8.0G used)
[diag] disk ........... ok (34% full)
[diag] network ........ ok
[diag] all systems nominal.`}
    }}
  }
});

// Remote hosts for ssh
const REMOTES = {
  '10.0.4.12': { host: 'vault', user: 'admin', fs: () => ({
    type: 'dir', name: '', children: {
      'root': { type: 'dir', name: 'root', children: {
        'secrets.txt': { type: 'file', name: 'secrets.txt', content:
`access_key: XK-2026-REDACTED
region:     us-central
rotated:    2026-03-01
`},
        'ledger.dat': { type: 'file', name: 'ledger.dat', content:
`[binary ledger — 14 entries]
0x00  OPEN   2026-01-04  +1,200.00
0x01  TX     2026-01-11    -340.00
0x02  TX     2026-01-22    -128.50
...
`}
      }}
    }
  })},
  '10.0.4.20': { host: 'archive', user: 'guest', fs: () => ({
    type: 'dir', name: '', children: {
      'pub': { type: 'dir', name: 'pub', children: {
        'manifest.txt': { type: 'file', name: 'manifest.txt', content:
`archive-node: 10.0.4.20
contents:     public mirror
updated:      2026-04-17
`}
      }}
    }
  })},
  '192.168.1.5': { host: 'printer', user: 'svc', fs: () => ({
    type: 'dir', name: '', children: {
      'queue': { type: 'dir', name: 'queue', children: {
        'job-0041.ps': { type: 'file', name: 'job-0041.ps', content: '[postscript job — 3 pages]\n' }
      }}
    }
  })}
};

// ---------- path utilities ----------

function splitPath(p) {
  return p.split('/').filter(Boolean);
}

// Resolve a path against cwd into an absolute normalized segment array.
// cwd is an array of segments.
function resolvePath(input, cwd, prevCwd) {
  if (input === '-') return prevCwd ? [...prevCwd] : [...cwd];
  if (input === '~' || input.startsWith('~/')) {
    const home = ['home', 'user'];
    const rest = input === '~' ? '' : input.slice(2);
    return resolvePath('/' + home.join('/') + (rest ? '/' + rest : ''), cwd);
  }
  let segs;
  if (input.startsWith('/')) {
    segs = splitPath(input);
  } else {
    segs = [...cwd, ...splitPath(input)];
  }
  const out = [];
  for (const s of segs) {
    if (s === '.' || s === '') continue;
    if (s === '..') { out.pop(); continue; }
    out.push(s);
  }
  return out;
}

function nodeAt(root, segs) {
  let cur = root;
  for (const s of segs) {
    if (cur.type !== 'dir') return null;
    if (!cur.children || !cur.children[s]) return null;
    cur = cur.children[s];
  }
  return cur;
}

// Deep-clone the FS tree (so React state updates are immutable)
function cloneFS(node) {
  if (!node) return node;
  if (node.type !== 'dir') return { ...node };
  const out = { ...node, children: {} };
  for (const [k, v] of Object.entries(node.children || {})) {
    out.children[k] = cloneFS(v);
  }
  return out;
}

// Walk segs in a CLONED tree and return the leaf parent + last segment.
// Returns { parent, name } or null if any intermediate is missing/not-a-dir.
function parentOf(root, segs) {
  if (segs.length === 0) return null;
  let cur = root;
  for (let i = 0; i < segs.length - 1; i++) {
    const s = segs[i];
    if (cur.type !== 'dir' || !cur.children || !cur.children[s]) return null;
    cur = cur.children[s];
  }
  if (cur.type !== 'dir') return null;
  return { parent: cur, name: segs[segs.length - 1] };
}

function displayPath(segs) {
  return '/' + segs.join('/');
}

export {
  makeFS, REMOTES, splitPath, resolvePath, nodeAt, displayPath,
  cloneFS, parentOf,
};
