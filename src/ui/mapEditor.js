// The map editor (F2, the Mustafar duel only): the map's props, the way (blocked tiles) and the lights edited in place
// on the live world, saved as the map file (public/maps/mustafar.json: worldgen.js MustafarArena.toMap / mapText).
//
//   소품 (1)   the panel's sprites: pick one, click the map to place it (again and again; Esc or the right button
//             stops); click a prop to select it, drag to move it; Delete removes it; R turns it (a set sprite: its
//             mirrored twin; a model: its next angle); V its model's next variant; B whether it blocks its
//             footprint; F flat (drawn with the ground, walked over) or standing
//   길 (2)     paint the tiles: the left button blocked, the right walkable; [ ] the brush's size
//   조명 (3)   click a light to select it, drag to move it, click the ground to add one; colour, radius, height and
//             flicker in the panel; Delete removes it (a prop's own lights go with their prop)
//
// Positions snap to a half tile (a dragged prop moves by half tiles, keeping its offset); Shift places freely.
// Ctrl+Z undoes, Ctrl+Y (Ctrl+Shift+Z) redoes, Ctrl+S saves (downloads the file). WASD / the arrows / the right or
// middle button drag the view, the wheel zooms. The game is paused while the editor is open.
import { World, MUSTAFAR, MUSTAFAR_SHEETS, mapText } from '../world/worldgen.js';
import { cityFootprint, inPoly } from '../world/cityProps.js';
import { PROPS } from '../gfx/models/props.js';
import { worldToScreen } from '../core/iso.js';
import { setUIHidden } from './uiHidden.js';
import { dist } from '../core/math.js';

const MIRROR = MUSTAFAR_SHEETS.mirror;
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
const hex = (r, g, b) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

