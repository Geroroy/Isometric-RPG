# Mustafar film map pass 1 — 13 assets

The supplied request ZIP was unpacked and all seven film frames, eight match images and six guides were visually inspected. Eight assets were newly rendered with the built-in image-generation tool; five flat wall assets reuse exact source pixels by cropping/repeating the supplied wall images. No existing uploaded file was overwritten.

## Output and anchors

| File | Exact dimensions | Format | Ground anchor |
| --- | --- | --- | --- |
| ctl_long_table.png | 392 × 264 | RGBA | (196,155) |
| ctl_door_pillar.png | 104 × 136 | RGBA | (50,97) |
| corr_frame_far.png | 72 × 216 | RGBA | (33,186) |
| corr_frame_near.png | 72 × 96 | RGBA | (33,69) |
| corr_junction_floor.png | 256 × 256 | RGB opaque | — |
| corr_junction_pier.png | 64 × 224 | RGBA | — |
| corr_junction_wall_low.png | 256 × 64 | RGBA | — |
| corr_side_floor.png | 192 × 768 | RGB opaque | — |
| corr_side_wall_end.png | 192 × 128 | RGBA | — |
| corr_side_wall_low.png | 768 × 64 | RGBA | — |
| corr_side_wall_corner.png | 256 × 128 | RGBA | — |
| conf_table_long.png | 592 × 352 | RGBA | (296,195) |
| guide_light.png | 64 × 56 | RGBA | (32,29) |

Preserve full canvases when importing. Flat textures use the requested 64px/metre scale and stand upright without an additional isometric render. Sprite geometry was fitted to the guide envelopes, with mechanical correction of table top planes. Fine silhouettes, feet, bevels and cut-surface angles remain illustrative, rather than exact CAD reconstructions. Validate these interim assets against the assembled map before final art review. The small landing-pad lamp occupies approximately x16–48,y17–36 within its larger64×56canvas; do not auto-trim and rescale it to fill the cell.

The control table has a solid trapezoid body, dark projection surface and no holograms. The council table is a single longer piece with repeated top panels and feet, separate from chairs. Both corridor ribs and the door pillar are standalone pieces; their near/cut variants expose internal metal framing. No cast shadows were generated for these pieces. The guide-light lens is passive grey-blue glass, not a blue emitter.

## Film evidence versus map design

- film_12920.jpg directly shows the central control-room table's solid, sloping block body. Its upper projection surface was reconstructed from that view and the request; holograms and blue light were omitted.
- film_12911.jpg and film_12915.jpg show the heavy doorway ribs, leaning outlines and stepped/sawtooth profiles. The low cut heights are game visibility adaptations specified by the request.
- film_12887.jpg and film_12911.jpg show repeated corridor frames and lamps near their bases. The standalone sprite construction follows those shapes, adapted to the supplied narrow boxes.
- film_13142.jpg and film_13148.jpg show the long council table; match/conf_table.png controls exact panel/foot design vocabulary. The additional plates and feet are an extension of that game asset, not a claim that the film shows the same exact count.
- landing_clip_05s.jpg shows floor lamps in the landing pad. The supplied floor_bay_A.png controls their metal color; the lens is unlit because the game supplies illumination.
- The side passage is explicitly not shown in the film. Its floor and walls continue supplied corridor materials and implement the requested map connection.

All film images used here were provided inside this request. No additional video playback or 3D-viewer rotation was performed in this batch.

## Exact wall reuse

Source images are in the uploaded ZIP's match/ directory. Coordinates below are pixel crops; no scaling was applied to the wall textures.

| Output | Source and operation |
| --- | --- |
| corr_junction_pier.png | ps_wall_back.png: crop64×224 at(320,0), retaining the rightmost upright beside the opening |
| corr_junction_wall_low.png | ps_wall_front_low.png: crop256×64 at(64,0) |
| corr_side_wall_end.png | ps_wall_back.png: crop192×128 at(192,96), low2m section |
| corr_side_wall_low.png | ps_wall_front_low.png repeated twice horizontally,384+384=768px |
| corr_side_wall_corner.png | ps_wall_back.png: crop256×128 at(128,96), low2m section |

