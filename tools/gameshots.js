/* Takes a real picture of every game for the website: opens game.html, lets the test-bot pilot play the game for a few
   seconds, and saves the game screen as site/shots/games/<id>.jpg (360 px wide, about 15-35 KB).
   Usage: node tools/gameshots.js             (only games that have no picture yet)
          node tools/gameshots.js --all       (every game again)
          node tools/gameshots.js snake golf  (just these games)
   Then run node tools/buildsite.js so the home page uses the new pictures. Runs offline (only the fonts are fetched). */
const fs = require('fs');
const path = require('path');
const { chromium, launchOpts } = require('./pw.js');
const root = path.join(__dirname, '..');
const out = path.join(root, 'site/shots/games');
/* these open a screen that is not the game (an account form, the hub), so they keep their tile art on the site */
const SKIP = ['duelmenu', 'obbymp'];
const W = 360, Q = 0.72, MAX = 40 * 1024, WAIT = Number(process.env.SHOT_WAIT || 3200);

const game = fs.readFileSync(path.join(root, 'game.html'), 'utf8');
const gs = game.indexOf('id="games"');
const grid = game.slice(gs, game.indexOf('</div>', gs));
const tiles = [...grid.matchAll(/<button class="tile"[^>]*data-game="([a-z0-9]+)"/g)].map(m => m[1]);
const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const all = process.argv.includes('--all');
fs.mkdirSync(out, { recursive: true });
const ids = (args.length ? args : tiles.filter(id => !SKIP.includes(id))).filter(id => all || args.length || !fs.existsSync(path.join(out, id + '.jpg')));

(async () => {
  if (!ids.length) { console.log('every game already has a picture (use --all to take them again)'); return; }
  const browser = await chromium.launch(launchOpts());
  const ctx = await browser.newContext({ viewport: { width: 760, height: 600 }, deviceScaleFactor: 1 });
  await ctx.route(/^https?:\/\//, r => /^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(r.request().url()) ? r.continue() : r.abort());
  await ctx.addInitScript(() => { try { sessionStorage.setItem('by.gate', 'skip'); } catch (e) { } });
  const pg = await ctx.newPage();
  let bad = 0, saved = 0;
  for (const id of ids) {
    try {
      if (!tiles.includes(id)) { console.log('skip ' + id + ' - no tile with that id in game.html'); continue; }
      await pg.goto('file://' + path.join(root, 'game.html'), { waitUntil: 'load' });
      await pg.waitForFunction(() => !!window.BY_TESTBOTS, null, { timeout: 10000 });
      pg.evaluate(id => window.BY_TESTBOTS({ ids: [id], ms: 30000 }), id).catch(() => { });
      await pg.waitForTimeout(WAIT);
      /* hide the test-bot bar, hand and key hint so only the game shows */
      await pg.addStyleTag({ content: '#tbbar,#tbhand,#tbkey{display:none!important}' });
      /* most games draw on the stage; a few (Blaster Duel, Story...) use their own full screen */
      const stage = pg.locator('#stage');
      const png = await stage.isVisible() ? await stage.screenshot({ type: 'png' }) : await pg.screenshot({ type: 'png' });
      await pg.evaluate(() => window.BY_TESTBOTS.stop && window.BY_TESTBOTS.stop()).catch(() => { });
      const jpg = await pg.evaluate(async ({ b64, W, Q, MAX }) => {
        const im = new Image(); im.src = 'data:image/png;base64,' + b64; await im.decode();
        const c = document.createElement('canvas'); c.width = W; c.height = Math.round(im.height * W / im.width);
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        let q = Q, d;
        do { d = c.toDataURL('image/jpeg', q); q -= 0.08; } while (d.length * 0.75 > MAX && q > 0.3);
        return d.split(',')[1];
      }, { b64: png.toString('base64'), W, Q, MAX });
      const buf = Buffer.from(jpg, 'base64');
      fs.writeFileSync(path.join(out, id + '.jpg'), buf);
      saved++;
      console.log('ok   ' + id + ' ' + Math.round(buf.length / 1024) + ' KB');
    } catch (e) {
      bad++;
      console.log('FAIL ' + id + ' - ' + String(e.message).split('\n')[0]);
    }
  }
  await browser.close();
  console.log(saved + ' of ' + ids.length + ' pictures saved in site/shots/games');
  process.exit(bad ? 1 : 0);
})();
