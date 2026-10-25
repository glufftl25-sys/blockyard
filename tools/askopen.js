// Open the locked requests in inbox.json (from the "asks" branch) with the owner's private key, and turn them into
// Requests documents for the Claude version: asks/web-<Firebase id> = {name, from, at, web:1, list:{<id>:{t, at}}}.
// The private key lives only in the owner's private data on the Claude page (data/users/<owner>/askkey). Pass it in a
// temporary file and delete the file afterwards; never save it anywhere else.
// Usage: node tools/askopen.js <inbox.json> <askkey.json> <out.json>
const fs = require('fs');
const { subtle } = require('crypto').webcrypto;
const [inboxF, keyF, outF] = process.argv.slice(2);
const un = s => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const FROM = ['the website', 'the app', 'itch.io'];
(async () => {
  const inbox = JSON.parse(fs.readFileSync(inboxF, 'utf8'));
  const kd = JSON.parse(fs.readFileSync(keyF, 'utf8'));
  const jwk = kd.jwk || (kd.data && kd.data.jwk) || kd;
  const priv = await subtle.importKey('jwk', { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, d: jwk.d }, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveKey']);
  const docs = {}; let bad = 0;
  for (const it of inbox.items || []) {
    try {
      const p = it.c.split('.');
      if (p.length !== 4 || p[0] !== 'v1') throw 0;
      const eph = await subtle.importKey('raw', un(p[1]), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
      const k = await subtle.deriveKey({ name: 'ECDH', public: eph }, priv, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
      const m = JSON.parse(Buffer.from(await subtle.decrypt({ name: 'AES-GCM', iv: un(p[2]) }, k, un(p[3]))).toString('utf8'));
      const name = /^[A-Za-z0-9_]{3,16}$/.test(m.n) ? m.n : '';
      const t = clean(m.t, 200);
      if (!t) throw 0;
      const at = Math.min(+it.t || Date.now(), Date.now());
      const id = 'web-' + it.u;
      const d = docs[id] || (docs[id] = { name: '', from: '', at: 0, web: 1, list: {} });
      d.list[it.id] = { t, at };
      if (at >= d.at) { d.at = at; d.name = name || d.name; d.from = FROM.includes(m.f) ? m.f : 'the website'; }
    } catch (e) { bad++; }
  }
  // at most 12 requests per player (the newest), like in the Claude version
  for (const d of Object.values(docs)) {
    const ks = Object.keys(d.list).sort((a, b) => d.list[b].at - d.list[a].at);
    ks.slice(12).forEach(k => delete d.list[k]);
  }
  fs.writeFileSync(outF, JSON.stringify({ docs, opened: (inbox.items || []).length - bad, bad }, null, 1));
  console.log(Object.keys(docs).length + ' players, ' + ((inbox.items || []).length - bad) + ' requests opened' + (bad ? ', ' + bad + ' could not be opened' : ''));
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
