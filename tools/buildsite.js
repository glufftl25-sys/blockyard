/* Builds the Blockyard website (index.html) from game.html, so the site always lists the games that are really in the
   arcade, with their own tile art, plus the newest updates.
   Usage: node tools/buildsite.js            (reads game.html, writes index.html next to it)
   Run it again after adding a game or an update. Each game card links to game.html#play=<id>, which opens that game. */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const game = fs.readFileSync(path.join(root, 'game.html'), 'utf8');
const SITE = 'https://glufftl25-sys.github.io/blockyard/';
const ITCH = 'https://bloxyard.itch.io/blockyard-arcade';

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const text = h => h.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();

/* the hub's game grid: <div class="grid" id="games"> ... the tiles ... */
const gs = game.indexOf('id="games"');
if (gs < 0) throw new Error('game grid not found in game.html');
const grid = game.slice(gs, game.indexOf('</div>', gs));
const games = [];
const tileRe = /<button class="tile"[^>]*data-game="([a-z0-9]+)"[^>]*data-name="([^"]*)"[^>]*style="--c:(#[0-9a-fA-F]{3,6})"[^>]*>([\s\S]*?)<\/button>/g;
let m;
while ((m = tileRe.exec(grid))) {
  const [, id, words, color, inner] = m;
  const tt = (inner.match(/<span class="tt">([\s\S]*?)<\/span>/) || [])[1];
  const ts = (inner.match(/<span class="ts">([\s\S]*)<\/span>/) || [])[1] || '';
  const art = (inner.match(/<svg class="art"[\s\S]*?<\/svg>/) || [])[0];
  if (!tt || !art) continue;
  const parts = text(ts).split('·').map(s => s.trim()).filter(Boolean);
  const tag = parts.length > 1 ? parts[parts.length - 1] : (/^(best|wins|lv|level|round|score)\b/i.test(parts[0] || '') ? '' : (parts[0] || ''));
  /* Yard Escape (groups of 1-5) and Balloon Battle (matches with a code) are online too, but their tiles have no ONLINE badge */
  const is3d = /class="b3d"/.test(inner), online = /class="bon"/.test(inner) || /\bonline\b/.test(words) || id === 'yard' || id === 'td';
  games.push({ id, title: text(tt), tag, color, art, is3d, online, words: (words + ' ' + text(tt)).toLowerCase() });
}
if (games.length < 10) throw new Error('only found ' + games.length + ' games');

/* the newest updates from the UPDATES list */
let updates = [];
const um = game.match(/var UPDATES=(\[[\s\S]*?\]);\n/);
if (um) { try { updates = JSON.parse(um[1]).slice(0, 4); } catch (e) { updates = []; } }

const n = games.length, nOnline = games.filter(g => g.online).length, n3d = games.filter(g => g.is3d).length;
/* a real picture of the game (made by tools/gameshots.js) when there is one; the tile art otherwise */
const shot = id => fs.existsSync(path.join(root, 'site/shots/games', id + '.jpg')) ? 'site/shots/games/' + id + '.jpg' : '';
const card = g => `
      <a class="game" href="game.html#play=${esc(g.id)}" style="--c:${g.color}" data-k="${g.is3d ? '3d' : '2d'}${g.online ? ' online' : ''}" data-w="${esc(g.words)}">
        <span class="thumb">${g.art.replace('class="art"', 'class="art" focusable="false"')}${shot(g.id) ? `<img class="real" src="${shot(g.id)}" alt="" loading="lazy" decoding="async">` : ''}${g.is3d ? '<b class="tag3d">3D</b>' : ''}${g.online ? '<b class="tagon">ONLINE</b>' : ''}</span>
        <span class="gt">${esc(g.title)}</span>${g.tag ? `<span class="gs">${esc(g.tag)}</span>` : ''}
      </a>`;
const upd = u => `
      <article class="upd"><p class="ud">${esc(u.d || '')}</p><h3>${esc(u.t || '')}</h3><ul>${(u.x || []).slice(0, 4).map(x => `<li>${esc(x)}</li>`).join('')}</ul></article>`;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Blockyard Arcade</title>
<meta name="description" content="${n} free block games in one arcade. Play in your browser on a phone, tablet or computer, online with friends, with a controller or touch.">
<meta name="theme-color" content="#15152b">
<link rel="icon" href="site/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="icon-192.png">
<link rel="manifest" href="manifest.webmanifest">
<meta property="og:type" content="website">
<meta property="og:title" content="Blockyard Arcade">
<meta property="og:description" content="${n} free block games in one arcade. Play in your browser, online with friends.">
<meta property="og:url" content="${SITE}">
<meta property="og:image" content="${SITE}site/shots/hub.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Lilita+One&family=Nunito:wght@600;700;800&display=swap">
<style>
:root{
  --bg:#15152b;--panel:#0e0e1f;--raise:#222243;--raise2:#2d2d55;--text:#f3f4ff;--muted:#a9aed3;
  --ink:#14213d;--brick:#ff5a4d;--brick-dark:#c23a30;--sun:#ffd23f;--grass:#3fd58a;--cyan:#3cc8f0;--lilac:#b9a4ff;
  --display:'Lilita One','Arial Rounded MT Bold','Trebuchet MS',system-ui,sans-serif;
  --body:'Nunito','Trebuchet MS',system-ui,sans-serif;
  color-scheme:dark;
}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}*{animation:none!important;transition:none!important}}
body{margin:0;background:var(--bg);color:var(--text);font:700 17px/1.5 var(--body);-webkit-font-smoothing:antialiased;overflow-x:hidden}
a{color:inherit}
img,svg{display:block;max-width:100%}
.wrap{width:min(1160px,100% - 32px);margin-inline:auto}
:focus-visible{outline:3px solid var(--sun);outline-offset:3px;border-radius:8px}
.skip{position:absolute;left:-999px;top:8px;background:var(--sun);color:var(--ink);padding:8px 14px;border-radius:10px;z-index:9}
.skip:focus{left:16px}

