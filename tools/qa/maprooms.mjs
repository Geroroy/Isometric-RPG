// The map editor's room mode (ui/mapEditor.js 방): the control room selected by a click, moved by a drag, resized
// by a corner, its numbers typed, a room added and filled with the facility tile, deleted, undone; the map text.
//
//   npm run dev   (in another terminal)
//   node tools/qa/maprooms.mjs [out_dir=tools/qa/out/maprooms] [url=http://localhost:5173/]
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const [, , out = 'tools/qa/out/maprooms', url = 'http://localhost:5173/'] = process.argv;
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
const shot = (n) => page.screenshot({ path: path.join(out, n + '.png') });
// screen px of a world point
const at = (x, y) => page.evaluate(([x, y]) => { const r = window.__renderer; const s = { x: (x - y) * 20, y: (x + y) * 10 }; return { x: (s.x - r.cam.x) * r.scale, y: (s.y - r.cam.y) * r.scale }; }, [x, y]);
const sel = () => page.evaluate(() => { const R = window.__editor.selRoom; return R && { ...R, i: window.__game.world.floorPlan.indexOf(R) }; });
await page.keyboard.press('Digit5');
await page.waitForTimeout(200);
check('5 opens the room mode', await page.evaluate(() => window.__editor.mode === 'room'));
await page.evaluate(() => { window.__game.camFocus = { x: 90, y: 76 }; window.__renderer.setZoom(1.2); });
await page.waitForTimeout(500);
const n0 = await page.evaluate(() => window.__game.world.floorPlan.length);
let p = await at(90, 76);
await page.mouse.click(p.x, p.y);
await page.waitForTimeout(200);
let R = await sel();
check('a click selects the control room (90, 76)', R && R.x === 90 && R.y === 76);
await shot('selected');
// drag it a tile to +x (half-tile snap)
const t0 = await page.evaluate(() => (window.__t0 = window.__game.world.terrain, true));
p = await at(90, 76);
const q = await at(91, 76);
await page.mouse.move(p.x, p.y);
await page.mouse.down();
await page.mouse.move(q.x, q.y, { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(600);
R = await sel();
check('dragged a tile to +x, the ground rebuilt', R.x === 91 && R.y === 76 && (await page.evaluate(() => window.__game.world.terrain !== window.__t0)));
await page.keyboard.press('Control+z');
await page.waitForTimeout(500);
R = await sel();
check('undo puts it back', R.x === 90 && R.y === 76);
// a corner dragged: the +x+y corner out by (1, 1)
const c0 = await at(90 + R.hw, 76 + R.hh);
const c1 = await at(91 + R.hw, 77 + R.hh);
await page.mouse.move(c0.x, c0.y);
await page.mouse.down();
await page.mouse.move(c1.x, c1.y, { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(600);
const R2 = await sel();
check('the corner dragged: half a tile wider and taller each way, the centre moved half', R2.hw === R.hw + 0.5 && R2.hh === R.hh + 0.5 && R2.x === R.x + 0.5 && R2.y === R.y + 0.5);
await page.keyboard.press('Control+z');
await page.waitForTimeout(400);
// typed: the pit off, the edge 3
await page.fill('#mapEditor .me-rpit', '0');
await page.press('#mapEditor .me-rpit', 'Enter');
await page.waitForTimeout(400);
await page.fill('#mapEditor .me-redge', '3');
await page.press('#mapEditor .me-redge', 'Enter');
await page.waitForTimeout(400);
R = await sel();
check('typed: the pit dropped, the edge 3', R.pit === undefined && R.edge === 3);
check('the map text carries it', await page.evaluate(() => { const r = window.__game.world.toMap().floorPlan[1]; return r.edge === 3 && !('pit' in r); }));
await page.keyboard.press('Control+z');
await page.keyboard.press('Control+z');
await page.waitForTimeout(400);
R = await sel();
check('undone: pit and edge as before', R.pit === 2.6 && R.edge === 2);
// a new room on the rock south-west of the control room, filled with the floor
await page.click('#mapEditor .me-radd');
await page.evaluate(() => { window.__game.camFocus = { x: 76, y: 90 }; });
await page.waitForTimeout(400);
p = await at(76, 90);
await page.mouse.click(p.x, p.y);
await page.waitForTimeout(600);
R = await sel();
check('a new room added at the click', R && R.i === n0 && R.x === 76 && R.y === 90 && R.hw === 3);
const wasFloor = await page.evaluate(() => { const w = window.__game.world; return w.biome[90 * w.w + 76]; });
await page.click('#mapEditor .me-rfill');
await page.waitForTimeout(800);
check('filled: its tiles are the facility floor, walkable', await page.evaluate(() => { const w = window.__game.world; let ok = true; for (let y = 87; y < 93; y++) for (let x = 73; x < 79; x++) { const i = y * w.w + x; if (w.biome[i] !== 8 || w.blocked[i] === 2) ok = false; } return ok; }));
await page.waitForTimeout(1500);
await shot('new_room');
await page.keyboard.press('Delete');
await page.waitForTimeout(500);
check('Delete removes it', (await page.evaluate(() => window.__game.world.floorPlan.length)) === n0 && (await sel()) === null);
await page.keyboard.press('Control+z');
await page.waitForTimeout(400);
check('undo brings it back', (await page.evaluate(() => window.__game.world.floorPlan.length)) === n0 + 1);
console.log('errors', errs);
if (errs.length) fails++;
await browser.close();
process.exit(fails ? 1 : 0);
