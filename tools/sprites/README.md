# Blender 스프라이트 파이프라인

3D 모델(.glb)을 게임의 아이소메트릭 시점으로 Blender(Cycles)에서 렌더링해 스프라이트 시트 + JSON으로 만듭니다.
Blender 앱(`blender -b -P 스크립트 -- 인자…`) 또는 pip의 `bpy` 모듈(`python 스크립트 인자…`) 둘 다 됩니다.

```bash
python3 -m venv .bvenv && .bvenv/bin/pip install bpy pillow numpy   # 처음 한 번 (Python 3.13: bpy 5.x)
```

## 캐릭터: 아나킨 (게임에 들어감)

```bash
# 1) 게임의 리그·포즈 코드에서 애니메이션을 그대로 뽑는다 (관절 변환, 프레임 단위)
node tools/sprites/export_rig_anims.mjs anakin > tools/sprites/anakin_anims.json
# 2) 모델을 만들어 애니메이션과 함께 .glb로 (레퍼런스: 핫토이 1/6 클론 전쟁 아나킨)
.bvenv/bin/python tools/sprites/build_anakin.py tools/sprites/anakin_anims.json tools/sprites/out/anakin.glb
# 3) 8방향 렌더 → 시트 + 그림자 시트 + JSON (게임이 읽는 곳: public/sprites). 창 없이 명령줄에서
tools/sprites/render_anakin.sh cycles     # GPU 없는 머신(이 저장소의 클라우드 환경)
tools/sprites/render_anakin.sh eevee      # GPU가 있는 PC
```

렌더 속도 (CPU 4코어, GPU 없음 · `idle` 2프레임 × 8방향으로 측정, 전체 146프레임으로 환산):

| 설정 | 2프레임 | 전체 시트 |
| --- | --- | --- |
| 이전: Cycles 512px, 8방향 모두 렌더 | 79초 | 약 94분 |
| EEVEE 256px, 5방향 + 좌우 반전 (Mesa 소프트웨어 EGL) | 177초 (TAA 16) · 20초 (TAA 4, 3방향) | 1~2시간 |
| **Cycles 256px, 5방향 + 좌우 반전, 그림자 128px** | **13초** | **약 16분** |

EEVEE는 GPU용 엔진이라 GPU가 없으면 OpenGL을 CPU로 흉내 내서(렌더 한 번에 고정 비용 약 2초) Cycles보다 느립니다. GPU가 있는 PC에서는 EEVEE가 가장 빠릅니다.

`build_anakin.py`: 처음부터 다시 만든 모델. 게임 리그의 관절마다 본이 하나씩 있는 아마추어에 옷 전체를 부드러운 가중치로 스키닝해서
팔꿈치·무릎·허리가 틈 없이 굽고, 타바드와 튜닉 자락은 다리를 따라간다 (가슴판·견갑·벨트·손·머리는 본 하나에 고정).
본의 기본 방향이 전부 단위 회전이라 게임의 관절 변환이 그대로 포즈 본에 들어간다.

`render_sprites.py`: 직교 카메라 30°(게임과 같은 2:1 투영, 1유닛 = 28.28px), 왼쪽 위 키라이트(그림자) + 뒤쪽 림라이트 + 어두운 하늘 앰비언트 + 앰비언트 오클루전,
투명 배경 256px 렌더 → Lanczos로 128px 축소, 그림자는 별도 패스로 따로 저장(Cycles: 섀도 캐처, EEVEE: 키라이트만 받는 흰 바닥의 어두워진 정도).
`--engine eevee`(기본, 블룸은 컴포지터 글레어, AO는 머티리얼 AO + 패스트 GI AO) 또는 `--engine cycles`.
8방향 중 5방향(0, 1, 3, 4, 5)만 렌더하고 2 · 6 · 7은 0 · 4 · 3을 좌우 반전(`--mirror 0`이면 모두 렌더). 화면 세로축 기준 거울상이라
비대칭인 부분(광선검 쥔 손, 견갑)은 반전 방향에서 반대쪽에 보입니다. 그림자는 반전하지 않고 8방향 모두 실제로 렌더해서 늘 빛 반대쪽으로 떨어집니다.
끝에 준비 · 셰이더 컴파일 · 캐릭터 · 그림자 렌더에 걸린 시간을 출력합니다.
JSON에는 프레임마다 시트 좌표, 발 기준점, 광선검 마커(손잡이·끝)와 몸에 가려지지 않는 칼날 구간, 그림자의 시트 좌표가 들어갑니다.
옵션은 스크립트 맨 위 설명 참고 (`--anims`, `--frames`, `--only-dirs`로 미리보기). CPU 4코어에서 전체(18개 애니메이션 × 8방향)는 1시간 남짓.

