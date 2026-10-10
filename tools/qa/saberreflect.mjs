// The blades' light on the floor and on characters, per colour, before/after (docs/SABER_STYLE.md):
// four blade colours × held / mid-swing × a bright floor (the city pad) and a dark one (the
// Christophsis night front, with droids beside Anakin for the rim light), a palette swatch
// (old vs new blades on bright and dark), and the frame cost with the light on / off.
//   TRAIL=movie PALETTE=rots node tools/qa/saberreflect.mjs <out_dir> <label=url> [<label=url> ...]
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const out = process.argv[2];
const builds = process.argv.slice(3).map((a) => a.split('='));
fs.mkdirSync(out, { recursive: true });
const dir = '/opt/pw-browsers';
const exe = fs.readdirSync(dir).map((d) => path.join(dir, d, 'chrome-linux', 'chrome')).find((p) => fs.existsSync(p));
const COLORS = { blue: [60, 130, 255], red: [255, 50, 40], green: [60, 220, 80], purple: [170, 70, 255] };
function procCpu() {
  let gpu = 0;
  for (const pid of fs.readdirSync('/proc').filter((d) => /^\d+$/.test(d))) {
    try {
      const cmd = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8');
      if (!cmd.includes('chrome') || !cmd.includes('--type=gpu-process')) continue;
      const st = fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1].split(' ');
      gpu += (+st[11] + +st[12]) / 100;
    } catch {}
  }
  return gpu;
}
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const report = {};
for (const [label, url] of builds) {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.addInitScript(({ TRAIL, PALETTE }) => {
    localStorage.setItem('cw.saber', JSON.stringify({ trail: TRAIL || 'tcw', palette: PALETTE || 'tcw', len: 1, glow: 1 }));
    const raf = window.requestAnimationFrame.bind(window);
    window.__stop = false;
    window.__frames = 0;
    let next = 0;
    // paced at 12 fps while measuring (the software GPU is not saturated), frozen for the shots
    window.requestAnimationFrame = (cb) => raf((t) => {
      if (window.__stop) return window.requestAnimationFrame(cb);
      if (window.__pace && t < next) return window.requestAnimationFrame(cb);
      next = t + 1000 / (window.__pace || 1000);
      window.__frames++;
      cb(t);
    });
    Math.random = (() => {
      let s = 5;
      return () => (s = (s * 16807) % 2147483647) / 2147483647;
    })();
  }, { TRAIL: process.env.TRAIL, PALETTE: process.env.PALETTE });
  await page.goto(url);
  await page.waitForFunction(() => window.__ready, null, { timeout: 900000 });
  await page.click('#startBtn');
  await page.waitForTimeout(1200);
  const setup = async (where) =>
    page.evaluate((where) => {
      window.__stop = true;
      const g = __game;
      const p = g.player;
      if (where === 'dark' && g.place !== 'christophsis') {
        g.travel('christophsis', g.places.christophsis.world.landing);
        const c = g.front.camps.filter((k) => !k.boss).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
        p.x = c.x - 4.5;
        p.y = c.y - 4.5;
        // two droids beside him, frozen (the active list is refreshed by the game's update, which is stopped)
        const ds = g.units.filter((u) => u.team === 'cis' && !u.dead && u.kind !== 'b2').slice(0, 2);
        for (const u of ds) if (!g.activeUnits.includes(u)) g.activeUnits.push(u);
        ds.forEach((u, i) => {
          u.x = p.x + (i ? 1.3 : -0.4);
          u.y = p.y + (i ? -0.2 : 1.3);
          u.facing = Math.atan2(p.y - u.y, p.x - u.x);
          u.anim = 'idle';
        });
      }
      if (where === 'bright' && g.place !== 'hub') g.travel('hub', g.places.hub.world.landing);
      const bn = document.querySelector('.banner');
      if (bn) bn.style.display = 'none';
      return { place: g.place, lum: __renderer.terrain.lumAt ? __renderer.terrain.lumAt(p.x, p.y) : null, ambient: g.world.ambient || null };
    }, where);
  const pose = async (T, anim, color) =>
    page.evaluate(({ T, anim, color }) => {
      const g = __game;
      const R = __renderer;
      const p = g.player;
      p.setSaber(true);
      p.saberLit = true;
      p.saberColor = color;
      p.facing = Math.PI * 0.25;
      g.fx.parts.length = 0;
      p.anim = anim;
      p.animSpeed = 1;
      p.saberHist = null;
      p.saberTrail = null;
      p.trailUntil = 0;
      for (let t = 0; t <= T + 1e-6; t += 1 / 60) {
        p.animT = t;
        R.render(1 / 60);
      }
      R.post.render(0);
    }, { T, anim, color });
  const clip = async (w = 400, h = 250) =>
    page.evaluate(({ w, h }) => {
      const R = __renderer;
      const cx = (R.w / 2 - R.drift.x) * R.scale;
      const cy = (R.h - R.consoleH / R.scale) * 0.55 * R.scale;
      return { x: Math.round(cx - w / 2), y: Math.round(cy - h * 0.68), width: w, height: h };
    }, { w, h });
  const rep = (report[label] = { scenes: {}, errors: errs });
  for (const where of ['bright', 'dark']) {
    rep.scenes[where] = await setup(where);
    for (const [cname, rgb] of Object.entries(COLORS)) {
      await pose(0.5, 'idle', rgb);
      await page.screenshot({ path: `${out}/${label}_${where}_${cname}_idle.png`, clip: await clip() });
      await pose(0.29, 'attack1', rgb);
      await page.screenshot({ path: `${out}/${label}_${where}_${cname}_swing.png`, clip: await clip() });
    }
    // the floor's brightness as rendered, beside the pool (for the brightness-compensation check)
    rep.scenes[where].floorPx = await page.evaluate(() => {
      const R = __renderer;
      const c = document.getElementById('post');
      const x = c.getContext('webgl2') || c.getContext('webgl');
      if (!x) return null;
      const px = new Uint8Array(4);
      const cx = Math.round((R.w / 2 - R.drift.x) * R.scale) + 120;
      const cy = Math.round(c.height - (R.h - R.consoleH / R.scale) * 0.55 * R.scale) - 10;
      x.readPixels(cx, cy, 1, 1, x.RGBA, x.UNSIGNED_BYTE, px);
      return Array.from(px.slice(0, 3));
    });
  }
  // the rim light close up: a droid right beside the blade (dark front), blue and red, blade held
  await page.evaluate(() => {
    const g = __game;
    const p = g.player;
    const ds = g.activeUnits.filter((u) => u.team === 'cis' && !u.dead && u.kind !== 'b2').slice(0, 2);
    ds.forEach((u, i) => {
      u.x = p.x + (i ? 1.0 : -0.9);
      u.y = p.y + (i ? -0.9 : 0.6);
      u.facing = Math.atan2(p.y - u.y, p.x - u.x);
    });
  });
  for (const [cn, rgb] of [['blue', COLORS.blue], ['red', COLORS.red]]) {
    await pose(0.5, 'idle', rgb);
    await page.screenshot({ path: `${out}/${label}_rim_${cn}.png`, clip: await clip(240, 150) });
  }
  // the swatch: old vs new palette blades on a bright and a dark floor, four colours
  const swatch = await page.evaluate((COLORS) => {
    const S = window.__saberStyle;
    if (!S.drawBlade) return null;
    const old = {
      tcw: { blue: { core: '#f8fafe', rim: '#3475e1', inner: '#0946bb', glow: '#0c3295', halo: '#09287c' }, red: { core: '#fefbfa', rim: '#d92c42', inner: '#a40738', glow: '#790e35', halo: '#621234' } },
      rots: { blue: { core: '#fcdefe', rim: '#a7bbf8', inner: '#8294f4', glow: '#5963dc', halo: '#423ca6' } },
    };
    const derive = (rgb) => {
      const h = (k) => '#' + rgb.map((v) => Math.round(Math.min(255, v * k)).toString(16).padStart(2, '0')).join('');
      const core = '#' + rgb.map((v) => Math.round(235 + (v / 255) * 20).toString(16).padStart(2, '0')).join('');
      return { core, rim: h(1), inner: h(0.72), glow: h(0.52), halo: h(0.4) };
    };
    const oldPal = (name, rgb) => (old[S.SABER.palette] || old.tcw)[name] || old.tcw[name] || derive(rgb);
    const c = document.createElement('canvas');
    const W = 8 * 44 + 40;
    const H = 2 * 120;
    c.width = W;
    c.height = H;
    const x = c.getContext('2d');
    const floors = ['#b9b4a4', '#2a2e3a'];
    floors.forEach((fc, fi) => {
      x.fillStyle = fc;
      x.fillRect(0, fi * 120, W, 120);
      let i = 0;
      for (const [name, rgb] of Object.entries(COLORS)) {
        for (const pal of [oldPal(name, rgb), S.paletteFor(rgb)]) {
          const bx = 30 + i * 44;
          S.drawBlade(x, bx, fi * 120 + 100, bx, fi * 120 + 20, pal, 1, 0.3);
          i++;
        }
      }
    });
    return { url: c.toDataURL(), pal: Object.fromEntries(Object.entries(COLORS).map(([n, rgb]) => [n, { old: oldPal(n, rgb), now: S.paletteFor(rgb) }])) };
  }, COLORS);
  if (swatch) {
    fs.writeFileSync(`${out}/${label}_swatch.png`, Buffer.from(swatch.url.split(',')[1], 'base64'));
    rep.palette = swatch.pal;
  }
  // the cost: the dark scene running (12 fps paced), blade lit, GPU process CPU per frame —
  // as shipped / the additive pass off / the blade and its light off
  rep.cost = [];
  for (const [name, fn] of [
    ['light on', () => {}],
    ['additive pass off (drawSaberLight noop)', () => (__renderer.drawSaberLight = () => {})],
    ['blade off', () => __game.player.setSaber(false)],
  ]) {
    await page.evaluate(`(() => { __game.player.setSaber(true); __game.player.saberLit = true; __game.player.saberColor = [60,130,255]; window.__pace = 12; window.__stop = false; (${fn.toString()})(); })()`);
    await page.waitForTimeout(1500);
    const f0 = await page.evaluate(() => window.__frames);
    const g0 = procCpu();
    const t0 = Date.now();
    await page.waitForTimeout(8000);
    const wall = (Date.now() - t0) / 1000;
    const f1 = await page.evaluate(() => window.__frames);
    const fps = (f1 - f0) / wall;
    const gpuPct = (100 * (procCpu() - g0)) / wall;
    const cpuMs = await page.evaluate(() => {
      const R = __renderer;
      window.__stop = true;
      const t0 = performance.now();
      for (let i = 0; i < 60; i++) R.render(1 / 60);
      return (performance.now() - t0) / 60;
    });
    rep.cost.push({ case: name, fps: +fps.toFixed(1), gpuMsPerFrame: +((10 * gpuPct) / Math.max(0.1, fps)).toFixed(1), renderCpuMs: +cpuMs.toFixed(2) });
    await page.evaluate(() => { window.__stop = true; });
    await page.reload();
    await page.waitForFunction(() => window.__ready, null, { timeout: 900000 });
    await page.click('#startBtn');
    await page.waitForTimeout(1200);
    await setup('dark');
  }
  console.log(label, JSON.stringify(rep, null, 1));
  await page.close();
}
fs.writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 1));
await browser.close();
