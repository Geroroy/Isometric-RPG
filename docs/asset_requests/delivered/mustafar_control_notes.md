# Mustafar control-room assets

Fourteen PNGs generated with the built-in image-generation tool, followed by exact pixel export and guide fitting. ZIP contains only the fourteen requested filenames. These are assets, not a validated assembled game level.

## Files

| File | Size | View / alpha |
|---|---|---|
| conf_wall_door_side.png | 768 × 256 | Flat front elevation, real RGBA |
| ctl_floor.png | 1152 × 832 | Flat top-down, opaque RGB |
| ctl_gallery_floor.png | 1152 × 320 | Flat top-down, opaque RGB |
| ctl_gallery_edge.png | 1152 × 104 | Flat front elevation, real RGBA |
| ctl_wall_window.png | 1152 × 256 | Flat front elevation, real RGBA |
| ctl_wall_side.png | 1152 × 256 | Flat front elevation, real RGBA |
| ctl_wall_front_low.png | 1152 × 64 | Flat front elevation, real RGBA |
| ctl_wall_entry_low.png | 1152 × 64 | Flat front elevation, real RGBA |
| ps_floor.png | 384 × 256 | Flat top-down, opaque RGB |
| ps_wall_back.png | 384 × 224 | Flat front elevation, real RGBA |
| ps_wall_front_low.png | 384 × 64 | Flat front elevation, real RGBA |
| ctl_stairs.png | 272 × 184 | Isometric, real RGBA |
| ctl_shield_generator.png | 200 × 208 | Isometric, real RGBA |
| ctl_holo_table.png | 160 × 144 | Isometric, real RGBA |

## Integration geometry

All pixel intervals below are half-open: include the first coordinate and exclude the last. Coordinates start at the image's upper-left; x increases rightward and y downward. Flat architecture uses 64 pixels per metre. Isometric sprite scale comes from the supplied guides rather than from the flat texture scale.

- conf_wall_door_side: doorway is fully transparent at x=[256,512), y=[64,256). Frame is outside this opening. Original conf_wall_side pixels remain identical outside the frame region x=[240,528), y=[48,256).
- ctl_gallery_edge: stair gap x=[448,704) is transparent for all 104 rows. Solid fascia is y=[66,104), excluding the gap. Above y=66 the railing has real transparent apertures. No beam crosses the stair gap.
- ctl_wall_front_low: balcony gap x=[448,704), all 64 rows.
- ctl_wall_entry_low: passage gap x=[384,640), all 64 rows.
- ctl_wall_window: five large clear window apertures have alpha zero; no lava is baked into them. Both the window wall and side wall remain separate from furniture.
- ctl_floor: top is the gallery foot. The top central stair threshold x=[448,704), right passage threshold y=[192,448), and bottom balcony threshold x=[448,704) are clear flat metal without perimeter grating across them.
- ctl_gallery_floor: full opaque 18 × 5 m rectangle; raised height is represented by ctl_gallery_edge and ctl_stairs, not by perspective in the texture.
- ps_floor: horizontal length 6 m, depth 4 m, open connecting ends at left/right.

### Sprite anchors

| Sprite | Ground anchor | Intended size / orientation |
|---|---|---|
| ctl_stairs.png | (136,105) | 4 m wide × 2 m deep; 0.6 m rise; three steps ascending toward screen upper-right |
| ctl_shield_generator.png | (100,146) | 2.8 m wide × 1.4 m deep × 1.8 m tall; controls face screen lower-right; intact state |
| ctl_holo_table.png | (80,93), derived | Circular top 1.6 m diameter, 0.9 m tall; projector off |

Stairs and console opaque silhouettes were checked inside their supplied projected guide envelopes. Tiny margins allow bevels and anti-aliasing; guide colors are removed. Art was downsampled and fitted for the specified canvases, so these PNGs should be used with the above logical dimensions and anchors rather than inferring collision geometry from the alpha mask.

### Holo-table guide mismatch

The third attachment, 78397.png, is 352 × 280 and depicts a long rectangular prism. It is not the requested 160 × 144 round-table guide. The delivered table uses an inferred guide based on the stated dimensions and the other guides' 2:1 projection: ground ellipse center (80,93), radii (45.25,22.63); top ellipse center (80,48), same radii. This inference is not claimed to be a match to an attached holo-table guide.

