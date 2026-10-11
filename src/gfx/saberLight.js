// Lightsaber light (docs/SABER_STYLE.md "광선검 빛"): what a lit blade throws on the floor and
// on characters. One model, the films' (Revenge of the Sith, measured in the reference): a soft
// inverse square (1 / (1 + (d/r0)²)) with a hot exponential core in the first ~15 px, baked into
// sprites so a light is one drawImage; the colour comes from the blade's own colour (the unit's
// saber colour: blue, red, green, purple…), whatever palette or trail style is chosen.
//  - the floor: an iso ellipse elongated along the blade's projection on the ground, placed at
//    the blade's current position every frame (it follows a swing at once) and streaked along
//    a fresh sweep; on a bright floor an additive glow is invisible, so there the floor takes
//    the light's hue instead ('color' blend under the sprites, in proportion to its brightness).
//  - characters: albedo × light through the falloff (a faint wash) plus a rim of the near tint
//    on the edge that faces the blade — the films' strongest cue (faces, arms, sleeves).
//  - the flicker is the blade's own (saberStyle.flickerAt), so blade and light shimmer together.
import { SABER, hex, hueOf, trailWindow } from './saberStyle.js';

export const LIGHT = {
  r0: 17, // px at which the inverse square is half (its knee)
  reach: 5, // the sprite's radius, in r0 (85 px ≈ 3 units)
  rim: 1.5, // the rim light's width (px)
  groundA: 0.42, // the floor pool, added over the lit picture
  tintA: 0.55, // the floor's hue shift on a bright floor ('color' blend, × its brightness)
  charA: 0.3, // the body wash
  rimA: 1.0, // the rim
  mapA: 1.0, // the light map's share
};
export const preset = () => LIGHT;

// the reflected tints: the colour a surface takes near the blade and further out. Blue and red
// as specified from the footage; green and purple on the same pattern (bright and saturated near,
// deeper out). Purple sits at 280°, blue at 190–215°, so the two never read alike on a floor.
const TINTS = {
  blue: ['#00d2ff', '#1a75ff'],
  red: ['#ff5500', '#ff2a00'],
  green: ['#8cff5a', '#22c93a'],
  purple: ['#e070ff', '#8f3cff'],
};
const tints = new Map();
/** The light's tints for a saber colour ([r, g, b]). */
export function tintFor(rgb) {
  const key = (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];
  let t = tints.get(key);
  if (t) return t;
  const name = hueOf(rgb);
  let near;
  let far;
  if (name && TINTS[name]) [near, far] = TINTS[name];
  else {
    // any other colour: the hue itself, bright near the blade and deeper out
    const [r, g, b] = rgb;
    const mx = Math.max(r, g, b) || 1;
    const sat = (v) => Math.round(Math.min(255, (v / mx) ** 1.6 * 255));
    far = '#' + [sat(r), sat(g), sat(b)].map((v) => v.toString(16).padStart(2, '0')).join('');
    near = '#' + [r, g, b].map((v) => Math.round(Math.min(255, (v / mx) * 200 + 55)).toString(16).padStart(2, '0')).join('');
  }
  t = { near, far, nearRGB: hex(near), farRGB: hex(far) };
  tints.set(key, t);
  return t;
}

/**
 * The light at `d` px from the blade, 0..1.7: soft inverse square with a hot core
 * (e^-(d/9.5)², gone by ~15 px), fading to nothing at reach.
 */
export function falloff(d, p = LIGHT) {
  const q = d / p.r0;
  let f = 1 / (1 + q * q) + 0.7 * Math.exp(-(d * d) / 90);
  const edge = p.r0 * (p.reach - 1.5);
  if (d > edge) f *= Math.max(0, 1 - (d - edge) / (p.r0 * 1.5));
  return f;
}

