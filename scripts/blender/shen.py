"""Shen Dawnfist: a monastery monk in a patched travelling robe, with a staff.

Built on the CC0 MakeHuman base mesh. Everything he wears is cloth, rope,
wood and beads, so every garment is a shell of the body underneath and every
prop is placed against the mesh's own joint markers. The staff stance is the
rig doing its job: both hands are put on the staff through the IK targets and
the arms follow.

    python scripts/blender/shen.py                 # full body + bust
    python scripts/blender/shen.py --fast          # 24 samples, for iterating
    python scripts/blender/shen.py --apose         # bind pose, no staff stance
    python scripts/blender/shen.py --export        # also write the GLB

Renders land in `.render/`, or wherever HERO_OUT points.
"""
import math
import random
import sys

import bpy
from mathutils import Matrix, Vector

import basemesh
import herolib as H
from herolib import R

FAST = '--fast' in sys.argv
APOSE = '--apose' in sys.argv
H.reset()

bpy.ops.object.empty_add(location=(0, 0, 0))
TEXSPACE = bpy.context.object
TEXSPACE.name = 'texspace'


def _worn(*a, **k):
    return H.worn(*a, texspace=TEXSPACE, **k)


# ── materials, sampled off the painting ───────────────────────────────────
# Read from the portrait in linear light: warm tan skin, a brown robe that has
# been patched more than once, an olive under-tunic, and wooden beads that
# are the only thing on him with a shine.
SKIN_RGB = (0.200, 0.090, 0.050)
SKIN = H.plain('skin', SKIN_RGB, 0.55)
HAIR = H.plain('hair', (0.018, 0.014, 0.010), 0.88)
ROBE = _worn('robe', (0.056, 0.032, 0.015), (0.118, 0.082, 0.036), (0.82, 0.96), 0.0, 55.0, 0.18)
PATCH = _worn('patch', (0.075, 0.050, 0.024), (0.115, 0.082, 0.040), (0.85, 0.96), 0.0, 70.0, 0.15)
TUNIC = _worn('tunic', (0.058, 0.070, 0.028), (0.096, 0.088, 0.040), (0.80, 0.95), 0.0, 60.0, 0.15)
SASH = _worn('sash', (0.070, 0.038, 0.018), (0.110, 0.062, 0.030), (0.78, 0.94), 0.0, 48.0, 0.18)
ROPE = _worn('rope', (0.110, 0.070, 0.034), (0.170, 0.108, 0.056), (0.80, 0.95), 0.0, 90.0, 0.35)
WRAP = _worn('wrap', (0.150, 0.112, 0.074), (0.215, 0.165, 0.112), (0.85, 0.97), 0.0, 80.0, 0.22)
TROUS = _worn('trousers', (0.020, 0.016, 0.008), (0.036, 0.030, 0.014), (0.85, 0.96), 0.0, 50.0, 0.15)
SHOE = _worn('shoe', (0.024, 0.016, 0.010), (0.040, 0.027, 0.017), (0.55, 0.85), 0.0, 40.0, 0.20)
WOOD = _worn('wood', (0.090, 0.060, 0.034), (0.165, 0.112, 0.070), (0.55, 0.82), 0.0, 22.0, 0.40)
BEAD = _worn('bead', (0.200, 0.125, 0.062), (0.290, 0.195, 0.105), (0.28, 0.45), 0.0, 30.0, 0.10)

# ── body ──────────────────────────────────────────────────────────────────
BODY, J = basemesh.load(height=1.78)

# The base is slight and androgynous. Shen is lean but has carried a staff
# up a mountain every day of his life: a little more arm and shoulder, a
# flat chest, a thicker neck. The skeleton goes through the same transform.
_limbs = []
for _t in ('l', 'r'):
    _limbs += [
        (tuple(J[f'{_t}-shoulder']), tuple(J[f'{_t}-elbow']), 1.14, 0.13),
        (tuple(J[f'{_t}-elbow']), tuple(J[f'{_t}-hand']), 1.10, 0.10),
        (tuple(J[f'{_t}-upper-leg']), tuple(J[f'{_t}-knee']), 1.05, 0.16),
        (tuple(J[f'{_t}-knee']), tuple(J[f'{_t}-ankle']), 1.04, 0.12),
    ]
