// The painted Mustafar map (public/maps/mustafar_art.json, tools/maps/mustafar_art_build.py): the mode boots, the
// picture is the ground, every landmark (its pois) is reached by the pathfinder from the spawn, the view there
// shows the character over the picture (screenshots), the remastered chunks come from the workers.
//
//   npm run dev   (in another terminal)
//   node tools/qa/artmap.mjs [out_dir=tools/qa/out/artmap] [url=http://localhost:5173/]
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const [, , out = 'tools/qa/out/artmap', url = 'http://localhost:5173/'] = process.argv;
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
await page.goto(url + '#duel-mustafar-art');
await page.waitForFunction(() => window.__ready, null, { timeout: 900000 });
await page.click('#startBtn');
await page.waitForTimeout(1500);
for (let i = 0; i < 6 && (await page.evaluate(() => !!window.__game.cinema)); i++) {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
}
let fails = 0;
const check = (name, ok) => (console.log((ok ? 'ok   ' : 'FAIL ') + name), ok || fails++);
const st = await page.evaluate(() => {
  const g = window.__game;
  const w = g.world;
  return { bg: !!(w.backdrop && w.backdrop.img), foe: g.duel.foe && g.duel.foe.sprite, cam: !!w.camRegions, pois: w.pois.length, region: g.region, pool: !!(window.__renderer.terrain.pool) };
});
check('the picture is the ground', st.bg);
check('Obi-Wan is the foe', st.foe === 'obiwan3');
check('the view is held over the picture', st.cam);
check('starts on the landing pad', /착륙장/.test(st.region));
// every landmark reached from the spawn by the pathfinder (the decks connected for it: no corner cutting)
const reach = await page.evaluate(() => {
  const g = window.__game;
  const w = g.world;
  const s = w.spawn;
  return w.pois.map((p) => ({ name: p.name, ok: !!g.pathfinder.find(s.x, s.y, p.x, p.y, 20000) }));
});
for (const r of reach) check('path to ' + r.name, r.ok);
await page.evaluate(() => {
  for (const sel of ['#hud', '#overlay']) {
    const el = document.querySelector(sel);
    if (el) el.style.visibility = 'hidden';
  }
  const g = window.__game;
  g.duel.foe.scripted = true; // (stands still: the shots are of the decks)
  window.__renderer.setZoom(1.2);
});
const pois = await page.evaluate(() => window.__game.world.pois.map((p) => [p.name, p.x, p.y]));
for (const [name, x, y] of pois) {
  await page.evaluate(([x, y]) => {
    const g = window.__game;
    g.player.x = x;
    g.player.y = y;
    g.player.path = null;
  }, [x, y]);
  await page.waitForTimeout(1800);
  const file = path.join(out, name.replace(/[^가-힣a-z0-9]+/gi, '_') + '.png');
  await page.screenshot({ path: file });
  const region = await page.evaluate(() => window.__game.region);
  check(`at ${name}: the banner names it`, region === name);
}
// the remastered chunks: built by the workers (not only the classic stand-ins)
await page.waitForTimeout(2500);
const fine = await page.evaluate(() => { const t = window.__renderer.terrain; return { S: t.S, cache: t.cache.size, pool: !!t.pool && !t.pool.failed }; });
check(`remastered chunks from the workers (S ${fine.S}, ${fine.cache} chunks)`, fine.S > 1 ? fine.pool && fine.cache > 0 : true);
console.log('errors', errs);
if (errs.length) fails++;
await browser.close();
process.exit(fails ? 1 : 0);
