# ChatGPT prompt — STAGE 01 railings + corridor, second pass (copy everything below the line, attach the 4 guide PNGs)

Attach: `docs/asset_requests/guides/rail_x_guide.png`, `rail_y_guide.png`, `rail_corner_guide.png`,
`landing_corridor_guide.png`.

---

Thank you! The ship works perfectly and is now in the game. The railings and the corridor can't be used yet: they are drawn at a steeper angle than the game's camera. In the game's 2:1 isometric view, an edge running along the ground slopes exactly 1 px down for every 2 px across (about 26.6°). Your railings slope about 0.63 and the corridor about 1.0 (45°), so they don't line up with the landing pad's edges or join end to end.

Please redo these 5 images. Use the attached guide images: each guide is the exact canvas size. Draw the object filling the wireframe box (cyan = its footprint on the ground, orange = its top, grey = its vertical edges, the faint grid = 1 m on the ground, the red cross = its ground anchor point), then delete the guide lines. The output must be a real transparent PNG (true alpha channel, not a painted checkerboard), at exactly the guide's size.

1. `rail_x.png` (288 × 216, guide `rail_x_guide.png`): a 6 m railing section along the box. It sits ON the pad's floor, so there is no truss or beam below it. It is a slim railing about 1.0–1.1 m tall on a low kerb, open and see-through, matching your previous design's brass-topped posts. Both ends must join seamlessly with copies of itself.
2. `rail_y.png` (288 × 216, guide `rail_y_guide.png`): the same railing running the other way (as in the guide). Render it with the same lighting, not as a mirror image.
3. `rail_corner.png` (128 × 144, guide `rail_corner_guide.png`): the corner post where two sections meet.
4. `landing_corridor_floor.png` (672 × 504, guide `landing_corridor_guide.png`): only the corridor's floor, filling the cyan rectangle (10 m long, 6 m wide), with everything else transparent. The corridor runs from the landing pad (the red cross, lower right) to the facility door (upper left).
5. `landing_corridor.png` (672 × 504, same guide): only the walls, pillars and the closed door at the far (upper-left) end, 3 m tall, standing on the cyan rectangle's long sides and far end. The front wall (the lower-left long side) must be cut down low, Diablo II-style, so a character inside stays visible. No roof over the floor.

Same style as before: dark grey worn metal, dull brass trims, light from the upper left, soft shadows to the lower right, no lava glow baked in, no thin bright blue or red lines.
