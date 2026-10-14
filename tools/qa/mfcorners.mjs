// The Mustafar rooms' corners up close (the near walls' corners and the far walls' ends), HUD hidden.
//
//   npm run dev   (in another terminal)
//   node tools/qa/mfcorners.mjs [out_dir=tools/qa/out/mfcorners] [url=http://localhost:5173/]
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const [, , out = 'tools/qa/out/mfcorners', url = 'http://localhost:5173/'] = process.argv;
const exe = process.env.CHROME || (fs.existsSync('/opt/pw-browsers') ? findChrome('/opt/pw-browsers') : undefined);
fs.mkdirSync(out, { recursive: true });

// where the camera looks (world tiles) and the zoom
const SHOTS = [
  { name: 'control', x: 90, y: 76, z: 1 },
  { name: 'conf', x: 118, y: 74, z: 1 },
  // each room's corners: north-east, south-west, south-east (the near corner)
  { name: 'control_nw', x: 83.7, y: 68.7, z: 3 },
  { name: 'conf_nw', x: 112.7, y: 65.7, z: 3 },
  { name: 'pass_w', x: 96.75, y: 80.5, z: 3 },
  { name: 'pass_e', x: 111.75, y: 80.5, z: 3 },
  { name: 'control_ne', x: 96.75, y: 68, z: 3 },
  { name: 'control_sw', x: 83, y: 83.75, z: 3 },
  { name: 'control_se', x: 96.75, y: 83.75, z: 3 },
  { name: 'conf_ne', x: 123.75, y: 65, z: 3 },
  { name: 'conf_sw', x: 111.75, y: 82.75, z: 3 },
  { name: 'conf_se', x: 123.75, y: 82.75, z: 3 },
];

function findChrome(dir) {
  for (const d of fs.readdirSync(dir)) {
    for (const p of [path.join(dir, d, 'chrome-linux', 'chrome'), path.join(dir, d, 'chrome-linux64', 'chrome')]) if (fs.existsSync(p)) return p;
  }
}

const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(url + '#duel-mustafar-legacy');
await page.waitForFunction(() => window.__ready, null, { timeout: 900000 });
await page.click('#startBtn');
await page.waitForTimeout(1500);
for (let i = 0; i < 6 && (await page.evaluate(() => !!window.__game.cinema)); i++) {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
}
await page.evaluate(() => {
  for (const sel of ['#hud', '#overlay']) {
    const el = document.querySelector(sel);
    if (el) el.style.visibility = 'hidden';
  }
});
for (const s of (process.env.ONLY ? SHOTS.filter((s) => process.env.ONLY.split(',').includes(s.name)) : SHOTS)) {
  await page.evaluate((s) => {
    const g = window.__game;
    g.player.x = 104.5; // (out of the rooms: no wall goes faint over him)
    g.player.y = 79;
    g.camFocus = { x: s.x, y: s.y };
    g.world.camRegions = null;
    window.__renderer.setZoom(s.z);
  }, s);
  await page.waitForTimeout(1500);
  const file = path.join(out, s.name + '.png');
  await page.screenshot({ path: file });
  // the wall pieces' pillar ends on the shot (for marking: MARK=1)
  if (process.env.MARK) {
    const marks = await page.evaluate(() => {
      const r = window.__renderer;
      const out = [];
      for (const p of window.__game.world.props) {
        if (!/^mf(Wall|Console|Corridor|Passage)/.test(p.sheet || '')) continue;
        const sx = (p.x - p.y) * 20, sy = (p.x + p.y) * 10;
        out.push({ s: p.sheet, x: p.x, y: p.y, px: (sx - r.cam.x) * r.scale, py: (sy - r.cam.y) * r.scale });
      }
      return out;
    });
    fs.writeFileSync(file.replace('.png', '.marks.json'), JSON.stringify(marks));
  }
  console.log('shot', file);
}
await browser.close();
