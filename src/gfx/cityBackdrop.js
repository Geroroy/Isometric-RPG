// Coruscant beyond the platforms' edges (docs/MAP_EDGES.md): what the camera sees past a rim is
// not a void but the city going on — tower tops and their facades in three depth layers sinking
// into the planet's air, drawn behind the terrain (which leaves the drop clear) with parallax so
// the deeper layers slide slower. The upper plaza looks out over a dusk haze with warm windows and
// red aircraft beacons (Attack of the Clones' chase, Revenge of the Sith's skyline); the undercity
// looks into smog, sparse windows and neon (The Clone Wars' lower levels). Each layer is one
// pre-drawn tileable canvas: a frame costs a gradient fill and a few drawImage calls.
import { RNG } from '../core/math.js';

const SIZE = 384;
const PAL = {
  up: {
    sky: ['#5a4352', '#2c2236', '#1a1524'],
    haze: [70, 54, 74],
    face: [[46, 44, 58], [32, 31, 44]], // lit face, shaded face
    roof: [60, 56, 70],
    win: [[255, 214, 150], [205, 225, 255], [255, 190, 120]],
    density: 0.42,
  },
  low: {
    sky: ['#17222a', '#0d1419', '#06090c'],
    haze: [20, 28, 34],
    face: [[24, 28, 32], [16, 19, 23]],
    roof: [30, 34, 38],
    win: [[255, 170, 80], [140, 255, 170], [255, 90, 180], [120, 220, 255]],
    density: 0.2,
  },
};
// far → near: parallax factor, tower half-width range, haze mix, count
const LAYERS = [
  { f: 0.1, hw: [5, 11], haze: 0.72, n: 70, len: 70 },
  { f: 0.22, hw: [9, 18], haze: 0.48, n: 34, len: 120 },
  { f: 0.38, hw: [15, 28], haze: 0.24, n: 16, len: 190 },
];

const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function tower(x, cx, cy, hw, L, P, haze, rng) {
  const hh = hw / 2;
  const faces = [
    // left face (lit), right face (shaded)
    { pts: [[cx - hw, cy], [cx, cy + hh], [cx, cy + hh + L], [cx - hw, cy + L]], c: P.face[0] },
    { pts: [[cx, cy + hh], [cx + hw, cy], [cx + hw, cy + L], [cx, cy + hh + L]], c: P.face[1] },
  ];
  for (const f of faces) {
    const top = mix(f.c, P.haze, haze);
    const g = x.createLinearGradient(0, cy, 0, cy + L);
    g.addColorStop(0, rgb(top));
    g.addColorStop(1, rgb(P.haze, 0));
    x.fillStyle = g;
    x.beginPath();
    x.moveTo(...f.pts[0]);
    for (const p of f.pts.slice(1)) x.lineTo(...p);
    x.closePath();
    x.fill();
  }
  // windows: dots in rows down both faces, thinning with depth
  const step = Math.max(2, Math.round(hw / 5));
  for (let side = 0; side < 2; side++) {
    for (let d = 4; d < L * 0.7; d += 3) {
      for (let u = 1; u < hw - 1; u += step) {
        if (rng.next() > P.density * (1 - d / L)) continue;
        const wx = side ? cx + u : cx - hw + u;
        const wy = (side ? cy + hh - (u * hh) / hw : cy + (u * hh) / hw) + d;
        const c = P.win[(rng.next() * P.win.length) | 0];
        x.fillStyle = rgb(mix(c, P.haze, haze * 0.6), 0.55 + 0.45 * (1 - d / L));
        x.fillRect(Math.round(wx), Math.round(wy), 1, 1);
      }
    }
  }
  // the roof, a rim of light, sometimes a spire, a red beacon
  x.fillStyle = rgb(mix(P.roof, P.haze, haze));
  x.beginPath();
  x.moveTo(cx - hw, cy);
  x.lineTo(cx, cy - hh);
  x.lineTo(cx + hw, cy);
  x.lineTo(cx, cy + hh);
  x.closePath();
  x.fill();
  x.strokeStyle = rgb(mix([150, 140, 150], P.haze, haze), 0.6);
  x.lineWidth = 1;
  x.beginPath();
  x.moveTo(cx - hw, cy + 0.5);
  x.lineTo(cx, cy + hh + 0.5);
  x.lineTo(cx + hw, cy + 0.5);
  x.stroke();
  if (rng.next() < 0.3) {
    const sh = hw * (1.5 + rng.next() * 2);
    x.fillStyle = rgb(mix(P.face[1], P.haze, haze));
    x.fillRect(Math.round(cx - 1), Math.round(cy - sh), 2, Math.round(sh));
    x.fillStyle = 'rgba(255,60,50,0.95)';
    x.fillRect(Math.round(cx - 1), Math.round(cy - sh - 1), 2, 2);
  } else if (rng.next() < 0.5) {
    x.fillStyle = 'rgba(255,60,50,0.9)';
    x.fillRect(Math.round(cx - hw + 2), Math.round(cy - 1), 1, 1);
  }
}

const cache = new Map();
function layerCanvas(mode, li) {
  const key = mode + li;
  let c = cache.get(key);
  if (c) return c;
  const P = PAL[mode];
  const L = LAYERS[li];
  c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const x = c.getContext('2d');
  const rng = new RNG(97 + li * 31 + (mode === 'low' ? 7 : 0));
  const list = [];
  for (let i = 0; i < L.n; i++) list.push({ cx: rng.next() * SIZE, cy: rng.next() * SIZE, hw: L.hw[0] + rng.next() * (L.hw[1] - L.hw[0]), len: L.len * (0.6 + rng.next() * 0.6) });
  list.sort((a, b) => a.cy - b.cy); // farther (higher on screen) first
  for (const t of list)
    for (const dx of [-SIZE, 0, SIZE])
      for (const dy of [-SIZE, 0, SIZE]) {
        const cx = t.cx + dx;
        const cy = t.cy + dy;
        if (cx + t.hw < 0 || cx - t.hw > SIZE || cy + t.len < 0 || cy - t.hw * 4 > SIZE) continue;
        tower(x, cx, cy, t.hw, t.len, P, L.haze, new RNG(Math.floor(t.cx * 7 + t.cy)));
      }
  cache.set(key, c);
  return c;
}

let skyKey = '';
let sky = null;
/** The backdrop for the visible screen: `mode` 'up' (the plaza's dusk) or 'low' (the undercity's smog). */
export function drawCityBackdrop(ctx, cam, W, H, mode) {
  const P = PAL[mode];
  if (skyKey !== mode + H) {
    sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, P.sky[0]);
    sky.addColorStop(0.55, P.sky[1]);
    sky.addColorStop(1, P.sky[2]);
    skyKey = mode + H;
  }
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  for (let li = 0; li < LAYERS.length; li++) {
    const c = layerCanvas(mode, li);
    const f = LAYERS[li].f;
    const ox = -((((cam.x * f) % SIZE) + SIZE) % SIZE);
    const oy = -((((cam.y * f) % SIZE) + SIZE) % SIZE);
    for (let y = oy; y < H; y += SIZE) for (let x = ox; x < W; x += SIZE) ctx.drawImage(c, Math.round(x), Math.round(y));
  }
}