/* header */
.top{position:sticky;top:0;z-index:5;background:rgba(21,21,43,.86);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border-bottom:1px solid rgba(255,255,255,.08)}
.top .wrap{display:flex;align-items:center;gap:18px;height:64px}
.brand{display:flex;align-items:center;gap:10px;text-decoration:none;font:400 24px/1 var(--display);letter-spacing:.3px}
.brand img{width:34px;height:34px}
.nav{display:flex;gap:6px;margin-left:auto}
.nav a{text-decoration:none;color:var(--muted);padding:8px 12px;border-radius:10px;font-weight:800;font-size:15px}
.nav a:hover{color:var(--text);background:var(--raise)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;text-decoration:none;font:400 20px/1 var(--display);letter-spacing:.4px;
  padding:14px 26px;border-radius:14px;border:3px solid var(--ink);background:var(--sun);color:var(--ink);box-shadow:0 5px 0 var(--ink);transition:transform .08s,box-shadow .08s}
.btn:hover{transform:translateY(-2px);box-shadow:0 7px 0 var(--ink)}
.btn:active{transform:translateY(3px);box-shadow:0 2px 0 var(--ink)}
.btn.alt{background:#fff}
.btn.small{font-size:16px;padding:9px 16px;box-shadow:0 4px 0 var(--ink)}
@media (max-width:760px){.nav{display:none}.top .btn.small{margin-left:auto}}

/* hero */
.hero{position:relative;padding:64px 0 56px;overflow:hidden}
.hero::before{content:"";position:absolute;inset:0;background:
  radial-gradient(60% 70% at 85% 10%,rgba(60,200,240,.22),transparent 70%),
  radial-gradient(50% 60% at 5% 90%,rgba(255,90,77,.18),transparent 70%);pointer-events:none}
.hero .wrap{position:relative;display:grid;grid-template-columns:1.05fr 1fr;gap:48px;align-items:center}
.kicker{display:inline-flex;gap:8px;align-items:center;background:var(--raise);border:1px solid rgba(255,255,255,.1);padding:6px 12px;border-radius:999px;font-size:14px;color:var(--muted);margin:0 0 18px}
.kicker b{color:var(--grass)}
h1{font:400 clamp(46px,7vw,84px)/.98 var(--display);margin:0 0 18px;letter-spacing:.5px}
h1 span{color:var(--sun)}
.lead{font-size:clamp(18px,2.2vw,21px);color:var(--muted);margin:0 0 28px;max-width:34em}
.cta{display:flex;flex-wrap:wrap;gap:14px}
.facts{display:flex;flex-wrap:wrap;gap:26px;margin:34px 0 0;padding:0;list-style:none}
.facts li{display:flex;flex-direction:column}
.facts b{font:400 34px/1 var(--display);color:var(--text)}
.facts span{font-size:14px;color:var(--muted)}
.shot{position:relative;border-radius:22px;border:4px solid var(--ink);box-shadow:0 10px 0 var(--ink),0 30px 60px rgba(0,0,0,.45);overflow:hidden;background:var(--panel);transform:rotate(1.5deg)}
.shot img{width:100%;height:auto}
.blocks{position:absolute;inset:0;pointer-events:none}
.blocks i{position:absolute;width:26px;height:26px;border:3px solid var(--ink);border-radius:5px;animation:float 6s ease-in-out infinite}
@keyframes float{50%{transform:translateY(-14px) rotate(8deg)}}
@media (max-width:900px){.blocks{display:none}.hero{padding:40px 0}.hero .wrap{grid-template-columns:1fr;gap:34px}.shot{transform:none}}

/* sections */
section{scroll-margin-top:72px}
.sec{padding:56px 0}
.sec h2{font:400 clamp(32px,4.5vw,46px)/1.05 var(--display);margin:0 0 8px;letter-spacing:.4px}
.sec .sub{color:var(--muted);margin:0 0 26px}

/* games */
.tools{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:0 0 22px}
.chip{font:800 15px/1 var(--body);padding:10px 16px;border-radius:999px;border:2px solid var(--raise2);background:var(--raise);color:var(--text);cursor:pointer}
.chip[aria-pressed="true"]{background:var(--sun);color:var(--ink);border-color:var(--ink)}
.find{margin-left:auto;flex:1 1 220px;max-width:320px;font:700 16px var(--body);padding:11px 16px;border-radius:12px;border:2px solid var(--raise2);background:var(--panel);color:var(--text)}
.find::placeholder{color:var(--muted)}
@media (max-width:620px){.find{margin-left:0;max-width:none}}
.games{display:grid;grid-template-columns:repeat(auto-fill,minmax(168px,1fr));gap:16px}
.game{display:flex;flex-direction:column;text-decoration:none;background:#fff;color:var(--ink);border:3px solid var(--ink);border-radius:16px;overflow:hidden;box-shadow:0 5px 0 var(--ink);transition:transform .1s,box-shadow .1s}
.game[hidden]{display:none}
.game:hover{transform:translateY(-4px);box-shadow:0 9px 0 var(--ink)}
.game .thumb{position:relative;display:block;aspect-ratio:1;border-bottom:3px solid var(--ink);background:var(--c)}
.game .art{width:100%;height:100%}
/* the real picture covers the tile art on hover or focus. Touch screens keep the tile art, which reads better that
   small, and never download the pictures (a lazy image that is not shown is not fetched) */
.game .real{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity .18s}
.game:hover .real,.game:focus-visible .real{opacity:1}
@media (hover:none){.game .real{display:none}}
.game .thumb b{position:absolute;top:8px;font:800 11px/1 var(--body);padding:4px 7px;border-radius:7px;border:2px solid var(--ink);letter-spacing:.5px}
.tag3d{left:8px;background:var(--cyan)}
.tagon{right:8px;background:var(--grass)}
.gt{font:400 19px/1.1 var(--display);padding:10px 12px 0;letter-spacing:.3px}
.gs{font-size:13px;font-weight:800;opacity:.65;padding:2px 12px 12px}
.gt:last-child{padding-bottom:12px}
.none{color:var(--muted);text-align:center;padding:30px 0}
@media (max-width:480px){.games{grid-template-columns:repeat(3,1fr);gap:10px}.game{border-radius:12px;box-shadow:0 4px 0 var(--ink)}.gt{font-size:14px;padding:7px 8px 9px}.gs{display:none}.game .thumb b{top:5px;font-size:9px;padding:3px 4px}.tag3d{left:5px}.tagon{right:5px}}

/* features */
.feats{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
.feat{background:var(--raise);border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:22px}
.feat .ic{width:48px;height:48px;border-radius:12px;border:3px solid var(--ink);display:grid;place-items:center;margin:0 0 14px;box-shadow:0 4px 0 var(--ink)}
.feat .ic svg{width:26px;height:26px}
.feat h3{font:400 23px/1.15 var(--display);margin:0 0 6px;letter-spacing:.3px}
.feat p{margin:0;color:var(--muted);font-size:16px}
@media (max-width:900px){.feats{grid-template-columns:repeat(2,1fr)}}
@media (max-width:560px){.feats{grid-template-columns:1fr}}

/* screenshots */
.shots{display:grid;grid-template-columns:1fr 1fr;gap:20px}
.shots figure{margin:0;border-radius:18px;overflow:hidden;border:3px solid var(--ink);box-shadow:0 6px 0 var(--ink);background:var(--panel)}
.shots img{width:100%;height:auto}
.shots figcaption{padding:10px 14px;font-size:15px;color:var(--muted)}
@media (max-width:720px){.shots{grid-template-columns:1fr}}

/* updates */
.upds{display:grid;grid-template-columns:repeat(2,1fr);gap:18px}
.upd{background:var(--raise);border-left:6px solid var(--sun);border-radius:14px;padding:18px 20px}
.upd .ud{margin:0;font-size:13px;color:var(--muted);text-transform:uppercase;letter-spacing:.8px}
.upd h3{font:400 24px/1.15 var(--display);margin:4px 0 8px}
.upd ul{margin:0;padding-left:20px;color:var(--muted);font-size:15px}
.upd li+li{margin-top:4px}
@media (max-width:760px){.upds{grid-template-columns:1fr}}

/* get it */
.plats{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
.plat{display:flex;flex-direction:column;gap:14px;background:var(--raise);border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:22px}
.plat h3{font:400 26px/1.1 var(--display);margin:0;letter-spacing:.3px}
.plat .btn{align-self:flex-start;font-size:18px;padding:12px 20px}
.plat ol{margin:0;padding-left:22px;color:var(--muted);font-size:16px}
.plat li+li{margin-top:6px}
.plat li b,.plat .nodl b{color:var(--text)}
.plat .nodl{margin:0;font-size:14px;color:var(--muted)}
.more{margin:20px 0 0;color:var(--muted)}
@media (max-width:900px){.plats{grid-template-columns:1fr}}
.band{background:linear-gradient(135deg,#2d2d55,#222243);border:3px solid var(--ink);border-radius:24px;padding:38px;display:grid;grid-template-columns:1.3fr 1fr;gap:30px;align-items:center;box-shadow:0 8px 0 var(--ink)}
.band h2{margin-bottom:10px}
.band ol{margin:0;padding-left:22px;color:var(--muted)}
.band li+li{margin-top:6px}
.band .cta{justify-content:flex-end}
@media (max-width:820px){.band{grid-template-columns:1fr;padding:26px}.band .cta{justify-content:flex-start}}

footer{padding:40px 0 calc(40px + env(safe-area-inset-bottom,0px));color:var(--muted);font-size:15px;border-top:1px solid rgba(255,255,255,.08);margin-top:30px}
footer .wrap{display:flex;flex-wrap:wrap;gap:12px 26px;align-items:center}
footer nav{display:flex;flex-wrap:wrap;gap:8px 20px;margin-left:auto}
footer a{color:var(--muted)}
footer a:hover{color:var(--text)}
</style>
</head>
<body>
<a class="skip" href="#games">Skip to the games</a>
<header class="top">
  <div class="wrap">
    <a class="brand" href="#top"><img src="site/favicon.svg" alt="" width="34" height="34">Blockyard</a>
    <nav class="nav" aria-label="Sections"><a href="#games">Games</a><a href="#features">Features</a><a href="#updates">Updates</a><a href="#get">Get the app</a></nav>
    <a class="btn small" href="game.html">Play now</a>
  </div>
</header>

<main id="top">
  <section class="hero">
    <div class="blocks" aria-hidden="true">
      <i style="left:6%;top:16%;background:var(--sun)"></i><i style="left:44%;top:8%;background:var(--grass);animation-delay:-2s"></i>
      <i style="left:3%;bottom:14%;background:var(--cyan);animation-delay:-4s"></i><i style="right:4%;bottom:10%;background:var(--brick);animation-delay:-1s"></i>
    </div>
    <div class="wrap">
      <div>
        <p class="kicker"><b>&#9679;</b> Free &middot; plays in your browser &middot; no download</p>
        <h1>Blockyard <span>Arcade</span></h1>
        <p class="lead">${n} block games in one place. Race, build, shoot, puzzle and party on a phone, tablet or computer. Play solo, against bots, or online with your friends.</p>
        <div class="cta">
          <a class="btn" href="game.html">&#9654; Play now</a>
          <a class="btn alt" href="#games">See all games</a>
        </div>
        <ul class="facts">
          <li><b>${n}</b><span>games</span></li>
          <li><b>${nOnline}</b><span>online games</span></li>
          <li><b>${n3d}</b><span>3D games</span></li>
        </ul>
      </div>
      <div class="shot"><img src="site/shots/hub.png" alt="The Blockyard Arcade hub with game tiles" width="1280" height="720"></div>
    </div>
  </section>

  <section class="sec" id="games" aria-labelledby="games-h">
    <div class="wrap">
      <h2 id="games-h">Every game</h2>
      <p class="sub">Tap a game to jump straight in.</p>
      <div class="tools" role="toolbar" aria-label="Filter games">
        <button class="chip" type="button" data-f="all" aria-pressed="true">All ${n}</button>
        <button class="chip" type="button" data-f="online" aria-pressed="false">Online</button>
        <button class="chip" type="button" data-f="3d" aria-pressed="false">3D</button>
        <button class="chip" type="button" data-f="2d" aria-pressed="false">2D</button>
        <input class="find" id="find" type="search" placeholder="Find a game" aria-label="Find a game" autocomplete="off">
      </div>
      <div class="games" id="grid">${games.map(card).join('')}
      </div>
      <p class="none" id="none" hidden>No games match that. Try another word.</p>
    </div>
  </section>

  <section class="sec" id="features" aria-labelledby="feat-h">
    <div class="wrap">
      <h2 id="feat-h">More than a game list</h2>
      <p class="sub">Everything you need to play with friends is built in.</p>
      <div class="feats">
        <div class="feat"><div class="ic" style="background:var(--grass)"><svg viewBox="0 0 24 24" fill="none" stroke="#14213d" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="9" r="3"/><circle cx="16.5" cy="9" r="3"/><path d="M2.5 19c.8-3 3-4.5 5.5-4.5s4.7 1.5 5.5 4.5M11 19c.8-3 3-4.5 5.5-4.5S21.2 16 22 19"/></svg></div><h3>Play online</h3><p>${nOnline} games put you in a room with people on the website, the app and itch.io. When nobody else is there, bots fill in.</p></div>
        <div class="feat"><div class="ic" style="background:var(--sun)"><svg viewBox="0 0 24 24" fill="none" stroke="#14213d" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></svg></div><h3>Locked friend chat</h3><p>Chat with friends and parties of up to 12. Messages are end-to-end encrypted, and bad words are blurred.</p></div>
        <div class="feat"><div class="ic" style="background:var(--cyan)"><svg viewBox="0 0 24 24" fill="none" stroke="#14213d" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 8h11a4 4 0 0 1 3.9 4.9l-1 4.3a2.3 2.3 0 0 1-4 .9L14.6 16H9.4l-1.8 2.1a2.3 2.3 0 0 1-4-.9l-1-4.3A4 4 0 0 1 6.5 8z"/><path d="M8 11v3M6.5 12.5h3"/><circle cx="16" cy="12" r=".6" fill="#14213d"/></svg></div><h3>Touch or controller</h3><p>Every game works with a phone screen, keyboard and mouse, or a gamepad. Change the buttons, stick size and look speed.</p></div>
        <div class="feat"><div class="ic" style="background:var(--lilac)"><svg viewBox="0 0 24 24" fill="none" stroke="#14213d" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg></div><h3>Works offline</h3><p>Install Blockyard as an app and it keeps a copy for when you have no internet. It updates by itself.</p></div>
        <div class="feat"><div class="ic" style="background:var(--brick)"><svg viewBox="0 0 24 24" fill="none" stroke="#14213d" stroke-width="2.4" stroke-linejoin="round"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/></svg></div><h3>Build your own worlds</h3><p>Studio lets you build 3D worlds out of blocks, add simple scripts, test them and publish them for others.</p></div>
        <div class="feat"><div class="ic" style="background:#fff"><svg viewBox="0 0 24 24" fill="none" stroke="#14213d" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="7" width="14" height="11" rx="3"/><path d="M12 3v4M9 12h.01M15 12h.01M9.5 15h5"/></svg></div><h3>Tested every day</h3><p>Test bots play every game on laptop and phone sizes each day and report anything broken. <a href="bots.html">See today's report</a>.</p></div>
      </div>
    </div>
  </section>

  <section class="sec" aria-labelledby="shots-h">
    <div class="wrap">
      <h2 id="shots-h">Blaster Duel</h2>
      <p class="sub">The biggest game in the arcade: walk the 3D lobby, pick a duel pad, and fight 1v1 up to 5v5.</p>
      <div class="shots">
        <figure><img src="site/shots/blaster-duel-lobby.png" alt="The Blaster Duel lobby with duel pads" loading="lazy" width="1280" height="720"><figcaption>Step on a pad to pick 1v1 up to 5v5</figcaption></figure>
        <figure><img src="site/shots/blaster-duel.png" alt="A Blaster Duel fight" loading="lazy" width="1280" height="720"><figcaption>Unlock weapons in the shop, or practise against ClaudeBot</figcaption></figure>
      </div>
      <p style="margin:22px 0 0"><a class="btn small" href="game.html#play=duelmenu">Play Blaster Duel</a></p>
    </div>
  </section>
${updates.length ? `
  <section class="sec" id="updates" aria-labelledby="upd-h">
    <div class="wrap">
      <h2 id="upd-h">What's new</h2>
      <p class="sub">The latest updates. The full list is in the game under Updates.</p>
      <div class="upds">${updates.map(upd).join('')}
      </div>
    </div>
  </section>` : ''}

  <section class="sec" id="get" aria-labelledby="get-h">
    <div class="wrap">
      <h2 id="get-h">Get the app</h2>
      <p class="sub">Free on every device. The app opens full screen, works offline, and updates itself.</p>
      <div class="plats">
        <article class="plat">
          <h3>Android</h3>
          <a class="btn" href="downloads/blockyard.apk" download>&#11015; Download for Android</a>
          <ol>
            <li>Tap the button and open the file when it finishes.</li>
            <li>If your phone asks, allow your browser to install apps.</li>
            <li>Tap <b>Install</b>. Blockyard shows up with your other apps.</li>
          </ol>
          <p class="nodl">Or with no download: open this page in Chrome, tap &#8942;, then <b>Install app</b>.</p>
        </article>
        <article class="plat">
          <h3>iPhone &amp; iPad</h3>
          <a class="btn alt" href="game.html">Open Blockyard</a>
          <ol>
            <li>Open this page in <b>Safari</b>.</li>
            <li>Tap the <b>Share</b> button (the square with an arrow).</li>
            <li>Tap <b>Add to Home Screen</b>, then <b>Add</b>.</li>
          </ol>
        </article>
        <article class="plat">
          <h3>Computer</h3>
          <a class="btn alt" href="game.html">Open Blockyard</a>
          <ol>
            <li>Open Blockyard in <b>Chrome</b> or <b>Edge</b>.</li>
            <li>Click the install icon at the right end of the address bar, or open the game's <b>Settings</b> and click <b>Install Blockyard</b>.</li>
            <li>It opens in its own window, like any other program.</li>
          </ol>
        </article>
      </div>
      <p class="more">Prefer itch.io? <a href="${ITCH}" rel="noopener">Blockyard is on itch.io too</a>.</p>
    </div>
  </section>
</main>

<footer>
  <div class="wrap">
    <span>Blockyard Arcade &middot; ${n} games${updates[0] ? ' &middot; updated ' + esc(updates[0].d) : ''}</span>
    <nav aria-label="More"><a href="game.html">Play</a><a href="${ITCH}" rel="noopener">itch.io</a><a href="bots.html">Test bots</a><a href="privacy.html">Privacy</a><a href="https://github.com/glufftl25-sys/blockyard" rel="noopener">Source</a></nav>
  </div>
</footer>

<script>
(function(){
  var grid=document.getElementById('grid'),find=document.getElementById('find'),none=document.getElementById('none');
  var chips=document.querySelectorAll('.chip'),f='all';
  function apply(){
    var q=find.value.trim().toLowerCase(),shown=0;
    Array.prototype.forEach.call(grid.children,function(a){
      var ok=(f==='all'||(' '+a.getAttribute('data-k')+' ').indexOf(' '+f+' ')>=0)&&(!q||a.getAttribute('data-w').indexOf(q)>=0);
      a.hidden=!ok;if(ok)shown++;
    });
    none.hidden=shown>0;
  }
  Array.prototype.forEach.call(chips,function(c){
    c.addEventListener('click',function(){
      f=c.getAttribute('data-f');
      Array.prototype.forEach.call(chips,function(x){x.setAttribute('aria-pressed',String(x===c));});
      apply();
    });
  });
  find.addEventListener('input',apply);
})();
</script>
</body>
</html>
`;
fs.writeFileSync(path.join(root, 'index.html'), html);
console.log('index.html: ' + n + ' games (' + nOnline + ' online, ' + n3d + ' 3D), ' + updates.length + ' updates');
