// View zoom: ＋/− buttons, mouse wheel, -/=/0 keys and two-finger pinch on
// phones. The level is remembered per device type (phone vs. desktop).
import { ZOOM_MIN, ZOOM_MAX } from '../gfx/renderer.js';

const STEP = 1.15;

export class ZoomControl {
  constructor(renderer, touch) {
    this.renderer = renderer;
    this.touch = touch;
    this.pinch = null;

    const mk = (id, label, title, fn) => {
      const b = document.createElement('button');
      b.id = id;
      b.type = 'button';
      b.className = 'hud-btn';
      b.textContent = label;
      b.title = title;
      b.setAttribute('aria-label', title);
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        fn();
      });
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
      b.addEventListener('mousedown', (e) => e.stopPropagation());
      document.getElementById('hud').appendChild(b);
      return b;
    };
    mk('zoomOut', '−', '축소 (-)', () => this.step(-1));
    mk('zoomIn', '+', '확대 (+)', () => this.step(1));

    this.toastEl = document.createElement('div');
    this.toastEl.id = 'zoomToast';
    document.getElementById('hud').appendChild(this.toastEl);

    // mouse wheel over the game world
    document.getElementById('world').addEventListener(
      'wheel',
      (e) => {
        if (e.ctrlKey) return; // leave browser zoom alone
        e.preventDefault();
        this.step(e.deltaY < 0 ? 1 : -1);
      },
      { passive: false },
    );
    this.bindPinch();
  }

  key() {
    return this.renderer.touchMode ? 'cw.zoom.touch' : 'cw.zoom.desktop';
  }

  /** Restore the saved zoom for this device type (call after touch mode is known). */
  restore() {
    let z = 1;
    try {
      z = parseFloat(localStorage.getItem(this.key())) || 1;
    } catch {
      /* storage unavailable: default zoom */
    }
    this.renderer.setZoom(z);
  }

  save() {
    try {
      localStorage.setItem(this.key(), String(this.renderer.zoom));
    } catch {
      /* ignore */
    }
  }

  set(z, toast = true) {
    const v = this.renderer.setZoom(z);
    if (toast) this.toast(v);
    return v;
  }

  /** The title screen and cutscenes set their own zoom: not the player's to change or save. */
  get borrowed() {
    return document.body.classList.contains('title') || !!this.renderer.game.cinema;
  }

  step(dir) {
    if (this.borrowed) return;
    this.set(this.renderer.zoom * (dir > 0 ? STEP : 1 / STEP));
    this.save();
  }

  reset() {
    if (this.borrowed) return;
    this.set(1);
    this.save();
  }

  toast(z) {
    const t = this.toastEl;
    const atMin = z <= ZOOM_MIN + 1e-6;
    const atMax = z >= ZOOM_MAX - 1e-6;
    t.textContent = `화면 배율 ${Math.round(z * 100)}%${atMax ? ' (최대)' : atMin ? ' (최소)' : ''}`;
    t.classList.remove('show');
    void t.offsetWidth;
    t.classList.add('show');
  }

  // Two-finger pinch anywhere on the world (not on buttons or panels).
  bindPinch() {
    const onUi = (el) => el && el.closest && el.closest('.t-btn, .t-mbtn, .hud-btn, .panel, #help, .c-portrait, .c-left');
    const span = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    window.addEventListener(
      'touchstart',
      (e) => {
        if (e.touches.length !== 2) return;
        if (onUi(e.touches[0].target) || onUi(e.touches[1].target)) return;
        this.pinch = { d0: span(e.touches), z0: this.renderer.zoom };
        this.touch.cancelJoystick();
      },
      { passive: true },
    );
    window.addEventListener(
      'touchmove',
      (e) => {
        if (!this.pinch || e.touches.length < 2) return;
        e.preventDefault();
        this.set((this.pinch.z0 * span(e.touches)) / this.pinch.d0);
      },
      { passive: false },
    );
    const end = (e) => {
      if (this.pinch && e.touches.length < 2) {
        this.pinch = null;
        this.save();
      }
    };
    window.addEventListener('touchend', end, { passive: true });
    window.addEventListener('touchcancel', end, { passive: true });
  }
}
