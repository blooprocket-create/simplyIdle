"""Building blocks for headless hero models.

The shared vocabulary for every hero: shells grown over a joint skeleton,
plates and slabs for hard surfaces, the painted portrait as the face, an IK
rig, and a glTF export. `kael.py` is the first hero written against it.
"""
import math
import os
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector

R = math.radians
ROOT = Path(__file__).resolve().parents[2]
OUT = Path(os.environ.get('HERO_OUT', ROOT / '.render'))


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    OUT.mkdir(parents=True, exist_ok=True)


def select(o):
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    return o


def smooth(o, auto=None):
    """Shade an object.

    The shade operators act on the *selection*, not the active object, so an
    object created through bpy.data rather than an operator has to be
    selected first or the smoothing lands on some unrelated mesh.
    """
    select(o)
    if auto is None:
        bpy.ops.object.shade_smooth()
    else:
        try:
            bpy.ops.object.shade_auto_smooth(angle=R(auto))
        except Exception:
            bpy.ops.object.shade_smooth()
    return o


# ── materials ─────────────────────────────────────────────────────────────

def plain(name, rgb, rough=0.6, metal=0.0):
    m = bpy.data.materials.new(name)
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*rgb, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    return m


def worn(name, base, accent, rough=(0.30, 0.78), metal=1.0, scale=11.0, bump=0.25,
         texspace=None):
    """Two-tone noise over base colour, roughness and a shallow bump.

    Plate in the portrait is scuffed and pitted. A flat metallic shader can
    only ever look like a mirror ball; the scuffs are what read as metal.

    The noise is anchored to one shared empty so it measures in world metres
    for every part. Left in each object's own space it is a different size on
    every mesh, and a large smooth one like a cuirass can land wholly on the
    rust side of the ramp and come out looking like bare skin.
    """
    m = bpy.data.materials.new(name)
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    # glTF cannot carry a node graph, so the socket default is what an
    # exported asset actually shows. Seeding it with the ramp's midpoint
    # means the GLB is a plausible flat version rather than default grey.
    b.inputs['Base Color'].default_value = (*[(x + y) / 2 for x, y in zip(base, accent)], 1)
    b.inputs['Roughness'].default_value = sum(rough) / 2
    b.inputs['Metallic'].default_value = metal
    co = nt.nodes.new('ShaderNodeTexCoord')
    co.object = texspace
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
    if bump:
        bp = nt.nodes.new('ShaderNodeBump')
        bp.inputs['Strength'].default_value = bump
        nt.links.new(n.outputs['Fac'], bp.inputs['Height'])
        nt.links.new(bp.outputs['Normal'], b.inputs['Normal'])
    return m


def facefit(xr, zr, ur, yr):
    """Solve a projection mapping from measured ranges.

    Given how far the head reaches in metres and where the face sits in the
    painting, this is the scale and offset that line them up. `yr` is in
    image rows from the top, which is how a painting is measured and the
    opposite of how a texture is sampled.
    """
    vr = (1 - yr[1], 1 - yr[0])
    sx = (ur[1] - ur[0]) / (xr[1] - xr[0])
    sz = (vr[1] - vr[0]) / (zr[1] - zr[0])
    return (sx, sz), (ur[0] - xr[0] * sx, vr[0] - zr[0] * sz)


def crop_image(image, u0, u1, ytop0, ytop1, name=None):
    """Cut the head out of a portrait.

    Embedding a whole 1024px painting to texture one face costs ~7.5MB per
    hero, and 65 of those is half a gigabyte of mostly background. Cropping
    to the head both shrinks the asset and spends every pixel on the face.

    Ranges are in the source image's own coordinates, `ytop` measured in rows
    from the top the way a painting is read.
    """
    import numpy as np
    w, h = image.size
    buf = np.empty(w * h * 4, dtype=np.float32)
    image.pixels.foreach_get(buf)
    px = buf.reshape(h, w, 4)
    x0, x1 = int(u0 * w), int(u1 * w)
    # Blender image rows run bottom-up; painting rows run top-down.
    y0, y1 = int((1 - ytop1) * h), int((1 - ytop0) * h)
    out = np.ascontiguousarray(px[y0:y1, x0:x1, :])
    nh, nw = out.shape[0], out.shape[1]
    new = bpy.data.images.new(name or f'{image.name}_face', width=nw, height=nh, alpha=False)
    new.colorspace_settings.name = image.colorspace_settings.name
    new.pixels.foreach_set(out.reshape(-1))
    new.update()
    return new


