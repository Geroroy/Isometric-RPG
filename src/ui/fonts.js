// Typography (docs/UI_SYSTEM.md "타이포그래피"): the HUD's font system.
// The Google Fonts families are self-hosted from the same files Google serves (@fontsource,
// bundled by Vite): the game is an offline PWA and a private page, so a runtime @import would
// leave the HUD in a fallback font whenever the network is not there. GmarketSans (Korean body)
// comes from the noonnu CDN with Pretendard, already bundled, as its fallback.
//
//   display  Orbitron 600/700     HUD titles, skill names, popup titles — spaced, uppercase
//   data     Share Tech Mono      numbers: health / Force readouts, cooldowns, coordinates, scanner
//            (Chakra Petch 500/600 as the second choice)
//   body     Rajdhani 500/600     body, dialogue, item text, tooltips (Latin);
//            GmarketSans / Pretendard for Korean (the same role, picked by glyph coverage)
//   aurebesh Aurebesh             decoration only: drop a licensed Aurebesh.woff2 into public/fonts/
//                                 and uncomment its @font-face in theme.css; until then the
//                                 generated Aurebesh-style glyphs of ui/skin.js stay in use
//
// theme.css declares the same stacks as --font-display / --font-data / --font-body /
// --font-body-ko / --font-aurebesh; canvas text reads them through font() below.
import '@fontsource/orbitron/600.css';
import '@fontsource/orbitron/700.css';
import '@fontsource/share-tech-mono/400.css';
import '@fontsource/chakra-petch/500.css';
import '@fontsource/chakra-petch/600.css';
import '@fontsource/rajdhani/500.css';
import '@fontsource/rajdhani/600.css';

export const FONTS = {
  display: "'Orbitron', 'Bank Gothic', 'Michroma', sans-serif",
  data: "'Share Tech Mono', 'Chakra Petch', ui-monospace, monospace",
  body: "'Rajdhani', 'GmarketSans', 'Pretendard Variable', Pretendard, sans-serif",
  bodyKo: "'GmarketSans', 'Pretendard Variable', Pretendard, 'Rajdhani', sans-serif",
  aurebesh: "'Aurebesh', 'Aurebesh AF', 'Orbitron', sans-serif",
};
const VAR = { display: '--font-display', data: '--font-data', body: '--font-body', bodyKo: '--font-body-ko', aurebesh: '--font-aurebesh' };
const read = {};

/** A role's font-family stack, as the stylesheet has it (theme.css is the source; read once). */
export function font(role) {
  if (!read[role] && typeof document !== 'undefined') {
    read[role] = true; // (canvas labels ask every frame: no getComputedStyle per call)
    const v = getComputedStyle(document.documentElement).getPropertyValue(VAR[role]).trim();
    if (v) FONTS[role] = v;
  }
  return FONTS[role];
}

/** A canvas font string: `weight size role`, e.g. canvasFont(700, 12, 'data'). */
export function canvasFont(weight, px, role) {
  return `${weight} ${px}px ${font(role)}`;
}

/**
 * Warm the HUD's fonts up so the first frames do not swap (canvas text is drawn with whatever
 * is loaded at that moment). Resolves when they are in, or after a short wait.
 */
export function fontsReady() {
  if (typeof document === 'undefined' || !document.fonts) return Promise.resolve();
  const wanted = ["600 16px 'Orbitron'", "700 16px 'Orbitron'", "400 16px 'Share Tech Mono'", "500 16px 'Chakra Petch'", "500 16px 'Rajdhani'", "600 16px 'Rajdhani'", "500 16px 'GmarketSans'", "500 16px 'Pretendard Variable'"];
  return Promise.race([Promise.allSettled(wanted.map((f) => document.fonts.load(f))), new Promise((r) => setTimeout(r, 2500))]);
}
