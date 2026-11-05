/* Pilot and quality check (opt-in, slow: a few minutes). Not part of the daily run unless PLAYTEST_PILOTS=1.
   1. Pilots: every game with a hub tile must have a test bot pilot (g.tbp), and the pilot must score more than 0 within
      8 s in at least one of 3 tries (laptop size). Lists the games without a pilot and the ones whose pilot never scores.
   2. Quality, per game, at phone size (844x390, touch): frame time p95, text drawn outside the canvas (any fillText or
      strokeText whose box goes past the edge, which catches start and game-over screens that do not fit), and touch
      targets (visible buttons in the play screen smaller than 44 px).
   Usage: node tools/pilots.js [game.html] [outDir]   -> <outDir>/pilots.json and a printed summary
   Optional: PILOT_MS (default 8000), PILOT_TRIES (default 3), PILOT_IDS=a,b (only these games), QUALITY_MS (default 4000).
   Exits 1 if a game has no pilot or its pilot never scores. */
const path = require('path');
const fs = require('fs');
const { chromium, launchOpts } = require('./pw');

const MS = Math.max(1000, Number(process.env.PILOT_MS) || 8000);
const TRIES = Math.max(1, Number(process.env.PILOT_TRIES) || 3);
const QMS = Math.max(1000, Number(process.env.QUALITY_MS) || 4000);
const SMALL = 44;

/* put into the page before the game starts: remember text drawn past the canvas edge, per game */
function textWatch() {
  window.__offText = {};
  window.__offGame = '';
  const P = CanvasRenderingContext2D.prototype;
  const wrap = name => {
    const orig = P[name];
    P[name] = function (s, x, y, maxW) {
      try {
        const c = this.canvas;
        if (c && c.id === 'cv' && window.__offGame && c.width > 0) {
          const m = this.measureText(s);
          let w = m.width; if (maxW != null && maxW < w) w = maxW;
          const al = this.textAlign, dir = this.direction === 'rtl';
          let x0 = x;
          if (al === 'center') x0 = x - w / 2;
          else if (al === 'right' || (al === 'end' && !dir) || (al === 'start' && dir)) x0 = x - w;
          const asc = m.actualBoundingBoxAscent || 0, desc = m.actualBoundingBoxDescent || 0;
          const t = this.getTransform();
          const pts = [[x0, y - asc], [x0 + w, y - asc], [x0, y + desc], [x0 + w, y + desc]].map(([px, py]) => [t.a * px + t.c * py + t.e, t.b * px + t.d * py + t.f]);
          const minX = Math.min(...pts.map(p => p[0])), maxX = Math.max(...pts.map(p => p[0]));
          const minY = Math.min(...pts.map(p => p[1])), maxY = Math.max(...pts.map(p => p[1]));
          const tol = 2 * (window.devicePixelRatio || 1);
          const visible = maxX > 0 && minX < c.width && maxY > 0 && minY < c.height; // fully off-screen text is usually scrolled away on purpose
          if (visible && this.globalAlpha > 0.05 && String(s).trim() && (minX < -tol || maxX > c.width + tol || minY < -tol || maxY > c.height + tol)) {
            const g = window.__offText[window.__offGame] || (window.__offText[window.__offGame] = {});
            const k = String(s).replace(/\d+/g, '#').slice(0, 40);
            const side = [minX < -tol ? 'left' : '', maxX > c.width + tol ? 'right' : '', minY < -tol ? 'top' : '', maxY > c.height + tol ? 'bottom' : ''].filter(Boolean).join('+');
            g[k] = g[k] || { n: 0, side };
            g[k].n++;
          }
        }
      } catch (e) {}
      return orig.apply(this, arguments);
    };
  };
  wrap('fillText'); wrap('strokeText');
}

