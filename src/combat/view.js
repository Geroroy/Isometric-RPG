// 결투 시험장 그리기 (Canvas 2D, 2:1 아이소메트릭 — core/iso.js와 같은 투영): 장식 없는 바닥과 경계, 결투자, 광선검, 효과.
// 결투자는 프리렌더 스프라이트(sprites.js — tools/sprites/hero의 모델을 검술 v1의 자세로 렌더한 시트, docs/CHARACTERS.md)로
// 그리고, 날은 프레임의 칼자루·검끝 표지에서 그린다. 시트를 불러오기 전(또는 못 불러오면)에는 단순한 몸 표현으로 그린다.
// 판정은 보지 않고 sim의 상태와 사건만 그린다.
//
// 가독성 규칙 (docs/COMBAT.md "피드백"):
//   막기     검이 만난 자리에 청백색 불꽃 + 작은 고리, "막음"
//   쳐내기   그 자리에 금색 섬광·큰 불꽃, "쳐냄!", 쳐내진 쪽 검이 뒤로 젖혀짐
//   헛침     회색 궤적, 칼끝에 "헛침"
//   균형 붕괴 붕괴한 쪽 발밑에 주황 고리(지속), "균형 붕괴!"
//   피격     맞은 몸 위에 붉은 불꽃·몸 붉게 번쩍임, 피해 숫자
// 잔광·불꽃은 짧고(≤0.15 s) 반투명이며, 준비 동작(windup)에는 잔광을 그리지 않는다 — 다음 공격의 준비와 발을 가리지 않게.
import { worldToScreen } from '../core/iso.js';
import { TUNING as T } from './tuning.js';
import { poseOf, swingS, v3 } from './pose.js';

const PX_M = 22.4; // 바닥에서 1 m ≈ 22.4 px (투영 축 길이), 굵기 환산용
const SPARK = { block: [200, 230, 255], parry: [255, 214, 110], clash: [235, 240, 255], hit: [255, 90, 60] };

