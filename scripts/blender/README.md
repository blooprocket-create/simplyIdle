# Hero model pipeline

Builds a hero as a Blender scene and renders it, with no GUI and no artist in
the loop. Everything here runs headless from a checkout.

```
pip install bpy            # Blender as a Python module
python scripts/blender/kael.py            # full body + bust
python scripts/blender/kael.py --fast     # 24 samples, for iterating
python scripts/blender/kael.py --fast --head   # head only, seconds per look
```

Renders land in `.render/` at the repo root, or wherever `HERO_OUT` points.

## How a hero is put together

Every clothing and armour layer is a *shell grown over the same joint
skeleton as the body*, at a larger radius. A box parked next to a limb never
stops reading as a box parked next to a limb; a shell over the shoulder
joints wraps the shoulder. `chain()` and `skinned()` do this.

Flat props — a shield, a blade — are built from their own silhouette by
`slab()`. Curved armour uses `plate()` (a subdivided slab bent around its
local Z), `cone_shell()` for anything that slopes, and `ring()` for bands
around a limb or waist.

The face is the painted portrait, front-projected onto the head geometry by
`projected()`. Stacked ellipsoids reach a passable cartoon and stop; the
scar, the eyes and the weathering are all in the artwork already. Geometry
supplies silhouette and lighting, the painting supplies the face.

## Diagnostics

Renders are a slow way to find out that a mesh is inside another one. These
answer the question directly:

| script | question |
| --- | --- |
| `dump.py` | where is every object, evaluated, and what material does it carry |
| `idpass.py` | which surface am I actually looking at (flat emission per material) |
| `isolate.py steel` | what does one material's geometry look like on its own |
| `isolate.py not-steel` | what is covering it |

Reach for them before changing a number. Three separate bugs in this file —
a cuirass hidden 2mm behind the gambeson, shade-smooth silently acting on
the wrong object, and noise running in per-object space so a large mesh
landed wholly on the rust side of its ramp — were all invisible in a beauty
render and obvious in one of these.
