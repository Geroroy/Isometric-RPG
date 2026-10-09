// Friendly NPCs of the city hub: the Jedi and the 501st by the landing pad
// on the upper plaza, the band at the lower level's bar. They stand at their
// posts, turn towards Anakin when he comes close and face him while talking.
import { Unit } from './units.js';
import { angleDiff, dist } from '../core/math.js';

// hub: tile position in the city hub (see CITY in worldgen.js)
export const NPC_DEFS = {
  obiwan: { name: '오비완 케노비', title: '제다이 마스터 · 7군단 장군', sprite: 'obiwan', hub: [112.5, 57.5] },
  rex: { name: '렉스 대위', title: '501군단 클론 대위', sprite: 'rex', hub: [108.5, 61] },
  ahsoka: { name: '아소카 타노', title: '제다이 파다완', sprite: 'ahsoka', hub: [110.5, 66.5] },
  quartermaster: { name: "보급관 '체인'", title: '501군단 보급 하사관', sprite: 'quartermaster', hub: [106, 56.5] },
  r2: { name: 'R2-D2', title: '아스트로멕 드로이드', sprite: 'r2', hub: [115, 65.5] },
  // outside the lower level's bar
  figrin: { name: "피그린 단", title: '모달 노드 · 클루 혼 연주자', sprite: 'bith', hub: [110.6, 125.6] },
  // Anakin's starfighter (placed by Game: the hub's pad and the Christophsis base)
  fighter: { name: '제다이 스타파이터', title: '아나킨의 전용기 · 출격', sprite: 'fighter' },
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
