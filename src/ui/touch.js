// Touch controls for phones (Diablo Immortal style):
//   left side   virtual joystick (appears where the thumb lands); quick tap = tap-to-move/attack
//   right side  big attack button (hold = keep attacking the nearest droid)
//               six skill buttons: tap = auto-target, drag = aim with a ground marker
//   top right   menu buttons (skills / character / map / help)
import { SKILLS } from '../game/skills.js';
import { iconURL } from './icons.js';
import { screenVecToWorldAngle } from '../core/iso.js';
import { dist, angleDiff } from '../core/math.js';

// how far a dragged skill is aimed (world units) when the skill targets a point
const AIM_RANGE = { throw: 7, push: 3.5, leap: 7.5, clones: 3, gunship: 9, fury: 3, rex: 2 };
const AIM_RADIUS = { leap: 2.2, gunship: 3.5, push: 1.2 };

const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

export function isTouchDevice() {
  return window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
}

/** A mouse or trackpad is connected (e.g. a tablet with a Bluetooth mouse). */
export function hasMouse() {
  return window.matchMedia('(any-pointer: fine)').matches;
}

export class TouchControls {
  constructor(game, renderer, hud, input, audio) {
    this.game = game;
    this.renderer = renderer;
    this.hud = hud;
    this.input = input;
    this.audio = audio;
    this.enabled = false;
    this.joy = null; // { id, ox, oy, x, y, t0 }
    this.attackHeld = false;
    this.aiming = null; // { id, slot, sx, sy, dx, dy }
    this.build();
  }

  enable() {
    if (this.enabled) return;
    this.enabled = true;
    document.body.classList.add('touch');
    this.renderer.touchMode = true;
    if (this.onEnable) this.onEnable();
    window.dispatchEvent(new Event('resize'));
  }

  /** Back to mouse & keyboard (PC HUD), e.g. when a tablet's mouse is used. */
  disable() {
    if (!this.enabled) return;
    this.enabled = false;
    this.cancelJoystick();
    this.attackHeld = false;
    document.body.classList.remove('touch');
    this.renderer.touchMode = false;
    if (this.onEnable) this.onEnable();
    window.dispatchEvent(new Event('resize'));
  }

  cancelJoystick() {
    if (!this.joy) return;
    this.joy = null;
    this.stick.classList.add('hidden');
    this.game.player.stopSteer();
  }

