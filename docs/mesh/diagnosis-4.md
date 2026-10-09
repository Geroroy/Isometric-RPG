# 메쉬 진단: stage4.glb (idleOff 0프레임 자세)

파트 242개, 면 75848개.

## 1. 분리된 조각 (한 오브젝트 안의 떨어진 덩어리)

- `lameL0`: 2조각

## 2. 뒤집힌 노멀

- 없음

## 3. 두께 없는 면 (열린 껍데기 · 넓이 0인 면)

- `belt`: 열린 가장자리 64개
- `beltEdge0.09`: 열린 가장자리 64개
- `beltEdge0.035`: 열린 가장자리 64개
- `hips`: 열린 가장자리 48개
- `collar`: 열린 가장자리 48개
- `collarFold`: 열린 가장자리 48개
- `tunicWaist`: 열린 가장자리 48개
- `cuffSeamL`: 열린 가장자리 44개
- `cuffSeamR`: 열린 가장자리 44개
- `strapL0`: 열린 가장자리 40개
- `strapL1`: 열린 가장자리 40개
- `strapL2`: 열린 가장자리 40개
- `strapR0`: 열린 가장자리 40개
- `strapR1`: 열린 가장자리 40개
- `strapR2`: 열린 가장자리 40개
- `ankleL`: 열린 가장자리 36개
- `thighL`: 열린 가장자리 36개
- `ankleR`: 열린 가장자리 36개
- `thighR`: 열린 가장자리 36개
- `gauntletL`: 열린 가장자리 36개
- `ribL0`: 열린 가장자리 36개
- `ribL1`: 열린 가장자리 36개
- `ribL2`: 열린 가장자리 36개
- `ribL3`: 열린 가장자리 36개
- `gauntletR`: 열린 가장자리 36개
- `ribR0`: 열린 가장자리 36개
- `ribR1`: 열린 가장자리 36개
- `ribR2`: 열린 가장자리 36개
- `ribR3`: 열린 가장자리 36개
- `belt_grip`: 열린 가장자리 28개
- `belt_neck`: 열린 가장자리 28개
- `neck.001`: 열린 가장자리 28개
- `tunicChest`: 열린 가장자리 24개
- `bootL`: 열린 가장자리 20개
- `bootR`: 열린 가장자리 20개
- `footL`: 열린 가장자리 18개
- `footR`: 열린 가장자리 18개
- `sleeveL`: 열린 가장자리 16개
- `sleeveR`: 열린 가장자리 16개
- `belt_pommel`: 열린 가장자리 14개
- `belt_shroud`: 열린 가장자리 14개
- `pauldronEdge`: 열린 가장자리 0개, 넓이 0인 면 2개

## 3b. 중복 버텍스 (같은 자리에 겹친 점)

- `plastron`: 21개
- `deltoidL`: 10개
- `deltoidR`: 10개
- `thumbR`: 1개

## 4. 서로 관통하는 부품 (1761쌍 — 같은 종류끼리 묶음, 전체 목록은 JSON)

