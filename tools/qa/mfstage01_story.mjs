// Mustafar rebuild, STAGE 01's whole sequence under Playwright (npm run dev, or a preview):
//   run 1 (watched): the arrival, the choke scene on the film's audio, the duel on the pad, the press to the pad's
//     mark -> the scene across the connecting deck and through the facility door -> the duel in the interior corridor
//     -> Anakin at its west end -> the control room -> its mark: Obi-Wan away to the conference room -> the push -> back
//     to the control room (the film's order: docs/MUSTAFAR_REBUILD.md "영화 대조 1차")
//   run 2 (skipped): Esc through the cutscenes, the pad's time limit moves the fight on by itself, the corridor's
//     mark, then the control room's and the conference room's times
// Checks the parts' order, who is shown and lit when, nobody left on a blocked tile, the end screen, no errors;
// frames of every part in out_dir.
//     node tools/qa/mfstage01_story.mjs [base_url] [out_dir]
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const url = process.argv[2] || 'http://127.0.0.1:5173/';
const out = process.argv[3] || 'tools/qa/out/mfstage01_story';
fs.mkdirSync(out, { recursive: true });
const chrome = fs.readdirSync('/opt/pw-browsers').map((d) => path.join('/opt/pw-browsers', d, 'chrome-linux', 'chrome')).find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: chrome, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
let ok = true;
const check = (name, pass, info = '') => {
  if (!pass) ok = false;
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${name} ${info}`);
};
const state = (page) =>
  page.evaluate(() => {
    const g = window.__game;
    const d = g.duel;
    const p = g.player;
    const ob = d.foe;
    const pd = d.padme;
    const w = g.world;
    return {
      part: d.part,
      cinema: !!g.cinema,
      locked: d.locked,
      over: d.over,
      p: [+p.x.toFixed(2), +p.y.toFixed(2)],
      pBlocked: w.isBlocked(p.x, p.y),
      pSprite: p.sprite,
      pLit: p.saberLit,
      ob: [+ob.x.toFixed(2), +ob.y.toFixed(2)],
      obBlocked: w.isBlocked(ob.x, ob.y),
      obHidden: !!ob.hidden,
      obLit: ob.saberLit,
      obSprite: ob.sprite,
      obHp: +(ob.hp / ob.maxHp).toFixed(3),
      pd: pd.anim,
      pdHidden: !!pd.hidden,
      music: g.music && g.music.situation ? g.music.situation() : null,
      t: +g.time.toFixed(1),
    };
  });
const waitPart = (page, part, ms) => page.waitForFunction((pt) => window.__game.duel.part === pt && !window.__game.cinema, part, { timeout: ms }).then(() => true, () => false);

async function open(tag) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(`${tag} pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errs.push(`${tag}: ${m.text()}`));
  await page.goto(url + '#duel-mustafar');
  await page.waitForFunction(() => window.__ready, null, { timeout: 900000 });
  await page.click('#startBtn');
  return { page, errs };
}

