// Audio: procedural WebAudio synth + optional user-supplied sound bank.
//
// Lightsaber synthesis follows how the original effect was made: a steady
// motor hum (two slightly detuned low saw waves + a faint electrical buzz),
// and swings that are a Doppler sweep of that same hum (pitch and brightness
// rise as the blade passes, then fall) instead of a separate "whoosh".
//
// Sound bank: if `audio/index.json` exists next to the page, its files are
// loaded and used instead of the synth for matching sound names, and voice
// clips are played (with subtitles) for matching dialogue keys. See
// public/audio/README.md for the format. The shipped bank holds only the
// lightsaber sounds synthesized by tools/saber_sfx.py: a hum loop plus a buzz
// layer (both looped under the hum gain), three Doppler swings, clash, on, off.

const BANK_URL = 'audio/index.json';
const VOL_KEY = 'cw.volume';
export const VOLUMES = [
  ['master', '전체'],
  ['music', '음악'],
  ['sfx', '효과음'],
  ['hum', '광선검 험'],
  ['voice', '음성'],
  ['amb', '환경음'],
];

export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.listener = null; // unit used for distance attenuation
    this.last = {};
    this.bank = { sfx: {}, voice: {} };
    this.lastPick = {};
    this.voiceSrc = null;
    // player volume settings (0..1 each), applied on top of the mix levels
    this.vol = { master: 1, music: 1, sfx: 1, hum: 1, voice: 1, amb: 1 };
    this.musicDuck = 1; // the city's ambience lowers the music near the cantina band
    try {
      Object.assign(this.vol, JSON.parse(localStorage.getItem(VOL_KEY) || '{}'));
    } catch {
      /* storage blocked: defaults */
    }
    this.base = { master: 0.6, sfx: 1, voice: 1.1, music: 0.5, amb: 0.8 }; // mix levels before the player's settings
  }

  setVolume(key, v) {
    this.vol[key] = Math.max(0, Math.min(1, v));
    try {
      localStorage.setItem(VOL_KEY, JSON.stringify(this.vol));
    } catch {
      /* storage blocked */
    }
    this.applyVolume();
  }

  applyVolume() {
    if (!this.ctx) return;
    const v = this.vol;
    const b = this.base;
    this.master.gain.value = this.muted ? 0 : b.master * v.master;
    this.sfxBus.gain.value = b.sfx * v.sfx;
    this.voiceBus.gain.value = b.voice * v.voice;
    if (this.humVol) this.humVol.gain.value = v.hum;
    if (this.musicBus) this.musicBus.gain.value = b.music * v.music * this.musicDuck;
    if (this.ambBus) this.ambBus.gain.value = b.amb * v.amb;
  }

  /** Lower the music by k (0..1 of its level), smoothly. */
  duckMusic(k) {
    if (Math.abs(k - this.musicDuck) < 0.01) return;
    this.musicDuck = k;
    if (this.musicBus) this.musicBus.gain.setTargetAtTime(this.base.music * this.vol.music * k, this.ctx.currentTime, 0.4);
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = (this.ctx = new AC());
    this.master = c.createGain();
    this.master.gain.value = this.muted ? 0 : 0.6;
    this.master.connect(c.destination);
    this.sfxBus = c.createGain();
    this.sfxBus.connect(this.master);
    this.voiceBus = c.createGain();
    this.voiceBus.gain.value = 1.1;
    this.voiceBus.connect(this.master);
    this.ambBus = c.createGain();
    this.ambBus.connect(this.master);
    // noise buffer
    const len = c.sampleRate;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.startHum();
    this.applyVolume();
    this.bankReady = this.loadBank();
  }

  // ------------------------------------------------------------------ saber hum

  startHum() {
    const c = this.ctx;
    this.humBase = 88;
    this.humGain = c.createGain();
    this.humGain.gain.value = 0;
    this.humFilter = c.createBiquadFilter();
    this.humFilter.type = 'lowpass';
    this.humFilter.frequency.value = 480;
    this.humFilter.Q.value = 5;
    this.humVol = c.createGain(); // the player's hum volume, after all modulation
    this.humFilter.connect(this.humGain).connect(this.humVol).connect(this.sfxBus);
    this.humOsc = [];
    for (const [type, mul, vol] of [['sawtooth', 1, 0.6], ['sawtooth', 1.017, 0.5], ['sine', 2, 0.35]]) {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.value = this.humBase * mul;
      o.mul = mul;
      const g = c.createGain();
      g.gain.value = vol;
      o.connect(g).connect(this.humFilter);
      o.start();
      this.humOsc.push(o);
    }
    // faint electrical buzz riding on the hum
    const n = c.createBufferSource();
    n.buffer = this.noise;
    n.loop = true;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2600;
    bp.Q.value = 1.2;
    const ng = c.createGain();
    ng.gain.value = 0.05;
    n.connect(bp).connect(ng).connect(this.humGain);
    n.start();
    this.humNoise = n;
  }

  /**
   * Loop a bank sample under the hum gain. `hum` replaces the synthesized hum
   * (and is the layer the swings bend); `buzz` is an extra layer on top.
   */
  useHumSample(buf, name = 'hum') {
    const c = this.ctx;
    if (name === 'hum' && this.humOsc.length) {
      for (const o of this.humOsc) o.stop();
      this.humNoise.stop();
      this.humOsc = [];
    }
    const s = c.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    // any hum file plays at the synthesized hum's loudness (buzz keeps its own)
    const trim = c.createGain();
    if (name === 'hum') {
      const d = buf.getChannelData(0);
      let e = 0;
      for (let i = 0; i < d.length; i += 4) e += d[i] * d[i];
      trim.gain.value = Math.min(12, 0.4 / (Math.sqrt(e / (d.length / 4)) || 1));
      this.humTrim = trim.gain.value;
    }
    s.connect(trim).connect(this.humGain);
    s.start();
    if (name === 'hum') this.humSample = s;
  }

  setHum(level) {
    if (!this.ctx) return;
    this.humLevel = level;
    this.humGain.gain.setTargetAtTime(level * 0.07, this.ctx.currentTime, 0.12);
  }

  /** Doppler sweep of the hum: the core of a lightsaber swing. */
  dopplerSweep(strength = 1, dur = 0.34) {
    const c = this.ctx;
    const t = c.currentTime;
    const up = 1 + 0.38 * strength;
    const down = 1 - 0.14 * strength;
    const targets = this.humSample ? [this.humSample.playbackRate] : this.humOsc.map((o) => o.frequency);
    for (const p of targets) {
      const base = this.humSample ? 1 : this.humBase * this.humOsc[targets.indexOf(p)].mul;
      p.cancelScheduledValues(t);
      p.setValueAtTime(base, t);
      p.linearRampToValueAtTime(base * up, t + dur * 0.28);
      p.linearRampToValueAtTime(base * down, t + dur * 0.65);
      p.linearRampToValueAtTime(base, t + dur);
    }
    const f = this.humFilter.frequency;
    f.cancelScheduledValues(t);
    f.setValueAtTime(480, t);
    f.linearRampToValueAtTime(480 + 1500 * strength, t + dur * 0.28);
    f.linearRampToValueAtTime(480, t + dur);
    const g = this.humGain.gain;
    const lvl = (this.humLevel ?? 0.6) * 0.07;
    g.cancelScheduledValues(t);
    g.setValueAtTime(Math.max(lvl, 0.03), t);
    g.linearRampToValueAtTime(0.16 * strength + lvl, t + dur * 0.28);
    g.linearRampToValueAtTime(lvl, t + dur);
  }

  /**
   * Film swing, after Ben Burtt's method: the hum was played through a
   * speaker and re-recorded with a microphone swung past it, so a swing is
   * the hum itself flying by — no air whoosh. A second copy of the hum moves
   * along a straight line past the listener: Doppler pitch (up while it
   * approaches, down as it leaves), an inverse-distance swell, a filter that
   * opens as it comes close, and the comb filtering of the changing path
   * length (a short, moving delay mixed with the direct sound).
   */
  passBy(strength = 1, dur = 0.4, pan = 0) {
    const buf = this.humSample && this.humSample.buffer;
    if (!buf) return false;
    const c = this.ctx;
    const t = c.currentTime + 0.005;
    const N = 96;
    const rate = new Float32Array(N);
    const amp = new Float32Array(N);
    const dly = new Float32Array(N);
    const cut = new Float32Array(N);
    const near = 0.42 - 0.18 * strength; // closest approach: a harder swing passes closer
    const k = 0.16 + 0.12 * strength; // Doppler depth (v / c)
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1);
      const x = u * 2.2 - 1.2; // passes a little before the middle
      const r = Math.hypot(x, near);
      rate[i] = 1 / (1 + (k * x) / r); // approaching: x < 0 -> higher
      const taper = Math.min(1, u / 0.12, (1 - u) / 0.2);
      amp[i] = Math.pow(near / r, 1.4) * taper;
      dly[i] = 0.0006 + 0.0024 * r; // reflection path: sweeps the comb
      cut[i] = 900 + 7000 * (near / r);
    }
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.playbackRate.setValueCurveAtTime(rate, t, dur);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueCurveAtTime(cut, t, dur);
    const delay = c.createDelay(0.01);
    delay.delayTime.setValueCurveAtTime(dly, t, dur);
    const wet = c.createGain();
    wet.gain.value = 0.7;
    const g = c.createGain();
    g.gain.value = 0;
    const peak = (this.humTrim || 1) * (0.12 + 0.1 * strength);
    g.gain.setValueCurveAtTime(amp.map((a) => a * peak), t, dur);
    const pn = c.createStereoPanner();
    pn.pan.value = pan;
    src.connect(lp);
    lp.connect(g);
    lp.connect(delay).connect(wet).connect(g);
    g.connect(pn).connect(this.sfxBus);
    src.start(t, Math.random() * buf.duration);
    src.stop(t + dur + 0.05);
    return true;
  }

  // ------------------------------------------------------------------ sound bank

  async loadBank() {
    let manifest;
    try {
      const r = await fetch(BANK_URL, { cache: 'no-cache' });
      if (!r.ok) return;
      manifest = await r.json();
    } catch {
      return; // no bank: synth only
    }
    const base = BANK_URL.replace(/[^/]+$/, '');
    const load = async (file) => {
      try {
        const r = await fetch(base + file);
        if (!r.ok) return null;
        return await this.ctx.decodeAudioData(await r.arrayBuffer());
      } catch {
        return null;
      }
    };
    if (manifest.volume) {
      if (manifest.volume.sfx != null) this.base.sfx = manifest.volume.sfx;
      if (manifest.volume.voice != null) this.base.voice = manifest.volume.voice;
      if (manifest.volume.music != null) this.base.music = manifest.volume.music;
      this.applyVolume();
    }
    for (const [name, files] of Object.entries(manifest.sfx || {})) {
      const bufs = (await Promise.all([].concat(files).map(load))).filter(Boolean);
      if (!bufs.length) continue;
      if (name === 'hum' || name === 'buzz') this.useHumSample(bufs[0], name);
      else this.bank.sfx[name] = bufs;
    }
    for (const [key, clips] of Object.entries(manifest.voice || {})) {
      const list = [];
      for (const clip of [].concat(clips)) {
        const c = typeof clip === 'string' ? { file: clip } : clip;
        const buf = await load(c.file);
        if (buf) list.push({ buf, text: c.text || null });
      }
      if (list.length) this.bank.voice[key] = list;
    }
  }

  playBuffer(buf, vol = 1, bus = this.sfxBus, rate = 1) {
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    s.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    s.connect(g).connect(bus);
    s.start();
    return s;
  }

  hasVoice(key) {
    return !!this.bank.voice[key];
  }

  /** Play a voice clip for a dialogue key. Returns {text, duration} or null. */
  voice(key) {
    if (!this.ctx || this.muted) return null;
    const list = this.bank.voice[key];
    if (!list) return null;
    // random, but never the same clip twice in a row
    let i = Math.floor(Math.random() * list.length);
    if (list.length > 1 && list[i] === list.last) i = (i + 1) % list.length;
    const clip = (list.last = list[i]);
    if (this.voiceSrc) {
      try {
        this.voiceSrc.stop();
      } catch {
        /* already ended */
      }
    }
    this.voiceSrc = this.playBuffer(clip.buf, 1, this.voiceBus);
    // duck effects under the voice
    const t = this.ctx.currentTime;
    const g = this.sfxBus.gain;
    const base = g.value || 1;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(base * 0.45, t, 0.05);
    g.setTargetAtTime(base, t + clip.buf.duration, 0.3);
    return { text: clip.text, duration: clip.buf.duration };
  }

  toggleMute() {
    this.muted = !this.muted;
    this.applyVolume();
    return this.muted;
  }

  // ------------------------------------------------------------------ synth voices

  osc(type, f0, f1, dur, vol, delay = 0) {
    const c = this.ctx;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  noiseBurst(dur, vol, filterType, f0, f1, delay = 0, q = 1) {
    const c = this.ctx;
    const t = c.currentTime + delay;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = filterType;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(this.sfxBus);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.02);
  }

  /** Electrical crackle: a cluster of tiny high-passed noise clicks. */
  crackle(n, spread, vol) {
    for (let i = 0; i < n; i++) this.noiseBurst(0.02 + Math.random() * 0.03, vol, 'highpass', 3500, 1800, Math.random() * spread, 0.7);
  }

  // ------------------------------------------------------------------ lightsaber (sound bank)

  /** Next buffer of a bank list, never the same one twice in a row. */
  pickBuf(name) {
    const list = this.bank.sfx[name];
    if (!list || !list.length) return null;
    let i = Math.floor(Math.random() * list.length);
    if (list.length > 1 && i === this.lastPick[name]) i = (i + 1) % list.length;
    this.lastPick[name] = i;
    return list[i];
  }

  /** Stereo position: the source's place on screen relative to Anakin. */
  panFor(src) {
    if (!src || !this.listener) return 0;
    const sx = src.x - this.listener.x - (src.y - this.listener.y); // isometric screen x
    return Math.max(-0.8, Math.min(0.8, sx / 14));
  }

  /** One bank sample through gain and panner. */
  sample(name, { vol = 1, rate = 1, pan = 0, delay = 0 } = {}) {
    const buf = this.pickBuf(name);
    if (!buf) return null;
    const c = this.ctx;
    const s = c.createBufferSource();
    s.buffer = buf;
    s.playbackRate.value = rate;
    const g = c.createGain();
    g.gain.value = vol;
    const p = c.createStereoPanner();
    p.pan.value = pan;
    s.connect(g).connect(p).connect(this.sfxBus);
    s.start(c.currentTime + delay);
    return { s, g };
  }

  /**
   * Lightsaber sounds from the bank, shaped by the moment: light or heavy
   * swings at the attack's speed with the hum bending along, ignitions the
   * hum rises out of, deflections that crack harder when the bolt is sent
   * back, clashes with a bright ring for a perfect parry or a low impact for
   * a guard break, burns that bite more on a critical hit, and a crackling
   * saber lock that surges with every push. Returns false to fall back to
   * the synth when the bank lacks the sample.
   */
  saberSound(name, vol, pan, o) {
    const jit = (a) => 1 + (Math.random() * 2 - 1) * a;
    const hum = this.humSample && this.humSample.playbackRate;
    const t = this.ctx.currentTime;
    switch (name) {
      case 'swing': {
        const heavy = !!o.heavy;
        const rate = Math.min(1.25, Math.max(0.8, (o.rate || 1) * jit(0.05)));
        // the hum flying past is the swing; the recorded swing only adds texture
        if (!this.passBy(heavy ? 1 : 0.6 * jit(0.15), (heavy ? 0.5 : 0.34) / rate, pan)) return false;
        this.sample(heavy && this.bank.sfx.swingHeavy ? 'swingHeavy' : 'swing', { vol: vol * 0.3, rate, pan });
        this.dopplerSweep(heavy ? 0.45 : 0.25, (heavy ? 0.45 : 0.3) / rate);
        return true;
      }
      case 'ignite':
      case 'retract':
        if (!this.sample(name, { vol: vol * 0.9, rate: jit(0.02), pan })) return false;
        if (hum) {
          // the hum climbs out of the ignition / sinks with the blade
          hum.cancelScheduledValues(t);
          hum.setValueAtTime(name === 'ignite' ? 0.55 : 1, t);
          if (name === 'ignite') {
            hum.exponentialRampToValueAtTime(1.05, t + 0.35);
            hum.linearRampToValueAtTime(1, t + 0.6);
          } else hum.exponentialRampToValueAtTime(0.45, t + 0.4);
        }
        return true;
      case 'deflect':
        if (!this.sample('deflect', { vol: vol * (o.heavy ? 0.95 : 0.8), rate: jit(0.12), pan })) return false;
        if (o.heavy) this.sample('clash', { vol: vol * 0.45, rate: 1.3, pan });
        this.dopplerSweep(0.4, 0.2);
        return true;
      case 'clash': {
        const rate = o.heavy ? 0.82 : o.perfect ? 1.06 : jit(0.07);
        if (!this.sample('clash', { vol: vol * (o.heavy ? 1 : 0.85), rate, pan })) return false;
        if (o.perfect) this.sample('clash', { vol: vol * 0.5, rate: 1.6, pan, delay: 0.03 }); // bright ring
        if (o.heavy) this.sample('hit', { vol: vol * 0.6, rate: 0.7, pan });
        this.dopplerSweep(o.heavy ? 1 : 0.6, 0.25);
        return true;
      }
      case 'hit':
        if (!this.sample('hit', { vol: vol * 0.6, rate: jit(0.1), pan })) return false;
        if (o.crit) this.sample('clash', { vol: vol * 0.35, rate: 1.2, pan });
        return true;
      case 'lockStart': {
        if (!this.bank.sfx.lock) return false;
        this.saberSound('clash', vol, pan, { heavy: true });
        this.stopLock(0.05);
        const v = this.sample('lock', { vol: 0, pan });
        v.s.loop = true;
        v.g.gain.setValueAtTime(0, t);
        v.g.gain.linearRampToValueAtTime(vol * 0.7, t + 0.3);
        this.lockVoice = v;
        return true;
      }
      case 'lockPush': {
        const v = this.lockVoice;
        if (!v) return false;
        // each push makes the blades grind harder for a moment
        v.g.gain.cancelScheduledValues(t);
        v.g.gain.setValueAtTime(vol * 1.1, t);
        v.g.gain.setTargetAtTime(vol * 0.7, t + 0.05, 0.12);
        v.s.playbackRate.setValueAtTime(1.12, t);
        v.s.playbackRate.setTargetAtTime(1, t + 0.05, 0.15);
        this.dopplerSweep(0.35, 0.15);
        return true;
      }
      case 'lockEnd':
        if (!this.lockVoice) return false;
        this.stopLock(0.2);
        this.saberSound('clash', vol, pan, { heavy: true });
        return true;
    }
    return false;
  }

  stopLock(secs) {
    const v = this.lockVoice;
    if (!v) return;
    const t = this.ctx.currentTime;
    v.g.gain.cancelScheduledValues(t);
    v.g.gain.setValueAtTime(v.g.gain.value, t);
    v.g.gain.linearRampToValueAtTime(0, t + secs);
    v.s.stop(t + secs + 0.02);
    this.lockVoice = null;
  }

  /** `o`: { heavy, rate, perfect, crit } — see saberSound. */
  play(name, src = null, o = {}) {
    if (!this.ctx || this.muted) return;
    let vol = 1;
    if (src && this.listener) {
      const d = Math.hypot(src.x - this.listener.x, src.y - this.listener.y);
      if (d > 22) return;
      vol = Math.max(0.15, 1 - d / 22);
    }
    const now = this.ctx.currentTime;
    if (this.last[name] && now - this.last[name] < 0.03) return;
    this.last[name] = now;

    if (this.saberSound(name, vol, this.panFor(src), o)) return;
    // synth stand-ins for saber events without a sample
    name = { lockStart: 'clash', lockEnd: 'clash', lockPush: 'swing', deflect: 'clash' }[name] || name;

    // sound bank first
    const bank = this.bank.sfx[name];
    if (bank) {
      this.playBuffer(bank[Math.floor(Math.random() * bank.length)], vol, this.sfxBus, 0.95 + Math.random() * 0.1);
      if (name === 'swing' && !this.humSample) this.dopplerSweep(0.6);
      return;
    }

    switch (name) {
      case 'swing':
        this.dopplerSweep(0.85 + Math.random() * 0.3, 0.3 + Math.random() * 0.08);
        this.noiseBurst(0.22, 0.05, 'bandpass', 500, 1400, 0, 2);
        break;
      case 'punch':
        // a fist landing: a dull thud and a slap
        this.osc('sine', 120, 50, 0.12, 0.35 * vol);
        this.noiseBurst(0.06, 0.25 * vol, 'lowpass', 1800, 600);
        break;
      case 'hit':
        // blade burning into metal: sizzle + low thud + crackle
        this.noiseBurst(0.18, 0.22, 'bandpass', 2800, 1200, 0, 2);
        this.osc('sawtooth', 160, 60, 0.12, 0.1);
        this.crackle(4, 0.1, 0.12);
        this.dopplerSweep(0.4, 0.2);
        break;
      case 'clash':
        // blaster bolt deflected: sharp metallic snap + crackle + hum spike
        this.osc('square', 2100, 1300, 0.07, 0.07);
        this.osc('square', 1400, 900, 0.09, 0.05);
        this.noiseBurst(0.08, 0.25, 'highpass', 4000, 2200);
        this.crackle(6, 0.12, 0.1);
        this.dopplerSweep(0.5, 0.18);
        break;
      case 'blasterCis':
        this.osc('sawtooth', 1300, 180, 0.16, 0.07 * vol);
        this.osc('square', 900, 120, 0.12, 0.04 * vol);
        break;
      case 'blasterRep':
        this.osc('sawtooth', 1600, 260, 0.13, 0.06 * vol);
        break;
      case 'explode':
        this.noiseBurst(0.8, 0.5 * vol, 'lowpass', 900, 60);
        this.osc('sine', 90, 30, 0.6, 0.3 * vol);
        break;
      case 'push':
        this.noiseBurst(0.45, 0.35, 'lowpass', 1500, 100, 0, 2);
        this.osc('sine', 160, 40, 0.4, 0.25);
        break;
      case 'repulse':
        this.noiseBurst(0.9, 0.5, 'lowpass', 2500, 60, 0, 2);
        this.osc('sine', 120, 25, 0.9, 0.4);
        break;
      case 'slam':
        this.noiseBurst(0.35, 0.4, 'lowpass', 700, 60);
        this.osc('sine', 110, 35, 0.35, 0.3);
        this.dopplerSweep(1, 0.32);
        break;
      case 'leap':
        this.noiseBurst(0.4, 0.2, 'bandpass', 300, 1800, 0, 2);
        break;
      case 'speed':
        this.osc('sine', 300, 1200, 0.4, 0.15);
        break;
      case 'ignite': {
        // "snap-hiss": a hard click, then the hum rushes up from a low growl
        this.noiseBurst(0.05, 0.3, 'highpass', 2500, 1500);
        this.noiseBurst(0.45, 0.12, 'bandpass', 900, 2600, 0.02, 1.5);
        this.crackle(5, 0.25, 0.08);
        const t = this.ctx.currentTime;
        this.humOsc.forEach((o) => {
          o.frequency.cancelScheduledValues(t);
          o.frequency.setValueAtTime(this.humBase * o.mul * 0.35, t);
          o.frequency.exponentialRampToValueAtTime(this.humBase * o.mul * 1.08, t + 0.3);
          o.frequency.linearRampToValueAtTime(this.humBase * o.mul, t + 0.5);
        });
        this.humGain.gain.cancelScheduledValues(t);
        this.humGain.gain.setValueAtTime(0.0, t);
        this.humGain.gain.linearRampToValueAtTime(0.2, t + 0.12);
        this.humGain.gain.setTargetAtTime((this.humLevel ?? 0.6) * 0.07, t + 0.4, 0.2);
        break;
      }
      case 'retract': {
        // the hum winds down into a short hiss
        this.noiseBurst(0.3, 0.08, 'bandpass', 2200, 700, 0, 2);
        const t = this.ctx.currentTime;
        this.humOsc.forEach((o) => {
          o.frequency.cancelScheduledValues(t);
          o.frequency.setValueAtTime(this.humBase * o.mul, t);
          o.frequency.exponentialRampToValueAtTime(this.humBase * o.mul * 0.4, t + 0.35);
        });
        this.humGain.gain.cancelScheduledValues(t);
        this.humGain.gain.setValueAtTime(0.16, t);
        this.humGain.gain.linearRampToValueAtTime(0, t + 0.35);
        break;
      }
      case 'choke':
        this.osc('sine', 80, 55, 1.2, 0.2);
        this.noiseBurst(1.0, 0.12, 'bandpass', 300, 200, 0, 8);
        break;
      case 'zap':
        for (let i = 0; i < 4; i++) this.osc('square', 1800 + Math.random() * 1500, 400, 0.05, 0.05, i * 0.03);
        this.crackle(6, 0.15, 0.08);
        break;
      case 'r2':
        for (let i = 0; i < 5; i++) {
          const f = 900 + Math.random() * 1800;
          this.osc('sine', f, f * (Math.random() < 0.5 ? 0.6 : 1.6), 0.09, 0.08, i * 0.09);
        }
        break;
      case 'summon':
        this.osc('square', 440, 440, 0.08, 0.05);
        this.osc('square', 660, 660, 0.08, 0.05, 0.1);
        break;
      case 'droidDie':
        this.noiseBurst(0.25, 0.2 * vol, 'bandpass', 1500, 300, 0, 2);
        this.osc('square', 600, 80, 0.25, 0.05 * vol);
        break;
      case 'pickup':
        this.osc('sine', 660, 990, 0.12, 0.12);
        this.osc('sine', 990, 1320, 0.12, 0.1, 0.08);
        break;
      case 'levelup':
        [523, 659, 784, 1046].forEach((f, i) => this.osc('triangle', f, f, 0.25, 0.15, i * 0.1));
        break;
      case 'gunship':
        this.noiseBurst(2.2, 0.3, 'lowpass', 300, 900, 0, 1);
        this.osc('sawtooth', 70, 90, 2.0, 0.08);
        break;
      case 'missile':
        this.osc('sawtooth', 900, 200, 0.3, 0.05);
        break;
      case 'deny':
        this.osc('square', 200, 150, 0.12, 0.06);
        break;
      case 'click':
        this.osc('square', 1200, 1100, 0.03, 0.04);
        break;
      default:
        break;
    }
  }
}
