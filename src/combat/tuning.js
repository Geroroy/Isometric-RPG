// 광선검 결투 — 모든 조정값 (docs/COMBAT.md).
//
// ⚠ 전부 검증 전의 가설값이다. 자동 검증(tools/combat/*.test.mjs)과 시험장 플레이로 맞춰 가며 바꾼다. 값을 바꾸면
//   docs/COMBAT.md의 표와 테스트 기대값(시간 관계)을 같이 본다.
//
// 단위: 거리 m(바닥 월드 좌표, 1 타일 = 1 m), 시간 s, 각도 rad, 체력·균형 0..100.
// 시뮬레이션은 고정 틱(TICK_HZ)으로 돈다: 화면 프레임 속도와 무관하게 같은 입력이면 같은 결과.

export const TICK_HZ = 120;
export const DT = 1 / TICK_HZ;
const deg = (d) => (d * Math.PI) / 180;

export const TUNING = {
  body: {
    radius: 0.32, // 몸 반경 (서로 겹치지 않는 거리 = 2 × radius)
    hp: 100,
    balance: 100,
    moveSpeed: 3.5, // 자유 이동 m/s
    guardMoveSpeed: 1.3, // 방어를 유지한 채 이동
    backFactor: 0.75, // 상대에게서 멀어지는 방향으로 걸을 때 속도 배율
    sideFactor: 0.92, // 옆걸음 배율
    accel: 28, // 목표 속도로 붙는 가속 (m/s²): 반응성
    friction: 9, // 밀려남 속도의 감쇠 (1/s)
    turnFree: deg(720), // 자유 상태에서 상대를 바라보는 회전 속도 (rad/s)
    turnGuard: deg(300), // 방어 중 (등 뒤로 돌아온 공격을 다 따라 막지 못할 만큼)
    turnBlockstun: deg(240), // 막는 중 밀리면서
  },

  // 공격: windup(준비) → active(유효 판정) → recovery(회복).
  //   reach     몸 중심 사이 거리 기준 사거리 (상대 반경 포함). 판정은 active 동안 처음 닿는 한 틱에만 한 번.
  //   arc       공격자 정면 기준 반각: 그 밖의 상대는 맞지 않는다 (측면 회피가 성립하는 이유)
  //   turn      windup 동안의 회전 보정 한도 (active·recovery는 0): 공격 도중 상대를 따라 돌지 못한다
  //   lunge     windup 후반~active에 앞으로 내딛는 최대 거리 (상대와 lungeStop 거리 안이면 멈춤)
  //   chainAt   recovery에 들어가 이만큼 지나면 다음 공격·방어·회피로 넘어갈 수 있다 (그 전은 잠김)
  //   next      이어지는 기본 공격 (없으면 연속 공격 끝), heavyChain: 이 공격에서 강공격으로 이을 수 있는가
  //   whiffExtra 아무것도 맞히지 못한 공격의 회복에 더하는 시간 (잠김 구간에 더해짐: 헛친 위험)
  //   dmg       몸에 맞았을 때 체력 피해
  //   hitBal    몸에 맞았을 때 맞은 쪽 균형 손실
  //   blockBal  막혔을 때 막은 쪽 균형 손실
  //   blockstun 막은 쪽이 밀리는 경직 (그동안 방어는 유지된다)
  //   blockPush 막은 쪽이 밀려나는 거리 (m, 대략)
  //   selfBlockBal 막혔을 때 공격자 균형 손실 (검이 튕겨 나감)
  //   parryBal  쳐내졌을 때 공격자 균형 손실
  //   parried   쳐내진 공격자의 경직 (공격·회피 불가)
  //   parriedGuard 쳐내진 뒤 이만큼 지나면 다시 방어는 올릴 수 있다 (확정 피해가 아닌 '작은 반격 기회')
  //   hitstun   맞은 쪽 경직, knock: 맞은 쪽 밀려나는 거리
  attacks: {
    light1: { name: '베기 1', windup: 0.28, active: 0.08, recovery: 0.3, chainAt: 0.1, next: 'light2', heavyChain: true, reach: 2.0, arc: deg(62), turn: deg(320), lunge: 0.32, whiffExtra: 0.1, dmg: 10, hitBal: 6, blockBal: 11, blockstun: 0.2, blockPush: 0.32, selfBlockBal: 2, parryBal: 20, parried: 0.45, parriedGuard: 0.2, hitstun: 0.32, knock: 0.35 },
    light2: { name: '베기 2', windup: 0.24, active: 0.08, recovery: 0.32, chainAt: 0.12, next: 'light3', heavyChain: true, reach: 2.0, arc: deg(62), turn: deg(300), lunge: 0.3, whiffExtra: 0.1, dmg: 10, hitBal: 6, blockBal: 11, blockstun: 0.2, blockPush: 0.32, selfBlockBal: 2, parryBal: 20, parried: 0.45, parriedGuard: 0.2, hitstun: 0.32, knock: 0.35 },
    light3: { name: '베기 3 (마무리)', windup: 0.32, active: 0.1, recovery: 0.7, chainAt: 0.7, next: null, heavyChain: false, reach: 2.05, arc: deg(55), turn: deg(260), lunge: 0.42, whiffExtra: 0.14, dmg: 13, hitBal: 10, blockBal: 18, blockstun: 0.28, blockPush: 0.2, selfBlockBal: 4, parryBal: 26, parried: 0.5, parriedGuard: 0.24, hitstun: 0.42, knock: 0.6 },
    heavy: { name: '강공격', windup: 0.62, active: 0.12, recovery: 0.62, chainAt: 0.62, next: null, heavyChain: false, reach: 2.2, arc: deg(52), turn: deg(200), lunge: 0.6, whiffExtra: 0.28, dmg: 20, hitBal: 18, blockBal: 34, blockstun: 0.36, blockPush: 0.85, selfBlockBal: 6, parryBal: 38, parried: 0.62, parriedGuard: 0.3, hitstun: 0.55, knock: 0.9 },
  },
  lungeStop: 0.95, // 몸 중심 사이가 이보다 가까우면 더 내딛지 않는다
  swingLead: 0.06, // windup의 마지막 이만큼은 검이 이미 나온 휘두르기: 이때 상대 공격이 닿으면 몸이 아니라 검끼리 부딪힘 (pose.js LEAD와 같게)
  tradeWindow: 0.12, // 두 공격의 시작 차이가 이 안이면 (거의 동시) 몸이 아니라 검끼리 부딪힘 — 분명히 먼저 친 쪽만 준비 중인 상대를 벤다

  guard: {
    arc: deg(72), // 방어가 받아내는 정면 반각: 뒤·옆에서 온 공격은 막지 못한다
    parryWindow: 0.14, // 새로 누른 방어 입력에만 주는 쳐내기 판정 창
    parryRearm: 0.4, // 직전 방어 입력에서 이만큼 지나야 새 입력이 쳐내기 창을 받는다 (연타 방지)
    shakenT: 0.7, // 쳐내진 뒤 이 시간 동안 막아도 균형을 더 잃는다 (주도권을 잡은 쪽의 압박)
    shakenMult: 1.5,
  },

  balance: {
    regenDelay: 0.9, // 마지막 균형 손실 뒤 회복이 시작되기까지
    regenRate: 24, // /s, 거리를 벌리고 자세를 정비했을 때 (최대)
    nearDist: 2.3, // 이보다 가까우면 회복 nearMult배 (압박 속에서는 거의 회복되지 않음)
    farDist: 3.6, // 이보다 멀면 회복 100%
    nearMult: 0.15,
    guardMult: 0.35, // 방어를 들고 있으면 회복 배율: 방어만 유지해서는 압박을 상쇄하지 못한다
    brokenRestore: 50, // 균형 붕괴가 끝나면 이 값으로 다시 선다
    afterPunish: 40, // 균형 붕괴 중 맞으면 붕괴가 끝나고 이 값으로
  },

  reactions: {
    broken: 1.05, // 균형 붕괴: 방어·공격 불가, 맞으면 punish 배율
    brokenPunishMult: 1.5,
    clash: 0.24, // 같은 무게의 공격이 동시에 맞부딪힘: 서로 튕김
    clashBal: 8,
    overpowered: 0.38, // 강공격과 기본 공격이 맞부딪혀 진 쪽
    overpoweredBal: 20,
    counterHitStun: 0.04, // 공격 준비 중에 맞으면 경직 추가 (다음 베기가 확정으로 이어질 만큼은 아님)
  },

  dodge: {
    dur: 0.3, // 회피 전체 시간
    dist: 1.8, // 이동 거리 (iframe과 따로 조정)
    iframes: [0.03, 0.21], // 무적 구간 (회피 시작 기준 s)
    lockTail: 0.06, // 회피 끝의 행동 불가 꼬리
    cooldown: 0.42, // 회피 시작 간 최소 간격
    balCost: 4, // 회피마다 균형 소모 (연속 회피 남용 방지)
  },

  input: {
    buffer: 0.15, // 행동 불가 중 누른 공격·강공격·회피를 기억하는 시간 (한 칸: 마지막 입력만)
  },

  // 타격 정지: 시뮬레이션 전체를 이 시간만큼 멈춘다 (입력은 기억되고 시간은 흐르지 않음 → 손실·중복 없음)
  hitstop: { block: 0.045, blockHeavy: 0.08, parry: 0.09, clash: 0.07, hit: 0.07, hitHeavy: 0.11, break: 0.12, ko: 0.25 },

  saber: { hilt: 0.26, blade: 1.0 }, // 시각 표현 (판정에는 쓰지 않음: 판정은 reach/arc 규칙)
};

/** 캐릭터 정의: 이름·색·성향 (ai.js PERSONAS). 수치는 같다 — 차이는 AI 성향과 외형뿐. */
export const CAST = {
  anakin: { name: '아나킨', full: '아나킨 스카이워커', persona: 'anakin', blade: [70, 140, 255], tunic: '#2b211c', tunic2: '#17110e', skin: '#e2b896', hair: '#6b4a2b', trim: '#4a3a30' },
  obiwan: { name: '오비완', full: '오비완 케노비', persona: 'obiwan', blade: [90, 190, 255], tunic: '#d8c7a0', tunic2: '#8a6a45', skin: '#e6bf9e', hair: '#b07a46', trim: '#f0e6cc' },
};