// ---- run 1: watched through ----------------------------------------------------------------------------------
{
  const { page, errs } = await open('run1');
  await page.evaluate(() => (window.__game.cheats.god = true)); // (the QA lets the fight run its course)
  const shots = [[1.5, 'a1_padme'], [5, 'a2_walk'], [9, 'a3_talk'], [23, 'a4_obiwan'], [26.5, 'a5_accuse']];
  let s0 = await state(page);
  check('arrival: starts in the cutscene, Obi-Wan hidden, robes on', s0.cinema && s0.part === 'arrival' && s0.obHidden && s0.pSprite === 'anakin_vader' && !s0.pLit, JSON.stringify(s0));
  for (const [t, n] of shots) {
    await page.waitForFunction((tt) => window.__game.cinema && window.__game.cinema.t >= tt, t, { timeout: 120000 }).catch(() => {});
    await page.screenshot({ path: `${out}/${n}.png` });
  }
  const sA = await state(page);
  check('arrival: Padmé shown, Obi-Wan appeared on the ramp', !sA.pdHidden && !sA.obHidden, JSON.stringify({ pd: sA.pdHidden, ob: sA.obHidden }));
  await page.waitForFunction(() => window.__game.duel.part === 'choke' && window.__game.cinema, null, { timeout: 120000 });
  const choke = [[4.5, 'b1_choke'], [11, 'b2_collapse'], [30, 'b3_confront'], [65, 'b4_robes'], [70.2, 'b5_ignite']];
  for (const [t, n] of choke) {
    await page.waitForFunction((tt) => window.__game.cinema && window.__game.cinema.t >= tt, t, { timeout: 200000 }).catch(() => {});
    await page.screenshot({ path: `${out}/${n}.png` });
  }
  const padOn = await waitPart(page, 'pad', 120000);
  const sP = await state(page);
  check('pad: the duel is playable after the opening', padOn && !sP.locked && !sP.cinema, JSON.stringify({ part: sP.part, locked: sP.locked }));
  check('pad: robes off, both blades lit, Padmé down', sP.pSprite === 'anakin_tunic' && sP.obSprite === 'obiwan3' && sP.pLit && sP.obLit && sP.pd === 'down', JSON.stringify({ p: sP.pSprite, ob: sP.obSprite, pl: sP.pLit, ol: sP.obLit, pd: sP.pd }));
  check('pad: nobody on a blocked tile', !sP.pBlocked && !sP.obBlocked, JSON.stringify({ p: sP.p, ob: sP.ob }));
  check('pad: the duel music', sP.music === 'mustafarA', String(sP.music));
  // fight a little (Obi-Wan's AI), frames of it
  for (let i = 0; i < 3; i++) {
    await page.keyboard.down('Shift');
    await page.mouse.click(660, 330);
    await page.keyboard.up('Shift');
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${out}/c${i + 1}_pad_fight.png` });
  }
  // press Obi-Wan to the pad's mark (blows through the duel's damage path)
  await page.evaluate(() => {
    const g = window.__game;
    const ob = g.duel.foe;
    for (let i = 0; i < 12; i++) g.damage(g.player, ob, 60, { type: 'saber' });
  });
  const sM = await state(page);
  check('pad: Obi-Wan held at the pad\'s mark', sM.obHp >= 0.9 - 0.001, String(sM.obHp));
  await page.waitForFunction(() => window.__game.duel.part === 'toCorridor', null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/d1_to_corridor.png` });
  const corOn = await waitPart(page, 'corridor', 60000);
  const sC = await state(page);
  const door = await page.evaluate(() => { const d = window.__game.world.named.facilityDoor; return d && d.hidden; });
  check('corridor: the scene took the fight through the facility door into the interior corridor', corOn && door && sC.p[0] < 61 && sC.ob[0] < 61 && sC.p[0] > 39, JSON.stringify({ p: sC.p, ob: sC.ob, door }));
  check('corridor: nobody on a blocked tile, playable', !sC.pBlocked && !sC.obBlocked && !sC.locked, JSON.stringify(sC));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/d2_corridor_fight.png` });
  // Anakin pushes on along the corridor to the control room's entry (W + A: along −x)
  await page.keyboard.down('w');
  await page.keyboard.down('a');
  const entryOn = await page.waitForFunction(() => ['toControl', 'control'].includes(window.__game.duel.part), null, { timeout: 40000 }).then(() => true, () => false);
  await page.keyboard.up('w');
  await page.keyboard.up('a');
  check('entry: reaching the corridor\'s west end moves on', entryOn);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/e1_entry.png` });
  // STAGE 03: the control room (first)
  const ctlOn = await waitPart(page, 'control', 60000);
  const sK = await state(page);
  check('control: the fight is in the control room', ctlOn && sK.p[0] < 38.9 && sK.ob[0] < 38.9 && !sK.pBlocked && !sK.obBlocked && !sK.locked, JSON.stringify({ p: sK.p, ob: sK.ob }));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/e2_control_fight.png` });
  await page.evaluate(() => { const g = window.__game; for (let i = 0; i < 20; i++) g.damage(g.player, g.duel.foe, 60, { type: 'saber' }); });
  // STAGE 02: Obi-Wan away down the corridor and up the side passage, into the conference room
  const roomOn = await waitPart(page, 'room', 90000);
  const sR = await state(page);
  check('room: the fight is in the conference room', roomOn && sR.p[0] > 41.9 && sR.p[0] < 57.9 && sR.p[1] < 92 && sR.ob[0] > 41.9 && sR.ob[0] < 57.9 && sR.ob[1] < 92, JSON.stringify({ p: sR.p, ob: sR.ob }));
  check('room: nobody on a blocked tile, playable', !sR.pBlocked && !sR.obBlocked && !sR.locked, JSON.stringify({ p: sR.p, ob: sR.ob }));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/f1_room_fight.png` });
  await page.evaluate(() => { const g = window.__game; for (let i = 0; i < 20; i++) g.damage(g.player, g.duel.foe, 60, { type: 'saber' }); });
  const pushOn = await page.waitForFunction(() => window.__game.duel.part === 'push', null, { timeout: 40000 }).then(() => true, () => false);
  check('room: the mark or the room\'s time brings the Force push', pushOn);
  await page.waitForFunction(() => window.__game.cinema && window.__game.cinema.t >= 3.7, null, { timeout: 20000 }).catch(() => {});
  await page.screenshot({ path: `${out}/f2_push.png` });
  await page.waitForFunction(() => window.__game.cinema && window.__game.cinema.t >= 5.0, null, { timeout: 20000 }).catch(() => {});
  await page.screenshot({ path: `${out}/f3_thrown.png` });
  // back to the control room (the same room: the shield generator's scene, the balcony — tools/qa/mfroute.mjs tests the rest)
  const ctl2 = await waitPart(page, 'control2', 60000);
  const sK2 = await state(page);
  check('push: the fight goes back into the control room', ctl2 && sK2.p[0] < 38.9 && sK2.ob[0] < 38.9 && !sK2.pBlocked && !sK2.obBlocked, JSON.stringify({ p: sK2.p, ob: sK2.ob }));
  await page.screenshot({ path: `${out}/g1_control2.png` });
  check('run 1: no errors', errs.length === 0, errs.slice(0, 4).join(' || '));
  await page.close();
}

