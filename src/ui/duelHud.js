// Movie Duel overlay: Dooku's health and composure (top centre), Anakin's
// composure under his Force bar, the saber-lock meter, cinematic letterbox
// and the results screen.
const el = (cls, html = '') => {
  const e = document.createElement('div');
  e.className = cls;
  e.innerHTML = html;
  return e;
};

// one emblem (pointing right, at the name; mirrored on the right side): three bars tapering to a chevron, a
// ring with a dot in it
const EMBLEM = `<svg class="bb-mark" viewBox="0 0 66 26" aria-hidden="true">
  <path d="M2 3h24l6 5H2zM2 10.5h32l3 2.5-3 2.5H2zM2 18h30l-6 5H2z"/>
  <path d="M38 4.5h7a8.5 8.5 0 0 1 0 17h-7l4-4h3a4.5 4.5 0 0 0 0-9h-3z"/>
  <circle cx="54" cy="13" r="7.5" fill="none" stroke-width="2.6"/>
  <circle cx="54" cy="13" r="3.2"/>
</svg>`;

export class DuelHUD {
  constructor(game) {
    this.game = game;
    const root = document.getElementById('hud');
    // each duel describes itself (the Geonosis duel uses these defaults)
    this.cfg = {
      kicker: 'MOVIE DUEL · 지오노시스의 결투',
      name: '두쿠 백작',
      sub: '다스 티라누스 · 마카시',
      marks: [0.6, 0.25],
      win: '두쿠 백작이 무릎을 꿇었다. 영화와 다른 결말 — 공화국은 분리주의 연합의 지도자를 손에 넣었다.',
      lose: '두쿠의 일격에 아나킨은 오른팔을 잃었다. 그 순간, 격납고 입구에 마스터 세렌 베일이 모습을 드러낸다.',
      ...(game.duel.hud || {}),
    };
    const c = this.cfg;
    if (game.duel.hud) c.kicker = `${c.kicker} · ${c.title}`;
    // the boss's bar as Star Wars Jedi: Survivor draws it (reference/unsorted/image.jpg): a long thin pill of coral
    // red with a dark rim, no plate; the name under it in pale cream between two mirrored emblems (striped
    // chevrons and a dotted ring); the composure (the block meter) a thin gold line under the bar, shown only
    // while it is not full
    this.boss = el(
      'boss-bar',
      `<div class="bb-hp"><i class="bb-chip"></i><i class="bb-fill"></i></div>
       <div class="bb-comp"><i></i></div>
       <div class="bb-name">${EMBLEM}<span>${c.name}</span>${EMBLEM.replace('bb-mark', 'bb-mark r')}</div>`,
    );
    this.boss.title = c.sub;
    if (!game.duel.foe) this.boss.style.display = 'none'; // (a stage with nobody to fight yet: the Mustafar rebuild's first steps)
    this.comp = el('ps-comp', '<span>평정</span><div><i></i></div>');
    document.querySelector('.cn-stats').appendChild(this.comp); // the PC console (the phone plate has its own, ui/mobileHud.js)
    this.lockEl = el('lock-meter hidden', '<div class="lm-label">칼날 겨루기</div><div class="lm-bar"><i></i></div><div class="lm-hint"></div>');
    this.bars = el('letterbox', '<i></i><i></i>');
    this.result = el('duel-result hidden');
    root.append(this.boss, this.lockEl, this.bars, this.result);
    this.chip = 1;
    game.on('cine', (on) => document.body.classList.toggle('cine', on));
    game.on('lock', (on) => this.lockEl.classList.toggle('hidden', !on));
    game.on('duelEnd', (r) => this.showResult(r));
  }

  update(dt) {
    const d = this.game.duel;
    const dk = d.foe;
    const p = this.game.player;
    if (!dk) {
      this.comp.querySelector('i').style.width = Math.max(0, p.composure) + '%';
      this.comp.classList.toggle('low', p.composure < 30);
      return;
    }
    const k = Math.max(0, dk.hp / dk.maxHp);
    this.chip = this.chip > k ? Math.max(k, this.chip - dt * 0.3) : k;
    this.boss.querySelector('.bb-fill').style.width = k * 100 + '%';
    this.boss.querySelector('.bb-chip').style.width = this.chip * 100 + '%';
    const bc = this.boss.querySelector('.bb-comp i');
    bc.style.width = Math.max(0, dk.composure) + '%';
    bc.parentElement.classList.toggle('broken', dk.state === 'broken');
    bc.parentElement.classList.toggle('full', dk.composure >= 99.5 && dk.state !== 'broken');
    const pc = this.comp.querySelector('i');
    pc.style.width = Math.max(0, p.composure) + '%';
    this.comp.classList.toggle('low', p.composure < 30);
    if (d.lock) {
      this.lockEl.querySelector('.lm-bar i').style.width = Math.max(0, Math.min(1, d.lock.v)) * 100 + '%';
      this.lockEl.querySelector('.lm-hint').textContent = document.body.classList.contains('touch') ? '공격 버튼 연타!' : '좌클릭 / Space 연타!';
    }
  }

  showResult(r) {
    const mm = Math.floor(r.t / 60);
    const ss = String(Math.floor(r.t % 60)).padStart(2, '0');
    const epilogue = r.won ? this.cfg.win : this.cfg.lose;
    this.result.innerHTML = `
      <div class="dr-kicker">${this.cfg.kicker}</div>
      <div class="dr-title">${r.won ? (this.game.duel.hud ? '끝' : '승리') : '패배'}</div>
      <p class="dr-epi">${epilogue}</p>
      ${r.won ? `<div class="dr-rank"><span>등급</span><b>${r.rank}</b></div>` : ''}
      <div class="dr-stats">
        <div><span>시간</span><b>${mm}:${ss}</b></div>
        <div><span>받은 피해</span><b>${Math.round(r.taken)}</b></div>
        <div><span>완벽한 흘리기</span><b>${r.parries}</b></div>
        <div><span>칼날 겨루기 승리</span><b>${r.locksWon}</b></div>
        ${r.sets !== undefined ? `<div><span>눈금까지 몰아붙인 세트</span><b>${r.sets} / ${this.cfg.marks.length}</b></div>` : ''}
      </div>
      <div class="dr-actions"><button type="button" class="dr-retry">${r.retryPart ? '이 전투부터 다시' : '다시 도전'}</button>${r.retryPart ? '<a href="#" class="dr-restart">처음부터</a>' : ''}<a href="#campaign">캠페인으로</a></div>`;
    this.result.classList.remove('hidden');
    // a checkpoint (the Mustafar duel: r.retryPart, the fight he fell in) starts there — the director's ?mfPart
    const go = (part) => {
      const u = new URL(location.href);
      if (part) u.searchParams.set('mfPart', part);
      else u.searchParams.delete('mfPart');
      if (u.href === location.href) location.reload();
      else location.href = u.href;
    };
    this.result.querySelector('.dr-retry').onclick = () => (r.retryPart ? go(r.retryPart) : location.reload());
    const restart = this.result.querySelector('.dr-restart');
    if (restart) restart.onclick = (e) => (e.preventDefault(), go(null));
    this.result.addEventListener('mousedown', (e) => e.stopPropagation());
  }
}
