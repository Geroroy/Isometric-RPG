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
    // 맵의 먼 이동 (CombatSim travel 옵션 — 무스타파 맵 연결만): 상대가 travelDist보다 멀면 가는 쪽을 보고 맵 걷기 빠르기로
    // (본편 유닛·맵 걷기와 같은 4.6 m/s), travelLeave 안으로 들어오면 상대를 보는 결투 걸음으로 돌아온다
    travelSpeed: 4.6,
    travelDist: 7,
    travelLeave: 6,
    accel: 28, // 목표 속도로 붙는 가속 (m/s²): 반응성
    friction: 9, // 밀려남 속도의 감쇠 (1/s)
    turnFree: deg(720), // 자유 상태에서 상대를 바라보는 회전 속도 (rad/s)
    turnGuard: deg(300), // 방어 중 (등 뒤로 돌아온 공격을 다 따라 막지 못할 만큼)
    turnBlockstun: deg(240), // 막는 중 밀리면서
  },

  // 공격 공통 값의 뜻 (시간·거리·궤적은 캐릭터별 — 아래 TUNING.styles):
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
  // 공격은 캐릭터마다 다르다: 아래 `styles` (검술). 여기의 공통 몫은 피해·균형·경직 — 두 사람이 같은 값을 쓴다
  //   (체력·피해 차이는 두지 않는다: 차이는 궤적·발놀림·회수·연결과 그에 따른 거리·시간에서 나온다).
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

// ---------------------------------------------------------------------------------------------------- 검술 (캐릭터별)
//
// 공격: windup(준비) → active(유효 판정) → recovery(회복).
//   reach     몸 중심 사이 거리 기준 사거리 (상대 반경 포함) = 정면(MID)에서 검끝이 닿는 앞 거리 + 몸 반경 — moves.js의 궤적과
//             같아야 한다 (tools/combat/style.test.mjs가 확인). 판정은 active 동안 처음 닿는 한 틱에만 한 번.
//   arc       공격자 정면 기준 반각: 그 밖의 상대는 맞지 않는다 (측면 회피가 성립하는 이유). 찌르기는 좁다
//   turn      windup 동안의 회전 보정 한도 (active·recovery는 0): 공격 도중 상대를 따라 돌지 못한다
//   lunge     windup 후반~active에 앞으로 내딛는 최대 거리 (상대와 lungeStop 거리 안이면 멈춤) — 발이 실제로 내디딘다
//   recoil    회복 시작에 뒤로 물러서는 거리 (베고 물러서기). 0이면 없음
//   chainAt   recovery에 들어가 이만큼 지나면 다음 공격·회피로 넘어갈 수 있다 (그 전은 잠김)
//   guardAt   recovery에서 이만큼 지나면 방어는 올릴 수 있다 (없으면 chainAt — 짧게 회수되는 검)
//   next      이어지는 기본 공격 (없으면 연속 공격 끝), heavyChain: 이 공격에서 강공격으로 이을 수 있는가
//   whiffExtra 아무것도 맞히지 못한 공격의 회복에 더하는 시간 (잠김·방어 둘 다: 깊이 들어간 공격일수록 크다)
//   dmg·hitBal·blockBal·blockstun·blockPush·selfBlockBal·parryBal·parried·parriedGuard·hitstun·knock: 공통 (아래 LIGHT·FINISH·HEAVY)
// 연결 규칙 (links):
//   riposte   반격: 쳐낸(parry) 뒤 / 막은(block) 뒤 창 안에 누른 기본 공격이 이 캐릭터의 반격 동작으로 나간다
//   pressOnBlock 막혀도 균형·거리가 유리하면 이어 베기 잠김이 짧아진다 (막힌 검을 바로 다음 베기로)
//   blockStep 막을 때 밀려나는 방향을 뒤 back : 옆 side로 (막으며 각도를 바꾸는 발 디딤 — 밀리는 거리는 같다)
const LIGHT = { active: 0.08, dmg: 10, hitBal: 6, blockBal: 11, blockstun: 0.2, blockPush: 0.32, selfBlockBal: 2, parryBal: 20, parried: 0.45, parriedGuard: 0.2, hitstun: 0.32, knock: 0.35 };
const FINISH = { active: 0.1, dmg: 13, hitBal: 10, blockBal: 18, blockstun: 0.28, blockPush: 0.2, selfBlockBal: 4, parryBal: 26, parried: 0.5, parriedGuard: 0.24, hitstun: 0.42, knock: 0.6 };
const HEAVY = { active: 0.12, dmg: 20, hitBal: 18, blockBal: 34, blockstun: 0.36, blockPush: 0.85, selfBlockBal: 6, parryBal: 38, parried: 0.62, parriedGuard: 0.3, hitstun: 0.55, knock: 0.9 };

