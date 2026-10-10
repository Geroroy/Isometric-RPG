// Where the GPU process's time goes: the same scene (A, standing in the hub)
// measured with one layer switched off at a time, by process CPU from /proc.
// Diagnostic only — it toggles things from the page, the code is unchanged.
//   node tools/qa/perfsplit.mjs [device=phone] [url] [seconds=12]
import { chromium, devices } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const [, , device = 'phone', url = 'http://localhost:4173/', secArg = '12'] = process.argv;
function findChrome(dir) {
  for (const d of fs.readdirSync(dir)) {
    const p = path.join(dir, d, 'chrome-linux', 'chrome');
    if (fs.existsSync(p)) return p;
  }
}
function procCpu() {
  const out = {};
  for (const pid of fs.readdirSync('/proc').filter((d) => /^\d+$/.test(d))) {
    let cmd;
    try {
      cmd = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8');
    } catch {
      continue;
    }
    if (!cmd.includes('chrome')) continue;
    const type = (cmd.match(/--type=([a-z-]+)/) || [, 'browser'])[1];
    const st = fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1].split(' ');
    out[type] = (out[type] || 0) + (+st[11] + +st[12]) / 100;
  }
  return out;
}
const browser = await chromium.launch({ executablePath: findChrome('/opt/pw-browsers'), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctxOpts = device === 'phone' ? { ...devices['iPhone 13'], viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 };
const page = await (await browser.newContext(ctxOpts)).newPage();
// PACE=12: the game gets 12 frames a second, so the (software) GPU process isn't saturated
// and its CPU per frame shows what each layer costs
if (process.env.PACE)
  await page.addInitScript((fps) => {
    const raf = window.requestAnimationFrame.bind(window);
    let next = 0;
    window.requestAnimationFrame = (cb) => {
      const tick = (t) => {
        if (t < next) return raf(tick);
        next = Math.max(next + 1000 / fps, t - 1000 / fps);
        cb(t);
      };
      return raf(tick);
    };
  }, +process.env.PACE);
await page.addInitScript(() => {
  const raf = window.requestAnimationFrame.bind(window);
  window.__frames = 0;
  window.__stop = false;
  window.requestAnimationFrame = (cb) => raf((t) => (window.__stop ? raf(() => window.requestAnimationFrame(cb)) : (window.__frames++, cb(t))));
});
await page.goto(url);
await page.waitForFunction(() => window.__ready, null, { timeout: 900000 });
if (device === 'phone') await page.tap('#startBtn');
else await page.click('#startBtn');
await page.waitForTimeout(3000);

const CASES = (process.env.CASES ? (x) => x.filter((c, i) => process.env.CASES.split(',').includes(String(i))) : (x) => x)([
  ['baseline (as shipped)', () => {}],
  ['game loop frozen (nothing redrawn)', () => (window.__stop = true)],
  ['overlay canvas hidden', () => (document.getElementById('overlay').style.display = 'none')],
  ['post-processing off', () => ['grade', 'bloom', 'vignette', 'grain'].forEach((k) => (__renderer.post.opts[k] = false), __renderer.post.apply())],
  ['HUD DOM hidden', () => (document.getElementById('hud').style.display = 'none')],
  ['frozen + HUD hidden + overlay hidden', () => ((window.__stop = true), (document.getElementById('hud').style.display = 'none'), (document.getElementById('overlay').style.display = 'none'))],
  ['frozen + all canvases hidden + HUD hidden', () => ((window.__stop = true), document.querySelectorAll('canvas').forEach((c) => (c.style.display = 'none')), (document.getElementById('hud').style.display = 'none'))],
  ['frozen + HUD hidden', () => ((window.__stop = true), (document.getElementById('hud').style.display = 'none'))],
  ['frozen + post canvas hidden (world shown)', () => ((window.__stop = true), (document.getElementById('post').style.display = 'none'), (document.getElementById('world').style.opacity = '1'))],
  ['frozen + HUD animations paused', () => {
    window.__stop = true;
    const s = document.createElement('style');
    s.id = '__noanim';
    s.textContent = '*,*::before,*::after{animation-play-state:paused!important;transition:none!important}';
    document.head.append(s);
  }],
  ['frozen + holo-drift paused only', () => {
    window.__stop = true;
    const s = document.createElement('style');
    s.id = '__noanim';
    s.textContent = '.monitor::before,.monitor::after{animation-play-state:paused!important}';
    document.head.append(s);
  }],
  ['frozen + pulse dot paused only', () => {
    window.__stop = true;
    const s = document.createElement('style');
    s.id = '__noanim';
    s.textContent = '.dot,.m-key .dot{animation-play-state:paused!important}';
    document.head.append(s);
  }],
  ['frozen (all shown)', () => (window.__stop = true)],
  ['frozen + mix-blend-mode removed', () => {
    window.__stop = true;
    const s = document.createElement('style');
    s.id = '__noanim';
    s.textContent = '*,*::before,*::after{mix-blend-mode:normal!important}';
    document.head.append(s);
  }],
  ['frozen + overlay canvas hidden', () => ((window.__stop = true), (document.getElementById('overlay').style.display = 'none'))],
  ['frozen + post hidden, world hidden', () => ((window.__stop = true), (document.getElementById('post').style.display = 'none'), (document.getElementById('world').style.display = 'none'))],
  ['frozen + canvas CSS filters removed', () => {
    window.__stop = true;
    const s = document.createElement('style');
    s.id = '__noanim';
    s.textContent = 'canvas{filter:none!important}';
    document.head.append(s);
  }],
  ['HUD CSS animations paused', () => {
    const s = document.createElement('style');
    s.id = '__noanim';
    s.textContent = '*,*::before,*::after{animation-play-state:paused!important;transition:none!important}';
    document.head.append(s);
  }],
  ['world canvas display:none (post shows it)', () => (document.getElementById('world').style.display = 'none')],
  ['post canvas only, 2D canvas work skipped', () => (__renderer.render = () => {})],
]);
const undo = () => {
  window.__stop = false;
  document.getElementById('overlay').style.display = '';
  document.getElementById('hud').style.display = '';
  ['grade', 'bloom', 'vignette', 'grain'].forEach((k) => (__renderer.post.opts[k] = true));
  __renderer.post.apply();
  document.getElementById('__noanim')?.remove();
  document.querySelectorAll('canvas').forEach((c) => (c.style.display = ''));
  __renderer.post.apply();
};
const rows = [];
for (const [name, fn] of CASES) {
  await page.evaluate(`(${undo.toString()})()`);
  await page.evaluate(`(${fn.toString()})()`);
  await page.waitForTimeout(1500);
  const f0 = await page.evaluate(() => window.__frames);
  const p0 = procCpu();
  const t0 = Date.now();
  await page.waitForTimeout(+secArg * 1000);
  const wall = (Date.now() - t0) / 1000;
  const p1 = procCpu();
  const f1 = await page.evaluate(() => window.__frames);
  const pct = (k) => +((100 * ((p1[k] || 0) - (p0[k] || 0))) / wall).toFixed(0);
  const row = { case: name, fps: +((f1 - f0) / wall).toFixed(1), gpuProcess: pct('gpu-process'), gpuMsPerFrame: +((10 * pct('gpu-process')) / Math.max(0.1, (f1 - f0) / wall)).toFixed(0), renderer: pct('renderer'), total: Object.keys(p1).reduce((s, k) => s + pct(k), 0) };
  rows.push(row);
  console.log(JSON.stringify(row));
}
fs.mkdirSync('tools/qa/out/perf', { recursive: true });
fs.writeFileSync(`tools/qa/out/perf/split_${device}.json`, JSON.stringify(rows, null, 1));
await browser.close();
