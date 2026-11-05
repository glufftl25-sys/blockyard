/* Daily Blockyard playtest.
   Opens game.html in a headless browser at laptop and phone sizes. The test bots play every game for real (each game's
   pilot tries to win), then do the extra checks: the menus and the shop, the Blaster Duel menus, and the Blaster Duel
   special check. Then two copies of the game join one Blaster Duel match together, through a stand-in for the online
   database (tools/fbmock), to check that playing with a friend works. Last, two friends chat through a stand-in for
   Claude's database (window.claude): A sends B a message and a party message to B and C; they must read them, an
   outsider who copies a locked message must not, and the database must hold only locked copies. Then the website check:
   index.html at phone width loads with no errors, every picture loads, nothing scrolls sideways, every game card opens a
   game that exists, and game.html#play=snake starts Block Snake. Last, a quick look through the game code for a name
   declared twice at the top level (tools/dupnames.js), since one would quietly overwrite the other, and the local part
   of the release check (tools/checkrelease.js).
   Writes <out>/report.json, a small picture of every game's last frame, and a contact sheet per size
   (sheet-laptop.jpg, sheet-phone.jpg). GitHub runs this every day (.github/workflows/test-bots.yml) and the Bots page
   (bots.html) shows the report.
   Usage: node tools/playtest.js [path/to/game.html] [outDir]
   Optional: PLAYTEST_MS (ms per game on the laptop, default 4000; the phone gets 3/4 of it), PLAYTEST_MP=0 to skip the
   two-player check, PLAYTEST_ONLYMP=1 to do only the two-player, chat and website checks, PLAYTEST_SITE=0 to skip the website
   check, PLAYTEST_DEBUG=1 to print the chat screens when the chat check fails,
   PLAYTEST_PILOTS=1 to also run the slow pilot and quality check (tools/pilots.js; writes pilots.json). */
const path = require('path');
const fs = require('fs');
const http = require('http');
const { chromium, launchOpts } = require('./pw');
const game = path.resolve(process.argv[2] || path.join(__dirname, '..', 'game.html'));
const out = path.resolve(process.argv[3] || 'playtest-out');
const MS = Math.max(1000, Number(process.env.PLAYTEST_MS) || 4000);
fs.mkdirSync(out, { recursive: true });

const SIZES = [
  { tag: 'laptop', width: 1280, height: 720, touch: false, ms: MS },
  { tag: 'phone', width: 844, height: 390, touch: true, ms: Math.round(MS * 0.75) }
];
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* the game's folder over http, so two copies of the game can talk (the stand-in database needs a real page origin) */
function serve(dir) {
  const types = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.css': 'text/css', '.ico': 'image/x-icon' };
  const srv = http.createServer((req, res) => {
    const p = path.join(dir, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, ''));
    if (!p.startsWith(dir) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' });
    fs.createReadStream(p).pipe(res);
  });
  return new Promise(ok => srv.listen(0, '127.0.0.1', () => ok(srv)));
}

