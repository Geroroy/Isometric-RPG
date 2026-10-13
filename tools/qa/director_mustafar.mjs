// Director's playthrough of the Mustafar duel: the opening, the first set with real input, each later set
// through its scene, the ending and the result. Frames at every step; console errors collected.
//   node tools/qa/director_mustafar.mjs [url] [out_dir]
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';
const url = process.argv[2] || 'http://127.0.0.1:4173/#duel-mustafar';
const out = process.argv[3] || 'tools/qa/out/director_mustafar';
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const dir = '/opt/pw-browsers';
const exe = fs.readdirSync(dir).map((d) => path.join(dir, d, 'chrome-linux', 'chrome')).find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const logs = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(m.type() + ': ' + m.text()); });
page.on('pageerror', (e) => logs.push('pageerror: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
await page.goto(url);
await page.waitForFunction(() => window.__ready, null, { timeout: 900000 });
let n = 0;
const shot = (tag) => page.screenshot({ path: path.join(out, `${String(n++).padStart(3, '0')}_${tag}.png`) });
const ev = (fn, arg) => page.evaluate(fn, arg);
const wait = (ms) => page.waitForTimeout(ms);
const state = () => ev(() => { const g = __game; const d = g.duel; const p = g.player; const ob = d.foe; return { t: +g.time.toFixed(1), filmT: +d.filmT.toFixed(1), set: d.setI, beat: d.beatI, cine: !!g.cinema, cineT: g.cinema ? +g.cinema.t.toFixed(1) : null, phase: d.phase, hp: Math.round(p.hp), comp: Math.round(p.composure), obHp: Math.round(ob.hp), obComp: Math.round(ob.composure), obState: ob.state, pAnim: p.anim, obAnim: ob.anim, px: +p.x.toFixed(1), py: +p.y.toFixed(1), ox: +ob.x.toFixed(1), oy: +ob.y.toFixed(1), music: __music.cur && __music.cur.situation, lock: !!d.lock, over: d.over, pressed: d.pressed.join(','), raft: !!d.raft, onRaft: !!d.onRaft, bombs: d.bombs.length, footing: d.footing }; });
const log = async (tag) => console.log(tag, JSON.stringify(await state()));
await shot('title');
await page.click('#startBtn');
// --- the opening: a frame every 4 s
for (let i = 0; i < 19; i++) { await wait(4000); await shot('intro'); await log('intro'); if (!(await ev(() => !!__game.cinema))) break; }
await page.waitForFunction(() => !window.__game.cinema, null, { timeout: 60000 });
await wait(500);
await shot('fight_start');
await log('fight start');
// --- the first set with real input: click Obi-Wan to attack, hold RMB when he winds up
const screenOf = (u) => ev((u) => { const r = __renderer; const ob = __game.duel.foe; const p = __game.player; const t = u === 'ob' ? ob : p; const w = { x: (t.x - t.y) * 20, y: (t.x + t.y) * 10 - (t.z || 0) * 24.49 }; return { x: (w.x - r.cam.x) * r.scale, y: (w.y - r.cam.y) * r.scale - 20 * r.scale / 3 }; }, u);
let blocking = false;
const fightFor = async (sec, tag, every = 1.5) => {
  const t0 = Date.now();
  let last = 0;
  while (Date.now() - t0 < sec * 1000) {
    const s = await state();
    if (s.cine || s.over) { if (blocking) { await page.mouse.up({ button: 'right' }); blocking = false; } await wait(300); if (Date.now() - last > every * 1000) { last = Date.now(); await shot(tag + '_cine'); await log(tag + ' cine'); } continue; }
    if (s.lock) { await page.keyboard.press('Space'); await page.keyboard.press('Space'); }
    else if ((s.obState === 'attack' || s.obState === 'cast') && !blocking) { await page.mouse.down({ button: 'right' }); blocking = true; }
    else if (s.obState !== 'attack' && s.obState !== 'cast' && blocking) { await page.mouse.up({ button: 'right' }); blocking = false; }
    else if (!blocking) { const o = await screenOf('ob'); if (o.x > 0 && o.x < 1280 && o.y > 0 && o.y < 640) { await page.mouse.move(o.x, o.y); await page.mouse.down(); await wait(60); await page.mouse.up(); } }
    if (Date.now() - last > every * 1000) { last = Date.now(); await shot(tag); await log(tag); }
    await wait(120);
  }
  if (blocking) { await page.mouse.up({ button: 'right' }); blocking = false; }
};
await fightFor(40, 'set0');
// --- every later set: jump the film clock to its beat, watch the scene, fight a while
const SETS_T = [34, 62, 82, 148, 209, 234, 268, 311, 340, 348, 373];
for (const t of SETS_T) {
  await ev((t) => __game.duel.seekFilm(t), t);
  await wait(800);
  await log('seek ' + t);
  // through the scene
  for (let i = 0; i < 40; i++) { const s = await state(); if (!s.cine) break; await shot('scene' + t); await log('scene' + t); await wait(1500); }
  await fightFor(t === 209 || t === 268 || t === 348 ? 24 : 14, 'set_after' + t, 2.5);
}
// --- the ending
await ev(() => __game.duel.seekFilm(388));
for (let i = 0; i < 30; i++) { await wait(3000); await shot('ending'); await log('ending'); const s = await state(); if (!s.cine && i > 2) break; }
await wait(3000);
await shot('result');
console.log('result', await ev(() => document.querySelector('.duel-result') && document.querySelector('.duel-result').innerText));
console.log('LOGS:\n' + logs.join('\n'));
await browser.close();