// ---- run 2: cutscenes skipped, the time limits move the fight on --------------------------------------------
{
  const { page, errs } = await open('run2');
  await page.evaluate(() => (window.__game.cheats.god = true));
  for (let i = 0; i < 10 && !(await page.evaluate(() => window.__game.duel.part === 'pad' && !window.__game.cinema)); i++) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(700);
  }
  const sP = await state(page);
  check('skip: Esc through both cutscenes lands in the playable duel, staged as when watched', sP.part === 'pad' && !sP.locked && sP.pLit && sP.obLit && sP.pSprite === 'anakin_tunic' && sP.pd === 'down' && !sP.pBlocked && !sP.obBlocked, JSON.stringify(sP));
  // nobody presses: the film's 0:34 moves the fight on by itself
  const t0 = await page.evaluate(() => window.__game.time);
  const moved = await page.waitForFunction(() => window.__game.duel.part === 'toCorridor' || window.__game.duel.part === 'corridor', null, { timeout: 180000 }).then(() => true, () => false);
  const t1 = await page.evaluate(() => window.__game.time);
  check('time: the pad moves on at the film\'s 0:34 by itself', moved && t1 - t0 >= 33, `after ${(t1 - t0).toFixed(1)} s of play`);
  await waitPart(page, 'corridor', 60000);
  // the corridor's mark moves it on too, then the control room's time, then the conference room's
  await page.evaluate(() => { const g = window.__game; for (let i = 0; i < 20; i++) g.damage(g.player, g.duel.foe, 60, { type: 'saber' }); });
  const ctl = await page.waitForFunction(() => ['toControl', 'control'].includes(window.__game.duel.part), null, { timeout: 40000 }).then(() => true, () => false);
  check('mark: the corridor\'s mark takes the fight to the control room', ctl);
  await waitPart(page, 'control', 60000);
  const t2 = await page.evaluate(() => window.__game.time);
  const room = await page.waitForFunction(() => ['toRoom', 'room'].includes(window.__game.duel.part), null, { timeout: 120000 }).then(() => true, () => false);
  const t3 = await page.evaluate(() => window.__game.time);
  check('time: the control room moves on to the conference room by itself', room && t3 - t2 >= 29, `after ${(t3 - t2).toFixed(1)} s of play`);
  await waitPart(page, 'room', 60000);
  const t4 = await page.evaluate(() => window.__game.time);
  const done = await page.waitForFunction(() => ['push', 'toControl2', 'control2'].includes(window.__game.duel.part), null, { timeout: 120000 }).then(() => true, () => false);
  const t5 = await page.evaluate(() => window.__game.time);
  check('time: the room moves on to the push by itself', done && t5 - t4 >= 35, `after ${(t5 - t4).toFixed(1)} s of play`);
  const end = await page.waitForFunction(() => window.__game.duel.part === 'control2', null, { timeout: 60000 }).then(() => true, () => false);
  check('end: the push hands the fight back to the control room', end);
  check('run 2: no errors', errs.length === 0, errs.slice(0, 4).join(' || '));
  await page.close();
}
await browser.close();
process.exit(ok ? 0 : 1);
