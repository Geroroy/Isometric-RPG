// 결투 캐릭터의 프리렌더 스프라이트 (tools/sprites/hero — docs/CHARACTERS.md): 결투자의 상태·자세에 맞는 시트 프레임을 고른다.
// 그리기 전용이다 — 판정·시간은 sim·rules가 정하고, 여기서는 그 순간 pose.js가 그리는 자세에 가장 가까운 프레임을 찾는다.
//
// 프레임의 원본은 같은 전투 코드다: export_clips.mjs가 pose.js·gait.js의 자세를 기록하고 그 자세로 모델을 렌더했다. 그래서
//   공격 (준비·판정)  공격 종류의 동작에서 휘두르기 위치 s로 (s = MID 프레임 = 판정이 날 수 있는 첫 순간 = 시트의 hit)
//   공격 (회복)       그 동작의 휘두르기·회수 프레임과 기본·방어 자세 중 지금 자세(손·검끝)에 가장 가까운 것 — 막혀서 튕겨 나온
//                    검·다음 베기로 이어지는 회수도 실제 자세를 따라간다
//   기본 자세 · 방어 · 막으며 밀림  두 겹 (디아블로 2식): 위 겹(허리띠 위·팔·검) = 실제 결투의 대표 자세 중 지금 손·검끝에 가장 가까운 것
//                    (방어는 들어오는 공격을 겨눠 계속 바뀐다), 아래 겹(허리띠 아래) = 선 다리, 또는 걸으면 몸 기준 걷는 방향(앞·뒤·좌·우)의
//                    걷기를 걸은 거리로. 허리띠·허리 장식은 두 겹에 다 있어 이음매를 덮는다
//   반응 · 회피 · 쓰러짐  상태 시간 비율 k로
// 광선검의 날은 시트에 없다: 프레임마다 렌더에서 투영한 칼자루 끝(saberBase)·검끝(saberTip) 표지와 몸에 가려진 구간(b.saber)을
// 게임이 그린다 (view.js).
import { dirIndex, Z_PX } from '../core/iso.js';
import { TUNING as T } from './tuning.js';
import { swingS, LEAD } from './pose.js';

const BASE = (import.meta.env && import.meta.env.BASE_URL) || './';
// 캐릭터마다 세 시트: 몸 전체(공격·반응·회피·쓰러짐) · 위 겹(기본·방어 자세) · 아래 겹(선 다리·걷기) — 한 세트로 합친다
export const SHEETS = (style) => [`sprites/duel/hero_${style}_256.json`, `sprites/duel/hero_${style}_up_256.json`, `sprites/duel/hero_${style}_low_256.json`];
const POSES = 'sprites/duel/hero_poses.json';
const WALK_MIN = 0.25; // (m/s) 이보다 빠르면 걷기 프레임
const TIMED = { parried: 'parried', clash: 'clash', overpowered: 'overpowered', hitstun: 'hitstun', broken: 'broken' };

/** 시트와 동작 라이브러리를 불러온다 (실패하면 null — 시험장은 임시 표현으로 그린다) */
export async function loadFighterSprites(styles = ['anakin', 'obiwan']) {
  const lib = await fetch(BASE + POSES).then((r) => (r.ok ? r.json() : Promise.reject(new Error('동작 라이브러리 없음: ' + POSES))));
  const { loadSheet } = await import('../gfx/sheet.js'); // (브라우저 전용: 파일 캐시 — 노드 시험은 이 모듈의 프레임 고르기만 쓴다)
  const sets = {};
  await Promise.all(
    styles.map(async (s) => {
      const parts = await Promise.all(SHEETS(s).map((u) => loadSheet(BASE + u)));
      sets[s] = { dirs: parts[0].dirs, anims: Object.assign({}, ...parts.map((x) => x.anims)) };
    }),
  );
  return new FighterSprites(lib, sets);
}

export class FighterSprites {
  constructor(lib, sets) {
    this.lib = lib;
    this.sets = sets;
    this.walk = new Map(); // 결투자 → { phase, clip }
  }

  has(f) {
    return !!(this.sets[f.style] && this.lib.styles[f.style]);
  }

  /**
   * 결투자 f의 지금 그림: { parts: [{ clip, i, fr, dy }] (아래에서 위로 그릴 겹 — 한 장 또는 아래·위 두 겹), blade (날 표지를 가진 겹),
   * dir }. fr = 시트 프레임 (page·sx·sy·w·h·ox·oy·k·markers·blades·shadow), dy = 그 겹을 아래로 옮길 게임 px (위 겹을 아래 겹의 골반 높이에).
   * `p`: pose.js poseOf(f, …) (이번 화면의 자세), `dt`: 화면 시간 (걷기 위상).
   */
  pick(f, p, dt) {
    const L = this.lib.styles[f.style];
    const set = this.sets[f.style];
    const dir = dirIndex(f.facing, set.dirs);
    const frame = (clip, i, dy = 0) => {
      const a = set.anims[clip];
      const n = a.data[dir].length;
      const k = Math.min(i, n - 1);
      return { clip, i: k, fr: a.data[dir][k], dy };
    };
    const ch = this.choose(f, p, dt, L);
    if (ch.length === 2) {
      const parts = [frame(...ch)];
      return { parts, blade: parts[0], dir };
    }
    // 겹: [아래 동작, 아래 프레임, 위 동작, 위 프레임] — 위 겹은 아래 겹의 골반 높이로 (Z_PX: 높이 1 m = 화면 24.49 px)
    const [lc, li, uc, ui] = ch;
    const dy = (L[uc].frames[ui].z - L[lc].frames[li].z) * Z_PX;
    const parts = [frame(lc, li), frame(uc, ui, dy)];
    return { parts, blade: parts[1], dir };
  }

