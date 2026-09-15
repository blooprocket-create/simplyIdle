import bpy, os, sys
from pathlib import Path
HERE = Path(__file__).resolve().parent
OUT = Path(os.environ.get('HERO_OUT', HERE.parents[1] / '.render'))
OUT.mkdir(parents=True, exist_ok=True)
src = (HERE / 'kael.py').read_text()
src = src.split("# ── stage")[0]
exec(compile(src, 'kael.py', 'exec'))
dg = bpy.context.evaluated_depsgraph_get()
for o in sorted(bpy.data.objects, key=lambda x: x.name):
    if o.type != 'MESH':
        continue
    ev = o.evaluated_get(dg)
    me = ev.to_mesh()
    n = len(me.vertices)
    if n:
        zs = [ (o.matrix_world @ v.co).z for v in me.vertices ]
        xs = [ (o.matrix_world @ v.co).x for v in me.vertices ]
        print(f'{o.name:14s} verts={n:6d} x[{min(xs):+.3f},{max(xs):+.3f}] z[{min(zs):+.3f},{max(zs):+.3f}] mat={me.materials[0].name if me.materials else "-"}')
    else:
        print(f'{o.name:14s} verts=0  *** EMPTY ***  mats={[m.name for m in o.data.materials]}')
    ev.to_mesh_clear()
