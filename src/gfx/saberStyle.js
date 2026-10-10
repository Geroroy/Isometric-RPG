// Lightsaber looks, measured from the reference footage (docs/SABER_STYLE.md, tools/qa/saberprofile.py):
// two trail styles (Clone Wars / the films) and two palettes (Clone Wars / Revenge of the Sith),
// picked separately. Glows are pre-drawn sprites (no shadowBlur); trails are flat polygons.
//
// PROTOTYPE: used only in the test scene (?saberLab) until the look is approved.

const STORE = 'cw.saber';
export const SABER = { trail: 'tcw', palette: 'tcw', lab: false };
try {
  Object.assign(SABER, JSON.parse(localStorage.getItem(STORE) || '{}'));
} catch {}
if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('saberLab')) SABER.lab = true;

/** Change a setting (trail, palette, lab) and keep it on this device. */
export function setSaberOpt(key, value) {
  SABER[key] = value;
  try {
    localStorage.setItem(STORE, JSON.stringify(SABER));
  } catch {}
}

export const TRAIL_NAMES = { tcw: '클론워즈 (셀 셰이딩)', movie: '영화 (모션 블러)' };
export const PALETTE_NAMES = { tcw: '클론워즈', rots: '시스의 복수' };

// Colours sampled from the references (1280 px wide frames): the white core, then the colour
// 1-2 px, 2-4 px, 4-8 px and 8-16 px outside it. Only hues the footage shows: the Revenge of
// the Sith clip (Mustafar) has blue blades only, so its red falls back to the Clone Wars red.
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
export const PALETTES = {
  tcw: {
    blue: { core: '#f8fafe', rim: '#3475e1', inner: '#0946bb', glow: '#0c3295', halo: '#09287c' },
    red: { core: '#fefbfa', rim: '#d92c42', inner: '#a40738', glow: '#790e35', halo: '#621234' },
  },
  rots: {
    blue: { core: '#fcfefe', rim: '#a7bbf8', inner: '#8294f4', glow: '#5963dc', halo: '#423ca6' },
    red: null, // not in the reference: the Clone Wars red is used
  },
};

/**
 * The trail styles, from the frame-by-frame comparison (24 fps footage; the game's swings run
 * at 22-23 fps):
 *  tcw   — a flat, opaque crescent of the core colour with a crisp coloured rim, the last
 *          ~2.5 frames of the sweep; when the blade stops its tail catches up (it shrinks,
 *          it does not fade). Tight glow (half brightness ~1 core width out), no flicker.
 *  movie — motion blur: only the latest frame's sweep, soft (brightest at the blade, fading
 *          back), gone the moment the blade stops. Wide pale bloom (near-white to 8 px out),
 *          a slight shimmer.
 */
export const TRAILS = {
  tcw: { window: 0.11, solid: true, glowW: 5, glowA: 0.55, haloW: 9, haloA: 0.22, flicker: 0, clash: 'star' },
  movie: { window: 0.06, solid: false, glowW: 7, glowA: 0.85, haloW: 13, haloA: 0.4, flicker: 0.06, clash: 'bloom' },
};

/** The palette entry for a unit's saber colour (blue or red); null: draw it the old way. */
export function paletteFor(rgb) {
  const hue = rgb[2] > rgb[0] ? 'blue' : rgb[0] > rgb[2] + 40 ? 'red' : null;
  if (!hue) return null;
  const p = PALETTES[SABER.palette] || PALETTES.tcw;
  return p[hue] || PALETTES.tcw[hue];
}

// ---------------------------------------------------------------------------- glow sprites

// One sprite per colour pair: a horizontal glow strip, 3-sliced (end caps + a stretchable middle
// column), alpha falling off across the strip. Drawn rotated along the blade, additively.
const STRIP_H = 32;
const CAP = 16;
const strips = new Map();
function strip(inner, outer) {
  const key = inner + outer;
  let c = strips.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = CAP * 2 + 1;
  c.height = STRIP_H;
  const x = c.getContext('2d');
  const img = x.createImageData(c.width, c.height);
  const A = hex(inner);
  const B = hex(outer);
  const h = STRIP_H / 2;
  for (let py = 0; py < c.height; py++) {
    for (let px = 0; px < c.width; px++) {
      // distance from the strip's centre line (the caps are round)
      const dx = px < CAP ? CAP - px - 0.5 : px > CAP ? px - CAP - 0.5 : 0;
      const dy = py + 0.5 - h;
      const d = Math.min(1, Math.hypot(Math.max(0, dx), dy) / h);
      const k = (1 - d) * (1 - d); // brighter near the blade
      const m = Math.min(1, d * 1.6); // inner colour near, outer colour further out
      const o = (py * c.width + px) * 4;
      img.data[o] = A[0] + (B[0] - A[0]) * m;
      img.data[o + 1] = A[1] + (B[1] - A[1]) * m;
      img.data[o + 2] = A[2] + (B[2] - A[2]) * m;
      img.data[o + 3] = 255 * k;
    }
  }
  x.putImageData(img, 0, 0);
  strips.set(key, c);
  return c;
}

