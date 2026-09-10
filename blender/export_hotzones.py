"""Считает экранные прямоугольники интерактивных зон и печатает их в JSON.

Координаты берутся из настоящей геометрии через камеру сцены, поэтому хотзоны
на сайте совпадают с объектами на видео пиксель в пиксель, без подгонки руками.

    blender -b <scene>.blend --python export_hotzones.py -- <sanctum|undercroft>
"""
import bpy, json, sys
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
which = argv[0] if argv else 'sanctum'
WIDE = 'wide' in argv
sc = bpy.context.scene
cam = sc.camera
W, H = (2560, 1080) if WIDE else (1920, 1080)
# The render resolution has to be set before anything is projected, not just the
# sensor: world_to_camera_view derives the frame from camera.view_frame(scene),
# which reads the scene's render aspect — not the W/H below. Leaving the blend's
# own resolution in place made the wide pass project through an unchanged 16:9
# camera and then scale the result by 2560/1920, which put every rectangle a
# few hundred pixels off its object at the edges of the frame.
sc.render.resolution_x = W
sc.render.resolution_y = H
sc.render.pixel_aspect_x = 1.0
sc.render.pixel_aspect_y = 1.0
if WIDE:
    # match the 21:9 render exactly, or the rectangles land off their objects
    cam.data.sensor_fit = 'VERTICAL'
    cam.data.sensor_height = 36.0 * 9 / 16

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

print("HOTZONES " + which + ("-wide" if WIDE else "") + " " + json.dumps(out))
