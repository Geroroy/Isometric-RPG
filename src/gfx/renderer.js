// World renderer: low-resolution canvas (scaled up with nearest-neighbour for
// chunky pixels), depth-sorted sprites, Diablo-style light map and additive
// glow pass for sabers, blaster bolts and Force effects.
import { worldToScreen, screenToWorld } from '../core/iso.js';
import { Terrain } from './terrain.js';
import { PROPS } from './models/props.js';
import { dist } from '../core/math.js';

const AMBIENT = [150, 146, 178];
export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 2.5;

export class Renderer {
  constructor(game, assets, canvas, overlay) {
    this.game = game;
    this.assets = assets;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.overlay = overlay;
    this.octx = overlay.getContext('2d');
    this.light = document.createElement('canvas');
    this.lctx = this.light.getContext('2d');
    this.terrain = new Terrain(game.world);
    this.cam = { x: 0, y: 0 };
    this.drift = { x: 0, y: 0 };
    this.clickMarks = [];
    this.consoleH = 0;
    this.time = 0;
    this.zoom = 1;
    this.touchMode = false;
    this.prepareProps();
    this.resize();
  }

  prepareProps() {
    for (const p of this.game.world.props) this.placeProp(p);
  }

  /** Screen placement of a prop (again after a cutscene moves one). */
  placeProp(p) {
    {
      const frames = this.assets.props[p.type];
      p.frame = frames[p.frameIdx % frames.length];
      const s = worldToScreen(p.x, p.y);
      p.sx = s.x;
      p.sy = s.y;
      p.rect = [s.x - p.frame.ox, s.y - p.frame.oy, p.frame.w, p.frame.h];
      // big structures sort by their front-most footprint corner minus a bit
      const def = PROPS[p.type];
      const rect = def.rectByAngle ? def.rectByAngle[p.angleIdx] : def.rect;
      p.sortDepth = p.x + p.y + (rect ? Math.min(rect[0], rect[1]) * 0.35 : 0);
    }
  }

  /**
   * How many device pixels one game pixel covers. Integer upscaling keeps the
   * pixels crisp on high-DPI phones. The view shows about BASE_H game pixels
   * vertically (fewer on phones so characters read at arm's length — tuned for
   * a Galaxy S25 Ultra in landscape), divided by the user's zoom.
   */
  computeDevScale() {
    const H = window.innerHeight * (window.devicePixelRatio || 1);
    // touch: ~240 rows on a phone (S25 Ultra), up to the PC view on tablets
    const baseH = this.touchMode ? Math.max(240, Math.min(450, window.innerHeight * 0.58)) : 450;
    return Math.max(1, Math.min(14, Math.round(H / (baseH / this.zoom))));
  }

  /** Change the zoom; only reallocates the canvases when the pixel scale changes. */
  setZoom(z) {
    this.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
    if (this.computeDevScale() !== this.devScale) this.resize();
    return this.zoom;
  }

  resize() {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;
    this.dpr = dpr;
    const devScale = (this.devScale = this.computeDevScale());
    // `scale` is CSS px per game pixel (may be fractional on high-DPI screens)
    this.scale = devScale / dpr;
    this.w = Math.ceil((W * dpr) / devScale);
    this.h = Math.ceil((H * dpr) / devScale);
    this.canvas.width = this.w;
    this.canvas.height = this.h;
    this.canvas.style.width = this.w * this.scale + 'px';
    this.canvas.style.height = this.h * this.scale + 'px';
    this.light.width = this.w;
    this.light.height = this.h;
    this.overlay.width = Math.round(W * dpr);
    this.overlay.height = Math.round(H * dpr);
    this.overlay.style.width = W + 'px';
    this.overlay.style.height = H + 'px';
    this.ctx.imageSmoothingEnabled = false;
  }

  /** CSS pixel → world coordinates. */
  screenToWorldPos(mx, my) {
    const ix = mx / this.scale + this.cam.x;
    const iy = my / this.scale + this.cam.y;
    return screenToWorld(ix, iy);
  }

  addClickMark(x, y, color = '#cfe9ff') {
    this.clickMarks.push({ x, y, t: 0, color });
  }

