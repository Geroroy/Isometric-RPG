// Sprite baker: renders low-poly Three.js models through an isometric
// orthographic camera into trimmed, outlined, posterized sprite frames that
// are shelf-packed into atlas pages. This mimics the pre-rendered 3D sprite
// workflow of StarCraft / Diablo II, but happens at load time in the browser.
import * as THREE from 'three';
import { PX_PER_UNIT, CAM_ELEVATION } from '../core/iso.js';
import { detail } from './models/parts.js';

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
    this.scene.add(new THREE.HemisphereLight(0xdfe4ef, 0x3a2e24, 0.95));
    const key = new THREE.DirectionalLight(0xffe6c8, 3.1);
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

  dispose() {
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }

  get pages() {
    return this.packer.pages;
  }

  setFrame(fw, fh, ax, ay, ss = 1, tiles = [1, 1]) {
    const W = fw * ss * tiles[0];
    const H = fh * ss * tiles[1];
    if (this.size[0] !== W || this.size[1] !== H) {
      this.renderer.setSize(W, H, false);
      this.scratch.width = W;
      this.scratch.height = H;
      this.size = [W, H];
    }
    this.ss = ss;
    this.tiles = tiles;
    const s = PX_PER_UNIT;
    const cam = this.camera;
    cam.left = -ax / s;
    cam.right = (fw - ax) / s;
    cam.top = ay / s;
    cam.bottom = -(fh - ay) / s;
    cam.updateProjectionMatrix();
    this.frame = { fw, fh, ax, ay };
  }

  /** Render the holder into tile i of the batch canvas. */
  renderTile(i) {
    const { fw, fh } = this.frame;
    const ss = this.ss;
    const [cols, rows] = this.tiles;
    const tw = fw * ss;
    const th = fh * ss;
    const x = (i % cols) * tw;
    const y = (rows - 1 - Math.floor(i / cols)) * th; // GL viewport origin is bottom-left
    const r = this.renderer;
    r.setScissorTest(true);
    r.setViewport(x, y, tw, th);
    r.setScissor(x, y, tw, th);
    r.render(this.scene, this.camera);
  }

  /** Read the whole batch canvas back once; returns per-tile fw×fh buffers. */
  readTiles(n) {
    const { fw, fh } = this.frame;
    const ss = this.ss;
    const [cols] = this.tiles;
    const ctx = this.sctx;
    ctx.clearRect(0, 0, this.size[0], this.size[1]);
    ctx.drawImage(this.renderer.domElement, 0, 0);
    const out = [];
    for (let i = 0; i < n; i++) {
      const src = ctx.getImageData((i % cols) * fw * ss, Math.floor(i / cols) * fh * ss, fw * ss, fh * ss);
      out.push(ss > 1 ? downsample(src.data, fw, fh, ss) : src.data);
    }
    return out;
  }

  /** Screen-space (frame-relative) and world positions of visible markers. */
  snapMarkers(markerObjs) {
    const { fw, fh, ax, ay } = this.frame;
    const markers = {};
    const markersW = {};
    for (const m of markerObjs) {
      let vis = true;
      for (let o = m; o; o = o.parent) if (!o.visible) vis = false;
      if (!vis) continue;
      m.getWorldPosition(this.tmpV);
      markersW[m.name] = { w: this.tmpV.clone() };
      this.tmpV.project(this.camera);
      markers[m.name] = [((this.tmpV.x + 1) / 2) * fw - ax, ((1 - this.tmpV.y) / 2) * fh - ay];
    }
    return { markers, markersW };
  }

  /** Render whatever is in `holder` and pack it. Returns a frame record. */
  capture(markerObjs = [], opts = {}) {
    this.renderer.clear();
    this.renderTile(0);
    const { markers } = this.snapMarkers(markerObjs);
    return this.pack(this.readTiles(1)[0], markers, opts);
  }

  /** Trim, posterize/dither, outline and pack one fw×fh RGBA buffer. */
  pack(d, markers, opts = {}) {
    const { fw, fh, ax, ay } = this.frame;
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
        const rgb = isGlowPx(d, si) ? [d[si], d[si + 1], d[si + 2]] : grade(d[si], d[si + 1], d[si + 2]);
        for (let c = 0; c < 3; c++) {
          const v = rgb[c] + t;
          o[di + c] = Math.max(0, Math.min(255, Math.round(v / (255 / levels)) * (255 / levels)));
        }
        o[di + 3] = d[si + 3] > 127 ? 255 : d[si + 3];
      }
    }
    if (pad) {
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
            if (o[ni + 3] === 255 && !isGlowPx(o, ni)) solid++;
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
    return { page: slot.page, sx: slot.x, sy: slot.y, w, h, ox: ax - (x0 - pad), oy: ay - (y0 - pad), markers };
  }

  /**
   * Which stretches of each saber blade (base→tip, 0..1) are in front of the
   * body: rays from points along the blade towards the camera that hit any
   * other visible mesh are hidden. The renderer draws the glow only there.
   */
  bladeVisibility(model, markers, occluders) {
    const out = {};
    const ray = this.raycaster || (this.raycaster = new THREE.Raycaster());
    const toCam = this.camera.getWorldDirection(new THREE.Vector3()).negate();
    const vis = occluders.filter((m) => {
      for (let o = m; o; o = o.parent) if (!o.visible) return false;
      return true;
    });
    for (const k of ['saber', 'saber2']) {
      const b = markers[k + 'Base'];
      const t = markers[k + 'Tip'];
      if (!b || !t) continue;
      const N = 14;
      const segs = [];
      let start = -1;
      for (let i = 0; i <= N; i++) {
        const f = i / N;
        const p = b.w.clone().lerp(t.w, f);
        ray.set(p, toCam);
        const hidden = ray.intersectObjects(vis, false).length > 0;
        if (!hidden && start < 0) start = f;
        if ((hidden || i === N) && start >= 0) {
          segs.push([start, hidden ? (i - 0.5) / N : 1]);
          start = -1;
        }
      }
      out[k] = segs;
    }
    return out;
  }

  /**
   * Bake an animated model.
   * spec: { model: {root, applyPose, toggles}, dirs, frame: [fw, fh, ax, ay],
   *         anims: { name: { frames, fps, loop, pose(t) } }, markers: [names] }
   */
  *bakeAnimated(spec) {
    const { model, dirs } = spec;
    const [fw, fh, ax, ay] = spec.frame;
    detail(model.root);
    this.holder.add(model.root);
    // all directions of one animation frame render into one canvas and are
    // read back together (one GPU sync per pose instead of one per sprite)
    const cols = Math.min(dirs, 4);
    const rows = Math.ceil(dirs / cols);
    this.setFrame(fw, fh, ax, ay, spec.ss || 1, [cols, rows]);
    const markerObjs = [];
    const occluders = [];
    model.root.traverse((o) => {
      if (spec.markers && spec.markers.includes(o.name)) markerObjs.push(o);
      if (o.isMesh) {
        let inSaber = false;
        for (let p = o; p; p = p.parent) if (p.userData.blade) inSaber = true;
        if (!inSaber) occluders.push(o);
      }
    });
    const blades = spec.markers && spec.markers.includes('saberTip');
    const out = { dirs, anims: {} };
    for (const [name, a] of Object.entries(spec.anims)) {
      const data = Array.from({ length: dirs }, () => []);
      for (let f = 0; f < a.frames; f++) {
        const t = a.loop ? f / a.frames : a.frames > 1 ? f / (a.frames - 1) : 0;
        const p = a.pose(t);
        this.renderer.setScissorTest(false);
        this.renderer.clear();
        const meta = [];
        for (let di = 0; di < dirs; di++) {
          model.root.rotation.y = -(di * Math.PI * 2) / dirs;
          model.applyPose(p);
          model.root.updateMatrixWorld(true);
          this.renderTile(di);
          const { markers, markersW } = this.snapMarkers(markerObjs);
          meta.push({ markers, blades: blades ? this.bladeVisibility(model, markersW, occluders) : null });
        }
        const bufs = this.readTiles(dirs);
        for (let di = 0; di < dirs; di++) {
          const fr = this.pack(bufs[di], meta[di].markers, spec.captureOpts);
          if (meta[di].blades) fr.blades = meta[di].blades;
          data[di].push(fr);
        }
        yield;
      }
      out.anims[name] = { frames: a.frames, fps: a.fps, loop: a.loop, hit: a.hit, data };
    }
    this.renderer.setScissorTest(false);
    this.holder.remove(model.root);
    return out;
  }

  /** Bake a static object from N viewing angles (variants). */
  bakeStatic(object, { angles = [0], margin = 4, outline = true, posterize } = {}) {
    detail(object);
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
      this.renderer.setScissorTest(false);
    }
    this.holder.remove(object);
    return frames;
  }
}

