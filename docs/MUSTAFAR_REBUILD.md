# 무스타파 결투 재개발

목표: 《시스의 복수》의 아나킨 대 오비완 무스타파 결투를 영화의 사건 순서와 결말대로 직접 겪는, 실시간 광선검 액션 RPG의
시네마틱 결투(Diablo II식 조작감; Commandos 2는 그래픽 참고만 — `CLAUDE.md` "프로젝트 정체성").
플레이어는 아나킨. 대체 결말은 범위 밖. 시각 에셋은 외부 제작(`CLAUDE.md` "역할 분리", `docs/ASSETS.md`), 여기서는
게임플레이와 통합만 한다. 사용자 승인 전에는 다음 스테이지로 넘어가지 않는다.

## 백업과 주소

- 재개발 전 무스타파 전체: 커밋 `6b7ddd8` (작업 브랜치 `ccr-da9fc683-ysnrrp`에 푸시됨). 에셋·코드는 지우지 않았다.
- `#duel-mustafar` — 재개발 (메뉴에 있음)
- `#duel-mustafar-legacy` — 이전 영화 세트 맵 (`MustafarArena` + `MustafarDuel`, 맵 에디터 F2) — 메뉴에서 뺌, 참고용
- `#duel-mustafar-art` — 이전 그림 맵 (`ArtDuel`) — 메뉴에서 뺌, 참고용

## 구조

| 무엇 | 어디 |
|---|---|
| 존 파일 (구역마다 하나) | `public/maps/mustafar_v2/<zone>.json`, 생성기 `tools/maps/mustafar_v2/<zone>.py` |
| 존 → 월드 | `src/world/mustafarStage.js` `MustafarStage` (타일 맵 biome/blocked, 조명, 시작점, 카메라 상자) |
| 외부 에셋 | `public/assets/mustafar/` + `manifest.json`, 로더 `src/gfx/assetManifest.js` |
| 바닥 타일 배치 | `src/gfx/padFloor.js` (외부 텍스처를 월드 좌표로 샘플링; 없으면 디버그 그리드) |
| 결투 감독 | `src/game/mustafar/director.js` `MustafarDirector` — 기존 `Duel` 규칙(장비, 평정, 막기, 칼날 겨루기, 컷신, 결과)을 확장, `STAGES` 순서 |
| QA | `tools/qa/mfstage01.mjs`, `tools/qa/assets_manifest.mjs` |

존 파일은 관심사마다 층을 나눈다 (월드 m, 1 타일 = 1 m): `floor`(바닥: 배치 + 매니페스트 id), `surround`(주변 지형),
`walk`(걸을 수 있는 사각형), `collision`(그 안의 막힌 곳), `structures`·`decor`(스프라이트 에셋 `{asset, x, y, block}`),
`backdrop`, `actors`(시작 위치), `triggers`(컷신·이벤트 영역), `camera`(카메라 상자), `lights`, `regions`.
충돌·이동은 데이터가 정하고 그림에 의존하지 않는다.

## 개발 순서 (플레이 가능한 완성본 우선 — `CLAUDE.md` "개발 방침")

1. STAGE 01 착륙장 플레이 가능 상태 완성
2. 결투의 나머지 주요 장소 구현
3. 스테이지 간 진행, 전투·컷신 연결
4. 처음부터 끝까지 플레이 가능한 전체 결투
5. 스크린샷·플레이 테스트로 문제점 검토
6. 개선 효과가 큰 에셋만 선별 교체

텍스처의 영화 재현도보다 플레이에 지장을 주는 문제를 먼저 고친다.

## 로드맵 (각 스테이지의 세부 순서는 영화 장면을 확인해 정한다)

1. STAGE 01 착륙장 — 바닥 → 이동·충돌 → 가장자리·난간 → 진입 통로 → 우주선 → 캐릭터 배치 → 컷신·결투 시작
2. STAGE 02 착륙장 결투 시작
3. STAGE 03 분리주의 연합 제어실
4. STAGE 04 외부 보행로 · 채굴 시설
5. STAGE 05 용암 강
6. STAGE 06 고지대 최종 결투

## 현재 상태 (STAGE 01, 바닥 단계)

