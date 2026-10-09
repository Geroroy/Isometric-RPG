// Cutscene presentation: letterbox bars, film subtitles (speaker + line),
// fades to black and the skip hint. The HUD hides while a cutscene runs.
export class CinemaUI {
  constructor(game) {
    const el = document.createElement('div');
    el.className = 'cinema-ui';
    el.innerHTML = '<i class="cn-bar top"></i><i class="cn-bar bot"></i><div class="cn-fade"></div><div class="cn-place"></div><div class="cn-sub"><span></span><p></p></div><button type="button" class="cn-skip"><kbd>Esc</kbd>건너뛰기</button>';
    document.body.appendChild(el);
    this.sub = el.querySelector('.cn-sub');
    this.fade = el.querySelector('.cn-fade');
    this.place = el.querySelector('.cn-place');
    game.on('place', (text) => {
      // location card, as a film cuts to a new set
      this.place.textContent = text;
      this.place.classList.remove('on');
      void this.place.offsetWidth;
      this.place.classList.add('on');
    });
    el.querySelector('.cn-skip').addEventListener('click', () => game.cinema && game.cinema.skip());
    game.on('cinema', (on) => {
      document.body.classList.toggle('cinema', on);
      if (!on) this.say(null);
    });
    game.on('subtitle', (who, text, dur) => this.say(who, text, dur));
    game.on('fade', (v, dur) => {
      this.fade.style.transition = `opacity ${dur}s ease`;
      this.fade.style.opacity = v;
    });
  }

  say(who, text, dur = 3) {
    clearTimeout(this.timer);
    if (!text) {
      this.sub.classList.remove('on');
      return;
    }
    this.sub.querySelector('span').textContent = who || '';
    this.sub.querySelector('p').textContent = text;
    this.sub.classList.add('on');
    this.timer = setTimeout(() => this.sub.classList.remove('on'), dur * 1000);
  }
}
