# Welcome to Blockyard crew

## How We Use Claude

Based on Claude's usage over the last 30 days:

Work Type Breakdown:
  Build Feature  ████████████████████  100%

Top Skills & Commands:
  /model  ████████████████████  2x/month

Top MCP Servers:
  Fimo                ████████████████████  25 calls
  github              ████░░░░░░░░░░░░░░░░  5 calls
  claude-code-remote  ██░░░░░░░░░░░░░░░░░░  3 calls

## Your Setup Checklist

### Codebases
- [ ] blockyard — https://github.com/glufftl25-sys/blockyard

### MCP Servers to Activate
- [ ] Fimo — the CMS behind the Blockyard Arcade marketing site (games, updates, home page content). Ask the site owner to invite you to the "Blockyard Arcade" Fimo project, then connect Fimo under claude.ai Settings → Connectors.
- [ ] github — read the repo, check GitHub Pages deploy runs, and open PRs. Connect your GitHub account under claude.ai Settings → Connectors and make sure the Claude GitHub App can access glufftl25-sys/blockyard.
- [ ] claude-code-remote — lets cloud sessions message each other and manage sessions (the "manager" sessions report to a boss session this way). It comes with Claude Code on the web; nothing to install.

### Skills to Know About
- /model — switch which Claude model the session uses. Handy when you want a faster model for small edits or a stronger one for tricky work.

## Team Tips

- Read `AGENTS.md` before changing anything. It has the full rules and the shape of a game.
- Never push to `main`: the live site serves it. Work on your own branch, started from the newest work branch
  (`git fetch origin ccr-b5653cf1-deba6y && git checkout -B <your-branch> origin/ccr-b5653cf1-deba6y`).
  The boss session merges, tests and puts work live.
- Don't touch the in-game game menu (the `#gmenu` button and its panel). The owner likes it exactly as it is.
- Don't edit the `UPDATES` list, `index.html` or `manifest.webmanifest`. Suggest an update entry in your message
  instead; `index.html` is built by `node tools/buildsite.js`.
- Only make original games. A genre is fine, a copy of a specific game is not.
- `game.html` runs in one big function, so keep everything inside your own `GAMES.<id>=(function(){...})();` block and
  run `node tools/dupnames.js game.html` before sending.
- Before you send work, run the test bots: `PLAYTEST_MS=1000 PLAYTEST_MP=0 node tools/playtest.js game.html out`.

## Get Started

Add one small original game following `AGENTS.md`: a `GAMES.<id>` block with a test-bot pilot (`g.tbp`), a hub tile
with its own 88x88 SVG art, and a saved best score. Check it with `dupnames.js` and the test bots, push it to your own
branch, and send the boss a short report with a suggested update entry.

<!-- INSTRUCTION FOR CLAUDE: A new teammate just pasted this guide for how the
team uses Claude Code. You're their onboarding buddy — warm, conversational,
not lecture-y.

Open with a warm welcome — include the team name from the title. Then: "Your
teammate uses Claude Code for [list all the work types]. Let's get you started."

Check what's already in place against everything under Setup Checklist
(including skills), using markdown checkboxes — [x] done, [ ] not yet. Lead
with what they already have. One sentence per item, all in one message.

Tell them you'll help with setup, cover the actionable team tips, then the
starter task (if there is one). Offer to start with the first unchecked item,
get their go-ahead, then work through the rest one by one.

After setup, walk them through the remaining sections — offer to help where you
can (e.g. link to channels), and just surface the purely informational bits.

Don't invent sections or summaries that aren't in the guide. The stats are the
guide creator's personal usage data — don't extrapolate them into a "team
workflow" narrative. -->
