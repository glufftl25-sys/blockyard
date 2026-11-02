/* Checks that a Blockyard release is ready and that players will get it.
   Usage: node tools/checkrelease.js            (local checks only, no network)
          node tools/checkrelease.js --live     (also fetches the live site and compares it with main;
                                                 behind an HTTPS_PROXY it restarts itself with NODE_USE_ENV_PROXY=1)
   Local checks:
   - index.html is exactly what tools/buildsite.js would build from game.html now
   - the UPDATES list in game.html has unique ids, newest first, and index.html shows the newest one
   - the game count in index.html and manifest.webmanifest matches the arcade
   - every file sw.js and manifest.webmanifest name exists
   - the itch loader inside Blockyard-itch.zip loads game.html from the live site
   Exits with 1 when a check fails. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const root = path.join(__dirname, '..');
/* Node's fetch ignores HTTPS_PROXY unless NODE_USE_ENV_PROXY=1, so restart with it when a proxy is set */
if (process.argv.includes('--live') && (process.env.HTTPS_PROXY || process.env.https_proxy) && !process.env.NODE_USE_ENV_PROXY) {
  const r = require('child_process').spawnSync(process.execPath, process.argv.slice(1), { stdio: 'inherit', env: Object.assign({}, process.env, { NODE_USE_ENV_PROXY: '1' }) });
  process.exit(r.status == null ? 1 : r.status);
}
const SITE = 'https://glufftl25-sys.github.io/blockyard/';
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
let fails = 0;
const ok = (good, what, more) => { if (!good) fails++; console.log((good ? 'ok   ' : 'FAIL ') + what + (more ? ' - ' + more : '')); };

const updatesOf = html => { const m = html.match(/var UPDATES=(\[[\s\S]*?\]);\n/); return m ? JSON.parse(m[1]) : null; };
const game = read('game.html');
const index = read('index.html');

/* 1. index.html is up to date */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'byrel-'));
fs.mkdirSync(path.join(tmp, 'tools'));
fs.copyFileSync(path.join(root, 'tools/buildsite.js'), path.join(tmp, 'tools/buildsite.js'));
fs.copyFileSync(path.join(root, 'game.html'), path.join(tmp, 'game.html'));
execFileSync(process.execPath, [path.join(tmp, 'tools/buildsite.js')], { stdio: 'ignore' });
const built = fs.readFileSync(path.join(tmp, 'index.html'), 'utf8');
fs.rmSync(tmp, { recursive: true, force: true });
ok(built === index, 'index.html matches what buildsite.js builds now', built === index ? '' : 'run: node tools/buildsite.js');

/* 2. the Updates list */
const ups = updatesOf(game);
ok(!!ups && ups.length > 0, 'game.html has an UPDATES list', ups ? ups.length + ' entries, newest ' + ups[0].id + ' "' + ups[0].t + '"' : '');
if (ups) {
  const ids = ups.map(u => u.id), num = ids.map(id => +String(id).replace(/^u/, ''));
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  ok(!dup.length, 'UPDATES ids are unique', dup.join(' '));
  const bad = num.findIndex((n, i) => i && !(n < num[i - 1]));
  ok(bad < 0, 'UPDATES are newest first', bad < 0 ? '' : ids[bad - 1] + ' comes before ' + ids[bad]);
  const h3 = (index.match(/<article class="upd"><p class="ud">[^<]*<\/p><h3>([^<]*)<\/h3>/) || [])[1] || '';
  const want = ups[0].t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  ok(h3 === want, "index.html's newest update is the newest in game.html", h3 === want ? '' : 'site shows "' + h3 + '"');
}

/* 3. game counts */
const cards = (index.match(/<a class="game" /g) || []).length;
const mani = JSON.parse(read('manifest.webmanifest'));
const mn = +((mani.description || '').match(/\d+/) || [0])[0];
ok(cards >= 10, 'index.html lists the games', cards + ' game cards');
ok(mn === cards, 'manifest.webmanifest game count matches', 'manifest says ' + mn + ', site lists ' + cards);

