"""
Movie Duels Anakin (Episode III) — a private model pack the user supplied (docs/characters/MD_ANAKIN.md). The pack itself
(FBX + textures) stays outside Git: tools/sprites/out/md_anakin/pack (git-ignored). This module only reads it.

  build(pack)            import the FBX (unchanged), reconnect the pack's textures, stand the model on the game's ground
                         (feet on z = 0, centred, facing +X — the facing render_sprites.py's direction 0 means), scale it
                         to the game's character height; returns a Scene record
  The derivative fixes are switchable (each recorded in the report): `fix_hierarchy` (the finger bones under the hand,
  the tibia under the femur's X part — see HIER), `hide_caps` (the dismemberment caps).

Coordinates after build: metres, +X forward, +Y the model's left, +Z up, feet at the origin (tools/sprites/hero uses the
same frame, so render_sprites.py treats both alike).
"""
import math
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

HEIGHT = 1.85  # (m) the game's Anakin (docs/CHARACTERS.md: hero_anakin 1.85 m) — top of the hair to the soles

# Textures: the FBX names files that are not in the pack (absolute paths on its maker's PC, *_bw variants, head_sith.jpg);
# the pack's images are connected by material instead. Spec maps are kept but NOT plugged into metallic (cloth and skin
# would shine like metal); roughness is a flat first guess per material.
MAPPING = {
    'Hair Alpha': ('hair_alpha.tga.png', 0.65),
    'Head': ('head.jpg', 0.60),
    'Hair': ('hair.jpeg', 0.70),
    'Hips': ('hips.jpg', 0.80),
    'Torso': ('torso.jpg', 0.80),
    'Boots': ('boots.jpg', 0.55),
    'Arms': ('arms.jpg', 0.75),
}

# The skeleton as the FBX has it puts every finger bone (and the hand's tag bone) under the forearm (`rradius`), not
# under the hand, and both finger joints side by side; a wrist turn would then leave the fingers behind. HIER is the
# chain the bone names and positions describe (JKA's humanoid: hand → finger joint 1 → joint 2; the weapon tag on the
# hand). Re-parenting in edit mode keeps every bone's rest matrix (and so the skin binding) as it is.
HIER = {}
for s in 'lr':
    HIER[f'{s}_d1_j1'] = f'{s}hand'
    HIER[f'{s}_d2_j1'] = f'{s}hand'
    HIER[f'{s}_d4_j1'] = f'{s}hand'
    HIER[f'{s}_d1_j2'] = f'{s}_d1_j1'
    HIER[f'{s}_d2_j2'] = f'{s}_d2_j1'
    HIER[f'{s}_d4_j2'] = f'{s}_d4_j1'
    HIER[f'{s}hang_tag_bone'] = f'{s}hand'


class Scene:
    def __init__(self, root, arm, meshes, report):
        self.root, self.arm, self.meshes, self.report = root, arm, meshes, report


def material(mat, textures, report):
    key = mat.name.rsplit('.', 1)[0] if mat.name.rsplit('.', 1)[-1].isdigit() else mat.name
    nt = mat.node_tree
    nt.nodes.clear()
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    bsdf.inputs['Metallic'].default_value = 0.0
    bsdf.inputs['Specular IOR Level'].default_value = 0.25
    if key not in MAPPING:
        bsdf.inputs['Base Color'].default_value = (0.025, 0.015, 0.012, 1)
        bsdf.inputs['Roughness'].default_value = 0.8
        report.append(dict(material=mat.name, texture=None, status='UNKNOWN: no texture in the pack — dark stand-in'))
        return
    fname, rough = MAPPING[key]
    bsdf.inputs['Roughness'].default_value = rough
    tex = nt.nodes.new('ShaderNodeTexImage')
    img = bpy.data.images.load(str(textures / fname), check_existing=True)
    img.colorspace_settings.name = 'sRGB'
    tex.image = img
    tex.interpolation = 'Linear'
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    entry = dict(material=mat.name, texture=fname, metallic=0.0, roughness=rough)
    if key == 'Hair Alpha':
        img.alpha_mode = 'STRAIGHT'
        nt.links.new(tex.outputs['Alpha'], bsdf.inputs['Alpha'])
        mat.surface_render_method = 'DITHERED'
        entry['alpha'] = 'image alpha → BSDF alpha (Cycles: stochastic transparency, transparent shadows)'
    report.append(entry)