/** A glow strip from (x1,y1) to (x2,y2), `w` px across (additive: call with 'lighter'). */
function glowStrip(ctx, x1, y1, x2, y2, w, sprite, alpha) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  const s = w / STRIP_H; // sprite px -> screen px
  const cap = CAP * s;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x1, y1);
  ctx.rotate(Math.atan2(dy, dx));
  ctx.drawImage(sprite, 0, 0, CAP, STRIP_H, -cap, -w / 2, cap, w);
  ctx.drawImage(sprite, CAP, 0, 1, STRIP_H, 0, -w / 2, len, w);
  ctx.drawImage(sprite, CAP + 1, 0, CAP, STRIP_H, len, -w / 2, cap, w);
  ctx.restore();
}

// ---------------------------------------------------------------------------- blade

/** The blade: the style's glow and halo (sprites), the coloured rim and the white core (lines). */
export function drawBlade(ctx, x1, y1, x2, y2, pal, k, time) {
  const st = TRAILS[SABER.trail] || TRAILS.tcw;
  const fl = st.flicker ? 1 + st.flicker * (Math.sin(time * 61) * 0.6 + Math.sin(time * 23.7) * 0.4) : 1;
  const prev = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  glowStrip(ctx, x1, y1, x2, y2, st.haloW, strip(pal.glow, pal.halo), Math.min(1, st.haloA * k * fl));
  glowStrip(ctx, x1, y1, x2, y2, st.glowW, strip(pal.rim, pal.inner), Math.min(1, st.glowA * k * fl));
  ctx.globalCompositeOperation = prev;
  ctx.lineCap = 'round';
  ctx.strokeStyle = pal.rim;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.strokeStyle = pal.core;
  ctx.lineWidth = 1.3;
  ctx.stroke();
  ctx.lineCap = 'butt';
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

const N = 10;
const pts = Array.from({ length: N + 1 }, () => ({ bx: 0, by: 0, tx: 0, ty: 0 }));

/** The trail of one blade, in the chosen style, ending at the blade's current pose. */
export function drawTrail(ctx, hist, now, cam, pal) {
  if (hist.length < 2) return;
  const st = TRAILS[SABER.trail] || TRAILS.tcw;
  const t0 = now - st.window;
  if (hist[hist.length - 1].t <= t0) return; // still for the whole window: the trail has caught up
  for (let i = 0; i <= N; i++) at(hist, t0 + ((now - t0) * i) / N, pts[i]);
  // nothing swept (the tip barely moved)?
  if (Math.hypot(pts[N].tx - pts[0].tx, pts[N].ty - pts[0].ty) < 2) return;
  const cx = cam.x;
  const cy = cam.y;
  if (st.solid) {
    // the swept crescent, flat and opaque, with a crisp coloured edge and a little glow
    ctx.beginPath();
    ctx.moveTo(pts[0].bx - cx, pts[0].by - cy);
    for (let i = 0; i <= N; i++) ctx.lineTo(pts[i].tx - cx, pts[i].ty - cy);
    for (let i = N; i >= 0; i--) ctx.lineTo(pts[i].bx - cx, pts[i].by - cy);
    ctx.closePath();
    const prev = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = pal.glow;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.globalCompositeOperation = prev;
    ctx.globalAlpha = 1;
    ctx.strokeStyle = pal.rim;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = pal.core;
    ctx.fill();
    return;
  }
  // motion blur: the blade smeared over its latest move — a widened blade (pale core, coloured
  // edges, see reference frames), brightest at the blade, fading back, soft-edged; additive
  const prev = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  const outline = () => {
    ctx.beginPath();
    ctx.moveTo(pts[0].bx - cx, pts[0].by - cy);
    for (let i = 0; i <= N; i++) ctx.lineTo(pts[i].tx - cx, pts[i].ty - cy);
    for (let i = N; i >= 0; i--) ctx.lineTo(pts[i].bx - cx, pts[i].by - cy);
    ctx.closePath();
  };
  // the soft coloured edge round the smear
  outline();
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = pal.inner;
  ctx.lineWidth = 4;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.globalAlpha = 0.6;
  ctx.strokeStyle = pal.rim;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // the smear itself, slice by slice
  for (let i = 0; i < N; i++) {
    const A = pts[i];
    const B = pts[i + 1];
    const a = (i + 1) / N;
    ctx.globalAlpha = 0.12 + 0.78 * a * a;
    ctx.fillStyle = a > 0.5 ? pal.core : pal.rim;
    ctx.beginPath();
    ctx.moveTo(A.bx - cx, A.by - cy);
    ctx.lineTo(A.tx - cx, A.ty - cy);
    ctx.lineTo(B.tx - cx, B.ty - cy);
    ctx.lineTo(B.bx - cx, B.by - cy);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.lineJoin = 'miter';
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

/** A clash flash in the chosen style at screen point (x, y); k: 1 at the hit, falling to 0. */
export function drawClash(ctx, x, y, k) {
  clashSprites();
  const st = TRAILS[SABER.trail] || TRAILS.tcw;
  const prev = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  if (st.clash === 'star') {
    const s = 14 + 10 * k;
    ctx.globalAlpha = Math.min(1, k * 1.5);
    ctx.drawImage(star, x - s, y - s, s * 2, s * 2);
  } else {
    const s = 24 + 18 * k; // the films' clash: a wide soft bloom (about the character's height)
    ctx.globalAlpha = Math.min(1, k);
    ctx.drawImage(bloom, x - s, y - s, s * 2, s * 2);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = prev;
}

// QA (tools/qa/saberlab.mjs): the clash drawing and the settings, from the page
if (typeof window !== 'undefined') window.__saberStyle = { SABER, setSaberOpt, drawClash };
