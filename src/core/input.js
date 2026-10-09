// Diablo-style controls:
//   LMB          move / attack (hold to keep moving or attacking)
//   Shift + LMB  attack in place
//   RMB          cast the right-button skill at the cursor (hold to repeat)
//   1-6          cast hotbar skill at the cursor
//   Q bacta · K skill tree · C character · Tab automap · M mute · F1 help
import { SKILLS } from '../game/skills.js';
import { dist } from '../core/math.js';

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
    });
    window.addEventListener('blur', () => {
      this.lmb = this.rmb = this.shift = false;
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
    if (p.dead) return;
    this.updateMouse();
    if (e.button === 0) {
      if (this.hud.pendingSkill) {
        this.cast(this.hud.pendingSkill);
        this.hud.cancelTargeting();
        return;
      }
      this.lmb = true;
      this.holdT = 0;
      const t = this.enemyUnderCursor();
      if (t) {
        this.lmbTarget = t;
        p.basicAttack(t);
      } else if (this.shift) {
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
    if (e.repeat && !/^[1-6]$/.test(e.key)) return;
    this.audio.unlock();
    const k = e.key.toLowerCase();
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
    switch (k) {
      case 'q':
        g.useBacta();
        break;
      case 'k':
      case 't':
      case 's':
        hud.toggle('tree');
        break;
      case 'c':
      case 'a':
        hud.toggle('char');
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
      case 'f1':
        e.preventDefault();
        document.getElementById('help').classList.toggle('hidden');
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
    // Holding LMB: keep attacking the same target or keep walking to the cursor.
    if (this.lmb) {
      this.holdT += dt;
      if (this.lmbTarget) {
        if (this.lmbTarget.dead) this.lmbTarget = null;
        else if (!p.action) p.basicAttack(this.lmbTarget);
      } else if (this.shift) {
        if (!p.action) this.attackInPlace();
      } else if (this.holdT > 0.12) {
        const m = g.mouseWorld;
        if (!p.action || p.moving) p.commandMove(m.x, m.y);
      }
    }
    if (this.rmb && !p.busy) {
      this.rmbT = (this.rmbT || 0) - dt;
      if (this.rmbT <= 0) {
        this.rmbT = 0.15;
        this.castRmb();
      }
    }
  }
}
