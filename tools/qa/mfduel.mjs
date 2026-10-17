// 무스타파 맵 결투 QA (game/mapDuel.js, docs/COMBAT.md "맵 연결"): 실제 브라우저로 '#duel-mustafar'를 열어 사람처럼 조작한다 —
//   시작 → 착륙장을 걸어 오비완에게 (D+S 유지: 먼 이동 4.6 m/s, 가는 쪽을 봄) → 붙으면 결투 걸음 (상대를 보고 3.5 m/s 이하)
//   → 베기 연타·방어 → KO → 결과 화면 → R 재시작 (두 사람이 처음 자리, 체력 100) → 다시 걷기.
// KO까지 오래 걸리지 않게 오비완의 체력을 처음에 25로 둔다 (QA 단축: 판정·피해 규칙은 그대로 — 체력이 피격 사건으로만 주는지 확인).
// 단계마다 화면 캡처, 연속 캡처(걷기·첫 접촉), 수치(속도·방향·사용한 시트 동작·사건), 오류(pageerror·console.error·404).
//   node tools/qa/mfduel.mjs <url (… /#duel-mustafar 없이 기본 주소)> <outDir>
// (출력 폴더의 requests.json: 이 흐름이 요청한 같은 출처 파일 — 아티팩트 파일 목록, CLAUDE.md "아티팩트는 무스타파 결투 전용")
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const base = (process.argv[2] || 'http://127.0.0.1:5199/').replace(/#.*$/, '');
const out = process.argv[3] || 'tools/qa/out/mfduel';
fs.mkdirSync(out, { recursive: true });
const dir = '/opt/pw-browsers';
const exe = fs.readdirSync(dir).map((d) => path.join(dir, d, 'chrome-linux', 'chrome')).find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: process.env.NOWEBGL ? ['--disable-webgl', '--disable-3d-apis'] : [] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 760 } })).newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => m.type() === 'error' && errs.push('console.error: ' + m.text()));
page.on('response', (r) => r.status() >= 400 && errs.push(`HTTP ${r.status()} ${r.url()}`));
const origin = new URL(base).origin;
const requested = new Set();
page.on('request', (r) => {
  const u = new URL(r.url());
  if (u.origin === origin) requested.add(decodeURIComponent(u.pathname.slice(1)) || 'index.html');
});
await page.goto(base + '#duel-mustafar');
await page.waitForFunction(() => window.__ready, null, { timeout: 180000 });
await page.waitForFunction(() => window.__game.duel.view.sprites || window.__game.duel.hud.badge.textContent.includes('임시'), null, { timeout: 60000 });
await page.screenshot({ path: path.join(out, '00_title.png') });
await page.click('#startBtn');
await page.waitForTimeout(600);
const state = () =>
  page.evaluate(() => {
    const d = window.__game.duel;
    const [a, o] = d.sim.fighters;
    const pk = d.view.picks[0];
    return {
      t: +d.sim.time.toFixed(2),
      a: { x: +a.x.toFixed(2), y: +a.y.toFixed(2), st: a.state, hp: a.hp, v: +Math.hypot(a.vx, a.vy).toFixed(2), face: +a.facing.toFixed(2), trav: a.traveling, clip: pk ? pk.parts.map((p) => p.clip + ':' + p.i).join('+') : null },
      o: { x: +o.x.toFixed(2), y: +o.y.toFixed(2), st: o.state, hp: o.hp },
      dist: +Math.hypot(a.x - o.x, a.y - o.y).toFixed(2),
      over: d.sim.over ? { winner: d.sim.over.winner.name } : null,
      used: d.view.sprites && d.view.sprites.used,
      overText: document.querySelector('.cb-over') && document.querySelector('.cb-over').textContent,
    };
  });
