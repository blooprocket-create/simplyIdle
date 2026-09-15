import bpy, bmesh, math, os, sys
from pathlib import Path

# Repo-relative, so the pipeline runs from a checkout rather than one
# machine's scratch directory. HERO_OUT overrides where renders land.
ROOT = Path(__file__).resolve().parents[2]
OUT = Path(os.environ.get('HERO_OUT', ROOT / '.render'))
OUT.mkdir(parents=True, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
R = math.radians
FAST = '--fast' in sys.argv

# ── materials ─────────────────────────────────────────────────────────────
# The portrait is dark and desaturated: weathered brown-grey everywhere, with
# the green gambeson the only saturated thing in frame.

bpy.ops.object.empty_add(location=(0, 0, 0))
ORIGIN = bpy.context.object; ORIGIN.name = 'texspace'

def plain(name, rgb, rough=0.6, metal=0.0):
    m = bpy.data.materials.new(name)
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*rgb, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    return m

def worn(name, base, accent, rough=(0.30, 0.78), metal=1.0, scale=11.0, bump=0.25):
    """Two-tone noise over base colour, roughness and a shallow bump.

    Plate in the portrait is scuffed and pitted. A flat metallic shader can
    only ever look like a mirror ball; the scuffs are what read as metal.

    The noise is anchored to one shared empty so it measures in world metres
    for every part. Left in each object's own space it is a different size on
    every mesh, and a large smooth one like the cuirass can land wholly on
    the rust side of the ramp and come out looking like bare skin.
    """
    m = bpy.data.materials.new(name)
    nt = m.node_tree; b = nt.nodes['Principled BSDF']
    co = nt.nodes.new('ShaderNodeTexCoord'); co.object = ORIGIN
    n = nt.nodes.new('ShaderNodeTexNoise')
    nt.links.new(co.outputs['Object'], n.inputs['Vector'])
    n.inputs['Scale'].default_value = scale
    n.inputs['Detail'].default_value = 8.0
    n.inputs['Roughness'].default_value = 0.65
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.36
    ramp.color_ramp.elements[0].color = (*base, 1)
    ramp.color_ramp.elements[1].position = 0.64
    ramp.color_ramp.elements[1].color = (*accent, 1)
    nt.links.new(n.outputs['Fac'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], b.inputs['Base Color'])
    mr = nt.nodes.new('ShaderNodeMapRange')
    mr.inputs['From Min'].default_value = 0.28
    mr.inputs['From Max'].default_value = 0.72
    mr.inputs['To Min'].default_value = rough[0]
    mr.inputs['To Max'].default_value = rough[1]
    nt.links.new(n.outputs['Fac'], mr.inputs['Value'])
    nt.links.new(mr.outputs['Result'], b.inputs['Roughness'])
    b.inputs['Metallic'].default_value = metal
    if bump:
        bp = nt.nodes.new('ShaderNodeBump')
        bp.inputs['Strength'].default_value = bump
        nt.links.new(n.outputs['Fac'], bp.inputs['Height'])
        nt.links.new(bp.outputs['Normal'], b.inputs['Normal'])
    return m

SKIN  = plain('skin',   (0.292, 0.162, 0.114), 0.54)
GREEN = worn('green',   (0.032, 0.076, 0.030), (0.062, 0.118, 0.046), (0.74, 0.93), 0.0, 60.0, 0.15)
LEATH = worn('leather', (0.044, 0.026, 0.015), (0.078, 0.048, 0.026), (0.55, 0.85), 0.0, 44.0, 0.20)
DARKL = worn('darkleather', (0.017, 0.013, 0.010), (0.038, 0.027, 0.019), (0.55, 0.85), 0.0, 48.0, 0.20)
STEEL = worn('steel',   (0.270, 0.284, 0.312), (0.196, 0.166, 0.134), (0.30, 0.68), 0.58, 38.0, 0.30)
WOOD  = worn('wood',    (0.058, 0.033, 0.017), (0.098, 0.060, 0.030), (0.62, 0.86), 0.0, 14.0, 0.35)
HAIR  = plain('hair',   (0.026, 0.021, 0.017), 0.92)
GREY  = plain('greyhair', (0.172, 0.163, 0.155), 0.94)
BEARD = plain('beard',  (0.072, 0.064, 0.058), 0.94)
DARK  = plain('dark',   (0.014, 0.013, 0.012), 0.85)
EYE   = plain('eye',    (0.040, 0.055, 0.058), 0.28)

PORTRAIT = str(ROOT / 'IMG' / 'HeroIcon' / 'KaelIronheart.png')

def facefit(xr, zr, ur, yr):
    """Solve the projection mapping from measured ranges.

    Given how far the head reaches in metres and where the face sits in the
    painting, this is the scale and offset that line them up. `yr` is in
    image rows from the top, which is how a painting is measured and the
    opposite of how a texture is sampled.
    """
    vr = (1 - yr[1], 1 - yr[0])
    sx = (ur[1] - ur[0]) / (xr[1] - xr[0])
    sz = (vr[1] - vr[0]) / (zr[1] - zr[0])
    return (sx, sz), (ur[0] - xr[0] * sx, vr[0] - zr[0] * sz)

def projected(name, image, ref, scale, loc, emit=0.22):
    """The painted portrait, front-projected onto head geometry.

    Stacked ellipsoids get to a passable cartoon and no further; the scar,
    the eyes, the weathering and the salt-and-pepper beard are all in the
    artwork already. The geometry supplies silhouette and lighting, the
    painting supplies the face. Coordinates come from one shared reference
    empty rather than each mesh's own object space, or every piece of the
    head gets its own copy of the whole painting.
    """
    m = bpy.data.materials.new(name)
    nt = m.node_tree; b = nt.nodes['Principled BSDF']
    b.inputs['Roughness'].default_value = 0.62
    co = nt.nodes.new('ShaderNodeTexCoord')
    co.object = ref
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    com = nt.nodes.new('ShaderNodeCombineXYZ')
    mp = nt.nodes.new('ShaderNodeMapping')
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = image
    tex.extension = 'EXTEND'
    nt.links.new(co.outputs['Object'], sep.inputs['Vector'])
    nt.links.new(sep.outputs['X'], com.inputs['X'])
    nt.links.new(sep.outputs['Z'], com.inputs['Y'])
    nt.links.new(com.outputs['Vector'], mp.inputs['Vector'])
    mp.inputs['Scale'].default_value = (scale[0], scale[1], 1)
    mp.inputs['Location'].default_value = (loc[0], loc[1], 0)
    nt.links.new(mp.outputs['Vector'], tex.inputs['Vector'])
    nt.links.new(tex.outputs['Color'], b.inputs['Base Color'])
    if emit:
        # The painting carries its own light. A little self-emission keeps
        # the painted detail from being crushed by the scene's key.
        nt.links.new(tex.outputs['Color'], b.inputs['Emission Color'])
        b.inputs['Emission Strength'].default_value = emit
    return m

def smooth(o, auto=None):
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    if auto is None:
        bpy.ops.object.shade_smooth()
    else:
        try:
            bpy.ops.object.shade_auto_smooth(angle=R(auto))
        except Exception:
            bpy.ops.object.shade_smooth()
    return o

# ── every layer is a shell grown on the shared skeleton ───────────────────
# Boxes parked next to a limb never stop reading as boxes parked next to a
# limb. Growing each layer over the same joints at a larger radius is what
# makes a pauldron wrap a shoulder and a boot swallow an ankle.
def skinned(name, joints, bones, material, sub=2):
    me = bpy.data.meshes.new(name)
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    bm = bmesh.new()
    order = list(joints.keys())
    verts = {n: bm.verts.new(joints[n][0]) for n in order}
    bm.verts.ensure_lookup_table()
    for a, b in bones:
        bm.edges.new((verts[a], verts[b]))
    bm.to_mesh(me); bm.free()
    ob.modifiers.new('skin', 'SKIN')
    me.skin_vertices[0].data[0].use_root = True
    for i, n in enumerate(order):
        r = joints[n][1]
        rx, ry = (r, r) if isinstance(r, (int, float)) else r
        me.skin_vertices[0].data[i].radius = (rx, ry)
    s = ob.modifiers.new('sub', 'SUBSURF'); s.levels = sub; s.render_levels = sub
    me.materials.append(material)
    return smooth(ob)

def chain(name, pts, material, sub=2):
    """Shorthand for a shell along one run of joints."""
    j = {f'{name}{i}': (p, r) for i, (p, r) in enumerate(pts)}
    b = [(f'{name}{i}', f'{name}{i+1}') for i in range(len(pts) - 1)]
    return skinned(name, j, b, material, sub)

def solid(name, kind, loc, scale, material, rot=(0, 0, 0), bevel=0.008, sub=2, auto=None):
    if kind == 'cube':
        bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    elif kind == 'cone':
        bpy.ops.mesh.primitive_cone_add(radius1=0.5, radius2=0.0, depth=1, vertices=20, location=loc)
    else:
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.5, location=loc, segments=28, ring_count=18)
    o = bpy.context.object; o.name = name; o.scale = scale; o.rotation_euler = rot
    if kind == 'cube' and bevel:
        b = o.modifiers.new('b', 'BEVEL'); b.width = bevel; b.segments = 3
    if sub:
        s = o.modifiers.new('s', 'SUBSURF'); s.levels = sub; s.render_levels = sub
    o.data.materials.append(material)
    return smooth(o, auto)