export class CombatView {
  constructor(canvas, sim) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.sim = sim;
    this.debug = false;
    this.cam = { x: 0, y: 0, s: 3 };
    this.fx = [];
    this.trails = [new Trail(), new Trail()];
    this.flash = [0, 0]; // 피격 번쩍임 (s)
    this.sprites = null; // FighterSprites (sprites.js) — 불러오면 arena.js가 넣는다
    this.picks = [null, null]; // 이번 화면의 스프라이트 프레임
    this.tintCv = null;
    this.shake = 0;
    this.time = 0;
    sim.on((e) => this.onEvent(e));
    this.resize();
    addEventListener('resize', () => this.resize());
    this.snapCamera(); // (첫 화면부터 두 결투자가 보이게)
  }

  resize() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    this.dpr = dpr;
    this.cv.width = Math.round(innerWidth * dpr);
    this.cv.height = Math.round(innerHeight * dpr);
    this.cv.style.width = innerWidth + 'px';
    this.cv.style.height = innerHeight + 'px';
  }

  /** 월드 → 화면 픽셀 (캔버스 CSS px) */
  P(x, y, z = 0) {
    const s = worldToScreen(x, y, z);
    const c = this.camS;
    return [(s.x - c.x) * this.cam.s + innerWidth / 2 + this.shakeX, (s.y - c.y) * this.cam.s + innerHeight * 0.56 + this.shakeY];
  }

  // ------------------------------------------------------------------------------------------------ 사건 → 효과
  onEvent(e) {
    const at = e.at;
    const txt = (p, s, color, size = 15, life = 0.9) => this.fx.push({ k: 'text', p: [...p], s, color, size, t: 0, life });
    switch (e.type) {
      case 'reset':
        this.fx = [];
        this.trails.forEach((t) => t.clear());
        this.flash = [0, 0];
        this.snapCamera(); // (카메라도 새 결투의 자리로 바로: 일시정지 중이어도 따라가기를 기다리지 않게)
        break;
      case 'block':
        this.sparks(at, SPARK.block, e.kind === 'heavy' ? 26 : 14, e.kind === 'heavy' ? 3.2 : 2.4);
        this.fx.push({ k: 'flash', p: at, r: e.kind === 'heavy' ? 0.5 : 0.32, rgb: SPARK.block, t: 0, life: 0.12 });
        this.fx.push({ k: 'ring', p: at, rgb: SPARK.block, r0: 0.08, r1: 0.42, t: 0, life: 0.2 });
        txt(v3.add(at, [0, 0, 0.32]), e.broke ? '방어 붕괴!' : '막음', e.broke ? '#ffb070' : '#cfe6ff', e.broke ? 17 : 14);
        if (e.press) txt([e.target.x, e.target.y, 2.0], '압박 유지', '#9cc4ff', 13, 0.7);
        break;
      case 'parry':
        this.sparks(at, SPARK.parry, 34, 3.6);
        this.fx.push({ k: 'flash', p: at, r: 0.75, rgb: SPARK.parry, t: 0, life: 0.18 });
        this.fx.push({ k: 'ring', p: at, rgb: SPARK.parry, r0: 0.1, r1: 0.8, t: 0, life: 0.28 });
        txt(v3.add(at, [0, 0, 0.4]), '쳐냄!', '#ffd979', 20, 1.1);
        break;
      case 'clash':
        this.sparks(at, SPARK.clash, 30, 3.4);
        this.fx.push({ k: 'flash', p: at, r: 0.55, rgb: SPARK.clash, t: 0, life: 0.14 });
        txt(v3.add(at, [0, 0, 0.36]), e.winner ? '강공격이 누름' : '맞부딪힘', '#ffffff', 15);
        break;
      case 'hit': {
        this.sparks(at, SPARK.hit, e.punish ? 30 : 18, 2.6);
        this.fx.push({ k: 'flash', p: at, r: e.punish ? 0.6 : 0.4, rgb: [255, 70, 40], t: 0, life: 0.14 });
        this.flash[e.target.side] = 0.22;
        this.shake = Math.max(this.shake, e.punish || e.kind === 'heavy' ? 0.22 : 0.12);
        txt(v3.add(at, [0, 0, 0.45]), `−${Math.round(e.dmg)}${e.punish ? ' 응징' : ''}`, '#ff6b52', e.punish ? 22 : 18, 1.1);
        break;
      }
      case 'whiff': {
        const f = e.by;
        const p = poseOf(f, e.target, this.sim.time);
        txt(v3.add(p.tip, [0, 0, 0.15]), e.why === 'evade' ? '헛침 · 회피됨' : e.why === 'angle' ? '헛침 · 옆으로 빠짐' : '헛침', '#a9b0b8', 13);
        this.trails[f.side].whiff = true;
        break;
      }
      case 'break': {
        const f = e.target;
        this.fx.push({ k: 'broken', f, t: 0, life: e.dur });
        txt([f.x, f.y, 2.05], '균형 붕괴!', '#ff9a3c', 20, 1.2);
        this.shake = Math.max(this.shake, 0.16);
        break;
      }
      case 'evade':
        txt([e.by.x, e.by.y, 1.9], '회피', '#9fe0c0', 13, 0.6);
        break;
      case 'swing':
        this.trails[e.by.side].clear();
        this.trails[e.by.side].whiff = false;
        if (e.kind === 'riposte') txt([e.by.x, e.by.y, 2.0], e.by.atk.def.name, '#ffe3a0', 14, 0.7);
        break;
    }
  }

  sparks(at, rgb, n, speed) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const up = Math.random() * 1.6 - 0.3;
      const v = speed * (0.4 + Math.random() * 0.8);
      this.fx.push({ k: 'spark', p: [...at], v: [Math.cos(a) * v, Math.sin(a) * v, up * v], rgb, t: 0, life: 0.12 + Math.random() * 0.16 });
    }
  }

  // ------------------------------------------------------------------------------------------------ 그리기
  /** 카메라가 가려는 곳: 두 결투자의 가운데, 거리가 멀면 조금 멀리 (확대 s) */
  cameraTarget() {
    const [A, B] = this.sim.fighters;
    const sep = Math.hypot(A.x - B.x, A.y - B.y);
    const base = Math.max(1.8, Math.min(4.6, innerHeight / 215));
    const fit = (innerWidth * 0.62) / Math.max(1, sep * PX_M);
    return { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2, s: Math.min(base, Math.max(1.4, fit)) };
  }

  /** 카메라를 목표에 바로 (따라가기 보간·흔들림 없이) — 재시작 */
  snapCamera() {
    const t = this.cameraTarget();
    this.cam = { x: t.x, y: t.y, s: t.s };
    this.camS = worldToScreen(t.x, t.y, 0);
    this.shake = 0;
    this.shakeX = this.shakeY = 0;
  }

  render(dt) {
    const sim = this.sim;
    const ctx = this.ctx;
    this.time += dt;
    const [A, B] = sim.fighters;
    const tgt = this.cameraTarget();
    const k = Math.min(1, dt * 4);
    this.cam.x += (tgt.x - this.cam.x) * k;
    this.cam.y += (tgt.y - this.cam.y) * k;
    this.cam.s += (tgt.s - this.cam.s) * Math.min(1, dt * 2.5);
    this.camS = worldToScreen(this.cam.x, this.cam.y, 0);
    this.shake = Math.max(0, this.shake - dt);
    const sh = this.shake * 9;
    this.shakeX = sh ? (Math.random() - 0.5) * sh : 0;
    this.shakeY = sh ? (Math.random() - 0.5) * sh : 0;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#07080b';
    ctx.fillRect(0, 0, innerWidth, innerHeight);
    this.drawFloor(ctx);
    const now = sim.time;
    const poses = [poseOf(A, B, now), poseOf(B, A, now)];
    this.poses = poses;
    this.picks = sim.fighters.map((f) => (this.sprites && this.sprites.has(f) ? this.sprites.pick(f, poses[f.side], dt) : null));
    for (const f of sim.fighters) this.trails[f.side].sample(f, poses[f.side], this.time);
    if (this.debug) this.drawDebugFloor(ctx, poses);
    // 그림자·발밑 표시 (항상 몸보다 먼저)
    for (const f of sim.fighters) this.drawShadow(ctx, f);
    for (const e of this.fx) if (e.k === 'broken') this.drawBrokenRing(ctx, e);
    // 깊이 정렬: 몸·팔·검·잔광 (x + y가 클수록 앞)
    const items = [];
    for (const f of sim.fighters) this.collect(items, f, poses[f.side]);
    items.sort((a, b) => a.d - b.d);
    for (const it of items) it.draw(ctx);
    // 날 중심선을 한 번 더 위에 (옅게): 두 결투자가 화면에서 앞뒤로 겹쳐도 검과 접촉은 보이게
    ctx.globalAlpha = 0.5;
    ctx.lineCap = 'round';
    for (const f of sim.fighters) {
      if (f.dead) continue;
      const p = poses[f.side];
      const bl = this.bladeOf(f);
      if (bl) line2(ctx, bl[0], bl[1], Math.max(1.5, 0.026 * this.cam.s * PX_M), '#eaf6ff');
      else seg(ctx, this, p.bladeBase, p.tip, Math.max(1.5, 0.026 * this.cam.s * PX_M), '#eaf6ff');
    }
    ctx.globalAlpha = 1;
    this.drawFx(ctx, dt);
    if (this.debug) {
      for (const f of sim.fighters) if (this.picks[f.side]) this.drawPoseSkeleton(ctx, f, poses[f.side]);
      this.drawDebugText(ctx, poses);
    }
    for (let i = 0; i < 2; i++) this.flash[i] = Math.max(0, this.flash[i] - dt);
  }

  drawFloor(ctx) {
    const g = this.sim.ground;
    const h = g.half;
    const cs = g.corners().map(([x, y]) => this.P(x, y));
    // 경계 밖 (조금 밝은 띠) → 바닥
    const out = g.corners().map(([x, y]) => this.P(g.cx + (x - g.cx) * 1.08, g.cy + (y - g.cy) * 1.08));
    poly(ctx, out);
    ctx.fillStyle = '#15171c';
    ctx.fill();
    poly(ctx, cs);
    ctx.fillStyle = '#23272e';
    ctx.fill();
    // 1 m 격자 (디버그 그리드 수준의 옅은 선)
    ctx.strokeStyle = 'rgba(255,255,255,0.045)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = -h + 1; i < h; i++) {
      const [a, b] = [this.P(g.cx + i, g.cy - h), this.P(g.cx + i, g.cy + h)];
      const [c, d] = [this.P(g.cx - h, g.cy + i), this.P(g.cx + h, g.cy + i)];
      ctx.moveTo(...a);
      ctx.lineTo(...b);
      ctx.moveTo(...c);
      ctx.lineTo(...d);
    }
    ctx.stroke();
    // 경계선
    poly(ctx, cs);
    ctx.strokeStyle = 'rgba(255,170,90,0.55)';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 6]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  drawShadow(ctx, f) {
    const pk = this.picks[f.side];
    if (pk) {
      // 렌더의 그림자 패스 (주광 = 왼쪽 위 → 오른쪽 아래로 드리움): 겹마다 (바닥에 드리운 것이라 위 겹을 골반 높이로 옮긴 만큼은 옮기지 않는다)
      const [x, y] = this.P(f.x, f.y);
      ctx.globalAlpha = 0.62;
      for (const part of pk.parts) {
        const sh = part.fr.shadow;
        if (!sh || !sh.page) continue;
        const k = (sh.k || 1) * this.cam.s;
        ctx.drawImage(sh.page, sh.sx, sh.sy, sh.w, sh.h, x - sh.ox * k, y - sh.oy * k, sh.w * k, sh.h * k);
      }
      ctx.globalAlpha = 1;
    } else {
      const r = 0.34;
      ellipse(ctx, this, f.x, f.y, r);
      ctx.fillStyle = 'rgba(0,0,0,0.42)';
      ctx.fill();
    }
    // 발밑 고리: 누가 누구인지 (아나킨 청색, 오비완 모래색), 바라보는 방향 눈금
    ellipse(ctx, this, f.x, f.y, 0.46);
    ctx.strokeStyle = f.cast.persona === 'anakin' ? 'rgba(120,170,255,0.55)' : 'rgba(235,205,140,0.55)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    const a = this.P(f.x + Math.cos(f.facing) * 0.46, f.y + Math.sin(f.facing) * 0.46);
    const b = this.P(f.x + Math.cos(f.facing) * 0.62, f.y + Math.sin(f.facing) * 0.62);
    ctx.beginPath();
    ctx.moveTo(...a);
    ctx.lineTo(...b);
    ctx.stroke();
  }

  drawBrokenRing(ctx, e) {
    const f = e.f;
    if (f.state !== 'broken') return (e.t = e.life);
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 18);
    ellipse(ctx, this, f.x, f.y, 0.55 + pulse * 0.08);
    ctx.strokeStyle = `rgba(255,140,40,${0.55 + pulse * 0.4})`;
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  /** 스프라이트 프레임의 날: 화면 좌표 [칼자루 끝(날 시작), 검끝] (CSS px), 스프라이트가 없거나 쓰러져 검이 꺼졌으면 null */
  bladeOf(f) {
    const pk = this.picks[f.side];
    if (!pk) return null;
    const m = pk.blade.fr.markers;
    if (!m.saberBase || !m.saberTip) return null;
    const [x, y0] = this.P(f.x, f.y);
    const s = this.cam.s;
    const y = y0 + pk.blade.dy * s;
    return [
      [x + m.saberBase[0] * s, y + m.saberBase[1] * s],
      [x + m.saberTip[0] * s, y + m.saberTip[1] * s],
    ];
  }

  /** 스프라이트 결투자: 몸(시트 프레임)과 날 — 날은 몸에 가려지는 구간(b.saber 밖)을 몸보다 먼저, 보이는 구간을 나중에 */
  collectSprite(items, f, p, pk) {
    const c = f.cast;
    const self = this;
    const fr = pk.blade.fr;
    const S = this.cam.s * PX_M;
    const fl = this.flash[f.side];
    const bl = this.bladeOf(f);
    const lit = !(f.dead && f.koT >= 0.5);
    const trail = this.trails[f.side];
    const vis = fr.blades && fr.blades.saber ? fr.blades.saber : [[0, 1]];
    const blade = (ctx, a, b) => {
      const [r, g, bb] = c.blade;
      const at = (t) => [bl[0][0] + (bl[1][0] - bl[0][0]) * t, bl[0][1] + (bl[1][1] - bl[0][1]) * t];
      const p0 = at(a);
      const p1 = at(b);
      ctx.lineCap = 'round';
      ctx.globalCompositeOperation = 'lighter';
      line2(ctx, p0, p1, 0.2 * S, `rgba(${r},${g},${bb},0.16)`);
      line2(ctx, p0, p1, 0.1 * S, `rgba(${r},${g},${bb},0.42)`);
      ctx.globalCompositeOperation = 'source-over';
      line2(ctx, p0, p1, 0.032 * S, '#f4fbff');
    };
    const d = f.x + f.y;
    items.push({
      d,
      draw(ctx) {
        trail.draw(ctx, self, c.blade, S);
        if (bl && lit) blade(ctx, 0, 1); // (전체 — 몸에 가려질 구간은 아래 스프라이트가 덮는다)
        for (const part of pk.parts) self.drawSpriteFrame(ctx, f, part.fr, fl, part.dy);
        if (bl && lit) for (const [a, b] of vis) if (b - a > 0.02) blade(ctx, a, b);
      },
    });
    void p;
  }

  /** 시트 프레임 하나 (발 = 결투자 위치), 피격 직후엔 붉게 번쩍임 */
  drawSpriteFrame(ctx, f, fr, flash, shift = 0) {
    const k = (fr.k || 1) * this.cam.s;
    const [x, y0] = this.P(f.x, f.y);
    const y = y0 + shift * this.cam.s; // (위 겹: 아래 겹의 골반 높이로)
    const dx = x - fr.ox * k;
    const dy = y - fr.oy * k;
    const w = fr.w * k;
    const h = fr.h * k;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(fr.page, fr.sx, fr.sy, fr.w, fr.h, dx, dy, w, h);
    if (flash > 0) {
      const cv = this.tintCv || (this.tintCv = document.createElement('canvas'));
      if (cv.width < fr.w || cv.height < fr.h) (cv.width = Math.max(cv.width, fr.w)), (cv.height = Math.max(cv.height, fr.h));
      const tc = cv.getContext('2d');
      tc.clearRect(0, 0, cv.width, cv.height);
      tc.globalCompositeOperation = 'source-over';
      tc.drawImage(fr.page, fr.sx, fr.sy, fr.w, fr.h, 0, 0, fr.w, fr.h);
      tc.globalCompositeOperation = 'source-atop';
      tc.fillStyle = '#ff4a2a';
      tc.fillRect(0, 0, fr.w, fr.h);
      ctx.globalAlpha = Math.min(0.45, flash * 2.4);
      ctx.drawImage(cv, 0, 0, fr.w, fr.h, dx, dy, w, h);
      ctx.globalAlpha = 1;
    }
  }

  /** 디버그: 스프라이트 위에 pose.js의 자세(판정·접촉점이 쓰는 것)를 가는 선으로 — 프레임과 자세가 맞는지 */
  drawPoseSkeleton(ctx, f, p) {
    const S = this.cam.s * PX_M;
    ctx.globalAlpha = 0.75;
    ctx.lineCap = 'round';
    const w = Math.max(1, 0.012 * S);
    const col = '#7dffb0';
    for (const [a, b] of [
      [p.hipL, p.knees[0]], [p.knees[0], p.feet[0]], [p.hipR, p.knees[1]], [p.knees[1], p.feet[1]], [p.hips, p.chest], [p.chest, p.head],
      [p.shL, p.elbows[0]], [p.elbows[0], p.handL], [p.shR, p.elbows[1]], [p.elbows[1], p.hand], [p.shL, p.shR], [p.hipL, p.hipR],
    ])
      seg(ctx, this, a, b, w, col);
    seg(ctx, this, p.bladeBase, p.tip, w, '#ffe27d');
    ctx.globalAlpha = 1;
  }

  /** 한 결투자의 그릴 거리들 (깊이와 함께) */
  collect(items, f, p) {
    const pk = this.picks[f.side];
    if (pk) return this.collectSprite(items, f, p, pk);
    const c = f.cast;
    const S = this.cam.s * PX_M;
    const self = this;
    const bodyD = f.x + f.y;
    const fl = this.flash[f.side];
    const tint = (col) => (fl > 0 ? mixHex(col, '#ff4a2a', Math.min(1, fl * 4)) : col);
    const right = [-Math.sin(f.facing), Math.cos(f.facing), 0];
    const faceFront = Math.cos(f.facing) + Math.sin(f.facing) > -0.2; // 얼굴이 화면 쪽인가
    const down = f.dead ? Math.min(1, f.koT / 0.5) : 0;
    const fall = (q) => (down ? fallen(q, f, down) : q);
    const hipL = fall(p.hipL);
    const hipR = fall(p.hipR);
    const feet = p.feet.map(fall);
    const knees = p.knees.map(fall);
    const hips = fall(p.hips);
    const chest = fall(p.chest);
    const head = fall(p.head);
    const shL = fall(p.shL);
    const shR = fall(p.shR);
    const skirtLo = fall(v3.add(p.hips, [0, 0, -0.42]));
    const persona = c.persona;
    // 몸통 한 덩어리 (같은 깊이, 정해진 순서)
    items.push({
      d: bodyD,
      draw(ctx) {
        ctx.lineCap = 'round';
        // 다리: 엉덩이 → 무릎 → 디딘 발 (앞발 = 왼발)
        seg(ctx, self, hipL, knees[0], 0.12 * S, tint(c.tunic2));
        seg(ctx, self, knees[0], feet[0], 0.105 * S, tint(c.tunic2));
        seg(ctx, self, hipR, knees[1], 0.12 * S, tint(c.tunic2));
        seg(ctx, self, knees[1], feet[1], 0.105 * S, tint(c.tunic2));
        for (const ft of feet) dot(ctx, self, ft, 0.07 * S, '#121010');
        ctx.lineCap = 'butt';
        seg(ctx, self, hips, skirtLo, (persona === 'obiwan' ? 0.42 : 0.33) * S, tint(persona === 'obiwan' ? c.tunic : c.tunic2));
        ctx.lineCap = 'round';
        seg(ctx, self, hips, chest, (persona === 'obiwan' ? 0.33 : 0.3) * S, tint(c.tunic));
        if (persona === 'obiwan' && faceFront) seg(ctx, self, v3.add(hips, [0, 0, 0.04]), v3.add(chest, [0, 0, -0.02]), 0.11 * S, tint(c.tunic2)); // 겉옷 앞섶
        ctx.lineCap = 'butt';
        seg(ctx, self, v3.add(hips, [0, 0, 0.05]), v3.add(hips, [0, 0, 0.1]), (persona === 'obiwan' ? 0.33 : 0.3) * S, '#2a1d14'); // 허리띠
        ctx.lineCap = 'round';
        // 머리
        const hc = self.P(...head);
        const r = 0.12 * S;
        ctx.fillStyle = tint(c.skin);
        circle(ctx, hc, r);
        ctx.fillStyle = c.hair;
        if (faceFront) {
          // 이마·옆머리 (아나킨은 길고 덥수룩, 오비완은 짧게 + 수염)
          ctx.beginPath();
          ctx.arc(hc[0], hc[1] - r * 0.15, r * 1.04, Math.PI * 1.02, Math.PI * 1.98);
          ctx.fill();
          if (persona === 'anakin') {
            ctx.fillRect(hc[0] - r * 1.05, hc[1] - r * 0.3, r * 0.42, r * 1.25);
            ctx.fillRect(hc[0] + r * 0.63, hc[1] - r * 0.3, r * 0.42, r * 1.25);
          } else {
            ctx.beginPath();
            ctx.arc(hc[0], hc[1] + r * 0.42, r * 0.5, 0.15 * Math.PI, 0.85 * Math.PI);
            ctx.fill();
          }
        } else {
          circle(ctx, [hc[0], hc[1] - r * 0.05], r * 1.02);
          if (persona === 'anakin') ctx.fillRect(hc[0] - r, hc[1], r * 2, r * 1.15);
        }
      },
    });
    // 팔 (어깨 → 팔꿈치 → 손잡이를 쥔 손, 두 손): 손이 몸 뒤면 몸보다 먼저
    const hands = [fall(p.handL), fall(p.hand)];
    const elbows = p.elbows.map(fall);
    const sleeve = persona === 'obiwan' ? c.tunic : c.tunic2;
    [shL, shR].forEach((sh, i) => {
      const hd = hands[i];
      const d = (sh[0] + sh[1] + hd[0] + hd[1]) / 2;
      items.push({
        d: d + 0.001,
        draw(ctx) {
          ctx.lineCap = 'round';
          seg(ctx, self, sh, elbows[i], 0.09 * S, tint(sleeve));
          seg(ctx, self, elbows[i], hd, 0.08 * S, tint(sleeve));
          dot(ctx, self, hd, 0.05 * S, persona === 'anakin' ? '#121010' : c.skin);
        },
      });
    });
    // 광선검: 손잡이 + 날 (중심부 흰색, 바깥 빛)
    const base = fall(p.base);
    const bb = fall(p.bladeBase);
    const tip = fall(p.tip);
    const trail = this.trails[f.side];
    items.push({
      d: (bb[0] + bb[1] + tip[0] + tip[1]) / 4 + 0.002,
      draw(ctx) {
        trail.draw(ctx, self, c.blade, S);
        ctx.lineCap = 'round';
        seg(ctx, self, v3.add(base, v3.mul(p.dir, -0.1)), bb, 0.05 * S, '#9aa0a8');
        if (f.dead && down >= 1) return; // (쓰러지면 검이 꺼짐)
        const [r, g, b] = c.blade;
        ctx.globalCompositeOperation = 'lighter';
        seg(ctx, self, bb, tip, 0.2 * S, `rgba(${r},${g},${b},0.16)`);
        seg(ctx, self, bb, tip, 0.1 * S, `rgba(${r},${g},${b},0.42)`);
        ctx.globalCompositeOperation = 'source-over';
        seg(ctx, self, bb, tip, 0.032 * S, '#f4fbff');
      },
    });
  }

  drawFx(ctx, dt) {
    const S = this.cam.s * PX_M;
    ctx.globalCompositeOperation = 'lighter';
    for (const e of this.fx) {
      e.t += dt;
      const k = e.t / e.life;
      if (k >= 1) continue;
      if (e.k === 'spark') {
        const p0 = [...e.p];
        e.p = v3.add(e.p, v3.mul(e.v, dt));
        e.v[2] -= 9 * dt;
        const a = this.P(...p0);
        const b = this.P(...v3.add(e.p, v3.mul(e.v, 0.018)));
        ctx.strokeStyle = `rgba(${e.rgb[0]},${e.rgb[1]},${e.rgb[2]},${1 - k})`;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(...a);
        ctx.lineTo(...b);
        ctx.stroke();
      } else if (e.k === 'flash') {
        const c = this.P(...e.p);
        const r = e.r * S * (0.6 + k * 0.6);
        const gr = ctx.createRadialGradient(c[0], c[1], 0, c[0], c[1], r);
        gr.addColorStop(0, `rgba(255,255,255,${0.9 * (1 - k)})`);
        gr.addColorStop(0.3, `rgba(${e.rgb[0]},${e.rgb[1]},${e.rgb[2]},${0.6 * (1 - k)})`);
        gr.addColorStop(1, `rgba(${e.rgb[0]},${e.rgb[1]},${e.rgb[2]},0)`);
        ctx.fillStyle = gr;
        ctx.fillRect(c[0] - r, c[1] - r, r * 2, r * 2);
      } else if (e.k === 'ring') {
        const c = this.P(...e.p);
        const r = (e.r0 + (e.r1 - e.r0) * k) * S;
        ctx.strokeStyle = `rgba(${e.rgb[0]},${e.rgb[1]},${e.rgb[2]},${0.8 * (1 - k)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(c[0], c[1], r, r * 0.55, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    // 글자
    for (const e of this.fx) {
      if (e.k !== 'text' || e.t >= e.life) continue;
      const k = e.t / e.life;
      const c = this.P(e.p[0], e.p[1], e.p[2] + k * 0.35);
      ctx.font = `700 ${e.size}px 'Pretendard Variable', Pretendard, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.strokeText(e.s, c[0], c[1]);
      ctx.fillStyle = e.color;
      ctx.fillText(e.s, c[0], c[1]);
      ctx.globalAlpha = 1;
    }
    this.fx = this.fx.filter((e) => e.t < e.life);
  }

  // ------------------------------------------------------------------------------------------------ 디버그
  drawDebugFloor(ctx, poses) {
    const sim = this.sim;
    const now = sim.time;
    for (const f of sim.fighters) {
      // 방어 범위 (정면 반각): 방어 중 청색, 쳐내기 창 금색
      if (f.guardActive()) {
        const parry = f.parryActive(now);
        sector(ctx, this, f.x, f.y, f.facing, T.guard.arc, 0.95, parry ? 'rgba(255,210,90,0.35)' : 'rgba(90,160,255,0.18)', parry ? '#ffd25a' : 'rgba(120,180,255,0.7)');
      }
      // 공격 판정 범위: 준비 = 점선, 판정 = 붉게 채움
      const a = f.atk;
      if (f.state === 'attack' && a.phase !== 'recovery') {
        const act = a.phase === 'active';
        sector(ctx, this, f.x, f.y, f.facing, a.def.arc, a.def.reach, act ? 'rgba(255,60,40,0.28)' : null, act ? '#ff5a3c' : 'rgba(255,150,80,0.8)', !act);
      } else if (!f.dead) {
        sector(ctx, this, f.x, f.y, f.facing, f.attacks.light1.arc, f.attacks.light1.reach, null, 'rgba(255,255,255,0.12)', true);
      }
    }
    const [A, B] = sim.fighters;
    const a = this.P(A.x, A.y);
    const b = this.P(B.x, B.y);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(...a);
    ctx.lineTo(...b);
    ctx.stroke();
    ctx.setLineDash([]);
    const d = Math.hypot(A.x - B.x, A.y - B.y);
    ctx.font = "600 12px 'Share Tech Mono', monospace";
    ctx.fillStyle = d <= Math.max(A.attacks.light1.reach, B.attacks.light1.reach) ? '#ff9b7a' : '#cfd6de';
    ctx.textAlign = 'center';
    ctx.fillText(`${d.toFixed(2)} m`, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 6);
  }

  drawDebugText(ctx, poses) {
    const sim = this.sim;
    const now = sim.time;
    ctx.font = "600 11px 'Share Tech Mono', monospace";
    ctx.textAlign = 'center';
    for (const f of sim.fighters) {
      const c = this.P(f.x, f.y, 2.25);
      const lines = [describe(f, now)];
      lines.push(`HP ${f.hp.toFixed(0)}  BAL ${f.bal.toFixed(0)}`);
      if (f.parryActive(now)) lines.push(`쳐내기 창 ${(f.parryUntil - now).toFixed(2)}s`);
      const ai = this.ais && this.ais[f.side];
      if (ai) lines.push(`AI: ${ai.intentLabel} · 지연 ${ai.delay.toFixed(2)}s`);
      lines.forEach((l, i) => {
        const y = c[1] - (lines.length - 1 - i) * 13;
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,0.8)';
        ctx.strokeText(l, c[0], y);
        ctx.fillStyle = i === 0 ? '#ffffff' : '#c8d2dc';
        ctx.fillText(l, c[0], y);
      });
      // 접촉점 (최근)
      if (f.contact && now - f.contact.t < 0.6) {
        const q = this.P(...f.contact.at);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.strokeRect(q[0] - 3, q[1] - 3, 6, 6);
      }
    }
  }
}

