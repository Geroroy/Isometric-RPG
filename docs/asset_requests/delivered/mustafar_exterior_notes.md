# Mustafar exterior assets

Seven PNGs made using the built-in image-generation tool, followed by mechanical canvas export and guide calibration.

## Export specification

| File | Pixels | Background | Supplied anchor (x,y) |
| --- | --- | --- | --- |
| terrace_floor.png | 1280 × 320 | Opaque RGB | — |
| catwalk_segment.png | 352 × 280 | RGBA | 176,150 |
| catwalk_broken.png | 352 × 280 | RGBA | 176,150 |
| lava_fall.png | 312 × 568 | RGBA | 156,478 |
| pipe_segment.png | 352 × 232 | RGBA | 174,112 |
| collector_arm.png | 1032 × 576 | RGBA | 516,281 |
| collector_tower.png | 352 × 584 | RGBA | 176,488 |

Coordinates are from the supplied red crosses, not auto-trimmed image centers. Preserve the complete canvases when importing. Alpha is real and checked; no guide lines are included. Texture scale for the flat terrace is 64 pixels/metre. Isometric pieces follow the guide axes.

## Placement and modular joins

- Catwalk long axis runs down-right. Its calibrated deck plane corners are approximately (16,110), (96,70), (336,190), (256,230), with center at the supplied anchor. Repeat the intact segment using a screen-space offset of (240,120). Upper-left and lower-right ends are open and square; neither has a cross railing. Broken segment keeps its upper-left join and has the torn end at lower right. Pixel-level seam appearance should be checked in the game after texture filtering is set; these are illustrated sprites rather than meshes with mathematically identical boundary vertices.
- Pipe long axis runs up-right. Repeat along approximately (280,-140), using the supplied guide placement. Only the upper half of the pipe is visible; the lava is drawn separately. Align its immersion plane to the lava surface.
- Collector arm runs up-right. Its walkable orange guide plane is (16,456), (896,16), (1016,76), (136,516). It has no attached tower or railing. Place tower separately, keeping its anchor at lava level.
- Lava fall has its own compact molten pool at the foot. Lava glow is orange-yellow; the metal assets have only restrained amber lights and neutral upper-left illumination.

The guide geometry informed export calibration. Irregular rock edges, damaged girders, and some fine details have approximate alignment, rather than exact CAD correspondence.

## Reference inspection and limits

Visually inspected the live-action film still hosted in StarWars.com's Best Fights article, showing the duel on exposed industrial pipes with collector vanes in the background. Also inspected official production concept art hosted in the Star Wars Insider 208 excerpt, showing the railings, girder arms, tall collector fins and lava cliffs. The concept art informs design vocabulary; it is not represented as a final-film frame.

Sources:
- https://www.starwars.com/news/the-starwars-com-10-best-fights
- https://www.starwars.com/news/star-wars-insider-208-excerpt
- https://www.vfxhq.com/tvaziri/ep3_interview.html — indexed artist interview found, but direct page access failed; not used as visual evidence.
- https://cults3d.com/en/3d-model/game/star-wars-mustafar-duel-diorama-2-lava-collection-arm-for-3-75-and-6-figures — matching fan diorama listing found. No interactive viewer was inspected or model downloaded. Earlier Cults browser access in this session encountered human verification, so no rotating-view claim is made.

A secondary film image retrieved from an Episode III source guide showed the indoor control room, so it was excluded from exterior design references. Existing ctl_gallery_floor.png and ctl_stairs.png were used for game material/style continuity. The tower and arm are adaptations of the film/concept vocabulary to the user's stated game dimensions and guides, not a traced 3D reconstruction.

## Final prompt set

Shared generation constraints: detailed rendered worn dark grey metal, restrained dark brown rust, dull brass trims, tiny amber indicators, low surface contrast, soft upper-left light; orthographic 2:1 dimetric projection for sprites; real alpha outside sprites; no characters, text, blue/red illumination, background, watermark or guide marks.

### terrace_floor.png

