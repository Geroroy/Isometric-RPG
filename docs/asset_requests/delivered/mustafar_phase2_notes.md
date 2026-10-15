# Mustafar phase 2 asset notes

Generated with the built-in image generation tool, then exported to the requested PNG canvases. No code-generated substitute art was used.

## References inspected

- Original lava_tile.png supplied through the existing project files: orange/yellow-orange molten fissures and charcoal/brown crust.
- Official Mustafar landscape image: https://www.starwars.com/databank/mustafar
- Revenge of the Sith still with the duellists above lava: https://www.italyformovies.it/film-serie-tv-games/detail/6806/star-wars-episodio-3-la-vendetta-dei-sith
- All five attached geometric guides.

The assets are interpretations for this game's projection and readability, not exact reconstructions of individually identified film rocks. No claim is made that the full film was watched during this request.

## Export and integration

- Lava: 1024 × 1024 RGB, opaque. The generated texture was downsampled, and corresponding edge strips (24 pixels) were reconciled for zero pixel discontinuity on both tile axes. Inspect the repeated pattern in-engine as well.
- Rocks/cliffs: RGBA, uniform scaling and placement within the supplied guide prisms, no silhouette warping or colour grading during export. Low-alpha stray pixels were cleared. The guide cross remains the logical anchor; world dimensions and collision must use the request's logical metadata, not alpha bounding boxes. Natural silhouettes can fall below the top envelope.
- Smoke: 256 × 256 RGBA, premultiplied-alpha downsampling, feathered transparent borders. Engine opacity/fade controls remain appropriate for character readability.
- cliff_y was generated independently with upper-left lighting, not obtained by mirroring cliff_x.
- Exact filename, dimensions, PNG decoding, alpha, borders and lava-edge checks are recorded below. An assembled in-game readability test was not performed.

## Prompts

### lava_tile_v2.png

Use case stylized-concept. Create lava_tile_v2.png ONE 1024x1024 fully opaque seamless game texture. Input is original lava_tile.png COLOR reference: retain yellow-orange molten cores, orange to deep-red cooling fringes, charcoal black-brown basalt. NEW pattern: flat orthographic strictly straight TOP DOWN 16x16 metres, 64px/metre, no lighting direction or shadows. About TWO THIRDS area dark cooled crust, larger rugged basalt plates, thin glowing fissures and ONLY TWO OR THREE wider slow molten channels. Overall substantially darker and lower contrast than reference, subordinate to duel characters. Evenly distributed irregular pattern with no focal bright spot, no giant distinctive shape, no holes/pits, no objects. Physically continuous seamless tile on ALL FOUR edges. Unlit/albedo style, no perspective, no sky, no border, no text. Crust is surface not rocks standing up. Fill whole square. Output 1024x1024.

### rock_low.png

Use case: stylized-concept. Create ONE production game sprite rock_low.png. Reference is ONLY a precise geometric guide, not an aesthetic reference. Render rough fractured Mustafar black basalt as in Revenge of the Sith: low broad volcanic outcrop 2.5m by 2m footprint, 1.6m tall, charcoal black-brown muted rock, restrained texture, late-90s realistic pre-rendered isometric game art Diablo II / Commandos 2. Orthographic 2:1 dimetric, soft upper-left light, top catches soft light, modest darker side shading. No ground plane or cast shadow. Only tiny faint orange emissive cracks low down and subtle orange contact glow at base, no blue/red illumination, no lava pool. CRITICAL: preserve the reference canvas aspect 216x208 and the EXACT guide projection/placement: cyan bottom diamond is footprint, orange elevated diamond is maximum top envelope, red cross is ground anchor. Draw natural uneven silhouette within the prism, fill most of the prism width with broad rock shoulders and a low craggy top. Remove ALL cyan/orange/red/white guide lines, grid, cross, and background. Real transparent alpha around the one isolated object. No text, no frame. Output at 216x208 if supported, otherwise exact same composition normalized to that canvas, not auto-cropped.

