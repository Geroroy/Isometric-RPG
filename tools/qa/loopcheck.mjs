// Frame cap and hidden-tab check: the screen's refresh is faked (rAF driven by a timer at
// 60 / 120 / 144 Hz) and the game's renders per second are counted; then the tab is
// reported hidden and the renders and the audio clock are checked. Drawing is stubbed out
// (only the loop's pacing is under test).
//   node tools/qa/loopcheck.mjs [url]
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const url = process.argv[2] || 'http://localhost:4173/';
function findChrome(dir) {
  for (const d of fs.readdirSync(dir)) {
    const p = path.join(dir, d, 'chrome-linux', 'chrome');
    if (fs.existsSync(p)) return p;
  }
}
const b = await chromium.launch({ executablePath: findChrome('/opt/pw-browsers'), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
for (const hz of [60, 120, 144]) {
  const page = await b.newPage({ viewport: { width: 640, height: 360 } });
  await page.addInitScript((hz) => {
    // a fake display: rAF callbacks fire every 1000/hz ms with a vsync-like timestamp
    let q = [];
    const t0 = performance.now();
    let n = 0;
    setInterval(() => {
      const cbs = q;
      q = [];
      const ts = performance.now();
      for (const cb of cbs) cb(ts);
    }, 1000 / hz);
    window.requestAnimationFrame = (cb) => (q.push(cb), 0);
  }, hz);
  await page.goto(url);
  await page.waitForFunction(() => window.__ready, null, { timeout: 900000 });
  await page.click('#startBtn');
  await page.waitForTimeout(1500);
  const r = await page.evaluate(
    () =>
      new Promise((res) => {
        // drawing is stubbed out so this slow software-GPU machine can keep up with the fake display
        const R = __renderer;
        let n = 0;
        R.render = () => n++;
        R.post.render = () => {};
        __hud.update = () => {};
        const x0 = __game.player.x;
        __game.player.steer(1, 0);
        const t0 = performance.now();
        setTimeout(() => {
          const sec = (performance.now() - t0) / 1000;
          res({ rendersPerSec: +(n / sec).toFixed(1), walkedPerSec: +((__game.player.x - x0) / sec).toFixed(2) });
        }, 3000);
      }),
  );
  console.log(`${hz} Hz display:`, JSON.stringify(r));
  if (hz === 60) {
    const h = await page.evaluate(
      () =>
        new Promise((res) => {
          const R = __renderer;
          let n = 0;
          R.render = () => n++;
          Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
          document.dispatchEvent(new Event('visibilitychange'));
          setTimeout(() => {
            const hidden = { rendersIn2s: n, audio: __game.audio.ctx ? __game.audio.ctx.state : 'none' };
            Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
            document.dispatchEvent(new Event('visibilitychange'));
            n = 0;
            setTimeout(() => res({ hidden, shownAgainRendersIn1s: n, audioAfter: __game.audio.ctx ? __game.audio.ctx.state : 'none' }), 1000);
          }, 2000);
        }),
    );
    console.log('hidden tab:', JSON.stringify(h));
  }
  await page.close();
}
await b.close();
