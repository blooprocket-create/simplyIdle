"""Kael Ironheart: a veteran warrior in weathered plate over a green gambeson.

Run headless:
    python scripts/blender/kael.py                 # full body + bust
    python scripts/blender/kael.py --fast          # 24 samples, for iterating
    python scripts/blender/kael.py --fast --head   # head only, seconds per look
    python scripts/blender/kael.py --pose          # IK test pose, proves the rig
    python scripts/blender/kael.py --export        # also write the GLB

Renders land in `.render/`, or wherever HERO_OUT points.
"""
import sys

import bpy

from mathutils import Euler, Vector

import herolib as H
from herolib import R

FAST = '--fast' in sys.argv
H.reset()

bpy.ops.object.empty_add(location=(0, 0, 0))
TEXSPACE = bpy.context.object
TEXSPACE.name = 'texspace'

# ── materials ─────────────────────────────────────────────────────────────
# The portrait is dark and desaturated: weathered brown-grey everywhere, with
# the green gambeson the only saturated thing in frame. Plate in it is dull
# and pitted, closer to wrought iron than to polished steel.
def _worn(*a, **k):
    return H.worn(*a, texspace=TEXSPACE, **k)

SKIN  = H.plain('skin', (0.292, 0.162, 0.114), 0.54)
GREEN = _worn('green', (0.030, 0.070, 0.028), (0.058, 0.110, 0.043), (0.74, 0.93), 0.0, 60.0, 0.15)
LEATH = _worn('leather', (0.052, 0.030, 0.017), (0.088, 0.055, 0.030), (0.55, 0.85), 0.0, 44.0, 0.20)
DARKL = _worn('darkleather', (0.017, 0.013, 0.010), (0.038, 0.027, 0.019), (0.55, 0.85), 0.0, 48.0, 0.20)
STEEL = _worn('steel', (0.074, 0.076, 0.081), (0.068, 0.045, 0.029), (0.40, 0.72), 0.82, 15.0, 0.13)
WOOD  = _worn('wood', (0.058, 0.033, 0.017), (0.098, 0.060, 0.030), (0.62, 0.86), 0.0, 14.0, 0.35)
HAIR  = H.plain('hair', (0.026, 0.021, 0.017), 0.92)
DARK  = H.plain('dark', (0.014, 0.013, 0.012), 0.85)

# The head occupies x 0.375..0.640 of the 1024px painting and rows
# 0.078..0.462 from the top. Cropped to that, with a little margin, the
# texture is a few hundred pixels rather than a megabyte of background.
FACE_CROP = (0.365, 0.650, 0.068, 0.472)
PORTRAIT = H.crop_image(
    bpy.data.images.load(str(H.ROOT / 'IMG' / 'HeroIcon' / 'KaelIronheart.png')), *FACE_CROP)
FACE = H.painted('face', PORTRAIT)


def in_crop(ur, yr):
    """Re-express a region of the painting in the cropped image."""
    u0, u1, y0, y1 = FACE_CROP
    return ((ur[0] - u0) / (u1 - u0), (ur[1] - u0) / (u1 - u0)), \
           ((yr[0] - y0) / (y1 - y0), (yr[1] - y0) / (y1 - y0))

# ── skeleton ──────────────────────────────────────────────────────────────
# One set of joint positions drives both the mesh shells and the bones, so a
# pauldron grown over the shoulder joint is skinned to the bone that shares
# it. L is the character's left, which is screen right with the camera in
# front — the side the portrait carries the shield on.
HZ = 1.672
SIDES = ((1, 'L'), (-1, 'R'))
PELVIS, WAIST, CHEST, CLAV, NECK = 0.94, 1.11, 1.34, 1.474, 1.548
SHO, ELB, WRI = 0.186, 0.286, 0.314


