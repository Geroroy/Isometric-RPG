# ChatGPT prompt — STAGE 03 control room (copy below the line; attach the 3 guides)

Attach: `docs/asset_requests/guides/ctl_stairs_guide.png`, `ctl_shield_generator_guide.png`, `ctl_holo_table_guide.png`.
Layout: `tools/maps/mustafar_v2/stage03.py` (room x 20.9..38.9, y 88..106; gallery 0.6 m up, y 88..93; passage
x 38.9..44.9, y 96..100). Every piece is wired: it replaces its grey blockout box the moment its manifest entry is
marked delivered (`public/assets/mustafar/manifest.json`, ids `mf.control.*`, `mf.passage.*`, `mf.room.wall_door_side`);
placement verified with stand-ins (`tools/qa/mfstage03_art.mjs`). Reused, not requested: the consoles on the gallery
(the user's `conf_console.png`).

---

Next location for the same Mustafar game (*Revenge of the Sith*, the Anakin vs. Obi-Wan duel): the facility's control
room, where the duel goes after the conference room. Please check the film for its look: a dark control room with
consoles, round holo-projector tables, big windows over the lava, and the shield generator console that Anakin's
lightsaber cuts open. Match the style of the landing pad, corridor and conference room you already made (dark grey worn
metal, dull brass trims, amber panel lights, soft even light from the upper left). Keep surfaces lower-contrast than
the characters so the duellists and their blue lightsabers stay readable — no blue or red glows on the set. Every image
at exactly the size given; where transparency is asked, a real alpha channel (not a painted checkerboard).

The room is 18 × 18 m with 4 m walls. Along its window wall runs a raised gallery, 0.6 m up and 5 m deep, with steps
down in the middle; a short passage (6 m × 4 m) leads in from the conference room; a door opens onto the outside
balcony.

**A. Architecture as FLAT pictures (no isometric angle; the game folds them into its view itself).** 64 pixels = 1 m.
Floors seen straight from above (image top = the window-wall side); walls seen straight-on like technical drawings,
soft even lighting, no cast shadows.

1. `conf_wall_door_side.png`, **768 × 256**, transparent. Your `conf_wall_side.png` again, identical in design, but
   with a doorway: a **4 m wide, 3 m tall opening in the exact middle** (pixels 256–512 across, from the bottom up to
   row 64) left fully transparent, with a door frame around it. (The duel leaves the conference room through it.)
2. `ctl_floor.png`, **1152 × 832**, opaque: the room's lower floor, 18 m wide × 13 m deep. Top edge = the foot of
   the gallery; left edge = the shield generator's wall; right edge = the passage entrance (3–7 m down from the top);
   bottom edge = the balcony door (in the middle).
3. `ctl_gallery_floor.png`, **1152 × 320**, opaque: the gallery's floor, 18 m × 5 m (metal plates or grating;
   consoles stand on it).
4. `ctl_gallery_edge.png`, **1152 × 104**, transparent: the gallery's front edge seen straight-on, 18 m long — a solid
   0.6 m face at the bottom (rows 66–104) with a metal railing on top of it up to the image's top; a **4 m gap in the
   middle (pixels 448–704) fully transparent** where the steps are.
5. `ctl_wall_window.png`, **1152 × 256**, transparent: the window wall, 18 × 4 m: large windows (the glass left fully
   or mostly transparent — the game shows the lava behind), pillars between them.
6. `ctl_wall_side.png`, **1152 × 256**, transparent: the side wall, 18 × 4 m, wall panels, conduits, small amber
   indicator lights (the shield generator stands in front of it as a separate piece).
7. `ctl_wall_front_low.png`, **1152 × 64**, transparent: the near long wall cut down to 1 m tall (so the fighters stay
   visible), 18 m long, seen from outside, a **4 m gap in the middle (pixels 448–704)** fully transparent — the
   balcony doorway.
8. `ctl_wall_entry_low.png`, **1152 × 64**, transparent: the near short wall, also cut to 1 m, 18 m long, a **4 m gap
   at pixels 384–640** fully transparent — the passage entrance.
9. `ps_floor.png`, **384 × 256**, opaque: the passage's floor, 6 m long (left–right) × 4 m wide.
10. `ps_wall_back.png`, **384 × 224**, transparent: the passage's far wall, 6 m × 3.5 m.
11. `ps_wall_front_low.png`, **384 × 64**, transparent: the passage's near wall cut to 1 m, 6 m long.

**B. Pieces as isometric sprites, each drawn inside its attached guide** (the guide is the exact canvas: cyan = the
footprint on the floor, orange = its top, red cross = the ground anchor; delete the guide lines afterwards). The
guides' 2:1 isometric angle; light from the upper left, a soft shadow to the lower right.

12. `ctl_stairs.png`, **272 × 184** (guide `ctl_stairs_guide.png`): metal steps, 4 m wide, 2 m deep, rising 0.6 m in
    three steps toward the guide's upper right.
13. `ctl_shield_generator.png`, **200 × 208** (guide `ctl_shield_generator_guide.png`): the shield generator console,
    1.4 m deep × 2.8 m wide × 1.8 m tall, its front (control panels, an amber warning light) facing the guide's
    lower right.
14. `ctl_holo_table.png`, **160 × 144** (guide `ctl_holo_table_guide.png`): a round holo-projector table, 1.6 m
    across, 0.9 m tall, projector off (no hologram).

Deliver: `conf_wall_door_side.png`, `ctl_floor.png`, `ctl_gallery_floor.png`, `ctl_gallery_edge.png`,
`ctl_wall_window.png`, `ctl_wall_side.png`, `ctl_wall_front_low.png`, `ctl_wall_entry_low.png`, `ps_floor.png`,
`ps_wall_back.png`, `ps_wall_front_low.png`, `ctl_stairs.png`, `ctl_shield_generator.png`, `ctl_holo_table.png`.
