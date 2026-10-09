// Anakin's voice: every line he says is spoken with the browser's speech
// synthesis (Web Speech API) unless a recorded clip from the sound bank
// already played for it. A Korean male voice is preferred; with only a
// female one the pitch is lowered. Volume follows the 전체 × 음성 settings.
// Lines in a cutscene that plays its own sound track are not spoken (the
// track carries the voices), nor are stage directions like "(계속)".

const KEY = 'cw.speech';
const MALE = /injoon|in-joon|minsu|jinho|hyunsu|bongjin|gookmin|male|남성|ko-kr-x-kob|ko-kr-x-koc|ko-kr-x-kod/i;

export class Speech {
  constructor(audio) {
    this.audio = audio;
    this.synth = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
    this.on = true;
    try {
      this.on = localStorage.getItem(KEY) !== 'off';
    } catch {
      /* storage blocked */
    }
    this.voice = null;
    this.male = false;
    if (this.synth) {
      this.pick();
      this.synth.addEventListener?.('voiceschanged', () => this.pick());
    }
  }

  get available() {
    return !!this.synth;
  }

  pick() {
    const ko = this.synth.getVoices().filter((v) => /^ko/i.test(v.lang));
    const male = ko.find((v) => MALE.test(v.name));
    this.voice = male || ko.find((v) => v.localService) || ko[0] || null;
    this.male = !!male;
  }

  setOn(on) {
    this.on = on;
    try {
      localStorage.setItem(KEY, on ? 'on' : 'off');
    } catch {
      /* storage blocked */
    }
    if (!on) this.stop();
  }

  /** Text as spoken: no stage directions, tags or stat notes in brackets. */
  static clean(text) {
    if (!text) return '';
    const t = text
      .replace(/\[[^\]]*\]/g, '')
      .replace(/\([^)]*\)/g, '')
      .replace(/[—–]+/g, ', ')
      .replace(/…+/g, '… ')
      .replace(/\s+/g, ' ')
      .trim();
    return /[가-힣A-Za-z0-9]/.test(t) ? t : '';
  }

  /** Speak one of Anakin's lines (interrupts the one before). */
  anakin(text) {
    if (!this.synth || !this.on || this.audio.muted) return false;
    const line = Speech.clean(text);
    if (!line) return false;
    const v = this.audio.vol;
    const vol = Math.max(0, Math.min(1, v.master * v.voice));
    if (vol <= 0) return false;
    const u = new SpeechSynthesisUtterance(line);
    u.lang = 'ko-KR';
    try {
      if (this.voice) u.voice = this.voice;
    } catch {
      /* a voice from another frame / stale list: keep the default */
    }
    u.volume = vol;
    u.rate = 1.06;
    // a young man's voice: slightly low; lower still from a female voice
    u.pitch = this.male || !this.voice ? 0.92 : 0.7;
    // urgent lines a little faster
    if (/[!！]/.test(line)) u.rate = 1.14;
    this.synth.cancel();
    this.synth.speak(u);
    this.last = line;
    return true;
  }

  stop() {
    if (this.synth) this.synth.cancel();
  }
}
