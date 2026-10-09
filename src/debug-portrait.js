// Developer page: render the portrait bust at large size from a few angles.
import { Baker } from './gfx/baker.js';
import { Portrait } from './gfx/portrait.js';
const baker = new Baker();
const p = new Portrait(baker);
const out = document.getElementById('out');
for (const [dark, yaw] of [[0, 0], [0, 0.4], [0, -0.4], [90, 0]]) {
  p.update(0.016, dark, false); p.staticT = 0;
  p.head.rotation.y = yaw;
  p.blinkT = 5;
  const c = document.createElement('canvas');
  c.width = 336; c.height = 320; c.style.margin = '4px';
  p.draw(c.getContext('2d'), 336, 320);
  out.appendChild(c);
}
p.update(0.016, 0, false); p.head.rotation.y = 0.25;
const big = document.createElement('canvas');
big.width = 600; big.height = 560;
const src = baker.renderTo(p.scene, p.camera, 600, 560);
big.getContext('2d').drawImage(src, 0, 0);
out.appendChild(big);
window.__done = true;
