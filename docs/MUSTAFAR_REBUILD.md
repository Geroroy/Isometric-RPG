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
- 바닥 그래픽: **에셋 대기** (`docs/asset_requests/mf.landing.floor.md`). 그동안 디버그 그리드 + 화면 상단 플레이스홀더 배지.
- 주변 용암: 이전 무스타파의 용암 텍스처를 임시로 사용(존 파일 `surround.placeholder`).
- 다음: 바닥 에셋을 받으면 통합·검증 → 사용자 승인 → 가장자리 구조물(에셋 요청부터).
