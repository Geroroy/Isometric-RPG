// World renderer: low-resolution canvas (scaled up with nearest-neighbour for
// chunky pixels), depth-sorted sprites, Diablo-style light map and additive
// glow pass for sabers, blaster bolts and Force effects. Characters with a
// Blender sprite sheet (gfx/sheet.js) cast their own rendered shadow.
import { worldToScreen, screenToWorld, PX_PER_UNIT, Z_PX, HALF_W, HALF_H } from '../core/iso.js';
import { Terrain } from './terrain.js';
import { PROPS } from './models/props.js';
import { dist } from '../core/math.js';
import { SHEET_PROPS } from '../world/cityProps.js';
import { BIOME } from '../world/worldgen.js';
import { neonLevel } from './citySprites.js';
import { glowSprite } from './fx.js';
import { transientLights, relightUnits } from './relight.js';
import { SIG } from '../game/units.js';
import { canvasFont } from '../ui/fonts.js';
import { drawCityBackdrop } from './cityBackdrop.js';
import { LaneTraffic } from './skylineTraffic.js';
// the level's air lanes (through the drop, over the undercity's streets, with their shadows): off —
// the speeders fly only in the city beyond the platforms (gfx/cityBackdrop.js, SkylineTraffic)
const LANE_TRAFFIC = false;
import { SABER, PALETTES, trailWindow, paletteFor, flickerAt, ignition, drawBlade, drawSpark, drawTrail, drawClash, record } from './saberStyle.js';
import { preset, tintFor, drawLight, drawGround, drawGroundTint, sweepOf, lightCharacter } from './saberLight.js';