TUNING.styles = {
  // 아나킨: 발을 내디디며 들어가는 대각 베기와 반대 대각 되베기, 막혀도 유리하면 이어 가는 압박, 막고·쳐낸 뒤 강하게 전진하는
  // 되받아치기. 깊이 들어간 공격(3타·강공격)을 헛치면 회수가 길다.
  anakin: {
    label: '전진 압박',
    attacks: {
      light1: { ...LIGHT, name: '전진 대각 베기', windup: 0.27, recovery: 0.3, chainAt: 0.1, next: 'light2', heavyChain: true, reach: 1.96, arc: deg(62), turn: deg(320), lunge: 0.5, whiffExtra: 0.12 },
      light2: { ...LIGHT, name: '반대 대각 되베기', windup: 0.23, recovery: 0.32, chainAt: 0.11, next: 'light3', heavyChain: true, reach: 1.94, arc: deg(62), turn: deg(300), lunge: 0.4, whiffExtra: 0.12 },
      light3: { ...FINISH, name: '깊은 내려베기', windup: 0.32, recovery: 0.7, chainAt: 0.7, next: null, heavyChain: false, reach: 1.97, arc: deg(50), turn: deg(260), lunge: 0.62, whiffExtra: 0.24 },
      heavy: { ...HEAVY, name: '돌진 강베기', windup: 0.6, recovery: 0.64, chainAt: 0.64, next: null, heavyChain: false, reach: 1.96, arc: deg(58), turn: deg(200), lunge: 0.85, whiffExtra: 0.34 },
      riposte: { ...LIGHT, name: '전진 되받아치기', windup: 0.24, recovery: 0.32, chainAt: 0.12, next: 'light2', heavyChain: true, reach: 1.98, arc: deg(60), turn: deg(320), lunge: 0.6, whiffExtra: 0.14, blockBal: 14 },
    },
    links: {
      riposte: { parry: 0.4, block: 0.3 }, // (쳐낸 뒤 0.4 s, 막고 밀림이 끝난 뒤 0.3 s 안의 기본 공격)
      pressOnBlock: { chainAt: 0.05, balEdge: 0, range: 0.05 }, // (내 균형 ≥ 상대 균형 + balEdge, 밀린 뒤 거리 ≤ 다음 베기 사거리 + 판정까지 내딛는 몫 + range)
      blockStep: null,
    },
  },
  // 오비완: 몸의 중심을 지키는 방어, 짧게 회수되는 공격(방어를 일찍 올림), 막으며 짧은 후퇴·옆 발 디딤으로 각도 조절, 정확히 쳐낸
  // 뒤 짧은 반격과 방어 복귀. 필요하면 멀리서 전진 찌르기. 이어 베기는 짧고 압박은 약하다 (내딛기가 짧아 붙어야 닿음).
  obiwan: {
    label: '중심 방어·짧은 반격',
    attacks: {
      light1: { ...LIGHT, name: '짧은 베기', windup: 0.26, recovery: 0.24, chainAt: 0.09, guardAt: 0.05, next: 'light2', heavyChain: true, reach: 1.94, arc: deg(55), turn: deg(320), lunge: 0.22, whiffExtra: 0.06 },
      light2: { ...LIGHT, name: '짧은 되베기', windup: 0.24, recovery: 0.26, chainAt: 0.1, guardAt: 0.05, next: 'light3', heavyChain: true, reach: 1.93, arc: deg(55), turn: deg(300), lunge: 0.18, whiffExtra: 0.06 },
      light3: { ...FINISH, name: '베고 물러서기', windup: 0.3, recovery: 0.48, chainAt: 0.48, guardAt: 0.16, next: null, heavyChain: false, reach: 1.96, arc: deg(48), turn: deg(260), lunge: 0.26, recoil: 0.45, whiffExtra: 0.08 },
      heavy: { ...HEAVY, name: '전진 찌르기', windup: 0.56, recovery: 0.6, chainAt: 0.6, next: null, heavyChain: false, reach: 2.07, arc: deg(26), turn: deg(220), lunge: 0.85, whiffExtra: 0.26 },
      riposte: { ...LIGHT, name: '짧은 반격', windup: 0.22, recovery: 0.26, chainAt: 0.26, guardAt: 0.12, next: null, heavyChain: false, reach: 1.94, arc: deg(55), turn: deg(320), lunge: 0.16, recoil: 0.3, whiffExtra: 0.06 },
    },
    links: {
      riposte: { parry: 0.4, block: 0 }, // (막은 뒤의 기본 공격은 보통 베기)
      pressOnBlock: null,
      blockStep: { back: 0.75, side: 0.66 },
    },
  },
};

/** 캐릭터 정의: 이름·색·검술(styles·moves.js)·AI 성향(ai.js PERSONAS). 플레이어가 조작해도 같은 검술을 쓴다. */
export const CAST = {
  anakin: { name: '아나킨', full: '아나킨 스카이워커', persona: 'anakin', style: 'anakin', blade: [70, 140, 255], tunic: '#2b211c', tunic2: '#17110e', skin: '#e2b896', hair: '#6b4a2b', trim: '#4a3a30' },
  obiwan: { name: '오비완', full: '오비완 케노비', persona: 'obiwan', style: 'obiwan', blade: [90, 190, 255], tunic: '#d8c7a0', tunic2: '#8a6a45', skin: '#e6bf9e', hair: '#b07a46', trim: '#f0e6cc' },
};
