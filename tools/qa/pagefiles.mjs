// The files a page requests while it loads and plays a little (same origin), for the artifact's file list beside
// mfduel.mjs's: the blank map (the menu's map building) and the arena page (the menu's lightsaber duel link).
//   node tools/qa/pagefiles.mjs <base url> <out.json> <path or #hash> ...
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const [base, out, ...pages] = process.argv.slice(2);
const exe = fs.readdirSync('/opt/pw-browsers').map((d) => path.join('/opt/pw-browsers', d, 'chrome-linux', 'chrome')).find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe });
const origin = new URL(base).origin;
const seen = new Set();
const bad = [];
for (const p of pages) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.origin === origin) seen.add(decodeURIComponent(u.pathname.slice(1)) || 'index.html');
  });
  page.on('response', (r) => r.status() >= 400 && bad.push(r.status() + ' ' + r.url()));
  page.on('pageerror', (e) => bad.push('pageerror ' + e.message));
  await page.goto(base + p);
  if (p.includes('arena')) {
    await page.waitForFunction(() => window.__combat && (window.__combat.view.sprites || window.__combat.spritesFailed), null, { timeout: 120000 });
    await page.click('#cb-go');
  } else {
    await page.waitForFunction(() => window.__ready, null, { timeout: 300000 });
    await page.click('#startBtn');
  }
  await page.waitForTimeout(5000);
  await ctx.close();
}
fs.writeFileSync(out, JSON.stringify([...seen].sort(), null, 1));
console.log(seen.size, 'files;', bad.length, 'bad');
for (const b of bad) console.log(b);
await browser.close();
