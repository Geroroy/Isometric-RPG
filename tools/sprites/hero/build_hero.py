"""
The duel characters (Anakin, Obi-Wan — Revenge of the Sith, Mustafar) as one consistent rigged model each, for the
combat sprites: the MakeHuman 1.1 base body (mh.py: body, face, hands, skeleton and skin weights; morphed to the
character's build), its eyes, brows, lashes, hair and beard proxies, and the Jedi costume modelled here round the
morphed body (garments.py) and skinned to the same skeleton. The poses of the swordsmanship (src/combat/pose.js +
moves.js) are put onto this rig by pose_hero.py; render_hero.py renders the sprite sheets.

  .bvenv/bin/python tools/sprites/hero/build_hero.py anakin|obiwan [out.blend]

Blender frame: +X forward (the facing the game's direction 0 means), +Z up, +Y the model's left, metres, the feet on
z = 0 (MakeHuman: +Z forward, +Y up, +X the model's left, decimetres).
"""
import math
import os
import sys

import bpy  # noqa: I001
import bmesh
import numpy as np
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import mh  # noqa: E402
import cast  # noqa: E402
import garments  # noqa: E402



class Builder:
    def __init__(self, name):
        self.name = name
        self.C = cast.CAST[name]
        self.base = mh.Base()
        w = self.base.macro_weights(**self.C['macro'])
        for n, x in self.C.get('shape', {}).items():
            w['data/targets/' + n + '.target'] = w.get('data/targets/' + n + '.target', 0) + x
        self.co_mh = self.base.morph(w)
        body = sorted({v for f in self.base.body_faces() for v in f[0]})
        ys = self.co_mh[body, 1]
        self.ground = ys.min()
        # one scale to the character's height (soles to the crown, without hair)
        self.s = self.C['height'] / (ys.max() - ys.min())

    def to_b(self, p):
        """MakeHuman coords (..., 3) -> Blender metres"""
        p = np.asarray(p, np.float64)
        return np.stack([p[..., 2] * self.s, p[..., 0] * self.s, (p[..., 1] - self.ground) * self.s], -1)

    # ---------------------------------------------------------------------------------------------------- skeleton
    def armature(self):
        J = self.base.joints(self.co_mh)
        par = self.base.bone_parents()
        ad = bpy.data.armatures.new(self.name + '_rig')
        arm = bpy.data.objects.new(self.name + '_rig', ad)
        bpy.context.scene.collection.objects.link(arm)
        bpy.context.view_layer.objects.active = arm
        bpy.ops.object.mode_set(mode='EDIT')
        order = list(par)  # parents come first in the JSON
        self.joint_b = {}
        for n in order:
            if n not in J:
                continue
            h, t = self.to_b(J[n][0]), self.to_b(J[n][1])
            if np.linalg.norm(t - h) < 1e-4:
                t = h + np.array([0, 0, 0.01])
            eb = ad.edit_bones.new(n)
            eb.head, eb.tail = Vector(h), Vector(t)
            self.joint_b[n] = (h, t)
        for n in order:
            if n in ad.edit_bones and par[n] and par[n] in ad.edit_bones:
                ad.edit_bones[n].parent = ad.edit_bones[par[n]]
        # rolls: limbs and spine with Z towards the model's front (so a bend about X is a natural hinge); fingers with
        # Z along the back of the hand (their curl is a turn about X)
        for eb in ad.edit_bones:
            n = eb.name
            if n.startswith(('finger', 'metacarpal')):
                side = 1 if n.endswith('.L') else -1
                eb.align_roll(Vector((0, 0, 1)) if not n.startswith('finger1') else Vector((0, side, 0)))
            else:
                eb.align_roll(Vector((1, 0, 0)))
        bpy.ops.object.mode_set(mode='OBJECT')
        self.arm = arm
        return arm

    # ---------------------------------------------------------------------------------------------------- meshes
    def mesh(self, name, co_b, faces, uvs, skin, mats, mat_of_face=None, smooth=True):
        me = bpy.data.meshes.new(name)
        verts_used = sorted({v for f in faces for v in f[0]})
        remap = {v: i for i, v in enumerate(verts_used)}
        me.from_pydata([tuple(co_b[v]) for v in verts_used], [], [tuple(remap[v] for v in f[0]) for f in faces])
        me.validate()
        if uvs is not None:
            uvl = me.uv_layers.new(name='UVMap')
            k = 0
            for poly, f in zip(me.polygons, faces):
                for li, ui in zip(poly.loop_indices, f[2] or [0] * len(f[0])):
                    uvl.data[li].uv = tuple(uvs[ui])
                k += 1
        for p in me.polygons:
            p.use_smooth = smooth
        ob = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(ob)
        for m in mats:
            me.materials.append(m)
        if mat_of_face is not None:
            for p, f in zip(me.polygons, faces):
                p.material_index = mat_of_face(f)
        # skin
        groups = {}
        for v in verts_used:
            for bn, w in skin[v].items():
                if bn not in self.arm.data.bones:
                    continue
                g = groups.get(bn) or ob.vertex_groups.new(name=bn)
                groups[bn] = g
                g.add([remap[v]], w, 'REPLACE')
        ob.parent = self.arm
        mod = ob.modifiers.new('rig', 'ARMATURE')
        mod.object = self.arm
        ob['verts'] = len(verts_used)
        return ob, remap

    def body(self):
        b = self.base
        faces = b.body_faces()
        skin = b.skin_names()
        co = self.to_b(self.co_mh)
        self.co_b = co
        ob, remap = self.mesh(self.name + '_body', co, faces, b.uv, skin, [materials.skin(self.C)])
        self.body_ob, self.body_remap = ob, remap
        return ob

    def proxy(self, rel, mat, name=None, scale=1.0, drop=None, squash=None, wave=0.0, volume=1.0):
        p = mh.Proxy(rel)
        co = self.to_b(p.fit(self.co_mh, scale))
        if squash:  # (z0, k): shorten what hangs below z0 (m above the crown's height − z0) by k — long hair to collar length
            z0 = self.C['height'] - squash[0]
            low = co[:, 2] < z0
            co[low, 2] = z0 - (z0 - co[low, 2]) * squash[1]
        if volume != 1.0:  # fuller: the hair moves away from the head's centre (more above the ears)
            hc = np.array([0.0, 0.0, self.C['height'] - 0.11])
            k = 1 + (volume - 1) * np.clip((co[:, 2] - (hc[2] - 0.08)) / 0.1, 0, 1)
            co = hc + (co - hc) * k[:, None]
        if wave:  # loose waves: what hangs below the crown moves out and back along its length
            top = self.C['height'] - 0.06
            d = np.clip(top - co[:, 2], 0, None)
            r = np.hypot(co[:, 0], co[:, 1]) + 1e-6
            k = wave * np.sin(d * 55.0) * np.clip(d / 0.08, 0, 1)
            co[:, 0] += co[:, 0] / r * k
            co[:, 1] += co[:, 1] / r * k
        skin = self.base.skin_names(p)
        faces = p.faces
        if drop:
            faces = [f for f in faces if not drop(co[list(f[0])].mean(0))]
        ob, _ = self.mesh(name or (self.name + '_' + os.path.basename(rel).split('.')[0]), co, faces, p.uv, skin, [mat])
        return ob


    def hair_curves(self, style):
        """The project's Blender hair curves (tools/sprites/build_hair.py — ROTS Anakin, ~10,000 strands, Principled
        Hair BSDF) on this head: the scalp ellipsoid measured from the MakeHuman head, the applied curves appended and
        hung on the head bone."""
        import json
        import subprocess
        hw = [i for i, w in enumerate(self.base.skin_names()) if w.get('head', 0) > 0.6]
        co = self.co_b[hw]
        eye = float(np.mean([self.joint_b[n][0][2] for n in ('eye.L', 'eye.R') if n in self.joint_b] or [self.C['height'] - 0.12]))
        sk = co[co[:, 2] > eye - 0.01]
        lo, hi = sk.min(0), sk.max(0)
        c = (lo + hi) / 2
        c[2] = eye + 0.005
        r = (hi - lo) / 2
        r[2] = hi[2] - c[2]
        head = {'C': [float(c[0]) - 0.004, float(c[1]), float(c[2])], 'R': [float(r[0]) + 0.006, float(r[1]) + 0.006, float(r[2]) + 0.004]}
        out = os.path.join(HERE, '..', 'out', f'hero_{self.name}_hair.blend')
        hj = out[:-6] + '_head.json'
        json.dump(head, open(hj, 'w'))
        subprocess.run([sys.executable, os.path.join(HERE, '..', 'build_hair.py'), out, style, hj], check=True, stdout=subprocess.DEVNULL)
        with bpy.data.libraries.load(out, link=False) as (src, dst):
            dst.objects = ['hair']
        hair = dst.objects[0]
        hair.name = self.name + '_hair'
        bpy.context.scene.collection.objects.link(hair)
        mw = hair.matrix_world.copy()
        hair.parent = self.arm
        hair.parent_type = 'BONE'
        hair.parent_bone = 'head'
        bpy.context.view_layer.update()
        hair.matrix_world = mw
        return hair


