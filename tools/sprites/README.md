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
# 3) 8방향 렌더 → 시트 + 그림자 시트 + JSON (게임이 읽는 곳: public/sprites)
.bvenv/bin/python tools/sprites/render_sprites.py tools/sprites/out/anakin.glb public/sprites --meta tools/sprites/anakin_anims.json
```

`build_anakin.py`: 처음부터 다시 만든 모델. 게임 리그의 관절마다 본이 하나씩 있는 아마추어에 옷 전체를 부드러운 가중치로 스키닝해서
팔꿈치·무릎·허리가 틈 없이 굽고, 타바드와 튜닉 자락은 다리를 따라간다 (가슴판·견갑·벨트·손·머리는 본 하나에 고정).
본의 기본 방향이 전부 단위 회전이라 게임의 관절 변환이 그대로 포즈 본에 들어간다.

`render_sprites.py`: 직교 카메라 30°(게임과 같은 2:1 투영, 1유닛 = 28.28px), 왼쪽 위 키라이트(그림자) + 뒤쪽 림라이트 + 어두운 하늘 앰비언트 + 앰비언트 오클루전,
투명 배경 512px 렌더 → Lanczos로 128px 축소, 그림자는 별도 패스(섀도 캐처)로 따로 저장.
JSON에는 프레임마다 시트 좌표, 발 기준점, 광선검 마커(손잡이·끝)와 몸에 가려지지 않는 칼날 구간, 그림자의 시트 좌표가 들어갑니다.
옵션은 스크립트 맨 위 설명 참고 (`--anims`, `--frames`, `--only-dirs`로 미리보기). CPU 4코어에서 전체(18개 애니메이션 × 8방향)는 1시간 남짓.

게임: `src/gfx/sheet.js`가 `SHEETS`에 적힌 시트를 읽어 굽는 대신 쓰고(방향 = 유닛의 바라보는 각도, 프레임 = 애니메이션 시간),
렌더러는 그 프레임의 그림자 이미지를 바닥에, 광선검 칼날은 마커로 직접 그립니다.

모델 검토용: `model_views.py`(정면·측면·후면·3/4, 애니메이션 한 프레임), `preview.py`(한 프레임의 모든 방향).

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

검토 페이지: `npm run dev` 후 `/sprite-demo.html` (WASD/클릭 이동, F: 충돌 다각형).