게임: `src/gfx/sheet.js`가 `SHEETS`에 적힌 시트를 읽어 굽는 대신 쓰고(방향 = 유닛의 바라보는 각도, 프레임 = 애니메이션 시간),
렌더러는 그 프레임의 그림자 이미지를 바닥에, 광선검 칼날은 마커로 직접 그립니다.

모델 검토용: `model_views.py`(정면·측면·후면·3/4, 애니메이션 한 프레임), `preview.py`(한 프레임의 모든 방향).

## 코러산트 언더시티 (게임에 들어감)

```bash
.bvenv/bin/python tools/sprites/render_city.py            # 모델링 + 렌더 → public/sprites/city (전부 30분 남짓, 이름을 주면 그것만)
.bvenv/bin/python tools/sprites/city_floor.py public/sprites/city/floor_low.png   # 바닥 텍스처
```

`build_city_assets.py`: 에셋 프롬프트의 공통 스타일(높은 디테일의 프리렌더 3D, 낡고 지저분한 SF 지하 도시, 녹 · 노출 배관과 케이블 · 젖은 표면,
밤, 앰버 대 마젠타 · 청록 네온, 읽히는 글자가 없는 외계 문자 간판)대로 절차적으로 모델링한 16개 에셋 — 칸티나, 공동주택 3종, 노점 3종, 홀로그램 광고 탑,
스피더 바이크 2종, 상자 · 연료통 · 증기 격자 · 드로이드 잔해 · 쓰레기통 · 배전함. 이름이 `lit`으로 시작하는 재질(창문 · 등 · 출입구 빛)은 켜진 채로 몸체에,
나머지 발광 재질은 깜빡이는 네온 레이어로 갑니다. `render_city.py`가 에셋마다 창 크기와 기준점, 깜빡임 설정을 정해 `render_building.py`로 렌더(게임 픽셀 1:1).
홀로그램 광고 내용과 증기, 웅덩이 파문은 게임이 그립니다(`src/world/cityProps.js`에 빛 · 증기 · 소리 위치).

`city_floor.py`: 위에서 본, 이음매 없이 반복되는 8×8타일 바닥(어긋나게 깐 듀라크리트 판, 균열 · 깨진 모서리, 배수 격자, 기름 얼룩, 네온이 비치는 젖은 자국,
왼쪽 위 빛의 음영). 지형이 하층 바닥을 그릴 때 월드 좌표로 샘플링합니다.

## 건물

```bash
node tools/sprites/export_prop_glb.mjs underBlock 1 tools/sprites/out/underBlock_1.glb   # 게임의 프롭 모델을 .glb로
.bvenv/bin/python tools/sprites/render_building.py tools/sprites/out/underBlock_1.glb public/sprites/buildings
```

건물 하나 = PNG 세 장 + JSON:

| 레이어 | 내용 | 그리기 |
| --- | --- | --- |
| `body` | 네온을 끈 건물 본체 | 보통 (뒤로 가면 반투명) |
| `neon` | 네온을 켜서 더해지는 빛: 관, 벽에 번지는 색, 후광 | `lighter`, 깜빡임 |
| `reflect` | 젖은 바닥에 비친 네온 | 바닥 층에 `lighter`, 네온과 같이 깜빡임 |

JSON: `anchor`(모델 원점 = 바닥 중심의 이미지 좌표), `sort`(가장 앞쪽 바닥점 — 이 y로 캐릭터와 정렬),
`footprint`(충돌용 바닥 다각형, 원점 기준 타일 좌표), `neon`(`base`, `hum` 웅웅거림 세기, `speed`, `flicker`: 초당 꺼짐 확률·꺼짐 시간·꺼졌을 때 밝기).

`--light`로 조명 밝기(게임은 조명 맵을 곱하므로 도시 에셋은 2.4), `--neon`으로 깜빡임 설정을 바꿉니다.

검토 페이지: `npm run dev` 후 `/sprite-demo.html` (WASD/클릭 이동, F: 충돌 다각형).
