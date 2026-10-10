// Developer page: the detail proposal side by side with the current looks —
// original, remaster, and remaster with fine rendering (shadows, ambient
// occlusion, edge light) and the detailed models.
import { Baker } from './gfx/baker.js';
import { CHARACTERS } from './gfx/assets.js';
import { buildPropVariants } from './gfx/models/props.js';
import { setDetail } from './gfx/models/parts.js';

const COLS = [
  { label: '현재 · 오리지널', hd: false, fine: false },
  { label: '현재 · 리마스터', hd: true, fine: false },
  { label: '제안 · 디테일 강화', hd: true, fine: true },
];
const Q = new URLSearchParams(location.search);
const pose = (anims, name, t) => ({ [name]: { frames: 1, fps: 1, loop: false, pose: () => anims[name].pose(t) } });

function bakeChar(name, col, anim, t, dir) {
  const baker = new Baker();
  baker.setFine(col.fine);
  setDetail(col.hd);
  const spec = CHARACTERS[name]();
  setDetail(false);
  spec.anims = pose(spec.anims, anim, t);
  spec.markers = [];
  spec.hd = col.hd;
  const gen = baker.bakeAnimated(spec);
  let r;
  while (!(r = gen.next()).done);
  return r.value.anims[anim].data[dir][0];
}

function bakeProp(name, col, variant = 0) {
  const baker = new Baker();
  baker.setFine(col.fine);
  setDetail(col.hd);
  const m = buildPropVariants(name)[variant];
  setDetail(false);
  return baker.bakeStatic(m, { hd: col.hd })[0];
}

let ROWS = [
  { label: '아나킨', h: Q.has('chars') ? 640 : 300, get: (c) => [bakeChar('anakin', c, 'idle', 0, 2), bakeChar('anakin', c, 'attack1', 0.45, 6)] },
  { label: '클론 트루퍼 · B1', h: Q.has('chars') ? 560 : 280, get: (c) => [bakeChar('clone', c, 'idle', 0, 1), bakeChar('b1', c, 'idle', 0, 1)] },
  { label: '코러산트 건물', h: 600, get: (c) => [c.fine ? bakeProp('underBlock', c, 1) : bakeProp('slumBlock', c, 1)] },
  { label: '크리스토프시스 막사', h: 380, get: (c) => [bakeProp('barracks', c)] },
];

const SCALE = +(Q.get('s') || 2); // display: screen px per game px
if (Q.has('chars')) ROWS.splice(2, 2); // close-up of the characters only
const colW = Q.has('chars') ? 560 : 560;
const cv = document.getElementById('c');
cv.width = 160 + colW * COLS.length;
cv.height = 40 + ROWS.reduce((a, r) => a + r.h, 0);
const g = cv.getContext('2d');
g.fillStyle = '#202226';
g.fillRect(0, 0, cv.width, cv.height);
g.font = 'bold 16px sans-serif';
COLS.forEach((c, i) => {
  g.fillStyle = c.fine ? '#ffd27a' : '#cfd4dc';
  g.fillText(c.label, 160 + i * colW + 16, 26);
});
let y0 = 40;
for (const row of ROWS) {
  g.fillStyle = '#cfd4dc';
  g.font = '14px sans-serif';
  g.fillText(row.label, 12, y0 + 24);
  COLS.forEach((c, i) => {
    const x0 = 160 + i * colW;
    // a dark street to stand on
    const grd = g.createLinearGradient(0, y0, 0, y0 + row.h);
    grd.addColorStop(0, '#2c3038');
    grd.addColorStop(1, '#3d3f44');
    g.fillStyle = grd;
    g.fillRect(x0 + 6, y0 + 4, colW - 12, row.h - 8);
    row.hh = row.h;
    const frames = row.get(c);
    const n = frames.length;
    frames.forEach((f, k) => {
      const ax = x0 + (colW / (n + 1)) * (k + 1);
      const ay = y0 + row.h - 30;
      const kk = f.k || 1;
      g.imageSmoothingEnabled = !!f.k;
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.beginPath();
      g.ellipse(ax, ay, 22, 10, 0, 0, 7);
      g.fill();
      g.drawImage(f.page, f.sx, f.sy, f.w, f.h, ax - f.ox * kk * SCALE, ay - f.oy * kk * SCALE, f.w * kk * SCALE, f.h * kk * SCALE);
    });
  });
  y0 += row.h;
}
window.__done = true;
