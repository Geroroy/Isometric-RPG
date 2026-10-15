// Mustafar rebuild, the whole route in BLOCKOUT tested with the characters (CLAUDE.md "레벨 제작 순서" ②;
// docs/MUSTAFAR_REBUILD.md "블록아웃"), under Playwright (npm run dev, or a preview):
//   A  each part on its own (?mfPart=<part>): the walkable space round the start (flood fill), Anakin and Obi-Wan
//      fighting for 10 s of game time (Anakin attacking him) — sampled: either on a blocked tile, either off screen,
//      Anakin covered by a structure, their distance (how much of it they are engaged) — then the part's mark: the
//      scene that takes the fight on, where it leaves them
//   B  the chain from the interior corridor to the end, watched: every part in the film's order (corridor → control
//      room → conference room → the control room again → …), nobody stranded, the music, the result screen
//   C  the same chain with every scene skipped (Esc): the same state as watched
//   D  elevation and doors: the gallery's steps (the rail blocks, the steps lead up, z 0.6), the high ground's slope
//      (up to 1.4 m), the facility door open once the fight is through it, the balcony doorway open, the way from the
//      corridor up the side passage into the conference room walkable (and only through its doorways), the council's
//      table walked on (up at its ends, 0.8 m)
// NOWEBGL=1: in a Chromium with its 3D APIs off (no WebGL: the game's no-WebGL path — tools/qa/nowebgl.mjs).
// Prints a table per part and ok/FAIL lines; frames in out_dir; exits 1 on a failure.
//     node tools/qa/mfroute.mjs [base_url] [out_dir] [sections, e.g. ABCD]
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const url = process.argv[2] || 'http://127.0.0.1:5173/';
const out = process.argv[3] || 'tools/qa/out/mfroute';
const sections = process.argv[4] || 'ABCD';
fs.mkdirSync(out, { recursive: true });
const chrome = fs.readdirSync('/opt/pw-browsers').map((d) => path.join('/opt/pw-browsers', d, 'chrome-linux', 'chrome')).find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: chrome, args: process.env.NOWEBGL === '1' ? ['--disable-3d-apis', '--disable-webgl', '--disable-webgl2', '--disable-gpu', '--autoplay-policy=no-user-gesture-required'] : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
let ok = true;
const check = (name, pass, info = '') => {
  if (!pass) ok = false;
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${name} ${info}`);
};
const PARTS = ['corridor', 'control', 'room', 'control2', 'balcony', 'rain', 'pipe', 'arm', 'arm2', 'raft', 'river'];

async function open(tag, part) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(`${tag} pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errs.push(`${tag}: ${m.text()}`));
  await page.goto(url + (part ? `?mfPart=${part}` : '') + '#duel-mustafar');
  await page.waitForFunction(() => window.__ready, null, { timeout: 900000 });
  await page.click('#startBtn');
  await page.evaluate(() => (window.__game.cheats.god = true)); // (the QA lets the fight run its course)
  return { page, errs };
}
const gameWait = (page, sec) => page.evaluate((s) => new Promise((res) => { const g = window.__game; const t0 = g.time; const f = () => (g.time - t0 >= s ? res() : requestAnimationFrame(f)); f(); }), sec);
const waitPart = (page, part, ms) => page.waitForFunction((pt) => window.__game.duel.part === pt && !window.__game.cinema, part, { timeout: ms }).then(() => true, () => false);
const state = (page) =>
  page.evaluate(() => {
    const g = window.__game;
    const d = g.duel;
    const p = g.player;
    const ob = d.foe;
    const w = g.world;
    return {
      part: d.part,
      cinema: !!g.cinema,
      p: [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)],
      ob: [+ob.x.toFixed(2), +ob.y.toFixed(2), +ob.z.toFixed(2)],
      pBlocked: w.isBlocked(p.x, p.y),
      obBlocked: w.isBlocked(ob.x, ob.y),
      air: p.airborne || ob.airborne,
      ropes: !!d.ropes,
      obHp: +(ob.hp / ob.maxHp).toFixed(3),
      music: g.music && g.music.situation ? g.music.situation() : null,
    };
  });
