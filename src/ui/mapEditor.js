// The map editor (F2, the Mustafar duel only): the map's props, the way (blocked tiles) and the lights edited in place
// on the live world, saved as the map file (public/maps/mustafar.json: worldgen.js MustafarArena.toMap / mapText).
//
//   소품 (1)   the panel's sprites: pick one, click the map to place it (again and again; Esc or the right button
//             stops); click a prop to select it, drag to move it; Delete removes it; R turns it (a set sprite: its
//             mirrored twin; a model: its next angle); V its model's next variant; B whether it blocks its
//             footprint; F its layer: 바닥 (drawn with the ground, walked over) → 서 있음 (by depth with the
//             characters) → 맨 위 (over everyone). The panel's 레이어 list shows the props it overlaps, front to
//             back, as drawn: 앞으로 / 뒤로 (. and ,) move it past the next one, 맨 앞 / 맨 뒤 (Shift) to the very
//             front (the top layer) or back (the ground); crossing into another layer changes its layer. Within
//             the ground and the top layers the map's list order is the draw order; among the standing ones a
//             move sets the prop's `order` (metres added to its depth) to just past the neighbour
//   길 (2)     paint the tiles: the left button blocked, the right walkable; [ ] the brush's size
//   조명 (3)   click a light to select it, drag to move it, click the ground to add one; colour, radius, height and
//             flicker in the panel; Delete removes it (a prop's own lights go with their prop)
//   타일 (4)   paint the ground: pick a tile (the facility's floor, the catwalk grating, the rock, the lava) and
//             paint with the brush (the left button; the right button drags the view); the lava and the rock block
//             the way as the ground does, a floor painted over them opens it. The ground is rebuilt after each
//             stroke (a new Terrain: its chunks come back over a moment)
//   방 (5)     the rooms' floor plan (the map's floorPlan: where the facility floor's pattern is laid — the border
//             of edge tiles, the chevron field, a corridor's runner): click a room to select it, drag it to move
//             it, drag a corner to resize it; its numbers in the panel (edge, cell, the cut corner, pad, pit, a
//             corridor); 방 추가 then a click adds one, Delete removes it, 바닥 채우기 paints the facility tile over
//             its tiles. The ground is rebuilt after each change
//
// Positions snap to a half tile (a dragged prop moves by half tiles, keeping its offset); Shift places freely.
// Ctrl+Z undoes, Ctrl+Y (Ctrl+Shift+Z) redoes, Ctrl+S saves: this browser keeps the map (world/mapStore.js; the next load plays it), and under `npm run dev` it goes
// straight over the map file too; ⬇ hands the file over for the repository (the artifact's `downloads` capability, else a download), 📋 copies its
// text, ↺ drops the browser's copy. WASD / the arrows / the right or
// middle button drag the view, the wheel zooms. The game is paused while the editor is open.
//
// The selected prop's position, direction (a set sprite's or its twin; a model's angle), variant and flags are shown
// and typed in the panel (a light's position the same).
// P plays the map from where the view is (game.mapTest): the player stood on the nearest walkable tile there, and
// walks it alone — the scene, the duel and Obi-Wan held — to try the way, the cover and the lights; P again is back
// in the editor with everything as it was before (the player, the duel), F2 out of both.
import { World, MUSTAFAR, MUSTAFAR_SHEETS, mapText } from '../world/worldgen.js';
import { BIOME } from '../world/biome.js';
import { cityFootprint, cityWall, inPoly, setCityFootprints } from '../world/cityProps.js';
import { addMirror, MIRROR_SUFFIX } from '../gfx/mustafarFloor.js';
import { PROPS } from '../gfx/models/props.js';
import { worldToScreen } from '../core/iso.js';
import { setUIHidden } from './uiHidden.js';
import { dist } from '../core/math.js';
import { saveLocal, clearLocal, hasLocal } from '../world/mapStore.js';