def painted(name, image, emit=0.22):
    """The painted portrait, read through the mesh's own UVs.

    Stacked ellipsoids reach a passable cartoon and stop; the scar, the eyes,
    the weathering and the salt-and-pepper beard are all in the artwork
    already. The geometry supplies silhouette and lighting, the painting
    supplies the face.

    The UVs matter: a projection driven from world coordinates slides off the
    face the moment the head is posed, and cannot be exported. Baked into a
    UV layer it is rigid to the mesh and survives both.
    """
    m = bpy.data.materials.new(name)
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    b.inputs['Roughness'].default_value = 0.62
    uv = nt.nodes.new('ShaderNodeUVMap')
    uv.uv_map = 'face'
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = image
    tex.extension = 'EXTEND'
    nt.links.new(uv.outputs['UV'], tex.inputs['Vector'])
    nt.links.new(tex.outputs['Color'], b.inputs['Base Color'])
    if emit:
        # The painting carries its own light. A little self-emission keeps
        # the painted detail from being crushed by the scene's key.
        nt.links.new(tex.outputs['Color'], b.inputs['Emission Color'])
        b.inputs['Emission Strength'].default_value = emit
    return m


def seg_dist(p, a, b):
    """Distance from a point to a line segment."""
    return _seg_dist(Vector(p), Vector(a), Vector(b))


def garment(name, body, keep, material, offset=0.011, thick=0.009):
    """A copy of the body, trimmed to a region and pushed out along normals.

    Clothing built as a shell of the actual body fits it exactly. A shape
    grown separately over the same joints only approximates it, and the
    approximation is precisely where cloth ends up inside skin.
    """
    me = body.data.copy()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not keep(v.co)], context='VERTS')
    bm.to_mesh(me)
    bm.free()
    d = ob.modifiers.new('push', 'DISPLACE')
    d.strength = offset
    d.mid_level = 0.0
    s = ob.modifiers.new('sol', 'SOLIDIFY')
    s.thickness = thick
    s.offset = 1
    me.materials.clear()
    me.materials.append(material)
    return smooth(ob)


def keep_back(name, loc, scale, material, cut=-0.32, thick=0.014, segs=(32, 20)):
    """A cap over the back and sides of a head: a sphere with its face cut off.

    Real hair volume, so the skull has a silhouette from every angle instead
    of a bare dome, and so the painted face has somewhere to stop.
    """
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.5, location=loc,
                                         segments=segs[0], ring_count=segs[1])
    o = bpy.context.object
    o.name = name
    o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.normal.y < cut], context='FACES')
    bm.to_mesh(o.data)
    bm.free()
    s = o.modifiers.new('sol', 'SOLIDIFY')
    s.thickness = thick
    s.offset = 1
    o.data.materials.append(material)
    return smooth(o)


def assign_faces(obj, material, test):
    """Give polygons that pass `test(centre, normal)` their own material.

    Lets one mesh carry skin, a painted face and hair without being cut into
    separate objects — which matters when the mesh is a real body and cutting
    it would break its topology.
    """
    me = obj.data
    names = [m.name for m in me.materials]
    if material.name not in names:
        me.materials.append(material)
        names.append(material.name)
    slot = names.index(material.name)
    for p in me.polygons:
        if test(p.center, p.normal):
            p.material_index = slot
    return obj


def front_faces_only(obj, back_material, cut=-0.22):
    """Restrict the painted face to polygons that actually face the front.

    The projection reads x and z, so it cannot tell the front of a skull from
    the back: both get the same UVs, and the painting ends up mapped onto the
    back of the head as a second face. Everything not clearly facing forward
    gets a plain material instead.
    """
    me = obj.data
    names = [m.name for m in me.materials]
    if back_material.name not in names:
        me.materials.append(back_material)
        names.append(back_material.name)
    back = names.index(back_material.name)
    for p in me.polygons:
        if p.normal.y > cut:
            p.material_index = back
    return obj


def face_uvs(obj, origin, scale, loc, layer='face'):
    """Write the front projection into a UV layer, from world positions."""
    me = obj.data
    uvs = me.uv_layers.get(layer) or me.uv_layers.new(name=layer)
    mw = obj.matrix_world
    for loop in me.loops:
        p = mw @ me.vertices[loop.vertex_index].co
        uvs.data[loop.index].uv = ((p.x - origin[0]) * scale[0] + loc[0],
                                   (p.z - origin[2]) * scale[1] + loc[1])
    return obj


