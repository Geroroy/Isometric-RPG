# ChatGPT prompts — the rest of the Mustafar route (STAGE 01–06), grouped by location

Every sprite the route still needs that the user has not supplied (the user's delivered assets — STAGE 01 landing pad,
corridor, ship, railings; STAGE 02 conference room — are reused, not re-requested). Until each arrives, its place in
the game is a grey BLOCKOUT box or the old placeholder (tracked in docs/MUSTAFAR_REBUILD.md "블록아웃 · 에셋 대기"); no
stage is visually complete while one of its pieces is missing.

Conventions, as for STAGE 02 (docs/ASSETS.md): **architecture as flat pictures** (top-down floors, straight-on walls —
the engine folds them into the view), 64 px a metre; **objects as 2:1 isometric sprites drawn inside the attached
guide** (the guide is the exact canvas: cyan = the footprint at its base, orange = its top, red cross = the ground
anchor; delete the guide lines afterwards), density 2. Guides: `docs/asset_requests/guides/<name>_guide.png`
(made by `tools/assets/mustafar/route_requests.py`). Geometry: `tools/maps/mustafar_v2/stage0N.py`.

| Location | Prompt | Images |
|---|---|---|
| STAGE 01 additions + the lava | §1 | 3 |
| STAGE 03 control room (+ the conference room's door wall) | §2 → **`chatgpt_stage03_control.md`** | 14 |
| STAGE 04 walkway and lava collector | §3 | 7 |
| STAGE 05 lava river | §4 | 2 |
| STAGE 06 high ground | §5 | 1 |

Not requested (by the project's rules or because they are effects): new character art and poses (CLAUDE.md: the
existing Anakin / Obi-Wan / Padmé sets are kept; missing poses such as hanging or crawling use the nearest existing
frame); the cables, lava rain and lava bombs (engine effects, like the blades); the fallen arm adrift (the collector
arm's own sprite, §3).

Shared text for every prompt (put it first each time):

> Same Mustafar game as before (*Revenge of the Sith*, the Anakin vs. Obi-Wan duel). Match the style of the landing
> pad, corridor and conference room you already made: dark grey worn metal, dull brass trims, amber panel lights,
> soft even light from the upper left. Keep surfaces lower-contrast than the characters so the duellists and their
> blue lightsabers stay readable — no blue or red glows on the set. Every image at exactly the size given; where
> transparency is asked, a real alpha channel (not a painted checkerboard).

---

## §1 STAGE 01 additions + the lava (attach `robe_obiwan_guide.png`, `cloak_anakin_guide.png`)

2. `robe_obiwan.png`, **128 × 96**, transparent, inside `robe_obiwan_guide.png` (anchor 64, 52): Obi-Wan's brown
   Jedi robe thrown down on the floor, a loose heap 1.4 × 1 m, isometric.
3. `cloak_anakin.png`, **144 × 104**, transparent, inside `cloak_anakin_guide.png` (anchor 70, 55): Anakin's black
   hooded cloak thrown down, a loose heap 1.6 × 1.1 m, isometric.
4. `lava_tile.png`, **512 × 512**, opaque, **seamless (tiles in both directions)**, seen straight from above, 8 × 8 m:
   Mustafar's molten lava — a dark cooling crust broken by glowing orange-yellow cracks and slow molten channels.
   Not too bright overall (it surrounds every fight). It replaces the old lava texture everywhere, the river too.

## §2 STAGE 03 control room

Its own prompt, ready to send: `docs/asset_requests/chatgpt_stage03_control.md` (14 images, with the conference room's
door wall).

## §3 STAGE 04 walkway and lava collector (attach `catwalk_segment_guide.png`, `lava_fall_guide.png`, `pipe_segment_guide.png`, `collector_arm_guide.png`, `collector_tower_guide.png`)

Outside the control room: a balcony terrace, then a long open catwalk over the lava with lava falls behind it (it
collapses in the film); a service pipe over the lava; the lava collector — a long arm out over the lava from its
tower. (The terrace's railings reuse your landing-pad railings.)

18. `terrace_floor.png`, **1280 × 320**, opaque: the balcony terrace's floor, 20 m × 5 m, from above, the same metal
    as the facility.
19. `catwalk_segment.png`, **352 × 280** (`catwalk_segment_guide.png`, anchor 176, 150): a 6 m piece of the open
    industrial catwalk, 2 m wide, along the guide's long axis: a grated walkway (its top at the anchor's level), low
    railings both sides about 1.1 m, girders hanging below. Both ends cut square so pieces join end to end.
20. `catwalk_broken.png`, **352 × 280** (same guide): the same piece with its right-hand (+x) end torn off — bent
    grating and girders hanging into the lava.
21. `lava_fall.png`, **312 × 568** (`lava_fall_guide.png`, anchor 156, 478): a black volcanic cliff 6 m wide and
    8 m tall with lava pouring down its face into a pool at its foot.
22. `pipe_segment.png`, **352 × 232** (`pipe_segment_guide.png`, anchor 174, 112): 7 m of a large rusted service
    pipe, 0.9 m thick, along the guide's long axis, half sunk in the lava (only its upper half shows; its top at the
    orange line). Both ends cut square so two join.
23. `collector_arm.png`, **1032 × 576** (`collector_arm_guide.png`, anchor 516, 281): the lava collector's arm —
    a long rusted girder deck 22 m long and 3 m wide, its walkable top at the orange line, no railings, along the
    guide's long axis. (It also floats down the lava river after it falls.)
24. `collector_tower.png`, **352 × 584** (`collector_tower_guide.png`, anchor 176, 488): the collector's tower the
    arm hangs from, 4 × 4 m, 8 m tall, a rusted cage of curved vanes and pipes.

## §4 STAGE 05 lava river (attach `mining_droid_guide.png`, `repulsor_platform_guide.png`)

The river of lava the fallen arm drifts down; the two small craft they leap onto.

25. `mining_droid.png`, **192 × 144** (`mining_droid_guide.png`, anchor 96, 63): the panning droid from the film —
    a small hovering mining droid, 2 m across, with a flat top a person can stand on (top at the orange line, its
    underside low over the lava).
26. `repulsor_platform.png`, **288 × 240** (`repulsor_platform_guide.png`, anchor 144, 139): the small repulsor
    platform Obi-Wan rides, a flat square deck 3.2 × 3.2 m (deck top at the anchor's level) with a control post at one
    back corner up to the orange line, its underside low over the lava.

## §5 STAGE 06 high ground (attach `highground_bank_guide.png`)

27. `highground_bank.png`, **1512 × 992**, transparent outside the bank (the lava shows round it), drawn over
    `highground_bank_guide.png` (the red cross, pixel 16, 492, is the bank's near-left corner at the lava's level):
    the black volcanic slope of the film's ending, 24 m long × 13 m deep. From the near (lower) edge: 2 m of flat
    black sand at the lava's edge, then the slope rising 1.4 m over 4 m, then the flat top (to the orange outline),
    and behind it a rough rock face up to the grey line. Black ash and rock lit orange by the lava, matching the film.

Deliver all files with the names above. §1–§5 can come in any order; each location is integrated as it arrives.