Create terrace_floor.png exactly 1280 x 320 pixels, opaque. FLAT architectural floor texture, straight overhead, no perspective or isometric angle. A 20m wide x5m deep balcony terrace floor, 64px/m. Use image1 solely for identical metal material/design language. Extend into 20m wide floor with broad worn grey panel plates, small rectangular maintenance hatches, slim brass perimeter strips and understated grating along long edges. Sparse tiny amber recessed edge lamps. Entire image filled by floor, flush rectangular edges, no railing or vertical walls, no bevelled 3D slab thickness, no cast shadows. Lower contrast than fighters.

### catwalk_segment.png

Create catwalk_segment.png exactly 352 x280. Image1 exact canvas placement guide; image2 material/style; image3 official movie production concept only for industrial construction vocabulary (ignore its lighting/characters). 6m long x2m wide narrow open grated catwalk along down-right long axis. CRITICAL WALKING DECK lies at red cross lava datum, NOT at orange top: deck plane polygon approximately (16,110),(96,70),(336,190),(256,230). Top rails follow orange outline (16,56),(96,16),(336,136),(256,176),1.1m above deck; girders descend below deck to cyan outline. Low open two-bar railings both long sides. Repeating vertical railing posts, dark open metal grating, skeletal triangular girders underneath. Grating apertures and spaces between girders/railings genuinely transparent. Both ends cut flat square, no end barriers/cross-rail, no end stair, no ground, no lava, no projecting caps at ends. Identical cross-section at each end so translated units join seamlessly. Soft subtle ambient self-shadow only, keep external alpha clean. Fill guide accurately and remove all guide markings.

### pipe_segment.png

Create pipe_segment.png exactly352 x232. Image1 exact geometryguide, image2 game material style, image3 filmstill industrial pipe material reference only. Large cylindrical rusted industrial service pipe7m long diameter0.9m, long axis from lower-left toward upper-right. Pipe half submerged so ONLY UPPER HALF of cylinder rendered, lowerhalf invisible beneath flat lava datum. Walkable narrow upper curved crown; restrained longitudinal metal seams and regularly spaced shallow coupling bands. Crown at orange line, silhouette fits guide up-right axis from nearleft(16,156/192) toward upperright(296,16/56),(332,34/74). Both ends cut square and open, same cross section, no giant end flange, no end caps, no lava waterline glow baked in, no lava rectangle underneath. No supports/legs. Honest half-pipe silhouette with transparent exterior. Delete guide lines.

### lava_fall.png

Create lava_fall.png exactly312 x568. Image1 exactcanvas guide; image2 official production concept for black volcanic cliff and molten fall appearance. Black volcanic cliff6m wide8m tall, thin natural irregular depth within guide, broad face faces viewer down-left and width axis slopes down-right. Tall slab silhouette follows orange top (16,36),(56,16),(296,136),(256,156) with sheer face down to cyan foot (16,428),(56,408),(296,528),(256,548). Cragged near-black basalt with cooling lava crust. Orange-yellow molten lava pours down face in one broad flowing channel and small branch, pools in small irregular glowing pool hugging foot, tightly inside cyanfootprint. Mostly dark basalt, localized molten orange-yellow highlights, no overall bright white lava sheet. Not a scene, no horizon or floorplane. Transparent outside rock/lava silhouette and plume wisps, no blue or red glow. Cliff upperleftsoftlight. Delete allguide lines.

### collector_arm.png

Create collector_arm.png exactly1032 x576. Image1 exactcanvas guide, image2 materialstyle, images3/4 movie industrial arm reference. One LONG low freestanding lava collector arm22m long3m wide. Rusted sturdy girder deck, no railing. Orthographic2:1 longaxis lowerleft to upperright. Walking deck must be orange plane with corners(16,456),(896,16),(1016,76),(136,516); low heavy beam body hangs down40pixels to cyanbottom(16,496),(896,56),(1016,116),(136,556). DO NOT shorten/center/rescaleguide, cover its full22m length. Segmented wornmetal walkingplates with subdued narrow grating strips on longedges, continuous thick girders, repetitive exposed side diagonal struts and recesses, few tinyamber lamps. End faces square sturdy steel beams, no vertical tower attached, no huge hinge projecting beyondguide, no cables, railings, stilts, supports, pedestal, lava or background. It remains usable floatingfreestandingaftercollapse. Removeguidelines. Preserve fullthinelongatedparallelogram.

### collector_tower.png