def sho(s): return (s * SHO, 0.0, 1.456)
def elb(s): return (s * ELB, 0.0, 1.190)
def wri(s): return (s * WRI, -0.030, 0.955)
def fist(s): return (s * WRI, -0.052, 0.832)
def hip(s): return (s * 0.096, 0.0, 0.900)
def kne(s): return (s * 0.118, 0.0, 0.510)
def ank(s): return (s * 0.122, 0.0, 0.100)
def toe(s): return (s * 0.122, -0.135, 0.042)


DEFORM = {
    'root':  ((0, 0, 0), (0, 0, 0.22), None),
    'hips':  ((0, 0, PELVIS), (0, 0, WAIST), 'root'),
    'spine': ((0, 0, WAIST), (0, 0, CHEST), 'hips'),
    'chest': ((0, 0, CHEST), (0, 0, CLAV), 'spine'),
    'neck':  ((0, 0, CLAV), (0, 0, NECK), 'chest'),
    'head':  ((0, 0, NECK), (0, 0, 1.86), 'neck'),
}
for _s, _t in SIDES:
    DEFORM[f'shoulder.{_t}'] = ((0, 0, CLAV), sho(_s), 'chest')
    DEFORM[f'upper_arm.{_t}'] = (sho(_s), elb(_s), f'shoulder.{_t}')
    DEFORM[f'forearm.{_t}'] = (elb(_s), wri(_s), f'upper_arm.{_t}')
    DEFORM[f'hand.{_t}'] = (wri(_s), fist(_s), f'forearm.{_t}')
    DEFORM[f'thigh.{_t}'] = (hip(_s), kne(_s), 'hips')
    DEFORM[f'shin.{_t}'] = (kne(_s), ank(_s), f'thigh.{_t}')
    DEFORM[f'foot.{_t}'] = (ank(_s), toe(_s), f'shin.{_t}')

# What an animator grabs. Poles decide which way an elbow or a knee breaks;
# without them a two-bone chain is free to flip through itself.
CONTROLS, IK = {}, []
for _s, _t in SIDES:
    CONTROLS[f'foot_ik.{_t}'] = (ank(_s), (_s * 0.122, -0.14, 0.100))
    CONTROLS[f'knee_pole.{_t}'] = ((_s * 0.122, -0.50, 0.560), (_s * 0.122, -0.60, 0.560))
    CONTROLS[f'hand_ik.{_t}'] = (wri(_s), (_s * WRI, -0.16, 0.955))
    CONTROLS[f'elbow_pole.{_t}'] = ((_s * ELB, 0.50, 1.190), (_s * ELB, 0.60, 1.190))
    IK.append((f'shin.{_t}', f'foot_ik.{_t}', f'knee_pole.{_t}', 2, -90))
    IK.append((f'forearm.{_t}', f'hand_ik.{_t}', f'elbow_pole.{_t}', 2, 90))

# ── body ──────────────────────────────────────────────────────────────────
PARTS = []


def part(obj, bones):
    PARTS.append((obj, bones))
    return obj


ALL_BONES = [b for b in DEFORM if b != 'root']
BODY_J = {
    'pelvis': ((0, 0, PELVIS), (0.118, 0.098)),
    'waist':  ((0, 0, WAIST), (0.115, 0.094)),
    'chest':  ((0, 0, CHEST), (0.162, 0.118)),
    'clav':   ((0, 0, CLAV), (0.104, 0.090)),
    'neck':   ((0, 0, NECK), (0.064, 0.060)),
}
BODY_B = [('pelvis', 'waist'), ('waist', 'chest'), ('chest', 'clav'), ('clav', 'neck')]
for s, t in SIDES:
    BODY_J[f'sho{t}'] = (sho(s), (0.080, 0.080))
    BODY_J[f'elb{t}'] = (elb(s), (0.058, 0.058))
    BODY_J[f'wri{t}'] = (wri(s), (0.042, 0.042))
    BODY_J[f'hip{t}'] = (hip(s), (0.092, 0.092))
    BODY_J[f'thi{t}'] = (H.along(hip(s), kne(s), 0.34), (0.084, 0.086))
    BODY_J[f'kne{t}'] = (kne(s), (0.062, 0.064))
    BODY_J[f'cal{t}'] = (H.along(kne(s), ank(s), 0.32), (0.070, 0.074))
    BODY_J[f'ank{t}'] = (ank(s), (0.046, 0.048))
    BODY_B += [('clav', f'sho{t}'), (f'sho{t}', f'elb{t}'), (f'elb{t}', f'wri{t}'),
               ('pelvis', f'hip{t}'), (f'hip{t}', f'thi{t}'), (f'thi{t}', f'kne{t}'),
               (f'kne{t}', f'cal{t}'), (f'cal{t}', f'ank{t}')]
