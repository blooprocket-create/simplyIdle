"""Where is every object, evaluated, and what material does it carry.\n\nA beauty render is a slow way to find out that a mesh is inside another\none. This answers it directly.

Run: python scripts/blender/dump.py [args]
"""
import os
import runpy
import sys
from pathlib import Path

import bpy
from mathutils import Vector  # noqa: F401  (available to diagnostics)

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
HERO = os.environ.get('HERO', 'kael')
OUT = Path(os.environ.get('HERO_OUT', HERE.parents[1] / '.render'))
OUT.mkdir(parents=True, exist_ok=True)

_argv = sys.argv
sys.argv = [f'{HERO}.py', '--build-only']
try:
    runpy.run_path(str(HERE / f'{HERO}.py'), run_name='hero')
except SystemExit:
    pass
sys.argv = _argv
import herolib as H  # noqa: E402

dg = bpy.context.evaluated_depsgraph_get()
for o in sorted(bpy.data.objects, key=lambda x: x.name):
    if o.type != 'MESH':
        continue
    ev = o.evaluated_get(dg)
    me = ev.to_mesh()
    if not me.vertices:
        print(f'{o.name:14s} *** EMPTY ***')
    else:
        pts = [o.matrix_world @ v.co for v in me.vertices]
        xs = [p.x for p in pts]; ys = [p.y for p in pts]; zs = [p.z for p in pts]
        mat = me.materials[0].name if me.materials else '-'
        print(f'{o.name:14s} v={len(me.vertices):6d} '
              f'x[{min(xs):+.3f},{max(xs):+.3f}] y[{min(ys):+.3f},{max(ys):+.3f}] '
              f'z[{min(zs):+.3f},{max(zs):+.3f}] {mat}')
    ev.to_mesh_clear()
