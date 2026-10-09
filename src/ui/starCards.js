// Star Card screen (Battlefront II style): three equipped cards on the left,
// the collection on the right, a detail pane to unlock / upgrade / equip.
// Card illustrations are optional files at cards/<id>.(jpg|png|webp); a card
// without one shows its skill icon and says so.
import { CARDS, TIERS, SLOT_LEVELS, UNLOCK_COST } from '../game/perks.js';
import { iconURL } from './icons.js';

const ROMAN = ['I', 'II', 'III', 'IV'];
const art = {}; // id -> url | null (missing) | undefined (not checked yet)

function probeArt(id, done) {
  const exts = ['jpg', 'png', 'webp'];
  const tryNext = (i) => {
    if (i >= exts.length) {
      art[id] = null;
      return done();
    }
    const img = new Image();
    img.onload = () => {
      art[id] = img.src;
      done();
    };
    img.onerror = () => tryNext(i + 1);
    img.src = `cards/${id}.${exts[i]}`;
  };
  tryNext(0);
}

export class StarCardsUI {
  constructor(hud, game) {
    this.hud = hud;
    this.game = game;
    this.sel = null;
    this.el = hud.overlay('starcards', '스타 카드', '<div class="sc-parts"></div>');
    this.body = this.el.querySelector('.ov-body');
    this.body.addEventListener('click', (e) => this.click(e));
    for (const id of Object.keys(CARDS)) probeArt(id, () => this.el.classList.contains('hidden') || this.render());
  }

  get cards() {
    return this.game.player.cards;
  }

  cardHTML(id, extra = '') {
    const c = CARDS[id];
    const t = this.cards.owned[id];
    const tier = t ?? 0;
    const locked = t === undefined;
    const pic = art[id]
      ? `<img class="sc-img" src="${art[id]}" alt="">`
      : `<img class="sc-icon" src="${iconURL(c.icon)}" alt=""><span class="sc-noart">일러스트 없음</span>`;
    return `<button type="button" class="sc-card t${tier}${locked ? ' locked' : ''}${this.sel === id ? ' sel' : ''} ${extra}" data-card="${id}">
      <span class="sc-art">${pic}</span>
      <span class="sc-tier">${locked ? '잠김' : `${TIERS[tier]} ${ROMAN[tier]}`}</span>
      <span class="sc-name">${c.name}</span>
      <span class="sc-text">${c.text(c.v[tier])}</span>
    </button>`;
  }

  render() {
    const sc = this.cards;
    this.el.querySelector('.sc-parts').innerHTML = `<span>크래프팅 부품</span><b>${sc.parts}</b>`;
    const slots = sc.slots
      .map((id, i) => {
        if (!sc.slotOpen(i)) return `<div class="sc-slot closed"><span>슬롯 ${i + 1}</span><small>레벨 ${SLOT_LEVELS[i]}에 열림</small></div>`;
        return id ? `<div class="sc-slot">${this.cardHTML(id, 'big')}</div>` : `<div class="sc-slot empty" data-slot="${i}"><span>슬롯 ${i + 1}</span><small>카드를 골라 장착</small></div>`;
      })
      .join('');
    const list = Object.keys(CARDS)
      .map((id) => this.cardHTML(id))
      .join('');
    this.body.innerHTML = `<div class="sc-wrap">
      <section class="sc-equipped"><div class="sc-h">장착한 카드</div><div class="sc-slots">${slots}</div></section>
      <section class="sc-collection"><div class="sc-h">카드 모음</div><div class="sc-grid">${list}</div></section>
      <section class="sc-detail">${this.detailHTML()}</section>
    </div>`;
  }

  detailHTML() {
    const id = this.sel;
    if (!id) return '<div class="sc-hint">카드를 선택하세요. 드로이드를 파괴하고 임무를 완료하면 크래프팅 부품을 얻습니다.</div>';
    const sc = this.cards;
    const c = CARDS[id];
    const t = sc.owned[id];
    const btn = (act, label, ok, arg = '') => `<button type="button" class="sc-act" data-act="${act}" data-arg="${arg}" ${ok ? '' : 'disabled'}>${label}</button>`;
    const rows = c.v.map((v, i) => `<li class="${t === i ? 'on' : ''}">${ROMAN[i]} · ${c.text(v)}</li>`).join('');
    let actions = '';
    if (t === undefined) actions = btn('unlock', `잠금 해제 · 부품 ${UNLOCK_COST}`, sc.parts >= UNLOCK_COST);
    else {
      const cost = sc.upgradeCost(id);
      actions += cost === null ? '<div class="sc-max">최고 등급</div>' : btn('upgrade', `${ROMAN[t + 1]} 등급으로 강화 · 부품 ${cost}`, sc.parts >= cost);
      const at = sc.slots.indexOf(id);
      if (at >= 0) actions += btn('unequip', `슬롯 ${at + 1}에서 해제`, true, at);
      else actions += sc.slots.map((_, i) => btn('equip', `슬롯 ${i + 1}에 장착`, sc.slotOpen(i), i)).join('');
    }
    return `<div class="sc-dname">${c.name}</div><ul class="sc-tiers">${rows}</ul><div class="sc-actions">${actions}</div>`;
  }

  click(e) {
    const a = e.target.closest('[data-act]');
    const sc = this.cards;
    if (a) {
      const arg = +a.dataset.arg;
      const ok =
        a.dataset.act === 'unlock' ? sc.unlock(this.sel) : a.dataset.act === 'upgrade' ? sc.upgrade(this.sel) : a.dataset.act === 'equip' ? sc.equip(this.sel, arg) : (sc.unequip(arg), true);
      this.game.audio.play(ok ? (a.dataset.act === 'upgrade' || a.dataset.act === 'unlock' ? 'levelup' : 'click') : 'deny');
      return this.render();
    }
    const card = e.target.closest('[data-card]');
    if (card) {
      this.sel = card.dataset.card;
      this.game.audio.play('click');
      this.render();
    }
  }
}
