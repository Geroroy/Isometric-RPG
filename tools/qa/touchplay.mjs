// Phone input check: real touch gestures on the joystick, attack, skill and menu keys (npm run dev first).
import { chromium, devices } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const out = 'tools/qa/out/touchplay';
fs.mkdirSync(out, { recursive: true });
function findChrome(dir) {
  for (const d of fs.readdirSync(dir)) {
    const p = path.join(dir, d, 'chrome-linux', 'chrome');
    if (fs.existsSync(p)) return p;
  }
}
const browser = await chromium.launch({ executablePath: findChrome('/opt/pw-browsers'), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const context = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
const page = await context.newPage();
const logs = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(m.type() + ': ' + m.text()); });
page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
await page.goto('http://127.0.0.1:5173/');
await page.waitForFunction(() => window.__ready, null, { timeout: 600000 });
await page.tap('#startBtn');
await page.waitForTimeout(1000);
const ev = (js) => page.evaluate(js);
const shot = (n) => page.screenshot({ path: path.join(out, n + '.png') });
const cdp = await context.newCDPSession(page);
const touch = async (type, x, y, id = 1) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id }] });

// joystick drag: left zone, drag right-down for 1.2 s
const p0 = await ev(() => ({ x: __game.player.x, y: __game.player.y }));
await touch('touchStart', 150, 250);
for (let i = 0; i < 12; i++) {
  await touch('touchMove', 150 + i * 5, 250 + i * 3);
  await page.waitForTimeout(100);
}
await shot('joy');
await touch('touchEnd', 0, 0);
await page.waitForTimeout(200);
const p1 = await ev(() => ({ x: __game.player.x, y: __game.player.y, steer: __game.player.steerDir || null }));
console.log('joystick moved', p0, '->', p1);

// quick tap on the world = move there
await touch('touchStart', 300, 200);
await touch('touchEnd', 0, 0);
await page.waitForTimeout(800);
const p2 = await ev(() => ({ x: __game.player.x, y: __game.player.y, action: __game.player.action && __game.player.action.type }));
console.log('tap moved', p2);

// menu key: skills
await page.tap('.m-key:nth-child(1)');
await page.waitForTimeout(400);
console.log('tree open', await ev(() => __hud.open.tree));
await shot('tree');
await page.tap('.ov-close');
await page.waitForTimeout(300);
console.log('tree closed', await ev(() => !__hud.open.tree));

// give a skill, tap the skill key and the attack key
await ev(() => { const p = __game.player; p.skills.flurry = 1; p.hotbar[0] = 'flurry'; p.recalc(); });
await page.waitForTimeout(300);
const r = await page.evaluate(() => { const b = document.querySelector('.t-skill.s0'); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, vis: getComputedStyle(b).display }; });
console.log('skill key', r);
await touch('touchStart', r.x, r.y);
await touch('touchEnd', 0, 0);
await page.waitForTimeout(300);
console.log('after skill tap: action', await ev(() => __game.player.action && __game.player.action.type), 'cd', await ev(() => __game.player.cooldowns.flurry));
const a = await page.evaluate(() => { const b = document.querySelector('.t-attack'); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
await touch('touchStart', a.x, a.y);
await page.waitForTimeout(600);
console.log('attack held', await ev(() => ({ held: !!window.__touchHeld, anim: __game.player.anim })));
await touch('touchEnd', 0, 0);
// pinch zoom
const z0 = await ev(() => __renderer.zoom);
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 400, y: 200, id: 1 }, { x: 500, y: 200, id: 2 }] });
for (let i = 1; i <= 8; i++) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 400 - i * 8, y: 200, id: 1 }, { x: 500 + i * 8, y: 200, id: 2 }] });
  await page.waitForTimeout(50);
}
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await page.waitForTimeout(300);
console.log('pinch zoom', z0, '->', await ev(() => __renderer.zoom));
await shot('end');
console.log('LOGS', logs.length, [...new Set(logs)].slice(0, 10).join('\n'));
await browser.close();