/* the visible buttons in the play screen, and the ones smaller than SMALL px */
function touchScan(small) {
  const out = { n: 0, small: [] };
  const play = document.getElementById('play');
  if (!play || play.hidden) return out;
  const els = [...document.querySelectorAll('#play button, #play [role="button"], #play a[href], #play input, #play select, .tpad, .tbtn, [data-tbtn]')];
  for (const el of els) {
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    if (r.width < 1 || r.height < 1 || cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) continue;
    if (r.right < 0 || r.bottom < 0 || r.left > innerWidth || r.top > innerHeight) continue;
    out.n++;
    if (r.width < small || r.height < small) {
      const name = (el.getAttribute('aria-label') || el.textContent || el.id || el.className || el.tagName).replace(/\s+/g, ' ').trim().slice(0, 24);
      out.small.push(name + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
    }
  }
  return out;
}

async function openPage(browser, size) {
  const ctx = await browser.newContext({ viewport: { width: size.w, height: size.h }, hasTouch: !!size.touch, isMobile: !!size.touch });
  await ctx.route(/^https?:\/\//, r => r.abort());
  await ctx.addInitScript(() => { try { sessionStorage.setItem('by.gate', 'skip'); } catch (e) {} });
  await ctx.addInitScript(textWatch);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e.message).slice(0, 120)));
  return { ctx, page, errs };
}
const one = (page, id, ms) => page.evaluate(([id, ms]) => { window.__offGame = id; return window.BY_TESTBOTS({ ids: [id], ms }); }, [id, ms]);

async function run(game, out) {
  const t0 = Date.now();
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch(launchOpts());
  const rep = { at: new Date().toISOString(), ms: MS, tries: TRIES, qms: QMS, games: [], noPilot: [], neverScored: [] };

  /* 1. pilots, laptop size */
  const L = await openPage(browser, { w: 1280, h: 720 });
  await L.page.goto('file://' + game, { waitUntil: 'load' });
  await L.page.waitForTimeout(1000);
  rep.ver = await L.page.evaluate(() => (window.BY_TESTBOTS && BY_TESTBOTS.ver && BY_TESTBOTS.ver()) || '');
  /* every hub tile; GAMES is private, so a tile the bots cannot open shows up as an empty result below */
  let list = await L.page.evaluate(() => [...document.querySelectorAll('#games .tile[data-game]')].map(t => t.getAttribute('data-game'))
    .filter((id, i, a) => a.indexOf(id) === i).map(id => ({ id })));
  if (process.env.PILOT_IDS) { const only = process.env.PILOT_IDS.split(','); list = list.filter(x => only.includes(x.id)); }
  for (const x of list) {
    const g = { id: x.id, t: x.id, pilot: false, tries: [], best: 0, label: '' };
    for (let i = 0; i < TRIES; i++) {
      const res = await one(L.page, x.id, MS).catch(e => ({ fail: String(e.message).slice(0, 80) }));
      const r = res && res.results && res.results[0];
      if (!r) { g.skip = (res && res.fail) || 'not a game the bots can open'; break; }
      g.t = r.t;
      g.pilot = !!r.play;
      if (!r.play) break;
      g.tries.push(r.play.top);
      g.label = r.play.l;
      if (r.perr) g.perr = r.perr;
      g.best = Math.max(g.best, r.play.top || 0);
      if (g.best > 0) break;
    }
    if (g.skip) { rep.games.push(g); continue; }
    if (!g.pilot) rep.noPilot.push(g.t);
    else if (!(g.best > 0)) rep.neverScored.push(g.t);
    rep.games.push(g);
  }
  const offL = await L.page.evaluate(() => window.__offText).catch(() => ({}));
  await L.ctx.close();

  /* 2. quality, phone size */
  const Q = await openPage(browser, { w: 844, h: 390, touch: true });
  await Q.page.goto('file://' + game, { waitUntil: 'load' });
  await Q.page.waitForTimeout(1000);
  for (const g of rep.games) {
    if (g.skip) continue;
    const p = one(Q.page, g.id, QMS);
    await Q.page.waitForTimeout(Math.min(1500, QMS / 2));
    g.touch = await Q.page.evaluate(touchScan, SMALL).catch(() => null);
    const res = await p.catch(() => null);
    const r = res && res.results && res.results[0];
    if (r) { g.fps = r.fps; g.p95 = r.lag ? r.lag.p95 : null; g.hitch = r.lag ? r.lag.hitch : null; g.ok = r.ok; g.errs = Object.keys(r.err || {}); }
  }
  const off = await Q.page.evaluate(() => window.__offText).catch(() => ({}));
  /* both passes: the laptop runs are longer, so they see more start and game-over screens */
  rep.games.forEach(g => {
    g.offText = Object.entries((off || {})[g.id] || {}).map(([s, v]) => s + ' (phone, ' + v.side + ')')
      .concat(Object.entries((offL || {})[g.id] || {}).map(([s, v]) => s + ' (laptop, ' + v.side + ')'));
  });
  /* small buttons every game shows (the shared play-screen buttons) are listed once, not under every game */
  const tg = rep.games.filter(g => g.touch);
  rep.sharedSmall = tg.length ? tg[0].touch.small.filter(n => tg.every(g => g.touch.small.includes(n))) : [];
  tg.forEach(g => { g.touch.own = g.touch.small.filter(n => !rep.sharedSmall.includes(n)); });
  rep.pageErrors = L.errs.concat(Q.errs).slice(0, 20);
  await Q.ctx.close();
  await browser.close();
  rep.secs = Math.round((Date.now() - t0) / 1000);
  fs.writeFileSync(path.join(out, 'pilots.json'), JSON.stringify(rep, null, 1));
  return rep;
}

