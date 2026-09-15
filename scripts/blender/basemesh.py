"""The MakeHuman hm08 base mesh, as a body and a set of anatomical joints.

Hand-placed ellipsoids cannot produce a human. This is a real base mesh with
real topology, released as CC0 1.0 (public domain) by the MakeHuman project
in September 2020, so it can ship in a commercial game without attribution.

The file also carries `joint-*` marker groups — small cubes sitting at each
anatomical joint. Their centroids are a correct skeleton, measured rather
than guessed, and both the shells and the armature are built from them.
"""
import os
import urllib.request
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector

SOURCE = ('https://raw.githubusercontent.com/makehumancommunity/makehuman/'
          'master/makehuman/data/3dobjs/base.obj')
CACHE = Path(os.environ.get('HERO_CACHE', Path.home() / '.cache' / 'simplyidle-basemesh'))


def fetch(url=SOURCE):
    """Download once, then reuse. The asset is CC0; see the file header."""
    CACHE.mkdir(parents=True, exist_ok=True)
    dest = CACHE / 'hm08-base.obj'
    if not dest.exists():
        urllib.request.urlretrieve(url, dest)
    return dest


def load(path=None, height=1.85):
    """Parse the OBJ into (body mesh object, joint positions).

    MakeHuman is Y-up with the figure facing -Z; Blender is Z-up facing -Y.
    The mesh is scaled so the figure stands `height` metres tall with its
    feet on the floor, which is the space everything else here works in.
    """
    path = Path(path or fetch())
    verts, groups, current = [], {}, None
    for line in path.read_text().splitlines():
        if line.startswith('v '):
            x, y, z = (float(v) for v in line.split()[1:4])
            # MakeHuman is Y-up with the figure facing +Z; here it is Z-up
            # facing -Y, towards the camera. (x, -z, y) is a rotation with
            # determinant +1. Permuting the axes instead, or negating X as
            # well, mirrors the figure and silently swaps its left and right
            # — which would put every `l-` joint on the wrong side.
            verts.append((x, -z, y))
        elif line.startswith('g '):
            current = line[2:].strip()
            groups.setdefault(current, [])
        elif line.startswith('f ') and current is not None:
            groups[current].append([int(t.split('/')[0]) - 1 for t in line.split()[1:]])

    lo = min(v[2] for v in verts)
    hi = max(v[2] for v in verts)
    k = height / (hi - lo)

    def fix(v):
        return Vector((v[0] * k, v[1] * k, (v[2] - lo) * k))

    scaled = [fix(v) for v in verts]

    joints = {}
    for name, faces in groups.items():
        if not name.startswith('joint-') or not faces:
            continue
        idx = {i for f in faces for i in f}
        c = Vector((0, 0, 0))
        for i in idx:
            c += scaled[i]
        joints[name[len('joint-'):]] = c / len(idx)

    me = bpy.data.meshes.new('basebody')
    ob = bpy.data.objects.new('basebody', me)
    bpy.context.collection.objects.link(ob)
    bm = bmesh.new()
    used = {i for f in groups.get('body', []) for i in f}
    remap = {}
    for i in sorted(used):
        remap[i] = bm.verts.new(scaled[i])
    bm.verts.ensure_lookup_table()
    for f in groups.get('body', []):
        try:
            bm.faces.new([remap[i] for i in f])
        except ValueError:
            pass  # duplicate face in the source
    bm.to_mesh(me)
    bm.free()
    me.validate()
    return ob, joints
