# 아나킨 · 클론워즈 시즌 1 외형 — 프롬프트 2종

참고 이미지: `reference/color_clonewars/image.jpg` (클론워즈 2008 CG, T-포즈 정면, 회색 배경).
색은 그 이미지에서 픽셀을 찍어 잰 값이다(JPEG라 ±10 정도 오차, 조명 섞인 중간톤 기준).

| 부위 | 측정색 | 비고 |
|---|---|---|
| 머리카락 | `#6f4c32` (밝은 쪽) / `#4a2f1e` (그늘) | 밤색·적갈색, 끝은 살짝 밝음 |
| 피부 | `#a5775f` (뺨 그늘) → `#e0b08f` (밝은 면, 추정) | 따뜻한 피부, 페인팅 질감 |
| 어깨 요크 | `#658184` / 가장자리 `#424e51` | 회청록 가죽, 낡은 얼룩 |
| 타바드 | `#1b2a36` (중간톤) / `#2e4258` (밝은 면, 추정) | 짙은 슬레이트 네이비 |
| 언더튜닉 | `#6f3536` (밝은 면) / `#3d1d1f` (그늘) | 적갈색(마룬) |
| 벨트 | `#322527`, 버클 `#603f1d`(놋쇠) | 짙은 갈색 가죽 |
| 장갑 | `#0d1116` ~ `#43392e` | 거의 검은 갈색, 오른쪽이 더 어둡다 |
| 부츠 | 위 `#30231b`, 아래 `#664e38` | 갈색 가죽, 위가 더 어둡다 |

---

## 1. 외형 묘사 프롬프트 (이미지 생성·3D 생성용, 영어)

```
Anakin Skywalker as he appears in Star Wars: The Clone Wars (2008 CG series, season 1 design),
full body, front view, neutral A/T-pose, plain light grey studio background.

Art style: Lucasfilm Animation's Clone Wars look — stylised, angular, carved planar forms like a
painted wooden maquette; hand-painted textures with visible brush strokes and soft grime; matte
surfaces, no realistic pores; slightly elongated proportions (about 7.5 heads tall), long arms,
narrow waist, broad but lean shoulders.

Face: a young man of about 19, sharp angular jaw, narrow pointed chin, high flat cheekbones carved
as planes, straight nose, strong low brow ridge, deep-set narrow blue eyes, a confident, slightly
brooding frown, mouth closed. A thin vertical scar through his right eyebrow down over the right eye.
Fair warm skin.

Hair: chestnut / auburn brown (#6f4c32, shadows #4a2f1e), short-to-medium length, thick and
voluminous, sculpted in big chunky clumps; swept up and back from the forehead with a loose part,
a few strands falling over the forehead, covering the tops of the ears, flicking out at the nape
just above the collar.

Outfit, top to bottom:
- A grey-teal leather shoulder yoke (#658184, worn edges #424e51): a short cape-like mantle that
  covers both shoulders and the upper chest to mid-sternum, cut square at the front with a
  rectangular lower edge, rounded shoulder caps standing slightly proud of the shoulders, a small
  stand-up collar opening at the throat.
- A long-sleeved maroon undertunic (#6f3536, shadows #3d1d1f), fitted sleeves to the wrists, its
  skirt reaching mid-shin and showing through the front split of the tabard.
- A sleeveless dark slate-navy tabard (#1b2a36 to #2e4258), heavy matte cloth, open down the front
  from the belt, falling in straight panels with soft folds to just below the knee.
- A dark brown leather utility belt (#322527) with a small brass buckle (#603f1d), two small
  pouches and clips at the front, worn at the natural waist over the tabard.
- Long near-black brown leather gauntlet gloves (#0d1116 to #43392e) with flared cuffs to
  mid-forearm; the right glove slightly darker and glossier (hides his mechanical hand).
- Dark trousers tucked into tall brown leather boots (#30231b top, #664e38 lower): knee-high,
  wrapped / segmented uppers with a folded cuff and short fringed straps at the top, lighter
  scuffed toes, flat soles.

No lightsaber in hand, no armour plates, no cloak. Even, soft, frontal studio lighting.
```

부정 프롬프트(필요하면): `realistic skin pores, photoreal, chest armour, pauldron, cloak, hood, robe, black tabard, long hair past the shoulders, lightsaber, blurry, extra fingers`

---

## 2. Claude Code용 프롬프트 — 이 외형을 게임 모델로 만들고 프리렌더 아이소메트릭으로

