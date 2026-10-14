# 무스타파 세트 — 레고 모형(`reference/mustafar_set/lego`)과 더 똑같이 만드는 데 필요한 스프라이트, ChatGPT 이미지 프롬프트

생성된 그림은 지금까지의 컷아웃 렌더(`reference/color_rots`)처럼 `tools/sprites/mustafar_set/bake.py`에서 게임 투영에
최소제곱으로 맞춰 굽는다(ART_GUIDE.md: 1 m = 축 따라 20 px, 위로 24.5 px, 몸체 ×0.78 어둡게, 발광부는 네온 레이어).
그래서 그림마다 **실제 길이·높이와 1 m 기준 큐브**가 들어 있어야 한다. 한 방향(아래 "along x")만 받으면 반대 방향은 로더가 뒤집는다.

## 공통 머리말 (모든 프롬프트 앞에 붙인다)

```
Cut-out render of a Star Wars Episode III Mustafar mining-facility set piece for an isometric 2D game.
Camera: orthographic, 30° elevation, 45° azimuth — the piece's long axis runs from the upper-left to the
lower-right of the image at exactly a 2:1 slope (two pixels across for one down), the camera looks at its front
face. Key light from the upper-left of the frame, soft fill, no rim light, no outlines. Flat uniform bright
magenta background (#FF00FF), nothing else in the scene: no floor, no ground shadow, no characters, no text.
Materials: dark obsidian-black metal (#1b1614) and ash-grey steel (#3c3c42), low saturation, worn and sooty, as the
film's set; only lamps, screens and lava windows glow (lava orange #ff6a1a, lamp amber #ffc24a). Crisp, photoreal,
film-set quality. Put a plain 1 m × 1 m × 1 m grey reference cube at the bottom-left of the frame, separate from the
piece. Square image, 2048 × 2048.
```

이 머리말 뒤에 아래 항목의 본문을 붙인다. 스타일을 더 맞추려면 기존 렌더 한 장(예: `reference/color_rots/image_5.png` 덮개 복도)을
같이 첨부하고 "match this render's style, camera and materials"를 덧붙인다.

## 항목 (우선순위 순)

### 1. 팔각 용암 창 벽 마디 (제어실·회의실의 먼 벽, 안에서 본 것) — `mfLavaWin`
```
One bay of the room's wall seen from inside, 6 m long and 3.4 m tall, built along the 2:1 axis with its face toward
the camera. In its middle an octagonal window 2.6 m wide and 2 m tall, its sill 1 m up, framed by a thick dark bevel;
through it the lava outside glows orange with vertical streaks. Below the sill a console strip the full length of
the bay: small gauges and red/green readout panels, a row of amber lamps along its bottom edge. The wall is dark
ribbed metal with a buttressed pillar at each end (sloped base, bolt studs). As the LEGO model: photos
reference/mustafar_set/lego/image_5.jpg and image_13.jpg.
```

### 2. 사다리꼴 문틀 (방 사이, 먼 벽에 난 문) — `mfDoorFrame`
```
A doorway in the room's far wall seen from inside: a tall trapezoid portal 2.6 m wide at the floor narrowing to
2 m at the top, 3.2 m tall, with heavy stepped dark-metal jambs and a lintel, bolt studs down the jambs; the wall
either side of it 1 m to each pillar (4.6 m piece in all, 3.4 m tall, along the 2:1 axis, face to the camera). The
opening is empty (transparent magenta through it). As the LEGO model's door frames: image_11.jpg, image_14.jpg.
```

### 3. 복도 한 마디 (안쪽, 지붕 없음) — `mfCorridorIn`
```
One 4 m module of the entry corridor seen from above and in front, no roof, tileable end to end along the 2:1
axis. The far wall 3.4 m tall: two sloped buttress pillars with rows of bolt studs, dark ribbed panels between them,
one amber lamp slit per panel. The near wall only 0.9 m tall (the same dark metal, so the inside stays visible).
The floor 4 m wide: polished dark-grey tiles with two pale light strips running the length of the module 1.2 m
apart. Make the two ends cut flat so copies join seamlessly. As the LEGO model: image_2.jpg.
```