_xf = H.bulk(
    BODY,
    widen=[(0.00, 1.00), (0.90, 1.02), (1.20, 1.05), (1.44, 1.06), (1.50, 1.03),
           (1.56, 1.00), (1.95, 1.00)],
    deepen=[(0.00, 1.00), (0.90, 1.03), (1.20, 1.06), (1.44, 1.05), (1.50, 1.01),
            (1.56, 1.00), (1.95, 1.00)],
    limbs=_limbs,
    flatten=(1.23, 1.47, 0.18, 0.45),
)
J = {name: _xf(p) for name, p in J.items()}

# The base mesh is eight and a half heads tall, which is a fashion plate.
# The painting is a portrait and gives him a head: scaled up about the neck
# base, with the joints inside it going through the same transform.
HEAD_K, HEAD_PIVOT = 1.10, Vector((0, -0.012, 1.515))


def head_xf(p):
    p = Vector(p)
    if p.z <= 1.49:
        return p
    k = 1 + (HEAD_K - 1) * min(1.0, (p.z - 1.49) / 0.06)
    return HEAD_PIVOT + (p - HEAD_PIVOT) * k


for _v in BODY.data.vertices:
    _v.co = head_xf(_v.co)
J = {name: head_xf(p) for name, p in J.items()}


def j(name):
    return tuple(J[name])


def make_fist(body, m):
    """Curl the fingers of the base mesh's open hand into a fist.

    A bend along the fingers about the knuckle line: each vertex past the
    knuckles is carried around a circle whose radius is the finger length
    over the fold angle. The thumb is left where it is.
    """
    k_index, k_pinky = Vector(j(f'{m}-finger-2-1')), Vector(j(f'{m}-finger-5-1'))
    tip = Vector(j(f'{m}-finger-3-4'))
    wrist = Vector(j(f'{m}-hand'))
    k0 = (k_index + k_pinky) / 2
    u = (tip - k0).normalized()
    a = (k_pinky - k_index).normalized()
    n = a.cross(u).normalized()
    if n.x * wrist.x > 0:
        n = -n  # the palm faces the body in the A-pose
    thumb = [Vector(j(f'{m}-finger-1-{i}')) for i in (1, 2, 3, 4)]
    rho = 0.085 / 2.6
    for v in body.data.vertices:
        p = v.co
        if (p - wrist).length > 0.16:
            continue
        if any(H.seg_dist(p, thumb[i], thumb[i + 1]) < 0.024 for i in range(3)):
            continue
        d = (p - k0).dot(u)
        if d <= 0.0:
            continue
        h, w = (p - k0).dot(n), (p - k0).dot(a)
        dc = min(d, 0.092)
        phi = dc / rho
        u2 = u * math.cos(phi) + n * math.sin(phi)
        n2 = -u * math.sin(phi) + n * math.cos(phi)
        c = k0 + a * w + u * (rho * math.sin(phi)) + n * (rho * (1 - math.cos(phi)))
        v.co = c + u2 * (d - dc) + n2 * h
    body.data.update()


make_fist(BODY, 'l')
make_fist(BODY, 'r')


# The neck, thickened about its own axis and only behind the chin. bulk()'s
# neck option scales about the world origin across the whole band, which
# would push the jaw forward with it.
for _v in BODY.data.vertices:
    _p = _v.co
    if 1.47 < _p.z < 1.56 and _p.y > -0.11:
        _w = 1 - abs(_p.z - 1.515) / 0.045
        _k = 1 + 0.10 * max(0.0, _w)
        _v.co = Vector((_p.x * _k, -0.02 + (_p.y + 0.02) * _k, _p.z))
BODY.data.update()
BODY.data.materials.append(SKIN)
H.smooth(BODY)

