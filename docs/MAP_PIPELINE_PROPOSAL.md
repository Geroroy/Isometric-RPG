# 사전 렌더 맵 파이프라인 제안서 (Isometric-RPG)

> 상태: **제안 — 사용자 승인 대기.** 승인 전에는 구현하지 않는다. (1단계 분석·설계는 Fable 5.1, 높은 노력으로 작성.)
> 사용자 요청의 1~5단계와의 대응: 1단계 = 1~4·6절, 2단계(조명 프리셋 5종) = 5절, 3단계(맵 JSON → Blender 자동 베이크) = 6·8절,
> 4단계(후처리 + 게임 연결) = 6절 후처리 · 7절, 5단계(QA) = 10절. 일정은 12절.

## 1. 현재 구조 분석 (파일·줄 번호)

### 1.1 맵·월드
- 투영 상수: `src/core/iso.js:10-16` — `HALF_W 20`, `PX_PER_UNIT 28.28`, `Z_PX 24.49`, 고도 30°. 브라우저 베이커(`src/gfx/baker.js:72-79`)와 Blender 스크립트가 같은 값을 **각자 하드코딩**한다(`tools/sprites/render_sprites.py:187-189,226-236`, `render_building.py:62-64,185-196`).
- 월드 클래스: `src/world/worldgen.js:55-72` — 192×192 `biome/blocked/road/explored` 배열 + `props/lights/pois`. 허브(`CityHub` 616-757)는 추가로 `walk`(725-733), `lifts`(735-738), `traffic`(740-752), `sounds/steam`(326-328), `puddles`(713)를 만든다. 언더시티 시장은 `addSheetProp` 호출 리스트(689-710)와 무작위 네온 광원 18개(715-719)로 **코드에 박혀** 있다. 아레나(`Arena` 433-468, `MustafarArena` 494-606)도 같다.
- 시트 프롭 메타: `src/world/cityProps.js:7-52` — 광원·증기·소리·홀로 패널 위치. 충돌 다각형은 스프라이트 JSON에서 온다(88-95). `_r` 회전 변형은 별도 스프라이트다(56-66).
- 지형: `src/gfx/terrain.js` — 16타일 청크(10-12)를 픽셀 단위로 절차 생성, 언더시티 바닥은 `floor_low.png`를 월드 좌표로 샘플링(33-38, 254-266). 미니맵은 `minimapImage()`(423-453)를 HUD가 쓴다(`src/ui/hud.js:809-813`).
- 렌더 순서: `src/gfx/renderer.js:154-284` — 지형 → 데칼·웅덩이 → 평면 프롭 → 그림자(203-222) → 깊이 정렬(228-256, 가림 프롭 페이드 236-241) → **라이트맵 multiply**(465-518, `ambient` 471) → `lighter` 패스(네온·반사 330-347, 광선검, 교통). 시트 프롭은 body/neon/reflect 3장(51-62).
- 구역 전환: `src/game/game.js:66-77,222-244` — `places` 저장 후 `emit('world')` → `main.js:96-99`에서 `renderer.setWorld()`·`hud.onWorld()`만 호출. 음악은 지역 이름 정규식(`src/core/music.js:206`), 앰비언스는 `hub && p.y>90` 하드코딩(`src/core/ambience.js:62-87`).

### 1.2 Blender 파이프라인
- `render_cfg.py`: `PIPELINE_VERSION`(14행), `.glb` 내용 해시(38-66), `source_hash`(69-77), `effective`(80-84), `up_to_date`(87-88) — 그대로 재사용 가능.
- `render_building.py`: 네온 재질 탐지·스위치(134-179), AO 주입(234-253), 젖은 바닥(255-265). **렌더 4번**(body/lit/refl_on/refl_off, 280-291)으로 차분을 구한다 — 맵 베이크에서는 라이트 그룹 패스로 1번에 끝낼 수 있다.
- `render_city.py`: 에셋별 창·앵커 표(29-68), 추정·ASK(95-103), 실측 기록(104-109).
- `render_sprites.py`: 한 렌더에서 섀도 캐처·노멀·깊이 패스를 File Output EXR로 뽑는 패턴(416-458), 노멀·깊이 인코딩(584-595), 추정/ASK(620-634). 노멀 시트는 `render_config.json` `character.optional_passes`로 꺼져 있고 `src/gfx/sheet.js:41-75`는 `normalPages`를 읽지 않는다.
- 조명 리그가 이미 어긋나 있다: 캐릭터 key 4.2·(1.0,0.95,0.88) vs 건물 key 1.6×2.4·(0.85,0.9,1.0)(`render_building.py:218`). `ART_GUIDE.md` 3절은 캐릭터 값을 정본으로 적고 있다.
- 에셋: `public/sprites/chars`(38 MB, 31종), `public/sprites/city`(1.5 MB, 36종 ×3 레이어), `.glb` 소스는 무시 폴더 `tools/sprites/out/city`에만 있음. 브라우저 베이크 프롭 54종(`src/gfx/models/props.js`)은 `.glb`가 없다(`export_prop_glb.mjs`로 변환 가능).
- 환경: bpy 5.2.2, 4코어, 15 GB, GPU 없음, Node 22. Chromium은 `/opt/pw-browsers`에 있고 `playwright-core`로 띄운다(지금까지의 브라우저 검증 방식).

