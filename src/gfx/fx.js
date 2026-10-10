// Particle & effect system. Everything lives in world coordinates and is
// drawn by the renderer: `drawWorld` for normal-blended things, `drawAdd`
// for additive glow, and `drawText` on the full-resolution overlay.
import { worldToScreen } from '../core/iso.js';
import { rand } from '../core/math.js';
import { SABER } from './saberStyle.js';
import { canvasFont } from '../ui/fonts.js';

// a soft round puff (steam), drawn scaled
const PUFF = (() => {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(225,230,236,1)');
  g.addColorStop(0.5, 'rgba(210,216,224,0.55)');
  g.addColorStop(1, 'rgba(200,206,214,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 32, 32);
  return c;
})();

// a soft additive glow (white core, fading edge), tinted per use by drawing it over a colour
const GLOW = (() => {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.18, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  return c;
})();

const glowCache = new Map();
/** The GLOW sprite in one colour (cached per colour). */
export function glowSprite(rgb) {
  const key = rgb.join(',');
  let c = glowCache.get(key);
  if (!c && GLOW) {
    c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d');
    x.drawImage(GLOW, 0, 0);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = `rgb(${key})`;
    x.fillRect(0, 0, 64, 64);
    // keep a white-hot centre
    x.globalCompositeOperation = 'lighter';
    x.globalAlpha = 0.6;
    x.drawImage(GLOW, 16, 16, 32, 32);
    glowCache.set(key, c);
  }
  return c;
}

const MAX_SCORCH = 60;

export class Effects {
  constructor() {
    this.parts = [];
    this.waves = [];
    this.texts = [];
    this.bolts = []; // lightning arcs
    this.decals = []; // scorch marks on the ground
    this.cones = [];
    this.lights = []; // transient lights {x,y,z,r,g,b,rad,t,life}
    this.flashes = []; // short bright bursts where blades clash or bolts hit
    this.saberClashes = []; // blade clashes, drawn by the renderer in the saber style (saberStyle.js)
    this.scorches = []; // blaster marks on walls (depth-sorted with the walls)
    this.ripples = []; // Force: a refraction ring that bends the picture behind it
    this.shakeAmt = 0;
  }

  update(dt) {
    for (const p of this.parts) {
      p.t += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vz -= (p.grav ?? 9) * dt;
      if (p.z < 0) {
        p.z = 0;
        p.vz *= -0.35;
        p.vx *= 0.6;
        p.vy *= 0.6;
      }
      if (p.drag) {
        const f = Math.pow(p.drag, dt);
        p.vx *= f;
        p.vy *= f;
      }
    }
    this.parts = this.parts.filter((p) => p.t < p.life);
    for (const arr of [this.waves, this.texts, this.bolts, this.cones, this.lights, this.flashes, this.scorches, this.ripples, this.saberClashes]) for (const w of arr) w.t += dt;
    if (this.saberClashes.length) this.saberClashes = this.saberClashes.filter((w) => w.t < w.life);
    this.flashes = this.flashes.filter((w) => w.t < w.life);
    this.scorches = this.scorches.filter((w) => w.t < w.life);
    this.ripples = this.ripples.filter((w) => w.t < w.life);
    this.waves = this.waves.filter((w) => w.t < w.life);
    this.texts = this.texts.filter((w) => w.t < w.life);
    this.bolts = this.bolts.filter((w) => w.t < w.life);
    this.cones = this.cones.filter((w) => w.t < w.life);
    this.lights = this.lights.filter((w) => w.t < w.life);
    for (const d of this.decals) d.t += dt;
    this.decals = this.decals.filter((d) => d.t < d.life);
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 25);
  }

  shake(a) {
    this.shakeAmt = Math.max(this.shakeAmt, a);
  }

  light(x, y, z, rgb, rad, life) {
    this.lights.push({ x, y, z, r: rgb[0], g: rgb[1], b: rgb[2], rad, t: 0, life });
  }

  sparks(x, y, z, color = '#ffd27a', n = 8, speed = 4) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = rand(0.3, 1) * speed;
      this.parts.push({ kind: 'spark', x, y, z, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: rand(1, 4), t: 0, life: rand(0.2, 0.5), color, add: true, grav: 12 });
    }
    this.light(x, y, z, [255, 200, 120], 30, 0.15);
  }

  /** A short bright burst (additive) that also lights its surroundings. */
  flash(x, y, z, rgb = [255, 240, 210], size = 18, life = 0.09) {
    this.flashes.push({ x, y, z, rgb, size, t: 0, life, rot: Math.random() * Math.PI });
    this.light(x, y, z, rgb, size * 6, life * 1.6);
  }

  /** Blade meets blade: a white-hot flash, a spray of sparks cooling from white to amber. */
  clash(x, y, z, n = 14, rgb = [255, 236, 200]) {
    {
      // the clash is drawn in the chosen saber style (saberStyle.drawClash); its light stays
      this.saberClashes.push({ x, y, z, t: 0, life: SABER.trail === 'movie' ? 0.1 : 0.14, big: n > 12 });
      this.light(x, y, z, rgb, (n > 12 ? 24 : 18) * 6, 0.16);
      return;
    }
    this.flash(x, y, z, rgb, n > 12 ? 24 : 18, 0.1);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = rand(1.5, 5);
      this.parts.push({ kind: 'spark', x, y, z, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: rand(0.5, 4.5), t: 0, life: rand(0.25, 0.55), color: i % 3 ? '#ffd27a' : '#ffffff', add: true, grav: 12, cool: true });
    }
  }

  /** A blaster bolt strikes a wall: sparks, a flash, and a scorch mark with a cooling ember. */
  scorch(x, y, z, rgb) {
    this.flash(x, y, z, rgb, 12, 0.08);
    this.sparks(x, y, z, `rgb(${rgb.map((c) => Math.min(255, c + 80)).join(',')})`, 5, 2.5);
    this.scorches.push({ x, y, z, r: rand(3, 4.5), t: 0, life: 25, rgb, rot: Math.random() * Math.PI });
    if (this.scorches.length > MAX_SCORCH) this.scorches.shift();
  }

  /**
   * The Force bends space: a ring of refraction that expands from (x, y) to
   * radius r (world units). `ang`/`half` limit it to a cone (Force Push).
   */
  ripple(x, y, r, life = 0.45, amp = 3, ang = null, half = Math.PI) {
    this.ripples.push({ x, y, r, life, amp, ang, half, t: 0 });
  }

  debris(x, y, n = 6, color = '#b39f74') {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = rand(1, 3.5);
      this.parts.push({ kind: 'chunk', x, y, z: 0.8, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: rand(2, 5), t: 0, life: rand(1.5, 3), color, size: Math.random() < 0.5 ? 2 : 1 });
    }
  }

  smoke(x, y, z = 0.8, n = 4, color = '80,76,72') {
    for (let i = 0; i < n; i++) {
      this.parts.push({ kind: 'smoke', x: x + rand(-0.2, 0.2), y: y + rand(-0.2, 0.2), z, vx: rand(-0.3, 0.3), vy: rand(-0.3, 0.3), vz: rand(0.6, 1.4), grav: 0, t: 0, life: rand(1, 2), color, size: rand(3, 6) });
    }
  }

  /** Steam from a vent: slow puffs that rise, drift and spread. */
  steam(x, y, z, n = 1) {
    for (let i = 0; i < n; i++) {
      this.parts.push({ kind: 'steam', x: x + rand(-0.15, 0.15), y: y + rand(-0.15, 0.15), z, vx: rand(-0.15, 0.25), vy: rand(-0.25, 0.15), vz: rand(0.5, 0.9), grav: -0.15, drag: 0.6, t: 0, life: rand(2.2, 3.6), size: rand(4, 7) });
    }
  }

  dust(x, y, n = 8) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = rand(0.8, 2.5);
      this.parts.push({ kind: 'smoke', x, y, z: 0.1, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: rand(0.1, 0.6), grav: 0, drag: 0.1, t: 0, life: rand(0.6, 1.2), color: '150,135,110', size: rand(3, 6) });
    }
  }

  afterimage(x, y, frame, alpha = 0.4) {
    this.parts.push({ kind: 'ghost', x, y, z: 0, vx: 0, vy: 0, vz: 0, grav: 0, t: 0, life: 0.25, frame, alpha });
  }

  shockwave(x, y, r, color = '#9fd0ff', life = 0.4) {
    this.waves.push({ x, y, r, color, t: 0, life });
    this.light(x, y, 0.3, [160, 200, 255], r * 30, life);
  }

  ring(x, y, r, color, life = 0.5) {
    this.waves.push({ x, y, r, color, t: 0, life, ring: true });
  }

  forceCone(x, y, ang, range) {
    this.cones.push({ x, y, ang, range, t: 0, life: 0.35 });
    this.ripple(x, y, range, 0.4, 3.5, ang, 0.75);
  }

  lightning(x1, y1, z1, x2, y2, z2, color = '#9fdcff') {
    this.bolts.push({ x1, y1, z1, x2, y2, z2, color, t: 0, life: 0.22, seed: Math.random() * 1000 });
    this.light(x2, y2, z2, [140, 200, 255], 40, 0.2);
  }

  explosion(x, y, size = 1) {
    for (let i = 0; i < 14 * size; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = rand(1, 5) * size;
      this.parts.push({ kind: 'fire', x, y, z: 0.3, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: rand(1, 4), grav: 2, drag: 0.05, t: 0, life: rand(0.3, 0.7), add: true, size: rand(2, 4) * size });
    }
    this.smoke(x, y, 0.5, 6 * size, '60,56,52');
    this.debris(x, y, 5, '#5a524a');
    this.waves.push({ x, y, r: 1.4 * size, color: '#ffb060', t: 0, life: 0.3 });
    this.light(x, y, 0.5, [255, 160, 80], 120 * size, 0.5);
    this.decals.push({ x, y, r: 1.1 * size, t: 0, life: 40 });
    this.shake(5 * size);
  }

  text(x, y, str, color = '#fff', scale = 1, z = 1.9, life = 1.0) {
    this.texts.push({ x: x + rand(-0.2, 0.2), y, z, str, color, scale, t: 0, life });
  }

  // -------------------------------------------------------------------------- drawing

  drawDecals(ctx, cam) {
    for (const d of this.decals) {
      const s = worldToScreen(d.x, d.y);
      const a = Math.min(1, (d.life - d.t) / 8) * 0.7;
      ctx.save();
      ctx.translate(Math.round(s.x - cam.x), Math.round(s.y - cam.y));
      ctx.scale(1, 0.5);
      const rr = d.r * 28;
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rr);
      g.addColorStop(0, `rgba(20,16,14,${a})`);
      g.addColorStop(1, 'rgba(20,16,14,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, rr, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  /** Non-additive particles (smoke, debris, afterimages). */
  drawWorld(ctx, cam) {
    for (const p of this.parts) {
      if (p.add) continue;
      const s = worldToScreen(p.x, p.y, p.z);
      const sx = Math.round(s.x - cam.x);
      const sy = Math.round(s.y - cam.y);
      const k = p.t / p.life;
      if (p.kind === 'smoke') {
        ctx.fillStyle = `rgba(${p.color},${(1 - k) * 0.45})`;
        const r = p.size * (0.6 + k);
        ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
      } else if (p.kind === 'steam') {
        // a soft puff that swells and thins as it rises
        const r = p.size * (0.7 + k * 1.6);
        ctx.globalAlpha = Math.sin(Math.min(1, k * 4) * Math.PI * 0.5) * (1 - k) * 0.5;
        ctx.drawImage(PUFF, sx - r, sy - r, r * 2, r * 2);
        ctx.globalAlpha = 1;
      } else if (p.kind === 'chunk') {
        ctx.globalAlpha = Math.min(1, (p.life - p.t) * 2);
        ctx.fillStyle = p.color;
        ctx.fillRect(sx, sy, p.size, p.size);
        ctx.globalAlpha = 1;
      } else if (p.kind === 'ghost') {
        const f = p.frame;
        ctx.globalAlpha = p.alpha * (1 - k);
        const fk = f.k || 1; // a sheet drawn at another size than game pixels
        ctx.drawImage(f.page, f.sx, f.sy, f.w, f.h, sx - f.ox * fk, sy - f.oy * fk, f.w * fk, f.h * fk);
        ctx.globalAlpha = 1;
      }
    }
  }

  /** Additive glows: sparks, fire, shockwaves, lightning, force cones. */
  drawAdd(ctx, cam) {
    for (const p of this.parts) {
      if (!p.add) continue;
      const s = worldToScreen(p.x, p.y, p.z);
      const sx = Math.round(s.x - cam.x);
      const sy = Math.round(s.y - cam.y);
      const k = p.t / p.life;
      if (p.kind === 'spark') {
        const e = worldToScreen(p.x - p.vx * 0.03, p.y - p.vy * 0.03, p.z - p.vz * 0.03);
        ctx.strokeStyle = p.cool ? (k < 0.25 ? '#ffffff' : k < 0.6 ? '#ffd27a' : '#ff8a30') : p.color;
        ctx.globalAlpha = 1 - k;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(sx + 0.5, sy + 0.5);
        ctx.lineTo(Math.round(e.x - cam.x) + 0.5, Math.round(e.y - cam.y) + 0.5);
        ctx.stroke();
      } else if (p.kind === 'fire') {
        const r = p.size * (1 - k * 0.5);
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = k < 0.3 ? '#fff2b0' : k < 0.6 ? '#ffb040' : '#c04010';
        ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
      }
    }
    ctx.globalAlpha = 1;
    for (const f of this.flashes) {
      const k = f.t / f.life;
      const s = worldToScreen(f.x, f.y, f.z);
      const sx = s.x - cam.x;
      const sy = s.y - cam.y;
      const r = f.size * (0.6 + 0.6 * k);
      ctx.globalAlpha = 1 - k * k;
      ctx.drawImage(glowSprite(f.rgb), sx - r, sy - r, r * 2, r * 2);
      // a four-point star: two thin crossed streaks
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(f.rot);
      ctx.fillStyle = '#ffffff';
      const L = f.size * (1.2 - k * 0.6);
      ctx.fillRect(-L, -0.5, L * 2, 1);
      ctx.fillRect(-0.5, -L * 0.6, 1, L * 1.2);
      ctx.restore();
    }
    // embers in fresh scorch marks, cooling over two seconds
    for (const m of this.scorches) {
      if (m.t > 2) continue;
      const s = worldToScreen(m.x, m.y, m.z);
      const k = m.t / 2;
      ctx.globalAlpha = (1 - k) * 0.9;
      ctx.drawImage(glowSprite([255, 140, 60]), s.x - cam.x - 4, s.y - cam.y - 4, 8, 8);
    }
    ctx.globalAlpha = 1;
    for (const w of this.waves) {
      const k = w.t / w.life;
      const s = worldToScreen(w.x, w.y);
      const r = (w.ring ? w.r : w.r * (0.2 + 0.8 * Math.sqrt(k))) * 28;
      ctx.save();
      ctx.translate(Math.round(s.x - cam.x), Math.round(s.y - cam.y));
      ctx.scale(1, 0.5);
      ctx.globalAlpha = (1 - k) * 0.9;
      ctx.strokeStyle = w.color;
      ctx.lineWidth = w.ring ? 2 : 3 * (1 - k) + 1;
      ctx.beginPath();
      ctx.arc(0, 0, w.ring ? r * (0.8 + 0.2 * Math.sin(k * 6)) : r, 0, Math.PI * 2);
      ctx.stroke();
      if (!w.ring) {
        ctx.globalAlpha = (1 - k) * 0.12;
        ctx.fillStyle = w.color;
        ctx.fill();
      }
      ctx.restore();
    }
    for (const c of this.cones) {
      const k = c.t / c.life;
      for (let i = 0; i < 4; i++) {
        const rr = c.range * (0.25 + 0.75 * k) * (0.6 + i * 0.14);
        ctx.globalAlpha = (1 - k) * (0.8 - i * 0.15);
        ctx.strokeStyle = i % 2 ? '#c8b6ff' : '#e8f4ff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let j = 0; j <= 10; j++) {
          const a = c.ang - 0.6 + (1.2 * j) / 10;
          const s = worldToScreen(c.x + Math.cos(a) * rr, c.y + Math.sin(a) * rr, 0.9);
          if (j === 0) ctx.moveTo(s.x - cam.x, s.y - cam.y);
          else ctx.lineTo(s.x - cam.x, s.y - cam.y);
        }
        ctx.stroke();
      }
    }
    for (const b of this.bolts) {
      const k = b.t / b.life;
      const a = worldToScreen(b.x1, b.y1, b.z1);
      const e = worldToScreen(b.x2, b.y2, b.z2);
      ctx.globalAlpha = 1 - k;
      for (let pass = 0; pass < 2; pass++) {
        ctx.strokeStyle = pass ? '#ffffff' : b.color;
        ctx.lineWidth = pass ? 1 : 2;
        ctx.beginPath();
        ctx.moveTo(a.x - cam.x, a.y - cam.y);
        const n = 7;
        for (let i = 1; i < n; i++) {
          const t = i / n;
          const jx = (Math.sin(b.seed + i * 12.9 + b.t * 60) * 5) | 0;
          const jy = (Math.cos(b.seed + i * 7.3 + b.t * 50) * 5) | 0;
          ctx.lineTo(a.x + (e.x - a.x) * t - cam.x + jx, a.y + (e.y - a.y) * t - cam.y + jy);
        }
        ctx.lineTo(e.x - cam.x, e.y - cam.y);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  /** A scorch mark on a wall (drawn in depth order with the walls). */
  drawScorch(ctx, cam, m) {
    const s = worldToScreen(m.x, m.y, m.z);
    const a = Math.min(1, (m.life - m.t) / 6) * 0.9;
    ctx.save();
    ctx.translate(Math.round(s.x - cam.x), Math.round(s.y - cam.y));
    ctx.rotate(m.rot);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, m.r);
    g.addColorStop(0, `rgba(12,10,8,${a})`);
    g.addColorStop(0.6, `rgba(30,24,20,${a * 0.6})`);
    g.addColorStop(1, 'rgba(30,24,20,0)');
    ctx.fillStyle = g;
    ctx.scale(1, 0.75);
    ctx.beginPath();
    ctx.arc(0, 0, m.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawText(ctx, cam, scale) {
    ctx.textAlign = 'center';
    for (const t of this.texts) {
      const k = t.t / t.life;
      const s = worldToScreen(t.x, t.y, t.z + k * 0.9);
      const x = (s.x - cam.x) * scale;
      const y = (s.y - cam.y) * scale;
      const size = Math.round(13 * t.scale * (k < 0.15 ? 1 + (0.15 - k) * 3 : 1));
      ctx.font = canvasFont(400, size + 3, 'data'); // the damage numbers: the data font
      ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
      ctx.fillStyle = '#000';
      ctx.fillText(t.str, x + 1, y + 1);
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, x, y);
    }
    ctx.globalAlpha = 1;
  }
}
