// Classic / Remastered graphics, after StarCraft and StarCraft: Remastered: the same game, the same view and
// the same art direction either way, switched at once in play (F5, as there; or the settings panel). Only in the
// Movie Duel on Mustafar (its sets are baked fine for it); everywhere else the picture is classic.
//
//   classic     the game's own picture: a low-resolution canvas scaled up by whole pixels (nearest neighbour,
//               chunky pixels), the ground dithered to its few levels, the light map at that resolution
//   remastered  the same scene drawn at 2-4 × the resolution (remasterRes): the ground built at that density (no
//               dither, its detail and grain at the finer pixels), the set sprites (baked at 2×) shown at
//               their full detail, the blades, glows, sparks and lights drawn smooth at the finer pixels, the
//               light map as fine, and the picture scaled to the screen smoothly (the set's small props are baked
//               at 4×, the big walked-on pieces at 2×: tools/sprites/mustafar_*). The characters' sheets are
//               rendered at the game's pixels (128 px): they stay crisp (whole pixels, not blurred) until HD
//               sheets are rendered (tools/sprites: render_scale's 2× frames kept instead of shrunk)
//
// The setting is kept on the device (localStorage). gfx/renderer.js reads `remaster.on`; the HUD's settings
// panel and core/input.js (F5) switch it with setRemaster.

const STORE = 'cw.remaster';
export const REMASTER_RES = 4; // at most this many canvas pixels a game pixel in the remastered picture

/**
 * The remastered resolution for a screen showing `devScale` device pixels a game pixel: the largest of 4, 3, 2 that
 * divides it — the canvas at the screen's own pixels (3 on a 1080p screen, 4 zoomed in or on a phone), or a whole
 * fraction of them (6 → 3), so the picture reaches the screen by whole pixels; else 4 (a few css px of smoothing).
 */
export function remasterRes(devScale) {
  for (const r of [REMASTER_RES, 3, 2]) if (r <= devScale && devScale % r === 0) return r;
  return Math.max(1, Math.min(REMASTER_RES, devScale));
}

// `pref` the player's choice (kept on the device); `allowed` whether this mode has it — the Movie Duel on Mustafar
// only (main.js); `on` the two together, what the renderer draws by
export const remaster = { on: false, pref: false, allowed: false };
try {
  remaster.pref = localStorage.getItem(STORE) === '1';
} catch {}

const listeners = new Set();
export function onRemaster(fn) {
  listeners.add(fn);
}

function apply() {
  const on = remaster.pref && remaster.allowed;
  if (on === remaster.on) return;
  remaster.on = on;
  if (typeof document !== 'undefined') document.body.classList.toggle('remaster', on);
  for (const fn of listeners) fn(on);
}

/** The player's choice (F5, the settings panel); drawn only where the mode allows it. */
export function setRemaster(on) {
  remaster.pref = !!on;
  try {
    localStorage.setItem(STORE, on ? '1' : '0');
  } catch {}
  apply();
}

/** Whether this mode draws remastered at all (main.js: the Mustafar duel). */
export function setRemasterAllowed(a) {
  remaster.allowed = !!a;
  apply();
}
