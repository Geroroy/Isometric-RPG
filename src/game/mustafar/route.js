// The Mustafar rebuild's STAGE 03–06 (docs/MUSTAFAR_REBUILD.md): the rest of the film's duel on the route laid out in
// BLOCKOUT (grey boxes: tools/maps/mustafar_v2/stage03..06.py). Methods of the director (director.js mixes them in):
// its parts here continue its own (pad → corridor → control → room → control2), with the same rules — Obi-Wan's health held at each part's
// mark, the part ending at the mark or its time, a scene taking the fight on. The scenes are the old Mustafar duel's
// (duelMustafar.js: the console cut, the lava rain, the cables, the pipe, the arm, "I have failed you", the tower, the
// arm adrift, the decks, the high ground and the ending), staged here on this route's places (the zones' `actors`,
// the river's data) instead of the old map's.
//
//   STAGE 03  control2   after the push, back out of the conference room, down the side passage and the corridor into
//                        the control room again (the same room the fight passed through before the conference room);
//                        the fight among the consoles — at the mark Anakin's cut opens the shield generator, the alarm;
//                        out the balcony door
//   STAGE 04  balcony    the terrace and the catwalk over the lava falls; the shields fail —
//             rain       lava rains onto the catwalk (a hazard); it gives way: the cables over the lava —
//             pipe       down onto the service pipe, inching along it; a leap —
//             arm        onto the collector arm, lava bombs round them; "I have failed you, Anakin" —
//             arm2       the blades bind; "This is the end for you, my master": a bomb takes the tower, the arm falls
//   STAGE 05  raft       the arm adrift on the river; it sinks: the droid, the repulsor platform —
//             river      one small deck carried downstream to the bank
//   STAGE 06  (ending)   the high ground, the cut, the film's last words (on the film's audio)
import { Cinema } from '../cinema.js';
import { Float } from '../duelMustafar.js';
import { blockoutUnitSet } from '../../gfx/blockout.js';
import { dist, rand } from '../../core/math.js';

const SPEAKERS = { anakin: '아나킨', obiwan: '오비완' };
const say = (t, who, text, d) => ({ t, say: [SPEAKERS[who], text, d] });

/** STAGE 03–06's playable parts (director.js FIGHTS: the same fields; `footing`, `bombs`, `rain`: the place's hazards). */
export const ROUTE_FIGHTS = {
  balcony: { stage: 4, floor: 0.56, time: 26, next: 'toBlast', score: 'mustafarA' },
  rain: { stage: 4, floor: 0.5, time: 24, next: 'toCollapse', score: 'mustafarA', rain: true },
  pipe: { stage: 4, floor: 0.46, time: 18, next: 'toArm', score: 'mustafarB', footing: true },
  arm: { stage: 4, floor: 0.4, time: 30, next: 'toFailed', score: 'mustafarB', bombs: true },
  arm2: { stage: 4, floor: 0.32, time: 24, next: 'toFall', score: 'mustafarC', bombs: true, beat: { t: 7, run: 'forceBind' } },
  raft: { stage: 5, floor: 0.26, time: 22, next: 'toDecks', score: 'mustafarD', bombs: true },
  river: { stage: 5, floor: 0.22, time: 26, next: 'toEnding', score: 'mustafarD', reach: (d) => d.platformArrived },
};

/** Cues walking `u` through `pts` from cue time `t0` at `speed` m/s; returns [cues, the time it arrives]. */
export function walk(u, pts, t0, speed, anim = 'walk') {
  const cues = [];
  let t = t0;
  let at = { x: u.x, y: u.y };
  for (const q of pts) {
    const d = Math.max(0.3, dist(at.x, at.y, q.x, q.y) / speed);
    cues.push({ t, do: (c) => (u.faceTo(q.x, q.y), u.setAnim(anim, 1.2), c.move(u, q.x, q.y, d)) });
    at = q;
    t += d;
  }
  return [cues, t];
}

/**
 * walk() along a route through the building (`nodes`: doorways, the corridor's line) from where `u` is: from the node
 * nearest it, or the next one when it already stands between the two (a scene takes the fight on from wherever it is).
 */
export function walkRoute(u, nodes, t0, speed, anim = 'walk') {
  let i = 0;
  let bd = Infinity;
  nodes.forEach((q, k) => {
    const d = dist(u.x, u.y, q.x, q.y);
    if (d < bd) (bd = d), (i = k);
  });
  const n = nodes[i + 1];
  if (n && dist(u.x, u.y, n.x, n.y) < dist(nodes[i].x, nodes[i].y, n.x, n.y)) i++;
  return walk(u, nodes.slice(i), t0, speed, anim);
}

/** A camera target between the two (Cinema `follow`): a chase scene keeps both in the frame, not only Anakin. */
export const between = (a, b) => ({
  get x() {
    return (a.x + b.x) / 2;
  },
  get y() {
    return (a.y + b.y) / 2;
  },
});