Create collector_tower.png exactly352 x584. Image1 exactcanvas guide, image2 game materialstyle, images3/4 official concept/filmstill for collector's distinctive long vertically-curvedvanes and cage construction. Rusted industrial lava-collector tower4x4mfootprint,8m tall. Eight tall weathered curved metal vanes arrayed around an open cylindrical cage, heavy narrow struts, pipes, braced circular hoops, machinery hub where arm attaches but NOlongarm attached. Tall darkmechanical cage, not office building or simplelattice radio tower. Vanes are elongatedverticalfinblades with gently curvedprofiles, angled backand heldbyrepeatedrings, recognizablefilm collector industrial silhouette. Smallamber indicator lights nearupperhub. Base diamond within(16,488),(176,408),(336,488),(176,568), highesttop within orange(16,96),(176,16),(336,96),(176,176), redanchor(176,488) groundlava level.8mverticalheight roughly392pixels. True alpha seen through holes betweenvanes/struts. Standalone no lava or giant baseplatform, no chimney smoke, no domedsolidroof, noattachedlongarm. Soft upperleftlight and lower-rightselfshadow. Removeguide.

### catwalk_broken.png

Use case: precise-object-edit. Edit target image1 intact Mustafar industrial catwalk. Image2 geometry guide. Make catwalk_broken.png352x280 real alpha. Preserve image1 material, lights, railingpostplacement, 2:1 orthographicview, entire upper-left two thirds, canvascomposition and walkingdecklevel EXACTLY. Change ONLY last approximately1.5m at LOWER-RIGHT end: violently torn off, lower-right terminal deck/grating missing, jagged snapped beam ends, bent railingstubs, twisted grated metal and supportgirders dangling vertically downward within lower-right guide outline into lava below. No lava rendered, no flames, no extrabackground. The upper-left cut end stays square for joining to intactcatwalk. DO NOT break upper-leftend. Low contrast darkgreymetal, subdued rust, brass, tinyamberlights, softupperleftlight. Deck at redanchorheight, railsabovedeck, girdersbelow. Remove guide lines/coloredmarks/grid; preserve true alpha apertures/background. Keep original full segment alignment and scale.

### catwalk_segment.png — railing correction

Use case: precise-object-edit. Image1 EDIT TARGET exported game sprite, image2 EXACT GEOMETRY GUIDE. Correct ONLY HEIGHT OF RAILINGS in image1. Keep walkingdeck,girders,grating,allendpoints,downrightlongaxis,cutends,materials,camera,canvasalignment EXACTLY SAME. Railings currentlyonlyabout0.6m; make1.1m tall with two bars and uprightpoststaller. In352x280canvas, walkingdeckcorners remain (16,110),(96,70),(336,190),(256,230), intact toprail ends shouldreachguideorangepoints (16,56),(96,16),(336,136),(256,176). Increaseverticalrailheight to54px, keepdeckheightatredcross150. Bothsquareends completelyopen, no endrailing, unitsjoinendtoend. No guidecoloredlines/grid, nocharacters,noextraobjects,nobackground,nolava. Real alpha. Matchdarkgreywornmetal tinyamber brass trims upperleftsoftlight. EXACT352x280canvas.

### catwalk_broken.png — railing correction

Use case: precise-object-edit. Image1 EDIT TARGET exported game sprite, image2 EXACT GEOMETRY GUIDE. Correct ONLY HEIGHT OF RAILINGS in image1. Keep walkingdeck,girders,grating,allendpoints,downrightlongaxis,cutends,materials,camera,canvasalignment EXACTLY SAME. Railings currentlyonlyabout0.6m; make1.1m tall with two bars and uprightpoststaller. In352x280canvas, walkingdeckcorners remain (16,110),(96,70),(336,190),(256,230), intact toprail ends shouldreachguideorangepoints (16,56),(96,16),(336,136),(256,176). Increaseverticalrailheight to54px, keepdeckheightatredcross150. PRESERVE lower-rightend torn away, jagged bent girders/grating hangingdown, brokenrailends. Raise only intactrailings; donotrebuildbrokenend. No guidecoloredlines/grid, nocharacters,noextraobjects,nobackground,nolava. Real alpha. Matchdarkgreywornmetal tinyamber brass trims upperleftsoftlight. EXACT352x280canvas.