### Entrance coordinate discrepancy

The gallery is 5 m deep. If the wall's x-axis measures distance from the window wall, a passage entrance 3–7 m from the lower-floor top is 8–12 m along the whole 18 m room: wall pixels [512,768). The expressly requested entry-wall gap [384,640) is instead 6–10 m. Both image specifications were preserved. The level implementation must reconcile the 2 m offset or confirm that the wall texture uses a different origin/direction; do not assume these two placements automatically align.

## Reference evidence and limits

- Viewed the film conference-room still in the existing reference set (reference/conference-film.jpeg): it directly shows heavy slanted supports, narrow vertical trim, ribbed recesses, large lava-facing windows and the long segmented table. It supports the facility's shared architectural language, not the exact geometry of every control-room prop.
- Official source checked: https://www.starwars.com/databank/mustafar . An additional official gallery image (mustafar-bio-2_2f581754.jpeg) is an animated Clone Wars scene; it was recognized as animation and was not treated as a live-action Revenge of the Sith frame.
- Rotated and visually inspected the accessible Sketchfab room model at two angles: https://sketchfab.com/3d-models/star-wars-mustafar-control-room-1e5f5e8a5bc546e1a778fc94fb452bda . Observed slanted pillars, wall ribs, deep window bays and conference furniture. This is a fan-model secondary reference; the viewed portion is the conference area despite its control-room title. No mesh or textures were downloaded or reused.
- Cults3D page attempted: https://cults3d.com/en/3d-model/art/star-wars-mustafar-control-room-hallway-diorama . This browser was stopped by a human-verification challenge; the model viewer there was not inspected. Access limitations: https://help.openai.com/articles/20001280-using-cloud-browser-in-chatgpt#when-a-website-blocks-the-task .
- Film-video attempt: https://www.youtube.com/watch?v=z3QdjlaFclA . Player reached 1:21 but usable video frames did not render, so this is not cited as footage actually watched. The still gallery also failed to load in this browser.
- Shield-console appearance preserves the supplied console reference's faceted end cheeks, ribbed screen surround, angled button bank, narrow metal/brass bands and triangular lower vents. The identity and exact shape of the specific film prop cut by Anakin were not fully verified from an accessible close-up. It is an interpretation for the requested intact shield-control asset.
- The round holo-table's segmentation, pedestal and small support feet are inferred game design, guided by the brief and existing materials; no exact film prop match is claimed.
- Room dimensions, raised-gallery layout, passage dimensions and exact openings follow the user brief. They are not measured from a film set plan.

## Validation

All fourteen files have exact specified dimensions. Three floors are opaque RGB. Eleven other assets are RGBA with genuine transparent pixels, not a painted checkerboard. Exact doorway and wall-gap rectangles have alpha zero. Gallery fascia outside the gap is fully opaque at rows 66–103. Window aperture centers have alpha zero. No cyan/blue guide pixels remain in the furniture. The console orientation and three stair risers were visually inspected. Source conference wall outside the new doorway/frame is pixel-identical.

## Final generation prompts

### conf_wall_door_side.png

Edit this existing flat wall image. Preserve its design, colors, panel grooves, pillar positions and scale EXACTLY except for a centered rectangular doorway. Target canvas768x256, wall12m x4m, 64px/m. Opening EXACT rectangle x256 inclusive to512 exclusive, y64 inclusive to256 exclusive. Empty transparent hole 4m wide3m high; no door slab, background, floor, darkness or lava in opening. Add narrow worn gray and dull brass jambs OUTSIDE the opening at x240-255 and512-527, header y48-63; no frame may intrude into opening. Preserve original wall everywhere else; do not redraw unrelated panels. Straight-on elevation, no perspective, no shadows. True transparent alpha at doorway, fully solid metal elsewhere, image full bleed.

### ctl_floor.png

