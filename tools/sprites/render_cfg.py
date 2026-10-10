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
PIPELINE_VERSION = 2


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


def source_hash(files, settings):
    """sha256 of the files (.glb by content, see glb_digest; missing ones skipped)
    and the settings, 16 hex digits."""
    h = hashlib.sha256(f'pipeline {PIPELINE_VERSION}'.encode())
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
