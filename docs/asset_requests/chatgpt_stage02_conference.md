# ChatGPT prompt — STAGE 02 Separatist conference room (copy below the line; attach the 3 guides)

Attach: `docs/asset_requests/guides/conf_table_guide.png`, `conf_chair_guide.png`, `conf_console_guide.png`.
Room 16 × 12 m, walls 4 m, behind the corridor's door (docs/MUSTAFAR_REBUILD.md). Architecture as flat pictures (the
engine projects them: `groundTiles` / `wallElevation`), furniture as 2:1 sprites on guides (docs/ASSETS.md).

---

Next location for the same Mustafar game: the Separatist conference room inside the mining facility, where Anakin killed the Separatist council in *Revenge of the Sith*. The duel passes through it. Please check the film for its look: a dark, high-tech meeting room with large windows over the lava, wall consoles, and a conference table. Match the style of the landing pad and corridor you already made (dark grey worn metal, dull brass trims, amber panel lights). Every image must be a real transparent PNG where transparency is asked (a true alpha channel, not a painted checkerboard), at exactly the size given.

**A. Architecture as FLAT pictures (no isometric angle; the game folds them into its view itself).** Draw these straight-on, like technical drawings, with soft even lighting and no cast shadows:
1. `conf_floor.png`, **1024 × 768**, opaque. The room's floor seen straight from above, 16 m wide (left–right) by 12 m deep (top–bottom). The TOP edge is the window wall, the RIGHT edge has the entrance from the corridor. Keep it fairly low-contrast so characters and blue/red lightsabers stay readable on it.
2. `conf_wall_window.png`, **1024 × 256**, transparent. The long window wall seen straight-on, 16 m long and 4 m tall. Large windows, with the glass areas left semi-transparent or fully transparent (the game shows the lava behind them), and pillars between them.
3. `conf_wall_side.png`, **768 × 256**, transparent. The far side wall seen straight-on, 12 m long and 4 m tall, with built-in consoles and screens (amber/orange lights only — no blue or red glows).
4. `conf_wall_front_low.png`, **1024 × 64**, transparent. The near long wall, cut down to 1 m tall (so characters stay visible), 16 m long, seen straight-on from outside.
5. `conf_wall_door_low.png`, **768 × 64**, transparent. The near short wall on the entrance side, also only 1 m tall, 12 m long, with a 4 m gap in the middle (fully transparent) where the corridor's door opens into the room.

**B. Furniture as isometric sprites, each drawn inside its attached guide** (the guide is the exact canvas: cyan = footprint on the floor, orange = top, red cross = ground anchor; delete the guide lines afterwards). Same 2:1 isometric angle as the guides; light from the screen's upper left, soft shadow to the lower right.
6. `conf_table.png`, **352 × 232** (guide `conf_table_guide.png`): the long conference table, 6 m × 2 m, about 0.8 m tall, running along the guide's long axis.
7. `conf_chair_a.png` and `conf_chair_b.png`, **88 × 120** each (guide `conf_chair_guide.png`): a high-backed council chair facing the table from one side (a), and the same chair facing from the other side (b), rendered separately, not mirrored.
8. `conf_console.png`, **168 × 184** (guide `conf_console_guide.png`): a free-standing control console, 2.4 m wide, 1 m deep, 1.6 m tall.

Deliver: `conf_floor.png`, `conf_wall_window.png`, `conf_wall_side.png`, `conf_wall_front_low.png`, `conf_wall_door_low.png`, `conf_table.png`, `conf_chair_a.png`, `conf_chair_b.png`, `conf_console.png`.
