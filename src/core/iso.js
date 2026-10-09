// Isometric (2:1 dimetric) projection used by both the 2D renderer and the
// sprite baker. One world unit = one tile = roughly one meter.
//
//   screen.x = (x - y) * HALF_W
//   screen.y = (x + y) * HALF_H - z * Z_PX
//
// The baker's orthographic camera sits at 30° elevation / 45° azimuth, which
// yields exactly this projection when 1 unit == PX_PER_UNIT pixels.

export const TILE_W = 40;
export const TILE_H = 20;
export const HALF_W = TILE_W / 2;
export const HALF_H = TILE_H / 2;
export const PX_PER_UNIT = HALF_W / Math.SQRT1_2; // ≈ 28.28
export const Z_PX = PX_PER_UNIT * Math.cos(Math.PI / 6); // ≈ 24.49
export const CAM_ELEVATION = Math.PI / 6;

export function worldToScreen(x, y, z = 0) {
  return { x: (x - y) * HALF_W, y: (x + y) * HALF_H - z * Z_PX };
}

export function screenToWorld(sx, sy) {
  return {
    x: (sx / HALF_W + sy / HALF_H) / 2,
    y: (sy / HALF_H - sx / HALF_W) / 2,
  };
}

/** World-space facing angle → direction index (0 = +x, counter-clockwise in world). */
export function dirIndex(angle, dirs) {
  const step = (Math.PI * 2) / dirs;
  let i = Math.round(angle / step) % dirs;
  if (i < 0) i += dirs;
  return i;
}

/** World-space angle of a screen-space vector (useful for mouse aiming). */
export function screenVecToWorldAngle(dx, dy) {
  const w = screenToWorld(dx, dy);
  return Math.atan2(w.y, w.x);
}