/** 디버그·HUD용 상태 설명 */
export function describe(f, now) {
  const s = f.state;
  if (s === 'attack') {
    const a = f.atk;
    const ph = { windup: '준비', active: '판정', recovery: '회복' }[a.phase];
    const left = a.phase === 'windup' ? a.def.windup - a.t : a.phase === 'active' ? a.def.windup + a.def.active - a.t : a.def.recovery + (a.outcome === 'whiff' ? a.def.whiffExtra : 0) - a.recT;
    return `${a.def.name} · ${ph} ${Math.max(0, left).toFixed(2)}s${a.outcome ? ' · ' + a.outcome : ''}`;
  }
  const name = { ready: '자유', guard: '방어', dodge: '회피', blockstun: '막으며 밀림', parried: '쳐내짐', clash: '튕김', overpowered: '밀림', broken: '균형 붕괴', hitstun: '피격', dead: '쓰러짐' }[s];
  if (f.dur) return `${name} ${Math.max(0, f.dur - f.st).toFixed(2)}s`;
  if (s === 'dodge') return `${name}${f.invulnerable() ? ' · 무적' : ''}`;
  return name;
}

/** 휘두르는 동안의 날 궤적 (짧게 남는 잔광) */
class Trail {
  constructor() {
    this.pts = [];
    this.whiff = false;
  }
  clear() {
    this.pts = [];
  }
  sample(f, p, t) {
    const a = f.atk;
    const swingOn = f.state === 'attack' && a && (a.phase === 'active' || (a.phase === 'windup' && swingS(a.def, a.t) > 0) || (a.phase === 'recovery' && a.recT < 0.08 && a.outcome !== 'blocked'));
    if (swingOn) this.pts.push({ b: p.bladeBase, tip: p.tip, t });
    this.pts = this.pts.filter((q) => t - q.t < 0.11);
  }
  draw(ctx, view, rgb, S) {
    const pts = this.pts;
    if (pts.length < 2) return;
    const now = view.time;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const k = 1 - (now - b.t) / 0.11;
      if (k <= 0) continue;
      // (날의 바깥 절반만: 손·몸 쪽은 비워 둬 다음 동작과 발을 가리지 않게)
      const q = [view.P(...v3.lerp(a.b, a.tip, 0.5)), view.P(...a.tip), view.P(...b.tip), view.P(...v3.lerp(b.b, b.tip, 0.5))];
      poly(ctx, q);
      ctx.fillStyle = this.whiff ? `rgba(150,155,165,${0.2 * k})` : `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${0.22 * k})`;
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    void S;
  }
}