def plate(name, w, h, thick, wrap, loc, rot, material, taper=0.0, cuts=14, bevel=0.004):
    """A curved shell: a flat slab subdivided, then bent around its own Z.

    Used for lame edges and flat props only. The bend axis is local Z, so a
    rotation of +-90 about Y turns the wrap axis to point along an arm.
    """
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0))
    o = bpy.context.object; o.name = name
    o.scale = (w, thick, h)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.subdivide(number_cuts=cuts)
    bpy.ops.object.mode_set(mode='OBJECT')
    if taper:
        t = o.modifiers.new('taper', 'SIMPLE_DEFORM')
        t.deform_method = 'TAPER'; t.factor = taper; t.deform_axis = 'Z'
    if wrap:
        d = o.modifiers.new('bend', 'SIMPLE_DEFORM')
        d.deform_method = 'BEND'; d.angle = R(wrap); d.deform_axis = 'Z'
    bv = o.modifiers.new('bev', 'BEVEL'); bv.width = bevel; bv.segments = 2
    o.location = loc; o.rotation_euler = rot
    o.data.materials.append(material)
    return smooth(o, 38)

def slab(name, outline, thick, material, loc=(0, 0, 0), rot=(0, 0, 0),
         scale=1.0, bevel=0.006, bend=0.0, cuts=0):
    """A flat prop built from its own silhouette.

    A kite shield is a kite; four plank-shaped cubes in a row are a crate.
    The outline is given in XZ and extruded along Y.
    """
    me = bpy.data.meshes.new(name)
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    bm = bmesh.new()
    bm.faces.new([bm.verts.new((x * scale, 0.0, z * scale)) for x, z in outline])
    bm.to_mesh(me); bm.free()
    if cuts:
        bpy.ops.object.select_all(action='DESELECT')
        ob.select_set(True)
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.mesh.subdivide(number_cuts=cuts)
        bpy.ops.object.mode_set(mode='OBJECT')
    s = ob.modifiers.new('sol', 'SOLIDIFY'); s.thickness = thick; s.offset = 0
    if bend:
        d = ob.modifiers.new('bend', 'SIMPLE_DEFORM')
        d.deform_method = 'BEND'; d.angle = R(bend); d.deform_axis = 'Z'
    b = ob.modifiers.new('bev', 'BEVEL'); b.width = bevel; b.segments = 3
    ob.location = loc; ob.rotation_euler = rot
    me.materials.append(material)
    return smooth(ob, 40)