Production game asset, late-1990s realistic pre-rendered Commandos 2 / Diablo II style matching the reference assets exactly: worn dark gray metal, muted dull brass trims, subtle amber indicator lights only. Restrained LOW contrast surfaces, no bright silver highlight bands, no blue or red glows, no characters, furniture, text, logo or readable lettering. Architecture is a completely FLAT technical texture view, no isometric angle, no perspective, no cast shadows, softly even illumination. Entire intended image area must be occupied edge-to-edge; no extra canvas margins. Create ctl_floor.png1152x832 opaque, straight overhead ORTHOGRAPHIC lower control-room floor rectangle18m left-right x13m top-bottom at64px/m. Use large slightly asymmetric darkgray worn metal plates, fine bevel seams, very restrained grime, inset narrow dull-brass service tracks and recessed perimeter drainage strips. Main combat center is flat lowcontrast clear empty metal. TOP is foot of raised gallery; do NOT draw gallery, railings, stairs or shadows in this floor. RIGHT edge corridor entrance extends y192-448 (3-7m fromtop): floor trim interrupts there and seamless metal threshold reaches rightedge. BOTTOM balcony-door threshold centered x448-704. LEFT shield console wall has ordinary floor border; generator is separate and MUST NOT be included. References: first exact material/light benchmark, second film floor joint pattern only. No obstructing fixtures or raised rims. Full opaque rectangular texture, no transparent corners.

### ctl_gallery_floor.png

Production game asset, late-1990s realistic pre-rendered Commandos 2 / Diablo II style matching the reference assets exactly: worn dark gray metal, muted dull brass trims, subtle amber indicator lights only. Restrained LOW contrast surfaces, no bright silver highlight bands, no blue or red glows, no characters, furniture, text, logo or readable lettering. Architecture is a completely FLAT technical texture view, no isometric angle, no perspective, no cast shadows, softly even illumination. Entire intended image area must be occupied edge-to-edge; no extra canvas margins. Create ctl_gallery_floor.png1152x320 opaque rectangular overhead FLOOR ONLY18m x5m. Raised gallery0.6m high is represented by a separate front edge; do not show elevation or sidefaces in this topdown image. Wide horizontal strip with metal panel plates and recessed narrow ventilation grilles along the window-side TOPedge, dull brass thin service trim. BOTTOMedge foot approach for stairs centeredx448-704: a subtle metal threshold integrated flush with panel surface, no steps orhole drawn. Keep interior empty for separate consoles. Match exact material tones of referencefloor. Orthographic directly above; horizontal/vertical panel joints no converginglines. Fullbleed opaque texture no margin, no walls, no shadows.

### ctl_gallery_edge.png

Production game asset, late-1990s realistic pre-rendered Commandos 2 / Diablo II style matching the reference assets exactly: worn dark gray metal, muted dull brass trims, subtle amber indicator lights only. Restrained LOW contrast surfaces, no bright silver highlight bands, no blue or red glows, no characters, furniture, text, logo or readable lettering. Architecture is a completely FLAT technical texture view, no isometric angle, no perspective, no cast shadows, softly even illumination. Entire intended image area must be occupied edge-to-edge; no extra canvas margins. Create a straight-on front elevation ctl_gallery_edge.png1152x104,18m long. At bottomrows66-103 is a fullysolid worn graymetal galleryfrontfascia0.6m tall with thin dullbrass base trim. Above y66 is an OPEN metalRAILING with transparent spaces between posts, extending up to image TOP y0; narrow horizontal railtop and middlecrossbar. Entire section must end cleanly either side of the EXACT central stairgap x448-703 inclusive. Gap x448<=x<704 transparent for ALL104rows: no rail, kickplate, beam, trim, floor, steps, shadows orpart spanningacrossgap. Two independent7m sections atleft x0-447 andrightx704-1151. No endperspective or topface, no farfullheightwall; bottomfascia is38pixels tall notthewholeimage. Use referenceonlyfor wornmetal finish. TruePNGalpha, openrail holes reallytransparent, nocheckerboard.

### ctl_wall_window.png