// ---------------------------------------------------------------------------------------------------- 도형
function poly(ctx, pts) {
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
  ctx.closePath();
}

function seg(ctx, view, a, b, w, color) {
  const p = view.P(...a);
  const q = view.P(...b);
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, w);
  ctx.beginPath();
  ctx.moveTo(p[0], p[1]);
  ctx.lineTo(q[0], q[1]);
  ctx.stroke();
}

function line2(ctx, p, q, w, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, w);
  ctx.beginPath();
  ctx.moveTo(p[0], p[1]);
  ctx.lineTo(q[0], q[1]);
  ctx.stroke();
}

function dot(ctx, view, a, r, color) {
  ctx.fillStyle = color;
  circle(ctx, view.P(...a), Math.max(1, r));
}

function circle(ctx, c, r) {
  ctx.beginPath();
  ctx.arc(c[0], c[1], r, 0, Math.PI * 2);
  ctx.fill();
}

function ellipse(ctx, view, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const p = view.P(x + Math.cos(a) * r, y + Math.sin(a) * r);
    i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]);
  }
  ctx.closePath();
}

function sector(ctx, view, x, y, facing, half, r, fill, stroke, dashed = false) {
  ctx.beginPath();
  const c = view.P(x, y);
  ctx.moveTo(c[0], c[1]);
  for (let i = 0; i <= 16; i++) {
    const a = facing - half + (2 * half * i) / 16;
    const p = view.P(x + Math.cos(a) * r, y + Math.sin(a) * r);
    ctx.lineTo(p[0], p[1]);
  }
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.5;
    if (dashed) ctx.setLineDash([5, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

/** 쓰러지는 자세: 발을 축으로 몸을 뒤로 눕힌다 */
function fallen(q, f, k) {
  const back = [-Math.cos(f.facing), -Math.sin(f.facing)];
  const z = q[2];
  const ang = (k * Math.PI) / 2.2;
  const dx = q[0] - f.x;
  const dy = q[1] - f.y;
  return [f.x + dx + back[0] * Math.sin(ang) * z, f.y + dy + back[1] * Math.sin(ang) * z, Math.max(0.05, z * Math.cos(ang))];
}

function mixHex(a, b, k) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (s) => Math.round(((pa >> s) & 255) * (1 - k) + ((pb >> s) & 255) * k);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}
