// HUD laid out like the Fallout 1/2 interface but built from Star Wars
// hardware: a weathered Republic hull console along the bottom with holo
// displays (portrait, message log, radar), backlit cockpit keys, a bar of
// Force indicator segments over the skill sockets and amber LED HP / Force
// readouts. Full-screen panels (skills, info, map, settings, Star Cards,
// appearances) use the same hull frame, holo screens and datapads.
import { SKILLS, TREES, TIER_LEVELS, canLearn, isActive } from '../game/skills.js';
import { iconURL } from './icons.js';
import { dist } from '../core/math.js';
import { StarCardsUI } from './starCards.js';
import { AppearanceUI } from './appearance.js';
import { QUESTS } from '../game/quests.js';
import { VOLUMES } from '../core/audio.js';

const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

const ATTR_INFO = {
  str: ['힘', 'STR', '광선검 피해 +1.5% / 포인트'],
  agi: ['민첩', 'AGI', '공격 속도 +0.6%, 볼트 반사 +0.3% / 포인트'],
  vit: ['활력', 'VIT', '생명력 +4 / 포인트'],
  for: ['포스 친화', 'FOR', '포스 +2, 포스 피해 +1.2% / 포인트'],
};
const KIND = { active: '액티브', passive: '패시브', buff: '버프', summon: '소환' };
const FORCE_SEGMENTS = 10;

export class HUD {
  constructor(game, renderer, portrait, audio, photo) {
    this.game = game;
    this.renderer = renderer;
    this.portrait = portrait;
    this.audio = audio;
    this.photo = photo;
    this.root = $('#hud');
    this.pendingSkill = null;
    this.textT = 0;
    this.miniT = 0;
    this.sub = null;
    this.hpChip = 1;
    this.tab = 0;
    this.open = { tree: false, char: false, map: false, settings: false, cards: false, look: false, juke: false, debug: false };
    this.mapImg = renderer.terrain.minimapImage();
    this.fogCanvas = document.createElement('canvas');
    this.fogCanvas.width = game.world.w;
    this.fogCanvas.height = game.world.h;
    this.buildHud();
    this.buildSkillTree();
    this.buildInfo();
    this.buildMap();
    this.buildSettings();
    this.cardsUI = new StarCardsUI(this, game);
    this.lookUI = new AppearanceUI(this, game, audio);
    this.buildMisc();
    this.updateFog();
    this.refreshPanels();

    game.on('say', (text, key, dur, speaker) => this.say(text, dur, speaker));
    game.on('region', (name) => this.banner(name));
    game.on('log', (text, cls) => this.log(text, cls));
    game.on('hurt', () => portrait.hurt());
    game.on('levelup', (lv) => {
      this.refreshPanels();
      this.log(`레벨 업! 레벨 ${lv}`, 'gold');
    });
    game.on('quest', (id, state) => this.log(`임무 ${state === 'accept' ? '수락' : state === 'ready' ? '목표 달성' : '완료'}: ${QUESTS[id].title}`, 'gold'));
    game.on('death', () => !game.duel && setTimeout(() => this.showDeath(), 1600));
  }

  // ================================================================== HUD

