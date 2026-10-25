// Requests from the website, the app and itch.io: copy them from the Firebase Realtime Database (webasks) to
// <out>/inbox.json, which the GitHub workflow saves to the "asks" branch. The requests are locked with the owner's
// public key, so they stay unreadable here. Claude opens them with the owner's private key (tools/askopen.js) and adds
// them to Requests in the Claude version. No keys or secrets are used or needed here.
// Usage: node tools/askrelay.js <out folder>
const fs = require('fs');
const DB = 'https://blockyard-arcade-default-rtdb.firebaseio.com';
const out = process.argv[2] || 'asks-out';
(async () => {
  const url = DB + '/webasks.json?orderBy=' + encodeURIComponent('"t"') + '&limitToLast=300';
  let r;
  try { r = await fetch(url); } catch (e) { console.log('::warning::Could not reach the database: ' + e.message); return; }
  if (!r.ok) {
    // not set up yet (rules not published or no database): say so, but do not fail the run every two hours
    console.log('::warning::The database said ' + r.status + ': ' + (await r.text()).slice(0, 200) + ' (publish the Realtime Database rules from Claude)');
    return;
  }
  const all = (await r.json()) || {};
  const items = Object.keys(all).map(id => {
    const x = all[id] || {};
    return { id, u: String(x.u || '').slice(0, 64), c: x.c, t: +x.t || 0 };
  }).filter(x => /^[-A-Za-z0-9_]{1,30}$/.test(x.id) && /^[A-Za-z0-9]{1,64}$/.test(x.u) && typeof x.c === 'string' && x.c.startsWith('v1.') && x.c.length <= 2000)
    .sort((a, b) => a.t - b.t || (a.id < b.id ? -1 : 1));
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(out + '/inbox.json', JSON.stringify({ items }, null, 1) + '\n');
  fs.writeFileSync(out + '/README.md', '# Requests from the website, the app and itch.io\n\ninbox.json holds the newest 300 requests players sent with the Ask button outside Claude. Each one is locked with the owner\'s public key, so only the owner (through Claude) can read it. GitHub refreshes this branch every two hours (.github/workflows/web-asks.yml).\n');
  console.log(items.length + ' requests in the inbox');
})().catch(e => { console.log('::warning::' + e.message); });
