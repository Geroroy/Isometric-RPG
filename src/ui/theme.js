// The UI design system's tokens for canvas drawing (the scanner, the map, the
// hologram portrait). theme.css is the source: the --c-* custom properties are
// read once the stylesheet is in; these are the same values as fallbacks.
// docs/UI_SYSTEM.md

export const THEME = {
  holo: '#00c8ff', // Republic holo-blue: primary, Force, allies
  emerald: '#00ff87', // Jedi emerald: health
  gold: '#ffd700', // Naboo gold: XP, level, accents
  red: '#ff0033', // Separatist red: enemies, warnings
  base: '#1e293b', // Kamino dark metal
  chrome: '#f1f5f9', // Kamino white / chrome
};

/** Read the palette from the stylesheet (call once the DOM is up). */
export function loadTheme() {
  if (typeof document === 'undefined') return THEME;
  const cs = getComputedStyle(document.documentElement);
  for (const k of Object.keys(THEME)) {
    const v = cs.getPropertyValue('--c-' + k).trim();
    if (/^#[0-9a-f]{6}$/i.test(v)) THEME[k] = v.toLowerCase();
  }
  return THEME;
}

/** 'rgba(r,g,b,a)' of a palette hex. */
export function rgba(hex, a) {
  return `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})`;
}

/** Where a HUD canvas's cooldown or progress stands, as a CSS custom property on its element. */
export function setFraction(el, name, v) {
  // 1/50 steps: a value that creeps every frame (the Force regenerating) would otherwise
  // restyle and repaint its element every frame
  const s = (Math.round(v * 50) / 50).toFixed(2);
  if (el.dataset[name] !== s) {
    el.dataset[name] = s;
    el.style.setProperty('--' + name, s);
  }
}
