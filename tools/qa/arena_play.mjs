// 결투 시험장을 실제 브라우저 입력(Playwright 키보드·마우스)으로 플레이하고 영상·판정 기록을 남긴다.
//   node tools/qa/arena_play.mjs <url> <outDir> [초=12]
// 장면: 방어 유지 · 공격 반복 · 쳐내기 후 반격 · 후퇴로 헛치기 유도 (아나킨 = 시험자, 오비완 = AI), 그리고 AI 대 AI 관전.
// 시험자는 페이지의 시뮬레이션 상태를 읽어 반응한다(시험용 — AI는 그렇지 않다). 입력은 진짜 키·마우스 이벤트.
// 결과: <outDir>/<장면>.mp4 (Chrome 화면 전송 프레임 → 시스템 ffmpeg), report.json (장면별 판정 수). 오류(pageerror·console.error)가 있으면 종료 코드 1.
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const url = process.argv[2] || 'http://127.0.0.1:4173/arena.html';
const out = process.argv[3] || 'tools/qa/out/arena_play';
const SECS = Number(process.argv[4] || 12);
fs.mkdirSync(out, { recursive: true });
const dir = '/opt/pw-browsers';
const exe = fs.readdirSync(dir).map((d) => path.join(dir, d, 'chrome-linux', 'chrome')).find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe });
const errs = [];
const report = {};

const SCENES = [
  ['guard', '방어 유지 — 우클릭을 누르고 다가가 막기만', 'seed=4'],
  ['spam', '공격 반복 — 다가가 0.35초마다 좌클릭', 'seed=4'],
  ['parry', '쳐내기 후 반격 — 상대 베기 직전 우클릭을 새로 누르고, 쳐내면 바로 좌클릭', 'seed=4'],
  ['bait', '후퇴로 헛치기 유도 — 상대가 휘두르면 뒤로 걷고, 빈틈에 반격', 'seed=4'],
  ['watch', 'AI 대 AI 관전 (아나킨 성향 대 오비완 성향)', 'seed=7&watch'],
];

