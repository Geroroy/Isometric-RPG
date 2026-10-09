// Dialogue trees for the base NPCs. A node is { text, choices: [{ text, go }] }
// where `go()` runs the choice's effect and returns the next node (or null to
// end the conversation). Anakin's side is the choice text itself.
import { QUESTS } from './quests.js';

const bye = (text = '(작별한다)') => ({ text, go: () => null });

/** Quest offer / turn-in branch shared by quest givers. */
function questChoices(g, giver, talk) {
  const log = g.quests;
  const out = [];
  const ready = log.readyFrom(giver);
  if (ready) {
    out.push({
      text: `[임무 보고] ${QUESTS[ready].title}`,
      cls: 'quest',
      go: () => {
        log.claim(ready);
        return { text: talk.thanks[ready], choices: [{ text: '(계속)', go: () => talk.root() }] };
      },
    });
  }
  const offer = log.offerFrom(giver);
  if (offer) {
    out.push({
      text: `[임무] ${QUESTS[offer].title}`,
      cls: 'quest',
      go: () => ({
        text: talk.offers[offer],
        choices: [
          { text: '맡겠다.', go: () => (log.accept(offer), { text: talk.accepted[offer], choices: [bye('(출발한다)')] }) },
          { text: '나중에.', go: () => talk.root() },
        ],
      }),
    });
  }
  const active = log.activeFrom(giver);
  if (active && !ready) out.push({ text: `[진행 중] ${QUESTS[active].title} ${log.progress(active)}`, cls: 'dim', go: () => ({ text: talk.waiting[active], choices: [{ text: '(계속)', go: () => talk.root() }] }) });
  return out;
}

// ---------------------------------------------------------------------------

function rex(g) {
  const p = g.player;
  const talk = {
    offers: {
      rex1: '장군님, 기지 서쪽 협곡에 드로이드 정찰 거점이 생겼습니다. 규모는 작지만 그냥 두면 포병 관측소가 될 겁니다. 먼저 쓸어버리시겠습니까?',
      rex2: 'B2들이 거점마다 배치되고 있습니다. 우리 블래스터로는 장갑이 잘 안 뚫리죠. 장군님 광선검이라면 얘기가 다릅니다. 여덟 기만 줄여 주십시오.',
      rex3: '정찰 결과가 나왔습니다. 북서쪽 공장은 거대한 수호 드로이드가 지키고 있습니다. 그게 무너지면 이 구역 드로이드 생산이 멈춥니다.',
    },
    accepted: {
      rex1: '알겠습니다. 너무 앞서가지는 마십시오, 장군님.',
      rex2: '깡통 사냥이군요. 501군단이 엄호하겠습니다.',
      rex3: '이번엔 진짜 큰 놈입니다. 행운을 빕니다, 장군님.',
    },
    waiting: {
      rex1: '서쪽 거점은 아직 건재합니다. 지도(Tab)에서 위치를 확인하십시오.',
      rex2: '아직 B2가 남았습니다. 놈들은 큰 거점에 몰려 있습니다.',
      rex3: '공장 수호자는 아직 움직이고 있습니다.',
    },
    thanks: {
      rex1: '깔끔하군요. 대원들이 보급품을 챙겨 왔습니다. 받아 두십시오.',
      rex2: '여덟 기 확인. 대원들 사이에서 장군님 별명이 또 늘겠군요.',
      rex3: '공장이 멈췄습니다! 크리스토프시스 외곽은 이제 우리 겁니다, 장군님.',
    },
    root: () => ({
      text: p.darkness >= 60 ? '…장군님, 요즘 좀 거칠어지신 것 같습니다. 대원들도 눈치를 챕니다.' : '장군님. 501군단, 명령만 내리십시오.',
      choices: [
        ...questChoices(g, 'rex', talk),
        {
          text: '렉스, 사령부는 신중하라는데… 우리 방식대로 밀어붙이자.',
          go: () => (p.addDarkness(4), { text: '규정은 규정이지만… 장군님 방식이 늘 통하긴 했죠. 따르겠습니다.', choices: [{ text: '(계속)', go: () => talk.root() }] }),
        },
        {
          text: '부상자는 없나? 무리하지 말라고 전해 줘.',
          go: () => ((p.darkness = Math.max(0, p.darkness - 4)), { text: '모두 무사합니다. …신경 써 주셔서 감사합니다, 장군님.', choices: [{ text: '(계속)', go: () => talk.root() }] }),
        },
        bye(),
      ],
    }),
  };
  return talk.root();
}

