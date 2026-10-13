// Classic / Remastered graphics, after StarCraft and StarCraft: Remastered: the same game, the same view and
// the same art direction either way, switched at once in play (F5, as there; or the settings panel).
//
//   classic     the game's own picture: a low-resolution canvas scaled up by whole pixels (nearest neighbour,
//               chunky pixels), the ground dithered to its few levels, the light map at that resolution
//   remastered  the same scene drawn at 2-3 × the resolution (remasterRes): the ground built at that density (no
//               dither, its detail and grain at the finer pixels), the set sprites (baked at 2×) shown at
//               their full detail, the blades, glows, sparks and lights drawn smooth at the finer pixels, the
//               light map as fine, and the picture scaled to the screen smoothly. The characters' sheets are
//               rendered at the game's pixels (128 px): they stay crisp (whole pixels, not blurred) until HD
//               sheets are rendered (tools/sprites: render_scale's 2× frames kept instead of shrunk)
//
// The setting is kept on the device (localStorage). gfx/renderer.js reads `remaster.on`; the HUD's settings
// panel and core/input.js (F5) switch it with setRemaster.

const STORE = 'cw.remaster';
export const REMASTER_RES = 3; // at most this many canvas pixels a game pixel in the remastered picture

/**
 * The remastered resolution for a screen showing `devScale` device pixels a game pixel: one that divides it
 * (3 on a 1080p screen: the canvas at the screen's own pixels; 2 where the scale is 4), so the picture reaches the
 * screen by whole pixels and nothing is blurred on the way; else 2.
 */
export function remasterRes(devScale) {
  for (const r of [REMASTER_RES, 2]) if (r <= devScale && devScale % r === 0) return r;
  return Math.max(1, Math.min(2, devScale));
}

export const remaster = { on: false };
try {
  remaster.on = localStorage.getItem(STORE) === '1';
} catch {}

const listeners = new Set();
export function onRemaster(fn) {
  listeners.add(fn);
}

export function setRemaster(on) {
  on = !!on;
  if (on === remaster.on) return;
  remaster.on = on;
  try {
    localStorage.setItem(STORE, on ? '1' : '0');
  } catch {}
  document.body.classList.toggle('remaster', on);
  for (const fn of listeners) fn(on);
}

export const toggleRemaster = () => setRemaster(!remaster.on);

if (typeof document !== 'undefined') document.body.classList.toggle('remaster', remaster.on);
