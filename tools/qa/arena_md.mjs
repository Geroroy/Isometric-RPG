// Movie Duels 아나킨 시트의 접촉·판정 QA (docs/characters/MD_ANAKIN.md "전투 연결"): 실제 브라우저로 시험장을 열어 정해진 장면을
// 1/120 s씩 결정적으로 돌린다 — 아나킨의 첫 베기가 막힘·쳐내짐·명중, 오비완의 첫 베기를 아나킨이 막음·쳐냄·맞음.
//   · 판정 순간(사건 block·parry·hit): 접촉점에서 화면에 그린 두 날(시트 표지의 saberBase→saberTip)까지의 거리 (m) — 막기·쳐내기는
//     두 날이 접촉점을 지나야 하고, 명중은 공격한 날이 접촉점을 지나야 한다
//   · 아나킨 첫 베기의 판정 첫 틱(windup 끝)에 고른 프레임 = 시트의 hit 프레임
//   · 장면마다 아나킨이 쓴 동작(시트에 없는 동작으로 대체됐는지)
//   · 판정 순간 확대 캡처와 앞뒤 0.25 s 연속 캡처 (1/60 s 간격 — strip_<장면>.png로 이어 붙임은 tools/qa/sheetstrip.py 없이 이 스크립트가)
//   node tools/qa/arena_md.mjs <url> <outDir>
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const url = process.argv[2] || 'http://127.0.0.1:5199/arena.html';
const out = process.argv[3] || 'tools/qa/out/arena_md';
fs.mkdirSync(out, { recursive: true });
const dir = '/opt/pw-browsers';
const exe = fs.readdirSync(dir).map((d) => path.join(dir, d, 'chrome-linux', 'chrome')).find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 760 } })).newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => m.type() === 'error' && errs.push('console.error: ' + m.text()));
const sep = url.includes('?') ? '&' : '?';
await page.goto(url + sep + 'autostart&watch');
await page.waitForFunction(() => window.__combat && (window.__combat.view.sprites || window.__combat.spritesFailed), null, { timeout: 90000 });
const used = await page.evaluate(() => window.__combat.spritesFailed || window.__combat.view.sprites.used);
console.log('sheets', used);
if (!used || used.anakin !== 'md') errs.push('MD 시트를 쓰지 않음: ' + JSON.stringify(used));

