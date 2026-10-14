# 외부 에셋 — 규격 · 매니페스트 · 요청 양식

최종 시각 에셋은 외부(ChatGPT)에서 만들고, 게임은 이것을 그대로 배치한다(`CLAUDE.md` "역할 분리"). 이 문서는 에셋이
게임에 들어오는 길과, 에셋을 만드는 쪽이 지켜야 할 규격이다. 카메라·스케일·팔레트의 원본은 `ART_GUIDE.md`.

## 1. 좌표계와 스케일 (모든 에셋 공통)

| 항목 | 값 |
|---|---|
| 투영 | 2:1 다이메트릭, **직교**, 카메라 고도 30°, 월드 +x +y 대각선 쪽에서 내려다봄 (`src/core/iso.js`) |
| 월드 단위 | 1 타일 = 1 m |
| 화면 크기 | 월드 +x로 1 m = 화면 (+20, +10) px, +y로 1 m = (−20, +10) px, 위로 1 m = 24.49 px (게임 픽셀) |
| 캐릭터 | 키 1.85 m ≈ 50~57 px |
| 밀도 `density` | 이미지 px ÷ 게임 px. 1 = 게임 픽셀 1:1, 2 = 리마스터용 2배(반 크기로 그림), 4 = 작은 소품 4배 |
| 주광 | 화면 왼쪽 위 앞 (스프라이트에 굽는 경우; 바닥 타일엔 굽지 않음 — 아래 groundTiles) |

## 2. 폴더

```
public/assets/mustafar/
  manifest.json      이 세트의 매니페스트
  landing/           착륙장 (STAGE 01)
  interiors/         회의실 · 제어실
  corridors/         복도
  industrial/        보행로 · 채굴 시설 · 기계 팔
  lava/              용암 · 화산암 지형
  props/             콘솔 · 가구 · 소품
  characters/        캐릭터 (현재 캐릭터는 기존 Blender 시트 `public/sprites/` 사용)
```

빌드는 `public/` 전체를 그대로 싣고, `dist/asset-manifest.json`(내용 해시)과 서비스 워커가 바뀐 파일만 새로 받는다.

## 3. 매니페스트 (`cw-assets` v1)

```json
{
  "format": "cw-assets", "version": 1, "set": "mustafar",
  "assets": [ { …에셋 하나… } ]
}
```

모든 에셋의 공통 필드:

| 필드 | 뜻 |
|---|---|
| `id` | 고유 ID (`mf.<구역>.<이름>`) |
| `name` | 사람이 읽는 이름 |
| `kind` | `groundTiles` / `groundImage` / `sprite` (아래) |
| `status` | `requested`(요청됨, 로드 안 함 → 플레이스홀더) / `delivered`(받음, 로드) |
| `request` | 요청서 경로 (`docs/asset_requests/<id>.md`) |
| `file` · `size` | 매니페스트 기준 경로, 원본 이미지 크기 [w, h] px — **다르면 로더가 거부한다**(늘이지 않음) |
| `layer` | `ground` / `flat`(바닥 위, 캐릭터 아래) / `standing`(캐릭터와 깊이 정렬) / `top`(모두 위) |
| `collision` · `footprint` | 막는 영역: 앵커 기준 월드 m 다각형 [[x, y], …] (스프라이트), 바닥은 존 파일의 walk/collision |
| `occlusion` | 가림 처리 (예: 캐릭터를 가리면 반투명) — 기록만 하고, 연결은 해당 에셋이 들어올 때 |
| `lighting` | `lightmap`(장면 조명을 곱함), `emissive`(발광 레이어 파일, 라이트맵 뒤에 더함), `lights`(에셋이 가진 광원) |

종류별:

- **`groundTiles`** — 위에서 똑바로 내려다본(탑다운) 정사각 텍스처. 엔진이 월드 좌표로 샘플링해 2:1로 정확히 눕힌다
  (`src/gfx/padFloor.js`). `tiles: { key: { file, size, metres: [가로 m, 세로 m] } }` — 이미지 가로:세로가 `metres`와 2% 넘게
  다르면 거부. 이미지의 열 = 월드 +x, 행 = 월드 +y, 좌상단 픽셀 = 그 조각의 −x −y 모서리. **방향성 조명을 굽지 않는다**
  (회전·반전해 재사용하고, 빛은 게임 라이트맵이 준다).
- **`groundImage`** — 2:1로 미리 렌더한 바닥 그림 한 장. `anchor`(이미지 px)가 존 파일의 `at`(월드 x, y)에 놓인다
  (지형의 backdrop으로 청크마다 그림). `density` 필수.
- **`sprite`** — 2:1로 미리 렌더한 컷아웃(투명 배경). `anchor` = 바닥 기준점(보통 발밑·바닥 중심)의 이미지 px, `density`,
  `footprint`, `layer`, `sortOffset`(깊이 기준점을 x+y로 m만큼 옮김), `lighting.emissive`. 기존 시트 스프라이트로 바뀌어
  렌더러의 깊이 정렬·조명·그림자 규칙을 그대로 탄다. 존 파일 `structures`/`decor`에 `{ asset, x, y, block }`로 놓는다.

로더: `src/gfx/assetManifest.js` (`loadManifest`, `loadAsset`, `groundBackdrop`). 검증: `node tools/qa/assets_manifest.mjs`
(저장소의 기존 이미지를 임시 대역으로 세 종류와 거부 경우를 확인 — 아무것도 저장하지 않음).

## 4. 통합 절차 (받은 에셋)

1. 파일을 `public/assets/mustafar/<폴더>/`에 그대로 넣는다(이름은 요청서대로; 크기·색·비율을 고치지 않는다).
2. `manifest.json`의 해당 항목을 `"status": "delivered"`로 바꾼다(크기가 요청과 다르면 고치지 말고 사용자에게 알린다).
3. 해당 스테이지 QA(`node tools/qa/mfstage01.mjs` 등)로 화면을 보고, 플레이스홀더 배지가 사라졌는지 확인한다.

## 5. ASSET REQUEST 양식

```
ASSET REQUEST

- Asset ID:
- 에셋 이름:
- 영화 속 참고 장면:
- 사용 위치:
- 필요한 이미지 크기:
- 게임 내 월드 크기:
- 카메라 방향:
- 투명 배경 필요 여부:
- 앵커 좌표:
- 충돌 영역:
- 애니메이션 프레임 필요 여부:
- 기타 기술적 요구사항:
```

요청서는 `docs/asset_requests/<Asset ID>.md`. 첫 요청: `mf.landing.floor`.