/* two players, one 1v1 Blaster Duel match */
async function twoPlayers(browser) {
  const r = { id: 'm.mp', t: 'Playing with a friend (Blaster Duel)', check: true, err: {}, ok: true, steps: 0, fail: '' };
  const srv = await serve(path.dirname(game));
  const url = 'http://127.0.0.1:' + srv.address().port + '/' + path.basename(game);
  const mock = path.join(__dirname, 'fbmock');
  const pages = [];
  const say = m => { r.err[m] = (r.err[m] || 0) + 1; };
  try {
    for (let i = 0; i < 2; i++) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
      await ctx.addInitScript(() => { try { sessionStorage.setItem('by.gate', 'skip'); } catch (e) {} });
      await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, rt => {
        const m = rt.request().url().match(/gstatic\.com\/firebasejs\/[0-9.]+\/(firebase-[a-z]+\.js)$/);
        if (m && fs.existsSync(path.join(mock, m[1]))) return rt.fulfill({ status: 200, headers: { 'content-type': 'application/javascript', 'access-control-allow-origin': '*' }, body: fs.readFileSync(path.join(mock, m[1]), 'utf8') });
        return rt.abort();
      });
      const pg = await ctx.newPage();
      pg.on('pageerror', e => say(String(e.message).slice(0, 110)));
      await pg.exposeFunction('__relay', m => { pages.filter(p => p !== pg && !p.isClosed()).forEach(p => p.evaluate(m => window.__chIn && window.__chIn(m), m).catch(() => {})); });
      await pg.goto(url, { waitUntil: 'load' });
      await pg.waitForFunction(() => !!(window.BY_TESTBOTS && window.BY_TESTBOTS.duel), null, { timeout: 15000 });
      pages.push(pg);
    }
    const [A, B] = pages;
    const st = p => p.evaluate(() => window.BY_TESTBOTS.duel('state'));
    const until = async (f, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await f()) return true; } catch (e) {} await sleep(400); } return false; };
    const steps = [
      ['the two players did not see each other in the lobby', async () => {
        await A.evaluate(() => window.BY_TESTBOTS.duel('open')); await B.evaluate(() => window.BY_TESTBOTS.duel('open'));
        return until(async () => { const a = await st(A), b = await st(B); return a.room && b.room && a.lobby >= 1 && b.lobby >= 1; }, 25000);
      }],
      ['they did not get into one match together', async () => {
        await A.evaluate(() => window.BY_TESTBOTS.duel('go')); await sleep(1800); await B.evaluate(() => window.BY_TESTBOTS.duel('go'));
        return until(async () => { const a = await st(A), b = await st(B); return a.ph === 'match' && b.ph === 'match' && a.mid && a.mid === b.mid && a.humans === 2 && b.humans === 2 && a.team !== b.team; }, 30000);
      }],
      ['the round did not start for both', async () => until(async () => { const a = await st(A), b = await st(B); return a.rs === 'fight' && b.rs === 'fight'; }, 15000)],
      ['nobody won a round (shots did not land)', async () => {
        await A.evaluate(() => window.BY_TESTBOTS.duel('fight')); await B.evaluate(() => window.BY_TESTBOTS.duel('fight'));
        return until(async () => { const a = await st(A); return a.sc[0] + a.sc[1] >= 1; }, 60000);
      }],
      ['the two players saw a different score', async () => until(async () => { const a = await st(A), b = await st(B); return a.sc.join('-') === b.sc.join('-') && a.sc[0] + a.sc[1] >= 1; }, 8000)]
    ];
    for (const s of steps) {
      r.steps++;
      let ok = false;
      try { ok = await s[1](); } catch (e) { r.fail = s[0] + ' (' + String(e.message).slice(0, 80) + ')'; break; }
      if (!ok) { r.fail = s[0]; break; }
    }
    for (const p of pages) await p.evaluate(() => window.BY_TESTBOTS.duel('lobby')).catch(() => {});
  } catch (e) {
    r.fail = 'it could not start: ' + String(e.message).slice(0, 80);
  }
  for (const p of pages) await p.context().close().catch(() => {});
  srv.close();
  r.ok = !r.fail && !Object.keys(r.err).length;
  return r;
}
/* the stand-in for Claude's database and user (window.claude.use('db') / use('user')), put into a page before the game
   starts. Every page keeps a copy of the database; a write changes this page's copy, then __dbw sends it to the test,
   which keeps the master copy and passes the write on to the other page. */