Production game asset, late-1990s realistic pre-rendered Commandos 2 / Diablo II style matching the reference assets exactly: worn dark gray metal, muted dull brass trims, subtle amber indicator lights only. Restrained LOW contrast surfaces, no bright silver highlight bands, no blue or red glows, no characters, furniture, text, logo or readable lettering. Architecture is a completely FLAT technical texture view, no isometric angle, no perspective, no cast shadows, softly even illumination. Entire intended image area must be occupied edge-to-edge; no extra canvas margins. Create ctl_wall_window.png1152x256 transparent, completely straight-on orthographic window-wall elevation18m long4m high. Film-faithful Mustafar heavy faceted slanted pillar supports with pale narrow graymetal/brass upright trim, ribbed/sawtooth lowerbench mechanical base, horizontal louvers bordering six large wide recessed windowbays. Reference1 is consolewall support/rib design only; reference2 actualfilm heavywindow framing, reference3 exactgamepalette. Large rectangular/trapezoidwindowopenings aboutrows40-200 leave fullytransparent empty, NOglassreflections, NOlava/scenery, no sky, no colorfill, no darknessgradient inwindows. Solid darkgraymetal bulkheadtop/base with restrainedthin brass trim. Lowdimamber indicators nearbase only. Full 18m wall fillswidth,height; do not isolate with excessblankmargin. No viewpointtilt, wallrectangularnet shape no topvisible.

### ctl_wall_side.png

Production game asset, late-1990s realistic pre-rendered Commandos 2 / Diablo II style matching the reference assets exactly: worn dark gray metal, muted dull brass trims, subtle amber indicator lights only. Restrained LOW contrast surfaces, no bright silver highlight bands, no blue or red glows, no characters, furniture, text, logo or readable lettering. Architecture is a completely FLAT technical texture view, no isometric angle, no perspective, no cast shadows, softly even illumination. Entire intended image area must be occupied edge-to-edge; no extra canvas margins. Create ctl_wall_side.png1152x256 transparent straight-on18mx4m solidcontrolroomSIDEwall. Follow actualMustafar facetedsloping pillar supports with narrowmutedgraymetalverticalbands and segmentedribbedrecessedupperpanels. Several serviceconduits, deeplyrecessedaccesspanels, ventgrilles, smallsubduedamberindicatorlights. Wallpaneling lowerhalf notfull bankofconsole screens: shieldgeneratorisSEPARATEobject DO NOTdrawanyconsole/desk/generator/projector here. Use reference1 structuralrib/pillar language; reference2 exactcolorandwear. No windowsordoorsinthispiece. Solidwallmask withtransparentpixelsonlyoutsideoutercontour, no backdrop, nofloor. No castshadows, no visibleperspective/topface, no brightwhitetrim.

### ctl_wall_front_low.png

Production game asset, late-1990s realistic pre-rendered Commandos 2 / Diablo II style matching the reference assets exactly: worn dark gray metal, muted dull brass trims, subtle amber indicator lights only. Restrained LOW contrast surfaces, no bright silver highlight bands, no blue or red glows, no characters, furniture, text, logo or readable lettering. Architecture is a completely FLAT technical texture view, no isometric angle, no perspective, no cast shadows, softly even illumination. Entire intended image area must be occupied edge-to-edge; no extra canvas margins. Create ctl_wall_front_low.png1152x64 transparent. FLATstraight-onexternalface of nearlongwall CUTDOWN to1metertall,18mlong at64px/m. Verylow wallbase withgraymetalaccesspanels,ribbedtrapezoidsawtoothinserts, thinmutedbrassbasetrimandcleanhorizontalcuttop; NOtallpillars/windows/railings/console. A fullytransparent4mwideBALCONYdoorwaygap EXACTx448-703inclusive entire64height. Left7mwallsection x0-447, right7mwallsection704-1151, bothterminatecleanly atgapedges. No beam, threshold orshadowspanninggap. Flatfrontface fillscanvasheight64withnobackdroporverticalmargin. Matchfirstreferencecutwall design andcolor.

### ctl_wall_entry_low.png

Production game asset, late-1990s realistic pre-rendered Commandos 2 / Diablo II style matching the reference assets exactly: worn dark gray metal, muted dull brass trims, subtle amber indicator lights only. Restrained LOW contrast surfaces, no bright silver highlight bands, no blue or red glows, no characters, furniture, text, logo or readable lettering. Architecture is a completely FLAT technical texture view, no isometric angle, no perspective, no cast shadows, softly even illumination. Entire intended image area must be occupied edge-to-edge; no extra canvas margins. Create ctl_wall_entry_low.png1152x64transparent. Straight-onexternalface of nearshortcontrolroomwallcutdown to1mheight18mlong64px/m. Cleanflatdarkgraymetalcutwallbase, repeated ribbedfacetedinsertpanels anddullbrassbasetrim. IMPORTANT passagegap is OFFCENTER: transparent x384inclusive to640exclusive ALL64rows, noobject/threshold/shadowinopening. Solidleft6msectionx0-383 andright8msectionx640-1151. No fullheightwall/window/railing, nofloor, no perspectiveorcastshadow. Fullheight64lowwallalignedbottom/topcanvas, matchedreferencefinish.

