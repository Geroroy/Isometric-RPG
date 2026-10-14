// Mustafar rebuild, STAGE 01 (the landing pad's floor): play it under Playwright (npm run dev, or a preview) and check
//   - the zone loads (its floor, walkable area, camera box), no console errors
//   - Anakin walks the pad smoothly (positions sampled every frame of a walk: no jumps, no stalls), stays on it at the
//     edges (the lava blocked), swings the saber and uses a skill (the combat and its UI intact)
//   - the floor in the 2:1 view (its external art, or the marked debug grid until it arrives): a wide shot of the
//     whole pad, a close one, a phone-sized view
//     node tools/qa/mfstage01.mjs [base_url] [out_dir]
import { chromium, devices } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const url = process.argv[2] || 'http://127.0.0.1:5173/';
const out = process.argv[3] || 'tools/qa/out/mfstage01';
fs.mkdirSync(out, { recursive: true });
const chrome = fs.readdirSync('/opt/pw-browsers').map((d) => path.join('/opt/pw-browsers', d, 'chrome-linux', 'chrome')).find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: chrome, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const report = { ok: true, checks: [], errors: [] };
const check = (name, pass, info = '') => {
  report.checks.push({ name, pass, info });
  if (!pass) report.ok = false;
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${name} ${info}`);
};

async function open(ctxOpts, tag) {
  const context = await browser.newContext(ctxOpts);
  const page = await context.newPage();
  page.on('console', (m) => ['error', 'warning'].includes(m.type()) && report.errors.push(`${tag} ${m.type()}: ${m.text()}`));
  page.on('pageerror', (e) => report.errors.push(`${tag} pageerror: ${e.message}`));
  await page.goto(url + '#duel-mustafar');
  await page.waitForFunction(() => window.__ready, null, { timeout: 900000 });
  return { context, page };
}
const ev = (page, f, a) => page.evaluate(f, a);
const settle = (page) => page.waitForFunction(() => { const t = window.__renderer.terrain; return !t.pool || t.pool.inflight.size === 0; }, null, { timeout: 120000 }).catch(() => {});

// ---- desktop ----------------------------------------------------------------------------------------------
{
  const { page } = await open({ viewport: { width: 1280, height: 720 } }, 'pc');
  await page.screenshot({ path: `${out}/01_title.png` });
  await page.click('#startBtn');
  await page.waitForTimeout(1500);
  const st = await ev(page, () => {
    const g = window.__game;
    const w = g.world;
    const p = g.player;
    const F = w.padFloors && w.padFloors[0];
    return { zone: w.zone && w.zone.id, pad: F && [F.x0, F.y0, F.x1, F.y1], terrainPad: !!window.__renderer.terrain.pads, p: [p.x, p.y], blockedHere: w.isBlocked(p.x, p.y), cam: w.camRegions, foe: g.duel.foe, bossShown: getComputedStyle(document.querySelector('.boss-bar')).display, hp: [p.hp, p.maxHp], hotbar: p.hotbar };
  });
  check('zone stage01 loaded', st.zone === 'stage01', JSON.stringify(st.pad));
  check('terrain paints the pad', st.terrainPad);
  check('Anakin starts on walkable pad', !st.blockedHere && st.p[0] > st.pad[0] && st.p[0] < st.pad[2] && st.p[1] > st.pad[1] && st.p[1] < st.pad[3], JSON.stringify(st.p));
  check('no boss bar without a foe', st.bossShown === 'none');
  // the floor's art is external (CLAUDE.md): until it is delivered the pad is a debug grid, and the screen says so
  const ph = await ev(page, () => { const b = document.querySelector('.placeholder-badge'); return { badge: b && b.textContent, missing: window.__game.world.zone.missingArt }; });
  check('placeholder announced while the floor art is missing', !ph.missing.length || (ph.badge && ph.missing.every((m) => ph.badge.includes(m.id))), ph.badge || 'all art delivered');
  await settle(page);
  await page.screenshot({ path: `${out}/02_start.png` });

  // walking: hold a key, sample the position every animation frame
  const walk = async (key, ms) => {
    await page.keyboard.down(key);
    const samples = await ev(page, (ms) => new Promise((res) => {
      const s = [];
      const t0 = performance.now();
      const f = () => {
        const p = window.__game.player;
        s.push([window.__game.time * 1000, p.x, p.y, p.anim]); // (game time: the headless browser's frames are uneven)
        if (performance.now() - t0 < ms) requestAnimationFrame(f);
        else res(s);
      };
      requestAnimationFrame(f);
    }), ms);
    await page.keyboard.up(key);
    await page.waitForTimeout(300);
    return samples;
  };
  for (const [key, label] of [['w', 'up'], ['d', 'right'], ['s', 'down'], ['a', 'left']]) {
    const s = await walk(key, 1400);
    const steps = [];
    for (let i = 1; i < s.length; i++) if (s[i][0] > s[i - 1][0]) steps.push(Math.hypot(s[i][1] - s[i - 1][1], s[i][2] - s[i - 1][2]) / Math.max(1e-3, (s[i][0] - s[i - 1][0]) / 1000));
    const moving = steps.slice(Math.floor(steps.length * 0.3)); // (after the start)
    const mean = moving.reduce((a, b) => a + b, 0) / moving.length;
    const jumps = moving.filter((v) => v > mean * 2.2 && v > 1).length;
    const dist = Math.hypot(s.at(-1)[1] - s[0][1], s.at(-1)[2] - s[0][2]);
    check(`walk ${label}: moves smoothly`, dist > 2 && jumps === 0, `${dist.toFixed(2)} m in ${s.length} frames, speed ~${mean.toFixed(2)} m/s, jumps ${jumps}, anims ${[...new Set(s.map((q) => q[3]))].join('/')}`);
  }
  // frames of a walk across the plates (the floor under a moving character)
  await page.keyboard.down('d');
  for (let i = 0; i < 4; i++) {
    await page.waitForTimeout(160);
    await page.screenshot({ path: `${out}/03_walk_${i}.png` });
  }
  await page.keyboard.up('d');

  // the edges: walk long toward each corner; the lava stops him on the pad
  for (const [keys, label, cx, cy] of [[['s'], '+x+y corner', 1, 1], [['w'], '−x−y corner', 0, 0], [['d'], '+x−y corner', 1, 0], [['a'], '−x+y corner', 0, 1]]) {
    // (from 4 m short of the corner, so the run reaches it whatever the frame rate)
    await ev(page, ([cx, cy]) => { const g = window.__game; const p = g.player; const F = g.world.padFloors[0]; p.x = cx ? F.x1 - 4 : F.x0 + 4; p.y = cy ? F.y1 - 4 : F.y0 + 4; p.path = null; }, [cx, cy]);
    await page.waitForTimeout(200);
    for (const k of keys) await page.keyboard.down(k);
    await page.waitForTimeout(4000);
    for (const k of keys) await page.keyboard.up(k);
    await page.waitForTimeout(300);
    const e = await ev(page, () => { const g = window.__game; const p = g.player; return { p: [p.x, p.y], blocked: g.world.isBlocked(p.x, p.y) }; });
    const inside = e.p[0] >= st.pad[0] && e.p[0] <= st.pad[2] && e.p[1] >= st.pad[1] && e.p[1] <= st.pad[3];
    const atEdge = Math.min(Math.abs(e.p[0] - st.pad[cx ? 2 : 0]), Math.abs(e.p[1] - st.pad[cy ? 3 : 1])) < 1;
    check(`edge ${label}: reaches the edge, stays on the pad`, inside && atEdge && !e.blocked, JSON.stringify(e.p.map((v) => +v.toFixed(2))));
    if (label === '+x+y corner') {
      await settle(page);
      await page.screenshot({ path: `${out}/04_edge_near.png` });
    }
  }

  // back to the middle, then the saber: swings (left click) and a skill
  await ev(page, () => { const g = window.__game; const p = g.player; const F = g.world.padFloors[0]; p.x = (F.x0 + F.x1) / 2 + 2; p.y = (F.y0 + F.y1) / 2 + 3; p.path = null; });
  await page.waitForTimeout(600);
  const anims = new Set();
  await page.keyboard.down('Shift'); // (no one to strike: Shift + click swings in place, input.js attackInPlace)
  for (let i = 0; i < 4; i++) {
    await page.mouse.click(700, 300);
    for (let j = 0; j < 4; j++) {
      await page.waitForTimeout(70);
      anims.add(await ev(page, () => window.__game.player.anim));
    }
    if (i === 1) await page.screenshot({ path: `${out}/05_swing.png` });
  }
  await page.keyboard.up('Shift');
  check('saber swings', [...anims].some((a) => /attack|swing|combo|slash/.test(a)), [...anims].join('/'));
  await page.waitForTimeout(600);
  const fp0 = await ev(page, () => window.__game.player.force);
  await page.keyboard.press('4'); // (the hotbar's Force push)
  await page.waitForTimeout(900);
  const sk = await ev(page, () => { const p = window.__game.player; return { fp: p.force, anim: p.anim, hotbar: p.hotbar }; });
  check('a skill fires (Force push)', sk.fp < fp0 || /cast|push/.test(sk.anim), `fp ${fp0} -> ${sk.fp}`);
  // block (right button held)
  await page.mouse.move(700, 300);
  await page.mouse.down({ button: 'right' });
  await page.waitForTimeout(300);
  const blocking = await ev(page, () => window.__game.player.blocking);
  await page.mouse.up({ button: 'right' });
  check('guard (right button) works', blocking);
  await page.screenshot({ path: `${out}/06_hud.png` });

  // the whole pad (HUD hidden), then a close look at the clamps and the trench
  await ev(page, () => { for (const s of ['#hud', '#overlay', '.console']) { const e = document.querySelector(s); if (e) e.style.visibility = 'hidden'; } });
  await ev(page, () => window.__renderer.setZoom(0.5, true));
  await page.waitForTimeout(500);
  await settle(page);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/07_wide.png` });
  await ev(page, () => { const g = window.__game; const p = g.player; p.x = 95; p.y = 95; window.__renderer.setZoom(2, true); });
  await page.waitForTimeout(500);
  await settle(page);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/08_close.png` });
  const perf = await ev(page, () => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => (++n < 120 ? requestAnimationFrame(f) : res(((performance.now() - t0) / n).toFixed(1))); requestAnimationFrame(f); }));
  console.log('frame ms (headless, software GL):', perf);
}

// ---- phone -----------------------------------------------------------------------------------------------
{
  const { page } = await open({ ...devices['iPhone 13'], viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true }, 'phone');
  await page.tap('#startBtn');
  await page.waitForTimeout(1500);
  await settle(page);
  const m = await ev(page, () => ({ touch: document.body.classList.contains('touch'), stick: !!document.querySelector('.joy, .stick, .tc-stick, [class*=stick]') }));
  check('phone: touch controls up', m.touch, JSON.stringify(m));
  await page.screenshot({ path: `${out}/09_phone.png` });
}

report.errors = [...new Set(report.errors)];
check('no console errors', report.errors.length === 0, report.errors.slice(0, 6).join(' | '));
fs.writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 1));
await browser.close();
process.exit(report.ok ? 0 : 1);
