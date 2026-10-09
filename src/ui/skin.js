// Interface skin after Fallout 1/2: rusted gunmetal plates, dark CRT glass
// and stained paper are generated here once (no image files) and exposed to
// the stylesheet as CSS variables; the Galmuri pixel fonts are registered.
import g11 from 'galmuri/dist/Galmuri11.woff2?url';
import g11b from 'galmuri/dist/Galmuri11-Bold.woff2?url';
import g9 from 'galmuri/dist/Galmuri9.woff2?url';
import '@fontsource/stardos-stencil/400.css';
import '@fontsource/stardos-stencil/700.css';

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

/** Wrapping blobs: smooth stains for rust, grime, paper spots. */
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

const metal = () =>
  canvas(256, 256, (g, w, h) => {
    const rnd = rng(7);
    const rust = blobs(w, h, 22, rnd, 6, 34);
    const grime = blobs(w, h, 14, rnd, 20, 70);
    pixels(g, w, h, (x, y) => {
      const n = (rnd() - 0.5) * 18 + Math.sin(y * 0.9 + Math.sin(x * 0.05) * 3) * 3;
      const ru = Math.min(1, rust[y * w + x] * 1.4);
      const gr = Math.min(1, grime[y * w + x]);
      // olive gunmetal → rust orange-brown, darkened by grime
      let r = 78 + n, gg = 80 + n, b = 70 + n;
      r += (112 - r) * ru;
      gg += (62 - gg) * ru;
      b += (34 - b) * ru;
      const k = 1 - gr * 0.35;
      return [r * k, gg * k, b * k];
    });
    // scratches
    g.strokeStyle = 'rgba(200,200,185,0.18)';
    for (let i = 0; i < 40; i++) {
      const x = rnd() * w, y = rnd() * h, l = 4 + rnd() * 18, a = rnd() * Math.PI;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      g.stroke();
    }
  });

const screen = () =>
  canvas(64, 64, (g, w, h) => {
    const rnd = rng(3);
    pixels(g, w, h, (x, y) => {
      const n = (rnd() - 0.5) * 6;
      const line = y % 2 ? -3 : 0; // scanlines
      const grid = x % 16 === 0 || y % 16 === 0 ? 7 : 0;
      return [12 + n + line + grid * 0.5, 20 + n + line + grid, 14 + n + line + grid * 0.6];
    });
  });

const paper = () =>
  canvas(256, 256, (g, w, h) => {
    const rnd = rng(11);
    const stain = blobs(w, h, 10, rnd, 10, 50);
    pixels(g, w, h, (x, y) => {
      const n = (rnd() - 0.5) * 14;
      const s = Math.min(1, stain[y * w + x]) * 40;
      return [206 + n - s, 188 + n - s * 1.1, 146 + n - s * 1.3];
    });
  });

export function applySkin() {
  const root = document.documentElement.style;
  root.setProperty('--tex-metal', `url(${metal()})`);
  root.setProperty('--tex-screen', `url(${screen()})`);
  root.setProperty('--tex-paper', `url(${paper()})`);
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