function ahsoka(g) {
  const p = g.player;
  const talk = {
    offers: {
      ahsoka1: '정예 드로이드들이 뭔가 들고 다녀요. 홀로크론 같아요! 분리주의자들이 제다이 유물을 수집하는 거라면… 두 개만 되찾아 와요, 스카이가이.',
      ahsoka2: '내기해요. 누가 먼저 드로이드 60기를 해치우나. 지는 쪽이 R2 기름칠 담당!',
    },
    accepted: {
      ahsoka1: '역시! 찾으면 바로 가져와요.',
      ahsoka2: '시작! …벌써 세고 있는 거 알죠?',
    },
    waiting: {
      ahsoka1: '정예 드로이드는 큰 거점에 있어요. 푸른 점선 표시가 있는 놈들이요.',
      ahsoka2: '아직이에요? 난 벌써 절반 넘었는데.',
    },
    thanks: {
      ahsoka1: '진짜 홀로크론이네요! 마스터 요다께 보내야겠어요. 이건… 가르침의 일부예요. 받아 두세요.',
      ahsoka2: '…졌어요. 인정할게요, 스카이가이. R2 기름칠은 내가 할게요.',
    },
    root: () => ({
      text: '스카이가이! 또 혼자 앞장서려고요? 마스터 오비완이 걱정하던데.',
      choices: [
        ...questChoices(g, 'ahsoka', talk),
        {
          text: '스니퍼, 검술 대련 한 판 어때?',
          go: () => {
            if (p.buffs.spar) return { text: '방금 했잖아요! 팔 좀 쉬게 해 줘요.', choices: [{ text: '(계속)', go: () => talk.root() }] };
            p.addBuff('spar', 180, { atk: 0.15 });
            g.audio.play('clash');
            return { text: '좋아요! …윽, 역시 빠르네요. 그래도 덕분에 몸이 풀렸죠? (공격 속도 +15%, 3분)', choices: [{ text: '(계속)', go: () => talk.root() }] };
          },
        },
        {
          text: '날 스카이가이라고 부르지 마.',
          go: () => ({ text: '그럼 저도 스니퍼라고 부르지 마세요. …싫어요? 그럼 계속 스카이가이.', choices: [{ text: '(계속)', go: () => talk.root() }] }),
        },
        bye(),
      ],
    }),
  };
  return talk.root();
}

function obiwan(g) {
  const p = g.player;
  const camps = g.world.camps.filter((c) => !c.boss);
  const cleared = camps.filter((c) => c.cleared).length;
  const root = () => ({
    text: p.darkness >= 60 ? '아나킨. 분노가 느껴지는구나. 그 길 끝에 무엇이 있는지 우리는 알고 있지.' : '아나킨. 이번에도 계획은 \'즉흥\'인가?',
    choices: [
      {
        text: '전황은 어떻습니까, 마스터?',
        go: () => ({
          text: `드로이드 거점 ${camps.length}곳 중 ${cleared}곳을 되찾았다. ${cleared < camps.length / 2 ? '아직 갈 길이 멀구나.' : '잘하고 있다. 하지만 자만은 금물이다.'} 북서쪽 공장이 놈들의 심장이다.`,
          choices: [{ text: '(계속)', go: root }],
        }),
      },
      {
        text: '…마음이 무겁습니다. 함께 명상해 주시겠습니까?',
        go: () => {
          const before = p.darkness;
          p.darkness = Math.max(0, p.darkness - 30);
          return {
            text: before > 5 ? '호흡을 가다듬어라. 감정을 부정하지 말고, 흘려보내라… 그래, 좀 나아졌구나. (어둠 -30)' : '네 마음은 지금 고요하구나. 그 상태를 잊지 마라.',
            choices: [{ text: '(계속)', go: root }],
          };
        },
      },
      {
        text: '지오노시스 일은… 아직도 생각납니다.',
        go: () => ({
          text: '두쿠 백작과의 결투 말이냐. 그때 넌 혼자 달려들었지. 다시 겨뤄 보고 싶다면 시작 화면의 \'무비 듀얼\'에서 그날을 떠올려 보거라.',
          choices: [{ text: '(계속)', go: root }],
        }),
      },
      bye(),
    ],
  });
  return root();
}

