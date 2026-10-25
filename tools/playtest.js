/* Daily Blockyard playtest.
   Opens game.html in a headless browser at laptop and phone sizes, lets the test bots play every game,
   and writes what they found to <out>/report.json, a small picture of every game's last frame,
   and a contact sheet per size (sheet-laptop.jpg, sheet-phone.jpg).
   GitHub runs this every day (.github/workflows/test-bots.yml) and the Bots page (bots.html) shows the report.
   Usage: node tools/playtest.js [path/to/game.html] [outDir]   Optional: PLAYTEST_MS (ms per game, default 3000) */
const path = require('path');
const fs = require('fs');
const { chromium, launchOpts } = require('./pw');
const game = path.resolve(process.argv[2] || path.join(__dirname, '..', 'game.html'));
const out = path.resolve(process.argv[3] || 'playtest-out');
const MS = Math.max(1000, Number(process.env.PLAYTEST_MS) || 3000);
fs.mkdirSync(out, { recursive: true });

const SIZES = [
  { tag: 'laptop', width: 1280, height: 720, touch: false },
  { tag: 'phone', width: 844, height: 390, touch: true }
];
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

(async () => {
  const t0 = Date.now();
  const browser = await chromium.launch(launchOpts());
  const report = { at: new Date().toISOString(), sha: (process.env.GITHUB_SHA || '').slice(0, 7), ver: '', ms: MS, runs: [] };
  for (const s of SIZES) {
    const ctx = await browser.newContext({ viewport: { width: s.width, height: s.height }, hasTouch: s.touch, isMobile: s.touch });
    await ctx.route(/^https?:\/\//, r => r.abort());
    await ctx.addInitScript(() => { try { sessionStorage.setItem('by.gate', 'skip'); } catch (e) {} });
    const page = await ctx.newPage();
    const pageErrors = [];
    page.on('pageerror', e => pageErrors.push(String(e.message).slice(0, 200)));
    await page.goto('file://' + game, { waitUntil: 'load' });
    await page.waitForTimeout(1200);
    if (!report.ver) report.ver = await page.evaluate(() => (window.BY_TESTBOTS && BY_TESTBOTS.ver && BY_TESTBOTS.ver()) || '');
    const res = await page.evaluate(ms => window.BY_TESTBOTS({ ms, shots: true }), MS);
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
    report.runs.push({ size: s.tag, w: s.width, h: s.height, problems: res.problems, results: res.results, pageErrors: pageErrors.slice(0, 20) });
    // contact sheet: every game's last frame, problems outlined in red
    const cells = res.results.map(r => r.shot
      ? `<div style="border:3px solid ${r.ok ? '#2a2a4e' : '#ff3b3b'}"><img src="data:image/jpeg;base64,${fs.readFileSync(path.join(out, r.shot)).toString('base64')}" style="width:100%;display:block"><div style="padding:2px 4px">${esc(r.t)}</div></div>`
      : `<div style="border:3px solid ${r.ok ? '#2a2a4e' : '#ff3b3b'};display:grid;place-items:center;min-height:60px;padding:6px">${esc(r.t)} (page game)</div>`).join('');
    const html = '<html><body style="margin:0;background:#15152b;font:12px sans-serif;color:#fff;display:grid;grid-template-columns:repeat(8,1fr);gap:4px;padding:4px">' + cells + '</body></html>';
    const sheet = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    await sheet.setContent(html, { waitUntil: 'load' });
    await sheet.screenshot({ path: path.join(out, `sheet-${s.tag}.jpg`), type: 'jpeg', quality: 70, fullPage: true });
    await sheet.close();
    await ctx.close();
  }
  report.secs = Math.round((Date.now() - t0) / 1000);
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
  const all = report.runs.map(r => `${r.size}: ${r.problems.length} problems`).join(', ');
  console.log('Playtest done. ' + all);
  report.runs.forEach(r => r.problems.forEach(p => console.log(`[${r.size}] ${p}`)));
  await browser.close();
})().catch(e => { console.error('PLAYTEST FAILED', e.message); process.exit(1); });
