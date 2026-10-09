// DOM-based HUD: StarCraft-style bottom console (minimap, unit info, portrait,
// command card), Diablo-style orbs, skill tree & character panels, automap,
// tooltips, subtitles and banners.
import { SKILLS, TREES, TIER_LEVELS, canLearn, isActive } from '../game/skills.js';
import { iconURL } from './icons.js';
import { dist } from '../core/math.js';

const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

const ATTR_INFO = {
  str: ['힘', '광선검 피해 +1.5%/포인트'],
  agi: ['민첩', '공격 속도 +0.6%, 볼트 반사 +0.3%/포인트'],
  vit: ['활력', '생명력 +4/포인트'],
  for: ['포스 친화', '포스 +2, 포스 피해 +1.2%/포인트'],
};

export class HUD {
  constructor(game, renderer, portrait, audio) {
    this.game = game;
    this.renderer = renderer;
    this.portrait = portrait;
    this.audio = audio;
    this.root = $('#hud');
    this.pendingSkill = null;
    this.miniT = 0;
    this.textT = 0;
    this.subQueue = [];
    this.sub = null;
    this.open = { tree: false, char: false, map: false };
    this.buildConsole();
    this.buildPanels();
    this.mapImg = renderer.terrain.minimapImage();
    this.fogCanvas = document.createElement('canvas');
    this.fogCanvas.width = game.world.w;
    this.fogCanvas.height = game.world.h;
    this.updateFog();

    game.on('say', (text) => this.say(text));
    game.on('region', (name) => this.banner(name));
    game.on('hurt', () => portrait.hurt());
    game.on('levelup', () => this.refreshPanels());
    game.on('death', () => setTimeout(() => this.showDeath(), 1600));
  }

  // ------------------------------------------------------------------ console

