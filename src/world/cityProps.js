// What the world needs to know about each Coruscant undercity sprite
// (gfx/citySprites.js): its collision footprint (from the sprite's JSON), the
// lights it throws, where steam leaves it, the sound it makes, and for the
// billboard the frame its hologram fills. Offsets are world tiles from the
// prop's origin (its ground centre); z in tiles up.

export const SHEET_PROPS = {
  cantina: {
    lights: [
      [0.4, 3.9, 1.0, 255, 160, 80, 150, 0.06], // the doorway's spill
      [0.4, 3.2, 3.9, 255, 90, 160, 90, 0.18], // the round sign
      [3.4, -1.1, 2.6, 80, 230, 220, 60, 0.12], // the glyph board's tube
      [2.6, -0.4, 4.6, 255, 190, 120, 70, 0.08], // balcony lamps
    ],
    steam: [[-2.0, -1.6, 6.9], [-0.4, -2.2, 6.9], [1.0, -1.2, 6.9]],
    sound: { name: 'cantina', at: [0.4, 3.4], rad: 16, vol: 1 },
  },
  tenement0: { lights: [[2.1, 2.1, 5, 255, 70, 210, 80, 0.2]], steam: [] },
  tenement1: { lights: [[2.1, 2.1, 5, 80, 230, 255, 80, 0.2]], steam: [] },
  tenement2: { lights: [[2.1, 2.1, 5, 255, 180, 70, 80, 0.2]], steam: [] },
  // street food in the Star Wars manner (tools/sprites/build_city_assets.py), serving
  // towards +y (the `_r` sprites are turned to serve towards +x); `food`: the
  // vendor's name and what they call out
  hoverBlueMilk: { lights: [[0, -0.05, 1.4, 140, 200, 255, 60, 0.05]], vendor: [0.3, 1.0], food: 'blueMilk' },
  hoverGorg: { lights: [[0, 0, 1.4, 255, 190, 120, 40, 0.06]], vendor: [0.3, 1.0], food: 'gorg' },
  hoverFruit: { lights: [[0, 0, 1.4, 255, 200, 140, 40, 0.06]], vendor: [0.3, 1.0], food: 'fruit' },
  roasterRonto: { lights: [[1.0, 0.35, 0.82, 255, 140, 60, 90, 0.15]], steam: [[1.5, 0.35, 1.0]], vendor: [1.2, 1.15], food: 'ronto', sound: { name: 'steam', at: [1.3, 0.35], rad: 5, vol: 0.3 } },
  roasterNuna: { lights: [[1.0, 0.35, 0.82, 255, 140, 60, 90, 0.15]], steam: [[1.5, 0.35, 1.0]], vendor: [1.2, 1.15], food: 'nuna', sound: { name: 'steam', at: [1.3, 0.35], rad: 5, vol: 0.3 } },
  podSpotchka: { lights: [[0, 0.9, 1.0, 120, 220, 255, 70, 0.06]], vendor: [0.95, 1.0], food: 'spotchka' },
  podJawaJuice: { lights: [[0, 0.9, 1.0, 200, 230, 120, 70, 0.06]], vendor: [0.95, 1.0], food: 'jawaJuice' },
  dinerNerf: { lights: [[1.3, 0, 1.1, 255, 200, 140, 70, 0.04], [-0.4, 0.8, 1.0, 255, 210, 150, 70, 0.04]], steam: [[-1.75, 0, 1.75]], vendor: [-1.5, 1.2], food: 'nerf' },
  dinerBantha: { lights: [[1.3, 0, 1.1, 255, 200, 140, 70, 0.04], [-0.4, 0.8, 1.0, 255, 210, 150, 70, 0.04]], steam: [[-1.75, 0, 1.75]], vendor: [-1.5, 1.2], food: 'bantha' },
  cargoMeat: { lights: [[0, 0.3, 1.2, 255, 200, 130, 90, 0.05]], vendor: [1.65, 1.0], food: 'meat' },
  cargoBread: { lights: [[0, 0.3, 1.2, 255, 200, 130, 90, 0.05], [-0.9, 0.1, 0.45, 255, 130, 60, 40, 0.15]], steam: [[-0.9, -0.2, 0.9]], vendor: [1.65, 1.0], food: 'bread' },
  cargoMilk: { lights: [[0, 0.3, 1.2, 160, 210, 255, 90, 0.05]], vendor: [1.65, 1.0], food: 'milk' },
  tentStew: { lights: [[-0.3, 0, 0.3, 255, 110, 50, 50, 0.2]], steam: [[-0.3, 0, 0.7]], vendor: [0.9, 1.05], food: 'stew' },
  tentGorg: { lights: [[0, 0.5, 1.0, 255, 190, 120, 40, 0.06]], vendor: [0.9, 1.05], food: 'gorgMarket' },
  skiffFruit: { lights: [[-0.2, 0, 1.6, 255, 200, 140, 50, 0.05]], vendor: [0.4, 1.0], food: 'skiffFruit' },
  skiffAle: { lights: [[-0.2, 0.6, 0.6, 255, 190, 110, 50, 0.08]], vendor: [0.4, 1.0], food: 'ale' },
  seatsA: { lights: [[0.05, 0.05, 1.4, 255, 130, 60, 50, 0.1]] },
  seatsB: { lights: [[0.05, 0.05, 1.4, 255, 130, 60, 50, 0.1]] },
  // the hologram: a panel facing the camera (along world x − y), drawn by the renderer
  billboard: { holo: { x: 0.1, y: 0.1, z0: 3.0, z1: 4.6, hw: 1.3 }, lights: [[0.1, 0.1, 3.8, 120, 220, 255, 90, 0.1]] },
  speeder0: { bob: 1.2, lights: [[0, 0, 0.1, 80, 160, 255, 34, 0.05]] },
  speeder1: { bob: 1.2, lights: [[0, 0, 0.1, 80, 160, 255, 34, 0.05]] },
  crates: {},
  barrels: {},
  ventGrate: { flat: true, steam: [[0, 0, 0.1]], sound: { name: 'steam', at: [0, 0], rad: 6, vol: 0.6 }, lights: [[0, 0, 0.1, 255, 110, 50, 40, 0.1]] },
  droidParts: {},
  trashBin: {},
  junctionBox: { lights: [[0.3, 0, 1.1, 120, 255, 140, 24, 0.3]] },
};

