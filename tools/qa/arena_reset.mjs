// 결투 시험장: 승부 확정(KO) 뒤 전투 종료와 R(재시작) 직후 상태·카메라를 실제 브라우저와 실제 키 입력으로 확인한다.
//   node tools/qa/arena_reset.mjs <url(arena.html)> <outDir>
// 1) seed 3·7·11 관전: KO 뒤 판정 사건·통계가 늘지 않는가, 주도권 칸이 승패를 보이는가 (KO 뒤 화면)
// 2) R을 진행 중 · 공격 준비 중 · 피격 중 · 타격 정지 중 · KO 뒤 · P 정지 중에 눌러: 그 직후 첫 화면에서 두 결투자가 화면
//    안에 있는가, 체력·균형·위치·버퍼·AI·통계·판정 기록이 처음인가 (R 직후 화면)
// 오류(pageerror·console.error)나 실패한 확인이 있으면 종료 코드 1.
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const url = process.argv[2] || 'http://127.0.0.1:4173/arena.html';
const out = process.argv[3] || 'tools/qa/out/arena_reset';
fs.mkdirSync(out, { recursive: true });
const dir = '/opt/pw-browsers';
const exe = fs.readdirSync(dir).map((d) => path.join(dir, d, 'chrome-linux', 'chrome')).find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe });
const errs = [];
const fails = [];
const results = {};
const check = (name, ok, info = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${info ? ' — ' + info : ''}`);
  if (!ok) fails.push(name);
};
const JUDGE = '^(swing|active|whiff|block|parry|clash|break|hit|evade|ko|dodge|lead)$';

async function open(hash) {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  page.on('pageerror', (e) => errs.push(`${hash}: pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errs.push(`${hash}: console.error: ${m.text()}`));
  await page.goto(`${url}#${hash}`);
  await page.waitForFunction(() => window.__combat);
  // 기록: KO 뒤 판정 사건, R 키가 눌린 순간의 상태 (페이지의 R 처리보다 먼저 듣는다)
  await page.evaluate((J) => {
    const c = window.__combat;
    const re = new RegExp(J);
    c.qa = { late: [], before: null, atReset: null };
    // (수정 전 빌드에는 cameraTarget이 없다: 같은 기준 — 두 결투자의 가운데)
    const tgtOf = (c) => (c.view.cameraTarget ? c.view.cameraTarget() : { x: (c.sim.fighters[0].x + c.sim.fighters[1].x) / 2, y: (c.sim.fighters[0].y + c.sim.fighters[1].y) / 2 });
    // R 처리(sim.reset)가 끝난 바로 그 순간의 상태 — 멈추지 않은 결투는 다음 화면까지 이미 몇 틱 진행되므로 여기서 잰다
    c.sim.on((e, s) => {
      if (e.type !== 'reset') return;
      c.qa.atReset = {
        t: s.time,
        tick: s.tick,
        freeze: s.freeze,
        over: s.over,
        logLen: s.log.length,
        stats: { ...s.stats },
        fighters: s.fighters.map((f, i) => ({ hp: f.hp, bal: f.bal, state: f.state, buffer: f.buffer, atk: !!f.atk, combatOver: f.combatOver, atSpawn: f.x === s.spawns[i].x && f.y === s.spawns[i].y })),
        ais: c.ais.map((a) => ({ hist: a.hist.length, presses: a.presses.length, intent: a.intent })),
        cam: { ...c.view.cam },
        camTarget: tgtOf(c),
      };
    });
    c.sim.on((e, s) => s.over && e.type !== 'over' && re.test(e.type) && c.qa.late.push(`${e.t.toFixed(2)} ${e.type}`));
    addEventListener(
      'keydown',
      (e) => {
        if (e.code !== 'KeyR') return;
        const s = c.sim;
        c.qa.before = { t: +s.time.toFixed(2), freeze: s.freeze, over: !!s.over, paused: c.state.paused, states: s.fighters.map((f) => f.state + (f.atk ? '/' + f.atk.phase : '')) };
      },
      true,
    );
  }, JUDGE);
  return page;
}