# ── geometry ──────────────────────────────────────────────────────────────

def skinned(name, joints, bones, material, sub=2):
    """One connected surface grown over an edge skeleton.

    A box parked beside a limb never stops reading as a box parked beside a
    limb. Growing each layer over the same joints at a larger radius is what
    makes a pauldron wrap a shoulder and a boot swallow an ankle.
    """
    me = bpy.data.meshes.new(name)
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    bm = bmesh.new()
    order = list(joints.keys())
    verts = {n: bm.verts.new(joints[n][0]) for n in order}
    bm.verts.ensure_lookup_table()
    for a, b in bones:
        bm.edges.new((verts[a], verts[b]))
    bm.to_mesh(me)
    bm.free()
    ob.modifiers.new('skin', 'SKIN')
    me.skin_vertices[0].data[0].use_root = True
    for i, n in enumerate(order):
        r = joints[n][1]
        rx, ry = (r, r) if isinstance(r, (int, float)) else r
        me.skin_vertices[0].data[i].radius = (rx, ry)
    s = ob.modifiers.new('sub', 'SUBSURF')
    s.levels = s.render_levels = sub
    me.materials.append(material)
    return smooth(ob)


def chain(name, pts, material, sub=2):
    """Shorthand for a shell along one run of joints."""
    j = {f'{name}{i}': (p, r) for i, (p, r) in enumerate(pts)}
    b = [(f'{name}{i}', f'{name}{i + 1}') for i in range(len(pts) - 1)]
    return skinned(name, j, b, material, sub)


def solid(name, kind, loc, scale, material, rot=(0, 0, 0), bevel=0.008, sub=2, auto=None,
          segs=(28, 18)):
    if kind == 'cube':
        bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    elif kind == 'cone':
        bpy.ops.mesh.primitive_cone_add(radius1=0.5, radius2=0.0, depth=1, vertices=20, location=loc)
    else:
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.5, location=loc,
                                             segments=segs[0], ring_count=segs[1])
    o = bpy.context.object
    o.name = name
    o.scale = scale
    o.rotation_euler = rot
    if kind == 'cube' and bevel:
        b = o.modifiers.new('b', 'BEVEL')
        b.width = bevel
        b.segments = 3
    if sub:
        s = o.modifiers.new('s', 'SUBSURF')
        s.levels = s.render_levels = sub
    o.data.materials.append(material)
    return smooth(o, auto)


def plate(name, w, h, thick, wrap, loc, rot, material, taper=0.0, cuts=14, bevel=0.004):
    """A curved shell: a flat slab subdivided, then bent around its own Z.

    Measured behaviour: a plate of width w bent through angle t has radius
    w/t, keeps its front face where it is put, and sweeps backwards in +Y.
    Every placement that uses this is derived from those three facts.
    """
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0))
    o = bpy.context.object
    o.name = name
    o.scale = (w, thick, h)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.subdivide(number_cuts=cuts)
    bpy.ops.object.mode_set(mode='OBJECT')
    if taper:
        t = o.modifiers.new('taper', 'SIMPLE_DEFORM')
        t.deform_method = 'TAPER'
        t.factor = taper
        t.deform_axis = 'Z'
    if wrap:
        d = o.modifiers.new('bend', 'SIMPLE_DEFORM')
        d.deform_method = 'BEND'
        d.angle = R(wrap)
        d.deform_axis = 'Z'
    bv = o.modifiers.new('bev', 'BEVEL')
    bv.width = bevel
    bv.segments = 2
    o.location = loc
    o.rotation_euler = rot
    o.data.materials.append(material)
    return smooth(o, 38)


def wrapped(name, radius, height, z, y_front, deg, material, cuts=16, thick=0.016,
            taper=0.0, tilt=0.0):
    """A band that wraps a torso, placed by the radius you want."""
    return plate(name, radius * R(deg), height, thick, deg, (0, y_front + thick / 2, z),
                 (R(tilt), 0, 0), material, taper=taper, cuts=cuts)


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
    bm.to_mesh(me)
    bm.free()
    if cuts:
        select(ob)
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.mesh.subdivide(number_cuts=cuts)
        bpy.ops.object.mode_set(mode='OBJECT')
    s = ob.modifiers.new('sol', 'SOLIDIFY')
    s.thickness = thick
    s.offset = 0
    if bend:
        d = ob.modifiers.new('bend', 'SIMPLE_DEFORM')
        d.deform_method = 'BEND'
        d.angle = R(bend)
        d.deform_axis = 'Z'
    b = ob.modifiers.new('bev', 'BEVEL')
    b.width = bevel
    b.segments = 3
    ob.location = loc
    ob.rotation_euler = rot
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
    o = bpy.context.object
    o.name = name
    o.rotation_euler = rot
    o.scale = squash
    s = o.modifiers.new('sol', 'SOLIDIFY')
    s.thickness = thick
    s.offset = 0
    o.data.materials.append(material)
    return smooth(o, 40)


