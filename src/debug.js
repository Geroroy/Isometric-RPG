// Developer page: bakes sprites and dumps every frame for visual inspection.
import { Baker } from './gfx/baker.js';
import * as M from './gfx/models/characters.js';
import * as A from './gfx/models/anims.js';

const params = new URLSearchParams(location.search);
const which = params.get('m') || 'anakin';
const scale = +(params.get('s') || 3);
const dirsShown = (params.get('dirs') || '0,2,4,6,8,10,12,14').split(',').map(Number);
const specs = {
  anakin: () => ({ model: M.buildAnakin(), dirs: 16, frame: [160, 150, 80, 115], anims: A.ANAKIN_ANIMS, markers: ['saberBase', 'saberTip'] }),
  clone: () => ({ model: M.buildClone(), dirs: 8, frame: [120, 110, 60, 90], anims: A.CLONE_ANIMS, markers: ['muzzle'] }),
  rex: () => ({ model: M.buildClone({ rex: true }), dirs: 8, frame: [120, 110, 60, 90], anims: A.REX_ANIMS, markers: ['muzzle'] }),
  b1: () => ({ model: M.buildB1(), dirs: 8, frame: [120, 110, 60, 90], anims: A.B1_ANIMS, markers: ['muzzle'] }),
  b2: () => ({ model: M.buildB2(), dirs: 8, frame: [130, 120, 65, 100], anims: A.B2_ANIMS, markers: ['muzzleR'] }),
  r2: () => ({ model: M.buildR2(), dirs: 8, frame: [60, 60, 30, 45], anims: A.R2_ANIMS, markers: [] }),
};
const baker = new Baker();
const spec = specs[which]();
const gen = baker.bakeAnimated(spec);
let r;
const t0 = performance.now();
while (!(r = gen.next()).done);
const res = r.value;
const out = document.getElementById('out');
const info = document.createElement('div');
info.textContent = `${which} baked in ${(performance.now() - t0).toFixed(0)}ms`;
out.appendChild(info);
for (const [name, anim] of Object.entries(res.anims)) {
  const cw = 80, ch = 80;
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
      for (const m of Object.values(fr.markers)) { g.fillStyle = '#0ff'; g.fillRect(ax + m[0], ay + m[1], 1, 1); }
      if (fr.markers.saberTip) {
        g.fillStyle = '#f0f';
        g.fillRect(ax + fr.markers.saberTip[0], ay + fr.markers.saberTip[1], 1, 1);
      }
    }
  });
  const label = document.createElement('div');
  label.textContent = name;
  out.appendChild(label);
  out.appendChild(c);
}
window.__done = true;