SIDES = ((1, 'L'), (-1, 'R'))
MH = {'L': 'l', 'R': 'r'}
SHO = {t: Vector(j(f'{MH[t]}-shoulder')) for _, t in SIDES}
ELB = {t: Vector(j(f'{MH[t]}-elbow')) for _, t in SIDES}
HND = {t: Vector(j(f'{MH[t]}-hand')) for _, t in SIDES}
NECK_Z = J['neck'].z
EYE = Vector(j('l-eye'))
CHIN_Z = 1.528  # where the front profile of the head turns under

# ── skeleton ──────────────────────────────────────────────────────────────
DEFORM = {
    'root':  ((0, 0, 0), (0, 0, 0.25), None),
    'hips':  (j('pelvis'), j('spine-3'), 'root'),
    'spine': (j('spine-3'), j('spine-1'), 'hips'),
    'chest': (j('spine-1'), j('neck'), 'spine'),
    'neck':  (j('neck'), j('head'), 'chest'),
    'head':  (j('head'), j('head-2'), 'neck'),
}
for _s, _t in SIDES:
    m = MH[_t]
    DEFORM[f'clavicle.{_t}'] = (j(f'{m}-clavicle'), j(f'{m}-shoulder'), 'chest')
    DEFORM[f'upper_arm.{_t}'] = (j(f'{m}-shoulder'), j(f'{m}-elbow'), f'clavicle.{_t}')
    DEFORM[f'forearm.{_t}'] = (j(f'{m}-elbow'), j(f'{m}-hand'), f'upper_arm.{_t}')
    DEFORM[f'hand.{_t}'] = (j(f'{m}-hand'), j(f'{m}-hand-2'), f'forearm.{_t}')
    DEFORM[f'thigh.{_t}'] = (j(f'{m}-upper-leg'), j(f'{m}-knee'), 'hips')
    DEFORM[f'shin.{_t}'] = (j(f'{m}-knee'), j(f'{m}-ankle'), f'thigh.{_t}')
    DEFORM[f'foot.{_t}'] = (j(f'{m}-ankle'), j(f'{m}-foot-2'), f'shin.{_t}')

CONTROLS, IK = {}, []
for _s, _t in SIDES:
    m = MH[_t]
    ank, kne = Vector(j(f'{m}-ankle')), Vector(j(f'{m}-knee'))
    hnd, elb = Vector(j(f'{m}-hand')), Vector(j(f'{m}-elbow'))
    CONTROLS[f'foot_ik.{_t}'] = (tuple(ank), tuple(ank + Vector((0, -0.14, 0))))
    CONTROLS[f'knee_pole.{_t}'] = (tuple(kne + Vector((0, -0.55, 0))),
                                   tuple(kne + Vector((0, -0.65, 0))))
    CONTROLS[f'hand_ik.{_t}'] = (tuple(hnd), tuple(hnd + Vector((0, -0.16, 0))))
    # Elbows out and back: a staff held across the body breaks the arms
    # sideways, not straight behind.
    CONTROLS[f'elbow_pole.{_t}'] = (tuple(elb + Vector((_s * 0.30, 0.50, -0.10))),
                                    tuple(elb + Vector((_s * 0.30, 0.60, -0.10))))
    IK.append((f'shin.{_t}', f'foot_ik.{_t}', f'knee_pole.{_t}', 2, -90))
    # Found by sweeping the angle and reading the elbow off: the two sides
    # roll differently, so the same pole placement needs a different angle.
    IK.append((f'forearm.{_t}', f'hand_ik.{_t}', f'elbow_pole.{_t}', 2, 135 if _t == 'L' else 0))

ALL_BONES = [b for b in DEFORM if b != 'root']

# ── the face ──────────────────────────────────────────────────────────────
# Fitted to the base mesh's own eyes. In the 1024px portrait the pupils sit
# at u 0.468 and 0.544 on row 0.238, so 0.076 of the painting spans the
# mesh's interpupillary distance, and that one number scales the whole face.
EYE_SEP_IMG, EYE_U, EYE_ROW = 0.076, 0.506, 0.238
FACE_CROP = (0.34, 0.68, 0.04, 0.42)
SCALE = EYE_SEP_IMG / (EYE.x * 2)
_u0, _u1, _y0, _y1 = FACE_CROP
PORTRAIT = H.crop_image(
    bpy.data.images.load(str(H.ROOT / 'IMG' / 'HeroIcon' / 'ShenDawnfist.png')), *FACE_CROP,
    name='shen_face')