export const ROUTE = {
  /** The river's decks (STAGE 05): blockout boxes as units, hidden until the arm falls. */
  setupRoute() {
    const g = this.game;
    this.drops = [];
    this.bombs = [];
    const R = (this.river = g.world.zone.river);
    if (!R) return;
    const S = g.assets.sprites;
    const flat = 0.15; // (decks at the lava's level: a thin box, its riders on top)
    // the arm adrift: the collector arm's own picture once delivered (its deck 0.3 m up), else its blockout box
    const arm = g.assets.city && g.assets.city['mf.collector.collector_arm'];
    this.raftZ = arm ? 0.3 : 0;
    if (arm) S.raftArm ||= { dirs: 1, anims: { idle: { frames: 1, fps: 1, loop: true, data: [[arm.body]] } }, markers: [] };
    S.boRaft ||= blockoutUnitSet({ w: R.raft.w, d: R.raft.d, h: flat, kind: 'float', label: '떠내려가는 집하기 팔' });
    // the droid and the platform: their delivered pictures (one frame each), else blockout boxes
    const craft = (c, name, kind, label) => {
      const a = c.asset && g.assets.city && g.assets.city[c.asset];
      if (a) return (S[name] ||= { dirs: 1, anims: { idle: { frames: 1, fps: 1, loop: true, data: [[a.body]] } }, markers: [] }) && name;
      S['bo_' + name] ||= blockoutUnitSet({ w: c.w, d: c.d, h: flat, kind, label });
      return 'bo_' + name;
    };
    const droidSprite = craft(R.droid, 'craftDroid', 'hazard', '채굴 드로이드');
    const platformSprite = craft(R.platform, 'craftPlatform', 'float', '리펄서 플랫폼');
    const deck = (kind, sprite, r) => {
      const f = new Float(g, kind, R.raft.from.x, R.raft.from.y, r);
      f.sprite = sprite;
      f.noShadow = true;
      return f;
    };
    this.raft = deck('armRaft', arm ? 'raftArm' : 'boRaft', R.raft.r);
    this.raft.depthBias = -40; // (under everyone on the river)
    this.raft.half = R.raft.d / 2; // (the arm along y, as it stood)
    this.droid = deck('collector', droidSprite, R.droid.r);
    this.platform = deck('platform', platformSprite, R.platform.r);
    // their decks' heights (the droid's cap a little over the lava), following them: surfaces the riders stand on
    for (const [f, c] of [[this.droid, R.droid], [this.platform, R.platform]]) if (c.deckZ) f.surf = { x0: 0, y0: 0, x1: 0, y1: 0, z: c.deckZ };
    g.units.push(this.raft, this.droid, this.platform);
  },

  /** Per frame: the lava rain, the pipe's footing, the decks adrift, the lava bombs. */
  updateRoute(dt) {
    const g = this.game;
    if (this.rain && !g.cinema && !this.lock) this.updateRain(dt); // (duelMustafar.js)
    if (this.footing && !g.cinema) this.balance();
    if (this.onRaft) this.updateRaft(dt);
    if (this.onRiver) this.updateRiver(dt);
    this.updateBombs(dt);
    this.updateLeaps();
  },

  /**
   * A leap through the air to `to` (a scene's: over the conference room's chairs onto its table's top), landing at the
   * height of the ground there; the move is the scene's (Cinema `c`), the arc here (updateLeaps).
   */
  leapOnto(c, u, to, d) {
    const g = this.game;
    d ??= Math.max(0.55, dist(u.x, u.y, to.x, to.y) / 6);
    u.faceTo(to.x, to.y);
    u.setAnim('leap', 1, true);
    u.airborne = true;
    u.hop = null;
    g.audio.play('leap', u);
    c.move(u, to.x, to.y, d);
    u.leapArc = { z0: u.z, z1: g.world.groundAt(to.x, to.y), t0: g.time, d };
    return d;
  },

  updateLeaps() {
    const g = this.game;
    for (const u of [g.player, this.foe]) {
      const L = u && u.leapArc;
      if (!L) continue;
      const k = Math.min(1, (g.time - L.t0) / L.d);
      u.z = L.z0 + (L.z1 - L.z0) * k + Math.sin(Math.PI * k) * 1.1;
      if (k >= 1) (u.z = L.z1), (u.airborne = false), (u.leapArc = null), g.fx.dust(u.x, u.y, 3);
    }
  },

  /** Whether `u` stands on a raised top (the conference room's table). */
  onTop(u) {
    return this.game.world.groundAt(u.x, u.y) >= 0.5;
  },

  /** On the pipe: both keep to its line (a step sideways is a step into the lava), within its ends. */
  balance() {
    const P = this.at.pipe;
    for (const u of [this.game.player, this.foe]) {
      if (u.airborne) continue;
      u.x += (P.x - u.x) * 0.5;
      u.y = Math.max(P.y0 + 0.6, Math.min(P.y1 - 0.6, u.y));
      u.kx = 0;
      u.ky *= 0.6;
    }
  },

  /** The deck the lava bombs land on: the arm, or the arm adrift. */
  bombDeck() {
    if (this.onRaft) {
      const r = this.raft;
      return { x0: r.x - 0.9, x1: r.x + 0.9, y0: r.y - r.half + 1, y1: r.y + r.half - 1, from: [6, 0] };
    }
    const A = this.at.arm;
    return { x0: A.x - A.hw + 0.4, x1: A.x + A.hw - 0.4, y0: A.y - A.hh + 1, y1: A.y + A.hh - 1, from: [6, 0] };
  },

  /**
   * Lava bombs (duelMustafar.js updateBombs, on this route's decks): one every few seconds, thrown up out of the lava
   * beside the deck, landing near one of them: a warning ring, then the splash burns whoever stands in it.
   */
  updateBombs(dt) {
    const g = this.game;
    const p = g.player;
    const ob = this.foe;
    for (const b of this.bombs) {
      if (!b.done) continue;
      for (const u of [p, ob]) {
        if (u.dead || dist(u.x, u.y, b.x1, b.y1) > 1.0) continue;
        g.damage(null, u, 14, { type: 'lava' });
        if (u === p) {
          u.stun = Math.max(u.stun, 0.35);
          u.knock(Math.atan2(u.y - b.y1, u.x - b.x1), 2.5);
          u.setAnim('hurt', 0.8, true);
          g.fx.text(u.x, u.y, '용암!', '#ff8a50', 0.9);
        } else if (ob.state !== 'broken') ob.set('stagger', 0.6);
      }
    }
    this.bombs = this.bombs.filter((b) => !b.done);
    if (!this.bombsOn || g.cinema || this.lock) return;
    this.bombT -= dt;
    if (this.bombT > 0) return;
    this.bombT = rand(2.4, 4.2);
    const D = this.bombDeck();
    const near = Math.random() < 0.6 ? ob : p;
    const x1 = Math.max(D.x0, Math.min(D.x1, near.x + rand(-2.5, 2.5)));
    const y1 = Math.max(D.y0, Math.min(D.y1, near.y + rand(-2.5, 2.5)));
    const sx = x1 + D.from[0] + rand(-1, 1) * (D.from[0] ? 1 : 3);
    const sy = y1 + D.from[1] + rand(-1, 1) * (D.from[1] ? 1 : 3);
    this.bombs.push(g.fx.lavaBomb(sx, sy, x1, y1, rand(1.4, 1.8), rand(4, 6)));
    g.audio.play('explode', { x: sx, y: sy }, { volume: 0.25 });
  },

  forceBind() {
    if (!this.lock && !this.game.player.dead) this.startLock(true);
  },

  // --- STAGE 03: the control room ----------------------------------------------------------------------------------

  /**
   * After the push: Obi-Wan is up first and away out of the conference room's door, down the side passage and the
   * corridor into the control room (the one they fought through before: not a second copy of it); Anakin after him.
   */
  toControl2() {
    const g = this.game;
    const p = g.player;
    const ob = this.foe;
    const A = this.at;
    this.part = 'toControl2';
    this.hold();
    ob.set('circle', 99);
    const out = [A.confDoor, A.sideTop, A.sideBottom, { x: 58.6, y: 97.8 }, { x: 50, y: 98 }, A.ctlEntry];
    // (off the table's east end when the push was up on it — along its top, down at its end — else out of the lane)
    const up = this.onTop(p) || this.onTop(ob);
    const way = up ? [{ x: 45.2, y: 86 }, A.tableEndE, ...out] : [{ x: 51, y: 89.6 }, { x: 55.8, y: 88.4 }, ...out];
    const [obC, obT] = walkRoute(ob, [...way, A.ctlObiwan], 0.3, 5.0, 'run');
    const [pC, pT] = walkRoute(p, [...way, A.ctlAnakin], 0.9, 5.4, 'run');
    const end = Math.max(obT, pT);
    const cues = [
      { t: 0, cam: { follow: between(p, ob), zoom: 1.2, dur: 0.8 } }, // (the push leaves them 12 m apart)
      ...obC,
      ...pC,
      { t: obT - 0.6, do: () => this.card('제어실') },
      { t: end, do: () => (p.setAnim('idle'), ob.setAnim('idle'), p.faceTo(ob.x, ob.y), ob.faceTo(p.x, p.y)) },
    ];
    return new Cinema(g, { length: end + 0.4, cues }).play().then(() => this.enterPart('control2'));
  },

  /** The film's 2:28: Anakin's cut opens the shield generator (the alarm: the shields begin to fail); out onto the balcony. */
  toConsole() {
    const g = this.game;
    const p = g.player;
    const ob = this.foe;
    const A = this.at;
    const w = g.world;
    const core = A.core;
    const D = A.balconyDoor;
    this.part = 'toConsole';
    this.hold();
    ob.set('circle', 99);
    const d0 = Math.max(1.6, dist(p.x, p.y, core.x + 2.9, core.y + 0.8) / 4.5);
    const T = d0 - 1.6; // (from wherever they were: the cues after the walk keep their spacing)
    const cues = [
      { t: 0, do: (c) => this.travel(c, { x: core.x + 2.9, y: core.y + 0.8 }, { x: core.x + 1.6, y: core.y + 1.8 }, d0), cam: { x: core.x + 2, y: core.y + 1, zoom: 1.35, dur: 0.8 } },
      { t: T + 1.2, do: (c) => this.clash(c) },
      { t: T + 1.9, do: () => (p.faceTo(core.x, core.y), p.setAnim('attack3', 1, true)) },
      { t: T + 2.1, do: (c) => (ob.setAnim('leap', 1, true), c.move(ob, core.x + 3.4, core.y + 3.6, 0.5)) },
      {
        t: T + 2.3,
        do: (c) => {
          g.fx.sparks(core.x + 0.6, core.y + 0.4, 1.4, '#9fd8ff', 26, 5);
          g.fx.explosion(core.x + 0.5, core.y + 0.3, 0.7);
          g.audio.play('zap');
          g.audio.play('explode', p);
          g.fx.shake(7);
          g.fx.text(core.x + 1, core.y, '방어막이 꺼진다!', '#ff9a50', 1.1, 2.6);
          this.alarmOn();
          c.onFrame = () => {
            if (Math.random() < 0.5) g.fx.sparks(core.x + rand(-0.6, 0.6), core.y + rand(-0.6, 0.6), 1.2 + Math.random(), Math.random() < 0.5 ? '#9fd8ff' : '#ffb040', 2, 3);
            if (Math.random() < 0.3) g.fx.flame(core.x + 0.4, core.y + 0.3, 1.2, 2, 1.2);
          };
        },
      },
      { t: T + 2.9, do: () => (p.setAnim('idle'), ob.setAnim('idle'), p.faceTo(ob.x, ob.y), ob.faceTo(p.x, p.y)) },
      { t: T + 3.4, do: (c) => this.clash(c) },
      // the balcony door opens; out through it
      { t: T + 4.0, do: () => (this.openBalcony(), g.audio.play('click')) },
      { t: T + 4.2, do: (c) => this.travel(c, { x: D.x - 0.4, y: D.y - 1.8 }, { x: D.x + 0.3, y: D.y + 0.8 }, 2.0), cam: { follow: p, dur: 0.6 } },
      { t: T + 5.4, do: (c) => this.clash(c, p) },
      { t: T + 6.2, do: (c) => (this.travel(c, A.terraceAnakin, A.terraceObiwan, 2.0), this.card('외부 발코니')) },
      { t: T + 8.2, do: (c) => ((c.onFrame = null), p.setAnim('idle'), ob.setAnim('idle'), p.faceTo(ob.x, ob.y), ob.faceTo(p.x, p.y)) },
    ];
    return new Cinema(g, { length: T + 8.6, cues }).play().then(() => this.enterPart('balcony'));
  },

  /** The alarm light over the cut generator (the shields failing). */
  alarmOn() {
    const core = this.at.core;
    if (this.alarm) return;
    this.alarm = { x: core.x + 1.2, y: core.y, z: 2.5, r: 255, g: 40, b: 30, rad: 260, flicker: 0.35 };
    this.game.world.lights.push(this.alarm);
  },

  openBalcony() {
    const w = this.game.world;
    w.open('balconyDoor');
    if (w.named.balconyDoorLeaf) w.named.balconyDoorLeaf.hidden = true;
  },

  // --- STAGE 04: the walkway and the lava collector ----------------------------------------------------------------

  /** The film's 3:29: the shields fail — the lava falls burst, lava rains onto the catwalk. */
  toBlast() {
    const g = this.game;
    const p = g.player;
    const ob = this.foe;
    this.part = 'toBlast';
    this.hold();
    ob.set('circle', 99);
    const B = { x: (p.x + ob.x) / 2, y: (p.y + ob.y) / 2 };
    const cues = [
      { t: 0, do: () => (p.setAnim('idle'), ob.setAnim('idle')), cam: { x: B.x - 3, y: B.y - 2, zoom: 1.1, dur: 1.0 } },
      {
        t: 0.8,
        do: (c) => {
          // the lava falls beyond the walkway burst (its far side)
          g.fx.explosion(B.x - 4, B.y - 6, 2.2);
          g.fx.explosion(B.x + 5, B.y - 5, 1.6);
          g.audio.play('explode', p);
          g.fx.shake(14);
          g.world.lights.push({ x: B.x, y: B.y - 5, z: 2, r: 255, g: 150, b: 60, rad: 320, flicker: 0.25 });
          c.onFrame = () => {
            if (Math.random() < 0.8) g.fx.lavaSplash(B.x + rand(-2.5, 2.5), B.y + rand(-1.5, 1.5), 0.6);
          };
        },
      },
      { t: 1.6, do: () => (p.setAnim('block', 1, true), ob.setAnim('block', 1, true), g.fx.text(B.x, B.y, '용암이 쏟아진다!', '#ff9a50', 1.2, 2.6)) },
      { t: 2.0, cam: { follow: p, zoom: 1.3, dur: 1.0 } },
      { t: 4.2, do: (c) => ((c.onFrame = null), this.clash(c)) },
      { t: 5.2, do: () => (p.setAnim('idle'), ob.setAnim('idle')) },
    ];
    return new Cinema(g, { length: 5.6, cues }).play().then(() => this.enterPart('rain'));
  },

  /**
   * The film's 3:54: the fight reaches the catwalk's end and it gives way; both hang from the collector's cables over
   * the lava, trading blows as they swing; they drop onto the service pipe below (Obi-Wan first, farther along it).
   */
  toCollapse() {
    const g = this.game;
    const p = g.player;
    const ob = this.foe;
    const A = this.at;
    const P = A.pipe;
    const C = A.collapse;
    this.part = 'toCollapse';
    this.hold();
    ob.set('circle', 99);
    this.rain = false;
    this.drops = [];
    // along the catwalk to where it gives way (as long as the walk takes)
    const pTo = { x: C.x - 2.4, y: C.y + 0.3 };
    const obTo = { x: C.x + 0.9, y: C.y - 0.2 };
    const T = Math.max(1.2, Math.max(dist(p.x, p.y, pTo.x, pTo.y), dist(ob.x, ob.y, obTo.x, obTo.y)) / 4.8);
    const hook = { ax: A.hook.x, ay: A.hook.y, az: A.hook.z };
    const cab = { ob: P.y0 + 10.5, p: P.y0 + 4.0 }; // (Obi-Wan the farther along: he gives ground toward the pipe's end)
    const cx = P.x + 0.2;
    const cues = [
      { t: 0, do: (c) => this.travel(c, pTo, obTo, T), cam: { follow: p, zoom: 1.25, dur: 0.8 } },
      { t: T * 0.5, do: (c) => this.clash(c) },
      { t: T, do: () => (g.fx.shake(10), g.audio.play('explode', p), p.setAnim('hurt', 0.6, true), ob.setAnim('hurt', 0.6, true)) },
      { t: T + 0.5, do: (c) => ((c.onFrame = () => (g.fx.shake(4), Math.random() < 0.6 && g.fx.sparks(p.x + rand(-2, 2), p.y + rand(-1, 1), 0.3, '#ffb040', 3, 4))), g.fx.text(p.x, p.y, '보행로가 무너진다!', '#ff9a50', 1.2, 2.6)) },
      { t: T + 1.2, do: () => (p.setAnim('idle'), ob.setAnim('idle')) },
      { t: T + 2.0, do: (c) => (ob.setAnim('leap', 1, true), c.move(ob, ob.x + 1.6, ob.y + 1.2, 0.6)) },
      { t: T + 2.5, do: (c) => (p.setAnim('leap', 1, true), c.move(p, p.x + 1.6, p.y + 1.2, 0.6)) },
      { t: T + 3.1, fade: 1, fadeDur: 0.6 },
      // hanging from the collector's cables over the lava
      {
        t: T + 3.9,
        do: (c) => {
          c.onFrame = null;
          c.tweens = c.tweens.filter((q) => q.u !== p && q.u !== ob);
          this.collapseCatwalk();
          p.x = ob.x = cx + 0.25;
          p.y = cab.p;
          ob.y = cab.ob;
          p.z = ob.z = 1.35;
          p.airborne = ob.airborne = true;
          p.kx = p.ky = ob.kx = ob.ky = 0;
          p.faceTo(ob.x, ob.y);
          ob.faceTo(p.x, p.y);
          this.pose(p, 'hang', 1);
          this.pose(ob, 'hang', 1);
          this.card('용암 위의 케이블');
          this.ropes = [{ ...hook, u: p, sag: 4 }, { ...hook, u: ob, sag: -4 }];
          const k0 = c.t;
          c.onFrame = () => {
            const k = c.t - k0;
            p.y = cab.p + 1.2 * Math.max(0, Math.sin(k * 1.4));
            ob.y = cab.ob - 1.2 * Math.max(0, Math.sin(k * 1.4 + 0.3));
            p.z = 1.35 + Math.sin(k * 2.8) * 0.08;
            ob.z = 1.35 + Math.cos(k * 2.8) * 0.08;
          };
        },
        cam: { x: cx, y: (cab.p + cab.ob) / 2, zoom: 1.35 },
      },
      { t: T + 4.0, fade: 0, fadeDur: 1.0 },
      ...[T + 5.8, T + 7.6, T + 9.4].map((t) => ({ t, do: () => (g.clash(cx, (p.y + ob.y) / 2, 1.9, 12), g.audio.play('clash', ob), (p.clashFlash = ob.clashFlash = 0.15)) })),
      { t: T + 10.6, do: (c) => (c.onFrame = null) },
      // they let go and drop onto the pipe below, Obi-Wan first
      { t: T + 11.0, do: (c) => ((this.ropes = this.ropes.filter((r) => r.u !== ob)), ob.setAnim('leap', 1, true), c.move(ob, P.x, ob.y + 0.8, 0.6), (ob.airborne = false)) },
      { t: T + 11.6, do: () => (ob.setAnim('idle', 1, true), g.fx.sparks(ob.x, ob.y, P.z, '#c8c0b8', 4, 2), this.card('배관 위')) },
      { t: T + 12.2, do: (c) => ((this.ropes = null), p.setAnim('leap', 1, true), c.move(p, P.x, p.y - 0.4, 0.6), (p.airborne = false)), cam: { follow: p, dur: 1.0 } },
      { t: T + 12.8, do: () => (p.setAnim('idle', 1, true), g.fx.sparks(p.x, p.y, P.z, '#c8c0b8', 4, 2), p.faceTo(ob.x, ob.y), ob.faceTo(p.x, p.y)) },
    ];
    return new Cinema(g, { length: T + 13.2, cues }).play().then(() => {
      this.ropes = null;
      p.airborne = ob.airborne = false;
      p.z = ob.z = P.z; // (on the pipe, not settling down onto it from the cables' height when the scene was skipped)
      this.enterPart('pipe');
    });
  },

  /** The catwalk's last section is torn off (its picture swapped for the broken one; nobody walks back onto it). */
  collapseCatwalk() {
    const w = this.game.world;
    const C = this.at.collapse;
    w.rect(C.x - 2, C.y - 1, C.x + 4.5, C.y + 1, (i) => (w.blocked[i] = 1));
    const broken = w.named.catwalkBroken;
    if (broken) {
      broken.hidden = false;
      if (w.named.catwalkEnd) w.named.catwalkEnd.hidden = true;
    }
  },

  /** The film's 4:28: to the pipe's end, and a leap onto the collector arm (the lava bombs begin). */
  toArm() {
    const g = this.game;
    const p = g.player;
    const ob = this.foe;
    const P = this.at.pipe;
    const A = this.at.arm;
    this.part = 'toArm';
    this.hold();
    ob.set('circle', 99);
    const end = P.y1 - 0.7;
    const cues = [
      { t: 0, do: (c) => this.travel(c, { x: P.x, y: end - 2.0 }, { x: P.x, y: end }, 1.6), cam: { follow: p, zoom: 1.3, dur: 0.8 } },
      { t: 1.0, do: (c) => this.clash(c) },
      { t: 2.0, do: (c) => (ob.setAnim('leap', 1, true), g.audio.play('leap', ob), c.move(ob, A.x + 0.3, A.y + 1.0, 0.7)) },
      { t: 2.7, do: () => (ob.setAnim('idle', 1, true), g.fx.dust(ob.x, ob.y, 5), ob.faceTo(p.x, p.y), this.card('집하기 팔')) },
      { t: 3.0, do: (c) => (p.setAnim('leap', 1, true), g.audio.play('leap', p), c.move(p, A.x + 0.3, A.y - 2.0, 0.7)), cam: { follow: p, dur: 0.8 } },
      { t: 3.7, do: () => (p.setAnim('idle', 1, true), g.fx.dust(p.x, p.y, 5), p.faceTo(ob.x, ob.y)) },
    ];
    return new Cinema(g, { length: 4.0, cues }).play().then(() => this.enterPart('arm'));
  },

  /** The film's 5:11: "I have failed you, Anakin." */
  toFailed() {
    const g = this.game;
    const p = g.player;
    const ob = this.foe;
    this.part = 'toFailed';
    this.hold();
    ob.set('circle', 99);
    const mid = () => ({ x: (p.x + ob.x) / 2, y: (p.y + ob.y) / 2 });
    const cues = [
      { t: 0, do: () => (p.faceTo(ob.x, ob.y), ob.faceTo(p.x, p.y), p.setAnim('idle'), this.pose(ob, 'talk', 1)), cam: { ...mid(), zoom: 1.5, dur: 1.0 } },
      say(1.5, 'obiwan', '난 널 실망시켰다, 아나킨. 내가 널 실망시켰어.', 3.4),
      say(5.0, 'anakin', '제다이가 권력을 잡으려 음모를 꾸민다는 걸 진작 알았어야 했어!', 2.6),
      { t: 5.0, do: () => (ob.setAnim('idle'), this.pose(p, 'talk', 1)) },
      say(7.5, 'obiwan', '아나킨, 팰퍼틴 의장은 악이다!', 2.2),
      { t: 7.5, do: () => (p.setAnim('idle'), this.pose(ob, 'talk', 1)) },
      say(9.6, 'anakin', '내 관점에서는, 제다이가 악이야!', 2.4),
      { t: 9.6, do: () => (ob.setAnim('idle'), this.pose(p, 'talk', 1)) },
      say(12.1, 'obiwan', '그렇다면… 넌 길을 잃었구나!', 2.4),
      { t: 12.1, do: () => (p.setAnim('idle'), this.pose(ob, 'talk', 1)) },
      { t: 14.4, do: () => (ob.setAnim('idle'), p.setAnim('idle')) },
    ];
    return new Cinema(g, { length: 14.8, cues }).play().then(() => this.enterPart('arm2'));
  },

  /**
   * The film's 5:48: "This is the end for you, my master." A lava bomb takes the collector tower; the arm comes down
   * into the river — and floats: the fight goes on aboard it (STAGE 05).
   */
  toFall() {
    const g = this.game;
    const p = g.player;
    const ob = this.foe;
    const A = this.at.arm;
    const T = this.at.armTower;
    this.part = 'toFall';
    this.lock = null;
    g.emit('lock', false);
    this.hold();
    ob.set('circle', 99);
    this.bombsOn = false;
    const cues = [
      { t: 0, do: () => (p.faceTo(ob.x, ob.y), ob.faceTo(p.x, p.y), this.pose(p, 'talk', 1), ob.setAnim('idle')), cam: { follow: p, zoom: 1.4, dur: 0.8 } },
      say(0.8, 'anakin', '이걸로 끝이에요, 마스터.', 2.6),
      { t: 3.4, do: () => this.pose(p, 'sig') },
      { t: 3.8, do: (c) => this.clash(c, p) },
      { t: 4.8, do: (c) => this.clash(c) },
      { t: 5.6, do: () => (p.setAnim('idle'), ob.setAnim('idle')) },
      // a bomb out of the lava strikes the collector tower at the arm's end: it groans and goes
      { t: 6.0, do: () => g.fx.lavaBomb(T.x + 7, T.y + 3, T.x + 0.5, T.y + 1.5, 1.4, 6), cam: { x: T.x, y: T.y + 3, zoom: 1.1, dur: 1.2 } },
      { t: 7.4, do: (c) => (g.fx.shake(6), g.audio.play('explode', p), (c.onFrame = () => (g.fx.shake(3), Math.random() < 0.5 && g.fx.sparks(T.x + rand(-1.5, 1.5), T.y + rand(-1.5, 1.5), rand(0.5, 6), '#ffb040', 3, 4)))) },
      { t: 8.8, do: () => (g.fx.explosion(T.x, T.y, 2.4), g.fx.explosion(T.x + 1, T.y + 1, 1.4), g.audio.play('explode', p), g.fx.text(T.x, T.y, '집하기 탑이 무너진다!', '#ff9a50', 1.2, 2.6)) },
      {
        t: 9.4,
        do: (c) => (g.fx.shake(12), p.setAnim('hurt', 0.5, true), ob.setAnim('hurt', 0.5, true), c.move(p, A.x + 0.4, Math.min(A.y + A.hh - 1, p.y + 3), 2.2), c.move(ob, A.x - 0.3, Math.min(A.y + A.hh - 2, ob.y + 3), 2.2)),
        cam: { follow: p, dur: 1.0 },
      },
      { t: 11.6, do: () => (p.setAnim('block', 1, true), ob.setAnim('block', 1, true), g.fx.text(p.x, p.y, '팔이 기운다!', '#ff9a50', 1.2, 2.6)) },
      { t: 12.2, fade: 1, fadeDur: 0.6 },
      // the arm in the river, adrift: both still aboard
      { t: 13.4, do: (c) => ((c.onFrame = null), this.dropArm(), this.raftLaunch(), this.card('용암 강 · 떠내려가는 팔')), cam: { follow: p, zoom: 1.3 } },
      { t: 13.5, fade: 0, fadeDur: 1.0 },
      { t: 13.6, do: () => (g.fx.shake(8), g.audio.play('explode', p), g.fx.lavaSplash(p.x + 1.5, p.y, 2), g.fx.lavaSplash(ob.x - 1.5, ob.y, 2), g.fx.lavaSplash(p.x, p.y + 2.0, 1.5)) },
      { t: 14.2, do: () => (p.setAnim('idle', 1, true), ob.setAnim('idle', 1, true), p.faceTo(ob.x, ob.y), ob.faceTo(p.x, p.y)) },
      { t: 14.6, do: (c) => this.clash(c, p) },
      { t: 15.2, do: () => (p.setAnim('idle'), ob.setAnim('idle')) },
    ];
    return new Cinema(g, { length: 15.4, cues }).play().then(() => this.enterPart('raft'));
  },

  /** The arm and its tower are gone from the collector (their blockout boxes hidden; the arm's deck no longer there). */
  dropArm() {
    const w = this.game.world;
    for (const id of ['arm', 'armTower']) if (w.named[id]) w.named[id].hidden = true;
    const A = this.at.arm;
    w.rect(A.x - A.hw, A.y - A.hh, A.x + A.hw, A.y + A.hh, (i) => (w.blocked[i] = 1));
    w.surfaces = w.surfaces.filter((s) => !(s.x0 === A.x - A.hw && s.y0 === A.y - A.hh));
  },

  // --- STAGE 05: the river ---------------------------------------------------------------------------------------

  /** The fallen arm in the river, both aboard, drifting downstream (+x). */
  raftLaunch() {
    const g = this.game;
    const p = g.player;
    const ob = this.foe;
    const w = g.world;
    const R = this.river;
    const raft = this.raft;
    this.raftT = 0;
    this.onRaft = true;
    raft.hidden = false;
    raft.alpha = 1;
    raft.x = R.raft.from.x;
    raft.y = R.raft.from.y;
    w.strips.push((this.raftStrip = { x0: raft.x, y0: raft.y - raft.half, x1: raft.x, y1: raft.y + raft.half, r: R.raft.r }));
    // its deck's height (the arm's picture: 0.3 m up), following it down the river
    if (this.raftZ) w.surfaces.push((this.raftSurf = { x0: 0, y0: 0, x1: 0, y1: 0, z: this.raftZ }));
    this.placeRaftSurf();
    this.raftLights = [
      { x: raft.x, y: raft.y - 5, z: 0.2, r: 255, g: 140, b: 60, rad: 120, flicker: 0.12 },
      { x: raft.x, y: raft.y + 5, z: 0.2, r: 255, g: 140, b: 60, rad: 120, flicker: 0.12 },
    ];
    w.lights.push(...this.raftLights);
    p.x = raft.x + 0.3;
    p.y = raft.y + 2.6;
    ob.x = raft.x - 0.2;
    ob.y = raft.y - 1.4;
    p.kx = p.ky = ob.kx = ob.ky = 0;
    p.z = ob.z = 0;
    p.airborne = ob.airborne = false;
    p.deck = ob.deck = raft;
    p.faceTo(ob.x, ob.y);
    ob.faceTo(p.x, p.y);
    g.updateActive();
  },

  /** The river craft's deck tops over where they are now (a square inside each one's round deck). */
  placeCraftSurfs() {
    for (const f of [this.platform, this.droid]) {
      const s = f && f.surf;
      if (!s) continue;
      const h = f.r * 0.75;
      s.x0 = f.x - h;
      s.x1 = f.x + h;
      s.y0 = f.y - h;
      s.y1 = f.y + h;
    }
  },

  /** The raft's deck top over where it is now (while it sinks it goes down with it). */
  placeRaftSurf() {
    const s = this.raftSurf;
    if (!s) return;
    const r = this.raft;
    s.x0 = r.x - 1.5;
    s.x1 = r.x + 1.5;
    s.y0 = r.y - r.half;
    s.y1 = r.y + r.half;
    s.z = this.raftZ * (r.alpha ?? 1);
  },

  /** The arm drifts downstream, swaying; its riders go with it and never leave it (the lava is right there). */
  updateRaft(dt) {
    const raft = this.raft;
    const g = this.game;
    const R = this.river;
    this.raftT += dt;
    const k = this.raftT;
    const ox = raft.x;
    const oy = raft.y;
    raft.x = R.raft.from.x + k * R.raft.speed;
    raft.y = R.raft.from.y + Math.sin(k * 0.5) * 0.3; // (drifting downstream, +x, broadside on)
    if (this.raftSink) {
      raft.alpha = Math.max(0, (raft.alpha ?? 1) - dt * 0.45);
      if (Math.random() < 0.5) g.fx.lavaSplash(raft.x + rand(-1, 1), raft.y + rand(-raft.half, raft.half), 0.8);
      if (raft.alpha <= 0) {
        raft.hidden = true;
        this.onRaft = false;
        g.world.strips = g.world.strips.filter((q) => q !== this.raftStrip);
        g.world.surfaces = g.world.surfaces.filter((q) => q !== this.raftSurf);
        return;
      }
    }
    const st = this.raftStrip;
    st.x0 = st.x1 = raft.x;
    st.y0 = raft.y - raft.half;
    st.y1 = raft.y + raft.half;
    this.placeRaftSurf();
    for (const u of [g.player, this.foe]) {
      if (u.deck && u.deck !== raft) continue; // (already leapt to a deck)
      u.x += raft.x - ox;
      u.y += raft.y - oy;
      if (u.airborne) continue;
      u.x = raft.x + Math.max(-1.1, Math.min(1.1, u.x - raft.x));
      u.y = raft.y + Math.max(-raft.half + 0.8, Math.min(raft.half - 0.8, u.y - raft.y));
    }
    this.raftLights[0].x = this.raftLights[1].x = raft.x;
    this.raftLights[0].y = raft.y - 5;
    this.raftLights[1].y = raft.y + 5;
  },

  /** The film's 6:13: the arm goes under — Obi-Wan to the repulsor platform, Anakin to the droid, then across. */
  toDecks() {
    const g = this.game;
    const p = g.player;
    const ob = this.foe;
    const pl = this.platform;
    const dr = this.droid;
    this.part = 'toDecks';
    this.hold();
    ob.set('circle', 99);
    this.bombsOn = false;
    const cues = [
      { t: 0, do: () => (p.setAnim('idle'), ob.setAnim('idle'), g.fx.shake(6), g.audio.play('explode', p), g.fx.text(p.x, p.y, '팔이 가라앉는다!', '#ff9a50', 1.2, 2.6)), cam: { follow: p, zoom: 1.25, dur: 0.8 } },
      { t: 0.8, do: () => (this.riverDecks(), (this.raftSink = true)) },
      { t: 1.6, do: (c) => (ob.setAnim('leap', 1, true), g.audio.play('leap', ob), (ob.airborne = true), c.move(ob, pl.x, pl.y, 0.7)) },
      { t: 2.3, do: () => (ob.setAnim('idle', 1, true), (ob.airborne = false), (ob.deck = pl), g.fx.dust(ob.x, ob.y, 4), ob.faceTo(p.x, p.y)) },
      { t: 2.8, do: (c) => (p.setAnim('leap', 1, true), g.audio.play('leap', p), (p.airborne = true), c.move(p, dr.x, dr.y, 0.7)), cam: { follow: p, dur: 0.6 } },
      { t: 3.5, do: () => (p.setAnim('idle', 1, true), (p.airborne = false), (p.deck = dr), g.fx.dust(p.x, p.y, 4), p.faceTo(ob.x, ob.y), this.card('용암 강')) },
      // Anakin will not let him go: across onto the platform, and the two clash on one deck
      { t: 5.0, do: (c) => (p.setAnim('leap', 1, true), g.audio.play('leap', p), (p.airborne = true), c.move(p, pl.x + 0.6, pl.y + 0.5, 0.7)), cam: { follow: pl, zoom: 1.4, dur: 0.8 } },
      { t: 5.7, do: () => (p.setAnim('idle', 1, true), (p.airborne = false), (p.deck = pl), g.fx.dust(p.x, p.y, 4), p.faceTo(ob.x, ob.y), ob.faceTo(p.x, p.y)) },
      { t: 6.0, do: (c) => this.clash(c, p) },
      { t: 7.0, do: (c) => this.clash(c) },
      { t: 7.8, do: () => (p.setAnim('idle'), ob.setAnim('idle')) },
    ];
    return new Cinema(g, { length: 8.2, cues }).play().then(() => {
      p.deck = ob.deck = pl;
      this.enterPart('river');
    });
  },

  /** The decks come alongside the sinking arm: the platform on the bank's side, the droid on the other. */
  riverDecks() {
    const g = this.game;
    const w = g.world;
    const R = this.river;
    const raft = this.raft;
    const pl = this.platform;
    const dr = this.droid;
    pl.hidden = dr.hidden = false;
    pl.x = raft.x + 3.2;
    pl.y = raft.y - 3;
    dr.x = raft.x + 3;
    dr.y = raft.y + 3.5;
    // the platform reaches the bank in about 20 s of the river's fight
    const d = dist(pl.x, pl.y, R.end.x, R.end.y);
    this.platformV = { x: (R.end.x - pl.x) / d, y: (R.end.y - pl.y) / d, s: Math.max(R.platform.speed, d / 20) };
    this.platformArrived = false;
    this.riverT = 0;
    w.floats = [pl, dr];
    for (const f of [pl, dr]) if (f.surf && !w.surfaces.includes(f.surf)) w.surfaces.push(f.surf);
    this.placeCraftSurfs();
    this.floatLights = [
      { x: pl.x, y: pl.y, z: 0.2, r: 255, g: 140, b: 70, rad: 90, flicker: 0.08 },
      { x: dr.x, y: dr.y, z: 0.2, r: 255, g: 150, b: 60, rad: 90, flicker: 0.1 },
    ];
    w.lights.push(...this.floatLights);
    this.onRiver = true;
    g.updateActive();
  },

  /** The platform drifts toward the bank, the droid behind it; their riders go with them. */
  updateRiver(dt) {
    const g = this.game;
    const pl = this.platform;
    const dr = this.droid;
    const R = this.river;
    this.riverT += dt;
    const k = this.riverT;
    const px = pl.x;
    const py = pl.y;
    const dx0 = dr.x;
    const dy0 = dr.y;
    if (!this.platformArrived) {
      const V = this.platformV;
      pl.x += V.x * V.s * dt;
      pl.y += V.y * V.s * dt + Math.sin(k * 0.7) * 0.004;
      if (dist(pl.x, pl.y, R.end.x, R.end.y) < 0.3) this.platformArrived = true;
    }
    dr.x += (pl.x - 3.0 - dr.x) * Math.min(1, dt * 0.6);
    dr.y += (pl.y + 3.2 + Math.sin(k * 0.9) * 0.4 - dr.y) * Math.min(1, dt * 0.6);
    const carry = (u, f, ox, oy) => {
      if (u.deck !== f || u.airborne) return;
      u.x += f.x - ox;
      u.y += f.y - oy;
      const d = dist(u.x, u.y, f.x, f.y);
      if (d > f.r - 0.1) {
        const a = Math.atan2(u.y - f.y, u.x - f.x);
        u.x = f.x + Math.cos(a) * (f.r - 0.1);
        u.y = f.y + Math.sin(a) * (f.r - 0.1);
        u.kx = u.ky = 0;
      }
    };
    for (const u of [g.player, this.foe]) {
      carry(u, dr, dx0, dy0);
      carry(u, pl, px, py);
    }
    this.floatLights[0].x = pl.x;
    this.floatLights[0].y = pl.y;
    this.floatLights[1].x = dr.x;
    this.floatLights[1].y = dr.y;
    this.placeCraftSurfs();
  },

  // --- STAGE 06: the high ground and the ending (on the film's audio) -------------------------------------------

  toEnding() {
    const g = this.game;
    const p = g.player;
    const ob = this.foe;
    const A = this.at;
    this.part = 'ending';
    this.over = true;
    this.lock = null;
    g.emit('lock', false);
    this.hold();
    this.bombsOn = false;
    this.platformAlongside(); // (a cut under the black: the fight may have ended before the platform got there)
    this.onRiver = false;
    const bank = A.highGround;
    const foot = A.foot;
    const cues = [
      { t: 0, fade: 1, fadeDur: 0 },
      {
        t: 0.3,
        do: () => {
          p.setAnim('idle');
          ob.setAnim('idle');
          p.kx = p.ky = ob.kx = ob.ky = 0;
          p.faceTo(ob.x, ob.y);
          ob.faceTo(p.x, p.y);
          this.card('고지대');
        },
        cam: { x: (p.x + bank.x) / 2, y: (p.y + bank.y) / 2, zoom: 1.3 },
      },
      { t: 0.4, fade: 0, fadeDur: 1.4 },
      { t: 3.2, do: () => ob.faceTo(bank.x, bank.y) },
      { t: 4.4, do: (c) => (ob.setAnim('leap', 1, true), (ob.deck = null), c.move(ob, bank.x, bank.y, 0.8), g.audio.play('leap', ob)) },
      { t: 5.2, do: () => (ob.setAnim('idle', 1, true), (ob.z = g.world.groundAt(ob.x, ob.y)), ob.faceTo(p.x, p.y), g.fx.dust(ob.x, ob.y, 6)) }, // (up on the slope at once)
      say(8.0, 'obiwan', '끝났다, 아나킨!', 3.0),
      say(11.6, 'obiwan', '내가 더 높은 곳에 있다.', 3.0),
      say(16.4, 'anakin', '내 힘을 얕보지 마!', 2.4),
      { t: 16.4, do: () => this.pose(p, 'talk', 1) },
      say(19.0, 'obiwan', '그러지 마라.', 2.0),
      { t: 19.0, do: () => p.setAnim('idle', 1, true) },
      // the leap and the cut
      { t: 21.4, do: (c) => (p.setAnim('leap', 1, true), g.audio.play('leap', p), (p.deck = null), (p.airborne = true), c.move(p, bank.x + 0.2, bank.y + 0.6, 0.9), (c.onFrame = () => (p.z = 1.2 + Math.sin(Math.min(1, (c.t - 21.4) / 0.9) * Math.PI) * 1.6))) },
      { t: 22.0, do: () => ob.setAnim('attack2', 1.3, true) },
      {
        t: 22.3,
        do: (c) => {
          c.onFrame = null;
          g.fx.sparks(p.x, p.y, 1.2, '#ffe0b0', 26, 4);
          g.fx.shake(10);
          g.audio.play('clash', p, { heavy: true });
          g.audio.play('hit', p, { crit: true });
          p.saberLit = false;
          p.airborne = false;
          this.pose(p, 'fall', 1);
          c.move(p, foot.x, foot.y, 1.2); // down the slope to the lava's edge
          g.slowT = 0.4;
        },
      },
      { t: 22.5, fade: 0.85, fadeDur: 0.05 },
      { t: 22.7, fade: 0, fadeDur: 1.2, cam: { x: foot.x - 0.4, y: foot.y - 0.6, zoom: 1.6, dur: 3 } },
      { t: 23.6, do: () => ((p.z = 0), this.pose(p, 'crawl'), p.faceTo(ob.x, ob.y)) },
      { t: 25.5, do: () => (ob.setAnim('idle'), ob.faceTo(p.x, p.y)) },
      // Obi-Wan switches off, picks up his fallen student's saber
      { t: 30.0, do: () => ((ob.saberLit = false), g.audio.play('retract', ob), this.pose(ob, 'idleOff', 1)) },
      { t: 34.0, do: (c) => (this.pose(ob, 'walkOff'), ob.faceTo(foot.x + 0.6, foot.y - 0.9), c.move(ob, foot.x + 0.6, foot.y - 0.9, 2.2)) },
      { t: 36.3, do: () => (this.pose(ob, 'idleOff', 1), ob.faceTo(p.x, p.y)) },
      { t: 38.2, do: () => this.pose(ob, 'pick', 1) },
      { t: 39.6, do: () => g.fx.sparks(ob.x + 0.2, ob.y + 0.3, 0.3, '#c8d8ff', 4, 1.5) },
      { t: 40.0, do: () => this.pose(ob, 'grieve', 1) },
      say(43.0, 'obiwan', '넌 선택받은 자였다!', 2.8),
      { t: 43.0, cam: () => ({ x: (foot.x + ob.x) / 2, y: (foot.y + ob.y) / 2, dur: 2 }) }, // (where he is then)
      say(46.2, 'obiwan', '시스를 멸할 거라고 했지, 그들과 손잡는 게 아니라!', 4.2),
      say(52.4, 'obiwan', '포스에 균형을 가져오는 것이지… 어둠 속에 버려두는 게 아니라!', 4.6),
      { t: 60.0, do: () => this.pose(p, 'crawl', 1.3) },
      say(69.5, 'anakin', '당신이 미워!!', 2.6),
      { t: 69.5, do: () => this.pose(p, 'burn', 0.7), cam: { x: foot.x - 0.3, y: foot.y, dur: 0.4 } },
      say(73.4, 'obiwan', '넌 내 형제였다, 아나킨.', 2.8),
      { t: 73.4, cam: () => ({ x: ob.x, y: ob.y, dur: 1.5 }) },
      say(76.3, 'obiwan', '널 사랑했다.', 2.4),
      // the lava catches him; Obi-Wan turns away, up the slope
      {
        t: 78.8,
        do: (c) => {
          this.pose(p, 'burn', 1);
          c.onFrame = () => {
            if (Math.random() < 0.8) g.fx.flame(p.x + rand(-0.3, 0.3), p.y + rand(-0.35, 0.35), 0.15, 2, 1);
            if (Math.random() < 0.3) g.fx.sparks(p.x, p.y, 0.4, '#ff8a30', 2, 2);
          };
          g.world.lights.push({ x: p.x, y: p.y, z: 0.5, r: 255, g: 120, b: 40, rad: 170, flicker: 0.3 });
          g.audio.play('explode', p, { volume: 0.4 });
        },
        cam: { x: foot.x, y: foot.y, dur: 2 },
      },
      { t: 80.6, do: (c) => (this.pose(ob, 'walkOff'), ob.faceTo(ob.x + 2.5, ob.y - 6), c.move(ob, ob.x + 2.5, ob.y - 6, 3.2)) },
      { t: 82.6, fade: 1, fadeDur: 1.6 },
    ];
    new Cinema(g, { track: 'mustafarEnd', length: 84.5, cues }).play().then(() => {
      this.part = 'done';
      this.over = false; // finish() sets it again and reports
      this.finish(true);
    });
  },

  /** The platform at the bank (where the river's fight ends), its riders and the droid carried with it. */
  platformAlongside() {
    const R = this.river;
    const pl = this.platform;
    if (!R || !pl || pl.hidden || this.platformArrived) return;
    const dx = R.end.x - pl.x;
    const dy = R.end.y - pl.y;
    const g = this.game;
    for (const u of [pl, this.droid, g.player, this.foe]) {
      if (u !== pl && u !== this.droid && u.deck !== pl && u.deck !== this.droid) continue;
      u.x += dx;
      u.y += dy;
    }
    this.platformArrived = true;
    this.placeCraftSurfs();
    if (this.floatLights) {
      this.floatLights[0].x = pl.x;
      this.floatLights[0].y = pl.y;
      this.floatLights[1].x = this.droid.x;
      this.floatLights[1].y = this.droid.y;
    }
    g.updateActive();
  },

  // --- testing a part on its own (?mfPart=<part>: QA, and playing a blockout without the film before it) ------------

  /** Start the fight at `part`: the world as the scenes before it leave it, the two where it begins. */
  jumpTo(part) {
    const g = this.game;
    const p = g.player;
    const ob = this.foe;
    const w = g.world;
    const A = this.at;
    const order = Object.keys(this.fights);
    const i = order.indexOf(part);
    const past = (k) => i >= order.indexOf(k);
    p.sprite = 'anakin_tunic';
    ob.sprite = 'obiwan3';
    p.saberLit = ob.saberLit = true;
    ob.hidden = false;
    this.padme.hidden = false;
    this.padme.setAnim('down');
    if (past('corridor')) {
      if (w.named.facilityDoor) w.named.facilityDoor.hidden = true;
      w.open('facilityDoor');
    }
    if (past('balcony')) this.openBalcony(), this.alarmOn();
    if (past('pipe')) this.collapseCatwalk();
    if (past('raft')) this.dropArm();
    const P = A.pipe;
    const Ar = A.arm;
    const START = {
      pad: [A.anakin, A.obiwan],
      corridor: [A.corrAnakin, A.corrObiwan],
      control: [A.ctlAnakin, A.ctlObiwan],
      room: [A.roomAnakin, A.roomObiwan],
      control2: [A.ctlAnakin, A.ctlObiwan],
      balcony: [A.terraceAnakin, A.terraceObiwan],
      rain: [{ x: 48, y: 109.2 }, { x: 51, y: 108.8 }],
      pipe: [{ x: P.x, y: P.y0 + 4 }, { x: P.x, y: P.y0 + 8 }],
      arm: [{ x: Ar.x + 0.3, y: Ar.y - 2 }, { x: Ar.x + 0.3, y: Ar.y + 1 }],
      arm2: [{ x: Ar.x + 0.3, y: Ar.y - 2 }, { x: Ar.x + 0.3, y: Ar.y + 1 }],
    };
    if (part === 'raft') this.raftLaunch();
    else if (part === 'river') {
      this.raftLaunch();
      this.raft.hidden = true;
      this.onRaft = false;
      w.strips = w.strips.filter((q) => q !== this.raftStrip);
      w.surfaces = w.surfaces.filter((q) => q !== this.raftSurf);
      this.riverDecks();
      const pl = this.platform;
      p.x = pl.x + 0.6;
      p.y = pl.y + 0.5;
      ob.x = pl.x - 0.5;
      ob.y = pl.y - 0.4;
      p.deck = ob.deck = pl;
    } else {
      const [a, b] = START[part];
      p.x = a.x;
      p.y = a.y;
      ob.x = b.x;
      ob.y = b.y;
    }
    p.faceTo(ob.x, ob.y);
    ob.faceTo(p.x, p.y);
    g.updateActive();
    this.enterPart(part);
  },
};