  build() {
    const root = (this.root = el('div', 'touch-ui'));
    root.id = 'touch';
    // joystick zone + visual
    this.zone = el('div', 'joy-zone');
    this.stick = el('div', 'joy hidden', '<div class="joy-knob"></div>');
    root.append(this.zone, this.stick);

    // action cluster
    const cluster = el('div', 't-cluster');
    this.attackBtn = el('div', 't-btn t-attack', `<img src="${iconURL('attack')}" alt=""><span>공격</span>`);
    this.talkMode = false;
    cluster.appendChild(this.attackBtn);
    this.skillBtns = [];
    for (let i = 0; i < 6; i++) {
      const b = el('div', `t-btn t-skill s${i}`, '<img alt=""><div class="cd"></div><span class="lv"></span>');
      b.dataset.slot = i;
      cluster.appendChild(b);
      this.skillBtns.push(b);
    }
    this.bactaBtn = el('div', 't-btn t-bacta', `<img src="${iconURL('bacta')}" alt=""><span class="lv"></span>`);
    cluster.appendChild(this.bactaBtn);
    root.appendChild(cluster);

    // the saber switch: a small key beside the cluster (the menu keys live in ui/mobileHud.js)
    this.saberBtn = el('div', 't-btn t-saber', `<img src="${iconURL('flurry')}" alt=""><span class="lv">검</span>`);
    this.saberBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.audio.unlock();
      this.game.player.setSaber(!this.game.player.saberLit);
    });
    if (!this.game.duel) cluster.appendChild(this.saberBtn);
    document.getElementById('hud').appendChild(root);

    this.bindJoystick();
    this.bindButtons();
  }

  // ------------------------------------------------------------------ joystick

  bindJoystick() {
    const z = this.zone;
    z.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return; // the mouse switches to PC controls
      e.preventDefault();
      this.audio.unlock();
      if (this.joy) return;
      z.setPointerCapture(e.pointerId);
      this.joy = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY, t0: performance.now(), moved: false };
      this.stick.style.left = e.clientX + 'px';
      this.stick.style.top = e.clientY + 'px';
      this.stick.classList.remove('hidden');
      this.knob(0, 0);
    });
    z.addEventListener('pointermove', (e) => {
      const j = this.joy;
      if (!j || e.pointerId !== j.id) return;
      j.x = e.clientX;
      j.y = e.clientY;
      const dx = j.x - j.ox;
      const dy = j.y - j.oy;
      if (Math.hypot(dx, dy) > 10) j.moved = true;
      const max = 46;
      const m = Math.min(max, Math.hypot(dx, dy)) / (Math.hypot(dx, dy) || 1);
      this.knob(dx * m, dy * m);
    });
    const end = (e) => {
      const j = this.joy;
      if (!j || e.pointerId !== j.id) return;
      this.joy = null;
      this.stick.classList.add('hidden');
      this.game.player.stopSteer();
      // a quick tap without dragging acts like a click on the world
      if (!j.moved && performance.now() - j.t0 < 280) this.tapWorld(j.ox, j.oy);
    };
    z.addEventListener('pointerup', end);
    z.addEventListener('pointercancel', end);
  }

  knob(x, y) {
    this.stick.firstChild.style.transform = `translate(${x}px, ${y}px)`;
  }

  tapWorld(x, y) {
    const g = this.game;
    const p = g.player;
    if (p.dead) return;
    this.input.mx = x;
    this.input.my = y;
    this.input.updateMouse();
    const t = g.hover && g.hover.team === 'cis' ? g.hover : null;
    if (g.hover && g.hover.npc) p.commandTalk(g.hover);
    else if (t) p.basicAttack(t);
    else {
      const m = g.mouseWorld;
      p.commandMove(m.x, m.y);
      this.renderer.addClickMark(m.x, m.y);
    }
  }

  // ------------------------------------------------------------------ buttons

  bindButtons() {
    const a = this.attackBtn;
    a.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.audio.unlock();
      a.setPointerCapture(e.pointerId);
      a.classList.add('down');
      if (this.game.duel && this.game.duel.press()) return;
      this.attackHeld = true;
    });
    const release = () => {
      this.attackHeld = false;
      a.classList.remove('down');
    };
    a.addEventListener('pointerup', release);
    a.addEventListener('pointercancel', release);

    const bb = this.bactaBtn;
    if (this.game.duel) {
      // no bacta in the duel: this button is the guard (hold)
      bb.innerHTML = `<img src="${iconURL('shien')}" alt=""><span class="lv">막기</span>`;
      bb.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.audio.unlock();
        bb.setPointerCapture(e.pointerId);
        bb.classList.add('down');
        const g = this.game;
        g.player.blocking = true;
        g.player.blockT = g.time;
      });
      const off = () => {
        bb.classList.remove('down');
        this.game.player.blocking = false;
      };
      bb.addEventListener('pointerup', off);
      bb.addEventListener('pointercancel', off);
    } else {
      bb.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.audio.unlock();
        this.game.useBacta();
      });
    }

    for (const b of this.skillBtns) {
      const slot = +b.dataset.slot;
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.audio.unlock();
        const id = this.game.player.hotbar[slot];
        if (!id) {
          this.hud.toggle('tree', true);
          return;
        }
        if (SKILLS[id].target === 'self') {
          this.castAuto(id);
          b.classList.add('down');
          setTimeout(() => b.classList.remove('down'), 120);
          return;
        }
        b.setPointerCapture(e.pointerId);
        b.classList.add('down');
        this.aiming = { id: e.pointerId, slot, sx: e.clientX, sy: e.clientY, dx: 0, dy: 0 };
      });
      b.addEventListener('pointermove', (e) => {
        const a2 = this.aiming;
        if (!a2 || a2.id !== e.pointerId) return;
        a2.dx = e.clientX - a2.sx;
        a2.dy = e.clientY - a2.sy;
      });
      const up = (e) => {
        const a2 = this.aiming;
        if (!a2 || a2.id !== e.pointerId) return;
        this.aiming = null;
        this.renderer.aim = null;
        b.classList.remove('down');
        if (e.type === 'pointercancel') return;
        const id = this.game.player.hotbar[a2.slot];
        if (!id) return;
        if (Math.hypot(a2.dx, a2.dy) > 16) this.castAimed(id, a2.dx, a2.dy);
        else this.castAuto(id);
      };
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
    }
  }

  nearestEnemy(maxD, ang = null) {
    const g = this.game;
    const p = g.player;
    let best = null;
    let bs = Infinity;
    for (const u of g.activeUnits) {
      if (u.dead || u.team !== 'cis') continue;
      const d = dist(p.x, p.y, u.x, u.y);
      if (d > maxD) continue;
      let score = d;
      if (ang !== null) {
        const da = Math.abs(angleDiff(ang, Math.atan2(u.y - p.y, u.x - p.x)));
        if (da > 0.6) continue;
        score = d + da * 6;
      }
      if (score < bs) {
        bs = score;
        best = u;
      }
    }
    return best;
  }

  /** Tap: enemy skills hit the nearest droid, point skills land on it (or ahead). */
  castAuto(id) {
    const p = this.game.player;
    const s = SKILLS[id];
    const t = this.nearestEnemy(s.target === 'enemy' ? 9 : 10);
    if (s.target === 'enemy') {
      if (!t) return this.audio.play('deny');
      return p.tryCast(id, t.x, t.y, t);
    }
    if (s.target === 'self') return p.tryCast(id, p.x, p.y, null);
    const r = AIM_RANGE[id] || 5;
    const tx = t ? t.x : p.x + Math.cos(p.facing) * r;
    const ty = t ? t.y : p.y + Math.sin(p.facing) * r;
    return p.tryCast(id, tx, ty, t);
  }

  /** Drag: aim in the dragged direction. */
  castAimed(id, dx, dy) {
    const p = this.game.player;
    const s = SKILLS[id];
    const ang = screenVecToWorldAngle(dx, dy);
    if (s.target === 'enemy') {
      const t = this.nearestEnemy(9, ang) || this.nearestEnemy(9);
      if (!t) return this.audio.play('deny');
      return p.tryCast(id, t.x, t.y, t);
    }
    const pt = this.aimPoint(id, dx, dy);
    return p.tryCast(id, pt.x, pt.y, null);
  }

  aimPoint(id, dx, dy) {
    const p = this.game.player;
    const ang = screenVecToWorldAngle(dx, dy);
    // drag distance scales the range a little for leap / gunship
    const k = Math.min(1, Math.max(0.35, Math.hypot(dx, dy) / 90));
    const scalable = id === 'leap' || id === 'gunship';
    const r = (AIM_RANGE[id] || 5) * (scalable ? k : 1);
    return { x: p.x + Math.cos(ang) * r, y: p.y + Math.sin(ang) * r };
  }

  // ------------------------------------------------------------------ per frame

  update() {
    if (!this.enabled) return;
    const g = this.game;
    const p = g.player;

    // joystick steering
    const j = this.joy;
    if (j && !this.attackHeld && !p.dead) {
      const dx = j.x - j.ox;
      const dy = j.y - j.oy;
      if (Math.hypot(dx, dy) > 10) {
        const ang = screenVecToWorldAngle(dx, dy);
        const cx = Math.cos(ang);
        const cy = Math.sin(ang);
        p.steer(cx, cy);
        g.mouseWorld = { x: p.x + cx * 3, y: p.y + cy * 3 };
      } else p.stopSteer();
    }

    // the attack button becomes "talk" next to a friendly NPC
    const npc = !this.nearestEnemy(7) ? g.nearestNpc(3) : null;
    if (!!npc !== this.talkMode) {
      this.talkMode = !!npc;
      this.attackBtn.innerHTML = `<img src="${iconURL(npc ? 'talk' : 'attack')}" alt=""><span>${npc ? '대화' : '공격'}</span>`;
    }

    // hold-to-attack
    if (this.attackHeld && npc && !p.dead) {
      this.attackHeld = false;
      this.attackBtn.classList.remove('down');
      p.commandTalk(npc);
    } else if (this.attackHeld && !p.dead && (!p.action || p.moving)) {
      const t = this.nearestEnemy(7);
      if (t) p.basicAttack(t);
      else if (!p.action || p.moving) {
        p.action = null;
        p.playAction(Math.random() < 0.5 ? 'attack1' : 'attack2', 1.15);
        g.audio.play('swing');
      }
    }

    // the "hover" ring follows whatever Anakin is fighting
    g.hover = p.action && p.action.target && !p.action.target.dead ? p.action.target : null;

    // aiming marker
    const a = this.aiming;
    if (a && Math.hypot(a.dx, a.dy) > 16) {
      const id = p.hotbar[a.slot];
      if (id && SKILLS[id].target === 'enemy') {
        const t = this.nearestEnemy(9, screenVecToWorldAngle(a.dx, a.dy));
        this.renderer.aim = t ? { x: t.x, y: t.y, r: 0.6, color: '#ff6a5a' } : null;
      } else if (id) {
        const pt = this.aimPoint(id, a.dx, a.dy);
        this.renderer.aim = { ...pt, r: AIM_RADIUS[id] || 0.7 };
      }
    } else if (!a) this.renderer.aim = null;

    // button states
    for (let i = 0; i < 6; i++) {
      const b = this.skillBtns[i];
      const id = p.hotbar[i];
      const img = b.firstChild;
      const want = id ? iconURL(SKILLS[id].icon) : iconURL('empty');
      if (img.dataset.src !== want) {
        img.src = want;
        img.dataset.src = want;
      }
      // an empty socket is hidden: with no skills learned the cluster is just the attack key
      b.classList.toggle('empty', !id);
      const cd = id ? p.cooldowns[id] || 0 : 0;
      const total = id && SKILLS[id].cd ? SKILLS[id].cd(p.skillLevel(id)) || 1 : 1;
      b.children[1].style.background = cd > 0 ? `conic-gradient(rgba(0,0,0,0.72) ${(cd / total) * 360}deg, transparent 0)` : 'none';
      const cost = id && SKILLS[id].cost ? SKILLS[id].cost(p.skillLevel(id)) : 0;
      b.classList.toggle('nofp', !!id && p.force < cost);
      b.children[2].textContent = id ? p.skillLevel(id) : '';
    }
    if (!g.duel) {
      this.bactaBtn.lastChild.textContent = p.bacta;
      this.bactaBtn.classList.toggle('empty', p.bacta <= 0);
      this.saberBtn.classList.toggle('on', p.saberLit && !p.saberOut);
    }
  }
}