// the baked lights: one 256 px sprite per tint, radius = r0 * reach px when drawn
const SPR = 256;
const sprites = new Map();
export function lightSprite(t, p = LIGHT) {
  const key = t.near + p.r0 + p.reach;
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
 * A light lying on the floor: the sprite scaled `along` × `across` its own axis turned by `ang`
 * (screen), then the iso squash (y × 0.5) — an ellipse elongated along a direction on the ground.
 */
function drawLightIso(ctx, x, y, t, p, a, along, across, ang) {
  const R = p.r0 * p.reach;
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  ctx.globalAlpha = Math.min(1, a);
  ctx.setTransform(c * along, 0.5 * s * along, -s * across, 0.5 * c * across, x, y);
  ctx.drawImage(lightSprite(t, p), -R, -R, R * 2, R * 2);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
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
 * The floor under a blade. (gx, gy): the ground under the blade's middle, screen px; (dx, dy):
 * the blade, hilt to tip, screen px. The pool is an iso ellipse elongated along the blade's
 * projection on the ground (a blade held flat lights a streak, one held up a spot), brighter and
 * streaked along the sweep while a swing is fresh. `lum` 0..1: the floor's brightness there —
 * the additive pool fades as the floor brightens (drawGroundTint carries the light there).
 * `blend`: the composite (the light map wants 'lighter').
 */
export function drawGround(ctx, gx, gy, dx, dy, t, p, sweep, k = 1, blend = 'lighter', lum = 0, spread = 1) {
  const prev = ctx.globalCompositeOperation;
  const R = p.r0 * p.reach;
  const sh = poolShape(dx, dy, R, spread);
  const fresh = sweep ? sweep.fresh : 0;
  const a = p.groundA * k * (1 + 0.4 * fresh) * (1 - 0.55 * lum);
  ctx.globalCompositeOperation = blend;
  drawLightIso(ctx, gx, gy, t, p, a, sh.along, sh.across, sh.ang);
  if (sweep) {
    // the swing: a streak of light along the sweep, settling as it ends
    const stretch = G * (1 + Math.min(1, sweep.len / R));
    drawLightIso(ctx, gx, gy, t, p, p.groundA * k * 0.6 * fresh, stretch, G * 0.6, sweep.ang);
  }
  ctx.globalCompositeOperation = prev;
}

/**
 * A bright floor's share of the light: the pool as a hue shift ('color' blend — the floor keeps
 * its own brightness and takes the light's colour), in proportion to the floor's brightness
 * `lum`. Drawn on the bare floor, before the sprites, so only the floor takes it.
 */
export function drawGroundTint(ctx, gx, gy, dx, dy, t, p, sweep, k = 1, lum = 0, spread = 1) {
  if (lum <= 0.2) return;
  const prev = ctx.globalCompositeOperation;
  const sh = poolShape(dx, dy, p.r0 * p.reach, spread);
  const fresh = sweep ? sweep.fresh : 0;
  ctx.globalCompositeOperation = 'color';
  drawLightIso(ctx, gx, gy, t, p, p.tintA * k * (1 + 0.4 * fresh) * lum, sh.along, sh.across, sh.ang);
  ctx.globalCompositeOperation = prev;
}

const G = 0.8; // the floor's pool, a little tighter than the light in the air
const shape = { along: 1, across: 1, ang: 0 };
// the pool's ellipse: along the blade's ground projection (its screen x fully, its screen y
// partly — height or depth), across narrower; `spread` scales it (the ignition's flash)
function poolShape(dx, dy, R, spread = 1) {
  const proj = (Math.abs(dx) + 0.45 * Math.abs(dy)) / (R * 0.75);
  shape.along = G * spread * (1 + 0.9 * Math.min(1.2, proj));
  shape.across = G * spread * 0.85;
  shape.ang = Math.atan2(dy, dx);
  return shape;
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
 * away from the light, diffused a pixel out. Added with 'lighter' (the caller's composite).
 * `a`: strength (the flicker and the swing boost go in here).
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
  ctx.globalAlpha = Math.min(1, a * p.rimA);
  ctx.drawImage(spillC, 0, 0, w, h, x, y, w, h);
  // the rim diffused a pixel out, towards the blade
  ctx.globalAlpha = Math.min(1, a * p.rimA * 0.4);
  ctx.drawImage(spillC, 0, 0, w, h, x - ox * 0.7, y - oy * 0.7, w, h);
  ctx.globalAlpha = 1;
}
