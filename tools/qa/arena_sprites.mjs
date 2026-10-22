// 결투자 스프라이트 QA (docs/CHARACTERS.md): 실제 브라우저로 시험장을 열어 AI 대 AI를 1/60 s씩 결정적으로 진행하며
//   · 화면에 그린 날(프레임의 saberBase→saberTip 표지)과 pose.js의 날(판정·접촉 효과가 쓰는 자세)의 화면 거리 (상태별, CSS px와 m)
//   · 고른 프레임이 바뀌는 횟수 (같은 상태에서 프레임이 앞뒤로 튀는지: 역행 횟수)
//   · 막기·쳐내기·피격·맞부딪힘이 처음 날 때 결투자 둘레를 확대 캡처 (접촉 불꽃과 그림 속 두 검이 만나는지)
//   node tools/qa/arena_sprites.mjs <url> <outDir> [seed] [초]
// 오류(pageerror·console.error)나 시트 불러오기 실패면 종료 코드 1.
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const url = process.argv[2] || 'http://127.0.0.1:5199/arena.html';
const out = process.argv[3] || 'tools/qa/out/arena_sprites';
const seed = Number(process.argv[4] || 3);
const secs = Number(process.argv[5] || 25);
fs.mkdirSync(out, { recursive: true });
const dir = '/opt/pw-browsers';
const exe = fs.readdirSync(dir).map((d) => path.join(dir, d, 'chrome-linux', 'chrome')).find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 760 } })).newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => m.type() === 'error' && errs.push('console.error: ' + m.text()));
const sep = url.includes('?') ? '&' : '?';
await page.goto(url + sep + `autostart&watch&seed=${seed}`);
await page.waitForFunction(() => window.__combat && (window.__combat.view.sprites || window.__combat.spritesFailed), null, { timeout: 90000 });
const failed = await page.evaluate(() => window.__combat.spritesFailed);
if (failed) errs.push('sprites: ' + failed);
await page.evaluate(() => {
  const c = window.__combat;
  c.state.paused = true;
  c.restart();
  c.qa = { first: {}, caught: null };
  c.sim.on((e) => {
    if (/^(block|parry|hit|clash)$/.test(e.type) && !c.qa.first[e.type]) c.qa.first[e.type] = c.qa.caught = e.type;
  });
});
const per = {};
const flips = { changes: 0, back: 0 };
let shots = 0;
const n = Math.round(secs * 60);
for (let i = 0; i < n; i++) {
  const r = await page.evaluate(() => {
    const c = window.__combat;
    c.sim.step();
    c.sim.step();
    c.view.render(1 / 60);
    const res = [];
    for (const f of c.sim.fighters) {
      const pk = c.view.picks[f.side];
      const bl = c.view.bladeOf(f);
      if (!pk || !bl) continue;
      const p = c.view.poses[f.side];
      const a = c.view.P(...p.bladeBase);
      const b = c.view.P(...p.tip);
      const S = c.view.cam.s * 22.4; // (CSS px per m on the floor, view.js PX_M)
      const st = f.state + (f.state === 'attack' ? '.' + f.atk.phase : '') + (Math.hypot(f.vx, f.vy) > 0.25 ? '.move' : '');
      res.push({ side: f.side, st, base: Math.hypot(bl[0][0] - a[0], bl[0][1] - a[1]) / S, tip: Math.hypot(bl[1][0] - b[0], bl[1][1] - b[1]) / S, clip: pk.blade.clip, i: pk.blade.i });
    }
    const caught = c.qa.caught;
    c.qa.caught = null;
    const [A, B] = c.sim.fighters;
    const m = c.view.P((A.x + B.x) / 2, (A.y + B.y) / 2, 1.0);
    return { res, caught, m, t: c.sim.time, over: !!c.sim.over };
  });
  for (const x of r.res) {
    (per[x.st] ||= []).push([x.base, x.tip]);
    const key = 'last' + x.side;
    const prev = flips[key];
    if (prev && prev.clip === x.clip && prev.i !== x.i) {
      flips.changes++;
      if (x.i < prev.i && !x.clip.startsWith('walk') && !x.clip.startsWith('gwalk') && !x.clip.startsWith('up_') && !x.clip.startsWith('low_')) flips.back++;
    }
    flips[key] = { clip: x.clip, i: x.i };
  }
  if (r.caught && shots < 8) {
    shots++;
    await page.screenshot({ path: path.join(out, `contact_${r.caught}.png`), clip: { x: Math.max(0, r.m[0] - 260), y: Math.max(0, r.m[1] - 210), width: 520, height: 360 } });
  }
  if (i % 300 === 0) await page.screenshot({ path: path.join(out, `watch_${String(i / 60).padStart(2, '0')}s.png`) });
  if (r.over) break;
}
const q = (a, k) => a[Math.min(a.length - 1, Math.floor(a.length * k))];
const rows = Object.entries(per)
  .sort((a, b) => b[1].length - a[1].length)
  .map(([k, v]) => {
    const bs = v.map((x) => x[0]).sort((a, b) => a - b);
    const ts = v.map((x) => x[1]).sort((a, b) => a - b);
    return { state: k, n: v.length, baseMed: +q(bs, 0.5).toFixed(3), base90: +q(bs, 0.9).toFixed(3), tipMed: +q(ts, 0.5).toFixed(3), tip90: +q(ts, 0.9).toFixed(3) };
  });
const summary = { seed, seconds: secs, rows, frameChanges: flips.changes, backwardsInAttacks: flips.back, errors: errs };
fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify(summary, null, 1));
console.table(rows);
console.log('frame changes', flips.changes, 'backwards in timed clips', flips.back, 'errors', errs.length);
for (const e of errs) console.log(e);
await browser.close();
process.exit(errs.length ? 1 : 0);