def build(pack, height=HEIGHT, fix_hierarchy=True, hide_caps=True):
    pack = Path(pack).resolve()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=str(pack / 'source' / 'Anakin.fbx'), use_anim=False)
    rep = dict(fbx=str(pack / 'source' / 'Anakin.fbx'), blender=bpy.app.version_string, fixes=[], materials=[])
    # the FBX's own camera and light: not part of the character
    for o in [o for o in bpy.data.objects if o.type in ('CAMERA', 'LIGHT')]:
        bpy.data.objects.remove(o)
    arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    top = next(o for o in bpy.data.objects if o.parent is None)  # scene_root (the FBX's 0.1 unit scale)
    # materials
    for mat in {s.material for o in meshes for s in o.material_slots if s.material}:
        material(mat, pack / 'textures', rep['materials'])
    # the FBX's own image references (its maker's absolute paths, *_bw names, head_sith.jpg — none in the pack) are no
    # longer used by any material: drop them, recorded
    gone = []
    for im in list(bpy.data.images):
        if im.source == 'FILE' and not Path(bpy.path.abspath(im.filepath)).exists():
            gone.append(Path(im.filepath.replace('\\', '/')).name)
            bpy.data.images.remove(im)
    rep['fbx_image_refs_dropped'] = sorted(set(gone))
    if fix_hierarchy:
        bpy.context.view_layer.objects.active = arm
        bpy.ops.object.mode_set(mode='EDIT')
        eb = arm.data.edit_bones
        moved = []
        for child, parent in HIER.items():
            if child in eb and parent in eb and (eb[child].parent is None or eb[child].parent.name != parent):
                moved.append(f'{child}: {eb[child].parent.name if eb[child].parent else None} → {parent}')
                eb[child].use_connect = False
                eb[child].parent = eb[parent]
        bpy.ops.object.mode_set(mode='OBJECT')
        rep['fixes'].append(dict(fix='bone parents (edit mode; rest matrices and weights unchanged)', changed=moved))
    if hide_caps:
        caps = [o for o in meshes if '_cap_' in o.name]
        for o in caps:
            o.hide_render = True  # (not hide_viewport: a viewport-hidden object is left out of the depsgraph and keeps a stale matrix)
        rep['fixes'].append(dict(fix='dismemberment caps hidden (render derivative only)', objects=[o.name for o in caps]))
    # stand it on the game's ground: a root empty at the origin carries the FBX's top node; scale to `height`, feet on
    # z = 0, centred on the feet, turned from facing -Y (the FBX) to +X
    root = bpy.data.objects.new('md_anakin', None)
    bpy.context.scene.collection.objects.link(root)
    top.parent = root
    bpy.context.view_layer.update()
    lo, hi = bounds(meshes)
    k = height / (hi.z - lo.z)
    feet = feet_centre(meshes)
    root.matrix_world = Matrix.Rotation(math.pi / 2, 4, 'Z') @ Matrix.Scale(k, 4) @ Matrix.Translation(-Vector((feet.x, feet.y, lo.z)))
    bpy.context.view_layer.update()
    lo, hi = bounds(meshes)
    rep['scale'] = dict(height_m=height, fbx_units_to_m=k * top.scale.x, bounds_m=[list(map(lambda v: round(v, 3), lo)), list(map(lambda v: round(v, 3), hi))])
    return Scene(root, arm, meshes, rep)


def visible(meshes):
    return [o for o in meshes if not o.hide_render]


def bounds(meshes):
    ps = [o.matrix_world @ Vector(c) for o in visible(meshes) for c in o.bound_box]
    return Vector([min(p[i] for p in ps) for i in range(3)]), Vector([max(p[i] for p in ps) for i in range(3)])


def feet_centre(meshes):
    """Between the two boot soles (the lowest 3 % of the legs' vertices)."""
    pts = []
    for o in meshes:
        if o.name.startswith(('l_leg', 'r_leg')):
            pts += [o.matrix_world @ v.co for v in o.data.vertices]
    zmin = min(p.z for p in pts)
    zmax = max(p.z for p in pts)
    low = [p for p in pts if p.z < zmin + 0.03 * (zmax - zmin)]
    return sum(low, Vector()) / len(low)


def evaluated(meshes):
    """World positions of every visible mesh vertex after the armature: {object name: [Vector]}."""
    bpy.context.view_layer.update()
    deps = bpy.context.evaluated_depsgraph_get()
    out = {}
    for o in visible(meshes):
        ev = o.evaluated_get(deps)
        me = ev.to_mesh()
        out[o.name] = [ev.matrix_world @ v.co for v in me.vertices]
        ev.to_mesh_clear()
    return out