# The margin of the crop fades into the skin colour, so polygons round the
# jaw and cheeks can carry the painting without wearing its background.
H.feather(PORTRAIT, ((EYE_U - _u0) / (_u1 - _u0), (_y1 - 0.262) / (_y1 - _y0)),
          (0.100 / (_u1 - _u0), 0.152 / (_y1 - _y0)), 0.30, H.srgb(SKIN_RGB))
FACE = H.painted('face', PORTRAIT, emit=0.12)
H.face_uvs(BODY, (0, 0, EYE.z),
           (SCALE / (_u1 - _u0), SCALE / (_y1 - _y0)),
           ((EYE_U - _u0) / (_u1 - _u0), (_y1 - EYE_ROW) / (_y1 - _y0)))
BROW_Z = EYE.z + 0.050
H.assign_faces(BODY, FACE, lambda c, n: (c.z > CHIN_Z - 0.004 and n.z > -0.55
                                         and n.y < (-0.12 if c.z < BROW_Z else -0.30)))
H.assign_faces(BODY, HAIR, lambda c, n: c.z > EYE.z + 0.055 and n.y > -0.30)

PARTS = [(BODY, ALL_BONES)]


def part(obj, bones):
    PARTS.append((obj, bones))
    return obj


# Hair volume: the painting has the fringe, the cap has the rest. A little
# displacement so the dome is not a polished one.
HC = Vector((0, -0.050 * HEAD_K, EYE.z + 0.028 * HEAD_K))
HR = Vector((0.099, 0.100, 0.103)) * HEAD_K
_hair = H.keep_back('hairvol', tuple(HC), tuple(HR * 2), HAIR, cut=-0.22, thick=0.004)
# The cut leaves a clean curve round the face, which is a swimming cap. The
# boundary is jittered fore and aft so the hairline is ragged like his.
H.fray(_hair, lambda p: p.y < -0.16 * HR.y and p.z > -0.55 * HR.z, 0.016, seed=13, axis=(0, 1, 0))
_tex = bpy.data.textures.new('hairnoise', 'CLOUDS')
_tex.noise_scale = 0.022
_d = _hair.modifiers.new('mess', 'DISPLACE')
_d.texture = _tex
_d.strength = 0.014
_d.mid_level = 0.45
H.select(_hair)
bpy.ops.object.modifier_move_to_index(modifier='mess', index=0)
part(_hair, 'head')

# Tufts: the painting's hair is a mess, and a smooth cap is a helmet however
# it is coloured. Short strands stuck to the cap, leaning down and back.
_rng = random.Random(21)
for _i in range(48):
    while True:
        d = Vector((_rng.gauss(0, 1), _rng.gauss(0, 1), _rng.gauss(0, 1))).normalized()
        if d.z > -0.25 and d.y > -0.30:
            break
    base = HC + Vector((d.x * HR.x, d.y * HR.y, d.z * HR.z)) - d * 0.012
    lean = Vector((_rng.uniform(-1, 1), _rng.uniform(-0.5, 1), -_rng.uniform(0.4, 1.4))).normalized()
    lean -= d * lean.dot(d)  # along the surface, not out of it
    dirn = (lean.normalized() * 0.88 + d * 0.22).normalized()
    L, w = _rng.uniform(0.032, 0.054), _rng.uniform(0.010, 0.016)
    tip = base + dirn * L
    part(H.solid(f'tuft{_i}', 'sphere', tuple((base + tip) / 2), (w, w, L), HAIR, sub=0,
                 segs=(10, 6), rot=H.aim_rot(tuple(base), tuple(tip))), 'head')


def skull_front(x, z):
    """How far forward the skull reaches at a point on the forehead."""
    near = [v.co.y for v in BODY.data.vertices
            if abs(v.co.x - x) < 0.012 and abs(v.co.z - z) < 0.012 and v.co.y < -0.05]
    return min(near) if near else -0.16