def ring(name, loc, major, minor, material, rot=(0, 0, 0), squash=(1, 1, 1)):
    """A band around a limb or a waist.

    A torus already lies perpendicular to its own axis, so a belt or a lame
    edge needs no reasoning about which way a bend modifier curls.
    """
    bpy.ops.mesh.primitive_torus_add(location=loc, major_radius=major, minor_radius=minor,
                                     major_segments=32, minor_segments=12)
    o = bpy.context.object
    o.name = name
    o.rotation_euler = rot
    o.scale = squash
    o.data.materials.append(material)
    return smooth(o)


def along(a, b, t):
    """A point t of the way from a to b, for laying lames down a limb."""
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def aim_rot(a, b):
    """Euler that points a Z-axis primitive from a towards b."""
    d = Vector(b) - Vector(a)
    if d.length < 1e-9:
        return (0.0, 0.0, 0.0)
    return tuple(d.to_track_quat('Z', 'Y').to_euler())


# ── rigging ───────────────────────────────────────────────────────────────

def freeze(o):
    """Apply every modifier and transform, leaving world-space geometry.

    Binding and weighting both read vertex positions. Doing that before the
    skin, subsurf, bevel and bend modifiers have run reads a handful of
    skeleton vertices instead of the surface they grow into, and doing it
    with a non-identity object transform reads the wrong space entirely.
    """
    select(o)
    if o.modifiers:
        bpy.ops.object.convert(target='MESH')
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return bpy.context.object


def build_rig(name, deform, controls, ik):
    """An armature from head/tail pairs, with IK chains on the limbs.

    `deform` maps bone name to (head, tail, parent). `controls` are the
    non-deforming targets an animator moves — hands, feet and the pole
    targets that decide which way an elbow or a knee breaks. `ik` lists
    (bone, target, pole, chain, pole_angle).
    """
    arm = bpy.data.armatures.new(name)
    obj = bpy.data.objects.new(name, arm)
    bpy.context.collection.objects.link(obj)
    select(obj)
    bpy.ops.object.mode_set(mode='EDIT')
    for bname, (head, tail, parent) in deform.items():
        eb = arm.edit_bones.new(bname)
        eb.head, eb.tail = Vector(head), Vector(tail)
        eb.use_deform = True
    for bname, (head, tail, parent) in deform.items():
        if parent:
            arm.edit_bones[bname].parent = arm.edit_bones[parent]
            arm.edit_bones[bname].use_connect = (
                (Vector(deform[parent][1]) - Vector(deform[bname][0])).length < 1e-6)
    for cname, (head, tail) in controls.items():
        eb = arm.edit_bones.new(cname)
        eb.head, eb.tail = Vector(head), Vector(tail)
        # Controls drive the pose; they must not also skin the mesh, or a
        # hand target drags the vertices nearest it around on its own.
        eb.use_deform = False
    bpy.ops.object.mode_set(mode='POSE')
    for bone, target, pole, count, angle in ik:
        c = obj.pose.bones[bone].constraints.new('IK')
        c.target = obj
        c.subtarget = target
        c.chain_count = count
        if pole:
            c.pole_target = obj
            c.pole_subtarget = pole
            c.pole_angle = R(angle)
    bpy.ops.object.mode_set(mode='OBJECT')
    return obj


def _seg_dist(p, a, b):
    ab = b - a
    denom = ab.dot(ab)
    t = 0.0 if denom < 1e-12 else max(0.0, min(1.0, (p - a).dot(ab) / denom))
    return (p - (a + ab * t)).length


