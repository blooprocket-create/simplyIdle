"""Kael Ironheart, built on a real human base mesh.

Stage one: body, materials, garments and the rig. Armour follows once this
reads correctly — the point of the rebuild is that the figure underneath is
anatomically real, so that is what gets verified first.
"""
import sys

import bpy
from mathutils import Vector

import basemesh
import herolib as H
from herolib import R

FAST = '--fast' in sys.argv
H.reset()

bpy.ops.object.empty_add(location=(0, 0, 0))
TEXSPACE = bpy.context.object
TEXSPACE.name = 'texspace'


def _worn(*a, **k):
    return H.worn(*a, texspace=TEXSPACE, **k)


SKIN = H.plain('skin', (0.292, 0.162, 0.114), 0.54)
GREEN = _worn('green', (0.030, 0.070, 0.028), (0.058, 0.110, 0.043), (0.74, 0.93), 0.0, 60.0, 0.15)
LEATH = _worn('leather', (0.052, 0.030, 0.017), (0.088, 0.055, 0.030), (0.55, 0.85), 0.0, 44.0, 0.20)
DARKL = _worn('darkleather', (0.017, 0.013, 0.010), (0.038, 0.027, 0.019), (0.55, 0.85), 0.0, 48.0, 0.20)
HAIR = H.plain('hair', (0.026, 0.021, 0.017), 0.92)
STEEL = _worn('steel', (0.074, 0.076, 0.081), (0.068, 0.045, 0.029), (0.40, 0.72), 0.82, 15.0, 0.13)
WOOD = _worn('wood', (0.058, 0.033, 0.017), (0.098, 0.060, 0.030), (0.62, 0.86), 0.0, 14.0, 0.35)
DARK = H.plain('dark', (0.014, 0.013, 0.012), 0.85)

BODY, J = basemesh.load(height=1.85)

# The CC0 base is androgynous and lightly built; Kael is a heavy veteran and
# the gambeson showed the difference. Reshaped before anything else, so the
# garments — which are shells of this mesh — inherit the build.
_MH = {'L': 'l', 'R': 'r'}
_limbs = []
for _t in ('l', 'r'):
    _limbs += [
        (tuple(J[f'{_t}-shoulder']), tuple(J[f'{_t}-elbow']), 1.20, 0.14),
        (tuple(J[f'{_t}-elbow']), tuple(J[f'{_t}-hand']), 1.14, 0.11),
        (tuple(J[f'{_t}-upper-leg']), tuple(J[f'{_t}-knee']), 1.12, 0.17),
        (tuple(J[f'{_t}-knee']), tuple(J[f'{_t}-ankle']), 1.10, 0.13),
    ]
_xf = H.bulk(
    BODY,
    widen=[(0.00, 1.00), (0.90, 1.04), (1.10, 1.09), (1.30, 1.14), (1.48, 1.17),
           (1.56, 1.10), (1.66, 1.00), (1.95, 1.00)],
    deepen=[(0.00, 1.00), (0.90, 1.06), (1.10, 1.12), (1.30, 1.12), (1.48, 1.12),
            (1.56, 1.06), (1.66, 1.00), (1.95, 1.00)],
    limbs=_limbs,
    flatten=(1.23, 1.47, 0.18, 0.42),
    neck=(1.50, 1.63, 1.22),
)
# Same reshaping for the skeleton, so bones still sit inside the body they
# deform after the chest has been broadened.
J = {name: _xf(p) for name, p in J.items()}
BODY.data.materials.append(SKIN)
H.smooth(BODY)

# ── the skeleton the mesh ships with ──────────────────────────────────────
# Measured, not guessed: these are the base mesh's own joint markers.
def j(name):
    return tuple(J[name])


SIDES = ((1, 'L'), (-1, 'R'))
MH = {'L': 'l', 'R': 'r'}

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
    CONTROLS[f'elbow_pole.{_t}'] = (tuple(elb + Vector((0, 0.55, 0))),
                                    tuple(elb + Vector((0, 0.65, 0))))
    IK.append((f'shin.{_t}', f'foot_ik.{_t}', f'knee_pole.{_t}', 2, -90))
    IK.append((f'forearm.{_t}', f'hand_ik.{_t}', f'elbow_pole.{_t}', 2, 90))

ALL_BONES = [b for b in DEFORM if b != 'root']

