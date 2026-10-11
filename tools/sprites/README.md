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
# 3) 렌더 → 시트 + 그림자 시트 + JSON (게임이 읽는 곳: public/sprites). 창 없이 명령줄에서.
#    외형별 모델·방향 수·헤어는 render_config.json의 "sprites"
.bvenv/bin/python tools/sprites/render_anakin.py            # 바뀐 외형만 (--preview: 방향 1개 · 프레임 2장)
```

## 게임의 모든 캐릭터 (게임에 들어감)

```bash
.bvenv/bin/python tools/sprites/render_characters.py            # 전부 (이름을 주면 그것만)
```

`export_characters.mjs`가 `src/gfx/specs.js`의 캐릭터마다 게임의 모델(디테일 모드: 매끄러운 곡면)과 포즈 코드에서 프레임 단위로 뽑은 애니메이션을
.glb로 내보내고(재질은 게임이 정한 표면에 따라 PBR로: 금속 · 갑옷은 약간 광택, 천 · 피부는 무광, 빛나는 부분은 발광), `render_sprites.py`가 렌더해서
`public/sprites/chars/`에 시트와 `index.json`을 씁니다. 게임은 `index.json`에 있는 캐릭터를 시트로 불러오고, 없는 캐릭터만 브라우저에서 굽습니다.

### 렌더 설정과 규칙 (`render_config.json`, `CLAUDE.md`)

모든 렌더 스크립트는 저장소 루트의 `render_config.json`에서 엔진·샘플 수·해상도 배율·패스·병렬 작업 수·예상 시간 기준을 읽습니다.

- **바뀐 것만 렌더**: 시트 JSON의 `source` = 모델(.glb는 삼각형 순서·부동소수 끝자리와 무관한 내용 해시)·헤어·타이밍·설정·
  `PIPELINE_VERSION`의 해시. 같으면 건너뜀(`--force` 강제, `--check` 확인, `--adopt` 기존 시트를 현재 결과로 인정).
- **바뀐 동작만 렌더**: 해시는 모델 부분(`baseSource`: 애니메이션을 뺀 .glb·헤어·설정·`PIPELINE_VERSION`)과
  동작별(`animSource`: 키프레임·타이밍)로도 기록된다. 모델 부분이 같고 동작만 추가·수정됐으면 그 동작만 렌더하고
  나머지 동작의 프레임은 기존 시트에서 픽셀 그대로 옮겨 다시 묶는다(`PARTIAL`). `--check`는 `frames=N anims=…`를 출력하고
  일괄 스크립트의 예상 시간도 그만큼만 센다. 모델이 바뀌면 전부 렌더.
  - `--verify`: 동작별 해시가 없는 예전 시트를 확인 — 동작마다 가운데 프레임 하나를 렌더해 시트의 스프라이트와 비교하고,
    같은 동작만 현재 입력의 결과로 기록한다(시트 픽셀은 안 바뀜). 다음 실행부터 다른 동작만 렌더된다.
  - `--only-anims a,b`: 시트가 낡았어도(예전 파이프라인·예전 모델) 그 동작만 렌더해 넣는다. 기록은 `source: partial`,
    모델 부분은 예전 값 그대로라 다음 확인에서 여전히 "전체 렌더 필요"로 나온다.
  - `--passes color,shadow`: 노멀 패스 없이 만든 예전 시트에 합칠 때 그 시트와 같은 패스로 렌더(일괄 스크립트가 넘겨줌).
- **예상 시간 먼저**: `ESTIMATE …`(스프라이트 장수, 분) — 30분이 넘으면 `ASK:`로 멈추고 `--yes`로만 진행.
- **미리보기**: `--preview` = 카메라를 보는 방향 1개, 애니메이션마다 2프레임 → `tools/sprites/out/preview` (아나킨 한 외형 약 40초).
- **한 번 렌더에 모든 레이어**: 색상과 그림자(Cycles 섀도 캐처 패스), 필요하면 노멀·깊이(`character.passes`)까지
  컴포지터 File Output으로 한 렌더에서 나옵니다. 한 프레임의 모든 방향도 타일 한 장.

### 렌더 속도 (이 컨테이너: CPU 4코어, GPU 없음)

| | 방식 | 아나킨 로브 (16방향 × 183프레임) |
| --- | --- | --- |
| 이전 | 프레임당 렌더 2번(캐릭터 · 그림자), 16샘플 + OIDN 디노이즈 | 21분 14초 (프레임당 6.8초) |
| **지금** | **프레임당 렌더 1번(그림자는 패스, 캐처는 방향별 원판), 12샘플, 디노이즈 없음** | **15분 54초 (프레임당 4.7초)** |
| 참고: 카메라를 돌려 방향마다 렌더 | 방향마다 장면 동기화 · BVH | 프레임당 19초 (2.8배 느림) |
| 참고: EEVEE | 소프트웨어 OpenGL (GPU 없음) | 프레임당 27.5초, 헤어 있으면 1프레임에 20분+ |

진단(한 프레임, 16방향): 색상 렌더 4.4초(그중 장면 동기화 · BVH · 디노이즈 같은 고정 비용 2.0초), 그림자 렌더 2.3초(고정 비용 1.5초),
프레임 이동 · 마커 0.3초, Blender 실행 · 장면 로드 · 16사본 복제 2.6초(캐릭터당 한 번), 저장 · 축소 · 패킹 약 30초(캐릭터당 한 번).
천 · 헤어 시뮬레이션은 없습니다(로브는 뼈 가중치, 헤어는 build_hair.py에서 한 번 적용된 커브).
128px로 줄인 결과는 이전과 평균 0.4~0.7/255 차이(샘플링 노이즈)로 눈으로 구분되지 않습니다. 그림자는 하늘빛이 캐처를 조금 밝혀서
`shadow_gain` 1.45로 이전 밝기에 맞췄습니다. GPU가 있는 PC에서는 설정이 자동으로 Cycles GPU(64샘플)로 바뀝니다. EEVEE는 섀도 캐처가 없어 그림자에 렌더가 한 번 더 필요하므로(한 번 렌더 규칙과 충돌) 기본값이 아닙니다.

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


## 아나킨 외형 (Blender) · 헤어 커브

`build_anakin.py`의 세 번째 인자로 외형을 고릅니다: `armor`(클론 전쟁, 기본), `tunic`(에피소드 III 제다이 기사),
`robe`(짙은 두건 로브, 두건 내림), `vader`(같은 로브, 두건 씀 — 오더 66). 리그·얼굴·애니메이션은 모두 같습니다.

에피소드 III 외형의 머리카락은 메시가 아니라 **Blender 헤어 커브**입니다(`build_hair.py`).
두피 메시 위에 가이드 커브 약 180개를 깔고, Essentials 헤어 노드 그룹을 모디파이어로 쌓습니다:
Interpolate Hair Curves(가이드 사이를 약 1만 가닥으로) → Clump(가닥 뭉치) → Curl(굵은 웨이브) → Frizz(아주 약하게)
→ Set Hair Curve Profile(두께, 끝이 가늘게). 재질은 Principled Hair BSDF(멜라닌, 뿌리 어둡게, 세 가닥 중 하나는
캐러멜 하이라이트)이고, EEVEE 출력에는 같은 규칙의 Principled BSDF 대체 재질이 붙어 있습니다.
glTF는 헤어 커브를 담지 못하므로 렌더 때 붙입니다: `render_sprites.py --hair out/anakin_hair.blend`가 적용된 커브를
머리 뼈에 부모로 연결해, 모든 애니메이션에서 머리를 따라 움직입니다.

```
.bvenv/bin/python tools/sprites/build_hair.py tools/sprites/out/anakin_hair.blend ep3        # 어깨 길이
.bvenv/bin/python tools/sprites/build_hair.py tools/sprites/out/anakin_hair_hood.blend hood  # 두건 안
.bvenv/bin/python tools/sprites/build_anakin.py tools/sprites/anakin_anims.json tools/sprites/out/anakin_robe.glb robe
.bvenv/bin/python tools/sprites/render_sprites.py tools/sprites/out/anakin_robe.glb public/sprites --dirs 16 \
    --meta tools/sprites/anakin_anims.json --hair tools/sprites/out/anakin_hair.blend
