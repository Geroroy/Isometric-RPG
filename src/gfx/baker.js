// Sprite baker: renders low-poly Three.js models through an isometric
// orthographic camera into trimmed, outlined, posterized sprite frames that
// are shelf-packed into atlas pages. This mimics the pre-rendered 3D sprite
// workflow of StarCraft / Diablo II, but happens at load time in the browser.
import * as THREE from 'three';
import { PX_PER_UNIT, CAM_ELEVATION } from '../core/iso.js';

const PAGE = 2048;

class AtlasPacker {
  constructor() {
    this.pages = [];
    this.newPage();
  }
  newPage() {
    const c = document.createElement('canvas');
    c.width = PAGE;
    c.height = PAGE;
    this.page = c;
    this.ctx = c.getContext('2d');
    this.pages.push(c);
    this.x = 0;
    this.y = 0;
    this.rowH = 0;
  }
  alloc(w, h) {
    if (this.x + w > PAGE) {
      this.x = 0;
      this.y += this.rowH + 1;
      this.rowH = 0;
    }
    if (this.y + h > PAGE) this.newPage();
    const r = { page: this.page, ctx: this.ctx, x: this.x, y: this.y };
    this.x += w + 1;
    this.rowH = Math.max(this.rowH, h);
    return r;
  }
}