const MIRROR = MUSTAFAR_SHEETS.mirror;
// the keys by where they are on the keyboard (e.code), so they work in Korean input too (R comes as 'ㄱ', or as
// 'Process' while the IME composes)
const CODE_KEYS = { KeyR: 'r', KeyV: 'v', KeyB: 'b', KeyF: 'f', KeyP: 'p', KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd', KeyZ: 'z', KeyY: 'y', Digit1: '1', Digit2: '2', Digit3: '3', Digit4: '4', Digit5: '5', BracketLeft: '[', BracketRight: ']', Equal: '=', Minus: '-', Comma: ',', Period: '.' };
const keyOf = (e) => CODE_KEYS[e.code] || e.key.toLowerCase();
/** A set sprite's other way round: its baked twin, else its mirror image (name~m, made when first wanted). */
const twinOf = (n) => MIRROR[n] || (n.endsWith(MIRROR_SUFFIX) ? n.slice(0, -MIRROR_SUFFIX.length) : n + MIRROR_SUFFIX);
const isTwin = (n) => /_[rxy]$/.test(n) || n.endsWith(MIRROR_SUFFIX);
const UNDO_MAX = 200;
const snap = (v) => Math.round(v * 2) / 2;
const PAN_SPEED = 900; // game px a second at zoom 1
// the panel's groups of set sprites, by name
const GROUPS = [
  ['벽', (n) => n.startsWith('mfWall')],
  ['세트', (n) => n.startsWith('mf')],
  ['화물', (n) => n.startsWith('cg')],
  ['바위', (n) => n.startsWith('rk')],
  ['기타', () => true],
];
// the ground tiles painted in the tile mode: the biome, its name, the panel's swatch, and whether it blocks the way
// as the ground does (worldgen.js: only the decks are walkable in the fight)
const TILES = [
  { b: BIOME.MUSTAFAR, name: '시설 바닥', color: '#5a5654', ground: false },
  { b: BIOME.GRATE, name: '격자 바닥', color: '#3a3836', ground: false },
  { b: BIOME.ASH, name: '바위 (재)', color: '#2e2a28', ground: true },
  { b: BIOME.LAVA, name: '용암', color: '#c8401c', ground: true },
];
// a prop's layer: with the ground, standing (by depth), over everyone
const TIERS = ['flat', 'stand', 'top'];
const TIER_LABEL = { flat: '바닥', stand: '서 있음', top: '맨 위' };
const tierOf = (p) => (p.top ? 'top' : p.flat ? 'flat' : 'stand');
const ORDER_STEP = 0.005; // (m: a standing prop set just past its neighbour)
const hex = (r, g, b) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

export class MapEditor {
  constructor({ game, renderer, assets, onExit }) {
    this.game = game;
    this.renderer = renderer;
    this.assets = assets;
    this.onExit = onExit;
    this.on = false;
    this.testing = false; // the play-test (P)
    this.mode = 'prop';
    this.palette = null; // the sprite picked to place: { sheet } or { type }
    this.sel = null; // the selected prop
    this.selLight = null;
    this.selRoom = null; // the selected room (floorPlan entry), the room mode
    this.addingRoom = false; // 방 추가: the next click places one
    this.hover = null;
    this.drag = null;
    this.undo = [];
    this.redo = [];
    this.dirty = false;
    this.brush = { size: 1 };
    this.tile = TILES[0].b; // the tile mode's tile
    this.keys = new Set();
    this.mx = 0;
    this.my = 0;
    this.shift = false;
    this.pick1 = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    this.pick1.canvas.width = this.pick1.canvas.height = 1;
    window.addEventListener('keydown', (e) => this.keydown(e), true);
    window.addEventListener('keyup', (e) => {
      this.keys.delete(keyOf(e));
      if (e.key === 'Shift') this.shift = false;
    });
    window.addEventListener('blur', () => this.keys.clear());
  }

  get world() {
    return this.game.world;
  }

  /** Whether the editor holds the game (paused, its own input): open and not play-testing. */
  get holds() {
    return this.on && !this.testing;
  }

  // ---------------------------------------------------------------------------------------------------- open/close

  toggle() {
    if (this.on) return this.close();
    // only in play (not over the title screen or in another place)
    if (!this.game.duel || !this.world.toMap || !document.getElementById('help').classList.contains('hidden')) return;
    this.open();
  }

  open() {
    const g = this.game;
    this.on = true;
    if (!this.dom) this.build();
    this.dom.classList.remove('hidden');
    this.canvas.classList.remove('hidden');
    document.body.classList.add('map-editing');
    this.uiWasHidden = !!g.uiHidden;
    setUIHidden(g, true);
    this.camWas = g.camFocus;
    this.zoomWas = this.renderer.zoom;
    const c = g.camFocus || g.player;
    this.focus = { x: c.x, y: c.y };
    g.camFocus = this.focus;
    this.renderer.editing = true;
    this.renderer.propOrder = null;
    this.setMode(this.mode);
    this.status();
  }

  close() {
    const g = this.game;
    if (this.testing) this.endTest(false);
    this.on = false;
    this.drag = null;
    this.dom.classList.add('hidden');
    this.canvas.classList.add('hidden');
    document.body.classList.remove('map-editing');
    setUIHidden(g, this.uiWasHidden);
    g.camFocus = this.camWas || null;
    this.renderer.editing = false;
    if (this.onExit) this.onExit();
  }

  // -------------------------------------------------------------------------------------------------------- panel

  build() {
    const dom = (this.dom = document.createElement('div'));
    dom.id = 'mapEditor';
    dom.innerHTML = `
      <div class="me-head"><b>맵 에디터</b> <span class="me-map">무스타파</span><button class="me-close" title="닫기 (F2)">✕</button></div>
      <div class="me-modes">
        <button data-mode="prop">소품 <kbd>1</kbd></button><button data-mode="brush">길 <kbd>2</kbd></button><button data-mode="light">조명 <kbd>3</kbd></button><button data-mode="tile">타일 <kbd>4</kbd></button><button data-mode="room">방 <kbd>5</kbd></button>
      </div>
      <div class="me-body me-prop">
        <input class="me-search" type="search" placeholder="스프라이트 찾기…">
        <div class="me-sel"></div>
        <div class="me-form me-pform">
          <div class="me-row"><label>X <input class="me-px" type="number" step="0.05"></label><label>Y <input class="me-py" type="number" step="0.05"></label></div>
          <label>방향 <select class="me-pdir"></select> <kbd>R</kbd></label>
          <label class="me-pvar">변형 <select class="me-pv"></select> <kbd>V</kbd></label>
          <div class="me-row"><label><input class="me-pb" type="checkbox"> 막기 <kbd>B</kbd></label><label title="바닥: 땅과 함께, 모두의 아래 (밟고 지나감) · 서 있음: 캐릭터와 깊이순 · 맨 위: 모두의 위">층 <select class="me-ptier"><option value="flat">바닥</option><option value="stand">서 있음</option><option value="top">맨 위</option></select> <kbd>F</kbd></label></div>
          <div class="me-layers" title="이 소품과 겹치는 소품들, 그려지는 순서대로 (위가 앞). 포토샵 레이어처럼 앞뒤를 바꿉니다 — 다른 층으로 넘어가면 층도 바뀜">
            <div class="me-lhead"><span>레이어</span><button class="me-lfront" title="맨 앞으로 — 맨 위 층의 제일 앞 (Shift+.)">⏫</button><button class="me-lfwd" title="한 칸 앞으로 (.)">🔼</button><button class="me-lback" title="한 칸 뒤로 (,)">🔽</button><button class="me-lbottom" title="맨 뒤로 — 바닥 층의 제일 뒤 (Shift+,)">⏬</button></div>
            <ol class="me-lstack"></ol>
          </div>
          <div class="me-row me-pclip" title="벽 칸을 문틀·콘솔 끝·모서리에 맞춰 자르기: 왼쪽/오른쪽 기둥 중심에서 안쪽으로 몇 m까지 잘라낼지"><label>자르기 L <input class="me-pcl" type="number" step="0.05" min="0"></label><label>R <input class="me-pcr" type="number" step="0.05" min="0"></label></div>
        </div>
        <div class="me-list"></div>
      </div>
      <div class="me-body me-brush">
        <p>왼쪽 버튼: <b class="me-blk">막힘</b> · 오른쪽 버튼: <b class="me-walk">걷기 가능</b></p>
        <label>붓 크기 <input class="me-size" type="range" min="1" max="7" step="1" value="1"> <span class="me-size-v">1</span>칸 <kbd>[</kbd><kbd>]</kbd></label>
        <p class="me-note">주황: 소품이 막은 칸 · 빨강: 땅이 막은 칸(용암 · 바위 · 벽)</p>
      </div>
      <div class="me-body me-tile">
        <p>타일을 고르고 왼쪽 버튼으로 칠하기 · 오른쪽 버튼 드래그: 시점</p>
        <div class="me-tiles">${TILES.map((t) => `<button data-tile="${t.b}"><i style="background:${t.color}"></i>${t.name}</button>`).join('')}</div>
        <label>붓 크기 <input class="me-tsize" type="range" min="1" max="7" step="1" value="1"> <span class="me-tsize-v">1</span>칸 <kbd>[</kbd><kbd>]</kbd></label>
        <p class="me-note">용암·바위는 땅이 막는 칸이 되고, 그 위에 바닥을 칠하면 다시 걸을 수 있음 · 방 안의 시설 바닥은 바닥 계획(floorPlan)의 무늬로 그려짐</p>
      </div>
      <div class="me-body me-room">
        <p class="me-note">방을 클릭해 선택 · 안쪽을 끌어 이동 · 모서리를 끌어 크기 조절 · 바닥 무늬(시설 바닥 타일의 테두리·쉐브론)는 이 영역 안에만 그려짐</p>
        <div class="me-btns"><button class="me-radd" title="누른 뒤 맵을 클릭하면 그 자리에 새 방">＋ 방 추가</button><button class="me-rfill" title="방 영역의 타일을 시설 바닥으로 칠함">바닥 채우기</button><button class="me-rdel" title="Del">방 삭제</button></div>
        <div class="me-form me-rform">
          <div class="me-row"><label>X <input class="me-rx" type="number" step="0.5"></label><label>Y <input class="me-ry" type="number" step="0.5"></label></div>
          <div class="me-row"><label>반폭 <input class="me-rhw" type="number" step="0.5" min="0.5"></label><label>반높이 <input class="me-rhh" type="number" step="0.5" min="0.5"></label></div>
          <div class="me-row"><label title="무늬의 방향: 쉐브론이 어느 축을 따라 맞서는지 · 복도의 길이 방향">축 <select class="me-raxis"><option value="x">x</option><option value="y">y</option></select></label><label title="복도: 테두리·쉐브론 대신 긴 방향으로 띠 하나"><input class="me-rrun" type="checkbox"> 복도</label></div>
          <div class="me-row me-rfull"><label title="벽을 따라 도는 테두리 타일 띠의 폭(칸)">테두리 <input class="me-redge" type="number" step="0.5" min="0"></label><label title="가운데 쉐브론 무늬 한 칸의 크기(칸)">무늬 칸 <input class="me-rcell" type="number" step="0.5" min="1"></label></div>
          <div class="me-row me-rfull"><label title="먼 모서리를 대각선으로 잘라낸 길이(칸): 0이면 안 자름">모서리 자르기 <input class="me-rcut" type="number" step="0.1" min="0"></label><label title="먼 벽의 콘솔 밑으로 바닥이 더 나가는 폭(칸)">여유 <input class="me-rpad" type="number" step="0.5" min="0"></label></div>
          <div class="me-row me-rfull"><label title="가운데가 이만큼(칸) 안쪽에서 한 단 꺼짐: 0이면 평평">꺼진 바닥 <input class="me-rpit" type="number" step="0.1" min="0"></label></div>
        </div>
      </div>
      <div class="me-body me-light">
        <p class="me-note">조명을 클릭해 선택 · 끌어서 이동 · 빈 곳을 클릭하면 새 조명</p>
        <div class="me-lprops">
          <div class="me-row"><label>X <input class="me-lx" type="number" step="0.05"></label><label>Y <input class="me-ly" type="number" step="0.05"></label></div>
          <label>색 <input class="me-lc" type="color"></label>
          <label>반경 <input class="me-lr" type="range" min="10" max="400" step="5"> <span class="me-lr-v"></span></label>
          <label>높이 <input class="me-lz" type="range" min="0" max="5" step="0.1"> <span class="me-lz-v"></span> m</label>
          <label>깜빡임 <input class="me-lf" type="range" min="0" max="0.5" step="0.01"> <span class="me-lf-v"></span></label>
          <button class="me-ldel">조명 삭제 <kbd>Del</kbd></button>
        </div>
      </div>
      <div class="me-foot">
        <div class="me-btns"><button class="me-undo" title="Ctrl+Z">↶ 되돌리기</button><button class="me-redo" title="Ctrl+Y">↷ 다시</button><button class="me-save" title="Ctrl+S — 이 브라우저에 저장(다시 열어도 유지) · npm run dev 에선 맵 파일에도 바로 씀">💾 저장</button></div>
        <div class="me-btns me-file"><span class="me-src"></span><button class="me-dl" title="맵 파일(mustafar.json) 받기 — 저장소의 public/maps/mustafar.json 에 넣을 때">⬇ 파일 받기</button><button class="me-copy" title="맵 JSON을 클립보드에 복사 — 채팅에 붙여 넣어도 됨">📋 복사</button><button class="me-revert" title="이 브라우저의 저장본을 지우고 맵 파일대로 다시 불러오기">↺ 파일로 되돌리기</button></div>
        <button class="me-test" title="P">▶ 플레이 테스트 <kbd>P</kbd></button>
        <div class="me-status"></div>
        <div class="me-help">클릭 배치 · 드래그 이동 · <kbd>Del</kbd> 삭제 · <kbd>R</kbd> 회전 · <kbd>V</kbd> 변형 · <kbd>B</kbd> 막기 · <kbd>F</kbd> 층 · <kbd>,</kbd><kbd>.</kbd> 레이어 뒤로/앞으로 (<kbd>Shift</kbd> 맨 뒤/맨 앞)<br><kbd>4</kbd> 타일 칠하기 · <kbd>5</kbd> 방 영역 · <kbd>Shift</kbd> 스냅 끄기 · <kbd>Ctrl+Z</kbd> 되돌리기 · <kbd>WASD</kbd>/우클릭 드래그 시점 · 휠 확대 · <kbd>P</kbd> 플레이 테스트</div>
      </div>`;
    document.body.appendChild(dom);
    for (const e of ['pointerdown', 'wheel', 'contextmenu', 'mousedown']) dom.addEventListener(e, (ev) => ev.stopPropagation());
    dom.querySelector('.me-close').onclick = () => this.close();
    dom.querySelectorAll('.me-modes button').forEach((b) => (b.onclick = () => this.setMode(b.dataset.mode)));
    dom.querySelectorAll('.me-tiles button').forEach((b) => (b.onclick = () => this.setTile(+b.dataset.tile)));
    dom.querySelector('.me-tsize').oninput = (e) => this.setBrush(+e.target.value);
    dom.querySelector('.me-radd').onclick = (e) => (e.currentTarget.blur(), this.addRoomNext());
    dom.querySelector('.me-rfill').onclick = (e) => (e.currentTarget.blur(), this.fillRoom());
    dom.querySelector('.me-rdel').onclick = (e) => (e.currentTarget.blur(), this.remove());
    this.buildRoomForm();
    dom.querySelector('.me-undo').onclick = () => this.undoStep();
    dom.querySelector('.me-redo').onclick = () => this.redoStep();
    dom.querySelector('.me-save').onclick = () => this.save();
    dom.querySelector('.me-dl').onclick = () => this.download(mapText(this.world.toMap()));
    dom.querySelector('.me-copy').onclick = () => this.copy(mapText(this.world.toMap()));
    dom.querySelector('.me-revert').onclick = () => this.revert();
    dom.querySelector('.me-test').onclick = (e) => (e.currentTarget.blur(), this.startTest());
    const size = dom.querySelector('.me-size');
    size.oninput = () => this.setBrush(+size.value);
    dom.querySelector('.me-search').oninput = (e) => this.filter(e.target.value);
    this.buildPalette();
    this.buildLightPanel();
    this.buildPropForm();
    // the play-test's note at the top of the screen
    const tb = (this.testBar = document.createElement('div'));
    tb.id = 'mapTestBar';
    tb.className = 'hidden';
    tb.innerHTML = '<b>플레이 테스트</b> — 걸어서 길 · 가림 · 조명을 확인 (결투는 멈춤) · <kbd>P</kbd> 에디터로 · <kbd>F2</kbd> 끝내기';
    document.body.appendChild(tb);

    const cv = (this.canvas = document.createElement('canvas'));
    cv.id = 'mapEditorView';
    document.body.appendChild(cv);
    this.ctx = cv.getContext('2d');
    cv.addEventListener('pointerdown', (e) => this.down(e));
    cv.addEventListener('pointermove', (e) => this.move(e));
    cv.addEventListener('pointerup', (e) => this.up(e));
    cv.addEventListener('pointercancel', (e) => this.up(e));
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('wheel', (e) => this.wheel(e), { passive: false });
  }

  /** The panel's sprites: the set sprites loaded for the map (one of each mirrored pair: R turns it) and the models. */
  buildPalette() {
    const list = this.dom.querySelector('.me-list');
    const city = this.assets.city || {};
    const names = Object.keys(city)
      .filter((n) => city[n] && city[n].body && cityFootprint(n) && !n.endsWith(MIRROR_SUFFIX))
      .sort();
    const shown = new Set();
    for (const n of names) if (!(MIRROR[n] && shown.has(MIRROR[n]))) shown.add(n);
    const groups = GROUPS.map(([label]) => ({ label, items: [] }));
    for (const n of shown) groups[GROUPS.findIndex(([, f]) => f(n))].items.push({ sheet: n, frame: city[n].body });
    const models = Object.keys(this.assets.props || {})
      .filter((t) => PROPS[t] && this.assets.props[t] && this.assets.props[t][0])
      .sort()
      .map((t) => ({ type: t, frame: this.assets.props[t][0] }));
    groups.push({ label: '모델 (PROPS)', items: models });
    this.items = [];
    for (const gp of groups) {
      if (!gp.items.length) continue;
      const h = document.createElement('div');
      h.className = 'me-group';
      h.textContent = `${gp.label} · ${gp.items.length}`;
      h.dataset.label = gp.label;
      list.appendChild(h);
      const grid = document.createElement('div');
      grid.className = 'me-grid';
      list.appendChild(grid);
      for (const it of gp.items) {
        const b = document.createElement('button');
        b.className = 'me-item';
        const name = it.sheet || it.type;
        b.title = name;
        const c = document.createElement('canvas');
        c.width = c.height = 64;
        this.thumb(c.getContext('2d'), it.frame, 64);
        const cap = document.createElement('span');
        cap.textContent = name;
        b.append(c, cap);
        b.onclick = () => this.pickPalette(this.palette && this.palette.el === b ? null : { ...it, el: b });
        grid.appendChild(b);
        this.items.push({ name, el: b, group: h });
      }
    }
  }

  thumb(ctx, f, S) {
    const k = f.k || 1;
    const w = f.w * k;
    const h = f.h * k;
    const s = Math.min(S / w, S / h, 2);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(f.page, f.sx, f.sy, f.w, f.h, (S - w * s) / 2, (S - h * s) / 2, w * s, h * s);
  }

  filter(q) {
    q = q.trim().toLowerCase();
    const seen = new Map();
    for (const it of this.items) {
      const on = !q || it.name.toLowerCase().includes(q);
      it.el.style.display = on ? '' : 'none';
      seen.set(it.group, (seen.get(it.group) || 0) + (on ? 1 : 0));
    }
    for (const [h, n] of seen) {
      h.style.display = n ? '' : 'none';
      h.textContent = `${h.dataset.label} · ${n}`;
    }
  }

  pickPalette(it) {
    if (this.palette) this.palette.el.classList.remove('on');
    this.palette = it;
    if (it) {
      it.el.classList.add('on');
      this.select(null);
    }
    this.status();
  }

  buildLightPanel() {
    const d = this.dom;
    const q = (s) => d.querySelector(s);
    const edit = (fn) => () => {
      const l = this.selLight;
      if (!l) return;
      if (!this.lightEdit) this.lightEdit = this.snapshot();
      fn(l);
      this.homeOf(l);
      this.showLight();
    };
    q('.me-lc').oninput = edit((l) => {
      const v = q('.me-lc').value;
      [l.r, l.g, l.b] = [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16));
    });
    q('.me-lr').oninput = edit((l) => (l.rad = +q('.me-lr').value));
    q('.me-lz').oninput = edit((l) => (l.z = +q('.me-lz').value));
    q('.me-lf').oninput = edit((l) => (l.flicker = +q('.me-lf').value));
    // a typed position (its own undo step, on change)
    for (const [s, k] of [['.me-lx', 'x'], ['.me-ly', 'y']]) {
      q(s).oninput = null;
      q(s).addEventListener('change', () => {
        const v = q(s).value;
        if (v !== '' && Number.isFinite(+v) && this.selLight && +v !== this.selLight[k]) edit((l) => (l[k] = +v))();
        else this.showLight();
      });
    }
    // one undo step a slider's whole drag
    for (const s of ['.me-lc', '.me-lr', '.me-lz', '.me-lf', '.me-lx', '.me-ly'])
      q(s).addEventListener('change', () => {
        if (this.lightEdit) this.commit(this.lightEdit);
        this.lightEdit = null;
      });
    q('.me-ldel').onclick = () => this.remove();
  }

  showLight() {
    const d = this.dom;
    const l = this.selLight;
    d.querySelector('.me-lprops').classList.toggle('off', !l);
    if (!l) return;
    for (const [s, v] of [['.me-lx', l.x], ['.me-ly', l.y]]) {
      const i = d.querySelector(s);
      if (document.activeElement !== i) i.value = +v.toFixed(3);
    }
    d.querySelector('.me-lc').value = hex(l.r, l.g, l.b);
    d.querySelector('.me-lr').value = l.rad;
    d.querySelector('.me-lr-v').textContent = Math.round(l.rad);
    d.querySelector('.me-lz').value = l.z;
    d.querySelector('.me-lz-v').textContent = (+l.z).toFixed(1);
    d.querySelector('.me-lf').value = l.flicker;
    d.querySelector('.me-lf-v').textContent = (+l.flicker).toFixed(2);
  }

  // ------------------------------------------------------------------------------------------------- the rooms

  /** The selected room's numbers typed in the panel (the map's floorPlan entry). */
  buildRoomForm() {
    const d = this.dom;
    const q = (s) => d.querySelector(s);
    const num = (sel, key, lo = -Infinity) => {
      q(sel).onchange = (e) => {
        const R = this.selRoom;
        const v = +e.target.value;
        if (!R || e.target.value === '' || !Number.isFinite(v)) return this.showRoom(true);
        this.setRoom({ [key]: Math.max(lo, v) });
        e.target.blur();
      };
    };
    num('.me-rx', 'x');
    num('.me-ry', 'y');
    num('.me-rhw', 'hw', 0.5);
    num('.me-rhh', 'hh', 0.5);
    num('.me-redge', 'edge', 0);
    num('.me-rcell', 'cell', 1);
    num('.me-rcut', 'cut', 0);
    num('.me-rpad', 'pad', 0);
    num('.me-rpit', 'pit', 0);
    q('.me-raxis').onchange = (e) => (this.selRoom && this.setRoom({ axis: e.target.value }), e.target.blur());
    q('.me-rrun').onchange = (e) => (this.selRoom && this.setRoom({ runner: e.target.checked }), e.target.blur());
  }

  showRoom(force = false) {
    const d = this.dom;
    if (!d) return;
    const R = this.selRoom;
    d.querySelector('.me-rform').classList.toggle('hidden', !R);
    d.querySelector('.me-radd').classList.toggle('on', !!this.addingRoom);
    if (!R) return;
    const q = (s) => d.querySelector(s);
    for (const [sel, v] of [['.me-rx', R.x], ['.me-ry', R.y], ['.me-rhw', R.hw], ['.me-rhh', R.hh], ['.me-redge', R.edge || 0], ['.me-rcell', R.cell || 4.5], ['.me-rcut', R.cut || 0], ['.me-rpad', R.pad || 0], ['.me-rpit', R.pit || 0]]) {
      const i = q(sel);
      if (force || document.activeElement !== i) i.value = +(+v).toFixed(3);
    }
    q('.me-raxis').value = R.axis || 'y';
    q('.me-rrun').checked = !!R.runner;
    d.querySelectorAll('.me-rfull').forEach((e) => e.classList.toggle('hidden', !!R.runner));
  }

  /** The selected room changed (`patch`: its fields; a 0 drops cut, pad and pit), the ground rebuilt. */
  setRoom(patch) {
    const R = this.selRoom;
    if (!R) return;
    const before = this.snapshot();
    for (const [k, v] of Object.entries(patch)) {
      if ((k === 'cut' || k === 'pad' || k === 'pit') && !v) delete R[k];
      else if (k === 'runner') {
        if (v) {
          R.runner = true;
          for (const f of ['edge', 'cell', 'cut', 'pad', 'pit']) delete R[f];
        } else {
          delete R.runner;
          R.edge ??= 2;
          R.cell ??= 4.5;
        }
      } else R[k] = v;
    }
    this.rebuildGround();
    this.commit(before);
    this.showRoom(true);
    this.status();
  }

  /** The room under world point (x, y): the smallest one there (a corridor inside a room's pad). */
  roomAt(x, y) {
    let best = null;
    for (const R of this.world.floorPlan) {
      const pad = R.pad || 0;
      if (x < R.x - R.hw - pad || x > R.x + R.hw || y < R.y - R.hh - pad || y > R.y + R.hh) continue;
      if (!best || R.hw * R.hh < best.hw * best.hh) best = R;
    }
    return best;
  }

  /** The selected room's corner under screen px (mx, my), within a handle's reach: [sx, sy] signs, else null. */
  roomCornerAt(mx, my) {
    const R = this.selRoom;
    if (!R) return null;
    const r = this.renderer;
    for (const sx of [-1, 1])
      for (const sy of [-1, 1]) {
        const s = worldToScreen(R.x + sx * R.hw, R.y + sy * R.hh);
        const px = (s.x - r.cam.x) * r.scale;
        const py = (s.y - r.cam.y) * r.scale;
        if (Math.abs(px - mx) <= 8 && Math.abs(py - my) <= 8) return [sx, sy];
      }
    return null;
  }

  /** 방 추가: the next click on the map puts a room there (a 6 × 6 one with the rooms' usual pattern). */
  addRoomNext() {
    this.addingRoom = !this.addingRoom;
    this.showRoom();
    this.status();
    if (this.addingRoom) this.say('맵을 클릭하면 그 자리에 새 방 (Esc 취소)');
  }

  addRoom(x, y) {
    const before = this.snapshot();
    const R = { x: snap(x), y: snap(y), hw: 3, hh: 3, axis: 'y', edge: 2, cell: 4.5 };
    this.world.floorPlan.push(R);
    this.selRoom = R;
    this.addingRoom = false;
    this.rebuildGround();
    this.commit(before);
    this.showRoom(true);
    this.status();
    this.say('새 방: 모서리를 끌어 크기를 맞추고, 바닥 채우기로 타일을 깔 수 있습니다');
  }

  /** 바닥 채우기: the facility floor tile over the selected room's tiles (the way opened where the ground blocked it). */
  fillRoom() {
    const R = this.selRoom;
    if (!R) return this.say('먼저 방을 고르세요');
    const w = this.world;
    const before = this.snapshot();
    let n = 0;
    for (let ty = Math.floor(R.y - R.hh); ty < Math.ceil(R.y + R.hh); ty++)
      for (let tx = Math.floor(R.x - R.hw); tx < Math.ceil(R.x + R.hw); tx++) {
        if (!w.inBounds(tx, ty)) continue;
        const i = ty * w.w + tx;
        if (w.biome[i] === BIOME.MUSTAFAR) continue;
        w.biome[i] = BIOME.MUSTAFAR;
        if (w.blocked[i] === 2) w.blocked[i] = 0;
        n++;
      }
    if (!n) return this.say('이미 전부 시설 바닥입니다');
    this.rebuildGround();
    this.commit(before);
    this.say(`${n}칸을 시설 바닥으로 칠했습니다`);
  }

  setMode(m) {
    this.mode = m;
    this.drag = null;
    this.dom.querySelectorAll('.me-modes button').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
    for (const k of ['prop', 'brush', 'light', 'tile', 'room']) this.dom.querySelector('.me-' + k).classList.toggle('hidden', k !== m);
    if (m === 'tile') this.setTile(this.tile);
    if (m !== 'room') this.addingRoom = false;
    this.showRoom();
    if (m !== 'prop') this.pickPalette(null);
    if (m !== 'light') this.selLight = null;
    this.showLight();
    this.status();
  }

  setBrush(n) {
    this.brush.size = Math.max(1, Math.min(7, n));
    for (const k of ['size', 'tsize']) {
      this.dom.querySelector('.me-' + k).value = this.brush.size;
      this.dom.querySelector(`.me-${k}-v`).textContent = this.brush.size;
    }
  }

  /** The tile mode's tile (its biome). */
  setTile(b) {
    this.tile = b;
    this.dom.querySelectorAll('.me-tiles button').forEach((e) => e.classList.toggle('on', +e.dataset.tile === b));
    this.status();
  }

  status() {
    if (!this.dom) return;
    const w = this.cursor || { x: 0, y: 0 };
    let t = `커서 ${w.x.toFixed(1)}, ${w.y.toFixed(1)} (칸 ${Math.floor(w.x)}, ${Math.floor(w.y)})`;
    const p = this.sel;
    if (this.mode === 'prop') {
      if (this.palette) t += ` · 배치: ${this.palette.sheet || this.palette.type}`;
      else if (p) t += ` · 선택: ${p.sheet || p.type} (${p.x.toFixed(2)}, ${p.y.toFixed(2)}) ${TIER_LABEL[tierOf(p)]}${p.block ? ' · 막음' : ''}`;
    }
    if (this.mode === 'light' && this.selLight) t += ` · 조명 (${this.selLight.x.toFixed(2)}, ${this.selLight.y.toFixed(2)})`;
    if (this.mode === 'room') t += this.addingRoom ? ' · 새 방: 맵을 클릭' : this.selRoom ? ` · 방 ${this.world.floorPlan.indexOf(this.selRoom) + 1}: (${this.selRoom.x}, ${this.selRoom.y}) ${this.selRoom.hw * 2}×${this.selRoom.hh * 2}` : '';
    if (this.mode === 'tile') {
      const here = w.x >= 0 && w.y >= 0 && w.x < this.world.w && w.y < this.world.h ? TILES.find((q) => q.b === this.world.biome[Math.floor(w.y) * this.world.w + Math.floor(w.x)]) : null;
      t += ` · 칠하기: ${TILES.find((q) => q.b === this.tile).name}${here ? ` (여기: ${here.name})` : ''}`;
    }
    t += this.dirty ? ' · 저장 안 됨' : '';
    this.dom.querySelector('.me-status').textContent = t;
    this.dom.querySelector('.me-src').textContent = hasLocal() ? '브라우저 저장본' : '맵 파일';
    const sel = this.dom.querySelector('.me-sel');
    sel.textContent = p ? `선택: ${p.sheet || p.type}` : this.palette ? `배치할 소품: ${this.palette.sheet || this.palette.type} (Esc 해제)` : '소품을 고르거나 맵의 소품을 클릭';
    this.showProp();
    if (this.selLight) this.showLight();
  }

  /** The selected prop's numbers and choices in the panel (its form): built for it, kept up while it moves. */
  buildPropForm() {
    const d = this.dom;
    const q = (s) => d.querySelector(s);
    const setXY = () => {
      const p = this.sel;
      const x = +q('.me-px').value;
      const y = +q('.me-py').value;
      if (!p || q('.me-px').value === '' || q('.me-py').value === '' || !Number.isFinite(x) || !Number.isFinite(y)) return this.showProp(true);
      if (x === p.x && y === p.y) return;
      this.moveTo(p, Math.max(0, Math.min(this.world.w, x)), Math.max(0, Math.min(this.world.h, y)));
    };
    q('.me-px').onchange = setXY;
    q('.me-py').onchange = setXY;
    const done = (e) => e.target.blur(); // (back to the editor's keys)
    q('.me-pdir').onchange = (e) => {
      const p = this.sel;
      if (p && p.sheet) {
        if (e.target.value !== p.sheet) this.rotate();
      } else if (p) this.setAngle(+e.target.value);
      done(e);
    };
    q('.me-pv').onchange = (e) => {
      const p = this.sel;
      if (p && !p.sheet) this.setVariant(+e.target.value);
      done(e);
    };
    const setClip = () => {
      const p = this.sel;
      if (!p) return;
      const l = Math.max(0, +q('.me-pcl').value || 0);
      const r = Math.max(0, +q('.me-pcr').value || 0);
      const was = p.clip || [0, 0];
      if (l === was[0] && r === was[1]) return;
      const before = this.snapshot();
      p.clip = l || r ? [l, r] : undefined;
      this.resort();
      this.commit(before);
    };
    q('.me-pcl').onchange = setClip;
    q('.me-pcr').onchange = setClip;
    q('.me-lfront').onclick = () => this.moveLayer('front');
    q('.me-lfwd').onclick = () => this.moveLayer('fwd');
    q('.me-lback').onclick = () => this.moveLayer('back');
    q('.me-lbottom').onclick = () => this.moveLayer('bottom');
    q('.me-lstack').onclick = (e) => {
      const li = e.target.closest('li[data-i]');
      if (!li) return;
      const p = this.world.props[+li.dataset.i];
      if (p) this.select(p);
    };
    q('.me-pb').onchange = (e) => (this.sel && !!this.sel.block !== e.target.checked && this.toggleBlock(), done(e));
    q('.me-ptier').onchange = (e) => (this.sel && tierOf(this.sel) !== e.target.value && this.setTier(e.target.value), done(e));
  }

  showProp(force = false) {
    const d = this.dom;
    if (!d) return;
    const p = this.sel;
    const form = d.querySelector('.me-pform');
    form.classList.toggle('hidden', !p);
    if (!p) return;
    const q = (s) => d.querySelector(s);
    for (const [s, v] of [['.me-px', p.x], ['.me-py', p.y]]) {
      const i = q(s);
      if (force || document.activeElement !== i) i.value = +v.toFixed(3);
    }
    // its directions: a set sprite and its mirrored twin, a model's angles
    const dir = q('.me-pdir');
    const key = p.sheet ? p.sheet : 'model|' + p.type;
    if (dir.dataset.key !== key || force) {
      dir.dataset.key = key;
      dir.innerHTML = '';
      const opts = p.sheet
        ? [p.sheet, twinOf(p.sheet)].sort((a, b) => isTwin(a) - isTwin(b)).map((n) => [n, `${n}${isTwin(n) ? ' (반전)' : ' (기본)'}`])
        : (PROPS[p.type].angles || [0]).map((a, i) => [i, `${i}: ${Math.round((a * 180) / Math.PI)}°`]);
      for (const [v, t] of opts) dir.add(new Option(t, v));
      dir.disabled = opts.length < 2;
    }
    dir.value = p.sheet ? p.sheet : p.angleIdx;
    const nv = p.sheet ? 0 : PROPS[p.type].variants || 1;
    q('.me-pvar').classList.toggle('hidden', nv < 2);
    const pv = q('.me-pv');
    if (pv.options.length !== nv) {
      pv.innerHTML = '';
      for (let i = 0; i < nv; i++) pv.add(new Option(String(i), i));
    }
    if (nv >= 2) pv.value = p.variant;
    q('.me-pb').checked = !!p.block;
    q('.me-ptier').value = tierOf(p);
    this.showLayers();
    q('.me-pclip').classList.toggle('hidden', !(p.sheet && cityWall(p.sheet)));
    for (const [s, v] of [['.me-pcl', p.clip ? p.clip[0] : 0], ['.me-pcr', p.clip ? p.clip[1] : 0]]) {
      const i = q(s);
      if (force || document.activeElement !== i) i.value = +v.toFixed(3);
    }
  }

  // ------------------------------------------------------------------------------------------------- the layers

  /**
   * The props back to front as drawn: the ground layer in the map's order, the standing ones by their draw depth
   * (renderer.js orderProps), the top layer in the map's order.
   */
  stack() {
    const w = this.world;
    const r = this.renderer;
    if (!r.propOrder || r.propOrder.world !== w || r.propOrder.n !== w.props.length) r.orderProps(w);
    const flats = w.props.filter((p) => tierOf(p) === 'flat');
    const stand = w.props.filter((p) => tierOf(p) === 'stand').sort((a, b) => (a.drawDepth ?? a.sortDepth) - (b.drawDepth ?? b.sortDepth));
    const tops = w.props.filter((p) => tierOf(p) === 'top');
    return [...flats, ...stand, ...tops];
  }

  /** The stack's props whose pictures overlap the selected one's, front to back (the selected one among them). */
  around(p) {
    const a = p.rect;
    const meets = (q) => q === p || (q.rect && a[0] < q.rect[0] + q.rect[2] && a[0] + a[2] > q.rect[0] && a[1] < q.rect[1] + q.rect[3] && a[1] + a[3] > q.rect[1]);
    return this.stack().filter(meets).reverse();
  }

  /** The panel's layer list for the selected prop. */
  showLayers() {
    const ol = this.dom.querySelector('.me-lstack');
    const p = this.sel;
    ol.innerHTML = '';
    if (!p) return;
    let tier = null;
    for (const q of this.around(p)) {
      const t = tierOf(q);
      if (t !== tier) {
        tier = t;
        const h = document.createElement('li');
        h.className = 'me-ltier';
        h.textContent = TIER_LABEL[t];
        ol.appendChild(h);
      }
      const li = document.createElement('li');
      li.dataset.i = this.world.props.indexOf(q);
      li.className = q === p ? 'sel' : '';
      li.textContent = `${q.sheet || q.type} (${q.x.toFixed(1)}, ${q.y.toFixed(1)})`;
      ol.appendChild(li);
    }
    const sel = ol.querySelector('li.sel');
    if (sel) sel.scrollIntoView({ block: 'nearest' });
  }

  /**
   * The selected prop moved in the draw order, as a layer in a picture: `fwd` / `back` past the next prop it
   * overlaps, `front` / `bottom` to the very front (the top layer's end) or back (the ground layer's start). Landing
   * next to a prop of another layer puts it in that layer.
   */
  moveLayer(how) {
    const p = this.sel;
    if (!p) return;
    const list = this.around(p); // (front to back)
    const i = list.indexOf(p);
    const before = this.snapshot();
    if (how === 'front') this.placeIn(p, 'top', null, true);
    else if (how === 'bottom') this.placeIn(p, 'flat', null, false);
    else {
      const target = how === 'fwd' ? list[i - 1] : list[i + 1];
      if (!target) return this.say(how === 'fwd' ? '겹치는 소품 중 이미 제일 앞입니다 (⏫ 맨 앞: 맨 위 층으로)' : '겹치는 소품 중 이미 제일 뒤입니다 (⏬ 맨 뒤: 바닥 층으로)');
      this.placeIn(p, tierOf(target), target, how === 'fwd');
    }
    this.renderer.placeProp(p);
    this.resort();
    this.commit(before);
    const now = this.around(p);
    const j = now.indexOf(p);
    const near = how === 'fwd' || how === 'front' ? now[j + 1] : now[j - 1];
    this.say(`${TIER_LABEL[tierOf(p)]} 층${near ? ` · ${near.sheet || near.type}${how === 'fwd' || how === 'front' ? ' 앞에' : ' 뒤에'}` : ''}`);
    this.status();
  }

  /**
   * The prop into `tier` next to `target` (null: the layer's end — the front — when `after`, else its start). In
   * the ground and top layers the list's order is the draw order, so it goes beside the target in the list; among
   * the standing ones its `order` is set so its depth is just past the target's.
   */
  placeIn(p, tier, target, after) {
    const w = this.world;
    p.flat = tier === 'flat';
    p.top = tier === 'top';
    if (tier !== 'stand' || !target) p.order = undefined;
    w.props.splice(w.props.indexOf(p), 1);
    if (tier === 'stand' && target) {
      this.renderer.placeProp(p); // (its depth without the order)
      const base = p.sortDepth - (p.order || 0);
      p.order = Math.round(((target.drawDepth ?? target.sortDepth) + (after ? ORDER_STEP : -ORDER_STEP) - base) * 1000) / 1000;
      w.props.push(p);
    } else if (target) w.props.splice(w.props.indexOf(target) + (after ? 1 : 0), 0, p);
    else if (after) w.props.push(p);
    else w.props.unshift(p);
  }

  /** The selected prop's layer (the panel's 층, F): to the front of that layer. */
  setTier(tier) {
    const p = this.sel;
    if (!p || tierOf(p) === tier) return;
    const before = this.snapshot();
    this.placeIn(p, tier, null, true);
    this.renderer.placeProp(p);
    this.resort();
    this.commit(before);
    this.say({ flat: '바닥 층: 땅과 함께, 모두의 아래에 그려짐 (밟고 지나감)', stand: '서 있음: 캐릭터와 깊이순으로 그려짐', top: '맨 위 층: 모두의 위에 그려짐' }[tier]);
    this.status();
  }

  // ------------------------------------------------------------------------------------------------- the world

  /** CSS px → world (the ground) and game px. */
  at(mx, my) {
    const r = this.renderer;
    return { ...r.screenToWorldPos(mx, my), ix: mx / r.scale + r.cam.x, iy: my / r.scale + r.cam.y };
  }

  /** Whether a prop's sprite has an opaque pixel at game px (ix, iy). */
  hit(p, ix, iy) {
    const f = p.frame;
    if (!f) return false;
    const k = f.k || 1;
    const u = Math.floor((ix - (p.sx - f.ox * k)) / k);
    const v = Math.floor((iy - (p.sy + (p.bob || 0) - f.oy * k)) / k);
    if (u < 0 || v < 0 || u >= f.w || v >= f.h) return false;
    const c = this.pick1;
    c.clearRect(0, 0, 1, 1);
    c.drawImage(f.page, f.sx + u, f.sy + v, 1, 1, 0, 0, 1, 1);
    return c.getImageData(0, 0, 1, 1).data[3] > 40;
  }

  /** The prop drawn on top under game px (ix, iy): the stack front to back. */
  propAt(ix, iy) {
    const s = this.stack();
    for (let i = s.length - 1; i >= 0; i--) if (this.hit(s[i], ix, iy)) return s[i];
    return null;
  }

  lightAt(mx, my) {
    const r = this.renderer;
    let best = null;
    let bd = 10;
    for (const l of this.world.lights) {
      if (l.of) continue; // (a prop's own: moved with its prop)
      const s = worldToScreen(l.x, l.y, l.z);
      const d = Math.hypot((s.x - r.cam.x) * r.scale - mx, (s.y - r.cam.y) * r.scale - my);
      if (d < bd) [bd, best] = [d, l];
    }
    return best;
  }

  /** The tiles a prop blocks (its footprint, as World.addSheetProp / addProp block them). */
  tiles(p) {
    const w = this.world;
    const out = [];
    if (p.sheet) {
      const fp = cityFootprint(p.sheet);
      if (!fp) return out;
      const xs = fp.map((q) => q[0]);
      const ys = fp.map((q) => q[1]);
      for (let ty = Math.floor(p.y + Math.min(...ys)); ty <= Math.floor(p.y + Math.max(...ys)); ty++)
        for (let tx = Math.floor(p.x + Math.min(...xs)); tx <= Math.floor(p.x + Math.max(...xs)); tx++) if (w.inBounds(tx, ty) && inPoly(tx + 0.5 - p.x, ty + 0.5 - p.y, fp)) out.push(ty * w.w + tx);
      if (!out.length && w.inBounds(Math.floor(p.x), Math.floor(p.y))) out.push(Math.floor(p.y) * w.w + Math.floor(p.x));
      return out;
    }
    const def = PROPS[p.type];
    const rect = def.rectByAngle ? def.rectByAngle[p.angleIdx] : def.rect;
    if (rect) {
      const [rw, rh] = rect;
      for (let ty = Math.floor(p.y - rh / 2 + 0.01); ty < Math.ceil(p.y + rh / 2 - 0.01); ty++) for (let tx = Math.floor(p.x - rw / 2 + 0.01); tx < Math.ceil(p.x + rw / 2 - 0.01); tx++) if (w.inBounds(tx, ty)) out.push(ty * w.w + tx);
    } else if (def.block > 0) {
      const r = def.block;
      for (let ty = Math.floor(p.y - r); ty <= Math.floor(p.y + r); ty++) for (let tx = Math.floor(p.x - r); tx <= Math.floor(p.x + r); tx++) if (w.inBounds(tx, ty) && dist(tx + 0.5, ty + 0.5, p.x, p.y) <= r + 0.2) out.push(ty * w.w + tx);
    }
    return out;
  }

  /** A blocking prop's footprint off the way (the tiles no other blocking prop holds), or onto it. */
  unblock(p) {
    if (!p.block) return;
    const held = new Set();
    for (const q of this.world.props) if (q !== p && q.block) for (const i of this.tiles(q)) held.add(i);
    for (const i of this.tiles(p)) if (this.world.blocked[i] === 1 && !held.has(i)) this.world.blocked[i] = 0;
  }

  block(p) {
    if (!p.block) return;
    for (const i of this.tiles(p)) if (this.world.blocked[i] === 0) this.world.blocked[i] = 1;
  }

  /** A room's near wall fades while the fight is inside (renderer.js `cut`): its room's box, if it stands on one. */
  recut(p) {
    if (!p.sheet || !p.sheet.startsWith('mfWall')) return;
    const rooms = [...this.world.floorPlan.filter((q) => !q.runner), MUSTAFAR.junction];
    const r = rooms.find((q) => Math.abs(p.x - q.x) <= q.hw + 0.6 && Math.abs(p.y - q.y) <= q.hh + 0.6);
    p.cut = r ? [r.x - r.hw, r.y - r.hh, r.x + r.hw, r.y + r.hh] : undefined;
  }

  /** After props change: the walls' joints and the renderer's order (the list's order stays: it is the layers'). */
  resort() {
    this.rejoin();
    this.renderer.propOrder = null;
  }

  /** The walls' joints worked out again (worldgen.js joinWalls: a shared pillar drawn once), the changed re-placed. */
  rejoin() {
    const w = this.world;
    if (!w.joinWalls) return;
    const was = new Map(w.props.map((p) => [p, p.trim ? p.trim.join() : '']));
    w.joinWalls();
    for (const p of w.props) if ((p.trim ? p.trim.join() : '') !== was.get(p)) this.renderer.placeProp(p);
  }

  homeOf(o) {
    if (o.home) for (const k of Object.keys(o.home)) if (k !== 'hidden') o.home[k] = o[k];
  }

  /** A new prop at (x, y): set like the map's others of its sprite (its layer, block), else standing; at its layer's front. */
  add(it, x, y) {
    const w = this.world;
    const like = w.props.find((q) => (it.sheet ? q.sheet === it.sheet || q.sheet === twinOf(it.sheet) : q.type === it.type));
    let p;
    if (it.sheet) {
      const flat = like ? !!like.flat : false;
      p = w.addSheetProp(it.sheet, x, y, { noBlock: true, flat });
      if (!p) return null;
      p.block = like ? !!like.block : it.sheet.startsWith('cg');
      if (like && like.top) p.top = true;
    } else {
      const def = PROPS[it.type];
      // (World's own: the Mustafar world's addProp would turn a model rock into a rock sprite)
      p = w.own(() => World.prototype.addProp.call(w, it.type, x, y, { noBlock: true, variant: 0, angleIdx: 0 }), { noBlock: true });
      if (!p) return null;
      p.block = like ? !!like.block : !def.flat && !!(def.rect || def.rectByAngle || def.block > 0);
    }
    // a table's top, as the map's other one has it (turned with the sprite if that one is the other way)
    if (like && like.surface && it.sheet) {
      const s = like.surface;
      const t = { x0: s.x0 - like.x + x, y0: s.y0 - like.y + y, x1: s.x1 - like.x + x, y1: s.y1 - like.y + y, z: s.z };
      if (like.sheet !== it.sheet) this.turnTop(t, x, y);
      w.surfaces.push(t);
      Object.defineProperty(p, 'surface', { value: t, configurable: true, writable: true });
    }
    this.block(p);
    this.recut(p);
    this.renderer.placeProp(p);
    this.resort();
    return p;
  }

  /** A raised top turned with its sprite (x ↔ y about the piece's middle). */
  turnTop(t, x, y) {
    const [hx, hy] = [(t.x1 - t.x0) / 2, (t.y1 - t.y0) / 2];
    const [cx, cy] = [(t.x0 + t.x1) / 2 - x, (t.y0 + t.y1) / 2 - y];
    [t.x0, t.x1, t.y0, t.y1] = [x + cy - hy, x + cy + hy, y + cx - hx, y + cx + hx];
  }

  /** A prop off the map, with its own lights (and its raised top, unless `keepTop`: it is being turned). */
  drop(p, keepTop = false) {
    const w = this.world;
    if (p.surface && !keepTop && w.surfaces.includes(p.surface)) w.surfaces.splice(w.surfaces.indexOf(p.surface), 1);
    this.unblock(p);
    const i = w.props.indexOf(p);
    if (i >= 0) w.props.splice(i, 1);
    for (let k = w.lights.length - 1; k >= 0; k--) if (w.lights[k].of === p) w.lights.splice(k, 1);
    this.renderer.propOrder = null;
  }

  /** A prop to (x, y), its own lights with it. */
  place(p, x, y) {
    const dx = x - p.x;
    const dy = y - p.y;
    if (!dx && !dy) return;
    for (const l of this.world.lights)
      if (l.of === p) {
        l.x += dx;
        l.y += dy;
      }
    if (p.surface) {
      p.surface.x0 += dx;
      p.surface.x1 += dx;
      p.surface.y0 += dy;
      p.surface.y1 += dy;
    }
    p.x = x;
    p.y = y;
    p.depth = x + y;
    this.homeOf(p);
    this.renderer.placeProp(p);
  }

  // ----------------------------------------------------------------------------------------------------- undo

  snapshot() {
    const w = this.world;
    return {
      props: w.props.slice(),
      ps: w.props.map((p) => ({ x: p.x, y: p.y, angleIdx: p.angleIdx, variant: p.variant, frameIdx: p.frameIdx, block: p.block, flat: p.flat, top: p.top, cut: p.cut, clip: p.clip, order: p.order, depth: p.depth })),
      lights: w.lights.slice(),
      ls: w.lights.map((l) => ({ x: l.x, y: l.y, z: l.z, r: l.r, g: l.g, b: l.b, rad: l.rad, flicker: l.flicker })),
      homes: new Map([...w.props, ...w.lights].filter((o) => o.home).map((o) => [o, { ...o.home }])),
      surfaces: w.surfaces.slice(),
      ss: w.surfaces.map((t) => ({ ...t })),
      blocked: w.blocked.slice(),
      biome: w.biome.slice(),
      rooms: w.floorPlan.slice(),
      rs: w.floorPlan.map((R) => ({ ...R })),
    };
  }

  restore(s) {
    const w = this.world;
    w.props.length = 0;
    w.props.push(...s.props);
    s.props.forEach((p, i) => Object.assign(p, s.ps[i]));
    w.lights.length = 0;
    w.lights.push(...s.lights);
    s.lights.forEach((l, i) => Object.assign(l, s.ls[i]));
    for (const [o, h] of s.homes) o.home = { ...h };
    w.blocked.set(s.blocked);
    const roomsNow = JSON.stringify(w.floorPlan);
    w.floorPlan.length = 0;
    w.floorPlan.push(...s.rooms);
    s.rooms.forEach((R, i) => {
      for (const k of Object.keys(R)) delete R[k];
      Object.assign(R, s.rs[i]);
    });
    if (s.biome.some((b, i) => b !== w.biome[i]) || JSON.stringify(w.floorPlan) !== roomsNow) {
      w.biome.set(s.biome);
      this.rebuildGround();
    }
    if (this.selRoom && !w.floorPlan.includes(this.selRoom)) this.selRoom = null;
    this.showRoom(true);
    w.surfaces.length = 0;
    w.surfaces.push(...s.surfaces);
    s.surfaces.forEach((t, i) => Object.assign(t, s.ss[i]));
    for (const p of w.props) this.renderer.placeProp(p);
    this.resort();
    if (this.sel && !w.props.includes(this.sel)) this.select(null);
    if (this.selLight && !w.lights.includes(this.selLight)) this.selLight = null;
    this.showLight();
    this.status();
  }

  /** The state before a change, kept to undo it. */
  commit(before) {
    this.undo.push(before);
    if (this.undo.length > UNDO_MAX) this.undo.shift();
    this.redo.length = 0;
    this.dirty = true;
    this.status();
  }

  undoStep() {
    const s = this.undo.pop();
    if (!s) return;
    this.redo.push(this.snapshot());
    this.restore(s);
    this.dirty = true;
  }

  redoStep() {
    const s = this.redo.pop();
    if (!s) return;
    this.undo.push(this.snapshot());
    this.restore(s);
    this.dirty = true;
  }

  // -------------------------------------------------------------------------------------------------- actions

  select(p) {
    this.sel = p;
    this.showProp();
    this.status();
  }

  remove() {
    const w = this.world;
    if (this.mode === 'light' && this.selLight) {
      if (Object.values(w.named || {}).includes(this.selLight)) return this.say('결투 연출에 쓰이는 조명이라 지울 수 없습니다 (옮기기만)');
      const before = this.snapshot();
      w.lights.splice(w.lights.indexOf(this.selLight), 1);
      this.selLight = null;
      this.showLight();
      return this.commit(before);
    }
    if (this.mode === 'room') {
      const R = this.selRoom;
      if (!R) return;
      const before = this.snapshot();
      w.floorPlan.splice(w.floorPlan.indexOf(R), 1);
      this.selRoom = null;
      this.rebuildGround();
      this.commit(before);
      this.showRoom();
      return this.status();
    }
    const p = this.sel;
    if (!p) return;
    if (Object.values(w.named || {}).includes(p)) return this.say('결투 연출에 쓰이는 소품이라 지울 수 없습니다 (옮기기만)');
    const before = this.snapshot();
    this.drop(p);
    this.rejoin();
    this.select(null);
    this.commit(before);
  }

  /** R: a set sprite to its mirrored twin (the same piece turned the other way), a model to its next angle. */
  rotate() {
    const p = this.sel;
    if (!p) return;
    const before = this.snapshot();
    if (p.sheet) {
      const twin = this.twin(p.sheet);
      if (!twin) return this.say(`${p.sheet}: 다른 방향 스프라이트를 만들 수 없습니다`);
      const flags = { flat: p.flat, top: p.top, block: p.block };
      const at = this.world.props.indexOf(p); // (its place in the layers kept)
      this.drop(p, true);
      const q = this.world.addSheetProp(twin, p.x, p.y, { noBlock: true, flat: flags.flat });
      this.world.props.splice(this.world.props.indexOf(q), 1);
      this.world.props.splice(at, 0, q);
      q.block = flags.block;
      if (flags.top) q.top = true;
      if (p.clip) q.clip = [p.clip[1], p.clip[0]]; // (its ends the other way round in the mirrored image)
      if (p.order) q.order = p.order;
      if (p.surface) {
        this.turnTop(p.surface, p.x, p.y);
        Object.defineProperty(q, 'surface', { value: p.surface, configurable: true, writable: true });
      }
      for (const [k, v] of Object.entries(this.world.named || {})) if (v === p) ((this.world.named[k] = q), this.world.keepHome(q));
      this.block(q);
      this.recut(q);
      this.renderer.placeProp(q);
      this.resort();
      this.select(q);
    } else {
      const n = (PROPS[p.type].angles || [0]).length;
      if (n < 2) return this.say(`${p.type}: 방향이 하나뿐입니다`);
      return this.setAngle((p.angleIdx + 1) % n);
    }
    this.commit(before);
  }

  /** A set sprite's other way round, loaded (its mirror image made now if it has no baked twin); null if none. */
  twin(name) {
    const t = twinOf(name);
    if (!cityFootprint(t)) {
      const city = this.assets.city;
      if (!city[t] && t.endsWith(MIRROR_SUFFIX)) addMirror(city, name);
      if (!city[t]) return null;
      setCityFootprints(city);
    }
    return t;
  }

  /** V: a model's next variant. */
  variant() {
    const p = this.sel;
    if (!p || p.sheet) return;
    const def = PROPS[p.type];
    if ((def.variants || 1) < 2) return this.say(`${p.type}: 변형이 하나뿐입니다`);
    this.setVariant((p.variant + 1) % def.variants);
  }

  setVariant(v) {
    const p = this.sel;
    if (!p || p.sheet || v === p.variant) return;
    const before = this.snapshot();
    const n = (PROPS[p.type].angles || [0]).length;
    p.variant = v;
    p.frameIdx = p.variant * n + p.angleIdx;
    this.renderer.placeProp(p);
    this.commit(before);
  }

  /** A model turned to its angle `i` (its footprint with it). */
  setAngle(i) {
    const p = this.sel;
    if (!p || p.sheet || i === p.angleIdx) return;
    const before = this.snapshot();
    const n = (PROPS[p.type].angles || [0]).length;
    this.unblock(p);
    p.angleIdx = i;
    p.frameIdx = p.variant * n + p.angleIdx;
    this.block(p);
    this.renderer.placeProp(p);
    this.commit(before);
  }

  /** A prop to a typed position, as a drag puts it (its footprint, its room's wall cut, the order). */
  moveTo(p, x, y) {
    const before = this.snapshot();
    this.unblock(p);
    this.place(p, x, y);
    this.block(p);
    this.recut(p);
    this.resort();
    this.commit(before);
  }

  /** B: whether the selected prop blocks its footprint. */
  toggleBlock() {
    const p = this.sel;
    if (!p) return;
    const before = this.snapshot();
    if (p.block) this.unblock(p);
    p.block = !p.block;
    this.block(p);
    this.commit(before);
    this.say(p.block ? '막음: 발밑 칸을 지나갈 수 없습니다' : '막지 않음');
  }

  /** F: the next layer (바닥 → 서 있음 → 맨 위 → 바닥). */
  cycleTier() {
    if (!this.sel) return;
    this.setTier(TIERS[(TIERS.indexOf(tierOf(this.sel)) + 1) % TIERS.length]);
  }

  /** Paint the brush's tiles round (x, y) with the tile mode's tile: the ground's way with it (TILES ground). */
  paintTile(x, y) {
    const w = this.world;
    const t = TILES.find((q) => q.b === this.tile);
    const n = this.brush.size;
    const x0 = Math.floor(x - (n - 1) / 2);
    const y0 = Math.floor(y - (n - 1) / 2);
    for (let ty = y0; ty < y0 + n; ty++)
      for (let tx = x0; tx < x0 + n; tx++) {
        if (!w.inBounds(tx, ty)) continue;
        const i = ty * w.w + tx;
        if (w.biome[i] === t.b) continue;
        w.biome[i] = t.b;
        if (t.ground) w.blocked[i] = 2;
        else if (w.blocked[i] === 2) w.blocked[i] = 0;
        this.drag.changed = true;
      }
  }

  /** The ground drawn again from the tiles (a new Terrain: gfx/terrain.js reads the biome once, in its chunks). */
  rebuildGround() {
    const w = this.world;
    const r = this.renderer;
    if (w.terrain && w.terrain.pool) {
      w.terrain.pool.close();
      w.terrain.pool = null;
    }
    w.terrain = null;
    r.setWorld();
  }

  /** Paint the brush's tiles round (x, y): `v` 1 blocked, 0 walkable. */
  paint(x, y, v) {
    const w = this.world;
    const n = this.brush.size;
    const x0 = Math.floor(x - (n - 1) / 2);
    const y0 = Math.floor(y - (n - 1) / 2);
    for (let ty = y0; ty < y0 + n; ty++)
      for (let tx = x0; tx < x0 + n; tx++) {
        if (!w.inBounds(tx, ty)) continue;
        const i = ty * w.w + tx;
        if (v ? w.blocked[i] === 0 : w.blocked[i] !== 0) {
          w.blocked[i] = v;
          this.drag.changed = true;
        }
      }
  }

  save() {
    const text = mapText(this.world.toMap());
    this.dirty = false;
    // this browser keeps it: the next load plays the edited map, in a build too (world/mapStore.js)
    const kept = saveLocal(text);
    // `npm run dev`: straight over public/maps/mustafar.json as well (vite.config.js mapSave)
    if (import.meta.env.DEV) {
      fetch('/__map/mustafar', { method: 'POST', body: text })
        .then((r) => {
          if (!r.ok) throw new Error(r.status);
          this.say('저장됨 — public/maps/mustafar.json 에 바로 반영');
          this.status();
        })
        .catch(() => {
          if (kept) this.say('이 브라우저에 저장됨 (맵 파일에는 못 씀 — 파일 받기로 옮기세요)');
          else this.download(text);
        });
    } else if (kept) this.say('이 브라우저에 저장됨 — 다시 열어도 이 맵 · 저장소에 넣으려면 파일 받기');
    else this.download(text);
    this.status();
    return text;
  }

  /**
   * The map file to the user: what goes into the repository (public/maps/mustafar.json). In the claude.ai artifact
   * the page may not download on its own, so the file goes through the viewer's `downloads` capability (a save
   * prompt); elsewhere a plain download.
   */
  async download(text) {
    const dl = window.claude && typeof window.claude.use === 'function' ? await window.claude.use('downloads').catch(() => null) : null;
    if (dl) {
      try {
        await dl.save({ filename: 'mustafar.json', data: text });
        this.say('mustafar.json 저장됨 — public/maps/mustafar.json 에 덮어쓰거나 채팅에 올리면 저장소에 반영');
      } catch (e) {
        const code = e && e.code;
        if (code === 'declined') this.say('파일 저장을 취소했습니다');
        else if (code === 'unavailable' || code === 'not_granted') this.copy(text, '이 화면에선 파일 저장이 안 됩니다 — ');
        else this.say('파일 저장 실패: ' + (e && e.message ? e.message : code || e));
      }
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = 'mustafar.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    this.say('mustafar.json 내려받음 — public/maps/mustafar.json 에 덮어쓰면 저장소에 반영');
  }

  /** The map file's text to the clipboard (when no save works: paste it into the chat or a file). */
  async copy(text, why = '') {
    try {
      await navigator.clipboard.writeText(text);
      this.say(why + '맵 JSON을 클립보드에 복사했습니다 — 채팅이나 파일에 붙여 넣으세요');
    } catch {
      this.say(why + '클립보드 복사도 안 됩니다');
    }
  }

  /** Drop the browser's saved copy and load the map file again (the page reloads). */
  revert() {
    if (!hasLocal() && !this.dirty) return this.say('브라우저 저장본이 없습니다 — 이미 파일 그대로');
    if (!confirm('이 브라우저에 저장한 맵을 지우고 맵 파일대로 다시 불러올까요?' + (this.dirty ? '\n(저장 안 한 변경도 사라집니다)' : ''))) return;
    clearLocal();
    this.dirty = false;
    location.reload();
  }

  say(msg) {
    this.toast = { msg, t: 2.6 };
  }

  // ------------------------------------------------------------------------------------------------ play-test

  /** The walkable tile nearest (x, y) (its middle), within a few tiles; else none. */
  walkableNear(x, y) {
    const w = this.world;
    let best = null;
    let bd = Infinity;
    for (let ty = Math.floor(y) - 8; ty <= Math.floor(y) + 8; ty++)
      for (let tx = Math.floor(x) - 8; tx <= Math.floor(x) + 8; tx++) {
        if (w.isBlocked(tx + 0.5, ty + 0.5)) continue;
        const d = Math.hypot(tx + 0.5 - x, ty + 0.5 - y);
        if (d < bd) [bd, best] = [d, { x: tx + 0.5, y: ty + 0.5 }];
      }
    return best;
  }

  /** P: play the map from where the view is — the player alone, everything else held (game.mapTest). */
  startTest() {
    if (!this.on || this.testing) return;
    const g = this.game;
    const p = g.player;
    const spot = this.walkableNear(this.focus.x, this.focus.y);
    if (!spot) return this.say('여기 근처에는 걸을 수 있는 칸이 없습니다');
    this.drag = null;
    this.keys.clear();
    // as things are, to come back to (the player whole: a shallow copy of his state)
    this.held = { p: { ...p }, locked: g.duel && g.duel.locked, god: g.cheats && g.cheats.god };
    p.x = spot.x;
    p.y = spot.y;
    p.z = this.world.groundAt ? this.world.groundAt(spot.x, spot.y) : 0;
    p.vz = 0;
    p.action = p.path = p.queued = null;
    p.scripted = p.hidden = false;
    p.stun = 0;
    p.choke = null;
    p.saberOut = false;
    if (g.duel) g.duel.locked = false;
    if (g.cheats) g.cheats.god = true;
    g.mapTest = true;
    this.testing = true;
    g.camFocus = null;
    this.renderer.editing = false;
    this.dom.classList.add('hidden');
    this.canvas.classList.add('hidden');
    this.testBar.classList.remove('hidden');
  }

  /** Back from the play-test: the player and the duel as they were; the editor's view where he walked (`back`). */
  endTest(back = true) {
    if (!this.testing) return;
    const g = this.game;
    const p = g.player;
    const at = { x: p.x, y: p.y };
    Object.assign(p, this.held.p);
    if (g.duel) g.duel.locked = this.held.locked;
    if (g.cheats) g.cheats.god = this.held.god;
    g.mapTest = false;
    this.testing = false;
    this.testBar.classList.add('hidden');
    if (!back) return;
    this.focus.x = at.x;
    this.focus.y = at.y;
    g.camFocus = this.focus;
    this.renderer.editing = true;
    this.renderer.propOrder = null;
    this.dom.classList.remove('hidden');
    this.canvas.classList.remove('hidden');
    this.status();
  }

  // ---------------------------------------------------------------------------------------------------- input

  keydown(e) {
    const k = keyOf(e);
    if (k === 'f2') {
      e.preventDefault();
      e.stopImmediatePropagation();
      this.toggle();
      return;
    }
    if (!this.on) return;
    if (this.testing) {
      // the play-test: the game's own keys, but P (back to the editor)
      if (k === 'p' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (!e.repeat) this.endTest();
      }
      return;
    }
    if (k === 'f5') return; // (the graphics switch still works)
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') {
      // typing in the panel: its own keys; Enter (a typed number: its change) or Esc gives the keys back
      if (k === 'escape' || (k === 'enter' && e.target.type !== 'search')) e.target.blur();
      e.stopImmediatePropagation();
      return;
    }
    e.stopImmediatePropagation();
    if (k !== 'f12') e.preventDefault();
    if (e.key === 'Shift') this.shift = true;
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl) {
      if (k === 'z' && !e.shiftKey) this.undoStep();
      else if (k === 'y' || (k === 'z' && e.shiftKey)) this.redoStep();
      else if (k === 's') this.save();
      return;
    }
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
      this.keys.add(k);
      return;
    }
    if (e.repeat) return;
    switch (k) {
      case 'escape':
        if (this.addingRoom) ((this.addingRoom = false), this.showRoom(), this.status());
        else if (this.mode === 'room' && this.selRoom) ((this.selRoom = null), this.showRoom(), this.status());
        else if (this.palette) this.pickPalette(null);
        else if (this.sel) this.select(null);
        else if (this.selLight) ((this.selLight = null), this.showLight());
        else this.close();
        break;
      case 'delete':
      case 'backspace':
        this.remove();
        break;
      case 'r':
        this.rotate();
        break;
      case 'v':
        this.variant();
        break;
      case 'b':
        this.toggleBlock();
        break;
      case 'f':
        this.cycleTier();
        break;
      case 'p':
        this.startTest();
        break;
      case ',':
        this.moveLayer(e.shiftKey ? 'bottom' : 'back');
        break;
      case '.':
        this.moveLayer(e.shiftKey ? 'front' : 'fwd');
        break;
      case '1':
        this.setMode('prop');
        break;
      case '2':
        this.setMode('brush');
        break;
      case '3':
        this.setMode('light');
        break;
      case '4':
        this.setMode('tile');
        break;
      case '5':
        this.setMode('room');
        break;
      case '[':
        this.setBrush(this.brush.size - 1);
        break;
      case ']':
        this.setBrush(this.brush.size + 1);
        break;
      case '=':
      case '+':
        this.zoomBy(1.25);
        break;
      case '-':
        this.zoomBy(0.8);
        break;
      default:
        break;
    }
  }

  wheel(e) {
    e.preventDefault();
    this.zoomBy(e.deltaY < 0 ? 1.25 : 0.8);
  }

  zoomBy(f) {
    const r = this.renderer;
    // a whole pixel scale a step (the renderer's): on to the next scale either way
    const s = r.devScale;
    let z = r.zoom;
    for (let i = 0; i < 40 && r.scaleFor(z) === s; i++) z *= f;
    r.setZoom(z, true);
  }

  down(e) {
    this.canvas.setPointerCapture(e.pointerId);
    this.mx = e.clientX;
    this.my = e.clientY;
    this.shift = e.shiftKey;
    const m = this.at(e.clientX, e.clientY);
    this.cursor = m;
    const pan = e.button === 1 || (e.button === 2 && this.mode !== 'brush');
    if (this.mode === 'room' && !pan) {
      if (e.button !== 0) return;
      if (this.addingRoom) return this.addRoom(m.x, m.y);
      const corner = this.roomCornerAt(e.clientX, e.clientY);
      if (corner) {
        const R = this.selRoom;
        this.drag = { room: R, corner, w0: m, r0: { ...R }, before: this.snapshot(), moved: false };
        return;
      }
      const R = this.roomAt(m.x, m.y);
      this.selRoom = R;
      this.showRoom(true);
      this.status();
      if (R) this.drag = { room: R, w0: m, r0: { ...R }, before: this.snapshot(), moved: false };
      return;
    }
    if (this.mode === 'tile' && !pan) {
      if (e.button !== 0) return;
      this.drag = { tile: true, before: this.snapshot(), changed: false, at: performance.now() };
      this.paintTile(m.x, m.y);
      return;
    }
    if (pan) {
      if (e.button === 2 && this.mode === 'prop' && this.palette) return this.pickPalette(null); // (right click: stop placing)
      this.drag = { pan: true, x: e.clientX, y: e.clientY, fx: this.focus.x, fy: this.focus.y, moved: false };
      return;
    }
    if (this.mode === 'brush') {
      this.drag = { brush: true, v: e.button === 2 ? 0 : 1, before: this.snapshot(), changed: false };
      this.paint(m.x, m.y, this.drag.v);
      return;
    }
    if (e.button !== 0) return;
    if (this.mode === 'light') {
      const l = this.lightAt(e.clientX, e.clientY);
      const before = this.snapshot();
      if (l) {
        this.selLight = l;
        this.drag = { light: l, w0: m, x0: l.x, y0: l.y, before, moved: false };
      } else {
        const x = this.shift ? m.x : snap(m.x);
        const y = this.shift ? m.y : snap(m.y);
        const nl = this.world.mapLight({ x, y, z: 1.5, r: 255, g: 140, b: 60, rad: 150, flicker: 0.05 });
        this.world.lights.push(nl);
        this.selLight = nl;
        this.commit(before);
      }
      this.showLight();
      this.status();
      return;
    }
    // props
    if (this.palette) {
      const before = this.snapshot();
      const x = this.shift ? m.x : snap(m.x);
      const y = this.shift ? m.y : snap(m.y);
      if (this.add(this.palette, x, y)) this.commit(before);
      return;
    }
    const p = this.propAt(m.ix, m.iy);
    this.select(p);
    if (p) this.drag = { prop: p, w0: m, x0: p.x, y0: p.y, before: this.snapshot(), moved: false };
  }

  move(e) {
    this.mx = e.clientX;
    this.my = e.clientY;
    this.shift = e.shiftKey;
    const m = this.at(e.clientX, e.clientY);
    this.cursor = m;
    const d = this.drag;
    if (!d) {
      this.hover = this.mode === 'prop' && !this.palette ? this.propAt(m.ix, m.iy) : null;
      this.status();
      return;
    }
    if (d.pan) {
      const r = this.renderer;
      // the view moved by the drag: the focus by its screen offset in world terms
      const a = r.screenToWorldPos(d.x, d.y);
      const b = r.screenToWorldPos(e.clientX, e.clientY);
      this.focus.x += a.x - b.x;
      this.focus.y += a.y - b.y;
      d.x = e.clientX;
      d.y = e.clientY;
      return;
    }
    if (d.brush) return this.paint(m.x, m.y, d.v);
    if (d.tile) {
      this.paintTile(m.x, m.y);
      if (d.changed && performance.now() - d.at > 400) {
        // (the ground redrawn as the stroke goes, a few times a second)
        d.at = performance.now();
        this.rebuildGround();
      }
      return;
    }
    let dx = m.x - d.w0.x;
    let dy = m.y - d.w0.y;
    if (!this.shift) [dx, dy] = [snap(dx), snap(dy)]; // (by half tiles: a prop keeps its offset from the grid)
    if (d.room) {
      const R = d.room;
      const r0 = d.r0;
      if (d.corner) {
        // the corner dragged: the opposite one stays
        const [cx, cy] = d.corner;
        const ox = r0.x - cx * r0.hw;
        const oy = r0.y - cy * r0.hh;
        const nx = r0.x + cx * r0.hw + dx;
        const ny = r0.y + cy * r0.hh + dy;
        const hw = Math.max(0.5, Math.abs(nx - ox) / 2);
        const hh = Math.max(0.5, Math.abs(ny - oy) / 2);
        R.hw = hw;
        R.hh = hh;
        R.x = ox + cx * hw;
        R.y = oy + cy * hh;
      } else {
        R.x = r0.x + dx;
        R.y = r0.y + dy;
      }
      d.moved = d.moved || !!(dx || dy);
      this.showRoom();
      this.status();
      return;
    }
    if (d.light) {
      d.light.x = d.x0 + dx;
      d.light.y = d.y0 + dy;
      this.homeOf(d.light);
      d.moved = d.moved || dx !== 0 || dy !== 0;
      this.status();
      return;
    }
    if (d.prop) {
      const p = d.prop;
      if (!d.moved && (dx || dy)) this.unblock(p); // (its footprint off the way while it moves)
      if (dx || dy) d.moved = true;
      if (d.moved) this.place(p, d.x0 + dx, d.y0 + dy);
      this.status();
    }
  }

  up() {
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    if (d.brush && d.changed) this.commit(d.before);
    if (d.tile && d.changed) {
      this.rebuildGround();
      this.commit(d.before);
    }
    if (d.light && d.moved) this.commit(d.before);
    if (d.room && d.moved) {
      this.rebuildGround();
      this.commit(d.before);
    }
    if (d.prop && d.moved) {
      this.block(d.prop);
      this.recut(d.prop);
      this.resort();
      this.commit(d.before);
    }
  }

  // ----------------------------------------------------------------------------------------------------- draw

  /** Each frame, after the world is drawn: the view's keys, then the editor's marks over the picture. */
  draw(dt) {
    if (!this.holds) return;
    // pan with the keys
    let kx = 0;
    let ky = 0;
    if (this.keys.has('a') || this.keys.has('arrowleft')) kx--;
    if (this.keys.has('d') || this.keys.has('arrowright')) kx++;
    if (this.keys.has('w') || this.keys.has('arrowup')) ky--;
    if (this.keys.has('s') || this.keys.has('arrowdown')) ky++;
    if (kx || ky) {
      const v = (PAN_SPEED * dt) / Math.max(0.3, this.renderer.zoom);
      // screen (sx, sy) to world: x = sx/2W + sy/2H, y = sy/2H − sx/2W (iso.js), W 20, H 10
      const sx = kx * v;
      const sy = ky * v;
      this.focus.x += sx / 40 + sy / 20;
      this.focus.y += sy / 20 - sx / 40;
    }
    const cv = this.canvas;
    const dpr = window.devicePixelRatio || 1;
    const W = window.innerWidth;
    const H = window.innerHeight;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
    }
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const r = this.renderer;
    const S = r.scale;
    const cam = r.cam;
    const P = (x, y, z = 0) => {
      const s = worldToScreen(x, y, z);
      return [(s.x - cam.x) * S, (s.y - cam.y) * S];
    };
    const diamond = (tx, ty, w = 1) => {
      const a = P(tx, ty);
      const b = P(tx + w, ty);
      const c = P(tx + w, ty + w);
      const d = P(tx, ty + w);
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.lineTo(c[0], c[1]);
      ctx.lineTo(d[0], d[1]);
      ctx.closePath();
    };
    const w = this.world;
    const m = this.cursor || this.at(this.mx, this.my);
    // the tiles in view
    const corners = [this.at(0, 0), this.at(W, 0), this.at(0, H), this.at(W, H)];
    const tx0 = Math.max(0, Math.floor(Math.min(...corners.map((c) => c.x))));
    const tx1 = Math.min(w.w - 1, Math.ceil(Math.max(...corners.map((c) => c.x))));
    const ty0 = Math.max(0, Math.floor(Math.min(...corners.map((c) => c.y))));
    const ty1 = Math.min(w.h - 1, Math.ceil(Math.max(...corners.map((c) => c.y))));

    if (this.mode === 'room') {
      // the rooms' rectangles (the pad dotted beyond the far sides), the selected one's corner handles
      for (const R of w.floorPlan) {
        const on = R === this.selRoom;
        const pad = R.pad || 0;
        ctx.beginPath();
        for (const [i, [x, y]] of [[R.x - R.hw, R.y - R.hh], [R.x + R.hw, R.y - R.hh], [R.x + R.hw, R.y + R.hh], [R.x - R.hw, R.y + R.hh]].entries()) {
          const [px, py] = P(x, y);
          if (i) ctx.lineTo(px, py);
          else ctx.moveTo(px, py);
        }
        ctx.closePath();
        ctx.fillStyle = on ? 'rgba(255,196,70,0.14)' : 'rgba(120,200,255,0.08)';
        ctx.fill();
        ctx.strokeStyle = on ? '#ffc446' : 'rgba(120,200,255,0.7)';
        ctx.lineWidth = on ? 2 : 1;
        ctx.stroke();
        if (pad) {
          ctx.beginPath();
          const a = P(R.x - R.hw - pad, R.y - R.hh - pad);
          const b = P(R.x + R.hw, R.y - R.hh - pad);
          const c = P(R.x - R.hw - pad, R.y + R.hh);
          ctx.moveTo(c[0], c[1]);
          ctx.lineTo(a[0], a[1]);
          ctx.lineTo(b[0], b[1]);
          ctx.setLineDash([4, 4]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        const [lx, ly] = P(R.x, R.y);
        ctx.fillStyle = on ? '#ffd98a' : 'rgba(180,220,255,0.9)';
        ctx.font = '11px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`방 ${w.floorPlan.indexOf(R) + 1}${R.runner ? ' (복도)' : ''} ${R.hw * 2}×${R.hh * 2}`, lx, ly + 4);
        ctx.textAlign = 'left';
        if (on)
          for (const sx of [-1, 1])
            for (const sy of [-1, 1]) {
              const [hx, hy] = P(R.x + sx * R.hw, R.y + sy * R.hh);
              ctx.fillStyle = '#ffc446';
              ctx.fillRect(hx - 4, hy - 4, 8, 8);
            }
      }
      if (this.addingRoom) {
        ctx.beginPath();
        diamond(Math.floor(snap(m.x)) - 3, Math.floor(snap(m.y)) - 3, 6);
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.setLineDash([3, 3]);
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.setLineDash([]);
      }
    } else if (this.mode === 'tile') {
      const n = this.brush.size;
      ctx.beginPath();
      diamond(Math.floor(m.x - (n - 1) / 2), Math.floor(m.y - (n - 1) / 2), n);
      ctx.fillStyle = TILES.find((q) => q.b === this.tile).color;
      ctx.globalAlpha = 0.35;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else if (this.mode === 'brush') {
      for (const [v, col] of [
        [1, 'rgba(255,170,40,0.38)'],
        [2, 'rgba(255,40,40,0.22)'],
      ]) {
        ctx.beginPath();
        for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) if (w.blocked[ty * w.w + tx] === v) diamond(tx, ty);
        ctx.fillStyle = col;
        ctx.fill();
      }
      const n = this.brush.size;
      ctx.beginPath();
      diamond(Math.floor(m.x - (n - 1) / 2), Math.floor(m.y - (n - 1) / 2), n);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else {
      // a faint grid round the cursor (tiles, and the half-tile snap)
      ctx.beginPath();
      const cx = Math.floor(m.x);
      const cy = Math.floor(m.y);
      for (let i = -6; i <= 7; i++) {
        let a = P(cx + i, cy - 6);
        let b = P(cx + i, cy + 7);
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        a = P(cx - 6, cy + i);
        b = P(cx + 7, cy + i);
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
      }
      ctx.strokeStyle = 'rgba(160,220,255,0.13)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    const outline = (p, col, lw) => {
      const f = p.frame;
      if (!f) return;
      const k = f.k || 1;
      ctx.strokeStyle = col;
      ctx.lineWidth = lw;
      ctx.strokeRect((p.sx - f.ox * k - cam.x) * S, (p.sy - f.oy * k - cam.y) * S, f.w * k * S, f.h * k * S);
      const [ax, ay] = P(p.x, p.y);
      ctx.beginPath();
      ctx.moveTo(ax - 6, ay);
      ctx.lineTo(ax, ay - 3);
      ctx.lineTo(ax + 6, ay);
      ctx.lineTo(ax, ay + 3);
      ctx.closePath();
      ctx.fillStyle = col;
      ctx.fill();
    };
    if (this.mode === 'prop') {
      if (this.hover && this.hover !== this.sel) outline(this.hover, 'rgba(255,255,255,0.45)', 1);
      if (this.sel) {
        if (this.sel.block) {
          ctx.beginPath();
          for (const i of this.tiles(this.sel)) diamond(i % w.w, Math.floor(i / w.w));
          ctx.fillStyle = 'rgba(255,170,40,0.3)';
          ctx.fill();
        }
        if (this.sel.surface) {
          // its raised top (walked on, at its height)
          const t = this.sel.surface;
          const c = [P(t.x0, t.y0, t.z), P(t.x1, t.y0, t.z), P(t.x1, t.y1, t.z), P(t.x0, t.y1, t.z)];
          ctx.beginPath();
          c.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
          ctx.closePath();
          ctx.fillStyle = 'rgba(90,220,255,0.18)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(90,220,255,0.8)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
        outline(this.sel, '#ffd25a', 2);
      }
      // the sprite to place, under the cursor
      if (this.palette) {
        const x = this.shift ? m.x : snap(m.x);
        const y = this.shift ? m.y : snap(m.y);
        const f = this.palette.frame;
        const k = f.k || 1;
        const s = worldToScreen(x, y);
        ctx.globalAlpha = 0.6;
        ctx.imageSmoothingEnabled = !!f.k;
        ctx.drawImage(f.page, f.sx, f.sy, f.w, f.h, (s.x - f.ox * k - cam.x) * S, (s.y - f.oy * k - cam.y) * S, f.w * k * S, f.h * k * S);
        ctx.globalAlpha = 1;
        const [ax, ay] = P(x, y);
        ctx.fillStyle = '#7fe0ff';
        ctx.fillRect(ax - 2, ay - 2, 4, 4);
      }
    }
    if (this.mode === 'light') {
      for (const l of w.lights) {
        const [x, y] = P(l.x, l.y, l.z);
        if (x < -400 || y < -400 || x > W + 400 || y > H + 400) continue;
        const [gx, gy] = P(l.x, l.y);
        const sel = l === this.selLight;
        ctx.globalAlpha = l.of ? 0.35 : 1;
        if (sel) {
          ctx.beginPath();
          ctx.arc(x, y, l.rad * S, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(255,255,255,0.5)';
          ctx.setLineDash([5, 4]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.beginPath();
        ctx.moveTo(gx, gy);
        ctx.lineTo(x, y);
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, sel ? 8 : 6, 0, Math.PI * 2);
        ctx.fillStyle = `rgb(${l.r | 0},${l.g | 0},${l.b | 0})`;
        ctx.fill();
        ctx.strokeStyle = sel ? '#ffd25a' : '#000';
        ctx.lineWidth = sel ? 2.5 : 1.5;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    // a message
    if (this.toast) {
      this.toast.t -= dt;
      if (this.toast.t <= 0) this.toast = null;
      else {
        ctx.font = '600 15px "Pretendard Variable", Pretendard, sans-serif';
        const tw = ctx.measureText(this.toast.msg).width;
        const x = (W + 280) / 2 - tw / 2;
        ctx.globalAlpha = Math.min(1, this.toast.t * 2);
        ctx.fillStyle = 'rgba(10,14,20,0.85)';
        ctx.fillRect(x - 14, 18, tw + 28, 34);
        ctx.fillStyle = '#e8f4ff';
        ctx.fillText(this.toast.msg, x, 40);
        ctx.globalAlpha = 1;
      }
    }
  }
}
