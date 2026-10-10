// Bug hunt: play through a mode under Playwright (npm run dev first) and collect console errors.
//   node tools/qa/play.mjs <campaign|duel|mustafar|mobile> [out_dir]
import { chromium, devices } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const mode = process.argv[2] || 'campaign';
const out = process.argv[3] || 'tools/qa/out/play_' + mode;
fs.mkdirSync(out, { recursive: true });
function findChrome(dir) {
  for (const d of fs.readdirSync(dir)) {
    const p = path.join(dir, d, 'chrome-linux', 'chrome');
    if (fs.existsSync(p)) return p;
  }
}
const browser = await chromium.launch({ executablePath: findChrome('/opt/pw-browsers'), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const mobile = mode === 'mobile';
const context = await browser.newContext(mobile ? { ...devices['iPhone 13'], viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 720 } });
const page = await context.newPage();
const logs = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(m.type() + ': ' + m.text()); });
page.on('pageerror', (e) => logs.push('pageerror: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
const hash = mode === 'duel' ? '#duel' : mode === 'mustafar' ? '#duel-mustafar' : '';
await page.goto('http://127.0.0.1:5173/' + hash);
await page.waitForFunction(() => window.__ready, null, { timeout: 600000 });
if (mobile) await page.tap('#startBtn'); else await page.click('#startBtn');
await page.waitForTimeout(1000);
const shot = async (n) => page.screenshot({ path: path.join(out, n + '.png') });
const ev = (js) => page.evaluate(js);
const skipCine = async () => {
  for (let i = 0; i < 6 && (await ev(() => !!window.__game.cinema)); i++) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }
};

if (mode === 'campaign' || mode === 'mobile') {
  // hub: talk to Rex, take the quest, close; open every panel
  await ev(() => { const g = __game; const rex = g.units.find((u) => u.npcId === 'rex'); g.player.commandTalk(rex); });
  await page.waitForTimeout(1500);
  await page.keyboard.press('1');
  await page.waitForTimeout(800);
  await shot('01_rex');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  for (const k of ['k', 'c', 'p', 'Tab', 'o', 'v']) {
    await page.keyboard.press(k);
    await page.waitForTimeout(400);
    await shot('panel_' + k);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  }
  // fly to Christophsis through the starfighter cutscene
  await ev(() => { const g = __game; const f = g.units.find((u) => u.kind === 'fighter' || u.npcId === 'fighter'); if (f) g.player.commandTalk(f); });
  await page.waitForTimeout(1500);
  await shot('02_fighter');
  await page.keyboard.press('1');
  await page.waitForTimeout(8000);
  await skipCine();
  await shot('03_christophsis');
  // give him a kit and fight at the nearest camp
  await ev(() => {
    const g = __game; const p = g.player;
    p.level = 8; p.skillPoints = 0; p.skills = { flurry: 3, djemso: 2, push: 2, throw: 2, shien: 2 }; p.hotbar = ['flurry', 'djemso', 'push', 'throw', null, null]; p.recalc(true);
    const c = g.front.camps.filter((c) => !c.cleared).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
    p.x = c.x - 6; p.y = c.y - 6; p.setSaber(true);
  });
  await page.waitForTimeout(1500);
  await shot('04_camp');
  const t0 = Date.now();
  while (Date.now() - t0 < 25000) {
    // attack whatever is nearest; cycle skills
    await ev(() => {
      const g = __game; const p = g.player;
      let best = null, bd = 99;
      for (const u of g.activeUnits) { if (u.dead || u.team !== 'cis') continue; const d = Math.hypot(u.x - p.x, u.y - p.y); if (d < bd) { bd = d; best = u; } }
      if (best) { if (bd > 2.5) p.commandMove(best.x, best.y); else p.basicAttack(best); const s = p.hotbar[Math.floor(Math.random() * 4)]; if (s) p.tryCast(s, best.x, best.y, best); }
      if (p.hp < p.maxHp * 0.3) { p.hp = p.maxHp; }
    });
    await page.waitForTimeout(400);
  }
  await shot('05_fight');
  // die and respawn
  await ev(() => { const g = __game; g.damage(null, g.player, 99999, { type: 'blaster' }); });
  await page.waitForTimeout(3000);
  await shot('06_dead');
  await page.click('.death button').catch(() => {});
  await page.waitForTimeout(1500);
  await shot('07_respawn');
} else {
  await skipCine();
  await shot('01_fight');
  const t0 = Date.now();
  while (Date.now() - t0 < 30000) {
    await ev(() => {
      const g = __game; const p = g.player; const f = g.duel.foe;
      if (g.duel.lock) { g.duel.press(); return; }
      const d = Math.hypot(f.x - p.x, f.y - p.y);
      if (d > 2) p.commandMove(f.x, f.y); else p.basicAttack(f);
      if (Math.random() < 0.3) { const s = p.hotbar[Math.floor(Math.random() * 6)]; if (s) p.tryCast(s, f.x, f.y, f); }
      p.blocking = Math.random() < 0.3;
      if (p.hp < p.maxHp * 0.3) p.hp = p.maxHp;
    });
    await page.waitForTimeout(300);
    if (await ev(() => !!window.__game.cinema)) { await page.waitForTimeout(1500); }
  }
  await shot('02_mid');
  // finish him
  await ev(() => { const g = __game; g.damage(g.player, g.duel.foe, 99999, { type: 'saber' }); });
  await page.waitForTimeout(6000);
  await skipCine();
  await page.waitForTimeout(25000);
  await shot('03_end');
}
const state = await ev(() => { const g = __game; return { hp: g.player.hp, level: g.player.level, region: g.region, units: g.units.length, cinema: !!g.cinema, duel: g.duel ? { phase: g.duel.phase, over: g.duel.over, foeHp: g.duel.foe.hp } : null }; });
console.log(JSON.stringify(state));
console.log('LOGS', logs.length);
console.log([...new Set(logs)].slice(0, 40).join('\n'));
await browser.close();
