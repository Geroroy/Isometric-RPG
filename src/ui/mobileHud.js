// The phone HUD. Phones get their own chrome instead of a squeezed copy of the
// PC console (ui/hud.js): the world fills the screen, the left thumb steers,
// the right thumb has the action cluster (ui/touch.js), and the readouts sit
// in the corners where neither thumb goes:
//   top left     vitals plate — portrait, HP / Force bars, level, dark meter;
//                in a duel the composure bar; below it the status chips
//   top right    radar (campaign) and the menu keys (skills · info · cards ·
//                map · settings · fullscreen)
//   bottom       the last few console lines, fading out (the message log)
// The full-screen panels (skill tree, map, settings…) are the HUD's own and
// are shared with the PC layout.
import { iconURL } from './icons.js';
import { dist } from '../core/math.js';
import { setText } from './dom.js';

const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};
const LOG_LIFE = 7; // seconds a console line stays on the phone screen
const LOG_MAX = 3;

export class MobileHUD {
  constructor(game, hud, audio) {
    this.game = game;
    this.hud = hud;
    this.audio = audio;
    this.hpChip = 1;
    this.textT = 0;
    this.radarT = 0;
    this.lines = []; // { el, t }
    this.build();
    game.on('log', (text, cls) => this.log(text, cls));
  }

