// Cutscenes. A cutscene is a list of cues on a timeline; when it has a sound
// track (a clip of the film's audio, played by the music director) the clock
// follows that audio, so subtitles and staging stay in sync with the voices.
//
// Cue fields (all optional, `t` in seconds):
//   say: [speaker, text, seconds]   subtitle
//   cam: { x, y, zoom, dur }        camera target (eased over `dur`; 0 = cut)
//   fade: 0..1, fadeDur             black-out
//   do: (cinema) => {}              staging: anims, sprites, positions
// While it runs the HUD is hidden, the screen is letterboxed and the game's
// controls are locked; Esc / Enter / tap on the skip hint skips it (all
// remaining `do` cues still run, so the state ends up the same).

const ease = (x) => x * x * (3 - 2 * x);

export class Cinema {
  constructor(game, { track = null, length, cues }) {
    this.game = game;
    this.track = track; // music situation key of the sound track
    this.length = length;
    this.cues = cues.slice().sort((a, b) => a.t - b.t);
    this.next = 0;
    this.t = 0;
    this.waitAudio = track ? 2.0 : 0; // seconds to wait for the audio to start
    this.cam = null;
    this.tweens = [];
    this.onFrame = null; // per-frame staging (fire, sparks…)
    this.done = false;
  }

  /** Slide a unit to (x, y) over `dur` seconds of the timeline. */
  move(u, x, y, dur) {
    this.tweens = this.tweens.filter((w) => w.u !== u);
    this.tweens.push({ u, fx: u.x, fy: u.y, x, y, t0: this.t, dur });
  }

  /** Runs the cutscene; resolves when it ends (or is skipped). */
  play() {
    const g = this.game;
    g.cinema = this;
    g.emit('cinema', true);
    return new Promise((res) => (this.resolve = res));
  }

  audioEl() {
    const m = this.game.music;
    if (!this.track || !m || !m.cur || m.cur.situation !== this.track || !m.cur.url) return null;
    return m.track(m.cur.url).el;
  }

  update(dt) {
    if (this.done) return;
    const el = this.audioEl();
    if (el && !el.paused && el.currentTime > 0) {
      // follow the voices; never run backwards
      this.t = Math.max(this.t, el.currentTime);
      this.waitAudio = 0;
    } else if (this.waitAudio > 0 && this.t === 0) {
      this.waitAudio -= dt; // give the audio a moment to start
    } else this.t += dt;
    while (this.next < this.cues.length && this.cues[this.next].t <= this.t) this.fire(this.cues[this.next++]);
    for (const w of this.tweens) {
      const k = ease(Math.min(1, (this.t - w.t0) / w.dur));
      w.u.x = w.fx + (w.x - w.fx) * k;
      w.u.y = w.fy + (w.y - w.fy) * k;
    }
    this.tweens = this.tweens.filter((w) => this.t - w.t0 < w.dur);
    if (this.onFrame) this.onFrame(dt);
    this.updateCam();
    if (this.t >= this.length) this.end();
  }

  fire(c) {
    const g = this.game;
    if (c.say) g.emit('subtitle', c.say[0], c.say[1], c.say[2] || 3);
    if (c.fade !== undefined) g.emit('fade', c.fade, c.fadeDur ?? 0.8);
    if (c.cam) {
      const from = this.cam ? { ...this.curCam() } : { x: c.cam.x, y: c.cam.y };
      this.cam = { from, to: c.cam, t0: this.t, dur: c.cam.dur || 0 };
      if (c.cam.zoom && this.game.renderer) this.game.renderer.setZoom(c.cam.zoom);
    }
    if (c.do) c.do(this);
  }

  curCam() {
    const c = this.cam;
    const k = c.dur > 0 ? ease(Math.min(1, (this.t - c.t0) / c.dur)) : 1;
    return { x: c.from.x + (c.to.x - c.from.x) * k, y: c.from.y + (c.to.y - c.from.y) * k };
  }

  updateCam() {
    if (!this.cam) return;
    const c = this.cam.to;
    // a target may follow a unit
    if (c.follow) {
      c.x = c.follow.x + (c.ox || 0);
      c.y = c.follow.y + (c.oy || 0);
    }
    this.game.camFocus = this.curCam();
  }

  skip() {
    if (this.done) return;
    this.game.emit('subtitle', null);
    for (; this.next < this.cues.length; this.next++) {
      const c = this.cues[this.next];
      if (c.do) c.do(this);
    }
    for (const w of this.tweens) {
      w.u.x = w.x;
      w.u.y = w.y;
    }
    this.tweens = [];
    this.end();
  }

  end() {
    if (this.done) return;
    this.done = true;
    const g = this.game;
    g.cinema = null;
    g.camFocus = null;
    this.onFrame = null;
    g.emit('fade', 0, 0.6);
    g.emit('cinema', false);
    if (this.resolve) this.resolve();
  }
}
