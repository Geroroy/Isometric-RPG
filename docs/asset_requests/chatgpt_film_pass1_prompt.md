Same Mustafar game as before (Revenge of the Sith, the Anakin vs. Obi-Wan duel). We compared the first stretch of the map — the landing pad, the entry corridor, the control room, the conference room — with the film and rebuilt its layout; these 13 images fill the places that are still grey stand-in boxes. The film frames each piece comes from are in `ref/` (look at them for each piece), and pieces you already made that these must match are in `match/`. Match their style exactly: dark worn metal, dull brass trim, soft even light from the upper left, every surface lower-contrast than the characters so the duellists and their blue lightsabers stay readable. No blue or red glow baked in anywhere (the game draws the holograms and the lamps' light itself). Every image at exactly the size given; where transparency is asked, a real alpha channel (not a painted checkerboard). Use exactly the file names given.

Three kinds of image:
- ISOMETRIC sprites, each drawn inside its attached guide image (6 guides, named <file>_guide.png). The guide is the exact canvas: cyan = the footprint on the floor, orange = the top, grey = the vertical edges, red cross = the anchor on the floor; draw the piece to fill that box, then delete the guide lines. The guides' 2:1 isometric angle; light from the upper left; no cast shadow (the game adds it).
- FLAT floors, opaque, seen straight from above: 64 pixels = 1 m, no perspective, no light direction, no shadows. Image top = north (the far side), as the corridor floor in `match/ps_floor.png`.
- FLAT walls, straight-on front views (elevations), transparent around the wall's outline: 64 pixels = 1 m both ways, the wall's base along the bottom edge, its full length edge to edge. The game stands them up on the map, as it does `match/ps_wall_back.png` and `match/ps_wall_front_low.png`.

==================================================
1. THE CONTROL ROOM
==================================================
1. ctl_long_table.png, 392 × 264, transparent, isometric, inside ctl_long_table_guide.png: the long central holo-table of the control room (ref/film_12920.jpg, the dark mass in the foreground on the left). 7 m long, 2 m wide, 1 m tall: a solid block with sloped, trapezoid sides, not legs; a dark glass projection surface across its top with small instrument lights along the rim. The projectors are OFF: no holograms, no blue light.
2. ctl_door_pillar.png, 104 × 136, transparent, isometric, inside ctl_door_pillar_guide.png: one of the two thick slanted pillars either side of the corridor's door into the control room (ref/film_12911.jpg, ref/film_12915.jpg: heavy, leaning, with sawtooth edges). 0.8 × 0.9 m, cut off at 1.3 m with the cut top showing — the game cuts the walls nearest the camera low so the fight inside can be seen; match the cut tops of `match/ctl_wall_entry_low.png`.

==================================================
2. THE ENTRY CORRIDOR
==================================================
3. corr_frame_far.png, 72 × 216, transparent, isometric, inside corr_frame_far_guide.png: one of the corridor's repeated structural frames (ref/film_12887.jpg, ref/film_12911.jpg): a thick rib standing against the corridor's far wall, leaning in toward the corridor as it rises, 0.35 m wide, standing out 0.5 m from the wall, 3.3 m tall, a broad base, one small warm-white floor lamp at its foot. Six of them stand 3 m apart along `match/ps_wall_back.png`: same metal.
4. corr_frame_near.png, 72 × 96, transparent, isometric, inside corr_frame_near_guide.png: the same frame on the corridor's near side, cut off at 0.9 m (its base only, the cut top showing), standing against `match/ps_wall_front_low.png`.
5. corr_junction_floor.png, 256 × 256, opaque, flat floor: the corridor's last 4 × 4 m just inside the facility door, where a side passage turns off to the north. Continues `match/ps_floor.png` (same plates, same grime); a threshold strip along its right (+x) edge where the door is.
6. corr_junction_pier.png, 64 × 224, transparent, flat wall: 1 m of the corridor's far wall, 3.5 m tall, beside the side passage's opening — a pier, the corner where the wall turns into the opening along its right (+x) edge. Same as `match/ps_wall_back.png`.
7. corr_junction_wall_low.png, 256 × 64, transparent, flat wall: 4 m of the corridor's near wall, cut low at 1 m (the cut top showing), same as `match/ps_wall_front_low.png`.

==================================================
3. THE SIDE PASSAGE TO THE CONFERENCE ROOM
==================================================
The film does not show how the conference room is reached; the map runs a short side passage north from the corridor to the conference room's door. Plain, the same corridor materials.
8. corr_side_floor.png, 192 × 768, opaque, flat floor: 3 m wide, 12 m long (along the image's height), the same plates as `match/ps_floor.png`.
9. corr_side_wall_end.png, 192 × 128, transparent, flat wall: the passage's far end wall, 3 m long, only 2 m tall (taller would hide the conference room behind it).
10. corr_side_wall_low.png, 768 × 64, transparent, flat wall: the passage's outer wall, 12 m long, cut low at 1 m, the cut top showing.
11. corr_side_wall_corner.png, 256 × 128, transparent, flat wall: 4 m of wall, 2 m tall, between the conference room's corner and the corridor.

==================================================
4. THE CONFERENCE ROOM
==================================================
12. conf_table_long.png, 592 × 352, transparent, isometric, inside conf_table_long_guide.png: the council table in ONE piece, 12 m long, 2 m wide, top at 0.8 m (ref/film_13142.jpg, ref/film_13148.jpg: it runs most of the room's length). The same design as `match/conf_table.png` — the faceted top plates, the glowing amber strip down the middle, the sloped feet — just longer: the cut corners at the two ends only, more top plates and feet along it. The chairs stay separate (`match/conf_chair_a.png`, `match/conf_chair_b.png` line both sides).

==================================================
5. THE LANDING PAD
==================================================
13. guide_light.png, 64 × 56, transparent, isometric, inside guide_light_guide.png: a small lamp set in the landing pad's deck (ref/landing_clip_05s.jpg: the small lamps on the grey floor behind Anakin). 0.4 × 0.4 m, 0.1 m tall: a flush metal housing with a lens — the lens drawn UNLIT (pale grey-blue glass, no glow); the game lights it. Same grey as `match/floor_bay_A.png`.

==================================================
DELIVER (13 files)
==================================================
ctl_long_table.png, ctl_door_pillar.png, corr_frame_far.png, corr_frame_near.png, corr_junction_floor.png, corr_junction_pier.png, corr_junction_wall_low.png, corr_side_floor.png, corr_side_wall_end.png, corr_side_wall_low.png, corr_side_wall_corner.png, conf_table_long.png, guide_light.png.
