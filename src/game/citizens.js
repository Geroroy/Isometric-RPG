// The city hub's crowd. Citizens walk between street points on their own
// level (a path found once per trip), stop to idle or chat in pairs, and say
// a line when Anakin passes close by. The upper level and the lower level
// have different people and different things on their minds.
import { Unit } from './units.js';
import { dist, rand, chance } from '../core/math.js';

const pick = (a) => a[Math.floor(Math.random() * a.length)];

// sprite → level, how many, behaviour
export const CROWD = [
  { sprite: 'citNoble', level: 'up', n: 7, speed: 1.4 },
  { sprite: 'citNoble2', level: 'up', n: 6, speed: 1.4 },
  { sprite: 'citAide', level: 'up', n: 7, speed: 2.0 },
  { sprite: 'citAlien', level: 'up', n: 3, speed: 1.5 },
  { sprite: 'citOfficer', level: 'up', n: 3, speed: 1.6, patrol: true },
  { sprite: 'citWorker', level: 'low', n: 8, speed: 1.9 },
  { sprite: 'citWorker2', level: 'low', n: 6, speed: 1.9 },
  { sprite: 'citVendor', level: 'low', n: 6, speed: 1.4, stay: true },
  { sprite: 'citDrifter', level: 'low', n: 7, speed: 1.1, sit: 0.6 },
  { sprite: 'citAlien', level: 'low', n: 4, speed: 1.6 },
  { sprite: 'citOfficer', level: 'low', n: 2, speed: 1.6, patrol: true },
];

const NAMES = {
  citNoble: '상층 거주민',
  citNoble2: '상층 거주민',
  citAide: '의원 보좌관',
  citAlien: '외계 시민',
  citOfficer: '도시 보안관',
  citWorker: '하층 노동자',
  citWorker2: '하층 노동자',
  citVendor: '노점상',
  citDrifter: '떠돌이',
};

// what people say as Anakin passes (original lines)
const SAY = {
  up: [
    '저 아래 얘기는 그만해요. 식사 자리에서까지.',
    '의원님 연회 초대장, 받으셨어요?',
    '제다이 장군님이시다… 전쟁 소식은 좋은가요?',
    '하층 출입구는 막아 둬야 해요. 요즘 불안해서.',
    '이 높이에선 공기마저 다르죠.',
    '전쟁 채권이 또 올랐더군요.',
    '오늘 노을이 참 곱네요. 저 아래선 못 보겠지만.',
    '보안관, 저 사람 계단 근처에서 서성이던데요.',
  ],
  low: [
    '햇빛 본 게 언제였더라…',
    '윗동네 사람들은 여기가 있는 줄도 몰라.',
    '크레딧 좀… 아니면 일거리라도.',
    '제다이가 여기까지 내려오다니, 별일이네.',
    '공장이 또 문을 닫았어. 전쟁 물자만 찍어 낸다더니.',
    '저 빛 아래 서 봐. 하루에 몇 분 안 들어와.',
    '보안관들은 위층만 지키지.',
    '전쟁이 끝나면 좀 나아질까?',
    '물값이 또 올랐대.',
    '여기선 아무도 이름을 안 물어봐.',
  ],
  officer: ['통행증 확인합니다. …아, 장군님이시군요.', '이동하십시오. 모여 있지 마시고.', '이상 없음.'],
  vendor: ['신선한 거예요! 오늘 아침에 올라온 거라고요.', '장군님, 하나 맛보고 가세요!', '부품 있어요, 부품! 싸게 드려요.'],
};

export class Citizen extends Unit {
  constructor(game, def, x, y) {
    super(game, 'citizen', x, y);
    this.sprite = def.sprite;
    this.name = NAMES[def.sprite] || '시민';
    this.def2 = def;
    this.level = def.level;
    this.untargetable = true;
    this.speed = def.speed * rand(0.85, 1.15);
    this.state = 'idle';
    this.t = rand(0, 4);
    this.sayT = rand(2, 8);
    this.home = { x, y };
    if (def.stay) this.anchored = true;
    if (def.sit && chance(def.sit)) {
      this.state = 'sit';
      this.anchored = true;
      this.setAnim('sit');
    }
  }

  points() {
    return this.game.world.walk[this.level];
  }

  update(dt) {
    this.baseUpdate(dt);
    const g = this.game;
    const p = g.player;
    this.t -= dt;
    this.sayT -= dt;
    const near = dist(this.x, this.y, p.x, p.y);
    if (near < 3 && this.sayT <= 0 && !g.cinema) {
      this.sayT = rand(14, 26);
      const pool = this.def2.patrol ? SAY.officer : this.def2.stay ? SAY.vendor : SAY[this.level];
      g.fx.text(this.x, this.y, pick(pool), this.level === 'up' ? '#f2e6c8' : '#c8d8e8', 0.85, 2.3, 3.4);
    }
    if (this.state === 'sit') return;
    if (this.def2.stay) {
      // vendors stay at their stall and face whoever comes by
      this.setAnim(near < 4 ? 'talk' : 'idle');
      if (near < 4) this.faceTo(p.x, p.y);
      return;
    }
    if (this.state === 'walk') {
      const wp = this.path && this.path[0];
      if (!wp) return this.rest();
      const before = { x: this.x, y: this.y };
      if (this.moveToward(wp.x, wp.y, this.speed, dt)) this.path.shift();
      this.setAnim('walk', this.speed / 1.8);
      // stuck on someone or something: give up this trip
      this.stuck = dist(before.x, before.y, this.x, this.y) < this.speed * dt * 0.2 ? (this.stuck || 0) + dt : 0;
      if (this.stuck > 1.2 || this.t <= 0) this.rest();
      return;
    }
    this.setAnim(this.chat ? 'talk' : 'idle');
    if (this.t <= 0) this.trip();
  }

  rest() {
    this.state = 'idle';
    this.path = null;
    this.t = rand(2, 7);
    this.chat = false;
    // sometimes stop for a chat with someone close by
    const other = this.game.activeUnits.find((u) => u !== this && u instanceof Citizen && u.state === 'idle' && dist(u.x, u.y, this.x, this.y) < 1.6);
    if (other && chance(0.6)) {
      this.chat = other.chat = true;
      this.faceTo(other.x, other.y);
      other.faceTo(this.x, this.y);
    }
  }

  trip() {
    const pts = this.points();
    const g = this.game;
    // a nearby destination keeps the crowd spread over the level
    let to = null;
    for (let k = 0; k < 6 && !to; k++) {
      const c = pick(pts);
      if (dist(c.x, c.y, this.x, this.y) < (this.def2.patrol ? 26 : 16)) to = c;
    }
    if (!to) return (this.t = rand(1, 3));
    const path = g.pathfinder.lineFree(this.x, this.y, to.x, to.y, this.radius * 0.8) ? [to] : g.pathfinder.find(this.x, this.y, to.x, to.y, 1500);
    if (!path) return (this.t = rand(1, 3));
    this.path = path.slice();
    this.state = 'walk';
    this.t = 25;
  }
}