def cone_shell(name, r_bottom, r_top, depth, loc, material, thick=0.014,
               rot=(0, 0, 0), squash=(1, 1, 1)):
    """An open cone, for armour that slopes.

    Tapering a bent plate varies how far it wraps, not its radius, so it
    makes a bucket rather than a yoke. A cone is a cone.
    """
    bpy.ops.mesh.primitive_cone_add(radius1=r_bottom, radius2=r_top, depth=depth,
                                    vertices=32, end_fill_type='NOTHING', location=loc)
    o = bpy.context.object; o.name = name
    o.rotation_euler = rot; o.scale = squash
    s = o.modifiers.new('sol', 'SOLIDIFY'); s.thickness = thick; s.offset = 0
    o.data.materials.append(material)
    return smooth(o, 40)

def ring(name, loc, major, minor, material, rot=(0, 0, 0), squash=(1, 1, 1)):
    """A band around a limb or a waist.

    A torus already lies perpendicular to its own axis, so a belt or a lame
    edge needs no reasoning about which way a bend modifier curls — which is
    what put the last pass's lames out in the air beside the shoulders.
    """
    bpy.ops.mesh.primitive_torus_add(location=loc, major_radius=major, minor_radius=minor,
                                     major_segments=32, minor_segments=12)
    o = bpy.context.object; o.name = name
    o.rotation_euler = rot; o.scale = squash
    o.data.materials.append(material)
    return smooth(o)

