// Tab completion. Given the current input and cursor position, return either
// a single completion to apply, or a list of candidates to show.

import { COMMANDS } from './commands.jsx';
import { resolvePath, nodeAt } from './filesystem.jsx';

function completeInput(input, state) {
  // Find the token under/at the end of the input
  const lastBreak = Math.max(
    input.lastIndexOf(' '),
    input.lastIndexOf(';'),
    input.lastIndexOf('&')
  );
  const prefix = input.slice(0, lastBreak + 1);
  const token = input.slice(lastBreak + 1);

  // Is this the command position? (nothing before, or preceded by ; or &&)
  const trimmedPrefix = prefix.trimEnd();
  const isCmdPos = prefix.trim() === '' ||
                   trimmedPrefix.endsWith(';') ||
                   trimmedPrefix.endsWith('&&');

  if (isCmdPos) {
    const names = Object.keys(COMMANDS);
    const matches = names.filter(n => n.startsWith(token));
    return formatResult(prefix, token, matches, '');
  }

  // Path completion
  const root = state.remote ? state.remote.root : state.root;
  const cwd = state.remote ? state.remote.cwd : state.cwd;
  // split token into dirPart + basePart
  let dirPart, basePart;
  const lastSlash = token.lastIndexOf('/');
  if (lastSlash >= 0) {
    dirPart = token.slice(0, lastSlash + 1);
    basePart = token.slice(lastSlash + 1);
  } else {
    dirPart = '';
    basePart = token;
  }
  const searchPath = dirPart === '' ? '.' : dirPart;
  const segs = resolvePath(searchPath, cwd);
  const node = nodeAt(root, segs);
  if (!node || node.type !== 'dir') return null;
  const names = Object.values(node.children)
    .map(n => n.name + (n.type === 'dir' ? '/' : ''))
    .filter(n => n.startsWith(basePart));
  return formatResult(prefix, token, names, dirPart);
}

function commonPrefix(strs) {
  if (strs.length === 0) return '';
  let p = strs[0];
  for (const s of strs) {
    while (!s.startsWith(p)) p = p.slice(0, -1);
    if (!p) return '';
  }
  return p;
}

function formatResult(prefix, token, matches, dirPart) {
  if (matches.length === 0) return null;
  if (matches.length === 1) {
    const full = dirPart + matches[0];
    // If match is a file (no trailing slash), add a space
    const tail = matches[0].endsWith('/') ? '' : ' ';
    return { type: 'apply', newInput: prefix + full + tail };
  }
  const cp = commonPrefix(matches);
  if (cp.length > token.length - (dirPart ? dirPart.length : 0)) {
    // Can extend — but keep matches visible too? For now just extend.
    return { type: 'apply', newInput: prefix + dirPart + cp, matches };
  }
  return { type: 'list', matches: matches.map(m => dirPart + m) };
}

export { completeInput };
