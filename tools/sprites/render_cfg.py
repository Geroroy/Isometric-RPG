"""Shared by the render scripts: render_config.json (the project's render
settings — every script reads them from there), the GPU check, and the
change detection (a hash of everything an output depends on, stored in the
output's JSON; an output with the same hash is up to date)."""
import hashlib
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
CFG = json.load(open(os.path.join(ROOT, 'render_config.json')))
# bump when a change to the render scripts changes their output (a doc or
# refactor edit must not re-render every sheet): it is part of every hash
PIPELINE_VERSION = 3  # 3: blade occlusion rays step through the saber itself


def setup_gpu(bpy):
    """Cycles on a GPU when Blender finds one (device.prefer: auto / gpu / cpu)."""
    if CFG['device']['prefer'] == 'cpu':
        return False
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
    except KeyError:
        return False
    for kind in ('OPTIX', 'CUDA', 'HIP', 'ONEAPI', 'METAL'):
        try:
            prefs.compute_device_type = kind
        except TypeError:
            continue
        prefs.get_devices()
        if any(d.type == kind for d in prefs.devices):
            for d in prefs.devices:
                d.use = d.type == kind
            return True
    return False


def glb_digest(path):
    """A .glb's content, independent of the order its triangles were written in
    (Blender's exporter does not always write an ngon's triangles the same way,
    and their normals then differ in the last bits): the JSON, every buffer
    view, index buffers as their sorted triangles, floats rounded to 1e-3."""
    import struct
    import numpy as np
    b = open(path, 'rb').read()
    n = struct.unpack('<I', b[12:16])[0]
    js = json.loads(b[20:20 + n])
    binary = b[20 + n + 8:]
    h = hashlib.sha256(b[20:20 + n])
    indices = {p['indices'] for m in js.get('meshes', []) for p in m['primitives'] if 'indices' in p and p.get('mode', 4) == 4}
    by_view = {js['accessors'][a]['bufferView']: js['accessors'][a] for a in indices}
    floats = {ac['bufferView'] for ac in js.get('accessors', []) if ac.get('componentType') == 5126 and 'bufferView' in ac}
    for i, bv in enumerate(js.get('bufferViews', [])):
        chunk = binary[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']]
        ac = by_view.get(i)
        if ac is not None and ac['count'] % 3 == 0:
            dt = {5121: np.uint8, 5123: np.uint16, 5125: np.uint32}[ac['componentType']]
            tri = np.frombuffer(chunk, dt, ac['count'], ac.get('byteOffset', 0)).reshape(-1, 3).astype(np.int64)
            # a triangle's rotation keeps its winding: start each at its smallest index
            r = np.argmin(tri, axis=1)
            tri = np.stack([tri[np.arange(len(tri)), (r + k) % 3] for k in range(3)], axis=1)
            chunk = tri[np.lexsort(tri.T[::-1])].tobytes()
        elif i in floats and len(chunk) % 4 == 0:  # float data: rounded (normals wobble in the last bits)
            chunk = np.round(np.frombuffer(chunk, np.float32), 3).tobytes()
        h.update(chunk)
    return h.hexdigest()


def _glb(path):
    import struct
    b = open(path, 'rb').read()
    n = struct.unpack('<I', b[12:16])[0]
    return json.loads(b[20:20 + n]), b[20 + n + 8:]


def glb_split(path):
    """A .glb as (the model's digest, {animation: its digest}) — the model being
    everything but the animations (meshes, materials, images, nodes, skins),
    so that a new or changed animation leaves the model's digest alone. Built
    like glb_digest: the JSON (without the animations and their accessors and
    buffer views) and every remaining buffer view, triangles sorted, floats
    rounded to 1e-3. An animation's digest: its channels by node name and
    path, its interpolation, and its keyframe times and values (rounded to
    1e-4). The exporters write the animations' data after the model's, so the
    model's accessor and view numbers do not move when an animation changes;
    if they ever did, the model's digest changes too — a full render, never a
    stale sheet."""
    import numpy as np
    js, binary = _glb(path)
    anim_acc = {i for a in js.get('animations', []) for s in a['samplers'] for i in (s['input'], s['output'])}
    accs = js.get('accessors', [])
    model_views = {ac['bufferView'] for i, ac in enumerate(accs) if i not in anim_acc and 'bufferView' in ac}
    model_views |= {im['bufferView'] for im in js.get('images', []) if 'bufferView' in im}

    def trim(xs):
        while xs and xs[-1] is None:
            xs.pop()
        return xs
    model = {k: v for k, v in js.items() if k not in ('animations', 'buffers', 'accessors', 'bufferViews')}
    model['accessors'] = trim([None if i in anim_acc else ac for i, ac in enumerate(accs)])
    model['bufferViews'] = trim([bv if i in model_views else None for i, bv in enumerate(js.get('bufferViews', []))])
    h = hashlib.sha256(json.dumps(model, sort_keys=True).encode())
    indices = {p['indices'] for m in js.get('meshes', []) for p in m['primitives'] if 'indices' in p and p.get('mode', 4) == 4}
    by_view = {accs[a]['bufferView']: accs[a] for a in indices}
    floats = {ac['bufferView'] for ac in accs if ac.get('componentType') == 5126 and 'bufferView' in ac}
    views = js.get('bufferViews', [])
    for i, bv in enumerate(views):
        if i not in model_views:
            continue
        chunk = binary[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']]
        ac = by_view.get(i)
        if ac is not None and ac['count'] % 3 == 0:
            dt = {5121: np.uint8, 5123: np.uint16, 5125: np.uint32}[ac['componentType']]
            tri = np.frombuffer(chunk, dt, ac['count'], ac.get('byteOffset', 0)).reshape(-1, 3).astype(np.int64)
            r = np.argmin(tri, axis=1)
            tri = np.stack([tri[np.arange(len(tri)), (r + k) % 3] for k in range(3)], axis=1)
            chunk = tri[np.lexsort(tri.T[::-1])].tobytes()
        elif i in floats and len(chunk) % 4 == 0:
            chunk = np.round(np.frombuffer(chunk, np.float32), 3).tobytes()
        h.update(chunk)

    def data(i):
        ac = accs[i]
        bv = views[ac['bufferView']]
        comps = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[ac['type']]
        a = np.frombuffer(binary, np.float32, ac['count'] * comps, bv.get('byteOffset', 0) + ac.get('byteOffset', 0))
        return np.round(a, 4).tobytes()
    anims = {}
    for a in js.get('animations', []):
        ha = hashlib.sha256()
        for c in a['channels']:
            s = a['samplers'][c['sampler']]
            node = js['nodes'][c['target']['node']].get('name', c['target']['node'])
            ha.update(json.dumps([node, c['target']['path'], s.get('interpolation', 'LINEAR')]).encode())
            ha.update(data(s['input']))
            ha.update(data(s['output']))
        anims[a.get('name', '')] = ha.hexdigest()
    return h.hexdigest(), anims


def sheet_hashes(glb, files, meta, settings, only=None):
    """What a sheet depends on, split so that one animation can be rendered
    again on its own: `base` (the model without its animations, the other
    files such as the hair, the settings, PIPELINE_VERSION) and, per
    animation, its keyframes and its timing entry in the meta file. A sheet
    whose base matches only needs the animations whose hash differs; a
    different base means every animation. `source` covers both."""
    model, anim_digests = glb_split(glb)
    h = hashlib.sha256(f'pipeline {PIPELINE_VERSION}'.encode())
    h.update(model.encode())
    for f in files:
        if f and os.path.exists(f):
            h.update(glb_digest(f).encode() if f.endswith('.glb') else open(f, 'rb').read())
    h.update(json.dumps(settings, sort_keys=True, default=str).encode())
    base = h.hexdigest()[:16]
    timing = json.load(open(meta))['anims'] if meta and os.path.exists(meta) else {}
    anims = {n: hashlib.sha256((d + json.dumps(timing.get(n), sort_keys=True)).encode()).hexdigest()[:16] for n, d in anim_digests.items() if not only or n in only}
    source = hashlib.sha256((base + json.dumps(anims, sort_keys=True)).encode()).hexdigest()[:16]
    return base, anims, source


def source_hash(files, settings, version=None):
    """sha256 of the files (.glb by content, see glb_digest; missing ones skipped)
    and the settings, 16 hex digits. (The single hash sheets carried before
    sheet_hashes; `version`: the PIPELINE_VERSION they were made with.)"""
    h = hashlib.sha256(f'pipeline {version or PIPELINE_VERSION}'.encode())
    for f in files:
        if f and os.path.exists(f):
            h.update(glb_digest(f).encode() if f.endswith('.glb') else open(f, 'rb').read())
    h.update(json.dumps(settings, sort_keys=True, default=str).encode())
    return h.hexdigest()[:16]


def effective(section, used_elsewhere=()):
    """A config section without its notes (_doc keys) and without the settings
    already hashed as the values actually used (engine, samples, mirroring…):
    editing a note, or a setting for another machine, re-renders nothing."""
    return {k: v for k, v in section.items() if not k.startswith('_') and k not in used_elsewhere}


def up_to_date(json_paths, source):
    return all(os.path.exists(p) and json.load(open(p)).get('source') == source for p in json_paths)
