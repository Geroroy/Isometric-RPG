// Movie Duel overlay: Dooku's health and composure (top centre), Anakin's
// composure under his Force bar, the saber-lock meter, cinematic letterbox
// and the results screen.
const el = (cls, html = '') => {
  const e = document.createElement('div');
  e.className = cls;
  e.innerHTML = html;
  return e;
};

export class DuelHUD {
  constructor(game) {
    this.game = game;
    const root = document.getElementById('hud');
    this.boss = el(
      'boss-bar',
      `<div class="bb-name">두쿠 백작 <span>다스 티라누스 · 마카시</span></div>
       <div class="bb-hp"><i class="bb-chip"></i><i class="bb-fill"></i><b style="left:60%"></b><b style="left:25%"></b></div>
       <div class="bb-comp"><i></i></div>`,
    );
    this.comp = el('ps-comp', '<span>평정</span><div><i></i></div>');
    document.querySelector('.ps-info').insertBefore(this.comp, document.querySelector('.ps-row'));
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
    const dk = d.dooku;
    const p = this.game.player;
    const k = Math.max(0, dk.hp / dk.maxHp);
    this.chip = this.chip > k ? Math.max(k, this.chip - dt * 0.3) : k;
    this.boss.querySelector('.bb-fill').style.width = k * 100 + '%';
    this.boss.querySelector('.bb-chip').style.width = this.chip * 100 + '%';
    const bc = this.boss.querySelector('.bb-comp i');
    bc.style.width = Math.max(0, dk.composure) + '%';
    bc.parentElement.classList.toggle('broken', dk.state === 'broken');
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
    const epilogue = r.won
      ? '두쿠 백작이 무릎을 꿇었다. 영화와 다른 결말 — 공화국은 분리주의 연합의 지도자를 손에 넣었다.'
      : '두쿠의 일격에 아나킨은 오른팔을 잃었다. 그 순간, 격납고 입구에 작은 그림자가 나타난다. 마스터 요다다.';
    this.result.innerHTML = `
      <div class="dr-kicker">MOVIE DUEL · 지오노시스의 결투</div>
      <div class="dr-title">${r.won ? '승리' : '패배'}</div>
      <p class="dr-epi">${epilogue}</p>
      ${r.won ? `<div class="dr-rank"><span>등급</span><b>${r.rank}</b></div>` : ''}
      <div class="dr-stats">
        <div><span>시간</span><b>${mm}:${ss}</b></div>
        <div><span>받은 피해</span><b>${Math.round(r.taken)}</b></div>
        <div><span>완벽한 흘리기</span><b>${r.parries}</b></div>
        <div><span>칼날 겨루기 승리</span><b>${r.locksWon}</b></div>
      </div>
      <div class="dr-actions"><button type="button" class="dr-retry">다시 도전</button><a href="./">캠페인으로</a></div>`;
    this.result.classList.remove('hidden');
    this.result.querySelector('.dr-retry').onclick = () => location.reload();
    this.result.addEventListener('mousedown', (e) => e.stopPropagation());
  }
}