  buildConsole() {
    const c = $('#console');
    c.innerHTML = `
      <div class="c-left plate">
        <div class="mini-wrap"><canvas id="minimap" width="300" height="300"></canvas></div>
      </div>
      <div class="c-orb plate"><div class="orb hp"><div class="orb-fill"></div><div class="orb-glass"></div></div><div class="orb-label" id="hpText"></div></div>
      <div class="c-center plate">
        <div class="unit-head"><span class="unit-name">아나킨 스카이워커</span><span class="unit-rank">제다이 기사 · 501군단 장군</span><span class="unit-lvl" id="lvlText"></span></div>
        <div class="xpbar" id="xpbar"><div></div><span></span></div>
        <div class="unit-body">
          <div class="dark-meter"><span class="dm-l">빛</span><div class="dm-bar"><div class="dm-mark" id="dmMark"></div></div><span class="dm-r">어둠</span></div>
          <div class="buffs" id="buffs"></div>
          <div class="pts" id="ptsText"></div>
        </div>
        <div class="subtitle" id="subtitle"></div>
      </div>
      <div class="c-orb plate"><div class="orb force"><div class="orb-fill"></div><div class="orb-glass"></div></div><div class="orb-label" id="fpText"></div></div>
      <div class="c-portrait plate">
        <div class="portrait-frame"><canvas id="portrait" width="168" height="160"></canvas></div>
        <div class="portrait-name">ANAKIN</div>
      </div>
      <div class="c-cmd plate"><div class="cmdcard" id="cmdcard"></div></div>`;
    this.minimap = $('#minimap');
    this.mctx = this.minimap.getContext('2d');
    this.pcanvas = $('#portrait');
    this.pctx = this.pcanvas.getContext('2d');
    this.pcanvas.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      this.pokes = (this.pokes || 0) + 1;
      clearTimeout(this.pokeReset);
      this.pokeReset = setTimeout(() => (this.pokes = 0), 4000);
      this.game.say(this.pokes > 4 ? 'pokeAnnoyed' : 'poke');
    });
    this.minimap.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      if (e.button !== 0) return;
      const r = this.minimap.getBoundingClientRect();
      const w = this.miniToWorld((e.clientX - r.left) * (300 / r.width), (e.clientY - r.top) * (300 / r.height));
      this.game.player.commandMove(w.x, w.y);
      this.renderer.addClickMark(w.x, w.y);
    });

    const card = $('#cmdcard');
    this.slots = [];
    const keys = ['1', '2', '3', '4', '5', '6'];
    for (let i = 0; i < 6; i++) {
      const b = el('div', 'cmd');
      b.innerHTML = `<img><div class="cd"></div><span class="key">${keys[i]}</span><span class="rmb">R</span><span class="lv"></span>`;
      b.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        const id = this.game.player.hotbar[i];
        if (e.button === 2) {
          if (id) this.game.player.rmbSlot = i;
          return;
        }
        if (!id) {
          this.toggle('tree', true);
          return;
        }
        this.activateSlot(i);
      });
      b.addEventListener('mouseenter', () => this.showSkillTip(this.game.player.hotbar[i], b, i));
      b.addEventListener('mouseleave', () => this.hideTip());
      card.appendChild(b);
      this.slots.push(b);
    }
    const extra = [
      ['bacta', 'Q', '박타 주사기', '생명력 45% 회복. 드로이드에게서 획득.', () => this.game.useBacta()],
      ['skills', 'K', '스킬 트리', '스킬 포인트를 분배합니다.', () => this.toggle('tree')],
      ['character', 'C', '캐릭터 정보', '능력치 포인트를 분배합니다.', () => this.toggle('char')],
    ];
    for (const [icon, key, name, desc, fn] of extra) {
      const b = el('div', 'cmd');
      b.innerHTML = `<img src="${iconURL(icon)}"><span class="key">${key}</span><span class="lv"></span>`;
      b.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        if (e.button === 0) fn();
      });
      b.addEventListener('mouseenter', () => this.showTip(`<b>${name}</b> <span class="hk">[${key}]</span><br>${desc}`, b));
      b.addEventListener('mouseleave', () => this.hideTip());
      card.appendChild(b);
      if (icon === 'bacta') this.bactaBtn = b;
      if (icon === 'skills') this.skillBtn = b;
      if (icon === 'character') this.charBtn = b;
    }
  }

  activateSlot(i) {
    const g = this.game;
    const p = g.player;
    const id = p.hotbar[i];
    if (!id) return;
    const s = SKILLS[id];
    if (s.target === 'self') {
      const m = g.mouseWorld || p;
      p.tryCast(id, m.x, m.y, null);
    } else {
      this.pendingSkill = id;
      document.body.classList.add('targeting');
    }
  }

  cancelTargeting() {
    this.pendingSkill = null;
    document.body.classList.remove('targeting');
  }

  // ------------------------------------------------------------------ panels

  buildPanels() {
    // Skill tree
    const tree = el('div', 'panel hidden', '');
    tree.id = 'skilltree';
    tree.innerHTML = `<div class="panel-title">스킬 트리 <span class="sub">— 남은 스킬 포인트: <b id="spLeft">0</b></span><div class="close">✕</div></div>
      <div class="trees"></div>
      <div class="panel-hint">좌클릭: 포인트 투자 · 스킬 위에서 <b>1~6</b>: 단축키 지정 · 우클릭: <b>마우스 우버튼</b> 스킬로 지정</div>`;
    this.root.appendChild(tree);
    $('.close', tree).onclick = () => this.toggle('tree', false);
    const trees = $('.trees', tree);
    this.treeCells = {};
    TREES.forEach((t, ti) => {
      const col = el('div', 'tree');
      col.style.setProperty('--tc', t.color);
      col.innerHTML = `<div class="tree-head"><div class="tree-name">${t.name}</div><div class="tree-en">${t.en}</div><div class="tree-spent" data-tree="${ti}"></div></div>`;
      const grid = el('div', 'tree-grid');
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'tree-lines');
      svg.setAttribute('viewBox', '0 0 210 370');
      grid.appendChild(svg);
      for (let r = 0; r < 5; r++) {
        const lab = el('div', 'tier-label', `Lv ${TIER_LEVELS[r]}`);
        lab.style.top = 18 + r * 74 + 'px';
        grid.appendChild(lab);
      }
      const pos = (s) => [35 + s.col * 70, 32 + s.row * 74];
      for (const s of Object.values(SKILLS).filter((s) => s.tree === ti)) {
        for (const pid of s.prereq) {
          const [x1, y1] = pos(SKILLS[pid]);
          const [x2, y2] = pos(s);
          const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          line.setAttribute('d', `M${x1} ${y1 + 24} L${x1} ${(y1 + y2) / 2} L${x2} ${(y1 + y2) / 2} L${x2} ${y2 - 24}`);
          line.dataset.from = pid;
          line.dataset.to = s.id;
          svg.appendChild(line);
        }
        const cell = el('div', 'skill');
        const [x, y] = pos(s);
        cell.style.left = x - 24 + 'px';
        cell.style.top = y - 24 + 'px';
        cell.innerHTML = `<img src="${iconURL(s.icon)}"><span class="slv"></span>${s.dark ? '<span class="dark-tag">어둠</span>' : ''}`;
        cell.addEventListener('mousedown', (e) => {
          e.stopPropagation();
          const p = this.game.player;
          if (e.button === 0) {
            if (canLearn(p, s.id)) {
              p.learn(s.id);
              this.audio.play('levelup');
              this.refreshPanels();
              this.showSkillTip(s.id, cell);
            } else this.audio.play('deny');
          } else if (e.button === 2 && p.skillLevel(s.id) && isActive(s.id)) {
            let i = p.hotbar.indexOf(s.id);
            if (i < 0) {
              i = p.hotbar.indexOf(null);
              if (i < 0) i = p.rmbSlot;
              p.hotbar[i] = s.id;
            }
            p.rmbSlot = i;
            this.audio.play('click');
          }
        });
        cell.addEventListener('mouseenter', () => {
          this.hoverSkill = s.id;
          this.showSkillTip(s.id, cell);
        });
        cell.addEventListener('mouseleave', () => {
          this.hoverSkill = null;
          this.hideTip();
        });
        grid.appendChild(cell);
        this.treeCells[s.id] = cell;
      }
      col.appendChild(grid);
      trees.appendChild(col);
    });

    // Character sheet
    const ch = el('div', 'panel hidden');
    ch.id = 'charsheet';
    ch.innerHTML = `<div class="panel-title">아나킨 스카이워커 <span class="sub">제다이 기사</span><div class="close">✕</div></div><div class="char-body"></div>`;
    this.root.appendChild(ch);
    $('.close', ch).onclick = () => this.toggle('char', false);

    // Tooltip, banner, nameplate, automap, death, help
    this.tip = el('div', 'tooltip hidden');
    this.root.appendChild(this.tip);
    this.bannerEl = el('div', 'banner');
    this.root.appendChild(this.bannerEl);
    this.plate = el('div', 'nameplate hidden', '<div class="np-name"></div><div class="np-bar"><div></div></div><div class="np-sub"></div>');
    this.root.appendChild(this.plate);
    this.automap = el('canvas', 'automap hidden');
    this.root.appendChild(this.automap);
    this.death = el('div', 'death hidden', `<div class="death-title">쓰러졌습니다</div><div class="death-sub">포스와 함께하길…</div><button>공화국 전진 기지에서 재정비</button>`);
    this.root.appendChild(this.death);
    $('button', this.death).onclick = (e) => {
      e.stopPropagation();
      this.death.classList.add('hidden');
      this.game.respawnPlayer();
    };
    this.refreshPanels();
  }

  toggle(which, force) {
    const v = force ?? !this.open[which];
    this.open[which] = v;
    const map = { tree: '#skilltree', char: '#charsheet' };
    if (which === 'map') this.automap.classList.toggle('hidden', !v);
    else $(map[which]).classList.toggle('hidden', !v);
    if (v) this.refreshPanels();
    if (!v) this.hideTip();
    this.audio.play('click');
  }

  closeAll() {
    for (const k of Object.keys(this.open)) if (this.open[k]) this.toggle(k, false);
    this.cancelTargeting();
  }

  refreshPanels() {
    const p = this.game.player;
    $('#spLeft').textContent = p.skillPoints;
    for (const [id, cell] of Object.entries(this.treeCells)) {
      const l = p.skillLevel(id);
      const s = SKILLS[id];
      $('.slv', cell).textContent = l ? l : '';
      cell.classList.toggle('learned', l > 0);
      cell.classList.toggle('can', canLearn(p, id));
      cell.classList.toggle('locked', p.level < s.reqLevel || !s.prereq.every((q) => p.skillLevel(q) > 0));
    }
    document.querySelectorAll('.tree-lines path').forEach((path) => {
      path.classList.toggle('on', p.skillLevel(path.dataset.from) > 0);
    });
    document.querySelectorAll('.tree-spent').forEach((e) => {
      const ti = +e.dataset.tree;
      const n = Object.values(SKILLS).filter((s) => s.tree === ti).reduce((a, s) => a + p.skillLevel(s.id), 0);
      e.textContent = n ? `투자 ${n}` : '';
    });
    this.refreshChar();
  }

  refreshChar() {
    const p = this.game.player;
    const body = $('#charsheet .char-body');
    const [lo, hi] = p.weaponRange();
    const strMult = 1 + p.attr.str * 0.015;
    const rows = Object.entries(ATTR_INFO)
      .map(
        ([k, [name, desc]]) =>
          `<div class="attr"><span class="an">${name}</span><span class="av">${p.attr[k]}</span>${p.attrPoints > 0 ? `<button data-attr="${k}">+</button>` : '<span class="nb"></span>'}<span class="ad">${desc}</span></div>`,
      )
      .join('');
    body.innerHTML = `
      <div class="char-top"><div>레벨 <b>${p.level}</b></div><div>경험치 <b>${Math.floor(p.xp)}</b> / ${p.xpNext}</div><div>처치 <b>${p.kills}</b></div></div>
      <div class="attr-points">${p.attrPoints > 0 ? `남은 능력치 포인트: <b>${p.attrPoints}</b>` : ''}</div>
      ${rows}
      <div class="derived">
        <div><span>광선검 피해</span><b>${Math.round(lo * strMult)} - ${Math.round(hi * strMult)}</b></div>
        <div><span>공격 속도</span><b>${Math.round(p.attackSpeed() * 100)}%</b></div>
        <div><span>생명력</span><b>${Math.round(p.hp)} / ${p.maxHp}</b></div>
        <div><span>포스</span><b>${Math.round(p.force)} / ${p.maxForce}</b></div>
        <div><span>볼트 반사 확률</span><b>${Math.round(p.deflectChance() * 100)}%</b></div>
        <div><span>되돌려 보내기</span><b>${Math.round(p.redirectChance() * 100)}%</b></div>
        <div><span>회피 / 치명타</span><b>${Math.round(p.dodgeChance() * 100)}% / ${Math.round(p.critChance() * 100)}%</b></div>
        <div><span>피해 감소 (흉갑)</span><b>${Math.round(p.damageReduction() * 100)}%</b></div>
        <div><span>포스 위력</span><b>×${p.forceMult().toFixed(2)}</b></div>
        <div><span>어둠</span><b>${Math.round(p.darkness)}</b></div>
      </div>`;
    body.querySelectorAll('button[data-attr]').forEach((b) => {
      b.onmousedown = (e) => {
        e.stopPropagation();
        const k = b.dataset.attr;
        if (p.attrPoints <= 0) return;
        p.attr[k]++;
        p.attrPoints--;
        p.recalc();
        this.audio.play('click');
        this.refreshChar();
      };
    });
  }

  // ------------------------------------------------------------------ tooltips

  showTip(html, anchor) {
    this.tip.innerHTML = html;
    this.tip.classList.remove('hidden');
    const r = anchor.getBoundingClientRect();
    const tw = this.tip.offsetWidth;
    const th = this.tip.offsetHeight;
    let x = r.left + r.width / 2 - tw / 2;
    let y = r.top - th - 8;
    if (y < 8) y = r.bottom + 8;
    x = Math.max(8, Math.min(window.innerWidth - tw - 8, x));
    this.tip.style.left = x + 'px';
    this.tip.style.top = y + 'px';
  }

  hideTip() {
    this.tip.classList.add('hidden');
  }

  showSkillTip(id, anchor, slot) {
    if (!id) {
      this.showTip(`<b>빈 슬롯</b><br><span class="dim">스킬 트리(K)에서 스킬을 배우면 자동으로 등록됩니다.</span>`, anchor);
      return;
    }
    const s = SKILLS[id];
    const p = this.game.player;
    const l = p.skillLevel(id);
    const kind = { active: '액티브', passive: '패시브', buff: '버프', summon: '소환' }[s.kind];
    const tree = TREES[s.tree];
    const fmt = (lv) => s.lines(lv, s, p).map((x) => `<div>${x[0]}</div>`).join('');
    let html = `<div class="tt-name" style="color:${tree.color}">${s.name} <span class="tt-en">${s.en}</span></div>
      <div class="tt-kind">${tree.name} · ${kind}${s.dark ? ' · <span class="dark">어둠의 기술</span>' : ''}</div>
      <div class="tt-lore">${s.lore}</div>`;
    if (l) html += `<div class="tt-sec">현재 레벨 ${l}</div>${fmt(l)}`;
    if (l < s.max) html += `<div class="tt-sec">${l ? '다음 레벨' : '레벨 1'}</div><div class="dim">${fmt(l + 1)}</div>`;
    const req = [];
    if (p.level < s.reqLevel) req.push(`캐릭터 레벨 ${s.reqLevel} 필요`);
    for (const q of s.prereq) if (!p.skillLevel(q)) req.push(`선행: ${SKILLS[q].name}`);
    if (req.length) html += `<div class="tt-req">${req.join('<br>')}</div>`;
    if (slot !== undefined) html += `<div class="tt-hint">좌클릭: 사용 · 우클릭: 마우스 우버튼에 지정</div>`;
    this.showTip(html, anchor);
  }

  // ------------------------------------------------------------------ messages

  say(text) {
    this.subQueue = [text];
    this.nextSub();
  }

  nextSub() {
    const text = this.subQueue.shift();
    if (!text) return;
    this.sub = { text, shown: 0, t: 0, hold: 2.2 + text.length * 0.05 };
    this.portrait.talk(Math.min(3, 0.6 + text.length * 0.045));
  }

  banner(name) {
    this.bannerEl.innerHTML = `<span>${name}</span>`;
    this.bannerEl.classList.remove('show');
    void this.bannerEl.offsetWidth;
    this.bannerEl.classList.add('show');
  }

  showDeath() {
    this.death.classList.remove('hidden');
  }

  // ------------------------------------------------------------------ per frame

  update(dt) {
    const g = this.game;
    const p = g.player;

    // orbs
    const hpK = Math.max(0, p.hp / p.maxHp);
    const fpK = Math.max(0, p.force / p.maxForce);
    $('.orb.hp .orb-fill').style.height = hpK * 100 + '%';
    $('.orb.force .orb-fill').style.height = fpK * 100 + '%';

    // portrait
    this.portrait.update(dt, p.darkness, p.dead);
    this.portrait.draw(this.pctx, this.pcanvas.width, this.pcanvas.height);

    // subtitles (typewriter)
    const subEl = $('#subtitle');
    if (this.sub) {
      const s = this.sub;
      s.t += dt;
      s.shown = Math.min(s.text.length, Math.floor(s.t * 40));
      subEl.innerHTML = `<b>아나킨:</b> ${s.text.slice(0, s.shown)}`;
      subEl.style.opacity = 1;
      if (s.t > s.hold) {
        this.sub = null;
        subEl.style.opacity = 0;
      }
    }

    // command card
    for (let i = 0; i < 6; i++) {
      const b = this.slots[i];
      const id = p.hotbar[i];
      const img = $('img', b);
      const want = id ? iconURL(SKILLS[id].icon) : iconURL('empty');
      if (img.dataset.src !== want) {
        img.src = want;
        img.dataset.src = want;
      }
      const cd = id ? p.cooldowns[id] || 0 : 0;
      const total = id && SKILLS[id].cd ? SKILLS[id].cd(p.skillLevel(id)) : 1;
      $('.cd', b).style.background = cd > 0 ? `conic-gradient(rgba(0,0,0,0.72) ${(cd / total) * 360}deg, transparent 0)` : 'none';
      const cost = id && SKILLS[id].cost ? SKILLS[id].cost(p.skillLevel(id)) : 0;
      b.classList.toggle('nofp', !!id && p.force < cost);
      b.classList.toggle('rmb-bound', p.rmbSlot === i && !!id);
      b.classList.toggle('pending', this.pendingSkill === id && !!id);
      $('.lv', b).textContent = id ? p.skillLevel(id) : '';
    }
    $('.lv', this.bactaBtn).textContent = p.bacta;
    this.skillBtn.classList.toggle('glow', p.skillPoints > 0);
    this.charBtn.classList.toggle('glow', p.attrPoints > 0);

    // hover nameplate
    const h = g.hover;
    if (h && !h.dead) {
      this.plate.classList.remove('hidden');
      const nm = $('.np-name', this.plate);
      nm.textContent = h.name;
      nm.className = 'np-name' + (h.elite ? ' elite' : h.team === 'rep' ? ' ally' : '');
      $('.np-bar div', this.plate).style.width = Math.max(0, (h.hp / h.maxHp) * 100) + '%';
      $('.np-sub', this.plate).textContent = h.team === 'cis' ? `레벨 ${h.level}${h.elite ? ' · 정예' : ''}` : h.owner ? '아군 (지휘 중)' : '아군';
    } else this.plate.classList.add('hidden');

    // throttled text updates
    this.textT -= dt;
    if (this.textT <= 0) {
      this.textT = 0.1;
      $('#hpText').textContent = `${Math.ceil(Math.max(0, p.hp))} / ${p.maxHp}`;
      $('#fpText').textContent = `${Math.floor(p.force)} / ${p.maxForce}`;
      $('#lvlText').textContent = `Lv ${p.level}`;
      $('#xpbar div').style.width = (p.xp / p.xpNext) * 100 + '%';
      $('#xpbar span').textContent = `경험치 ${Math.floor(p.xp)} / ${p.xpNext}`;
      $('#dmMark').style.left = p.darkness + '%';
      const pts = [];
      if (p.skillPoints) pts.push(`<span class="glowtxt">스킬 포인트 ${p.skillPoints} (K)</span>`);
      if (p.attrPoints) pts.push(`<span class="glowtxt">능력치 포인트 ${p.attrPoints} (C)</span>`);
      $('#ptsText').innerHTML = pts.join(' · ') || `<span class="dim">${g.region}</span>`;
      const buffs = [];
      for (const [k, b] of Object.entries(p.buffs)) buffs.push(`<span class="buff"><img src="${iconURL(k)}">${Math.ceil(b.t)}</span>`);
      if (p.saberOut) buffs.push(`<span class="buff warn">세이버 비행 중</span>`);
      if (p.darkness >= 60) buffs.push(`<span class="buff dark">어둠의 유혹</span>`);
      $('#buffs').innerHTML = buffs.join('');
      if (this.open.char) this.refreshChar();
    }

    // minimap
    this.miniT -= dt;
    if (this.miniT <= 0) {
      this.miniT = 0.1;
      this.fogT = (this.fogT || 0) - 1;
      if (this.fogT <= 0) {
        this.fogT = 5;
        this.updateFog();
      }
      this.drawMinimap();
      if (this.open.map) this.drawAutomap();
    }
  }

  updateFog() {
    const w = this.game.world;
    if (!this.mapData) {
      const mc = document.createElement('canvas');
      mc.width = w.w;
      mc.height = w.h;
      const mctx = mc.getContext('2d', { willReadFrequently: true });
      mctx.drawImage(this.mapImg, 0, 0);
      this.mapData = mctx.getImageData(0, 0, w.w, w.h).data;
      this.fogData = new ImageData(w.w, w.h);
    }
    const src = this.mapData;
    const d = this.fogData.data;
    for (let i = 0; i < w.w * w.h; i++) {
      const j = i * 4;
      if (w.explored[i]) {
        d[j] = src[j];
        d[j + 1] = src[j + 1];
        d[j + 2] = src[j + 2];
      } else {
        d[j] = src[j] * 0.16;
        d[j + 1] = src[j + 1] * 0.16;
        d[j + 2] = src[j + 2] * 0.2;
      }
      d[j + 3] = 255;
    }
    this.fogCanvas.getContext('2d').putImageData(this.fogData, 0, 0);
  }

  miniK() {
    return 300 / (this.game.world.w * 2);
  }

  miniToWorld(mx, my) {
    const k = this.miniK();
    const a = mx / k - this.game.world.w; // x - y
    const b = my / k; // x + y
    return { x: (a + b) / 2, y: (b - a) / 2 };
  }

  drawMap(ctx, k, ox, oy) {
    const g = this.game;
    const w = g.world;
    const p = g.player;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(k, k, -k, k, ox, oy);
    ctx.drawImage(this.fogCanvas, 0, 0);
    ctx.restore();
    const T = (x, y) => [(x - y) * k + ox, (x + y) * k + oy];
    // camps
    for (const c of w.camps) {
      if (!w.explored[Math.floor(c.y) * w.w + Math.floor(c.x)] || c.cleared) continue;
      const [x, y] = T(c.x, c.y);
      ctx.fillStyle = c.boss ? '#ff3030' : '#c84030';
      ctx.fillRect(x - 3, y - 3, 6, 6);
      ctx.strokeStyle = '#000';
      ctx.strokeRect(x - 3.5, y - 3.5, 7, 7);
    }
    // base marker
    const [bx, by] = T(w.spawn.x, w.spawn.y);
    ctx.strokeStyle = '#5aa0ff';
    ctx.lineWidth = 2;
    ctx.strokeRect(bx - 5, by - 5, 10, 10);
    // units
    for (const u of g.units) {
      if (u.dead || u === p) continue;
      if (u.team === 'cis' && dist(u.x, u.y, p.x, p.y) > 24) continue;
      const [x, y] = T(u.x, u.y);
      ctx.fillStyle = u.team === 'cis' ? '#ff3a2a' : '#3cdc5a';
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    const [px, py] = T(p.x, p.y);
    ctx.fillStyle = Math.floor(g.time * 4) % 2 ? '#ffffff' : '#7dff8a';
    ctx.fillRect(px - 2.5, py - 2.5, 5, 5);
    // camera viewport
    const r = this.renderer;
    const corners = [
      [0, 0],
      [window.innerWidth, 0],
      [window.innerWidth, window.innerHeight - r.consoleH],
      [0, window.innerHeight - r.consoleH],
    ].map(([sx, sy]) => r.screenToWorldPos(sx, sy));
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    corners.forEach((c, i) => {
      const [x, y] = T(c.x, c.y);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.stroke();
  }

  drawMinimap() {
    const ctx = this.mctx;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 300, 300);
    const k = this.miniK();
    this.drawMap(ctx, k, this.game.world.w * k, 0);
  }

  drawAutomap() {
    const c = this.automap;
    const W = window.innerWidth;
    const H = window.innerHeight - this.renderer.consoleH;
    if (c.width !== W || c.height !== H) {
      c.width = W;
      c.height = H;
    }
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    ctx.globalAlpha = 0.75;
    const p = this.game.player;
    const k = 3.2;
    const ox = W / 2 - (p.x - p.y) * k;
    const oy = H / 2 - (p.x + p.y) * k;
    this.drawMap(ctx, k, ox, oy);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffd27f';
    ctx.font = '14px Galmuri11, monospace';
    ctx.fillText('크리스토프시스 외곽 — 자동 지도 (Tab)', 20, 30);
    // POI labels
    ctx.font = '12px Galmuri11, monospace';
    for (const poi of this.game.world.pois) {
      const w = this.game.world;
      if (!w.explored[Math.floor(poi.y) * w.w + Math.floor(poi.x)]) continue;
      const x = (poi.x - poi.y) * k + ox;
      const y = (poi.x + poi.y) * k + oy;
      ctx.fillStyle = '#000';
      ctx.fillText(poi.name, x - 39, y + 1);
      ctx.fillStyle = '#e8e0c8';
      ctx.fillText(poi.name, x - 40, y);
    }
  }
}

