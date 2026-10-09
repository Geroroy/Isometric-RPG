// Particle & effect system. Everything lives in world coordinates and is
// drawn by the renderer: `drawWorld` for normal-blended things, `drawAdd`
// for additive glow, and `drawText` on the full-resolution overlay.
import { worldToScreen } from '../core/iso.js';
import { rand } from '../core/math.js';

export class Effects {
  constructor() {
    this.parts = [];
    this.waves = [];
    this.texts = [];
    this.bolts = []; // lightning arcs
    this.decals = []; // scorch marks on the ground
    this.cones = [];
    this.lights = []; // transient lights {x,y,z,r,g,b,rad,t,life}
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
    for (const arr of [this.waves, this.texts, this.bolts, this.cones, this.lights]) for (const w of arr) w.t += dt;
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

  text(x, y, str, color = '#fff', scale = 1, z = 1.9) {
    this.texts.push({ x: x + rand(-0.2, 0.2), y, z, str, color, scale, t: 0, life: 1.0 });
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
      } else if (p.kind === 'chunk') {
        ctx.globalAlpha = Math.min(1, (p.life - p.t) * 2);
        ctx.fillStyle = p.color;
        ctx.fillRect(sx, sy, p.size, p.size);
        ctx.globalAlpha = 1;
      } else if (p.kind === 'ghost') {
        const f = p.frame;
        ctx.globalAlpha = p.alpha * (1 - k);
        ctx.drawImage(f.page, f.sx, f.sy, f.w, f.h, sx - f.ox, sy - f.oy, f.w, f.h);
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
        ctx.strokeStyle = p.color;
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

  drawText(ctx, cam, scale) {
    ctx.textAlign = 'center';
    for (const t of this.texts) {
      const k = t.t / t.life;
      const s = worldToScreen(t.x, t.y, t.z + k * 0.9);
      const x = (s.x - cam.x) * scale;
      const y = (s.y - cam.y) * scale;
      const size = Math.round(13 * t.scale * (k < 0.15 ? 1 + (0.15 - k) * 3 : 1));
      ctx.font = `700 ${size + 2}px Galmuri11, sans-serif`;
      ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
      ctx.fillStyle = '#000';
      ctx.fillText(t.str, x + 1, y + 1);
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, x, y);
    }
    ctx.globalAlpha = 1;
  }
}
