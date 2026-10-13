// The map editor's layers (ui/mapEditor.js): the balcony catwalk, a ground-layer piece, moved forward past what
// it overlaps — into the standing layer, then to the very front (the top layer) — and back; the map text, the
// hit test and undo checked; then a play-test with the top-layer piece over the player.
//
//   npm run dev   (in another terminal)
//   node tools/qa/maplayers.mjs [out_dir=tools/qa/out/maplayers] [url=http://localhost:5173/]
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const [, , out = 'tools/qa/out/maplayers', url = 'http://localhost:5173/'] = process.argv;
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
check('no `over` flags after load', await page.evaluate(() => !window.__game.world.props.some((p) => p.over)));
await page.evaluate(() => {
  const w = window.__game.world;
  window.__editor.select(w.props.find((p) => p.sheet === 'mfCatwalkL_y'));
  window.__renderer.setZoom(2.2);
  window.__game.camFocus = { x: 94, y: 91 };
});
await page.waitForTimeout(500);
const info = () => page.evaluate(() => {
  const p = window.__editor.sel;
  return { tier: p.top ? 'top' : p.flat ? 'flat' : 'stand', order: p.order, idx: window.__game.world.props.indexOf(p) };
});
const shot = (n) => page.screenshot({ path: path.join(out, n + '.png') });
const start = await info();
check('starts in the ground layer', start.tier === 'flat');
await shot('ground');
await page.keyboard.press('Period');
await page.waitForTimeout(300);
let s = await info();
check('. past the next ground piece', s.tier === 'flat' && s.idx > start.idx);
await page.keyboard.press('Period');
await page.waitForTimeout(300);
s = await info();
check('. again into the standing layer, with an order', s.tier === 'stand' && typeof s.order === 'number');
await shot('standing');
await page.keyboard.press('Shift+Period');
await page.waitForTimeout(300);
s = await info();
check('Shift+. to the top layer', s.tier === 'top');
await shot('top');
const m = await page.evaluate(() => window.__game.world.toMap().props.find((p) => p.sheet === 'mfCatwalkL_y'));
check('the map text has top: true and no order', m.top === true && m.order === undefined);
check('the hit test finds the top piece first', (await page.evaluate(() => { const p = window.__editor.sel; return window.__editor.propAt(p.sx, p.sy - 10)?.sheet; })) === 'mfCatwalkL_y');
for (let i = 0; i < 3; i++) await page.keyboard.press('Control+z');
await page.waitForTimeout(300);
s = await info();
check('undo x3 back to the start', s.tier === 'flat' && s.idx === start.idx && s.order === undefined);
await page.keyboard.press('Shift+Comma');
await page.waitForTimeout(300);
check('Shift+, to the very back', (await info()).idx === 0);
await page.keyboard.press('KeyF');
await page.waitForTimeout(200);
check('F: the next layer', (await info()).tier === 'stand');
// the play-test: the top-layer piece over the player goes translucent
await page.evaluate(() => window.__editor.setTier('top'));
await page.keyboard.press('KeyP');
await page.waitForTimeout(1500);
await page.evaluate(() => {
  const g = window.__game;
  g.player.x = 94;
  g.player.y = 97;
  g.camFocus = null;
});
await page.waitForTimeout(800);
await shot('play_top');
check('the top piece covering the player is translucent', await page.evaluate(() => { const p = window.__game.world.props.find((q) => q.sheet === 'mfCatwalkL_y'); return p.coverAlpha != null && p.coverAlpha < 1; }));
console.log('errors', errs);
if (errs.length) fails++;
await browser.close();
process.exit(fails ? 1 : 0);