export class Baker {
  constructor() {
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: true,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x000000, 0);

    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xe6ecff, 0x40342a, 1.25));
    const key = new THREE.DirectionalLight(0xfff1dc, 2.6);
    key.position.set(-1.5, 5, 4.5);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x8fb4ff, 0.9);
    rim.position.set(-4, 2.5, -3);
    this.scene.add(rim);

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
    const D = 50;
    this.camera.position.set(
      D * Math.cos(CAM_ELEVATION) * Math.SQRT1_2,
      D * Math.sin(CAM_ELEVATION),
      D * Math.cos(CAM_ELEVATION) * Math.SQRT1_2,
    );
    this.camera.lookAt(0, 0, 0);

    this.packer = new AtlasPacker();
    this.scratch = document.createElement('canvas');
    this.sctx = this.scratch.getContext('2d', { willReadFrequently: true });
    this.holder = new THREE.Group();
    this.scene.add(this.holder);
    this.tmpV = new THREE.Vector3();
    this.size = [0, 0];
  }

  get pages() {
    return this.packer.pages;
  }

  setFrame(fw, fh, ax, ay) {
    if (this.size[0] !== fw || this.size[1] !== fh) {
      this.renderer.setSize(fw, fh, false);
      this.scratch.width = fw;
      this.scratch.height = fh;
      this.size = [fw, fh];
    }
    const s = PX_PER_UNIT;
    const cam = this.camera;
    cam.left = -ax / s;
    cam.right = (fw - ax) / s;
    cam.top = ay / s;
    cam.bottom = -(fh - ay) / s;
    cam.updateProjectionMatrix();
    this.frame = { fw, fh, ax, ay };
  }

  /** Render whatever is in `holder` and pack it. Returns a frame record. */
  capture(markerObjs = [], opts = {}) {
    const { fw, fh, ax, ay } = this.frame;
    this.renderer.render(this.scene, this.camera);
    const ctx = this.sctx;
    ctx.clearRect(0, 0, fw, fh);
    ctx.drawImage(this.renderer.domElement, 0, 0);
    const src = ctx.getImageData(0, 0, fw, fh);
    const d = src.data;

    let x0 = fw, y0 = fh, x1 = -1, y1 = -1;
    for (let y = 0; y < fh; y++) {
      for (let x = 0; x < fw; x++) {
        if (d[(y * fw + x) * 4 + 3] > 0) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    const markers = {};
    for (const m of markerObjs) {
      let vis = true;
      for (let o = m; o; o = o.parent) if (!o.visible) vis = false;
      if (!vis) continue;
      m.getWorldPosition(this.tmpV);
      this.tmpV.project(this.camera);
      markers[m.name] = [
        ((this.tmpV.x + 1) / 2) * fw - ax,
        ((1 - this.tmpV.y) / 2) * fh - ay,
      ];
    }
    if (x1 < 0) {
      return { page: this.packer.page, sx: 0, sy: 0, w: 1, h: 1, ox: 0, oy: 0, markers, empty: true };
    }

    const pad = opts.outline === false ? 0 : 1;
    const w = x1 - x0 + 1 + pad * 2;
    const h = y1 - y0 + 1 + pad * 2;
    const out = new ImageData(w, h);
    const o = out.data;
    const levels = opts.posterize ?? 20;
    const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const si = (y * fw + x) * 4;
        if (d[si + 3] === 0) continue;
        const di = ((y - y0 + pad) * w + (x - x0 + pad)) * 4;
        const t = (bayer[(y & 3) * 4 + (x & 3)] / 16 - 0.5) * (255 / levels);
        for (let c = 0; c < 3; c++) {
          const v = d[si + c] + t;
          o[di + c] = Math.max(0, Math.min(255, Math.round(v / (255 / levels)) * (255 / levels)));
        }
        o[di + 3] = d[si + 3] > 127 ? 255 : d[si + 3];
      }
    }
    if (pad) {
      const isGlow = (i) => o[i] > 170 && o[i + 1] > 200 && o[i + 2] > 225;
      const add = [];
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          if (o[i + 3] !== 0) continue;
          let solid = 0;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const ni = (ny * w + nx) * 4;
            if (o[ni + 3] === 255 && !isGlow(ni)) solid++;
          }
          if (solid) add.push(i);
        }
      }
      for (const i of add) {
        o[i] = 14;
        o[i + 1] = 11;
        o[i + 2] = 16;
        o[i + 3] = 150;
      }
    }
    const slot = this.packer.alloc(w, h);
    slot.ctx.putImageData(out, slot.x, slot.y);
    return {
      page: slot.page,
      sx: slot.x,
      sy: slot.y,
      w,
      h,
      ox: ax - (x0 - pad),
      oy: ay - (y0 - pad),
      markers,
    };
  }

  /**
   * Bake an animated model.
   * spec: { model: {root, applyPose, toggles}, dirs, frame: [fw, fh, ax, ay],
   *         anims: { name: { frames, fps, loop, pose(t) } }, markers: [names] }
   */
  *bakeAnimated(spec) {
    const { model, dirs } = spec;
    const [fw, fh, ax, ay] = spec.frame;
    this.holder.add(model.root);
    this.setFrame(fw, fh, ax, ay);
    const markerObjs = [];
    model.root.traverse((o) => {
      if (spec.markers && spec.markers.includes(o.name)) markerObjs.push(o);
    });
    const out = { dirs, anims: {} };
    for (const [name, a] of Object.entries(spec.anims)) {
      const data = [];
      for (let di = 0; di < dirs; di++) {
        const row = [];
        model.root.rotation.y = -(di * Math.PI * 2) / dirs;
        for (let f = 0; f < a.frames; f++) {
          const t = a.loop ? f / a.frames : a.frames > 1 ? f / (a.frames - 1) : 0;
          model.applyPose(a.pose(t));
          model.root.updateMatrixWorld(true);
          row.push(this.capture(markerObjs, spec.captureOpts));
          yield;
        }
        data.push(row);
      }
      out.anims[name] = { frames: a.frames, fps: a.fps, loop: a.loop, hit: a.hit, data };
    }
    this.holder.remove(model.root);
    return out;
  }

  /** Bake a static object from N viewing angles (variants). */
  bakeStatic(object, { angles = [0], margin = 4, outline = true, posterize } = {}) {
    this.holder.add(object);
    const frames = [];
    for (const ang of angles) {
      object.rotation.y = ang;
      object.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(object);
      // project the 8 corners to find pixel extents relative to origin
      const s = PX_PER_UNIT;
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const x of [box.min.x, box.max.x]) {
        for (const y of [box.min.y, box.max.y]) {
          for (const z of [box.min.z, box.max.z]) {
            const sx = (x - z) * Math.SQRT1_2 * s;
            const sy = (x + z) * Math.SQRT1_2 * Math.sin(CAM_ELEVATION) * s - y * Math.cos(CAM_ELEVATION) * s;
            minX = Math.min(minX, sx);
            maxX = Math.max(maxX, sx);
            minY = Math.min(minY, sy);
            maxY = Math.max(maxY, sy);
          }
        }
      }
      const ax = Math.ceil(-minX) + margin;
      const ay = Math.ceil(-minY) + margin;
      const fw = Math.ceil(maxX) + ax + margin;
      const fh = Math.ceil(maxY) + ay + margin;
      this.setFrame(fw, fh, ax, ay);
      frames.push(this.capture([], { outline, posterize }));
    }
    this.holder.remove(object);
    return frames;
  }

  /** Render a scene/camera pair directly (used by the live portrait). */
  renderTo(scene, camera, w, h) {
    if (this.size[0] !== w || this.size[1] !== h) {
      this.renderer.setSize(w, h, false);
      this.size = [w, h];
    }
    this.renderer.render(scene, camera);
    return this.renderer.domElement;
  }
}
