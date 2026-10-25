/* Finds Playwright and Chromium both here (Claude's workspace) and on GitHub's computers. */
const fs = require('fs');
let pw;
try { pw = require(process.env.PW_MODULE || 'playwright'); }
catch (e) { pw = require('/opt/npm-tools/node_modules/playwright'); }
function launchOpts() {
  const o = { args: ['--no-sandbox'] };
  const c = process.env.CHROME_PATH || '/opt/pw-browsers/chromium';
  if (fs.existsSync(c)) o.executablePath = c;
  return o;
}
module.exports = { chromium: pw.chromium, launchOpts };
