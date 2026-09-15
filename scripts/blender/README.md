# Hero model pipeline

Builds a hero as a Blender scene, rigs it, renders it and exports a GLB —
headless, from a checkout, with no GUI and no artist in the loop.

```
pip install bpy                                   # Blender as a Python module
python scripts/blender/kael.py                    # full body + bust
python scripts/blender/kael.py --fast             # 24 samples, for iterating
python scripts/blender/kael.py --fast --head      # head only, seconds per look
python scripts/blender/kael.py --pose             # IK test pose
python scripts/blender/kael.py --export           # also write the GLB
```

Output lands in `.render/`, or wherever `HERO_OUT` points. `herolib.py` holds
the shared vocabulary; `kael.py` is the first hero written against it, and
`shen.py` is the first built on the base mesh.

```
python scripts/blender/shen.py                    # full body, bust, portrait framing
python scripts/blender/shen.py --fast --head      # the face, seconds per look
python scripts/blender/shen.py --apose            # bind pose, no staff stance
python scripts/blender/shen.py --export           # also write the GLB
HERO=shen python scripts/blender/turnaround.py    # front, 3/4, side, back, top
```

## How a hero is put together

Every clothing and armour layer is a *shell grown over the same joint
skeleton as the body*, at a larger radius. A box parked beside a limb never
stops reading as a box parked beside a limb; a shell over the shoulder joints
wraps the shoulder.

| helper | for |
| --- | --- |
| `chain()` / `skinned()` | body, cloth, and armour that hugs |
| `slab()` | flat props built from their own silhouette — a kite shield, a blade |
| `plate()` / `wrapped()` | curved armour: a subdivided slab bent around its local Z |
| `cone_shell()` | armour that slopes — a shoulder yoke, a pauldron lame |
| `ring()` | bands around a limb or a waist |

Measured, not guessed: a plate of width `w` bent through angle `t` has radius
`w/t`, keeps its front face where it is put, and sweeps backwards in +Y.

## The face

Front-projected from the painted portrait, baked into a `face` UV layer.
Stacked ellipsoids reach a passable cartoon and stop — six attempts proved
it, the best of them an ape. The scar, the eyes and the weathering are all in
the artwork already, so the geometry supplies silhouette and lighting and the
painting supplies the face. Every other hero inherits their own likeness for
free.

It has to be UVs rather than a world-space projection: a projection slides
off the face the moment the head is posed, and cannot be exported. The
texture is cropped to the head, which takes it from ~7.5MB of mostly
background to ~200KB.

## The rig

One set of joint positions drives both the mesh shells and the bones, so a
pauldron grown over the shoulder joint skins to the bone that shares it.

- **Deform bones**: `root`, `hips`, `spine`, `chest`, `neck`, `head`, and per
  side `shoulder`, `upper_arm`, `forearm`, `hand`, `thigh`, `shin`, `foot`.
  `.L` is the character's left — screen right with the camera in front, the
  side the portrait carries the shield on.
- **Controls** (non-deforming): `hand_ik`, `foot_ik`, and the `elbow_pole` /
  `knee_pole` targets that decide which way a joint breaks. Without poles a
  two-bone chain is free to flip through itself.
- **Binding**: rigid to one bone for anything that is rigid — a pauldron, a
  sword, a boot — and inverse-distance-to-bone-segment for the shells that
  span joints. Bone-heat weighting gives up on overlapping shells like these;
  distance weighting never does.

A pauldron's upper lames ride `shoulder` and its lower ones ride `upper_arm`.
Bound wholly to the arm they swing out like wings the moment an arm lifts.

`--pose` moves only the IK targets. If the limbs follow, the chains and poles
are right; if an elbow inverts, the pole angle is wrong.

## Export

`--export` joins every shell into one multi-material mesh, decimates to a
game budget and writes a GLB: ~2.3MB, 9 primitives, 34k vertices, 28 joints,
all primitives skinned.

glTF carries no constraints, so the IK chains do not travel — they are for
authoring. The exported skeleton is a plain bone hierarchy, which a runtime
solver (Babylon's `BoneIKController`) drives through the same bones.

glTF also carries no node graph, so the procedural weathering does not
export. Each material seeds its Base Color socket with the midpoint of its
ramp, which makes the GLB a plausible flat version rather than default grey;
baking the noise to textures is still open.

## Shen Dawnfist, on the base mesh

`shen.py` is the second hero and the first on `basemesh.py`: the MakeHuman
hm08 body (CC0), with its 125 joint markers as the skeleton. What changed
from building over assembled primitives:

- **Garments are shells of the body.** The tunic, robe, sash, trousers,
  leg wraps, shoes, hand wraps and patches are all `garment()` copies of the
  body trimmed to a region and pushed out along its normals, so cloth cannot
  sit inside skin and a hem cut at a height lands on the mesh's own edge
  loops. Torso regions are bounded in x as well as z: at the A-pose the
  hands hang level with the waist, and a sash that swept them up stayed
  behind when the arms moved. Loose cloth is the same shell thickened
  radially with `bulk()`; torn edges are `fray()`.
- **The face is fitted to the mesh's eyes.** One number — how much of the
  painting spans the interpupillary distance — scales the whole projection,
  and the chin, ears and hairline land where the base mesh has them. The
  crop is `feather()`ed into the skin colour at its margin, which is what
  lets the painted region run round the jaw and meet plain skin without a
  seam; before that the boundary was a stair-step of polygons at the cheek.
- **Fists.** The base mesh's hands are open. `make_fist()` bends every
  vertex past the knuckle line round a circle whose radius is the finger
  length over the fold angle, thumb excepted, and the hand wrap is a shell
  of the result.
- **A head.** The base is eight and a half heads tall; the painting gives
  him a head. Scaled 1.10 about the neck base, joints included.
- **The stance is the rig working.** Both hand IK targets are put on the
  staff with `place()`, which takes a world position rather than a location
  in the bone's own rest frame, and the arms follow. The elbow pole angle
  was found by sweeping it and reading the elbow off: the two sides roll
  differently and need 135° and 0° for mirrored pole targets. The staff is
  built where it ends up and bound to the left hand, so it is first taken
  back through that hand's pose (`pose_delta()`); a prop built at its
  target and bound to a posed bone gets the pose applied twice.
- **Hair is a cap plus tufts.** A smooth cap is a helmet however it is
  coloured. The cap's front edge is frayed, and short strands lie along it
  leaning down and back, with sideburns in front of the ears. The painting
  carries the fringe across the forehead.

`renders/shen.jpg` is the painting beside the front, three-quarter and head
renders, which is the comparison every change here was judged against.

Materials are sampled off the painting in linear light. Every material sets
`use_nodes`, which a material made through the data API does not do on its
own; without it every helper here dereferenced a `node_tree` that was None.

## Diagnostics

A beauty render is a slow way to find out that a mesh is inside another one.

| script | question |
| --- | --- |
| `dump.py` | where is every object, evaluated, and what material does it carry |
| `idpass.py` | which surface am I actually looking at (flat emission per material) |
| `isolate.py steel` | what does one material's geometry look like on its own |
| `isolate.py not-steel` | what is covering it |

Reach for them before changing a number. Four bugs in this pipeline were
invisible in a beauty render and obvious in one of these: a cuirass hidden
2mm behind the gambeson, shade-smooth silently acting on the wrong object,
noise running in per-object space so a large mesh landed wholly on the rust
side of its ramp, and shield rivets placed in world coordinates while the
shield itself was rotated.