# ── the face, on a head that actually has one ─────────────────────────────
# The base mesh knows where his eyes are, so the painting is fitted to them
# rather than to ranges eyeballed off the canvas. In the 1024px portrait the
# pupils sit at u 0.454 and 0.554, on row 0.256 from the top.
EYE = Vector(j('l-eye'))
EYE_SEP_IMG, EYE_U, EYE_ROW = 0.100, 0.504, 0.256
SCALE = EYE_SEP_IMG / (EYE.x * 2)
PORTRAIT = bpy.data.images.load(str(H.ROOT / 'IMG' / 'HeroIcon' / 'KaelIronheart.png'))
FACE = H.painted('face', PORTRAIT)
BODY.data.materials.append(FACE)
H.face_uvs(BODY, (0, 0, EYE.z), (SCALE, SCALE), (EYE_U, 1 - EYE_ROW))

HEAD_Z = J['head'].z
H.assign_faces(BODY, FACE, lambda c, n: c.z > HEAD_Z - 0.12 and n.y < -0.25)
H.assign_faces(BODY, HAIR, lambda c, n: c.z > HEAD_Z + 0.02 and n.y > -0.10)

# ── garments as shells of the body it wears ───────────────────────────────
def near_arm(p, m, r):
    return H.seg_dist(p, j(f'{m}-shoulder'), j(f'{m}-elbow')) < r


def is_torso(p):
    if 1.00 < p.z < J['neck'].z + 0.02 and abs(p.x) < 0.26:
        return True
    return any(near_arm(p, MH[t], 0.15) for _, t in SIDES)


PARTS = [(BODY, ALL_BONES)]
PARTS.append((H.garment('gambeson', BODY, is_torso, GREEN, offset=0.013, thick=0.009),
              ['chest', 'spine', 'hips', 'neck'] +
              [f'{b}.{t}' for _, t in SIDES for b in ('clavicle', 'upper_arm')]))
PARTS.append((H.garment('trousers', BODY, lambda p: p.z < 1.03, LEATH, offset=0.011, thick=0.009),
              ['hips'] + [f'{b}.{t}' for _, t in SIDES for b in ('thigh', 'shin', 'foot')]))
PARTS.append((H.garment('boots', BODY, lambda p: p.z < 0.28, DARKL, offset=0.022, thick=0.010),
              [f'{b}.{t}' for _, t in SIDES for b in ('shin', 'foot')]))
for _s, _t in SIDES:
    m = MH[_t]
    hand = Vector(j(f'{m}-hand'))
    PARTS.append((H.garment(f'glove{_t}', BODY,
                            lambda p, h=hand: (p - h).length < 0.15, DARKL,
                            offset=0.006, thick=0.006), f'hand.{_t}'))

# ── plate ─────────────────────────────────────────────────────────────────
# Measured against the figure underneath rather than guessed: the gambeson's
# front surface runs from y=-0.209 at the sternum to -0.154 at the collar, so
# anything meant to sit on top of it has to clear those.
def part(obj, bones):
    PARTS.append((obj, bones))
    return obj


SHO = {t: Vector(j(f'{MH[t]}-shoulder')) for _, t in SIDES}
ELB = {t: Vector(j(f'{MH[t]}-elbow')) for _, t in SIDES}
HND = {t: Vector(j(f'{MH[t]}-hand')) for _, t in SIDES}
NECK_Z = J['neck'].z

part(H.cone_shell('gorget', 0.118, 0.104, 0.052, (0, -0.014, NECK_Z + 0.002), STEEL,
                  squash=(1, 0.90, 1)), 'neck')
part(H.cone_shell('yoke', 0.240, 0.132, 0.150, (0, -0.014, 1.492), STEEL,
                  squash=(1, 0.84, 1)), 'chest')
part(H.ring('yokerim', (0, -0.014, 1.420), 0.240, 0.013, STEEL, squash=(1, 0.84, 1.3)), 'chest')

# One big riveted pectoral low on his left, as the portrait has, leaving the
# centre and his other side in green.
part(H.plate('pectoral', 0.190 * R(152), 0.215, 0.016, 152, (0.098, -0.2125, 1.258),
             (R(4), 0, R(-6)), STEEL, cuts=16), 'chest')
part(H.plate('pectorallip', 0.190 * R(152), 0.030, 0.020, 152, (0.098, -0.2185, 1.152),
             (R(11), 0, R(-6)), STEEL, cuts=16), 'chest')
part(H.plate('backplate', 0.230 * R(150), 0.300, 0.017, 150, (0, 0.196, 1.330),
             (R(-3), 0, R(180)), STEEL, cuts=14), 'chest')

_riv = [0]


def rivet(loc, bone, r=0.010):
    _riv[0] += 1
    return part(H.solid(f'rivet{_riv[0]}', 'sphere', loc, (r * 2, r * 2, r * 2), STEEL,
                        sub=0, segs=(10, 6)), bone)


