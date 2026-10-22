// Diablo-style controls:
//   LMB          move / attack (hold to keep moving or attacking)
//   Shift + LMB  attack in place
//   RMB          cast the right-button skill at the cursor (hold to repeat)
//   1-6          cast hotbar skill at the cursor
//   WASD walk · X saber on/off · E talk · P Star Cards · Q bacta · K skill tree · C character · Tab automap · M mute · H help · F1 hide/show all UI
//   F2 the map editor (the Mustafar duel: ui/mapEditor.js, its own keys while it is open)
import { SKILLS } from '../game/skills.js';
import { toggleUI } from '../ui/uiHidden.js';
import { remaster, setRemaster } from '../gfx/remaster.js';
import { dist } from '../core/math.js';
import { screenVecToWorldAngle } from '../core/iso.js';

// WASD walks in screen directions (W = up the screen)
const MOVE_KEYS = { w: [0, -1], a: [-1, 0], s: [0, 1], d: [1, 0] };
const MOVE_CODE = { KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd' };

// keys that still work while a panel or the title screen is open (they close or switch panels)
const PANEL_KEYS = new Set(['escape', ' ', 'enter', 'f1', 'h', 'tab', 'k', 't', 'c', 'p', 'v', 'o', 'f', 'm']);

export class Input {
  constructor(game, renderer, hud, audio, canvas) {
    this.game = game;
    this.renderer = renderer;
    this.hud = hud;
    this.audio = audio;
    this.mx = window.innerWidth / 2;
    this.my = window.innerHeight / 2;
    this.lmb = false;
    this.rmb = false;
    this.shift = false;
    this.holdT = 0;
    this.lmbTarget = null;
    this.moveKeys = new Set();

    canvas.addEventListener('mousedown', (e) => this.down(e));
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        this.lmb = false;
        this.lmbTarget = null;
      }
      if (e.button === 2) this.rmb = false;
    });
    window.addEventListener('mousemove', (e) => {
      this.mx = e.clientX;
      this.my = e.clientY;
    });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => this.key(e));
    window.addEventListener('keyup', (e) => {
      if (e.key === 'Shift') this.shift = false;
      this.moveKeys.delete(MOVE_CODE[e.code] || e.key.toLowerCase());
    });
    window.addEventListener('blur', () => {
      this.lmb = this.rmb = this.shift = false;
      this.moveKeys.clear();
    });
  }

  enemyUnderCursor() {
    return this.game.hover && this.game.hover.team === 'cis' && !this.game.hover.dead ? this.game.hover : null;
  }

  /** Nearest enemy to the cursor (assists enemy-targeted skills). */
  assistTarget() {
    const h = this.enemyUnderCursor();
    if (h) return h;
    const m = this.game.mouseWorld;
    let best = null;
    let bd = 2.2;
    for (const u of this.game.activeUnits) {
      if (u.dead || u.team !== 'cis') continue;
      const d = dist(u.x, u.y, m.x, m.y);
      if (d < bd) {
        bd = d;
        best = u;
      }
    }
    return best;
  }

  cast(id) {
    if (!id) return false;
    const m = this.game.mouseWorld;
    const s = SKILLS[id];
    const target = s.target === 'enemy' ? this.assistTarget() : this.enemyUnderCursor();
    const tx = target && s.target !== 'point' ? target.x : m.x;
    const ty = target && s.target !== 'point' ? target.y : m.y;
    return this.game.player.tryCast(id, tx, ty, target);
  }

  down(e) {
    this.audio.unlock();
    const g = this.game;
    const p = g.player;
    if (p.dead || (g.cinema && !g.mapTest) || g.talkingTo) return; // mid-conversation the world isn't clickable
    this.updateMouse();
    // the map editor's play-test (ui/mapEditor.js): walking only — no fight, no skills
    if (g.mapTest && e.button !== 0) return;
    if (e.button === 0) {
      if (this.hud.pendingSkill) {
        this.cast(this.hud.pendingSkill);
        this.hud.cancelTargeting();
        return;
      }
      this.lmb = true;
      this.holdT = 0;
      const t = g.mapTest ? null : this.enemyUnderCursor();
      if (g.hover && g.hover.npc && !g.mapTest) {
        this.lmb = false;
        p.commandTalk(g.hover);
      } else if (t) {
        this.lmbTarget = t;
        p.basicAttack(t);
      } else if (this.shift && !g.mapTest) {
        this.attackInPlace();
      } else {
        const m = g.mouseWorld;
        p.commandMove(m.x, m.y);
        this.renderer.addClickMark(m.x, m.y);
      }
    } else if (e.button === 2) {
      if (this.hud.pendingSkill) {
        this.hud.cancelTargeting();
        return;
      }
      this.rmb = true;
      this.castRmb();
    }
  }

  castRmb() {
    const p = this.game.player;
    const id = p.hotbar[p.rmbSlot];
    if (!id) {
      // no skill bound: right click acts as a basic attack on the hovered enemy
      const t = this.enemyUnderCursor();
      if (t) p.basicAttack(t);
      return;
    }
    this.cast(id);
  }

  attackInPlace() {
    const g = this.game;
    const p = g.player;
    const m = g.mouseWorld;
    let best = null;
    let bd = 2.4;
    for (const u of g.activeUnits) {
      if (u.dead || u.team !== 'cis') continue;
      const d = dist(u.x, u.y, p.x, p.y);
      if (d < bd) {
        bd = d;
        best = u;
      }
    }
    if (best) p.basicAttack(best, true);
    else if (!p.action) {
      p.faceTo(m.x, m.y);
      p.playAction(Math.random() < 0.5 ? 'attack1' : 'attack2', 1.15);
      g.audio.play('swing');
    }
  }

  key(e) {
    const g = this.game;
    const p = g.player;
    const hud = this.hud;
    if (e.key === 'Shift') this.shift = true;
    const mk = MOVE_CODE[e.code] || e.key.toLowerCase(); // (by the key's place: Korean input sends 'ㅈ' for W)
    if (MOVE_KEYS[mk] && !e.ctrlKey && !e.metaKey) {
      this.moveKeys.add(mk);
      return;
    }
    if (e.repeat && !/^[1-6]$/.test(e.key)) return;
    this.audio.unlock();
    const k = e.key.toLowerCase();
    if (k === 'f1') {
      // every bit of UI off (the HUD, panels' buttons, health bars and floating text, subtitles, the selection
      // ring) for a clean view of the game — in a cutscene too; again to bring it back
      e.preventDefault();
      toggleUI(g);
      return;
    }
    if (k === 'f11' && this.canFullscreen && this.canFullscreen()) {
      // the game's own fullscreen (the page alone, without the browser's or an embedding page's bars) — on every
      // screen, the duel too (F is its heavy attack there). Where the page may not go fullscreen (an embedding
      // page that does not allow it) the key is left to the browser's own F11
      e.preventDefault();
      if (this.onFullscreen) this.onFullscreen();
      return;
    }
    if (k === 'f5') {
      // classic ⇄ remastered graphics, at once (as StarCraft: Remastered's F5; gfx/remaster.js) — not a reload
      e.preventDefault();
      if (!remaster.allowed) {
        g.emit('log', '리마스터 그래픽은 무스타파 결투에서만 쓸 수 있습니다', 'sys');
        return;
      }
      const on = !remaster.on;
      setRemaster(on);
      g.emit('log', on ? '그래픽: 리마스터' : '그래픽: 클래식', 'sys');
      return;
    }
    if (g.cinema && !g.mapTest) {
      // cutscene: only skipping
      if (k === 'escape' || k === 'enter') g.cinema.skip();
      e.preventDefault();
      return;
    }
    if (this.dialogue && this.dialogue.key(k)) {
      e.preventDefault();
      return;
    }
    // typing in a panel's control (jukebox select, volume slider): not a hotkey
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    // a panel or the title screen is open: only the keys that work the panels
    const panelOpen = Object.values(hud.open).some(Boolean) || !document.getElementById('help').classList.contains('hidden');
    if (panelOpen && !PANEL_KEYS.has(k) && e.code !== 'Backquote') return;
    if (g.mapTest && (/^[1-6]$/.test(e.key) || k === ' ' || k === 'q' || k === 'x')) return; // (the play-test: walking only)
    // the lightsaber duel on the map (game/mapDuel.js): its keys are its controller's (F heavy, Space dodge, R restart…)
    if (g.duel && g.duel.keys && g.duel.keys.has(k) && !g.mapTest) {
      if (k === ' ' || k === 'f') e.preventDefault();
      return;
    }
    if (k === 'tab') {
      e.preventDefault();
      hud.toggle('map');
      return;
    }
    if (/^[1-6]$/.test(e.key)) {
      const i = +e.key - 1;
      if (hud.open.tree && hud.hoverSkill) {
        const id = hud.hoverSkill;
        if (p.skillLevel(id) && SKILLS[id].kind !== 'passive') {
          const prev = p.hotbar.indexOf(id);
          if (prev >= 0) p.hotbar[prev] = p.hotbar[i];
          p.hotbar[i] = id;
          this.audio.play('click');
        }
        return;
      }
      if (p.dead) return;
      this.updateMouse();
      this.cast(p.hotbar[i]);
      return;
    }
    if (e.code === 'Backquote') {
      hud.toggle('debug'); // debug panel (by key position: works on Korean layouts too)
      return;
    }
    switch (k) {
      case 'q':
        g.useBacta();
        break;
      case 'x':
        p.setSaber(!p.saberLit);
        break;
      case 'e': {
        const n = g.nearestNpc(4);
        if (n) p.commandTalk(n);
        break;
      }
      case 'k':
      case 't':
        hud.toggle('tree');
        break;
      case 'c':
        hud.toggle('char');
        break;
      case 'p':
        hud.toggle('cards');
        break;
      case 'v':
        if (!g.duel) hud.toggle('look');
        break;
      case 'o':
        hud.toggle('settings');
        break;
      case 'f':
        if (this.onFullscreen) this.onFullscreen();
        break;
      case '-':
      case '_':
        if (this.onZoom) this.onZoom(-1);
        break;
      case '=':
      case '+':
        if (this.onZoom) this.onZoom(1);
        break;
      case '0':
        if (this.onZoom) this.onZoom(0);
        break;
      case 'm':
        this.audio.toggleMute();
        g.fx.text(p.x, p.y, this.audio.muted ? '음소거' : '소리 켜짐', '#ddd', 0.8);
        break;
      case 'escape':
      case ' ':
        hud.closeAll();
        break;
      case 'h':
        e.preventDefault();
        if (document.getElementById('help').classList.contains('hidden')) hud.showHelp();
        else document.getElementById('help').classList.add('hidden');
        break;
      case 'f9':
        e.preventDefault();
        g.devLevels(5);
        break;
      default:
        break;
    }
  }

  updateMouse() {
    const g = this.game;
    g.mouseWorld = this.renderer.screenToWorldPos(this.mx, this.my);
    const overConsole = this.my > window.innerHeight - this.renderer.consoleH;
    g.hover = overConsole ? null : this.renderer.pick(this.mx, this.my, (u) => u !== g.player);
  }

  update(dt) {
    const g = this.game;
    const p = g.player;
    this.updateMouse();
    if (p.dead) return;
    // WASD steering (same as the touch joystick)
    let mx = 0;
    let my = 0;
    for (const k of this.moveKeys) {
      mx += MOVE_KEYS[k][0];
      my += MOVE_KEYS[k][1];
    }
    if (mx || my) {
      const a = screenVecToWorldAngle(mx, my);
      p.steer(Math.cos(a), Math.sin(a));
      this.keySteer = true;
    } else if (this.keySteer) {
      this.keySteer = false;
      p.stopSteer();
    }
    // Holding LMB: keep attacking the same target or keep walking to the cursor.
    if (this.lmb) {
      this.holdT += dt;
      if (this.lmbTarget) {
        if (this.lmbTarget.dead) this.lmbTarget = null;
        else if (!p.action) p.basicAttack(this.lmbTarget);
      } else if (this.shift && !g.mapTest) {
        if (!p.action) this.attackInPlace();
      } else if (this.holdT > 0.12) {
        const m = g.mouseWorld;
        if (!p.action || p.moving) p.commandMove(m.x, m.y);
      }
    }
    if (this.rmb && !p.busy && !g.duel) {
      this.rmbT = (this.rmbT || 0) - dt;
      if (this.rmbT <= 0) {
        this.rmbT = 0.15;
        this.castRmb();
      }
    }
  }
}
