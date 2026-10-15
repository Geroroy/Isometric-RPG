// The Mustafar blank map (the menu's '무스타파 빈 맵', #duel-mustafar-blank: public/maps/mustafar_v2/blank.json, built
// by hand in the map editor), under Playwright: the duel's menu offers it (and it the duel back); it starts with the
// lava alone (no floors, props, lights, no Obi-Wan) straight into the editor; the 4 바닥 mode lays delivered floor
// pictures at their own size (the tiles under them walkable), one dragged and one removed; a prop and a light; the
// play-test walks the laid floor; Ctrl+S / ⬇ give mustafar_blank_edit.json; a reload builds the same map; the
// duel's own edit is left alone.
//     node tools/qa/mfblank.mjs [base_url] [out]
import { chromium } from 'playwright-core';
import fs from 'fs'; import path from 'path';
const url = process.argv[2] || 'http://127.0.0.1:5182/';
const out = process.argv[3] || 'tools/qa/out/mfblank';
fs.mkdirSync(out, { recursive: true });
const chrome = fs.readdirSync('/opt/pw-browsers').map((d) => path.join('/opt/pw-browsers', d, 'chrome-linux', 'chrome')).find((p) => fs.existsSync(p));
const b = await chromium.launch({ executablePath: chrome, args: process.env.NOWEBGL ? ['--disable-webgl', '--disable-3d-apis'] : ['--use-gl=angle', '--use-angle=swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, acceptDownloads: true });
const page = await ctx.newPage(); const errs = [];
page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
let ok = true; const check = (n, c, i = '') => { if (!c) ok = false; console.log(`${c ? 'ok  ' : 'FAIL'} ${n} ${i}`); };
const ready = () => page.waitForFunction(() => window.__ready, null, { timeout: 900000 });
// the duel's menu: the blank map is offered
await page.goto(url + '#duel-mustafar');
await ready();
const menu = await page.evaluate(() => [...document.querySelectorAll('.title-menu .tm-item')].map((e) => [e.getAttribute('href'), e.textContent.trim()]));
check('the duel\'s menu offers the blank map', menu.some(([h]) => h === '#duel-mustafar-blank'), JSON.stringify(menu));
await page.screenshot({ path: `${out}/0_menu.png` });
await page.click('a[href="#duel-mustafar-blank"]');
await page.waitForTimeout(1500);
await ready();
const menu2 = await page.evaluate(() => [...document.querySelectorAll('.title-menu .tm-item')].map((e) => [e.getAttribute('href'), e.textContent.trim()]));
check('the blank map\'s menu: start building, and the duel back', menu2[0][1].includes('맵 만들기') && menu2.some(([h]) => h === '#duel-mustafar'), JSON.stringify(menu2));
await page.click('#startBtn');
await page.waitForTimeout(800);
const st = await page.evaluate(() => {
  const g = window.__game; const w = g.world; const e = window.__editor;
  let open = 0; for (let i = 0; i < w.blocked.length; i++) if (!w.blocked[i]) open++;
  return { zone: w.zone.id, props: w.props.length, lights: w.lights.length, floors: w.padFloors.length, open, foe: !!g.duel.foe, units: g.units.length, editor: e.on, map: document.querySelector('.me-map').textContent, file: e.fileName, modes: [...document.querySelectorAll('.me-modes button:not(.hidden)')].map((b) => b.dataset.mode) };
});
check('starts as lava alone, straight into the editor (no Obi-Wan, no floor, prop or light)', st.zone === 'blank' && st.props === 0 && st.lights === 0 && st.floors === 0 && st.open === 0 && !st.foe && st.editor && st.file === 'mustafar_blank_edit.json' && st.modes.join() === 'prop,brush,light,floor', JSON.stringify(st));
await page.screenshot({ path: `${out}/1_blank.png` });
const at = (x, y) => page.evaluate(({ x, y }) => { const r = window.__renderer; const sx = (x - y) * 20, sy = (x + y) * 10; const c = r.canvas.getBoundingClientRect(); return { px: c.x + (sx - r.cam.x) * r.scale, py: c.y + (sy - r.cam.y) * r.scale }; }, { x, y });
// 4 바닥: the panel's floor pictures; a 6 × 4 m corridor floor laid twice side by side, the landing bay once
await page.keyboard.press('Digit4');
await page.waitForTimeout(300);
const items = await page.evaluate(() => window.__editor.floorItems.map((i) => `${i.asset}:${i.tile} ${i.mw}x${i.mh}`));
check('the floor panel lists the delivered floor pictures (not the lava)', items.length >= 8 && items.every((s) => !s.includes('lava')), items.join(', '));
const pick = (asset, tile) => page.evaluate(({ asset, tile }) => { const it = window.__editor.floorItems.find((i) => i.asset === asset && i.tile === tile); const b = [...document.querySelectorAll('.me-flist .me-item')][window.__editor.floorItems.indexOf(it)]; b.click(); }, { asset, tile });
await pick('mf.passage.floor', 'floor');
for (const [x, y] of [[96, 96], [102, 96]]) { const p = await at(x, y); await page.mouse.click(p.px, p.py); }
await pick('mf.landing.floor', 'bay_A');
{ const p = await at(96, 102); await page.mouse.click(p.px, p.py); }
await page.keyboard.press('Escape');
await page.waitForTimeout(600);
const laid = await page.evaluate(() => { const w = window.__game.world; return { floors: w.padFloors.map((f) => [f.asset, f.tile, f.x0, f.y0, f.x1, f.y1]), walk: [w.isBlocked(96.5, 96.5), w.isBlocked(104.5, 97.5), w.isBlocked(96.5, 104.5), w.isBlocked(110.5, 96.5)] }; });
check('laid three floors at their own size, the tiles under them walkable (and not beyond)', laid.floors.length === 3 && laid.floors.every((f) => (f[4] - f[2] === 6 && f[5] - f[3] === 4) || (f[4] - f[2] === 6 && f[5] - f[3] === 6)) && laid.walk.join() === 'false,false,false,true', JSON.stringify(laid));
await page.waitForTimeout(2500); // (the ground rebuilt)
await page.screenshot({ path: `${out}/2_floors.png` });
// drag the bay 2 m along +x, then remove it and undo the removal
const bay = await page.evaluate(() => { const f = window.__game.world.padFloors.find((q) => q.tile === 'bay_A'); return { x: (f.x0 + f.x1) / 2, y: (f.y0 + f.y1) / 2, x0: f.x0 }; });
{ const a = await at(bay.x, bay.y); const c = await at(bay.x + 2, bay.y); await page.mouse.move(a.px, a.py); await page.mouse.down(); await page.mouse.move(c.px, c.py, { steps: 8 }); await page.mouse.up(); }
await page.waitForTimeout(300);
const dragged = await page.evaluate(() => { const w = window.__game.world; const f = w.padFloors.find((q) => q.tile === 'bay_A'); return { x0: f.x0, old: w.isBlocked(f.x0 - 1.5, f.y0 + 3), nw: w.isBlocked(f.x1 - 0.5, f.y0 + 3) }; }).catch((e) => ({ err: e.message }));
check('dragged a floor 2 m: its tiles moved with it', dragged.x0 === bay.x0 + 2 && dragged.old === true && dragged.nw === false, JSON.stringify(dragged));
await page.keyboard.press('Delete');
const del = await page.evaluate(() => window.__game.world.padFloors.length);
await page.keyboard.press('Control+z');
const undone = await page.evaluate(() => window.__game.world.padFloors.length);
check('Del removes the selected floor, Ctrl+Z brings it back', del === 2 && undone === 3, `${del} -> ${undone}`);
// a prop (1 소품) and a light (3 조명) on the floor
await page.keyboard.press('Digit1');
const n = await page.evaluate(() => { const it = window.__editor.items.find((i) => i.name === 'mf.room.chair_a') || window.__editor.items.find((i) => i.name.startsWith('mf.')); it.el.click(); return it.name; });
{ const p = await at(99, 98); await page.mouse.click(p.px, p.py); }
await page.keyboard.press('Escape');
await page.keyboard.press('Digit3');
{ const p = await at(100, 100); await page.mouse.click(p.px, p.py); }
const dressed = await page.evaluate(() => ({ props: window.__game.world.props.map((p) => p.sheet), lights: window.__game.world.lights.filter((l) => l.map).length }));
check('placed a prop and a light', dressed.props.length === 1 && dressed.lights === 1, n + ' ' + JSON.stringify(dressed));
// the play-test walks the laid floor (and not onto the lava)
await page.keyboard.press('Escape');
await page.evaluate(() => { const e = window.__editor; e.focus.x = 97; e.focus.y = 97; });
await page.keyboard.press('KeyP');
await page.waitForTimeout(300);
const walk = await page.evaluate(async () => { const g = window.__game; const p = g.player; const s = { x: p.x, y: p.y }; p.commandMove(106, 98); await new Promise((r) => setTimeout(r, 4000)); const a = { x: p.x, y: p.y }; p.commandMove(115, 98); await new Promise((r) => setTimeout(r, 3000)); return { s, a, b: { x: p.x, y: p.y }, test: window.__editor.testing }; });
check('the play-test walks the floor, not out onto the lava', walk.test && walk.a.x > walk.s.x + 3 && walk.b.x < 108.2, JSON.stringify(walk));
await page.screenshot({ path: `${out}/3_test.png` });
await page.keyboard.press('KeyP');
await page.waitForTimeout(300);
// save and the file
await page.keyboard.press('Control+s');
const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), page.click('.me-dl')]);
const file = `${out}/${dl.suggestedFilename()}`;
await dl.saveAs(file);
const edit = JSON.parse(fs.readFileSync(file, 'utf8'));
check('⬇ gives mustafar_blank_edit.json with the floors, the prop and the light', dl.suggestedFilename() === 'mustafar_blank_edit.json' && edit.floors.length === 3 && edit.props.length === 1 && edit.lights.length === 1 && /blank\.json/.test(edit.note), JSON.stringify({ floors: edit.floors, props: edit.props.length, lights: edit.lights.length }));
const keys = await page.evaluate(() => Object.keys(localStorage).filter((k) => /mustafar/.test(k)));
check('kept in the browser under its own name (the duel\'s edit untouched)', keys.includes('mustafar_blank_editMap') && !keys.includes('mustafar_v2_editMap'), keys.join());
// reload: the same map
await page.keyboard.press('F2');
await page.reload();
await ready();
await page.click('#startBtn');
await page.waitForTimeout(1500);
const back = await page.evaluate(() => { const w = window.__game.world; return { floors: w.padFloors.map((f) => [f.asset, f.tile, f.x0, f.y0]), props: w.props.length, lights: w.lights.filter((l) => l.map).length, walk: w.isBlocked(96.5, 96.5), editor: window.__editor.on }; });
check('reloaded: the same floors, prop, light and way', back.floors.length === 3 && back.props === 1 && back.lights === 1 && back.walk === false && back.editor, JSON.stringify(back));
await page.keyboard.press('Digit4');
await page.waitForTimeout(3000);
await page.screenshot({ path: `${out}/4_reloaded.png` });
// the duel still starts as it was
await page.evaluate(() => localStorage.removeItem('mustafar_blank_editMap'));
await page.goto(url + '#duel-mustafar');
await page.waitForTimeout(1500);
await ready();
const duel = await page.evaluate(() => ({ zone: window.__game.world.zone.id, foe: !!window.__game.duel.foe, edited: window.__game.world.edited }));
check('the duel still loads its own map, Obi-Wan and no blank edit', duel.zone === 'stage01' && duel.foe && !duel.edited, JSON.stringify(duel));
await b.close();
check('no errors', errs.length === 0, errs.slice(0, 3).join(' || '));
process.exit(ok ? 0 : 1);
