// Parse a command line into a sequence of { cmd, args, sep }.
//
// `sep` is the operator that follows this segment (before the next one):
//   '|'   pipe stdout of this segment into the next
//   ';'   run the next segment after this one regardless
//   '&&'  run the next segment only if this segment succeeded (!err)
//   null  end of line (nothing follows)
//
// Supports double-quoted args and single-quoted args.

function tokenize(input) {
  const toks = [];
  let i = 0, cur = '', inQ = false, qChar = '';
  while (i < input.length) {
    const c = input[i];
    if (inQ) {
      if (c === qChar) { inQ = false; }
      else cur += c;
      i++; continue;
    }
    if (c === '"' || c === "'") { inQ = true; qChar = c; i++; continue; }
    if (c === ' ' || c === '\t') {
      if (cur) { toks.push(cur); cur = ''; }
      i++; continue;
    }
    if (c === ';') {
      if (cur) { toks.push(cur); cur = ''; }
      toks.push({ sep: ';' }); i++; continue;
    }
    if (c === '&' && input[i+1] === '&') {
      if (cur) { toks.push(cur); cur = ''; }
      toks.push({ sep: '&&' }); i += 2; continue;
    }
    if (c === '|' && input[i+1] !== '|') {
      if (cur) { toks.push(cur); cur = ''; }
      toks.push({ sep: '|' }); i++; continue;
    }
    cur += c; i++;
  }
  if (cur) toks.push(cur);
  return toks;
}

function parseLine(input) {
  const toks = tokenize(input);
  const segments = [];
  let cur = [];
  for (const t of toks) {
    if (typeof t === 'object' && t.sep) {
      if (cur.length) segments.push({ parts: cur, sep: t.sep });
      cur = [];
    } else {
      cur.push(t);
    }
  }
  if (cur.length) segments.push({ parts: cur, sep: null });
  return segments.map(s => ({
    cmd: s.parts[0] || '',
    args: s.parts.slice(1),
    sep: s.sep
  }));
}

export { parseLine, tokenize };