### ps_floor.png

Production game asset, late-1990s realistic pre-rendered Commandos 2 / Diablo II style matching the reference assets exactly: worn dark gray metal, muted dull brass trims, subtle amber indicator lights only. Restrained LOW contrast surfaces, no bright silver highlight bands, no blue or red glows, no characters, furniture, text, logo or readable lettering. Architecture is a completely FLAT technical texture view, no isometric angle, no perspective, no cast shadows, softly even illumination. Entire intended image area must be occupied edge-to-edge; no extra canvas margins. Create ps_floor.png384x256 opaque passage floor6m long horizontally and4m deep vertically64px/m. Straight overhead floor only. Same dark gray plates and subtle narrow dullbrass border as conference room. Open connecting ends LEFTandRIGHT: continue floor flush to edges without threshold blockers, no vertical wallface. A recessed ribbed service strip along topedge and bottomedge; subdued four-to-six large plate segments and small believable fasteners. Soft even light, no furniture, doors, walls, perspective or castshadow. Fill entire rectangular canvas.

### ps_wall_back.png

Production game asset, late-1990s realistic pre-rendered Commandos 2 / Diablo II style matching the reference assets exactly: worn dark gray metal, muted dull brass trims, subtle amber indicator lights only. Restrained LOW contrast surfaces, no bright silver highlight bands, no blue or red glows, no characters, furniture, text, logo or readable lettering. Architecture is a completely FLAT technical texture view, no isometric angle, no perspective, no cast shadows, softly even illumination. Entire intended image area must be occupied edge-to-edge; no extra canvas margins. Create ps_wall_back.png384x224 transparent,6mwide3.5mtallpassagefarwall. Fullstraight-onelevationflat, narrowpassagewallmodulewithtwosubstantialangledribbedpillars, recesseddarkgraywallpanels, upperventgrille, thinagedbrassserviceconduits andfewdimamberpinlights. Match conferencewallmaterial precisely; DO NOT include console screens, windows, doors, furniture orfloor. Fullwidthandheightmetalwallbetweenedges; genuinealphaonlyoutsideoutercontour. Technicalview, noisoangleorperspective, no castshadow.

### ps_wall_front_low.png

Production game asset, late-1990s realistic pre-rendered Commandos 2 / Diablo II style matching the reference assets exactly: worn dark gray metal, muted dull brass trims, subtle amber indicator lights only. Restrained LOW contrast surfaces, no bright silver highlight bands, no blue or red glows, no characters, furniture, text, logo or readable lettering. Architecture is a completely FLAT technical texture view, no isometric angle, no perspective, no cast shadows, softly even illumination. Entire intended image area must be occupied edge-to-edge; no extra canvas margins. Create ps_wall_front_low.png384x64transparent,6mlong1mtallpassagenearwallseenstraight-onfromoutside. Solidcontinuouslowcutwallbase acrossentirewidth, threemoderatefacetedgraymetalaccesspanelmodules, thinagedbrassbasetrim,ribbedrecessedvents, cleanhorizontalcuttopshowingslightdarkmetalinneredge. No doorwaygap, no fullheightwall, no window,pillar,railing orfloor. Exactflattechnicalelevation, rectangularstripfills384x64withtransparentalphaoutsideouteredgeonly. Do not leavehugemargins orshowisometricview.

### ctl_stairs.png