| 부품 종류 A | 부품 종류 B | 쌍 | 교차 삼각형 | 예 |
| --- | --- | --- | --- | --- |
| `lock` | `lock` | 1327 | 135455 | lock0, lock1, lock10, lock100 |
| `hairShell` | `lock` | 110 | 42426 | hairShell, lock0, lock1, lock10 |
| `head.` | `lock` | 110 | 8703 | head.001, lock0, lock1, lock10 |
| `tabardChest` | `tabardWaist` | 1 | 782 | tabardChest, tabardWaist |
| `neckRim` | `plastron` | 1 | 761 | neckRim, plastron |
| `crest` | `pauldron` | 4 | 698 | crest0, crest1, crest2, crest3 |
| `skirtinner` | `skirtouter` | 2 | 651 | skirtinnerL, skirtinnerR, skirtouterL, skirtouterR |
| `plastron` | `plastronRim` | 1 | 599 | plastron, plastronRim |
| `bootCuff` | `skirtouter` | 2 | 586 | bootCuffL, bootCuffR, skirtouterL, skirtouterR |
| `tabardChest` | `tunicChest` | 1 | 550 | tabardChest, tunicChest |
| `sleeve` | `tabardChest` | 2 | 366 | sleeveL, sleeveR, tabardChest |
| `hemouter` | `skirtouter` | 2 | 366 | hemouterL, hemouterR, skirtouterL, skirtouterR |
| `finger` | `palm` | 8 | 320 | fingerL0, fingerL1, fingerL2, fingerL3 |
| `skirtouter` | `skirtouterB` | 2 | 297 | skirtouterB, skirtouterL, skirtouterR |
| `cuffRim` | `gauntlet` | 2 | 280 | cuffRimL, cuffRimR, gauntletL, gauntletR |
| `strap` | `strapEnd` | 6 | 243 | strapEndL0, strapEndL1, strapEndL2, strapEndR0 |
| `buckle` | `strap` | 6 | 240 | buckleL0, buckleL1, buckleL2, buckleR0 |
| `bootCuff` | `cuffSeam` | 2 | 228 | bootCuffL, bootCuffR, cuffSeamL, cuffSeamR |
| `lame` | `sleeve` | 4 | 224 | lameL0, lameL2, lameR1, lameR2 |
| `pouch` | `skirtouter` | 4 | 220 | pouch0, pouch1, pouch2, pouch3 |
| `cuffRim` | `tabardChest` | 2 | 212 | cuffRimL, cuffRimR, tabardChest |
| `hips` | `tabardWaist` | 1 | 211 | hips, tabardWaist |
| `boot` | `buckle` | 6 | 208 | bootL, bootR, buckleL0, buckleL1 |
| `skirtouter` | `thigh` | 2 | 199 | skirtouterL, skirtouterR, thighL, thighR |
| `flap` | `pouch` | 4 | 199 | flap0, flap1, flap2, flap3 |
| `deltoid` | `lame` | 4 | 197 | deltoidL, deltoidR, lameL0, lameL2 |
| `finger` | `finger` | 6 | 196 | fingerL0, fingerL1, fingerL2, fingerL3 |
| `hemouterB` | `skirtouterB` | 1 | 183 | hemouterB, skirtouterB |
| `crest` | `crest` | 2 | 179 | crest1, crest2, crest3 |
| `sleeve` | `tunicChest` | 2 | 156 | sleeveL, sleeveR, tunicChest |
| `tabardEdge` | `tabardWaist` | 2 | 148 | tabardEdge-1, tabardEdge1, tabardWaist |
| `plastron` | `sleeve` | 2 | 140 | plastron, sleeveL, sleeveR |
| `lame` | `plastron` | 4 | 137 | lameL0, lameL1, lameR0, lameR1 |
| `belt` | `skirtinner` | 2 | 132 | belt, skirtinnerL, skirtinnerR |
| `belt` | `flap` | 4 | 132 | belt, flap0, flap1, flap2 |
| `beltEdge.` | `skirtouter` | 2 | 129 | beltEdge0.035, skirtouterL, skirtouterR |
| `buckle` | `skirtouter` | 3 | 122 | buckle, buckleL0, buckleR0, skirtouterL |
| `belt_shroud` | `skirtinner` | 1 | 121 | belt_shroud, skirtinnerL |
| `belt` | `skirtouter` | 2 | 117 | belt, skirtouterL, skirtouterR |
| `belt` | `pouch` | 4 | 110 | belt, pouch0, pouch1, pouch2 |
| `head.` | `jaw` | 1 | 100 | head.001, jaw |
| `hips` | `thigh` | 2 | 100 | hips, thighL, thighR |
| `head.` | `neck.` | 1 | 98 | head.001, neck.001 |
| `pouch` | `tabardWaist` | 2 | 98 | pouch0, pouch2, tabardWaist |
| `finger` | `thumb` | 4 | 98 | fingerL2, fingerL3, fingerR0, fingerR1 |
| `ear` | `head.` | 2 | 94 | ear-1, ear1, head.001 |
| `buckle` | `skirtinner` | 1 | 93 | buckle, skirtinnerL |
| `ankle` | `foot` | 2 | 92 | ankleL, ankleR, footL, footR |
| `tunicChest` | `tunicWaist` | 1 | 90 | tunicChest, tunicWaist |
| `clip` | `skirtinner` | 1 | 78 | clip, skirtinnerR |
| `flap` | `tabardWaist` | 2 | 78 | flap0, flap2, tabardWaist |
| `foot` | `sole` | 2 | 76 | footL, footR, soleL, soleR |
| `beltEdge.` | `skirtinner` | 2 | 75 | beltEdge0.035, skirtinnerL, skirtinnerR |
| `plastronRim` | `sleeve` | 2 | 74 | plastronRim, sleeveL, sleeveR |
| `belt_shroud` | `skirtouter` | 1 | 72 | belt_shroud, skirtouterL |
| `bootCuff` | `skirtouterB` | 1 | 72 | bootCuffR, skirtouterB |
| `heel` | `sole` | 2 | 72 | heelL, heelR, soleL, soleR |
| `eye` | `head.` | 2 | 66 | eye-1, eye1, head.001 |
| `flap` | `skirtouter` | 3 | 66 | flap0, flap1, flap2, skirtouterL |
| `beltEdge.` | `pouch` | 4 | 66 | beltEdge0.035, pouch0, pouch1, pouch2 |
| `pouch` | `skirtouterB` | 1 | 62 | pouch3, skirtouterB |
| `buckleIn` | `skirtouter` | 1 | 60 | buckleIn, skirtouterL |
| `brow` | `head.` | 2 | 58 | brow-1, brow1, head.001 |
| `collar` | `tunicChest` | 1 | 54 | collar, tunicChest |
| `buckle` | `hemouter` | 2 | 54 | buckleL0, buckleR0, hemouterL, hemouterR |
| `collar` | `head.` | 1 | 53 | collar, head.001 |
| `cuffSeam` | `skirtouter` | 2 | 52 | cuffSeamL, cuffSeamR, skirtouterL, skirtouterR |
| `chin` | `jaw` | 1 | 51 | chin, jaw |
| `collar` | `jaw` | 1 | 48 | collar, jaw |
| `cuffRim` | `tabardWaist` | 2 | 48 | cuffRimL, cuffRimR, tabardWaist |
| `beltEdge.` | `clip` | 2 | 48 | beltEdge0.035, beltEdge0.09, clip |
| `buckle` | `strapEnd` | 2 | 48 | buckleL2, buckleR2, strapEndL2, strapEndR2 |
| `belt_switch` | `skirtouter` | 1 | 44 | belt_switch, skirtouterL |
| `belt` | `clip` | 1 | 42 | belt, clip |
| `gauntlet` | `tabardChest` | 2 | 42 | gauntletL, gauntletR, tabardChest |
| `belt_switch` | `skirtinner` | 1 | 41 | belt_switch, skirtinnerL |
| `jaw` | `neck.` | 1 | 41 | jaw, neck.001 |
| `buckleIn` | `skirtinner` | 1 | 40 | buckleIn, skirtinnerL |
| `belt` | `buckle` | 1 | 39 | belt, buckle |
| `belt_neck` | `belt_switch` | 1 | 38 | belt_neck, belt_switch |
| `belt_neck` | `skirtouter` | 1 | 38 | belt_neck, skirtouterL |
| `clip` | `skirtouter` | 1 | 37 | clip, skirtouterR |
| `beltClip` | `belt_pommel` | 1 | 36 | beltClip, belt_pommel |
| `chin` | `head.` | 1 | 36 | chin, head.001 |
| `deltoid` | `sleeve` | 2 | 34 | deltoidL, deltoidR, sleeveL, sleeveR |
| `belt` | `clipU` | 1 | 32 | belt, clipU |
| `collarFold` | `head.` | 1 | 32 | collarFold, head.001 |
| `lame` | `lame` | 4 | 32 | lameL0, lameL1, lameL2, lameR0 |
| `belt` | `buckleIn` | 1 | 29 | belt, buckleIn |
| `neck.` | `tunicChest` | 1 | 28 | neck.001, tunicChest |
| `hips` | `pouch` | 2 | 28 | hips, pouch0, pouch2 |
| `skirtouter` | `strap` | 2 | 27 | skirtouterL, skirtouterR, strapL0, strapR0 |
| `buckle` | `buckleIn` | 1 | 26 | buckle, buckleIn |
| `clip` | `clipU` | 1 | 26 | clip, clipU |
| `palm` | `thumb` | 2 | 26 | palmL, palmR, thumbL, thumbR |
| `beltEdge.` | `buckle` | 2 | 25 | beltEdge0.035, beltEdge0.09, buckle |
| `collarFold` | `jaw` | 1 | 22 | collarFold, jaw |
| `belt_grip` | `skirtouter` | 1 | 21 | belt_grip, skirtouterL |
| `skirtouter` | `strapEnd` | 1 | 20 | skirtouterR, strapEndR0 |
| `cuffSeam` | `skirtouterB` | 1 | 19 | cuffSeamR, skirtouterB |
| `ear` | `lock` | 1 | 19 | ear-1, lock108 |
| `head.` | `nose` | 1 | 16 | head.001, nose |
| `tabardChest` | `tabardEdge` | 1 | 16 | tabardChest, tabardEdge-1 |
| `lame` | `tunicChest` | 2 | 16 | lameL0, lameL1, tunicChest |
| `boot` | `strapEnd` | 1 | 15 | bootL, strapEndL0 |
| `plastron` | `tabardChest` | 1 | 15 | plastron, tabardChest |
| `belt_neck` | `skirtinner` | 1 | 13 | belt_neck, skirtinnerL |
| `chin` | `collarFold` | 1 | 12 | chin, collarFold |
| `plastron` | `tunicChest` | 1 | 12 | plastron, tunicChest |
| `plastronRim` | `tabardChest` | 1 | 10 | plastronRim, tabardChest |
| `flap` | `hips` | 2 | 9 | flap0, flap2, hips |
| `hemouter` | `strap` | 1 | 6 | hemouterL, strapL0 |
| `tabardEdge` | `tunicChest` | 1 | 6 | tabardEdge-1, tunicChest |