Revision:

Edit the FIRST image (low basalt game rock). The SECOND image is a precise geometry guide, not an aesthetic image. Keep the rock's realistic fractured charcoal/black-brown basalt, faint orange basal cracks and soft upper-left lighting. CHANGE THE SHAPE: make it substantially TALLER as a squat BLOCK-SHAPED volcanic outcrop, not a flattened pile. Actual dimensions 2.5m x 2m base, 1.6m vertical height. Its total projected silhouette should be approximately as tall as it is wide. In the second 216x208 canvas the base is the cyan diamond with vertices (16,134),(96,95),(196,145),(116,184), and upper envelope is (16,56),(96,17),(196,66),(116,105). Put the jagged upper crest near y=25-40, shoulders span x=24..187, full base sits on the cyan diamond. Ground anchor remains (106,140). Vertical exposed rock faces must be about 78 pixels tall in target coordinates. Preserve the 2:1 orthographic projection. Preserve geometry placement on the entire guide canvas, all guide lines removed, no grid/cross, TRUE transparent alpha, no ground shadow, no floor/lava pool, no text, no new objects. Render one isolated asset at exact 216x208 or proportional higher resolution. Do not add broad extra margins.

### rock_mid.png

Use case stylized-concept. ONE production sprite for a 2D isometric Mustafar Revenge of the Sith game. Realistic late-90s pre-rendered Diablo II / Commandos 2 rendering, crisp detailed natural volcanic basalt, charcoal grey-black and black-brown, restrained local contrast. Rough sharp fractured surfaces, dark masses with readable planes, soft even light from UPPER LEFT, faint orange underglow ONLY at base and a few tiny low orange cracks. No lava ground plane, no floor, no cast shadow, no text or grid, no blue/red light, no characters. Input image is a geometric guide: cyan is exact bottom footprint, orange maximum top envelope, red cross exact ground anchor. Preserve composition and orthographic true 2:1 projection of reference, not perspective. Fully remove all guide lines/cross/grid; real transparent background. Keep entire natural silhouette INSIDE guide prism including base. Canvas must retain input aspect and composition, do not auto-crop. Canvas 312x320. Jagged broad outcrop 4x3m, 3m tall, broken into two or three interlocking basalt blocks. Uneven top below orange envelope, full broad base fitting cyan diamond.

### rock_spire.png

Use case stylized-concept. ONE production sprite for a 2D isometric Mustafar Revenge of the Sith game. Realistic late-90s pre-rendered Diablo II / Commandos 2 rendering, crisp detailed natural volcanic basalt, charcoal grey-black and black-brown, restrained local contrast. Rough sharp fractured surfaces, dark masses with readable planes, soft even light from UPPER LEFT, faint orange underglow ONLY at base and a few tiny low orange cracks. No lava ground plane, no floor, no cast shadow, no text or grid, no blue/red light, no characters. Input image is a geometric guide: cyan is exact bottom footprint, orange maximum top envelope, red cross exact ground anchor. Preserve composition and orthographic true 2:1 projection of reference, not perspective. Fully remove all guide lines/cross/grid; real transparent background. Keep entire natural silhouette INSIDE guide prism including base. Canvas must retain input aspect and composition, do not auto-crop. Canvas 160x344. Tall pointed basalt spire with 1.6x1.6m base, 5m tall. Tapered sharp pinnacle at upper envelope, slender vertical mass, broad fractured base at cyan footprint; not a wide rock or multiple pinnacles.

### cliff_x.png