- 착륙장 44 × 38 m(설계 가정, 영화 대비 미측정), 전체 걷기 가능, 용암 쪽은 막힘. 아나킨 혼자, 이동·공격·스킬·막기 동작 확인.
- 바닥 그래픽: `mf.landing.floor` **받음**(외부 제작 시트 `tools/assets/mustafar/src/landing_floor_sheet.png`, 자르기만 하는
  `tools/assets/mustafar/slice_landing_floor.py` → `public/assets/mustafar/landing/`). 베이 6종, 테두리 띠(바깥 가장자리가 아래쪽:
  매니페스트 `outer: "bottom"`), 띠 아래쪽의 트러스 면은 가까운 두 변 아래의 옆면(`side`, 깊이 약 0.57 m)으로 쓴다. 모서리 조각은
  탑다운이 아니라 쓰지 않고, 띠를 대각선으로 맞대어 잇는다. 베이는 약 66 px/m(요청 96)지만 승인 기준을 만족해 그대로 쓴다.
- 주변 용암: 이전 무스타파의 용암 텍스처를 임시로 사용(존 파일 `surround.placeholder`).
- 착륙장 에셋 모두 받음: 난간(네 변, `rail_x` · `rail_y` · 모서리 기둥), 파드메의 우주선(가운데 클램프 위, 선체가 막음),
  진입 통로(−x 변 가운데에서 13.1 m, 위에서 본 바닥 + 정면도 벽 3장을 엔진이 세움: `wallElevation`). 시트는
  `tools/assets/mustafar/src/`, 자르기·배경 제거는 `tools/assets/mustafar/slice_landing_structures.py`(`key_checker.py`).
  QA `tools/qa/mfstage01.mjs` 23항목.
- 캐릭터 호환 확인: 기존 오비완(`ObiWan`, `obiwan3`)을 STAGE 01에 세우면 그대로 돈다(맴돌기·공격·막기·칼날 겨루기, 피해
  주고받음, 오류 없음), 파드메(`padme`: idle · talk · choked · collapse · down)도 그대로 그려진다 — 새 캐릭터 에셋 불필요.
- **STAGE 01 플레이 가능**(`src/game/mustafar/director.js`; 장면 위치는 존 파일 `actors`):
  ① 도착 — 파드메가 우주선 램프 아래에 나타나고, 아나킨이 시설에서 걸어 나와 그녀에게 감, 대화, 오비완이 램프에 나타남(약 30초,
  음악 없이 용암 앰비언스) ② 포스 초크 — 이전 결투의 영화 오프닝을 그대로 재사용(영화 음원 `mustafarIntro`: 초크·쓰러짐·대면·
  로브 벗기·점화, 71초) ③ 착륙장 결투(기존 오비완 AI, 음악 `mustafarA`) — 오비완 체력 0.9 눈금 또는 영화 0:34(플레이 34초)에
  ④ 통로로 밀고 들어가는 장면 ⑤ 통로 안 결투 — 먼 문 도달·0.84 눈금·30초 중 먼저 오는 것에 ⑥ 문 앞 장면 → STAGE 01 완료 화면
  (다음: 분리주의 회의실, 개발 중). 컷신은 Esc로 건너뛰어도 같은 상태로 이어진다.
  이전 결투(`duelMustafar.js`)의 연출 메서드(오프닝, 포즈, 점화, 이동·충돌 장면, 포스 푸시, 눈금 필터)를 그대로 빌려 쓴다.
  QA: `tools/qa/mfstage01_story.mjs`(전체 흐름 2회: 시청 / 건너뛰기·시간 진행), `tools/qa/mfstage01.mjs`(장소).
- 알려진 한계: 파드메의 기존 세트에 걷기 동작이 없어(idle·talk·choked·collapse·down) 램프 아래에 서서 맞이한다(아나킨이 다가감).
  우주선 램프 끝은 선체 충돌 안 — 장면 위치는 선체 앞쪽으로 잡았고, 결투 시작 때 막힌 칸에 선 유닛은 가장 가까운 빈칸으로 옮긴다.
- **STAGE 02 플레이 가능**(존 `stage02.json`, 생성기 `tools/maps/mustafar_v2/stage02.py`; 두 존을 한 월드에 합쳐 깐다 — `main.js` `ZONES`):
  통로 끝 문(`facilityDoor`: 벽 그림 + 막힌 칸, 감독이 연다) → 문 장면(문이 열리고 회의실로 밀고 들어감) → 회의실 결투(0.76 눈금 또는
  28초) → 서로의 포스가 맞부딪쳐 날아가는 장면(이전 결투의 교차로 장면을 이 방에서) → STAGE 02 완료 화면(다음: 제어실, STAGE 03).
  회의실 에셋 9장은 요청 크기 그대로·실제 투명으로 와서 손대지 않고 썼다(바닥 위에서 본 그림, 벽 정면도 4장을 엔진이 세움, 탁자·의자
  2방향·콘솔은 가이드 위 스프라이트). QA: `mfstage01_story.mjs` 21항목(두 스테이지 전체), `mfstage01.mjs`(문이 닫혀 있다가 열림 포함).
