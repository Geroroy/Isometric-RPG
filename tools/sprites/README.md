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
# 3) 렌더 → 시트 + 그림자 시트 + JSON (게임이 읽는 곳: public/sprites). 창 없이 명령줄에서
tools/sprites/render_anakin.sh cycles --dirs 16
```

## 게임의 모든 캐릭터 (게임에 들어감)

```bash
.bvenv/bin/python tools/sprites/render_characters.py            # 전부 (이름을 주면 그것만)
```

`export_characters.mjs`가 `src/gfx/specs.js`의 캐릭터마다 게임의 모델(디테일 모드: 매끄러운 곡면)과 포즈 코드에서 프레임 단위로 뽑은 애니메이션을
.glb로 내보내고(재질은 게임이 정한 표면에 따라 PBR로: 금속 · 갑옷은 약간 광택, 천 · 피부는 무광, 빛나는 부분은 발광), `render_sprites.py`가 렌더해서
`public/sprites/chars/`에 시트와 `index.json`을 씁니다. 게임은 `index.json`에 있는 캐릭터를 시트로 불러오고, 없는 캐릭터만 브라우저에서 굽습니다.

### 렌더 속도

| | 방식 | 방향·프레임 하나 | 아나킨 146프레임 × 8방향 | 게임 전체 (30캐릭터, 18,520 방향·프레임) |
| --- | --- | --- | --- | --- |
| 처음 | Cycles 512px, 방향마다 캐릭터 · 그림자 2번 렌더 | 4.8초 | 94분 | 약 25시간 |
| 요청안 | EEVEE 256px, 5방향 + 좌우 반전 (GPU 없는 이 환경: 소프트웨어 OpenGL) | 9.5초+ | 1~2시간 | — |
| 요청안을 Cycles로 | Cycles 256px, 5방향 + 좌우 반전 | 0.8초 | 16분 | — |
| **지금** | **모든 방향을 한 장에 타일로 (프레임당 렌더 2번), 8방향 실제 렌더, 그림자 패스 경량화, 적응형 샘플링, 2개 병렬** | **0.2~0.3초** | **약 10분** | **약 1시간** |

렌더 한 번에는 장면 동기화 · BVH · 노이즈 제거 같은 고정 비용이 붙어서, 방향마다 따로 렌더하면 그 비용을 프레임당 16번 냅니다.
방향마다 모델 사본(메쉬와 애니메이션은 공유)을 바닥에 늘어놓아 한 장의 이미지 안에서 각자 자기 칸에 찍히게 하면 프레임당 2번(캐릭터, 그림자)으로 줄어듭니다.
그래서 좌우 반전 없이 8방향을 모두 실제로 렌더해도 더 빠르고, 반전 때문에 광선검 쥔 손이나 견갑이 반대쪽에 붙는 문제도 없습니다(`--mirror 1`로 여전히 쓸 수 있음).
128px로 줄인 뒤 언샤프 마스크(`--sharpen`)로 윤곽과 얼굴 · 벨트 같은 디테일을 살립니다. GPU가 있는 PC에서는 `--engine eevee`가 더 빠릅니다.

모델 검토용: `model_views.py`(정면·측면·후면·3/4, 애니메이션 한 프레임), `preview.py`(한 프레임의 모든 방향).

애니메이션 검토용: `pose_preview.mjs` + `pose_preview.py` — 렌더 없이 게임의 포즈 코드에서 바로 관절과 블레이드를 뽑아
막대 인형으로 그립니다(측면·정면·아이소 3행, 프레임별 열, 타격 프레임은 빨간 테두리). 1초 안에 나오므로 포즈를 고칠 때 씁니다.

```
node tools/sprites/pose_preview.mjs anakin attack1,sigF > /tmp/poses.json
.bvenv/bin/python tools/sprites/pose_preview.py /tmp/poses.json /tmp/poses.png
```

아나킨의 애니메이션(`src/gfx/models/anakinAnims.js`)은 에피소드 3 무스타파 결투와 시그니처 무브 영상을 바탕으로
만들었습니다. 포즈는 발 위치·골반 높이·몸통·검 손잡이로 적고, 다리는 프레임마다 IK로 풀어 발이 땅에 붙은 채 몸이 밀고 들어갑니다.

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