Use case: stylized-concept. A game-ready realistic late-1990s pre-rendered isometric sprite, Commandos 2 / Diablo II style, crisp silhouette, detailed but restrained texture. Dark worn grey metal, small dull brass trim, amber panel indicators ONLY, soft even illumination from SCREEN upper-left, tiny soft contact shadow toward lower-right. Orthographic exact 2:1 dimetric matching guide, no perspective. True transparent PNG, no ground plane/baseplate/environment, no characters/text/logo. Guide lines and their background must be COMPLETELY removed. Do not add blue/red glow or holograms. Preserve all supplied guide geometry and object dimensions. Create ctl_stairs.png272x184canvas. FIRSTreference is exactobjectguide, geometryonly. Metalsteps4mWIDE,2mDEEP,totalrise0.6m in EXACTLYTHREErisers (each0.2m). Fromfrontlowedge toward guide'sUPPERRIGHT is the directionofascent; all3treadnosesareparallelto thewideaxis, slopingdown-right at2:1. Exactfinalguidegroundquad (16,86),(96,46),(256,126),(176,166); topquad aboveit29px (16,57),(96,17),(256,97),(176,137), groundanchor(136,105). Loweststepfrontedge(16,86)to(176,166), highestbackedge(96,17)to(256,97). Buildstairmeshinsidethisvolume, noextra landingplatform, handrails orposts. Threebroaddarkmetalribbedtreads withthinmutedbrassnosings, solidfacetedsidecheeks, restrainedwear only. Otherreferencesmaterial/finishonly. Keep stepgeometryreadableandnoorganicdebris. Useexactcanvasproportionsandrelativeplacement.

### ctl_shield_generator.png

Edit the SECOND reference console design into the exact FIRST guide. CRITICAL correction: physically rotate the console around its vertical axis so its WIDE FRONT WITH SCREEN AND BUTTONS faces SCREEN LOWER RIGHT. The current second reference has controls on the wrong face! The long control-screen edge MUST slope UP to the right at1:2, fromfinalpixel(72,101)toward(184,45); NOTdown totheright. The large controlface must be the RIGHT-facing visibleplane. The LEFT-facing visibleplane is NARROW PLAIN metal1.4mdeep side withconduits; NOTa widescreen. Frontwidth2.8m,depth1.4m,height1.8m. Final200x208canvas: topquad(16,73),(128,17),(184,45),(72,101), groundquad(16,161),(128,105),(184,133),(72,189), redgroundanchor(100,146). Preserve exactbodyinsideguide. Keepactualconsolelookfromsecondreference: two massivefacetedverticalendcheeks,palegray/dullbrass narrowstripes,recessedamberholographic2Ddisplaywithsegmentedribframe,wideangledbuttonbank,triangularbasevents. Re-render the rotatedobject with illuminationfromSCREEN UPPER LEFT; do NOTmirrorlighting orcopyattachedlightdirection. Darkworn graymetal: reducebrightwhitesilverhighlights, softlyevenlowercontrastmetals, mutedbrass, amberwarninglight only. Unbrokenconsoleintactbeforehit, nosparksorcuts. RemoveALLguidelines/background. RealtransparentPNG,nofloor/groundorwallbehind, nocharacters/text/logo, no blue/redglows, minusculelowopacitysoftcontactshadowlowerright. Preciseorthographic2:1dimetricguide, nopPerspective. Fullcanvas200x208ratioandrelativeplacement.

### ctl_holo_table.png

Edit SECOND reference roundholo table using FIRST guidegeometry and THIRD darkgamemetalpalette. Preserve roundsegmentedtop, recessedcentralOFFprojectiondisc, restrainedradialinsets andangularfeet. TWOprecisecorrections: (1) darkenall silverytopplates to LOWCONTRASTDARKGRAYwornmetal asreference3; no brightwhite/highshine highlights, onlysmallmutedbrassrimaccents, 3tinyAMBERstatusdots. (2) Increase pedestalheight beneath the tabletop so TOTALHEIGHTis0.9mrelative toDIAMETER1.6m; notthecurrent squat0.4m. Final160x144 guide: TOPellipsecenter(80,48), rx45.25,ry22.63; GROUNDellipsecenter(80,93),rx45.25,ry22.63, anchor(80,93). Thus 45pixelsVERTICALseparationofupperandlowercenters; ellipticaltopsizeabout90x45pixels, completeobjectoverallabout90x90pixels. Use a taller narrowtaperedcylindricalpedestalwiththreeangularsupportfeet, notawidepillbox. Keepcirculartop2:1ellipse, orthographicmatchingguide; light from SCREENupperleft, tiniestsoftcontactshadowlowerright. Hologram/projectorOFF, nohologramorcoloredglow, no blue/redlights, no text/logo/characters/floor. Removeallguidelines/background; truealphaPNG. Keep160x144canvasproportionsandguideplacement.


