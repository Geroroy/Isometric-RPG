# UI 디자인 시스템 — "클론 바이저" HUD

프리퀄(클론 전쟁·공화국·제다이 기사단) 시대의 유선형 크롬과 전술 홀로그램. 명작들에서 빌려온 요소:
Republic Commando(바이저 프레임·게이지), Hades(대각선 슬림 액션 덱), XCOM·Galactic Battlegrounds(원형 스캐너·홀로 포트레이트).

## 파일

| 파일 | 역할 |
|---|---|
| `src/ui/theme.css` | **디자인 토큰**(`--c-*`)과 모든 컴포넌트 스타일. `style.css` 다음에 읽혀 기존 레이아웃을 덧입힌다. 예전 토큰(`--ink`, `--gold`, `--red`…)도 여기서 새 팔레트로 재매핑하므로 전체 메뉴가 따라온다. |
| `src/ui/theme.js` | 캔버스가 쓰는 같은 토큰(`THEME`, 스타일시트에서 읽음), `rgba()`, `setFraction()`(쿨다운·경험치 같은 비율을 CSS 변수로). |
| `src/ui/hud.js` | PC 콘솔의 DOM(순서: 홀로 포트레이트 → LED 게이지 → 에테르 코어 + 액션 덱 → 키 → 통신 로그 → 메뉴 키 → 스캐너), 스캐너 그리기 `drawScanner()`. |
| `src/ui/mobileHud.js`, `src/ui/touch.js` | 휴대폰 플레이트·메뉴 키·액션 클러스터 (같은 토큰·컴포넌트). |
| `tools/qa/hudshot.mjs` | PC·휴대폰 HUD, 쿨다운·호버·팝업 스캔 캡처. |

## 색상 토큰

| 토큰 | 값 | 쓰임 |
|---|---|---|
| `--c-holo` | `#00C8FF` | 공화국 홀로 블루: 기본, 포스, 아군, 스캐너, 글로우 |
| `--c-emerald` | `#00FF87` | 제다이 에메랄드: 체력(실드) 게이지, 박타 |
| `--c-gold` | `#FFD700` | 나부 로열 골드: 경험치 링, 레벨, 강조, 단축키 |
| `--c-red` | `#FF0033` | 분리주의 레드: 적, 경고, 낮은 체력, 어둠 |
| `--c-base` | `#1E293B` | 카미노 다크 메탈: 패널 바탕 |
| `--c-chrome` | `#F1F5F9` | 카미노 화이트/크롬: 프레임 가장자리, 키 캡, 글자 |

표면: `--ui-plate`(크롬 하이라이트 → 다크 메탈 그라데이션), `--ui-glass`(반투명 홀로 유리), `--ui-scan`(정지 스캔라인 텍스처),
`--ui-grid`(홀로 와이어프레임 격자), `--ui-chrome-line`, `--ui-glow`. 글꼴: 라벨·숫자 `--font-tech`(Michroma), 본문 `--font-hud`(Pretendard).

## 컴포넌트

- **바이저 프레임** `.console` — 하단 HUD. 위쪽 큰 둥근 모서리(46/30 px)와 크롬 윗선, 양 끝의 `::before/::after` 크롬 뺨 곡선,
  안쪽 홀로 빛. 무거운 사각 외곽·보더 이미지 없음.
- **LED 게이지** `.gauge.hp` / `.gauge.fp` — 15 px 둥근 튜브, `::before`의 반복 그라데이션으로 9+2 px 세그먼트. 체력 에메랄드(낮으면 레드),
  포스 홀로 블루. 값은 기존 훅(`.g-fill` 너비, `#hpText`) 그대로.
- **에테르 코어** `.ether` — 레벨 숫자, 금색 경험치 링(`--xp`, conic-gradient), 포스에 따라 밝아지는 안쪽 빛(`--fp`). 두 값은 `setFraction()`으로.
- **액션 덱** `.abilities` — `skewX(-14deg)` 슬림 크롬 패널, 안의 `.ab-row`는 반대로 기울여 아이콘은 똑바로. 슬롯 `.ab` 48 px, 금색 단축키,
  홀로 레벨. **쿨다운**은 `.ab.cooling .cd`에 `--cd`(0 = 방금 씀, 1 = 준비됨): 아래쪽 덮개 + 가장자리의 흰·홀로 **스캔라인**이 위에서 아래로
  훑고, 덮개 안에는 가는 스캔라인 파티클. **호버**는 `::after` 스캔 스윕 한 번(`uiScan` 0.45 s) + 홀로 글로우.
