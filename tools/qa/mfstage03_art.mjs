// Mustafar rebuild, STAGE 03 (the control room): the requested art drops in where the blockout stands. Every STAGE 03
// asset is served as DELIVERED with a stand-in image made here at its exact requested size (sprites: their own guide
// — the wireframe of where the piece must sit; walls and floors: a framed panel, a wall's door gap transparent), so
// the placement is checked before the art exists. The stand-ins live only in this test (page.route), never in the game.
// Checks: each piece loads (no size refusal), its blockout box goes, the gallery floor is drawn 0.6 m up, the consoles
// stand on the gallery, nothing new blocks the walk, the conference room's wall swaps to its door version; frames.
//     node tools/qa/mfstage03_art.mjs [base_url] [out_dir]
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const url = process.argv[2] || 'http://127.0.0.1:5173/';
const out = process.argv[3] || 'tools/qa/out/mfstage03_art';
fs.mkdirSync(out, { recursive: true });
const chrome = fs.readdirSync('/opt/pw-browsers').map((d) => path.join('/opt/pw-browsers', d, 'chrome-linux', 'chrome')).find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: chrome, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let ok = true;
const check = (name, pass, info = '') => {
  if (!pass) ok = false;
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${name} ${info}`);
};
const manifest = JSON.parse(fs.readFileSync('public/assets/mustafar/manifest.json', 'utf8'));
const ids = manifest.assets.filter((e) => e.status === 'requested' && /^mf\.(control|passage)\.|^mf\.room\.wall_door_side$/.test(e.id)).map((e) => e.id);
for (const e of manifest.assets) if (ids.includes(e.id)) e.status = 'delivered';
// the stand-in images by file, made in the page (a canvas) at their exact size
const files = {};
for (const e of manifest.assets.filter((x) => ids.includes(x.id))) {
  if (e.kind === 'groundTiles') for (const t of Object.values(e.tiles)) files[t.file] = { size: t.size, kind: 'floor', label: e.id };
  else if (e.kind === 'wallElevation') files[e.file] = { size: e.size, kind: 'wall', label: e.id, metres: e.metres };
  else files[e.file] = { size: e.size, kind: 'sprite', label: e.id, guide: e.guide };
}
const gaps = { 'interiors/ctl_wall_front_low.png': [448, 704, 0], 'interiors/ctl_wall_entry_low.png': [384, 640, 0], 'interiors/ctl_gallery_edge.png': [448, 704, 0], 'interiors/conf_wall_door_side.png': [256, 512, 64] };

const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`));
page.on('console', (m) => (m.type() === 'error' || /에셋 .*:/.test(m.text())) && errs.push(m.text()));
await page.route('**/assets/mustafar/manifest.json', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(manifest) }));
await page.route('**/assets/mustafar/**/*.png', async (r) => {
  const f = r.request().url().split('/assets/mustafar/')[1].split('?')[0];
  const s = files[f];
  if (!s) return r.continue();
  if (s.kind === 'sprite') return r.fulfill({ contentType: 'image/png', body: fs.readFileSync(s.guide) });
  // a framed panel drawn by a helper page: the same pixels each run
  const png = await standIn(s, gaps[f]);
  r.fulfill({ contentType: 'image/png', body: png });
});
const helper = await browser.newPage();
async function standIn(s, gap) {
  const b64 = await helper.evaluate(
    ({ s, gap }) => {
      const c = document.createElement('canvas');
      [c.width, c.height] = s.size;
      const x = c.getContext('2d');
      x.fillStyle = s.kind === 'floor' ? '#3a3f46' : 'rgba(70,90,120,0.85)';
      x.fillRect(0, 0, c.width, c.height);
      x.strokeStyle = '#00e0ff';
      x.lineWidth = 4;
      x.strokeRect(2, 2, c.width - 4, c.height - 4);
      x.strokeStyle = 'rgba(255,255,255,0.25)';
      x.lineWidth = 1;
      for (let i = 64; i < c.width; i += 64) (x.beginPath(), x.moveTo(i, 0), x.lineTo(i, c.height), x.stroke());
      for (let i = 64; i < c.height; i += 64) (x.beginPath(), x.moveTo(0, i), x.lineTo(c.width, i), x.stroke());
      if (gap) x.clearRect(gap[0], gap[2], gap[1] - gap[0], c.height - gap[2]);
      x.fillStyle = '#fff';
      x.font = '20px monospace';
      x.fillText('STAND-IN ' + s.label, 12, Math.min(c.height - 8, 30));
      return c.toDataURL('image/png').split(',')[1];
    },
    { s, gap },
  );
  return Buffer.from(b64, 'base64');
}