/* 4. files named by sw.js and the manifest exist */
const sw = read('sw.js');
const core = JSON.parse(((sw.match(/var CORE\s*=\s*(\[[^\]]*\])/) || [])[1] || '[]').replace(/'/g, '"'));
ok(core.length > 0, 'sw.js has a CORE list', core.join(' '));
const named = core.concat([mani.start_url, mani.id].concat((mani.icons || []).map(i => i.src)))
  .filter(Boolean).map(f => f.replace(/^\.\//, '').split(/[?#]/)[0]).filter(f => f);
const missing = [...new Set(named)].filter(f => !fs.existsSync(path.join(root, f)));
ok(!missing.length, 'every file sw.js and the manifest name exists', missing.join(' '));
const reg = (game.match(/serviceWorker\.register\('([^']+)'/) || [])[1];
ok(reg === 'sw.js', 'game.html registers sw.js', reg || 'no register call found');
const refs = [...new Set((index.match(/(?:src|href)="(site\/[^"]+|icon-[^"]+|manifest\.webmanifest|game\.html|bots\.html)[#"]/g) || [])
  .map(s => s.replace(/^(?:src|href)="/, '').replace(/[#"]$/, '')))];
const miss2 = refs.filter(f => !fs.existsSync(path.join(root, f)));
ok(!miss2.length, 'every local file index.html links to exists', miss2.length ? miss2.join(' ') : refs.length + ' files');

/* 5. the itch loader */
let loader = '';
try { loader = execFileSync('unzip', ['-p', path.join(root, 'Blockyard-itch.zip'), 'index.html'], { encoding: 'utf8' }); } catch (e) { }
ok(!!loader, 'Blockyard-itch.zip has an index.html loader');
if (loader) {
  const src = ((loader.match(/var SOURCES\s*=\s*\[([\s\S]*?)\]/) || [])[1] || '').match(/'[^']+'/g) || [];
  const first = (src[0] || '').replace(/'/g, '');
  ok(first === SITE + 'game.html', 'itch loader loads the live game first', first || 'no SOURCES found');
  ok(/cache:\s*'no-store'/.test(loader) && /v='\+Date\.now\(\)/.test(loader), 'itch loader skips old cached copies when online');
  ok(/caches\.open\(BOX\)/.test(loader) && /c\.put\(KEY/.test(loader), 'itch loader keeps a copy for offline in the Cache API');
  ok(/\}\)\.catch\(function\(\)\{return tryFrom\(i\+1\)/.test(loader), 'itch loader tries the next address when one answers with a non-game');
}

/* 6. with --live: compare the live site with main */
async function live() {
  const get = async u => { const r = await fetch(u + (u.includes('?') ? '&' : '?') + 'v=' + Date.now(), { cache: 'no-store' }); if (!r.ok) throw new Error(u + ' answered ' + r.status); return r.text(); };
  let mainGame = '';
  try { mainGame = execFileSync('git', ['show', 'origin/main:game.html'], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 }); } catch (e) { }
  const mainNew = mainGame && (updatesOf(mainGame) || [])[0];
  console.log('info main (origin/main, run git fetch first) newest update: ' + (mainNew ? mainNew.id + ' "' + mainNew.t + '"' : 'unknown'));
  console.log('info this checkout newest update: ' + (ups ? ups[0].id : 'unknown'));
  try {
    const lg = await get(SITE + 'game.html');
    const ln = (updatesOf(lg) || [])[0];
    ok(!!ln && !!mainNew && ln.id === mainNew.id, 'live game.html has the same newest update as main', 'live ' + (ln ? ln.id : '?') + ', main ' + (mainNew ? mainNew.id : '?'));
    const li = await get(SITE);
    const lh = (li.match(/<article class="upd"><p class="ud">[^<]*<\/p><h3>([^<]*)<\/h3>/) || [])[1];
    ok(!lh || !ln || lh === ln.t.replace(/&/g, '&amp;').replace(/'/g, '&#39;').replace(/"/g, '&quot;'), "live home page's newest update matches the live game", 'home "' + (lh || 'no updates section') + '"');
    const lsw = await get(SITE + 'sw.js');
    console.log('info live sw.js is ' + (lsw === sw ? 'the same as' : 'different from') + ' this checkout');
  } catch (e) {
    ok(false, 'live site reachable', e.message + (e.cause ? ' (' + (e.cause.code || e.cause.message) + ')' : ''));
  }
}

(process.argv.includes('--live') ? live() : Promise.resolve()).then(() => {
  console.log(fails ? fails + ' check(s) failed' : 'all checks passed');
  process.exit(fails ? 1 : 0);
});
