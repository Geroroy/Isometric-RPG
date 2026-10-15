// The map editor (F2, ui/mapEditor.js) on the rebuilt Mustafar duel (#duel-mustafar, the artifact), under Playwright:
// the ✎ button opens it on the zone map (its modes: 소품 · 길 · 조명; no tile or room modes); a chair dragged with the
// mouse, a tile painted blocked, a light added; Ctrl+S keeps the edit in the browser, ⬇ hands over
// mustafar_v2_edit.json (world/mustafarStage.js toMap) with all three; a reload lays the edit over the zone files
// (the director's named pieces and the table's top intact) and the duel still plays on it; without the saved edit
// the zone files come back.
//     node tools/qa/mfeditor.mjs [base_url]
import { chromium } from 'playwright-core';
import fs from 'fs'; import path from 'path';
const url = process.argv[2] || 'http://127.0.0.1:5173/';
const out = process.argv[3] || 'tools/qa/out/mfeditor';
fs.mkdirSync(out, { recursive: true });
const chrome = fs.readdirSync('/opt/pw-browsers').map((d) => path.join('/opt/pw-browsers', d, 'chrome-linux', 'chrome')).find((p) => fs.existsSync(p));
const b = await chromium.launch({ executablePath: chrome, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, acceptDownloads: true });
const page = await ctx.newPage(); const errs = [];
page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
let booted = false;
const boot = async () => {
  if (booted) await page.reload();
  else await page.goto(url + '?mfPart=room#duel-mustafar');
  booted = true;
  await page.waitForFunction(() => window.__ready, null, { timeout: 900000 });
  await page.click('#startBtn');
  await page.waitForFunction(() => window.__game.duel.part === 'room' && !window.__game.cinema, null, { timeout: 120000 });
};
let ok = true; const check = (n, c, i = '') => { if (!c) ok = false; console.log(`${c ? 'ok  ' : 'FAIL'} ${n} ${i}`); };
await boot();
const btn = await page.$('#mapEditBtn');
check('the ✎ button is there', !!btn);
await btn.click();
await page.waitForTimeout(500);
const st0 = await page.evaluate(() => { const e = window.__editor; const d = document.getElementById('mapEditor'); return { on: e.on, visible: d && !d.classList.contains('hidden'), zone: e.zoneMap, groups: [...document.querySelectorAll('.me-group')].map((g) => g.textContent), hiddenModes: [...document.querySelectorAll('.me-modes button.hidden')].map((b) => b.dataset.mode) }; });
check('the editor opens on the rebuilt map', st0.on && st0.visible && st0.zone, JSON.stringify(st0));
await page.screenshot({ path: `${out}/1_open.png` });
// a chair, dragged 1 m along x with the mouse
const target = await page.evaluate(() => {
  const g = window.__game; const r = window.__renderer; const e = window.__editor;
  const ch = g.world.props.find((p) => p.sheet === 'mf.room.chair_b' && Math.abs(p.x - 44.4) < 0.01);
  e.focus.x = ch.x; e.focus.y = ch.y; g.camFocus = e.focus;
  return { x: ch.x, y: ch.y };
});
await page.waitForTimeout(400);
const scr = await page.evaluate(({ x, y }) => { const r = window.__renderer; const sx = (x - y) * 20, sy = (x + y) * 10; const c = r.canvas.getBoundingClientRect(); return { px: c.x + (sx - r.cam.x) * r.scale, py: c.y + (sy - 12 - r.cam.y) * r.scale, k: r.scale }; }, target);
await page.mouse.move(scr.px, scr.py);
await page.mouse.down();
await page.mouse.move(scr.px + 10 * scr.k, scr.py + 5 * scr.k, { steps: 6 });
await page.mouse.move(scr.px + 20 * scr.k, scr.py + 10 * scr.k, { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(300);
const moved = await page.evaluate(() => { const e = window.__editor; const p = e.sel; return p ? { sheet: p.sheet, x: p.x, y: p.y } : null; });
check('dragged a chair with the mouse (1 m along x)', moved && moved.sheet === 'mf.room.chair_b' && Math.abs(moved.x - 45.4) < 0.3, JSON.stringify(moved));
// screen point of a world point (the editor's view)
const at = (x, y) => page.evaluate(({ x, y }) => { const r = window.__renderer; const sx = (x - y) * 20, sy = (x + y) * 10; const c = r.canvas.getBoundingClientRect(); return { px: c.x + (sx - r.cam.x) * r.scale, py: c.y + (sy - r.cam.y) * r.scale }; }, { x, y });
// the way: a tile of the south aisle painted blocked with the left button (mode 2)
await page.keyboard.press('Digit2');
const t = await at(50.5, 90.5);
await page.mouse.click(t.px, t.py);
const painted = await page.evaluate(() => ({ blocked: window.__game.world.isBlocked(50.5, 90.5), log: [...window.__game.world.paintLog] }));
check('painted a tile blocked (2: 길)', painted.blocked && painted.log.length >= 1, JSON.stringify(painted));
// a light (mode 3): a click on empty ground adds one
await page.keyboard.press('Digit3');
const nl0 = await page.evaluate(() => window.__game.world.lights.filter((l) => l.map).length);
const lp = await at(47.5, 82.5);
await page.mouse.click(lp.px, lp.py);
const nl1 = await page.evaluate(() => window.__game.world.lights.filter((l) => l.map).length);
check('added a light (3: 조명)', nl1 === nl0 + 1, `${nl0} -> ${nl1}`);
await page.screenshot({ path: `${out}/2_edited.png` });
// save (Ctrl+S) and the file (⬇)
await page.keyboard.press('Control+s');
await page.waitForTimeout(300);
const saved = await page.evaluate(() => { const k = Object.keys(localStorage).find((x) => /mustafar_v2_edit/.test(x)); return k ? JSON.parse(localStorage.getItem(k)).text.length : 0; });
check('saved in this browser (Ctrl+S)', saved > 1000, `${saved} chars`);
const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), page.click('.me-dl')]);
const file = `${out}/${dl.suggestedFilename()}`;
await dl.saveAs(file);
const edit = JSON.parse(fs.readFileSync(file, 'utf8'));
const chair = edit.props.find((p) => p.sheet === 'mf.room.chair_b' && Math.abs(p.x - 45.4) < 0.3 && Math.abs(p.y - 87.6) < 0.01);
check('the downloaded file: mustafar_v2_edit.json with the moved chair, the painted tile, the new light', dl.suggestedFilename() === 'mustafar_v2_edit.json' && edit.format === 'mustafar-v2-edit' && !!chair && edit.paint.some(([x, y, v]) => x === 50 && y === 90 && v === 1) && edit.lights.some((l) => Math.abs(l.x - 47.5) < 0.6 && Math.abs(l.y - 82.5) < 0.6), JSON.stringify({ name: dl.suggestedFilename(), props: edit.props.length, lights: edit.lights.length, paint: edit.paint, named: edit.props.filter((p) => p.id).map((p) => p.id) }));
// reload: the edit plays
await page.keyboard.press('F2');
await boot();
const back = await page.evaluate(() => { const w = window.__game.world; return { edited: w.edited, chair: w.props.filter((p) => p.sheet === 'mf.room.chair_b' && Math.abs(p.y - 87.6) < 0.01).map((p) => p.x).sort((a, b) => a - b).slice(0, 3), blocked: w.isBlocked(50.5, 90.5), light: w.lights.some((l) => Math.abs(l.x - 47.5) < 0.6 && Math.abs(l.y - 82.5) < 0.6), named: Object.keys(w.named).sort(), table: w.groundAt(49, 86) }; });
check('reloaded: the edit is laid over the zones (chair, tile, light), the director\'s named pieces and the table top intact', back.edited && back.chair[0] > 45 && back.blocked && back.light && back.named.includes('facilityDoor') && back.named.includes('robe') && back.table === 0.8, JSON.stringify(back));
// the duel still runs on it: the room's mark plays the push
await page.evaluate(() => { const d = window.__game.duel; d.foe.hp = Math.min(d.foe.hp, d.floor * d.foe.maxHp); d.reachMark(); });
const pushed = await page.waitForFunction(() => window.__game.duel.part === 'push', null, { timeout: 120000 }).then(() => true, () => false);
check('the duel still plays on the edited map (the push)', pushed);
// revert: back to the zone files
await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (/mustafar_v2_edit/.test(k)) localStorage.removeItem(k); });
await boot();
const clean = await page.evaluate(() => ({ edited: window.__game.world.edited, blocked: window.__game.world.isBlocked(50.5, 90.5) }));
check('without the saved edit: the zone files again', !clean.edited && !clean.blocked, JSON.stringify(clean));
await b.close();
check('no errors', errs.length === 0, errs.slice(0, 3).join(' || '));
process.exit(ok ? 0 : 1);
