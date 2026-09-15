"""Which surface am I actually looking at.\n\nFlat emission per material, no lighting and no view transform, so\nnothing can be hidden by a reflection or crushed into a neighbour.

Run: python scripts/blender/idpass.py [args]
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

import colorsys

names = sorted({m.name for o in bpy.data.objects if o.type == 'MESH' for m in o.data.materials})
flat = {}
for i, nm in enumerate(names):
    r, g, b = colorsys.hsv_to_rgb(i / max(len(names), 1), 0.95, 1.0)
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

shot = H.stage(fast=True, floor=False)
sc = bpy.context.scene
sc.cycles.samples = 1
sc.view_settings.view_transform = 'Standard'
sc.view_settings.look = 'None'
sc.world.node_tree.nodes['Background'].inputs['Color'].default_value = (0, 0, 0, 1)
shot(OUT / f'{HERO}-id.png', (0.70, -1.85, 1.72), 80, 560, 620, at=(0, 0, 1.58))
