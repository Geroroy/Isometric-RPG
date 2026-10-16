// 광선검 결투 시험장 QA: 실제 브라우저로 arena.html을 열어 직접 조작하고, 연속 프레임을 찍고, 판정 기록을 모은다.
//   node tools/qa/arena.mjs [url] [outDir] [scenario]
//   scenario: watch (AI 대 AI 30 s 관찰, 기본) · play (플레이어 입력 시나리오) · frames (접촉 순간 연속 캡처)
// 오류(pageerror·console.error)가 있으면 종료 코드 1.
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const url = process.argv[2] || 'http://127.0.0.1:5199/arena.html';
const out = process.argv[3] || 'tools/qa/out/arena';
const scenario = process.argv[4] || 'watch';
fs.mkdirSync(out, { recursive: true });
const dir = '/opt/pw-browsers';
const exe = fs.readdirSync(dir).map((d) => path.join(dir, d, 'chrome-linux', 'chrome')).find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => m.type() === 'error' && errs.push('console.error: ' + m.text()));
const sep = url.includes('?') ? '&' : '?';
const shot = (name) => page.screenshot({ path: path.join(out, name + '.png') });
const stats = () => page.evaluate(() => ({ ...window.__combat.sim.stats, t: window.__combat.sim.time, hp: window.__combat.sim.fighters.map((f) => f.hp), log: window.__combat.sim.log.map((e) => [e.t.toFixed(2), e.type, e.by && e.by.name, e.target && e.target.name, e.kind, e.why]) }));

if (scenario === 'watch') {
  await page.goto(url + sep + 'autostart&watch&seed=' + (process.argv[5] || 3));
  await page.waitForFunction(() => window.__combat);
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(1000);
    if (i % 3 === 0) await shot(`watch_${String(i).padStart(2, '0')}`);
  }
  console.log(JSON.stringify(await stats(), null, 0));
} else if (scenario === 'frames') {
  // 접촉이 날 때마다 시뮬레이션을 멈추고 앞뒤 프레임을 찍는다 (막기·쳐내기·피격·헛침·붕괴 각각 한 번씩)
  await page.goto(url + sep + 'autostart&watch&debug&seed=' + (process.argv[5] || 3));
  await page.waitForFunction(() => window.__combat);
  await page.evaluate(() => {
    const c = window.__combat;
    c.want = new Set(['block', 'parry', 'hit', 'whiff', 'break', 'clash']);
    c.sim.on((e) => {
      if (c.want.has(e.type) && !c.caught) {
        c.want.delete(e.type);
        c.caught = e.type;
        c.state.paused = true;
      }
    });
  });
  for (let n = 0; n < 6; n++) {
    const ok = await page.waitForFunction(() => window.__combat.caught, null, { timeout: 40000 }).catch(() => null);
    if (!ok) break;
    const type = await page.evaluate(() => window.__combat.caught);
    // 판정 순간 (타격 정지 첫 프레임)
    await page.waitForTimeout(60);
    await shot(`frame_${type}_0`);
    for (let k = 1; k <= 4; k++) {
      await page.evaluate(() => {
        const c = window.__combat;
        for (let i = 0; i < 4; i++) c.sim.step();
        c.view.render(1 / 30);
      });
      await shot(`frame_${type}_${k}`);
    }
    await page.evaluate(() => {
      const c = window.__combat;
      c.caught = null;
      c.state.paused = false;
    });
  }
  console.log(JSON.stringify(await stats(), null, 0));
} else if (scenario === 'strip') {
  // 결정적으로 한 프레임(1/60 s)씩 진행하며 연속 캡처: 움직임(떨림·미끄러짐·튐)을 보려고. argv[6] = 시작 시각(s), argv[7] = 프레임 수
  await page.goto(url + sep + 'autostart&watch&seed=' + (process.argv[5] || 3) + (process.argv[8] ? '&debug' : ''));
  await page.waitForFunction(() => window.__combat);
  await page.evaluate(() => (window.__combat.state.paused = true));
  const from = Number(process.argv[6] || 2);
  const n = Number(process.argv[7] || 48);
  await page.evaluate((from) => {
    const c = window.__combat;
    c.restart();
    while (c.sim.time < from) {
      c.sim.step();
      if (c.sim.tick % 2 === 0) c.view.render(1 / 60); // (효과도 같이 흘러가게)
    }
  }, from);
  for (let i = 0; i < n; i++) {
    const box = await page.evaluate(() => {
      const c = window.__combat;
      c.sim.step();
      c.sim.step();
      c.view.render(1 / 60);
      const [a, b] = c.sim.fighters;
      const p = c.view.P((a.x + b.x) / 2, (a.y + b.y) / 2, 0.9);
      return { x: p[0], y: p[1], t: c.sim.time };
    });
    await page.screenshot({ path: path.join(out, `strip_${String(i).padStart(3, '0')}.png`), clip: { x: Math.max(0, box.x - 220), y: Math.max(0, box.y - 170), width: 440, height: 300 } });
  }
} else if (scenario === 'play') {
  // 플레이어(아나킨)로 직접: 다가가서 베기, 방어 유지, 쳐내기 시도, 회피, 강공격, 재시작
  await page.goto(url + sep + 'seed=' + (process.argv[5] || 5));
  await page.waitForFunction(() => window.__combat);
  await page.mouse.click(640, 400); // 시작 버튼
  await page.waitForTimeout(300);
  const key = async (k, ms) => (await page.keyboard.down(k), await page.waitForTimeout(ms), await page.keyboard.up(k));
  await key('KeyD', 450);
  await shot('play_00_approach');
  for (let i = 0; i < 3; i++) (await page.mouse.click(640, 360)), await page.waitForTimeout(140);
  await page.waitForTimeout(250);
  await shot('play_01_string');
  await page.mouse.move(640, 360);
  await page.mouse.down({ button: 'right' });
  await page.waitForTimeout(1600);
  await shot('play_02_guard');
  await page.mouse.up({ button: 'right' });
  await page.keyboard.down('KeyW');
  await page.keyboard.press('Space');
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(200);
  await shot('play_03_dodge');
  await page.keyboard.press('KeyF');
  await page.waitForTimeout(700);
  await shot('play_04_heavy');
  // 상대 공격을 보고 쳐내기: 시뮬레이션을 살피다가 오비완이 휘두르기 시작하면 우클릭
  let parried = 0;
  for (let tries = 0; tries < 400 && parried < 1; tries++) {
    const s = await page.evaluate(() => {
      const f = window.__combat.sim.fighters[1];
      return f.state === 'attack' && f.atk.phase === 'windup' ? f.atk.def.windup - f.atk.t : -1;
    });
    if (s > 0.05) {
      await page.waitForTimeout(Math.max(0, (s - 0.07) * 1000));
      await page.mouse.down({ button: 'right' });
      await page.waitForTimeout(250);
      await page.mouse.up({ button: 'right' });
      parried = (await page.evaluate(() => window.__combat.sim.stats.parry)) > 0 ? 1 : 0;
    } else await page.waitForTimeout(16);
    if (tries % 40 === 0) await key('KeyD', 120);
  }
  await shot('play_05_parry_try');
  const before = await stats();
  await page.keyboard.press('KeyR');
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => ({ t: window.__combat.sim.time, hp: window.__combat.sim.fighters.map((f) => f.hp), log: window.__combat.sim.log.length }));
  await shot('play_06_restart');
  console.log(JSON.stringify({ before, after }, null, 0));
}
await browser.close();
if (errs.length) {
  console.error(errs.join('\n'));
  process.exit(1);
}