.bvenv/bin/python tools/sprites/hair_preview.py tools/sprites/out/anakin_robe.glb tools/sprites/out/anakin_hair.blend /tmp/hair eevee
```

`hair_preview.py`는 머리 클로즈업(정면·측면·후면·아이소)과 전신 128px(정면·측면·아이소)을 Cycles/EEVEE로 렌더합니다.
헤어가 붙으면 프레임당 렌더 시간이 약 10% 늘어납니다(16방향 4.7 → 5.2초).

### 시즌 7 헤어 메시 (`hair/`, 에피소드 III 외형용)

클론워즈 시즌 7 아나킨(`reference/anakin_hair/`) 기준의 **메시 헤어**. 클론워즈 갑옷 외형(`anakin`)은 자기 헤어를 그대로 쓰고,
튜닉·로브 외형에 렌더 때 붙던 헤어 커브 대신 씁니다. 두피 위 가이드 커브를 따라 굵은 웨이브 다발(위는 볼록하고 아래는 납작한
렌즈 단면의 튜브)을 겹쳐 쌓습니다. 정수리 다발은 뒤·옆 끝까지 이어지고, 바깥 끝은 바깥으로 살짝 뻗칩니다. 앞머리는 그의 왼쪽
가르마에서 이마를 가로질러 오른쪽 관자놀이로 넘어가고, 한두 가닥이 이마로 흘러내립니다. 아래에는 머리색 셸이 깔립니다.
머리 뼈 `head`에 가중치 1로 붙고, 다른 메시는 그대로 다시 내보냅니다(애니메이션 17개, 노드·스킨 같음). 원본 GLB는 덮어쓰지
않고, 지운 헤어는 `_hair_v1_backup.blend`로 남깁니다.

| 파일 | 역할 |
|---|---|
| `hair/hair_v2.py IN.glb OUT.glb [params] [backup.blend]` | 헤어 교체. 삼각형 수를 출력하고 예산(가장 무거운 헤어 메시 29,764의 1.5배)을 넘으면 경고 |
| `hair/hair_v2_params.json` | 모든 조형 값: 그룹별 개수·뿌리/끝 범위·폭·두께·높이·웨이브·뻗침·볼륨, 팔레트, 셸, 끝 모양 |
| `hair/hair_review.py model.glb dir label [hair.blend]` | 정면·오른쪽·왼쪽·후면·3/4 클로즈업 + 게임 아이소 시점(스프라이트 실제 크기, 2배 렌더 후 축소) |
| `hair/hair_sheet.py` · `hair/hair_iter.sh N tunic\|robe "메모"` | 레퍼런스·이전·새 헤어 비교 시트를 `renders/hair_iter_N/`에 |

```
.bvenv/bin/python tools/sprites/hair/hair_v2.py tools/sprites/out/anakin_tunic.glb tools/sprites/out/anakin_tunic_hairv2.glb
.bvenv/bin/python tools/sprites/hair/hair_v2.py tools/sprites/out/anakin_robe.glb tools/sprites/out/anakin_robe_hairv2.glb
sh tools/sprites/hair/hair_iter.sh 9 tunic "메모"     # 비교 시트
```

게임에 쓰려면 `render_config.json`의 `anakin_tunic`·`anakin_robe` 항목에서 `glb`를 `*_hairv2.glb`로 바꾸고 `hair`를 지운 뒤
`render_anakin.py anakin_tunic anakin_robe`로 시트를 다시 굽습니다(먼저 ESTIMATE 확인).
