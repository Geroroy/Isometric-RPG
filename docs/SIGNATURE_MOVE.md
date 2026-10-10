# Signature Move ("Hayden Manoeuvre")

아나킨의 시그니처 스킬. 손목을 굴려 광선검을 등 뒤로 넘기고, 몸을 왼쪽으로 한 바퀴 돌리며 역수로 쥔 칼날을
앞으로 휘둘러 벤 뒤 가드로 돌아온다.

## 프레임 (18장, 20 fps = 0.9초, 16방향)

| 프레임 | 구간 | 동작 | 게임 |
|---|---|---|---|
| 0–3 | 가드 | 두 손 가드, 칼날 켜짐 | — |
| 4–8 | 와인드업 | 오른쪽에서 손목을 굴려 칼을 앞·아래 → 뒤 → 오른어깨 위로, 8에서 등 뒤로 늘어뜨림 | 4: 가벼운 스윙음, 8: 무거운 휘익 |
| 9–13 | 회전 역수 베기 | 오른발 축으로 왼쪽 360° 회전, 역수로 바꿔 쥔 칼이 등 뒤에서 튀어나와 허리 높이로 앞을 가로지름, 왼쪽으로 팔로우스루 | 8–10: 볼트 전부 반사, 9–13: 칼날 잔상, 9–12: 몸 잔상(모션 블러), **11: 타격**(앞쪽 반원 2.4 내 전부, 히트스톱 5프레임) |
| 14–17 | 회복 | 정수로 다시 쥐며 칼을 위로 돌려 가드 | — |

## 구현 위치

- 동작: `src/gfx/models/anakinAnims.js` `signature()` — 프레임 단위 키. 몸 회전은 `body` 관절의 요(yaw)로 넣어 16방향 시트에 그대로 구워진다.
  발은 땅 좌표로 키를 주고 몸 좌표로 돌려 다리 IK, 칼 손잡이는 몸 좌표, 칼 방향은 몸 기준 [yaw, pitch].
- 판정·반사·소리: `src/game/units.js` `SIG`, `spinning()`, `sigEvents()`, 근접 루틴의 `sweep`
- 잔상·모션 블러: `src/gfx/renderer.js` `drawSabers`(잔상 구간), `drawUnit`(이전 두 포즈를 옅게)
- 스킬: `src/game/skills.js` `signature` · 타격감: `src/game/hitfeel.js` `signature`
- 스프라이트: 다른 동작과 같은 Blender 파이프라인(`tools/sprites/render_anakin.py`, `render_characters.py`). 시트가 렌더되기 전에는
  `?qaBake=anakin:sig`(또는 빌드 시 `VITE_QA_BAKE`)로 그 동작만 브라우저에서 구워 시연한다.

## 참고: AI 이미지 생성 프롬프트

이 게임의 스프라이트는 `ART_GUIDE.md`대로 Blender에서 렌더하므로 쓰지 않는다. 다른 도구로 콘셉트 시트를 만들 때 참고용.

> Sprite sheet, 18 frames in one row, transparent background, isometric 2.5D game character seen from a 30° elevated
> three-quarter view, consistent scale and foot position in every frame. Anakin Skywalker in Clone Wars armour (navy tabard,
> crimson tunic, gunmetal chest plate) holding a glowing blue lightsaber. Frames 1–4: two-handed combat guard, blade raised
> over the right shoulder. Frames 5–9: one-handed wrist roll on his right side, the blade swung down, back, over the right
> shoulder and hanging down his back. Frames 10–14: he spins once to his left on the right foot, the hilt flipped to a reverse
> grip, the blade whipping out from behind him into a waist-high slash across the front, following through to the left.
> Frames 15–18: the hilt flipped back to a forward grip, blade twirled up, back to the guard. Stylised pre-rendered 3D,
> soft key light from the upper left, no outlines, no motion blur baked in, no text.
