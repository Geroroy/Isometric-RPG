// The Mustafar rebuild's BLOCKOUT pieces (docs/MUSTAFAR_REBUILD.md "블록아웃"; CLAUDE.md "레벨 제작 순서"): plain grey
// boxes that stand in for a stage's walls, furniture, platforms and set pieces while the whole route is laid out and
// tested with the characters, before any of its art is requested. They are placeholders the user asked for, and look
// it: flat-shaded boxes in a few function colours (wall, furniture, story object, deck, hazard), outlined, hatched, each
// with its name on it — never passed off as the final graphics (the screen's placeholder badge names the stages in
// blockout). Each is made here once, as a sheet sprite the renderer already draws and sorts (world/mustafarStage.js
// places it like a delivered sprite: worldgen.js addSheetProp), its footprint the box's.
import { HALF_W, HALF_H, Z_PX } from '../core/iso.js';

const D = 2; // (drawn at the remastered 2x, like the stood-up walls)
const PAD = 3;
// the function colours: [top, the +y face (lit: the light comes from the screen's upper left), the +x face]
const KINDS = {
  wall: ['#74767d', '#5e6067', '#4a4c52'],
  furniture: ['#6c7b8c', '#566373', '#434e5b'],
  story: ['#a88445', '#8a6a35', '#6b5128'],
  deck: ['#6b7568', '#565f53', '#444b41'],
  hazard: ['#a8583a', '#8a452c', '#6b3422'],
  float: ['#7a7290', '#625b76', '#4c465d'],
};

/** The sheet name a blockout box is made under (one sprite for every box of the same size, kind and label). */
export const blockoutName = (b) => `bo:${b.kind || 'wall'}:${b.w}x${b.d}x${b.h}${b.z ? '@' + b.z : ''}${b.flat ? 'f' : ''}:${b.label || ''}`;

/**
 * A box `w` m along x, `d` along y, `h` tall, its anchor the middle of its base: a sheet sprite
 * ({ meta, body, neon, reflect }) with the box's footprint. `flat`: a raised deck one walks on (drawn with the ground,
 * under everyone: world/mustafarStage.js gives its top a `surface`).
 */
export function blockoutSprite(b) {
  const w = b.w;
  const d = b.d;
  const h = Math.max(0.02, b.h);
  const z0 = b.z || 0; // (standing on a raised top: a console on the gallery)
  const cols = KINDS[b.kind] || KINDS.wall;
  const W = Math.ceil((w + d) * HALF_W * D) + PAD * 2;
  const H = Math.ceil(((w + d) * HALF_H + (z0 + h) * Z_PX) * D) + PAD * 2;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d');
  const ox = PAD + ((w + d) / 2) * HALF_W * D;
  const oy = PAD + (((w + d) / 2) * HALF_H + (z0 + h) * Z_PX) * D;
  const P = (px, py, pz) => [ox + (px - py) * HALF_W * D, oy + ((px + py) * HALF_H - (pz + z0) * Z_PX) * D];
  const face = (pts, fill) => {
    x.beginPath();
    pts.forEach(([a, b2], i) => (i ? x.lineTo(a, b2) : x.moveTo(a, b2)));
    x.closePath();
    x.fillStyle = fill;
    x.fill();
    // hatched: plainly a placeholder
    x.save();
    x.clip();
    x.strokeStyle = 'rgba(255,255,255,0.10)';
    x.lineWidth = D;
    for (let k = -H; k < W + H; k += 7 * D) {
      x.beginPath();
      x.moveTo(k, 0);
      x.lineTo(k - H, H);
      x.stroke();
    }
    x.restore();
    x.strokeStyle = 'rgba(16,16,20,0.9)';
    x.lineWidth = D;
    x.stroke();
  };
  const [x0, x1, y0, y1] = [-w / 2, w / 2, -d / 2, d / 2];
  face([P(x0, y1, 0), P(x1, y1, 0), P(x1, y1, h), P(x0, y1, h)], cols[1]); // +y face
  face([P(x1, y0, 0), P(x1, y1, 0), P(x1, y1, h), P(x1, y0, h)], cols[2]); // +x face
  face([P(x0, y0, h), P(x1, y0, h), P(x1, y1, h), P(x0, y1, h)], cols[0]); // top
  // its name, on its top (or its front when the top is a sliver)
  if (b.label) {
    const [tx, ty] = P(0, 0, h);
    const big = Math.min(w, d) >= 1.2;
    x.font = `${(big ? 8 : 7) * D}px "Share Tech Mono", monospace`;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    const ly = big ? ty : Math.min(H - 6 * D, ty + (h * Z_PX * D) / 2 + (w + d) * 2.5 * D);
    x.lineWidth = 3 * D;
    x.strokeStyle = 'rgba(10,10,14,0.85)';
    x.strokeText(b.label, tx, ly);
    x.fillStyle = '#f2e9ff';
    x.fillText(b.label, tx, ly);
  }
  const fp = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const k = 1 / D;
  const meta = { anchor: [ox, oy], k, layers: {}, footprint: fp, lights: [], flat: !!b.flat, top: false, order: b.order || 0, occlusion: null, blockout: true };
  return { meta, body: { page: c, sx: 0, sy: 0, w: W, h: H, ox, oy, k }, neon: null, reflect: null };
}

/** The same box as a one-frame unit sprite set (a deck that moves: the river's raft, the droid, the platform). */
export function blockoutUnitSet(b) {
  const s = blockoutSprite(b);
  return { dirs: 1, anims: { idle: { frames: 1, fps: 1, loop: true, data: [[s.body]] } }, markers: [] };
}