- 다음 스테이지 순서: STAGE 03 제어실(회의실에서 이어짐; 에셋 요청은 평면 그림 + 가이드 방식) → 산업 보행로·
  용암 집하 시설 → 용암 강·이동 플랫폼 → 고지대와 결말. 이전 맵(`#duel-mustafar-legacy`)의 영화 장면 스크립트
  (`duelMustafar.js`: 세트별 대사, 용암 비, 케이블, 집하기 팔, 강의 드로이드·플랫폼, 고지대 결말)를 장소마다 옮겨 쓴다.

## 블록아웃 (STAGE 03–06) — 레벨 제작 순서 ①②

사용자 지시(`CLAUDE.md` "레벨 제작 순서"): 전체 동선을 먼저 블록아웃 → 캐릭터로 시험 → 대표 구역 하나를 목표 품질로 완성.

- 존 `stage03`~`stage06`(생성기 `tools/maps/mustafar_v2/stage0N.py`, 공용 `_zone.py`): 방 크기, 출입구, 플랫폼, 높이 변화,
  스테이지 연결. 가구·구조물은 `blockout` 층의 회색 상자(`src/gfx/blockout.js`: 해치·라벨, 화면 배지에 "블록아웃" 표시) —
  사용자가 허가한 임시 플레이스홀더, 최종 그래픽 아님. 높이는 `surfaces`(그 위에 선 유닛의 z), 용암 위 걷는 선은 `strips`,
  강의 갑판은 감독이 움직이는 `floats`.
- 동선 (1 타일 = 1 m): 회의실 서쪽 문(밀어내기 뒤 열림) → 연결 통로 6 × 4 m → **제어실** 18 × 18 m(창 쪽 상부 회랑 +0.6 m,
  가운데 계단, 방어막 발생기, 홀로 테이블 2) → 발코니 문 → **발코니 테라스** 20 × 5 m → **보행로** 23 × 2 m(끝 8 m 붕괴) →
  케이블 장면 → **배관** 14 m(+0.35 m, 폭 0.9 m 선) → 도약 → **집하기 팔** 22 × 3 m(+0.3 m), 북쪽 끝 탑 → 탑 붕괴, 팔이 강으로 →
  **용암 강**(동쪽으로 흐름): 떠내려가는 팔 → 드로이드·리펄서 플랫폼(3.2 m) → **고지대 둑** 24 × 13 m(꼭대기 +1.4 m, 경사 4 m,
  물가 2 m) → 영화 결말.
- 감독: `src/game/mustafar/route.js`(이전 결투 `duelMustafar.js`의 영화 장면을 이 동선의 위치로). 파트와 눈금:
  control 0.64 · balcony 0.56 · rain 0.5(용암 비) · pipe 0.46(균형) · arm 0.4(용암 폭탄) · arm2 0.32(칼날 겨루기 강제) ·
  raft 0.26 · river 0.22 → 결말(영화 음원). 파트 바로 가기: `?mfPart=<파트>#duel-mustafar`.
- 시험: `tools/qa/mfroute.mjs`(A 파트별 공간·충돌·화면·가림·교전·전환, B 회의실→결말 연속, C 장면 건너뛰기 연속, D 높이·문).
  찾아서 고친 것: 집하기 탑이 배관 북쪽 끝의 아나킨을 가림(16%) → 배관을 탑의 화면 영역 남쪽으로; 리펄서 플랫폼 2.4 m는
  싸우기에 너무 좁음 → 3.2 m. 블록아웃 결과로 필요해진 것: 회의실 측벽의 문 버전(`conf_wall_door_side`).

## 에셋 대기 (사용자가 넣지 않은 스프라이트 — 요청서 `docs/asset_requests/chatgpt_route_assets.md`)

매니페스트에 `requested`로 기록(27개, 3개 받음 → 24개 대기; 남은 것만 한 번에: `docs/asset_requests/chatgpt_all_missing.md`). 도착 전에는 회색 상자·이전 텍스처가 자리를 지키며, 그 스테이지는 시각적으로 완성이 아니다.