## 2. 폴더 구조

```
maps/<id>.json                 맵 정의(저작 소스)
presets/<id>.json              조명 프리셋, presets/luts/*.cube
assets/props/<name>/model.glb + asset.json   (footprint 보정, lights/steam/sound, height_m, neon_group 기본값)
assets/floors/<kind>/{albedo,rough,normal}.png + floor.json   (tiles, wet)
assets/calib/                  QA 보정 오브젝트(1 m 큐브, 1.85 m 캡슐, 막대)
render_config.json             공통 설정("rig", "map" 섹션 추가)
tools/maps/{rig.py, map_schema.py, bake_map.py, bake_maps.py, post_map.py, qa_maps.mjs, export_worldgen.mjs}
tools/sprites/out/maps/<id>/   EXR 패스(무시)
public/maps/<id>/              런타임 산출물: map.json, color_X_Y.png, emit_<grp>_X_Y.png, depth_X_Y.png, shadow_X_Y.png, minimap.png
```
도시 `.glb`는 `build_city_assets.py`가 `assets/props/`로 쓰도록 출력 경로만 바꾼다. 54개 절차 프롭은 `export_prop_glb.mjs` 일괄 실행으로 라이브러리에 넣는다.

## 3. 맵 JSON 스키마 + 언더시티 시장 예

좌표계는 지금 월드 그대로(192×192, 타일 단위)여서 `cityLife.json`·`NPC_DEFS` 좌표를 안 바꿔도 된다. `bake_bounds` 밖은 `void`(베이크 안 함, 게임이 절차 배경을 그림).

```json
{
  "id": "coruscant_undercity", "name": "코러산트 · 언더시티",
  "size": [192, 192], "bake_bounds": [[64, 95], [128, 131]],
  "preset": "coruscant_undercity",
  "floor": { "default": "void",
    "regions": [{ "kind": "duracrete_wet", "rect": [64, 95, 128, 131] }] },
  "props": [
    { "asset": "tenement0", "x": 68, "y": 98.6 }, { "asset": "tenement1", "x": 90, "y": 98.6 },
    { "asset": "cantina", "x": 108, "y": 121, "neon_group": 1 },
    { "asset": "roasterNuna", "x": 72.8, "y": 110.6, "rot": 90 },
    { "asset": "billboard", "x": 86.5, "y": 107.6, "holo": true },
    { "asset": "speeder0", "x": 114, "y": 125.6, "dynamic": true },
    { "asset": "ventGrate", "x": 78.5, "y": 112, "flat": true }
  ],
  "lights": [
    { "x": 96, "y": 112, "z": 6, "rgb": [200, 225, 255], "rad": 150, "flicker": 0.01, "group": "lamps" },
    { "x": 101, "y": 104, "z": 2.2, "rgb": [255, 80, 170], "rad": 80, "flicker": 0.2, "group": "neon0" }
  ],
  "entrances": [
    { "id": "lift", "x": 82, "y": 98.9, "to": { "map": "coruscant_plaza", "entrance": "lift" }, "label": "상층 플라자로 올라간다" },
    { "id": "cantina_door", "x": 108.4, "y": 125.2, "to": null }
  ],
  "collision": { "from_assets": true,
    "extra": [{ "poly": [[64, 95], [128, 95], [128, 96], [64, 96]], "kind": "edge" }] },
  "spawn": { "x": 83.5, "y": 99.5 }, "pois": [{ "x": 96, "y": 106.5, "r": 9, "name": "코러산트 · 언더시티 시장" }],
  "walk": { "level": "low" }, "puddles": [[95, 111, 1.4]], "traffic": "file:traffic/undercity.json",
  "audio": { "music": "base", "beds": { "hum": 0.55, "traffic": 0.22, "murmur": 0.14 } },
  "qa": { "shots": [[96, 108], [108, 124], [70, 100]] }
}
```
`rot`가 `_r` 스프라이트를 대체한다. `dynamic`(스피더 흔들림·무스타파 뗏목)과 `holo` 패널은 베이크에서 빼고 지금처럼 스프라이트로 그린다. 첫 JSON은 손으로 쓰지 않고 `tools/maps/export_worldgen.mjs`가 `CityHub(9)`·`Arena(77)`·`MustafarArena(66)`·`World(501)`를 Node에서 실행해 덤프한다(`export_characters.mjs`가 게임 코드를 Node로 돌리는 선례).

