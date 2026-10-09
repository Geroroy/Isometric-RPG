// Conversation panel (bottom centre, Jedi: Survivor style): speaker name and
// title, typewriter text, numbered choices. The game pauses while it is open.
import { iconURL } from './icons.js';

export class DialogueUI {
  constructor(game, audio, start) {
    this.game = game;
    this.audio = audio;
    this.start = start; // (game, npc) => first node
    this.node = null;
    this.el = document.createElement('div');
    this.el.className = 'dialogue hidden';
    this.el.innerHTML = '<div class="dl-head"><span class="dl-name"></span><span class="dl-title"></span><span class="dl-cr"></span></div><div class="dl-text"></div><div class="dl-choices"></div>';
    document.getElementById('hud').appendChild(this.el);
    this.textEl = this.el.querySelector('.dl-text');
    this.choicesEl = this.el.querySelector('.dl-choices');
    this.el.addEventListener('mousedown', (e) => e.stopPropagation());
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.textEl.addEventListener('click', () => this.skip());
    game.on('dialogue', (npc) => this.open(npc));
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
  }
}