// what the walk can reach from Anakin's tile (the space the fight has), and its box
const space = (page) =>
  page.evaluate(() => {
    const g = window.__game;
    const w = g.world;
    const p = g.player;
    const seen = new Set();
    const q = [[Math.floor(p.x), Math.floor(p.y)]];
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    while (q.length && seen.size < 6000) {
      const [x, y] = q.pop();
      const k = y * w.w + x;
      if (seen.has(k) || w.isBlocked(x + 0.5, y + 0.5)) continue;
      seen.add(k);
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      q.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    return { tiles: seen.size, box: [x0, y0, x1 + 1, y1 + 1] };
  });
// 10 s of the fight: Anakin attacks whenever he can; sampled every 0.2 s of game time
const fight = (page, sec) =>
  page.evaluate(
    (S) =>
      new Promise((res) => {
        const g = window.__game;
        const d = g.duel;
        const p = g.player;
        const ob = d.foe;
        const r = g.renderer;
        const w = g.world;
        const n = { samples: 0, blocked: 0, offscreen: 0, covered: 0, engaged: 0, distSum: 0, obMoved: 0, cinema: 0 };
        const t0 = g.time;
        let tS = t0;
        let tA = t0;
        let last = [ob.x, ob.y];
        const onScreen = (u) => {
          const sx = ((u.x - u.y) * 20 - r.cam.x) * r.scale;
          const sy = ((u.x + u.y) * 10 - u.z * 24.49 - r.cam.y) * r.scale;
          return sx > 20 && sx < innerWidth - 20 && sy > 40 && sy < innerHeight - (r.consoleH || 0) * r.scale;
        };
        const f = () => {
          if (g.time - t0 >= S || d.over) {
            n.meanDist = +(n.distSum / Math.max(1, n.samples)).toFixed(2);
            delete n.distSum;
            return res(n);
          }
          if (!g.cinema && g.time - tA >= 0.6) {
            tA = g.time;
            if (!d.locked) p.basicAttack(ob);
          }
          if (g.time - tS >= 0.2) {
            tS = g.time;
            if (g.cinema) n.cinema++;
            else {
              n.samples++;
              if (w.isBlocked(p.x, p.y) || w.isBlocked(ob.x, ob.y)) n.blocked++;
              if (!onScreen(p) || !onScreen(ob)) n.offscreen++;
              if (w.props.some((q) => q.coverAlpha)) n.covered++;
              const dd = Math.hypot(p.x - ob.x, p.y - ob.y);
              n.distSum += dd;
              if (dd < 2.6) n.engaged++;
              if (Math.hypot(ob.x - last[0], ob.y - last[1]) > 0.05) n.obMoved++;
              last = [ob.x, ob.y];
            }
            for (const q of w.props) q.coverAlpha = null; // (set again by the frames that draw a cover)
          }
          requestAnimationFrame(f);
        };
        f();
      }),
    sec,
  );
// the part's mark reached (set directly: the test checks the director's progression, not whether the AI's guard lets
// the blows through — it turns most of them)
const press = (page) => page.evaluate(() => { const d = window.__game.duel; d.foe.hp = Math.min(d.foe.hp, d.floor * d.foe.maxHp); d.reachMark(); });

// ---- A: each part on its own ---------------------------------------------------------------------------------
const NEXT = { corridor: 'control', control: 'room', room: 'control2', control2: 'balcony', balcony: 'rain', rain: 'pipe', pipe: 'arm', arm: 'arm2', arm2: 'raft', raft: 'river', river: 'ending' };
const table = [];
if (sections.includes('A'))
  for (const part of PARTS) {
    const { page, errs } = await open('A:' + part, part);
    await waitPart(page, part, 60000);
    const s0 = await state(page);
    const sp = await space(page);
    check(`A ${part}: starts playable, nobody on a blocked tile`, s0.part === part && !s0.cinema && !s0.pBlocked && !s0.obBlocked, JSON.stringify({ p: s0.p, ob: s0.ob }));
    const f = await fight(page, 10);
    await page.screenshot({ path: `${out}/A_${part}_fight.png` });
    const pct = (k) => Math.round((100 * f[k]) / Math.max(1, f.samples));
    table.push({ part, space: sp.tiles, box: sp.box.join(','), blocked: pct('blocked'), offscreen: pct('offscreen'), covered: pct('covered'), engaged: pct('engaged'), meanDist: f.meanDist, obMoving: pct('obMoved') });
    check(`A ${part}: nobody ends on a blocked tile while fighting`, f.blocked === 0, `${f.blocked}/${f.samples}`);
    check(`A ${part}: both stay on screen`, pct('offscreen') <= 5, `${pct('offscreen')}% off`);
    // the mark: the scene that takes the fight on
    const t0 = await page.evaluate(() => window.__game.time);
    await press(page);
    const nx = NEXT[part];
    const moved = await page.waitForFunction((pt) => { const d = window.__game.duel; return d.part !== pt; }, part, { timeout: 120000 }).then(() => true, () => false);
    await gameWait(page, 2.5);
    await page.screenshot({ path: `${out}/A_${part}_scene.png` });
    const reached = nx === 'ending' ? await page.waitForFunction(() => window.__game.duel.part === 'ending', null, { timeout: 120000 }).then(() => true, () => false) : await waitPart(page, nx, 120000);
    const t1 = await page.evaluate(() => window.__game.time);
    const s1 = await state(page);
    check(`A ${part} -> ${nx}: the mark plays the scene and the fight goes on`, moved && reached, `${(t1 - t0).toFixed(1)} s`);
    if (nx !== 'ending') check(`A ${part} -> ${nx}: nobody stranded (blocked, airborne, on a rope)`, !s1.pBlocked && !s1.obBlocked && !s1.air && !s1.ropes, JSON.stringify({ p: s1.p, ob: s1.ob }));
    check(`A ${part}: no errors`, errs.length === 0, errs.slice(0, 3).join(' || '));
    await page.close();
  }
if (table.length) console.table(table);

// ---- B: the chain from the interior corridor to the end, watched -------------------------------------------------
if (sections.includes('B')) {
  const { page, errs } = await open('B', 'corridor');
  const seen = [];
  const want = ['corridor', 'control', 'room', 'control2', 'balcony', 'rain', 'pipe', 'arm', 'arm2', 'raft', 'river'];
  const music = {};
  for (const part of want) {
    const on = await waitPart(page, part, 180000);
    const s = await state(page);
    seen.push(on ? part : `(${part}?)`);
    music[part] = s.music;
    check(`B ${part}: reached by the chain, nobody stranded`, on && !s.pBlocked && !s.obBlocked && !s.air, JSON.stringify({ p: s.p, ob: s.ob }));
    await gameWait(page, 2.0);
    await page.screenshot({ path: `${out}/B_${part}.png` });
    await press(page);
    // frames of the scene that follows
    // (a frame at each moment the scene reaches — and no waiting past its end: a short scene must not leave the
    // next part playing out unwatched while the test waits for a moment that never comes)
    await page.waitForFunction(() => !!window.__game.cinema, null, { timeout: 30000 }).catch(() => {});
    for (const k of [1.5, 4.5, 9]) {
      const got = await page.waitForFunction((tt) => !window.__game.cinema || window.__game.cinema.t >= tt, k, { timeout: 30000 }).then(() => page.evaluate(() => !!window.__game.cinema), () => false);
      if (!got) break;
      await page.screenshot({ path: `${out}/B_${part}_to_${k}.png` });
    }
  }
  const endOn = await page.waitForFunction(() => { const r = document.querySelector('.duel-result'); return r && !r.classList.contains('hidden'); }, null, { timeout: 240000 }).then(() => true, () => false);
  const endText = await page.evaluate(() => document.querySelector('.duel-result') && document.querySelector('.duel-result').innerText.slice(0, 140));
  check('B: the whole chain in the film\'s order', seen.join(',') === want.join(','), seen.join(' → '));
  check('B: the film\'s music by part', music.control === 'mustafarA' && music.room === 'mustafarA' && music.pipe === 'mustafarB' && music.arm2 === 'mustafarC' && music.river === 'mustafarD', JSON.stringify(music));
  check('B: the ending plays to the result screen (won)', endOn && /높은 곳/.test(endText || ''), (endText || '').replace(/\n/g, ' | '));
  await page.screenshot({ path: `${out}/B_end.png` });
  check('B: no errors', errs.length === 0, errs.slice(0, 3).join(' || '));
  await page.close();
}

// ---- C: the chain from the interior corridor, every scene skipped -----------------------------------------------
if (sections.includes('C')) {
  const { page, errs } = await open('C', 'corridor');
  const seen = [];
  for (const part of PARTS) {
    const on = await waitPart(page, part, 120000);
    const s = await state(page);
    seen.push(on ? part : `(${part}?)`);
    check(`C ${part}: reached with the scenes skipped, nobody stranded`, on && !s.pBlocked && !s.obBlocked && !s.air && !s.ropes, JSON.stringify({ p: s.p, ob: s.ob, air: s.air, ropes: s.ropes }));
    if (part === 'pipe') check('C pipe: both on the pipe (z 0.35)', Math.abs(s.p[0] - 66) < 0.6 && Math.abs(s.ob[0] - 66) < 0.6 && Math.abs(s.p[2] - 0.35) < 0.06 && Math.abs(s.ob[2] - 0.35) < 0.06, JSON.stringify({ p: s.p, ob: s.ob }));
    if (part === 'arm') check('C arm: both on the arm', s.p[0] > 68.8 && s.p[0] < 72.2 && s.ob[0] > 68.8 && s.ob[0] < 72.2, JSON.stringify({ p: s.p, ob: s.ob }));
    await press(page);
    for (let i = 0; i < 12; i++) {
      await page.waitForTimeout(500);
      if (await page.evaluate(() => !!window.__game.cinema)) await page.keyboard.press('Escape');
      const pt = await page.evaluate(() => window.__game.duel.part);
      if (pt !== part && !(await page.evaluate(() => !!window.__game.cinema))) break;
    }
  }
  const end = await page.waitForFunction(() => window.__game.duel.part === 'done' || window.__game.duel.part === 'ending', null, { timeout: 60000 }).then(() => true, () => false);
  check('C: the chain with scenes skipped reaches the ending', end && seen.every((s) => !s.startsWith('(')), seen.join(' → '));
  check('C: no errors', errs.length === 0, errs.slice(0, 3).join(' || '));
  await page.close();
}

// ---- D: elevation and doors ----------------------------------------------------------------------------------
if (sections.includes('D')) {
  {
    // the way from the corridor to the conference room: the side passage and the room's door (the pathfinder's walk),
    // never across a blocked tile
    const { page, errs } = await open('D:room', 'room');
    await waitPart(page, 'room', 60000);
    const walkTo = (from, to, sec) =>
      page.evaluate(
        ([from, to, sec]) =>
          new Promise((res) => {
            const g = window.__game;
            const ob = g.duel.foe;
            g.duel.beatDone = true; // (the room's table scene would take him mid-walk)
            ob.scripted = true;
            ob.x = 45;
            ob.y = 84;
            const p = g.player;
            p.x = from[0];
            p.y = from[1];
            p.commandMove(to[0], to[1]);
            const t0 = g.time;
            let bad = 0;
            const f = () => {
              if (g.world.isBlocked(p.x, p.y)) bad++;
              if (g.time - t0 < sec && Math.hypot(p.x - to[0], p.y - to[1]) > 0.4) requestAnimationFrame(f);
              else res({ end: [+p.x.toFixed(2), +p.y.toFixed(2)], bad, t: +(g.time - t0).toFixed(1) });
            };
            f();
          }),
        [from, to, sec]
      );
    const doors = await page.evaluate(() => ({ facility: window.__game.world.isBlocked(61, 98), confDoor: window.__game.world.isBlocked(57.5, 86), side: window.__game.world.isBlocked(59.5, 92) }));
    check('D room: the facility door open, the conference room\'s door and the side passage walkable', !doors.facility && !doors.confDoor && !doors.side, JSON.stringify(doors));
    const there = await walkTo([45, 98], [50, 90], 20);
    check('D room: walked from the corridor up the side passage into the conference room', Math.hypot(there.end[0] - 50, there.end[1] - 90) < 0.6 && there.bad === 0, JSON.stringify(there));
    const back = await walkTo([50, 82.5], [37, 98.5], 20);
    check('D room: and back down to the control room', Math.hypot(back.end[0] - 37, back.end[1] - 98.5) < 0.6 && back.bad === 0, JSON.stringify(back));
    const wall = await page.evaluate(() => [[50, 93.5], [44, 94.5], [56, 95], [40, 90]].map(([x, y]) => window.__game.world.isBlocked(x, y)));
    check('D room: no way between the room and the corridor but the side passage (the wall between them)', wall.every(Boolean), JSON.stringify(wall));
    // the council's table: its top walked on (0.8 m up), up and down at its ends only (the chair rows close its sides)
    const zAfter = (from, to, sec) => walkTo(from, to, sec).then((r) => page.evaluate(() => +window.__game.player.z.toFixed(2)).then((z) => ({ ...r, z })));
    const onto = await zAfter([43.5, 86], [49, 86], 15);
    check('D room: up onto the table at its end, standing on its top (z 0.8)', Math.hypot(onto.end[0] - 49, onto.end[1] - 86) < 0.6 && Math.abs(onto.z - 0.8) < 0.05 && onto.bad === 0, JSON.stringify(onto));
    const off = await zAfter([52, 86], [56.5, 89.5], 15);
    check('D room: down off its east end to the lane (z 0)', Math.hypot(off.end[0] - 56.5, off.end[1] - 89.5) < 0.6 && off.z < 0.05 && off.bad === 0, JSON.stringify(off));
    const sides = await page.evaluate(() => [[50, 84.5], [50, 87.5]].map(([x, y]) => window.__game.world.isBlocked(x, y)));
    check('D room: the chair rows close the table\'s long sides', sides.every(Boolean), JSON.stringify(sides));
    await page.screenshot({ path: `${out}/D_link.png` });
    check('D room: no errors', errs.length === 0, errs.slice(0, 3).join(' || '));
    await page.close();
  }
  {
    const { page, errs } = await open('D:control', 'control');
    await waitPart(page, 'control', 60000);
    const doors = await page.evaluate(() => ({ entry: window.__game.world.isBlocked(39, 98), balcony: window.__game.world.isBlocked(29, 106) }));
    check('D control: the entry from the corridor open, the balcony doorway an open gap (no invisible blocker)', !doors.entry && !doors.balcony, JSON.stringify(doors));
    // hold the fight still (Obi-Wan aside, scripted) and walk Anakin up to the gallery from below its rail
    await page.evaluate(() => {
      const g = window.__game;
      const ob = g.duel.foe;
      ob.scripted = true;
      ob.x = 36;
      ob.y = 104;
      const p = g.player;
      p.x = 24.5;
      p.y = 97.5; // (in front of the console bank at the gallery's foot: the way up is the steps)
      p.commandMove(24.5, 90.5);
      window.__track = [];
      const f = () => {
        window.__track.push([p.x, p.y, p.z]);
        if (window.__track.length < 900) requestAnimationFrame(f);
      };
      f();
    });
    await gameWait(page, 9);
    const tr = await page.evaluate(() => window.__track);
    const end = tr[tr.length - 1];
    const crossed = tr.filter((q, i) => i && tr[i - 1][1] >= 92.9 && q[1] < 92.9).map((q) => +q[0].toFixed(2));
    check('D control: walked up onto the gallery (z 0.6)', end[1] < 92 && Math.abs(end[2] - 0.6) < 0.05, JSON.stringify(end.map((v) => +v.toFixed(2))));
    check('D control: the rail held him to the steps (crossed its line only between x 28 and 32)', crossed.length > 0 && crossed.every((x) => x > 27.9 && x < 32.1), JSON.stringify(crossed));
    await page.screenshot({ path: `${out}/D_gallery.png` });
    check('D control: no errors', errs.length === 0, errs.slice(0, 3).join(' || '));
    await page.close();
  }
  {
    const { page, errs } = await open('D:bank', 'river');
    await waitPart(page, 'river', 60000);
    await page.evaluate(() => {
      const g = window.__game;
      const d = g.duel;
      d.onRiver = false;
      const ob = d.foe;
      ob.scripted = true;
      ob.deck = null;
      const p = g.player;
      p.deck = null;
      p.x = 124.5;
      p.y = 146.4;
      p.commandMove(124.5, 135.5);
      window.__track = [];
      const f = () => {
        window.__track.push([p.x, p.y, p.z]);
        if (window.__track.length < 900) requestAnimationFrame(f);
      };
      f();
    });
    await gameWait(page, 6);
    const tr = await page.evaluate(() => window.__track);
    const end = tr[tr.length - 1];
    const zs = [...new Set(tr.map((q) => +q[2].toFixed(2)))];
    check('D bank: up the slope onto the high ground (z 1.4), step by step', end[1] < 141 && Math.abs(end[2] - 1.4) < 0.05 && zs.length >= 4, JSON.stringify({ end: end.map((v) => +v.toFixed(2)), zs: zs.slice(0, 12) }));
    await page.screenshot({ path: `${out}/D_bank.png` });
    check('D bank: no errors', errs.length === 0, errs.slice(0, 3).join(' || '));
    await page.close();
  }
}
await browser.close();
process.exit(ok ? 0 : 1);
