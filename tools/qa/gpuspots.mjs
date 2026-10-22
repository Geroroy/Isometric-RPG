// GPU work per frame at chosen spots (with SwiftShader the GPU process's CPU time is the GPU's work):
// the GPU process's CPU seconds over the frames drawn, per spot and zoom step; and the same with
// one part off (the buildings' glow layer, the sky traffic) to see what each costs.
//   node tools/qa/gpuspots.mjs <url> [label] [spots json]
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const [, , url = 'http://127.0.0.1:4173/', label = '', spotArg = ''] = process.argv;
function procCpu() {
  let gpu = 0;
  for (const pid of fs.readdirSync('/proc').filter((d) => /^\d+$/.test(d))) {
    let cmd;
    try { cmd = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8'); } catch { continue; }
    if (!cmd.includes('chrome') || !cmd.includes('--type=gpu-process')) continue;
    const st = fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1].split(' ');
    gpu += (+st[11] + +st[12]) / 100;
  }
  return gpu;
}
const dir = '/opt/pw-browsers';
const exe = fs.readdirSync(dir).map((d) => path.join(dir, d, 'chrome-linux', 'chrome')).find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
await page.addInitScript(() => {
  window.__frames = 0;
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => raf((t) => { window.__frames++; cb(t); });
});
await page.goto(url);
await page.waitForFunction(() => window.__ready, null, { timeout: 900000 });
await page.click('#startBtn');
await page.waitForTimeout(2500);
const spots = spotArg ? JSON.parse(spotArg) : await page.evaluate(() => {
  const q = __game.world.qaSpots;
  return q ? { upper: [100, 64], plaza: q.plaza, avenue: q.avenueEast, cantina: q.cantina } : { upper: [100, 64], plaza: [98, 112], workshop: [121, 106], cantina: [117, 128] };
});
const measure = async (secs = 6) => {
  await page.waitForTimeout(1500);
  const f0 = await page.evaluate(() => window.__frames);
  const g0 = procCpu();
  await page.waitForTimeout(secs * 1000);
  const f1 = await page.evaluate(() => window.__frames);
  return Math.round(((procCpu() - g0) * 1000) / Math.max(1, f1 - f0));
};
for (const zoomOut of [0, 2]) {
  for (let i = 0; i < zoomOut; i++) await page.click('#zoomOut');
  for (const [name, at] of Object.entries(spots)) {
    await page.evaluate((at) => { const g = __game; g.player.x = at[0]; g.player.y = at[1]; g.player.path = null; }, at);
    const all = await measure();
    await page.evaluate(() => { __renderer._glow = __renderer.drawCityGlow; __renderer.drawCityGlow = () => {}; });
    const noGlow = await measure();
    await page.evaluate(() => { __renderer.drawCityGlow = __renderer._glow; __game.world.city = false; });
    const noBackdrop = await measure();
    await page.evaluate(() => { __game.world.city = true; });
    const view = await page.evaluate(() => `${__renderer.w}x${__renderer.h}`);
    console.log(`${label} ${name} ${view}: all ${all} | no glow ${noGlow} | no backdrop ${noBackdrop} GPU-ms/frame`);
  }
  for (let i = 0; i < zoomOut; i++) await page.click('#zoomIn');
}
await browser.close();