/**
 * Box-filter an ss×ss supersampled RGBA buffer down to fw×fh. A pixel is kept
 * if at least half its samples are covered — or any of them is blade glow, so
 * thin saber blades stay continuous.
 */
function downsample(src, fw, fh, ss) {
  const out = new Uint8ClampedArray(fw * fh * 4);
  const W = fw * ss;
  const n = ss * ss;
  for (let y = 0; y < fh; y++) {
    for (let x = 0; x < fw; x++) {
      let r = 0, g = 0, b = 0, cov = 0, glow = false;
      for (let sy = 0; sy < ss; sy++) {
        let i = ((y * ss + sy) * W + x * ss) * 4;
        for (let sx = 0; sx < ss; sx++, i += 4) {
          if (src[i + 3] === 0) continue;
          cov++;
          r += src[i];
          g += src[i + 1];
          b += src[i + 2];
          if (isGlowPx(src, i)) glow = true;
        }
      }
      if (cov * 2 < n && !glow) continue;
      const o = (y * fw + x) * 4;
      out[o] = r / cov;
      out[o + 1] = g / cov;
      out[o + 2] = b / cov;
      out[o + 3] = 255;
    }
  }
  return out;
}

/** Saber cores (blue or red) are near-white and saturated in one channel. */
function isGlowPx(a, i) {
  const r = a[i], g = a[i + 1], b = a[i + 2];
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  return mn >= 185 && mx >= 250 && mx - mn <= 80;
}

/**
 * Fallout 1/2-style grade: slightly desaturated, warm, contrasty. Glowing
 * parts (sabers, lights) keep their colour.
 */
function grade(r, g, b) {
  const l = r * 0.3 + g * 0.59 + b * 0.11;
  const k = 0.8;
  const c = (v) => Math.max(0, Math.min(255, 128 + (v - 128) * 1.14));
  return [c((l + (r - l) * k) * 1.03), c(l + (g - l) * k), c((l + (b - l) * k) * 0.95)];
}
