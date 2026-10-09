// Developer page: render the pixel-art portrait large in its variants.
import { Portrait } from './gfx/portrait.js';

const out = document.getElementById('out');
const variants = [
  ['corridor', 0, false, 0],
  ['hangar', 0, false, 0],
  ['corridor', 90, false, 1.2],
  ['corridor', 0, true, 0],
];
for (const [scene, dark, talk, look] of variants) {
  const p = new Portrait();
  p.setScene(scene);
  p.update(0.016, dark, false);
  p.staticT = 0;
  p.blinkT = 5;
  p.look = look ? 1 : 0;
  if (talk) p.talkT = 1;
  const c = document.createElement('canvas');
  c.width = 384;
  c.height = 320;
  c.style.margin = '4px';
  p.draw(c.getContext('2d'), 384, 320);
  out.appendChild(c);
}
window.__done = true;
