// The landing pad (STAGE 01, '#duel-mustafar' — the map walk) at one game pixel per screen pixel (a 640×360 view =
// the renderer's scale 1), for comparing character sprites at the game's own size (docs/characters/MD_ANAKIN.md).
// Prints the player's feet on the shot and where given world offsets from the player land (game px).
//   node tools/sprites/md/padshot.mjs <url to the built game> <out.png> [dx,dy ...] [--sheet <url of a sheet JSON>] [--dirs8]
// --dirs8: also the player turned to the 8 facings (game angle i·45°), each shot cropped round the feet into one strip
// <out>_dirs8.png (8 × 96×112 game px).
// --sheet: the player is drawn from that sheet instead (for this shot only — the page is not saved, the game's own
// Anakin stays as it is): loaded the way gfx/sheet.js loadSheet does, its first animation standing in for every
// animation the player may play, so the game's renderer, lighting and grade draw it on the pad.
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const url = process.argv[2];
const out = process.argv[3];
const rest = process.argv.slice(4);
const si = rest.indexOf('--sheet');
const sheetUrl = si >= 0 ? rest[si + 1] : null;
const DIRS8 = rest.includes('--dirs8');
const offs = rest.filter((a, i) => a !== '--sheet' && a !== '--dirs8' && i !== si + 1).map((s) => s.split(',').map(Number));
const dir = '/opt/pw-browsers';
const exe = fs.readdirSync(dir).map((d) => path.join(dir, d, 'chrome-linux', 'chrome')).find((p) => fs.existsSync(p));
const b = await chromium.launch({ executablePath: exe });
const page = await (await b.newContext({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 })).newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(url + '#duel-mustafar');
await page.waitForFunction(() => window.__ready && window.__game && window.__game.player, null, { timeout: 120000 });
// start the walk (the menu's button, else a key) and let the camera settle
await page.waitForTimeout(1500);
await page.keyboard.press('Enter').catch(() => {});
await page.waitForTimeout(2500);
if (sheetUrl) {
  await page.evaluate(async (url) => {
    const meta = await (await fetch(url)).json();
    const dir = url.replace(/[^/]*$/, '');
    const img = (src) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = dir + src; });
    const pages = await Promise.all(meta.pages.map(img));
    const shadowPages = await Promise.all(meta.shadowPages.map(img));
    const normalPages = await Promise.all((meta.normalPages || []).map(img));
    const k = meta.k !== 1 ? meta.k : undefined;
    const a = Object.values(meta.anims)[0];
    const data = Array.from({ length: meta.dirs }, () => []);
    for (const row of a.frames) for (let d = 0; d < meta.dirs; d++) {
      const r = row[d]; const s = r.s;
      const fr = { page: pages[r.p], sx: r.x, sy: r.y, w: r.w, h: r.h, ox: r.ox, oy: r.oy, markers: r.m || {}, shadow: { page: shadowPages[s.p], sx: s.x, sy: s.y, w: s.w, h: s.h, ox: s.ox, oy: s.oy } };
      if (r.b && Object.keys(r.b).length) fr.blades = r.b;
      if (normalPages.length) fr.normal = { page: normalPages[r.p], sx: r.x, sy: r.y };
      if (k) fr.k = fr.shadow.k = k;
      data[d].push(fr);
    }
    const g = window.__game;
    const base = g.assets.sprites[g.player.sprite];
    const one = { frames: a.frames.length, fps: a.fps || 1, loop: true, data };
    const set = { dirs: meta.dirs, anims: Object.fromEntries(Object.keys(base.anims).map((n) => [n, one])), sheet: true };
    g.assets.sprites.__qa_sheet = set;
    g.player.sprite = '__qa_sheet';
  }, sheetUrl);
  await page.waitForTimeout(800);
}
const info = await page.evaluate((offs) => {
  const r = window.__renderer;
  const p = window.__game.player;
  const s = (x, y) => ({ x: Math.round((x - y) * 20 - r.cam.x), y: Math.round((x + y) * 10 - r.cam.y) });
  // hide the HUD and the screen overlays: only the world
  for (const el of document.querySelectorAll('body > *:not(canvas)')) el.style.visibility = 'hidden';
  return { scale: r.scale, feet: s(p.x, p.y), player: { x: p.x, y: p.y, sprite: p.sprite, facing: p.facing }, at: offs.map(([dx, dy]) => ({ dx, dy, ...s(p.x + dx, p.y + dy) })) };
}, offs);
await page.waitForTimeout(300);
await page.screenshot({ path: out });
if (DIRS8) {
  const shots = [];
  for (let i = 0; i < 8; i++) {
    await page.evaluate((a) => { const p = window.__game.player; p.facing = a; p.targetFacing = a; }, (i * Math.PI) / 4);
    await page.waitForTimeout(250);
    const f = await page.evaluate(() => { const r = window.__renderer; const p = window.__game.player; return { x: Math.round((p.x - p.y) * 20 - r.cam.x), y: Math.round((p.x + p.y) * 10 - r.cam.y), facing: p.facing }; });
    shots.push({ i, ...f, png: await page.screenshot({ clip: { x: f.x - 48, y: f.y - 88, width: 96, height: 112 } }) });
  }
  const html = `<canvas id=c width=${96 * 8} height=112></canvas>`;
  const p2 = await (await b.newContext({ viewport: { width: 96 * 8, height: 112 } })).newPage();
  await p2.setContent(html);
  const png = await p2.evaluate(async (list) => {
    const c = document.getElementById('c').getContext('2d');
    for (const s of list) {
      const im = new Image();
      im.src = 'data:image/png;base64,' + s.b64;
      await im.decode();
      c.drawImage(im, s.i * 96, 0);
    }
    return document.getElementById('c').toDataURL('image/png').split(',')[1];
  }, shots.map((s) => ({ i: s.i, b64: s.png.toString('base64') })));
  fs.writeFileSync(out.replace(/\.png$/, '_dirs8.png'), Buffer.from(png, 'base64'));
  info.dirs8 = shots.map((s) => ({ i: s.i, facing: s.facing, feet: [s.x, s.y] }));
}
console.log(JSON.stringify({ ...info, errors: errs }));
await b.close();