for (const [id, title, q] of SCENES) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  // 화면 녹화: CDP screencast 프레임(JPEG + 시각)을 모아 두었다가 ffmpeg로 이어 붙임
  const cdp = await ctx.newCDPSession(page);
  const frames = [];
  const fdir = path.join(out, `${id}_frames`);
  fs.rmSync(fdir, { recursive: true, force: true });
  fs.mkdirSync(fdir, { recursive: true });
  cdp.on('Page.screencastFrame', (f) => {
    const n = path.join(fdir, `${String(frames.length).padStart(5, '0')}.jpg`);
    fs.writeFileSync(n, Buffer.from(f.data, 'base64'));
    frames.push({ n, t: f.metadata.timestamp });
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  page.on('pageerror', (e) => errs.push(`${id}: pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errs.push(`${id}: console.error: ${m.text()}`));
  await page.goto(`${url}${url.includes('?') ? '&' : '?'}${q}`);
  await page.waitForFunction(() => window.__combat);
  // 장면 제목 (영상에 남도록 화면 아래 왼쪽에)
  await page.evaluate((t) => {
    const d = document.createElement('div');
    d.textContent = t;
    d.style.cssText = 'position:fixed;left:16px;bottom:56px;z-index:9;font:700 15px Pretendard,system-ui,sans-serif;color:#fff;background:rgba(20,40,80,.75);padding:4px 10px;border:1px solid #6c9cf0';
    document.body.appendChild(d);
  }, title);
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 82, maxWidth: 1280, maxHeight: 720, everyNthFrame: 1 });
  await page.click('#cb-go');
  await page.mouse.move(640, 360);
  const held = new Set();
  const setKeys = async (keys) => {
    for (const k of [...held]) if (!keys.includes(k)) (await page.keyboard.up(k), held.delete(k));
    for (const k of keys) if (!held.has(k)) (await page.keyboard.down(k), held.add(k));
  };
  let rmb = false;
  const setRmb = async (on) => {
    if (on === rmb) return;
    rmb = on;
    on ? await page.mouse.down({ button: 'right' }) : await page.mouse.up({ button: 'right' });
  };
  // 상태 읽기 + 상대 쪽(또는 반대쪽) 화면 방향 키
  const look = () =>
    page.evaluate(() => {
      const { sim } = window.__combat;
      const [me, foe] = sim.fighters;
      const dx = foe.x - me.x;
      const dy = foe.y - me.y;
      const d = Math.hypot(dx, dy);
      // 월드 방향 → 화면 방향 (x - y, (x + y) / 2) → WASD
      const sx = dx - dy;
      const sy = (dx + dy) / 2;
      const keys = (sgn) => {
        const k = [];
        const ax = sgn * sx;
        const ay = sgn * sy;
        const m = Math.max(Math.abs(ax), Math.abs(ay));
        if (ax > m * 0.4) k.push('KeyD');
        if (ax < -m * 0.4) k.push('KeyA');
        if (ay > m * 0.4) k.push('KeyS');
        if (ay < -m * 0.4) k.push('KeyW');
        return k;
      };
      const a = foe.atk;
      return { t: sim.time, d, to: keys(1), away: keys(-1), foe: foe.state, foeWind: a && a.phase === 'windup' ? a.def.windup - a.t : -1, foeAtkId: a ? a.id : 0, foeSwing: foe.state === 'attack' && a.phase !== 'recovery', foeOpen: foe.state === 'parried' || foe.state === 'broken' || (foe.state === 'attack' && a.phase === 'recovery' && a.outcome === 'whiff'), lastParry: foe.lastAtk ? foe.lastAtk.id : 0, me: me.state, over: !!sim.over };
    });
  const t0 = Date.now();
  let lastClick = 0;
  let tapped = 0;
  let countered = 0;
  let backUntil = 0;
  while (Date.now() - t0 < SECS * 1000 && id !== 'watch') {
    const s = await look();
    if (s.over) break;
    const now = Date.now();
    if (id === 'guard') {
      await setRmb(true);
      await setKeys(s.d > 2.2 ? s.to : []);
    } else if (id === 'spam') {
      await setKeys(s.d > 1.8 ? s.to : []);
      if (now - lastClick > 350 && s.d < 2.2) (lastClick = now), await page.mouse.click(640, 360);
    } else if (id === 'parry') {
      await setKeys(s.d > 2.2 ? s.to : []);
      if (s.foeWind > 0 && s.foeWind <= 0.09 && tapped !== s.foeAtkId) {
        tapped = s.foeAtkId;
        await setRmb(false);
        await setRmb(true); // (새로 누른 방어 = 쳐내기 창)
      } else if (s.foe === 'parried' && countered !== s.lastParry) {
        countered = s.lastParry;
        await setRmb(false);
        await page.mouse.click(640, 360); // 반격
      } else await setRmb(s.d < 2.6 && s.me !== 'attack');
    } else if (id === 'bait') {
      if (s.foeSwing) backUntil = now + 350;
      if (now < backUntil) await setKeys(s.away);
      else if (s.foeOpen && s.d < 2.6) (await setKeys(s.d > 1.9 ? s.to : [])), now - lastClick > 250 && ((lastClick = now), await page.mouse.click(640, 360));
      else await setKeys(s.d > 2.1 ? s.to : s.d < 1.7 ? s.away : []);
    }
    await page.waitForTimeout(8);
  }
  if (id === 'watch') await page.waitForTimeout(SECS * 1000);
  await setKeys([]);
  await setRmb(false);
  report[id] = await page.evaluate(() => {
    const { sim } = window.__combat;
    const by = {};
    for (const e of sim.log) {
      const who = (e.by || e.target).name;
      const k = `${e.type}:${who}`;
      by[k] = (by[k] || 0) + 1;
    }
    return { t: +sim.time.toFixed(1), hp: sim.fighters.map((f) => Math.round(f.hp)), bal: sim.fighters.map((f) => Math.round(f.bal)), stats: sim.stats, by, log: sim.log.map((e) => `${e.t.toFixed(2)} ${e.type} ${e.by ? e.by.name : ''}${e.target ? '→' + e.target.name : ''} ${e.kind || ''} ${e.why || ''}`) };
  });
  await cdp.send('Page.stopScreencast').catch(() => {});
  await ctx.close();
  if (frames.length > 2) {
    // 프레임 사이 실제 시간으로 (가변 프레임) → 30 fps mp4
    const list = frames.map((f, i) => `file '${path.basename(f.n)}'\nduration ${Math.max(0.001, ((frames[i + 1] || f).t - f.t) || 1 / 30).toFixed(4)}`).join('\n');
    fs.writeFileSync(path.join(fdir, 'list.txt'), list + `\nfile '${path.basename(frames[frames.length - 1].n)}'\n`);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', 'list.txt', '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-crf', '23', '-movflags', '+faststart', path.resolve(out, `${id}.mp4`)], { cwd: fdir });
  }
  fs.rmSync(fdir, { recursive: true, force: true });
  console.log(id, JSON.stringify(report[id].stats));
}
fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
await browser.close();
if (errs.length) {
  console.error(errs.join('\n'));
  process.exit(1);
}
