// Lightsaber looks, measured from the reference footage (docs/SABER_STYLE.md, tools/qa/saberprofile.py):
// two trail styles (Clone Wars / the films) and two palettes (Clone Wars / Revenge of the Sith),
// picked separately; four blade colours (blue, red, green, purple) in each. Glows are pre-drawn sprites (no shadowBlur); trails are polygons.
// Every saber in the game is drawn here (renderer.drawSabers); the light the blades throw on the
// floor and on characters is saberLight.js.

const STORE = 'cw.saber';
// len / glow: the settings card's sliders (trail length, glow strength); slow: 1/4 game speed
// (to look at the trails; never kept)
export const SABER = { trail: 'tcw', palette: 'tcw', len: 1, glow: 1, slow: false };
try {
  Object.assign(SABER, JSON.parse(localStorage.getItem(STORE) || '{}'), { slow: false });
} catch {}

/** Change a setting (trail, palette, len, glow, slow) and keep it on this device. */
export function setSaberOpt(key, value) {
  SABER[key] = value;
  try {
    localStorage.setItem(STORE, JSON.stringify({ ...SABER, slow: false })); // slow motion is not kept
  } catch {}
}

export const TRAIL_NAMES = { tcw: '클론워즈 (셀 셰이딩)', movie: '영화 (모션 블러)' };
export const PALETTE_NAMES = { tcw: '클론워즈', rots: '시스의 복수' };

// Colours sampled from the references (1280 px wide frames): the white core, then the colour
// 1-2 px, 2-4 px, 4-8 px and 8-16 px outside it. Only blue and red are in the footage (the
// Revenge of the Sith clip has blue only; its red follows the Clone Wars red's ring pattern);
// green and purple are built on the same pattern at their own hues (green 120-135°, purple
// 275-285°, well away from blue's 210-226°) so the four read apart at a glance.
// coreW: the white core's line width (the films' palette keeps it thinner).
export const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
export const PALETTES = {
  tcw: {
    blue: { core: '#f8fafe', rim: '#3475e1', inner: '#0946bb', glow: '#0c3295', halo: '#09287c' },
    red: { core: '#fefbfa', rim: '#d92c42', inner: '#a40738', glow: '#790e35', halo: '#621234' },
    green: { core: '#f8fef8', rim: '#4fe06a', inner: '#13a53a', glow: '#0c7a2a', halo: '#0a5a22' },
    purple: { core: '#fcf8fe', rim: '#b56ae8', inner: '#7a2fbf', glow: '#561f8c', halo: '#431a6e' },
  },
  rots: {
    // the footage's rings (#a7bbf8 → #423ca6) drift to 243° (lavender) under the bloom; these keep
    // the hue at 212-222° and the rings saturated (lightness 68 → 58 → 48 → 32 %), with a
    // thinner white core — the same pattern for the other three hues (red 6°, green 126°, purple 272°)
    blue: { core: '#ffffff', rim: '#5aa0ff', inner: '#2b78ff', glow: '#1650e0', halo: '#0f338f', coreW: 1.0 },
    red: { core: '#fff6f2', rim: '#ff5a48', inner: '#f52a14', glow: '#c0160a', halo: '#7a0d07', coreW: 1.0 },
    green: { core: '#ffffff', rim: '#5cf06a', inner: '#22cc3e', glow: '#139a2c', halo: '#0c6a1e', coreW: 1.0 },
    purple: { core: '#fff2ff', rim: '#c070ff', inner: '#9a3cff', glow: '#7220d8', halo: '#4c148f', coreW: 1.0 },
  },
};

/**
 * The named hue of a saber colour ([r, g, b]): 'blue', 'red', 'green', 'purple', or null for
 * anything else (the palettes and the light's tints are keyed by it).
 */
export function hueOf(rgb) {
  const [r, g, b] = rgb;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  if (mx - mn < 40) return null; // grey / white
  let h = mx === r ? ((g - b) / (mx - mn)) % 6 : mx === g ? (b - r) / (mx - mn) + 2 : (r - g) / (mx - mn) + 4;
  h = ((h * 60) % 360 + 360) % 360;
  if (h < 25 || h >= 330) return 'red';
  if (h >= 70 && h < 170) return 'green';
  if (h >= 185 && h < 252) return 'blue';
  if (h >= 252 && h < 322) return 'purple';
  return null;
}

