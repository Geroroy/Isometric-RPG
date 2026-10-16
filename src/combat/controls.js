// 키보드·마우스 → 결투 명령 (fighter.js ingest와 같은 형식: AI도 같은 명령을 낸다).
//   WASD 이동 (화면 방향 그대로: W = 화면 위) · 좌클릭 공격 · 우클릭 유지 방어 (공격이 닿기 직전 새로 누르면 쳐내기)
//   Space + 방향 회피 (방향 없으면 뒷걸음) · F 강공격
// 누른 순간(edge)은 다음 시뮬레이션 틱에 한 번만 전달된다 (타격 정지 중이어도 잃지 않음: sim.js).
import { screenToWorld } from '../core/iso.js';

const KEYS = { KeyW: [0, -1], KeyA: [-1, 0], KeyS: [0, 1], KeyD: [1, 0] };

/** 화면 방향 벡터 → 바닥 월드 단위 벡터 (대각선도 길이 1: 속도 정규화) */
export function screenDirToWorld(sx, sy) {
  if (!sx && !sy) return { x: 0, y: 0 };
  const w = screenToWorld(sx, sy);
  const l = Math.hypot(w.x, w.y) || 1;
  return { x: w.x / l, y: w.y / l };
}

export class PlayerController {
  constructor(target = window) {
    this.held = new Set();
    this.guard = false;
    this.edges = { attack: false, heavy: false, dodge: false, guardPressed: false };
    this.enabled = true;
    target.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (KEYS[e.code]) this.held.add(e.code);
      if (e.code === 'Space') (this.edges.dodge = true), e.preventDefault();
      if (e.code === 'KeyF') this.edges.heavy = true;
    });
    target.addEventListener('keyup', (e) => this.held.delete(e.code));
    target.addEventListener('mousedown', (e) => {
      if (e.target && e.target.closest && e.target.closest('button, a, .no-input')) return;
      if (e.button === 0) this.edges.attack = true;
      if (e.button === 2) {
        this.guard = true;
        this.edges.guardPressed = true;
      }
    });
    target.addEventListener('mouseup', (e) => {
      if (e.button === 2) this.guard = false;
    });
    target.addEventListener('contextmenu', (e) => e.preventDefault());
    target.addEventListener('blur', () => {
      this.held.clear();
      this.guard = false;
    });
  }

  /** 화면 기준 이동 입력 (정규화 전) */
  screenMove() {
    let x = 0;
    let y = 0;
    for (const c of this.held) {
      x += KEYS[c][0];
      y += KEYS[c][1];
    }
    return [x, y];
  }

  reset() {
    for (const k in this.edges) this.edges[k] = false;
  }

  command() {
    const [sx, sy] = this.screenMove();
    const cmd = { move: screenDirToWorld(sx, sy), guard: this.enabled && this.guard, ...this.edges };
    if (!this.enabled) for (const k in this.edges) cmd[k] = false;
    for (const k in this.edges) this.edges[k] = false;
    if (!cmd.guard) cmd.guardPressed = false;
    return cmd;
  }
}
