// World renderer: low-resolution canvas (scaled up with nearest-neighbour for
// chunky pixels), depth-sorted sprites, Diablo-style light map and additive
// glow pass for sabers, blaster bolts and Force effects. Characters with a
// Blender sprite sheet (gfx/sheet.js) cast their own rendered shadow.
import { worldToScreen, screenToWorld, PX_PER_UNIT, Z_PX } from '../core/iso.js';
import { Terrain } from './terrain.js';
import { PROPS } from './models/props.js';
import { dist } from '../core/math.js';
import { SHEET_PROPS } from '../world/cityProps.js';
import { neonLevel } from './citySprites.js';
import { glowSprite } from './fx.js';

const AMBIENT = [150, 146, 178];
const TRAIL_LIFE = 0.13; // seconds a saber swing's afterimage lasts
const SHADOW_ALPHA = 0.75; // a sheet's rendered shadow (the shadow catcher's own alpha)
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
    this.terrain = game.world.terrain ||= new Terrain(game.world);
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

  /** Another place (the city hub ⇄ Christophsis): new ground, props, map. */
  setWorld() {
    const w = this.game.world;
    this.terrain = w.terrain ||= new Terrain(w); // each place keeps its built ground
    this.prepareProps();
  }

  prepareProps() {
    for (const p of this.game.world.props) this.placeProp(p);
  }

  /** Screen placement of a prop (again after a cutscene moves one). */
  placeProp(p) {
    if (p.sheet) {
      // a Blender-rendered city sprite: body, neon and reflection layers
      const c = this.assets.city[p.sheet];
      p.frame = c.body;
      p.layers = c;
      const s = worldToScreen(p.x, p.y);
      p.sx = s.x;
      p.sy = s.y;
      p.rect = [s.x - c.body.ox, s.y - c.body.oy, c.body.w, c.body.h];
      p.sortDepth = p.x + p.y + (p.rect && c.meta.footprint ? Math.min(...extent(c.meta.footprint)) * 0.35 : 0);
      return;
    }
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
      if (u.dead || u.hidden || !filter(u)) continue;
      const s = worldToScreen(u.x, u.y, u.z);
      const hw = u.kind === 'b2' ? 13 : u.kind === 'fighter' ? 44 : 10;
      const hh = u.kind === 'b2' ? 56 : u.kind === 'r2' ? 26 : u.kind === 'fighter' ? 40 : 50;
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

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.smooth(false);
    ctx.fillStyle = '#07070a';
    ctx.fillRect(0, 0, W, H);
    this.terrain.draw(ctx, cam.x, cam.y, W, H);
    g.fx.drawDecals(ctx, cam);
    if (g.world.puddles) this.drawPuddles(ctx, cam, dt);

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

    // --- shadows: the frame's own rendered shadow (sprite sheets), else a flat ellipse
    const shadow = (x, y, rx) => {
      ctx.beginPath();
      ctx.ellipse(x - cam.x, y - cam.y, rx, rx * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
    };
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    for (const u of g.activeUnits) {
      if (u.dead || u.hidden) continue;
      const s = worldToScreen(u.x, u.y);
      const sf = u.frame().shadow;
      if (sf) {
        // fainter as the unit leaves the ground
        ctx.globalAlpha = SHADOW_ALPHA / (1 + u.z * 0.6);
        this.drawFrame(sf, s.x, s.y);
        ctx.globalAlpha = 1;
        continue;
      }
      const r = u.kind === 'b2' ? 11 : u.kind === 'r2' ? 7 : u.kind === 'fighter' ? 30 : 9;
      shadow(s.x, s.y, r / (1 + u.z * 0.4));
    }
    for (const pk of g.pickups) {
      const s = worldToScreen(pk.x, pk.y);
      shadow(s.x, s.y, 4);
    }

    // --- depth-sorted standing objects
    for (const u of g.activeUnits) if (!u.dead && !u.hidden) standing.push({ depth: u.x + u.y, unit: u });
    for (const pk of g.pickups) standing.push({ depth: pk.x + pk.y, pickup: pk });
    for (const m of g.fx.scorches) standing.push({ depth: m.depth ?? m.x + m.y, scorch: m });
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
        // parked speeders hover: a slow bob of a pixel or so
        const bob = pr.sheet && SHEET_PROPS[pr.sheet].bob ? Math.round(Math.sin(this.time * SHEET_PROPS[pr.sheet].bob + pr.phase) * 1.2) : 0;
        this.drawFrame(pr.frame, pr.sx, pr.sy + bob);
        pr.alpha = alpha;
        pr.bob = bob;
        ctx.globalAlpha = 1;
      } else if (d.unit) {
        this.drawUnit(d.unit);
      } else if (d.scorch) {
        g.fx.drawScorch(ctx, cam, d.scorch);
      } else if (d.pickup) {
        const pk = d.pickup;
        const s = worldToScreen(pk.x, pk.y, 0.15 + Math.sin(pk.t * 4) * 0.08);
        this.drawFrame(this.assets.props[pk.type][0], s.x, s.y);
      }
    }
    // Player silhouette through occluders.
    if (!p.dead && !p.hidden) {
      ctx.globalAlpha = 0.28;
      this.drawFrame(p.frame(), ps.x, ps.y);
      ctx.globalAlpha = 1;
    }

    g.fx.drawWorld(ctx, cam);

    // --- lighting
    this.drawLighting(cam);
    this.drawHitFlashes(ctx);
    // --- the Force bending space (refraction of the lit picture)
    this.drawRipples(ctx, cam);

    // --- additive glows
    ctx.globalCompositeOperation = 'lighter';
    this.drawCityGlow(ctx, cam, dt);
    this.drawSabers(ctx, cam, dt);
    this.drawBolts(ctx, cam);
    this.drawThrows(ctx, cam);
    g.fx.drawAdd(ctx, cam);
    this.drawTraffic(ctx, cam);
    ctx.globalCompositeOperation = 'source-over';

    // --- aircraft (above everything)
    this.drawStrikes(ctx, cam);

    // --- full-resolution overlay text
    this.drawOverlay();
  }

  drawFrame(f, x, y) {
    const k = f.k;
    if (!k) {
      // a game-resolution sprite: whole game pixels, nearest-neighbour
      this.smooth(false);
      this.ctx.drawImage(f.page, f.sx, f.sy, f.w, f.h, Math.round(x - f.ox - this.cam.x), Math.round(y - f.oy - this.cam.y), f.w, f.h);
      return;
    }
    // a sheet rendered at another size than game pixels: scaled smoothly
    this.smooth(true);
    this.ctx.drawImage(f.page, f.sx, f.sy, f.w, f.h, Math.round(x - f.ox * k - this.cam.x), Math.round(y - f.oy * k - this.cam.y), f.w * k, f.h * k);
  }

  smooth(on) {
    if (this.ctx.imageSmoothingEnabled !== on) this.ctx.imageSmoothingEnabled = on;
  }

  drawUnit(u) {
    const ctx = this.ctx;
    const s = worldToScreen(u.x, u.y, u.z);
    const f = u.frame();
    this.drawFrame(f, s.x, s.y);
    if (u.flash > 0) (this.flashUnits ||= []).push(u); // white, after the light map (hitfeel.js)
    if (u.stun > 0 && !u.choke && u.kind !== 'player') {
      const t = this.time * 6;
      ctx.fillStyle = '#ffe680';
      for (let i = 0; i < 3; i++) {
        const a = t + (i * Math.PI * 2) / 3;
        ctx.fillRect(Math.round(s.x - this.cam.x + Math.cos(a) * 7), Math.round(s.y - this.cam.y - 52 + Math.sin(a) * 3), 2, 2);
      }
    }
  }

  /** Units just hit turn white for a moment (drawn after the light map so the white stays white). */
  drawHitFlashes(ctx) {
    const list = this.flashUnits;
    if (!list || !list.length) return;
    const c = (this.flashCanvas ||= document.createElement('canvas'));
    const x2 = c.getContext('2d');
    for (const u of list) {
      const f = u.frame();
      const k = f.k || 1;
      const w = Math.ceil(f.w * k);
      const h = Math.ceil(f.h * k);
      if (c.width < w || c.height < h) {
        c.width = Math.max(c.width, w);
        c.height = Math.max(c.height, h);
      }
      x2.globalCompositeOperation = 'copy';
      x2.imageSmoothingEnabled = !!f.k;
      x2.drawImage(f.page, f.sx, f.sy, f.w, f.h, 0, 0, w, h);
      x2.globalCompositeOperation = 'source-in';
      x2.fillStyle = '#ffffff';
      x2.fillRect(0, 0, w, h);
      const s = worldToScreen(u.x, u.y, u.z);
      ctx.globalAlpha = Math.min(1, u.flash / 0.05) * 0.85;
      this.smooth(false);
      ctx.drawImage(c, 0, 0, w, h, Math.round(s.x - f.ox * k - this.cam.x), Math.round(s.y - f.oy * k - this.cam.y), w, h);
    }
    ctx.globalAlpha = 1;
    list.length = 0;
  }

  /**
   * Force ripples: a ring that bends the already-lit picture outward, like
   * heat haze, with a faint bright leading edge. No colour of its own
   * (ART_GUIDE.md §8). Works on the few pixels round each ring only.
   */
  drawRipples(ctx, cam) {
    const rips = this.game.fx.ripples;
    if (!rips.length) return;
    const W = this.w;
    const H = this.h;
    for (const r of rips) {
      const k = r.t / r.life;
      const c = worldToScreen(r.x, r.y, 0.6);
      const cx = c.x - cam.x;
      const cy = c.y - cam.y;
      const R = r.r * PX_PER_UNIT * (0.15 + 0.85 * Math.sqrt(k));
      const band = 6 + 6 * k;
      const amp = r.amp * (1 - k);
      const x0 = Math.max(0, Math.floor(cx - R - band * 1.6));
      const x1 = Math.min(W, Math.ceil(cx + R + band * 1.6));
      const y0 = Math.max(0, Math.floor(cy - (R + band * 1.6) / 2));
      const y1 = Math.min(H, Math.ceil(cy + (R + band * 1.6) / 2));
      const w = x1 - x0;
      const h = y1 - y0;
      if (w <= 2 || h <= 2) continue;
      // the cone's direction on screen (in unsquashed iso space)
      let ca = 0;
      if (r.ang !== null) {
        const e = worldToScreen(r.x + Math.cos(r.ang), r.y + Math.sin(r.ang), 0.6);
        ca = Math.atan2((e.y - c.y) * 2, e.x - c.x);
      }
      const img = ctx.getImageData(x0, y0, w, h);
      const src = new Uint8ClampedArray(img.data);
      const out = img.data;
      for (let y = 0; y < h; y++) {
        const dy = (y + y0 - cy) * 2;
        for (let x = 0; x < w; x++) {
          const dx = x + x0 - cx;
          const d = Math.hypot(dx, dy) || 1;
          const e = (d - R) / band;
          if (e < -1.6 || e > 1.6) continue;
          let m = Math.exp(-e * e * 2);
          if (r.ang !== null) {
            let da = Math.abs(Math.atan2(dy, dx) - ca);
            if (da > Math.PI) da = Math.PI * 2 - da;
            if (da > r.half) continue;
            m *= Math.min(1, (r.half - da) * 4);
          }
          const off = (amp * 1.6 * m * -e) / 0.3; // peaks at ±amp; pulls from inside on the leading edge, outside behind it
          const sx = Math.round(x - (dx / d) * off);
          const sy = Math.round(y - ((dy / d) * off) / 2);
          if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
          const si = (sy * w + sx) * 4;
          const di = (y * w + x) * 4;
          const lum = 1 + 0.32 * m * (1 - k) * (e > 0 ? 1 : 0.25);
          out[di] = src[si] * lum;
          out[di + 1] = src[si + 1] * lum;
          out[di + 2] = src[si + 2] * lum;
        }
      }
      ctx.putImageData(img, x0, y0);
    }
  }

  /**
   * The city sprites' light, after the light map so it glows: each neon
   * layer at its flickering level, the neon's reflection on the wet street,
   * and the billboards' holograms cycling through their ads.
   */
  drawCityGlow(ctx, cam, dt) {
    const W = this.w;
    const H = this.h;
    for (const pr of this.game.world.props) {
      if (!pr.sheet || pr.hidden) continue;
      const [rx, ry, rw, rh] = pr.rect;
      if (rx + rw < cam.x || rx > cam.x + W || ry + rh < cam.y || ry > cam.y + H + 60) continue;
      const L = pr.layers;
      const level = neonLevel(pr.neon, L.meta.neon, this.time, dt);
      ctx.globalAlpha = Math.min(1, level) * 0.85;
      this.drawFrame(L.reflect, pr.sx, pr.sy);
      ctx.globalAlpha = Math.min(1, level) * (pr.alpha ?? 1);
      this.drawFrame(L.neon, pr.sx, pr.sy + (pr.bob || 0));
      ctx.globalAlpha = 1;
      const holo = SHEET_PROPS[pr.sheet].holo;
      if (holo) this.drawHologram(ctx, cam, pr, holo, level);
    }
  }

  /** A translucent hologram ad in a billboard's frame: a new one every few seconds, with a glitch between. */
  drawHologram(ctx, cam, pr, h, level) {
    const c = worldToScreen(pr.x + h.x, pr.y + h.y, (h.z0 + h.z1) / 2);
    const w = h.hw * 2 * PX_PER_UNIT - 4;
    const ht = (h.z1 - h.z0) * Z_PX - 4;
    const x0 = Math.round(c.x - cam.x - w / 2);
    const y0 = Math.round(c.y - cam.y - ht / 2);
    const T = this.time + pr.phase * 3;
    const slot = Math.floor(T / 6);
    const into = T % 6;
    const glitch = into < 0.25 || (into > 5.85 && Math.random() < 0.5);
    const ad = ADS[(slot + Math.floor(pr.phase)) % ADS.length];
    const [r, g, b] = ad.color;
    const a = (glitch ? 0.35 : 0.6) * Math.min(1, level + 0.3);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0, w, ht);
    ctx.clip();
    const grd = ctx.createLinearGradient(0, y0, 0, y0 + ht);
    grd.addColorStop(0, `rgba(${r},${g},${b},${a * 0.45})`);
    grd.addColorStop(1, `rgba(${r},${g},${b},${a * 0.15})`);
    ctx.fillStyle = grd;
    ctx.fillRect(x0, y0, w, ht);
    ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
    ctx.strokeStyle = `rgba(${r},${g},${b},${a})`;
    ad.draw(ctx, x0 + (glitch ? (Math.random() - 0.5) * 6 : 0), y0, w, ht, T);
    // scanlines rolling down
    ctx.fillStyle = `rgba(${r},${g},${b},${a * 0.25})`;
    for (let y = (T * 12) % 3; y < ht; y += 3) ctx.fillRect(x0, y0 + y, w, 1);
    ctx.restore();
  }

  /** Puddles on the street: a dark sheen, and rings where drips land. */
  drawPuddles(ctx, cam, dt) {
    for (const pd of this.game.world.puddles) {
      const s = worldToScreen(pd.x, pd.y);
      const sx = s.x - cam.x;
      const sy = s.y - cam.y;
      const R = pd.r * PX_PER_UNIT;
      if (sx < -R || sy < -R || sx > this.w + R || sy > this.h + R) continue;
      ctx.save();
      ctx.translate(Math.round(sx), Math.round(sy));
      ctx.scale(1, 0.5);
      const g = ctx.createRadialGradient(0, 0, R * 0.2, 0, 0, R);
      g.addColorStop(0, 'rgba(14,12,26,0.55)');
      g.addColorStop(0.8, 'rgba(30,26,44,0.35)');
      g.addColorStop(1, 'rgba(30,26,44,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, Math.PI * 2);
      ctx.fill();
      // drips: now and then one lands and spreads a ring
      if (Math.random() < dt * 0.9 * pd.r) pd.drops.push({ x: (Math.random() - 0.5) * R, y: (Math.random() - 0.5) * R, t: 0 });
      ctx.lineWidth = 1;
      for (const d of pd.drops) {
        d.t += dt;
        const k = d.t / 1.1;
        ctx.strokeStyle = `rgba(190,210,255,${0.45 * (1 - k)})`;
        ctx.beginPath();
        ctx.arc(d.x, d.y * 2, 1 + k * R * 0.45, 0, Math.PI * 2);
        ctx.stroke();
      }
      pd.drops = pd.drops.filter((d) => d.t < 1.1);
      ctx.restore();
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
      if (!u.saberColor || u.dead || u.hidden || u.saberOut || u.saberLit === false) continue;
      const [r, gg, b] = u.saberColor;
      spot(u.x, u.y, 1.2 + u.z, Math.min(255, r * 1.4), Math.min(255, gg * 1.25), b, 70, 0.55 + (u.deflectFlash > 0 ? 0.4 : 0));
    }
    for (const t of g.throws) spot(t.x, t.y, t.z, 90, 160, 255, 60, 0.6);
    for (const b of g.bolts) spot(b.x, b.y, b.z, b.color === 'red' ? 255 : 90, b.color === 'red' ? 70 : 140, b.color === 'red' ? 60 : 255, 26, 0.6);
    for (const fl of g.fx.lights) spot(fl.x, fl.y, fl.z, fl.r, fl.g, fl.b, fl.rad, 0.8 * (1 - fl.t / fl.life));
    // speeders passing overhead sweep their light across the street below
    for (const L of g.world.traffic || []) {
      if (!L.over) continue;
      const len = Math.hypot(L.x1 - L.x0, L.y1 - L.y0);
      for (let d = (this.time * L.speed) % L.gap; d < len; d += L.gap) {
        const x = L.x0 + ((L.x1 - L.x0) / len) * d;
        const y = L.y0 + ((L.y1 - L.y0) / len) * d;
        if (Math.abs(x - p.x) < 16 && Math.abs(y - p.y) < 16) spot(x, y, 0, 210, 220, 255, 70, 0.22);
      }
    }
    for (const u of g.activeUnits) if (u.choke) spot(u.x, u.y, 1.2 + u.z, 160, 60, 60, 40, 0.5);
    // composite
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'multiply';
    this.smooth(false);
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
        while (tr.length && tr[0].t > TRAIL_LIFE) tr.shift();
      }
      if (!u.saberColor || u.dead || u.hidden || u.saberOut || u.saberLit === false) continue;
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
          // the swept band fades with age; its outer edge (the tip's path) stays bright longest
          const [r, g, bl] = u.saberColor;
          for (let i = 1; i < pts.length; i++) {
            const A = pts[i - 1];
            const B = pts[i];
            const a = 1 - B.t / TRAIL_LIFE;
            ctx.fillStyle = `rgba(${r},${g},${bl},${0.32 * a})`;
            ctx.beginPath();
            ctx.moveTo(A.bx - cam.x, A.by - cam.y);
            ctx.lineTo(A.tx - cam.x, A.ty - cam.y);
            ctx.lineTo(B.tx - cam.x, B.ty - cam.y);
            ctx.lineTo(B.bx - cam.x, B.by - cam.y);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = `rgba(${Math.min(255, r + 120)},${Math.min(255, g + 110)},${Math.min(255, bl + 60)},${0.7 * a * a})`;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(A.tx - cam.x, A.ty - cam.y);
            ctx.lineTo(B.tx - cam.x, B.ty - cam.y);
            ctx.stroke();
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

  /** The city's air traffic: streams of speeder lights along lanes through the drop. */
  drawTraffic(ctx, cam) {
    const lanes = this.game.world.traffic;
    if (!lanes) return;
    const t = this.time;
    for (const L of lanes) {
      const len = Math.hypot(L.x1 - L.x0, L.y1 - L.y0);
      const ux = (L.x1 - L.x0) / len;
      const uy = (L.y1 - L.y0) / len;
      for (let d = (t * L.speed) % L.gap, i = 0; d < len; d += L.gap, i++) {
        const x = L.x0 + ux * d;
        const y = L.y0 + uy * d;
        const a = worldToScreen(x, y, L.z);
        if (a.x < cam.x - 20 || a.y < cam.y - 20 || a.x > cam.x + this.w + 20 || a.y > cam.y + this.h + 20) continue;
        if (L.over) {
          // high overhead: a small craft, a white headlight and a coloured tail light
          const b = worldToScreen(x - ux * 0.5, y - uy * 0.5, L.z);
          const col = SPEEDER_COLORS[(i + Math.floor(t * L.speed / L.gap)) % SPEEDER_COLORS.length];
          this.glowLine(ctx, b.x - cam.x, b.y - cam.y, a.x - cam.x, a.y - cam.y, col, 0.4, 'rgba(255,250,240,0.6)');
          continue;
        }
        const b = worldToScreen(x - ux * 0.9, y - uy * 0.9, L.z);
        this.glowLine(ctx, b.x - cam.x, b.y - cam.y, a.x - cam.x, a.y - cam.y, [255, 120, 90], 0.7, 'rgba(255,240,220,0.95)');
      }
    }
  }

  drawBolts(ctx, cam) {
    for (const b of this.game.bolts) {
      const a = worldToScreen(b.x, b.y, b.z);
      const e = worldToScreen(b.x - Math.cos(b.ang) * 0.6, b.y - Math.sin(b.ang) * 0.6, b.z);
      const rgb = b.color === 'red' ? [255, 40, 30] : [60, 140, 255];
      // a soft halo round the head, then the bolt itself
      ctx.globalAlpha = 0.75;
      ctx.drawImage(glowSprite(rgb), a.x - cam.x - 9, a.y - cam.y - 9, 18, 18);
      ctx.globalAlpha = 1;
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
    this.drawBubbles(o, cam, S);
  }

  /** Speech bubbles over people's heads, at screen resolution. */
  drawBubbles(o, cam, S) {
    const g = this.game;
    o.font = '12px Galmuri11, sans-serif';
    o.textAlign = 'center';
    o.textBaseline = 'middle';
    for (const b of g.bubbles) {
      const u = b.u;
      if (u.hidden || dist(u.x, u.y, g.player.x, g.player.y) > 18) continue;
      const s = worldToScreen(u.x, u.y, u.z);
      const x = (s.x - cam.x) * S;
      const y = (s.y - cam.y - (u.sprite === 'r2' ? 34 : 60)) * S;
      // fade in and out, a little lift as it appears
      const a = Math.min(1, b.t * 6, (b.life - b.t) * 3);
      const lift = (1 - Math.min(1, b.t * 6)) * 6;
      const lines = wrap(o, b.text, 190);
      const w = Math.max(...lines.map((l) => o.measureText(l).width)) + 16;
      const h = lines.length * 15 + 10;
      const bx = Math.round(x - w / 2);
      const by = Math.round(y - h - 8 + lift);
      const guard = u.kind === 'patrol';
      o.globalAlpha = a;
      o.fillStyle = guard ? 'rgba(40,14,16,0.88)' : 'rgba(14,18,26,0.85)';
      o.strokeStyle = guard ? 'rgba(230,90,80,0.9)' : 'rgba(200,220,240,0.55)';
      o.lineWidth = 1;
      o.beginPath();
      o.roundRect(bx + 0.5, by + 0.5, w, h, 6);
      o.moveTo(x - 5, by + h + 0.5);
      o.lineTo(x, by + h + 7);
      o.lineTo(x + 5, by + h + 0.5);
      o.fill();
      o.stroke();
      o.fillStyle = guard ? '#ffd8d0' : '#e8eef4';
      lines.forEach((l, i) => o.fillText(l, x, by + 12 + i * 15));
      o.globalAlpha = 1;
    }
    o.textAlign = 'start';
    o.textBaseline = 'alphabetic';
  }
}

/** Break text into lines no wider than `max` px (at the context's font). */
function wrap(o, text, max) {
  const out = [];
  let line = '';
  for (const word of text.split(' ')) {
    const t = line ? line + ' ' + word : word;
    if (o.measureText(t).width > max && line) {
      out.push(line);
      line = word;
    } else line = t;
  }
  if (line) out.push(line);
  return out;
}

/** Width and depth of a footprint polygon. */
function extent(poly) {
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
}

// tail lights of the craft passing high over the undercity
const SPEEDER_COLORS = [[255, 90, 120], [90, 200, 255], [255, 190, 90], [200, 120, 255]];

// the billboards' hologram ads: abstract shapes and glyph rows, no readable text
const glyphRow = (ctx, x, y, w, seed) => {
  let cx = x;
  for (let i = 0; cx < x + w; i++) {
    const n = ((seed * 9301 + i * 49297) % 233280) / 233280;
    const gw = 2 + Math.floor(n * 4);
    ctx.fillRect(cx, y, gw, n > 0.5 ? 3 : 2);
    if (n > 0.7) ctx.fillRect(cx, y - 2, 1, 2);
    cx += gw + 2;
  }
};
const ADS = [
  { color: [80, 230, 255], draw(ctx, x, y, w, h, t) {
    // a drink: a tilted glass rotating, rings of fizz
    const cx = x + w * 0.3;
    const cy = y + h * 0.55;
    const sw = Math.abs(Math.cos(t * 1.5)) * 9 + 2;
    ctx.fillRect(cx - sw / 2, cy - 12, sw, 22);
    for (let i = 0; i < 4; i++) ctx.fillRect(cx - 1 + Math.sin(t * 3 + i) * 3, cy - 14 - ((t * 10 + i * 5) % 14), 2, 2);
    glyphRow(ctx, x + w * 0.52, y + h * 0.3, w * 0.42, 3);
    glyphRow(ctx, x + w * 0.52, y + h * 0.55, w * 0.3, 7);
  } },
  { color: [255, 80, 190], draw(ctx, x, y, w, h, t) {
    // a speeder: a sleek wedge flying through, speed lines
    const px = x + ((t * 30) % (w + 30)) - 15;
    ctx.beginPath();
    ctx.moveTo(px + 16, y + h * 0.5);
    ctx.lineTo(px - 10, y + h * 0.36);
    ctx.lineTo(px - 14, y + h * 0.6);
    ctx.closePath();
    ctx.fill();
    for (let i = 0; i < 5; i++) ctx.fillRect(px - 30 - i * 7, y + h * (0.4 + i * 0.05), 6, 1);
    glyphRow(ctx, x + 4, y + h * 0.82, w * 0.6, 11);
  } },
  { color: [255, 190, 80], draw(ctx, x, y, w, h, t) {
    // a spinning emblem and a price in glyphs
    const cx = x + w * 0.5;
    const cy = y + h * 0.45;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 10 * Math.abs(Math.cos(t * 2)) + 1, 10, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillRect(cx - 1, cy - 6, 2, 12);
    glyphRow(ctx, x + w * 0.2, y + h * 0.85, w * 0.6, 5);
  } },
  { color: [140, 255, 170], draw(ctx, x, y, w, h, t) {
    // a scrolling ticker over pulsing bars
    for (let i = 0; i < 8; i++) {
      const bh = (Math.sin(t * 4 + i) * 0.5 + 0.5) * h * 0.5 + 3;
      ctx.fillRect(x + 6 + i * ((w - 12) / 8), y + h * 0.75 - bh, (w - 12) / 8 - 2, bh);
    }
    glyphRow(ctx, x - ((t * 20) % 40), y + h * 0.88, w + 40, 13);
  } },
];
