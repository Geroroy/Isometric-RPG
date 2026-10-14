// The map editor's tile mode (ui/mapEditor.js 타일): lava painted over the control room's floor with a 3-tile
// brush, the ground rebuilt, the way blocked; undo; the floor painted back over lava opens the way; the map text.
//
//   npm run dev   (in another terminal)
//   node tools/qa/maptiles.mjs [out_dir=tools/qa/out/maptiles] [url=http://localhost:5173/]
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const [, , out = 'tools/qa/out/maptiles', url = 'http://localhost:5173/'] = process.argv;
const exe = process.env.CHROME || (fs.existsSync('/opt/pw-browsers') ? findChrome('/opt/pw-browsers') : undefined);
fs.mkdirSync(out, { recursive: true });

function findChrome(dir) {
  for (const d of fs.readdirSync(dir)) {
    for (const p of [path.join(dir, d, 'chrome-linux', 'chrome'), path.join(dir, d, 'chrome-linux64', 'chrome')]) if (fs.existsSync(p)) return p;
  }
}

const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errs.push(m.text()));
await page.goto(url + '#duel-mustafar');
await page.waitForFunction(() => window.__ready, null, { timeout: 900000 });
await page.click('#startBtn');
await page.waitForTimeout(1500);
for (let i = 0; i < 6 && (await page.evaluate(() => !!window.__game.cinema)); i++) {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
}
await page.keyboard.press('F2');
await page.waitForTimeout(800);
let fails = 0;
const check = (name, ok) => (console.log((ok ? 'ok   ' : 'FAIL ') + name), ok || fails++);
await page.keyboard.press('Digit4');
await page.waitForTimeout(200);
check('4 opens the tile mode', await page.evaluate(() => window.__editor.mode === 'tile' && !document.querySelector('#mapEditor .me-tile').classList.contains('hidden')));
// the view on the control room; its floor's tile at (176, 70)
await page.evaluate(() => {
  window.__game.camFocus = { x: 176, y: 70 };
  window.__renderer.setZoom(2);
});
await page.waitForTimeout(600);
const tileAt = (x, y) => page.evaluate(([x, y]) => { const w = window.__game.world; const i = y * w.w + x; return { b: w.biome[i], blocked: w.blocked[i] }; }, [x, y]);
const B = await page.evaluate(() => ({ lava: 1, floor: 1 }) && null);
const names = await page.evaluate(() => [...document.querySelectorAll('#mapEditor .me-tiles button')].map((b) => [b.textContent, +b.dataset.tile]));
const LAVA = names.find(([n]) => n.includes('용암'))[1];
const FLOOR = names.find(([n]) => n.includes('시설'))[1];
const before = await tileAt(176, 70);
check('the control room floor is the facility tile, walkable', before.b === FLOOR && before.blocked === 0);
const terrain0 = await page.evaluate(() => (window.__t0 = window.__game.world.terrain, true));
// pick the lava, a 3-tile brush, click the floor's middle
await page.click(`#mapEditor .me-tiles button[data-tile="${LAVA}"]`);
await page.keyboard.press('BracketRight');
await page.keyboard.press('BracketRight');
const pt = await page.evaluate(() => { const r = window.__renderer; const s = { x: (176.5 - 70.5) * 20, y: (176.5 + 70.5) * 10 }; return { x: (s.x - r.cam.x) * r.scale, y: (s.y - r.cam.y) * r.scale }; });
await page.mouse.click(pt.x, pt.y);
await page.waitForTimeout(600);
const after = await tileAt(176, 70);
const corner = await tileAt(89, 75);
const outside = await tileAt(88, 76);
check('lava painted on the 3x3 under the brush, the way blocked by the ground', after.b === LAVA && after.blocked === 2 && corner.b === LAVA && corner.blocked === 2);
check('the tile beyond the brush untouched', outside.b === FLOOR);
check('the ground rebuilt (a new Terrain)', await page.evaluate(() => window.__game.world.terrain !== window.__t0 && window.__renderer.terrain === window.__game.world.terrain));
await page.waitForTimeout(1200);
await page.screenshot({ path: path.join(out, 'lava.png') });
const txt = await page.evaluate(() => window.__game.world.toMap().biome[70][176]);
check('the map text has the lava there', txt === '~');
await page.keyboard.press('Control+z');
await page.waitForTimeout(600);
const undone = await tileAt(176, 70);
check('undo brings the floor back, walkable, the ground rebuilt', undone.b === FLOOR && undone.blocked === 0 && (await page.evaluate(() => window.__renderer.terrain === window.__game.world.terrain)));
// the floor painted over the lava outside the deck opens the way
const lavaSpot = await page.evaluate(() => { const w = window.__game.world; for (let y = 60; y < 120; y++) for (let x = 60; x < 140; x++) if (w.blocked[y * w.w + x] === 2 && w.biome[y * w.w + x] === +document.querySelector('#mapEditor .me-tiles button:last-child').dataset.tile) return [x, y]; return null; });
await page.click(`#mapEditor .me-tiles button[data-tile="${FLOOR}"]`);
await page.keyboard.press('BracketLeft');
await page.keyboard.press('BracketLeft');
await page.evaluate(([x, y]) => { window.__game.camFocus = { x: x + 0.5, y: y + 0.5 }; }, lavaSpot);
await page.waitForTimeout(400);
const pt2 = await page.evaluate(([x, y]) => { const r = window.__renderer; const s = { x: (x + 0.5 - y - 0.5) * 20, y: (x + 0.5 + y + 0.5) * 10 }; return { x: (s.x - r.cam.x) * r.scale, y: (s.y - r.cam.y) * r.scale }; }, lavaSpot);
await page.mouse.click(pt2.x, pt2.y);
await page.waitForTimeout(600);
const opened = await tileAt(lavaSpot[0], lavaSpot[1]);
check('floor over lava: the tile is floor and walkable', opened.b === FLOOR && opened.blocked === 0);
await page.waitForTimeout(1200);
await page.screenshot({ path: path.join(out, 'floor_over_lava.png') });
console.log('errors', errs);
if (errs.length) fails++;
await browser.close();
process.exit(fails ? 1 : 0);
