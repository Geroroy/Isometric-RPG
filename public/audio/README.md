# 사운드 뱅크 (선택 사항)

이 폴더에 `index.json`을 만들면 게임이 시작될 때 읽어서,
**효과음은 합성음 대신**, **대사는 자막과 함께 음성으로** 재생합니다.
`index.json`이 없으면 모든 소리는 절차적으로 합성됩니다(기본값).

> 저작권이 있는 영화 음원·배우 음성은 저장소에 포함하지 마세요.
> 직접 녹음했거나 사용 권한(라이선스)이 있는 파일만 넣으세요.

## 형식

`index.example.json`을 `index.json`으로 복사한 뒤 파일 경로를 채우세요.
경로는 이 폴더 기준입니다. 브라우저가 재생할 수 있는 형식(ogg, mp3, wav, m4a)이면 됩니다.

```json
{
  "volume": { "sfx": 1.0, "voice": 1.1 },
  "sfx": {
    "hum": "sfx/saber_hum.ogg",
    "swing": ["sfx/swing1.ogg", "sfx/swing2.ogg"],
    "ignite": "sfx/ignite.ogg"
  },
  "voice": {
    "intro": [{ "file": "voice/intro.ogg", "text": "자막으로 보여줄 문장" }],
    "levelup": ["voice/levelup1.ogg", "voice/levelup2.ogg"]
  }
}
```

- `sfx` 항목 하나에 파일 하나 또는 여러 개(무작위 선택).
  - `hum`은 반복 재생되는 광선검 험 루프입니다. 지정하면 합성 험 대신 쓰이고, 휘두를 때 재생 속도(도플러)가 변합니다.
- `voice` 항목은 파일 경로 또는 `{ "file", "text" }`. `text`가 있으면 그 문장이 자막으로 표시되고,
  없으면 게임의 기본 대사 중 하나가 표시됩니다. 음성이 나오는 동안 효과음은 자동으로 작아집니다.

## 효과음 이름

`hum` `swing` `hit` `clash`(볼트 반사) `ignite` `slam` `push` `repulse` `leap` `speed` `choke`
`zap` `blasterCis` `blasterRep` `explode` `droidDie` `r2` `summon` `gunship` `pickup` `levelup` `deny` `click`

## 대사 키 (언제 나오는지)

| 키 | 상황 |
| --- | --- |
| `intro` | 게임 시작 |
| `poke` / `pokeAnnoyed` | 초상화 클릭 / 계속 클릭 |
| `levelup` | 레벨 업 |
| `lowHp` | 생명력 25% 이하 |
| `death` / `respawn` | 사망 / 부활 |
| `campClear` | 드로이드 거점 소탕 |
| `holocron` | 홀로크론 획득 |
| `fury` | 선택받은 자의 분노 사용 |
| `dark` | 어둠 게이지 60 돌파 |
| `noForce` | 포스 부족 |
| `clones` / `maxClones` / `rex` / `gunship` | 클론 호출 / 최대 인원 / 렉스 호출 / LAAT 공습 |
| `streak` | 4초 안에 4기 연속 처치 |
| `elite` | 정예 드로이드가 아나킨을 발견 |
| `deflect` | 볼트를 여러 번 튕겨냈을 때 |
| `regionBase` `regionCrystal` `regionRuins` `regionBattle` `regionFactory` | 해당 지역 진입 |
| `idle` | 한동안 전투가 없을 때 |

주변 대사(`streak` ~ `idle`)는 너무 자주 나오지 않도록 확률과 쿨다운(7초)이 적용됩니다.
