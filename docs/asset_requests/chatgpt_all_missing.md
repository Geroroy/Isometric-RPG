Same Mustafar game as before (Revenge of the Sith, the Anakin vs. Obi-Wan duel). Below are ALL the remaining images the map needs, grouped by location — 27 files. Please check the film for each place's look. Match the style of the landing pad, corridor and conference room you already made: dark grey worn metal, rust, dull brass trims, amber panel lights, soft even light from the upper left. Keep every surface lower-contrast than the characters so the duellists and their blue lightsabers stay readable — no blue or red glows on the set. Every image at exactly the size given; where transparency is asked, a real alpha channel (not a painted checkerboard). Use exactly the file names given.

Two kinds of image:
- FLAT pictures (no isometric angle; the game folds them into its view itself): 64 pixels = 1 m. Floors seen straight from above; walls seen straight-on like technical drawings; soft even lighting, no cast shadows.
- ISOMETRIC sprites, each drawn inside its attached guide image (14 guides attached, named <file>_guide.png). The guide is the exact canvas: cyan = the bottom outline / footprint, orange = the top, red cross = the ground anchor (for things in the lava: the lava's surface); delete the guide lines afterwards. The guides' 2:1 isometric angle; light from the upper left, a soft shadow to the lower right (no cast shadow on lava, only a faint orange glow).

==================================================
LOCATION 1 — LANDING PLATFORM ADDITIONS + THE LAVA (3 images)
==================================================
1. robe_obiwan.png, 128 × 96, transparent, isometric, inside robe_obiwan_guide.png: Obi-Wan's brown Jedi robe thrown down on the floor, a loose heap about 1.4 × 1 m.
2. cloak_anakin.png, 144 × 104, transparent, isometric, inside cloak_anakin_guide.png: Anakin's black hooded cloak thrown down on the floor, a loose heap about 1.6 × 1.1 m.
3. lava_tile.png, 512 × 512, opaque, SEAMLESS (tiles in both directions), flat, seen straight from above, 8 × 8 m: Mustafar's molten lava — a dark cooling crust broken by glowing orange-yellow cracks and slow molten channels. Not too bright overall (it surrounds every fight and fills the lava river).

==================================================
LOCATION 2 — THE CONTROL ROOM (14 images)
==================================================
The facility's control room, where the duel goes after the conference room: consoles, round holo-projector tables, big windows over the lava, and the shield generator console Anakin's lightsaber cuts open. The room is 18 × 18 m with 4 m walls. Along its window wall runs a raised gallery, 0.6 m up and 5 m deep, with steps down in the middle; a short passage (6 m × 4 m) leads in from the conference room; a door opens onto the outside balcony. Floors: image top = the window-wall side.

4. conf_wall_door_side.png, 768 × 256, transparent, flat: your conf_wall_side.png again, identical in design, but with a doorway — a 4 m wide, 3 m tall opening in the exact middle (pixels 256–512 across, from the bottom up to row 64) left fully transparent, with a door frame around it.
5. ctl_floor.png, 1152 × 832, opaque, flat: the room's lower floor, 18 m wide × 13 m deep. Top edge = the foot of the gallery; left edge = the shield generator's wall; right edge = the passage entrance (3–7 m down from the top); bottom edge = the balcony door (in the middle).
6. ctl_gallery_floor.png, 1152 × 320, opaque, flat: the gallery's floor, 18 m × 5 m (metal plates or grating; consoles stand on it).
7. ctl_gallery_edge.png, 1152 × 104, transparent, flat: the gallery's front edge seen straight-on, 18 m long — a solid 0.6 m face at the bottom (rows 66–104) with a metal railing on top of it up to the image's top; a 4 m gap in the middle (pixels 448–704) fully transparent where the steps are.
8. ctl_wall_window.png, 1152 × 256, transparent, flat: the window wall, 18 × 4 m — large windows (the glass left fully or mostly transparent; the game shows the lava behind), pillars between them.
9. ctl_wall_side.png, 1152 × 256, transparent, flat: the side wall, 18 × 4 m — wall panels, conduits, small amber indicator lights (the shield generator stands in front of it as a separate piece).
10. ctl_wall_front_low.png, 1152 × 64, transparent, flat: the near long wall cut down to 1 m tall (so the fighters stay visible), 18 m long, seen from outside, a 4 m gap in the middle (pixels 448–704) fully transparent — the balcony doorway.
11. ctl_wall_entry_low.png, 1152 × 64, transparent, flat: the near short wall, also cut to 1 m, 18 m long, a 4 m gap at pixels 384–640 fully transparent — the passage entrance.
12. ps_floor.png, 384 × 256, opaque, flat: the passage's floor, 6 m long (left–right) × 4 m wide.
13. ps_wall_back.png, 384 × 224, transparent, flat: the passage's far wall, 6 m × 3.5 m.
14. ps_wall_front_low.png, 384 × 64, transparent, flat: the passage's near wall cut to 1 m, 6 m long.
15. ctl_stairs.png, 272 × 184, transparent, isometric, inside ctl_stairs_guide.png: metal steps, 4 m wide, 2 m deep, rising 0.6 m in three steps toward the guide's upper right.
16. ctl_shield_generator.png, 200 × 208, transparent, isometric, inside ctl_shield_generator_guide.png: the shield generator console, 1.4 m deep × 2.8 m wide × 1.8 m tall, its front (control panels, an amber warning light) facing the guide's lower right.
17. ctl_holo_table.png, 160 × 144, transparent, isometric, inside ctl_holo_table_guide.png: a round holo-projector table, 1.6 m across, 0.9 m tall, projector off (no hologram).

==================================================
LOCATION 3 — THE WALKWAY AND THE LAVA COLLECTOR (7 images)
==================================================
Outside the control room: a balcony terrace, then a long open industrial catwalk over the lava with lava falls behind it (it collapses in the film); a large service pipe lying in the lava; and the lava collector — a long arm reaching out over the lava from its tower.

18. terrace_floor.png, 1280 × 320, opaque, flat, from above: the balcony terrace's floor, 20 m × 5 m, the same metal as the facility.
19. catwalk_segment.png, 352 × 280, transparent, isometric, inside catwalk_segment_guide.png: a 6 m piece of the open industrial catwalk, 2 m wide, along the guide's long axis — a grated walkway whose top is at the red cross's level, low railings on both sides about 1.1 m tall, girders hanging below it. Both ends cut square so pieces join end to end.
20. catwalk_broken.png, 352 × 280, transparent, isometric, inside catwalk_broken_guide.png: the same catwalk piece with its lower-right end torn off — bent grating and girders hanging down into the lava.
21. lava_fall.png, 312 × 568, transparent, isometric, inside lava_fall_guide.png: a black volcanic cliff 6 m wide and 8 m tall with lava pouring down its face into a glowing pool at its foot.
22. pipe_segment.png, 352 × 232, transparent, isometric, inside pipe_segment_guide.png: 7 m of a large rusted service pipe, 0.9 m thick, along the guide's long axis, half sunk in the lava (only its upper half shows; its top at the orange line). Both ends cut square so two pieces join.
23. collector_arm.png, 1032 × 576, transparent, isometric, inside collector_arm_guide.png: the lava collector's arm — a long rusted girder deck 22 m long and 3 m wide, its walkable top at the orange line, no railings, along the guide's long axis. (It also floats down the lava river after it falls, so draw it as a sturdy free-standing piece.)
24. collector_tower.png, 352 × 584, transparent, isometric, inside collector_tower_guide.png: the collector's tower the arm hangs from, 4 × 4 m, 8 m tall, a rusted cage of curved vanes, struts and pipes.

==================================================
LOCATION 4 — THE LAVA RIVER (2 images)
==================================================
After the collector arm falls in, Obi-Wan leaps onto a small repulsor platform and Anakin onto a hovering mining droid; they fight on these small craft as they drift.

25. mining_droid.png, 192 × 144, transparent, isometric, inside mining_droid_guide.png: the panning/mining droid from the film — a small hovering droid about 2 m across with a flat top a person can stand on (top at the orange line), its underside low over the lava.
26. repulsor_platform.png, 288 × 240, transparent, isometric, inside repulsor_platform_guide.png: the small repulsor platform Obi-Wan rides — a flat square deck 3.2 × 3.2 m with its top at the red cross's level, and a slim control post at one back corner reaching up to the orange line; its underside low over the lava.

==================================================
LOCATION 5 — THE HIGH GROUND (1 image)
==================================================
27. highground_bank.png, 1512 × 992, transparent everywhere outside the bank (the game's lava shows around it), isometric, drawn over highground_bank_guide.png: the black volcanic bank of the film's ending, black ash and rock lit orange from below by the lava. The guide shows the bank's footprint at the lava's level (cyan, 24 m long × 13 m deep), the flat top 1.4 m up (orange outline), the foot of the slope (grey line) and the crest of a rock face behind (top grey line); the red cross is the bank's near-left corner at the lava's level. From the near (lower) edge inward: 2 m of flat black sand at the lava's edge, then a slope rising 1.4 m over 4 m up to the orange outline, then the flat top, and behind it a rough black rock face rising up to the top grey line. Keep the walkable parts (sand, slope, top) fairly smooth and even so characters read clearly on them.

==================================================
DELIVER (27 files)
==================================================
robe_obiwan.png, cloak_anakin.png, lava_tile.png, conf_wall_door_side.png, ctl_floor.png, ctl_gallery_floor.png, ctl_gallery_edge.png, ctl_wall_window.png, ctl_wall_side.png, ctl_wall_front_low.png, ctl_wall_entry_low.png, ps_floor.png, ps_wall_back.png, ps_wall_front_low.png, ctl_stairs.png, ctl_shield_generator.png, ctl_holo_table.png, terrace_floor.png, catwalk_segment.png, catwalk_broken.png, lava_fall.png, pipe_segment.png, collector_arm.png, collector_tower.png, mining_droid.png, repulsor_platform.png, highground_bank.png.