Use case stylized-concept. ONE production sprite for a 2D isometric Mustafar Revenge of the Sith game. Realistic late-90s pre-rendered Diablo II / Commandos 2 rendering, crisp detailed natural volcanic basalt, charcoal grey-black and black-brown, restrained local contrast. Rough sharp fractured surfaces, dark masses with readable planes, soft even light from UPPER LEFT, faint orange underglow ONLY at base and a few tiny low orange cracks. No lava ground plane, no floor, no cast shadow, no text or grid, no blue/red light, no characters. Input image is a geometric guide: cyan is exact bottom footprint, orange maximum top envelope, red cross exact ground anchor. Preserve composition and orthographic true 2:1 projection of reference, not perspective. Fully remove all guide lines/cross/grid; real transparent background. Keep entire natural silhouette INSIDE guide prism including base. Canvas must retain input aspect and composition, do not auto-crop. Canvas 512x568. One elongated 10m long x 2m deep x 6m tall cliff segment, running screen UPPER LEFT to LOWER RIGHT exactly as guide. A continuous towering fractured cliff face toward viewer, narrow rough ridge at top. The long top edge slopes DOWN to right (slope +0.5); base edge likewise slopes DOWN to right. Not a triangular mountain, not a compact boulder. Preserve full 10m length and 6m height, natural broken ends for placing copies end-to-end.

### cliff_y.png

Use case stylized-concept. ONE production sprite for a 2D isometric Mustafar Revenge of the Sith game. Realistic late-90s pre-rendered Diablo II / Commandos 2 rendering, crisp detailed natural volcanic basalt, charcoal grey-black and black-brown, restrained local contrast. Rough sharp fractured surfaces, dark masses with readable planes, soft even light from UPPER LEFT, faint orange underglow ONLY at base and a few tiny low orange cracks. No lava ground plane, no floor, no cast shadow, no text or grid, no blue/red light, no characters. Input image is a geometric guide: cyan is exact bottom footprint, orange maximum top envelope, red cross exact ground anchor. Preserve composition and orthographic true 2:1 projection of reference, not perspective. Fully remove all guide lines/cross/grid; real transparent background. Keep entire natural silhouette INSIDE guide prism including base. Canvas must retain input aspect and composition, do not auto-crop. Canvas 512x568. One elongated 10m long x 2m deep x 6m tall cliff segment running screen UPPER RIGHT to LOWER LEFT exactly as guide. A continuous towering fractured cliff face toward viewer, narrow rough ridge at top. Long top edge slopes UP to right (slope -0.5); base likewise slopes UP to right. Generate independent geometry and own UPPER LEFT lighting, NOT mirrored from opposite orientation. Not a triangular mountain or compact boulder. Full 10m length, 6m height, broken natural ends for copies end-to-end.

### smoke_a.png

Use case stylized-concept. Create ONE 256x256 game VFX smoke_a.png. Flat camera-facing isolated rounded billow of dark grey-black volcanic smoke/ash, faint subdued warm orange underglow along lower edge. Organic billowing lobes with soft translucent internal detail, no hard outline. Entire cloud centered, fully feathered soft alpha edges into TRUE TRANSPARENCY with at least 24px completely transparent margin ALL SIDES, nothing touches edge. No background, checkerboard, ground, object, flame, sparks, blue/red lighting, text, drop shadow. Neutral detailed realistic pre-rendered game effect; restrained low contrast. Single cloud not sheet.

### smoke_b.png

Use case stylized-concept. Create ONE 256x256 game VFX smoke_b.png. Flat camera-facing single thin wispy horizontally stretched ash-grey volcanic smoke cloud, delicate diffuse layered curls, more translucent and elongated than rounded dense smoke. Neutral grey, no colored glow. Entire isolated wisp centered, fully feathered soft alpha edges into TRUE TRANSPARENCY, at least 24px completely transparent margin ALL SIDES, nothing touches edge. No background, checkerboard, ground, flames, sparks, blue/red light, text, hard outlines or cast shadow. Realistic detailed pre-rendered game effect, subdued contrast.

### smoke_c.png

