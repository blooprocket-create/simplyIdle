import bpy, bmesh, math, os, sys
from pathlib import Path
HERE = Path(__file__).resolve().parent
OUT = Path(os.environ.get('HERO_OUT', HERE.parents[1] / '.render'))
OUT.mkdir(parents=True, exist_ok=True)
src = (HERE / 'kael.py').read_text()
exec(compile(src[:src.index("# ── stage")], 'kael.py', 'exec'))
want = sys.argv[-1]
for o in list(bpy.data.objects):
    if o.type != 'MESH':
        continue
    mats = [m.name for m in o.data.materials]
    keep = (want in mats) if want != 'not-steel' else ('steel' not in mats)
    if not keep:
        bpy.data.objects.remove(o, do_unlink=True)
exec(compile(src[src.index("# ── stage"):].replace(
    "shot(str(OUT / 'kael-full.png'), (1.55, -4.20, 1.40), 62, 520, 780)",
    "shot(str(OUT / 'kael-iso.png'), (0.62, -2.30, 1.62), 74, 460, 560, at=(0, 0, 1.36))")
    .replace("shot(str(OUT / 'kael-bust.png'), (0.70, -1.85, 1.72), 80, 560, 620, at=(0, 0, 1.58))", "pass"),
    'stage', 'exec'))