## 4. 공통 설정: `render_config.json` 확장 (별도 파일 없음)

CLAUDE.md 규칙("설정은 render_config.json에서만")을 지키기 위해 섹션 두 개를 추가하고, 세 렌더 스크립트의 중복 카메라·조명 코드를 `tools/maps/rig.py`(`make_camera`, `make_rig`)로 뽑아 모두 이 섹션을 읽게 한다. `ART_GUIDE.md`는 사람이 읽는 규칙서로 유지하되 1·3·6·7절 수치는 이 섹션을 **인용**하고, QA 시트가 설정값을 함께 출력해 문서와 대조한다.

```json
"rig": { "half_w": 20, "elevation_deg": 30, "azimuth": "+x-y",
  "key":  { "dir": [-0.9, 1.35, 0.55], "strength": 4.2, "color": [1.0, 0.95, 0.88], "angle": 6 },
  "rim":  { "dir": [0.7, 0.55, -1.0], "strength": 3.0, "color": [0.72, 0.84, 1.0], "angle": 3 },
  "fill": { "dir": [0.6, 0.3, 1.0], "strength": 0.7, "color": [0.85, 0.9, 1.0], "shadow": false },
  "sky":  { "color": [0.36, 0.38, 0.44], "strength": 0.55 }, "ao": { "distance": 0.08, "factor": 0.85 } },
"map": { "engine": "cycles", "samples": { "cpu": 24, "gpu": 96 }, "denoiser": "OPENIMAGEDENOISE",
  "render_scale": 2.0, "large_map_mpx": 8, "large_map_render_scale": 1.0,
  "tile_px": 1024, "margin_px": 64, "persistent_data": true,
  "lightgroups": ["key", "sky", "lamps", "neon0", "neon1", "neon2", "neon3", "shaft", "warn"],
  "passes": ["combined", "z", "normal", "diffcol", "ao"],
  "depth_units_per_lsb": 0.0078125, "shadow_scale": 0.25,
  "estimate": { "default_seconds_per_mpx": 35 }, "post": { "grime": 0.35, "edge": 0.25, "noise": 2 } }
```
`dir`는 카메라 기준 right/up/toward(`render_sprites.py:305-309` 값 그대로). `iso.js`의 상수와 `rig.half_w/elevation`이 같은지 QA가 검사한다. 프리셋은 key(=태양)의 **고도·색·세기와 sky만** 바꾸고 방위는 고정(왼쪽 위)한다.

## 5. 프리셋 스키마와 5개 예

```json
{ "id": "coruscant_undercity",
  "sun": { "elevation_deg": 30, "strength": 0.35, "color": [0.85, 0.9, 1.0] },
  "sky": { "color": [0.2, 0.22, 0.3], "strength": 0.6 },
  "fog": { "color": [0.1, 0.11, 0.16], "density": 0.35, "height_falloff": 2.5 },
  "ao": { "strength": 1.0 }, "emission": { "neon": 6.0, "lamps": 3.0 },
  "grade": { "lut": "luts/undercity.cube", "runtime": { "contrast": 1.08, "saturation": 0.95, "tint": [0.95, 0.98, 1.1] } },
  "actor": { "ambient": [96, 100, 128], "sun_share": 0.5, "shadow_scale": 1.0 },
  "effects": ["steam", "puddles"], "audio": { "music": "base", "beds": { "hum": 0.55 } } }
```

