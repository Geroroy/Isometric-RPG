# Mustafar remaining 14 assets

This package reuses the earlier finished assets, without new image generation. The ZIP contains exactly the 14 requested PNG filenames at its root, with no extra floors or other images. These are interim map assets to review again once the complete duel is playable.

| File | Dimensions | Format |
| --- | --- | --- |
| conf_wall_door_side.png | 768 × 256 | RGBA |
| ctl_gallery_edge.png | 1152 × 104 | RGBA |
| ctl_wall_window.png | 1152 × 256 | RGBA |
| ctl_wall_side.png | 1152 × 256 | RGBA |
| ctl_wall_front_low.png | 1152 × 64 | RGBA |
| ctl_wall_entry_low.png | 1152 × 64 | RGBA |
| ps_floor.png | 384 × 256 | RGB |
| ps_wall_back.png | 384 × 224 | RGBA |
| ps_wall_front_low.png | 384 × 64 | RGBA |
| ctl_stairs.png | 272 × 184 | RGBA |
| ctl_shield_generator.png | 200 × 208 | RGBA |
| ctl_holo_table.png | 160 × 144 | RGBA |
| pipe_segment.png | 352 × 232 | RGBA |
| collector_tower.png | 352 × 584 | RGBA |

Validation: exact dimensions; real alpha in all transparent files; opaque RGB passage floor; conference doorway fully transparent at x256–511,y64–255; gallery gap at x448–703 over all104rows; gallery fascia fully opaque at rows66–103 outside gap; balcony gap at x448–703; entry gap at x384–639; window aperture centers fully transparent. Pixel ranges are half-open when written as [start,end).

Four uploaded guides are pixel-identical to those used previously (stairs, shield console, pipe, tower). The holo-table guide uses the same projected box bounds with different internal helper marks. The prior derived guide added ellipses for the circular tabletop/footprint. No rendered guide marks remain.

Preserve complete sprite canvases. Lava-level/ground anchors from supplied guides: stairs(136,106), shield generator(100,146), holo table(80,92), pipe(174,112), tower(176,488). Terrain/collision geometry remains a game-side specification; fine silhouettes are illustrated and approximate. The pipe has square joining cuts and only its upper half visible. Test adjacent units after applying game texture filtering. The tower and control-console sprites are adaptations rather than exact film mesh reconstructions.

Reference review reused visually inspected footage/stills: the control-room film frame with consoles and tables, the official StarWars.com film still showing industrial pipes and collector vanes, and official production concept art with girder arms, fins, railings and volcanic cliffs. Production concept art is distinguished from final-film frames. No new film playback or model-viewer rotation was performed for this repackaging. Blue/red film illumination was deliberately omitted according to the game palette specification.

Sources:
- https://swrpggm.com/episode-iii-source-guide/ — control-room final-film image, locally inspected.
- https://www.starwars.com/news/the-starwars-com-10-best-fights — official final-film pipe/collector still.
- https://www.starwars.com/news/star-wars-insider-208-excerpt — official production concept art.

The earlier control and exterior production notes retain the full generation prompts and export details. No files in this package were regenerated or modified for this request; they were checked and assembled from the existing finished PNGs.