function fakeClaude(me) {
  const store = {}, subs = new Set();
  const clone = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
  const parent = p => p.split('/').slice(0, -1).join('/');
  const leaf = p => p.split('/').pop();
  let queued = false;
  const kick = () => { if (queued) return; queued = true; setTimeout(() => { queued = false; subs.forEach(s => s.fire()); }, 0); };
  window.__dbIn = ws => { ws.forEach(w => { if (w.data == null) delete store[w.path]; else store[w.path] = w.data; }); kick(); };
  const put = (path, data) => { if (data == null) delete store[path]; else store[path] = clone(data); kick(); return window.__dbw([{ path, data: data == null ? null : clone(data) }]); };
  const dsnap = path => ({ id: leaf(path), exists: path in store, ref: docRef(path), data: () => clone(store[path]) });
  function docRef(path) {
    return {
      id: leaf(path), path,
      get: () => Promise.resolve(dsnap(path)),
      set: (d, o) => put(path, o && o.merge ? Object.assign({}, store[path] || {}, d) : d),
      update: d => path in store ? put(path, Object.assign({}, store[path], d)) : Promise.reject({ code: 'not-found' }),
      delete: () => put(path, null),
      onSnapshot(cb) { let last; const s = { fire() { const j = JSON.stringify(store[path] === undefined ? null : store[path]); if (j !== last) { last = j; try { cb(dsnap(path)); } catch (e) { setTimeout(() => { throw e; }); } } } }; subs.add(s); kick(); return () => subs.delete(s); }
    };
  }
  function query(path, q) {
    const run = () => {
      let ids = Object.keys(store).filter(p => parent(p) === path);
      q.w.forEach(([f, op, v]) => { ids = ids.filter(p => { const x = store[p][f]; return op === '==' ? x === v : op === '!=' ? x !== v : op === '<' ? x < v : op === '<=' ? x <= v : op === '>' ? x > v : op === '>=' ? x >= v : op === 'in' ? v.includes(x) : op === 'array-contains' ? Array.isArray(x) && x.includes(v) : false; }); });
      q.o.forEach(([f, dir]) => ids.sort((a, b) => { const x = store[a][f], y = store[b][f]; return (x < y ? -1 : x > y ? 1 : 0) * (dir === 'desc' ? -1 : 1); }));
      if (q.l != null) ids = ids.slice(0, q.l);
      const docs = ids.map(dsnap);
      return { docs, size: docs.length, empty: !docs.length, forEach: f => docs.forEach(f) };
    };
    const more = c => query(path, Object.assign({ w: q.w, o: q.o, l: q.l }, c));
    return {
      path,
      doc: id => docRef(path + '/' + (id || Math.random().toString(36).slice(2, 12))),
      where: (f, op, v) => more({ w: q.w.concat([[f, op, v]]) }),
      orderBy: (f, dir) => more({ o: q.o.concat([[f, dir || 'asc']]) }),
      limit: n => more({ l: n }),
      get: () => Promise.resolve(run()),
      add(d) { const r = docRef(path + '/m' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)); return r.set(d).then(() => r); },
      onSnapshot(cb) { let last; const s = { fire() { const r = run(), j = JSON.stringify(r.docs.map(d => [d.id, store[path + '/' + d.id]])); if (j !== last) { last = j; try { cb(r); } catch (e) { setTimeout(() => { throw e; }); } } } }; subs.add(s); kick(); return () => subs.delete(s); }
    };
  }
  const db = { doc: docRef, collection: p => query(p, { w: [], o: [], l: null }) };
  const user = { id: () => Promise.resolve(me.uid), me: () => Promise.resolve({ email: me.uid + '@bots.test', name: me.name }), can: () => Promise.resolve(true), isOwner: () => Promise.resolve(false) };
  const ready = window.__dbAll().then(all => { Object.assign(store, all); });
  window.claude = { use: n => ready.then(() => n === 'db' ? db : n === 'user' ? user : null) };
}

/* friend chat, with four players: A and B chat 1:1; A makes a party with B and C and sends to it; D is an outsider (no
   friend of anyone) who copies A's locked message into a party D made with A and B, to see whether D can read it.
   B and C must read A's messages, D must only see the "cannot be read here" note, and the database must hold no plaintext. */