# Sideburns, down in front of the ears.
for _i, (_s, _z, _L) in enumerate(((1, 0.030, 0.042), (1, -0.005, 0.036), (-1, 0.030, 0.042),
                                   (-1, -0.005, 0.036))):
    base = Vector((_s * (HR.x - 0.006), HC.y - 0.030, EYE.z + _z))
    tip = base + Vector((_s * 0.10, -0.30, -0.95)).normalized() * _L
    part(H.solid(f'sideburn{_i}', 'sphere', tuple((base + tip) / 2), (0.012, 0.009, _L), HAIR,
                 sub=0, segs=(10, 6), rot=H.aim_rot(tuple(base), tuple(tip))), 'head')

# A few strands at the temples: the painting already carries the fringe
# across the forehead, so the geometry only has to break the outline.
for _i, (_x, _dx, _L, _dz) in enumerate(((-0.084, -0.45, 0.046, 0.004), (-0.066, -0.20, 0.040, 0.010),
                                         (0.060, 0.15, 0.038, 0.012), (0.080, 0.40, 0.048, 0.002),
                                         (-0.020, -0.05, 0.030, 0.006), (0.034, 0.10, 0.028, 0.008))):
    z = EYE.z + (0.078 + _dz) * HEAD_K
    base = Vector((_x, skull_front(_x, z) - 0.002, z))
    tip = base + Vector((_dx * _L, -0.16 * _L, -0.95 * _L)).normalized() * _L
    part(H.solid(f'fringe{_i}', 'sphere', tuple((base + tip) / 2), (0.011, 0.008, _L), HAIR,
                 sub=0, segs=(10, 6), rot=H.aim_rot(tuple(base), tuple(tip))), 'head')

# ── garments as shells of the body ────────────────────────────────────────
def arm_t(p, t):
    """Where along the upper arm a point projects, 0 at the shoulder."""
    a, b = SHO[t], ELB[t]
    ab = b - a
    return (Vector(p) - a).dot(ab) / ab.dot(ab)


def fore_t(p, t):
    a, b = ELB[t], HND[t]
    ab = b - a
    return (Vector(p) - a).dot(ab) / ab.dot(ab)


def on_arm(p, t, r=0.10):
    return H.seg_dist(p, SHO[t], ELB[t]) < r and arm_t(p, t) > 0.10


def on_any_arm(p, r=0.10):
    return any(on_arm(p, t, r) for _, t in SIDES)


def on_forearm(p, t, r=0.09):
    return H.seg_dist(p, ELB[t], HND[t]) < r and fore_t(p, t) > 0.02


def torso(p, z0, z1):
    # Bounded in x as well: at the A-pose the hands hang level with the
    # waist, and a sash that reaches them stays behind when the arms move.
    return (z0 < p.z < z1 and abs(p.x) < 0.30 and not on_any_arm(p, 0.085)
            and not any(on_forearm(p, t) for _, t in SIDES))


def v_neck(p):
    """The opening the robe leaves over the sternum: a V from the sash up."""
    return p.y < -0.04 and abs(p.x) < max(0.0, (p.z - 1.16) * 0.21)


def skirt_gap(p):
    """Below the sash the robe's panels hang either side of the tunic."""
    return p.y < -0.06 and p.z < 1.075 and abs(p.x) < (1.075 - p.z) * 0.55


TORSO_BONES = ['chest', 'spine', 'hips', 'neck']
ARM_BONES = {t: [f'clavicle.{t}', f'upper_arm.{t}', f'forearm.{t}'] for _, t in SIDES}

TUNIC_OB = H.garment('tunic', BODY, lambda p: torso(p, 0.85, NECK_Z + 0.03), TUNIC,
                     offset=0.010, thick=0.007)
H.fray(TUNIC_OB, lambda p: p.z < 0.875, 0.018, seed=4)
part(TUNIC_OB, TORSO_BONES + ARM_BONES['L'] + ARM_BONES['R'] + ['thigh.L', 'thigh.R'])

