# Movie Duels 아나킨 — 가져오기·스프라이트 진단 01 (ANAKIN_MD_SPRITE_PREP_01)

사용자가 고른 Movie Duels(Jedi Academy 모드) Episode III 아나킨 FBX를 게임의 캐릭터 렌더 파이프라인에 넣을 수 있는지 진단했다.
**기본 캐릭터는 바꾸지 않았다** — 게임은 여전히 `anakin_tunic`(본편)·`hero_anakin`(결투 시험장)을 쓴다. 기존 자체 제작 모델(`tools/sprites/hero`,
`public/sprites/duel`)은 손대지 않았다.

## 비공개 자산과 저장소

- 원본 팩(FBX·텍스처 14장·제공 스크립트)은 `tools/sprites/out/md_anakin/pack/`에 둔다(`.gitignore`의 `tools/sprites/out/` — 커밋하지 않음).
  체크섬: 팩의 `SHA256SUMS.txt` 20개 모두 일치(2026-10-17 확인).
- 이 팩에서 나온 렌더·시트·.blend(`tools/sprites/out/md_anakin/{prep,sheets,compare,deform,look}`)도 저장소에 넣지 않는다 — 사용자에게 따로 전달한다.
- 저장소에는 코드(`tools/sprites/md/`)와 이 문서만 있다. 출처: 사용자가 제공한 Movie Duels Anakin ZIP과 그 Sketchfab 링크(팩 README 기준).

## 재현 명령 (저장소 루트에서, Blender 5.2.2 LTS — `bpy` 모듈 `.bvenv`, Cycles CPU)

```
R=$PWD; P=tools/sprites/out/md_anakin                          # 팩: $P/pack (사용자 제공 ZIP을 풀어 둔 곳)
(cd $P/pack && sha256sum -c SHA256SUMS.txt)
(cd $P/pack && $R/.bvenv/bin/python prepare_blender.py -- --output "$PWD/output_orig" --render)   # 제공 스크립트 그대로
.bvenv/bin/python tools/sprites/md/inspect_md.py $P/pack $P/inspect.json        # FBX 구조·스킨·UV·이미지 (읽기 전용)
.bvenv/bin/python tools/sprites/md/md_deform.py  $P/pack $P/deform               # 뼈 하나씩 변형 검사 15종 × 뼈대 2가지
.bvenv/bin/python tools/sprites/md/md_prepare.py $P/pack $P/prep                 # 바인드 장면(.blend) + 진단 화면
.bvenv/bin/python tools/sprites/md/md_ready.py   $P/pack $P/prep                 # 준비 자세 작업본(.blend) + 손잡이
for n in bind ready; do .bvenv/bin/python tools/sprites/render_sprites.py $P/prep/md_anakin_$n.blend $P/sheets --name md_anakin_$n \
  --dirs 8 --window 128 --anchor 64,96 --sizes 128,256 --render 352 --meta $P/prep/md_anakin_${n}_meta.json --anims $n --force; done
.bvenv/bin/python tools/sprites/md/md_look.py $P/prep/md_anakin_ready.blend $P/look/ready ready   # 준비 자세 근접 화면
node tools/sprites/md/padshot.mjs <빌드 url> $P/pad.png --dirs8                  # 착륙장 (게임 배율 1) + 8방향
node tools/sprites/md/padshot.mjs <빌드 url> $P/pad_ready.png --sheet <url>/md_anakin_ready_128.json --dirs8   # 같은 자리에 MD 시트를 게임이 그림
python3 tools/sprites/md/md_compare.py $P/sheets $P/compare $P/pad.png $P/pad.json <현재,v1,바인드,준비 _dirs8.png>
```

`padshot.mjs --sheet`는 그 화면에서만 플레이어 스프라이트를 바꾼다(페이지 저장 없음). 시트 파일은 정적 서버로 내보내야 해서 QA 때만
`dist/_qa_md/`에 복사했다가 지웠다.

## 제공 스크립트 `prepare_blender.py` 검토

- **수정 없이 실행됐다** (Blender 5.2.2 LTS `bpy` 모듈, `.bvenv/bin/python prepare_blender.py -- --render`: 16 s). 오류 없음, 경고는
  `Material.use_nodes`·`World.use_nodes`가 Blender 6.0에서 없어진다는 DeprecationWarning 두 개.
