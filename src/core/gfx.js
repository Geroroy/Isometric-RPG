// Graphics mode, after StarCraft: Remastered's SD / HD switch (F5 there too).
//   original  — the low-resolution look: a small canvas scaled up with
//               nearest-neighbour, terrain and props posterized and dithered
//               to a reduced palette with hard 1-bit alpha edges, flat shadows.
//   remaster  — the same world, frames, timing and gameplay drawn at the
//               screen's own resolution: terrain and props baked at 2× pixel
//               density in full colour with anti-aliased alpha edges, soft
//               shadows, smooth lighting and finer glow and effects.
//   commandos — after Commandos 2 (2001): the map is one hand-painted-looking
//               background (ground, buildings and their soft cast shadows
//               baked together), buildings drawn over units again only where
//               they hide them (occlusion masks), no sprite outlines, a muted
//               realistic grade, and a wider view so the soldiers read small
//               against a big detailed world. The default.
// Gameplay, frames and hit tests are the same in every mode.
const KEY = 'cw.gfx';
export const GFX_MODES = ['commandos', 'remaster', 'original'];

let mode = 'commandos';
try {
  const s = localStorage.getItem(KEY);
  // a choice saved before the Commandos mode existed is reset to it once
  if (localStorage.getItem(KEY + '.cmd')) {
    if (GFX_MODES.includes(s)) mode = s;
  } else {
    localStorage.setItem(KEY + '.cmd', '1');
    localStorage.setItem(KEY, mode);
  }
} catch {
  /* storage blocked: default */
}

const listeners = [];
export const gfxMode = () => mode;
/** High-density, full-colour pipeline (remaster and commandos). */
export const isHD = () => mode !== 'original';
export const isCommandos = () => mode === 'commandos';
export const GFX_LABEL = { commandos: '코만도스', remaster: '리마스터', original: '오리지널' };
/** Character sprite style: 'pixel' (outlined, dithered) or 'cmd' (painted). */
export const spriteStyle = (m = mode) => (m === 'commandos' ? 'cmd' : 'pixel');

export function setGfxMode(m) {
  if (m === mode || !GFX_MODES.includes(m)) return;
  mode = m;
  try {
    localStorage.setItem(KEY, m);
  } catch {
    /* storage blocked */
  }
  for (const fn of listeners) fn(m);
}

/** F5: commandos → remaster → original → commandos. */
export function nextGfxMode() {
  setGfxMode(GFX_MODES[(GFX_MODES.indexOf(mode) + 1) % GFX_MODES.length]);
}

export function onGfxMode(fn) {
  listeners.push(fn);
}