  build() {
    const root = (this.root = el('div', 'm-ui'));
    root.id = 'mobile';
    const duel = !!this.game.duel;

    // --- vitals plate (top left)
    this.vitals = el(
      'div',
      'm-vitals',
      `<div class="m-face monitor"><canvas width="120" height="120"></canvas><span class="m-lv">1</span></div>
       <div class="m-bars">
         <div class="m-bar hp"><i class="chip"></i><i class="fill"></i><b></b></div>
         <div class="m-bar fp"><i class="fill"></i><b></b></div>
         ${duel ? '<div class="m-bar comp"><i class="fill"></i><span>평정</span></div>' : '<div class="m-dark"><i></i></div>'}
       </div>`,
    );
    root.appendChild(this.vitals);
    this.face = this.vitals.querySelector('canvas');
    this.fctx = this.face.getContext('2d');
    this.lvEl = this.vitals.querySelector('.m-lv');
    this.hpFill = this.vitals.querySelector('.hp .fill');
    this.hpChipEl = this.vitals.querySelector('.hp .chip');
    this.hpText = this.vitals.querySelector('.hp b');
    this.fpFill = this.vitals.querySelector('.fp .fill');
    this.fpText = this.vitals.querySelector('.fp b');
    this.compFill = this.vitals.querySelector('.comp .fill');
    this.darkMark = this.vitals.querySelector('.m-dark i');
    // tapping the face: Anakin talks (same as the PC portrait)
    this.face.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.hud.pokePortrait();
    });

    // status chips + objective line under the plate
    this.chips = el('div', 'm-chips');
    this.obj = el('div', 'm-obj');
    root.append(this.chips, this.obj);

    // --- top right: radar + menu keys
    const top = el('div', 'm-top');
    const menu = el('div', 'm-menu');
    const items = duel
      ? [
          ['settings', '설정', () => this.hud.toggle('settings')],
          ['fs', '전체', () => this.onFullscreen && this.onFullscreen()],
        ]
      : [
          ['skills', '스킬', () => this.hud.toggle('tree')],
          ['character', '정보', () => this.hud.toggle('char')],
          ['cards', '카드', () => this.hud.toggle('cards')],
          ['map', '지도', () => this.hud.toggle('map')],
          ['settings', '설정', () => this.hud.toggle('settings')],
          ['fs', '전체', () => this.onFullscreen && this.onFullscreen()],
        ];
    this.menuBtns = {};
    const GLYPH = { map: '⌖', settings: '⚙', fs: '⛶' };
    for (const [icon, label, fn] of items) {
      const b = el('button', 'm-key', GLYPH[icon] ? `<b>${GLYPH[icon]}</b><span>${label}</span>` : `<img src="${iconURL(icon)}" alt=""><span>${label}</span><i class="dot"></i>`);
      b.type = 'button';
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.audio.unlock();
        fn();
      });
      menu.appendChild(b);
      this.menuBtns[icon] = b;
    }
    top.appendChild(menu);
    if (!duel) {
      this.radar = el('div', 'm-radar monitor', '<canvas width="200" height="200"></canvas><span class="m-region"></span>');
      this.rctx = this.radar.querySelector('canvas').getContext('2d');
      this.regionEl = this.radar.querySelector('.m-region');
      this.radar.addEventListener('pointerdown', (e) => e.stopPropagation());
      this.radar.addEventListener('click', (e) => {
        e.stopPropagation();
        this.hud.toggle('map');
      });
      top.appendChild(this.radar);
    }
    root.appendChild(top);

    // --- the message log: a few fading lines above the action cluster
    this.logEl = el('div', 'm-log');
    root.appendChild(this.logEl);

    document.getElementById('hud').appendChild(root);
  }

  log(text, cls = '') {
    const line = el('div', 'm-line ' + cls);
    line.textContent = text;
    this.logEl.appendChild(line);
    this.lines.push({ el: line, t: 0 });
    while (this.lines.length > LOG_MAX) this.lines.shift().el.remove();
  }

  /** The objective line: one short sentence for the phone. */
  objective() {
    const g = this.game;
    if (g.duel) return '';
    const p = g.player;
    const front = g.front;
    if (g.world !== front) return '착륙장의 스타파이터로 크리스토프시스 출격';
    const camps = front.camps.filter((c) => !c.boss);
    const cleared = camps.filter((c) => c.cleared).length;
    const ready = g.quests.tracked().find(({ s }) => s.state === 'ready');
    if (ready) return `${ready.q.title} — 보고하기`;
    let near = null;
    let nd = Infinity;
    for (const c of front.camps) {
      if (c.cleared) continue;
      const d = dist(p.x, p.y, c.x, c.y);
      if (d < nd) {
        nd = d;
        near = c;
      }
    }
    if (!near) return `거점 ${cleared} / ${camps.length} 소탕 완료`;
    const dx = near.x - p.x;
    const dy = near.y - p.y;
    const ang = (Math.atan2((dx + dy) * 0.5, dx - dy) * 180) / Math.PI;
    return `<span class="m-arrow" style="transform:rotate(${ang.toFixed(0)}deg)">➜</span>${near.boss ? '드로이드 공장' : '거점'} ${Math.round(nd)}m <small>${cleared} / ${camps.length}</small>`;
  }

  update(dt) {
    const g = this.game;
    const p = g.player;
    const hud = this.hud;
    const hpK = Math.max(0, p.hp / p.maxHp);
    this.hpChip = this.hpChip > hpK ? Math.max(hpK, this.hpChip - dt * 0.35) : hpK;
    this.hpFill.style.width = hpK * 100 + '%';
    this.hpChipEl.style.width = this.hpChip * 100 + '%';
    this.vitals.classList.toggle('low', hpK < 0.25);
    this.fpFill.style.width = Math.max(0, p.force / p.maxForce) * 100 + '%';
    if (this.compFill) {
      this.compFill.style.width = Math.max(0, p.composure) + '%';
      this.vitals.classList.toggle('comp-low', p.composure < 30);
    }
    hud.portrait.draw(this.fctx, this.face.width, this.face.height);

    // the lines of the log fade and go
    for (const l of this.lines) {
      l.t += dt;
      if (l.t > LOG_LIFE - 1) l.el.style.opacity = Math.max(0, LOG_LIFE - l.t);
    }
    while (this.lines.length && this.lines[0].t > LOG_LIFE) this.lines.shift().el.remove();

    this.textT -= dt;
    if (this.textT <= 0) {
      this.textT = 0.15;
      setText(this.hpText, Math.ceil(Math.max(0, p.hp)));
      setText(this.fpText, Math.floor(p.force));
      setText(this.lvEl, p.level);
      if (this.darkMark) this.darkMark.style.left = p.darkness + '%';
      if (this.regionEl) setText(this.regionEl, g.region);
      const chips = [];
      for (const [k, b] of Object.entries(p.buffs)) chips.push(`<span class="m-chip"><img src="${iconURL(k)}" alt="">${Math.ceil(b.t)}s</span>`);
      if (p.saberOut) chips.push('<span class="m-chip info">광선검 회수 중</span>');
      if (p.darkness >= 60) chips.push('<span class="m-chip dark">어둠의 유혹</span>');
      if (p.skillPoints) chips.push(`<span class="m-chip gold">스킬 포인트 ${p.skillPoints}</span>`);
      if (p.attrPoints) chips.push(`<span class="m-chip gold">능력치 포인트 ${p.attrPoints}</span>`);
      const html = chips.join('');
      if (html !== this.chipsHtml) this.chips.innerHTML = this.chipsHtml = html;
      const obj = this.objective();
      if (obj !== this.objHtml) this.obj.innerHTML = this.objHtml = obj;
      if (this.menuBtns.skills) this.menuBtns.skills.classList.toggle('alert', p.skillPoints > 0);
      if (this.menuBtns.character) this.menuBtns.character.classList.toggle('alert', p.attrPoints > 0);
    }

    if (this.rctx) {
      this.radarT -= dt;
      if (this.radarT <= 0) {
        this.radarT = 0.1;
        this.drawRadar();
      }
    }
  }

  drawRadar() {
    this.hud.drawScanner(this.rctx, 200, 1.9, 1.3);
  }
}
