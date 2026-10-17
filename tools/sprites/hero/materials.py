"""
Materials of the duel characters (Cycles nodes, rendered straight from the .blend — no glTF round trip, so the
skin's subsurface, the hair cards' alpha and the cloth's procedural folds survive): skin, eyes, hair cards, wool and
linen cloth, leather, metal. Colours are sRGB 0..255 (cast.py). The renderer (render_sprites.py) multiplies an AO
term into every Principled base colour.
"""
import os

import bpy

_IMG = {}


def lin(c):
    """sRGB 0..255 (or 0..1) -> linear RGBA"""
    out = []
    for x in c[:3]:
        x = x / 255.0 if max(c[:3]) > 1 else x
        out.append(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4)
    return (*out, 1.0)


def image(path, non_color=False):
    if path not in _IMG:
        im = bpy.data.images.load(path, check_existing=True)
        if non_color:
            im.colorspace_settings.name = 'Non-Color'
        _IMG[path] = im
    return _IMG[path]


def new(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    return m, nt, b


def skin(C):
    import mh
    m, nt, b = new('skin')
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = image(mh.skin_texture('young_caucasian_male'))
    tint = nt.nodes.new('ShaderNodeMix')
    tint.data_type = 'RGBA'
    tint.blend_type = 'MULTIPLY'
    tint.inputs['Factor'].default_value = 1.0
    tint.inputs[7].default_value = (*C['skin_tint'], 1)
    nt.links.new(tex.outputs['Color'], tint.inputs[6])
    nt.links.new(tint.outputs[2], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = 0.52
    b.inputs['Specular IOR Level'].default_value = 0.35
    b.inputs['Subsurface Weight'].default_value = 0.12
    b.inputs['Subsurface Radius'].default_value = (1.0, 0.4, 0.25)
    b.inputs['Subsurface Scale'].default_value = 0.006
    # pores / fine skin relief
    n = nt.nodes.new('ShaderNodeTexNoise')
    n.inputs['Scale'].default_value = 900
    n.inputs['Detail'].default_value = 4
    bump = nt.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.08
    bump.inputs['Distance'].default_value = 0.0005
    nt.links.new(n.outputs['Fac'], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], b.inputs['Normal'])
    return m


def eyes(color):
    import mh
    m, nt, b = new('eyes')
    p = mh.Proxy('eyes/HighPolyEyes/HighPolyEyes.json')
    path = os.path.join(p.dir, 'textures', f'{color}_eye.png')
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = image(path)
    nt.links.new(tex.outputs['Color'], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = 0.08
    b.inputs['Coat Weight'].default_value = 0.6
    return m


def hair_cards(C, which, tex_path):
    """Alpha-mapped hair cards (MakeHuman hair, beard, brows, lashes). The texture gives the strands' coverage (alpha)
    and their light/dark variation; the colour is the character's (dark roots, lighter tips by the texture's value)."""
    col = {'hair': C.get('hair_color'), 'beard': C.get('beard_color', C.get('hair_color')), 'brows': C.get('brow_color'),
           'lashes': (30, 22, 18)}[which]
    tip = {'hair': C.get('hair_tip', col), 'beard': C.get('hair_tip', col)}.get(which, col)
    m, nt, b = new(which + '_cards')
    m.surface_render_method = 'DITHERED' if hasattr(m, 'surface_render_method') else None
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = image(tex_path)
    tex.interpolation = 'Cubic'
    # the strands' value (MakeHuman's hair textures are near-black with lighter strands) -> root..tip colour
    val = nt.nodes.new('ShaderNodeRGBToBW')
    nt.links.new(tex.outputs['Color'], val.inputs['Color'])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = tuple(x * 0.55 for x in lin(col)[:3]) + (1,)
    ramp.color_ramp.elements[1].position = 0.6
    ramp.color_ramp.elements[1].color = lin(tip)
    nt.links.new(val.outputs['Val'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], b.inputs['Base Color'])
    nt.links.new(tex.outputs['Alpha'], b.inputs['Alpha'])
    b.inputs['Roughness'].default_value = 0.45
    b.inputs['Specular IOR Level'].default_value = 0.4
    b.inputs['Coat Weight'].default_value = 0.0
    b.inputs['Sheen Weight'].default_value = 0.25
    return m


# ------------------------------------------------------------------------------------------------- costume
def _coords(nt, kind='Object'):
    tc = nt.nodes.new('ShaderNodeTexCoord')
    return tc.outputs[kind]


def cloth(name, color, rough=0.88, sheen=0.35, weave=1800, folds=0.0, fold_scale=(6, 6, 1.4), color2=None, wear=0.0):
    """Wool / linen: a fine weave bump, optional hanging folds (noise stretched along the object's Z — garments are
    built with Z along their hang), and slight colour mottling (dye, dust)."""
    m, nt, b = new(name)
    coords = _coords(nt)
    # colour mottling
    mot = nt.nodes.new('ShaderNodeTexNoise')
    mot.inputs['Scale'].default_value = 9
    mot.inputs['Detail'].default_value = 3
    nt.links.new(coords, mot.inputs['Vector'])
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    mix.inputs[6].default_value = lin(color)
    mix.inputs[7].default_value = lin(color2 or tuple(x * 0.82 for x in color))
    mr = nt.nodes.new('ShaderNodeMapRange')
    mr.inputs['From Min'].default_value = 0.35
    mr.inputs['From Max'].default_value = 0.75
    mr.inputs['To Max'].default_value = 0.6 + wear
    nt.links.new(mot.outputs['Fac'], mr.inputs['Value'])
    nt.links.new(mr.outputs['Result'], mix.inputs['Factor'])
    nt.links.new(mix.outputs[2], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = rough
    b.inputs['Specular IOR Level'].default_value = 0.12
    b.inputs['Sheen Weight'].default_value = sheen * 0.4
    b.inputs['Sheen Roughness'].default_value = 0.5
    # weave + folds -> bump
    wv = nt.nodes.new('ShaderNodeTexWave')
    wv.wave_type = 'BANDS'
    wv.bands_direction = 'Z'
    wv.inputs['Scale'].default_value = weave
    wv.inputs['Distortion'].default_value = 2
    nt.links.new(coords, wv.inputs['Vector'])
    height = wv.outputs['Fac']
    bump = nt.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.15
    bump.inputs['Distance'].default_value = 0.0004
    nt.links.new(height, bump.inputs['Height'])
    last = bump
    if folds > 0:
        mp = nt.nodes.new('ShaderNodeMapping')
        mp.inputs['Scale'].default_value = fold_scale
        nt.links.new(coords, mp.inputs['Vector'])
        fn = nt.nodes.new('ShaderNodeTexNoise')
        fn.inputs['Scale'].default_value = 1.0
        fn.inputs['Detail'].default_value = 2.5
        fn.inputs['Roughness'].default_value = 0.45
        nt.links.new(mp.outputs['Vector'], fn.inputs['Vector'])
        fb = nt.nodes.new('ShaderNodeBump')
        fb.inputs['Strength'].default_value = folds
        fb.inputs['Distance'].default_value = 0.012
        nt.links.new(fn.outputs['Fac'], fb.inputs['Height'])
        nt.links.new(bump.outputs['Normal'], fb.inputs['Normal'])
        last = fb
    nt.links.new(last.outputs['Normal'], b.inputs['Normal'])
    return m


def leather(name, color, rough=0.42, grain=420, crease=0.35, shine=0.15, spec=0.45):
    """Leather: a pebbled grain, soft creases, a faint sheen on the highlights."""
    m, nt, b = new(name)
    coords = _coords(nt)
    mot = nt.nodes.new('ShaderNodeTexNoise')
    mot.inputs['Scale'].default_value = 14
    nt.links.new(coords, mot.inputs['Vector'])
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    mix.inputs[6].default_value = lin(color)
    mix.inputs[7].default_value = lin(tuple(min(255, x * 1.25) for x in color))
    mr = nt.nodes.new('ShaderNodeMapRange')
    mr.inputs['From Min'].default_value = 0.45
    mr.inputs['From Max'].default_value = 0.8
    mr.inputs['To Max'].default_value = 0.5
    nt.links.new(mot.outputs['Fac'], mr.inputs['Value'])
    nt.links.new(mr.outputs['Result'], mix.inputs['Factor'])
    nt.links.new(mix.outputs[2], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = rough
    b.inputs['Specular IOR Level'].default_value = spec
    b.inputs['Coat Weight'].default_value = shine
    b.inputs['Coat Roughness'].default_value = 0.35
    vor = nt.nodes.new('ShaderNodeTexVoronoi')
    vor.inputs['Scale'].default_value = grain
    nt.links.new(coords, vor.inputs['Vector'])
    bump = nt.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.12
    bump.inputs['Distance'].default_value = 0.0005
    nt.links.new(vor.outputs['Distance'], bump.inputs['Height'])
    cr = nt.nodes.new('ShaderNodeTexNoise')
    cr.inputs['Scale'].default_value = 38
    cr.inputs['Detail'].default_value = 6
    cr.inputs['Distortion'].default_value = 0.6
    nt.links.new(coords, cr.inputs['Vector'])
    cb = nt.nodes.new('ShaderNodeBump')
    cb.inputs['Strength'].default_value = crease
    cb.inputs['Distance'].default_value = 0.002
    nt.links.new(cr.outputs['Fac'], cb.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], cb.inputs['Normal'])
    nt.links.new(cb.outputs['Normal'], b.inputs['Normal'])
    return m


def metal(name, color, rough=0.28, aniso=0.0):
    m, nt, b = new(name)
    b.inputs['Base Color'].default_value = lin(color)
    b.inputs['Metallic'].default_value = 1.0
    b.inputs['Roughness'].default_value = rough
    if aniso:
        b.inputs['Anisotropic'].default_value = aniso
    return m


def plain(name, color, rough=0.6, metallic=0.0):
    m, nt, b = new(name)
    b.inputs['Base Color'].default_value = lin(color)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metallic
    return m
