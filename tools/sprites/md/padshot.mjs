// The landing pad (STAGE 01, '#duel-mustafar' — the map walk) at one game pixel per screen pixel (a 640×360 view =
// the renderer's scale 1), for comparing character sprites at the game's own size (docs/characters/MD_ANAKIN.md).
// Prints the player's feet on the shot and where given world offsets from the player land (game px).
//   node tools/sprites/md/padshot.mjs <url to the built game> <out.png> [dx,dy ...] [--sheet <url of a sheet JSON>] [--dirs8]
//        [--lit] [--floor <css filter>] [--video <seconds> [--walk-speed <m/s>]]
// --dirs8: also the player turned to the 8 facings (game angle i·45°), each shot cropped round the feet into one strip
// <out>_dirs8.png (8 × 96×112 game px; 96×136 with --lit).
// --sheet: the player is drawn from that sheet instead (for this shot only — the page is not saved, the game's own
// Anakin stays as it is): loaded the way gfx/sheet.js loadSheet does, so the game's renderer, lighting and grade draw it
// on the pad. A sheet with `idle` / `walk` animations: the player's idle* plays `idle`, its run* / walk* plays `walk`
// (its fps scaled so the steps match the ground at any speed: meta speed), anything else the first animation; a sheet
// without them: its first animation stands in for every animation.
// --lit: the blade on (the map walk turns it off; the game draws it from the frame's saberBase / saberTip markers).
// --floor: QA only — a canvas filter (e.g. "contrast(0.85)") on the floor layers (the terrain and the flat props, not the
//   blades' light on the floor, the shadows or anything standing), to compare a less busy floor; nothing is saved.
// --video <s>: then <s> seconds of play at 30 frames a second on a virtual clock (the game's own loop, stepped 1/30 s per
//   frame, so the capture's speed does not matter): standing, then walks to the 8 sides and back (clicks, as a player
//   does), the player's speed set to the sheet's walk speed. Frames in <out>_video/ (full view and a ×1 crop round the
//   feet); tools: ffmpeg makes the mp4s.
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const url = process.argv[2];
const out = process.argv[3];
const rest = process.argv.slice(4);
const si = rest.indexOf('--sheet');
const sheetUrl = si >= 0 ? rest[si + 1] : null;
const DIRS8 = rest.includes('--dirs8');
const LIT = rest.includes('--lit');
const vi = (k) => (rest.indexOf(k) >= 0 ? rest[rest.indexOf(k) + 1] : null);
const FLOOR = vi('--floor');
const WALK_SPEED = vi('--walk-speed') ? Number(vi('--walk-speed')) : null; // (m/s the sheet's walk was made for: its meta file's `speed`)
const VIDEO = vi('--video') ? Number(vi('--video')) : 0;
const valued = new Set(['--sheet', '--floor', '--video', '--walk-speed'].map((k) => rest.indexOf(k) + 1).filter((i) => i > 0));
const offs = rest.filter((a, i) => !a.startsWith('--') && !valued.has(i)).map((s) => s.split(',').map(Number));
const dir = '/opt/pw-browsers';
const exe = fs.readdirSync(dir).map((d) => path.join(dir, d, 'chrome-linux', 'chrome')).find((p) => fs.existsSync(p));
const b = await chromium.launch({ executablePath: exe });
const page = await (await b.newContext({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 })).newPage();
// the virtual clock (--video): once started, requestAnimationFrame waits for __vtStep and performance.now reads its time
await page.addInitScript(() => {
  const realRaf = window.requestAnimationFrame.bind(window);
  const realNow = performance.now.bind(performance);
  let virt = null;
  const q = [];
  window.__vtStart = () => { virt = realNow(); };
  performance.now = () => (virt === null ? realNow() : virt);
  window.requestAnimationFrame = (cb) => (virt === null ? realRaf(cb) : (q.push(cb), q.length));
  window.__vtStep = (ms) => { virt += ms; for (const cb of q.splice(0)) cb(virt); };
});
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(url + '#duel-mustafar');
await page.waitForFunction(() => window.__ready && window.__game && window.__game.player, null, { timeout: 120000 });
// start the walk (the menu's button, else a key) and let the camera settle
await page.waitForTimeout(1500);
await page.keyboard.press('Enter').catch(() => {});
await page.waitForTimeout(2500);
if (sheetUrl) {
  await page.evaluate(async ([url, walkSpeed]) => {
    const meta = await (await fetch(url)).json();
    const dir = url.replace(/[^/]*$/, '');
    const img = (src) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = dir + src; });
    const pages = await Promise.all(meta.pages.map(img));
    const shadowPages = await Promise.all(meta.shadowPages.map(img));
    const normalPages = await Promise.all((meta.normalPages || []).map(img));
    const k = meta.k !== 1 ? meta.k : undefined;
    const anim = (a, fps) => {
      const data = Array.from({ length: meta.dirs }, () => []);
      for (const row of a.frames) for (let d = 0; d < meta.dirs; d++) {
        const r = row[d]; const s = r.s;
        const fr = { page: pages[r.p], sx: r.x, sy: r.y, w: r.w, h: r.h, ox: r.ox, oy: r.oy, markers: r.m || {}, shadow: { page: shadowPages[s.p], sx: s.x, sy: s.y, w: s.w, h: s.h, ox: s.ox, oy: s.oy } };
        if (r.b && Object.keys(r.b).length) fr.blades = r.b;
        if (normalPages.length) fr.normal = { page: normalPages[r.p], sx: r.x, sy: r.y };
        if (k) fr.k = fr.shadow.k = k;
        data[d].push(fr);
      }
      return { frames: a.frames.length, fps: fps || a.fps || 1, loop: true, data };
    };
    const g = window.__game;
    const base = g.assets.sprites[g.player.sprite];
    const first = anim(Object.values(meta.anims)[0]);
    const idle = meta.anims.idle ? anim(meta.anims.idle) : first;
    // (the player's run plays at speed / 4.6 (units.js): this fps makes the walk's steps match the ground at any speed)
    const w = meta.anims.walk;
    const speed = walkSpeed || (w && w.speed);
    const walk = w ? anim(w, w.fps * (4.6 / (speed || 4.6))) : first;
    const pick = (n) => (/^idle/.test(n) ? idle : /^(run|walk)/.test(n) ? walk : first);
    const set = { dirs: meta.dirs, anims: Object.fromEntries(Object.keys(base.anims).map((n) => [n, pick(n)])), sheet: true, walkSpeed: w && speed };
    g.assets.sprites.__qa_sheet = set;
    g.player.sprite = '__qa_sheet';
  }, [sheetUrl, WALK_SPEED]);
  await page.waitForTimeout(800);
}
if (LIT) await page.evaluate(() => { window.__game.player.saberLit = true; });
if (FLOOR) await page.evaluate((f) => {
  // (QA only: the floor layers drawn through a filter — renderer.js draws the terrain, the decals, the blades' floor
  // light, then the flat props, then the ground markers; the filter is on from the terrain to the markers, off for the light)
  const r = window.__renderer;
  const ctx = r.ctx;
  const t = r.terrain.draw.bind(r.terrain);
  r.terrain.draw = (...a) => { ctx.filter = f; return t(...a); };
  const tint = r.drawSaberFloorTint.bind(r);
  r.drawSaberFloorTint = (...a) => { ctx.filter = 'none'; tint(...a); ctx.filter = f; };
  const gm = r.drawGroundMarkers.bind(r);
  r.drawGroundMarkers = (...a) => { ctx.filter = 'none'; return gm(...a); };
}, FLOOR);
if (LIT || FLOOR) await page.waitForTimeout(1200); // (the ignition, a few frames with the filter)
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
  const CH = LIT ? 136 : 112; // (a lit blade reaches higher: a taller crop, the feet 24 px above its bottom)
  const shots = [];
  for (let i = 0; i < 8; i++) {
    await page.evaluate((a) => { const p = window.__game.player; p.facing = a; p.targetFacing = a; }, (i * Math.PI) / 4);
    await page.waitForTimeout(250);
    const f = await page.evaluate(() => { const r = window.__renderer; const p = window.__game.player; return { x: Math.round((p.x - p.y) * 20 - r.cam.x), y: Math.round((p.x + p.y) * 10 - r.cam.y), facing: p.facing }; });
    shots.push({ i, ...f, png: await page.screenshot({ clip: { x: f.x - 48, y: f.y - (CH - 24), width: 96, height: CH } }) });
  }
  const html = `<canvas id=c width=${96 * 8} height=${CH}></canvas>`;
  const p2 = await (await b.newContext({ viewport: { width: 96 * 8, height: CH } })).newPage();
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
if (VIDEO) {
  const dir = out.replace(/\.png$/, '_video');
  fs.mkdirSync(dir, { recursive: true });
  const speed = await page.evaluate(() => {
    const g = window.__game;
    const p = g.player;
    const set = g.assets.sprites[p.sprite];
    if (set.walkSpeed) p.moveSpeed = () => set.walkSpeed; // (QA: the map walk's run speed set to the walk's own)
    p.facing = p.targetFacing = Math.PI / 4;
    return set.walkSpeed || null;
  });
  await page.evaluate(() => window.__vtStart());
  const home = await page.evaluate(() => ({ x: window.__game.player.x, y: window.__game.player.y }));
  // standing 1.5 s, then to each of the 8 sides 1.6 m and back, a short stand between
  const plan = [['stand', 45]];
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    plan.push(['go', Math.round((1.6 / (speed || 4.6)) * 30) + 8, home.x + Math.cos(a) * 1.6, home.y + Math.sin(a) * 1.6], ['stand', 12], ['go', Math.round((1.6 / (speed || 4.6)) * 30) + 8, home.x, home.y], ['stand', 10]);
  }
  let n = 0;
  const total = Math.round(VIDEO * 30);
  const shoot = async () => {
    const f = await page.evaluate(() => {
      const r = window.__renderer;
      const p = window.__game.player;
      const a = p.sprites.anims[p.anim];
      const raw = p.animT * a.fps * p.animSpeed;
      return { x: Math.round((p.x - p.y) * 20 - r.cam.x), y: Math.round((p.x + p.y) * 10 - r.cam.y), anim: p.anim, frame: Math.floor(raw) % a.frames, wx: +p.x.toFixed(3), wy: +p.y.toFixed(3), facing: +p.facing.toFixed(3), lit: p.saberLit };
    });
    log.push(f);
    const name = String(n).padStart(4, '0');
    await page.screenshot({ path: `${dir}/full_${name}.png` });
    await page.screenshot({ path: `${dir}/feet_${name}.png`, clip: { x: Math.max(0, Math.min(640 - 160, f.x - 80)), y: Math.max(0, Math.min(360 - 120, f.y - 92)), width: 160, height: 120 } });
    n++;
    return f;
  };
  const anims = {};
  const log = [];
  for (const [kind, frames, x, y] of plan) {
    if (n >= total) break;
    if (kind === 'go') {
      const s = await page.evaluate(([x, y]) => { const r = window.__renderer; return { x: (x - y) * 20 - r.cam.x, y: (x + y) * 10 - r.cam.y }; }, [x, y]);
      await page.mouse.click(Math.round(s.x * (await page.evaluate(() => window.__renderer.scale))), Math.round(s.y * (await page.evaluate(() => window.__renderer.scale))));
    }
    for (let k = 0; k < frames && n < total; k++) {
      await page.evaluate(() => window.__vtStep(1000 / 30));
      const f = await shoot();
      anims[f.anim] = (anims[f.anim] || 0) + 1;
    }
  }
  fs.writeFileSync(`${dir}/frames.json`, JSON.stringify(log));
  info.video = { frames: n, fps: 30, dir, speed, anims };
}
console.log(JSON.stringify({ ...info, errors: errs }));
await b.close();