def bind(obj, arm, weights, deform, power=3.6, k=3):
    """Attach a mesh to the armature.

    `weights` is either a bone name — the whole mesh rides it rigidly, which
    is what a pauldron or a sword actually does — or a list of bones to
    blend between by distance. Bone-heat weighting gives up on overlapping
    shells like these, and inverse distance to the bone segment never does.
    """
    if isinstance(weights, str):
        g = obj.vertex_groups.new(name=weights)
        g.add([v.index for v in obj.data.vertices], 1.0, 'REPLACE')
    else:
        segs = {n: (Vector(deform[n][0]), Vector(deform[n][1])) for n in weights}
        groups = {n: obj.vertex_groups.new(name=n) for n in weights}
        for v in obj.data.vertices:
            near = sorted((_seg_dist(v.co, *segs[n]), n) for n in weights)[:k]
            ws = [(1.0 / max(d, 1e-4) ** power, n) for d, n in near]
            total = sum(w for w, _ in ws)
            for w, n in ws:
                groups[n].add([v.index], w / total, 'REPLACE')
    obj.parent = arm
    m = obj.modifiers.new('armature', 'ARMATURE')
    m.object = arm
    return obj


def join(objects, name):
    """Merge meshes into one multi-material object.

    Vertex groups merge by name, so this is safe after binding and turns a
    pile of separate shells into a single skinned mesh.
    """
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    merged = bpy.context.object
    merged.name = name
    return [merged]


def decimate(objects, ratio):
    """Collapse triangles down to a game-sensible budget.

    The build is made of subdivided shells, which is right for a render and
    far too heavy to ship — a hero is drawn a few hundred pixels tall. The
    modifier has to sit ahead of the armature in the stack, or it decimates
    the deformed result instead of the rest pose.
    """
    for o in objects:
        m = o.modifiers.new('dec', 'DECIMATE')
        m.ratio = ratio
        select(o)
        bpy.ops.object.modifier_move_to_index(modifier=m.name, index=0)
        bpy.ops.object.modifier_apply(modifier=m.name)
    return objects


def export_glb(path, objects, arm):
    """Write the hero as a GLB: skinned meshes plus the bone hierarchy.

    glTF carries no constraints, so the IK rig does not travel — the chains
    here are for authoring, and a runtime solver drives the same bones.
    """
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:
        o.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    kw = dict(filepath=str(path), export_format='GLB', use_selection=True,
              export_apply=False, export_yup=True)
    try:
        bpy.ops.export_scene.gltf(**kw, export_skins=True, export_animations=True)
    except TypeError:
        bpy.ops.export_scene.gltf(**kw)
    return path


# ── stage ─────────────────────────────────────────────────────────────────

def stage(fast=False, floor=True):
    """Dark set, cool key, warm rim — the portrait's firelit mood.

    One warm key was enough to collapse every material onto the same brown.
    The key here is cool and only the rims are warm, which is what separates
    plate from leather from wood.
    """
    if floor:
        bpy.ops.mesh.primitive_plane_add(size=80, location=(0, 0, 0))
        bpy.context.object.name = 'floor'
        bpy.context.object.data.materials.append(plain('floor', (0.013, 0.014, 0.016), 0.95))
    world = bpy.data.worlds.new('w')
    bpy.context.scene.world = world
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.046, 0.052, 0.068, 1)
    for loc, energy, size, colour in (
        ((-2.3, -2.5, 3.1), 300, 2.4, (0.92, 0.95, 1.00)),
        ((3.0, -1.6, 1.7), 55, 3.6, (0.46, 0.60, 1.00)),
        ((1.5, 2.4, 2.5), 320, 1.8, (1.00, 0.56, 0.24)),
        ((-2.2, 2.2, 2.2), 180, 1.6, (1.00, 0.62, 0.30)),
    ):
        bpy.ops.object.light_add(type='AREA', location=loc)
        d = bpy.context.object.data
        d.energy, d.size, d.color = energy, size, colour
        bpy.context.object.rotation_euler = (
            math.atan2(math.hypot(loc[0], loc[1]), loc[2]), 0,
            math.atan2(loc[1], loc[0]) + R(90))
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = 24 if fast else 90
    sc.view_settings.look = 'AgX - Base Contrast'
    bpy.ops.object.empty_add(location=(0, 0, 1.02))
    aim = bpy.context.object
    aim.name = 'aim'
    bpy.ops.object.camera_add(location=(0, -4, 1))
    cam = bpy.context.object
    sc.camera = cam
    c = cam.constraints.new('TRACK_TO')
    c.target = aim
    c.track_axis = 'TRACK_NEGATIVE_Z'
    c.up_axis = 'UP_Y'

    def shot(path, loc, lens, w, h, at=(0, 0, 1.02)):
        aim.location = at
        cam.location = loc
        cam.data.lens = lens
        sc.render.resolution_x, sc.render.resolution_y = w, h
        sc.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        return path

    return shot
