// 검술 비교 (docs/COMBAT.md "검술 v1"): 같은 입력을 아나킨과 오비완에게 똑같이 주고, 시뮬레이션을 1/30 s씩 결정적으로
// 진행하며 연속 화면을 찍는다. 조작하는 쪽은 언제나 화면 왼쪽, 상대(허수아비)는 오른쪽 — 두 캐릭터의 화면 구도가 같다.
//   node tools/qa/arena_styles.mjs <url> <outDir> [scenario…]
//   scenario: string (막는 상대에게 기본 연속 공격 → 강공격) · parry (쳐내기 → 반격) · whiff (물러나는 상대에게 3연타 헛침 → 상대 반격)
// 결과: <outDir>/<scenario>_<anakin|obiwan>/f###.jpg, <scenario>_<…>.json (판정 기록·발 디딤 수), 그리고 ffmpeg가 있으면
//   <scenario>.mp4 (좌우 비교) · <scenario>_sheet.jpg (주요 순간 연속 화면).
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const url = process.argv[2] || 'http://127.0.0.1:4173/arena.html';
const out = process.argv[3] || 'tools/qa/out/styles';
const scenarios = process.argv.slice(4).length ? process.argv.slice(4) : ['string', 'parry', 'whiff'];
fs.mkdirSync(out, { recursive: true });
const dir = '/opt/pw-browsers';
const exe = fs.readdirSync(dir).map((d) => path.join(dir, d, 'chrome-linux', 'chrome')).find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe });
const W = 960;
const H = 600;
const FPS = 30;
const errs = [];

/** 페이지 안에서: 시나리오의 컨트롤러 둘 (조작하는 쪽 me, 허수아비 dummy) — 둘 다 시뮬레이션이 보는 명령만 낸다 */
function setup({ name, meSide }) {
  const c = window.__combat;
  const sim = c.sim;
  c.state.paused = true;
  const L = { x: -1.2, y: 1.2 };
  const dist = { string: 1.85, parry: 1.9, whiff: 2.45 }[name];
  const ang = Math.atan2(-1, 1);
  const R = { x: L.x + Math.cos(ang) * dist, y: L.y + Math.sin(ang) * dist };
  sim.spawns = meSide === 0 ? [L, R] : [R, L];
  const log = [];
  const mk = (fn) => ({ prev: false, command(s, me, foe) {
    const cmd = fn(s, me, foe, this) || {};
    cmd.move ||= { x: 0, y: 0 };
    if (cmd.guard && !this.prev) cmd.guardPressed = true;
    this.prev = !!cmd.guard;
    return cmd;
  } });
  const toward = (me, foe, k) => {
    const d = Math.hypot(foe.x - me.x, foe.y - me.y) || 1;
    return { x: ((foe.x - me.x) / d) * k, y: ((foe.y - me.y) / d) * k };
  };
  let me;
  let dummy;
  if (name === 'string') {
    // 같은 입력: 0.3 s부터 1.6 s까지 0.12 s마다 클릭(이어 베기가 될 때마다 바로), 2.7 s에 F (강공격). 상대는 방어만
    me = mk((s) => {
      const t = s.time;
      const click = t >= 0.3 && t <= 1.6 && Math.round(t * 120) % Math.round(0.12 * 120) === 0;
      return { attack: click, heavy: Math.abs(t - 2.7) < 0.004 };
    });
    dummy = mk(() => ({ guard: true }));
  } else if (name === 'parry') {
    // 상대가 0.35 s에 베기 → 판정 0.06 s 전에 방어를 새로 누름(쳐내기) → 쳐내면 바로 클릭(반격). 상대는 쳐내진 뒤 가만히
    dummy = mk((s) => ({ attack: Math.abs(s.time - 0.35) < 0.004 }));
    me = mk((s, m, foe, st) => {
      const a = foe.atk;
      let guard = false;
      if (a && a.phase === 'windup' && a.def.windup - a.t <= 0.06) guard = true;
      if (foe.state === 'parried') guard = true;
      const counter = foe.state === 'parried' && !st.done && s.time - st.parryT > 0.03;
      if (foe.state === 'parried' && !st.parryT) st.parryT = s.time;
      if (counter) st.done = true;
      return { guard: guard && !counter, attack: counter };
    });
  } else {
    // 같은 입력: 우클릭(방어)을 내내 누른 채 0.3 s부터 0.12 s마다 클릭(3연타) — 검이 돌아오는 대로 방어가 선다.
    // 상대는 휘두르기를 보면 물러나고, 3타가 헛치면 다가와 벤다
    me = mk((s) => {
      const t = s.time;
      return { guard: true, attack: t >= 0.3 && t <= 1.7 && Math.round(t * 120) % Math.round(0.12 * 120) === 0 };
    });
    dummy = mk((s, d, foe, st) => {
      const a = foe.atk;
      if (st.punish) {
        const near = Math.hypot(foe.x - d.x, foe.y - d.y) < d.attacks.light1.reach + d.attacks.light1.lunge * 0.6;
        if (near && !st.hit) return (st.hit = true), { attack: true };
        return { move: st.hit ? null : toward(d, foe, 1) };
      }
      if (foe.state === 'attack' && a && a.kind === 'light3' && a.outcome === 'whiff') st.punish = true;
      if (foe.state === 'attack' && a && a.phase !== 'recovery') return { move: toward(d, foe, -1) };
      return null;
    });
  }
  sim.controllers = meSide === 0 ? [me, dummy] : [dummy, me];
  sim.reset();
  c.log = log;
  sim.on((e) => {
    if (/^(swing|block|parry|hit|whiff|clash|break|evade)$/.test(e.type)) log.push({ t: +e.t.toFixed(3), type: e.type, by: e.by && e.by.style, target: e.target && e.target.style, kind: e.kind, why: e.why, press: e.press });
  });
  c.view.render(0);
}

