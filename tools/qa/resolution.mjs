// The screen resolution check (renderer.computeDevScale, zoom steps): for each window size and pixel
// ratio, after loading the game — renderer.devScale, the game screen (renderer.w × renderer.h), how
// tall the player stands on screen, where the bottom console begins against the player's feet; the
// whole scale reached at every zoom-in and zoom-out press; and that the mouse lands where it points:
// a real mouse move onto the player's and on an NPC's screen position must give back that world point
// (game.mouseWorld) and hover that NPC (game.hover). Saves a shot per size.
//   npm run dev; node tools/qa/resolution.mjs [out_dir]
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const out = process.argv[2] || 'tools/qa/out/resolution';
fs.mkdirSync(out, { recursive: true });
const dir = '/opt/pw-browsers';
const exe = fs.readdirSync(dir).map((d) => path.join(dir, d, 'chrome-linux', 'chrome')).find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const SIZES = [
  ['1920x1080', 1920, 1080, 1],
  ['2560x1440', 2560, 1440, 1],
  ['3840x2160', 3840, 2160, 1],
  ['1920x1080@2', 1920, 1080, 2],
];
for (const [name, w, h, dpr] of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
  await ctx.addInitScript(() => localStorage.setItem('cw.zoom.desktop', '1.52')); // an old saved zoom: must be dropped
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('http://127.0.0.1:5173/');
  await page.waitForFunction(() => window.__ready, null, { timeout: 900000 });
  await page.waitForFunction(() => document.body.classList.contains('title'), null, { timeout: 60000 });
  const title = await page.evaluate(() => ({ devScale: __renderer.devScale, w: __renderer.w, h: __renderer.h, zoom: +__renderer.zoom.toFixed(3) }));
  await page.click('#startBtn');
  await page.waitForTimeout(1500);
  const r0 = await page.evaluate(() => {
    const r = __renderer;
    for (let i = 0; i < 30; i++) r.render(1 / 60);
    return { devScale: r.devScale, D: r.D ?? '(none)', w: r.w, h: r.h, zoom: r.zoom, oldKey: localStorage.getItem('cw.zoom.desktop'), consoleH: r.consoleH, scale: r.scale };
  });
  // the player on screen: feet, height, the console's top edge
  const geo = await page.evaluate(() => {
    const r = __renderer;
    const p = __game.player;
    const f = p.frame();
    const feet = { x: (Math.round(p.x * 20 - p.y * 20) - r.cam.x) * r.scale, y: ((p.x + p.y) * 10 - r.cam.y) * r.scale };
    return { feetCss: [Math.round(feet.x), Math.round(feet.y)], heightGamePx: f ? f.h : null, heightCss: f ? Math.round(f.h * r.scale) : null, consoleTop: Math.round(innerHeight - r.consoleH) };
  });
  // the mouse: on the player's feet, and on an NPC near the player (screen → world, and hover)
  await page.mouse.move(geo.feetCss[0], geo.feetCss[1]);
  await page.waitForTimeout(150);
  const m1 = await page.evaluate(() => {
    const p = __game.player;
    return { err: +Math.hypot(__game.mouseWorld.x - p.x, __game.mouseWorld.y - p.y).toFixed(3) };
  });
  const npc = await page.evaluate(() => {
    const r = __renderer;
    const p = __game.player;
    const u = __game.activeUnits.filter((u) => u !== p && !u.dead && Math.hypot(u.x - p.x, u.y - p.y) < 8).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
    if (!u) return null;
    const f = u.frame();
    // a point on its body: half its height above its feet
    return { name: u.name || u.def?.name || '?', x: ((u.x - u.y) * 20 - r.cam.x) * r.scale, y: ((u.x + u.y) * 10 - r.cam.y - (f ? f.h * 0.45 : 20)) * r.scale };
  });
  let hover = null;
  if (npc) {
    await page.mouse.move(npc.x, npc.y);
    await page.waitForTimeout(150);
    hover = await page.evaluate((nm) => ({ hovered: __game.hover ? __game.hover.name || __game.hover.def?.name : null, want: nm }), npc.name);
  }
  await page.screenshot({ path: `${out}/${name}.png` });
  // zoom presses: out to the end, then in to the end
  const presses = [];
  const press = async (id) => {
    await page.click('#' + id);
    await page.waitForTimeout(60);
    return page.evaluate(() => `${__renderer.devScale}× (${__renderer.w}×${__renderer.h}, zoom ${__renderer.zoom.toFixed(2)})`);
  };
  for (let i = 0; i < 8; i++) presses.push('− ' + (await press('zoomOut')));
  for (let i = 0; i < 16; i++) presses.push('+ ' + (await press('zoomIn')));
  const saved = await page.evaluate(() => ({ v2: localStorage.getItem('cw.zoom.desktop.v2'), old: localStorage.getItem('cw.zoom.desktop') }));
  console.log(`== ${name} (dpr ${dpr})`);
  console.log(`  title: devScale ${title.devScale}, ${title.w}×${title.h}, zoom ${title.zoom}`);
  console.log(`  game:  devScale ${r0.devScale}, D ${r0.D}, ${r0.w}×${r0.h}, zoom ${r0.zoom} (old saved key now: ${r0.oldKey})`);
  console.log(`  player: ${geo.heightGamePx} game px = ${geo.heightCss} css px tall, feet at y ${geo.feetCss[1]}, console from y ${geo.consoleTop} (${geo.consoleTop - geo.feetCss[1]} px clear)`);
  console.log(`  mouse on the player's feet -> world error ${m1.err} tiles; on ${hover ? hover.want : '(no NPC near)'} -> hover ${hover ? hover.hovered : '-'}`);
  console.log(`  zoom presses: ${presses.join(' | ')}`);
  console.log(`  saved: v2 ${saved.v2}, old ${saved.old}; errors ${errs.length}${errs[0] ? ': ' + errs[0] : ''}`);
  await ctx.close();
}
await browser.close();