async function friendChat(browser) {
  const r = { id: 'm.chat', t: 'Friend and party chat (locked messages)', check: true, err: {}, ok: true, steps: 0, fail: '' };
  const srv = await serve(path.dirname(game));
  const url = 'http://127.0.0.1:' + srv.address().port + '/' + path.basename(game);
  const say = m => { r.err[m] = (r.err[m] || 0) + 1; };
  const people = [{ uid: 'botA1', name: 'botalice' }, { uid: 'botB2', name: 'botbob' }, { uid: 'botC3', name: 'botcarl' }, { uid: 'botD4', name: 'botdan' }];
  const now = Date.now(), store = {};
  people.forEach(p => { store['data/users/' + p.uid + '/profile'] = { username: p.name, at: now }; store['usernames/' + p.name] = { uid: p.uid, at: now }; });
  [['botA1', 'botalice', 'botB2', 'botbob'], ['botA1', 'botalice', 'botC3', 'botcarl']].forEach(([f, fn, t, tn]) => {
    store['requests/' + f + '_' + t] = { from: f, to: t, fromName: fn, toName: tn, status: 'accepted', at: now, decidedAt: now };
  });
  const tag = Math.random().toString(36).slice(2, 8), secret = 'bots say hi ' + tag, psecret = 'party time ' + tag;
  const pages = [];
  const until = async (f, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await f()) return true; } catch (e) {} await sleep(250); } return false; };
  const push = ws => { ws.forEach(w => { if (w.data == null) delete store[w.path]; else store[w.path] = w.data; }); };
  try {
    await Promise.all(people.map(async (me, i) => {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
      await ctx.addInitScript(() => { try { sessionStorage.setItem('by.gate', 'skip'); } catch (e) {} });
      await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, rt => rt.abort());
      const pg = await ctx.newPage();
      pg.on('pageerror', e => say(String(e.message).slice(0, 110)));
      await pg.exposeFunction('__dbAll', () => store);
      await pg.exposeFunction('__dbw', ws => { push(ws); pages.filter(p => p && p !== pg && !p.isClosed()).forEach(p => p.evaluate(ws => window.__dbIn && window.__dbIn(ws), ws).catch(() => {})); });
      await ctx.addInitScript(fakeClaude, me);
      pages[i] = pg;
      await pg.goto(url, { waitUntil: 'load' });
    }));
    const [A, B, C, D] = pages;
    const msgsIn = key => Object.keys(store).filter(p => p.startsWith('chats/' + key + '/msgs/'));
    const locked = (m, text) => m.e === 1 && typeof m.from === 'string' && typeof m.at === 'number' && typeof m.sd === 'string' && ['iv', 'ct', 'k'].every(k => m[k] != null) && !('text' in m) && !JSON.stringify(m).includes(text);
    const shows = (pg, t) => pg.evaluate(t => { const m = document.getElementById('msgs'); return !!m && m.textContent.includes(t); }, t);
    /* press a button in the chat screen, opening the chat screen first */
    const tap = (pg, sel) => pg.evaluate(sel => {
      if (document.getElementById('chat').hidden) document.getElementById('chat-btn').click();
      const b = document.querySelector('#chat-body ' + sel);
      if (b) b.click();
      return !!b;
    }, sel);
    const toList = pg => pg.evaluate(() => { const c = document.getElementById('chat'); if (!c.hidden) { document.getElementById('chat-back').click(); if (!c.hidden && !document.querySelector('#chat-body [data-ch="newparty"]')) document.getElementById('chat-back').click(); } });
    const send = (pg, t) => pg.evaluate(t => { const i = document.getElementById('chat-in'); i.value = t; i.dispatchEvent(new Event('input', { bubbles: true })); document.getElementById('chat-send').click(); }, t);
    const pid = () => Object.keys(((store['parties/botA1'] || {}).list) || {})[0];
    const steps = [
      ['the players did not get their lock keys (e2e/<uid>)', () => until(async () => people.every(p => store['e2e/' + p.uid]), 20000)],
      ['A could not open the chat with B', () => until(async () => await tap(A, '[data-ch="open"][data-id="botB2"]') && A.evaluate(() => !!document.getElementById('chat-in')), 15000)],
      ['A\'s message to B was not saved', async () => { await send(A, secret); return until(async () => msgsIn('botA1~botB2').length >= 1, 10000); }],
      ['the saved message is not locked (plaintext or wrong shape in the database)', async () => locked(store[msgsIn('botA1~botB2')[0]], secret)],
      ['B did not see A\'s message', async () => {
        if (!await until(() => tap(B, '[data-ch="open"][data-id="botA1"]'), 15000)) return false;
        return until(() => shows(B, secret), 10000);
      }],
      ['A could not make a party with B and C', async () => {
        await toList(A);
        if (!await until(() => tap(A, '[data-ch="newparty"]'), 8000)) return false;
        await A.evaluate(() => { const n = document.getElementById('pty-name'); if (n) { n.value = 'Bot party'; n.dispatchEvent(new Event('input', { bubbles: true })); } });
        await tap(A, '[data-ch="pick"][data-id="botB2"]'); await tap(A, '[data-ch="pick"][data-id="botC3"]');
        await tap(A, '[data-ch="mkparty"]');
        return until(async () => { const p = pid(); return p && Object.keys(store['parties/botA1'].list[p].m).length === 3; }, 10000);
      }],
      ['A\'s party message was not saved locked', async () => {
        /* making a party opens it straight away */
        const inParty = () => A.evaluate(() => !!document.querySelector('#chat-body .ptybar') && !!document.getElementById('chat-in'));
        if (!await until(async () => await inParty() || (await tap(A, '[data-ch="pty"][data-id="' + pid() + '"]') && inParty()), 10000)) return false;
        await sleep(1300); /* the game asks you to slow down if you send twice within 1.2 s */
        await send(A, psecret);
        if (!await until(async () => msgsIn(pid()).length >= 1, 10000)) return false;
        return locked(store[msgsIn(pid())[0]], psecret);
      }],
      ['B and C did not both see the party message', async () => {
        await toList(B);
        for (const pg of [B, C]) if (!await until(async () => await tap(pg, '[data-ch="pty"][data-id="' + pid() + '"]') && shows(pg, psecret), 15000)) return false;
        return true;
      }],
      ['an outsider could read a copied locked message', async () => {
        /* D makes its own party with A and B, and copies A's locked 1:1 message into it */
        const src = msgsIn('botA1~botB2')[0], copy = 'chats/gspy01/msgs/' + src.split('/').pop();
        const ws = [{ path: 'parties/botD4', data: { name: 'botdan', at: Date.now(), list: { gspy01: { n: 'Spy', at: Date.now(), m: { botA1: 'botalice', botB2: 'botbob', botD4: 'botdan' } } } } },
          { path: copy, data: store[src] }];
        push(ws);
        await D.evaluate(ws => window.__dbIn(ws), ws);
        if (!await until(async () => await tap(D, '[data-ch="pty"][data-id="gspy01"]') && D.evaluate(() => /cannot be read here|could not be unlocked/.test((document.getElementById('msgs') || {}).textContent || '')), 15000)) return false;
        await sleep(600);
        return !(await shows(D, secret)) && !(await D.evaluate(t => document.body.innerText.includes(t), secret));
      }],
      ['plaintext was found in the database', async () => { const j = JSON.stringify(store); return !j.includes(secret) && !j.includes(psecret); }]
    ];
    for (const s of steps) {
      r.steps++;
      let ok = false;
      try { ok = await s[1](); } catch (e) { r.fail = s[0] + ' (' + String(e.message).slice(0, 80) + ')'; break; }
      if (!ok) { r.fail = s[0]; if (process.env.PLAYTEST_DEBUG) { console.log(JSON.stringify(Object.keys(store))); for (const p of pages) console.log((await p.evaluate(() => document.getElementById('chat-body').innerText).catch(() => '?')).slice(0, 400)); } break; }
    }
  } catch (e) {
    r.fail = 'it could not start: ' + String(e.message).slice(0, 80);
  }
  for (const p of pages) if (p) await p.context().close().catch(() => {});
  srv.close();
  r.ok = !r.fail && !Object.keys(r.err).length;
  return r;
}
/* the website: index.html loads without errors, every picture loads, nothing scrolls sideways on a phone, every game card
   opens a game that exists, and a card link really starts its game */
