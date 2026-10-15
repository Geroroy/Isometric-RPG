Same Mustafar game as before (Revenge of the Sith, the Anakin vs. Obi-Wan duel). The whole duel is now playable; this is the second pass — 9 images that improve the look the most. Please check the film for each. Match the style of the pieces you already made: dark worn surfaces, soft even light from the upper left, no blue or red glows on the set, every surface lower-contrast than the characters so the duellists and their blue lightsabers stay readable. Every image at exactly the size given; where transparency is asked, a real alpha channel (not a painted checkerboard). Use exactly the file names given.

Three kinds of image:
- FLAT, opaque, seen straight from above (the lava surface): 64 pixels = 1 m, seamless on all four edges, no light direction, no shadows.
- FLAT, transparent, no angle (the smoke): soft shapes the game moves, fades and draws at different sizes.
- ISOMETRIC sprites, each drawn inside its attached guide image (5 guides attached, named <file>_guide.png). The guide is the exact canvas: cyan = the bottom outline / footprint, orange = the top, red cross = the ground anchor (the lava's surface); delete the guide lines afterwards. The guides' 2:1 isometric angle; light from the upper left; no cast shadow on the lava, only a faint orange glow where the rock meets it.

==================================================
1. THE LAVA SURFACE (1 image)
==================================================
1. lava_tile_v2.png, 1024 × 1024, opaque, flat, seamless: 16 × 16 m of the lava river seen from straight above, replacing lava_tile.png (keep its hues). Mostly dark cooled crust — charcoal and black-brown basalt plates, about two thirds of the area — split by thin glowing cracks and two or three wider, slow molten channels (yellow-orange core fading to deep red). Darker overall than lava_tile.png, with no single bright spot or shape that would show the repeat; nothing that reads as a hole or an object.

==================================================
2. ROCKS AND CLIFFS IN THE LAVA (5 images)
==================================================
The film's black basalt outcrops, spires and cliff faces rising out of the lava rivers. They stand in the lava beside the walkways and at the edges of the view; the fighters never stand on them. Rough volcanic rock, dark grey-black with brown tones, sharp fractured edges, faint orange underglow at the base from the lava, a few glowing cracks low down. The top of each rock catches the soft upper-left light.

2. rock_low.png, 216 × 208, transparent, isometric, inside rock_low_guide.png: a low, broad outcrop, 2.5 × 2 m, 1.6 m tall.
3. rock_mid.png, 312 × 320, transparent, isometric, inside rock_mid_guide.png: a jagged outcrop, 4 × 3 m, 3 m tall, broken into two or three blocks.
4. rock_spire.png, 160 × 344, transparent, isometric, inside rock_spire_guide.png: a tall pointed spire, 1.6 × 1.6 m at the base, 5 m tall.
5. cliff_x.png, 512 × 568, transparent, isometric, inside cliff_x_guide.png: 10 m of cliff face running along the guide's long axis (left-up to right-down), 2 m deep, 6 m tall, its face toward the viewer; both ends rough so several can stand in a row.
6. cliff_y.png, 512 × 568, transparent, isometric, inside cliff_y_guide.png: the same cliff running along the other axis (right-up to left-down). Draw it with its own lighting from the upper left — not a mirror image of cliff_x.

==================================================
3. SMOKE (3 images)
==================================================
The volcanic smoke and ash that drifts over Mustafar in the film. The game moves these slowly over the lava, fades them in and out and draws them at different sizes, so each must be a single soft cloud with fully transparent, feathered edges (nothing touching the canvas edge), no hard outline, no background.

7. smoke_a.png, 256 × 256, transparent, flat: a rounded billow of dark grey-black smoke, faint warm orange underglow along its lower edge.
8. smoke_b.png, 256 × 256, transparent, flat: a thinner, wispier stretch of ash-grey smoke.
9. smoke_c.png, 256 × 256, transparent, flat: a dense dark puff with a brighter grey top where it catches light.

==================================================
DELIVER (9 files)
==================================================
lava_tile_v2.png, rock_low.png, rock_mid.png, rock_spire.png, cliff_x.png, cliff_y.png, smoke_a.png, smoke_b.png, smoke_c.png.
