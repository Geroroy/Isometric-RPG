// The artifact's file list (CLAUDE.md "아티팩트는 무스타파 결투 전용"): every file the Mustafar duel requests — from the
// start (the arrival scenes, the pad), each part pressed through to the ending and its result, and a loss — under
// Playwright, against a static server that answers 404 for what is missing (python3 -m http.server in the build's
// folder; `vite preview` answers 200 with the page instead and hides it). Writes the requested paths as JSON and prints
// what came back 404 or threw (the star cards' optional pictures excepted).
//     node tools/qa/artifact_files.mjs http://127.0.0.1:5185/ out.json
import { chromium } from 'playwright-core';
import fs from 'fs'; import path from 'path';
const base = process.argv[2] || 'http://127.0.0.1:5182/';
const out = process.argv[3] || 'tools/qa/out/artifact_files.json';
const chrome = fs.readdirSync('/opt/pw-browsers').map((d) => path.join('/opt/pw-browsers', d, 'chrome-linux', 'chrome')).find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: chrome, args: process.env.NOWEBGL === '1' ? ['--disable-3d-apis', '--disable-webgl', '--disable-webgl2', '--disable-gpu', '--autoplay-policy=no-user-gesture-required'] : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const seen = new Set(); const bad = [];
const origin = new URL(base).origin;
async function run(q, steps) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  page.on('request', (r) => { const u = new URL(r.url()); if (u.origin === origin) seen.add(decodeURIComponent(u.pathname.slice(1)) || 'index.html'); });
  page.on('response', (r) => r.status() >= 400 && bad.push(r.status() + ' ' + r.url()));
  page.on('pageerror', (e) => bad.push('pageerror ' + e.message));
  await page.goto(base + q);
  await page.waitForFunction(() => window.__ready, null, { timeout: 900000 });
  await page.click('#startBtn');
  await steps(page);
  await ctx.close();
}
const skipTo = async (page, part, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const s = await page.evaluate(() => ({ part: window.__game.duel.part, cin: !!window.__game.cinema })); if (s.part === part && !s.cin) return true; if (s.cin) await page.keyboard.press('Escape'); await page.waitForTimeout(300); } return false; };
const press = (page) => page.evaluate(() => { const d = window.__game.duel; d.foe.hp = Math.min(d.foe.hp, d.floor * d.foe.maxHp); d.reachMark(); });
// from the start: the arrival scenes watched a while (their music, voices), then the pad
await run('#duel-mustafar', async (page) => { await page.evaluate(() => (window.__game.cheats.god = true)); await page.waitForTimeout(20000); await skipTo(page, 'pad', 120000); await page.waitForTimeout(3000); });
// every part, then pressed through to the ending and the result
await run('?mfPart=corridor#duel-mustafar', async (page) => {
  await page.evaluate(() => (window.__game.cheats.god = true));
  for (const part of ['corridor', 'control', 'room', 'control2', 'balcony', 'rain', 'pipe', 'arm', 'arm2', 'raft', 'river']) {
    await skipTo(page, part, 120000);
    await page.waitForTimeout(2500);
    await press(page);
  }
  for (let i = 0; i < 200; i++) { if (await page.evaluate(() => { const r = document.querySelector('.duel-result'); return r && !r.classList.contains('hidden'); })) break; await page.waitForTimeout(400); }
  await page.waitForTimeout(1500);
});
// a loss: the result screen's other branch
await run('?mfPart=pipe#duel-mustafar', async (page) => { await skipTo(page, 'pipe', 60000); await page.evaluate(() => { const g = window.__game; g.player.hp = 1; g.damage(g.duel.foe, g.player, 50, { type: 'duel' }); }); await page.waitForTimeout(4000); });
fs.writeFileSync(out, JSON.stringify([...seen].sort(), null, 1));
console.log('files', seen.size, 'bad', bad.length); console.log(JSON.stringify(bad.filter((b) => !b.includes('/cards/'))));
await browser.close();
