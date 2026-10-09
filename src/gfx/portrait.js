// StarCraft-style animated 3D unit portrait: a low-poly bust of Anakin
// rendered live at low resolution, then shown with CRT scanlines, static
// bursts and a transmission frame. Eyes shift to Sith-yellow as the player's
// darkness meter rises.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { canvasTexture } from './models/parts.js';

const PW = 84;
const PH = 80;

function lam(color, extra = {}) {
  return new THREE.MeshLambertMaterial({ color, ...extra });
}

function ball(r, m, x, y, z, sx = 1, sy = 1, sz = 1, seg = 14) {
  const o = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(6, seg - 4)), m);
  o.position.set(x, y, z);
  o.scale.set(sx, sy, sz);
  return o;
}

function cube(w, h, d, m, x, y, z) {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  o.position.set(x, y, z);
  return o;
}

/** Sphere deformed by fn(x, y, z) on the unit sphere; `keep` filters faces. */
function shaped(r, ws, hs, fn, keep) {
  const g = new THREE.SphereGeometry(1, ws, hs).toNonIndexed();
  const p = g.attributes.position;
  const out = [];
  for (let i = 0; i < p.count; i += 3) {
    const tri = [0, 1, 2].map((k) => [p.getX(i + k), p.getY(i + k), p.getZ(i + k)]);
    const c = [0, 1, 2].map((k) => (tri[0][k] + tri[1][k] + tri[2][k]) / 3);
    if (keep && !keep(c)) continue;
    for (const v of tri) {
      const [x, y, z] = fn(v[0], v[1], v[2]);
      out.push(x * r, y * r, z * r);
    }
  }
  let ng = new THREE.BufferGeometry();
  ng.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  ng = mergeVertices(ng, 1e-5);
  ng.computeVertexNormals();
  return new THREE.Mesh(ng);
}

export class Portrait {
  constructor(baker) {
    this.baker = baker;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, PW / PH, 0.05, 10);
    this.camera.position.set(0.07, 1.665, 0.72);
    this.camera.lookAt(0, 1.635, 0);
    this.scene.add(new THREE.HemisphereLight(0xd8e4ff, 0x302820, 1.0));
    const key = new THREE.DirectionalLight(0xffe8d0, 2.4);
    key.position.set(-1, 2, 2);
    this.scene.add(key);
    this.fill = new THREE.DirectionalLight(0x6fb0ff, 0.9);
    this.fill.position.set(2, 0.5, 1);
    this.scene.add(this.fill);
    this.rim = new THREE.DirectionalLight(0xff3020, 0);
    this.rim.position.set(0, 1, -2);
    this.scene.add(this.rim);
    this.build();
    this.t = 0;
    this.blinkT = 2;
    this.talkT = 0;
    this.staticT = 0.4;
    this.lookT = 0;
    this.lookTarget = 0;
    this.yaw = 0;

