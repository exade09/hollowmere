import bpy, math, os, mathutils

sc = bpy.context.scene
OUT = r"C:\Users\Admin\Downloads\hollowmere\renders\states"
os.makedirs(OUT, exist_ok=True)
sc.render.resolution_x = 1280
sc.render.resolution_y = 720
sc.render.image_settings.file_format = 'PNG'

root = bpy.data.objects['Mascot']
CAM = mathutils.Vector((0.0, 4.72, 1.72))
HIP_YAW = {1: -13, -1: 10}

sc.frame_set(1)
for o in bpy.data.objects:
    o.animation_data_clear()
for m in bpy.data.materials:
    if m.node_tree:
        m.node_tree.animation_data_clear()
for l in bpy.data.lights:
    l.animation_data_clear()


def face_yaw(p, t):
    d = (mathutils.Vector((t[0], t[1])) - mathutils.Vector((p[0], p[1]))).normalized()
    return math.degrees(math.atan2(-d.x, d.y))


def place(pos, look_at, blend=0.55, tilt=0.0, z=0.05):
    yo = face_yaw(pos, look_at)
    yc = face_yaw(pos, (CAM.x, CAM.y))
    diff = (yo - yc + 180) % 360 - 180
    root.location = (pos[0], pos[1], z)
    root.rotation_euler = (math.radians(tilt), 0, math.radians(yc + diff * blend))


def pose(head, sh_p, sh_m, hip_p=0.0, hip_m=0.0):
    bpy.data.objects['MascotHeadPivot'].rotation_euler = tuple(math.radians(a) for a in head)
    bpy.data.objects['MascotShoulder1'].rotation_euler = tuple(math.radians(a) for a in sh_p)
    bpy.data.objects['MascotShoulder-1'].rotation_euler = tuple(math.radians(a) for a in sh_m)
    for s, hx in ((1, hip_p), (-1, hip_m)):
        bpy.data.objects['MascotHip%d' % s].rotation_euler = (math.radians(hx), 0, math.radians(HIP_YAW[s]))


def relight():
    p = mathutils.Vector((root.location.x, root.location.y, 0.0))
    d = mathutils.Vector((CAM.x - p.x, CAM.y - p.y, 0)).normalized()
    perp = mathutils.Vector((-d.y, d.x, 0))
    k = bpy.data.objects['MascotKey']
    k.location = p + d * 2.1 + perp * 0.9 + mathutils.Vector((0, 0, 2.5))
    dv = (mathutils.Vector((p.x, p.y, 1.15)) - k.location).normalized()
    k.rotation_euler = dv.to_track_quat('-Z', 'Y').to_euler()
    bpy.data.objects['MascotRim'].location = p - d * 1.3 - perp * 0.7 + mathutils.Vector((0, 0, 1.7))


def shoot(name):
    relight()
    sc.render.filepath = os.path.join(OUT, name + '.png')
    bpy.ops.render.render(write_still=True)


bpy.data.objects['DoorHinge'].rotation_euler = (0, 0, 0)
bpy.data.objects['DoorBackLight'].data.energy = 0

# 00 idle
place((0.10, -0.34), (CAM.x, CAM.y), blend=0.0)
root.rotation_euler = (0, 0, math.radians(13))
pose(head=(4, -7, -9), sh_p=(16, -24, -5), sh_m=(-9, 21, 4))
shoot('00_idle')

# 01 raven
place((3.62, -0.10), (4.66, 0.16), blend=0.60)
pose(head=(26, -10, -6), sh_p=(152, -16, 0), sh_m=(-10, 18, 4))
shoot('01_raven')

# 02 chest
place((1.78, -2.28), (2.55, -2.05), blend=0.62, tilt=16, z=-0.28)
pose(head=(-22, -6, -4), sh_p=(72, -14, 0), sh_m=(-16, 18, 4), hip_p=-62, hip_m=-58)
shoot('02_chest')

# 03 bookshelf
place((2.30, -1.62), (3.60, -2.55), blend=0.58, z=0.16)
pose(head=(14, -8, -6), sh_p=(118, -24, 0), sh_m=(-6, 14, 4), hip_p=84, hip_m=79)
shoot('03_bookshelf')

# 04 map
place((0.95, -3.70), (1.545, -4.755), blend=1.0)
pose(head=(24, 0, 0), sh_p=(12, -16, 0), sh_m=(-10, 15, 0))
shoot('04_map')

# 05 astrolabe / sphere
place((0.05, -1.92), (-0.70, -2.60), blend=0.62)
pose(head=(30, -8, -6), sh_p=(132, -18, 0), sh_m=(-8, 15, 4))
shoot('05_astrolabe')

# 06 mirror
place((-2.72, -2.00), (-3.60, -2.62), blend=0.66)
pose(head=(6, -16, -12), sh_p=(24, -56, 0), sh_m=(18, 52, 0))
shoot('06_mirror')

# 07 door
bpy.data.objects['DoorHinge'].rotation_euler = (0, 0, math.radians(12))
bpy.data.objects['DoorBackLight'].data.energy = 170
place((-3.62, -1.10), (-4.75, -0.35), blend=0.70)
pose(head=(4, -8, -5), sh_p=(98, -12, 0), sh_m=(-8, 16, 4))
shoot('07_door')
bpy.data.objects['DoorHinge'].rotation_euler = (0, 0, 0)
bpy.data.objects['DoorBackLight'].data.energy = 0

print("STATES DONE")