| 프리셋 | 태양 고도/세기/색 | 하늘 | 안개 색/밀도 | AO | 네온 | 그레이딩 | 효과 |
|---|---|---|---|---|---|---|---|
| coruscant_undercity | 30°/0.35/청백 | 어두운 남색 0.6 | 남색/0.35, 바닥 짙음 | 1.0 | 6.0 | 콘트라스트↑ 채도↓ 청색 틴트 | steam, puddles |
| desert | 55°/1.4/주황(1.0,0.78,0.55) | 모래빛 0.9 | 황토/0.05 | 0.7 | 1.0 | 하이라이트 따뜻, 중간톤 밝게 | heat_haze(배경 띠 흔들림) |
| temple_interior | 50°/1.0/따뜻한 흰색 | 0.4 | 금빛/0.12 | 1.2 | 2.0(등) | 부드러운 S커브, 황금 틴트 | light_shafts(`shaft` 그룹 반투명 원뿔 메시, 볼류메트릭 없음), dust_motes |
| forest | 40°/0.9/녹황(0.8,1.0,0.7) | 녹색 0.7 | 청록/0.2 | 1.3 | 0.5 | 녹색 섀도, 채도 1.05 | leaf_light(`lamps` 그룹 얼룩 조명), dust_motes |
| starship_interior | 45°/0.6/냉백(0.85,0.92,1.0) | 0.5 | 없음 | 1.1 | 3.0 | 콘트라스트↑, 청색 섀도 | warning_lights(`warn` 그룹 점멸 패턴) |

기존 장소(플라자·크리스토프시스·지오노시스·무스타파)는 `ART_GUIDE.md` 4절 `ambient`를 `actor.ambient`로 옮겨 프리셋 4개를 더 만든다. `sun.elevation`은 35~60°로 제한한다 — 캐릭터 시트의 그림자 길이는 고정이므로 프리셋의 `actor.shadow_scale`로 그림자 시트 높이만 맞춘다(`renderer.js:213-218`에서 세로 배율).

## 6. 베이크 스크립트 구조 (`tools/maps/bake_map.py`)

**장면 조립**
1. 맵·프리셋·`render_config.json` 로드, `map_schema.py`로 검증. 에셋별 `.glb`를 한 번만 임포트하고 배치는 링크 복제(`render_sprites.py:276-289` 방식).
2. 바닥: `floor.regions` 폴리곤 → 평면 메시, UV = 월드 좌표/`tiles`, `assets/floors` 텍스처. 프리셋 `wet`이면 거칠기 0.22(`render_building.py:258-263`). `void`는 지오메트리 없음(film transparent).
3. 프롭: `(x, −y, z)` 배치, `rot` 회전, 네온 재질 재작성(`render_building.py:134-174`)과 AO 주입(234-253) 재사용. 네온 오브젝트 → `lightgroup = neon{group}`(기본 그룹 = 위치 해시 % 4), `lit*` 재질 → `lamps`.
4. 광원: 맵 `lights` → 포인트 라이트(`lamps` 그룹), 리그 key/rim/fill을 프리셋으로 스케일(key → `key` 그룹), 월드 배경 → `sky` 그룹.
5. 카메라: `rig.py`의 정사영 카메라, `ortho_scale = (tile+2·margin)/PX_PER_UNIT`, 타일마다 right/up 축으로 정수 픽셀만큼 이동. 회전은 모든 타일·모든 맵에서 동일.

**패스 (렌더 1번/타일)** — Cycles 라이트 그룹으로 `Combined_key/_sky/_lamps/_neonN/_shaft/_warn` + `Z` + `Normal` + `DiffCol` + `AO`를 컴포지터 File Output 멀티레이어 EXR로 뽑는다(`render_sprites.py:436-451` 패턴). 거기서 유도:
- **color** = key+sky+lamps 합(네온 꺼진 본체, 반사된 등불 포함).
- **emission** = 그룹별 `Combined_neonN`(바닥 반사까지 포함 — `reflect` 레이어 별도 렌더가 사라짐) → `additive()`(`render_building.py:294-298`) RGBA.
- **shadow** = `1 − clamp(Combined_key / (DiffCol · E_key · N·L))` — 태양 가시성 마스크. (Cycles 4+에는 순수 Shadow 패스가 없음; 안 깨끗하면 바닥+섀도 캐처만 있는 두 번째 뷰 레이어로 대체 — 영구 데이터로 BVH 공유.)
- **depth** = `Z`를 16비트(1/128 타일)로, R=상위·G=하위 바이트, B=`normal.z>0.9`(바닥 플래그). `map.json`에 `depth.origin`과 계수 `k_xy = cos30°/√2 = 0.6124`, `k_z = 0.5`를 적어 게임이 `Z(x,y,z) = Z0 + (x+y)·k_xy − z·k_z`로 캐릭터 깊이를 계산한다.

