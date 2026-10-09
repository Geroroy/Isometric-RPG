// Fullscreen toggle (button + F key). Uses the standard Fullscreen API with
// the webkit-prefixed fallback; on phones it also tries to lock landscape.
// iPhone Safari has no element fullscreen: there the button is hidden and the
// home-screen app (PWA) provides fullscreen instead.

const ICON_ENTER =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1 6V1h5M10 1h5v5M15 10v5h-5M6 15H1v-5" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
const ICON_EXIT =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 1v5H1M15 6h-5V1M10 15v-5h5M1 10h5v5" fill="none" stroke="currentColor" stroke-width="2"/></svg>';

export class Fullscreen {
  constructor() {
    const de = document.documentElement;
    this.req = de.requestFullscreen || de.webkitRequestFullscreen;
    this.exitFn = document.exitFullscreen || document.webkitExitFullscreen;
    const enabled = document.fullscreenEnabled ?? document.webkitFullscreenEnabled;
    this.supported = !!this.req && enabled !== false;

    const btn = (this.btn = document.createElement('button'));
    btn.id = 'fsBtn';
    btn.type = 'button';
    btn.title = '전체 화면 (F)';
    btn.setAttribute('aria-label', '전체 화면 전환');
    btn.innerHTML = ICON_ENTER;
    btn.hidden = !this.supported;
    // 'click' so the gesture counts as user activation everywhere
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggle();
    });
    btn.addEventListener('pointerdown', (e) => e.stopPropagation());
    btn.addEventListener('mousedown', (e) => e.stopPropagation());
    document.getElementById('hud').appendChild(btn);

    const sync = () => {
      const on = this.active;
      btn.innerHTML = on ? ICON_EXIT : ICON_ENTER;
      btn.title = on ? '전체 화면 종료 (F)' : '전체 화면 (F)';
      document.body.classList.toggle('fullscreen', on);
    };
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
  }

  get active() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
  }

  enter() {
    if (!this.supported || this.active) return;
    try {
      const r = this.req.call(document.documentElement, { navigationUI: 'hide' });
      const lock = () => {
        if (document.body.classList.contains('touch')) screen.orientation?.lock?.('landscape').catch(() => {});
      };
      if (r && r.then) r.then(lock).catch(() => {});
      else lock();
    } catch {
      /* blocked by the browser or the embedding page: keep playing windowed */
    }
  }

  exit() {
    if (!this.active) return;
    try {
      const r = this.exitFn.call(document);
      if (r && r.catch) r.catch(() => {});
    } catch {
      /* ignore */
    }
  }

  toggle() {
    if (this.active) this.exit();
    else this.enter();
  }
}