export class MapEditor {
  constructor({ game, renderer, assets, onExit }) {
    this.game = game;
    this.renderer = renderer;
    this.assets = assets;
    this.onExit = onExit;
    this.on = false;
    this.mode = 'prop';
    this.palette = null; // the sprite picked to place: { sheet } or { type }
    this.sel = null; // the selected prop
    this.selLight = null;
    this.hover = null;
    this.drag = null;
    this.undo = [];
    this.redo = [];
    this.dirty = false;
    this.brush = { size: 1 };
    this.keys = new Set();
    this.mx = 0;
    this.my = 0;
    this.shift = false;
    this.pick1 = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    this.pick1.canvas.width = this.pick1.canvas.height = 1;
    window.addEventListener('keydown', (e) => this.keydown(e), true);
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.key.toLowerCase());
      if (e.key === 'Shift') this.shift = false;
    });
    window.addEventListener('blur', () => this.keys.clear());
  }

  get world() {
    return this.game.world;
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
        <button data-mode="prop">소품 <kbd>1</kbd></button><button data-mode="brush">길 <kbd>2</kbd></button><button data-mode="light">조명 <kbd>3</kbd></button>
      </div>
      <div class="me-body me-prop">
        <input class="me-search" type="search" placeholder="스프라이트 찾기…">
        <div class="me-sel"></div>
        <div class="me-list"></div>
      </div>
      <div class="me-body me-brush">
        <p>왼쪽 버튼: <b class="me-blk">막힘</b> · 오른쪽 버튼: <b class="me-walk">걷기 가능</b></p>
        <label>붓 크기 <input class="me-size" type="range" min="1" max="7" step="1" value="1"> <span class="me-size-v">1</span>칸 <kbd>[</kbd><kbd>]</kbd></label>
        <p class="me-note">주황: 소품이 막은 칸 · 빨강: 땅이 막은 칸(용암 · 바위 · 벽)</p>
      </div>
      <div class="me-body me-light">
        <p class="me-note">조명을 클릭해 선택 · 끌어서 이동 · 빈 곳을 클릭하면 새 조명</p>
        <div class="me-lprops">
          <label>색 <input class="me-lc" type="color"></label>
          <label>반경 <input class="me-lr" type="range" min="10" max="400" step="5"> <span class="me-lr-v"></span></label>
          <label>높이 <input class="me-lz" type="range" min="0" max="5" step="0.1"> <span class="me-lz-v"></span> m</label>
          <label>깜빡임 <input class="me-lf" type="range" min="0" max="0.5" step="0.01"> <span class="me-lf-v"></span></label>
          <button class="me-ldel">조명 삭제 <kbd>Del</kbd></button>
        </div>
      </div>
      <div class="me-foot">
        <div class="me-btns"><button class="me-undo" title="Ctrl+Z">↶ 되돌리기</button><button class="me-redo" title="Ctrl+Y">↷ 다시</button><button class="me-save" title="Ctrl+S">💾 JSON 저장</button></div>
        <div class="me-status"></div>
        <div class="me-help">클릭 배치 · 드래그 이동 · <kbd>Del</kbd> 삭제 · <kbd>R</kbd> 회전 · <kbd>V</kbd> 변형 · <kbd>B</kbd> 막기 · <kbd>F</kbd> 바닥형<br><kbd>Shift</kbd> 스냅 끄기 · <kbd>Ctrl+Z</kbd> 되돌리기 · <kbd>WASD</kbd>/우클릭 드래그 시점 · 휠 확대</div>
      </div>`;
    document.body.appendChild(dom);
    for (const e of ['pointerdown', 'wheel', 'contextmenu', 'mousedown']) dom.addEventListener(e, (ev) => ev.stopPropagation());
    dom.querySelector('.me-close').onclick = () => this.close();
    dom.querySelectorAll('.me-modes button').forEach((b) => (b.onclick = () => this.setMode(b.dataset.mode)));
    dom.querySelector('.me-undo').onclick = () => this.undoStep();
    dom.querySelector('.me-redo').onclick = () => this.redoStep();
    dom.querySelector('.me-save').onclick = () => this.save();
    const size = dom.querySelector('.me-size');
    size.oninput = () => this.setBrush(+size.value);
    dom.querySelector('.me-search').oninput = (e) => this.filter(e.target.value);
    this.buildPalette();
    this.buildLightPanel();

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
      .filter((n) => city[n] && city[n].body && cityFootprint(n))
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
    // one undo step a slider's whole drag
    for (const s of ['.me-lc', '.me-lr', '.me-lz', '.me-lf'])
      q(s).onchange = () => {
        if (this.lightEdit) this.commit(this.lightEdit);
        this.lightEdit = null;
      };
    q('.me-ldel').onclick = () => this.remove();
  }

  showLight() {
    const d = this.dom;
    const l = this.selLight;
    d.querySelector('.me-lprops').classList.toggle('off', !l);
    if (!l) return;
    d.querySelector('.me-lc').value = hex(l.r, l.g, l.b);
    d.querySelector('.me-lr').value = l.rad;
    d.querySelector('.me-lr-v').textContent = Math.round(l.rad);
    d.querySelector('.me-lz').value = l.z;
    d.querySelector('.me-lz-v').textContent = (+l.z).toFixed(1);
    d.querySelector('.me-lf').value = l.flicker;
    d.querySelector('.me-lf-v').textContent = (+l.flicker).toFixed(2);
  }

  setMode(m) {
    this.mode = m;
    this.drag = null;
    this.dom.querySelectorAll('.me-modes button').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
    for (const k of ['prop', 'brush', 'light']) this.dom.querySelector('.me-' + k).classList.toggle('hidden', k !== m);
    if (m !== 'prop') this.pickPalette(null);
    if (m !== 'light') this.selLight = null;
    this.showLight();
    this.status();
  }

  setBrush(n) {
    this.brush.size = Math.max(1, Math.min(7, n));
    this.dom.querySelector('.me-size').value = this.brush.size;
    this.dom.querySelector('.me-size-v').textContent = this.brush.size;
  }

  status() {
    if (!this.dom) return;
    const w = this.cursor || { x: 0, y: 0 };
    let t = `커서 ${w.x.toFixed(1)}, ${w.y.toFixed(1)} (칸 ${Math.floor(w.x)}, ${Math.floor(w.y)})`;
    const p = this.sel;
    if (this.mode === 'prop') {
      if (this.palette) t += ` · 배치: ${this.palette.sheet || this.palette.type}`;
      else if (p) t += ` · 선택: ${p.sheet || p.type} (${p.x.toFixed(2)}, ${p.y.toFixed(2)})${p.flat ? ' 바닥형' : ''}${p.block ? ' 막음' : ''}`;
    }
    if (this.mode === 'light' && this.selLight) t += ` · 조명 (${this.selLight.x.toFixed(2)}, ${this.selLight.y.toFixed(2)})`;
    t += this.dirty ? ' · 저장 안 됨' : '';
    this.dom.querySelector('.me-status').textContent = t;
    const sel = this.dom.querySelector('.me-sel');
    sel.textContent = p ? `선택: ${p.sheet || p.type}` : this.palette ? `배치할 소품: ${this.palette.sheet || this.palette.type} (Esc 해제)` : '소품을 고르거나 맵의 소품을 클릭';
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

  /** The prop drawn on top under game px (ix, iy): the standing ones front to back, then the flat ones. */
  propAt(ix, iy) {
    const props = this.world.props;
    const standing = props.filter((p) => !p.flat).sort((a, b) => (b.drawDepth ?? b.sortDepth) - (a.drawDepth ?? a.sortDepth));
    for (const p of standing) if (this.hit(p, ix, iy)) return p;
    for (let i = props.length - 1; i >= 0; i--) if (props[i].flat && this.hit(props[i], ix, iy)) return props[i];
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
    const r = [MUSTAFAR.hall, MUSTAFAR.control].find((q) => Math.abs(p.x - q.x) <= q.hw + 0.6 && Math.abs(p.y - q.y) <= q.hh + 0.6);
    p.cut = r ? [r.x - r.hw, r.y - r.hh, r.x + r.hw, r.y + r.hh] : undefined;
  }

  /** After props change: their order (the flat ones drawn in it) and the renderer's. */
  resort() {
    this.world.props.sort((a, b) => (a.over ? 1 : 0) - (b.over ? 1 : 0) || a.x + a.y - (b.x + b.y));
    this.renderer.propOrder = null;
  }

  homeOf(o) {
    if (o.home) for (const k of Object.keys(o.home)) if (k !== 'hidden') o.home[k] = o[k];
  }

  /** A new prop at (x, y): set like the map's others of its sprite (flat, over, block), else standing. */
  add(it, x, y) {
    const w = this.world;
    const like = w.props.find((q) => (it.sheet ? q.sheet === it.sheet || q.sheet === MIRROR[it.sheet] : q.type === it.type));
    let p;
    if (it.sheet) {
      const flat = like ? !!like.flat : false;
      p = w.addSheetProp(it.sheet, x, y, { noBlock: true, flat });
      if (!p) return null;
      p.block = like ? !!like.block : it.sheet.startsWith('cg');
      if (like && like.over) p.over = true;
    } else {
      const def = PROPS[it.type];
      // (World's own: the Mustafar world's addProp would turn a model rock into a rock sprite)
      p = w.own(() => World.prototype.addProp.call(w, it.type, x, y, { noBlock: true, variant: 0, angleIdx: 0 }), { noBlock: true });
      if (!p) return null;
      p.block = like ? !!like.block : !def.flat && !!(def.rect || def.rectByAngle || def.block > 0);
    }
    this.block(p);
    this.recut(p);
    this.renderer.placeProp(p);
    this.resort();
    return p;
  }

  /** A prop off the map, with its own lights. */
  drop(p) {
    const w = this.world;
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
      ps: w.props.map((p) => ({ x: p.x, y: p.y, angleIdx: p.angleIdx, variant: p.variant, frameIdx: p.frameIdx, block: p.block, flat: p.flat, over: p.over, cut: p.cut, depth: p.depth })),
      lights: w.lights.slice(),
      ls: w.lights.map((l) => ({ x: l.x, y: l.y, z: l.z, r: l.r, g: l.g, b: l.b, rad: l.rad, flicker: l.flicker })),
      homes: new Map([...w.props, ...w.lights].filter((o) => o.home).map((o) => [o, { ...o.home }])),
      blocked: w.blocked.slice(),
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
    const p = this.sel;
    if (!p) return;
    if (Object.values(w.named || {}).includes(p)) return this.say('결투 연출에 쓰이는 소품이라 지울 수 없습니다 (옮기기만)');
    const before = this.snapshot();
    this.drop(p);
    this.select(null);
    this.commit(before);
  }

  /** R: a set sprite to its mirrored twin (the same piece turned the other way), a model to its next angle. */
  rotate() {
    const p = this.sel;
    if (!p) return;
    const before = this.snapshot();
    if (p.sheet) {
      const twin = MIRROR[p.sheet];
      if (!twin || !cityFootprint(twin)) return this.say(`${p.sheet}: 다른 방향 스프라이트가 없습니다`);
      const flags = { flat: p.flat, over: p.over, block: p.block };
      this.drop(p);
      const q = this.world.addSheetProp(twin, p.x, p.y, { noBlock: true, flat: flags.flat });
      q.block = flags.block;
      if (flags.over) q.over = true;
      for (const [k, v] of Object.entries(this.world.named || {})) if (v === p) ((this.world.named[k] = q), this.world.keepHome(q));
      this.block(q);
      this.recut(q);
      this.renderer.placeProp(q);
      this.resort();
      this.select(q);
    } else {
      const n = (PROPS[p.type].angles || [0]).length;
      if (n < 2) return this.say(`${p.type}: 방향이 하나뿐입니다`);
      this.unblock(p);
      p.angleIdx = (p.angleIdx + 1) % n;
      p.frameIdx = p.variant * n + p.angleIdx;
      this.block(p);
      this.renderer.placeProp(p);
    }
    this.commit(before);
  }

  /** V: a model's next variant. */
  variant() {
    const p = this.sel;
    if (!p || p.sheet) return;
    const def = PROPS[p.type];
    if ((def.variants || 1) < 2) return this.say(`${p.type}: 변형이 하나뿐입니다`);
    const before = this.snapshot();
    const n = (def.angles || [0]).length;
    p.variant = (p.variant + 1) % def.variants;
    p.frameIdx = p.variant * n + p.angleIdx;
    this.renderer.placeProp(p);
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

  /** F: drawn with the ground (walked over: a catwalk, a table) or standing. */
  toggleFlat() {
    const p = this.sel;
    if (!p) return;
    const before = this.snapshot();
    p.flat = !p.flat;
    this.renderer.placeProp(p);
    this.resort();
    this.commit(before);
    this.say(p.flat ? '바닥형: 땅과 함께 그려짐' : '서 있는 소품');
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
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = 'mustafar.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    this.dirty = false;
    this.say('mustafar.json 저장됨 — public/maps/mustafar.json 에 덮어쓰면 반영됩니다');
    this.status();
    return text;
  }

  say(msg) {
    this.toast = { msg, t: 2.6 };
  }

  // ---------------------------------------------------------------------------------------------------- input

  keydown(e) {
    const k = e.key.toLowerCase();
    if (k === 'f2') {
      e.preventDefault();
      e.stopImmediatePropagation();
      this.toggle();
      return;
    }
    if (!this.on) return;
    if (k === 'f5') return; // (the graphics switch still works)
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') {
      if (k === 'escape') e.target.blur();
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
        if (this.palette) this.pickPalette(null);
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
        this.toggleFlat();
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
    let dx = m.x - d.w0.x;
    let dy = m.y - d.w0.y;
    if (!this.shift) [dx, dy] = [snap(dx), snap(dy)]; // (by half tiles: a prop keeps its offset from the grid)
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
    if (d.light && d.moved) this.commit(d.before);
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
    if (!this.on) return;
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

    if (this.mode === 'brush') {
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