    this.canvas = document.createElement('canvas');
    this.canvas.width = PW;
    this.canvas.height = PH;
    this.ctx = this.canvas.getContext('2d');
    this.noise = document.createElement('canvas');
    this.noise.width = PW;
    this.noise.height = PH;
    this.nctx = this.noise.getContext('2d');
  }

  build() {
    const skin = lam(0xdcaa86);
    const skinDark = lam(0xc89474);
    const hair = lam(0x5f3e22);
    const hairHi = lam(0x7a5530);
    const maroon = lam(0x7a1f26);
    const navy = lam(0x2b3b6b);
    const plate = lam(0x5d646b);
    const plateDark = lam(0x3d4247);

    const bust = (this.bust = new THREE.Group());
    this.scene.add(bust);

    // torso & armor (only the top is in frame)
    bust.add(cube(0.44, 0.3, 0.24, maroon, 0, 1.3, -0.03));
    bust.add(cube(0.15, 0.3, 0.25, navy, -0.15, 1.3, -0.01));
    bust.add(cube(0.15, 0.3, 0.25, navy, 0.15, 1.3, -0.01));
    bust.add(cube(0.3, 0.12, 0.07, plate, 0, 1.4, 0.1));
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.11, 0.08, 16), plateDark);
    collar.position.set(0, 1.48, -0.005);
    bust.add(collar);
    bust.add(cube(0.46, 0.05, 0.22, plateDark, 0, 1.45, -0.02));
    const paul = ball(0.1, plate, 0.22, 1.45, -0.01, 1.0, 0.6, 1.0);
    bust.add(paul);
    const crest = canvasTexture(32, 32, (c) => {
      c.strokeStyle = '#c0282e';
      c.fillStyle = '#c0282e';
      c.lineWidth = 3;
      c.beginPath();
      c.arc(16, 16, 11, 0, Math.PI * 2);
      c.stroke();
      c.beginPath();
      c.arc(16, 16, 4, 0, Math.PI * 2);
      c.fill();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        c.beginPath();
        c.moveTo(16 + Math.cos(a) * 4, 16 + Math.sin(a) * 4);
        c.lineTo(16 + Math.cos(a) * 14, 16 + Math.sin(a) * 14);
        c.stroke();
      }
    });
    const decal = new THREE.Mesh(new THREE.CircleGeometry(0.045, 16), new THREE.MeshLambertMaterial({ map: crest, transparent: true }));
    decal.position.set(0.25, 1.46, 0.085);
    decal.rotation.y = 0.5;
    bust.add(decal);
    bust.add(ball(0.09, maroon, -0.22, 1.42, -0.02, 1, 0.75, 1));

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.064, 0.14, 14), skinDark);
    neck.position.set(0, 1.535, -0.01);
    bust.add(neck);

    // head: one sculpted sphere (jaw taper, chin, eye sockets, brow ridge)
    const head = (this.head = new THREE.Group());
    head.position.set(0, 1.6, 0);
    bust.add(head);
    const eyeC = [[-0.36, 0.1, 0.9], [0.36, 0.1, 0.9]];
    const face = shaped(0.1, 40, 30, (x, y, z) => {
      y *= 1.12;
      if (y < 0) {
        const k = -y / 1.12;
        x *= 1 - 0.2 * k * k;
        if (z > 0) z *= 1 - 0.12 * k;
        if (k > 0.6 && z > 0.3) z += 0.1 * (k - 0.6);
      }
      if (z < 0) z *= 1.1;
      x *= 0.94;
      for (const [ex, ey, ez] of eyeC) {
        const d = Math.hypot(x - ex, y - ey * 1.12, z - ez);
        if (d < 0.28) z -= 0.05 * (1 - d / 0.28);
      }
      if (y > 0.2 && y < 0.38 && z > 0.6) z += 0.03;
      return [x, y, z];
    });
    face.material = skin;
    face.position.set(0, 0.075, 0);
    head.add(face);
    // nose
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.05, 4), skin);
    nose.rotation.x = -0.35;
    nose.rotation.y = Math.PI / 4;
    nose.position.set(0, 0.06, 0.098);
    nose.scale.set(1, 1, 0.8);
    head.add(nose);
    head.add(ball(0.011, skin, 0, 0.04, 0.104, 1.3, 0.8, 0.9, 10));
    head.add(ball(0.02, skin, -0.088, 0.07, -0.005, 0.45, 1, 0.8, 8));
    head.add(ball(0.02, skin, 0.088, 0.07, -0.005, 0.45, 1, 0.8, 8));

    // eyes
    this.irisMat = lam(0x3f7bc4, { emissive: 0x000000 });
    const white = lam(0xeee8e0);
    const dark = lam(0x120e0c);
    this.eyes = [];
    for (const sx of [-1, 1]) {
      const g = new THREE.Group();
      g.position.set(sx * 0.033, 0.086, 0.084);
      g.add(ball(0.0145, white, 0, 0, 0, 1.25, 0.72, 0.55, 12));
      g.add(ball(0.0078, this.irisMat, 0, 0, 0.0055, 1, 1, 0.5, 10));
      g.add(ball(0.0036, dark, 0, 0, 0.0085, 1, 1, 0.4, 6));
      head.add(g);
      const lid = cube(0.036, 0.014, 0.012, skin, sx * 0.033, 0.107, 0.088);
      head.add(lid);
      this.eyes.push({ g, lid, sx });
      const brow = cube(0.042, 0.01, 0.014, lam(0x3e2716), sx * 0.035, 0.113, 0.09);
      brow.rotation.z = sx * -0.15;
      head.add(brow);
    }
    // the scar over his right eye (viewer's left)
    const scar = cube(0.003, 0.052, 0.004, lam(0xa0584c), -0.04, 0.09, 0.09);
    scar.rotation.z = 0.15;
    head.add(scar);
    // mouth
    head.add(cube(0.036, 0.006, 0.008, lam(0xb07464), 0, 0.006, 0.088));
    this.mouth = cube(0.03, 0.004, 0.008, lam(0x4a1a18), 0, 0.012, 0.09);
    head.add(this.mouth);

    // hair: wavy shell with an open face, falling to the neck, plus side locks
    const shell = shaped(0.112, 36, 26, (x, y, z) => {
      const a = Math.atan2(x, z);
      const w = 1 + 0.07 * Math.sin(a * 6 + y * 6) + 0.03 * Math.sin(a * 13);
      y *= 1.12;
      if (y < 0 && z < 0.4) y *= 1 + 0.9 * Math.min(1, -y);
      if (z < 0) z *= 1.12;
      return [x * w * 0.95, y, z * w];
    }, ([x, y, z]) => !(z > 0.2 && y < 0.5 && Math.abs(x) < 0.78) && y > -0.85);
    shell.material = new THREE.MeshLambertMaterial({ color: 0x5f3e22, side: THREE.DoubleSide });
    shell.position.set(0, 0.09, -0.006);
    head.add(shell);
    for (const sx of [-1, 1]) {
      const lock = ball(0.034, sx < 0 ? hair : hairHi, sx * 0.09, 0.07, 0.03, 0.35, 1.4, 0.6, 12);
      lock.rotation.z = sx * 0.12;
      head.add(lock);
      head.add(ball(0.035, hair, sx * 0.085, 0.0, -0.01, 0.5, 1.2, 0.8, 10));
    }
    const fringe = ball(0.04, hairHi, 0.02, 0.17, 0.07, 1.2, 0.35, 0.6, 12);
    fringe.rotation.z = -0.3;
    head.add(fringe);
    head.add(ball(0.035, hair, -0.04, 0.172, 0.062, 1.0, 0.4, 0.6, 10));
  }

  talk(dur) {
    this.talkT = dur;
    this.staticT = Math.max(this.staticT, 0.18);
  }

  hurt() {
    this.staticT = Math.max(this.staticT, 0.3);
  }

  update(dt, darkness = 0, dead = false) {
    this.t += dt;
    this.blinkT -= dt;
    if (this.blinkT < -0.12) this.blinkT = 2 + Math.random() * 4;
    this.lookT -= dt;
    if (this.lookT <= 0) {
      this.lookT = 1.5 + Math.random() * 3;
      this.lookTarget = (Math.random() - 0.5) * 0.7;
    }
    this.yaw += (this.lookTarget - this.yaw) * Math.min(1, dt * 3);
    this.head.rotation.y = this.yaw + Math.sin(this.t * 0.7) * 0.05;
    this.head.rotation.x = Math.sin(this.t * 0.5) * 0.04 + (dead ? 0.5 : 0);
    this.head.rotation.z = Math.sin(this.t * 0.37) * 0.03;
    this.bust.rotation.y = -0.15 + Math.sin(this.t * 0.3) * 0.03;
    this.bust.position.y = Math.sin(this.t * 1.6) * 0.002;
    const blink = this.blinkT < 0 || dead;
    for (const e of this.eyes) {
      e.lid.position.y = blink ? 0.09 : 0.107;
      e.lid.scale.y = blink ? 1.5 : 1;
      e.g.children[1].position.x = this.yaw * 0.006;
      e.g.children[2].position.x = this.yaw * 0.006;
    }
    if (this.talkT > 0) {
      this.talkT -= dt;
      this.mouth.scale.y = 1 + Math.abs(Math.sin(this.t * 17)) * 3.5;
    } else this.mouth.scale.y = 1;
    if (this.staticT > 0) this.staticT -= dt;
    // the dark side shows in his eyes
    const k = Math.max(0, (darkness - 40) / 60);
    const blue = new THREE.Color(0x4a80c8);
    const sith = new THREE.Color(0xf0b020);
    this.irisMat.color.copy(blue).lerp(sith, k);
    this.irisMat.emissive.setRGB(0.5 * k, 0.25 * k, 0);
    this.rim.intensity = k * 2.2;
    this.fill.intensity = 0.9 * (1 - k * 0.7);
  }

  /** Draw the portrait (with CRT treatment) into a target 2D context. */
  draw(target, w, h) {
    const src = this.baker.renderTo(this.scene, this.camera, PW, PH);
    const c = this.ctx;
    const grd = c.createRadialGradient(PW / 2, PH * 0.45, 4, PW / 2, PH / 2, PW * 0.75);
    grd.addColorStop(0, '#1c2a33');
    grd.addColorStop(1, '#05080a');
    c.fillStyle = grd;
    c.fillRect(0, 0, PW, PH);
    c.drawImage(src, 0, 0, PW, PH);
    // static
    if (this.staticT > 0) {
      const n = this.nctx;
      const img = n.createImageData(PW, PH);
      const a = Math.min(1, this.staticT * 4);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = Math.random() * 255;
        img.data[i] = v * 0.8;
        img.data[i + 1] = v;
        img.data[i + 2] = v * 0.9;
        img.data[i + 3] = Math.random() < 0.7 * a ? 200 : 0;
      }
      n.putImageData(img, 0, 0);
      c.drawImage(this.noise, 0, 0);
    }
    // scanlines + rolling bar
    c.fillStyle = 'rgba(0,0,0,0.22)';
    for (let y = 0; y < PH; y += 2) c.fillRect(0, y, PW, 1);
    const bar = (this.t * 22) % (PH + 20) - 10;
    c.fillStyle = 'rgba(160,255,200,0.05)';
    c.fillRect(0, bar, PW, 6);
    // green phosphor tint
    c.fillStyle = 'rgba(40,120,80,0.08)';
    c.fillRect(0, 0, PW, PH);

    target.imageSmoothingEnabled = false;
    target.drawImage(this.canvas, 0, 0, w, h);
  }
}
