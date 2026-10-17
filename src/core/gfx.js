// Graphics mode, after StarCraft: Remastered's SD / HD switch (F5 there too).
//   original  — the low-resolution look: a small canvas scaled up with
//               nearest-neighbour, terrain and props posterized and dithered
//               to a reduced palette with hard 1-bit alpha edges, flat shadows.
//   remaster  — the same world, frames, timing and gameplay drawn near the
//               screen's own resolution, tuned for flagship phones: terrain,
//               props and characters at 2× pixel density in full colour with
//               anti-aliased edges (characters bake in the background and
//               swap in when ready), soft shadows, smooth lighting, finer
//               glow, device-pixel scrolling, and a render resolution that
//               steps down while the device can't hold its frame rate.
// Franchise vehicles keep their existing sprites in both.
const KEY = 'cw.gfx';

let mode = 'remaster';
try {
  const s = localStorage.getItem(KEY);
  if (s === 'original' || s === 'remaster') mode = s;
} catch {
  /* storage blocked: default */
}

const listeners = [];
export const gfxMode = () => mode;
export const isHD = () => mode === 'remaster';
export const GFX_LABEL = { original: '오리지널', remaster: '리마스터' };

export function setGfxMode(m) {
  if (m === mode) return;
  mode = m;
  try {
    localStorage.setItem(KEY, m);
  } catch {
    /* storage blocked */
  }
  for (const fn of listeners) fn(m);
}

export function onGfxMode(fn) {
  listeners.push(fn);
}