// 장면: [이름, 아나킨 명령표, 오비완 명령표] — 명령표 { attack: 시각, guard: [시작, 끝] }
const AW = 0.27; // 아나킨 첫 베기 windup (tuning.js)
const OW = 0.26; // 오비완 첫 베기 windup
const T0 = 0.3;
const SCENES = [
  ['a_blocked', { attack: T0 }, { guard: [0, 9] }],
  ['a_parried', { attack: T0 }, { guard: [T0 + AW - 0.05, 9] }],
  ['a_hits', { attack: T0 }, {}],
  ['o_blocked', { guard: [0, 9] }, { attack: T0 }],
  ['o_parried', { guard: [T0 + OW - 0.05, 9] }, { attack: T0 }],
  ['o_hits', {}, { attack: T0 }],
];
const report = [];
for (const [name, sa, so] of SCENES) {
  await page.evaluate(
    ([sa, so]) => {
      const c = window.__combat;
      const ctl = (s) => ({
        reset() {
          this.done = false;
          this.prev = false;
        },
        command(sim) {
          const t = sim.time;
          const cmd = { move: { x: 0, y: 0 } };
          const g = !!s.guard && t >= s.guard[0] - 1e-9 && t < s.guard[1];
          cmd.guard = g;
          if (g && !this.prev) cmd.guardPressed = true;
          this.prev = g;
          if (s.attack !== undefined && !this.done && t >= s.attack - 1e-9) (this.done = true), (cmd.attack = true);
          return cmd;
        },
      });
      c.state.paused = true;
      c.sim.spawns = [{ x: -0.67, y: 0.67 }, { x: 0.67, y: -0.67 }]; // (1.9 m, 화면 대각선)
      c.sim.controllers = [ctl(sa), ctl(so)];
      c.restart();
      c.view.snapCamera();
      if (c.qa && c.qa.off) c.qa.off();
      c.qa = { ev: [], clips: new Set(), prevT: -1 };
      c.qa.off = c.sim.on((e) => /^(block|parry|hit|clash|whiff)$/.test(e.type) && c.qa.ev.push(e));
    },
    [sa, so],
  );
  const rec = { scene: name, events: [], hitFrame: null, clips: null, shots: 0 };
  let evAt = null;
  const strip = [];
  for (let i = 0; i < 1.4 * 120; i++) {
    const r = await page.evaluate(() => {
      const c = window.__combat;
      c.sim.step();
      c.view.render(1 / 120);
      const A = c.sim.fighters[0];
      const pk = c.view.picks[0];
      if (pk) for (const p of pk.parts) c.qa.clips.add(p.clip);
      let hit = null;
      // (판정 첫 틱: 공격 시각이 windup을 넘어선 틱 — 그 틱에 막히면 바로 회복으로 넘어가도)
      const at = A.state === 'attack' ? A.atk.t : -1;
      if (at >= A.atk?.def.windup - 1e-9 && c.qa.prevT < A.atk.def.windup - 1e-9 && c.qa.prevT >= 0) hit = { clip: pk.blade.clip, i: pk.blade.i, want: c.view.sprites.lib.styles.anakin[A.atk.kind].hit };
      c.qa.prevT = at;
      const ev = c.qa.ev.shift();
      let m = null;
      if (ev) {
        const S = c.view.cam.s * 22.4;
        const P = c.view.P(...ev.at);
        const segd = (bl) => {
          if (!bl) return null;
          const [a, b] = bl;
          const vx = b[0] - a[0];
          const vy = b[1] - a[1];
          const t = Math.max(0, Math.min(1, ((P[0] - a[0]) * vx + (P[1] - a[1]) * vy) / (vx * vx + vy * vy || 1)));
          return +(Math.hypot(a[0] + vx * t - P[0], a[1] + vy * t - P[1]) / S).toFixed(3);
        };
        m = { type: ev.type, by: ev.by && ev.by.side, at: P, anakin: segd(c.view.bladeOf(c.sim.fighters[0])), obiwan: segd(c.view.bladeOf(c.sim.fighters[1])), clipA: pk && pk.blade.clip + ':' + pk.blade.i };
      }
      const [F0, F1] = c.sim.fighters;
      const mid = c.view.P((F0.x + F1.x) / 2, (F0.y + F1.y) / 2, 1.0);
      return { t: c.sim.time, hit, m, mid, st: [F0.state, F1.state] };
    });
    if (r.hit && !rec.hitFrame) rec.hitFrame = r.hit;
    if (r.m) {
      rec.events.push(r.m);
      if (r.m.type !== 'whiff' && evAt === null) {
        evAt = i;
        await page.screenshot({ path: path.join(out, `contact_${name}.png`), clip: { x: Math.max(0, r.mid[0] - 260), y: Math.max(0, r.mid[1] - 200), width: 520, height: 340 } });
      }
    }
    // 연속 캡처: 공격 시작 0.1 s 뒤부터 1/60 s마다 30장
    if (i >= (T0 + 0.1) * 120 && i % 2 === 0 && strip.length < 30) {
      const f = path.join(out, `_s_${name}_${String(strip.length).padStart(2, '0')}.png`);
      await page.screenshot({ path: f, clip: { x: Math.max(0, r.mid[0] - 200), y: Math.max(0, r.mid[1] - 190), width: 400, height: 300 } });
      strip.push(f);
    }
  }
  rec.clips = await page.evaluate(() => [...window.__combat.qa.clips]);
  rec.strip = strip;
  report.push(rec);
  console.log(name, JSON.stringify({ events: rec.events.map((e) => `${e.type} A${e.anakin} O${e.obiwan} ${e.clipA}`), hitFrame: rec.hitFrame, clips: rec.clips }));
}
fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ used, report, errors: errs }, null, 1));
for (const e of errs) console.log(e);
await browser.close();
process.exit(errs.length ? 1 : 0);