// R 직후: 초기화 상태는 reset 순간의 기록, 화면(카메라·두 결투자의 위치)은 그다음 첫 애니메이션 프레임
const afterR = (page) =>
  page.evaluate(
    () =>
      new Promise((res) =>
        requestAnimationFrame(() => {
          const c = window.__combat;
          const s = c.sim;
          const pts = s.fighters.map((f) => c.view.P(f.x, f.y, 0.9)); // (몸 가운데 높이)
          const [A, B] = s.fighters;
          const tgt = c.view.cameraTarget ? c.view.cameraTarget() : { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
          const r0 = c.qa.atReset;
          res({
            before: c.qa.before,
            ...r0,
            camAtReset: Math.hypot(r0.cam.x - r0.camTarget.x, r0.cam.y - r0.camTarget.y),
            frameT: s.time,
            onScreen: pts.map(([x, y]) => x > 40 && x < innerWidth - 40 && y > 40 && y < innerHeight - 40),
            screen: pts.map(([x, y]) => [Math.round(x), Math.round(y)]),
            camOff: Math.hypot(c.view.cam.x - tgt.x, c.view.cam.y - tgt.y),
            lead: document.querySelector('.cb-lead').textContent,
            bars: [...document.querySelectorAll('.cb-bar i')].map((e) => Math.round(e.getBoundingClientRect().width / e.parentElement.getBoundingClientRect().width * 100)),
            overShown: document.querySelector('.cb-over').classList.contains('on') || +getComputedStyle(document.querySelector('.cb-over')).opacity > 0.01 || document.querySelector('.cb-over').textContent.trim() !== '',
          });
        }),
      ),
  );

function judgeReset(name, r) {
  const fresh = r.t === 0 && r.tick === 0 && r.freeze === 0 && !r.over && r.logLen === 0 && Object.values(r.stats).every((v) => v === 0);
  const fighters = r.fighters.every((f) => f.hp === 100 && f.bal === 100 && f.state === 'ready' && !f.buffer && !f.atk && !f.combatOver && f.atSpawn);
  const ais = r.ais.every((a) => a.presses === 0 && a.intent === 'idle');
  check(`R ${name}: 판정·통계·시간 초기화`, fresh, JSON.stringify({ t: r.t, tick: r.tick, log: r.logLen }));
  check(`R ${name}: 체력·균형·위치·버퍼·공격 초기화`, fighters, JSON.stringify(r.fighters));
  check(`R ${name}: AI 초기화`, ais, JSON.stringify(r.ais));
  check(`R ${name}: 첫 화면에 두 결투자 (카메라 즉시)`, r.onScreen.every(Boolean) && r.camAtReset < 1e-6 && r.camOff < 0.05, `화면 ${JSON.stringify(r.screen)} · R 순간 카메라 어긋남 ${r.camAtReset.toFixed(3)} · 첫 화면(${r.frameT.toFixed(3)} s) ${r.camOff.toFixed(3)} m`);
  check(`R ${name}: 첫 화면의 체력·균형 바가 가득 (애니메이션 없이)`, r.bars.every((w) => w >= 99), JSON.stringify(r.bars));
  check(`R ${name}: 승리 화면·승패 문구 사라짐`, !r.overShown && !/승부 결정/.test(r.lead), r.lead);
}

// 1) 관전: KO 뒤
for (const seed of [3, 7, 11]) {
  const page = await open(`autostart-watch-debug-seed${seed}`);
  // (실시간 1× — 승부가 나거나 45 s)
  await page.waitForFunction(() => window.__combat.sim.over || window.__combat.sim.time > 45, null, { timeout: 70000, polling: 200 });
  const ko = await page.evaluate(() => {
    const s = window.__combat.sim;
    return s.over ? { t: s.over.t, winner: s.over.winner.name, stats: JSON.stringify(s.stats) } : null;
  });
  if (!ko) {
    console.log(`seed ${seed}: 45 s 안에 승부 없음 (KO 확인 대상 아님)`);
    results[`seed${seed}`] = { ko: null };
    await page.context().close();
    continue;
  }
  await page.waitForTimeout(3500); // (KO 뒤 3.5 s 더 — 예전엔 이 사이에 헛침이 두 번 기록됐다)
  const post = await page.evaluate(() => {
    const c = window.__combat;
    return { late: c.qa.late, stats: JSON.stringify(c.sim.stats), lead: document.querySelector('.cb-lead').textContent, over: document.querySelector('.cb-over').textContent, intents: c.ais.map((a) => a.intentLabel), t: c.sim.time };
  });
  check(`seed ${seed}: KO(${ko.t.toFixed(2)} s, ${ko.winner} 승) 뒤 판정 사건 없음`, post.late.length === 0, post.late.join(', '));
  check(`seed ${seed}: KO 뒤 통계 그대로`, post.stats === ko.stats);
  check(`seed ${seed}: 주도권 칸이 승패를 보임`, /승부 결정/.test(post.lead) && !/대등/.test(post.lead), post.lead);
  check(`seed ${seed}: AI 의도 = 결투 끝`, post.intents.every((x) => x === '결투 끝'), post.intents.join(','));
  await page.screenshot({ path: path.join(out, `ko_seed${seed}.png`) });
  // KO 뒤 P → R (보고된 순서)
  await page.keyboard.press('KeyP');
  await page.waitForTimeout(150);
  await page.keyboard.press('KeyR');
  const r = await afterR(page);
  judgeReset(`seed ${seed} KO 뒤 P 정지 중`, r);
  await page.screenshot({ path: path.join(out, `reset_after_ko_seed${seed}.png`) });
  results[`seed${seed}`] = { ko, post, reset: r };
  await page.context().close();
}

// 2) R을 여러 순간에 (seed 11 관전)
const moments = [
  ['진행 중', 'time > 3', false],
  ['공격 준비 중', "fighters.some((f) => f.state === 'attack' && f.atk.phase === 'windup' && f.atk.t < f.atk.def.windup - 0.1)", false],
  ['피격 중', "fighters.some((f) => f.state === 'hitstun' && f.st < f.dur - 0.15)", false],
  ['타격 정지 중 (멈춘 채)', 'freeze > 0', true],
  ['P 정지 중', 'time > 4', true],
];
for (const [name, cond, pause] of moments) {
  const page = await open('autostart-watch-debug-seed11');
  const fn = new Function('s', `const fighters = s.fighters; const time = s.time; const freeze = s.freeze; return ${cond};`);
  // (조건이 되는 순간: 멈춰야 하는 장면은 페이지 안에서 바로 정지 — 그 뒤 실제 키 P 확인 없이 R)
  await page.evaluate(
    ([src, pause]) => {
      const c = window.__combat;
      const f = new Function('s', src);
      c.qa.hit = false;
      c.sim.on(() => {
        if (!c.qa.hit && f(c.sim)) {
          c.qa.hit = true;
          if (pause) c.state.paused = true;
        }
      });
      const poll = () => {
        if (!c.qa.hit && f(c.sim)) {
          c.qa.hit = true;
          if (pause) c.state.paused = true;
        }
        if (!c.qa.hit) requestAnimationFrame(poll);
      };
      poll();
    },
    [`const fighters = s.fighters; const time = s.time; const freeze = s.freeze; return ${cond};`, pause],
  );
  void fn;
  await page.waitForFunction(() => window.__combat.qa.hit, null, { timeout: 40000, polling: 'raf' });
  await page.keyboard.press('KeyR');
  const r = await afterR(page);
  check(`R ${name}: 누른 순간 상태 ${JSON.stringify(r.before)}`, !!r.before);
  judgeReset(name, r);
  await page.screenshot({ path: path.join(out, `reset_${name.replace(/[ ()]/g, '_')}.png`) });
  // 재시작한 결투가 다시 진행된다 (정지였으면 P로 풀고)
  if (pause) await page.keyboard.press('KeyP');
  await page.waitForTimeout(2500);
  const go = await page.evaluate(() => ({ t: window.__combat.sim.time, on: window.__combat.sim.fighters.map((f) => window.__combat.view.P(f.x, f.y, 0.9)).every(([x, y]) => x > 0 && x < innerWidth && y > 0 && y < innerHeight) }));
  check(`R ${name}: 재시작한 결투가 진행·화면 안`, go.t > 1.5 && go.on, JSON.stringify(go));
  results[name] = r;
  await page.context().close();
}

fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(results, null, 1));
await browser.close();
if (errs.length) console.error(errs.join('\n'));
console.log(fails.length ? `실패 ${fails.length}개` : '모두 통과');
process.exit(errs.length || fails.length ? 1 : 0);