/**
 * The trail styles, from the frame-by-frame comparison (24 fps footage; the game's swings run
 * at 22-23 fps):
 *  tcw   — cel-shaded: hard-edged layers (white core, coloured band, glow band), the last
 *          ~2.5 frames of the sweep; a crescent that narrows towards its tail; when the blade
 *          stops the tail catches up (it shrinks and thins, it does not fade). Tight glow.
 *  movie — motion blur: the latest move only, a smooth gradient (brightest at the blade),
 *          wide soft bloom, gone almost as soon as the blade stops; a slight shimmer.
 * window: seconds of sweep kept; taper: how far the tail end narrows towards the tip (0-1);
 * glowW: glow sprite width (px across the blade); outline: the dark edge under the blade.
 */
export const TRAILS = {
  tcw: { window: 0.11, taper: 0.8, glowW: 7, glowA: 0.9, outline: 0.55, flicker: 0, clash: 'star' },
  movie: { window: 0.07, taper: 0.55, glowW: 13, glowA: 0.85, outline: 0.3, flicker: 0.06, clash: 'bloom' },
};

/** Seconds of sweep a trail keeps (the style's, times the test card's length slider). */
export function trailWindow() {
  return (TRAILS[SABER.trail] || TRAILS.tcw).window * (SABER.len || 1);
}

/**
 * The palette entry for a unit's saber colour: the chosen palette's blue, red, green or purple
 * (hueOf), any other colour a palette made from the colour itself the same way (white core, the
 * colour as the rim, darker rings out) — so every blade is its own colour.
 */
const derived = new Map();
export function paletteFor(rgb) {
  const name = hueOf(rgb);
  if (name) {
    const p = PALETTES[SABER.palette] || PALETTES.tcw;
    return p[name] || PALETTES.tcw[name];
  }
  const [r, g, b] = rgb;
  const key = (r << 16) | (g << 8) | b;
  let p = derived.get(key);
  if (!p) {
    const h = (k) => '#' + rgb.map((v) => Math.round(Math.min(255, v * k)).toString(16).padStart(2, '0')).join('');
    const core = '#' + rgb.map((v) => Math.round(235 + (v / 255) * 20).toString(16).padStart(2, '0')).join('');
    derived.set(key, (p = { core, rim: h(1), inner: h(0.72), glow: h(0.52), halo: h(0.4) }));
  }
  return p;
}

/**
 * The blade's shimmer at `time` (× brightness): the films' style only, ±6 % at two rates. The
 * blade and the light it throws (saberLight.js) both take it, so they flicker together.
 */
export function flickerAt(time) {
  const fl = (TRAILS[SABER.trail] || TRAILS.tcw).flicker;
  return fl ? 1 + fl * (Math.sin(time * 61) * 0.6 + Math.sin(time * 23.7) * 0.4) : 1;
}

// ---------------------------------------------------------------------------- glow sprites

// One sprite per style and palette entry: the blade's whole glow (the 1-2, 2-4, 4-8 and 8-16 px
// rings round the core) in one horizontal capsule, drawn stretched and rotated along the blade —
// one drawImage per blade. Clone Wars: the rings as hard steps (cel bands); films: one smooth
// falloff, wider. Additive ('screen'): light on any floor, never clipped to flat white.
const SPR_W = 64;
const SPR_H = 32;
const sprites = new Map();
function glowSprite(pal, style) {
  const key = style + pal.rim;
  let c = sprites.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = SPR_W;
  c.height = SPR_H;
  const x = c.getContext('2d');
  const img = x.createImageData(SPR_W, SPR_H);
  const rings = [pal.rim, pal.inner, pal.glow, pal.halo].map(hex);
  const h = SPR_H / 2;
  const capX = h; // round ends as wide as the strip is high
  for (let py = 0; py < SPR_H; py++) {
    for (let px = 0; px < SPR_W; px++) {
      const dx = px < capX ? capX - px - 0.5 : px >= SPR_W - capX ? px - (SPR_W - capX) + 0.5 : 0;
      const d = Math.min(1, Math.hypot(dx, py + 0.5 - h) / h); // 0 at the blade, 1 at the edge
      let col;
      let a;
      if (style === 'tcw') {
        // four hard bands (1-2 / 2-4 / 4-8 / 8-16 px), alpha stepping down
        const i = d < 0.16 ? 0 : d < 0.34 ? 1 : d < 0.6 ? 2 : 3;
        col = rings[i];
        a = [0.95, 0.7, 0.42, 0.18][i] * (d > 0.94 ? 0 : 1);
      } else {
        // a smooth falloff through the same colours
        const t = d * 3;
        const i = Math.min(2, Math.floor(t));
        const f = t - i;
        col = rings[i].map((v, k) => v + (rings[i + 1][k] - v) * f);
        a = Math.pow(1 - d, 1.6);
      }
      const o = (py * SPR_W + px) * 4;
      img.data[o] = col[0];
      img.data[o + 1] = col[1];
      img.data[o + 2] = col[2];
      img.data[o + 3] = 255 * a;
    }
  }
  x.putImageData(img, 0, 0);
  sprites.set(key, c);
  return c;
}

