// Conversation screen: Fallout 1/2's talking head as a Star Wars hologram
// transmission (the game view zoomed in on the speaker, tinted blue with
// scanlines), the reply on a holo panel and the numbered choices below it.
// The game pauses while it is open.
import { iconURL } from './icons.js';
import { worldToScreen } from '../core/iso.js';

export class DialogueUI {
  constructor(game, audio, start, renderer) {
    this.game = game;
    this.audio = audio;
    this.renderer = renderer;
    this.start = start; // (game, npc) => first node
    this.node = null;
    this.el = document.createElement('div');
    this.el.className = 'dialogue hidden';
    this.el.innerHTML = '<div class="dl-face monitor"><canvas width="160" height="96"></canvas><div class="dl-head"><span class="dl-name"></span><span class="dl-title"></span><span class="dl-cr"></span></div></div><div class="dl-text"></div><div class="dl-choices monitor"></div>';
    document.getElementById('hud').appendChild(this.el);
    this.textEl = this.el.querySelector('.dl-text');
    this.face = this.el.querySelector('.dl-face canvas');
    this.fctx = this.face.getContext('2d');
    this.choicesEl = this.el.querySelector('.dl-choices');
    this.el.addEventListener('mousedown', (e) => e.stopPropagation());
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.textEl.addEventListener('click', () => this.skip());
    game.on('dialogue', (npc) => this.open(npc));
    game.on('death', () => this.isOpen && this.close()); // a conversation doesn't outlive Anakin
  }

  get isOpen() {
    return !!this.node;
  }

  open(npc) {
    this.npc = npc;
    this.el.querySelector('.dl-name').textContent = npc.name;
    this.el.querySelector('.dl-title').textContent = npc.title;
    this.el.classList.remove('hidden');
    document.body.classList.add('talking');
    this.show(this.start(this.game, npc));
  }

  show(node) {
    if (!node) return this.close();
    this.node = node;
    this.t = 0;
    this.shown = 0;
    const cr = this.npc.npcId === 'quartermaster' ? `<img src="${iconURL('credits')}" alt="">${this.game.player.credits}` : '';
    this.el.querySelector('.dl-cr').innerHTML = cr;
    this.choicesEl.innerHTML = '';
    node.choices.forEach((c, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'dl-choice ' + (c.cls || '');
      b.innerHTML = `<kbd>${i + 1}</kbd><span></span>`;
      b.lastChild.textContent = c.text;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.choose(i);
      });
      this.choicesEl.appendChild(b);
    });
    this.choicesEl.classList.remove('show');
  }

  skip() {
    if (this.node) this.shown = this.node.text.length;
  }

  choose(i) {
    const c = this.node && this.node.choices[i];
    if (!c) return;
    if (this.shown < this.node.text.length) return this.skip();
    this.audio.play('click');
    this.game.emit('reply', c.text); // Anakin's side of the conversation is the choice
    this.show(c.go());
  }

  close() {
    this.node = null;
    this.el.classList.add('hidden');
    document.body.classList.remove('talking');
    this.game.endTalk();
  }

  /** Keyboard: 1-9 choose, Space/Enter finish the line, Esc leaves. */
  key(k) {
    if (!this.node) return false;
    if (/^[1-9]$/.test(k)) this.choose(+k - 1);
    else if (k === ' ' || k === 'enter') this.skip();
    else if (k === 'escape') this.close();
    return true;
  }

  update(dt) {
    if (!this.node) return;
    const text = this.node.text;
    this.t += dt;
    if (this.shown < text.length) this.shown = Math.min(text.length, this.shown + dt * 45);
    this.textEl.textContent = text.slice(0, Math.floor(this.shown));
    this.choicesEl.classList.toggle('show', this.shown >= text.length);
    this.drawFace();
  }

  /** Talking head: the live game view around the speaker at twice the game's zoom. */
  drawFace() {
    const r = this.renderer;
    const n = this.npc;
    const c = this.face;
    // twice the game's zoom, but never so close that the speaker (~64 px) is cropped
    const mag = Math.min(r.scale * 2, c.clientHeight / 64);
    const w = Math.max(16, Math.round(c.clientWidth / mag));
    const h = Math.max(16, Math.round(c.clientHeight / mag));
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    const s = worldToScreen(n.x, n.y);
    // keep the crop on the game canvas so the edges never show black
    const x = Math.max(0, Math.min(r.canvas.width - w, Math.round(s.x - r.cam.x - w / 2)));
    const y = Math.max(0, Math.min(r.canvas.height - h, Math.round(s.y - r.cam.y - h / 2 - (n.sprite === 'r2' ? 14 : 30))));
    const g = this.fctx;
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#071019';
    g.fillRect(0, 0, w, h);
    g.drawImage(r.canvas, x, y, w, h, 0, 0, w, h);
  }
}