// Shop: credits come from destroyed droids.
export const SHOP = [
  { id: 'bacta', name: '박타 주사기', desc: '휴대 박타 +1 (최대 5)', price: () => 40, can: (p) => p.bacta < 5, buy: (p) => p.bacta++ },
  { id: 'lens', name: '광선검 집속 렌즈', desc: '광선검 피해 +6%', max: 5, price: (p) => 200 * (p.upgrades.lens + 1), can: (p) => p.upgrades.lens < 5, buy: (p) => p.upgrades.lens++ },
  { id: 'plate', name: '갑옷 보강판', desc: '최대 생명력 +15', max: 5, price: (p) => 180 * (p.upgrades.plate + 1), can: (p) => p.upgrades.plate < 5, buy: (p) => (p.upgrades.plate++, p.recalc()) },
];

function quartermaster(g) {
  const p = g.player;
  const shop = (msg) => ({
    text: `${msg} 보유 크레딧: ${p.credits}`,
    choices: [
      ...SHOP.map((it) => {
        const price = it.price(p);
        const lv = it.max ? ` (${p.upgrades[it.id]}/${it.max})` : '';
        const ok = it.can(p);
        return {
          text: ok ? `${it.name}${lv} — ${it.desc} · ${price} 크레딧` : `${it.name}${lv} — 더 살 수 없음`,
          cls: ok && p.credits >= price ? '' : 'dim',
          go: () => {
            if (!ok) return shop('그건 더 드릴 수 없습니다, 장군님.');
            if (p.credits < price) {
              g.audio.play('deny');
              return shop('크레딧이 부족합니다. 드로이드 부품을 더 회수해 오십시오.');
            }
            p.credits -= price;
            it.buy(p);
            g.audio.play('pickup');
            return shop(`${it.name}, 지급 완료.`);
          },
        };
      }),
      bye('(필요한 건 다 챙겼다)'),
    ],
  });
  return shop('장군님, 보급 창고입니다. 파괴한 드로이드 부품은 크레딧으로 정산해 드립니다.');
}

function r2(g) {
  const p = g.player;
  return {
    text: '삐-빅! 뿌우-웅? (R2가 반갑게 돔을 돌린다)',
    choices: [
      {
        text: 'R2, 몸 좀 봐 줄래?',
        go: () => {
          const wait = Math.ceil((g.r2RepairAt || 0) - g.time);
          if (wait > 0) return { text: `삐빅… (수리 도구 충전 중: ${wait}초)`, choices: [bye()] };
          g.r2RepairAt = g.time + 90;
          p.hp = p.maxHp;
          p.force = p.maxForce;
          g.fx.ring(p.x, p.y, 0.8, '#7dff9a', 0.5);
          g.audio.play('pickup');
          return { text: '삐-빅 삑! (생명력과 포스가 모두 회복되었다)', choices: [bye('고마워, 친구.')] };
        },
      },
      bye('나중에 보자, R2.'),
    ],
  };
}

const TREES = { rex, ahsoka, obiwan, quartermaster, r2 };

export function startDialogue(g, npc) {
  return TREES[npc.npcId](g);
}