part(H.skinned('body', BODY_J, BODY_B, SKIN), ALL_BONES)

# Gloved fists. Bare hands read as pale lumps against everything else here.
for s, t in SIDES:
    part(H.chain(f'hand{t}', [((s * WRI, -0.036, 0.930), 0.044),
                              ((s * WRI, -0.062, 0.878), 0.050),
                              ((s * WRI, -0.052, 0.834), 0.042)], DARKL), f'hand.{t}')

# ── cloth ─────────────────────────────────────────────────────────────────
GAMB_J = {
    'g_hem':   ((0, 0, 1.020), (0.140, 0.116)),
    'g_waist': ((0, 0, 1.115), (0.140, 0.116)),
    'g_chest': ((0, 0, 1.335), (0.170, 0.134)),
    'g_clav':  ((0, 0, 1.506), (0.152, 0.130)),
}
GAMB_B = [('g_hem', 'g_waist'), ('g_waist', 'g_chest'), ('g_chest', 'g_clav')]
for s, t in SIDES:
    GAMB_J[f'g_sho{t}'] = ((s * SHO, 0, 1.478), (0.126, 0.124))
    GAMB_J[f'g_elb{t}'] = ((s * ELB, 0, 1.196), (0.086, 0.086))
    GAMB_B += [('g_clav', f'g_sho{t}'), (f'g_sho{t}', f'g_elb{t}')]
part(H.skinned('gambeson', GAMB_J, GAMB_B, GREEN),
     ['chest', 'spine', 'hips', 'neck'] + [f'{b}.{t}' for _, t in SIDES
                                           for b in ('shoulder', 'upper_arm')])

part(H.chain('skirt', [((0, 0, 1.020), (0.176, 0.150)),
                       ((0, 0, 0.930), (0.204, 0.172)),
                       ((0, 0, 0.872), (0.196, 0.166))], GREEN),
     ['hips', 'thigh.L', 'thigh.R'])

TROU_J = {'t_pelvis': ((0, 0, 0.90), (0.130, 0.110))}
TROU_B = []
for s, t in SIDES:
    TROU_J[f't_hip{t}'] = ((s * 0.096, 0, 0.862), (0.108, 0.108))
    TROU_J[f't_thi{t}'] = ((s * 0.110, 0, 0.732), (0.100, 0.102))
    TROU_J[f't_kne{t}'] = ((s * 0.118, 0, 0.520), (0.080, 0.082))
    TROU_J[f't_cal{t}'] = ((s * 0.118, 0, 0.392), (0.088, 0.092))
    TROU_J[f't_ank{t}'] = ((s * 0.118, 0, 0.230), (0.068, 0.070))
    TROU_B += [('t_pelvis', f't_hip{t}'), (f't_hip{t}', f't_thi{t}'), (f't_thi{t}', f't_kne{t}'),
               (f't_kne{t}', f't_cal{t}'), (f't_cal{t}', f't_ank{t}')]
part(H.skinned('trousers', TROU_J, TROU_B, LEATH),
     ['hips'] + [f'{b}.{t}' for _, t in SIDES for b in ('thigh', 'shin')])

for s, t in SIDES:
    part(H.chain(f'boot{t}', [((s * 0.118, 0.005, 0.300), (0.086, 0.088)),
                              ((s * 0.118, 0.000, 0.075), (0.076, 0.082)),
                              ((s * 0.118, -0.075, 0.048), (0.066, 0.060)),
                              ((s * 0.118, -0.135, 0.042), (0.054, 0.042))], DARKL),
         [f'shin.{t}', f'foot.{t}'])

