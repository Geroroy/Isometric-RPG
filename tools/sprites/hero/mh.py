"""
MakeHuman 1.1 data (npm makehuman-data, three.js JSON) -> numpy: the base mesh, its skeleton and skin weights,
the morph targets with MakeHuman's macro rules (gender · age · muscle · weight · height · proportions · ethnicity
and the paired face/body modifiers), and proxy fitting (clothes, hair, eyes, brows: each proxy vertex sits on a
triangle of the base mesh by barycentric weights + an offset, so it follows the morphed body).

No bpy here: build_hero.py turns the arrays into Blender objects. Units stay MakeHuman's (decimetres, +Y up,
the model faces +Z, +X is the model's left); build_hero.py converts.
"""
import ast
import json
import os

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, '..', 'out', 'makehuman-data')
PUB = os.path.join(DATA, 'public', 'data')


def _faces(raw, nuv):
    """three.js JSON v3 face stream -> [(verts, mat, uv_idx)]"""
    out, i, n = [], 0, len(raw)
    while i < n:
        t = raw[i]
        i += 1
        nv = 4 if t & 1 else 3
        verts = raw[i:i + nv]
        i += nv
        mat = 0
        if t & 2:
            mat = raw[i]
            i += 1
        if t & 4:
            i += nuv
        uv = None
        if t & 8:
            uv = raw[i:i + nv]
            i += nv * nuv
        if t & 16:
            i += 1
        if t & 32:
            i += nv
        if t & 64:
            i += 1
        if t & 128:
            i += nv
        out.append((verts, mat, uv))
    return out


class Mesh:
    """A three.js JSON mesh: coords (N, 3), faces, uvs (M, 2), materials, skin (indices, weights) (N, 4)."""

    def __init__(self, path):
        d = json.load(open(path))
        self.d = d
        self.co = np.asarray(d['vertices'], np.float64).reshape(-1, 3)
        uv = d['uvs'][0] if d['uvs'] and d['uvs'][0] else []
        self.uv = np.asarray(uv, np.float64).reshape(-1, 2)
        self.faces = _faces(d['faces'], max(1, len([u for u in d['uvs'] if u])))
        self.mats = d['materials']
        k = d.get('influencesPerVertex', 4)
        self.skin_idx = np.asarray(d['skinIndices'], np.int32).reshape(-1, k)
        self.skin_w = np.asarray(d['skinWeights'], np.float64).reshape(-1, k)
        self.bones = d['bones']
        self.meta = d.get('metadata', {})