const log = [];
const s0 = await state();
log.push(['start', s0]);
console.log('start', JSON.stringify(s0));
await page.screenshot({ path: path.join(out, '01_start.png') });
await page.evaluate(() => (window.__game.duel.sim.fighters[1].hp = 25));
// 1. 걷기: D+S (화면 오른쪽 아래 = 월드 +x)
await page.keyboard.down('KeyD');
await page.keyboard.down('KeyS');
let walk = [];
for (let i = 0; i < 60; i++) {
  await page.waitForTimeout(100);
  const s = await state();
  walk.push(s);
  if (i % 4 === 0) await page.screenshot({ path: path.join(out, `_walk_${String(i).padStart(2, '0')}.png`), clip: { x: 340, y: 120, width: 600, height: 460 } });
  if (s.dist < 2.6) break;
}
await page.keyboard.up('KeyD');
await page.keyboard.up('KeyS');
const trav = walk.filter((s) => s.a.trav);
const close = walk.filter((s) => !s.a.trav && s.a.v > 0.3);
log.push(['walk', { travelSamples: trav.length, travelSpeed: trav.map((s) => s.a.v), travelClips: [...new Set(trav.map((s) => s.a.clip && s.a.clip.split(':')[0]))], closeSpeed: close.map((s) => s.a.v), closeClips: [...new Set(close.map((s) => s.a.clip))], last: walk[walk.length - 1] }]);
console.log('walk', JSON.stringify(log[log.length - 1][1]).slice(0, 600));
await page.screenshot({ path: path.join(out, '02_engaged.png') });
// 2. 싸움: 베기 연타 (0.22 s마다 좌클릭), 가끔 방어 (우클릭 유지) — KO까지
const box = { x: 640, y: 380 };
let fight = [];
for (let i = 0; i < 160; i++) {
  const s = await state();
  fight.push(s);
  if (s.over) break;
  if (s.dist > 2.2) {
    // (멀어지면 다시 다가감)
    const dx = s.o.x - s.a.x;
    const dy = s.o.y - s.a.y;
    const sx = dx - dy;
    const sy = dx + dy;
    const k = [sx > 0.3 ? 'KeyD' : sx < -0.3 ? 'KeyA' : null, sy > 0.3 ? 'KeyS' : sy < -0.3 ? 'KeyW' : null].filter(Boolean);
    for (const c of k) await page.keyboard.down(c);
    await page.waitForTimeout(160);
    for (const c of k) await page.keyboard.up(c);
    continue;
  }
  if (i % 7 === 6) {
    await page.mouse.move(box.x, box.y);
    await page.mouse.down({ button: 'right' });
    await page.waitForTimeout(300);
    await page.mouse.up({ button: 'right' });
  } else {
    await page.mouse.click(box.x, box.y);
    await page.waitForTimeout(220);
  }
  if (i === 3) await page.screenshot({ path: path.join(out, '03_fight.png') });
}
const sF = await state();
log.push(['fight', { ticks: fight.length, final: sF, events: await page.evaluate(() => window.__game.duel.sim.stats) }]);
console.log('fight', JSON.stringify(log[log.length - 1][1]));
await page.waitForTimeout(900);
await page.screenshot({ path: path.join(out, '04_ko.png') });
const ko = await state();
// 3. 재시작
await page.keyboard.press('KeyR');
await page.waitForTimeout(400);
const r = await state();
log.push(['restart', { before: ko, after: r }]);
console.log('restart', JSON.stringify(r));
await page.screenshot({ path: path.join(out, '05_restart.png') });
// (재시작 뒤 0.4 s: 아나킨은 처음 자리, 오비완은 AI가 막 움직이기 시작 — 처음 자리 1.5 m 안)
const okRestart = !r.over && r.t < 1 && r.a.hp === 100 && r.o.hp === 100 && Math.hypot(r.a.x - 77, r.a.y - 98.5) < 0.3 && Math.hypot(r.o.x - s0.o.x, r.o.y - s0.o.y) < 1.5 && !/승리|패배/.test(r.overText || '');
// 4. 재시작 뒤 다시 걷기
await page.keyboard.down('KeyD');
await page.waitForTimeout(700);
await page.keyboard.up('KeyD');
const r2 = await state();
log.push(['walk_again', r2]);
const summary = {
  used: s0.used,
  travel: { samples: trav.length, speedOk: trav.length > 3 && trav.every((s) => s.a.v <= 4.61) && trav.some((s) => Math.abs(s.a.v - 4.6) < 0.05), clipsRun: trav.some((s) => (s.a.clip || '').startsWith('run_f')) },
  ko: !!ko.over,
  koWinner: ko.over && ko.over.winner,
  restart: okRestart,
  walkAgain: Math.hypot(r2.a.x - r.a.x, r2.a.y - r.a.y) > 0.5,
  errors: errs,
};
fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ summary, log }, null, 1));
fs.writeFileSync(path.join(out, 'requests.json'), JSON.stringify([...requested].sort(), null, 1));
console.log(JSON.stringify(summary, null, 1));
await browser.close();
process.exit(errs.length || !summary.ko || !summary.restart ? 1 : 0);
