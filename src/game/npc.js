// Friendly NPCs at the Republic forward base. They stand at their posts,
// turn towards Anakin when he comes close and face him while talking.
import { Unit } from './units.js';
import { angleDiff, dist } from '../core/math.js';

// pos is relative to the base centre
export const NPC_DEFS = {
  obiwan: { name: '오비완 케노비', title: '제다이 마스터 · 7군단 장군', sprite: 'obiwan', pos: [1.5, -4.5] },
  rex: { name: '렉스 대위', title: '501군단 클론 대위', sprite: 'rex', pos: [-5, 2.5] },
  ahsoka: { name: '아소카 타노', title: '제다이 파다완', sprite: 'ahsoka', pos: [4.5, 4.5] },
  quartermaster: { name: "보급관 '체인'", title: '501군단 보급 하사관', sprite: 'quartermaster', pos: [-5.5, -8] },
  r2: { name: 'R2-D2', title: '아스트로멕 드로이드', sprite: 'r2', pos: [4, -1.5] },
  // at the cantina door north of the base (see CANTINA_POS)
  figrin: { name: "피그린 단", title: '모달 노드 · 클루 혼 연주자', sprite: 'bith', pos: [2.8, -19.2] },
};

export const TALK_RANGE = 2.2;

export class NPC extends Unit {
  constructor(game, id, x, y) {
    super(game, 'npc', x, y);
    const def = NPC_DEFS[id];
    this.npcId = id;
    this.npc = true;
    this.name = def.name;
    this.title = def.title;
    this.sprite = def.sprite;
    this.untargetable = true;
    this.anchored = true;
    this.post = { x, y };
    this.restFacing = Math.atan2(game.player.y - y, game.player.x - x);
    this.facing = this.restFacing;
  }

  update(dt) {
    this.baseUpdate(dt);
    if (this.scripted) return;
    const g = this.game;
    const p = g.player;
    const talking = g.talkingTo === this;
    const near = dist(this.x, this.y, p.x, p.y) < 5;
    const want = (talking || near) && !this.restAnim ? Math.atan2(p.y - this.y, p.x - this.x) : this.restFacing;
    this.facing += angleDiff(this.facing, want) * Math.min(1, dt * 4);
    this.setAnim(this.restAnim || (talking && this.sprites.anims.talk ? 'talk' : 'idle'));
    // stay on the post if bumped
    this.x += (this.post.x - this.x) * Math.min(1, dt * 2);
    this.y += (this.post.y - this.y) * Math.min(1, dt * 2);
  }
}
