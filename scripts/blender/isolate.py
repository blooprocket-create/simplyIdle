"""What does one material look like on its own, and what covers it.\n\nPass a material name to keep only it, or `not-<name>` to keep\neverything else.

Run: python scripts/blender/isolate.py [args]
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

want = sys.argv[-1] if len(sys.argv) > 1 else 'steel'
invert = want.startswith('not-')
target = want[4:] if invert else want
for o in list(bpy.data.objects):
    if o.type != 'MESH' or o.name == 'floor':
        continue
    has = target in {m.name for m in o.data.materials}
    if has == invert:
        bpy.data.objects.remove(o, do_unlink=True)

shot = H.stage(fast=True)
shot(OUT / f'{HERO}-iso.png', (0.62, -2.30, 1.62), 74, 460, 560, at=(0, 0, 1.36))