  buildHud() {
    const r = this.root;
    // the console along the bottom edge
    const cn = el('div', 'console');
    cn.innerHTML = `
      <div class="cn-portrait monitor"><canvas id="portrait" width="240" height="240"></canvas><div class="ps-eq"><i></i><i></i><i></i><i></i><i></i></div></div>
      <div class="cn-log monitor"><div class="log" id="msgLog"></div></div>
      <div class="cn-btns">
        <button class="fo-btn stims" id="stims" type="button" title="박타 주사기 (Q)"></button>
        <button class="fo-btn" id="saberBtn" type="button" title="광선검 켜기/끄기 (X)"><i></i><span>SABER</span></button>
      </div>
      <div class="cn-center">
        <div class="fp-lights" id="forceSeg">${'<i></i>'.repeat(FORCE_SEGMENTS)}</div>
        <div class="abilities"><div class="ab-row"></div></div>
        <div class="xp-line" title="경험치"><i id="xpFill"></i></div>
      </div>
      <div class="cn-stats">
        <div class="counter hp"><label>HP</label><b id="hpText">0</b></div>
        <div class="hp-bar"><div class="hp-chip"></div><div class="hp-fill"></div></div>
        <div class="counter fp"><label>FP</label><b id="fpText">0</b></div>
        <div class="cn-sub"><span id="lvlText">LV 1</span><div class="dark-meter" title="빛과 어둠"><span>빛</span><div class="dm"><i id="dmMark"></i></div><span>어둠</span></div></div>
      </div>
      <div class="cn-menu ab-menu">
        <button type="button" data-open="map"><i></i>MAP<small>Tab</small></button>
        <button type="button" data-open="char"><i></i>CHA<small>C</small><b class="dot"></b></button>
        <button type="button" data-open="tree"><i></i>SKL<small>K</small><b class="dot"></b></button>
        <button type="button" data-open="cards"><i></i>CRD<small>P</small></button>
        <button type="button" data-open="settings"><i></i>OPT<small>O</small></button>
        <button type="button" data-open="help"><i></i>HELP<small>F1</small></button>
      </div>
      <div class="cn-radar monitor"><canvas id="radar" width="360" height="360"></canvas><div class="radar-region" id="regionText"></div></div>`;
    r.appendChild(cn);
    this.pcanvas = $('#portrait');
    this.pctx = this.pcanvas.getContext('2d');
    this.eq = cn.querySelector('.ps-eq');
    this.logEl = $('#msgLog');
    this.pcanvas.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      this.pokes = (this.pokes || 0) + 1;
      clearTimeout(this.pokeReset);
      this.pokeReset = setTimeout(() => (this.pokes = 0), 4000);
      // his own recorded voice (audio/voice/anakin), else a subtitled line
      const a = this.game.audio;
      const clip = a.voice('portrait');
      if (clip) {
        if (a.speech) a.speech.stop();
        this.portrait.talk(clip.duration);
        this.sub = { t: 0, talk: clip.duration, speaker: '아나킨' };
      } else this.game.say(this.pokes > 4 ? 'pokeAnnoyed' : 'poke');
    });
    cn.addEventListener('mousedown', (e) => e.stopPropagation());
    $('#stims').addEventListener('click', (e) => {
      e.stopPropagation();
      this.game.useBacta();
    });
    $('#saberBtn').addEventListener('click', (e) => {
      e.stopPropagation();
      const p = this.game.player;
      p.setSaber(!p.saberLit);
    });

    const row = cn.querySelector('.ab-row');
    this.slots = [];
    for (let i = 0; i < 6; i++) {
      const b = el('div', 'ab');
      b.innerHTML = `<img alt=""><div class="cd"></div><span class="cdt"></span><span class="ab-key">${i + 1}</span><span class="ab-rmb" title="마우스 우버튼">RMB</span><span class="ab-lv"></span>`;
      b.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        const id = this.game.player.hotbar[i];
        if (e.button === 2) {
          if (id) this.game.player.rmbSlot = i;
          return;
        }
        if (!id) return this.toggle('tree', true);
        this.activateSlot(i);
      });
      b.addEventListener('mouseenter', () => this.showSkillTip(this.game.player.hotbar[i], b, true));
      b.addEventListener('mouseleave', () => this.hideTip());
      row.appendChild(b);
      this.slots.push(b);
    }
    cn.querySelectorAll('.ab-menu button').forEach((b) => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        if (b.dataset.open === 'help') return this.showHelp();
        this.toggle(b.dataset.open);
      });
    });
    this.menuTree = cn.querySelector('[data-open="tree"]');
    this.menuChar = cn.querySelector('[data-open="char"]');

    this.radar = $('#radar');
    this.rctx = this.radar.getContext('2d');
    this.radar.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      if (e.button !== 0) return;
      const rect = this.radar.getBoundingClientRect();
      const w = this.radarToWorld(((e.clientX - rect.left) / rect.width) * 360, ((e.clientY - rect.top) / rect.height) * 360);
      this.game.player.commandMove(w.x, w.y);
      this.renderer.addClickMark(w.x, w.y);
    });

    // buffs above the console, objectives top-right, target plate top-centre
    const bf = el('div', 'buffs');
    bf.id = 'buffs';
    r.appendChild(bf);
    this.objectives = el('div', 'objectives');
    r.appendChild(this.objectives);
    this.target = el('div', 'target-info hidden', '<div class="ti-name"></div><div class="ti-bar"><i></i></div><div class="ti-sub"></div>');
    r.appendChild(this.target);
  }

  /** Add a line to the console's message display. */
  log(text, cls = '') {
    const line = el('div', 'log-line ' + cls);
    line.textContent = text;
    this.logEl.appendChild(line);
    while (this.logEl.children.length > 40) this.logEl.firstChild.remove();
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }

  showHelp() {
    document.getElementById('help').classList.remove('hidden');
    document.getElementById('controls')?.classList.remove('hidden');
  }

  activateSlot(i) {
    const g = this.game;
    const p = g.player;
    const id = p.hotbar[i];
    if (!id) return;
    if (SKILLS[id].target === 'self') {
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

  // ================================================================== overlays

  overlay(id, title, extraHead = '') {
    const o = el('div', 'overlay hidden');
    o.id = id;
    o.innerHTML = `<div class="ov-head"><div class="ov-title">${title}</div>${extraHead}<button class="ov-close" type="button" aria-label="닫기"><kbd>Esc</kbd>닫기</button></div><div class="ov-body"></div>`;
    o.addEventListener('mousedown', (e) => e.stopPropagation());
    const key = { skilltree: 'tree', charsheet: 'char', mapview: 'map', settings: 'settings', starcards: 'cards', appearance: 'look', jukebox: 'juke', debugpanel: 'debug' }[id];
    o.querySelector('.ov-close').addEventListener('click', () => this.toggle(key, false));
    this.root.appendChild(o);
    return o;
  }

  buildSkillTree() {
    const tabs = TREES.map((t, i) => `<button type="button" class="ov-tab" data-tab="${i}" style="--tc:${t.color}">${t.name}<small>${t.en}</small></button>`).join('');
    const o = this.overlay('skilltree', '스킬', `<div class="ov-tabs">${tabs}</div><div class="ov-points">스킬 포인트 <b id="spLeft">0</b></div>`);
    const body = $('.ov-body', o);
    body.innerHTML = `<div class="st-graph"><div class="st-plane"><svg class="st-lines" viewBox="0 0 300 500" preserveAspectRatio="none"></svg></div></div><div class="st-detail"></div>`;
    this.graph = $('.st-graph', body);
    this.plane = $('.st-plane', body);
    this.detail = $('.st-detail', body);
    o.querySelectorAll('.ov-tab').forEach((b) =>
      b.addEventListener('click', () => {
        this.tab = +b.dataset.tab;
        this.renderTree();
      }),
    );
    for (let r = 0; r < 5; r++) {
      const lab = el('div', 'st-tier', `LV ${TIER_LEVELS[r]}`);
      lab.style.top = ((r + 0.5) / 5) * 100 + '%';
      this.plane.appendChild(lab);
    }
    this.treeCells = {};
    const svg = $('.st-lines', this.plane);
    for (const s of Object.values(SKILLS)) {
      const cx = (s.col + 0.5) * 100;
      const cy = (s.row + 0.5) * 100;
      for (const pid of s.prereq) {
        const q = SKILLS[pid];
        const x1 = (q.col + 0.5) * 100;
        const y1 = (q.row + 0.5) * 100;
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        // drop half a row below the prerequisite, then across, then down
        path.setAttribute('d', `M${x1} ${y1} L${x1} ${y1 + 50} L${cx} ${y1 + 50} L${cx} ${cy}`);
        path.setAttribute('vector-effect', 'non-scaling-stroke');
        path.dataset.from = pid;
        path.dataset.tree = s.tree;
        svg.appendChild(path);
      }
      const node = el('button', 'st-node');
      node.type = 'button';
      node.style.left = ((s.col + 0.5) / 3) * 100 + '%';
      node.style.top = ((s.row + 0.5) / 5) * 100 + '%';
      node.style.setProperty('--tc', TREES[s.tree].color);
      node.dataset.tree = s.tree;
      node.innerHTML = `<img src="${iconURL(s.icon)}" alt=""><span class="st-lv"></span>${s.dark ? '<span class="st-dark">어둠</span>' : ''}<span class="st-name">${s.name}</span>`;
      node.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        const p = this.game.player;
        if (e.button === 2) {
          if (p.skillLevel(s.id) && isActive(s.id)) {
            let i = p.hotbar.indexOf(s.id);
            if (i < 0) {
              i = p.hotbar.indexOf(null);
              if (i < 0) i = p.rmbSlot;
              p.hotbar[i] = s.id;
            }
            p.rmbSlot = i;
            this.audio.play('click');
            this.selectSkill(s.id);
          }
          return;
        }
        // touch: first tap selects, second tap learns. Mouse: click learns.
        const touch = document.body.classList.contains('touch');
        if (touch && this.selSkill !== s.id) return this.selectSkill(s.id);
        this.learn(s.id);
      });
      node.addEventListener('mouseenter', () => {
        if (!document.body.classList.contains('touch')) this.selectSkill(s.id);
      });
      this.plane.appendChild(node);
      this.treeCells[s.id] = node;
    }
    this.selectSkill('flurry');
  }

  learn(id) {
    const p = this.game.player;
    if (canLearn(p, id)) {
      p.learn(id);
      this.audio.play('levelup');
      this.refreshPanels();
    } else this.audio.play('deny');
    this.selectSkill(id);
  }

  renderTree() {
    const o = $('#skilltree');
    o.querySelectorAll('.ov-tab').forEach((b) => b.classList.toggle('on', +b.dataset.tab === this.tab));
    o.style.setProperty('--tc', TREES[this.tab].color);
    for (const [id, n] of Object.entries(this.treeCells)) n.hidden = SKILLS[id].tree !== this.tab;
    o.querySelectorAll('.st-lines path').forEach((path) => (path.style.display = +path.dataset.tree === this.tab ? '' : 'none'));
    if (!this.selSkill || SKILLS[this.selSkill].tree !== this.tab) {
      const first = Object.values(SKILLS).find((s) => s.tree === this.tab);
      this.selectSkill(first.id);
    }
  }

  selectSkill(id) {
    this.selSkill = id;
    this.hoverSkill = id;
    for (const [k, c] of Object.entries(this.treeCells)) c.classList.toggle('sel', k === id);
    const s = SKILLS[id];
    const p = this.game.player;
    const l = p.skillLevel(id);
    const tree = TREES[s.tree];
    const fmt = (lv) => s.lines(lv, s, p).map((x) => `<li>${x[0]}</li>`).join('');
    const req = [];
    if (p.level < s.reqLevel) req.push(`캐릭터 레벨 ${s.reqLevel} 필요`);
    for (const q of s.prereq) if (!p.skillLevel(q)) req.push(`선행 스킬: ${SKILLS[q].name}`);
    const slot = p.hotbar.indexOf(id);
    const active = isActive(id);
    this.detail.style.setProperty('--tc', tree.color);
    this.detail.innerHTML = `
      <div class="sd-icon"><img src="${iconURL(s.icon)}" alt=""></div>
      <div class="sd-kind">${tree.name} · ${KIND[s.kind]}${s.dark ? ' · <em>어둠의 기술</em>' : ''}</div>
      <h3 class="sd-name">${s.name}</h3>
      <div class="sd-en">${s.en.toUpperCase()}</div>
      <div class="sd-rank"><b>${l}</b> / ${s.max}</div>
      <p class="sd-lore">${s.lore}</p>
      ${l ? `<div class="sd-sec">현재</div><ul>${fmt(l)}</ul>` : ''}
      ${l < s.max ? `<div class="sd-sec">${l ? '다음 단계' : '1단계'}</div><ul class="next">${fmt(l + 1)}</ul>` : ''}
      ${req.length ? `<div class="sd-req">${req.join('<br>')}</div>` : ''}
      <div class="sd-actions">
        <button type="button" class="sd-learn" ${canLearn(p, id) ? '' : 'disabled'}>${l ? '강화' : '습득'} <small>스킬 포인트 1</small></button>
        ${
          active && l
            ? `<div class="sd-slots"><span>단축키${slot >= 0 ? ` · 현재 ${slot + 1}번` : ''}</span>${[0, 1, 2, 3, 4, 5].map((i) => `<button type="button" data-slot="${i}" class="${slot === i ? 'on' : ''}">${i + 1}</button>`).join('')}</div>`
            : ''
        }
      </div>
      <div class="sd-hint desktop-only">클릭: 습득/강화 · 우클릭: 마우스 우버튼 스킬로 지정 · 1~6: 단축키</div>
      <div class="sd-hint touch-only">한 번 탭: 선택 · 다시 탭 또는 버튼: 습득</div>`;
    $('.sd-learn', this.detail).addEventListener('click', () => this.learn(id));
    this.detail.querySelectorAll('.sd-slots button').forEach((b) =>
      b.addEventListener('click', () => {
        const i = +b.dataset.slot;
        const prev = p.hotbar.indexOf(id);
        if (prev >= 0) p.hotbar[prev] = p.hotbar[i];
        p.hotbar[i] = id;
        this.audio.play('click');
        this.selectSkill(id);
      }),
    );
  }

  buildInfo() {
    const o = this.overlay('charsheet', '정보', '<button class="ov-act" type="button" data-look>외형 갤러리 <kbd>V</kbd></button>');
    $('[data-look]', o).addEventListener('click', () => this.toggle('look', true));
    this.infoBody = $('.ov-body', o);
  }

  buildMap() {
    const o = this.overlay('mapview', '지도', '<div class="ov-sub">크리스토프시스 외곽</div>');
    const body = $('.ov-body', o);
    body.innerHTML = `<canvas class="map-canvas"></canvas>
      <div class="map-legend"><span><i class="lg-me"></i>아나킨</span><span><i class="lg-base"></i>전진 기지</span><span><i class="lg-camp"></i>드로이드 거점</span><span><i class="lg-boss"></i>드로이드 공장</span><span><i class="lg-ally"></i>아군</span><span><i class="lg-enemy"></i>적</span></div>`;
    this.mapCanvas = $('.map-canvas', body);
  }

  buildSettings() {
    const o = this.overlay('settings', '설정');
    const body = $('.ov-body', o);
    body.innerHTML = `
      <section class="set-card">
        <h4>초상화</h4>
        <div class="set-portrait">
          <canvas id="setPortrait" width="320" height="320"></canvas>
          <div class="set-controls">
            <p class="set-note">원하는 사진(예: 아나킨 사진)을 고르면 HUD 초상화가 됩니다. 사진은 <b>이 기기에만</b> 저장되고 어디에도 업로드되지 않습니다.</p>
            <label class="btn-file">사진 선택<input type="file" id="photoInput" accept="image/*"></label>
            <button type="button" class="btn-ghost" id="photoReset">기본 초상화로</button>
            <div class="set-crop">
              <label>확대 <input type="range" id="cropZoom" min="1" max="4" step="0.05"></label>
              <label>좌우 <input type="range" id="cropX" min="0" max="1" step="0.01"></label>
              <label>상하 <input type="range" id="cropY" min="0" max="1" step="0.01"></label>
            </div>
            <div class="set-status" id="photoStatus"></div>
          </div>
        </div>
      </section>
      <section class="set-card">
        <h4>소리</h4>
        <label class="set-toggle"><input type="checkbox" id="soundOn"> 소리 켜기 <kbd>M</kbd></label>
        <label class="set-toggle"><input type="checkbox" id="speechOn"> 아나킨 대사 음성 <small id="speechVoice"></small></label>
        <div class="set-vol">${VOLUMES.map(([k, l]) => `<label><span>${l}</span><input type="range" min="0" max="100" step="1" data-vol="${k}"><b></b></label>`).join('')}</div>
        <p class="set-note">이 기기에 저장됩니다. 대사 음성·효과음 파일을 직접 넣는 방법은 <code>public/audio/README.md</code>를 참고하세요.</p>
      </section>
      <section class="set-card">
        <h4>화면 효과</h4>
        <label class="set-toggle"><input type="checkbox" data-post="grade"> 행성별 색 보정 (LUT)</label>
        <label class="set-toggle"><input type="checkbox" data-post="bloom"> 빛 번짐 (블룸)</label>
        <label class="set-toggle"><input type="checkbox" data-post="vignette"> 비네팅</label>
        <label class="set-toggle"><input type="checkbox" data-post="grain"> 필름 그레인</label>
        <label class="set-toggle"><input type="checkbox" data-post="fps"> FPS 표시</label>
        <p class="set-note" id="postNote">이 기기에 저장됩니다. 느린 기기에서는 끄면 가벼워집니다.</p>
      </section>
      <section class="set-card">
        <h4>개발자</h4>
        <p class="set-note">스킬 · 음악 해금, 무적, 순간 이동 같은 테스트용 기능입니다. 언제든 <kbd>\`</kbd> 키로도 열 수 있습니다.</p>
        <button type="button" class="btn-ghost" id="openDebug">디버그 모드</button>
      </section>
      <section class="set-card">
        <h4>화면</h4>
        <p class="set-note">확대·축소: 휴대폰은 두 손가락, PC는 마우스 휠 또는 <kbd>-</kbd> <kbd>=</kbd> (<kbd>0</kbd> 기본). 전체 화면: <kbd>F</kbd></p>
        <button type="button" class="btn-ghost" id="openHelp">조작법 보기</button>
      </section>`;
    this.setCanvas = $('#setPortrait');
    this.setCtx = this.setCanvas.getContext('2d');
    const input = $('#photoInput');
    input.addEventListener('change', async () => {
      const f = input.files && input.files[0];
      if (!f) return;
      $('#photoStatus').textContent = '불러오는 중…';
      try {
        await this.photo.fromFile(f);
        $('#photoStatus').textContent = '적용됨 · 이 기기에 저장되었습니다';
      } catch {
        $('#photoStatus').textContent = '이 파일은 열 수 없습니다. JPG/PNG 사진을 골라 주세요.';
      }
      input.value = '';
      this.syncCropInputs();
    });
    $('#photoReset').addEventListener('click', async () => {
      await this.photo.reset();
      $('#photoStatus').textContent = '기본 초상화로 되돌렸습니다';
      this.syncCropInputs();
    });
    for (const [id, k] of [['cropZoom', 'zoom'], ['cropX', 'x'], ['cropY', 'y']]) {
      $('#' + id).addEventListener('input', (e) => this.photo.setCrop({ [k]: +e.target.value }));
    }
    $('#soundOn').addEventListener('change', (e) => {
      if (e.target.checked === this.audio.muted) this.audio.toggleMute();
    });
    o.querySelectorAll('[data-vol]').forEach((r) => {
      const show = () => (r.nextElementSibling.textContent = r.value);
      r.value = Math.round(this.audio.vol[r.dataset.vol] * 100);
      show();
      r.addEventListener('input', () => {
        this.audio.setVolume(r.dataset.vol, r.value / 100);
        show();
      });
    });
    const sp = this.audio.speech;
    const spOn = $('#speechOn');
    spOn.checked = !!(sp && sp.on);
    spOn.disabled = !(sp && sp.available);
    spOn.addEventListener('change', (e) => sp && sp.setOn(e.target.checked));
    $('#speechVoice').textContent = !sp || !sp.available ? '(이 브라우저는 음성 합성을 지원하지 않음)' : '';
    const post = this.renderer.post;
    o.querySelectorAll('[data-post]').forEach((cb) => {
      cb.checked = !!post.opts[cb.dataset.post];
      if (!post.ok && cb.dataset.post !== 'fps') cb.disabled = true;
      cb.addEventListener('change', () => post.set(cb.dataset.post, cb.checked));
    });
    if (!post.ok) $('#postNote').textContent = '이 기기에서는 WebGL을 쓸 수 없어 화면 효과가 꺼져 있습니다.';
    $('#openDebug').addEventListener('click', () => this.toggle('debug', true));
    $('#openHelp').addEventListener('click', () => {
      this.toggle('settings', false);
      document.getElementById('help').classList.remove('hidden');
    });
  }

  syncCropInputs() {
    const c = this.portrait.crop;
    $('#cropZoom').value = c.zoom;
    $('#cropX').value = c.x;
    $('#cropY').value = c.y;
    const has = !!this.portrait.photo;
    $('.set-crop').classList.toggle('disabled', !has);
    $('#cropZoom').disabled = $('#cropX').disabled = $('#cropY').disabled = !has;
    $('#soundOn').checked = !this.audio.muted;
  }

  buildMisc() {
    this.tip = el('div', 'tooltip hidden');
    this.root.appendChild(this.tip);
    this.bannerEl = el('div', 'banner');
    this.root.appendChild(this.bannerEl);
    this.death = el(
      'div',
      'death hidden',
      `<div class="death-kicker">ANAKIN SKYWALKER</div><div class="death-title">쓰러졌습니다</div><div class="death-sub">포스와 함께하길.</div><button type="button">전진 기지에서 재개</button>`,
    );
    this.root.appendChild(this.death);
    $('button', this.death).onclick = (e) => {
      e.stopPropagation();
      this.death.classList.add('hidden');
      this.game.respawnPlayer();
    };
  }

  toggle(which, force) {
    const v = force ?? !this.open[which];
    if (v) for (const k of Object.keys(this.open)) if (k !== which && this.open[k]) this.toggle(k, false);
    this.open[which] = v;
    const ids = { tree: '#skilltree', char: '#charsheet', map: '#mapview', settings: '#settings', cards: '#starcards', look: '#appearance', juke: '#jukebox', debug: '#debugpanel' };
    $(ids[which]).classList.toggle('hidden', !v);
    document.body.classList.toggle('overlay-open', Object.values(this.open).some(Boolean));
    if (v) {
      this.refreshPanels();
      if (which === 'tree') this.renderTree();
      if (which === 'map') this.drawMapView();
      if (which === 'settings') this.syncCropInputs();
      if (which === 'cards') this.cardsUI.render();
      if (which === 'look') this.lookUI.open();
      if (which === 'juke') this.jukeUI.open();
      if (which === 'debug') this.debugUI.render();
    } else {
      this.hideTip();
      if (which === 'look') this.lookUI.close();
      if (which === 'juke') this.jukeUI.close();
    }
    this.audio.play('click');
  }

  closeAll() {
    for (const k of Object.keys(this.open)) if (this.open[k]) this.toggle(k, false);
    this.cancelTargeting();
  }

  refreshPanels() {
    const p = this.game.player;
    $('#spLeft').textContent = p.skillPoints;
    for (const [id, n] of Object.entries(this.treeCells)) {
      const l = p.skillLevel(id);
      const s = SKILLS[id];
      $('.st-lv', n).textContent = l ? l : '';
      n.classList.toggle('learned', l > 0);
      n.classList.toggle('can', canLearn(p, id));
      n.classList.toggle('locked', p.level < s.reqLevel || !s.prereq.every((q) => p.skillLevel(q) > 0));
    }
    document.querySelectorAll('.st-lines path').forEach((path) => path.classList.toggle('on', p.skillLevel(path.dataset.from) > 0));
    document.querySelectorAll('#skilltree .ov-tab').forEach((b) => {
      const ti = +b.dataset.tab;
      b.classList.toggle('avail', Object.values(SKILLS).some((s) => s.tree === ti && canLearn(p, s.id)));
    });
    if (this.selSkill && this.open.tree) this.selectSkill(this.selSkill);
    this.refreshChar();
  }

  refreshChar() {
    const p = this.game.player;
    const [lo, hi] = p.weaponRange();
    const strMult = 1 + p.attr.str * 0.015;
    const attrs = Object.entries(ATTR_INFO)
      .map(
        ([k, [name, en, desc]]) => `
        <div class="at-row"><div class="at-label"><span class="at-en">${en}</span>${name}</div><div class="at-val">${p.attr[k]}</div>
        <button type="button" data-attr="${k}" ${p.attrPoints > 0 ? '' : 'disabled'} aria-label="${name} 올리기">+</button><div class="at-desc">${desc}</div></div>`,
      )
      .join('');
    const stat = (label, v) => `<div class="ds-row"><span>${label}</span><b>${v}</b></div>`;
    this.infoBody.innerHTML = `
      <div class="info-grid">
        <section class="info-id">
          <div class="info-name">아나킨 스카이워커</div>
          <div class="info-title">제다이 기사 · 501군단 장군</div>
          <div class="info-level"><span>LV</span><b>${p.level}</b></div>
          <div class="info-xp"><i style="width:${(p.xp / p.xpNext) * 100}%"></i></div>
          <div class="info-xpt">경험치 ${Math.floor(p.xp)} / ${p.xpNext} · 처치 ${p.kills}</div>
          <div class="info-xpt">크레딧 ${p.credits} · 집속 렌즈 ${p.upgrades.lens}/5 · 보강판 ${p.upgrades.plate}/5</div>
        </section>
        <section class="info-attrs">
          <div class="info-h">능력치 ${p.attrPoints > 0 ? `<span class="pts">남은 포인트 ${p.attrPoints}</span>` : ''}</div>
          ${attrs}
        </section>
        <section class="info-stats">
          <div class="info-h">전투 능력</div>
          ${stat('광선검 피해', `${Math.round(lo * strMult)} – ${Math.round(hi * strMult)}`)}
          ${stat('공격 속도', `${Math.round(p.attackSpeed() * 100)}%`)}
          ${stat('생명력', `${Math.round(p.hp)} / ${p.maxHp}`)}
          ${stat('포스', `${Math.round(p.force)} / ${p.maxForce}`)}
          ${stat('볼트 반사', `${Math.round(p.deflectChance() * 100)}%`)}
          ${stat('되돌려 보내기', `${Math.round(p.redirectChance() * 100)}%`)}
          ${stat('회피 / 치명타', `${Math.round(p.dodgeChance() * 100)}% / ${Math.round(p.critChance() * 100)}%`)}
          ${stat('피해 감소', `${Math.round(p.damageReduction() * 100)}%`)}
          ${stat('포스 위력', `×${p.forceMult().toFixed(2)}`)}
          ${stat('어둠', Math.round(p.darkness))}
        </section>
      </div>`;
    this.infoBody.querySelectorAll('button[data-attr]').forEach((b) => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        if (p.attrPoints <= 0) return;
        p.attr[b.dataset.attr]++;
        p.attrPoints--;
        p.recalc();
        this.audio.play('click');
        this.refreshChar();
      });
    });
  }

  // ================================================================== tooltips

  showTip(html, anchor) {
    this.tip.innerHTML = html;
    this.tip.classList.remove('hidden');
    const r = anchor.getBoundingClientRect();
    const tw = this.tip.offsetWidth;
    const th = this.tip.offsetHeight;
    let x = r.left + r.width / 2 - tw / 2;
    let y = r.top - th - 10;
    if (y < 8) y = r.bottom + 10;
    x = Math.max(8, Math.min(window.innerWidth - tw - 8, x));
    this.tip.style.left = x + 'px';
    this.tip.style.top = y + 'px';
  }

  hideTip() {
    this.tip.classList.add('hidden');
  }

  showSkillTip(id, anchor, isSlot) {
    if (!id) {
      this.showTip(`<div class="tt-name">빈 슬롯</div><div class="tt-dim">스킬(K)에서 액티브 스킬을 배우면 자동으로 들어갑니다.</div>`, anchor);
      return;
    }
    const s = SKILLS[id];
    const p = this.game.player;
    const l = p.skillLevel(id);
    const lines = s.lines(Math.max(1, l), s, p).map((x) => `<div>${x[0]}</div>`).join('');
    this.showTip(
      `<div class="tt-name" style="color:${TREES[s.tree].color}">${s.name} <span class="tt-lv">${l}/${s.max}</span></div>${lines}${isSlot ? '<div class="tt-dim">클릭: 사용 · 우클릭: 마우스 우버튼에 지정</div>' : ''}`,
      anchor,
    );
  }

  // ================================================================== messages

  /** A spoken line goes to the message monitor; `dur` = voice clip length. */
  say(text, dur = null, speaker = '아나킨') {
    const talk = dur ?? Math.min(3, 0.6 + text.length * 0.045);
    this.sub = { t: 0, talk, speaker };
    this.log(`${speaker}: ${text}`, speaker === '아나킨' ? 'say' : 'say other');
    if (speaker === '아나킨') this.portrait.talk(talk);
  }

  banner(name) {
    const g = this.game;
    const kicker = g.duel ? (/무스타파/.test(name) ? 'MUSTAFAR' : 'GEONOSIS') : g.place === 'hub' ? 'CORUSCANT' : 'CHRISTOPHSIS';
    this.bannerEl.innerHTML = `<div class="bn-kicker">${kicker}</div><div class="bn-name">${name}</div>`;
    this.bannerEl.classList.remove('show');
    void this.bannerEl.offsetWidth;
    this.bannerEl.classList.add('show');
    this.log(`· ${name}`, 'sys');
  }

  showDeath() {
    this.death.classList.remove('hidden');
  }

  // ================================================================== per frame

  update(dt) {
    const g = this.game;
    const p = g.player;

    // health with a trailing damage chip, Force segments
    const hpK = Math.max(0, p.hp / p.maxHp);
    this.hpChip = this.hpChip > hpK ? Math.max(hpK, this.hpChip - dt * 0.35) : hpK;
    $('.hp-fill').style.width = hpK * 100 + '%';
    $('.hp-chip').style.width = this.hpChip * 100 + '%';
    $('.hp-bar').classList.toggle('low', hpK < 0.25);
    // Force as a bar of indicator segments
    const fpK = Math.max(0, p.force / p.maxForce) * FORCE_SEGMENTS;
    const segs = $('#forceSeg').children;
    for (let i = 0; i < FORCE_SEGMENTS; i++) segs[i].className = fpK >= i + 1 ? 'on' : fpK > i ? 'half' : '';

    // portrait + voice equaliser
    this.portrait.setScene(/드로이드 공장|격전지/.test(g.region) ? 'hangar' : 'corridor');
    this.portrait.update(dt, p.darkness, p.dead);
    this.portrait.draw(this.pctx, this.pcanvas.width, this.pcanvas.height);
    if (this.open.settings) this.portrait.draw(this.setCtx, 320, 320);
    const talking = this.sub && this.sub.speaker === '아나킨' && this.sub.t < this.sub.talk;
    this.eq.classList.toggle('on', !!talking);
    if (talking) for (const b of this.eq.children) b.style.height = 20 + Math.random() * 80 + '%';

    if (this.sub && (this.sub.t += dt) > this.sub.talk) this.sub = null;

    // ability cards
    for (let i = 0; i < 6; i++) {
      const b = this.slots[i];
      const id = p.hotbar[i];
      const img = b.firstChild;
      const want = id ? iconURL(SKILLS[id].icon) : '';
      if (img.dataset.src !== want) {
        img.src = want || 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
        img.dataset.src = want;
      }
      b.classList.toggle('empty', !id);
      const cd = id ? p.cooldowns[id] || 0 : 0;
      const total = id && SKILLS[id].cd ? SKILLS[id].cd(p.skillLevel(id)) || 1 : 1;
      b.children[1].style.background = cd > 0 ? `conic-gradient(rgba(6,8,12,0.78) ${(cd / total) * 360}deg, transparent 0)` : 'none';
      b.children[2].textContent = cd > 0 ? (cd < 1 ? cd.toFixed(1) : Math.ceil(cd)) : '';
      const cost = id && SKILLS[id].cost ? SKILLS[id].cost(p.skillLevel(id)) : 0;
      b.classList.toggle('nofp', !!id && p.force < cost);
      b.classList.toggle('rmb', p.rmbSlot === i && !!id);
      b.classList.toggle('pending', this.pendingSkill === id && !!id);
      b.lastChild.textContent = id ? p.skillLevel(id) : '';
    }
    this.menuTree.classList.toggle('alert', p.skillPoints > 0);
    this.menuChar.classList.toggle('alert', p.attrPoints > 0);

    // target info (hovered / engaged unit)
    const h = g.hover;
    if (h && !h.dead) {
      this.target.classList.remove('hidden');
      const nm = $('.ti-name', this.target);
      nm.textContent = h.name;
      this.target.className = 'target-info' + (h.elite ? ' elite' : h.team === 'rep' ? ' ally' : '');
      $('.ti-bar i', this.target).style.width = Math.max(0, (h.hp / h.maxHp) * 100) + '%';
      $('.ti-sub', this.target).textContent = h.npc ? `${h.title} · 대화 (E / 클릭)` : h.team === 'cis' ? `LV ${h.level}${h.elite ? ' · 정예' : ''}` : h.owner ? '아군 · 지휘 중' : '아군';
    } else this.target.classList.add('hidden');

    // throttled text
    this.textT -= dt;
    if (this.textT <= 0) {
      this.textT = 0.12;
      $('#hpText').textContent = `${Math.ceil(Math.max(0, p.hp))}`;
      $('#fpText').textContent = `${Math.floor(p.force)}`;
      $('#lvlText').textContent = `LV ${p.level}`;
      $('#xpFill').style.width = (p.xp / p.xpNext) * 100 + '%';
      $('#dmMark').style.left = p.darkness + '%';
      $('#stims').innerHTML = `<i></i><span>BACTA</span><em>${[0, 1, 2, 3, 4].map((k) => `<b class="${k < p.bacta ? 'on' : ''}"></b>`).join('')}</em>`;
      $('#saberBtn').classList.toggle('on', p.saberLit && !p.saberOut);
      $('#regionText').textContent = g.region;
      const buffs = [];
      for (const [k, b] of Object.entries(p.buffs)) buffs.push(`<span class="buff"><img src="${iconURL(k)}" alt="">${Math.ceil(b.t)}s</span>`);
      if (p.saberOut) buffs.push('<span class="buff info">광선검 회수 중</span>');
      if (p.darkness >= 60) buffs.push('<span class="buff dark">어둠의 유혹</span>');
      if (p.skillPoints) buffs.push(`<span class="buff gold">스킬 포인트 ${p.skillPoints} <kbd>K</kbd></span>`);
      if (p.attrPoints) buffs.push(`<span class="buff gold">능력치 포인트 ${p.attrPoints} <kbd>C</kbd></span>`);
      $('#buffs').innerHTML = buffs.join('');
      this.updateObjectives();
      if (this.open.char) this.refreshChar();
    }

    // radar / map
    this.miniT -= dt;
    if (this.miniT <= 0) {
      this.miniT = 0.08;
      this.fogT = (this.fogT || 0) - 1;
      if (this.fogT <= 0) {
        this.fogT = 6;
        this.updateFog();
      }
      this.drawRadar();
      if (this.open.map) this.drawMapView();
    }
  }

  updateObjectives() {
    const g = this.game;
    if (g.duel) return; // the Movie Duels have no campaign objectives
    const p = g.player;
    const front = g.front;
    const camps = front.camps.filter((c) => !c.boss);
    const boss = front.camps.find((c) => c.boss);
    const away = g.world !== front; // in the city hub: no arrow, a pointer to the starfighter
    const cleared = camps.filter((c) => c.cleared).length;
    let near = null;
    let nd = Infinity;
    for (const c of away ? [] : front.camps) {
      if (c.cleared) continue;
      const d = dist(p.x, p.y, c.x, c.y);
      if (d < nd) {
        nd = d;
        near = c;
      }
    }
    let arrow = '';
    if (near) {
      // screen-space direction of the camp
      const dx = near.x - p.x;
      const dy = near.y - p.y;
      const ang = (Math.atan2((dx + dy) * 0.5, dx - dy) * 180) / Math.PI;
      arrow = `<li class="ob-near"><span class="ob-arrow" style="transform:rotate(${ang.toFixed(0)}deg)">➜</span>가장 가까운 ${near.boss ? '공장' : '거점'} <b>${Math.round(nd)}m</b>${near.level ? ` · LV ${near.level}` : ''}</li>`;
    }
    const quests = g.quests
      .tracked()
      .map(({ id, q, s }) => `<li class="ob-quest ${s.state === 'ready' ? 'ready' : ''}"><i></i>${q.title} <b>${s.state === 'ready' ? '보고하기' : g.quests.progress(id)}</b></li>`)
      .join('');
    this.objectives.innerHTML = `<div class="ob-h">목표</div><ul>
      <li class="${cleared === camps.length ? 'done' : ''}"><i></i>드로이드 거점 소탕 <b>${cleared} / ${camps.length}</b></li>
      <li class="${boss && boss.cleared ? 'done' : ''}"><i></i>북쪽의 드로이드 공장 파괴</li>
      ${quests}${arrow}${away ? '<li class="ob-near"><i></i>제다이 착륙장의 스타파이터로 크리스토프시스 출격</li>' : ''}</ul>`;
  }

  // ================================================================== map drawing

  /** Anakin changed place: rebuild the map images. */
  onWorld() {
    this.mapImg = this.renderer.terrain.minimapImage();
    this.mapData = null;
    this.updateFog();
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
      const seen = w.explored[i];
      // cool, desaturated holo-map tones
      const l = (src[j] * 0.3 + src[j + 1] * 0.5 + src[j + 2] * 0.2) / 255;
      const k = seen ? 1 : 0.18;
      d[j] = (40 + l * 120) * k;
      d[j + 1] = (60 + l * 140) * k;
      d[j + 2] = (80 + l * 150) * k;
      d[j + 3] = 255;
    }
    this.fogCanvas.getContext('2d').putImageData(this.fogData, 0, 0);
  }

  /** Draw the iso map with markers; T maps world → canvas. */
  drawMap(ctx, k, ox, oy, opts = {}) {
    const g = this.game;
    const w = g.world;
    const p = g.player;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(k, k * 0.5, -k, k * 0.5, ox, oy);
    ctx.drawImage(this.fogCanvas, 0, 0);
    ctx.restore();
    const T = (x, y) => [(x - y) * k + ox, (x + y) * k * 0.5 + oy];
    const s = opts.markerScale || 1;
    for (const c of w.camps) {
      if (!w.explored[Math.floor(c.y) * w.w + Math.floor(c.x)] && !c.boss) continue;
      if (c.cleared) continue;
      const [x, y] = T(c.x, c.y);
      ctx.strokeStyle = c.boss ? '#ff5a4a' : '#ff8a6a';
      ctx.lineWidth = 2 * s;
      ctx.beginPath();
      ctx.moveTo(x, y - 6 * s);
      ctx.lineTo(x + 6 * s, y);
      ctx.lineTo(x, y + 6 * s);
      ctx.lineTo(x - 6 * s, y);
      ctx.closePath();
      ctx.stroke();
    }
    const [bx, by] = T(w.spawn.x, w.spawn.y);
    ctx.fillStyle = '#5cc8ff';
    ctx.fillRect(bx - 4 * s, by - 4 * s, 8 * s, 8 * s);
    for (const u of g.units) {
      if (u.dead || u === p) continue;
      if (u.team === 'cis' && dist(u.x, u.y, p.x, p.y) > 26) continue;
      const [x, y] = T(u.x, u.y);
      ctx.fillStyle = u.team === 'cis' ? '#ff4a3a' : '#6fd0ff';
      ctx.beginPath();
      ctx.arc(x, y, 2.2 * s, 0, Math.PI * 2);
      ctx.fill();
    }
    // Anakin: arrow in his facing direction (screen space)
    const [px, py] = T(p.x, p.y);
    const fx = Math.cos(p.facing) - Math.sin(p.facing);
    const fy = (Math.cos(p.facing) + Math.sin(p.facing)) * 0.5;
    const a = Math.atan2(fy, fx);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(a);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(7 * s, 0);
    ctx.lineTo(-5 * s, -5 * s);
    ctx.lineTo(-2 * s, 0);
    ctx.lineTo(-5 * s, 5 * s);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  radarScale() {
    return 2.6;
  }

  radarToWorld(cx, cy) {
    const p = this.game.player;
    const k = this.radarScale();
    const a = (cx - 180) / k; // x - y
    const b = (cy - 180) / (k * 0.5); // x + y
    return { x: p.x + (a + b) / 2, y: p.y + (b - a) / 2 };
  }

  drawRadar() {
    const ctx = this.rctx;
    const p = this.game.player;
    const k = this.radarScale();
    ctx.clearRect(0, 0, 360, 360);
    ctx.save();
    ctx.beginPath();
    ctx.arc(180, 180, 172, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = 'rgba(6,10,16,0.85)';
    ctx.fillRect(0, 0, 360, 360);
    this.drawMap(ctx, k, 180 - (p.x - p.y) * k, 180 - (p.x + p.y) * k * 0.5, { markerScale: 1.6 });
    // rings + sweep
    ctx.strokeStyle = 'rgba(160,210,255,0.18)';
    ctx.lineWidth = 2;
    for (const r of [60, 120]) {
      ctx.beginPath();
      ctx.arc(180, 180, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    const sw = (this.game.time * 1.4) % (Math.PI * 2);
    const grd = ctx.createConicGradient ? ctx.createConicGradient(sw, 180, 180) : null;
    if (grd) {
      grd.addColorStop(0, 'rgba(120,200,255,0.18)');
      grd.addColorStop(0.12, 'rgba(120,200,255,0)');
      grd.addColorStop(1, 'rgba(120,200,255,0)');
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, 360, 360);
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(235,242,250,0.55)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(180, 180, 172, 0, Math.PI * 2);
    ctx.stroke();
    // ticks
    ctx.strokeStyle = 'rgba(235,242,250,0.5)';
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const r0 = i % 6 === 0 ? 156 : 164;
      ctx.beginPath();
      ctx.moveTo(180 + Math.cos(a) * r0, 180 + Math.sin(a) * r0);
      ctx.lineTo(180 + Math.cos(a) * 172, 180 + Math.sin(a) * 172);
      ctx.stroke();
    }
  }

  drawMapView() {
    const c = this.mapCanvas;
    const W = c.clientWidth || window.innerWidth;
    const H = c.clientHeight || window.innerHeight;
    const dpr = window.devicePixelRatio || 1;
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
    }
    const ctx = c.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.scale(dpr, dpr);
    const w = this.game.world;
    // fit the whole map diamond
    const k = Math.min(W / (w.w * 2) , H / w.h) * 0.95;
    const ox = W / 2 - 0 * k;
    const oy = (H - w.h * k) / 2;
    this.drawMap(ctx, k, ox, oy, { markerScale: 1.2 });
    ctx.font = '12px Galmuri11, sans-serif';
    ctx.textAlign = 'center';
    for (const poi of w.pois) {
      if (!w.explored[Math.floor(poi.y) * w.w + Math.floor(poi.x)]) continue;
      const x = (poi.x - poi.y) * k + ox;
      const y = (poi.x + poi.y) * k * 0.5 + oy;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillText(poi.name, x + 1, y - 9);
      ctx.fillStyle = '#eaf2fa';
      ctx.fillText(poi.name, x, y - 10);
    }
  }
}