The crops fill their prescribed rectangular wall canvases; therefore an alpha channel is present even where the wall fills most or all pixels. This is not a painted background. Doorway openings should be formed by map placement around these wall pieces, not by scaling or painting transparency into their centers.

## Generation prompts

Shared instructions:

Use case: stylized-concept. Production sprite for the existing Mustafar duel game. Use supplied match asset for EXACT same rendered style/materials: dark worn charcoal-grey metal, restrained rust/grime, dull brass accents, tiny amber instruments when specified. Soft even illumination from upperleft for sprites; low surfacecontrast socharactersandblue lightsabersread. Nocharacters,text,logos,watermark,blue/red glow,fire,lava,background,baseplate,castshadow. Transparent means realalpha, never paintedcheckerboard. Guides are exactcanvases: cyanfootprint,orangetop,redgroundanchor. RemoveALLguide/gridlines/cross. Isometric=orthographic2:1dimetric horizontalaxes slope+1/2 and-1/2,verticalsvertical,no perspective. Don't copy cinematicglows/characters from filmrefs.

### ctl_long_table.png

392x264 RGBA. Image1 placementguide,image2 filmforegroundcentralholotable,image3 materialonly (NOTlegs/design). Longcentral control-roomholo-table7mx2mx1m. Solidheavyblock withslopedtrapezoidsides, NO LEGS, wideflatdarkglass projectionsurfaceacrossfulltop withsmallunlitprojectoraperturesandtinyamberinstrumentsalongrim. ProjectorsOFF,nohologramsorblue. Longaxisdownright. Topplaneapprox(16,56),(96,16),(376,156),(296,196),bottom49pxbelow tocyan(16,105),(96,65),(376,205),(296,245),groundanchor196155. Fillguidebox,notcentered miniature. Cornerclippedslightly, deeppanelrecessesonsolidangledbody. Nochair.

Reference roles/paths: ctl_long_table_guide.png, ref/film_12920.jpg, match/conf_table.png.

### ctl_door_pillar.png

104x136 RGBA. One heavy leaning/slanted doorjambpillar, thickribwithsawtooth steppededgesasfilmrefs2/3 besidecontrolroomcorridordoor.0.8x0.9mfootprint,cutat1.3m; exposedcuttop darkmetal crosssectionwithinnerframing, identicalcutmaterialtoimage4lowwall. Footprintcyan diamond approx(16,96),(52,80),(84,96),(48,114), orangeCUTTOPwithin(16,33),(52,16),(84,33),(48,50). Anchor50,97. Gentleleaninwardwithinbox, broadheavymetalbase, boldangularsawtoothprofileontheinneredge, charcoalgreyduraniumsubduedbrassverticalaccent, nounder-floorbaseplate,nolamp. Fullguideheight,removeguide.

Reference roles/paths: ctl_door_pillar_guide.png, ref/film_12911.jpg, ref/film_12915.jpg, match/ctl_wall_entry_low.png.

### corr_frame_far.png

72x216 RGBA. SINGLEcorridorfarwall structuralrib3.3mtall,0.35mwide,0.5mstandsoutfromwall. Heavyverticalmetalribwithbroadflaredbase,gentlyleansINWARDtowardcorridorasit rises, asfilmrefs2/3 repeatedribs, NOT completearchway, nopartofwallattached. OneSMALLwarm-whitelamp insetatfoot, pale lensnosurroundingglow (gameadds light). Greywallmaterial image4. Guidefootprintwithinx16..50,y178..194,anchor33,186,topwithin x16..50,y16..33. Tallthincolumn fillsguideheight; leaningprofile mustfitthisenvelope. Verticalflatouterback,taperedinwardfacingedge,mechanicalribseams,lightdullbrasstrim. Noextracablesor largeprojections,nobigpedestal.

Reference roles/paths: corr_frame_far_guide.png, ref/film_12887.jpg, ref/film_12911.jpg, match/ps_wall_back.png.

### corr_frame_near.png

