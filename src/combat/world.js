// 결투의 바닥: sim.js가 쓰는 것은 move(x, y, dx, dy, r) → { x, y } 하나뿐이다 (거리·충돌은 바닥의 월드 좌표, m).
//   ArenaGround      독립 시험장: 장식 없는 정사각형 바닥과 단순한 경계 (맵 에셋 없이 실행)
//   groundFromTiles  실제 맵 연결용: 타일 맵의 isBlocked(x, y)를 감싼다 (world/worldgen.js·mustafarStage.js의 World가
//                    가진 것) — 축마다 따로 막아 벽을 따라 미끄러진다 (game/units.js Unit.move와 같은 방식)

export class ArenaGround {
  constructor(cx = 0, cy = 0, half = 7) {
    this.cx = cx;
    this.cy = cy;
    this.half = half;
  }

  move(x, y, dx, dy, r) {
    const h = this.half - r;
    const cl = (v, c) => Math.max(c - h, Math.min(c + h, v));
    return { x: cl(x + dx, this.cx), y: cl(y + dy, this.cy) };
  }

  /** 경계의 네 모서리 (그리기용) */
  corners() {
    const { cx, cy, half: h } = this;
    return [
      [cx - h, cy - h],
      [cx + h, cy - h],
      [cx + h, cy + h],
      [cx - h, cy + h],
    ];
  }
}

/** 타일 맵(isBlocked(x, y) — 1 타일 = 1 m)을 결투 바닥으로 */
export function groundFromTiles(isBlocked) {
  const hits = (x, y, r) => isBlocked(x + r, y) || isBlocked(x - r, y) || isBlocked(x, y + r) || isBlocked(x, y - r);
  return {
    move(x, y, dx, dy, r) {
      const k = r * 0.85;
      if (!hits(x + dx, y, k)) x += dx;
      if (!hits(x, y + dy, k)) y += dy;
      return { x, y };
    },
  };
}
