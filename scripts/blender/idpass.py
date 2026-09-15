import bpy, bmesh, math, os, sys, colorsys
from pathlib import Path
HERE = Path(__file__).resolve().parent
OUT = Path(os.environ.get('HERO_OUT', HERE.parents[1] / '.render'))
OUT.mkdir(parents=True, exist_ok=True)
src = (HERE / 'kael.py').read_text()
exec(compile(src.split("# ── stage")[0], 'kael.py', 'exec'))

# Flat emission per material, so every surface is identifiable by colour and
# nothing is hidden by lighting, reflection or the view transform.
names = sorted({m.name for o in bpy.data.objects if o.type == 'MESH' for m in o.data.materials})
flat = {}
for i, nm in enumerate(names):
    r, g, b = colorsys.hsv_to_rgb(i / len(names), 0.95, 1.0)
    m = bpy.data.materials.new('id_' + nm)
    m.node_tree.nodes.clear()
    e = m.node_tree.nodes.new('ShaderNodeEmission')
    e.inputs['Color'].default_value = (r, g, b, 1)
    out = m.node_tree.nodes.new('ShaderNodeOutputMaterial')
    m.node_tree.links.new(e.outputs['Emission'], out.inputs['Surface'])
    flat[nm] = m
    print(f'{nm:14s} rgb=({r:.2f},{g:.2f},{b:.2f})')
for o in bpy.data.objects:
    if o.type == 'MESH':
        for i, m in enumerate(o.data.materials):
            o.data.materials[i] = flat[m.name]

sc = bpy.context.scene
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 1
sc.view_settings.view_transform = 'Standard'; sc.view_settings.look = 'None'
w = bpy.data.worlds.new('w'); sc.world = w
w.node_tree.nodes['Background'].inputs['Color'].default_value = (0, 0, 0, 1)
bpy.ops.object.empty_add(location=(0, 0, 1.58)); aim = bpy.context.object
bpy.ops.object.camera_add(location=(0.70, -1.85, 1.72)); cam = bpy.context.object; sc.camera = cam
c = cam.constraints.new('TRACK_TO'); c.target = aim
c.track_axis = 'TRACK_NEGATIVE_Z'; c.up_axis = 'UP_Y'
cam.data.lens = 80
sc.render.resolution_x = 560; sc.render.resolution_y = 620
sc.render.filepath = str(OUT / 'kael-id.png')
bpy.ops.render.render(write_still=True)
