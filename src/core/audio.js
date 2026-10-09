// Tiny procedural WebAudio synth: saber hum/swings, blasters, explosions,
// Force effects. No audio files needed.

export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.listener = null; // unit used for distance attenuation
    this.last = {};
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);
    // noise buffer
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // saber hum
    this.hum = this.ctx.createOscillator();
    this.hum.type = 'sawtooth';
    this.hum.frequency.value = 92;
    const hf = this.ctx.createBiquadFilter();
    hf.type = 'lowpass';
    hf.frequency.value = 320;
    this.humGain = this.ctx.createGain();
    this.humGain.gain.value = 0.0;
    this.hum.connect(hf).connect(this.humGain).connect(this.master);
    this.hum.start();
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }

  setHum(level) {
    if (!this.ctx) return;
    this.humGain.gain.setTargetAtTime(level * 0.05, this.ctx.currentTime, 0.1);
  }

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
    o.connect(g).connect(this.master);
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
    s.connect(f).connect(g).connect(this.master);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.02);
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
    switch (name) {
      case 'swing':
        this.osc('sawtooth', 140, 70, 0.22, 0.12);
        this.noiseBurst(0.2, 0.18, 'bandpass', 600, 2200, 0, 3);
        break;
      case 'hit':
        this.noiseBurst(0.12, 0.25, 'highpass', 2500, 800);
        this.osc('square', 320, 90, 0.1, 0.08);
        break;
      case 'clash':
        this.osc('square', 1800, 900, 0.08, 0.08);
        this.osc('sawtooth', 220, 110, 0.15, 0.1);
        this.noiseBurst(0.1, 0.2, 'highpass', 3000, 1500);
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
        break;
      case 'leap':
        this.noiseBurst(0.4, 0.2, 'bandpass', 300, 1800, 0, 2);
        break;
      case 'speed':
        this.osc('sine', 300, 1200, 0.4, 0.15);
        break;
      case 'ignite':
        this.osc('sawtooth', 60, 180, 0.35, 0.15);
        this.noiseBurst(0.3, 0.15, 'bandpass', 400, 1600, 0, 4);
        break;
      case 'choke':
        this.osc('sine', 80, 55, 1.2, 0.2);
        this.noiseBurst(1.0, 0.12, 'bandpass', 300, 200, 0, 8);
        break;
      case 'zap':
        for (let i = 0; i < 4; i++) this.osc('square', 1800 + Math.random() * 1500, 400, 0.05, 0.05, i * 0.03);
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