// ---------------------------------------------------------------------------- blade

/**
 * The blade: a dark coloured edge under it (normal blend: keeps it readable on a bright floor),
 * the glow sprite (screen), the coloured rim and the white core (lines).
 */
export function drawBlade(ctx, x1, y1, x2, y2, pal, k, time) {
  const st = TRAILS[SABER.trail] || TRAILS.tcw;
  const fl = flickerAt(time);
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const prev = ctx.globalCompositeOperation;
  // the edge (a 3 px line in the 8-16 px colour)
  ctx.globalCompositeOperation = 'source-over';
  ctx.lineCap = 'round';
  ctx.globalAlpha = st.outline;
  ctx.strokeStyle = pal.halo;
  ctx.lineWidth = 3.4;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  // the glow: one sprite along the blade
  const w = st.glowW;
  const c = dx / len;
  const s = dy / len;
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = Math.min(1, st.glowA * k * fl * (SABER.glow || 1));
  ctx.setTransform(c, s, -s, c, x1, y1);
  ctx.drawImage(glowSprite(pal, SABER.trail), -w / 2, -w / 2, len + w, w);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = pal.rim;
  ctx.lineWidth = 2.4;
  ctx.stroke();
  ctx.strokeStyle = pal.core;
  ctx.lineWidth = pal.coreW || 1.3;
  ctx.stroke();
  ctx.lineCap = 'butt';
  ctx.globalCompositeOperation = prev;
}

// ---------------------------------------------------------------------------- trails

/**
 * Blade positions over time (world px), one entry each time the sprite's blade moves. The
 * sweep between two entries is taken as a turn round the hilt (so the outer edge curves).
 */
export function record(hist, bx, by, tx, ty, now) {
  const L = hist[hist.length - 1];
  if (L && L.bx === bx && L.by === by && L.tx === tx && L.ty === ty) return;
  hist.push({ bx, by, tx, ty, t: now });
  while (hist.length > 8) hist.shift();
}

function at(hist, time, out) {
  // the blade at `time`: between two recorded poses, turning round the hilt
  let i = hist.length - 1;
  while (i > 0 && hist[i - 1].t > time) i--;
  const B = hist[i];
  const A = hist[i - 1];
  if (!A || time >= B.t) {
    out.bx = B.bx;
    out.by = B.by;
    out.tx = B.tx;
    out.ty = B.ty;
    return out;
  }
  // the move into pose B happened over [A.t, B.t]
  const u = Math.max(0, Math.min(1, (time - A.t) / Math.max(1e-3, B.t - A.t)));
  const aa = Math.atan2(A.ty - A.by, A.tx - A.bx);
  let ab = Math.atan2(B.ty - B.by, B.tx - B.bx);
  if (ab - aa > Math.PI) ab -= Math.PI * 2;
  if (aa - ab > Math.PI) ab += Math.PI * 2;
  const la = Math.hypot(A.tx - A.bx, A.ty - A.by);
  const lb = Math.hypot(B.tx - B.bx, B.ty - B.by);
  const a = aa + (ab - aa) * u;
  const l = la + (lb - la) * u;
  out.bx = A.bx + (B.bx - A.bx) * u;
  out.by = A.by + (B.by - A.by) * u;
  out.tx = out.bx + Math.cos(a) * l;
  out.ty = out.by + Math.sin(a) * l;
  return out;
}

