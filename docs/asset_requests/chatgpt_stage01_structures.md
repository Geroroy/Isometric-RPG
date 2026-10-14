# ChatGPT prompt — STAGE 01 railings, corridor, ship (copy everything below the line)

---

I'm building a real-time isometric lightsaber action RPG (Diablo II-style gameplay, Commandos 2-quality pre-rendered 2D art) of the Anakin vs Obi-Wan duel on Mustafar from *Revenge of the Sith*. You already made the landing-pad floor sheet: match its dark grey worn metal, dull brass trims and level of wear. I need 6 more images for the landing platform. Please deliver each as a separate PNG with a transparent background at exactly the pixel size given.

**Projection for every image (must be exact):** 2:1 isometric, orthographic (no perspective), camera 30° up, looking down a diagonal. At these images' scale: 1 m along world +x = 40 px right and 20 px down; 1 m along world +y = 40 px left and 20 px down; 1 m up = 49 px up. A 1.85 m person is about 90 px tall. Key light from the screen's upper left (slightly in front); any baked ground shadow falls to the lower right, soft and faint. No lava glow baked in (the game adds the lighting). Low saturation.

**Readability (very important):** characters, blue/red lightsabers and effects must stay readable on and next to these. No bright thin lines or blue/red glowing parts. Anything in front of a character must be low or see-through.

**1–3. Edge railings (`rail_x.png`, `rail_y.png`, `rail_corner.png`).** Waist-high railing (about 1.0–1.1 m) standing on the pad's edge, open and see-through (no solid panels). It is tiled end to end along all four edges, so each 6 m section must join seamlessly with copies of itself. If the film's platform has no railing, use a low edge structure (kerb, posts) instead.
- `rail_x.png`: **288 × 216 px**. A 6 m section running along world +x (on screen it descends from upper-left to lower-right). Its base centre sits at pixel (142, 133). Its base ends are at (22, 73) and (262, 193), and its top ends at (22, 19) and (262, 139).
- `rail_y.png`: **288 × 216 px**. The same design rendered running along world +y (it descends from upper-right to lower-left). Render it separately, not as a mirror of `rail_x`, so the light stays consistent. Its base centre is at (142, 133), base ends at (262, 73) and (22, 193), top ends at (262, 19) and (22, 139).
- `rail_corner.png`: **128 × 144 px**. A corner post where two runs meet, about 1.2 × 1.2 m footprint and at most 1.3 m tall, with its base centre at (64, 104).

**4–5. Entry corridor into the facility (`landing_corridor_floor.png`, `landing_corridor.png`).** This is a covered walkway from the landing pad into the Separatist facility: 10 m long, 6 m wide, walls 3 m tall, with a closed facility door at the far end. It recedes from the pad toward the upper left of the screen. Make it as **two images with the same 672 × 504 px canvas and the same alignment**:
- `landing_corridor_floor.png`: the corridor's floor only, with everything else transparent.
- `landing_corridor.png`: walls, pillars and the door only, with no floor.

The floor's corners land at these pixels: mouth-left (656, 363), mouth-right (416, 483), far-left (256, 163), far-right (16, 283). The mouth's centre is (536, 423). The front wall (lower-left side) must be cut away low, Diablo II style, so a character inside is always visible. Use no roof, or only above the back wall. The back wall (upper-right side) and the door are complete. Underneath is open air over lava. If the underside shows, use steel truss like the pad's edge.

**6. Padmé's ship (`padme_skiff.png`).** Padmé's chrome Naboo star skiff from the film, landed on its gear with the boarding ramp lowered and visible. **1592 × 1112 px.** The nose points to world +x (screen lower-right). It is about 29 m long, at most 10 m wide and at most 6 m tall. The ground point under the ship's centre is pixel (796, 700). The ground under the nose tip is about (1376, 990) and under the tail tip about (216, 410). Include its soft ground shadow (falling to the lower right). The chrome should reflect mostly warm orange lava light, with no thin blue or red highlights that could look like lightsabers. Keep everything inside the canvas.

Deliver: `rail_x.png`, `rail_y.png`, `rail_corner.png`, `landing_corridor_floor.png`, `landing_corridor.png`, `padme_skiff.png`.