| 장소 | 요청 (§) | 지금 화면 |
|---|---|---|
| 착륙장 보강 | 로브·망토 (§1) | **받음** — 벗은 자리에 놓임 (`throwRobe`) |
| 용암 (모든 곳) | `lava_tile` (§1) | **받음** — 8 m 타일 그대로(반복을 숨기는 두 번째 배율 섞기는 엔진 쪽) |
| 회의실 측벽 문 버전 | `conf_wall_door_side` (STAGE 03 요청에 포함) | 서쪽 문은 그림 없이 열림 |
| STAGE 03 제어실·통로 | 바닥 3, 벽 4, 회랑 가장자리, 통로 3, 계단·방어막 발생기·홀로 테이블 (§2); 콘솔은 회의실 `conf_console` 재사용 | 회색 상자 |
| STAGE 04 보행로·집하 시설 | 테라스 바닥, 보행로 2, 용암 폭포, 배관, 팔, 탑 (§3); 테라스 난간은 착륙장 난간 재사용 | 회색 상자 |
| STAGE 05 용암 강 | 채굴 드로이드, 리펄서 플랫폼 (§4); 떠내려가는 팔은 §3의 팔 | 회색 상자 |
| STAGE 06 고지대 | 둑 한 장(`groundImage`) (§5) | 회색 상자 |

요청하지 않은 것: 캐릭터 그림·포즈(규칙상 기존 세트 유지, 없는 포즈는 가까운 프레임), 케이블·용암 비·폭탄(엔진 효과).
이전 맵의 세트 스프라이트(`public/sprites/mustafar/`)는 프로젝트에서 재투영·재채색한 것이라 이 재개발에는 쓰지 않는다(삭제하지 않음).

## STAGE 03 제어실 — 그림만 남은 상태

- 게임플레이 완성: 회의실 밀어내기 → 서쪽 문(회의실 벽이 문 열린 그림으로 바뀜, 그림 도착 시) → 연결 통로 → 제어실 결투(0.64 눈금
  또는 40초; 상부 회랑·계단·홀로 테이블 사이) → 방어막 발생기 장면(경보등) → 발코니 문(낮은 벽의 열린 틈, 보이지 않는 벽 없음) →
  STAGE 04. 시험 `tools/qa/mfroute.mjs`(A control, B, C, D 회랑·문).
- 그림 연결 완료: 요청서 `docs/asset_requests/chatgpt_stage03_control.md`의 14장은 각자 자리(존 `structures`·`floor`)가 정해져
  있어, 매니페스트에서 `delivered`가 되면 회색 상자(`blockout`의 `art`)가 빠지고 그림이 선다. 회랑 바닥은 0.6 m 높이에 그린다
  (`padFloor.js` 높은 바닥), 회랑 위 콘솔은 회의실 콘솔 재사용(`z` 0.6). 대역 그림으로 자리 확인: `tools/qa/mfstage03_art.mjs`.
- 받음: `ctl_floor`, `ctl_gallery_floor`(그대로 사용, 회랑 바닥은 0.6 m 높이). 회랑 앞 가장자리는 얇은 회색 면이 대신한다(그림이
  오면 빠짐). 나머지 12장 대기 — 요청서의 노트(`docs/asset_requests/delivered/mustafar_control_notes.md`)에 14장이 모두 적혀 있으나
  파일은 2장만 받음.
- **시각적으로 완성 아님**: 나머지 그림이 올 때까지 회색 상자(화면 배지에 표시).

## STAGE 04 보행로·집하 시설 — 받은 그림 (`docs/asset_requests/delivered/mustafar_exterior_notes.md`)

- 받음(그대로 사용): `terrace_floor`(테라스 20 × 5 m), `catwalk_segment` × 2 + 끝 칸, `catwalk_broken`(붕괴 때 끝 칸과 바뀜),
  `lava_fall`(테라스 서쪽 끝 너머), `collector_arm`(집하기 팔, 0.3 m 데크 — 강에서는 같은 그림이 떠내려가는 팔이 됨, 그 위 0.3 m).
  테라스 난간은 착륙장 난간(`rail_x`·`rail_y`) 재사용.
- 그림에 맞춘 배치: 테라스 x 21..41(20 m), 보행로 18 m = 6 m 칸 세 개(x 41..59). 24 m였을 때 끝 칸이 집하기 탑 앞에 가려
  붕괴 장면의 아나킨이 안 보였다 → 끝을 탑의 화면 영역 밖으로. 용암 폭포는 싸우는 곳 앞에 두면 가리므로 테라스 서쪽 끝 너머에 하나.
- 대기: `pipe_segment`, `collector_tower`(노트에는 있으나 파일 미수신), STAGE 05의 드로이드·플랫폼, STAGE 06 둑.