- **키** `.fo-btn`, `.ab-menu button`, `.m-key` — 크롬 캡(위쪽 밝은 테두리), 6 px LED 램프(`> i`), 눌리면 홀로로 켜짐.
- **통신 로그** `.cn-log` — 홀로 유리, `▸` 글머리.
- **스캐너** `.cn-radar` / `.m-radar` + `hud.drawScanner(ctx, S, k, ms)` — 원형. 탐험한 지형(흐리게) 위에 **월드 좌표 아이소 격자**(4유닛,
  아나킨이 걸으면 밑에서 미끄러짐), 거리 링 2개, 회전 스윕과 앞선, 아군 홀로 블루 점·적 레드 점, 크롬 베젤과 눈금. CSS 필터 없음(팔레트 색으로 직접).
- **홀로그램 포트레이트** `.cn-portrait` / `.m-face` — 프로젝터 받침(아래 홀로 선과 빛), 캔버스는 홀로 블루 틴트 + `screen` 블렌드(반투명),
  `::before` 정지 스캔라인, `::after` 와이어프레임 격자. 사진 교체 기능은 그대로.
- **플레이트** `.objectives`, `.buff`, `.set-card`, `.st-detail`… — 크롬 윗선 + 홀로 테두리 + 유리.
- **팝업** `.overlay::after` — 열릴 때 스캔라인이 위에서 아래로 한 번 훑는다(`uiScan` 0.6 s). 탭·버튼 호버: 홀로 글로우.

## 반응형

PC 콘솔은 flex 한 줄(로그가 `flex: 1`로 늘고 줄며, 170~340 px). 휴대폰(`body.touch`)은 같은 토큰으로 별도 레이아웃: 좌상단 바이저 뺨
플레이트(얼굴 홀로 + 세그먼트 바), 우상단 메뉴 키 + 스캐너, 우하단 대각선 호 모양 액션 클러스터(크롬 링, 홀로 LED 테두리, 같은 스캔라인 쿨다운).

## 성능 규칙

- 끝없는 CSS 애니메이션 금지(합성기가 매 프레임 다시 그린다, `tools/qa/perfsplit.mjs`). 스캔 스윕은 열릴 때·호버 때 한 번만.
- 항상 보이는 HUD에는 `backdrop-filter` 없음. 글로우는 `box-shadow`/그라데이션(정적).
- 쿨다운·경험치는 매 프레임 문자열을 만들지 않고 값이 바뀔 때만 CSS 변수를 쓴다(`setFraction`).

## 타이포그래피 (`src/ui/fonts.js`, `theme.css` 끝의 typography 절)

### 한글 폰트 시스템 (`<html lang="ko">`, 기본)

| 역할 | 토큰 | 글꼴 (모두 무료 라이선스) | 쓰임 · 스타일 |
|---|---|---|---|
| Display & Header | `--font-kr-display` | **GmarketSans** 700/500 → Orbitron | HUD 타이틀, 스킬 이름, 메뉴·팝업 제목, 키 라벨. 강한 기하학적 네모꼴, `letter-spacing: -0.02em`, 대문자 변환 없음, 홀로 글로우(`--glow-blue`) |
| Tactical Data | `--font-kr-data` | **D2Coding** → Chakra Petch (고정폭) | 체력·포스 수치, 쿨다운, 레벨, 스캐너 좌표·지역, 버프·칩, FPS. 자간 0, 숫자 흔들림 없음, 전술 LED 글로우 `--led-blue`(`0 0 5px rgba(0,200,255,.7)`) / 체력은 `--led-green` |
| Body & Dialogue | `--font-kr-body` | **Pretendard** 500/600 → SUIT | 본문, 아이템 설명, 퀘스트 로그, 대화창, 툴팁. `word-break: keep-all; overflow-wrap: break-word` |

