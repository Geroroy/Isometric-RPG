// The external asset manifest (gfx/assetManifest.js, docs/ASSETS.md) end to end, without new art: the Mustafar
// manifest and the STAGE 01 zone are swapped, for this browser only, for test copies whose entries point at images
// already in the repository (stand-ins for delivered art; nothing is written to disk). Checks:
//   - groundTiles (the landing floor) loads and the terrain lays it instead of the debug grid
//   - groundImage becomes the terrain's backdrop at its anchor; sprite becomes a sheet prop that blocks its footprint
//   - an image whose size differs from the manifest, and one whose proportions differ from its world size, are refused
//     (never stretched) and reported as missing
//     node tools/qa/assets_manifest.mjs [base_url] [out_dir]
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const url = process.argv[2] || 'http://127.0.0.1:5173/';
const out = process.argv[3] || 'tools/qa/out/assets_manifest';
fs.mkdirSync(out, { recursive: true });
const chrome = fs.readdirSync('/opt/pw-browsers').map((d) => path.join('/opt/pw-browsers', d, 'chrome-linux', 'chrome')).find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: chrome, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = [];
page.on('console', (m) => ['error', 'warning'].includes(m.type()) && logs.push(m.text()));
page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
let ok = true;
const check = (name, pass, info = '') => {
  if (!pass) ok = false;
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${name} ${info}`);
};

const S = '../../sprites/mustafar/'; // (from public/assets/mustafar/: the existing images, as stand-ins)
const tile = (f, m) => ({ file: S + f, size: [256, 256], metres: m });
const manifest = {
  format: 'cw-assets',
  version: 1,
  assets: [
    { id: 'mf.landing.floor', kind: 'groundTiles', status: 'delivered', tiles: { bay_A: tile('floor_field.png', [6, 6]), bay_A2: tile('floor_field.png', [6, 6]), bay_B: tile('floor_corner.png', [6, 6]), bay_C: tile('floor_edge.png', [6, 6]), bay_D: tile('floor_trim.png', [6, 6]), bay_E: tile('floor_corner.png', [6, 6]), rim: tile('floor_edge.png', [1, 1]), corner: tile('floor_corner.png', [1, 1]) } },
    { id: 'test.ground', kind: 'groundImage', status: 'delivered', file: S + 'backdrop.webp', size: [1672, 941], density: 4, anchor: [836, 470] },
    { id: 'test.ship', kind: 'sprite', status: 'delivered', file: S + 'mfSkiff_y_body.png', size: [1085, 638], density: 4, anchor: [411, 361], footprint: [[-1.4, -2.2], [-1.4, 4.4], [1.4, 4.4], [1.4, -2.2]], layer: 'standing' },
    { id: 'test.badsize', kind: 'sprite', status: 'delivered', file: S + 'mfSkiff_y_body.png', size: [100, 100], density: 4, anchor: [50, 90] },
    { id: 'test.badratio', kind: 'groundTiles', status: 'delivered', tiles: { rim: tile('floor_trim.png', [6, 1]) } },
    { id: 'test.waiting', kind: 'sprite', status: 'requested', file: 'props/none.png', size: [10, 10], anchor: [5, 5] },
  ],
};
await page.route('**/assets/mustafar/manifest.json', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(manifest) }));
await page.route('**/maps/mustafar_v2/stage01.json', async (r) => {
  const z = await (await r.fetch()).json();
  z.floor.push({ id: 'testGround', kind: 'groundImage', asset: 'test.ground', at: { x: 70, y: 118 } });
  z.structures.push({ asset: 'test.ship', x: 96, y: 86, block: true }, { asset: 'test.badsize', x: 90, y: 90 });
  z.decor.push({ asset: 'test.badratio', x: 0, y: 0 }, { asset: 'test.waiting', x: 100, y: 100 });
  r.fulfill({ contentType: 'application/json', body: JSON.stringify(z) });
});
await page.goto(url + '#duel-mustafar');
await page.waitForFunction(() => window.__ready, null, { timeout: 900000 });
await page.click('#startBtn');
await page.waitForTimeout(1200);
const st = await page.evaluate(() => {
  const g = window.__game;
  const w = g.world;
  const z = w.zone;
  const ship = w.props.find((p) => p.sheet === 'test.ship');
  return {
    art: Object.keys(z.art),
    tiles: z.art['mf.landing.floor'] && Object.keys(z.art['mf.landing.floor'].tiles),
    missing: z.missingArt,
    backdrop: w.backdrop && { x: +w.backdrop.x.toFixed(2), y: +w.backdrop.y.toFixed(2), scale: w.backdrop.scale, img: !!w.backdrop.img },
    ship: ship && { x: ship.x, y: ship.y, blocked: w.isBlocked(96, 87) },
    badge: document.querySelector('.placeholder-badge') && document.querySelector('.placeholder-badge').textContent,
  };
});
check('groundTiles loaded', st.tiles && st.tiles.length === 8, (st.tiles || []).join(','));
// the ground image's anchor pixel must land on world (70, 118): top-left world point + anchor × scale back to it
const bx = st.backdrop;
if (bx) {
  const sx = (bx.x - bx.y) * 20 + 836 * bx.scale;
  const sy = (bx.x + bx.y) * 10 + 470 * bx.scale;
  check('groundImage placed by its anchor', Math.abs(sx - (70 - 118) * 20) < 0.01 && Math.abs(sy - (70 + 118) * 10) < 0.01 && bx.img, JSON.stringify(bx));
} else check('groundImage placed by its anchor', false, 'no backdrop');
check('sprite placed, footprint blocks', st.ship && st.ship.blocked, JSON.stringify(st.ship));
const why = Object.fromEntries(st.missing.map((m) => [m.id, m.why]));
check('wrong pixel size refused', /100×100/.test(why['test.badsize'] || ''), why['test.badsize']);
check('wrong proportions refused (not stretched)', /비율/.test(why['test.badratio'] || ''), why['test.badratio']);
check('not delivered: waits, not loaded', /대기/.test(why['test.waiting'] || ''), why['test.waiting']);
check('badge lists only what is missing', st.badge && !st.badge.includes('mf.landing.floor') && st.badge.includes('test.waiting'), st.badge);
await page.waitForFunction(() => { const t = window.__renderer.terrain; return !t.pool || t.pool.inflight.size === 0; }, null, { timeout: 120000 }).catch(() => {});
await page.evaluate(() => { const p = window.__game.player; p.x = 92; p.y = 98; window.__renderer.setZoom(0.75, true); });
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/stand_ins.png` });
const expected = (t) => /test\.badsize|test\.badratio/.test(t);
const errs = logs.filter((t) => !expected(t));
check('only the two expected refusals logged', errs.length === 0 && logs.filter(expected).length === 2, errs.slice(0, 4).join(' | '));
await browser.close();
process.exit(ok ? 0 : 1);
