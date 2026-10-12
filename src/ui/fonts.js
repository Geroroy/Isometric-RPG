// Typography (docs/UI_SYSTEM.md "타이포그래피"): the HUD's font system.
// The Latin reference faces are self-hosted from the same files Google serves (@fontsource,
// bundled by Vite): the game is an offline PWA and a private page, so a runtime @import would
// leave the HUD in a fallback font whenever the network is not there. The Korean faces are
// served from public/fonts (theme.css @font-face, the public CDNs as the second source).
//
//   display  Orbitron 600/700     HUD titles, skill names, popup titles — spaced, uppercase
//   data     Share Tech Mono      numbers: health / Force readouts, cooldowns, coordinates, scanner
//            (Chakra Petch 500/600 as the second choice)
//   body     Rajdhani 500/600     body, dialogue, item text, tooltips (Latin)
//
// The Korean UI (<html lang="ko">, theme.css) resolves the same roles to the Korean stacks, each
// with Orbitron first: every Latin letter and digit is Orbitron, Hangul falls through to the
// Korean face (per-glyph fallback):
//   display  Orbitron → GmarketSans 700/500  square-frame titles, set tight (-0.02em), holo glow
//   data     Orbitron → D2Coding             digits in Orbitron (tabular), Korean labels in D2Coding
//   body     Orbitron → Pretendard → SUIT    Latin in Orbitron, Korean body in Pretendard, keep-all
//   aurebesh Aurebesh             decoration only: drop a licensed Aurebesh.woff2 into public/fonts/
//                                 and uncomment its @font-face in theme.css; until then the
//                                 generated Aurebesh-style glyphs of ui/skin.js stay in use
//
// theme.css declares the stacks as --font-display / --font-data / --font-body / --font-body-ko /
// --font-aurebesh (and --font-kr-display / --font-kr-data / --font-kr-body); canvas text reads
// them through font() below, so it follows the page's language too.
import '@fontsource/orbitron/400.css';
import '@fontsource/orbitron/500.css';
import '@fontsource/orbitron/600.css';
import '@fontsource/orbitron/700.css';
import '@fontsource/share-tech-mono/400.css';
import '@fontsource/chakra-petch/500.css';
import '@fontsource/chakra-petch/600.css';
import '@fontsource/rajdhani/500.css';
import '@fontsource/rajdhani/600.css';

const KO = typeof document !== 'undefined' && document.documentElement.lang === 'ko';
export const FONTS = KO
  ? {
      display: "'Orbitron', 'GmarketSans', sans-serif",
      data: "'Orbitron', 'D2Coding', 'Chakra Petch', monospace",
      body: "'Orbitron', 'Pretendard Variable', 'Pretendard', 'SUIT', sans-serif",
      bodyKo: "'Orbitron', 'Pretendard Variable', 'Pretendard', 'SUIT', sans-serif",
      aurebesh: "'Aurebesh', 'Aurebesh AF', 'Orbitron', sans-serif",
    }
  : {
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
  const wanted = KO
    ? ["400 16px 'Orbitron'", "500 16px 'Orbitron'", "600 16px 'Orbitron'", "700 16px 'Orbitron'", "500 16px 'GmarketSans'", "700 16px 'GmarketSans'", "400 16px 'D2Coding'", "500 16px 'Pretendard Variable'", "600 16px 'Pretendard Variable'"]
    : ["600 16px 'Orbitron'", "700 16px 'Orbitron'", "400 16px 'Share Tech Mono'", "500 16px 'Chakra Petch'", "500 16px 'Rajdhani'", "600 16px 'Rajdhani'", "500 16px 'GmarketSans'", "500 16px 'Pretendard Variable'"];
  const sample = KO ? '체력 포스 광선검 0123456789' : undefined;
  return Promise.race([Promise.allSettled(wanted.map((f) => document.fonts.load(f, sample))), new Promise((r) => setTimeout(r, 3000))]);
}
