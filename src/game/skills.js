// Anakin Skywalker's skill trees (Diablo II style: 3 trees, tiered by
// character level, prerequisites and synergies). Everything is grounded in
// Clone Wars lore: Form V (Djem So / Shien) saber work, Anakin's raw Force
// power and his darker impulses, and his role as General of the 501st Legion.
import { angleDiff, dist } from '../core/math.js';

export const TREES = [
  { id: 'saber', name: '라이트세이버 전투', en: 'Form V · Djem So / Shien', color: '#5aa8ff' },
  { id: 'force', name: '포스', en: 'The Force', color: '#b38cff' },
  { id: 'legion', name: '501군단 지휘관', en: 'General of the 501st', color: '#ffb347' },
];

export const TIER_LEVELS = [1, 6, 12, 18, 24];

const pct = (v) => `${Math.round(v)}%`;
const r1 = (v) => Math.round(v * 10) / 10;

export const SKILLS = {
  // ===================== Tree 0: Lightsaber Combat =========================
  flurry: {
    tree: 0, row: 0, col: 0, max: 20, kind: 'active', target: 'enemy', icon: 'flurry',
    name: '세이버 연격', en: 'Saber Flurry',
    lore: '빠르고 공격적인 아나킨의 연속 베기. 적에게 숨 돌릴 틈을 주지 않는다.',
    cost: (l) => Math.round(3 + l * 0.3),
    cd: () => 0,
    mult: (l) => 0.7 + l * 0.08,
    lines: (l, s) => [[`3연타, 타격당 무기 피해의 ${pct(s.mult(l) * 100)}`], [`포스 소모 ${s.cost(l)}`]],
    cast(game, p, l, tx, ty, target) {
      if (!target) return false;
      const m = this.mult(l);
      p.startMelee(target, [
        { anim: 'attack1', speed: 1.7, mult: m },
        { anim: 'attack2', speed: 1.8, mult: m },
        { anim: 'attack1', speed: 1.7, mult: m * 1.2 },
      ]);
      return true;
    },
  },
  shien: {
    tree: 0, row: 0, col: 2, max: 20, kind: 'passive', icon: 'shien',
    name: '쉬엔 반사', en: 'Shien Deflection',
    lore: '형식 V 쉬엔 — 블래스터 볼트를 쳐내고, 숙련되면 사수에게 되돌려 보낸다.',
    deflect: (l) => (l ? 10 + l * 2.5 : 0),
    redirect: (l) => (l ? Math.min(90, 25 + l * 4) : 0),
    lines: (l, s) => [[`볼트 반사 확률 +${pct(s.deflect(l))}`], [`사수에게 되돌릴 확률 ${pct(s.redirect(l))}`]],
  },
  djemso: {
    tree: 0, row: 1, col: 0, max: 20, kind: 'active', target: 'enemy', icon: 'djemso', prereq: ['flurry'],
    name: '젬 소 내려치기', en: 'Djem So Overhead',
    lore: '형식 V 젬 소의 압도적인 힘. 한 번의 내려치기로 적을 쓰러뜨리고 주위를 뒤흔든다.',
    cost: (l) => Math.round(7 + l * 0.5),
    cd: () => 2.5,
    mult: (l, p) => (1.8 + l * 0.2) * (1 + 0.06 * (p?.skillLevel('flurry') || 0)),
    stun: (l) => 0.8 + l * 0.05,
    lines: (l, s, p) => [
      [`무기 피해의 ${pct(s.mult(l, p) * 100)}`],
      [`주변 1.8m 충격파 (60% 피해), 기절 ${r1(s.stun(l))}초`],
      [`시너지: 세이버 연격 레벨당 +6%`],
      [`포스 소모 ${s.cost(l)} · 재사용 ${s.cd(l)}초`],
    ],
    cast(game, p, l, tx, ty, target) {
      if (!target) return false;
      const m = this.mult(l, p);
      const stun = this.stun(l);
      p.startMelee(target, [
        {
          anim: 'attack2', speed: 1.1, mult: m, stun,
          onHit: (t) => {
            game.fx.shockwave(t.x, t.y, 1.8, '#9fd0ff', 0.35);
            game.fx.shake(4);
            game.audio.play('slam');
            for (const e of game.hostilesInRadius(p, t.x, t.y, 1.8)) {
              if (e !== t) game.damage(p, e, p.weaponDamage() * m * 0.6, { type: 'saber', stun });
            }
          },
        },
      ]);
      return true;
    },
  },
  throw: {
    tree: 0, row: 2, col: 1, max: 20, kind: 'active', target: 'point', icon: 'throw', prereq: ['flurry'],
    name: '세이버 투척', en: 'Saber Throw',
    lore: '포스로 회전하는 광선검을 던져 일렬의 적을 꿰뚫고 손으로 되돌린다.',
    cost: (l) => Math.round(9 + l * 0.5),
    cd: () => 1.2,
    range: (l) => 7 + l * 0.25,
    mult: (l, p) => (1.2 + l * 0.15) * (1 + 0.08 * (p?.skillLevel('flurry') || 0)),
    lines: (l, s, p) => [
      [`관통, 왕복 타격 — 무기 피해의 ${pct(s.mult(l, p) * 100)}`],
      [`사거리 ${r1(s.range(l))}m (던진 동안 반사 불가)`],
      [`시너지: 세이버 연격 레벨당 +8%`],
      [`포스 소모 ${s.cost(l)} · 재사용 ${s.cd(l)}초`],
    ],
    cast(game, p, l, tx, ty) {
      if (p.saberOut) return false;
      const m = this.mult(l, p);
      const range = this.range(l);
      p.playAction('throw', 1.1, tx, ty, () => game.spawnSaberThrow(p, tx, ty, range, m));
      return true;
    },
  },
  barrier: {
    tree: 0, row: 3, col: 2, max: 20, kind: 'buff', target: 'self', icon: 'barrier', prereq: ['shien'],
    name: '쉬엔 방벽', en: 'Shien Barrier',
    lore: '방어 자세를 굳혀 쏟아지는 모든 볼트를 막아내고 정확히 되돌려 보낸다.',
    cost: () => 15,
    cd: () => 14,
    dur: (l) => 4 + l * 0.25,
    dr: (l) => Math.min(60, 25 + l * 1.5),
    lines: (l, s) => [
      [`${r1(s.dur(l))}초 동안 볼트 100% 반사 및 조준 반격`],
      [`받는 피해 -${pct(s.dr(l))}, 이동 속도 -25%`],
      [`포스 소모 ${s.cost(l)} · 재사용 ${s.cd(l)}초`],
    ],
    cast(game, p, l) {
      p.addBuff('barrier', this.dur(l), { dr: this.dr(l) / 100 });
      game.fx.ring(p.x, p.y, 1.2, '#7fc4ff', 0.5);
      game.audio.play('ignite');
      p.playAction('cast', 1.4);
      return true;
    },
  },
  fury: {
    tree: 0, row: 4, col: 0, max: 20, kind: 'active', target: 'point', icon: 'fury', prereq: ['djemso'], dark: true,
    name: '선택받은 자의 분노', en: 'Fury of the Chosen One',
    lore: '분노에 몸을 맡긴 채 회전하며 주위의 모든 것을 베어낸다. 어둠의 유혹이 커진다.',
    cost: (l) => Math.round(20 + l),
    cd: () => 9,
    dur: (l) => 2.4 + l * 0.08,
    mult: (l, p) => (0.55 + l * 0.06) * (1 + 0.05 * (p?.skillLevel('djemso') || 0)),
    lines: (l, s, p) => [
      [`${r1(s.dur(l))}초간 회전 베기, 0.25초마다 반경 2m에 무기 피해의 ${pct(s.mult(l, p) * 100)}`],
      [`커서 방향으로 이동 (60% 속도)`],
      [`어둠 +12 · 시너지: 젬 소 레벨당 +5%`],
      [`포스 소모 ${s.cost(l)} · 재사용 ${s.cd(l)}초`],
    ],
    cast(game, p, l) {
      p.startSpin(this.dur(l), this.mult(l, p));
      p.addDarkness(12);
      game.say('fury');
      return true;
    },
  },

  // ===================== Tree 1: The Force =================================
  push: {
    tree: 1, row: 0, col: 0, max: 20, kind: 'active', target: 'point', icon: 'push',
    name: '포스 푸시', en: 'Force Push',
    lore: '전방의 적과 볼트를 거세게 밀쳐낸다. 벽에 부딪힌 적은 추가 피해를 입는다.',
    cost: (l) => Math.round(7 + l * 0.4),
    cd: () => 1.2,
    range: (l) => 4 + l * 0.15,
    dmg: (l) => 8 + l * 4,
    lines: (l, s, p) => [
      [`전방 원뿔 ${r1(s.range(l))}m, 포스 피해 ${Math.round(s.dmg(l) * (p ? p.forceMult() : 1))}`],
      [`넉백 + 0.6초 기절, 벽 충돌 시 +50%`],
      [`포스 소모 ${s.cost(l)} · 재사용 ${s.cd(l)}초`],
    ],
    cast(game, p, l, tx, ty) {
      const ang = Math.atan2(ty - p.y, tx - p.x);
      p.playAction('cast', 1.3, tx, ty, () => {
        const range = this.range(l);
        game.fx.forceCone(p.x, p.y, ang, range);
        game.audio.play('push');
        game.fx.shake(3);
        for (const e of game.hostilesInRadius(p, p.x, p.y, range + 0.5)) {
          const a = Math.atan2(e.y - p.y, e.x - p.x);
          if (Math.abs(angleDiff(ang, a)) > 0.65) continue;
          game.damage(p, e, this.dmg(l) * p.forceMult(), { type: 'force', knock: { ang: a, power: 9 }, stun: 0.6, wallBonus: 0.5 });
        }
        game.reflectBoltsInCone(p, p.x, p.y, ang, range, 0.7);
      });
      return true;
    },
  },
  speed: {
    tree: 1, row: 0, col: 2, max: 20, kind: 'buff', target: 'self', icon: 'speed',
    name: '포스 스피드', en: 'Force Speed',
    lore: '포스로 몸을 가속해 전장을 질주하고 검을 더 빠르게 휘두른다.',
    cost: () => 12,
    cd: () => 16,
    dur: (l) => 6 + l * 0.4,
    move: (l) => 35 + l * 3,
    atk: (l) => 20 + l * 2,
    lines: (l, s) => [[`${r1(s.dur(l))}초간 이동 속도 +${pct(s.move(l))}, 공격 속도 +${pct(s.atk(l))}`], [`포스 소모 ${s.cost(l)} · 재사용 ${s.cd(l)}초`]],
    cast(game, p, l) {
      p.addBuff('speed', this.dur(l), { move: this.move(l) / 100, atk: this.atk(l) / 100 });
      game.fx.ring(p.x, p.y, 1.0, '#a0e0ff', 0.4);
      game.audio.play('speed');
      return true;
    },
  },
  leap: {
    tree: 1, row: 1, col: 1, max: 20, kind: 'active', target: 'point', icon: 'leap', prereq: ['push'],
    name: '포스 도약', en: 'Force Leap',
    lore: '포스의 힘으로 높이 도약해 적진 한가운데에 내려꽂힌다.',
    cost: (l) => Math.round(10 + l * 0.5),
    cd: () => 3,
    range: () => 9,
    dmg: (l) => 10 + l * 5,
    lines: (l, s, p) => [
      [`최대 ${s.range(l)}m 도약, 착지 반경 2.2m`],
      [`포스 피해 ${Math.round(s.dmg(l) * (p ? p.forceMult() : 1))} + 무기 피해 80%, 기절 0.8초`],
      [`포스 소모 ${s.cost(l)} · 재사용 ${s.cd(l)}초`],
    ],
    cast(game, p, l, tx, ty) {
      let d = dist(p.x, p.y, tx, ty);
      const max = this.range(l);
      if (d > max) {
        tx = p.x + ((tx - p.x) / d) * max;
        ty = p.y + ((ty - p.y) / d) * max;
        d = max;
      }
      const spot = game.findLandingSpot(tx, ty);
      if (!spot) return false;
      p.leapTo(spot.x, spot.y, () => {
        game.fx.shockwave(p.x, p.y, 2.2, '#c9b5ff', 0.4);
        game.fx.dust(p.x, p.y, 14);
        game.fx.shake(5);
        game.audio.play('slam');
        for (const e of game.hostilesInRadius(p, p.x, p.y, 2.2)) {
          game.damage(p, e, this.dmg(l) * p.forceMult() + p.weaponDamage() * 0.8, { type: 'force', stun: 0.8, knock: { ang: Math.atan2(e.y - p.y, e.x - p.x), power: 4 } });
        }
      });
      return true;
    },
  },
  precog: {
    tree: 1, row: 2, col: 2, max: 20, kind: 'passive', icon: 'precog', prereq: ['speed'],
    name: '포스 예지', en: 'Force Precognition',
    lore: '포스가 다음 순간을 속삭인다. 공격을 피하고 약점을 찌른다.',
    dodge: (l) => (l ? Math.min(40, 4 + l * 1.5) : 0),
    crit: (l) => (l ? Math.min(35, 3 + l) : 0),
    lines: (l, s) => [[`회피 확률 +${pct(s.dodge(l))}`], [`치명타 확률 +${pct(s.crit(l))}`]],
  },
  choke: {
    tree: 1, row: 3, col: 0, max: 20, kind: 'active', target: 'enemy', icon: 'choke', prereq: ['push'], dark: true,
    name: '포스 초크', en: 'Force Choke',
    lore: '분노가 손끝으로 흘러 대상을 허공에 들어 올려 조인다. 제다이의 길이 아니다.',
    cost: (l) => Math.round(14 + l),
    cd: () => 5,
    dmg: (l) => 25 + l * 12,
    lines: (l, s, p) => [
      [`3초간 대상을 들어 올려 총 ${Math.round(s.dmg(l) * (p ? p.forceMult() : 1))} 포스 피해`],
      [`대상은 행동 불능 · 어둠 +10`],
      [`포스 소모 ${s.cost(l)} · 재사용 ${s.cd(l)}초`],
    ],
    cast(game, p, l, tx, ty, target) {
      if (!target || dist(p.x, p.y, target.x, target.y) > 9) return false;
      p.playAction('cast', 1.2, target.x, target.y, () => {
        target.applyChoke(3, (this.dmg(l) * p.forceMult()) / 3, p);
        game.audio.play('choke');
      });
      p.addDarkness(10);
      return true;
    },
  },
  repulse: {
    tree: 1, row: 4, col: 1, max: 20, kind: 'active', target: 'self', icon: 'repulse', prereq: ['leap'],
    name: '포스 리펄스', en: 'Force Repulse',
    lore: '내면에 응축한 포스를 사방으로 폭발시켜 주위의 모든 것을 날려 버린다.',
    cost: (l) => Math.round(30 + l),
    cd: () => 12,
    radius: (l) => 4.5 + l * 0.1,
    dmg: (l, p) => (30 + l * 10) * (1 + 0.06 * (p?.skillLevel('push') || 0)),
    lines: (l, s, p) => [
      [`반경 ${r1(s.radius(l))}m 포스 피해 ${Math.round(s.dmg(l, p) * (p ? p.forceMult() : 1))}`],
      [`강력한 넉백, 주변 볼트 소멸 · 시너지: 포스 푸시 레벨당 +6%`],
      [`포스 소모 ${s.cost(l)} · 재사용 ${s.cd(l)}초`],
    ],
    cast(game, p, l) {
      p.playAction('cast', 0.8, null, null, () => {
        const r = this.radius(l);
        game.fx.shockwave(p.x, p.y, r, '#d4c0ff', 0.55);
        game.fx.shockwave(p.x, p.y, r * 0.6, '#ffffff', 0.35);
        game.fx.shake(8);
        game.audio.play('repulse');
        game.clearBolts(p.x, p.y, r, p.team);
        for (const e of game.hostilesInRadius(p, p.x, p.y, r)) {
          const a = Math.atan2(e.y - p.y, e.x - p.x);
          game.damage(p, e, this.dmg(l, p) * p.forceMult(), { type: 'force', knock: { ang: a, power: 12 }, stun: 1, wallBonus: 0.5 });
        }
      });
      return true;
    },
  },

  // ===================== Tree 2: General of the 501st ======================
  clones: {
    tree: 2, row: 0, col: 0, max: 20, kind: 'summon', target: 'point', icon: 'clones',
    name: '클론 트루퍼 호출', en: 'Call Clone Troopers',
    lore: '"501군단, 장군님을 엄호하라!" 충성스러운 클론 트루퍼를 전장에 부른다.',
    cost: () => 15,
    cd: () => 1,
    count: (l) => Math.min(6, 2 + Math.floor(l / 3)),
    hp: (l) => 60 + l * 20,
    dmg: (l) => 4 + l * 1.5,
    lines: (l, s) => [
      [`최대 ${s.count(l)}명 지휘 (시전당 1명)`],
      [`트루퍼 생명력 ${s.hp(l)}, 블래스터 피해 ${r1(s.dmg(l))}`],
      [`포스 소모 ${s.cost(l)}`],
    ],
    cast(game, p, l, tx, ty) {
      const mine = game.units.filter((u) => u.kind === 'clone' && u.owner === p && !u.dead);
      if (mine.length >= this.count(l)) {
        game.say('maxClones');
        return false;
      }
      // troopers deploy at the cursor (within 6m), otherwise just behind Anakin
      const d = dist(p.x, p.y, tx, ty);
      const spot = d < 6 ? game.findLandingSpot(tx, ty) : game.findLandingSpot(p.x + Math.cos(p.facing + 2.5) * 1.5, p.y + Math.sin(p.facing + 2.5) * 1.5);
      if (!spot) return false;
      game.spawnAlly('clone', spot.x, spot.y, { hp: this.hp(l), dmg: this.dmg(l), owner: p });
      game.fx.dust(spot.x, spot.y, 10);
      game.audio.play('summon');
      if (Math.random() < 0.35) game.say('clones');
      return true;
    },
  },
  mechanic: {
    tree: 2, row: 0, col: 2, max: 20, kind: 'passive', icon: 'mechanic',
    name: '기계공의 손길', en: "Mechanic's Touch",
    lore: '타투인의 노예 소년 시절부터 기계를 다뤄 온 아나킨은 드로이드의 약점을 정확히 안다.',
    bonus: (l) => (l ? 10 + l * 3 : 0),
    sc: (l) => (l ? 5 + l : 0),
    lines: (l, s) => [[`드로이드 대상 피해 +${pct(s.bonus(l))}`], [`타격 시 ${pct(s.sc(l))} 확률로 회로 과부하 (1.5초 기절)`]],
  },
  r2: {
    tree: 2, row: 1, col: 2, max: 20, kind: 'summon', target: 'self', icon: 'r2', prereq: ['mechanic'],
    name: 'R2-D2 지원', en: 'R2-D2 Support',
    lore: '믿음직한 아스트로멕 R2-D2. 드로이드를 감전시키고 아군을 수리한다.',
    cost: () => 20,
    cd: () => 5,
    zap: (l) => 8 + l * 5,
    heal: (l) => 3 + l * 1.5,
    lines: (l, s) => [
      [`3초마다 근처 드로이드 감전 (${s.zap(l)} 피해, 0.6초 기절)`],
      [`3초마다 아군 수리 ${r1(s.heal(l))}, 아나킨 생명력 재생 +${r1(0.5 + l * 0.2)}/초`],
      [`포스 소모 ${s.cost(l)} · 재사용 ${s.cd(l)}초`],
    ],
    cast(game, p, l) {
      for (const u of game.units) if (u.kind === 'r2' && u.owner === p) u.remove = true;
      const spot = game.findLandingSpot(p.x - 1, p.y + 1) || { x: p.x, y: p.y };
      game.spawnAlly('r2', spot.x, spot.y, { owner: p, level: l });
      game.audio.play('r2');
      game.fx.text(spot.x, spot.y, '삐빅- 뿌우!', '#9fd0ff');
      return true;
    },
  },
  command: {
    tree: 2, row: 2, col: 0, max: 20, kind: 'passive', icon: 'command', prereq: ['clones'],
    name: '전술 지휘', en: 'Tactical Command',
    lore: '장군의 지휘 아래 클론들은 하나의 군대처럼 움직인다. (오라)',
    dmg: (l) => (l ? 15 + l * 5 : 0),
    dr: (l) => (l ? Math.min(50, 10 + l * 2) : 0),
    lines: (l, s) => [[`아군 피해 +${pct(s.dmg(l))}, 아군 받는 피해 -${pct(s.dr(l))}`], [`아나킨 피해 +${pct(l)}`]],
  },
  rex: {
    tree: 2, row: 3, col: 0, max: 20, kind: 'summon', target: 'point', icon: 'rex', prereq: ['command'],
    name: '렉스 대위', en: 'Captain Rex',
    lore: '"제가 뒤를 맡겠습니다, 장군님." 501군단의 전설적인 대위가 쌍권총으로 합류한다.',
    cost: () => 30,
    cd: () => 45,
    dur: (l) => 40 + l * 3,
    hp: (l) => 200 + l * 40,
    dmg: (l) => 8 + l * 3,
    lines: (l, s) => [[`${s.dur(l)}초간 렉스 대위 합류`], [`생명력 ${s.hp(l)}, 쌍권총 피해 ${s.dmg(l)} (연사)`], [`포스 소모 ${s.cost(l)} · 재사용 ${s.cd(l)}초`]],
    cast(game, p, l) {
      for (const u of game.units) if (u.kind === 'rex') u.remove = true;
      const spot = game.findLandingSpot(p.x + 1, p.y + 1) || { x: p.x, y: p.y };
      game.spawnAlly('rex', spot.x, spot.y, { hp: this.hp(l), dmg: this.dmg(l), owner: p, life: this.dur(l) });
      game.fx.dust(spot.x, spot.y, 12);
      game.audio.play('summon');
      game.say('rex');
      return true;
    },
  },
  gunship: {
    tree: 2, row: 4, col: 1, max: 20, kind: 'active', target: 'point', icon: 'gunship', prereq: ['rex'],
    name: 'LAAT 공습', en: 'Gunship Strike',
    lore: '"건쉽, 좌표 전송한다!" LAAT/i 건쉽이 저공 비행하며 목표 지역을 폭격한다.',
    cost: () => 40,
    cd: () => 18,
    range: () => 16,
    dmg: (l, p) => (30 + l * 12) * (1 + 0.08 * (p?.skillLevel('clones') || 0)),
    lines: (l, s, p) => [
      [`1.6초 후 반경 3.5m에 미사일 8발`],
      [`폭발당 피해 ${Math.round(s.dmg(l, p))} · 시너지: 클론 호출 레벨당 +8%`],
      [`포스 소모 ${s.cost(l)} · 재사용 ${s.cd(l)}초`],
    ],
    cast(game, p, l, tx, ty) {
      if (dist(p.x, p.y, tx, ty) > this.range(l)) {
        const d = dist(p.x, p.y, tx, ty);
        tx = p.x + ((tx - p.x) / d) * this.range(l);
        ty = p.y + ((ty - p.y) / d) * this.range(l);
      }
      game.callGunship(p, tx, ty, this.dmg(l, p));
      game.say('gunship');
      return true;
    },
  },
};

for (const [id, s] of Object.entries(SKILLS)) {
  s.id = id;
  s.reqLevel = TIER_LEVELS[s.row];
  s.prereq = s.prereq || [];
}

export const SKILL_IDS = Object.keys(SKILLS);

/** Can the player put a point in this skill right now? */
export function canLearn(player, id) {
  const s = SKILLS[id];
  if (player.skillPoints <= 0) return false;
  if (player.level < s.reqLevel) return false;
  if (player.skillLevel(id) >= s.max) return false;
  return s.prereq.every((pid) => player.skillLevel(pid) > 0);
}

export const isActive = (id) => ['active', 'buff', 'summon'].includes(SKILLS[id].kind);

export function skillCost(id, l) {
  const s = SKILLS[id];
  return s.cost ? s.cost(l) : 0;
}