아래를 그대로 Claude Code에 붙여 넣는다. 이 저장소의 파이프라인(`build_anakin.py` → GLB →
`render_sprites.py` 시트 / `iso_portrait.py` 단일 이미지)에 맞춰 썼다.

```
새 외형 "클론워즈 시즌 1" (id: cw_s1, sprite: anakin_cw_s1)을 아나킨 모델에 추가해 줘.
참고 이미지: reference/color_clonewars/image.jpg, 외형 설명과 측정 색: docs/prompts/anakin_cw_s1.md.
CLAUDE.md와 ART_GUIDE.md 규칙을 따른다 (render_config.json, ESTIMATE 먼저, 30분 넘으면 묻기,
--preview 먼저, 바뀐 것만 렌더, 패스는 한 번 렌더로).

1. 모델 (tools/sprites/build_anakin.py에 outfit 'cw_s1' 추가)
   - 리그·얼굴·애니메이션은 기존과 공유한다. 기존 armor 외형의 타바드·튜닉·벨트·장갑·부츠를
     재사용하되 다음을 바꾼다:
     · 흉갑·견갑·제다이 문장 제거.
     · 회청록 가죽 어깨 요크 추가: 양 어깨와 가슴 위쪽(명치 중간까지)을 덮는 짧은 망토형, 앞은
       네모나게 잘리고, 어깨 끝은 둥글게 살짝 솟음, 목 앞은 작게 트인 스탠드 칼라. 'chest' 뼈에
       강체로 웨이트, 어깨 끝만 upperarm과 섞는다.
     · 타바드 색 짙은 슬레이트 네이비, 언더튜닉·바지 마룬, 벨트 짙은 갈색 + 놋쇠 버클,
       장갑 거의 검은 갈색(오른쪽이 더 어둡고 광택), 부츠 위가 어두운 갈색 가죽에 접힌 단과
       짧은 술 장식. 색은 문서의 측정값을 기준으로 ART_GUIDE의 행성 팔레트와 맞춘다.
     · 재질: 클론워즈 CG처럼 손으로 칠한 듯한 무광 PBR (거칠기 0.6~0.8, 노멀은 약하게,
       붓자국·얼룩은 build_anakin의 fbm 텍스처로).
   - 헤어: tools/sprites/hair/hair_v2.py로 클론워즈 헤어를 따로 만든다 (파라미터 파일
     hair_cw_s1_params.json 새로). 밤색·적갈색, 짧은~중간 길이, 숱 많은 큰 덩어리, 이마에서
     위·뒤로 넘기고 앞머리 몇 가닥, 귀 위를 덮고 목덜미에서 칼라 바로 위로 살짝 뻗침.
     폴리곤은 기존 헤어의 1.5배 이내, 'head' 뼈 웨이트 1.
   - 얼굴: 오른쪽 눈썹~눈 위 세로 흉터 유지.
   - 결과: tools/sprites/out/anakin_cw_s1.glb (원본 GLB는 덮어쓰지 않는다).

2. 확인 렌더 (renders/cw_s1_iter_N/에 반복 ≥3회)
   - hair_review.py로 정면·좌·우·뒤·3/4 클로즈업 + 게임 크기(128px) 아이소 3방향.
   - 참고 이미지와 나란히 놓은 비교 시트를 만들고, 매 반복마다 무엇을 고쳤는지 기록.

3. 프리렌더 아이소메트릭 단일 이미지
   - tools/sprites/hair/iso_portrait.py로 renders/iso_portrait/anakin_cw_s1_iso_2048.png:
     정사영, 클래식 아이소(35.26° 내려다봄), 오른쪽 앞에서, 전신, 2048×2048, 알파 있는 무손실
     16bit PNG, 부드러운 스튜디오 조명, 대기 자세(idleOff)에서 얼굴이 보이게 머리를 살짝 든다.

4. 게임 적용 (스크린샷 검토 후에만)
   - render_config.json "sprites"에 anakin_cw_s1 추가(16방향), src/ui/appearance.js LOOKS에
     '클론워즈 시즌 1' 외형 추가.
   - 먼저 --preview로 확인, 그다음 ESTIMATE를 보여 주고 전체 시트를
     tools/sprites/out/review/에 렌더.
   - tools/qa/lookshot.mjs + lookcompare.py로 기존 armor 외형과 비교 스크린샷을 올려 검토받은 뒤
     public/sprites/로 옮기고 커밋·푸시한다.

마지막에 최종 이미지 경로, 사용한 파라미터, 남은 문제(참고 이미지와 다른 점)를 표로 보고해 줘.
```
