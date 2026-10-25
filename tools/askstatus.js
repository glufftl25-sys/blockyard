// The owner's answers to requests from the website, the app and itch.io, for the players there: reads the owner's
// askdone document (from the Claude page) and writes <out>/status.json = {s:{<request id>:'done'|'no'}, at}.
// The "askstatus" branch holds it, and the Ask screen outside Claude reads it to show Done or Not this time.
// Usage: node tools/askstatus.js <askdone doc json> <out folder>
const fs = require('fs');
const [inF, out] = process.argv.slice(2);
const d = JSON.parse(fs.readFileSync(inF, 'utf8'));
const list = (d.data || d).list || {};
const s = {};
Object.keys(list).forEach(k => {
  const m = /^web-[A-Za-z0-9]+~([-A-Za-z0-9_]{1,30})$/.exec(k), e = list[k];
  if (m && e && (e.s === 'done' || e.s === 'no')) s[m[1]] = e.s;
});
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(out + '/status.json', JSON.stringify({ s, at: Date.now() }) + '\n');
console.log(Object.keys(s).length + ' answers');