// --- the Coruscant underworld set (public/sprites/underworld, cut from the concept sheets by
// tools/sprites/underworld/extract.py; the layout is data/undercity.json). Offsets in tiles.
const UW = {
  aptModuleA: { lights: [[1.2, 0.6, 2.6, 255, 70, 210, 60, 0.2], [-1.0, 0.8, 1.8, 80, 230, 255, 50, 0.1]] },
  aptStackB: { lights: [[-1.1, 0.7, 2.4, 255, 70, 210, 60, 0.2], [1.2, 0.8, 1.6, 120, 220, 255, 50, 0.1]] },
  aptBalconyC: { lights: [[0.6, 1.0, 1.4, 255, 60, 220, 70, 0.3]] },
  aptModuleC: { lights: [[1.3, 0.6, 2.4, 80, 230, 255, 60, 0.1], [-1.2, 0.9, 1.8, 255, 180, 70, 50, 0.1]] },
  buildingBlock: { lights: [[0.4, 1.2, 1.6, 255, 60, 220, 70, 0.3], [-2.0, 0.6, 2.6, 80, 230, 255, 50, 0.1]] },
  ramenStand: { lights: [[0.2, 0.9, 1.6, 255, 80, 170, 90, 0.15]], steam: [[-0.5, -0.1, 1.4]], vendor: [0.2, 1.4], food: 'ramen' },
  pawnShop: { lights: [[0.0, 1.2, 1.7, 255, 180, 70, 80, 0.1]] },
  pawnShopE: { lights: [[0.0, 1.0, 1.6, 255, 180, 70, 70, 0.1]] },
  marketStall: { lights: [[0.2, 1.3, 1.8, 120, 255, 140, 70, 0.15]], vendor: [0.3, 1.9], food: 'market' },
  tradeKiosk: { lights: [[0.0, 1.1, 1.5, 120, 255, 140, 60, 0.1]], vendor: [0.2, 1.5], food: 'kiosk' },
  denseMarket: { lights: [[0.6, 1.2, 2.4, 255, 180, 70, 80, 0.15], [-0.8, 1.0, 1.6, 255, 80, 170, 60, 0.2]], vendor: [0.0, 1.9], food: 'market' },
  skewerCart: { lights: [[0.0, 0.2, 0.8, 255, 140, 60, 60, 0.2]], steam: [[0.2, 0.0, 1.0]], vendor: [0.2, 1.1], food: 'skewers', sound: { name: 'steam', at: [0.2, 0], rad: 5, vol: 0.3 } },
  skewerCartB: { lights: [[0.0, 0.2, 0.8, 255, 140, 60, 60, 0.2]], steam: [[0.1, 0.0, 1.0]], vendor: [0.2, 1.1], food: 'skewers' },
  dumplingStall: { lights: [[0.0, 0.4, 1.4, 255, 190, 110, 70, 0.1]], steam: [[-0.3, 0.1, 1.2], [0.4, 0.1, 1.2]], vendor: [0.2, 1.3], food: 'dumplings' },
  blueMilkStand: { lights: [[0.0, 0.3, 1.2, 140, 200, 255, 70, 0.05]], vendor: [0.2, 1.3], food: 'blueMilk' },
  groguWagon: { lights: [[0.4, 0.3, 1.6, 255, 80, 200, 70, 0.15], [-0.6, 0.2, 1.4, 80, 230, 255, 60, 0.1]], vendor: [0.3, 1.4], food: 'snack' },
  verticalPipes: {},
  conduitBundle: { flat: true },
  steamVent: { steam: [[0.0, -0.1, 1.5], [0.3, 0.0, 1.5]], lights: [[0, 0, 0.3, 255, 110, 50, 30, 0.2]], sound: { name: 'steam', at: [0, 0], rad: 7, vol: 0.6 } },
  ventStack: { steam: [[0.0, 0.0, 2.2]], sound: { name: 'steam', at: [0, 0], rad: 6, vol: 0.4 } },
  crateStack: {},
  crateBarrels: {},
  barrelPile: {},
  scrapHeap: {},
  tradeTerminal: { lights: [[0.0, 0.3, 1.0, 90, 220, 255, 40, 0.1]] },
  trashCompactor: { steam: [[0.4, -0.2, 1.4]], lights: [[0.6, 0.6, 0.5, 255, 110, 60, 24, 0.3]] },
  compactorUnit: { steam: [[0.2, -0.2, 1.2]], lights: [[0.4, 0.5, 0.5, 120, 255, 140, 20, 0.3]] },
  conduitArray: { lights: [[0.2, 0.4, 1.0, 120, 255, 140, 30, 0.3]] },
  lightPost: { lights: [[0.1, 0.0, 2.8, 120, 255, 140, 110, 0.05], [0.4, 0.2, 1.8, 90, 220, 255, 36, 0.1]] },
  lightPostHolo: { lights: [[0.0, 0.0, 2.6, 255, 200, 120, 90, 0.05], [0.3, 0.2, 2.0, 255, 170, 70, 40, 0.1]] },
  abandonedSpeeder: {},
  speederBike: {},
  neonSignSet: { lights: [[-0.3, 0.3, 2.0, 255, 80, 170, 90, 0.2], [0.5, 0.3, 1.8, 80, 230, 255, 70, 0.1], [0.0, 0.5, 1.2, 255, 220, 80, 50, 0.15]] },
  barSign: { lights: [[0.0, 0.4, 1.8, 200, 90, 255, 100, 0.35]] },
  signPost: { lights: [[0.0, 0.0, 2.2, 80, 230, 255, 40, 0.1], [0.0, 0.0, 1.6, 255, 180, 70, 30, 0.15]] },
};
Object.assign(SHEET_PROPS, UW);