ROBE_OB = H.garment(
    'robe', BODY,
    lambda p: ((torso(p, 0.86, NECK_Z - 0.01) and not v_neck(p) and not skirt_gap(p))
               or on_any_arm(p, 0.09)
               or any(on_forearm(p, t, 0.08) and fore_t(p, t) < 0.12 for _, t in SIDES)),
    ROBE, offset=0.024, thick=0.010)
# The sleeves hang a little loose off the arm rather than hugging it.
H.bulk(ROBE_OB, widen=[(0, 1)], deepen=[(0, 1)],
       limbs=[(tuple(SHO[t] + (ELB[t] - SHO[t]) * 0.30), tuple(ELB[t]), 1.14, 0.11)
              for _, t in SIDES])
H.fray(ROBE_OB, lambda p: p.z < 0.885, 0.022, seed=3)
part(ROBE_OB, TORSO_BONES + ARM_BONES['L'] + ARM_BONES['R'] + ['thigh.L', 'thigh.R'])

part(H.garment('sash', BODY, lambda p: torso(p, 1.055, 1.150), SASH, offset=0.038, thick=0.009),
     ['spine', 'hips'])
TROU_OB = H.garment('trousers', BODY, lambda p: 0.30 < p.z < 1.00, TROUS, offset=0.018, thick=0.008)
H.bulk(TROU_OB, widen=[(0, 1)], deepen=[(0, 1)],
       limbs=[(j(f'{MH[t]}-upper-leg'), j(f'{MH[t]}-knee'), 1.12, 0.16) for _, t in SIDES]
             + [(j(f'{MH[t]}-knee'), j(f'{MH[t]}-ankle'), 1.10, 0.12) for _, t in SIDES])
part(TROU_OB, ['hips'] + [f'{b}.{t}' for _, t in SIDES for b in ('thigh', 'shin')])
# Leg wraps from the calf to the ankle, the trousers tucked into them.
part(H.garment('legwrap', BODY, lambda p: 0.08 < p.z < 0.33, WRAP, offset=0.010, thick=0.007),
     [f'{b}.{t}' for _, t in SIDES for b in ('shin', 'foot')])
for _s, _t in SIDES:
    ank, kne = Vector(j(f'{MH[_t]}-ankle')), Vector(j(f'{MH[_t]}-knee'))
    for _i, _z in enumerate((0.12, 0.16, 0.20, 0.24, 0.28, 0.31)):
        p = ank + (kne - ank) * ((_z - ank.z) / (kne.z - ank.z))
        o = H.ring(f'legring{_t}{_i}', tuple(p), 0.052 + 0.004 * _i / 5, 0.0035, WRAP,
                   rot=H.aim_rot(tuple(ank), tuple(kne)))
        o.rotation_euler.rotate_axis('X', R(-8 if _i % 2 else 8))
        part(o, f'shin.{_t}')
part(H.garment('shoes', BODY, lambda p: p.z < 0.10, SHOE, offset=0.012, thick=0.008),
     [f'{b}.{t}' for _, t in SIDES for b in ('shin', 'foot')])

# Patches, stitched where the robe has worn through on his sword side.
for _i, (_x, _z, _r) in enumerate(((-0.150, 1.455, 0.034), (-0.125, 1.385, 0.030),
                                   (-0.165, 1.325, 0.032))):
    part(H.garment(f'patch{_i}', BODY,
                   lambda p, x=_x, z=_z, r=_r: abs(p.x - x) < r and abs(p.z - z) < r and p.y < -0.03,
                   PATCH, offset=0.032, thick=0.004), ['chest', 'clavicle.R'])