const AMBIENT = [150, 146, 178];
const byDepth = (a, b) => a.depth - b.depth;
const TRAIL_LIFE = 0.13; // seconds a saber swing's afterimage lasts
const SHADOW_ALPHA = 0.75; // a sheet's rendered shadow (the shadow catcher's own alpha)
// How far the player may zoom, by what the view shows (docs/GAME_DESIGN.md 2.1.1; measured by
// tools/qa/zoomlimits.mjs, tools/qa/zoomout.mjs). Out: to look over the map — up to 1080 × 1920 game px
// (a whole district with the city round it; 1080p at 1×), and no smaller than 0.75 css px a game pixel
// (people stay ~40 px tall: a phone stops before they turn to specks). The units the camera sees act
// and are drawn (game.updateActive), so a wide view shows no one popping in. In: at least 240 rows (a
// game pixel no coarser than the closest view the art is tuned at, a phone's default), and only while
// an enemy at blaster range (B1, 7 tiles) still shows its feet and body above the console in every
// direction. Zoom 1 is always allowed.
export const VIEW_LIMITS = { maxRows: 1080, maxCols: 1920, minCss: 0.75, minRows: 240, reach: 7 };
// PC: about this many game pixels show vertically at zoom 1 — a 1080p screen is 3× (640×360),
// 1440p 4×, 4K 6× (characters ~50-57 game px tall, ~160 px on a 1080p screen)
export const PC_BASE_H = 360;

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
      const k = c.body.k || 1; // (a sheet drawn scaled: drawFrame)
      p.rect = [s.x - c.body.ox * k, s.y - c.body.oy * k, c.body.w * k, c.body.h * k];
      p.sortDepth = p.x + p.y + (p.rect && c.meta.footprint ? Math.min(...extent(c.meta.footprint)) * 0.35 : 0);
      p.box = boxOf(p.x, p.y, c.meta.footprint);
      this.propOrder = null;
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
      p.box = rect ? [p.x - rect[0] / 2, p.y - rect[1] / 2, p.x + rect[0] / 2, p.y + rect[1] / 2] : [p.x - 0.3, p.y - 0.3, p.x + 0.3, p.y + 0.3];
      this.propOrder = null;
    }
  }

  /**
   * How many game pixels show vertically at zoom 1: PC_BASE_H on a PC; on touch ~240 rows on a phone
   * (characters read at arm's length — tuned for a Galaxy S25 Ultra in landscape), up to 450 on tablets.
   */
  baseH() {
    return this.touchMode ? Math.max(240, Math.min(450, window.innerHeight * 0.58)) : PC_BASE_H;
  }

  /** The screen's height in device pixels. */
  deviceH() {
    return window.innerHeight * (window.devicePixelRatio || 1);
  }

  /**
   * How many device pixels one game pixel covers. Integer upscaling keeps the
   * pixels crisp on high-DPI phones. The view shows about baseH() game pixels
   * vertically, divided by the user's zoom.
   */
  computeDevScale() {
    const s = this.scaleFor(this.zoom);
    return this.shot ? s : this.limitScale(s);
  }

  scaleFor(zoom) {
    return Math.max(1, Math.min(14, Math.round(this.deviceH() / (this.baseH() / zoom))));
  }

  /** The zoom that lands exactly on a whole scale. */
  zoomFor(scale) {
    return (scale * this.baseH()) / this.deviceH();
  }

  /** Whether the player may zoom to this whole scale (VIEW_LIMITS); zoom 1's scale always may. */
  scaleAllowed(s) {
    if (s < 1 || s > 14) return false;
    if (s === this.scaleFor(1)) return true;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.ceil((window.innerWidth * dpr) / s);
    const h = Math.ceil((window.innerHeight * dpr) / s);
    const L = VIEW_LIMITS;
    if (h > L.maxRows || w > L.maxCols || h < L.minRows || s / dpr < L.minCss) return false;
    // an enemy at blaster range in each of 8 directions: feet and body centre (27 px up) in view,
    // with the camera where render() puts it (the player at 55% / 60% of the height above the console)
    const viewH = h - (this.touchMode ? 0 : (this.consoleH * dpr) / s);
    const py = viewH * (this.touchMode ? 0.6 : 0.55);
    for (let k = 0; k < 8; k++) {
      const ux = Math.cos((k * Math.PI) / 4) * L.reach;
      const uy = Math.sin((k * Math.PI) / 4) * L.reach;
      const sx = w / 2 + (ux - uy) * HALF_W;
      const sy = py + (ux + uy) * HALF_H;
      if (sx < 0 || sx > w || sy - 27 < 0 || sy > viewH) return false;
    }
    return true;
  }

  /** The nearest allowed scale, moving toward zoom 1's. */
  limitScale(s) {
    const d = this.scaleFor(1);
    while (s !== d && !this.scaleAllowed(s)) s += Math.sign(d - s);
    return s;
  }

  /**
   * A scripted shot's zoom (the title screen, cutscenes' `cam.zoom`): those were framed against a
   * 450-row view, so on a PC (now PC_BASE_H rows at zoom 1) they are scaled to show the same.
   */
  shotZoom(z) {
    return this.touchMode ? z : (z * PC_BASE_H) / 450;
  }

  /** Change the zoom; only reallocates the canvases when the pixel scale changes. `shot`: a scripted
   * shot's zoom (shotZoom), not held to VIEW_LIMITS. */
  setZoom(z, shot = false) {
    this.shot = shot;
    this.zoom = Math.max(0.3, Math.min(3, z));
    if (!shot) {
      // past a limit: the zoom of the last allowed scale (a pinch stops there)
      const s = this.scaleFor(this.zoom);
      const lim = this.limitScale(s);
      if (lim !== s) this.zoom = this.zoomFor(lim);
    }
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
    // labels and numbers: at most 1.5× CSS px — still sharp text, a quarter of the pixels of 3×
    this.odpr = Math.min(dpr, 1.5);
    this.overlay.width = Math.round(W * this.odpr);
    this.overlay.height = Math.round(H * this.odpr);
    this.overlayUsed = true;
    this.overlay.style.width = W + 'px';
    this.overlay.style.height = H + 'px';
    this.ctx.imageSmoothingEnabled = false;
    // the view one zoom step out (game px), its terrain made ahead (warmTerrain); none at the widest
    const s2 = devScale - 1;
    this.wideView = !this.shot && this.scaleAllowed(s2) ? [Math.ceil((W * dpr) / s2), Math.ceil((H * dpr) / s2)] : null;
  }

  /**
   * The terrain to make ahead, a few ms a frame (Terrain.warm): the view one zoom step out, and a
   * near turbolift's far end — a zoom step or a lift ride then finds its ground made instead of
   * stalling a frame on it (faster while the lift's doors close).
   */
  warmTerrain(g, cam, W, H) {
    const rects = [];
    const p = g.player;
    for (const L of g.world.lifts || []) {
      if (Math.abs(L.x - p.x) + Math.abs(L.y - p.y) > 14) continue;
      const d = worldToScreen(L.to.x, L.to.y, 0);
      rects.push([d.x - W / 2 - 80, d.y - H * 0.6 - 80, W + 160, H + 160]);
    }
    if (this.wideView) {
      const [w2, h2] = this.wideView;
      rects.push([cam.x + W / 2 - w2 / 2, cam.y + H / 2 - h2 / 2, w2, h2]);
    }
    this.terrain.warm = rects.length ? rects : null;
    this.terrain.warmHurry = !!(g.lift && !g.lift.moved);
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
    // the camera stays over the level (docs/MAP_EDGES.md): its view centre is held inside the
    // level's screen box less an inset, so a rim never fills half the screen
    const cr = !f && g.world.camRegions && this.camRegion(g.world.camRegions, p);
    if (cr) {
      const clampTo = (v, lo, hi) => (lo > hi ? (lo + hi) / 2 : Math.max(lo, Math.min(hi, v)));
      ps.x = clampTo(ps.x, (cr.x0 - cr.y1) * HALF_W + W * 0.22, (cr.x1 - cr.y0) * HALF_W - W * 0.22);
      ps.y = clampTo(ps.y, (cr.x0 + cr.y0) * HALF_H + viewH * 0.24, (cr.x1 + cr.y1) * HALF_H - viewH * 0.3);
    }
    const sh = g.fx.shakeAmt;
    const dr = this.drift; // slow title-screen camera move, in game pixels
    this.cam.x = Math.round(ps.x - W / 2 + dr.x + (sh ? (Math.random() - 0.5) * sh : 0));
    this.cam.y = Math.round(ps.y - viewH * (this.touchMode ? 0.6 : 0.55) + dr.y + (sh ? (Math.random() - 0.5) * sh : 0));
    const cam = this.cam;
    // the view, for the units that act and are drawn (game.updateActive), with a sprite's margin: to the
    // sides half a wide sprite and a step, below a tall one's height (its feet under the bottom edge,
    // its head in view); above, little — a sprite is drawn up from its feet
    g.viewRect = [cam.x - 90, cam.y - 24, cam.x + W + 90, cam.y + H + 260];

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.smooth(false);
    const mode = p.y > 90 ? 'low' : 'up';
    // the city beyond the rims, its sky traffic: only over the part of the screen where the drop shows
    // (the terrain paints every other pixel over it)
    if (g.world.city) drawCityBackdrop(ctx, cam, W, H, mode, dt, this.voidRect(g.world, cam, W, H));
    else {
      ctx.fillStyle = '#07070a';
      ctx.fillRect(0, 0, W, H);
    }
    // the speeders in the level's air lanes: those through the drop depth-sorted with the props and
    // units below; those over the undercity's streets drawn above everything, their shadows on the street
    if (LANE_TRAFFIC && g.world.traffic) {
      if (!this.lanes || this.lanes.src !== g.world.traffic) this.lanes = new LaneTraffic(g.world.traffic, g.world);
      this.lanes.update(dt);
    } else this.lanes = null;
    for (const u of g.activeUnits) this.igniteOf(u); // the blades' ignition clocks, before any light is drawn
    this.warmTerrain(g, cam, W, H);
    this.terrain.draw(ctx, cam.x, cam.y, W, H);
    g.fx.drawDecals(ctx, cam);
    if (g.world.puddles) this.drawPuddles(ctx, cam, dt);
    this.drawSaberFloorTint(ctx, cam);

    const inView = (x, y, w, h) => x + w > cam.x - 4 && x < cam.x + W + 4 && y + h > cam.y - 4 && y < cam.y + H + 4;

    if (this.lanes) this.lanes.drawShadows(ctx, cam, W, H, g.world);
    // --- flat layer: pads, debris, corpses
    // the depth-sorted list reuses its entries from frame to frame (no garbage per object per frame)
    const standing = this.standing || (this.standing = []);
    let ns = 0;
    const put = (depth, prop, unit, pickup, scorch, car = null) => {
      const e = standing[ns] || (standing[ns] = { depth: 0, prop: null, unit: null, pickup: null, scorch: null, car: null });
      e.depth = depth;
      e.prop = prop;
      e.unit = unit;
      e.pickup = pickup;
      e.scorch = scorch;
      e.car = car;
      ns++;
    };
    if (!this.propOrder || this.propOrder.world !== g.world || this.propOrder.n !== g.world.props.length) this.orderProps(g.world);
    const shown = this.shownProps || (this.shownProps = []);
    shown.length = 0;
    for (const pr of g.world.props) {
      if (pr.hidden) continue; // placed but not shown yet (scripted)
      const r = pr.rect;
      if (!inView(r[0], r[1], r[2], r[3])) continue;
      if (pr.flat) this.drawFrame(pr.frame, pr.sx, pr.sy);
      else {
        put(pr.drawDepth ?? pr.sortDepth, pr, null, null, null);
        shown.push(pr);
      }
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
      // on the ground under him (a table top's, when he stands over one)
      const gz = g.world.groundAt ? g.world.groundAt(u.x, u.y) : 0;
      const hz = Math.max(0, u.z - gz);
      const s = worldToScreen(u.x, u.y, Math.min(gz, u.z));
      const sf = u.frame().shadow;
      if (sf) {
        // fainter as the unit leaves the ground
        ctx.globalAlpha = SHADOW_ALPHA / (1 + hz * 0.6);
        this.drawFrame(sf, s.x, s.y);
        ctx.globalAlpha = 1;
        continue;
      }
      const r = u.shadowR || (u.kind === 'b2' ? 11 : u.kind === 'r2' ? 7 : u.kind === 'fighter' ? 30 : 9);
      shadow(s.x, s.y, r / (1 + hz * 0.4));
    }
    for (const pk of g.pickups) {
      const s = worldToScreen(pk.x, pk.y);
      shadow(s.x, s.y, 4);
    }

    // --- depth-sorted standing objects
    for (const u of g.activeUnits) if (!u.dead && !u.hidden) put((u.drawDepth = this.unitDepth(u, shown)), null, u, null, null);
    for (const pk of g.pickups) put(pk.x + pk.y, null, null, pk, null);
    for (const m of g.fx.scorches) put(m.depth ?? m.x + m.y, null, null, null, m);
    if (this.lanes) for (const it of this.lanes.visible('drop', cam, W, H)) put(it[0], null, null, null, null, it);
    standing.length = ns;
    standing.sort(byDepth);
    const pDepth = p.drawDepth ?? p.x + p.y;
    // a structure drawn after the player whose opaque pixels cover his body gets a window round him
    // (drawWindowed): wholly clear inside, a few px of feather at the rim — he is seen whole, never
    // blended into the wall (no fade, no ghost silhouette); its neon layer takes the same window
    const pf = !p.dead && !p.hidden ? p.frame() : null;
    const pp = worldToScreen(p.x, p.y, p.z); // (ps above is the camera's focus: clamped at a level's edge)
    for (const d of standing) {
      if (d.prop) {
        const pr = d.prop;
        const r = pr.rect;
        // parked speeders hover: a slow bob of a pixel or so
        const bob = pr.sheet && SHEET_PROPS[pr.sheet].bob ? Math.round(Math.sin(this.time * SHEET_PROPS[pr.sheet].bob + pr.phase) * 1.2) : 0;
        pr.bob = bob;
        pr.window = null;
        // a covered passage (a sheet with `roof`): its shell clears while anyone stands inside it, showing the
        // open inside drawn under it (worldgen.js: the Mustafar corridor)
        if (pr.sheet && pr.layers.meta.roof) {
          const [x0, y0, x1, y1] = pr.box;
          const inside = g.activeUnits.some((u) => !u.dead && !u.hidden && u.x > x0 - 0.3 && u.x < x1 + 0.3 && u.y > y0 - 0.3 && u.y < y1 + 0.3);
          const to = inside ? 0 : 1;
          pr.fade = (pr.fade ?? 1) + (to - (pr.fade ?? 1)) * Math.min(1, dt * 6);
          if (pr.fade < 0.99) {
            if (pr.fade < 0.01) continue;
            ctx.globalAlpha = pr.fade;
            this.drawFrame(pr.frame, pr.sx, pr.sy);
            ctx.globalAlpha = 1;
            continue;
          }
        }
        if (pf && d.depth > pDepth && r[3] > 30 && pp.x + 8 > r[0] && pp.x - 8 < r[0] + r[2] && pp.y > r[1] + 8 && pp.y - pf.h < r[1] + r[3] && this.coversPlayer(pr, pp, pf)) {
          pr.window = { x: pp.x - cam.x, y: pp.y - pf.h * 0.5 - cam.y, r: Math.max(30, pf.h * 0.8) };
          this.drawWindowed(pr.frame, pr.sx, pr.sy + bob, pr.window);
        } else this.drawFrame(pr.frame, pr.sx, pr.sy + bob);
      } else if (d.unit) {
        this.drawUnit(d.unit);
      } else if (d.scorch) {
        g.fx.drawScorch(ctx, cam, d.scorch);
      } else if (d.car) {
        this.lanes.drawItem(ctx, d.car);
      } else if (d.pickup) {
        const pk = d.pickup;
        const s = worldToScreen(pk.x, pk.y, 0.15 + Math.sin(pk.t * 4) * 0.08);
        this.drawFrame(this.assets.props[pk.type][0], s.x, s.y);
      }
    }

    g.fx.drawWorld(ctx, cam);

    // --- lighting
    this.drawLighting(cam);
    // transient lights on the characters' normal maps (sheets rendered with the normal pass)
    if (this.relight !== false) {
      ctx.globalCompositeOperation = 'lighter';
      this.smooth(true);
      relightUnits(ctx, g, cam, transientLights(g, cam, this.time), W, H);
      ctx.globalCompositeOperation = 'source-over';
    }
    this.drawHitFlashes(ctx);
    // --- the Force bending space (refraction of the lit picture)
    this.drawRipples(ctx, cam);

    // --- additive glows
    ctx.globalCompositeOperation = 'lighter';
    this.drawCityGlow(ctx, cam, dt);
    this.drawSaberLight(ctx, cam);
    this.drawSabers(ctx, cam, dt);
    for (const c of g.fx.saberClashes) {
      // the saber-look preview's clashes, in the chosen style
      const cp = worldToScreen(c.x, c.y, c.z);
      drawClash(ctx, cp.x - cam.x, cp.y - cam.y, (1 - c.t / c.life) * (c.big ? 1 : 0.75), paletteFor(g.player.saberColor || [60, 130, 255]) || PALETTES.tcw.blue);
    }
    this.drawBolts(ctx, cam);
    this.drawThrows(ctx, cam);
    g.fx.drawAdd(ctx, cam);
    ctx.globalCompositeOperation = 'source-over';
    if (this.lanes) this.lanes.draw(ctx, cam, W, H, 'over'); // the craft over the streets

    // --- aircraft (above everything)
    this.drawStrikes(ctx, cam);

    // --- full-resolution overlay text
    this.drawOverlay();
  }

  /**
   * Draw depths for the standing props, consistent with their footprints (boxOrder): a long building
   * is in front of whatever stands wholly behind its box, whatever their centres. Kept once per set of
   * props: drawDepth starts at the centre's depth and is raised past every box that must come before.
   */
  orderProps(world) {
    const list = world.props.filter((p) => !p.flat && p.box);
    for (const p of list) p.drawDepth = p.sortDepth;
    // relax along the "behind" relation (a few passes settle it; the layouts have no cycles)
    const near = (a, b) => Math.abs(a.sx - b.sx) < (a.rect[2] + b.rect[2]) / 2 && Math.abs(a.rect[1] + a.rect[3] / 2 - b.rect[1] - b.rect[3] / 2) < (a.rect[3] + b.rect[3]) / 2;
    const pairs = [];
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        if (!near(a, b)) continue;
        const o = boxOrder(a.box, b.box);
        if (o < 0) pairs.push([a, b]);
        else if (o > 0) pairs.push([b, a]);
      }
    for (let pass = 0; pass < 8; pass++) {
      let moved = false;
      for (const [a, b] of pairs)
        if (b.drawDepth <= a.drawDepth) {
          b.drawDepth = a.drawDepth + 0.01;
          moved = true;
        }
      if (!moved) break;
    }
    this.propOrder = { world, n: world.props.length };
  }

  /** A unit's draw depth: its own (x + y), kept after every prop box it stands in front of and before every one it stands behind. */
  unitDepth(u, props) {
    let d = u.x + u.y + (u.depthBias || 0); // (a river deck sorts under whoever stands on it)
    let lo = -Infinity;
    let hi = Infinity;
    const ub = [u.x - 0.25, u.y - 0.25, u.x + 0.25, u.y + 0.25];
    const sx = (u.x - u.y) * 20;
    const sy = (u.x + u.y) * 10;
    for (const p of props) {
      const r = p.rect;
      if (sx + 14 < r[0] || sx - 14 > r[0] + r[2] || sy < r[1] || sy - 70 > r[1] + r[3]) continue;
      const o = boxOrder(ub, p.box);
      const pd = p.drawDepth ?? p.sortDepth;
      if (o > 0) lo = Math.max(lo, pd);
      else if (o < 0) hi = Math.min(hi, pd);
    }
    if (d <= lo) d = lo + 0.005;
    if (d >= hi) d = hi - 0.005;
    return d;
  }

  /** Whether a prop's opaque pixels cover the player's body (3 columns across him, 4 points down). */
  coversPlayer(pr, ps, pf) {
    const f = pr.frame;
    const data = (f.alphaData ||= alphaOf(f));
    if (!data) return true;
    const k = f.k || 1;
    let hit = 0;
    for (const dx of [-6, 0, 6])
      for (const t of [0.2, 0.45, 0.7, 0.9]) {
        const x = Math.round((ps.x + dx - (pr.sx - f.ox * k)) / k);
        const y = Math.round((ps.y - pf.h * t - (pr.sy - f.oy * k)) / k);
        if (x >= 0 && y >= 0 && x < f.w && y < f.h && data[y * f.w + x] > 128) hit++;
      }
    return hit >= 3;
  }

  /**
   * A frame drawn with a window cut out of it: wholly clear within `w.r - FEATHER` of (w.x, w.y) (screen
   * px, camera applied), the rim feathered over FEATHER px; in the frame's own pixels when it is a scaled
   * sheet (k), so the window stays the same size on screen whatever the sheet's scale.
   */
  drawWindowed(f, x, y, w) {
    const k = f.k || 1;
    const c = (this.cutCanvas ||= document.createElement('canvas'));
    if (c.width < f.w || c.height < f.h) {
      c.width = Math.max(c.width, f.w);
      c.height = Math.max(c.height, f.h);
    }
    const cx2 = c.getContext('2d');
    cx2.globalCompositeOperation = 'copy';
    cx2.drawImage(f.page, f.sx, f.sy, f.w, f.h, 0, 0, f.w, f.h);
    cx2.globalCompositeOperation = 'destination-out';
    const dx = Math.round(x - f.ox * k - this.cam.x);
    const dy = Math.round(y - f.oy * k - this.cam.y);
    const cx = (w.x - dx) / k;
    const cy = (w.y - dy) / k;
    const R = w.r / k;
    const FEATHER = 6 / k;
    const g = cx2.createRadialGradient(cx, cy, Math.max(0, R - FEATHER), cx, cy, R);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    cx2.fillStyle = g;
    cx2.fillRect(cx - R, cy - R, R * 2, R * 2);
    cx2.globalCompositeOperation = 'source-over';
    this.smooth(k !== 1);
    this.ctx.drawImage(c, 0, 0, f.w, f.h, dx, dy, f.w * k, f.h * k);
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
    // Signature Move: the last two poses of the spin linger faintly behind him (motion blur)
    const sf = u.anim === 'sig' && u.sigFrame ? u.sigFrame() : -1;
    if (sf >= SIG.spin[0] + 1 && sf <= SIG.hit + 1) {
      const a = u.sprites.anims.sig;
      const dir = a.data.findIndex((row) => row.includes(f));
      for (const [back, alpha] of [[2, 0.14], [1, 0.26]]) {
        const pf = dir >= 0 && a.data[dir][sf - back];
        if (!pf) continue;
        ctx.globalAlpha = alpha;
        this.drawFrame(pf, s.x, s.y);
      }
      ctx.globalAlpha = 1;
    }
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
    const post = this.post;
    const gpu = post && post.active ? (post.ripples.length = 0, post.ripples) : null;
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
      // with post-processing the shader bends the picture on the GPU (post.js, same maths);
      // reading pixels back to the CPU stalls the GPU, so this loop is only the fallback
      if (gpu) {
        if (gpu.length < 4) gpu.push([cx, cy, R, band, amp, k, ca, r.ang !== null ? r.half : -1]);
        continue;
      }
      const img = ctx.getImageData(x0, y0, w, h);
      // a copy of the untouched pixels to pull from, in a buffer kept between frames
      if (!this.ripSrc || this.ripSrc.length < img.data.length) this.ripSrc = new Uint8ClampedArray(img.data.length * 2);
      const src = this.ripSrc;
      src.set(img.data);
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
  /** The camera region (world tiles) the unit is in, or the nearest one. */
  camRegion(regions, u) {
    let best = null;
    let bd = Infinity;
    for (const r of regions) {
      const dx = Math.max(r.x0 - u.x, 0, u.x - r.x1);
      const dy = Math.max(r.y0 - u.y, 0, u.y - r.y1);
      const d = dx + dy;
      if (d < bd) {
        bd = d;
        best = r;
      }
    }
    return best;
  }

  drawCityGlow(ctx, cam, dt) {
    const W = this.w;
    const H = this.h;
    for (const pr of this.game.world.props) {
      if (!pr.sheet || pr.hidden) continue;
      const r = pr.rect;
      if (r[0] + r[2] < cam.x || r[0] > cam.x + W || r[1] + r[3] < cam.y || r[1] > cam.y + H + 60) continue;
      const L = pr.layers;
      if (!L.meta.neon) continue; // nothing of it glows (a Mustafar table or chair)
      const level = neonLevel(pr.neon, L.meta.neon, this.time, dt) * (pr.fade ?? 1);
      // (an empty layer is null: citySprites.js drops it at load)
      if (L.reflect) {
        ctx.globalAlpha = Math.min(1, level) * 0.85;
        this.drawFrame(L.reflect, pr.sx, pr.sy);
      }
      if (L.neon) {
        ctx.globalAlpha = Math.min(1, level);
        if (pr.window) this.drawWindowed(L.neon, pr.sx, pr.sy + (pr.bob || 0), pr.window);
        else this.drawFrame(L.neon, pr.sx, pr.sy + (pr.bob || 0));
      }
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
      const s = worldToScreen(x, y, g.world.groundAt ? g.world.groundAt(x, y) : 0); // (on a table top, at its height)
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
    // a light: its colour's pre-drawn radial sprite (lightSprite), scaled to its radius — no gradient
    // object or colour string made per light per frame
    const spot = (x, y, z, r, gg, b, rad, a = 1) => {
      const s = worldToScreen(x, y, z);
      const sx = s.x - cam.x;
      const sy = s.y - cam.y;
      if (sx < -rad || sy < -rad || sx > W + rad || sy > H + rad) return;
      l.globalAlpha = Math.min(1, a);
      l.drawImage(lightSprite(r | 0, gg | 0, b | 0), sx - rad, sy - rad, rad * 2, rad * 2);
      l.globalAlpha = 1;
    };
    const p = g.player;
    spot(p.x, p.y, 0.5, 255, 236, 210, 190, 0.42);
    for (const L of g.world.lights) {
      if (Math.abs(L.x - p.x) > 30 || Math.abs(L.y - p.y) > 30) continue;
      const fl = 1 + Math.sin(this.time * 3 + L.x * 7) * L.flicker;
      spot(L.x, L.y, L.z, L.r, L.g, L.b, L.rad * fl, 0.55);
    }
    // a lit blade lights its surroundings (saberLight.js: inverse-square falloff with a hot core, the
    // blade colour's reflected tints): along the blade, and the floor under it as an iso ellipse
    // along the blade's projection that stretches along a swing; the blade's flicker goes in
    const fl = flickerAt(this.time);
    for (const u of g.activeUnits) {
      if (!u.saberColor || u.dead || u.hidden || u.saberOut || u.saberLit === false) continue;
      const pal = paletteFor(u.saberColor);
      const f = u.frame();
      const s = worldToScreen(u.x, u.y, u.z);
      const sx = s.x - cam.x;
      const sy = s.y - cam.y;
      const b = f.markers.saberBase;
      const e = f.markers.saberTip;
      if (!pal || !b || !e) {
        const [r, gg, bl] = u.saberColor;
        spot(u.x, u.y, 1.2 + u.z, r, gg, bl, 70, 0.6);
        continue;
      }
      const t = tintFor(u.saberColor);
      const p = preset();
      const sweep = sweepOf(u, this.time);
      const o = this.saberPool(u, cam);
      const a = (0.75 + (sweep ? 0.3 * sweep.fresh : 0) + (u.deflectFlash > 0 ? 0.4 : 0)) * p.mapA * fl * o.light;
      for (const k of ['saber', 'saber2']) {
        const bb = f.markers[k + 'Base'];
        const ee = f.markers[k + 'Tip'];
        if (!bb || !ee) continue;
        // the blade's middle, a little towards the tip
        drawLight(l, sx + (bb[0] + ee[0]) * 0.5 + (ee[0] - bb[0]) * 0.15, sy + (bb[1] + ee[1]) * 0.5 + (ee[1] - bb[1]) * 0.15, t, p, a);
      }
      drawGround(l, o.gx, o.gy, o.dx, o.dy, t, p, sweep, a * 0.6, 'lighter', 0, o.spread);
    }
    for (const t of g.throws) spot(t.x, t.y, t.z, 90, 160, 255, 60, 0.6);
    for (const b of g.bolts) spot(b.x, b.y, b.z, b.color === 'red' ? 255 : 90, b.color === 'red' ? 70 : 140, b.color === 'red' ? 60 : 255, 26, 0.6);
    for (const fl of g.fx.lights) spot(fl.x, fl.y, fl.z, fl.r, fl.g, fl.b, fl.rad, 0.8 * (1 - fl.t / fl.life));
    // the craft over the undercity's streets light the street under them (their shadow is a dark core
    // in that pool: on the dark floor the light is what shows where they are)
    if (this.lanes) for (const [x, y] of this.lanes.positions('over')) if (Math.abs(x - p.x) < 18 && Math.abs(y - p.y) < 18) spot(x, y, 0, 200, 215, 255, 72, 0.5);
    for (const u of g.activeUnits) if (u.choke) spot(u.x, u.y, 1.2 + u.z, 160, 60, 60, 40, 0.5);
    // composite
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'multiply';
    this.smooth(false);
    ctx.drawImage(this.light, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
  }

  /**
   * The screen rectangle holding every pixel where the city's drop shows through the terrain: the union
   * of the diamonds of the void tiles in view (and of the off-map ones), exact — a sliver of drop
   * between two plates is never missed, whatever the camera does; null when none is in view.
   */
  voidRect(world, cam, W, H) {
    const bi = world.biome;
    const ww = world.w;
    const wh = world.h;
    // the tiles under the screen's corners give the range to scan (a tile's diamond spans 40 x 20 px)
    const at = (sx, sy) => [(sx / HALF_W + sy / HALF_H) / 2, (sy / HALF_H - sx / HALF_W) / 2];
    const c = [at(cam.x, cam.y), at(cam.x + W, cam.y), at(cam.x, cam.y + H), at(cam.x + W, cam.y + H)];
    const tx0 = Math.floor(Math.min(c[0][0], c[2][0])) - 1;
    const tx1 = Math.ceil(Math.max(c[1][0], c[3][0])) + 1;
    const ty0 = Math.floor(Math.min(c[0][1], c[1][1])) - 1;
    const ty1 = Math.ceil(Math.max(c[2][1], c[3][1])) + 1;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (let ty = ty0; ty <= ty1; ty++)
      for (let tx = tx0; tx <= tx1; tx++) {
        if (tx >= 0 && ty >= 0 && tx < ww && ty < wh && bi[ty * ww + tx] !== BIOME.VOID) continue;
        const left = (tx - ty - 1) * HALF_W - cam.x;
        const top = (tx + ty) * HALF_H - cam.y;
        if (left + 2 * HALF_W <= 0 || left >= W || top + 2 * HALF_H <= 0 || top >= H) continue;
        if (left < x0) x0 = left;
        if (top < y0) y0 = top;
        if (left + 2 * HALF_W > x1) x1 = left + 2 * HALF_W;
        if (top + 2 * HALF_H > y1) y1 = top + 2 * HALF_H;
      }
    if (x1 < x0) return null;
    x0 = Math.max(0, Math.floor(x0));
    y0 = Math.max(0, Math.floor(y0));
    return [x0, y0, Math.min(W, Math.ceil(x1)) - x0, Math.min(H, Math.ceil(y1)) - y0];
  }

  /**
   * Saber glow for every saber-wielding unit. The baked sprite already has
   * the blade core; the glow is added only along the stretches the baker
   * found in front of the body, so a blade behind Anakin's back stays hidden.
   */
  /**
   * The blade's ignition clock: stamped when the blade comes on (units.setSaber raises
   * `saberIgnite`; a direct `saberLit = true` is caught by the change), read as the ignition's
   * state (saberStyle.ignition) for the frames it lasts. A unit first seen lit does not ignite.
   */
  igniteOf(u) {
    const lit = !!u.saberColor && u.saberLit !== false;
    if (lit && (u.saberIgnite || u.wasLit === false)) u.igniteT = this.time;
    u.saberIgnite = false;
    u.wasLit = lit;
    return lit && u.igniteT != null ? ignition(this.time - u.igniteT) : null;
  }

  /** The ignition's state for a unit this frame (igniteOf stamped it at the frame's start). */
  igniting(u) {
    return u.igniteT != null && u.saberLit !== false ? ignition(this.time - u.igniteT) : null;
  }

  drawSabers(ctx, cam, dt) {
    for (const u of this.game.activeUnits) {
      const tr = u.saberTrail;
      if (tr) {
        for (const t of tr) t.t += dt;
        while (tr.length && tr[0].t > TRAIL_LIFE) tr.shift();
      }
      const ign = this.igniting(u);
      if (!u.saberColor || u.dead || u.hidden || u.saberOut || u.saberLit === false) continue;
      const f = u.frame();
      const s = worldToScreen(u.x, u.y, u.z);
      const sf = u.anim === 'sig' && u.sigFrame ? u.sigFrame() : -1;
      // the Signature Move leaves its trail only through the spin and the cut (frames 9-13)
      const swinging = u.anim.startsWith('attack') || u.anim === 'leap' || u.anim === 'parry' || (sf >= SIG.spin[0] + 1 && sf <= SIG.spin[1]);
      for (const k of ['saber', 'saber2']) {
        const b = f.markers[k + 'Base'];
        const e = f.markers[k + 'Tip'];
        if (!b || !e) continue;
        const bx = s.x + b[0] - cam.x;
        const by = s.y + b[1] - cam.y;
        const tx = s.x + e[0] - cam.x;
        const ty = s.y + e[1] - cam.y;
        const segs = f.blades ? f.blades[k] : [[0, 1]];
        const pal = paletteFor(u.saberColor);
        if (pal) {
          // the saber look (saberStyle.js): trail by style, colours by palette
          const hist = ((u.saberHist ||= {})[k] ||= []);
          record(hist, bx + cam.x, by + cam.y, tx + cam.x, ty + cam.y, this.time);
          if (swinging) u.trailUntil = this.time + trailWindow() + 0.05;
          if (this.time <= (u.trailUntil || 0)) drawTrail(ctx, hist, this.time, cam, pal);
          const flash = u.deflectFlash > 0 ? 1.6 : u.clashFlash > 0 ? 1.8 : 1;
          // igniting: only the stretch that has run out of the hilt so far, the tip fat and
          // the glow overshooting (drawBlade), the white spark at the hilt
          const grow = ign ? ign.grow : 1;
          for (const [s0, s1] of segs) {
            const e1 = Math.min(s1, grow);
            if (e1 - s0 < 0.02) continue;
            drawBlade(ctx, bx + (tx - bx) * s0, by + (ty - by) * s0, bx + (tx - bx) * e1, by + (ty - by) * e1, pal, flash, this.time, e1 === grow ? ign : null);
          }
          if (ign && ign.spark > 0) drawSpark(ctx, bx, by, pal, ign.spark);
          continue;
        }
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

  /**
   * Where a unit's blade lights the floor: the tints, the sweep, the ground point under the
   * blade's middle (screen px), the blade vector and the floor's brightness there (0..1, as the
   * light map leaves it). null without a lit blade.
   */
  saberPool(u, cam) {
    if (!u.saberColor || u.dead || u.hidden || u.saberOut || u.saberLit === false) return null;
    const f = u.frame();
    const b = f.markers.saberBase;
    const e = f.markers.saberTip;
    if (!b || !e) return null;
    const o = this.pool || (this.pool = { t: null, p: null, sweep: null, gx: 0, gy: 0, dx: 0, dy: 0, lx: 0, ly: 0, lum: 0, light: 1, spread: 1 });
    const amb = this.game.world.ambient || AMBIENT;
    const s = worldToScreen(u.x, u.y, u.z);
    const g0 = worldToScreen(u.x, u.y, 0);
    const mx = (b[0] + e[0]) / 2;
    const my = (b[1] + e[1]) / 2;
    o.t = tintFor(u.saberColor);
    o.p = preset();
    o.sweep = sweepOf(u, this.time);
    o.lx = s.x - cam.x + mx; // the blade's middle: where its light comes from
    o.ly = s.y - cam.y + my;
    o.gx = g0.x - cam.x + mx * 0.75;
    o.gy = g0.y - cam.y + Math.max(-8, Math.min(8, my * 0.15));
    o.dx = e[0] - b[0];
    o.dy = e[1] - b[1];
    o.lum = Math.min(1, this.terrain.lumAt(u.x, u.y) * ((amb[0] + amb[1] + amb[2]) / 765) * 1.7);
    // igniting: the light flashes with the spark and settles, the pool wider for a moment
    const ign = this.igniting(u);
    o.light = ign ? ign.light : 1;
    o.spread = ign ? ign.spread : 1;
    return o;
  }

  /** A bright floor takes the blades' colour (saberLight.drawGroundTint), under the sprites. */
  drawSaberFloorTint(ctx, cam) {
    const fl = flickerAt(this.time);
    for (const u of this.game.activeUnits) {
      const o = this.saberPool(u, cam);
      if (!o || o.lum <= 0.2) continue;
      drawGroundTint(ctx, o.gx, o.gy, o.dx, o.dy, o.t, o.p, o.sweep, (SABER.glow || 1) * fl * o.light, o.lum, o.spread);
    }
  }

  /**
   * The blades' light on characters beyond what the light map gives: each sprite's own colours
   * times the blade's light, fading from the blade ('lighter') — sheets with a normal pass get
   * the directional version instead (relight.js).
   */
  drawSaberLight(ctx, cam) {
    const g = this.game;
    const fl = flickerAt(this.time);
    for (const u of g.activeUnits) {
      const o = this.saberPool(u, cam);
      if (!o) continue;
      const { t, p, sweep, lx, ly } = o;
      // the floor: the light's ellipse added over the lit picture (the light map only darkens or
      // tints; this is the glow that punches through on a dark floor), along the blade, streaked
      // while swinging; a bright floor took the hue instead (drawSaberFloorTint)
      drawGround(ctx, o.gx, o.gy, o.dx, o.dy, t, p, sweep, (SABER.glow || 1) * fl * o.light, 'lighter', o.lum, o.spread);
      // the characters it reaches (itself and the nearest others, at most four)
      ctx.globalCompositeOperation = 'lighter';
      const R = (p.r0 * p.reach) / PX_PER_UNIT; // world units the light reaches
      const near = this.saberNear || (this.saberNear = []);
      near.length = 0;
      for (const v of g.activeUnits) {
        if (v.dead || v.hidden || v.frame().normal) continue; // normal-mapped sheets: relightUnits
        if (Math.hypot(v.x - u.x, v.y - u.y) <= R) near.push(v);
      }
      if (near.length > 4) near.sort((a, c) => Math.hypot(a.x - u.x, a.y - u.y) - Math.hypot(c.x - u.x, c.y - u.y)).length = 4;
      const boost = (1 + (sweep ? 0.35 * sweep.fresh : 0)) * fl * o.light;
      for (const v of near) {
        const vf = v.frame();
        const vs = worldToScreen(v.x, v.y, v.z);
        const k = vf.k || 1;
        // the wielder: the arm and side by the blade catch it, the rest little
        lightCharacter(ctx, vf, Math.round(vs.x - vf.ox * k - cam.x), Math.round(vs.y - vf.oy * k - cam.y), t, p, (v === u ? 0.55 : 1.2) * boost * (SABER.glow || 1), lx, ly);
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
    const g = this.game;
    const cam = this.cam;
    const S = this.scale;
    let n = 0; // things drawn; an empty overlay stays untouched so the compositor needn't re-upload it
    if (this.overlayUsed) {
      o.setTransform(1, 0, 0, 1, 0, 0);
      o.clearRect(0, 0, this.overlay.width, this.overlay.height);
    }
    o.setTransform(this.odpr, 0, 0, this.odpr, 0, 0);
    // small health bars for damaged units near the player
    for (const u of g.activeUnits) {
      if (u.dead || u === g.player || u.hp >= u.maxHp) continue;
      if (dist(u.x, u.y, g.player.x, g.player.y) > 18) continue;
      const s = worldToScreen(u.x, u.y, u.z);
      const top = u.kind === 'b2' ? 62 : u.kind === 'r2' ? 30 : 54;
      const x = (s.x - cam.x) * S;
      const y = (s.y - cam.y - top) * S;
      const w = 34;
      n++;
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
      n++;
      o.textAlign = 'center';
      o.font = canvasFont(600, 12, 'body');
      o.fillStyle = 'rgba(0,0,0,0.6)';
      o.fillText(u.name, x + 1, y + 1);
      o.fillStyle = '#e8eef4';
      o.fillText(u.name, x, y);
      const q = g.quests;
      const giver = u.npcId;
      const mark = q.readyFrom(giver) ? '?' : q.offerFrom(giver) ? '!' : '';
      if (mark) {
        o.font = canvasFont(700, 20, 'display');
        o.fillStyle = '#e9c47a';
        o.fillText(mark, x, y - 16);
      }
      if (d < 2.6 && !g.talkingTo) {
        o.font = canvasFont(500, 11, 'body');
        o.fillStyle = 'rgba(233,196,122,0.95)';
        o.fillText(this.touchMode ? '대화 버튼으로 말 걸기' : '[E] 대화', x, y + 16);
      }
      o.textAlign = 'start';
    }
    g.fx.drawText(o, cam, S);
    n += g.fx.texts.length;
    n += this.drawBubbles(o, cam, S);
    this.overlayUsed = n > 0;
  }

  /** Speech bubbles over people's heads, at screen resolution. Returns how many were drawn. */
  drawBubbles(o, cam, S) {
    const g = this.game;
    let n = 0;
    o.font = canvasFont(500, 12, 'body');
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
      n++;
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
    return n;
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

const LIGHTS = new Map();
/** A light's radial falloff in its colour at full strength (64 px, drawn once per colour, then scaled;
 *  the strength is the draw's globalAlpha). */
function lightSprite(r, g, b) {
  const key = ((r << 16) | (g << 8) | b) >>> 0;
  let c = LIGHTS.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const grd = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, `rgba(${r},${g},${b},1)`);
  grd.addColorStop(1, `rgba(${r},${g},${b},0)`);
  x.fillStyle = grd;
  x.fillRect(0, 0, 64, 64);
  if (LIGHTS.size > 256) LIGHTS.clear(); // (saber tints make new colours; keep it bounded)
  LIGHTS.set(key, c);
  return c;
}


/** A footprint's world box [x0, y0, x1, y1] at (x, y). */
function boxOf(x, y, poly) {
  if (!poly) return [x - 0.3, y - 0.3, x + 0.3, y + 0.3];
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  return [x + Math.min(...xs), y + Math.min(...ys), x + Math.max(...xs), y + Math.max(...ys)];
}

/**
 * Which of two boxes is drawn first: -1 when a stands behind b, 1 when in front, 0 when they do not
 * decide each other. Screen-down is +x and +y, so a box wholly at smaller x (or y) than another is
 * behind it — unless it is also at larger y (or x): then they stand side by side on screen.
 */
/** A frame's alpha channel (once, for the occlusion test); null when its page cannot be read. */
function alphaOf(f) {
  try {
    const c = document.createElement('canvas');
    c.width = f.w;
    c.height = f.h;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(f.page, f.sx, f.sy, f.w, f.h, 0, 0, f.w, f.h);
    const d = x.getImageData(0, 0, f.w, f.h).data;
    const a = new Uint8Array(f.w * f.h);
    for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3];
    return a;
  } catch {
    return null;
  }
}

function boxOrder(a, b) {
  const e = 0.05;
  const xb = a[2] <= b[0] + e;
  const xf = a[0] >= b[2] - e;
  const yb = a[3] <= b[1] + e;
  const yf = a[1] >= b[3] - e;
  if ((xb && !yf) || (yb && !xf)) return -1;
  if ((xf && !yb) || (yf && !xb)) return 1;
  return 0;
}

function extent(poly) {
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
}

// tail lights of the craft passing high over the undercity

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