_riv = [0]
def rivet(loc, r=0.010):
    _riv[0] += 1
    return solid(f'rivet{_riv[0]}', 'sphere', loc, (r * 2, r * 2, r * 2), STEEL, sub=1)

# ── body: 1.85m, heavy-set, thick-necked and broad, as the portrait is ────
SHO, ELB, WRI = 0.192, 0.290, 0.318
BODY_J = {
    'pelvis': ((0, 0, 0.94), (0.118, 0.098)),
    'waist':  ((0, 0, 1.11), (0.115, 0.094)),
    'chest':  ((0, 0, 1.34), (0.162, 0.118)),
    'clav':   ((0, 0, 1.474), (0.104, 0.090)),
    'neck':   ((0, 0, 1.548), (0.064, 0.060)),
}
BODY_B = [('pelvis', 'waist'), ('waist', 'chest'), ('chest', 'clav'), ('clav', 'neck')]
for s, t in ((-1, 'L'), (1, 'R')):
    BODY_J[f'sho{t}'] = ((s * SHO, 0, 1.456), (0.080, 0.080))
    BODY_J[f'elb{t}'] = ((s * ELB, 0, 1.190), (0.058, 0.058))
    BODY_J[f'wri{t}'] = ((s * WRI, -0.030, 0.955), (0.042, 0.042))
    BODY_J[f'hip{t}'] = ((s * 0.102, 0, 0.900), (0.094, 0.094))
    BODY_J[f'kne{t}'] = ((s * 0.122, 0, 0.510), (0.068, 0.068))
    BODY_J[f'ank{t}'] = ((s * 0.122, 0, 0.100), (0.050, 0.050))
    BODY_B += [('clav', f'sho{t}'), (f'sho{t}', f'elb{t}'), (f'elb{t}', f'wri{t}'),
               ('pelvis', f'hip{t}'), (f'hip{t}', f'kne{t}'), (f'kne{t}', f'ank{t}')]
skinned('body', BODY_J, BODY_B, SKIN)

for s, t in ((-1, 'L'), (1, 'R')):
    chain(f'hand{t}', [((s * WRI, -0.036, 0.930), 0.046),
                       ((s * WRI, -0.062, 0.878), 0.052),
                       ((s * WRI, -0.052, 0.832), 0.044)], SKIN)

# ── cloth ─────────────────────────────────────────────────────────────────
GAMB_J = {
    'g_hem':   ((0, 0, 1.020), (0.140, 0.116)),
    'g_waist': ((0, 0, 1.115), (0.140, 0.116)),
    'g_chest': ((0, 0, 1.335), (0.170, 0.134)),
    'g_clav':  ((0, 0, 1.506), (0.152, 0.130)),
}
GAMB_B = [('g_hem', 'g_waist'), ('g_waist', 'g_chest'), ('g_chest', 'g_clav')]
for s, t in ((-1, 'L'), (1, 'R')):
    GAMB_J[f'g_sho{t}'] = ((s * SHO, 0, 1.470), (0.110, 0.110))
    GAMB_J[f'g_elb{t}'] = ((s * ELB, 0, 1.205), (0.074, 0.074))
    GAMB_B += [('g_clav', f'g_sho{t}'), (f'g_sho{t}', f'g_elb{t}')]
