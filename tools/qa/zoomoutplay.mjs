// Play at the widest zoom-out (renderer VIEW_LIMITS): zoom out with the − button to the end, then in
// each area (the plaza, the undercity, Christophsis by a droid camp) click-move with the real mouse
// three times — the arrival against the clicked point, the view's steps (the camera must not jump),
// units popping in inside the view — and save every 20th frame; a fight at the camp.
//   npm run dev; node tools/qa/zoomoutplay.mjs [out_dir] [width] [height] [dpr]
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const [, , out = 'tools/qa/out/zoomoutplay', W = '1920', H = '1080', DPR = '1'] = process.argv;
fs.mkdirSync(out, { recursive: true });
const dir = '/opt/pw-browsers';
const exe = fs.readdirSync(dir).map((d) => path.join(dir, d, 'chrome-linux', 'chrome')).find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: +W, height: +H }, deviceScaleFactor: +DPR })).newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(process.env.QA_URL || 'http://127.0.0.1:5173/');
await page.waitForFunction(() => window.__ready, null, { timeout: 900000 });
await page.click('#startBtn');
await page.waitForTimeout(2000);
for (let i = 0; i < 10; i++) await page.click('#zoomOut');
await page.waitForTimeout(300);
const view = await page.evaluate(() => ({ s: __renderer.devScale, w: __renderer.w, h: __renderer.h }));
console.log(`widest: ${view.s}× ${view.w}×${view.h}`);
// log per rendered frame: camera, active set (pop-ins inside the view)
await page.evaluate(() => {
  const r = __renderer;
  const g = __game;
  const render = r.render.bind(r);
  window.__log = { frames: 0, jumps: 0, pops: 0, bad: [] };
  let pc = null;
  let prev = null;
  r.render = (dt) => {
    render(dt);
    const L = __log;
    L.frames++;
    if (pc && Math.hypot(r.cam.x - pc.x, r.cam.y - pc.y) > 16) L.jumps++;
    pc = { x: r.cam.x, y: r.cam.y };
    const now = new Set(g.activeUnits);
    if (prev) {
      const alive = new Set(g.units);
      for (const u of now) {
        if (prev.has(u) || !alive.has(u) || u.dead || u.hidden) continue;
        const sx = (u.x - u.y) * 20 - r.cam.x;
        const sy = (u.x + u.y) * 10 - r.cam.y;
        if (sx > 20 && sx < r.w - 20 && sy > 70 && sy < r.h - r.consoleH / r.scale - 10) {
          L.pops++;
          if (L.bad.length < 4) L.bad.push(`${u.name || u.kind} at ${sx | 0},${sy | 0}`);
        }
      }
    }
    prev = now;
  };
});
const area = async (name, setup, clicks) => {
  await page.evaluate(setup);
  await page.waitForTimeout(2500);
  for (let i = 0; i < 6 && (await page.evaluate(() => !!__game.cinema)); i++) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }
  await page.evaluate(() => Object.assign(__log, { frames: 0, jumps: 0, pops: 0, bad: [] }));
  const errsTo = [];
  let shot = 0;
  for (const [fx, fy] of clicks) {
    let cx = Math.round(+W * fx);
    let cy = Math.round(+H * fy);
    await page.mouse.move(cx, cy);
    await page.waitForTimeout(100);
    for (let t = 0; t < 6 && (await page.evaluate(() => !!__game.hover)); t++) {
      cy += 30;
      await page.mouse.move(cx, cy);
      await page.waitForTimeout(60);
    }
    const want = await page.evaluate(() => [__game.mouseWorld.x, __game.mouseWorld.y]);
    await page.mouse.down();
    await page.waitForTimeout(50);
    await page.mouse.up();
    await page.waitForTimeout(150);
    // where the click sent the player: the end of its path, against the clicked point
    const dest = await page.evaluate(() => { const q = __game.player.path; return q && q.length ? [q[q.length - 1].x, q[q.length - 1].y] : null; });
    for (let k = 0; k < 3; k++) {
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `${out}/${name}_${shot++}.png` });
    }
    // then until it gets there (the software renderer runs a few frames a second here)
    await page.waitForFunction(() => !__game.player.path, null, { timeout: 30000 }).catch(() => {});
    const end = await page.evaluate(() => [__game.player.x, __game.player.y]);
    errsTo.push(`dest ${dest ? Math.hypot(dest[0] - want[0], dest[1] - want[1]).toFixed(2) : '-'} / end ${Math.hypot(end[0] - want[0], end[1] - want[1]).toFixed(2)}`);
  }
  const L = await page.evaluate(() => __log);
  console.log(`${name}: click → path end / arrival, tiles from the clicked point: ${errsTo.join(', ')}; ${L.frames} frames, camera jumps ${L.jumps}, pop-ins ${L.pops}${L.bad.length ? ' (' + L.bad.join('; ') + ')' : ''}`);
};
await area('plaza', () => { const p = __game.player; p.x = 96; p.y = 72; p.path = null; }, [[0.7, 0.4], [0.3, 0.35], [0.5, 0.6]]);
await area('undercity', () => { const p = __game.player; p.x = 98; p.y = 114; p.path = null; }, [[0.3, 0.6], [0.65, 0.35], [0.5, 0.5]]);
await area('christophsis', () => __game.travel('christophsis', __game.places.christophsis.world.landing), [[0.65, 0.3], [0.35, 0.6]]);
// a fight at a camp, wide
await page.evaluate(() => { const g = __game; const c = g.front.camps.filter((k) => !k.boss)[0]; g.player.x = c.x - 5; g.player.y = c.y - 4; g.player.path = null; g.player.hp = g.player.maxHp; });
for (let k = 0; k < 4; k++) {
  await page.waitForTimeout(900);
  await page.evaluate(() => (__game.player.hp = __game.player.maxHp));
  await page.screenshot({ path: `${out}/fight_${k}.png` });
}
const after = await page.evaluate(() => ({ s: __renderer.devScale, w: __renderer.w, h: __renderer.h }));
console.log(`still ${after.s}× ${after.w}×${after.h}; errors ${errs.length}${errs[0] ? ': ' + errs[0] : ''}`);
await browser.close();
