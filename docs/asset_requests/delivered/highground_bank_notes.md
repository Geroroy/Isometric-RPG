# Mustafar high-ground bank

Output: highground_bank.png, 1512 × 992, real RGBA alpha outside the bank. Preserve the full canvas. Intended lava-level anchor is the supplied guide's near-left red cross at (16,492).

The guide defines a 24m-long ×13m-deep bank: 2m flat shore sand, 4m slope rising1.4m, then the upper flat and rear rock face. Intended projected guide lines:
- Shore: (16,492)–(976,972).
- Slope foot: (96,452)–(1056,932).
- Slope crest: (256,302)–(1216,782).
- Upper flat back: (536,162)–(1496,642).
- Rear rock crest: (536,16)–(1496,496).

The image uses illustrated, irregular terrain boundaries; crest, slope transitions and silhouette have approximate correspondence to these lines. Collision, walking height and landing positions should use the intended game geometry rather than infer height from terrain shading. This is an interim stage asset for later review in the completed map.

Reference inspection: visually inspected a wide final-film still showing Anakin on the craft and Obi-Wan above him on the dark granular bank. This informed the ash/scoria texture and orange reflected light. The rear wall, exact terrace shape and dimensions follow the user's guide rather than being asserted as measured film geometry. An official StarWars.com article and official ending-clip page were checked; the article's nearby image was a close duel shot, not useful bank geometry, and the clip was not played. No 3D viewer was inspected in this task.

Sources:
- https://www.netzwelt.de/buzz/203543_3-obi-wan-kenobi-7-arten-disney-plus-serie-star-wars-grundlegend-aendern.html — actual wide film still visually inspected.
- https://www.starwars.com/news/star-wars-revenge-of-the-sith-quotes
- https://www.starwars.com/video/you-were-the-chosen-one

Method: built-in image-generation tool; one targeted correction for smoother walking slope and subdued orange light; mechanical export to exact dimensions, alpha cleanup and guide alignment. No lava, character, guide grid or cast background included.

## Generation prompt

Use case: stylized-concept. Production terrain sprite highground_bank.png for isometric game recreating Revenge of the Sith's Mustafar ending. EXACT1512x992 canvas with REAL ALPHA everywhere outside bank. Image1 is exact geometry/canvas guide; image2 is actual final-film wide still for black ash/granular volcanicbank texture and subduedorange underlighting ONLY. Preserve user's guide geometry rather than film perspective. Detailed pre-rendered late1990sgame render matching prior Mustafarsets, but natural volcanic terrain, no industrial metal.
CAMERA: orthographic2:1dimetric, diagonals exactly+1/2 and-1/2,no perspective. Guide's worldlongaxis runs down-right24m; depth13m runs up-right. Critical footprintcyanvertices (16,492),(536,232),(1496,712),(976,972). Redcross groundanchor nearleftcorner(16,492); keep that placement. Do not center or shrink island in canvas.
TERRAIN crosssection from NEAR lower long shoreline toward back (up-right): 1) FLAT BLACKSAND strip2mdeep, nearshoreline (16,492)to(976,972); farboundary/grey SLOPEFOOT (96,452)to(1056,932). This whole2mstrip is FLAT at lava height, not a vertical frontcliff. 2) Continuous gentle4mwide ASH SLOPE rises1.4m, from slopefootline to CREST/ORANGEFRONT (256,302)to(1216,782). This is an inclined walkable plane, NOT a vertical rockwall or steps. 3) Broad FLAT upper7mdeep WALKABLETOP at1.4mheight, orangeplane corners (256,302),(536,162),(1496,642),(1216,782). 4) Along BACK longedge of flat top, rough darkbasalt ROCKFACE rising from base (536,162)to(1496,642) up to greyCREST (536,16)to(1496,496). Rearwall146pxhigh, irregularnatural crest aroundgreyline, not enormous mountain.
Exact silhouette's keyoutline nearleftshore16,492 then footprintfront976,972 then rightshore1496,712 then rearwallright1496,496 then rearwallleft536,16, with leftsideprofile following top536,162 -> slopecrest256,302 -> slopefoot96,452 ->shore16,492. Fills defined geometry, slightlyrough natural outeredges confinedwithincanvas; no thickfreestandingdioramabaseorunderslab.
MATERIALS: almostblackcharcoal volcanicash,sand,finescoria and darkbasalt. Walkable sand,slope,top smooth andeven, lowcontrast finegrain, onlysparse smallstones, no largeboulders orjagged obstacles onwalkingareas, no shinyfacets, no deepcrevices or glowingcracks. Rearrockface rough andfractured matteblack, subtleweathering, limitedcontrast. Gentleorange reflectedlavalight from below along shoreline and bottom-facingedges, weakestfartherinland. Softevenneutralupperleftlight to showshape. Preserve readable slopechange through gentletones, avoidhardcastshadows. No lava rendered, no moltenborder, nobrightorangehalo outside bank, no blueorredglows. Lavawillbecompositedbygameoutsidealpha. Nocharacters, sabers, fire, smoke, sparks, buildings, text, watermark. Delete ALL cyan/orange/greyguidegridlines and redcross from finishedimage; theirregionsbecometerrain. TrueRGBA, notblackbackgroundorcheckerboard.

## Correction prompt

Use case: precise-object-edit. Image1 edit target is Mustafar bank sprite. Image2 exact placementguide. Keep overall bank silhouette, rearrockwall, camera, darkashmaterials and allfourterrainzones. Correct ONLY walking slope and excessorangeglow: slope MUST be a continuous SMOOTH EVEN gentleincline1.4m up over4mhorizontal, not a steepcraggedledge. Position slopefoot atguidegreyline from(96,452)to(1056,932) andcrest atorangefrontedge(256,302)to(1216,782) in1512x992canvas. Thus extendtoe ofcurrentincline towardnearshore andsmoothout verticalridges, bigruts,boulders. Flatshorestrip remains2mwide betweennearshore(16,492)->(976,972) andslopefoot. Upperplateau remainsflatsmoothdarkash; rearrockfacealone staysrough. CRITICAL reduceorangeilluminationatbankouteredge byabout75percent: onlysoftdullorange reflectedlight from lava below, no emissivemoltenedgeborder orfire. Removeglowingcracks andsparks ifany, reduceorangeonslope. Overallblackcharcoal fineashes with lowcontrast socharactersread. Softevenlight. Noextra lava orground, truealphaeverywhereoutside bank, no paintedblack/checkerboard. No guide lines/grid/cross. Finalexact1512x992, sourcegeometryanchor remainsnearleftcorner(16,492). Highestrearcrest(536,16)->(1496,496).