skinned('gambeson', GAMB_J, GAMB_B, GREEN)

# Skirt hanging from the belt, and trousers under it.
chain('skirt', [((0, 0, 1.012), (0.168, 0.140)), ((0, 0, 0.896), (0.192, 0.158))], GREEN)
TROU_J = {'t_pelvis': ((0, 0, 0.90), (0.130, 0.110))}
TROU_B = []
for s, t in ((-1, 'L'), (1, 'R')):
    TROU_J[f't_hip{t}'] = ((s * 0.102, 0, 0.855), (0.112, 0.112))
    TROU_J[f't_kne{t}'] = ((s * 0.122, 0, 0.520), (0.090, 0.090))
    TROU_J[f't_ank{t}'] = ((s * 0.122, 0, 0.230), (0.074, 0.074))
    TROU_B += [('t_pelvis', f't_hip{t}'), (f't_hip{t}', f't_kne{t}'), (f't_kne{t}', f't_ank{t}')]
skinned('trousers', TROU_J, TROU_B, LEATH)

# Boots grown over the ankle rather than parked beside it.
for s, t in ((-1, 'L'), (1, 'R')):
    chain(f'boot{t}', [((s * 0.122, 0.005, 0.300), (0.092, 0.092)),
                       ((s * 0.122, 0.000, 0.075), (0.082, 0.086)),
                       ((s * 0.122, -0.075, 0.048), (0.072, 0.062)),
                       ((s * 0.122, -0.135, 0.042), (0.058, 0.044))], DARKL)

# ── plate ────────────────────────────────────────────────────────────────
# A bent plate of width w through angle t has radius w/t, keeps its front
# face where it is put, and sweeps backwards in +Y. Those three facts are
# measured, and every placement below is derived from them instead of
# guessed — the last pass's cuirass was a 45cm flying saucer.
def wrapped(name, radius, height, z, y_front, deg, material, cuts=16, thick=0.016,
            taper=0.0, tilt=0.0):
    t = R(deg)
    return plate(name, radius * t, height, thick, deg, (0, y_front + thick / 2, z),
                 (R(tilt), 0, 0), material, taper=taper, cuts=cuts)

# Collar band across the clavicles, and the gorget at the throat.
cone_shell('yoke', 0.196, 0.116, 0.118, (0, 0.008, 1.468), STEEL, squash=(1, 0.82, 1))
cone_shell('gorget', 0.098, 0.086, 0.062, (0, 0.006, 1.542), STEEL, squash=(1, 0.86, 1))
ring('yokerim', (0, 0.008, 1.410), 0.196, 0.013, STEEL, squash=(1, 0.82, 1.3))
# One pectoral plate lower on his right, as the portrait has, leaving the
# centre and his other side in green.
plate('pectoral', 0.260, 0.215, 0.016, 118, (0.106, -0.152, 1.326), (R(4), 0, R(-6)), STEEL, cuts=12)
for x, z in ((-0.150, 1.492), (0.152, 1.492), (0.066, 1.258), (0.158, 1.262)):
    rivet((x, -0.176, z))

for s, t in ((-1, 'L'), (1, 'R')):
    # Shoulder shell, flattened rather than spherical, with torus lames
    # riding around the arm axis to give the overlapping edges.
    chain(f'pauld{t}', [((s * 0.168, 0.004, 1.488), (0.132, 0.122)),
                        ((s * 0.226, 0.002, 1.404), (0.128, 0.118)),
                        ((s * 0.262, 0.000, 1.330), (0.108, 0.100))], STEEL)
    for maj, mnr, loc in ((0.074, 0.010, (s * 0.234, 0.002, 1.412)),
                          (0.068, 0.009, (s * 0.266, 0.000, 1.352))):
        ring(f'lame{t}{loc[2]:.2f}', loc, maj, mnr, STEEL,
             rot=(0, R(72 * s + 18), 0), squash=(1, 1, 1.22))
    for i in range(2):
        rivet((s * (0.222 + i * 0.030), -0.092 - i * 0.004, 1.470 - i * 0.076))
    # Vambrace: a shell down the forearm, capped by a ring at each end.
    chain(f'vamb{t}', [((s * (ELB + 0.004), -0.008, 1.146), (0.086, 0.086)),
                       ((s * WRI, -0.026, 0.978), (0.068, 0.068))], STEEL)