import materials  # noqa: E402 (after the helpers it uses)


def build(name, out):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    B = Builder(name)
    B.armature()
    B.body()
    C = B.C
    B.proxy('eyes/HighPolyEyes/HighPolyEyes.json', materials.eyes(C['eyes']), B.name + '_eyes')
    B.proxy(C['brows'] + '/' + C['brows'].split('/')[-1] + '.json', materials.hair_cards(C, 'brows', mh.Proxy(C['brows'] + '/' + C['brows'].split('/')[-1] + '.json').texture()), B.name + '_brows')
    B.proxy('eyelashes/Eyelashes01/Eyelashes01.json', materials.hair_cards(C, 'lashes', mh.Proxy('eyelashes/Eyelashes01/Eyelashes01.json').texture()), B.name + '_lashes')
    base = {}
    for h in C['hair']:
        p = mh.Proxy(h['proxy'])
        base[h['proxy']] = B.proxy(h['proxy'], materials.hair_cards(C, h['color'], p.texture()), B.name + '_hair_' + os.path.basename(h['proxy']).split('.')[0], scale=h.get('scale', 1.0), squash=h.get('squash'), wave=h.get('wave', 0.0), volume=h.get('volume', 1.0))
    if C.get('groom') == 'obiwan':  # strands on the hair / beard proxies (groom.py)
        import groom
        groom.obiwan(B, base[C['hair'][0]['proxy']], [base[h['proxy']] for h in C['hair'][1:]])
    if C.get('hair_curves'):
        B.hair_curves(C['hair_curves'])
    garments.dress(B)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(out))
    print('BUILT', name, out, flush=True)
    return B


if __name__ == '__main__':
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    nm = argv[0]
    build(nm, argv[1] if len(argv) > 1 else os.path.join(HERE, '..', 'out', f'hero_{nm}.blend'))
