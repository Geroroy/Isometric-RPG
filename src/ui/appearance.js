// Appearance gallery after Star Wars Battlefront II's hero appearances: the
// outfits on the left with their rarity, the outfit's sprite collection in the
// middle (every animation in eight directions, all playing, blades glowing as
// in game) and a datapad card with the era, description and what the look
// includes. An outfit's sprites are baked the first time it is shown, then
// cached on the device, so equipping it is instant.
import { bakeSkin } from '../gfx/assets.js';

const KEY = 'cw.look';

const RARITY = {
  common: { label: '일반', color: '#c9c4b2' },
  epic: { label: '에픽', color: '#b583f0' },
  legendary: { label: '전설', color: '#f0a83c' },
};

export const LOOKS = [
  {
    id: 'armor',
    sprite: 'anakin',
    rarity: 'common',
    name: '501군단 장군',
    era: '클론 전쟁 · 크리스토프시스 전투',
    desc: '클론 전쟁 초기에 아나킨이 전장에서 입은 복장. 가슴과 등을 감싼 건메탈 갑판, 제다이 문장이 새겨진 왼쪽 견갑, 남색 타바드와 적갈색 튜닉 위로 긴 가죽 건틀릿을 찼다.',
    feats: ['건메탈 흉갑 · 견갑', '남색 타바드 · 적갈색 튜닉', '클론 전쟁 헤어스타일'],
    source: '기본 외형',
  },
  {
    id: 'tunic',
    sprite: 'anakin_tunic',
    rarity: 'epic',
    name: '제다이 기사',
    era: '에피소드 III · 시스의 복수',
    desc: '코러산트 전투와 의장 구출 작전 당시의 복장. 검은 가죽 타바드를 거친 갈색 튜닉 위로 겹쳐 입고, 넓은 오비 위에 파우치가 달린 벨트를 맸다. 의수인 오른손은 긴 검은 장갑으로 감췄다.',
    feats: ['영화 헤어스타일 (가운데 가르마, 어깨까지 오는 웨이브)', '오른쪽 눈 위 흉터', '가죽 타바드 · 오비 · 벨트 파우치', '오른손 장갑 · 종 모양 소매 · 긴 부츠'],
    source: '에피소드 III 외형 · 보유',
  },
  {
    id: 'robe',
    sprite: 'anakin_robe',
    rarity: 'legendary',
    name: '제다이 로브',
    era: '에피소드 III · 시스의 복수',
    desc: '제다이 사원과 의회에서 걸친 짙은 갈색 두건 로브. 앞이 트인 망토 아래로 튜닉이 보이고, 넓은 소매와 발목까지 내려오는 자락, 등에 늘어뜨린 두건이 특징이다.',
    feats: ['두건 달린 갈색 로브 (발목 길이)', '넓은 로브 소매', '제다이 기사 튜닉 포함', '영화 헤어스타일 · 흉터'],
    source: '에피소드 III 외형 · 보유',
  },
  {
    id: 'vader',
    sprite: 'anakin_vader',
    rarity: 'legendary',
    name: '베이더 경',
    era: '에피소드 III · 오더 66',
    desc: '시디어스에게 무릎 꿇고 다스 베이더라는 이름을 받은 그 밤, 501군단을 이끌고 제다이 사원으로 진군하던 모습. 검게 물든 가죽 튜닉과 허리띠 위로 거의 검은 두건 로브를 깊게 눌러써, 그늘진 얼굴에서 눈빛만 드러난다.',
    feats: ['깊게 눌러쓴 두건 (항상 씀)', '검은 갈색 로브 · 넓은 소매 · 발목 길이', '검은 가죽 튜닉 · 검은 천 띠 · 갈색 벨트', '검은 장갑 · 검은 부츠'],
    source: '에피소드 III 외형 · 보유',
  },
];

export function savedLook() {
  let id = null;
  try {
    id = localStorage.getItem(KEY);
  } catch {
    /* storage blocked */
  }
  return LOOKS.find((l) => l.id === id) || LOOKS[0];
}

// sprite-sheet rows: animation key and its label
const ROWS = [
  ['idle', '대기'],
  ['idleOff', '대기 · 검 끔'],
  ['run', '이동'],
  ['runOff', '이동 · 검 끔'],
  ['attack1', '공격 1'],
  ['attack2', '공격 2'],
  ['attack3', '공격 3'],
  ['cast', '포스'],
  ['throw', '세이버 투척'],
  ['leap', '도약'],
  ['block', '막기'],
  ['parry', '흘리기'],
  ['hurt', '피격'],
  ['death', '쓰러짐'],
];
const COLS = 8; // directions shown
const CELL_W = 64; // game pixels per cell
const CELL_H = 96;
const FOOT_Y = 84; // feet sit here inside a cell
const BLADE = [60, 130, 255]; // the player's blade colour

export class AppearanceUI {
  constructor(hud, game, audio) {
    this.hud = hud;
    this.game = game;
    this.audio = audio;
    this.sel = savedLook().id;
    this.baking = {}; // sprite name -> bake promise
    this.progress = 0;
    this.el = hud.overlay('appearance', '외형', '<div class="ov-sub">아나킨 스카이워커 · 히어로 외형</div>');
    const body = this.el.querySelector('.ov-body');
    body.innerHTML = `<div class="ap-list"></div>
      <div class="ap-stage monitor"><div class="ap-sheet"></div><div class="ap-wait"><span></span><i><b></b></i></div></div>
      <div class="ap-detail"></div>`;
    this.list = body.querySelector('.ap-list');
    this.detailEl = body.querySelector('.ap-detail');
    this.sheet = body.querySelector('.ap-sheet');
    this.wait = body.querySelector('.ap-wait');
    this.list.addEventListener('click', (e) => {
      const b = e.target.closest('[data-look]');
      if (b) this.select(b.dataset.look);
    });
    this.detailEl.addEventListener('click', (e) => {
      if (e.target.closest('.ap-equip')) this.equip(this.sel);
    });
  }

