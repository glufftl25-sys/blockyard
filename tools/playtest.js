/* Daily Blockyard playtest.
   Opens game.html in a headless browser at laptop and phone sizes. The test bots play every game for real (each game's
   pilot tries to win), then do the extra checks: the menus and the shop, the Blaster Duel menus, and the Blaster Duel
   special check. Then two copies of the game join one Blaster Duel match together, through a stand-in for the online
   database (tools/fbmock), to check that playing with a friend works. Last, two friends chat through a stand-in for
   Claude's database (window.claude): A sends B a message, B must see it, and the database must hold only the locked copy.
   Writes <out>/report.json, a small picture of every game's last frame, and a contact sheet per size
   (sheet-laptop.jpg, sheet-phone.jpg). GitHub runs this every day (.github/workflows/test-bots.yml) and the Bots page
   (bots.html) shows the report.
   Usage: node tools/playtest.js [path/to/game.html] [outDir]
   Optional: PLAYTEST_MS (ms per game on the laptop, default 4000; the phone gets 3/4 of it), PLAYTEST_MP=0 to skip the
   two-player check, PLAYTEST_ONLYMP=1 to do only the two-player check. */
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
  const types = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
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

/* two friends chat: A sends B a message. B must see it, and the database must only hold the locked (encrypted) copy. */
async function friendChat(browser) {
  const r = { id: 'm.chat', t: 'Friend chat (locked messages)', check: true, err: {}, ok: true, steps: 0, fail: '' };
  const srv = await serve(path.dirname(game));
  const url = 'http://127.0.0.1:' + srv.address().port + '/' + path.basename(game);
  const say = m => { r.err[m] = (r.err[m] || 0) + 1; };
  const people = [{ uid: 'botA1', name: 'botalice' }, { uid: 'botB2', name: 'botbob' }];
  const now = Date.now();
  const store = {
    'data/users/botA1/profile': { username: 'botalice', at: now }, 'data/users/botB2/profile': { username: 'botbob', at: now },
    'usernames/botalice': { uid: 'botA1', at: now }, 'usernames/botbob': { uid: 'botB2', at: now },
    'requests/botA1_botB2': { from: 'botA1', to: 'botB2', fromName: 'botalice', toName: 'botbob', status: 'accepted', at: now, decidedAt: now }
  };
  const secret = 'bots say hi ' + Math.random().toString(36).slice(2, 8);
  const pages = [];
  const until = async (f, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await f()) return true; } catch (e) {} await sleep(300); } return false; };
  try {
    for (const me of people) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
      await ctx.addInitScript(() => { try { sessionStorage.setItem('by.gate', 'skip'); } catch (e) {} });
      await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, rt => rt.abort());
      const pg = await ctx.newPage();
      pg.on('pageerror', e => say(String(e.message).slice(0, 110)));
      await pg.exposeFunction('__dbAll', () => store);
      await pg.exposeFunction('__dbw', ws => {
        ws.forEach(w => { if (w.data == null) delete store[w.path]; else store[w.path] = w.data; });
        pages.filter(p => p !== pg && !p.isClosed()).forEach(p => p.evaluate(ws => window.__dbIn && window.__dbIn(ws), ws).catch(() => {}));
      });
      await ctx.addInitScript(fakeClaude, me);
      await pg.goto(url, { waitUntil: 'load' });
      pages.push(pg);
    }
    const [A, B] = pages;
    const msgs = () => Object.keys(store).filter(p => p.startsWith('chats/botA1~botB2/msgs/')).map(p => store[p]);
    const openConv = (pg, other) => pg.evaluate(o => {
      if (!document.querySelector('#chat-body [data-ch="open"]')) document.getElementById('chat-btn').click();
      const b = document.querySelector('#chat-body [data-ch="open"][data-id="' + o + '"]');
      if (b) b.click();
      return !!document.getElementById('chat-in');
    }, other);
    const steps = [
      ['the players did not get their lock keys (e2e/<uid>)', () => until(async () => !!(store['e2e/botA1'] && store['e2e/botB2']), 20000)],
      ['A could not open the chat with B', () => until(() => openConv(A, 'botB2'), 15000)],
      ['A\'s message was not saved', async () => {
        await A.evaluate(t => { const i = document.getElementById('chat-in'); i.value = t; i.dispatchEvent(new Event('input', { bubbles: true })); document.getElementById('chat-send').click(); }, secret);
        return until(async () => msgs().length >= 1, 15000);
      }],
      ['the saved message is not locked (plaintext or wrong shape in the database)', async () => {
        const m = msgs()[0], j = JSON.stringify(m);
        return m.e === 1 && m.from === 'botA1' && typeof m.at === 'number' && ['iv', 'ct', 'k'].every(k => m[k] != null) && !('text' in m) && !j.includes(secret);
      }],
      ['B did not see A\'s message', async () => {
        if (!await until(() => openConv(B, 'botA1'), 15000)) return false;
        return until(() => B.evaluate(t => (document.getElementById('msgs') || {}).textContent.includes(t), secret), 15000);
      }]
    ];
    for (const s of steps) {
      r.steps++;
      let ok = false;
      try { ok = await s[1](); } catch (e) { r.fail = s[0] + ' (' + String(e.message).slice(0, 80) + ')'; break; }
      if (!ok) { r.fail = s[0]; break; }
    }
  } catch (e) {
    r.fail = 'it could not start: ' + String(e.message).slice(0, 80);
  }
  for (const p of pages) await p.context().close().catch(() => {});
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
  report.secs = Math.round((Date.now() - t0) / 1000);
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
  const all = report.runs.map(r => `${r.size}: ${r.problems.length} problems`).join(', ');
  console.log('Playtest done. ' + all);
  report.runs.forEach(r => r.problems.forEach(p => console.log(`[${r.size}] ${p}`)));
  report.runs.forEach(r => r.results.filter(x => x.check).forEach(x => console.log(`[${r.size}] check ${x.t}: ${x.ok ? 'OK' : 'PROBLEM'}${x.steps ? ' (' + x.steps + ' steps)' : ''}`)));
  await browser.close();
})().catch(e => { console.error('PLAYTEST FAILED', e.message); process.exit(1); });
