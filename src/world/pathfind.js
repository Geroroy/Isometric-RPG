// A* on the tile grid (8-way, no corner cutting) + line-of-sight smoothing.

class Heap {
  constructor() {
    this.items = [];
    this.prio = [];
  }
  get size() {
    return this.items.length;
  }
  push(item, p) {
    const it = this.items;
    const pr = this.prio;
    it.push(item);
    pr.push(p);
    let i = it.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (pr[parent] <= pr[i]) break;
      [it[i], it[parent]] = [it[parent], it[i]];
      [pr[i], pr[parent]] = [pr[parent], pr[i]];
      i = parent;
    }
  }
  pop() {
    const it = this.items;
    const pr = this.prio;
    const top = it[0];
    const lastI = it.pop();
    const lastP = pr.pop();
    if (it.length) {
      it[0] = lastI;
      pr[0] = lastP;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < it.length && pr[l] < pr[m]) m = l;
        if (r < it.length && pr[r] < pr[m]) m = r;
        if (m === i) break;
        [it[i], it[m]] = [it[m], it[i]];
        [pr[i], pr[m]] = [pr[m], pr[i]];
        i = m;
      }
    }
    return top;
  }
}

const DIRS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

export class PathFinder {
  constructor(world) {
    this.world = world;
    const n = world.w * world.h;
    this.g = new Float32Array(n);
    this.from = new Int32Array(n);
    this.stamp = new Uint32Array(n);
    this.closed = new Uint32Array(n);
    this.cur = 1;
  }

  free(tx, ty) {
    const w = this.world;
    return tx >= 0 && ty >= 0 && tx < w.w && ty < w.h && w.blocked[ty * w.w + tx] === 0;
  }

  /** Nearest walkable tile to (tx, ty) within a small radius. */
  nearestFree(tx, ty, maxR = 6) {
    if (this.free(tx, ty)) return [tx, ty];
    for (let r = 1; r <= maxR; r++) {
      let best = null;
      let bd = Infinity;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (this.free(tx + dx, ty + dy)) {
            const d = dx * dx + dy * dy;
            if (d < bd) {
              bd = d;
              best = [tx + dx, ty + dy];
            }
          }
        }
      }
      if (best) return best;
    }
    return null;
  }

  /** Returns array of {x, y} waypoints (tile centers, last = exact goal) or null. */
  find(sx, sy, gx, gy, maxNodes = 9000) {
    const W = this.world.w;
    let s = [Math.floor(sx), Math.floor(sy)];
    if (!this.free(s[0], s[1])) s = this.nearestFree(s[0], s[1], 2) || s;
    const goal = this.nearestFree(Math.floor(gx), Math.floor(gy));
    if (!goal) return null;
    const exactGoal = goal[0] === Math.floor(gx) && goal[1] === Math.floor(gy);
    const gxT = goal[0];
    const gyT = goal[1];
    const id = ++this.cur;
    const start = s[1] * W + s[0];
    const target = gyT * W + gxT;
    const heap = new Heap();
    const h = (x, y) => {
      const dx = Math.abs(x - gxT);
      const dy = Math.abs(y - gyT);
      return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy);
    };
    this.g[start] = 0;
    this.stamp[start] = id;
    this.from[start] = -1;
    heap.push(start, h(s[0], s[1]));
    let found = start === target;
    let bestNode = start;
    let bestH = h(s[0], s[1]);
    let count = 0;
    while (heap.size && !found) {
      const cur = heap.pop();
      if (this.closed[cur] === id) continue;
      this.closed[cur] = id;
      if (++count > maxNodes) break;
      const cx = cur % W;
      const cy = (cur / W) | 0;
      for (const [dx, dy, cost] of DIRS) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (!this.free(nx, ny)) continue;
        if (dx && dy && (!this.free(cx + dx, cy) || !this.free(cx, cy + dy))) continue;
        const ni = ny * W + nx;
        if (this.closed[ni] === id) continue;
        const ng = this.g[cur] + cost;
        if (this.stamp[ni] !== id || ng < this.g[ni]) {
          this.stamp[ni] = id;
          this.g[ni] = ng;
          this.from[ni] = cur;
          const hh = h(nx, ny);
          if (hh < bestH) {
            bestH = hh;
            bestNode = ni;
          }
          if (ni === target) {
            found = true;
            break;
          }
          heap.push(ni, ng + hh);
        }
      }
    }
    const end = found ? target : bestNode;
    const tiles = [];
    for (let n = end; n !== -1; n = this.from[n]) {
      tiles.push({ x: (n % W) + 0.5, y: ((n / W) | 0) + 0.5 });
      if (n === start) break;
    }
    tiles.reverse();
    if (found && exactGoal) tiles[tiles.length - 1] = { x: gx, y: gy };
    return this.smooth(sx, sy, tiles);
  }

  smooth(sx, sy, pts) {
    if (pts.length <= 1) return pts;
    const out = [];
    let ax = sx;
    let ay = sy;
    let i = 0;
    while (i < pts.length) {
      let j = pts.length - 1;
      while (j > i && !this.lineFree(ax, ay, pts[j].x, pts[j].y)) j--;
      out.push(pts[j]);
      ax = pts[j].x;
      ay = pts[j].y;
      i = j + 1;
    }
    return out;
  }

  /** Walkability along a segment, sampled with clearance for unit radius. */
  lineFree(ax, ay, bx, by, r = 0.3) {
    const d = Math.hypot(bx - ax, by - ay);
    const steps = Math.ceil(d / 0.25);
    const nx = d ? -(by - ay) / d : 0;
    const ny = d ? (bx - ax) / d : 0;
    for (let i = 0; i <= steps; i++) {
      const t = steps ? i / steps : 0;
      const x = ax + (bx - ax) * t;
      const y = ay + (by - ay) * t;
      if (this.world.isBlocked(x + nx * r, y + ny * r) || this.world.isBlocked(x - nx * r, y - ny * r)) return false;
    }
    return true;
  }
}