const HOLD = 0.045; // s between two sprite frames of a swing (22-23 fps)
const N = 5; // points along the sweep (the curve between poses is short; more costs path work)
const pts = Array.from({ length: N + 1 }, () => ({ bx: 0, by: 0, tx: 0, ty: 0 }));

/**
 * A band of the sweep: from age `a0` to the newest pose, the inner edge pulled towards the tip
 * by `inner(age)` (0 = the hilt, 1 = the tip) — so each band is a crescent, narrowest at its tail.
 */
function band(ctx, cx, cy, i0, inner) {
  ctx.beginPath();
  for (let i = i0; i <= N; i++) ctx.lineTo(pts[i].tx - cx, pts[i].ty - cy);
  for (let i = N; i >= i0; i--) {
    const P = pts[i];
    const f = inner(1 - i / N);
    ctx.lineTo(P.bx + (P.tx - P.bx) * f - cx, P.by + (P.ty - P.by) * f - cy);
  }
  ctx.closePath();
}

/** The trail of one blade, in the chosen style, ending at the blade's current pose. */
export function drawTrail(ctx, hist, now, cam, pal) {
  if (hist.length < 2) return;
  const st = TRAILS[SABER.trail] || TRAILS.tcw;
  const last = hist[hist.length - 1].t;
  const win = trailWindow();
  const t0 = now - win;
  if (last <= t0) return; // still for the whole window: the trail has caught up
  for (let i = 0; i <= N; i++) at(hist, t0 + ((now - t0) * i) / N, pts[i]);
  if (Math.hypot(pts[N].tx - pts[0].tx, pts[N].ty - pts[0].ty) < 2) return; // nothing swept
  // the swing's phase: full while the blade moves, then (end) thinner and fainter as the tail
  // catches up — `e` 1 -> 0 over the window after the last move
  // (a sprite frame lasts ~45 ms: the gap between two poses is still "moving")
  const e = Math.max(0, Math.min(1, 1 - Math.max(0, now - last - HOLD) / win));
  const cx = cam.x;
  const cy = cam.y;
  const tp = st.taper;
  const prev = ctx.globalCompositeOperation;
  if (SABER.trail === 'tcw') {
    // cel layers, hard edges: a dark edge, an outer coloured crescent, a white crescent inside
    const thin = 1 - e; // at the end the crescent thins towards the tip
    const outer = (age) => Math.min(0.92, age * tp + thin * 0.5);
    const inner = (age) => Math.min(0.96, 0.12 + age * (tp + 0.1) + thin * 0.55);
    ctx.globalCompositeOperation = 'source-over';
    band(ctx, cx, cy, 0, outer);
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = pal.halo; // the dark cel edge (keeps it readable on a bright floor)
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = pal.rim;
    ctx.fill();
    band(ctx, cx, cy, 1, inner);
    ctx.fillStyle = pal.core;
    ctx.fill();
  } else {
    // motion blur: a soft coloured glow round the sweep, then slices brightening towards the
    // blade (white near it, coloured further back) — all 'screen' (light, never flat white)
    const inner = (age) => Math.min(0.9, age * tp + (1 - e) * 0.4);
    band(ctx, cx, cy, 0, inner);
    // a faint tint first (normal blend): on a bright floor, light alone would not show
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.22 * e;
    ctx.fillStyle = pal.glow;
    ctx.fill();
    ctx.globalCompositeOperation = 'screen';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = pal.inner;
    ctx.globalAlpha = 0.3 * e;
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.lineJoin = 'miter';
    ctx.globalAlpha = 0.45 * e;
    ctx.fillStyle = pal.rim;
    ctx.fill();
    for (const [i0, a, col] of [[2, 0.7, pal.rim], [3, 0.45, pal.core]]) {
      band(ctx, cx, cy, i0, inner);
      ctx.globalAlpha = a * e;
      ctx.fillStyle = col;
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = prev;
}

// ---------------------------------------------------------------------------- clashes

let star = null;
let bloom = null;
function clashSprites() {
  if (star) return;
  // Clone Wars: a crisp white four-point star with a small hot centre
  star = document.createElement('canvas');
  star.width = star.height = 48;
  let x = star.getContext('2d');
  x.translate(24, 24);
  x.fillStyle = '#ffffff';
  for (let i = 0; i < 4; i++) {
    x.rotate(Math.PI / 4 + (i % 2 ? 0 : Math.PI / 4));
    x.beginPath();
    x.moveTo(0, -24);
    x.lineTo(2.2, 0);
    x.lineTo(0, 24);
    x.lineTo(-2.2, 0);
    x.closePath();
    x.fill();
  }
  x.beginPath();
  x.arc(0, 0, 5, 0, Math.PI * 2);
  x.fill();
  // the films: a big soft white-to-amber bloom
  bloom = document.createElement('canvas');
  bloom.width = bloom.height = 96;
  x = bloom.getContext('2d');
  const g = x.createRadialGradient(48, 48, 0, 48, 48, 48);
  g.addColorStop(0, 'rgba(255,255,250,1)');
  g.addColorStop(0.25, 'rgba(255,236,200,0.85)');
  g.addColorStop(0.6, 'rgba(255,170,90,0.3)');
  g.addColorStop(1, 'rgba(255,140,60,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 96, 96);
}

// the spark spray's directions (the same every clash: cheap, and the clash is a few frames)
const SPARKS = Array.from({ length: 9 }, (_, i) => {
  const a = i * 2.39996 + 0.4;
  return [Math.cos(a), Math.sin(a) * 0.6 - 0.25, 0.55 + ((i * 37) % 10) / 20];
});

/**
 * A clash flash in the chosen style at screen point (x, y); k: 1 at the hit, falling to 0.
 * Blending for any floor: the big light is 'screen' (lights a bright floor without flattening it
 * to white), only the small hot centre is additive.
 */
export function drawClash(ctx, x, y, k, pal = PALETTES.tcw.blue) {
  clashSprites();
  const st = TRAILS[SABER.trail] || TRAILS.tcw;
  const prev = ctx.globalCompositeOperation;
  const r = 1 - k; // how far the sparks have flown
  if (st.clash === 'star') {
    // Clone Wars: crisp sparks with a dark edge, a white star
    ctx.lineCap = 'round';
    ctx.globalCompositeOperation = 'source-over';
    for (const [sx, sy, sp] of SPARKS) {
      const d0 = 4 + 16 * r * sp;
      const d1 = d0 + 4 + 3 * k;
      ctx.strokeStyle = pal.halo;
      ctx.globalAlpha = 0.6 * k;
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(x + sx * d0, y + sy * d0);
      ctx.lineTo(x + sx * d1, y + sy * d1);
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.globalAlpha = k;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
    const s = 12 + 10 * k;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.min(1, k * 1.5);
    ctx.drawImage(star, x - s, y - s, s * 2, s * 2);
  } else {
    // the films: a wide soft bloom (screen), a hot core (additive), amber streaks
    const s = 24 + 18 * k;
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = Math.min(1, k);
    ctx.drawImage(bloom, x - s, y - s, s * 2, s * 2);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.min(1, k * 0.8);
    ctx.drawImage(bloom, x - s * 0.3, y - s * 0.3, s * 0.6, s * 0.6);
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#ffb060';
    ctx.lineWidth = 1.4;
    for (const [sx, sy, sp] of SPARKS) {
      const d0 = 6 + 22 * r * sp;
      ctx.globalAlpha = 0.9 * k;
      ctx.beginPath();
      ctx.moveTo(x + sx * d0, y + sy * d0);
      ctx.lineTo(x + sx * (d0 + 7), y + sy * (d0 + 7));
      ctx.stroke();
    }
  }
  ctx.lineCap = 'butt';
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = prev;
}

// ---------------------------------------------------------------------------- the blades' light

// QA (tools/qa/saberlab.mjs): the clash drawing and the settings, from the page
if (typeof window !== 'undefined') window.__saberStyle = { SABER, TRAILS, PALETTES, setSaberOpt, drawClash, drawBlade, paletteFor };
