// Background music director. Tracks come from the "music" section of
// audio/index.json (situation -> list of files, cut by tools/cut_music.py);
// without it the game is simply silent apart from its effects.
//
// Each frame the director works out the situation — title, patrol in the
// field, the Republic base, combat, an elite / factory boss, the Dooku duel,
// death — and crossfades to that situation's track. Loops resume where they
// left off (patrol picks up its own place again after a fight); combat starts
// from the top each time. Short stings (combat won, camp cleared, falling to
// the dark side, death) play over a dip and hand back to the loop.
//
// Tracks stream through <audio> elements routed into the WebAudio graph, so
// long pieces never sit decoded in memory and the M key mutes them too.

import { dist } from './math.js';

const FADE = 1.6; // crossfade seconds
const STINGS = new Set(['victory', 'death', 'dark']);
const ONE_SHOT = new Set(['credits']); // plays once, then silence

export class Music {
  constructor(audio) {
    this.audio = audio;
    this.lists = {}; // situation -> [url]
    this.turn = {}; // situation -> next index (variants alternate)
    this.tracks = new Map(); // url -> { el, gain }
    this.cur = null; // { situation, url }
    this.sting = null; // url of a sting playing over the loop
    this.stingT = -99;
    this.combatKills = 0;
  }

  /** Called once the audio context exists (after the first user gesture). */
  async init(game, isTitle) {
    this.game = game;
    this.isTitle = isTitle;
    const a = this.audio;
    if (!a.ctx || this.bus) return;
    this.bus = a.ctx.createGain();
    this.bus.gain.value = 0.5;
    this.bus.connect(a.master);
    try {
      const r = await fetch('audio/index.json', { cache: 'no-cache' });
      if (r.ok) {
        const data = await r.json();
        this.lists = data.music || {};
        this.ready = true;
        if (data.volume && data.volume.music != null) this.bus.gain.value = data.volume.music;
      }
    } catch {
      /* no music */
    }
    // warm the likely next tracks so a fight starts without a gap
    for (const k of ['combat', 'explore', 'victory']) for (const u of this.lists[k] || []) this.track(u);
    game.on('death', () => this.playSting('death'));
    game.on('darkSide', () => this.playSting('dark'));
    game.on('duelEnd', (r) => {
      this.duelOver = r.won ? 'credits' : 'silence';
      if (r.won) this.playSting('victory');
    });
  }

  track(url) {
    let t = this.tracks.get(url);
    if (!t) {
      const el = new window.Audio('audio/' + url); // manifest paths are relative to audio/
      el.preload = 'auto';
      const c = this.audio.ctx;
      const gain = c.createGain();
      gain.gain.value = 0;
      c.createMediaElementSource(el).connect(gain).connect(this.bus);
      t = { el, gain };
      this.tracks.set(url, t);
    }
    return t;
  }

  fade(t, to, secs = FADE) {
    const g = t.gain.gain;
    const now = this.audio.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(to, now + secs);
    clearTimeout(t.stop);
    if (to === 0) t.stop = setTimeout(() => t.el.pause(), secs * 1000 + 50);
  }

  pick(situation) {
    const list = this.lists[situation];
    if (!list || !list.length) return null;
    const i = this.turn[situation] || 0;
    this.turn[situation] = (i + 1) % list.length;
    return list[i];
  }

  /** Crossfade the loop to a situation (no-op if it is already playing). */
  play(situation) {
    if (this.cur && this.cur.situation === situation) return;
    if (this.cur) this.fade(this.track(this.cur.url), 0);
    const url = situation === 'silence' ? null : this.pick(situation);
    this.cur = { situation, url };
    if (!url) return;
    const t = this.track(url);
    t.el.loop = !ONE_SHOT.has(situation);
    if (situation === 'combat' || situation === 'boss' || situation === 'duel' || situation === 'title' || ONE_SHOT.has(situation)) t.el.currentTime = 0;
    t.el.play().catch(() => {});
    if (!this.sting) this.fade(t, 1);
  }

  /** A short piece over a dip in the loop; the loop comes back after it. */
  playSting(name) {
    const url = this.pick(name);
    if (!url || !this.bus) return;
    if (name === 'victory' && this.audio.ctx.currentTime - this.stingT < 20) return; // no repeats
    this.stingT = this.audio.ctx.currentTime;
    if (this.sting) this.fade(this.track(this.sting), 0, 0.3);
    const t = this.track(url);
    t.el.loop = false;
    t.el.currentTime = 0;
    t.gain.gain.value = 1;
    t.el.play().catch(() => {});
    this.sting = url;
    if (this.cur && this.cur.url) this.fade(this.track(this.cur.url), name === 'death' ? 0 : 0.12, 0.6);
    t.el.onended = () => {
      if (this.sting !== url) return;
      this.sting = null;
      if (this.cur && this.cur.url) {
        const loop = this.track(this.cur.url);
        if (loop.el.paused) loop.el.play().catch(() => {});
        this.fade(loop, 1, 2.5);
      }
    };
  }

  /** What should be playing now. */
  situation() {
    const g = this.game;
    const p = g.player;
    if (this.isTitle()) return 'title';
    if (p.dead) return 'silence'; // the death sting plays over it
    if (g.duel) return this.duelOver || (g.duel.started ? 'duel' : 'title');
    if (g.inCombat) {
      const boss = g.activeUnits.some((u) => u.elite && !u.dead && u.target === p && dist(u.x, u.y, p.x, p.y) < 14);
      return boss || /공장/.test(g.region || '') ? 'boss' : 'combat';
    }
    return /공화국/.test(g.region || '') ? 'base' : 'explore';
  }

  update() {
    if (!this.ready) return;
    const g = this.game;
    const s = this.situation();
    const was = this.cur && this.cur.situation;
    // a fight that ended with droids destroyed earns the victory sting
    if ((was === 'combat' || was === 'boss') && (s === 'explore' || s === 'base') && g.player.kills > this.combatKills) this.playSting('victory');
    if (s === 'combat' || s === 'boss') {
      if (was !== 'combat' && was !== 'boss') this.combatKills = g.player.kills;
    }
    this.play(s);
  }
}