await page.goto(url + '?mfPart=control#duel-mustafar');
await page.waitForFunction(() => window.__ready, null, { timeout: 900000 });
await page.click('#startBtn');
await page.waitForFunction(() => window.__game.duel.part === 'control' && !window.__game.cinema, null, { timeout: 60000 });
const st = await page.evaluate((ids) => {
  const g = window.__game;
  const w = g.world;
  const z = w.zone;
  const props = w.props.filter((p) => p.sheet);
  const boxes = props.filter((p) => p.sheet.startsWith('bo:') && p.x < 38.5 && p.y < 106.5 && p.y > 87 && !p.sheet.includes('중앙 홀로 테이블')); // (the film pass's own blockout — its central table, the corridor's frames — waits for its own art)
  const consoles = props.filter((p) => p.sheet === 'mf.room.console' && p.y < 92);
  const gallery = w.padFloors.find((f) => f.id === 'gallery');
  return {
    missing: z.missingArt.filter((m) => ids.includes(m.id)).map((m) => m.id + ': ' + m.why),
    placed: ids.filter((id) => props.some((p) => p.sheet === id)).length,
    boxesLeft: boxes.map((p) => p.sheet),
    consoles: consoles.map((p) => [p.x, p.y, p.z, p.sy]),
    galleryArt: !!(gallery && gallery.kind === 'texturedRect' && gallery.z === 0.6),
    walk: { lower: !w.isBlocked(30, 100), gallery: !w.isBlocked(30, 90.5), stairs: !w.isBlocked(29.5, 93.5), rail: w.isBlocked(24.5, 92.5), passage: !w.isBlocked(41.5, 98), balcony: !w.isBlocked(29.5, 106.5) },
  };
}, ids);
check('every STAGE 03 piece loads at its requested size', st.missing.length === 0, st.missing.join(' | '));
check('the sprites and walls are placed', st.placed >= ids.length - 4, `${st.placed} of ${ids.length} (the floors are terrain)`);
check('their blockout boxes are gone', st.boxesLeft.length === 0, st.boxesLeft.join(', '));
check('the gallery floor is its picture, 0.6 m up', st.galleryArt);
check('the consoles stand on the gallery (z 0.6)', st.consoles.length === 4 && st.consoles.every((c) => c[2] === 0.6), JSON.stringify(st.consoles));
check('the walk is the same (floor, gallery, steps, rail, passage, balcony door)', Object.entries(st.walk).every(([k, v]) => v), JSON.stringify(st.walk));
const shots = [[31, 97, 1.0, 'room'], [30, 91, 1.4, 'gallery'], [42, 98, 1.4, 'passage'], [23, 99, 1.4, 'core']];
for (const [x, y, zoom, n] of shots) {
  await page.evaluate(([x, y, zoom]) => { const g = window.__game; g.duel.foe.scripted = true; g.player.x = x; g.player.y = y; g.renderer.setZoom(zoom); }, [x, y, zoom]);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/${n}.png` });
}
check('no errors', errs.length === 0, errs.slice(0, 4).join(' || '));
await browser.close();
process.exit(ok ? 0 : 1);