- 결과: 메시 16, 뼈대 1(뼈 127 — 끝 뼈 `*_end` 포함), 액션 0, 재질 8개 재연결, 단일 팔뼈 검사 `rhumerus` Y축 10° → 최대 이동 1.9 cm "pass".
- 실행은 됐지만 그대로 쓰지 않은 점(원본 스크립트는 바꾸지 않고, 게임용은 `tools/sprites/md/`가 따로 한다):
  1. 단일 팔뼈 검사는 Y축(뼈 길이 방향 = 비틀기) 10°라 이동이 작고, 이 뼈대의 실제 결함(아래 손가락 계층)을 잡지 못한다.
  2. 8방향 렌더는 진단용 카메라(384 px, 원근 아닌 정사영이지만 게임 축척·앵커·조명과 다름)이고 파일 이름의 각도는 게임 방향과 대응하지 않는다.
  3. 방향 회전이 루트 엠프티의 원점을 축으로 해서 모델 중심이 원점에서 떨어져 있으면 방향마다 모델이 궤도를 돈다(이 모델은 중심 오차가 작아 화면상 문제 없음).
  4. FBX가 만든 빈 이미지 참조(제작자 PC 경로)가 남아 `.blend`에 텍스처를 묶을 수 없다(`pack_all` 실패) — 텍스처는 팩 폴더 경로로만 연결된다.
  5. 절단면(캡) 메시를 그대로 둔다.

## 가져오기·재질

| 재질 | 연결한 팩 이미지 | 금속성 | 거칠기 | 비고 |
|---|---|---|---|---|
| Head | `head.jpg` (파란 눈) | 0 | 0.60 | FBX는 `head_sith.jpg`를 가리키지만 팩에 없다 — 연결하지 않았다 |
| Hair | `hair.jpeg` | 0 | 0.70 | FBX는 `hair.jpg` |
| Hair Alpha | `hair_alpha.tga.png` (RGBA) | 0 | 0.65 | 이미지 알파 → BSDF 알파(Cycles: 투명 그림자). 투명해지는 가장자리 색 0.093 vs 불투명 0.12 → 검은 테두리 없음(화면도 확인) |
| Torso | `torso.jpg` | 0 | 0.80 | FBX는 `torso_bw.jpg` |
| Hips | `hips.jpg` | 0 | 0.80 | FBX는 `hips_bw.jpg`. `hips_tcw-spec.jpg`는 연결하지 않음(이름이 다른 변형) |
| Boots | `boots.jpg` | 0 | 0.55 | FBX는 `boots_bw.jpg` |
| Arms | `arms.jpg` | 0 | 0.75 | FBX는 `arms_bw.jpg` |
| Caps | 없음 | 0 | 0.80 | 어두운 임시색. 아래 "캡" |

- 스펙 이미지(`*-spec.jpg`, `head_spec`, `hair_spec`, `hair_alpha_spec`)는 보존만 하고 어디에도 연결하지 않았다(금속성 0 — 천·피부가 금속처럼 빛나지 않음; 화면 확인).
- 거칠기 값은 첫 추정이다.
- FBX가 참조하던 이미지 13개(`*_bw.jpg`, `head_sith.jpg`, `hair.jpg`, `hair_alpha.tga`, `*_spec.jpg`)는 재질 재연결 뒤 쓰는 곳이 없어 작업본에서 지웠다(`prepare_report.json`).
- UV: 16개 메시 모두 0..1 안. 얼굴·벨트·장갑·부츠 무늬가 제자리에 보인다(진단 화면) — 깨진 UV는 보지 못했다.
- 비대칭 유지: 오른손만 검은 장갑(왼손은 맨손), 오른쪽 눈 위 흉터, 벨트 파우치 — 좌우 반전 없이 렌더했다.
- 뒤집힌 면: 화면에서 보지 못했다(머리카락 카드 앞뒤 모두 확인). 법선 방향 수치 검사는 몸통 축 기준 단순 추정이라 판정에 쓰지 않았다.
- **캡** `l_hand_cap_l_arm_off_0`(꼭짓점 9, 면 7): 왼손목, 왼손 메시와 10쌍의 꼭짓점을 공유하는 소매 안쪽. 바인드 포즈에서 세 방향으로 보이게·숨기게 렌더해
  비교하니 픽셀 차이 0(최대 1/255) — 정상 전신에서는 보이지 않는다. 이름 형식(`…_cap_…_off`)은 JKA의 사지 절단 캡과 같은 꼴로 보이나 그 용도는 **추정**이다.
  렌더 작업본에서만 숨겼다(`hide_render`).