  get equipped() {
    return LOOKS.find((l) => l.sprite === this.game.player.sprite)?.id || 'armor';
  }

  open() {
    this.render();
    this.showSheet();
    const loop = (now) => {
      this.raf = requestAnimationFrame(loop);
      this.drawSheet(now / 1000);
    };
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(loop);
  }

  close() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  select(id) {
    this.sel = id;
    this.audio.play('click');
    this.render();
    this.showSheet();
  }

  render() {
    const eq = this.equipped;
    this.list.innerHTML = LOOKS.map((l) => {
      const r = RARITY[l.rarity];
      return `<button type="button" class="ap-item${l.id === this.sel ? ' sel' : ''}" data-look="${l.id}" style="--rc:${r.color}">
        <span class="ap-rar">${r.label}</span><b>${l.name}</b><small>${l.era}</small>${l.id === eq ? '<em>장착 중</em>' : ''}</button>`;
    }).join('');
    const l = LOOKS.find((x) => x.id === this.sel);
    const r = RARITY[l.rarity];
    const ready = !!this.game.assets.sprites[l.sprite];
    this.detailEl.innerHTML = `<div class="ap-rarity" style="--rc:${r.color}">${r.label} 외형</div>
      <h3>${l.name}</h3><div class="ap-era">${l.era}</div>
      <p>${l.desc}</p>
      <div class="ap-sub">포함</div><ul>${l.feats.map((f) => `<li>${f}</li>`).join('')}</ul>
      <div class="ap-src">${l.source}</div>
      <button type="button" class="ap-equip"${l.id === eq || !ready ? ' disabled' : ''}>${l.id === eq ? '장착 중' : ready ? '장착' : '스프라이트 준비 중…'}</button>`;
  }

  /** The look's sprites, baking (once, then cached) if needed. */
  sprites(look) {
    const all = this.game.assets.sprites;
    if (all[look.sprite]) return Promise.resolve(all[look.sprite]);
    this.baking[look.sprite] ||= bakeSkin(look.sprite, (k) => {
      if (this.sel === look.id) this.progress = k;
    }).then((set) => {
      all[look.sprite] = set;
      return set;
    });
    return this.baking[look.sprite];
  }

  /** Build the sheet rows for the selected look (after its sprites exist). */
  async showSheet() {
    const look = LOOKS.find((x) => x.id === this.sel);
    this.set = null;
    this.sheet.innerHTML = '';
    this.progress = 0;
    this.wait.classList.toggle('on', !this.game.assets.sprites[look.sprite]);
    const set = await this.sprites(look);
    if (this.sel !== look.id) return; // another look was picked meanwhile
    this.wait.classList.remove('on');
    this.set = set;
    this.rows = ROWS.filter(([k]) => set.anims[k]).map(([k, label]) => {
      const row = document.createElement('div');
      row.className = 'ap-row';
      row.innerHTML = `<span>${label}</span><canvas width="${COLS * CELL_W}" height="${CELL_H}"></canvas>`;
      this.sheet.appendChild(row);
      const c = row.querySelector('canvas');
      return { key: k, ctx: c.getContext('2d') };
    });
    this.render();
  }

  drawSheet(t) {
    if (!this.set) {
      const b = this.wait.querySelector('b');
      b.style.width = Math.round(this.progress * 100) + '%';
      this.wait.querySelector('span').textContent = `스프라이트 렌더링 중… ${Math.round(this.progress * 100)}%`;
      return;
    }
    const set = this.set;
    const glow = this.hud.renderer.glowLine.bind(this.hud.renderer);
    for (const { key, ctx } of this.rows) {
      const a = set.anims[key];
      // one-shot animations replay after a short hold on the last frame
      const n = a.loop ? a.frames : a.frames + Math.round(a.fps * 0.6);
      const f = Math.min(a.frames - 1, Math.floor(t * a.fps) % n);
      ctx.clearRect(0, 0, COLS * CELL_W, CELL_H);
      for (let c = 0; c < COLS; c++) {
        const fr = a.data[(c * set.dirs) / COLS][f];
        const x = c * CELL_W + CELL_W / 2;
        ctx.drawImage(fr.page, fr.sx, fr.sy, fr.w, fr.h, Math.round(x - fr.ox), Math.round(FOOT_Y - fr.oy), fr.w, fr.h);
        if (key.endsWith('Off') || key === 'death') continue;
        for (const k of ['saber', 'saber2']) {
          const b = fr.markers[k + 'Base'];
          const e = fr.markers[k + 'Tip'];
          if (!b || !e) continue;
          for (const [s0, s1] of fr.blades ? fr.blades[k] : [[0, 1]]) {
            if (s1 - s0 < 0.02) continue;
            const bx = x + b[0], by = FOOT_Y + b[1], tx = x + e[0], ty = FOOT_Y + e[1];
            glow(ctx, bx + (tx - bx) * s0, by + (ty - by) * s0, bx + (tx - bx) * s1, by + (ty - by) * s1, BLADE);
          }
        }
      }
    }
  }

  async equip(id) {
    const look = LOOKS.find((l) => l.id === id);
    await this.sprites(look);
    this.game.player.sprite = look.sprite;
    try {
      localStorage.setItem(KEY, id);
    } catch {
      /* storage blocked */
    }
    this.audio.play('ignite');
    this.render();
  }
}