72x96 RGBA. Nearwall versionofsamefarwallcorridorstructuralrib fromfilmrefs,but ONLY its0.9mtallbroadbase. Cutcleanlyacrosstop; exposedhorizontalmetalcutcrosssection,darkinnerframing,matchinglowwallimage4.0.35mwide,0.5mstandsout, baseleans/tapersinward. Footprintwithin x16..50,y61..77; redanchor33,69; orangeCUTTOPwithin x16..50,y16..32. SINGLEbase notcompletewall, notarchway. Smallpale warm-whitefootlamplensunlit/no spill, samefarframebaseasfilm. No floor/shadow.

Reference roles/paths: corr_frame_near_guide.png, ref/film_12887.jpg, ref/film_12911.jpg, match/ps_wall_front_low.png.

### conf_table_long.png

592x352 RGBA. EXACTsamecouncilconferencetableDESIGNasimage2, justlengthenedto12m,2mwide,top0.8m. Onecontinuouslongpiece, NOTtwotables. Facetedmetaltriangulartrapezoidtopplates,repeatingcentralmodularpanels, thinamberlitstripdownthecenterline,dullbrassedgerim,sameoutwardslopedangularfeet/bracedpedestalsasimage2,repeatedalonglength. Nochair, nohologram. Longaxisdownright. Matchguideorange topquad(16,56),(96,16),(576,256),(496,296), cyanbottom40pxbelow(16,96),(96,56),(576,296),(496,336). Anchor296,195. CutcornersatTWOENDSONLY;interiorpaneljoinsstraight,nocutoutsalongedges. Sparse4-5slopedfeet tosupportfull12mlength.Noshadow.Castlightfromamberstripminimal.

Reference roles/paths: conf_table_long_guide.png, match/conf_table.png, ref/film_13142.jpg, ref/film_13148.jpg.

### guide_light.png

64x56 RGBA. TINYflushinsetlandingpaddecklamp,0.4x0.4m,0.1mtall. One squaregrey metalhousing andsimplefrostedglasslens, unlitpalegrey-blueglass, NO GLOW/NOEMISSION/NO castsadow. Image3 exactdeckgrey. Muststayguideactualsmallsize, notfillcanvas! Diamondfootprint(16,29),(32,21),(48,29),(32,37),top4pxabove(16,25),(32,17),(48,25),(32,33). Anchor32,29. Fourthinbeveledmetalrimedges, tinyfasteners, cleancrispcompactobject.Isometric2:1. Transparentrest of64x56canvas, nobigpedestal,nolampstand,noaddedfloor.

Reference roles/paths: guide_light_guide.png, ref/landing_clip_05s.jpg, match/floor_bay_A.png.

### corr_junction_floor.png

256x256 OPAQUE FLAT architecturalfloor. Exactsameplates,scratches,grime,seams andcolorsasimage1corridorfloor.4mx4msquare seenSTRAIGHTDOWN,64pxperm,noisometricperspective,nolightdirection,noshadows,nomodelslabthickness. Image topnorth. Flushsimplefloorpanelgridnotabigornamentaldoor. AlongRIGHT(+x)edgeanarrowgrey/brassTHRESHOLDSTRIPtojoinfacilitydoor. Floorfillsentirecanvas edge toedge,noalpha,borderoutsideimage,nopadding. Maintainphysicalplatepatternscaleof64pxperm,subduedcontrast,nowrittenmarkings.

Reference roles/paths: match/ps_floor.png.

### corr_side_floor.png

192x768 OPAQUE FLAT architecturalfloor. Shortsidepassage3mwide12mlongalongIMAGEHEIGHT. Exactsamewornmetalplates,grime,seams/colorsasimage1existingcorridorfloor. SeenSTRAIGHTOVERHEAD,noisometricangle,nolightdirection,noshadows, no3Dslabedge. 64pixels=1m: repeat sensibleplatemoduleseveryroughly64to128pixelsalong12mlength ratherthanstretchingoneplate. Straightlongsideedges, narrowunderstatededgevents/trimoptionalmatchingimage1. ImageTOPnorth. Floorfillswhole192x768canvas,nowallsorobjectsorlightsorletters,nopadding.

Reference roles/paths: match/ps_floor.png.


