/* Duplicate name check for game.html.
   The game's main script runs inside one function, so two top-level `var X` / `function X` with the same name quietly
   overwrite each other (that broke Balloon Battle's GR and the avatar accessories' ACC). This reads the main <script>
   (the one with "var GAMES={}"), takes every line that starts at column 0 with `var ` or `function `, splits the var
   declarators at bracket depth 0 (skipping strings, template strings, comments and regex literals), and lists every
   name declared more than once.
   Usage: node tools/dupnames.js [game.html]   (exits 1 if there are duplicates)
   From code: require('./dupnames').findDups(html) -> [{name, lines:[...]}] */
const fs = require('fs');
const path = require('path');

function mainScript(html) {
  const re = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    if (m[1].includes('var GAMES={}')) {
      const startLine = html.slice(0, m.index + m[0].indexOf('>') + 1).split('\n').length; // line of the <script> tag
      return { code: m[1], startLine };
    }
  }
  return null;
}

/* the names one `var ...;` statement declares, starting at index i of src (just after "var ") */
function varNames(src, i) {
  const names = [];
  let depth = 0, expectName = true, prev = '=';
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { const e = src.indexOf('\n', i); i = e < 0 ? n : e; continue; }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
    if (c === '"' || c === "'" || c === '`') {
      i++;
      while (i < n && src[i] !== c) { if (src[i] === '\\') i++; i++; }
      i++; prev = 'a'; continue;
    }
    if (c === '/' && /[=(,:;!&|?{}[+\-*%<>~^]/.test(prev)) { // a regex literal
      i++;
      let cls = false;
      while (i < n && (cls || src[i] !== '/')) { if (src[i] === '\\') i++; else if (src[i] === '[') cls = true; else if (src[i] === ']') cls = false; i++; }
      i++; while (/[a-z]/.test(src[i] || '')) i++;
      prev = 'a'; continue;
    }
    if (/\s/.test(c)) { i++; continue; }
    if (expectName && depth === 0) {
      const m = /^[A-Za-z_$][\w$]*/.exec(src.slice(i, i + 80));
      if (m) { names.push(m[0]); i += m[0].length; expectName = false; prev = 'a'; continue; }
    }
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if (c === ',' && depth === 0) expectName = true;
    else if (c === ';' && depth === 0) break;
    else if (c === '\n' && depth === 0 && false) break;
    prev = c; i++;
  }
  return names;
}

function findDups(html) {
  const s = mainScript(html);
  if (!s) throw new Error('could not find the main <script> (the one with var GAMES={})');
  const lines = s.code.split('\n');
  const offs = []; let o = 0;
  for (const l of lines) { offs.push(o); o += l.length + 1; }
  const seen = new Map();
  const add = (name, ln) => { if (!seen.has(name)) seen.set(name, []); seen.get(name).push(ln); };
  lines.forEach((l, k) => {
    const ln = s.startLine + k; // line number in game.html
    let m;
    if ((m = /^function\s*\*?\s*([A-Za-z_$][\w$]*)/.exec(l))) add(m[1], ln);
    else if (/^var\s/.test(l)) varNames(s.code, offs[k] + 4).forEach(nm => add(nm, ln));
  });
  return [...seen].filter(([, ls]) => ls.length > 1).map(([name, ls]) => ({ name, lines: ls }));
}

module.exports = { findDups };

if (require.main === module) {
  const f = path.resolve(process.argv[2] || path.join(__dirname, '..', 'game.html'));
  const d = findDups(fs.readFileSync(f, 'utf8'));
  if (!d.length) { console.log('No duplicate top-level names in ' + path.basename(f) + '.'); process.exit(0); }
  console.log(d.length + ' duplicate top-level name' + (d.length === 1 ? '' : 's') + ' in ' + path.basename(f) + ':');
  d.forEach(x => console.log('  ' + x.name + ': lines ' + x.lines.join(', ')));
  process.exit(1);
}