async function websiteCheck(browser) {
  const r = { id: 'm.site', t: 'Website home page', check: true, err: {}, ok: true, steps: 0, fail: '' };
  const home = path.join(path.dirname(game), 'index.html');
  if (!fs.existsSync(home)) { r.fail = 'there is no index.html next to the game'; r.ok = false; return r; }
  const srv = await serve(path.dirname(game));
  const base = 'http://127.0.0.1:' + srv.address().port + '/';
  const say = m => { r.err[m] = (r.err[m] || 0) + 1; };
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, rt => rt.abort());
  const pg = await ctx.newPage();
  pg.on('pageerror', e => say(String(e.message).slice(0, 110)));
  let cards = [], tiles = [];
  const steps = [
    ['index.html did not load', async () => { const res = await pg.goto(base + 'index.html', { waitUntil: 'load' }); return !!res && res.ok(); }],
    ['a picture on the home page did not load', async () => {
      /* load the lazy pictures too, then look at every one */
      const bad = await pg.evaluate(async () => {
        const ims = [...document.images];
        ims.forEach(im => { if (im.loading === 'lazy') im.loading = 'eager'; });
        await Promise.all(ims.map(im => im.complete ? 0 : new Promise(f => { im.onload = im.onerror = f; setTimeout(f, 5000); })));
        return ims.filter(im => !im.naturalWidth).map(im => im.getAttribute('src'));
      });
      if (bad.length) r.fail = 'a picture on the home page did not load: ' + bad.slice(0, 3).join(', ');
      return !bad.length;
    }],
    ['the home page scrolls sideways at 390 px wide', async () => {
      /* against 390 itself: a phone zooms out to fit wide content, so innerWidth grows with it */
      const w = await pg.evaluate(() => ({ sw: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth), iw: 390 }));
      if (w.sw > w.iw + 1) r.fail = 'the home page scrolls sideways at 390 px wide (' + w.sw + ' px of content)';
      return w.sw <= w.iw + 1;
    }],
    ['a game card links to a game that does not exist', async () => {
      cards = await pg.evaluate(() => [...document.querySelectorAll('a[href*="#play="]')].map(a => a.getAttribute('href')));
      await pg.goto(base + path.basename(game), { waitUntil: 'load' });
      tiles = await pg.evaluate(() => [...document.querySelectorAll('#games .tile[data-game]')].map(t => t.getAttribute('data-game')));
      const bad = [...new Set(cards.map(h => (/#play=([a-z0-9]+)$/.exec(h) || [])[1] || h))].filter(id => !tiles.includes(id));
      if (bad.length) r.fail = 'a game card links to a game that does not exist: ' + bad.slice(0, 5).join(', ');
      return cards.length > 0 && !bad.length;
    }],
    ['a card link (game.html#play=snake) did not start the game', async () => {
      const id = tiles.includes('snake') ? 'snake' : tiles[0];
      /* a fresh page, like a click from the home page (going from game.html to game.html#play= would not reload it) */
      const p2 = await ctx.newPage();
      p2.on('pageerror', e => say(String(e.message).slice(0, 110)));
      await p2.goto(base + path.basename(game) + '#play=' + id, { waitUntil: 'load' });
      const t0 = Date.now();
      while (Date.now() - t0 < 6000) {
        if (await p2.evaluate(() => document.getElementById('hub').hidden && !document.getElementById('play').hidden)) return true;
        await sleep(200);
      }
      return false;
    }]
  ];
  try {
    for (const s of steps) {
      r.steps++;
      let ok = false;
      try { ok = await s[1](); } catch (e) { r.fail = s[0] + ' (' + String(e.message).slice(0, 80) + ')'; break; }
      if (!ok) { if (!r.fail) r.fail = s[0]; break; }
    }
  } catch (e) { r.fail = 'it could not start: ' + String(e.message).slice(0, 80); }
  r.cards = cards.length;
  await ctx.close().catch(() => {});
  srv.close();
  r.ok = !r.fail && !Object.keys(r.err).length;
  return r;
}
function problemOf(r) {
  const b = [], em = Object.keys(r.err || {});
  if (r.fail) b.push(r.fail);
  if (em.length) b.push('error: ' + em[0]);
  return r.t + ': ' + b.join('; ');
}

(async () => {
  const t0 = Date.now();
  const browser = await chromium.launch(launchOpts());
  const report = { at: new Date().toISOString(), sha: (process.env.GITHUB_SHA || '').slice(0, 7), ver: '', ms: MS, runs: [] };
  for (const s of (process.env.PLAYTEST_ONLYMP === '1' ? [] : SIZES)) {
    const ctx = await browser.newContext({ viewport: { width: s.width, height: s.height }, hasTouch: s.touch, isMobile: s.touch });
    await ctx.route(/^https?:\/\//, r => r.abort());
    await ctx.addInitScript(() => { try { sessionStorage.setItem('by.gate', 'skip'); } catch (e) {} });
    const page = await ctx.newPage();
    const pageErrors = [];
    page.on('pageerror', e => pageErrors.push(String(e.message).slice(0, 200)));
    await page.goto('file://' + game, { waitUntil: 'load' });
    await page.waitForTimeout(1200);
    if (!report.ver) report.ver = await page.evaluate(() => (window.BY_TESTBOTS && BY_TESTBOTS.ver && BY_TESTBOTS.ver()) || '');
    const res = await page.evaluate(ms => window.BY_TESTBOTS({ ms, shots: true, missions: true }), s.ms);
    if (!res) throw new Error('the test bots did not start');
    // shrink every picture to 480px wide so the daily report stays small
    for (const r of res.results) {
      if (!r.shot) continue;
      const small = await page.evaluate(src => new Promise(ok => {
        const im = new Image();
        im.onload = () => {
          const w = 480, h = Math.round(im.height * w / im.width), c = document.createElement('canvas');
          c.width = w; c.height = h; c.getContext('2d').drawImage(im, 0, 0, w, h);
          ok(c.toDataURL('image/jpeg', 0.62));
        };
        im.onerror = () => ok(src);
        im.src = src;
      }), r.shot);
      const f = `${s.tag}-${r.id}.jpg`;
      fs.writeFileSync(path.join(out, f), Buffer.from(small.split(',')[1], 'base64'));
      r.shot = f;
    }
    // how smooth each game ran: frames a second, the slowest 1 in 20 frames, and long pauses
    const lag = res.results.filter(r => !r.check && r.fps).map(r => ({ id: r.id, t: r.t, fps: r.fps, p95: r.lag ? r.lag.p95 : 0, hitch: r.lag ? r.lag.hitch : 0 })).sort((a, b) => a.fps - b.fps || b.p95 - a.p95);
    report.runs.push({ size: s.tag, w: s.width, h: s.height, ms: s.ms, problems: res.problems, results: res.results, lag, pageErrors: pageErrors.slice(0, 20) });
    // contact sheet: every game's last frame, problems outlined in red
    const cells = res.results.map(r => r.shot
      ? `<div style="border:3px solid ${r.ok ? '#2a2a4e' : '#ff3b3b'}"><img src="data:image/jpeg;base64,${fs.readFileSync(path.join(out, r.shot)).toString('base64')}" style="width:100%;display:block"><div style="padding:2px 4px">${esc(r.t)}</div></div>`
      : `<div style="border:3px solid ${r.ok ? '#2a2a4e' : '#ff3b3b'};display:grid;place-items:center;min-height:60px;padding:6px">${esc(r.t)} (${r.check ? 'check' : 'page game'})</div>`).join('');
    const html = '<html><body style="margin:0;background:#15152b;font:12px sans-serif;color:#fff;display:grid;grid-template-columns:repeat(8,1fr);gap:4px;padding:4px">' + cells + '</body></html>';
    const sheet = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    await sheet.setContent(html, { waitUntil: 'load' });
    await sheet.screenshot({ path: path.join(out, `sheet-${s.tag}.jpg`), type: 'jpeg', quality: 70, fullPage: true });
    await sheet.close();
    await ctx.close();
  }
  if (process.env.PLAYTEST_MP !== '0') {
    const mp = await twoPlayers(browser);
    if (!report.runs.length) report.runs.push({ size: 'laptop', w: 1280, h: 720, problems: [], results: [], lag: [], pageErrors: [] });
    const lap = report.runs[0];
    lap.results.push(mp);
    if (!mp.ok) lap.problems.push(problemOf(mp));
    const fc = await friendChat(browser);
    lap.results.push(fc);
    if (!fc.ok) lap.problems.push(problemOf(fc));
  }
  {
    /* static: two top-level names in the main script that overwrite each other (tools/dupnames.js) */
    const nm = { id: 'm.names', t: 'Duplicate names in the game code', check: true, err: {}, ok: true, steps: 1, fail: '' };
    try {
      const d = require('./dupnames').findDups(fs.readFileSync(game, 'utf8'));
      if (d.length) nm.fail = d.length + ' name' + (d.length === 1 ? ' is' : 's are') + ' declared twice at the top level, so one overwrites the other: ' + d.slice(0, 6).map(x => x.name + ' (lines ' + x.lines.join(', ') + ')').join('; ');
    } catch (e) { nm.fail = 'could not read the game code: ' + String(e.message).slice(0, 80); }
    nm.ok = !nm.fail;
    if (!report.runs.length) report.runs.push({ size: 'laptop', w: 1280, h: 720, problems: [], results: [], lag: [], pageErrors: [] });
    report.runs[0].results.push(nm);
    if (!nm.ok) report.runs[0].problems.push(problemOf(nm));
  }
  if (fs.existsSync(path.join(__dirname, 'checkrelease.js'))) {
    /* tools/checkrelease.js, local part only (no network): the home page, updates list, manifest, sw.js and itch loader agree */
    const rc = { id: 'm.release', t: 'Release check', check: true, err: {}, ok: true, steps: 1, fail: '' };
    let outTxt = '';
    try { outTxt = require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'checkrelease.js')], { encoding: 'utf8', timeout: 30000 }); }
    catch (e) { outTxt = String(e.stdout || '') + String(e.stderr || ''); rc.fail = 'failed'; }
    if (rc.fail) rc.fail = outTxt.split('\n').filter(l => /^FAIL/.test(l)).map(l => l.replace(/^FAIL\s*/, '')).slice(0, 4).join('; ') || ('it did not run: ' + outTxt.trim().slice(0, 100));
    rc.ok = !rc.fail;
    if (!report.runs.length) report.runs.push({ size: 'laptop', w: 1280, h: 720, problems: [], results: [], lag: [], pageErrors: [] });
    report.runs[0].results.push(rc);
    if (!rc.ok) report.runs[0].problems.push(problemOf(rc));
  }
  if (process.env.PLAYTEST_SITE !== '0') {
    const site = await websiteCheck(browser);
    if (!report.runs.length) report.runs.push({ size: 'laptop', w: 1280, h: 720, problems: [], results: [], lag: [], pageErrors: [] });
    const lap = report.runs[0];
    lap.results.push(site);
    if (!site.ok) lap.problems.push(problemOf(site));
  }
  if (process.env.PLAYTEST_PILOTS === '1') {
    /* opt-in, slow: every hub game has a pilot that scores within 8 s, plus the phone quality report (tools/pilots.js) */
    const pl = require('./pilots');
    const pr = await pl.run(game, out);
    report.pilots = { noPilot: pr.noPilot, neverScored: pr.neverScored, sharedSmall: pr.sharedSmall, secs: pr.secs };
    const pc = { id: 'm.pilots', t: 'Every game has a pilot that scores', check: true, err: {}, ok: true, steps: pr.games.length, fail: '' };
    const bits = [];
    if (pr.noPilot.length) bits.push('no pilot: ' + pr.noPilot.join(', '));
    if (pr.neverScored.length) bits.push('never scored in ' + pr.tries + ' tries of ' + pr.ms / 1000 + ' s: ' + pr.neverScored.join(', '));
    pc.fail = bits.join('; '); pc.ok = !pc.fail;
    if (!report.runs.length) report.runs.push({ size: 'laptop', w: 1280, h: 720, problems: [], results: [], lag: [], pageErrors: [] });
    report.runs[0].results.push(pc);
    if (!pc.ok) report.runs[0].problems.push(problemOf(pc));
    console.log(pl.summary(pr));
  }
  report.secs = Math.round((Date.now() - t0) / 1000);
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
  const all = report.runs.map(r => `${r.size}: ${r.problems.length} problems`).join(', ');
  console.log('Playtest done. ' + all);
  report.runs.forEach(r => r.problems.forEach(p => console.log(`[${r.size}] ${p}`)));
  report.runs.forEach(r => r.results.filter(x => x.check).forEach(x => console.log(`[${r.size}] check ${x.t}: ${x.ok ? 'OK' : 'PROBLEM'}${x.steps ? ' (' + x.steps + ' steps)' : ''}`)));
  await browser.close();
})().catch(e => { console.error('PLAYTEST FAILED', e.message); process.exit(1); });