### 4. 주랑 발코니 한 마디 — `mfColonnade`
```
One 4 m module of the exterior colonnaded balcony seen from outside (from the lava), tileable along the 2:1 axis.
A slim square column 3.2 m tall at one end with a bracket lamp on it 2.2 m up (amber glow); a horizontal metal rail
at 1 m, a lower rail at 0.5 m, between the columns; the grated dark deck 4 m deep behind the rail; the back wall a
dark ribbed facade 3.2 m tall; a flat black roof slab over it with a white lamp block on its front edge. As the
LEGO model: image_8.jpg and image_10.jpg.
```

### 5. 시설 정문 게이트 — `mfGate`
```
The facility's main gate seen from outside, facing the camera, 6 m wide and 4 m tall, 3 m deep: a massive dark
trapezoid portal (3 m wide at the floor, 2.4 m at the top, 3.4 m tall) in a sloped bolted-steel face with rows of
large bolt studs, an amber lamp over the opening; the opening dark with faint warm light inside; the roof a flat
black slab. As the LEGO model: image.jpg, image_9.jpg.
```

### 6. 위험 표시 상자 둘 — `cgHazard`
```
Two separate props side by side with space between them: (a) a low crate 1.4 m × 1 m × 0.8 m, dark grey, with
black-and-pale-grey diagonal hazard stripes on its top and a ventilation grille on its front; (b) a landing-pad
lamp block 0.6 m wide, 0.5 m tall: a pale grey rounded housing with an amber light panel on its front, glowing.
Both on the 2:1 axis, faces to the camera. As the LEGO model: image.jpg, image_17.jpg.
```

### 7. 착륙장 가장자리 — `mfPadEdge`
```
The landing platform's edge seen from outside, one 6 m straight run along the 2:1 axis, tileable: the deck's top
surface a strip of large dark-grey plates 1 m wide, then the edge drops 0.6 m in a sawtooth of stepped wedges
(each step 0.5 m wide), the face below dark obsidian. As the LEGO model's platform edge: image.jpg (the front
edge), image_17.jpg.
```

### 8. 회의실 의자, 뒤에서 본 것 — `mfChairBack`
```
The Separatist conference room's high-backed chair, 1.5 m tall, 0.6 m wide, seen from behind and to the left
(the camera sees its back and its left side), on the 2:1 axis: a dark angular shell with a tall tapering back and
a rounded seat, ash-grey metal. As the film's chair (and the LEGO model's: image_7.jpg).
```

### 9. 반사 바닥 타일 (텍스처, 위에서 똑바로) — `floor_gloss`
```
Top-down seamless texture, orthographic straight down, 2048 × 2048, covering 4 m × 4 m: the facility's polished
dark-grey floor tiles 1 m square with thin dark joints, a faint glossy sheen and smudges, two parallel pale light
strips 0.15 m wide running the full length 1.2 m apart. Flat lighting, no vignette, no background: the texture
fills the image edge to edge and tiles seamlessly. As the LEGO model's corridor floor: image_2.jpg.
```

### 10. 홀로 테이블(레고식, 보조) — `mfHoloLego`
```
A low hexagonal holo-table 2.4 m long, 1.2 m wide, 0.5 m tall on the 2:1 axis: a grey metal rim, its top a glowing
cyan translucent map with small raised crystal blocks, a dark plinth. No background scene. As the LEGO model:
image_16.jpg.
```

## 받은 뒤 할 일

1. 파일을 `reference/color_rots/`에 `lego_<이름>.png`로 넣는다(마젠타 배경은 베이커가 떼어 낸다 — `bake.py`에 `key='magenta'`를 추가해 처리).
2. 기준 큐브로 축척을 재고 `bake.py` `PIECES`에 `corners`(잰 꼭짓점 → 게임 좌표)를 적어 굽는다. 지붕이 있는 것(게이트·주랑)은 `roof`로.
3. `tools/maps/mustafar_build.py`에서 지금의 대체 조각(`mfTall`·`mfRail`·`mfPillar`·`mfCorridor`)을 새 조각으로 바꾼다.