## 뼈대·변형 검사 (`md_deform.py`, `deform_report.json`)

- 메시 16개 전부 Armature 모디파이어, 가중치 없는 꼭짓점 0, 꼭짓점마다 가중치 합 1.0.
- **FBX의 뼈 부모가 잘못돼 있다**: 손가락 뼈(`r_d1_j1`, `r_d1_j2`, `r_d2_*`, `r_d4_*`)와 무기 태그 `rhang_tag_bone`이 손(`rhand`)이 아니라 아래팔(`rradius`) 밑에 있고,
  손가락 둘째 마디도 첫째 마디가 아니라 아래팔 밑이다(왼쪽도 같음). 그래서 손목을 돌리면 손가락이 남고 찌그러진다(아래 표 `wrist`).
  작업본에서는 편집 모드에서 부모만 바꿨다(`md_lib.HIER` — 휴지 행렬·가중치·메시는 그대로, 모델 재제작 없음).
- 옷자락 뼈 `ltail`/`rtail`에는 가중치가 없다 — 돌려도 아무것도 움직이지 않는다. 튜닉 앞·뒤 자락은 넓적다리 뼈를 따라간다(`hip`).
- 측정: `moved` 최대 꼭짓점 이동, `seam` 휴지 상태에서 2 mm 안에 붙어 있던 다른 조각 꼭짓점 142쌍(손-팔, 어깨-몸통, 다리-골반, 벨트-몸통 …)의 최대 간격,
  `늘어난 변` 길이가 1.5배 넘게 변한 변 수, `복원` 원래대로 돌린 뒤 최대 차이.

| 검사 | 뼈·각 | 이동 | 이음매 | 늘어난 변 (FBX → 고친 부모) | 복원 |
|---|---|---|---|---|---|
| 위팔 | rhumerus X 45° / Z 45° | 0.55 m | 1.7 mm (휴지 간격 그대로) | 8 / 17 | 0 |
| 팔꿈치 | rradius X 70° / Z 70° | 0.46 m | 1.7 mm | 14 / 21 | 0 |
| 손목 | rhand X 45° | 0.08 → 0.13 m | 1.7 mm | **33 → 4** | 0 |
| 손가락 | r_d2_j1 X 60° | 0.04 → 0.09 m | 1.7 mm | **14 → 2** | 0 |
| 엄지 | r_d1_j1 X 50° | 0.06 → 0.09 m | 1.7 mm | 28 → 6 | 0 |
| 왼 팔꿈치 | lradius X 70° | 0.47 m | 1.7 mm | 14 | 0 |
| 무릎 (뒤로) | rtibia X −70° | 0.62 m | 1.7 mm | 11 | 0 |
| 무릎 (앞으로, 과신전) | rtibia X 70° | 0.62 m | 1.7 mm | 14 (무릎 앞 크게 접힘) | 0 |
| 엉덩이 | rfemurYZ X 40° | 0.66 m | 1.7 mm | 24 | 0 |
| 옷자락 | ltail / rtail X 35° | **0** | — | 0 | 0 |
| 허리 | upper_lumbar X 25° | 0.30 m | 1.7 mm | 30 | 0 |

- 몸이 이음매에서 벌어지는 곳은 없다. 큰 각도에서 관절 주변 변이 늘어나는 것은 저폴리 선형 스키닝의 일반적인 모습이다(화면: `deform_sheet_*.jpg`).
- 이 검사는 바인드 포즈에서 뼈 하나씩 돌린 것이다 — 걷기·전투 동작 전체의 품질 검사가 아니다.

## 게임 렌더 규격 — 그대로 사용 (`tools/sprites/render_sprites.py`, `render_config.json`)