# Hand wraps: the hand and wrist as one bandaged shell, then the forearm
# wound in overlapping turns.
for _s, _t in SIDES:
    hand = HND[_t]
    part(H.garment(f'mitt{_t}', BODY,
                   lambda p, h=hand, t=_t: (p - h).length < 0.14 and fore_t(p, t) > 0.90,
                   WRAP, offset=0.008, thick=0.006), f'hand.{_t}')
    rng = random.Random(7 if _t == 'L' else 11)
    t0 = 0.10 if _t == 'L' else 0.52
    part(H.garment(f'bandage{_t}', BODY,
                   lambda p, t=_t, t0=t0: on_forearm(p, t, 0.075) and t0 < fore_t(p, t) < 0.97,
                   WRAP, offset=0.006, thick=0.005), f'forearm.{_t}')
    n = 0
    t = t0 + 0.02
    while t < 0.95:
        p = H.along(tuple(ELB[_t]), tuple(HND[_t]), t)
        r = 0.041 * (1 - t) + 0.032 * t
        rot = H.aim_rot(tuple(ELB[_t]), tuple(HND[_t]))
        o = H.ring(f'wrap{_t}{n}', p, r + 0.004, 0.0035, WRAP, rot=rot)
        o.rotation_euler.rotate_axis('X', R(rng.uniform(-12, 12)))
        part(o, f'forearm.{_t}')
        t += 0.075
        n += 1

# Hanging sleeves: an open cone off the forearm, torn at the cuff. His left
# sleeve is pushed back for the staff hand; his right hangs to mid-forearm.
for _s, _t, _end, _r1, _amt in ((1, 'L', 0.30, 0.100, 0.030), (-1, 'R', 0.60, 0.112, 0.026)):
    a = Vector(H.along(tuple(ELB[_t]), tuple(HND[_t]), -0.10))
    b = Vector(H.along(tuple(ELB[_t]), tuple(HND[_t]), _end))
    cuff = H.cone_shell(f'cuff{_t}', 0.090, _r1, (b - a).length, tuple((a + b) / 2), ROBE,
                        thick=0.010, rot=H.aim_rot(tuple(a), tuple(b)))
    H.fray(cuff, lambda p, d=(b - a).length: p.z > d * 0.40, _amt, seed=5 if _t == 'L' else 9)
    part(cuff, f'forearm.{_t}')

# Collar: the robe rolled twice around the neck.
part(H.ring('collar', (0, -0.026, 1.488), 0.100, 0.024, ROBE, rot=(R(-12), 0, 0),
            squash=(1, 0.72, 0.85)), ['neck', 'chest'])
part(H.ring('collar2', (0, -0.040, 1.456), 0.126, 0.022, ROBE, rot=(R(-14), 0, 0),
            squash=(1, 0.75, 0.70)), 'chest')

# Rope over the sash, tied at his left hip with the ends hanging.
for _i, (_z, _tilt) in enumerate(((1.126, 3), (1.101, -3))):
    part(H.ring(f'cord{_i}', (0, -0.062, _z), 0.204, 0.012, ROPE, rot=(R(_tilt), 0, 0),
                squash=(1, 0.70, 1)), ['spine', 'hips'])
part(H.solid('knot', 'sphere', (0.092, -0.205, 1.112), (0.052, 0.040, 0.046), ROPE, sub=1),
     'hips')
part(H.rod('tail0', (0.100, -0.205, 1.095), (0.128, -0.170, 0.855), 0.010, 0.008, ROPE), 'hips')
part(H.rod('tail1', (0.084, -0.212, 1.095), (0.058, -0.160, 0.800), 0.010, 0.008, ROPE), 'hips')

# Prayer beads: a string over the collar, hanging to the sternum.
for _i, _p in enumerate(H.loop_points([
        (0.000, 0.080, 1.500), (0.125, 0.030, 1.478), (0.155, -0.060, 1.450),
        (0.095, -0.170, 1.395), (0.000, -0.210, 1.355), (-0.095, -0.170, 1.395),
        (-0.155, -0.060, 1.450), (-0.125, 0.030, 1.478)], 26)):
    part(H.solid(f'bead{_i}', 'sphere', tuple(_p), (0.030, 0.030, 0.030), BEAD, sub=0,
                 segs=(14, 8)), 'chest')

# ── freeze, rig, bind ─────────────────────────────────────────────────────
FROZEN = [(H.freeze(o), b) for o, b in PARTS]
ARM = H.build_rig('shen', DEFORM, CONTROLS, IK)
for obj, bones in FROZEN:
    H.bind(obj, ARM, bones, DEFORM)

