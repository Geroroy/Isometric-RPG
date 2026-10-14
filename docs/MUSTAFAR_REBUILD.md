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
