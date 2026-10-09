// The Mos Eisley cantina jukebox (Figrin D'an runs it). After ULTRAKILL and
// Devil May Cry 5: every piece of the game's music unlocks the first time it
// is heard, can be played here (and keeps playing around the world until it
// is stopped), and can be set as a situation's music from now on.
import { SITUATIONS } from '../core/music.js';

const HINT = {
  title: '시작 화면에서 들을 수 있다',
  explore: '필드를 정찰할 때 들을 수 있다',
  base: '공화국 기지에서 들을 수 있다',
  combat: '전투 중에 들을 수 있다',
  boss: '정예 드로이드나 드로이드 공장에서 들을 수 있다',
  duel: '무비 듀얼에서 들을 수 있다',
  credits: '두쿠를 쓰러뜨리면 들을 수 있다',
  victory: '전투에서 이기면 들을 수 있다',
  death: '쓰러지면 들을 수 있다',
  dark: '어둠에 가까워지면 들을 수 있다',
};
const LABEL = Object.fromEntries(SITUATIONS);
const fmt = (s) => (isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '-:--');

export class JukeboxUI {
  constructor(hud, music, audio) {
    this.hud = hud;
    this.music = music;
    this.audio = audio;
    this.el = hud.overlay('jukebox', '칸티나 주크박스', '<div class="ov-sub">모스 아이슬리 칸티나 · 피그린 단과 모달 노드</div><div class="ov-points">해금 <b class="jb-count">0</b></div>');
    this.body = this.el.querySelector('.ov-body');
    this.body.innerHTML = `<div class="jb-list"></div>
      <div class="jb-side">
        <div class="jb-now"></div>
        <div class="jb-assign"><h4>상황별 배경 음악</h4><p>해금한 곡을 원하는 상황에 지정하면 그때부터 그 곡이 나옵니다.</p><div class="jb-slots"></div></div>
      </div>`;
    this.list = this.body.querySelector('.jb-list');
    this.now = this.body.querySelector('.jb-now');
    this.slots = this.body.querySelector('.jb-slots');
    this.list.addEventListener('click', (e) => {
      const r = e.target.closest('[data-url]');
      if (!r || r.classList.contains('locked')) return;
      this.audio.unlock();
      this.music.jukePlay(r.dataset.url);
      this.paused = false;
      this.render();
    });
    this.now.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const m = this.music;
      const act = b.dataset.act;
      if (act === 'prev' || act === 'next') m.jukeStep(act === 'next' ? 1 : -1);
      else if (act === 'pause') m.jukePause((this.paused = !this.paused));
      else if (act === 'mode') m.jukeMode(m.juke.mode === 'one' ? 'all' : 'one');
      else if (act === 'stop') m.jukeStop();
      if (act !== 'pause') this.paused = false;
      this.audio.play('click');
      this.render();
    });
    this.slots.addEventListener('change', (e) => {
      const s = e.target.closest('select');
      if (s) this.music.setOverride(s.dataset.sit, s.value || null);
    });
    // a chip on the HUD while a jukebox track plays, to stop it anywhere
    this.chip = document.createElement('button');
    this.chip.type = 'button';
    this.chip.className = 'jb-chip hidden';
    this.chip.addEventListener('click', () => {
      this.music.jukeStop();
      this.audio.play('click');
    });
    document.getElementById('hud').appendChild(this.chip);
  }

  open() {
    this.render();
    const tick = () => {
      this.raf = requestAnimationFrame(tick);
      this.progress();
    };
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(tick);
  }

  close() {
    cancelAnimationFrame(this.raf);
  }

  render() {
    const m = this.music;
    const cat = m.catalog;
    const juke = m.juke;
    this.el.querySelector('.jb-count').textContent = `${cat.filter((c) => m.heard.has(c.url)).length} / ${cat.length}`;
    if (!cat.length) {
      this.list.innerHTML = '<p class="jb-empty">음악을 불러오는 중입니다. 잠시 후 다시 열어 주세요.</p>';
    } else {
      this.list.innerHTML = cat
        .map((c, i) => {
          const open = m.heard.has(c.url);
          const playing = juke && juke.url === c.url;
          const used = Object.entries(m.overrides).filter(([, u]) => u === c.url).map(([s]) => LABEL[s]);
          return `<button type="button" class="jb-row${open ? '' : ' locked'}${playing ? ' on' : ''}" data-url="${c.url}">
            <span class="jb-n">${playing ? '♪' : String(i + 1).padStart(2, '0')}</span>
            <span class="jb-t"><b>${open ? c.title : '???'}</b><small>${open ? LABEL[c.situation] : HINT[c.situation]}</small></span>
            ${used.length ? `<span class="jb-tag">${used.join(' · ')}</span>` : ''}
          </button>`;
        })
        .join('');
    }
    if (juke) {
      const c = cat.find((x) => x.url === juke.url) || { title: '', situation: '' };
      this.now.innerHTML = `<div class="jb-kick">지금 재생 중</div><h3>${c.title}</h3><div class="jb-sit">${LABEL[c.situation] || ''}</div>
        <div class="jb-bar"><i></i></div><div class="jb-time"><span class="jb-cur">0:00</span><span class="jb-dur">-:--</span></div>
        <div class="jb-ctl">
          <button type="button" data-act="prev" aria-label="이전 곡">◀◀</button>
          <button type="button" data-act="pause" class="big">${this.paused ? '▶' : 'Ⅱ'}</button>
          <button type="button" data-act="next" aria-label="다음 곡">▶▶</button>
        </div>
        <div class="jb-ctl2">
          <button type="button" data-act="mode">${juke.mode === 'one' ? '한 곡 반복' : '전체 재생'}</button>
          <button type="button" data-act="stop">정지 · 상황별 음악으로</button>
        </div>
        <p class="jb-note">칸티나를 나가도 계속 재생됩니다. 화면 위쪽의 ♪ 표시를 눌러도 멈출 수 있습니다.</p>`;
    } else {
      this.now.innerHTML = `<div class="jb-kick">대기 중</div><h3>곡을 고르세요</h3><p class="jb-note">해금한 곡을 누르면 재생합니다. 아직 듣지 못한 곡은 게임 속 해당 상황에서 처음 들으면 해금됩니다.</p>`;
    }
    const open = cat.filter((c) => m.heard.has(c.url));
    this.slots.innerHTML = SITUATIONS.map(([sit, label]) => {
      const cur = m.overrides[sit] || '';
      return `<label><span>${label}</span><select data-sit="${sit}"><option value="">기본</option>${open
        .map((c) => `<option value="${c.url}"${c.url === cur ? ' selected' : ''}>${c.title}</option>`)
        .join('')}</select></label>`;
    }).join('');
  }

  progress() {
    const m = this.music;
    if (!m.juke) return;
    const el = m.track(m.juke.url).el;
    const bar = this.now.querySelector('.jb-bar i');
    if (!bar) return;
    bar.style.width = (el.duration ? (el.currentTime / el.duration) * 100 : 0) + '%';
    this.now.querySelector('.jb-cur').textContent = fmt(el.currentTime);
    this.now.querySelector('.jb-dur').textContent = fmt(el.duration);
    if (this.shown !== m.juke.url) {
      this.shown = m.juke.url; // the track changed by itself (play all)
      this.render();
    }
  }

  /** Every frame: the HUD chip. */
  update() {
    const m = this.music;
    const on = !!m.juke && !document.body.classList.contains('title');
    this.chip.classList.toggle('hidden', !on);
    if (on && this.chipFor !== m.juke.url) {
      this.chipFor = m.juke.url;
      const c = m.catalog.find((x) => x.url === m.juke.url);
      this.chip.innerHTML = `<i>♪</i><span>${c ? c.title : ''}</span><b>■</b>`;
    }
  }
}
