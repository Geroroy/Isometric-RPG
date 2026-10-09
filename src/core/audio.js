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
// public/audio/README.md for the format. Nothing is shipped by default.

const BANK_URL = 'audio/index.json';

export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.listener = null; // unit used for distance attenuation
    this.last = {};
    this.bank = { sfx: {}, voice: {} };
    this.voiceSrc = null;
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
    // noise buffer
    const len = c.sampleRate;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.startHum();
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
    this.humFilter.connect(this.humGain).connect(this.sfxBus);
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

  /** Swap the synthesized hum for a looping sample from the bank. */
  useHumSample(buf) {
    const c = this.ctx;
    for (const o of this.humOsc) o.stop();
    this.humNoise.stop();
    this.humOsc = [];
    const s = c.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    s.connect(this.humGain);
    s.start();
    this.humSample = s;
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
      if (manifest.volume.sfx != null) this.sfxBus.gain.value = manifest.volume.sfx;
      if (manifest.volume.voice != null) this.voiceBus.gain.value = manifest.volume.voice;
    }
    for (const [name, files] of Object.entries(manifest.sfx || {})) {
      const bufs = (await Promise.all([].concat(files).map(load))).filter(Boolean);
      if (!bufs.length) continue;
      if (name === 'hum') this.useHumSample(bufs[0]);
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
    const clip = list[Math.floor(Math.random() * list.length)];
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
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.6;
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

  play(name, src = null) {
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
