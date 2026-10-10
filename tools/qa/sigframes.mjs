// The signature move frame by frame: (a) every sprite frame of its animations
// rendered deterministically at two facings, (b) a real-time run captured
// every ~50 ms with the trail, lunge and hitstop. Geonosis duel, Dooku held.
//   npm run dev; node tools/qa/sigframes.mjs <out_dir> [skill=signature]
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const out = process.argv[2] || 'tools/qa/out/sig';
const skill = process.argv[3] || 'signature';
fs.mkdirSync(out, { recursive: true });
function findChrome(dir) {
  for (const d of fs.readdirSync(dir)) {
    const p = path.join(dir, d, 'chrome-linux', 'chrome');
    if (fs.existsSync(p)) return p;
  }
}
const browser = await chromium.launch({ executablePath: findChrome('/opt/pw-browsers'), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto('http://127.0.0.1:5173/#duel');
await page.waitForFunction(() => window.__ready, null, { timeout: 600000 });
await page.click('#startBtn');
await page.waitForTimeout(800);
for (let i = 0; i < 6 && (await page.evaluate(() => !!window.__game.cinema)); i++) {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
}
await page.waitForTimeout(500);
// stage: Dooku held still in front, HUD hidden, zoomed in
await page.evaluate(() => {
  const g = __game; const p = g.player; const dk = g.duel.foe;
  g.duel.fight();
  dk.stun = 999; dk.setAnim('idle'); dk.state = 'idle'; // held by a long stun (still takes hits)
  dk.x = p.x + 1.6; dk.y = p.y - 1.6; p.faceTo(dk.x, dk.y);
  g.cheats.force = true; g.cheats.cd = true;
  for (const sel of ['#hud', '#overlay']) document.querySelector(sel).style.visibility = 'hidden';
  __renderer.setZoom(2.5);
});
await page.waitForTimeout(400);

// (a) deterministic stills: pause the loop by freezing time via a flag the loop honours? The loop
// is free-running, so hold the pose each frame long enough to screenshot: set animT, stop regen.
const anims = await page.evaluate((skill) => {
  const p = __game.player; const set = p.sprites;
  const names = Object.keys(set.anims).filter((n) => /^sig/.test(n));
  return names.map((n) => ({ n, frames: set.anims[n].frames, fps: set.anims[n].fps, hit: set.anims[n].hit }));
}, skill);
console.log('anims', JSON.stringify(anims));
const stills = [];
for (const facing of [-Math.PI / 4, Math.PI * 0.75]) {
  for (const a of anims) {
    for (let f = 0; f < a.frames; f++) {
      await page.evaluate(([n, f, fps, facing]) => {
        const g = __game; const p = g.player;
        g.duel.locked = true; // keeps the player's own update from changing the pose
        p.scripted = true; p.facing = facing; p.anim = n; p.animSpeed = 0; p.animT = (f + 0.001) / fps; p.action = null;
        __game.player.frame();
      }, [a.n, f, a.fps, facing]);
      await page.waitForTimeout(60);
      const file = path.join(out, `still_${facing < 0 ? 'ne' : 'sw'}_${a.n}_${String(f).padStart(2, '0')}.png`);
      await page.screenshot({ path: file, clip: { x: 440, y: 160, width: 400, height: 400 } });
      stills.push([a.n, f, facing < 0 ? 'ne' : 'sw', a.hit === f]);
    }
  }
}
// (b) real time: cast the skill at Dooku and shoot every ~50 ms
await page.evaluate(() => {
  const g = __game; const p = g.player; const dk = g.duel.foe;
  g.duel.locked = false; p.scripted = false; p.animSpeed = 1; p.setAnim('idle', 1, true);
  p.x = dk.x - 1.8; p.y = dk.y + 1.8; p.faceTo(dk.x, dk.y);
});
await page.waitForTimeout(300);
await page.evaluate(() => {
  const raf = window.requestAnimationFrame.bind(window); let base = null;
  window.requestAnimationFrame = (cb) => raf((now) => { if (base === null) base = now; cb(base + (now - base) * 0.25); });
});
await page.waitForTimeout(100);
await page.evaluate((skill) => {
  const g = __game; const p = g.player; const dk = g.duel.foe;
  p.skills[skill] = 10; p.hotbar[0] = skill; p.recalc();
  window.__log = [];
  window.__t0 = performance.now();
  const ok = p.tryCast(skill, dk.x, dk.y, dk);
  window.__log.push(['cast', ok]);
}, skill);
const live = [];
const t0 = Date.now();
let i = 0;
while (Date.now() - t0 < 11000) {
  const st = await page.evaluate(() => { const g = __game; const p = g.player; return { t: Math.round((performance.now() - window.__t0) * 0.25), anim: p.anim, f: p.frame() === p.sprites.anims[p.anim].data[0][0] ? 0 : Math.min(p.sprites.anims[p.anim].frames - 1, Math.floor(p.animT * p.sprites.anims[p.anim].fps * p.animSpeed)), action: p.action && p.action.type, phase: p.action && p.action.phase, i: p.action && p.action.i, hs: g.hitstopT > 0, hp: Math.round(g.duel.foe.hp), x: +p.x.toFixed(2), y: +p.y.toFixed(2) }; });
  await page.screenshot({ path: path.join(out, `live_${String(i).padStart(3, '0')}.png`), clip: { x: 440, y: 160, width: 400, height: 400 } });
  live.push(st);
  i++;
  await page.waitForTimeout(20);
}
fs.writeFileSync(path.join(out, 'live.json'), JSON.stringify(live, null, 0));
fs.writeFileSync(path.join(out, 'stills.json'), JSON.stringify(stills));
console.log('live frames', live.length, 'span', live.at(-1).t, 'ms');
console.log(live.map((s) => `${s.t}ms ${s.anim}#${s.f} ${s.action || '-'}/${s.phase || ''}${s.i ?? ''} ${s.hs ? 'HITSTOP' : ''} hp${s.hp} (${s.x},${s.y})`).join('\n'));
if (errs.length) console.log('ERRORS', errs);
await browser.close();
