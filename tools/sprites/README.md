# Blender 스프라이트 파이프라인

3D 모델(.glb)을 게임의 아이소메트릭 시점으로 Blender(Cycles)에서 렌더링해 스프라이트 시트 + JSON으로 만듭니다.
Blender 앱(`blender -b -P 스크립트 -- 인자…`) 또는 pip의 `bpy` 모듈(`python 스크립트 인자…`) 둘 다 됩니다.

```bash
python3 -m venv .bvenv && .bvenv/bin/pip install bpy pillow numpy   # 처음 한 번 (Python 3.13: bpy 5.x)
```

## 캐릭터 (시범: 아나킨)

```bash
# 1) 게임의 리그·포즈 코드에서 애니메이션을 그대로 뽑는다 (관절 변환, 프레임 단위)
node tools/sprites/export_rig_anims.mjs anakin > tools/sprites/anakin_anims.json
# 2) 디테일 모델을 만들어 애니메이션과 함께 .glb로 (레퍼런스: 핫토이 클론 전쟁 아나킨)
.bvenv/bin/python tools/sprites/build_anakin.py tools/sprites/anakin_anims.json tools/sprites/out/anakin.glb
# 3) 8방향 렌더 → 시트 + JSON (128: 오리지널, 256: 리마스터)
.bvenv/bin/python tools/sprites/render_sprites.py tools/sprites/out/anakin.glb public/sprites --sizes 128,256
```

`render_sprites.py`: 직교 카메라 30°(게임과 같은 2:1 투영, 1유닛 = 28.28px), 왼쪽 위 키라이트(그림자) + 뒤쪽 림라이트 + 어두운 하늘 앰비언트 + 앰비언트 오클루전,
투명 배경 512px 렌더 → Lanczos로 128/256px 축소, 그림자는 별도 패스(섀도 캐처)로 따로 저장.
JSON에는 프레임마다 시트 좌표, 발 기준점, 광선검 마커(손잡이·끝)와 몸에 가려지지 않는 칼날 구간이 들어갑니다.
옵션은 스크립트 맨 위 설명 참고 (`--anims`, `--frames`, `--only-dirs`로 미리보기).

모델 검토용: `model_views.py`(정면·측면·후면·3/4 정지 자세), `preview.py`(한 프레임의 모든 방향).

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
