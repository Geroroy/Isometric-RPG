// Graphics mode, after StarCraft: Remastered's SD / HD switch (F5 there too).
//   original  — the low-resolution look: a small canvas scaled up with
//               nearest-neighbour, terrain and props posterized and dithered
//               to a reduced palette with hard 1-bit alpha edges, flat shadows.
//   remaster  — the same world, frames, timing and gameplay drawn at the
//               screen's own resolution: terrain and props baked at 2× pixel
//               density in full colour with anti-aliased alpha edges, soft
//               shadows, smooth lighting and finer glow and effects;
//               characters re-rendered from their models at 2× with finer
//               curves and smooth, lightly specular shading — like
//               StarCraft: Remastered, the same units drawn finer.
// Star Wars vehicles placed as scenery keep their existing frames in both.
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