  /** [동작, 프레임] (한 장) 또는 [아래 동작, 아래 프레임, 위 동작, 위 프레임] (두 겹) */
  choose(f, p, dt, L) {
    const s = f.state;
    if (s === 'attack') return this.attack(f, p, L);
    if (s === 'dead') return ['dead', nearestK(L.dead, Math.min(1, f.koT / 0.5))];
    if (s === 'dodge') return ['dodge', nearestK(L.dodge, Math.min(1, f.st / T.dodge.dur))];
    if (TIMED[s]) return [TIMED[s], nearestK(L[TIMED[s]], f.st / Math.max(0.05, f.dur))];
    // 서 있거나 걷기 (기본 자세 · 방어 · 막으며 밀림): 위 겹 = 지금 손·검끝에 가장 가까운 대표 자세, 아래 겹 = 선 다리 또는 걷기
    const guard = s === 'guard' || s === 'blockstun';
    const own = local(f, p);
    const up = guard ? 'up_guard' : 'up_stance';
    const ui = nearestPose(L[up], own, null, 0);
    const speed = Math.hypot(f.vx, f.vy);
    const w = this.walk.get(f) || { phase: 0 };
    this.walk.set(f, w);
    if (speed > WALK_MIN && s !== 'blockstun') {
      // 몸 기준 걷는 방향: 앞(f)·뒤(b)·왼쪽(l)·오른쪽(r), 걸은 거리만큼 위상
      const c = Math.cos(f.facing);
      const sn = Math.sin(f.facing);
      const fwd = (f.vx * c + f.vy * sn) / speed;
      const right = (-f.vx * sn + f.vy * c) / speed;
      const d = Math.abs(fwd) >= Math.abs(right) ? (fwd > 0 ? 'f' : 'b') : right > 0 ? 'r' : 'l';
      const name = `${guard ? 'gwalk' : 'walk'}_${d}`;
      const C = L[name];
      w.phase = (w.phase + (speed * dt) / C.stride) % 1;
      return [name, Math.floor(w.phase * C.frames.length) % C.frames.length, up, ui];
    }
    return [guard ? 'low_guard' : 'low_stance', 0, up, ui];
  }

  attack(f, p, L) {
    const a = f.atk;
    const C = L[a.kind];
    const def = a.def;
    if (a.phase !== 'recovery') {
      const sv = swingS(def, a.t);
      if (sv <= 0) {
        // 젖히기 (판정 전 보이는 준비 동작): 공격 시각 비율로
        const pre = def.windup - LEAD;
        return [a.kind, nearestBy(C, (m) => m.phase === 'windup', (m) => Math.abs(m.k - a.t / pre))];
      }
      return [a.kind, nearestBy(C, (m) => m.phase === 'swing', (m) => Math.abs(m.s - sv))];
    }
    // 회복: 실제 자세(막힌 검의 튕김, 다음 베기의 젖힘으로 회수 …)에 가장 가까운 프레임 — 이 공격의 휘두르기·회수(막힌 회수 포함),
    // 눌러 둔 다음 공격의 준비 동작, 돌아가는 기본·방어 자세 중에서
    const own = local(f, p);
    const cands = [[a.kind, (m) => m.phase !== 'windup']];
    const b = f.buffer;
    const next = b && b.type === 'light' ? def.next : b && b.type === 'heavy' && def.heavyChain ? 'heavy' : null;
    if (next && L[next]) cands.push([next, (m) => m.phase === 'windup']);
    let best = [a.kind, 0];
    let bd = Infinity;
    for (const [name, filter] of cands) {
      const i = nearestPose(L[name], own, filter);
      const d = poseDist(L[name].frames[i], own);
      if (d < bd) (bd = d), (best = [name, i]);
    }
    return best;
  }
}

/** pose.js 자세를 몸 기준(시트를 만든 축: X 앞, Y 몸의 왼쪽, Z 위)으로: 손·검끝·골반 높이 */
function local(f, p) {
  const c = Math.cos(f.facing);
  const s = Math.sin(f.facing);
  const L = (q) => {
    const dx = q[0] - f.x;
    const dy = q[1] - f.y;
    return [dx * c + dy * s, -(-dx * s + dy * c), q[2]];
  };
  return { h: L(p.hand), t: L(p.tip), z: p.hips[2] };
}

function poseDist(a, b, zw = 2) {
  let d = 0;
  for (let i = 0; i < 3; i++) d += (a.h[i] - b.h[i]) ** 2 + 0.35 * (a.t[i] - b.t[i]) ** 2;
  return d + zw * (a.z - b.z) ** 2;
}

function nearestPose(C, own, filter, zw = 2) {
  let best = 0;
  let bd = Infinity;
  C.frames.forEach((fr, i) => {
    if (filter && !filter(fr.m)) return;
    const d = poseDist(fr, own, zw);
    if (d < bd) (bd = d), (best = i);
  });
  return best;
}

function nearestBy(C, filter, cost) {
  let best = 0;
  let bd = Infinity;
  C.frames.forEach((fr, i) => {
    if (!filter(fr.m)) return;
    const d = cost(fr.m);
    if (d < bd) (bd = d), (best = i);
  });
  return best;
}

function nearestK(C, k) {
  return nearestBy(C, () => true, (m) => Math.abs((m.k ?? 0) - k));
}