Use case stylized-concept. Create ONE 256x256 game VFX smoke_c.png. Flat camera-facing single dense dark charcoal volcanic smoke puff, irregular rounded lobes and brighter muted grey top catching soft upper-left light, dark lower body. No orange glow. Fine softly billowing internal volume, restrained contrast. Entire cloud centered with fully feathered translucent edges into TRUE TRANSPARENCY and at least 24px fully transparent margin ALL SIDES, nothing touches edge. No background or checkerboard, ground, hard outline, flame, sparks, text, cast shadow, blue/red glow. Realistic pre-rendered game effect, not cartoon.



## Lava pattern revision

Edit this lava texture for a production repeating game ground tile. KEEP its original yellow-orange/deep-red molten hues, charcoal/black-brown crust detail, fully opaque flat strictly TOP-DOWN view, dark overall exposure and 1024x1024 square output. MAIN CORRECTION: REMOVE THE LONG BRIGHT DIAGONAL CHANNEL across the image. Redistribute that lava into THREE SHORTER, gently bending wider channel SECTIONS scattered at different locations/orientations, embedded in irregular thin glowing cracks. No one continuous glowing line should span or dominate the tile, no central focal spot, no radial hub, no repeated circles or islands, no long straight line. About TWO THIRDS dark crust area or slightly more, sparse muted orange fissures; low contrast background for blue lightsaber duellists. Flow is slow, no splashes, no flame, no objects or holes. Must be seamlessly TILEABLE on all four edges, with no visible strip or border, no directional lighting or cast shadows, no perspective. 16x16 metres of surface. Fill entire square. Return one opaque texture only.

## Validation results

```json
[
  {
    "file": "lava_tile_v2.png",
    "size": [
      1024,
      1024
    ],
    "mode": "RGB",
    "opposite_edge_max_difference": 0,
    "mean_luminance": 29.74,
    "original_mean_luminance": 44.23
  },
  {
    "file": "rock_low.png",
    "size": [
      216,
      208
    ],
    "mode": "RGBA",
    "alpha_range": [
      0,
      255
    ],
    "alpha_bbox": [
      31,
      60,
      181,
      177
    ],
    "border_alpha_max": 0
  },
  {
    "file": "rock_mid.png",
    "size": [
      312,
      320
    ],
    "mode": "RGBA",
    "alpha_range": [
      0,
      255
    ],
    "alpha_bbox": [
      36,
      102,
      279,
      295
    ],
    "border_alpha_max": 0
  },
  {
    "file": "rock_spire.png",
    "size": [
      160,
      344
    ],
    "mode": "RGBA",
    "alpha_range": [
      0,
      255
    ],
    "alpha_bbox": [
      23,
      56,
      138,
      323
    ],
    "border_alpha_max": 0
  },
  {
    "file": "cliff_x.png",
    "size": [
      512,
      568
    ],
    "mode": "RGBA",
    "alpha_range": [
      0,
      255
    ],
    "alpha_bbox": [
      31,
      67,
      480,
      545
    ],
    "border_alpha_max": 0
  },
  {
    "file": "cliff_y.png",
    "size": [
      512,
      568
    ],
    "mode": "RGBA",
    "alpha_range": [
      0,
      255
    ],
    "alpha_bbox": [
      31,
      76,
      482,
      544
    ],
    "border_alpha_max": 0
  },
  {
    "file": "smoke_a.png",
    "size": [
      256,
      256
    ],
    "mode": "RGBA",
    "alpha_range": [
      0,
      254
    ],
    "alpha_bbox": [
      35,
      41,
      222,
      211
    ],
    "border_alpha_max": 0
  },
  {
    "file": "smoke_b.png",
    "size": [
      256,
      256
    ],
    "mode": "RGBA",
    "alpha_range": [
      0,
      254
    ],
    "alpha_bbox": [
      18,
      92,
      243,
      172
    ],
    "border_alpha_max": 0
  },
  {
    "file": "smoke_c.png",
    "size": [
      256,
      256
    ],
    "mode": "RGBA",
    "alpha_range": [
      0,
      254
    ],
    "alpha_bbox": [
      32,
      35,
      227,
      226
    ],
    "border_alpha_max": 0
  }
]
```