| 항목 | 값 | 출처 |
|---|---|---|
| 카메라 | 정사영, 지면에서 30°, 게임의 시선 대각선(카메라는 +X·−Y 쪽) | `render_sprites.py` "Camera" |
| 픽셀 축척 | 축을 따라 1 m = 28.28 px(`HALF_W / √½`), 2:1 — `core/iso.js`와 같다 | `render_sprites.py` `PX_PER_UNIT` |
| 프레임 창 · 발 앵커 | 128 게임 px 창, 발 (64, 96) | `--window 128 --anchor 64,96` (결투 시트 `hero_*`와 같음) |
| 출력 크기 | 128(1 게임 px = 1 px, `k` 1) · 256(2배, `k` 0.5 — 결투 시트 규격), 렌더 352 px 뒤 축소 | `--sizes 128,256 --render 352` |
| 조명 | 카메라에 고정된 키(왼쪽 위, 그림자)·림(오른쪽 뒤)·필 + 어두운 하늘 + AO | `render_sprites.py` `sun(...)` |
| 엔진 | Cycles CPU 12 샘플, 색·그림자(섀도 캐처)·노멀을 한 렌더의 패스로 | `render_config.json` `character` |
| 축척 | 머리카락 끝~발바닥 1.85 m (FBX 1 단위 = 0.02877 m) — 결투 아나킨 `hero_anakin`과 같은 키 | `md_lib.HEIGHT`, `docs/CHARACTERS.md` |
| 모델 방향 | +X 정면(방향 0), +Z 위, 발 z = 0 — FBX는 −Y 정면이라 +90° 돌려 세움 | `render_sprites.py`·`hero/build_hero.py` 규칙 |
| 방향 | **방향 i = 게임 각 i·45°** (게임 좌표, y 아래) — 렌더러가 피벗을 −i·45° 돌린다. 좌우 반전 없음(`mirror_sprites`에 없음) | `render_sprites.py` |

방향 대응표 (8방향 시트 i ↔ 16방향 결투·본편 시트 2i, 같은 바라보는 방향):

| i | 게임 각 | 화면에서 바라보는 쪽 | 16방향 |
|---|---|---|---|
| 0 | 0° | 오른쪽 아래 | 0 |
| 1 | 45° | 아래 (카메라 쪽 — `FRONT`) | 2 |
| 2 | 90° | 왼쪽 아래 | 4 |
| 3 | 135° | 왼쪽 | 6 |
| 4 | 180° | 왼쪽 위 | 8 |
| 5 | 225° | 위 (등) | 10 |
| 6 | 270° | 오른쪽 위 | 12 |
| 7 | 315° | 오른쪽 | 14 |

제공 스크립트의 진단 렌더(384 px)는 이 규격이 아니다 — 게임 크기 판단에는 아래 시트만 쓴다.

## 렌더 결과

- 시트: `md_anakin_bind_{128,256}`, `md_anakin_ready_{128,256}` (각 8방향 × 1프레임, 색·그림자·노멀 페이지 + JSON — 게임의 시트 형식 그대로).
- 발 앵커 위 키(게임 px, 8방향): 게임 현재 `anakin_tunic` 44–46 · 자체 제작 v1 42–45 · **MD 바인드 46–47 · MD 준비 자세 44–45**. 발은 앵커 아래 0–6 px(아이소 시점의 발 벌림).
- 비교 화면 (`tools/sprites/out/md_anakin/compare/`):
  - `compare_1x.png` / `compare_4x.png` — 네 모델 × 8방향, 게임이 시트 프레임을 그리는 방식(앵커·k·그림자 알파 0.75·표지에서 칼날)으로, 회색 바탕.
  - `pad8_1x.png` / `pad8_4x.png` — **실제 게임이 그린** STAGE 01 착륙장(배율 1)의 같은 자리, 네 모델 × 8방향(게임의 조명·색 보정 포함).
    맵 걷기 모드라 광선검은 꺼져 있다. 자체 제작 v1은 위·아래 두 겹 시트라 QA 전용으로 한 장으로 합친 임시 시트(`qa_hero_stance_256`)로 그렸다.
  - `pad_compare_1x.png` / `pad_compare_4x.png` — 착륙장 화면 위에 시트 원색으로 붙인 것(색 보정 없음, 참고용).

## 준비 자세 (`md_ready.py`) — 제작 판단, 원본 애니메이션 아님

- 게임 검술의 아나킨 기본 자세(`src/combat/moves.js` `MOVES.anakin.stance`·`feet`)를 이 뼈대에 옮긴 정지 자세 하나. 별도 작업본 `md_anakin_ready.blend`.
- 손잡이 중심(오른손) 0.30 m 앞·0.10 m 오른쪽·1.08 m 높이, 칼날 방향 오른쪽 14°·위 58°, 왼손 0.11 m 아래, 왼발 앞 0.22 m, 오른발 뒤 0.20 m, 골반 0.06 m 낮춤.
- 두 마디 IK는 직접 계산했다(`solve_ik`): Blender IK 제약은 아래팔·정강이 뼈의 꼬리를 목표로 맞추는데 이 뼈대에서는 손목·발목이 꼬리에서 1–5 cm 떨어져
  있어 오차가 남았고, 끝 뼈 머리를 쓰는 설정(`use_tail` 끔)은 사슬에 골반·흉추까지 넣어 몸을 비틀었다. 결과 오차: 팔·다리 모두 0.0 mm.