const stepFrame = () =>
  window.__combat && (() => {
    const c = window.__combat;
    for (let i = 0; i < 4; i++) c.sim.step();
    c.view.render(1 / 30);
    c.hud && c.hud.update && c.hud.update(1 / 30, false);
    const f = c.sim.fighters;
    return { t: c.sim.time, st: f.map((x) => x.state + (x.atk ? ':' + x.atk.kind + ':' + x.atk.phase : '')), steps: f.map((x) => (x.gait ? x.gait.steps : 0)), x: f.map((x) => [x.x, x.y]) };
  })();

const DUR = { string: 4.2, parry: 2.2, whiff: 3.6 };
const summary = {};
for (const name of scenarios) {
  for (const who of ['anakin', 'obiwan']) {
    const page = await (await browser.newContext({ viewport: { width: W, height: H } })).newPage();
    page.on('pageerror', (e) => errs.push(`${name}/${who} pageerror: ${e.message}`));
    page.on('console', (m) => m.type() === 'error' && errs.push(`${name}/${who} console.error: ${m.text()}`));
    await page.goto(url + '#autostart');
    await page.waitForFunction(() => window.__combat);
    await page.evaluate(setup, { name, meSide: who === 'anakin' ? 0 : 1 });
    const d = path.join(out, `${name}_${who}`);
    fs.rmSync(d, { recursive: true, force: true });
    fs.mkdirSync(d, { recursive: true });
    const frames = [];
    const n = Math.round(DUR[name] * FPS);
    for (let i = 0; i < n; i++) {
      frames.push(await page.evaluate(stepFrame));
      await page.screenshot({ path: path.join(d, `f${String(i).padStart(3, '0')}.jpg`), type: 'jpeg', quality: 86 });
    }
    const log = await page.evaluate(() => window.__combat.log);
    summary[`${name}_${who}`] = { log, steps: frames.at(-1).steps };
    fs.writeFileSync(path.join(out, `${name}_${who}.json`), JSON.stringify({ log, frames }, null, 0));
    await page.close();
  }
  // 좌우 비교 영상 + 연속 화면
  try {
    const font = path.resolve('node_modules/pretendard/dist/public/static/Pretendard-Bold.otf');
    const lab = (t) => `drawtext=fontfile=${font}:text='${t}':x=16:y=14:fontsize=26:fontcolor=white:box=1:boxcolor=black@0.55:boxborderw=8`;
    const title = { string: '같은 입력 — 클릭 연타(연속 공격) 후 F', parry: '같은 입력 — 상대 베기를 쳐내고 바로 클릭', whiff: '같은 입력 — 방어 버튼을 쥔 채 물러나는 상대에게 3연타 헛침, 상대 반격' }[name];
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(out, `${name}_anakin`, 'f%03d.jpg'), '-framerate', String(FPS), '-i', path.join(out, `${name}_obiwan`, 'f%03d.jpg'),
      '-filter_complex', `[0]${lab('아나킨 (왼쪽이 조작)')}[a];[1]${lab('오비완 (왼쪽이 조작)')}[b];[a][b]hstack=inputs=2,drawtext=fontfile=${font}:text='${title}':x=(w-text_w)/2:y=h-44:fontsize=24:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=8,format=yuv420p`,
      '-c:v', 'libx264', '-crf', '22', path.join(out, `${name}.mp4`)]);
  } catch (e) {
    errs.push(`ffmpeg ${name}: ${e.message.split('\n')[0]}`);
  }
}
await browser.close();
console.log(JSON.stringify(summary, null, 1));
if (errs.length) {
  console.error(errs.join('\n'));
  process.exit(1);
}
