# Isometric RPG (클론 전쟁) — 프로젝트 규칙

## 그래픽

- **모든 그래픽 작업은 `ART_GUIDE.md`를 따를 것.** 모델링·렌더·스프라이트·맵·이펙트·UI·후처리 모두 —
  카메라 각도, 픽셀 크기(캐릭터 키 ≈ 50~57 px), 광원 방향, 행성별 팔레트, 외곽선(없음), 그림자 농도, 렌더 설정이
  거기 있다. 값을 바꾸면 `ART_GUIDE.md`와 해당 코드·설정을 함께 고친다.

## 렌더링 (Blender 스프라이트 파이프라인, `tools/sprites/`)

- **렌더는 항상 `render_config.json` 설정을 따른다.** 모든 렌더 스크립트(`render_sprites.py`,
  `render_characters.py`, `render_anakin.py`, `render_city.py`, `render_building.py`)가 렌더 엔진·샘플 수·해상도·
  패스 목록·방향 수·병렬 작업 수·예상 시간 기준을 이 파일에서 읽는다. 설정은 명령줄 옵션이 아니라 이 파일에서 바꾼다.
- **렌더 전에 총 장수와 예상 시간을 먼저 계산해서 보여준다.** 스크립트가 `ESTIMATE …` 줄을 출력한다
  (`tools/sprites/out/render_times.json`에 쌓인 실측 프레임당 시간 기준; `--estimate`는 계산만 하고 렌더하지 않는다). **30분(`estimate.ask_minutes`)이 넘으면
  진행 전에 사용자에게 묻는다** — 스크립트는 `ASK:`를 출력하고 멈추며, 사용자가 동의한 뒤에만 `--yes`로 다시 실행한다.
- **새 기능을 테스트할 땐 전체 렌더 말고 미리보기 모드로 먼저 확인한다:** `--preview` = 방향 1개(카메라를 보는 방향),
  애니메이션마다 프레임 2장, 결과는 `tools/sprites/out/preview`.
- **변경된 에셋만 다시 렌더한다.** 시트 JSON마다 `source` 해시(모델·헤어·타이밍·설정·`render_cfg.PIPELINE_VERSION`)가 들어 있고,
  렌더 결과가 바뀌는 스크립트 수정을 하면 `PIPELINE_VERSION`을 올린다.
  같으면 건너뛴다(`--force` 강제, `--check` 확인만, `--adopt` 기존 시트를 현재 입력의 결과로 인정).
- **레이어는 반드시 한 번 렌더에 패스로 같이 뽑는다.** 색상·그림자(그리고 `character.passes`에 넣으면 노멀·깊이)는
  같은 렌더의 패스다(Cycles 섀도 캐처 패스, 컴포지터 File Output). 레이어마다 렌더를 따로 돌리지 않는다.
  한 프레임의 모든 방향도 타일 한 장으로 렌더한다(방향마다 모델 사본 하나) — 방향마다 렌더를 따로 하지 않는다.
- 캐릭터는 최종 크기의 `render_scale`배(128px 스프라이트면 256px)로 렌더한 뒤 축소한다. 좌우 반전은
  스프라이트별로 켠다(`character.mirror_sprites`) — 광선검 든 손이 바뀌기 때문.