# ── the stance ────────────────────────────────────────────────────────────
# The staff runs from his right hip to above his left shoulder, about fifty
# degrees off the ground, both fists on it in front of the body: the low
# hand at the belt, the high hand at the collarbone.
STAFF_DIR = Vector((0.643, -0.110, 0.766)).normalized()
GRIP_R = Vector((-0.128, -0.240, 1.200))
GRIP_L = GRIP_R + STAFF_DIR * 0.36
STAFF_A = GRIP_R - STAFF_DIR * 0.72
STAFF_B = GRIP_L + STAFF_DIR * 0.86

if not APOSE:
    for s, t, grip in ((1, 'L', GRIP_L), (-1, 'R', GRIP_R)):
        # The IK target is the wrist; the fist closes on the staff a little
        # further along the hand.
        toward = (grip - ELB[t]).normalized()
        H.place(ARM, f'hand_ik.{t}', grip - toward * 0.075)
    for s, t in SIDES:
        ank = Vector(j(f'{MH[t]}-ankle'))
        H.place(ARM, f'foot_ik.{t}', (s * 0.150, ank.y, ank.z))

# The staff is built where it ends up and bound to the left hand, so it is
# first taken back through that hand's pose: once the pose is on, it lands
# on the grips.
_undo = H.pose_delta(ARM, 'hand.L').inverted() if not APOSE else Matrix.Identity(4)
STAFF = [H.rod('staff', tuple(STAFF_A), tuple(STAFF_B), 0.020, 0.024, WOOD, verts=20)]
STAFF.append(H.solid('staffknob', 'sphere', tuple(STAFF_B + STAFF_DIR * 0.02),
                     (0.060, 0.060, 0.082), WOOD, sub=1,
                     rot=H.aim_rot(tuple(STAFF_A), tuple(STAFF_B))))
STAFF.append(H.rod('staffnub', tuple(STAFF_B - STAFF_DIR * 0.10),
                   tuple(STAFF_B - STAFF_DIR * 0.02 + Vector((0.07, -0.02, 0.05))),
                   0.014, 0.008, WOOD, verts=10))
for _c, (_at, _n) in enumerate(((GRIP_R + STAFF_DIR * 0.17, 6), (GRIP_L + STAFF_DIR * 0.34, 7))):
    for _i in range(_n):
        p = _at + STAFF_DIR * (_i * 0.013)
        o = H.ring(f'staffrope{_c}{_i}', tuple(p), 0.0255, 0.0058, ROPE,
                   rot=H.aim_rot(tuple(STAFF_A), tuple(STAFF_B)))
        o.rotation_euler.rotate_axis('X', R(4 if _i % 2 else -4))
        STAFF.append(o)
for o in STAFF:
    o.matrix_world = _undo @ o.matrix_world
    o = H.freeze(o)
    H.bind(o, ARM, 'hand.L', DEFORM)
    FROZEN.append((o, 'hand.L'))
bpy.context.view_layer.update()

if '--build-only' in sys.argv:
    print('BUILT')
    sys.exit(0)

if '--export' in sys.argv:
    hero = H.join([o for o, _ in FROZEN], 'shen')
    H.decimate(hero, 0.30)
    print('GLB:', H.export_glb(H.OUT / 'shen.glb', hero, ARM))

shot = H.stage(fast=FAST)
if '--head' in sys.argv:
    shot(H.OUT / 'shen-head.png', (0.30, -1.05, 1.74), 85, 460, 520, at=(0, -0.02, 1.64))
else:
    shot(H.OUT / 'shen-full.png', (0.0, -4.3, 1.20), 60, 520, 780, at=(0, 0, 1.00))
    shot(H.OUT / 'shen-q34.png', (2.3, -3.6, 1.30), 60, 520, 780, at=(0, 0, 1.00))
    shot(H.OUT / 'shen-bust.png', (0.35, -1.85, 1.62), 80, 560, 620, at=(0, 0, 1.42))
    # Framed like the painting, for putting the two side by side.
    shot(H.OUT / 'shen-portrait.png', (0.0, -2.75, 1.34), 68, 640, 640, at=(0, 0, 1.30))

print('DONE')
