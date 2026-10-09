// Interface skin: Fallout 1/2's chunky console structure built from Star Wars
// materials — weathered Republic hull plating, blue holo glass and datapad
// screens — generated here once (no image files) and exposed to the
// stylesheet as CSS variables. Registers the Galmuri pixel fonts (Korean) and
// Michroma (Eurostile-like cockpit lettering).
import g11 from 'galmuri/dist/Galmuri11.woff2?url';
import g11b from 'galmuri/dist/Galmuri11-Bold.woff2?url';
import g9 from 'galmuri/dist/Galmuri9.woff2?url';
import '@fontsource/michroma/400.css';

function rng(seed) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
}

function canvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  return c.toDataURL('image/png');
}

/** Per-pixel noise helper: f(x, y, i) returns [r, g, b]. */
function pixels(g, w, h, f) {
  const img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const [r, gg, b] = f(x, y);
    img.data[i] = r;
    img.data[i + 1] = gg;
    img.data[i + 2] = b;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
}

/** Wrapping blobs: smooth patches for chipped paint and grime. */
function blobs(w, h, n, rnd, rMin, rMax) {
  const field = new Float32Array(w * h);
  for (let k = 0; k < n; k++) {
    const cx = rnd() * w, cy = rnd() * h, r = rMin + rnd() * (rMax - rMin), a = 0.4 + rnd() * 0.6;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = Math.min(Math.abs(x - cx), w - Math.abs(x - cx));
      const dy = Math.min(Math.abs(y - cy), h - Math.abs(y - cy));
      const f = Math.max(0, 1 - Math.hypot(dx, dy) / r);
      field[y * w + x] += a * f * f;
    }
  }
  return field;
}

// Republic hull plating (Clone Wars gunships / AT-TEs): cool grey panels with
// seams, rivets, chipped paint showing darker metal and carbon scoring.
const hull = () =>
  canvas(256, 256, (g, w, h) => {
    const rnd = rng(7);
    const chips = blobs(w, h, 30, rnd, 3, 12);
    const grime = blobs(w, h, 12, rnd, 24, 80);
    pixels(g, w, h, (x, y) => {
      const n = (rnd() - 0.5) * 12;
      const ch = chips[y * w + x] > 0.55 ? 1 : 0; // chipped paint: bare metal
      const gr = Math.min(1, grime[y * w + x]);
      let r = 112 + n, gg = 117 + n, b = 122 + n;
      if (ch) (r = 74 + n), (gg = 77 + n), (b = 80 + n);
      const k = 1 - gr * 0.3;
      return [r * k, gg * k, b * k];
    });
    // panel seams with a lit lip, offset like hull plating
    const seam = (x0, y0, x1, y1) => {
      g.fillStyle = 'rgba(10,12,14,0.75)';
      g.fillRect(x0, y0, x1 - x0 || 1, y1 - y0 || 1);
      g.fillStyle = 'rgba(220,230,240,0.18)';
      if (x1 === x0) g.fillRect(x0 + 1, y0, 1, y1 - y0);
      else g.fillRect(x0, y0 + 1, x1 - x0, 1);
    };
    seam(0, 0, w, 0);
    seam(0, 128, w, 128);
    seam(0, 0, 0, 128);
    seam(160, 0, 160, 128);
    seam(80, 128, 80, h);
    seam(208, 128, 208, h);
    g.fillStyle = 'rgba(16,18,20,0.6)';
    for (let x = 6; x < w; x += 16) for (const y of [5, 123, 133, 251]) g.fillRect(x, y, 2, 2); // rivets
    // carbon scoring: soft dark streaks
    for (let i = 0; i < 5; i++) {
      const x = rnd() * w, y = rnd() * h, l = 20 + rnd() * 40;
      const gr = g.createLinearGradient(x, y, x + l, y + l * 0.3);
      gr.addColorStop(0, 'rgba(20,18,16,0)');
      gr.addColorStop(0.5, 'rgba(20,18,16,0.35)');
      gr.addColorStop(1, 'rgba(20,18,16,0)');
      g.fillStyle = gr;
      g.fillRect(x, y - 3, l, 6 + l * 0.3);
    }
  });

// Holo display glass: deep blue, fine scanlines and a faint grid.
const holo = () =>
  canvas(64, 64, (g, w, h) => {
    const rnd = rng(3);
    pixels(g, w, h, (x, y) => {
      const n = (rnd() - 0.5) * 5;
      const line = y % 3 === 0 ? 5 : 0;
      const grid = x % 16 === 0 || y % 16 === 0 ? 6 : 0;
      return [6 + n + grid * 0.4, 14 + n + line + grid, 24 + n + line * 1.6 + grid * 1.4];
    });
  });

// Datapad screen: dark slate with faint ruled lines.
const pad = () =>
  canvas(64, 64, (g, w, h) => {
    const rnd = rng(11);
    pixels(g, w, h, (x, y) => {
      const n = (rnd() - 0.5) * 4;
      const rule = y % 8 === 0 ? 4 : 0;
      return [14 + n, 24 + n + rule, 34 + n + rule * 1.4];
    });
  });

export function applySkin() {
  const root = document.documentElement.style;
  root.setProperty('--tex-hull', `url(${hull()})`);
  root.setProperty('--tex-holo', `url(${holo()})`);
  root.setProperty('--tex-pad', `url(${pad()})`);
  for (const [name, url, weight] of [
    ['Galmuri11', g11, '400'],
    ['Galmuri11', g11b, '700'],
    ['Galmuri9', g9, '400'],
  ]) {
    const f = new FontFace(name, `url(${url})`, { weight, display: 'swap' });
    document.fonts.add(f);
    f.load().catch(() => {});
  }
}