# Straps crossing the chest with the buckle where they meet, and the belt.
for s in (-1, 1):
    chain(f'strap{s}', [((s * 0.146, -0.082, 1.448), (0.032, 0.015)),
                        ((s * 0.066, -0.172, 1.306), (0.030, 0.014)),
                        ((-s * 0.026, -0.174, 1.150), (0.028, 0.013)),
                        ((-s * 0.100, -0.126, 1.042), (0.026, 0.013))], LEATH)
solid('buckle', 'cube', (0, -0.166, 1.186), (0.068, 0.022, 0.068), STEEL, bevel=0.008, sub=1, auto=38)
solid('bucklein', 'cube', (0, -0.174, 1.186), (0.036, 0.030, 0.036), DARK, bevel=0.003, sub=1, auto=38)
ring('belt', (0, 0, 1.020), 0.140, 0.030, DARKL, squash=(1, 0.86, 0.62))
solid('beltbuckle', 'cube', (0, -0.128, 1.020), (0.082, 0.028, 0.064), STEEL, bevel=0.008, sub=1, auto=38)

# ── head ──────────────────────────────────────────────────────────────────
# Stacked spheres cannot make a face, and the last pass proved it: cheek
# spheres read as googly eyes and a slab brow read as a plank. Everything
# here is either part of the skull volume or a mass of hair grown on joints.
HZ = 1.672
bpy.ops.object.empty_add(location=(0, 0.012, HZ))
HEADREF = bpy.context.object; HEADREF.name = 'headref'
_img = bpy.data.images.load(PORTRAIT)
# Head reaches 0.105 either side and from 0.160 below the centre to 0.200
# above it. In the 1024px painting the head spans x 0.378..0.638 and, in rows
# from the top, 0.090..0.470. The one pairing gives the other.
_s, _l = facefit((-0.119, 0.119), (-0.158, 0.202), (0.375, 0.640), (0.078, 0.462))
FACE = projected('face', _img, HEADREF, _s, _l)

# One connected head, so the projection has no seam to split across, running
# down into the neck so the chin is not left floating above the gorget.
chain('head', [((0, 0.016, HZ + 0.110), (0.092, 0.100)),
               ((0, 0.012, HZ + 0.032), (0.115, 0.125)),
               ((0, -0.008, HZ - 0.037), (0.111, 0.121)),
               ((0, -0.024, HZ - 0.104), (0.083, 0.098)),
               ((0, -0.006, HZ - 0.158), (0.052, 0.062))], FACE, sub=3)
# Hair only where a front projection has nothing to say: behind the skull.
chain('hair', [((0, 0.070, HZ + 0.082), (0.044, 0.034)),
               ((0, 0.116, HZ + 0.026), (0.046, 0.038)),
               ((0, 0.118, HZ - 0.036), (0.040, 0.034))], HAIR)

# ── kite shield, tucked against the forearm the portrait carries it on ────
KITE = [(-0.215, 0.330), (0.215, 0.330), (0.232, 0.170), (0.215, -0.030),
        (0.140, -0.220), (0.000, -0.372), (-0.140, -0.220), (-0.215, -0.030),
        (-0.232, 0.170)]
SX, SY, SZ = 0.328, -0.118, 1.132
SROT = (R(4), R(17), 0)
slab('shieldrim', KITE, 0.034, STEEL, (SX, SY, SZ), SROT, scale=0.86, bend=24, cuts=3)
slab('shieldface', KITE, 0.030, WOOD, (SX - 0.006, SY - 0.026, SZ), SROT, scale=0.77, bend=24, cuts=3)
for i, xx in enumerate((-0.092, 0.000, 0.092)):
    solid(f'seam{i}', 'cube', (SX + xx * 0.96, SY - 0.050, SZ + 0.040), (0.010, 0.026, 0.380),
          DARK, rot=SROT, bevel=0.002, sub=1, auto=40)
