// The page's composited layers (CDP LayerTree): how many, how big, which paint content.
// Every layer that draws content is redrawn by the compositor whenever the screen changes.
//   node tools/qa/layers.mjs [url]
import { chromium, devices } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const url = process.argv[2] || 'http://localhost:4173/';
const dir = '/opt/pw-browsers';
const exe = fs.readdirSync(dir).map((d) => path.join(dir, d, 'chrome-linux', 'chrome')).find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })).newPage();
await page.goto(url);
await page.waitForFunction(() => window.__ready, null, { timeout: 900000 });
await page.tap('#startBtn');
await page.waitForTimeout(3000);
const cdp = await page.context().newCDPSession(page);
await cdp.send('DOM.enable');
let layers = [];
cdp.on('LayerTree.layerTreeDidChange', (e) => e.layers && (layers = e.layers));
await cdp.send('LayerTree.enable');
await page.waitForTimeout(1500);
const rows = [];
for (const l of layers.filter((l) => l.drawsContent && !l.invisible)) {
  let name = '';
  if (l.backendNodeId) {
    try {
      const { node } = await cdp.send('DOM.describeNode', { backendNodeId: l.backendNodeId });
      name = node.localName + (node.attributes ? (node.attributes.join(' ').match(/(?:^| )(?:id|class) (\S+)/g) || []).join('') : '');
    } catch {}
  }
  let why = [];
  try {
    why = (await cdp.send('LayerTree.compositingReasons', { layerId: l.layerId })).compositingReasons;
  } catch {}
  rows.push({ px: Math.round(l.width * l.height), w: Math.round(l.width), h: Math.round(l.height), name, why: why.join(','), paints: l.paintCount });
}
rows.sort((a, b) => b.px - a.px);
const vp = 844 * 390;
console.log(`layers drawing content: ${rows.length}, total ${(rows.reduce((s, r) => s + r.px, 0) / vp).toFixed(2)} screens of CSS px`);
for (const r of rows.slice(0, +(process.env.TOP || 25))) console.log(`${(r.px / vp).toFixed(3)} ${r.w}x${r.h} paints=${r.paints} ${r.name} [${r.why}]`);
await browser.close();