# ── plate ─────────────────────────────────────────────────────────────────
part(H.cone_shell('yoke', 0.202, 0.146, 0.120, (0, 0.008, 1.470), STEEL, squash=(1, 0.84, 1)), 'chest')
part(H.cone_shell('gorget', 0.098, 0.086, 0.062, (0, 0.006, 1.542), STEEL, squash=(1, 0.86, 1)), 'neck')
part(H.ring('yokerim', (0, 0.008, 1.414), 0.202, 0.012, STEEL, squash=(1, 0.84, 1.3)), 'chest')
part(H.ring('yokelame', (0, 0.008, 1.462), 0.176, 0.010, STEEL, squash=(1, 0.84, 1.3)), 'chest')
# The reverse of the figure was a flat green slab. The bend sweeps toward +Y
# from the front face, so a half turn about Z aims a plate at the back.
part(H.plate('backplate', 0.480, 0.300, 0.017, 150, (0, 0.150, 1.330), (R(-3), 0, R(180)),
             STEEL, cuts=14), 'chest')

# One big riveted pectoral low on his left, as the portrait has, leaving the
# centre and his other side in green.
part(H.plate('pectoral', 0.268, 0.250, 0.017, 150, (0.100, -0.140, 1.284),
             (R(3), 0, R(-6)), STEEL, cuts=14), 'chest')
part(H.plate('pectoral_lip', 0.250, 0.034, 0.021, 150, (0.100, -0.146, 1.162),
             (R(10), 0, R(-6)), STEEL, cuts=14), 'chest')

_riv = 0
def rivet(loc, bone, r=0.010):
    global _riv
    _riv += 1
    return part(H.solid(f'rivet{_riv}', 'sphere', loc, (r * 2, r * 2, r * 2), STEEL,
                        sub=0, segs=(10, 6)), bone)


for x, z in ((-0.150, 1.492), (0.150, 1.492), (0.034, 1.382), (0.166, 1.390),
             (0.036, 1.196), (0.164, 1.204)):
    rivet((x, -0.172, z), 'chest')
for x, z in ((-0.140, 1.442), (0.140, 1.442), (-0.140, 1.230), (0.140, 1.230)):
    rivet((x, 0.192, z), 'chest')

for s, t in SIDES:
    # Three lames cascading down the outside of the arm, each flaring a
    # little wider than the last — the portrait's shoulders are layered, not
    # a single dome.
    tilt = H.aim_rot(elb(s), sho(s))
    for i, (at, rb, rt, dep) in enumerate(((-0.12, 0.124, 0.108, 0.082),
                                           (0.20, 0.118, 0.106, 0.072),
                                           (0.48, 0.108, 0.098, 0.066),
                                           (0.74, 0.094, 0.088, 0.058))):
        bone = f'shoulder.{t}' if i < 2 else f'upper_arm.{t}'
        part(H.cone_shell(f'lame{t}{i}', rb, rt, dep, H.along(sho(s), elb(s), at),
                          STEEL, thick=0.012, rot=tilt, squash=(1, 0.88, 1)), bone)
        p = H.along(sho(s), elb(s), at)
        rivet((p[0] + s * 0.052, -0.108, p[2] - 0.026), bone, 0.009)
    # Vambrace down the forearm.
    part(H.chain(f'vamb{t}', [((s * (ELB + 0.004), -0.008, 1.176), (0.092, 0.092)),
                              ((s * WRI, -0.026, 0.962), (0.070, 0.070))], STEEL),
         f'forearm.{t}')
    part(H.ring(f'vambrim{t}', (s * (ELB + 0.004), -0.008, 1.178), 0.078, 0.011, STEEL,
                rot=H.aim_rot(wri(s), elb(s))), f'forearm.{t}')

