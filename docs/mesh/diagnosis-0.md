# 메쉬 진단: anakin.glb (idleOff 0프레임 자세)

파트 242개, 면 80832개.

## 1. 분리된 조각 (한 오브젝트 안의 떨어진 덩어리)

- 없음

## 2. 뒤집힌 노멀

- 없음

## 3. 두께 없는 면 (열린 껍데기 · 넓이 0인 면)

- `plastronRim`: 열린 가장자리 72개
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
- `pauldron`: 열린 가장자리 18개
- `crest0`: 열린 가장자리 16개
- `crest1`: 열린 가장자리 16개
- `sleeveL`: 열린 가장자리 16개
- `sleeveR`: 열린 가장자리 16개
- `belt_pommel`: 열린 가장자리 14개
- `belt_shroud`: 열린 가장자리 14개
- `crest3`: 열린 가장자리 10개
- `lameL0`: 열린 가장자리 4개
- `lameL1`: 열린 가장자리 4개
- `lameL2`: 열린 가장자리 4개
- `lameR0`: 열린 가장자리 4개
- `lameR1`: 열린 가장자리 4개
- `lameR2`: 열린 가장자리 4개
- `pauldronEdge`: 열린 가장자리 0개, 넓이 0인 면 4개

## 3b. 중복 버텍스 (같은 자리에 겹친 점)

- `plastron`: 444개
- `deltoidL`: 10개
- `deltoidR`: 10개

## 4. 서로 관통하는 부품 (1786쌍 — 같은 종류끼리 묶음, 전체 목록은 JSON)