**타일링과 이음새**: 타일 1024 game px + 양쪽 64 px 마진(렌더 2배 → 2304²). 정사영+동일 회전이라 기하는 정확히 맞고, 마진은 OIDN 이웃·네온 블러·후처리 필터의 경계 차이를 잘라내기 위한 것. 맵 마름모와 안 겹치는 타일은 건너뛴다(192² 맵은 바운딩 40타일 중 ~24개). `persistent_data`로 한 프로세스가 한 맵의 타일을 순회(동기화·BVH 1회), 맵 단위로 `parallel.jobs_cpu` 병렬.

**후처리 (`post_map.py`, numpy)**: 때 = `AO^k × 노이즈`로 어둡게(`post.grime`), 엣지 하이라이트 = 깊이 소벨 × `N·(왼쪽 위 광)`(`post.edge`), 시드 고정 그레인 ±2/255, Lanczos 2배 축소(프리멀티플라이드), 마진 크롭, 타일 분할, 미니맵 1 px/타일. 모두 결정적이라 해시가 안정적이다.

**변경 감지**: `render_cfg.source_hash([map.json, preset.json, 참조 .glb·텍스처], [effective(CFG['map']), rig, scale, samples])`. 맵 해시는 `map.json`에, **타일 해시**는 타일마다(그 타일 사각형+최대 그림자 길이+네온 반경과 겹치는 프롭 부분집합 + 맵 공통 해시) 저장해 노점 하나 옮기면 1~2타일만 다시 굽는다. `--check/--force/--adopt/--yes/--preview`(스폰 주변 1타일, 1배, 6샘플, `tools/sprites/out/preview/maps/`) 동일. 실측은 `render_times.json`의 `map:<id>` 초/Mpx.

**명령**: `.bvenv/bin/python tools/maps/bake_maps.py [id …]` → 각 맵 ESTIMATE 출력, 합계 30분 초과 시 ASK.

## 7. 게임 로딩·합성 (Canvas 2D)

- `src/world/mapWorld.js`: `World` 인터페이스를 JSON에서 채우는 `MapWorld`(biome/blocked는 footprint·extra 폴리곤으로 래스터, lights/pois/walk/lifts/sounds/steam/puddles/spawn). `game.js:26,70`의 생성자 호출만 바꾼다. 로더는 `public/maps/<id>/map.json`을 fetch하고 타일은 **플레이어 주변만 디코드**(LRU, 최대 12장 ≈ 48 MB; 지금 청크 캐시 64×0.8 MB와 동급).
- `src/gfx/bakedTerrain.js`: `Terrain.draw`와 같은 시그니처로 color 타일을 그림. `void`·미베이크 영역은 기존 `Terrain`에 위임(하이브리드 가능).
- 합성 순서(`renderer.render` 교체):
  1. 배경 color 타일 → 데칼·웅덩이·지면 마커.
  2. **actors 오프스크린 캔버스**: 유닛 그림자(`shadow_scale` 적용) → 정렬된 유닛·픽업 → 가림 조각(아래) → `actor.ambient` + shadow 타일(multiply) + 맵 `lights`·동적 광원(`lighter`)으로 만든 라이트맵을 multiply → 배경 위에 source-over. 배경은 이미 조명이 구워져 있으므로 라이트맵을 곱하지 않는다(지금 `renderer.js:514`의 전화면 multiply는 actors에만).
  3. `lighter`: 그룹별 emission 타일(`neonLevel`을 그룹 단위로 — `citySprites.js:94-100`), 동적 광원 글로우(배경용, 낮은 알파), 광선검·볼트·교통·홀로그램.
  4. 그레이딩: Canvas 2D에는 LUT가 없으므로 `#world`에 CSS/SVG 필터(`feComponentTransfer` 채널 커브 + saturate/contrast)로 프리셋 `grade.runtime` 적용. 3D LUT는 베이크 미리보기·QA 시트에서만 쓴다.
