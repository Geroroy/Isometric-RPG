// Star Cards (after Battlefront II): perks equipped in three slots, unlocked
// and upgraded through four tiers with crafting parts salvaged from droids.

export const TIERS = ['일반', '고급', '희귀', '에픽'];
export const SLOT_LEVELS = [1, 5, 10]; // character level that opens each slot
export const UNLOCK_COST = 40;
export const UPGRADE_COST = [0, 60, 120, 220]; // parts to reach tier index i

// `v` holds the value per tier; `text(v)` describes it.
export const CARDS = {
  aggressive: { name: '공격적인 협상', v: [8, 12, 16, 20], text: (v) => `광선검 피해 +${v}%`, icon: 'flurry' },
  shienMaster: { name: '쉬엔의 숙련', v: [5, 8, 11, 15], text: (v) => `블래스터 볼트 반사 확률 +${v}%p`, icon: 'shien' },
  forceAttune: { name: '포스 조율', v: [15, 25, 35, 50], text: (v) => `포스 회복 속도 +${v}%`, icon: 'speed' },
  tenacity: { name: '강철 의지', v: [5, 8, 11, 15], text: (v) => `받는 피해 −${v}%`, icon: 'barrier' },
  foresight: { name: '위험 감지', v: [3, 5, 7, 10], text: (v) => `블래스터·근접 공격 회피 +${v}%p`, icon: 'precog' },
  heroicMight: { name: '영웅의 기세', v: [4, 5, 6, 8], text: (v) => `드로이드를 쓰러뜨릴 때마다 8초간 공격 속도 +${v}% (최대 5중첩)`, icon: 'fury' },
  forceMastery: { name: '포스 숙련', v: [8, 12, 16, 20], text: (v) => `포스 기술 피해 +${v}%`, icon: 'push' },
  focus: { name: '전투 집중', v: [6, 9, 12, 15], text: (v) => `스킬 재사용 대기시간 −${v}%`, icon: 'leap' },
  bactaPack: { name: '박타 탄띠', v: [10, 20, 30, 40], text: (v) => `박타 주사기 회복량 +${v}%`, icon: 'bacta' },
  droidSlayer: { name: '드로이드 사냥꾼', v: [6, 9, 12, 15], text: (v) => `드로이드에게 주는 피해 +${v}%`, icon: 'mechanic' },
  legionBond: { name: '501군단의 유대', v: [10, 15, 20, 30], text: (v) => `소환한 아군의 피해 +${v}%`, icon: 'clones' },
  darkAnger: { name: '분노의 힘', v: [8, 12, 16, 20], text: (v) => `어둠 게이지가 50 이상이면 모든 피해 +${v}%`, icon: 'choke' },
};

export class StarCards {
  constructor(player) {
    this.player = player;
    this.parts = 0;
    this.owned = {}; // id -> tier index (0..3)
    this.slots = [null, null, null];
  }

  slotOpen(i) {
    return this.player.level >= SLOT_LEVELS[i];
  }

  /** Value of an equipped card at its tier, else 0. */
  value(id) {
    return this.slots.includes(id) ? CARDS[id].v[this.owned[id]] : 0;
  }

  unlock(id) {
    if (id in this.owned || this.parts < UNLOCK_COST) return false;
    this.parts -= UNLOCK_COST;
    this.owned[id] = 0;
    return true;
  }

  upgradeCost(id) {
    const t = this.owned[id];
    return t === undefined || t >= 3 ? null : UPGRADE_COST[t + 1];
  }

  upgrade(id) {
    const c = this.upgradeCost(id);
    if (c === null || this.parts < c) return false;
    this.parts -= c;
    this.owned[id]++;
    return true;
  }

  equip(id, slot) {
    if (!(id in this.owned) || !this.slotOpen(slot)) return false;
    const prev = this.slots.indexOf(id);
    if (prev >= 0) this.slots[prev] = null;
    this.slots[slot] = id;
    this.player.recalc();
    return true;
  }

  unequip(slot) {
    this.slots[slot] = null;
    this.player.recalc();
  }
}
