# ChatGPT prompt — STAGE 01 third pass: rail_y + the corridor as flat textures (copy below the line, attach rail_y_guide.png)

The corridor is now requested as flat textures (a top-down floor and straight-on wall elevations) that the engine
projects itself, as with the landing floor (docs/MUSTAFAR_REBUILD.md). Engine side: the walls are drawn as vertical
textured planes — to be built when these arrive.

---

Great work — the ship, the first railing and the corner post are now in the game and look right. Two things left:

**1. `rail_y.png` (288 × 216, transparent PNG with a real alpha channel — not a painted checkerboard).** The same railing as your `rail_x`, but running the OTHER direction: from the upper RIGHT down to the lower LEFT, exactly along the attached guide `rail_y_guide.png` (the cyan box is its footprint on the ground, the orange box its top, the red cross its centre on the ground). Both railings you sent so far run upper-left to lower-right, so I still need this one. Same height (about 1.1 m), same brass-topped posts and low kerb, same lighting (light from the screen's upper left), and both ends joining seamlessly with copies of itself.

**2. The entry corridor as FLAT textures (no isometric angle at all).** The game will fold these into the isometric view itself, so please draw each one perfectly flat and straight-on, like a technical drawing with no perspective. Same materials as before: dark grey worn metal, dull brass trims, the lit door. Use soft even lighting with no cast shadows and no lava glow.
- `corridor_floor.png`, **640 × 384**, opaque. The corridor floor seen straight from above: 10 m long (left ↔ right) and 6 m wide (top ↔ bottom). The LEFT edge is the facility door end, the RIGHT edge is the open end at the landing pad. Plates, seams, a couple of grates, a brass trim along the top and bottom edges.
- `corridor_wall_back.png`, **640 × 192**, transparent PNG. The long back wall seen straight-on from the front: 10 m long, 3 m tall. LEFT edge = door end, RIGHT edge = pad end. Panels and pillars; its top outline can be stepped (pillars poking up are fine, transparent above).
- `corridor_wall_end.png`, **384 × 192**, transparent PNG. The far end wall with the closed facility door in the middle, seen straight-on: 6 m wide, 3 m tall.
- `corridor_wall_front.png`, **640 × 64**, transparent PNG. The low front wall, only 1 m tall so characters inside stay visible, seen straight-on from outside: 10 m long. LEFT edge = door end, RIGHT edge = pad end. A low barrier with short posts.

Deliver: `rail_y.png`, `corridor_floor.png`, `corridor_wall_back.png`, `corridor_wall_end.png`, `corridor_wall_front.png`.
