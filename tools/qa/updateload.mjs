// What a returning player downloads when the game is updated: serve dist/ from a counting server,
// load the game twice (the first visit fills the service worker's cache), then rebuild with the
// given change and load again in the same browser profile — and print the bytes the server sent
// for each load, by file.
//   node tools/qa/updateload.mjs [change: code|file]
//   code: a rebuild only (a new build id, the code bundle); file: one sprite JSON changed too
import { chromium } from 'playwright-core';
import { execSync } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';

const change = process.argv[2] || 'code';
const root = path.resolve('dist');
let sent = {};
const missing = new Set();
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webm': 'video/webm', '.wav': 'audio/wav', '.woff2': 'font/woff2', '.woff': 'font/woff', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  let f = path.join(root, decodeURIComponent(u.pathname));
  if (f.endsWith('/')) f += 'index.html';
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    missing.add(u.pathname);
    return res.writeHead(404).end();
  }
  const buf = fs.readFileSync(f);
  sent[u.pathname] = (sent[u.pathname] || 0) + buf.length;
  res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-cache' });
  res.end(buf);
});
await new Promise((r) => server.listen(4199, '127.0.0.1', r));
const dir = '/opt/pw-browsers';
const exe = fs.readdirSync(dir).map((d) => path.join(dir, d, 'chrome-linux', 'chrome')).find((p) => fs.existsSync(p));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cwprof-'));
const ctx = await chromium.launchPersistentContext(profile, { executablePath: exe, viewport: { width: 1280, height: 720 }, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = ctx.pages()[0] || (await ctx.newPage());
const pending = new Map();
page.on('request', (r) => pending.set(r, r.url()));
page.on('requestfinished', (r) => pending.delete(r));
page.on('requestfailed', (r) => pending.delete(r));
page.on('console', (m) => m.type() === 'error' && console.log('  console error:', m.text().slice(0, 200)));
const load = async (label) => {
  sent = {};
  const t0 = Date.now();
  pending.clear();
  try {
    await page.goto('http://127.0.0.1:4199/', { timeout: 60000 });
  } catch (e) {
    console.log(`${label}: load did not finish; pending:`, [...pending.values()].slice(0, 10));
    throw e;
  }
  await page.waitForFunction(() => window.__ready, null, { timeout: 900000 });
  await page.click('#startBtn');
  await page.waitForTimeout(3000);
  const tot = Object.values(sent).reduce((a, b) => a + b, 0);
  const top = Object.entries(sent).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([f, n]) => `${f} ${(n / 1e6).toFixed(2)}`);
  console.log(`${label}: ${Object.keys(sent).length} files, ${(tot / 1e6).toFixed(1)} MB from the server, ready+start ${((Date.now() - t0) / 1000).toFixed(1)} s\n   ${top.join('\n   ')}`);
};
await load('first visit');
await load('second visit');
if (change === 'file') {
  const p = 'public/sprites/backdrop/buildings.json';
  fs.writeFileSync(p, fs.readFileSync(p, 'utf8') + '\n');
}
execSync('npm run build', { stdio: 'ignore' });
if (change === 'file') execSync('git checkout public/sprites/backdrop/buildings.json');
await load(`after an update (${change})`);
await load('again');
console.log('not found:', [...missing].slice(0, 8));
await ctx.close();
server.close();
