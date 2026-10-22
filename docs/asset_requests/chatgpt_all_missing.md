Same Mustafar game as before (Revenge of the Sith, the Anakin vs. Obi-Wan duel). Below are ALL the remaining images the map needs, grouped by location — 14 files. Please check the film for each place's look. Match the style of the landing pad, corridor and conference room you already made: dark grey worn metal, rust, dull brass trims, amber panel lights, soft even light from the upper left. Keep every surface lower-contrast than the characters so the duellists and their blue lightsabers stay readable — no blue or red glows on the set. Every image at exactly the size given; where transparency is asked, a real alpha channel (not a painted checkerboard). Use exactly the file names given.

Two kinds of image:
- FLAT pictures (no isometric angle; the game folds them into its view itself): 64 pixels = 1 m. Floors seen straight from above; walls seen straight-on like technical drawings; soft even lighting, no cast shadows.
- ISOMETRIC sprites, each drawn inside its attached guide image (5 guides attached, named <file>_guide.png). The guide is the exact canvas: cyan = the bottom outline / footprint, orange = the top, red cross = the ground anchor (for things in the lava: the lava's surface); delete the guide lines afterwards. The guides' 2:1 isometric angle; light from the upper left, a soft shadow to the lower right (no cast shadow on lava, only a faint orange glow).

==================================================
LOCATION 1 — THE CONTROL ROOM (12 images)
==================================================
The facility's control room, where the duel goes after the conference room: consoles, round holo-projector tables, big windows over the lava, and the shield generator console Anakin's lightsaber cuts open. The room is 18 × 18 m with 4 m walls. Along its window wall runs a raised gallery, 0.6 m up and 5 m deep, with steps down in the middle; a short passage (6 m × 4 m) leads in from the conference room; a door opens onto the outside balcony. Floors: image top = the window-wall side.

1. conf_wall_door_side.png, 768 × 256, transparent, flat: your conf_wall_side.png again, identical in design, but with a doorway — a 4 m wide, 3 m tall opening in the exact middle (pixels 256–512 across, from the bottom up to row 64) left fully transparent, with a door frame around it.
2. ctl_gallery_edge.png, 1152 × 104, transparent, flat: the gallery's front edge seen straight-on, 18 m long — a solid 0.6 m face at the bottom (rows 66–104) with a metal railing on top of it up to the image's top; a 4 m gap in the middle (pixels 448–704) fully transparent where the steps are.
3. ctl_wall_window.png, 1152 × 256, transparent, flat: the window wall, 18 × 4 m — large windows (the glass left fully or mostly transparent; the game shows the lava behind), pillars between them.
4. ctl_wall_side.png, 1152 × 256, transparent, flat: the side wall, 18 × 4 m — wall panels, conduits, small amber indicator lights (the shield generator stands in front of it as a separate piece).
5. ctl_wall_front_low.png, 1152 × 64, transparent, flat: the near long wall cut down to 1 m tall (so the fighters stay visible), 18 m long, seen from outside, a 4 m gap in the middle (pixels 448–704) fully transparent — the balcony doorway.
6. ctl_wall_entry_low.png, 1152 × 64, transparent, flat: the near short wall, also cut to 1 m, 18 m long, a 4 m gap at pixels 384–640 fully transparent — the passage entrance.
7. ps_floor.png, 384 × 256, opaque, flat: the passage's floor, 6 m long (left–right) × 4 m wide.
8. ps_wall_back.png, 384 × 224, transparent, flat: the passage's far wall, 6 m × 3.5 m.
9. ps_wall_front_low.png, 384 × 64, transparent, flat: the passage's near wall cut to 1 m, 6 m long.
10. ctl_stairs.png, 272 × 184, transparent, isometric, inside ctl_stairs_guide.png: metal steps, 4 m wide, 2 m deep, rising 0.6 m in three steps toward the guide's upper right.
11. ctl_shield_generator.png, 200 × 208, transparent, isometric, inside ctl_shield_generator_guide.png: the shield generator console, 1.4 m deep × 2.8 m wide × 1.8 m tall, its front (control panels, an amber warning light) facing the guide's lower right.
12. ctl_holo_table.png, 160 × 144, transparent, isometric, inside ctl_holo_table_guide.png: a round holo-projector table, 1.6 m across, 0.9 m tall, projector off (no hologram).

==================================================
LOCATION 2 — THE WALKWAY AND THE LAVA COLLECTOR (2 images)
==================================================
Outside the control room: a balcony terrace, then a long open industrial catwalk over the lava with lava falls behind it (it collapses in the film); a large service pipe lying in the lava; and the lava collector — a long arm reaching out over the lava from its tower.

13. pipe_segment.png, 352 × 232, transparent, isometric, inside pipe_segment_guide.png: 7 m of a large rusted service pipe, 0.9 m thick, along the guide's long axis, half sunk in the lava (only its upper half shows; its top at the orange line). Both ends cut square so two pieces join.
14. collector_tower.png, 352 × 584, transparent, isometric, inside collector_tower_guide.png: the collector's tower the arm hangs from, 4 × 4 m, 8 m tall, a rusted cage of curved vanes, struts and pipes.

==================================================
DELIVER (14 files)
==================================================
conf_wall_door_side.png, ctl_gallery_edge.png, ctl_wall_window.png, ctl_wall_side.png, ctl_wall_front_low.png, ctl_wall_entry_low.png, ps_floor.png, ps_wall_back.png, ps_wall_front_low.png, ctl_stairs.png, ctl_shield_generator.png, ctl_holo_table.png, pipe_segment.png, collector_tower.png.