- 파일: `public/fonts/`에 번들(GmarketSans Medium/Bold woff2, D2Coding woff2 — 한글·라틴·기호 서브셋 740 KB, SUIT Medium/SemiBold woff2);
  Pretendard는 npm(`ui/skin.js`)에서. `@font-face`는 `local()` → 번들 → CDN(jsDelivr의 noonnu / sun-typeface GitHub) 순서, `font-display: swap`.
  라이선스: GmarketSans 지마켓 산스 라이선스(무료·재배포 가능), D2Coding OFL, SUIT OFL, Pretendard OFL.
- 매핑 방식: `html[lang='ko']`에서 역할 토큰(`--font-display` `--font-data` `--font-body` `--font-body-ko`)이 한글 스택으로
  바뀌므로 아래 라틴 매핑의 모든 컴포넌트(쿨다운 `.ab .cdt`, 게이지 `.gauge b`, 스캐너 `.radar-region`, 툴팁 `.tooltip`, 로그…)가
  그대로 한글 글꼴을 받는다. 캔버스(`font(role)`)도 `lang`을 보고 같은 스택을 쓴다. 이름으로 직접 쓰는 클래스 `.t-kr-display`
  `.t-kr-data`(`.green`) `.t-kr-body`.
- 한글 디스플레이 보정: 제목·탭·키 라벨은 자간 −0.02em, 굵기 700, 대문자 변환 해제(`HP` `FORCE` 게이지 라벨만 0.04em).
  수치는 자간 0 + LED 글로우. 본문 계열과 `body` 전체에 `keep-all` 줄바꿈.

### 라틴 기준 스택 (`lang`이 ko가 아닐 때)

| 역할 | 토큰 | 글꼴 | 쓰임 · 스타일 |
|---|---|---|---|
| Display | `--font-display` | **Orbitron** 600/700 (대체 Bank Gothic, Michroma) | HUD 타이틀, 스킬 이름, 팝업 제목, 라벨. `letter-spacing .08em`, 대문자 |
| Data | `--font-data` | **Share Tech Mono** (2순위 Chakra Petch 500/600) | 체력·포스 수치, 쿨다운, 레벨, 스캐너 좌표, 버프·단축키. 고정폭 숫자 + 전술 글로우 |
| Body | `--font-body` | **Rajdhani** 500/600 (영문) → GmarketSans → Pretendard (한글) | 본문, 로그, 대화, 설명, 툴팁 |
| Body-KO | `--font-body-ko` | **GmarketSans** 500/700 → Pretendard → Rajdhani | 한글이 앞서는 곳(지역 배너 등) |
| Decorative | `--font-aurebesh` | Aurebesh (라이선스 파일을 `public/fonts/`에 넣고 `@font-face` 주석 해제) | `.aure-text`: opacity .22 장식. 그 전까지는 `ui/skin.js`가 그리는 오레베시풍 글리프 |

- Google Fonts 계열은 **번들**한다(`@fontsource/*`, Vite가 woff2를 묶음): 오프라인 PWA·비공개 페이지에서 `@import`는 네트워크가 없으면
  대체 글꼴로 남는다.
- `fontsReady()`를 첫 프레임 전에 기다린다(캔버스 글자는 그릴 때의 글꼴로 남으므로). 캔버스는 `canvasFont(weight, px, role)`로
  같은 스택을 쓴다(NPC 이름·대사 말풍선 = body, 임무 표시 `!` `?` = display, 피해 숫자·지도 지명 = data/body).
- 예전 역할 토큰은 재매핑: `--font-tech` → display, `--font-ui` → body-ko, `--font-hud` → body.
- 글로우 유틸리티: `.holo-text-blue`(#00C8FF), `.holo-text-green`(#00FF87), `.warning-text-red`(#FF0033), `.naboo-gold-text`(#FFD700),
  `.glow-text`, `.glow-text-strong`; 역할 클래스 `.t-display` `.t-data` `.t-body`. 토큰 `--glow-blue/green/red/gold`, `--led-blue/green`.
- 매핑: 체력 수치 = data + 초록 글로우(낮으면 흰 글자 + 빨간 글로우), 포스 = data + 파란 글로우, 쿨다운 = data 15 px + 파란 글로우,
  레벨·단축키·경험치 = data + 금 글로우, 게이지 라벨 `HP` `FORCE`·스캐너 지역명·메뉴 키 = display, 본문·로그·대화 = body.
