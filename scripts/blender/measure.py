"""Cross-sections of the built figure, so armour is placed against numbers.

Every layering bug in this pipeline came from guessing how wide something
was underneath. This prints the half-width and half-depth of each mesh at a
set of heights; a shell has to clear the largest of them to be visible.
"""
import os
import runpy
import sys
from pathlib import Path

import bpy

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
HERO = os.environ.get('HERO', 'kael2')
_argv = sys.argv
sys.argv = [f'{HERO}.py', '--build-only']
try:
    runpy.run_path(str(HERE / f'{HERO}.py'), run_name='hero')
except SystemExit:
    pass
sys.argv = _argv

HEIGHTS = [float(x) for x in
           (os.environ.get('AT') or '0.95,1.05,1.15,1.25,1.35,1.45,1.50,1.55,1.60').split(',')]
dg = bpy.context.evaluated_depsgraph_get()
rows = {}
for o in bpy.data.objects:
    if o.type != 'MESH' or o.name in ('floor',):
        continue
    ev = o.evaluated_get(dg)
    me = ev.to_mesh()
    pts = [o.matrix_world @ v.co for v in me.vertices]
    for h in HEIGHTS:
        # Torso only: at an A-pose the arms sit at the same heights as the
        # chest and would dominate every width reading.
        near = [p for p in pts if abs(p.z - h) < 0.012 and abs(p.x) < 0.28]
        if len(near) > 6:
            rows.setdefault(h, []).append(
                (o.name, max(abs(p.x) for p in near), max(-p.y for p in near)))
    ev.to_mesh_clear()
for h in HEIGHTS:
    print(f'z={h:.2f}')
    for name, hx, fy in sorted(rows.get(h, []), key=lambda r: -r[1])[:6]:
        print(f'    {name:14s} half-width {hx:.3f}   front {fy:+.3f}')