function summary(rep) {
  const L = [];
  const gs = rep.games.filter(g => !g.skip);
  L.push(`Pilots (${rep.ms / 1000} s, up to ${rep.tries} tries): ${gs.length} games, ${rep.noPilot.length} without a pilot, ${rep.neverScored.length} never scored.`);
  if (rep.noPilot.length) L.push('  No pilot: ' + rep.noPilot.join(', '));
  if (rep.neverScored.length) L.push('  Never scored: ' + rep.neverScored.join(', '));
  const slow = gs.filter(g => g.p95 != null).sort((a, b) => b.p95 - a.p95).slice(0, 5);
  L.push('Slowest frames at phone size (p95 ms): ' + slow.map(g => g.t + ' ' + g.p95 + (g.hitch ? ' (' + g.hitch + ' hitches)' : '')).join(', '));
  const ot = gs.filter(g => g.offText && g.offText.length);
  L.push('Text past the screen edge at phone size: ' + (ot.length ? '' : 'none'));
  ot.forEach(g => L.push('  ' + g.t + ': ' + g.offText.slice(0, 4).join('; ')));
  const tt = gs.filter(g => g.touch && g.touch.own.length);
  L.push(`Touch targets under ${SMALL} px at phone size: ` + (tt.length || (rep.sharedSmall || []).length ? '' : 'none'));
  if ((rep.sharedSmall || []).length) L.push('  In every game: ' + rep.sharedSmall.join('; '));
  tt.forEach(g => L.push('  ' + g.t + ': ' + g.touch.own.slice(0, 4).join('; ') + (g.touch.own.length > 4 ? ' and ' + (g.touch.own.length - 4) + ' more' : '')));
  const sk = rep.games.filter(g => g.skip);
  if (sk.length) L.push('Hub tiles the bots cannot open (not counted): ' + sk.map(g => g.id).join(', '));
  if (rep.pageErrors.length) L.push('Page errors: ' + rep.pageErrors.slice(0, 3).join(' | '));
  L.push(`Took ${rep.secs} s.`);
  return L.join('\n');
}

module.exports = { run, summary };

if (require.main === module) {
  const game = path.resolve(process.argv[2] || path.join(__dirname, '..', 'game.html'));
  const out = path.resolve(process.argv[3] || 'pilots-out');
  run(game, out).then(rep => { console.log(summary(rep)); process.exit(rep.noPilot.length || rep.neverScored.length ? 1 : 0); })
    .catch(e => { console.error('PILOT CHECK FAILED', e.message); process.exit(2); });
}