| 부품 종류 A | 부품 종류 B | 쌍 | 교차 삼각형 | 예 |
| --- | --- | --- | --- | --- |
| `lock` | `lock` | 1327 | 135453 | lock0, lock1, lock10, lock100 |
| `hairShell` | `lock` | 110 | 42426 | hairShell, lock0, lock1, lock10 |
| `head.` | `lock` | 110 | 8703 | head.001, lock0, lock1, lock10 |
| `lame` | `lame` | 6 | 1207 | lameL0, lameL1, lameL2, lameR0 |
| `tabardChest` | `tabardWaist` | 1 | 802 | tabardChest, tabardWaist |
| `plastron` | `tunicChest` | 1 | 720 | plastron, tunicChest |
| `deltoid` | `lame` | 6 | 697 | deltoidL, deltoidR, lameL0, lameL1 |
| `skirtinner` | `skirtouter` | 2 | 651 | skirtinnerL, skirtinnerR, skirtouterL, skirtouterR |
| `neckRim` | `plastron` | 1 | 608 | neckRim, plastron |
| `plastron` | `tabardChest` | 1 | 607 | plastron, tabardChest |
| `lame` | `sleeve` | 6 | 593 | lameL0, lameL1, lameL2, lameR0 |
| `bootCuff` | `skirtouter` | 2 | 586 | bootCuffL, bootCuffR, skirtouterL, skirtouterR |
| `crest` | `crest` | 3 | 578 | crest0, crest1, crest2, crest3 |
| `sleeve` | `tabardChest` | 2 | 570 | sleeveL, sleeveR, tabardChest |
| `tabardChest` | `tunicChest` | 1 | 550 | tabardChest, tunicChest |
| `lame` | `plastron` | 2 | 455 | lameL0, lameR0, plastron |
| `plastron` | `sleeve` | 2 | 454 | plastron, sleeveL, sleeveR |
| `hemouter` | `skirtouter` | 2 | 366 | hemouterL, hemouterR, skirtouterL, skirtouterR |
| `deltoid` | `plastron` | 2 | 346 | deltoidL, deltoidR, plastron |
| `finger` | `palm` | 8 | 320 | fingerL0, fingerL1, fingerL2, fingerL3 |
| `skirtouter` | `skirtouterB` | 2 | 297 | skirtouterB, skirtouterL, skirtouterR |
| `cuffRim` | `gauntlet` | 2 | 279 | cuffRimL, cuffRimR, gauntletL, gauntletR |
| `plastron` | `plastronRim` | 1 | 270 | plastron, plastronRim |
| `sleeve` | `tunicChest` | 2 | 266 | sleeveL, sleeveR, tunicChest |
| `buckle` | `strap` | 6 | 240 | buckleL0, buckleL1, buckleL2, buckleR0 |
| `strap` | `strapEnd` | 6 | 239 | strapEndL0, strapEndL1, strapEndL2, strapEndR0 |
| `bootCuff` | `cuffSeam` | 2 | 228 | bootCuffL, bootCuffR, cuffSeamL, cuffSeamR |
| `pouch` | `skirtouter` | 4 | 220 | pouch0, pouch1, pouch2, pouch3 |
| `cuffRim` | `tabardWaist` | 2 | 212 | cuffRimL, cuffRimR, tabardWaist |
| `cuffRim` | `tabardChest` | 2 | 208 | cuffRimL, cuffRimR, tabardChest |
| `boot` | `buckle` | 6 | 208 | bootL, bootR, buckleL0, buckleL1 |
| `skirtouter` | `thigh` | 2 | 199 | skirtouterL, skirtouterR, thighL, thighR |
| `flap` | `pouch` | 4 | 199 | flap0, flap1, flap2, flap3 |
| `finger` | `finger` | 6 | 191 | fingerL0, fingerL1, fingerL2, fingerL3 |
| `flap` | `tabardWaist` | 4 | 186 | flap0, flap1, flap2, flap3 |
| `hemouterB` | `skirtouterB` | 1 | 183 | hemouterB, skirtouterB |
| `deltoid` | `tabardChest` | 2 | 180 | deltoidL, deltoidR, tabardChest |
| `pouch` | `tabardWaist` | 4 | 172 | pouch0, pouch1, pouch2, pouch3 |
| `pauldron` | `pauldronEdge` | 1 | 166 | pauldron, pauldronEdge |
| `lame` | `pauldron` | 1 | 147 | lameL2, pauldron |
| `tabardEdge` | `tabardWaist` | 2 | 142 | tabardEdge-1, tabardEdge1, tabardWaist |
| `hips` | `tabardWaist` | 1 | 135 | hips, tabardWaist |
| `belt` | `skirtinner` | 2 | 132 | belt, skirtinnerL, skirtinnerR |
| `lame` | `tunicChest` | 2 | 132 | lameL0, lameR0, tunicChest |
| `belt` | `flap` | 4 | 132 | belt, flap0, flap1, flap2 |
| `beltEdge.` | `skirtouter` | 2 | 129 | beltEdge0.035, skirtouterL, skirtouterR |
| `buckle` | `skirtouter` | 3 | 122 | buckle, buckleL0, buckleR0, skirtouterL |
| `belt_shroud` | `skirtinner` | 1 | 121 | belt_shroud, skirtinnerL |
| `deltoid` | `tunicChest` | 2 | 120 | deltoidL, deltoidR, tunicChest |
| `belt` | `skirtouter` | 2 | 117 | belt, skirtouterL, skirtouterR |
| `cuffRim` | `tunicWaist` | 2 | 112 | cuffRimL, cuffRimR, tunicWaist |
| `belt` | `pouch` | 4 | 110 | belt, pouch0, pouch1, pouch2 |
| `gauntlet` | `tabardChest` | 2 | 106 | gauntletL, gauntletR, tabardChest |
| `head.` | `jaw` | 1 | 100 | head.001, jaw |
| `hips` | `thigh` | 2 | 100 | hips, thighL, thighR |
| `head.` | `neck.` | 1 | 98 | head.001, neck.001 |
| `finger` | `thumb` | 4 | 98 | fingerL2, fingerL3, fingerR0, fingerR1 |
| `tunicChest` | `tunicWaist` | 1 | 96 | tunicChest, tunicWaist |
| `ear` | `head.` | 2 | 94 | ear-1, ear1, head.001 |
| `buckle` | `skirtinner` | 1 | 93 | buckle, skirtinnerL |
| `ankle` | `foot` | 2 | 92 | ankleL, ankleR, footL, footR |
| `gauntlet` | `tabardWaist` | 2 | 87 | gauntletL, gauntletR, tabardWaist |
| `clip` | `skirtinner` | 1 | 78 | clip, skirtinnerR |
| `foot` | `sole` | 2 | 76 | footL, footR, soleL, soleR |
| `beltEdge.` | `skirtinner` | 2 | 75 | beltEdge0.035, skirtinnerL, skirtinnerR |
| `belt_shroud` | `skirtouter` | 1 | 74 | belt_shroud, skirtouterL |
| `cuffRim` | `tunicChest` | 2 | 73 | cuffRimL, cuffRimR, tunicChest |
| `bootCuff` | `skirtouterB` | 1 | 72 | bootCuffR, skirtouterB |
| `heel` | `sole` | 2 | 72 | heelL, heelR, soleL, soleR |
| `deltoid` | `sleeve` | 2 | 66 | deltoidL, deltoidR, sleeveL, sleeveR |
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
| `beltEdge.` | `clip` | 2 | 48 | beltEdge0.035, beltEdge0.09, clip |
| `buckle` | `strapEnd` | 2 | 48 | buckleL2, buckleR2, strapEndL2, strapEndR2 |
| `belt_switch` | `skirtouter` | 1 | 47 | belt_switch, skirtouterL |
| `plastronRim` | `sleeve` | 2 | 46 | plastronRim, sleeveL, sleeveR |
| `belt` | `clip` | 1 | 42 | belt, clip |
| `belt_switch` | `skirtinner` | 1 | 41 | belt_switch, skirtinnerL |
| `jaw` | `neck.` | 1 | 41 | jaw, neck.001 |
| `beltClip` | `belt_pommel` | 1 | 40 | beltClip, belt_pommel |
| `buckleIn` | `skirtinner` | 1 | 40 | buckleIn, skirtinnerL |
| `belt` | `buckle` | 1 | 39 | belt, buckle |
| `belt_neck` | `belt_switch` | 1 | 37 | belt_neck, belt_switch |
| `clip` | `skirtouter` | 1 | 37 | clip, skirtouterR |
| `chin` | `head.` | 1 | 36 | chin, head.001 |
| `belt_neck` | `skirtouter` | 1 | 35 | belt_neck, skirtouterL |
| `hips` | `tabardEdge` | 2 | 34 | hips, tabardEdge-1, tabardEdge1 |
| `belt` | `clipU` | 1 | 32 | belt, clipU |
| `collarFold` | `head.` | 1 | 32 | collarFold, head.001 |
| `belt` | `buckleIn` | 1 | 29 | belt, buckleIn |
| `neck.` | `tunicChest` | 1 | 28 | neck.001, tunicChest |
| `hips` | `pouch` | 2 | 28 | hips, pouch0, pouch2 |
| `skirtouter` | `strap` | 2 | 27 | skirtouterL, skirtouterR, strapL0, strapR0 |
| `buckle` | `buckleIn` | 1 | 26 | buckle, buckleIn |
| `clip` | `clipU` | 1 | 26 | clip, clipU |
| `palm` | `thumb` | 2 | 26 | palmL, palmR, thumbL, thumbR |
| `beltEdge.` | `buckle` | 2 | 25 | beltEdge0.035, beltEdge0.09, buckle |
| `collarFold` | `jaw` | 1 | 22 | collarFold, jaw |
| `skirtouter` | `strapEnd` | 1 | 20 | skirtouterR, strapEndR0 |
| `cuffSeam` | `skirtouterB` | 1 | 19 | cuffSeamR, skirtouterB |
| `ear` | `lock` | 1 | 19 | ear-1, lock108 |
| `belt_grip` | `skirtouter` | 1 | 18 | belt_grip, skirtouterL |
| `gauntlet` | `tunicChest` | 2 | 17 | gauntletL, gauntletR, tunicChest |
| `head.` | `nose` | 1 | 16 | head.001, nose |
| `boot` | `strapEnd` | 1 | 15 | bootL, strapEndL0 |
| `tabardChest` | `tabardEdge` | 1 | 14 | tabardChest, tabardEdge-1 |
| `chin` | `collarFold` | 1 | 12 | chin, collarFold |
| `plastronRim` | `tabardChest` | 1 | 11 | plastronRim, tabardChest |
| `belt_neck` | `skirtinner` | 1 | 10 | belt_neck, skirtinnerL |
| `gauntlet` | `tunicWaist` | 2 | 9 | gauntletL, gauntletR, tunicWaist |
| `flap` | `hips` | 2 | 9 | flap0, flap2, hips |
| `hemouter` | `strap` | 1 | 6 | hemouterL, strapL0 |
| `tabardEdge` | `tunicChest` | 1 | 6 | tabardEdge-1, tunicChest |