class Base(Mesh):
    def __init__(self):
        super().__init__(os.path.join(PUB, 'models', 'human_full_size.json'))
        j = self.meta['joint_pos_idxs']
        self.joint_idx = ast.literal_eval(j) if isinstance(j, str) else j
        names = sorted(json.load(open(os.path.join(DATA, 'src', 'json', 'targets', 'target-list.json')))['targets'])
        self.target_names = names
        self.target_index = {n: i for i, n in enumerate(names)}
        self._targets = None
        self.categories = json.load(open(os.path.join(DATA, 'src', 'json', 'targets', 'target-category-data.json')))

    def targets(self):
        if self._targets is None:
            raw = np.fromfile(os.path.join(PUB, 'targets', 'targets.bin'), dtype=np.int16)
            self._targets = raw.reshape(len(self.target_names), -1)
        return self._targets

    def body_faces(self):
        """Faces of the skin itself (material 'body'), not the helper geometry (tights, skirt, joint cubes)."""
        body = next(i for i, m in enumerate(self.mats) if m.get('DbgName') == 'body')
        return [f for f in self.faces if f[1] == body]

    # ----------------------------------------------------------------------------------------- morphing
    def macro_weights(self, gender=1.0, age=0.5, muscle=0.5, weight=0.5, height=0.5, proportions=0.5,
                      caucasian=1.0, african=0.0, asian=0.0):
        """{target: weight} of MakeHuman's macro targets for these slider values (human.py _set*Vals: each target's
        weight is the product of the values its name's variables take)."""
        v = {}
        v['male'], v['female'] = gender, 1 - gender
        if age < 0.5:
            v['old'] = 0.0
            v['baby'] = max(0.0, 1 - age * 5.333)
            v['young'] = max(0.0, (age - 0.1875) * 3.2)
            v['child'] = max(0.0, min(1.0, 5.333 * age) - v['young'])
        else:
            v['child'] = v['baby'] = 0.0
            v['old'] = max(0.0, age * 2 - 1)
            v['young'] = 1 - v['old']

        def three(x, lo, mid, hi, avg_rule='sum'):
            v[hi] = max(0.0, x * 2 - 1)
            v[lo] = max(0.0, 1 - x * 2)
            v[mid] = 1 - (v[hi] + v[lo]) if avg_rule == 'sum' else (1 - v[hi] if v[hi] > v[lo] else 1 - v[lo])

        three(weight, 'minweight', 'averageweight', 'maxweight')
        three(muscle, 'minmuscle', 'averagemuscle', 'maxmuscle')
        three(height, 'minheight', 'averageheight', 'maxheight', 'max')
        three(proportions, 'uncommonproportions', 'regularproportions', 'idealproportions', 'max')
        three(0.5, 'mincup', 'averagecup', 'maxcup', 'max')
        three(0.5, 'minfirmness', 'averagefirmness', 'maxfirmness', 'max')
        tot = caucasian + african + asian
        v['caucasian'], v['african'], v['asian'] = caucasian / tot, african / tot, asian / tot
        v['universal'] = 1.0
        out = {}
        for n in self.target_names:
            if not n.startswith(('data/targets/macrodetails/', 'data/targets/breast/')):
                continue
            stem = os.path.basename(n)[:-len('.target')]
            toks = stem.split('-')
            if any(t not in v for t in toks):
                continue
            w = 1.0
            for t in toks:
                w *= v[t]
            if w > 1e-6:
                out[n] = w
        return out

    def modifier(self, group, value):
        """A paired face/body modifier (MakeHuman's -1..1 slider): 'chin/chin-jutting-in|out' style — `group` is
        the target path without the end ('data/targets/chin/chin-jutting'), value < 0 uses the first word
        (decr/in/down/...), > 0 the second. Returns {target: weight}."""
        cands = [n for n in self.target_names if n.startswith(group + '-')]
        if not cands:
            raise KeyError(group)
        pairs = {}
        for n in cands:
            pairs.setdefault(n[len(group) + 1:-len('.target')], n)
        ends = sorted(pairs)
        neg_words = ('decr', 'in', 'down', 'backward', 'less', 'min', 'concave', 'compression', 'close', 'small', 'narrow')
        neg = [e for e in ends if e in neg_words or e.startswith(neg_words)]
        pos = [e for e in ends if e not in neg]
        if value < 0 and neg:
            return {pairs[neg[0]]: -value}
        if value > 0 and pos:
            return {pairs[pos[0]]: value}
        return {}

    def morph(self, weights):
        """Base coords + Σ weight × target (targets are int16 × 1e-3 MakeHuman units)."""
        T = self.targets()
        co = self.co.copy().reshape(-1)
        for n, w in weights.items():
            co += T[self.target_index[n]].astype(np.float64) * (w * 1e-3)
        return co.reshape(-1, 3)

    def joints(self, co):
        """{bone: (head, tail)} from the morphed coords: each end = the mean of its joint vertices (MakeHuman's rule)."""
        out = {}
        for b in self.bones:
            n = b['name']
            if n.endswith('____head'):
                continue
            h = self.joint_idx.get(n + '____head')
            t = self.joint_idx.get(n + '____tail')
            if h is None or t is None:
                continue
            out[n] = (co[h].mean(0), co[t].mean(0))
        return out

    def bone_parents(self):
        """{bone: parent bone or None} (the JSON alternates 'name____head' (the joint) and 'name')."""
        names = [b['name'] for b in self.bones]
        par = {}
        for b in self.bones:
            n = b['name']
            if n.endswith('____head'):
                continue
            p = b['parent']
            while p >= 0 and names[p].endswith('____head'):
                p = self.bones[p]['parent']
            par[n] = names[p] if p >= 0 else None
        return par

    def skin_names(self, mesh=None):
        """Per vertex [(bone, weight)] of a mesh's skin (indices into the 326-entry bone list)."""
        m = mesh or self
        names = [b['name'].replace('____head', '') for b in m.bones]
        out = []
        for idx, w in zip(m.skin_idx, m.skin_w):
            acc = {}
            for i, x in zip(idx, w):
                if x > 0:
                    acc[names[i]] = acc.get(names[i], 0) + float(x)
            out.append(acc)
        return out


class Proxy(Mesh):
    """A fitted proxy (clothes, hair, eyes, brows, lashes, teeth): vertex i = Σ w_ij base[ref_ij] + offset_i."""

    def __init__(self, rel):
        self.rel = rel
        super().__init__(os.path.join(PUB, 'proxies', rel))
        self.ref = np.asarray(self.d['ref_vIdxs'], np.int64)
        self.w = np.asarray(self.d['weights'], np.float64)
        self.off = np.asarray(self.d['offsets'], np.float64)
        self.dir = os.path.dirname(os.path.join(PUB, 'proxies', rel))

    def fit(self, base_co, scale=1.0):
        """Proxy coords on a morphed base. MakeHuman scales offsets by the body's local size; the bodies here stay
        close to the default so the plain offset (× scale) is enough."""
        return (base_co[self.ref] * self.w[..., None]).sum(1) + self.off * scale

    def texture(self, key='mapDiffuse'):
        m = self.mats[0] if self.mats else {}
        f = m.get(key)
        return os.path.join(self.dir, f) if f else None


def skin_texture(name):
    d = os.path.join(PUB, 'skins', name)
    j = json.load(open(os.path.join(d, os.path.basename(name) + '.json')))
    return os.path.join(d, j['mapDiffuse'])