- 광선검: 기존 결투 시트의 손잡이(`tools/sprites/hero/pose_hero.py` `HILT`·`hilt_parts('anakin')`, 같은 재질)와 표지 `saberBase`(손잡이 중심 +0.135 m)·
  `saberTip`(+1 m)를 재사용, 손잡이는 오른손 뼈의 자식. 칼날 축 = 원한 방향과 0.000°, 표지 간격 1.000 m.
- 양손 접촉: 손잡이 축에서 오른손 가장 가까운 꼭짓점 2.0 mm(3.5 cm 안 116개, 손잡이 길이의 22–77 % 구간), 왼손 2.5 mm(82개, 0–51 % 구간 — 오른손 아래).
  손이 손잡이 반경 안으로 조금 파고든다(오른손 38개, 왼손 6개 꼭짓점). 근접 화면에서 왼손 손가락 감김이 덜하다 — 128 px 시트에서 손은 3 px 남짓이라 보이지 않는다.

## 확인한 사실 / 제작 판단 / UNKNOWN / 실행하지 않은 검사

**확인한 사실**
- 팩 체크섬 20개 일치. FBX 7400, 메시 16, 삼각형 4,499, 뼈 127(끝 뼈 포함), 스킨 16, 액션 없음.
- 제공 스크립트가 Blender 5.2.2 LTS에서 오류 없이 실행됨.
- 텍스처 연결과 UV가 화면에서 제자리이고, 머리카락 알파에 검은 테두리가 없음.
- 손가락 뼈 부모 결함과 그 수정 효과(늘어난 변 33 → 4), 옷자락 뼈에 가중치 없음, 이음매 벌어짐 없음, 복원 오차 0.
- 캡은 정상 전신에서 보이지 않음(픽셀 차이 0).
- 게임 렌더러·규격으로 8방향 시트가 나오고, 게임 렌더러가 착륙장에서 그 시트를 정상적으로 그림(페이지 오류 0).

**제작 판단**
- 재질별 거칠기, 스펙 맵 미사용, 캡 숨김, 뼈 부모 수정, 키 1.85 m, 준비 자세와 손가락 감김 각도.

**UNKNOWN**
- 캡과 `hips_tcw-spec.jpg`의 원래 용도(이름 형식으로만 추정).
- `head_sith.jpg`가 쓰이던 변형(시스 눈?)은 팩에 없어 확인 불가.
- 이 뼈 이름(`rhang_tag_bone`, `lradiusX`, `Motion` …)은 JKA 인간형 골격과 같은 체계로 보이나, 원본 `.gla`와 대조하지 않았다.

**실행하지 않은 검사**
- 걷기·공격 등 동작 전체의 변형 품질, 옷자락 물리.
- 결투 시험장(`src/combat/sprites.js`)에 연결해 실제 전투로 그리기 — 기본 캐릭터를 바꾸지 않는다는 지시대로 하지 않았다.
- 광선검을 켠 상태의 게임 화면(맵 걷기는 검을 끈다; 칼날은 비교 시트에서 표지로 그렸다).
- 사람 눈으로 하는 최종 시각 승인.

## 원본 게임의 호환 동작

- 이 FBX에는 애니메이션이 없다(AnimationStack 0).
- Movie Duels·Jedi Academy의 동작은 게임 데이터의 골격 애니메이션 파일(인간형 `.gla`)에 있다. 이 팩에도 이 환경에도 없다 — **구하지 못했다**.
  사용자가 가진 게임 설치본에서 그 파일을 주면 Ghoul2 변환 도구로 이 뼈대의 액션으로 옮길 수 있는지 시험할 수 있다(뼈 이름 체계가 같아 보임 — 미확인).
- 이 프로젝트에 이미 있는 동작: 검술 v1의 자세 데이터(`tools/sprites/hero/export_clips.mjs` → `hero_clips.json`, 관절 위치). 이번 준비 자세와 같은 두 마디 IK
  방식으로 이 뼈대에 옮길 수 있다 — 새 동작을 만들기보다 이것을 재사용하는 것이 다음 단계 후보다(아직 하지 않음).
