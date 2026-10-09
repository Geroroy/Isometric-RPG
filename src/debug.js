// Developer page: bakes sprites and dumps every frame for visual inspection.
import { Baker } from './gfx/baker.js';
import { CHARACTERS, DUEL_CHARACTERS, SKINS } from './gfx/assets.js';
import { PROPS, buildPropVariants } from './gfx/models/props.js';

const params = new URLSearchParams(location.search);
const which = params.get('m') || 'anakin';
const scale = +(params.get('s') || 3);
const dirsShown = (params.get('dirs') || '0,2,4,6,8,10,12,14').split(',').map(Number);
const specs = { ...CHARACTERS, ...DUEL_CHARACTERS, ...SKINS };
const baker = new Baker();
// ?p=a,b,c : bake those world props instead of a character
if (params.has('p')) {
  const out = document.getElementById('out');
  for (const name of params.get('p').split(',')) {
    const def = PROPS[name];
    const angles = params.has('turn') ? [0, 1, 2, 3].map((i) => (-i * Math.PI) / 4) : def.angles || [0];
    const frames = buildPropVariants(name).flatMap((m) => baker.bakeStatic(m, { angles }));
    const W = frames.reduce((a, f) => a + f.w + 16, 16);
    const H = Math.max(...frames.map((f) => f.h)) + 24;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    c.style.width = W * scale + 'px';
    const g = c.getContext('2d');
    g.fillStyle = '#6a6458';
    g.fillRect(0, 0, W, H);
    let x = 16;
    for (const f of frames) {
      g.drawImage(f.page, f.sx, f.sy, f.w, f.h, x, H - 12 - f.h, f.w, f.h);
      x += f.w + 16;
    }
    const label = document.createElement('div');
    label.textContent = name;
    out.append(label, c);
  }
  window.__done = true;
  throw new Error('props only'); // stop here
}
const spec = specs[which]();
if (params.has('ss')) spec.ss = +params.get('ss');
if (params.has('noblades')) spec.markers = [];
const gen = baker.bakeAnimated(spec);
let r;
const t0 = performance.now();
while (!(r = gen.next()).done);
const res = r.value;
const out = document.getElementById('out');
const info = document.createElement('div');
info.textContent = `${which} baked in ${(performance.now() - t0).toFixed(0)}ms`;
out.appendChild(info);
const only = params.get('only')?.split(',');
for (const [name, anim] of Object.entries(res.anims)) {
  if (only && !only.includes(name)) continue;
  const cw = 90, ch = 90;
  const c = document.createElement('canvas');
  c.width = cw * anim.frames;
  c.height = ch * dirsShown.length;
  c.style.width = c.width * scale + 'px';
  const g = c.getContext('2d');
  g.fillStyle = '#5a5f48';
  g.fillRect(0, 0, c.width, c.height);
  dirsShown.forEach((d, row) => {
    for (let f = 0; f < anim.frames; f++) {
      const fr = anim.data[d][f];
      const ax = f * cw + cw / 2, ay = row * ch + ch - 12;
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.beginPath(); g.ellipse(ax, ay, 10, 5, 0, 0, 7); g.fill();
      const ang = d * Math.PI * 2 / res.dirs;
      g.strokeStyle = '#ff0'; g.beginPath(); g.moveTo(ax, ay);
      g.lineTo(ax + (Math.cos(ang) - Math.sin(ang)) * 14, ay + (Math.cos(ang) + Math.sin(ang)) * 7); g.stroke();
      g.drawImage(fr.page, fr.sx, fr.sy, fr.w, fr.h, ax - fr.ox, ay - fr.oy, fr.w, fr.h);
      // visible blade stretches (what the renderer will glow)
      for (const k of ['saber', 'saber2']) {
        const b = fr.markers[k + 'Base'], t = fr.markers[k + 'Tip'];
        if (!b || !t || !fr.blades) continue;
        g.strokeStyle = params.has('glow') ? 'rgba(255,0,255,0.8)' : 'rgba(0,0,0,0)';
        for (const [s0, s1] of fr.blades[k] || []) {
          g.beginPath();
          g.moveTo(ax + b[0] + (t[0] - b[0]) * s0, ay + b[1] + (t[1] - b[1]) * s0);
          g.lineTo(ax + b[0] + (t[0] - b[0]) * s1, ay + b[1] + (t[1] - b[1]) * s1);
          g.stroke();
        }
      }
    }
  });
  const label = document.createElement('div');
  label.textContent = name;
  out.appendChild(label);
  out.appendChild(c);
}
window.__done = true;
