// Lightsaber light (docs/SABER_STYLE.md "광선검 빛"): what a lit blade throws on the floor and
// on characters. One falloff model for everything — a soft inverse square (1 / (1 + (d/r0)²))
// with a hot exponential core in the first ~15 px — baked into sprites so a light is one
// drawImage, with the palette's reflected tints (blue: cyan → deep blue, red: orange → red).
// Characters get albedo × light (additive) plus a rim on the side that faces the blade; the
// floor an iso ellipse that stretches along a swing. Two presets: Clone Wars (opacity bands,
// a sharp rim) and the films (wider reach, diffused edges).
import { SABER, hex, trailWindow } from './saberStyle.js';

export const LIGHT = {
  // r0: px at which the light is half (the inverse square's knee); reach: the sprite's radius
  // in r0; bands: 0 = smooth; rim: the rim light's width (px); soft: 1 = diffused (the films)
  tcw: { r0: 14, reach: 4, bands: 4, rim: 2, soft: 0, ground: 'lighter', groundA: 0.32, charA: 0.5, mapA: 0.85 },
  movie: { r0: 18, reach: 5.5, bands: 0, rim: 1.5, soft: 1, ground: 'screen', groundA: 0.45, charA: 0.6, mapA: 1.0 },
};
export const preset = () => LIGHT[SABER.trail] || LIGHT.tcw;

// the reflected tints: the colour a surface takes near the blade and further out
const TINTS = { blue: ['#00d2ff', '#1a75ff'], red: ['#ff5500', '#ff2a00'] };
const tints = new Map();
export function tintFor(pal) {
  let t = tints.get(pal.rim);
  if (t) return t;
  const [r, g, b] = hex(pal.rim);
  const hue = b > r + 40 && b >= g ? 'blue' : r > g + 60 && r > b + 60 ? 'red' : null;
  const near = hue ? TINTS[hue][0] : '#' + [r, g, b].map((v) => Math.round(Math.min(255, v * 0.55 + 115)).toString(16).padStart(2, '0')).join('');
  const far = hue ? TINTS[hue][1] : pal.rim;
  t = { near, far, nearRGB: hex(near), farRGB: hex(far) };
  tints.set(pal.rim, t);
  return t;
}

/**
 * The light at `d` px from the blade, 0..1.7: soft inverse square with a hot core
 * (e^-(d/9.5)², gone by ~15 px), fading to nothing at reach; the Clone Wars preset steps it.
 */
export function falloff(d, p = preset()) {
  const q = d / p.r0;
  let f = 1 / (1 + q * q) + 0.7 * Math.exp(-(d * d) / 90);
  const edge = p.r0 * (p.reach - 1.5);
  if (d > edge) f *= Math.max(0, 1 - (d - edge) / (p.r0 * 1.5));
  // the Clone Wars bands: steps of 1/bands, the faintest dropping to nothing (no pale disc)
  if (p.bands) f = Math.round(Math.min(1.5, f) * p.bands) / p.bands;
  return f;
}

// the baked lights: one 256 px sprite per tint and preset, radius = r0 * reach px when drawn
const SPR = 256;
const sprites = new Map();
export function lightSprite(t, p) {
  const key = t.near + (p.bands ? 'b' : 's') + p.r0 + p.reach;
  let c = sprites.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = SPR;
  const x = c.getContext('2d');
  const img = x.createImageData(SPR, SPR);
  const h = SPR / 2;
  const scale = (p.r0 * p.reach) / h; // px of light per sprite px
  const A = t.nearRGB;
  const B = t.farRGB;
  for (let py = 0; py < SPR; py++) {
    for (let px = 0; px < SPR; px++) {
      const d = Math.hypot(px + 0.5 - h, py + 0.5 - h) * scale;
      const f = falloff(d, p);
      const m = Math.min(1, f); // colour: near at the core, far outside
      const o = (py * SPR + px) * 4;
      img.data[o] = B[0] + (A[0] - B[0]) * m;
      img.data[o + 1] = B[1] + (A[1] - B[1]) * m;
      img.data[o + 2] = B[2] + (A[2] - B[2]) * m;
      img.data[o + 3] = 255 * Math.min(1, f);
    }
  }
  x.putImageData(img, 0, 0);
  sprites.set(key, c);
  return c;
}

/** One light: the sprite centred on (x, y), `sx`/`sy` squash (1 = round), turned by `rot`. */
export function drawLight(ctx, x, y, t, p, a, sx = 1, sy = 1, rot = 0) {
  const R = p.r0 * p.reach;
  ctx.globalAlpha = Math.min(1, a);
  if (rot || sx !== 1 || sy !== 1) {
    ctx.setTransform(Math.cos(rot) * sx, Math.sin(rot) * sx, -Math.sin(rot) * sy, Math.cos(rot) * sy, x, y);
    ctx.drawImage(lightSprite(t, p), -R, -R, R * 2, R * 2);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  } else ctx.drawImage(lightSprite(t, p), x - R, y - R, R * 2, R * 2);
  ctx.globalAlpha = 1;
}

