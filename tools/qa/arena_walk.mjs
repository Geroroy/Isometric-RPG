// 결투 걸음 QA (docs/characters/MD_ANAKIN.md "전투 연결"): 시험장에서 아나킨이 상대를 본 채 앞·뒤·왼쪽·오른쪽으로 걷고(방어 없이·방어하며)
// 1/30 s마다 캡처 — 고른 동작(walk_f/b/l/r, gwalk_*), 속도, 걷기 위상이 걸은 거리만큼 가는지(= 디딘 발이 바닥에 머무는지).
//   node tools/qa/arena_walk.mjs <url> <outDir>
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const url = process.argv[2] || 'http://127.0.0.1:5199/arena.html';
const out = process.argv[3] || 'tools/qa/out/arena_walk';
fs.mkdirSync(out, { recursive: true });
const dir = '/opt/pw-browsers';
const exe = fs.readdirSync(dir).map((d) => path.join(dir, d, 'chrome-linux', 'chrome')).find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 760 } })).newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => m.type() === 'error' && errs.push('console.error: ' + m.text()));
await page.goto(url + (url.includes('?') ? '&' : '?') + 'autostart&watch');
await page.waitForFunction(() => window.__combat && window.__combat.view.sprites, null, { timeout: 90000 });
// 아나킨 (-1.5, 0) → 오비완 (1.5, 0): 앞 = +x. 화면 방향과 무관하게 월드 벡터로 명령
const MOVES = { f: [1, 0], b: [-1, 0], l: [0, -1], r: [0, 1] };
const res = {};
for (const guard of [false, true])
  for (const [d, v] of Object.entries(MOVES)) {
    const name = (guard ? 'g' : '') + d;
    await page.evaluate(
      ([v, guard]) => {
        const c = window.__combat;
        c.state.paused = true;
        c.sim.spawns = [{ x: d0(v), y: 0 }, { x: 2.6, y: 0 }];
        function d0(v) {
          return v[0] > 0 ? -3 : 0;
        }
        const idle = { command: () => ({ move: { x: 0, y: 0 } }) };
        c.sim.controllers = [{ command: (sim) => ({ move: sim.time > 0.2 ? { x: v[0], y: v[1] } : { x: 0, y: 0 }, guard }) }, idle];
        c.restart();
        c.view.snapCamera();
      },
      [v, guard],
    );
    const rows = [];
    for (let i = 0; i < 60; i++) {
      const r = await page.evaluate(() => {
        const c = window.__combat;
        for (let k = 0; k < 4; k++) c.sim.step();
        c.view.render(1 / 30);
        const f = c.sim.fighters[0];
        const pk = c.view.picks[0];
        const w = c.view.sprites.walk.get(f);
        const P = c.view.P(f.x, f.y, 1);
        return { clip: pk.parts[0].clip, i: pk.parts[0].i, v: Math.hypot(f.vx, f.vy), phase: w ? w.phase : 0, x: f.x, y: f.y, P };
      });
      rows.push(r);
      if (i >= 20 && i < 38) await page.screenshot({ path: path.join(out, `_${name}_${String(i - 20).padStart(2, '0')}.png`), clip: { x: r.P[0] - 110, y: r.P[1] - 120, width: 220, height: 200 } });
    }
    const moving = rows.slice(15);
    res[name] = { clips: [...new Set(moving.map((r) => r.clip))], speed: +(moving.reduce((s, r) => s + r.v, 0) / moving.length).toFixed(3) };
  }
console.log(JSON.stringify(res, null, 1));
fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ res, errs }, null, 1));
for (const e of errs) console.log(e);
await browser.close();
process.exit(errs.length ? 1 : 0);
