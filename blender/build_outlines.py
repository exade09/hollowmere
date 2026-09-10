"""Светящиеся контуры интерактивных объектов.

hull  — inverted hull: копия меша раздувается по нормалям и выворачивается,
        материал с backface culling -> виден только силуэт.
box   — силуэт строится по общему габариту группы (у двери иначе
        подсвечивалась бы каждая доска отдельно).
flat  — для плоских настенных объектов (карта): копия чуть больше, задвинута
        в стену за оригинал, светится по периметру.
"""
import bpy, bmesh, sys
from mathutils import Vector

argv = sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else []
THICK = float(argv[0]) if argv else 0.028
STRENGTH = float(argv[1]) if len(argv) > 1 else 1.6
TAG = argv[2] if len(argv) > 2 else "o"
RENDER = (len(argv) > 3 and argv[3] == "render")

CY = (0.36, 0.97, 0.92, 1.0)

SETS = {
    # крылья в оболочку не берём: они лежат поверх тела и их раздутая копия
    # даёт лишние линии прямо по корпусу птицы
    'raven':  (['RavenBody', 'RavenHead', 'RavenNeck', 'RavenBreast', 'RavenTail',
                'RavenBeakUpper', 'RavenBeakLower', 'RavenLeg', 'RavenFoot'], 'RavenBody', 'hull'),
    'chest':  (['ChestBody', 'ChestLid', 'ChestLidTrim'], None, 'hull'),
    'books':  (['ShelfBack', 'ShelfBoard', 'ShelfPost'], None, 'hull'),
    'map':    (['WallMap'], None, 'flat'),
    'astro':  (['AstroBase', 'AstroColumn', 'AstroCap', 'AstroStep', 'AstroRing', 'AstroSpindle'], None, 'hull'),
    'mirror': (['MirFrame'], None, 'hull'),
    'door':   (['DoorPlank'], 'DoorHinge', 'box'),
}


def make_mat(name, cull):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    em = nt.nodes.new('ShaderNodeEmission')
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    em.inputs['Color'].default_value = CY
    em.inputs['Strength'].default_value = STRENGTH
    nt.links.new(em.outputs[0], out.inputs['Surface'])
    mat.use_backface_culling = cull
    return mat


MAT_HULL = make_mat('OutlineGlow', True)
MAT_FLAT = make_mat('OutlineGlowFlat', False)

for o in [o for o in bpy.data.objects if o.name.startswith('HL_')]:
    bpy.data.objects.remove(o, do_unlink=True)


def dup_join(src, name):
    copies = []
    for o in src:
        c = o.copy()
        c.data = o.data.copy()
        for m in list(c.modifiers):
            c.modifiers.remove(m)
        bpy.context.collection.objects.link(c)
        c.parent = None
        c.matrix_world = o.matrix_world.copy()
        copies.append(c)
    bpy.ops.object.select_all(action='DESELECT')
    for c in copies:
        c.select_set(True)
    bpy.context.view_layer.objects.active = copies[0]
    if len(copies) > 1:
        bpy.ops.object.join()
    hl = bpy.context.view_layer.objects.active
    hl.name = name
    return hl


def no_influence(hl):
    hl.visible_shadow = False
    hl.visible_diffuse = False
    hl.visible_glossy = False
    hl.visible_volume_scatter = False


made = {}
for tag, (prefixes, follow, mode) in SETS.items():
    src = [o for o in bpy.data.objects
           if o.type == 'MESH' and any(o.name.startswith(p) for p in prefixes)]
    if not src:
        continue
    hl = dup_join(src, 'HL_' + tag)
    me = hl.data
    me.materials.clear()

    if mode == 'flat':
        me.materials.append(MAT_FLAT)
        d = hl.dimensions
        hl.scale = tuple(hl.scale[i] * (1.0 + 2.0 * THICK / d[i]) if d[i] > 1e-4 else hl.scale[i]
                         for i in range(3))
        p = hl.matrix_world.translation
        radial = Vector((p.x, p.y, 0.0)).normalized()
        hl.location = hl.location + radial * 0.012
    else:
        me.materials.append(MAT_HULL)
        bm = bmesh.new()
        if mode == 'box':
            R = src[0].matrix_world.to_quaternion().to_matrix().to_4x4()
            Ri = R.inverted()
            pts = [Ri @ (o.matrix_world @ v.co) for o in src for v in o.data.vertices]
            mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
            mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
            c = (mn + mx) / 2
            hl.matrix_world = R
            hl.location = (R @ c.to_4d().to_3d())
            me.clear_geometry()
            h = (mx - mn) / 2
            verts = [(sx * h.x, sy * h.y, sz * h.z)
                     for sx in (-1, 1) for sy in (-1, 1) for sz in (-1, 1)]
            faces = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1),
                     (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
            me.from_pydata(verts, [], faces)
            me.update()
        bm.from_mesh(me)
        bm.normal_update()
        for v in bm.verts:
            v.co += v.normal * THICK
        for f in bm.faces:
            f.normal_flip()
            f.material_index = 0
        bm.to_mesh(me)
        bm.free()
        me.update()

    no_influence(hl)
    if follow:
        p = bpy.data.objects.get(follow)
        if p:
            hl.parent = p
            hl.matrix_parent_inverse = p.matrix_world.inverted()
    made[tag] = (len(src), len(me.vertices), mode)

print("OUTLINES:", made)

if RENDER:
    sc = bpy.context.scene
    sc.frame_set(1)
    sc.render.filepath = r"C:\Users\Admin\Downloads\hollowmere\renders\_check\outline_%s.png" % TAG
    bpy.ops.render.render(write_still=True)
    print("OUTLINE RENDER DONE", TAG)