/**
 * A swing's sweep on the ground, from the blade's recorded poses (saberStyle.record): the tip's
 * path over the trail window — its direction, length and how fresh it is (1 at the swing, 0 as
 * the light settles). null when the blade is still.
 */
export function sweepOf(u, now) {
  if (!u.saberHist || !u.saberHist.saber) return null;
  const hist = u.saberHist.saber;
  const win = trailWindow() + 0.05;
  const fresh = Math.max(0, Math.min(1, ((u.trailUntil || 0) - now) / win));
  if (fresh <= 0) return null;
  let first = null;
  let last = null;
  for (const h of hist) {
    if (h.t < now - win) continue;
    first = first || h;
    last = h;
  }
  if (!first || first === last) return null;
  const dx = last.tx - first.tx;
  const dy = last.ty - first.ty;
  return { ang: Math.atan2(dy, dx), len: Math.hypot(dx, dy), fresh };
}

/**
 * The floor under a blade: an iso ellipse (2:1) of the light, stretched along a swing's sweep
 * and brighter while it is fresh, settling back. (gx, gy): the ground under the blade, screen px.
 */
export function drawGround(ctx, gx, gy, t, p, sweep, k = 1, blend = p.ground) {
  const prev = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = blend;
  const G = 0.8; // the floor's pool, a little tighter than the light in the air
  if (sweep) {
    const R = p.r0 * p.reach;
    const stretch = G * (1 + Math.min(1, sweep.len / R) * sweep.fresh);
    drawLight(ctx, gx, gy, t, p, p.groundA * k * (1 + 0.5 * sweep.fresh), stretch, G * 0.5, sweep.ang);
  } else drawLight(ctx, gx, gy, t, p, p.groundA * k, G, G * 0.5);
  ctx.globalCompositeOperation = prev;
}

// a character lit by a blade: a scratch canvas the size of its frame
let spillC = null;
let spillX = null;
function scratch(w, h) {
  if (!spillC) {
    spillC = document.createElement('canvas');
    spillX = spillC.getContext('2d');
  }
  if (spillC.width < w || spillC.height < h) {
    spillC.width = Math.max(spillC.width, w);
    spillC.height = Math.max(spillC.height, h);
    spillX = spillC.getContext('2d');
  }
  return spillX;
}

/**
 * A sheet without a normal pass, lit by the blade at (lx, ly) (screen px): its own colours times
 * the light, through the falloff from the blade (the near side lit, the far side not), plus a
 * rim of the near tint on the edge that faces the blade — the silhouette minus itself shifted
 * away from the light. Added with 'lighter' (the caller's composite). `a`: strength.
 */
export function lightCharacter(ctx, f, x, y, t, p, a, lx, ly) {
  const k = f.k || 1;
  const w = Math.ceil(f.w * k);
  const h = Math.ceil(f.h * k);
  const X = scratch(w, h);
  const R = p.r0 * p.reach;
  const cx = lx - x;
  const cy = ly - y;
  const spr = lightSprite(t, p);
  X.imageSmoothingEnabled = !!f.k;
  // 1. the body: albedo × light, through the falloff
  X.globalCompositeOperation = 'copy';
  X.drawImage(f.page, f.sx, f.sy, f.w, f.h, 0, 0, w, h);
  X.globalCompositeOperation = 'multiply';
  X.fillStyle = t.far; // the body takes the deeper tint; the rim the bright one
  X.fillRect(0, 0, w, h);
  X.globalCompositeOperation = 'destination-in';
  X.drawImage(f.page, f.sx, f.sy, f.w, f.h, 0, 0, w, h);
  X.drawImage(spr, cx - R, cy - R, R * 2, R * 2);
  ctx.globalAlpha = Math.min(1, a * p.charA);
  ctx.drawImage(spillC, 0, 0, w, h, x, y, w, h);
  // 2. the rim: the silhouette in the near tint, minus the silhouette shifted away from the blade
  const dx = x + w / 2 - lx;
  const dy = y + h / 2 - ly;
  const dl = Math.hypot(dx, dy) || 1;
  const ox = (dx / dl) * p.rim;
  const oy = (dy / dl) * p.rim;
  X.globalCompositeOperation = 'copy';
  X.drawImage(f.page, f.sx, f.sy, f.w, f.h, 0, 0, w, h);
  X.globalCompositeOperation = 'source-in';
  X.fillStyle = t.near;
  X.fillRect(0, 0, w, h);
  X.globalCompositeOperation = 'destination-out';
  X.drawImage(f.page, f.sx, f.sy, f.w, f.h, ox, oy, w, h);
  X.globalCompositeOperation = 'destination-in';
  X.drawImage(spr, cx - R, cy - R, R * 2, R * 2);
  ctx.globalAlpha = Math.min(1, a * (p.soft ? 0.8 : 1.1));
  ctx.drawImage(spillC, 0, 0, w, h, x, y, w, h);
  if (p.soft) {
    // the films: the rim diffused a pixel out
    ctx.globalAlpha = Math.min(1, a * 0.35);
    ctx.drawImage(spillC, 0, 0, w, h, x - ox * 0.7, y - oy * 0.7, w, h);
  }
  ctx.globalAlpha = 1;
}