# Two broad leather straps crossing the chest, with the square buckle where
# they meet. Flat bands, not piping: the skin radii are per-axis.
for s, t in SIDES:
    part(H.chain(f'strap{t}', [((s * 0.158, -0.070, 1.436), (0.046, 0.015)),
                               ((s * 0.082, -0.172, 1.268), (0.044, 0.014)),
                               ((-s * 0.020, -0.174, 1.118), (0.042, 0.013)),
                               ((-s * 0.108, -0.122, 1.026), (0.040, 0.013))], LEATH),
         ['chest', 'spine'])
part(H.solid('buckle', 'cube', (0, -0.168, 1.152), (0.076, 0.022, 0.076), STEEL,
             bevel=0.008, sub=1, auto=38), 'spine')
part(H.solid('bucklein', 'cube', (0, -0.176, 1.152), (0.040, 0.030, 0.040), DARK,
             bevel=0.003, sub=1, auto=38), 'spine')
part(H.ring('belt', (0, 0, 1.020), 0.142, 0.032, DARKL, squash=(1, 0.86, 0.62)), 'hips')
part(H.solid('beltbuckle', 'cube', (0, -0.130, 1.020), (0.086, 0.028, 0.068), STEEL,
             bevel=0.008, sub=1, auto=38), 'hips')

# ── head ──────────────────────────────────────────────────────────────────
# Measured off the 1024px painting: the head spans x 0.375..0.640 and, in
# rows from the top, 0.078..0.462. The mesh reaches 0.119 either side and
# from 0.158 below its centre to 0.202 above. The pairing gives the mapping.
FACE_FIT = H.facefit((-0.119, 0.119), (-0.158, 0.202), *in_crop((0.375, 0.640), (0.078, 0.462)))
HEAD = part(H.chain('head', [((0, 0.016, HZ + 0.110), (0.092, 0.100)),
                             ((0, 0.012, HZ + 0.032), (0.115, 0.125)),
                             ((0, -0.008, HZ - 0.037), (0.111, 0.121)),
                             ((0, -0.024, HZ - 0.104), (0.083, 0.098)),
                             ((0, -0.006, HZ - 0.158), (0.052, 0.062))], FACE, sub=3), 'head')
# A cap over the crown, back and sides. A front projection has nothing to
# say about any of them, and a bare dome with painted hair on one face is
# what made the head read as a mask on a balloon.
part(H.keep_back('hair', (0, 0.040, HZ + 0.012), (0.206, 0.224, 0.244), HAIR, cut=0.02,
                 thick=0.010), 'head')
part(H.keep_back('nape', (0, 0.050, HZ - 0.092), (0.172, 0.186, 0.128), HAIR, cut=0.14,
                 thick=0.010), 'head')

# ── kite shield, on the arm the portrait carries it ───────────────────────
KITE = [(-0.215, 0.330), (0.215, 0.330), (0.232, 0.170), (0.215, -0.030),
        (0.140, -0.220), (0.000, -0.372), (-0.140, -0.220), (-0.215, -0.030),
        (-0.232, 0.170)]
SX, SY, SZ = 0.336, -0.126, 1.186
SROT = (R(4), R(17), 0)


def on_shield(lx, lz, ly=0.0):
    """A point on the shield's face, in the shield's own frame."""
    v = Vector((lx, ly, lz))
    v.rotate(Euler(SROT, 'XYZ'))
    return (SX + v.x, SY + v.y, SZ + v.z)
part(H.slab('shieldrim', KITE, 0.036, STEEL, (SX, SY, SZ), SROT, scale=0.94, bend=24, cuts=3),
     'forearm.L')
part(H.slab('shieldface', KITE, 0.032, WOOD, (SX - 0.007, SY - 0.028, SZ), SROT,
            scale=0.87, bend=24, cuts=3), 'forearm.L')
for i, xx in enumerate((-0.104, 0.000, 0.104)):
    part(H.solid(f'seam{i}', 'cube', on_shield(xx, 0.040, -0.050),
                 (0.008, 0.022, 0.420), DARK, rot=SROT, bevel=0.002, sub=1, auto=40), 'forearm.L')
