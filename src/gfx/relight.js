// Normal-map lighting of characters by transient lights (ART_GUIDE.md §8):
// saber blades, blaster bolts, clash flashes, sparks, explosions. Sheets
// rendered with the normal pass (render_config.json character.passes) carry
// a camera-space normal per pixel (RGB = n·0.5 + 0.5: x right, y up, z toward
// the camera). For each unit near such a light the renderer adds, with
// 'lighter', albedo × light colour × max(0, N·L) × falloff — so a red bolt
// flying past paints the side of a clone that faces it, and the blue blade
// rims Anakin's arm. The light map already brightens the area round a light;
// this adds the direction.
import { worldToScreen, PX_PER_UNIT } from '../core/iso.js';
import { paletteFor, hex } from './saberStyle.js';

const GAIN = 1.25;
const SIN = 0.5; // sin 30°, the camera's elevation
const COS = Math.cos(Math.PI / 6);
const CACHE_MAX = 800; // frames whose colour + normal pixels are kept

const cache = new Map(); // frame -> { col, nrm } Uint8ClampedArrays at sheet size
let scratch = null;
let sctx = null;

function pixels(f) {
  let c = cache.get(f);
  if (c) return c;
  scratch ||= document.createElement('canvas');
  if (scratch.width < f.w || scratch.height < f.h) {
    scratch.width = Math.max(scratch.width, f.w);
    scratch.height = Math.max(scratch.height, f.h);
    sctx = null;
  }
  sctx ||= scratch.getContext('2d', { willReadFrequently: true });
  const read = (page, sx, sy) => {
    sctx.clearRect(0, 0, f.w, f.h);
    sctx.drawImage(page, sx, sy, f.w, f.h, 0, 0, f.w, f.h);
    return sctx.getImageData(0, 0, f.w, f.h).data;
  };
  c = { col: read(f.page, f.sx, f.sy), nrm: read(f.normal.page, f.normal.sx, f.normal.sy) };
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(f, c);
  return c;
}

/**
 * The transient lights of this frame, in screen space: { sx, sy, z (world
 * height), wx, wy, rgb, rad (px), a }.
 */
export function transientLights(game, cam) {
  const out = [];
  const push = (x, y, z, rgb, rad, a) => {
    const s = worldToScreen(x, y, z);
    out.push({ sx: s.x - cam.x, sy: s.y - cam.y, wx: x, wy: y, z, rgb, rad, a });
  };
  for (const L of game.fx.lights) push(L.x, L.y, L.z, [L.r, L.g, L.b], L.rad, 0.9 * (1 - L.t / L.life));
  for (const b of game.bolts) push(b.x, b.y, b.z, b.color === 'red' ? [255, 60, 45] : [80, 150, 255], 48, 0.9);
  for (const t of game.throws) push(t.x, t.y, t.z, [90, 150, 255], 60, 0.8);
  for (const u of game.activeUnits) {
    if (!u.saberColor || u.dead || u.hidden || u.saberOut || u.saberLit === false) continue;
    const f = u.frame();
    const b = f.markers.saberBase;
    const e = f.markers.saberTip;
    const s = worldToScreen(u.x, u.y, u.z);
    if (b && e) {
      // the blade's middle, a little in front of the body
      // in the saber palette's colour (saberStyle.js), reaching a little further than a bolt
      const pal = paletteFor(u.saberColor);
      out.push({ sx: s.x + (b[0] + e[0]) / 2 - cam.x, sy: s.y + (b[1] + e[1]) / 2 - cam.y, wx: u.x, wy: u.y, z: 1.1 + u.z, rgb: pal ? hex(pal.rim) : u.saberColor, rad: 80, a: 0.85, tz: 8 });
    }
  }
  return out;
}

/** Light every sheet unit in reach of a transient light. */
export function relightUnits(ctx, game, cam, lights, W, H) {
  if (!lights.length) return;
  for (const u of game.activeUnits) {
    if (u.dead || u.hidden) continue;
    const f = u.frame();
    if (!f.normal) continue;
    const k = f.k || 1;
    const s = worldToScreen(u.x, u.y, u.z);
    const x0 = s.x - f.ox * k - cam.x;
    const y0 = s.y - f.oy * k - cam.y;
    const fw = f.w * k;
    const fh = f.h * k;
    if (x0 > W || y0 > H || x0 + fw < 0 || y0 + fh < 0) continue;
    // lights that reach the sprite's box; each with its toward-camera offset from the unit (px)
    const near = [];
    for (const L of lights) {
      const dx = Math.max(x0 - L.sx, 0, L.sx - (x0 + fw));
      const dy = Math.max(y0 - L.sy, 0, L.sy - (y0 + fh));
      if (dx * dx + dy * dy > L.rad * L.rad || L.a <= 0.02) continue;
      // world offset -> camera "toward" axis (ground diagonal toward the viewer, and height)
      const g = (L.wx - u.x + (L.wy - u.y)) * Math.SQRT1_2;
      const tz = L.tz ?? (g * COS + (L.z - 1 - u.z) * SIN) * PX_PER_UNIT;
      near.push({ L, tz });
    }
    if (!near.length) continue;
    const { col, nrm } = pixels(f);
    const out = new ImageData(f.w, f.h);
    const o = out.data;
    let any = false;
    for (let y = 0; y < f.h; y++) {
      const py = y0 + y * k;
      for (let x = 0; x < f.w; x++) {
        const i = (y * f.w + x) * 4;
        const al = col[i + 3];
        if (al < 8) continue;
        const nx = nrm[i] / 127.5 - 1;
        const ny = nrm[i + 1] / 127.5 - 1;
        const nz = nrm[i + 2] / 127.5 - 1;
        const px = x0 + x * k;
        let r = 0;
        let gg = 0;
        let b = 0;
        for (const { L, tz } of near) {
          const lx = L.sx - px;
          const ly = py - L.sy; // up is positive
          const d = Math.hypot(lx, ly, tz) || 1;
          if (d >= L.rad) continue;
          const ndl = (nx * lx + ny * ly + nz * tz) / d;
          if (ndl <= 0) continue;
          const fall = 1 - d / L.rad;
          const w = ndl * fall * fall * L.a * GAIN;
          r += L.rgb[0] * w;
          gg += L.rgb[1] * w;
          b += L.rgb[2] * w;
        }
        if (r + gg + b < 3) continue;
        // albedo × light (the albedo lifted a little so dark cloth still catches a rim)
        o[i] = ((col[i] + 40) * r) / 295;
        o[i + 1] = ((col[i + 1] + 40) * gg) / 295;
        o[i + 2] = ((col[i + 2] + 40) * b) / 295;
        o[i + 3] = al;
        any = true;
      }
    }
    if (!any) continue;
    const c = (relightUnits.canvas ||= document.createElement('canvas'));
    if (c.width < f.w || c.height < f.h) {
      c.width = Math.max(c.width, f.w);
      c.height = Math.max(c.height, f.h);
    }
    const cx = c.getContext('2d');
    cx.clearRect(0, 0, f.w, f.h);
    cx.putImageData(out, 0, 0);
    ctx.drawImage(c, 0, 0, f.w, f.h, Math.round(x0), Math.round(y0), fw, fh);
  }
}
