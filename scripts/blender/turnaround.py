"""Look at the hero from every side.

Every judgement so far has been made from the front. A diorama camera will
not stay there, and a front projection plus front-facing placement is exactly
the setup that hides its worst problems from a front view.
"""
import math
import os
import runpy
import sys
from pathlib import Path

import bpy

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

shot = H.stage(fast=True)

# The set is lit cool from the front and warm from behind, which is right for
# a beauty render and useless for judging form: every back view came out
# uniformly tan and told me nothing. Neutral, even light for a turnaround.
for o in bpy.data.objects:
    if o.type == 'LIGHT':
        o.data.color = (1.0, 1.0, 1.0)
        o.data.energy = 230
        o.data.size = 4.0
bpy.context.scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (
    0.055, 0.058, 0.065, 1)
D, Z = 3.9, 1.30
for name, deg in (('front', 0), ('q34', 35), ('side', 90), ('back', 180), ('top', None)):
    if deg is None:
        shot(OUT / f'{HERO}-turn-{name}.png', (0.0, -0.9, 2.62), 55, 380, 520, at=(0, 0, 1.70))
        continue
    a = math.radians(deg)
    shot(OUT / f'{HERO}-turn-{name}.png',
         (math.sin(a) * D, -math.cos(a) * D, Z), 62, 380, 560, at=(0, 0, 1.05))
print('DONE')