for _x, _z in ((-0.150, 1.446), (0.150, 1.446), (0.036, 1.382), (0.168, 1.390),
               (0.038, 1.188), (0.166, 1.196)):
    rivet((_x, -0.232, _z), 'chest')
for _x, _z in ((-0.140, 1.430), (0.140, 1.430), (-0.140, 1.226), (0.140, 1.226)):
    rivet((_x, 0.232, _z), 'chest')

for _s, _t in SIDES:
    # Lames cascading down the outside of the arm. The arm is ~0.080 across
    # with its sleeve on, so these clear it without ballooning the silhouette.
    tilt = H.aim_rot(tuple(ELB[_t]), tuple(SHO[_t]))
    for _i, (_at, _rb, _rt, _dep) in enumerate(((-0.10, 0.128, 0.112, 0.084),
                                                (0.20, 0.122, 0.110, 0.074),
                                                (0.48, 0.112, 0.102, 0.068),
                                                (0.74, 0.098, 0.092, 0.060))):
        _bone = f'clavicle.{_t}' if _i < 2 else f'upper_arm.{_t}'
        _p = H.along(tuple(SHO[_t]), tuple(ELB[_t]), _at)
        part(H.cone_shell(f'lame{_t}{_i}', _rb, _rt, _dep, _p, STEEL, thick=0.012,
                          rot=tilt, squash=(1, 0.90, 1)), _bone)
        rivet((_p[0] + _s * 0.048, _p[1] - 0.100, _p[2] - 0.020), _bone, 0.009)
    # Vambrace down the forearm.
    _va = H.along(tuple(ELB[_t]), tuple(HND[_t]), 0.10)
    _vb = H.along(tuple(ELB[_t]), tuple(HND[_t]), 0.86)
    part(H.chain(f'vamb{_t}', [(_va, (0.082, 0.082)), (_vb, (0.070, 0.070))], STEEL),
         f'forearm.{_t}')
    part(H.ring(f'vambrim{_t}', _va, 0.078, 0.011, STEEL,
                rot=H.aim_rot(tuple(HND[_t]), tuple(ELB[_t]))), f'forearm.{_t}')

# Two broad leather straps crossing the chest, with the buckle where they meet.
for _s, _t in SIDES:
    part(H.chain(f'strap{_t}', [((_s * 0.168, -0.150, 1.438), (0.046, 0.015)),
                                ((_s * 0.086, -0.226, 1.268), (0.044, 0.014)),
                                ((-_s * 0.022, -0.228, 1.116), (0.042, 0.013)),
                                ((-_s * 0.112, -0.176, 1.036), (0.040, 0.013))], LEATH),
         ['chest', 'spine'])
part(H.solid('buckle', 'cube', (0, -0.238, 1.150), (0.076, 0.022, 0.076), STEEL,
             bevel=0.008, sub=1, auto=38), 'spine')
part(H.solid('bucklein', 'cube', (0, -0.246, 1.150), (0.040, 0.030, 0.040), DARK,
             bevel=0.003, sub=1, auto=38), 'spine')
part(H.ring('belt', (0, -0.006, 1.046), 0.212, 0.032, DARKL, squash=(1, 0.86, 0.62)), 'hips')
part(H.solid('beltbuckle', 'cube', (0, -0.196, 1.046), (0.086, 0.028, 0.068), STEEL,
             bevel=0.008, sub=1, auto=38), 'hips')

FROZEN = [(H.freeze(o), b) for o, b in PARTS]
ARM = H.build_rig('kael', DEFORM, CONTROLS, IK)
for obj, bones in FROZEN:
    H.bind(obj, ARM, bones, DEFORM)

# The base mesh binds in an A-pose. Bringing the arms down through the IK
# targets is both a better rest stance and a second proof the rig works.
bpy.context.view_layer.objects.active = ARM
bpy.ops.object.mode_set(mode='POSE')
for s, t in SIDES:
    ARM.pose.bones[f'hand_ik.{t}'].location = (s * -0.30, 0.02, -0.52)
bpy.ops.object.mode_set(mode='OBJECT')
bpy.context.view_layer.update()

if '--build-only' in sys.argv:
    print('BUILT')
    sys.exit(0)

shot = H.stage(fast=FAST)
shot(H.OUT / 'k2-front.png', (0.0, -4.3, 1.20), 60, 400, 640, at=(0, 0, 1.02))
shot(H.OUT / 'k2-q34.png', (2.4, -3.5, 1.30), 60, 400, 640, at=(0, 0, 1.02))
shot(H.OUT / 'k2-bust.png', (0.55, -1.75, 1.70), 80, 480, 540, at=(0, 0, 1.60))
print('DONE')