- **깊이 가림**: 유닛 사각형이 자기보다 앞(`sortDepth` 큼)인 프롭 사각형과 겹칠 때만(`renderer.js:236-241`의 기존 판정) 그 사각형(≈50×60 px) 범위의 depth `Uint16Array`를 읽어 `scene_Z < actor_Z(row) − bias`인 픽셀의 color 픽셀을 스크래치 캔버스에 `putImageData` 후 actors 위에 `drawImage`. 행별 actor 깊이는 `Z_feet − dy·0.5/Z_PX`(수직 빌보드). 플레이어는 알파 0.45로 그려 지금의 투시 페이드를 유지. 비용: 프레임당 0~3유닛 × 3천 px ≈ 1 ms 이하. Z 패스는 AA가 없으므로 마스크를 1 px 침식+소프트 엣지로 처리.
- **노멀 맵 캐릭터 조명**: `character.passes`에 `normal` 추가(캐릭터당 시트 1장 추가, 38 MB → ~50 MB), `sheet.js`가 `normalPages`를 읽음. `src/gfx/relight.js`: 유닛별 프레임(≈3천 px)의 color·normal을 작은 오프스크린에서 읽어 가장 가까운 맵 광원 1~3개의 `N·L × 색 × 감쇠`를 더한 프레임을 만들고 `(시트, anim, frame, dir, 양자화된 광원 키)`로 LRU 캐시. 폰: 플레이어+반경 8타일 유닛만, 20 Hz 갱신, 캐시 256프레임. 정지 NPC는 캐시 적중이므로 비용 0.
- **전환**: `game.on('world')`(`main.js:96`)에 `grading.apply(preset)`, `ambience.setMap(map.audio.beds, map.sounds)`(`ambience.js` 하드코딩 제거), `music.setBase(map.audio.music)`(`music.js:206` 정규식 대체)를 추가.
- 폰 성능: 타일 drawImage 4~6장/프레임, 가림 조각 ≤3, emission 타일은 비어 있으면 생략(바운딩 박스를 `map.json`에 기록). 데이터: 언더시티 ≈ 15~20 MB/맵 → PWA 캐시·무손실 WebP 검토.

## 8. 렌더 시간 추정 (CPU 4코어)

실측 환산: tenement1 99.1 s = 1200² 렌더 4번 → **≈25 s/1.44 Mpx**(24샘플+OIDN, 화면 35% 채움) → 전면 지오메트리 기준 **30~50 s/렌더 Mpx**; 캐릭터 1024² 12샘플 4.7 s도 같은 범위. 기본값 35 s/Mpx.

| 맵 | 타일 범위 | 1:1 유효 Mpx | 렌더 배율 | 렌더 Mpx | 예상 |
|---|---|---|---|---|---|
| 언더시티 (64×36) | 2000×1450 | ≈2.3 | 2.0 | 9 | **5~8분** |
| 상층 플라자 (52×30+첨탑) | 1640×1400 | ≈2.0 | 2.0 | 8 | 4~7분 |
| 지오노시스 격납고 (24×24) | 960×700 | 0.6 | 2.0 | 2.5 | 1.5~2분 |
| 무스타파 (142×60, 용암 포함) | 4040×2270 | ≈4.5 | 2.0 | 18 | 10~15분 |
| 크리스토프시스 (192×192) | 7680×4100 | ≈15 | 2.0 / **1.0** | 60 / 15 | 35~50분 → **ASK** / 9~13분 |

첫 전체 베이크 ≈ 30~45분(크리스토프시스 1배) → `ASK` 후 `--yes`. 후처리는 맵당 수십 초. 이후 수정은 타일 해시로 1~2타일(≈1~2분).

## 9. 마이그레이션 (게임이 계속 동작하도록)

| 단계 | 유지 | 교체 |
|---|---|---|
| 0 | `World` 인터페이스, 패스파인더, cityLife, HUD | `export_worldgen.mjs` → `maps/*.json`; `MapWorld`가 같은 `blocked/lights`를 재현(그리드 diff로 검증). 지형·프롭은 그대로 |
| 1 (하이브리드) | 시트 프롭 스프라이트·정렬 | 바닥만 베이크(바닥+프롭 그림자+AO+등불 웅덩이) → `CITY_LOW` 지형 대체 |
| 2 (풀 베이크) | `dynamic`·`holo`·`flat` 프롭 | 프롭을 이미지에 포함, 깊이 가림, 그룹 emission; `_r` 스프라이트·`render_city.py` 표 폐기 |
| 3 | — | 프리셋·그레이딩·앰비언스/음악 전환 |
| 4 | — | 노멀 시트 + relight |
| 5 | 크리스토프시스는 절차 지형 유지 가능 | 플라자·아레나·크리스토프시스 베이크(캠프 좌표는 시드 501이라 JSON 고정 가능) |