solid('boss', 'sphere', (SX + 0.018, SY - 0.066, SZ + 0.020), (0.114, 0.096, 0.114), STEEL)
solid('bossrim', 'sphere', (SX + 0.018, SY - 0.052, SZ + 0.020), (0.150, 0.048, 0.150), STEEL)
for zz in (0.254, -0.128):
    for xx in (-0.152, -0.050, 0.050, 0.152):
        rivet((SX + xx, SY - 0.032 - abs(xx) * 0.12, SZ + zz), 0.008)

# ── sword ─────────────────────────────────────────────────────────────────
BLADE = [(-0.040, -0.380), (0.040, -0.380), (0.033, 0.230), (0.000, 0.400), (-0.033, 0.230)]
GX, GY = -WRI, -0.060
solid('grip', 'cube', (GX, GY, 0.878), (0.034, 0.038, 0.190), DARKL, bevel=0.012, auto=45)
solid('pommel', 'sphere', (GX, GY, 0.772), (0.072, 0.072, 0.058), STEEL)
solid('guard', 'cube', (GX, GY, 0.986), (0.256, 0.046, 0.030), STEEL, bevel=0.012, auto=40)
slab('blade', BLADE, 0.015, STEEL, (GX, GY, 1.392), (0, 0, 0), bevel=0.005, cuts=2)

# ── stage ─────────────────────────────────────────────────────────────────
bpy.ops.mesh.primitive_plane_add(size=80, location=(0, 0, 0))
bpy.context.object.data.materials.append(plain('floor', (0.013, 0.014, 0.016), 0.95))

world = bpy.data.worlds.new('w'); bpy.context.scene.world = world
world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.024, 0.028, 0.038, 1)

# Warm key, dim cool fill, warm rim from behind, all at a fraction of the
# last pass's energy — the beige render was simply blown out.
for loc, energy, size, colour in (
    ((-2.3, -2.5, 3.1), 300, 2.4, (0.92, 0.95, 1.00)),
    (( 3.0, -1.6, 1.7),  55, 3.6, (0.46, 0.60, 1.00)),
    (( 1.5,  2.4, 2.5), 320, 1.8, (1.00, 0.56, 0.24)),
    ((-2.2,  2.2, 2.2), 180, 1.6, (1.00, 0.62, 0.30)),
):
    bpy.ops.object.light_add(type='AREA', location=loc)
    d = bpy.context.object.data
    d.energy = energy; d.size = size; d.color = colour
    bpy.context.object.rotation_euler = (
        math.atan2(math.hypot(loc[0], loc[1]), loc[2]), 0,
        math.atan2(loc[1], loc[0]) + R(90))

sc = bpy.context.scene
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'
sc.cycles.samples = 24 if FAST else 90
sc.view_settings.look = 'AgX - Base Contrast'

bpy.ops.object.empty_add(location=(0, 0, 1.02))
aim = bpy.context.object
bpy.ops.object.camera_add(location=(0, -4, 1))
cam = bpy.context.object; sc.camera = cam
c = cam.constraints.new('TRACK_TO'); c.target = aim
c.track_axis = 'TRACK_NEGATIVE_Z'; c.up_axis = 'UP_Y'

def shot(path, loc, lens, w, hgt, at=(0, 0, 1.02)):
    aim.location = at
    cam.location = loc; cam.data.lens = lens
    sc.render.resolution_x = w; sc.render.resolution_y = hgt
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)

if '--head' in sys.argv:
    shot(str(OUT / 'kael-head.png'), (0.34, -1.05, 1.80), 85, 460, 520, at=(0, -0.02, 1.68))
else:
    shot(str(OUT / 'kael-full.png'), (1.55, -4.20, 1.40), 62, 520, 780)
    shot(str(OUT / 'kael-bust.png'), (0.70, -1.85, 1.72), 80, 560, 620, at=(0, 0, 1.58))
print('DONE')
