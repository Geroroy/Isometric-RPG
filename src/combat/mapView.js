// 맵 위의 결투 그리기 (무스타파 맵 결투 game/mapDuel.js): 시험장의 그리기(view.js CombatView)를 그대로 쓰되, 바닥·카메라는
// 맵 렌더러(gfx/renderer.js)의 것이다. 렌더러가 부르는 세 자리:
//   drawShadows(ctx)   그림자·발밑 고리 — 맵 유닛의 그림자 다음, 서 있는 것들보다 먼저
//   items(depthOf)     몸·검(몸에 가리는 구간 포함) — 소품·유닛과 같은 깊이 정렬 목록에 들어간다 (depthOf: 렌더러의 unitDepth)
//   drawGlow(ctx, dt)  빛 지도(조명) 뒤: 날 중심선·불꽃·글자 — 어두운 맵에서도 검과 접촉이 보이게
// 좌표는 렌더러와 같은 게임 px (카메라 = renderer.cam, 1 게임 px = 1 단위: cam.s = 1).
import { worldToScreen } from '../core/iso.js';
import { CombatView } from './view.js';
import { poseOf } from './pose.js';

export class MapCombatView extends CombatView {
  constructor(sim, renderer) {
    super(null, sim);
    this.r = renderer;
    this.cam = { x: 0, y: 0, s: 1 };
    this.shakeX = this.shakeY = 0;
  }

  /** 재시작('reset' 사건): 시험장 카메라(cameraTarget의 확대 s 1.4~4.6)로 바꾸지 않는다 — 맵의 카메라는 렌더러 것이고
   *  여기 s는 늘 1이다. 흔들림만 멈춘다. (덮어쓰면 다시 하기 뒤 결투자가 맵보다 몇 배 크게 그려졌다) */
  snapCamera() {
    this.shake = 0;
    this.shakeX = this.shakeY = 0;
  }

  P(x, y, z = 0) {
    const s = worldToScreen(x, y, z);
    return [s.x - this.r.cam.x, s.y - this.r.cam.y];
  }

  /** 이번 화면의 자세·스프라이트 프레임·잔광 (렌더러가 그리기 전에 한 번) */
  frame(dt) {
    const sim = this.sim;
    const [A, B] = sim.fighters;
    const now = sim.time;
    this.time += dt;
    this.poses = [poseOf(A, B, now), poseOf(B, A, now)];
    this.picks = sim.fighters.map((f) => (this.sprites && this.sprites.has(f) ? this.sprites.pick(f, this.poses[f.side], dt, now) : null));
    for (const f of sim.fighters) this.trails[f.side].sample(f, this.poses[f.side], this.time);
    for (let i = 0; i < 2; i++) this.flash[i] = Math.max(0, this.flash[i] - dt);
    this.textK = 1 / Math.max(0.5, this.r.scale || 1);
  }

  drawShadows(ctx) {
    for (const f of this.sim.fighters) this.drawShadow(ctx, f);
    for (const e of this.fx) if (e.k === 'broken') this.drawBrokenRing(ctx, e);
  }

  /** 서 있는 그릴 거리들: [{ depth, draw(ctx) }] — 한 결투자의 몸·팔·검은 그 사람의 깊이 근처에 정해진 순서로 */
  items(depthOf) {
    const out = [];
    for (const f of this.sim.fighters) {
      const its = [];
      this.collect(its, f, this.poses[f.side]);
      const base = depthOf(f) - (f.x + f.y);
      for (const it of its) out.push({ depth: it.d + base, draw: (ctx) => this.drawItem(ctx, it) });
    }
    return out;
  }

  drawItem(ctx, it) {
    const sm = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = true; // (2배 밀도 시트를 줄여 그림)
    it.draw(ctx);
    ctx.imageSmoothingEnabled = sm;
  }

  drawGlow(ctx, dt) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    this.drawBladeCores(ctx, 0.6);
    this.drawFx(ctx, dt);
    ctx.restore();
  }
}
