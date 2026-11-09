# Working on Blockyard Arcade (guide for AI helpers: Grok, Claude and others)

Blockyard Arcade is a free browser arcade of 65+ original block games. Read this whole file before changing anything.
A "boss" session (Claude) merges and tests all work, so follow these rules exactly.

## The rules (please follow every one)

1. **Never push to `main`.** The live website (https://glufftl25-sys.github.io/blockyard/) serves `main`. Work on your
   own branch (for Grok: `grok`), started from the newest work branch:
   `git fetch origin ccr-b5653cf1-deba6y && git checkout -B grok origin/ccr-b5653cf1-deba6y`.
   The boss merges your branch, tests it, and puts it live.
2. **Do not change the in-game game menu**: the square `#gmenu` button at the top left of every game and its panel
   (Resume, Leave, FPS/ping, Admin panel, Report), or the `/* ===== in-game menu` section (`PM`, `pm*` functions, `PERF`).
   The owner likes it exactly as it is.
3. **Do not edit the `UPDATES` list, `index.html` or `manifest.webmanifest`.** The boss adds an update entry and rebuilds
   the website for you. Put a suggested update entry in your message instead (a title and 2-4 short lines a kid could read).
4. **Only make original games.** A genre is fine (a racer, a puzzle, a runner). A copy of a specific existing game is not,
   even with a new name. Use your own art, names, levels and word lists.
5. **Check for name clashes.** `game.html`'s code runs inside one big function, so two top-level `var X` or `function X`
   with the same name silently break each other (this already broke two features once). Put everything inside your
   game's own `GAMES.<id>=(function(){ ... })();` block. Before adding any new top-level name, search `game.html` for it.
6. **Stay in your own part of the file.** Don't rewrite other games, chat, the online code (`NET`), accounts or the hub.
   If you need a change there, say so in your message.

## How the project is built

| File | What it is |
|---|---|
| `game.html` | The whole arcade (about 1.3 MB): HTML, CSS and one big script. Every game is a `GAMES.<id>` block. |
| `index.html` | The home page. **Built** by `node tools/buildsite.js`; don't edit it by hand. |
| `sw.js`, `manifest.webmanifest` | The installable app and offline copy. |
| `Blockyard-itch.zip` | The itch.io loader, which loads the live game. |
| `tools/playtest.js` | The test bots: they play every game on laptop and phone sizes. |
| `tools/dupnames.js` | Finds duplicate top-level names. |
| `tools/checkrelease.js` | Checks that the site, updates and app files agree. |

## How a game works

Each game is one self-contained block. Here is the shape (Flap Block is a good real example to read in `game.html`):

```js
/* ===== My Game (2D, original): one line saying what it is ===== */
GAMES.mygame=(function(){
  var g={kind:'canvas',title:'My Game',lw:400};   /* lw = world width; add is3d:true for 3D games */
  var st,t,score,best;
  g.pre=function(w,h){g.lw=tallLw(w,h);};          /* fits laptops and sideways phones */
  function reset(){st='ready';t=0;score=0;}
  g.start=function(){best=lsGet('by.mygame',0);reset();};
  g.stop=function(){};
  g.down=function(x,y){ /* tap or click at world x,y */ };
  g.key=function(code,isDown){ /* 'Space','ArrowLeft','KeyA',... (controllers send these too) */ };
  g.update=function(dt){ t+=dt; /* game logic, dt in seconds */ };
  g.draw=function(){ /* draw with ctx, box(x,y,w,h,colour), txt(text,x,y,size,colour); size is V.w by V.h */ };
  g.tbp=function(tb,dt){ /* test-bot pilot: play for real with tb.tap(x,y) / tb.k('Space'); return [score,'label'] */ };
  return g;
})();
HUBBEST['best-mygame']='by.mygame';                 /* shows the best score on the hub tile */
```

Helpers you can use: `beep(freq,dur,type,vol,slide)` for sounds, `lsGet`/`lsSet('by.<id>',value)` for saving
(the `by.` prefix makes cheats block best scores automatically), `cheatOn('god')`, `clampN(v,a,b)`, `P` (theme colours:
`P.sun`, `P.brick`, `P.ink`...), `V.w`/`V.h` (world size), `ctx` (the 2D canvas).
3D games use the shared 3D helpers that the existing 3D games use (read Block Sled or Maze Escape first).

Every new game also needs a hub tile button in the `#games` grid, copied from a nearby tile, with its own small inline SVG
art (an 88x88 viewBox), `data-game="<id>"`, a `data-name` of search words, and `<span id="best-<id>">`.

A finished game must:
- work with touch, keyboard and a controller (controllers arrive as the same key codes);
- fit both a laptop (1280x720) and a sideways phone (844x390);
- have clear start and game-over screens, and run at 55+ fps;
- save its best score with `lsSet('by.<id>')`;
- have a `g.tbp` pilot that really plays and scores, so the test bots can check it every day.

## Before you send your work

```
node tools/dupnames.js game.html          # must say: No duplicate top-level names
node tools/playtest.js game.html out      # needs Node + Playwright; must say 0 problems
```
(For a quick run: `PLAYTEST_MS=1000 PLAYTEST_MP=0 node tools/playtest.js game.html out`. The release check may complain
that index.html is out of date after you add a game. That one line is expected; the boss rebuilds it.)

Then push to your own branch and send a short report: what you made, the game id, the checks you ran, and a
suggested update entry.

## If you can't push to GitHub

Send just your new pieces as text, and the boss will put them in and test them:
1. the whole `GAMES.<id>=(function(){ ... })();` block, plus its `HUBBEST` line;
2. the hub tile `<button class="tile" ...>...</button>`;
3. a suggested update entry.
Your block must not depend on anything outside it except the helpers listed above.
