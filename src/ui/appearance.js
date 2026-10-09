// Appearance gallery after Star Wars Battlefront II's hero appearances: the
// outfits on the left with their rarity, the live 3D model on a monitor in
// the middle (drag to turn, wheel to zoom, pose buttons), and a paper card
// with the era, description and what the look includes. Equipping bakes that
// outfit's sprites once; after that they load from the device cache.
import * as THREE from 'three';
import { buildAnakin } from '../gfx/models/characters.js';
import { ANAKIN_ANIMS } from '../gfx/models/anims.js';
import { detail } from '../gfx/models/parts.js';
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

const POSES = [
  ['idle', '대기'],
  ['idleOff', '검 끔'],
  ['run', '이동'],
  ['attack', '공격'],
];
const ATTACKS = ['attack1', 'attack2', 'attack3'];

export class AppearanceUI {
  constructor(hud, game, audio) {
    this.hud = hud;
    this.game = game;
    this.audio = audio;
    this.sel = savedLook().id;
    this.pose = 'idle';
    this.yaw = -0.5;
    this.view = 2.5; // world units shown vertically
    this.models = {};
    this.el = hud.overlay('appearance', '외형', '<div class="ov-sub">아나킨 스카이워커 · 히어로 외형</div>');
    const body = this.el.querySelector('.ov-body');
    body.innerHTML = `<div class="ap-list"></div>
      <div class="ap-stage monitor"><canvas class="ap-view"></canvas>
        <div class="ap-poses">${POSES.map(([k, l]) => `<button type="button" data-pose="${k}">${l}</button>`).join('')}<button type="button" data-face>얼굴</button></div>
        <div class="ap-hint">드래그: 회전 · 휠: 확대</div></div>
      <div class="ap-detail"></div>`;
    this.list = body.querySelector('.ap-list');
    this.detailEl = body.querySelector('.ap-detail');
    this.canvas = body.querySelector('.ap-view');
    body.querySelector('.ap-poses').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.face !== undefined) this.view = this.view > 1 ? 0.62 : 2.5;
      else this.pose = b.dataset.pose;
      this.t0 = performance.now();
      this.audio.play('click');
      this.renderButtons();
    });
    this.list.addEventListener('click', (e) => {
      const b = e.target.closest('[data-look]');
      if (b) this.select(b.dataset.look);
    });
    this.detailEl.addEventListener('click', (e) => {
      if (e.target.closest('.ap-equip')) this.equip(this.sel);
    });
    // turn the model by dragging, zoom with the wheel
    let drag = null;
    this.canvas.addEventListener('pointerdown', (e) => {
      drag = { x: e.clientX, yaw: this.yaw };
      this.canvas.setPointerCapture(e.pointerId);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (drag) this.yaw = drag.yaw + (e.clientX - drag.x) * 0.012;
    });
    const end = () => {
      drag = null;
      this.idleT = performance.now();
    };
    this.canvas.addEventListener('pointerup', end);
    this.canvas.addEventListener('pointercancel', end);
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.view = Math.max(0.5, Math.min(2.8, this.view * (e.deltaY > 0 ? 1.12 : 0.89)));
    });
    this.dragging = () => !!drag;
  }

  get equipped() {
    return LOOKS.find((l) => l.sprite === this.game.player.sprite)?.id || 'armor';
  }

  open() {
    this.render();
    this.startPreview();
  }

  close() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (this.r) {
      this.r.dispose();
      this.r.forceContextLoss();
      this.r = null;
    }
  }

  select(id) {
    this.sel = id;
    this.audio.play('click');
    this.render();
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
    const busy = this.baking === l.id;
    this.detailEl.innerHTML = `<div class="ap-rarity" style="--rc:${r.color}">${r.label} 외형</div>
      <h3>${l.name}</h3><div class="ap-era">${l.era}</div>
      <p>${l.desc}</p>
      <div class="ap-sub">포함</div><ul>${l.feats.map((f) => `<li>${f}</li>`).join('')}</ul>
      <div class="ap-src">${l.source}</div>
      <button type="button" class="ap-equip"${l.id === eq || busy ? ' disabled' : ''}>${l.id === eq ? '장착 중' : busy ? '<span class="ap-bar"><i></i></span>준비 중…' : '장착'}</button>`;
    this.renderButtons();
  }

  renderButtons() {
    this.el.querySelectorAll('[data-pose]').forEach((b) => b.classList.toggle('on', b.dataset.pose === this.pose));
    const f = this.el.querySelector('[data-face]');
    if (f) f.classList.toggle('on', this.view < 1);
  }

  async equip(id) {
    const look = LOOKS.find((l) => l.id === id);
    const sprites = this.game.assets.sprites;
    if (!sprites[look.sprite]) {
      this.baking = id;
      this.render();
      sprites[look.sprite] = await bakeSkin(look.sprite, (k) => {
        const bar = this.detailEl.querySelector('.ap-bar i');
        if (bar) bar.style.width = Math.round(k * 100) + '%';
      });
      this.baking = null;
    }
    const p = this.game.player;
    p.sprite = look.sprite;
    try {
      localStorage.setItem(KEY, id);
    } catch {
      /* storage blocked */
    }
    this.audio.play('ignite');
    this.render();
  }

  // ---------------------------------------------------------------- 3D preview

  startPreview() {
    if (!this.r) {
      this.r = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, alpha: true });
      this.r.setPixelRatio(1);
      this.r.outputColorSpace = THREE.SRGBColorSpace;
      this.r.setClearColor(0x000000, 0);
      const s = (this.scene = new THREE.Scene());
      s.add(new THREE.HemisphereLight(0xdfe4ef, 0x3a2e24, 0.95));
      const key = new THREE.DirectionalLight(0xffe6c8, 3.1);
      key.position.set(4.5, 5, 1.5);
      s.add(key);
      const rim = new THREE.DirectionalLight(0x8fb4ff, 1.1);
      rim.position.set(-3, 2.5, -4);
      s.add(rim);
      this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 50);
      const el = 0.2; // a low, showcase angle
      this.cam.position.set(Math.cos(el) * 10, 1 + Math.sin(el) * 10, 0);
      this.cam.lookAt(0, 1, 0);
      this.holder = new THREE.Group();
      s.add(this.holder);
    }
    this.t0 = this.idleT = performance.now();
    const loop = (now) => {
      this.raf = requestAnimationFrame(loop);
      this.frame(now);
    };
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(loop);
  }

  model(id) {
    if (!this.models[id]) {
      const rig = buildAnakin({ outfit: id });
      detail(rig.root);
      this.models[id] = rig;
    }
    return this.models[id];
  }

  frame(now) {
    const c = this.canvas;
    // chunky pixels: render at half the displayed size
    const w = Math.max(64, Math.round(c.clientWidth / 2));
    const h = Math.max(64, Math.round(c.clientHeight / 2));
    if (c.width !== w || c.height !== h) this.r.setSize(w, h, false);
    const rig = this.model(this.sel);
    if (this.holder.children[0] !== rig.root) {
      this.holder.clear();
      this.holder.add(rig.root);
    }
    // pose: loop the chosen animation (attacks chain 1-2-3)
    const t = (now - this.t0) / 1000;
    let a;
    let k;
    if (this.pose === 'attack') {
      const i = Math.floor(t / 0.9) % 3;
      a = ANAKIN_ANIMS[ATTACKS[i]];
      k = Math.min(1, ((t % 0.9) * a.fps) / a.frames);
    } else {
      a = ANAKIN_ANIMS[this.pose];
      k = ((t * a.fps) / a.frames) % 1;
    }
    rig.applyPose(a.pose(k));
    if (!this.dragging() && now - this.idleT > 2500) this.yaw += 0.006;
    rig.root.rotation.y = this.yaw;
    // frame the body, or the head when zoomed in
    rig.root.updateMatrixWorld(true);
    const head = rig.j.head.getWorldPosition(this.v || (this.v = new THREE.Vector3()));
    const cy = this.view < 1 ? head.y + 0.1 : 1.06 + (2.5 - this.view) * 0.25;
    const half = this.view / 2;
    const cam = this.cam;
    cam.top = half;
    cam.bottom = -half;
    cam.left = (-half * w) / h;
    cam.right = (half * w) / h;
    cam.position.y = cy + Math.sin(0.2) * 10;
    cam.lookAt(0, cy, 0);
    cam.updateProjectionMatrix();
    this.r.render(this.scene, cam);
  }
}
