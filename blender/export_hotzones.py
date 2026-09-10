"""Считает экранные прямоугольники интерактивных зон и печатает их в JSON.

Координаты берутся из настоящей геометрии через камеру сцены, поэтому хотзоны
на сайте совпадают с объектами на видео пиксель в пиксель, без подгонки руками.

    blender -b <scene>.blend --python export_hotzones.py -- <sanctum|undercroft>
"""
import bpy, json, sys
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

which = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else 'sanctum'
sc = bpy.context.scene
cam = sc.camera
W, H = 1920, 1080

GROUPS = {
    'sanctum': [
        ('raven',  ['RavenBody', 'RavenHead', 'RavenNeck', 'RavenBreast', 'RavenTail',
                    'RavenWing', 'RavenBeak', 'RavenLeg', 'RavenFoot']),
        ('chest',  ['ChestBody', 'ChestLid', 'ChestLidTrim', 'ChestBand']),
        ('books',  ['ShelfBack', 'ShelfBoard', 'ShelfPost', 'Book_']),
        ('map',    ['WallMap']),
        ('astro',  ['AstroBase', 'AstroColumn', 'AstroCap', 'AstroStep', 'AstroRing',
                    'AstroSpindle', 'AstroGem']),
        ('mirror', ['MirFrame', 'MirrorGlassPane']),
        ('door',   ['DoorPlank', 'DoorTriangle']),
        ('sigil',  ['RuneArc', 'RuneCore', 'RuneInset', 'RuneRay']),
    ],
    'undercroft': [
        ('cage',   ['CageMark']),
        ('gate',   ['GateMark']),
        ('altar',  ['AltarStep', 'AltarSlab', 'AltarLip', 'AltarLeg']),
        ('stairs', ['UpDoorPlank', 'UpDoorBand', 'UpDoorSill']),
    ],
}

out = {}
for name, prefixes in GROUPS[which]:
    objs = [o for o in bpy.data.objects
            if o.type == 'MESH' and any(o.name.startswith(p) for p in prefixes)]
    if not objs:
        print("skip", name)
        continue
    xs, ys = [], []
    for o in objs:
        for corner in o.bound_box:
            v = world_to_camera_view(sc, cam, o.matrix_world @ Vector(corner))
            if v.z <= 0:                      # позади камеры — не учитываем
                continue
            xs.append(v.x * W)
            ys.append((1 - v.y) * H)
    if not xs:
        continue
    x0, x1 = max(0, min(xs)), min(W, max(xs))
    y0, y1 = max(0, min(ys)), min(H, max(ys))
    out[name] = {'x': round(x0), 'y': round(y0), 'w': round(x1 - x0), 'h': round(y1 - y0)}

print("HOTZONES " + which + " " + json.dumps(out))