  /** Find the unit whose sprite is under the mouse (CSS px). */
  pick(mx, my, filter) {
    const ix = mx / this.scale + this.cam.x;
    const iy = my / this.scale + this.cam.y;
    let best = null;
    let bestDepth = -Infinity;
    for (const u of this.game.activeUnits) {
      if (u.dead || !filter(u)) continue;
      const s = worldToScreen(u.x, u.y, u.z);
      const hw = u.kind === 'b2' ? 13 : 10;
      const hh = u.kind === 'b2' ? 56 : u.kind === 'r2' ? 26 : 50;
      if (ix >= s.x - hw && ix <= s.x + hw && iy >= s.y - hh && iy <= s.y + 6) {
        const d = u.x + u.y;
        if (d > bestDepth) {
          bestDepth = d;
          best = u;
        }
      }
    }
    return best;
  }

  render(dt) {
    this.time += dt;
    const g = this.game;
    const p = g.player;
    const ctx = this.ctx;
    const W = this.w;
    const H = this.h;
    const f = g.camFocus; // a cutscene's camera
    const ps = f ? worldToScreen(f.x, f.y, 0) : worldToScreen(p.x, p.y, p.z * 0.4);
    const viewH = H - (g.cinema ? 0 : this.consoleH) / this.scale; // cutscenes use the whole screen
    const sh = g.fx.shakeAmt;
    const dr = this.drift; // slow title-screen camera move, in game pixels
    this.cam.x = Math.round(ps.x - W / 2 + dr.x + (sh ? (Math.random() - 0.5) * sh : 0));
    this.cam.y = Math.round(ps.y - viewH * (this.touchMode ? 0.6 : 0.55) + dr.y + (sh ? (Math.random() - 0.5) * sh : 0));
    const cam = this.cam;

    ctx.fillStyle = '#07070a';
    ctx.fillRect(0, 0, W, H);
    this.terrain.draw(ctx, cam.x, cam.y, W, H);
    g.fx.drawDecals(ctx, cam);

    const inView = (x, y, w, h) => x + w > cam.x - 4 && x < cam.x + W + 4 && y + h > cam.y - 4 && y < cam.y + H + 4;

    // --- flat layer: pads, debris, corpses
    const standing = [];
    for (const pr of g.world.props) {
      if (pr.hidden) continue; // placed but not shown yet (scripted)
      const [rx, ry, rw, rh] = pr.rect;
      if (!inView(rx, ry, rw, rh)) continue;
      if (pr.flat) this.drawFrame(pr.frame, pr.sx, pr.sy);
      else standing.push({ depth: pr.sortDepth, prop: pr });
    }
    for (const u of g.activeUnits) {
      if (!u.dead) continue;
      const s = worldToScreen(u.x, u.y);
      if (!inView(s.x - 40, s.y - 60, 80, 80)) continue;
      const fade = u.team === 'cis' ? Math.min(1, (14 - u.deathT) / 2) : Math.min(1, (4 - u.deathT) / 1);
      ctx.globalAlpha = Math.max(0, fade);
      this.drawFrame(u.frame(), s.x, s.y);
      ctx.globalAlpha = 1;
    }

    // --- ground markers: selection ellipses, click marks, strike targets
    this.drawGroundMarkers(ctx, cam);

    // --- shadows
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    for (const u of g.activeUnits) {
      if (u.dead) continue;
      const s = worldToScreen(u.x, u.y);
      const r = u.kind === 'b2' ? 11 : u.kind === 'r2' ? 7 : 9;
      const k = 1 / (1 + u.z * 0.4);
      ctx.beginPath();
      ctx.ellipse(s.x - cam.x, s.y - cam.y, r * k, r * 0.5 * k, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const pk of g.pickups) {
      const s = worldToScreen(pk.x, pk.y);
      ctx.beginPath();
      ctx.ellipse(s.x - cam.x, s.y - cam.y, 4, 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // --- depth-sorted standing objects
    for (const u of g.activeUnits) if (!u.dead) standing.push({ depth: u.x + u.y, unit: u });
    for (const pk of g.pickups) standing.push({ depth: pk.x + pk.y, pickup: pk });
    standing.sort((a, b) => a.depth - b.depth);
    const pDepth = p.x + p.y;
    for (const d of standing) {
      if (d.prop) {
        const pr = d.prop;
        // Diablo-style: fade structures that hide the player.
        let alpha = 1;
        if (d.depth > pDepth && !p.dead) {
          const [rx, ry, rw, rh] = pr.rect;
          if (ps.x > rx + 4 && ps.x < rx + rw - 4 && ps.y - 30 > ry && ps.y - 20 < ry + rh && rh > 30) alpha = 0.45;
        }
        ctx.globalAlpha = alpha;
        this.drawFrame(pr.frame, pr.sx, pr.sy);
        ctx.globalAlpha = 1;
      } else if (d.unit) {
        this.drawUnit(d.unit);
      } else if (d.pickup) {
        const pk = d.pickup;
        const s = worldToScreen(pk.x, pk.y, 0.15 + Math.sin(pk.t * 4) * 0.08);
        this.drawFrame(this.assets.props[pk.type][0], s.x, s.y);
      }
    }
    // Player silhouette through occluders.
    if (!p.dead) {
      ctx.globalAlpha = 0.28;
      this.drawFrame(p.frame(), ps.x, ps.y);
      ctx.globalAlpha = 1;
    }

    g.fx.drawWorld(ctx, cam);

    // --- lighting
    this.drawLighting(cam);

    // --- additive glows
    ctx.globalCompositeOperation = 'lighter';
    this.drawSabers(ctx, cam, dt);
    this.drawBolts(ctx, cam);
    this.drawThrows(ctx, cam);
    g.fx.drawAdd(ctx, cam);
    ctx.globalCompositeOperation = 'source-over';

    // --- aircraft (above everything)
    this.drawStrikes(ctx, cam);

    // --- full-resolution overlay text
    this.drawOverlay();
  }

  drawFrame(f, x, y) {
    this.ctx.drawImage(f.page, f.sx, f.sy, f.w, f.h, Math.round(x - f.ox - this.cam.x), Math.round(y - f.oy - this.cam.y), f.w, f.h);
  }

  drawUnit(u) {
    const ctx = this.ctx;
    const s = worldToScreen(u.x, u.y, u.z);
    const f = u.frame();
    this.drawFrame(f, s.x, s.y);
    if (u.flash > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.55;
      this.drawFrame(f, s.x, s.y);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    if (u.stun > 0 && !u.choke && u.kind !== 'player') {
      const t = this.time * 6;
      ctx.fillStyle = '#ffe680';
      for (let i = 0; i < 3; i++) {
        const a = t + (i * Math.PI * 2) / 3;
        ctx.fillRect(Math.round(s.x - this.cam.x + Math.cos(a) * 7), Math.round(s.y - this.cam.y - 52 + Math.sin(a) * 3), 2, 2);
      }
    }
  }

  drawGroundMarkers(ctx, cam) {
    const g = this.game;
    const ell = (x, y, rx, color, alpha = 1, dash = false) => {
      const s = worldToScreen(x, y);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      if (dash) ctx.setLineDash([3, 2]);
      ctx.beginPath();
      ctx.ellipse(Math.round(s.x - cam.x) + 0.5, Math.round(s.y - cam.y) + 0.5, rx, rx / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    };
    const p = g.player;
    if (!p.dead) ell(p.x, p.y, 13, '#9fdcff', 0.45);
    for (const u of g.activeUnits) {
      if (u.dead || u === p) continue;
      if (u.owner === p) ell(u.x, u.y, u.kind === 'r2' ? 8 : 10, '#6fd0ff', 0.35);
      if (u.elite) ell(u.x, u.y, 13, '#5aa0ff', 0.5 + Math.sin(this.time * 5) * 0.3, true);
    }
    if (g.hover && !g.hover.dead) ell(g.hover.x, g.hover.y, g.hover.kind === 'b2' ? 14 : 12, g.hover.team === 'cis' ? '#ff4a3a' : '#e6e66a', 1);
    for (const m of this.clickMarks) {
      m.t += 1 / 60;
      const k = m.t / 0.45;
      ell(m.x, m.y, 10 * (1 - k * 0.7), m.color, 1 - k);
    }
    this.clickMarks = this.clickMarks.filter((m) => m.t < 0.45);
    // touch skill aiming: line from Anakin to the target ring
    if (this.aim) {
      const a = worldToScreen(p.x, p.y);
      const b = worldToScreen(this.aim.x, this.aim.y);
      ctx.save();
      ctx.strokeStyle = this.aim.color || '#7fd0ff';
      ctx.globalAlpha = 0.8;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(a.x - cam.x, a.y - cam.y);
      ctx.lineTo(b.x - cam.x, b.y - cam.y);
      ctx.stroke();
      ctx.restore();
      ell(this.aim.x, this.aim.y, (this.aim.r || 1) * 28, this.aim.color || '#7fd0ff', 0.9);
    }
    for (const st of g.strikes) {
      if (st.t > 2.6) continue;
      ell(st.tx, st.ty, 3.5 * 28 * (0.9 + Math.sin(this.time * 12) * 0.05), '#ff4040', 0.8, true);
    }
  }

  drawLighting(cam) {
    const g = this.game;
    const l = this.lctx;
    const W = this.w;
    const H = this.h;
    l.globalCompositeOperation = 'source-over';
    const amb = g.world.ambient || AMBIENT;
    l.fillStyle = `rgb(${amb[0]},${amb[1]},${amb[2]})`;
    l.fillRect(0, 0, W, H);
    l.globalCompositeOperation = 'lighter';
    const spot = (x, y, z, r, gg, b, rad, a = 1) => {
      const s = worldToScreen(x, y, z);
      const sx = s.x - cam.x;
      const sy = s.y - cam.y;
      if (sx < -rad || sy < -rad || sx > W + rad || sy > H + rad) return;
      const grd = l.createRadialGradient(sx, sy, 0, sx, sy, rad);
      grd.addColorStop(0, `rgba(${r},${gg},${b},${a})`);
      grd.addColorStop(1, `rgba(${r},${gg},${b},0)`);
      l.fillStyle = grd;
      l.fillRect(sx - rad, sy - rad, rad * 2, rad * 2);
    };
    const p = g.player;
    spot(p.x, p.y, 0.5, 255, 236, 210, 190, 0.42);
    for (const L of g.world.lights) {
      if (Math.abs(L.x - p.x) > 30 || Math.abs(L.y - p.y) > 30) continue;
      const fl = 1 + Math.sin(this.time * 3 + L.x * 7) * L.flicker;
      spot(L.x, L.y, L.z, L.r, L.g, L.b, L.rad * fl, 0.55);
    }
    for (const u of g.activeUnits) {
      if (!u.saberColor || u.dead || u.saberOut || u.saberLit === false) continue;
      const [r, gg, b] = u.saberColor;
      spot(u.x, u.y, 1.2 + u.z, Math.min(255, r * 1.4), Math.min(255, gg * 1.25), b, 70, 0.55 + (u.deflectFlash > 0 ? 0.4 : 0));
    }
    for (const t of g.throws) spot(t.x, t.y, t.z, 90, 160, 255, 60, 0.6);
    for (const b of g.bolts) spot(b.x, b.y, b.z, b.color === 'red' ? 255 : 90, b.color === 'red' ? 70 : 140, b.color === 'red' ? 60 : 255, 26, 0.6);
    for (const fl of g.fx.lights) spot(fl.x, fl.y, fl.z, fl.r, fl.g, fl.b, fl.rad, 0.8 * (1 - fl.t / fl.life));
    for (const u of g.activeUnits) if (u.choke) spot(u.x, u.y, 1.2 + u.z, 160, 60, 60, 40, 0.5);
    // composite
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(this.light, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
  }

  /**
   * Saber glow for every saber-wielding unit. The baked sprite already has
   * the blade core; the glow is added only along the stretches the baker
   * found in front of the body, so a blade behind Anakin's back stays hidden.
   */
  drawSabers(ctx, cam, dt) {
    for (const u of this.game.activeUnits) {
      const tr = u.saberTrail;
      if (tr) {
        for (const t of tr) t.t += dt;
        while (tr.length && tr[0].t > 0.09) tr.shift();
      }
      if (!u.saberColor || u.dead || u.saberOut || u.saberLit === false) continue;
      const f = u.frame();
      const s = worldToScreen(u.x, u.y, u.z);
      const swinging = u.anim.startsWith('attack') || u.anim === 'leap' || u.anim === 'parry';
      for (const k of ['saber', 'saber2']) {
        const b = f.markers[k + 'Base'];
        const e = f.markers[k + 'Tip'];
        if (!b || !e) continue;
        const bx = s.x + b[0] - cam.x;
        const by = s.y + b[1] - cam.y;
        const tx = s.x + e[0] - cam.x;
        const ty = s.y + e[1] - cam.y;
        const segs = f.blades ? f.blades[k] : [[0, 1]];
        // swing trail (world-anchored so it survives camera motion)
        const trail = (u.saberTrail ||= []);
        if (swinging) trail.push({ k, bx: bx + cam.x, by: by + cam.y, tx: tx + cam.x, ty: ty + cam.y, t: 0 });
        const pts = trail.filter((t) => t.k === k);
        if (pts.length > 1) {
          const [r, g, bl] = u.saberColor;
          ctx.fillStyle = `rgba(${r},${g},${bl},0.2)`;
          for (let i = 1; i < pts.length; i++) {
            const A = pts[i - 1];
            const B = pts[i];
            ctx.beginPath();
            ctx.moveTo(A.bx - cam.x, A.by - cam.y);
            ctx.lineTo(A.tx - cam.x, A.ty - cam.y);
            ctx.lineTo(B.tx - cam.x, B.ty - cam.y);
            ctx.lineTo(B.bx - cam.x, B.by - cam.y);
            ctx.closePath();
            ctx.fill();
          }
        }
        const flash = u.deflectFlash > 0 ? 1.6 : u.clashFlash > 0 ? 1.8 : 1;
        for (const [s0, s1] of segs) {
          if (s1 - s0 < 0.02) continue;
          this.glowLine(ctx, bx + (tx - bx) * s0, by + (ty - by) * s0, bx + (tx - bx) * s1, by + (ty - by) * s1, u.saberColor, flash, u.saberCore);
        }
      }
    }
  }

  glowLine(ctx, x1, y1, x2, y2, rgb, k = 1, core = 'rgba(235,245,255,0.95)') {
    ctx.lineCap = 'round';
    ctx.strokeStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${0.18 * k})`;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.strokeStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${0.45 * k})`;
    ctx.lineWidth = 3.5;
    ctx.stroke();
    ctx.strokeStyle = core;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.lineCap = 'butt';
  }

  drawBolts(ctx, cam) {
    for (const b of this.game.bolts) {
      const a = worldToScreen(b.x, b.y, b.z);
      const e = worldToScreen(b.x - Math.cos(b.ang) * 0.6, b.y - Math.sin(b.ang) * 0.6, b.z);
      const rgb = b.color === 'red' ? [255, 40, 30] : [60, 140, 255];
      this.glowLine(ctx, a.x - cam.x, a.y - cam.y, e.x - cam.x, e.y - cam.y, rgb, 1.3);
    }
  }

  drawThrows(ctx, cam) {
    for (const t of this.game.throws) {
      const s = worldToScreen(t.x, t.y, t.z);
      const L = 16;
      const dx = Math.cos(t.spin) * L;
      const dy = Math.sin(t.spin) * L * 0.6;
      this.glowLine(ctx, s.x - cam.x - dx, s.y - cam.y - dy, s.x - cam.x + dx, s.y - cam.y + dy, [60, 130, 255], 1.2);
    }
  }

  drawStrikes(ctx, cam) {
    const frames = this.assets.laatFly;
    for (const st of this.game.strikes) {
      const k = (st.t - 0.3) / 2.8;
      if (k < 0 || k > 1) continue;
      const d = -20 + 40 * k;
      const x = st.tx + Math.cos(st.ang) * d;
      const y = st.ty + Math.sin(st.ang) * d;
      const z = 5.5;
      // shadow
      const sh = worldToScreen(x, y);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(sh.x - cam.x, sh.y - cam.y, 50, 22, 0, 0, Math.PI * 2);
      ctx.fill();
      let idx = Math.round(st.ang / (Math.PI / 4)) % 8;
      if (idx < 0) idx += 8;
      const s = worldToScreen(x, y, z);
      this.drawFrame(frames[idx], s.x, s.y);
      // engine glow
      ctx.globalCompositeOperation = 'lighter';
      const e = worldToScreen(x - Math.cos(st.ang) * 2.2, y - Math.sin(st.ang) * 2.2, z + 1.2);
      const grd = ctx.createRadialGradient(e.x - cam.x, e.y - cam.y, 0, e.x - cam.x, e.y - cam.y, 14);
      grd.addColorStop(0, 'rgba(255,200,140,0.9)');
      grd.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = grd;
      ctx.fillRect(e.x - cam.x - 14, e.y - cam.y - 14, 28, 28);
      // missile streaks
      for (const m of st.missiles) {
        const mk = (st.t - (m.t - 0.35)) / 0.35;
        if (mk < 0 || mk > 1) continue;
        const ax = x + (m.x - x) * mk;
        const ay = y + (m.y - y) * mk;
        const az = z * (1 - mk);
        const a = worldToScreen(ax, ay, az);
        const b = worldToScreen(ax - (m.x - x) * 0.15, ay - (m.y - y) * 0.15, az + z * 0.15);
        this.glowLine(ctx, a.x - cam.x, a.y - cam.y, b.x - cam.x, b.y - cam.y, [255, 150, 60], 1);
      }
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  drawOverlay() {
    const o = this.octx;
    o.setTransform(1, 0, 0, 1, 0, 0);
    o.clearRect(0, 0, this.overlay.width, this.overlay.height);
    o.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const g = this.game;
    const cam = this.cam;
    const S = this.scale;
    // small health bars for damaged units near the player
    for (const u of g.activeUnits) {
      if (u.dead || u === g.player || u.hp >= u.maxHp) continue;
      if (dist(u.x, u.y, g.player.x, g.player.y) > 18) continue;
      const s = worldToScreen(u.x, u.y, u.z);
      const top = u.kind === 'b2' ? 62 : u.kind === 'r2' ? 30 : 54;
      const x = (s.x - cam.x) * S;
      const y = (s.y - cam.y - top) * S;
      const w = 34;
      o.fillStyle = 'rgba(0,0,0,0.55)';
      o.fillRect(x - w / 2 - 1, y - 1, w + 2, 4);
      o.fillStyle = u.team === 'cis' ? '#e2483d' : '#5cc8ff';
      o.fillRect(x - w / 2, y, (w * Math.max(0, u.hp)) / u.maxHp, 2);
    }
    // friendly NPCs: name, quest marker, talk prompt
    const p = g.player;
    for (const u of g.activeUnits) {
      if (!u.npc) continue;
      const d = dist(u.x, u.y, p.x, p.y);
      if (d > 11) continue;
      const s = worldToScreen(u.x, u.y);
      const x = (s.x - cam.x) * S;
      const y = (s.y - cam.y - (u.sprite === 'r2' ? 30 : 56)) * S;
      o.textAlign = 'center';
      o.font = '12px Galmuri11, sans-serif';
      o.fillStyle = 'rgba(0,0,0,0.6)';
      o.fillText(u.name, x + 1, y + 1);
      o.fillStyle = '#e8eef4';
      o.fillText(u.name, x, y);
      const q = g.quests;
      const giver = u.npcId;
      const mark = q.readyFrom(giver) ? '?' : q.offerFrom(giver) ? '!' : '';
      if (mark) {
        o.font = '20px Michroma, sans-serif';
        o.fillStyle = '#e9c47a';
        o.fillText(mark, x, y - 16);
      }
      if (d < 2.6 && !g.talkingTo) {
        o.font = '11px Galmuri11, sans-serif';
        o.fillStyle = 'rgba(233,196,122,0.95)';
        o.fillText(this.touchMode ? '대화 버튼으로 말 걸기' : '[E] 대화', x, y + 16);
      }
      o.textAlign = 'start';
    }
    g.fx.drawText(o, cam, S);
  }
}