`render_sprites.py`·`render_building.py`는 `rig.py`를 읽도록 바꾸고 `PIPELINE_VERSION`을 올린다(건물 리그를 캐릭터 값에 맞추면 도시 36종 재렌더 ≈ 20분).

## 10. QA (`tools/maps/qa_maps.mjs` + `qa_calib.py`)

- 베이커는 맵마다 **보정 타일**(1 m 큐브, 1.85 m 캡슐, 2 m 막대, 그 프리셋 조명)을 같이 굽는다. `qa_calib.py`가 측정: 큐브 윗면 마름모 비율(2:1 → 카메라 각), 큐브 높이 px(24.49 → 수직 축척), 캡슐 높이(50~57 px, `clone_120.json` 그림자·높이와 대조 → 캐릭터:건물 축척), 막대 그림자 벡터(오른쪽 아래, 프리셋 고도에서 기대되는 길이). 에셋 `height_m × Z_PX` 대 베이크 실측 px 차이가 5% 넘으면 보고.
- 브라우저 시트: Playwright(`playwright-core` + `/opt/pw-browsers` Chromium)로 `vite preview`를 열고 `?map=<id>&qa=1`로 `qa.shots` 지점에 플레이어와 기준 클론을 세워 스크린샷 → `docs/qa/maps_<date>.png` 비교 시트 + `qa_report.json`(불일치 목록). 브라우저 없이 돌릴 때는 Python이 레이어를 직접 합성한 정적 시트로 대체.

## 11. 위험·열린 질문

- 정적 조명: 시간대·대형 파괴 연출은 라이트맵으로만. 네온 깜빡임은 그룹 4개 단위.
- 캐릭터의 젖은 바닥 반사는 사라짐(허용). 투명·홀로 프롭은 `dynamic`으로 남김.
- Z 패스 비AA 경계 → 실루엣 가장자리 1 px 프린지(침식+바이어스로 완화, 실험 필요).
- 저장소 크기: 맵당 15~100 MB PNG. `DESIGN_REVIEW.md` 1.1이 이미 `.git` 110 MB를 지적 → Git LFS 또는 베이크 커밋 묶기 결정 필요.
- "리마스터" HD 밀도 2 모드(`terrain.js` `hd`)는 2배 타일이 필요 → 지원 여부 결정.
- 런타임 LUT: CSS/SVG 필터로 충분한가, WebGL 후처리 패스를 둘 것인가.
- 크리스토프시스: 절차 산포 수백 개를 JSON으로 고정할지, 바닥만 베이크하고 산포는 스프라이트로 둘지.
- Blender 5.2 컴포지터 API(`scene.compositing_node_group`, `render_sprites.py:451`)와 라이트 그룹 메모리(타일당 패스 9개 × 2304² float ≈ 190 MB, 가능).

## 12. 단계별 계획·공수

| 단계 | 내용 | 공수 |
|---|---|---|
| P0 | 스키마·검증·`export_worldgen.mjs`·`MapWorld` 동등성 | 2~3일 |
| P1 | `rig.py`, `bake_map.py` MVP(조립·라이트 그룹 패스·단일 타일·preview·estimate/ASK·해시) | 3~4일 |
| P2 | 타일링·마진·`post_map.py`·`bakedTerrain`·actors 합성(하이브리드 → 풀) | 3~4일 |
| P3 | 프리셋 9개·그레이딩·앰비언스/음악 전환 | 2일 |
| P4 | 깊이 가림·노멀 relight·폰 프로파일링 | 3일 |
| P5 | 플라자·아레나·크리스토프시스 JSON+베이크 | 3~4일 (+베이크 ~45분) |
| P6 | QA 보정·비교 시트 | 2일 |
| 합계 | | **18~22일** |

### Critical Files for Implementation
- src/world/worldgen.js
- src/gfx/renderer.js
- tools/sprites/render_building.py
- tools/sprites/render_cfg.py
- render_config.json