// a sprite rendered turned 90° (`NAME_r`): what faced +y faces +x, so every
// offset (x, y) becomes (y, −x)
const turn = ([x, y, ...rest]) => [y, -x, ...rest];
for (const n of ['hoverBlueMilk', 'hoverFruit', 'roasterNuna', 'dinerBantha', 'cargoBread', 'skiffAle']) {
  const d = SHEET_PROPS[n];
  SHEET_PROPS[n + '_r'] = {
    ...d,
    lights: d.lights && d.lights.map(turn),
    steam: d.steam && d.steam.map(turn),
    vendor: d.vendor && turn(d.vendor),
    sound: d.sound && { ...d.sound, at: turn(d.sound.at) },
  };
}

// what each stall's vendor is called and calls out (lore-friendly street food)
export const FOODS = {
  blueMilk: ['블루 밀크 상인', ['블루 밀크! 반사 젖으로 짠 진짜 블루 밀크요!', '그린 밀크도 있어요. 어디서 났는지는… 묻지 마세요.', '타투인 농장 직송! …이라고 쓰여 있긴 하네요.']],
  gorg: ['고르그 장수', ['싱싱한 고르그요! 오늘 아침에 잡았어요!', '고르그 한 마리 어때요? 허트들도 이것만 찾는다니까요.', '안 물어요, 안 물어. …아마도요.']],
  fruit: ['과일 장수', ['조간 과일 하나 드셔 보세요, 장군님!', '메일루룬 멜론이에요, 나부에서 온 거라고요!', '무자 과일 반값! 오늘만이에요.']],
  ronto: ['론토 로스터', ['론토 랩 나왔습니다! 포드레이서 엔진 불로 구운 거예요!', '이 엔진 말이죠, 예전엔 분타 이브 클래식에 나갔던 거라고요.', '불맛 하나는 은하계 최고!']],
  nuna: ['누나 다리 구이', ['누나 다리 구이! 겉은 바삭, 속은 촉촉!', '포드레이서 엔진 불로 구워야 제맛이지.', '두 개 사시면 하나 더 드려요!']],
  spotchka: ['스폿츠카 바', ['스폿츠카 한 잔? 빛나는 건 정상이에요.', '탈출 포드에서 파는 술, 낭만 있지 않나요?', '크릴로 빚은 거예요, 코렐리아식으로.']],
  jawaJuice: ['자와 주스 가게', ['자와 주스! 자와가 만든 건 아니에요, 이름만요.', '론토 젖으로 만들어서 든든해요.', '시원한 걸로 한 병 드릴까요?']],
  nerf: ['코코 타운 다이너', ['너프 버거 나왔습니다! 코코 타운 다이너 그 맛 그대로!', '이 화물선 조종석, 진짜로 날던 거예요.', '장군님 오셨네! 블루 밀크 한 잔은 서비스!']],
  bantha: ['반사 스테이크 다이너', ['반사 스테이크, 두툼하게 썰어 드려요.', '조종석 자리 비었어요, 앉으세요!', '전쟁 끝나면 이 배, 다시 날려 볼 거예요.']],
  meat: ['정육 컨테이너', ['반사 갈비, 마이녹 육포! 골라 보세요.', '말린 마이녹, 술안주로 최고죠.', '론토 랩도 말아 드려요.']],
  bread: ['포션 브레드 가게', ['물만 부으면 빵이 부풀어요! 포션 브레드!', '배급 식량보단 낫죠, 장군님.', '갓 부풀린 빵 냄새 맡고 오셨죠?']],
  milk: ['밀크 바', ['블루 밀크, 그린 밀크, 다 있어요!', '반사 젖은 오늘 들어왔어요.', '병은 다 드시고 돌려주셔야 해요.']],
  stew: ['샥 스튜 천막', ['샥 고기 스튜 한 그릇! 나부 할머니 비법이에요.', '추운 하층엔 스튜가 최고죠.', '그릇은 다 드시고 돌려주세요.']],
  gorgMarket: ['고르그 시장', ['고르그 산 채로 팔아요! 요리는 알아서!', '이 놈은 크고 실해요.', '허트 궁전에 납품하던 물건이라니까요.']],
  skiffFruit: ['스키프 과일전', ['메일루룬, 조간, 무자, 팔리! 스키프 위에서 다 골라요.', '이 스키프, 아직 떠요. 과일만 내리면요.', '장군님, 비타민 챙기셔야죠!']],
  ale: ['코렐리안 에일 스키프', ['코렐리안 에일 한 잔! 클론들도 휴가 땐 여기 와요.', '설러스트 진도 있어요, 독한 걸로.', '경치는 없어도 술은 있어요.']],
  // the underworld set's stalls
  ramen: ['누들 가판대', ['뜨끈한 누들 한 그릇! 하층 추위엔 이게 최고예요.', '국물은 반사 뼈로 열두 시간 우렸어요.', '장군님, 매운 걸로 드릴까요?']],
  skewers: ['꼬치 카트', ['개구리 꼬치! 갓 구웠어요!', '어디 개구리냐고요? …묻지 마세요.', '세 개 사면 하나 더!']],
  dumplings: ['은하 만두집', ['만두 쪘어요! 김 나는 거 보이시죠?', '속은 너프 고기, 피는 포션 브레드로 빚었어요.', '한 판 포장해 드릴까요, 장군님?']],
  snack: ['그로구 스낵 왜건', ['테크 크레이트 간식! 아이들이 제일 좋아해요.', '이 왜건 네온은 제가 직접 달았어요.', '포장해 드릴까요? 날개 달린 애들 거예요.']],
  market: ['시장 노점', ['뭐든 있어요, 뭐든! 물어만 보세요.', '밀수품은 아니에요. 거의요.', '가격은 흥정 가능!']],
  kiosk: ['고물 교역 키오스크', ['드로이드 부품 삽니다, 팝니다!', '이 홀로프로젝터, 아직 돌아가요. 가끔.', '현금만 받습니다, 장군님.']],
};

let FOOTPRINTS = {};

/** The sprites' collision outlines (tiles from the origin), once they are loaded. */
export function setCityFootprints(city) {
  FOOTPRINTS = Object.fromEntries(Object.entries(city).filter(([, v]) => v.meta).map(([k, v]) => [k, v.meta.footprint]));
}

export const cityFootprint = (name) => FOOTPRINTS[name] || null;

export function inPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
