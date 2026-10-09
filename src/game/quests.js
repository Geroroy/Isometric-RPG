// Side quests handed out by NPCs at the forward base. A quest is 'active'
// until its goal is met, then 'ready' (return to the giver), then 'done'.

export const QUESTS = {
  rex1: {
    giver: 'rex',
    title: '첫 번째 거점',
    desc: '기지 서쪽 가까이에 있는 드로이드 거점을 소탕하십시오.',
    type: 'camp',
    reward: { xp: 160, credits: 120, bacta: 1 },
  },
  rex2: {
    giver: 'rex',
    title: '깡통 사냥',
    desc: 'B2 슈퍼 배틀 드로이드 8기를 파괴하십시오.',
    type: 'kill',
    kind: 'b2',
    goal: 8,
    req: 'rex1',
    reward: { xp: 700, credits: 300 },
  },
  rex3: {
    giver: 'rex',
    title: '공장 수호자',
    desc: '북서쪽 드로이드 공장을 지키는 수호자를 쓰러뜨리십시오.',
    type: 'boss',
    req: 'rex2',
    reward: { xp: 3000, credits: 1200 },
  },
  ahsoka1: {
    giver: 'ahsoka',
    title: '홀로크론의 속삭임',
    desc: '정예 드로이드가 지닌 홀로크론 2개를 회수하십시오.',
    type: 'holocron',
    goal: 2,
    reward: { xp: 450, credits: 150, skillPoints: 1 },
  },
  ahsoka2: {
    giver: 'ahsoka',
    title: '스카이가이와의 내기',
    desc: '아소카보다 먼저 드로이드 60기를 해치우십시오.',
    type: 'kill',
    kind: 'any',
    goal: 60,
    req: 'ahsoka1',
    reward: { xp: 900, credits: 350 },
  },
};

export class QuestLog {
  constructor(game) {
    this.game = game;
    this.state = {}; // id -> { state, n }
  }

  status(id) {
    return this.state[id]?.state || null;
  }

  /** Can `giver` offer this quest right now? */
  available(id) {
    const q = QUESTS[id];
    return !this.state[id] && (!q.req || this.status(q.req) === 'done');
  }

  offerFrom(giver) {
    return Object.keys(QUESTS).find((id) => QUESTS[id].giver === giver && this.available(id)) || null;
  }

  readyFrom(giver) {
    return Object.keys(QUESTS).find((id) => QUESTS[id].giver === giver && this.status(id) === 'ready') || null;
  }

  activeFrom(giver) {
    return Object.keys(QUESTS).find((id) => QUESTS[id].giver === giver && this.status(id) === 'active') || null;
  }

  accept(id) {
    this.state[id] = { state: 'active', n: 0 };
    const q = QUESTS[id];
    // a camp quest may already be satisfied
    if (q.type === 'camp' && this.firstCamp()?.cleared) this.state[id].state = 'ready';
    this.game.emit('quest', id, 'accept');
    this.game.audio.play('click');
  }

  claim(id) {
    const q = QUESTS[id];
    const p = this.game.player;
    const r = q.reward;
    this.state[id].state = 'done';
    if (r.credits) p.credits += r.credits;
    p.cards.parts += 30; // every report pays crafting parts for Star Cards
    if (r.bacta) p.bacta = Math.min(5, p.bacta + r.bacta);
    if (r.skillPoints) p.skillPoints += r.skillPoints;
    if (r.xp) p.gainXp(r.xp);
    this.game.fx.text(p.x, p.y, `임무 완료 · ${q.title}`, '#ffd27f', 1.15, 2.6);
    this.game.audio.play('levelup');
    this.game.emit('quest', id, 'done');
  }

  firstCamp() {
    return this.game.front.camps.find((c) => c.tutorial);
  }

  progress(id) {
    const q = QUESTS[id];
    const s = this.state[id];
    if (!s) return '';
    if (q.goal) return `${Math.min(q.goal, s.n)} / ${q.goal}`;
    return s.state === 'ready' ? '완료' : '';
  }

  bump(id, k = 1) {
    const s = this.state[id];
    const q = QUESTS[id];
    if (!s || s.state !== 'active') return;
    s.n += k;
    if (q.goal && s.n >= q.goal) this.ready(id);
  }

  ready(id) {
    const s = this.state[id];
    if (!s || s.state !== 'active') return;
    s.state = 'ready';
    const q = QUESTS[id];
    const g = this.game;
    g.fx.text(g.player.x, g.player.y, `목표 달성 · ${q.title}`, '#ffd27f', 1.05, 2.4);
    g.audio.play('pickup');
    g.emit('quest', id, 'ready');
  }

  // --- game events ---------------------------------------------------------
  onKill(u) {
    for (const id of Object.keys(this.state)) {
      const q = QUESTS[id];
      if (q.type === 'kill' && (q.kind === 'any' || q.kind === u.kind)) this.bump(id);
      if (q.type === 'boss' && u.elite && u.camp && u.camp.boss) this.ready(id);
    }
  }
  onCampCleared(c) {
    for (const id of Object.keys(this.state)) if (QUESTS[id].type === 'camp' && c.tutorial) this.ready(id);
  }
  onHolocron() {
    for (const id of Object.keys(this.state)) if (QUESTS[id].type === 'holocron') this.bump(id);
  }

  /** Entries for the objective tracker. */
  tracked() {
    return Object.entries(this.state)
      .filter(([, s]) => s.state !== 'done')
      .map(([id, s]) => ({ id, q: QUESTS[id], s }));
  }
}
