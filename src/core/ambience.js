// City ambience (loops from tools/city_ambience.py in audio/amb/), layered by
// where Anakin is in the city hub:
//   beds       the undercity's machine hum and drips, or the plaza's wind;
//              distant speeder traffic (nearer on the plaza); a murmur of
//              alien voices that thickens along the market street
//   positional sources the world lists (world.sounds): the cantina band,
//              louder and less muffled nearer its door (the music ducks
//              under it), and the hiss of the nearest steam vent — each
//              panned to where it is
// Everything fades out away from the hub (Christophsis, the Movie Duels).
import { clamp, dist } from './math.js';

const LOOPS = ['hum', 'wind', 'traffic', 'murmur', 'steam', 'cantina'];
const MARKET = { x: 96, y: 108, rad: 16 }; // the murmur's busiest stretch

export class Ambience {
  constructor(audio) {
    this.audio = audio;
    this.ch = {};
    this.state = 'idle'; // idle → loading → ready (or failed)
  }

  async load() {
    this.state = 'loading';
    const a = this.audio;
    const c = a.ctx;
    const base = import.meta.env.BASE_URL + 'audio/amb/';
    try {
      await Promise.all(
        LOOPS.map(async (name) => {
          const res = await fetch(base + name + '.webm');
          if (!res.ok) throw new Error(name);
          const buf = await c.decodeAudioData(await res.arrayBuffer());
          const src = c.createBufferSource();
          src.buffer = buf;
          src.loop = true;
          const gain = c.createGain();
          gain.gain.value = 0;
          const filter = c.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.value = 20000;
          const pan = c.createStereoPanner();
          src.connect(filter).connect(gain).connect(pan).connect(a.ambBus);
          src.start(0, Math.random() * buf.duration);
          this.ch[name] = { gain, filter, pan };
        }),
      );
      this.state = 'ready';
    } catch (e) {
      console.warn('ambience: not loaded', e);
      this.state = 'failed';
    }
  }

  update(game) {
    const a = this.audio;
    if (!a.ctx || this.state === 'failed') return;
    if (this.state === 'idle') this.load();
    if (this.state !== 'ready') return;
    const now = a.ctx.currentTime;
    const p = game.player;
    const hub = game.place === 'hub' && !game.duel;
    const low = p.y > 90;
    const near = (name) => {
      let best = null;
      let bd = Infinity;
      for (const s of (hub && game.world.sounds) || []) {
        if (s.name !== name) continue;
        const d = dist(s.x, s.y, p.x, p.y);
        if (d < bd) {
          bd = d;
          best = s;
        }
      }
      return best ? { s: best, k: clamp(1 - bd / best.rad, 0, 1) } : { s: null, k: 0 };
    };
    const market = low ? clamp(1 - dist(p.x, p.y, MARKET.x, MARKET.y) / MARKET.rad, 0, 1) : 0;
    const cantina = near('cantina');
    const steam = near('steam');
    const target = {
      hum: hub && low ? 0.55 : 0,
      wind: hub && !low ? 0.5 : 0,
      traffic: hub ? (low ? 0.22 : 0.42) : 0,
      murmur: hub ? (low ? 0.14 + market * 0.4 : 0.14) * (1 - cantina.k * 0.5) : 0,
      steam: steam.k ** 2 * (steam.s ? steam.s.vol : 0) * 0.55,
      cantina: cantina.k ** 1.6 * (cantina.s ? cantina.s.vol : 0) * 0.85,
    };
    for (const [name, ch] of Object.entries(this.ch)) ch.gain.gain.setTargetAtTime(target[name], now, 0.5);
    // through the cantina's walls: muffled from the street, clear at the door
    this.ch.cantina.filter.frequency.setTargetAtTime(400 + 7000 * cantina.k ** 2.5, now, 0.3);
    if (cantina.s) this.ch.cantina.pan.pan.setTargetAtTime(a.panFor(cantina.s), now, 0.3);
    if (steam.s) this.ch.steam.pan.pan.setTargetAtTime(a.panFor(steam.s), now, 0.2);
    a.duckMusic(1 - 0.8 * cantina.k ** 1.2);
  }
}