part(H.solid('boss', 'sphere', on_shield(0.020, 0.010, -0.070), (0.126, 0.108, 0.126), STEEL),
     'forearm.L')
part(H.solid('bossrim', 'sphere', on_shield(0.020, 0.010, -0.054), (0.168, 0.052, 0.168), STEEL),
     'forearm.L')
for zz, half in ((0.276, 0.168), (-0.130, 0.150)):
    for xx in (-half, -half / 3, half / 3, half):
        rivet(on_shield(xx, zz, -0.030), 'forearm.L', 0.009)

# ── sword ─────────────────────────────────────────────────────────────────
BLADE = [(-0.040, -0.380), (0.040, -0.380), (0.033, 0.230), (0.000, 0.400), (-0.033, 0.230)]
GX, GY = -WRI, -0.060
part(H.solid('grip', 'cube', (GX, GY, 0.878), (0.034, 0.038, 0.190), DARKL, bevel=0.012, auto=45), 'hand.R')
part(H.solid('pommel', 'sphere', (GX, GY, 0.772), (0.072, 0.072, 0.058), STEEL), 'hand.R')
part(H.solid('guard', 'cube', (GX, GY, 0.986), (0.256, 0.046, 0.030), STEEL, bevel=0.012, auto=40), 'hand.R')
part(H.slab('blade', BLADE, 0.015, STEEL, (GX, GY, 1.392), (0, 0, 0), bevel=0.005, cuts=2), 'hand.R')

# ── freeze, rig, bind ─────────────────────────────────────────────────────
# Modifiers and transforms are applied before anything reads a vertex: the
# weighting measures distance to a bone, and a skin-modifier mesh that has
# not been evaluated is a handful of skeleton vertices, not a surface.
FROZEN = [(H.freeze(o), b) for o, b in PARTS]
HEAD = next(o for o, _ in FROZEN if o.name.startswith('head'))
H.face_uvs(HEAD, (0, 0, HZ), *FACE_FIT)
H.front_faces_only(HEAD, HAIR, cut=0.08)

ARM = H.build_rig('kael', DEFORM, CONTROLS, IK)
for obj, bones in FROZEN:
    H.bind(obj, ARM, bones, DEFORM)

if '--pose' in sys.argv:
    # Move only the IK targets. If the limbs follow, the chains and poles
    # are right; if an elbow inverts, the pole angle is wrong.
    bpy.context.view_layer.objects.active = ARM
    bpy.ops.object.mode_set(mode='POSE')
    ARM.pose.bones['foot_ik.L'].location = (0.00, -0.26, 0.10)
    ARM.pose.bones['foot_ik.R'].location = (0.00, 0.16, 0.04)
    ARM.pose.bones['hand_ik.R'].location = (-0.10, -0.30, 0.34)
    ARM.pose.bones['hand_ik.L'].location = (0.04, -0.14, 0.18)
    bpy.ops.object.mode_set(mode='OBJECT')
    bpy.context.view_layer.update()

if '--build-only' in sys.argv:
    # The diagnostics build the scene and then stage it themselves.
    print('BUILT')
    sys.exit(0)

if '--export' in sys.argv:
    hero = H.join([o for o, _ in FROZEN], 'kael')
    H.decimate(hero, 0.30)
    print('GLB:', H.export_glb(H.OUT / 'kael.glb', hero, ARM))

shot = H.stage(fast=FAST)
if '--head' in sys.argv:
    shot(H.OUT / 'kael-head.png', (0.34, -1.05, 1.80), 85, 460, 520, at=(0, -0.02, 1.68))
elif '--pose' in sys.argv:
    shot(H.OUT / 'kael-pose.png', (1.55, -4.20, 1.40), 62, 520, 780)
else:
    shot(H.OUT / 'kael-full.png', (1.55, -4.20, 1.40), 62, 520, 780)
    shot(H.OUT / 'kael-bust.png', (0.70, -1.85, 1.72), 80, 560, 620, at=(0, 0, 1.58))

print('DONE')
