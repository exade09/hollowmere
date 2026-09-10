"""Рендер всех роликов сцены: базовый цикл покоя + 8 циклов наведения.

Каждый ролик — бесшовная петля. Комната живёт во всех: факелы дышат, звёзды
плывут, контуры пульсируют, ворон шевелится, астролябия качается. Персонаж
дышит и моргает в своей позе и делает небольшое движение по смыслу состояния.

Запуск:
    blender -b hollowmere_sanctum.blend --python render_clips.py -- <outdir> [only_name]
"""
import bpy, math, os, random, sys, time
import mathutils

argv = sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else []
OUT = argv[0] if argv else r"C:\Users\Admin\Downloads\hollowmere\renders\clips"
ONLY = argv[1] if len(argv) > 1 else None
TEST = (len(argv) > 2 and argv[2] == 'test')   # 3 контрольных кадра вместо всей петли

sc = bpy.context.scene
sc.render.fps = 24
sc.render.resolution_x = 1920
sc.render.resolution_y = 1080
sc.render.image_settings.file_format = 'PNG'
for o in bpy.data.objects:
    if o.type == 'LIGHT':
        o.data.shadow_maximum_resolution = max(o.data.shadow_maximum_resolution, 0.012)

root = bpy.data.objects['Mascot']
CAM = mathutils.Vector((0.0, 4.72, 1.72))
HIP_YAW = {1: -13, -1: 10}
BREATH = 48          # один вдох, кадров


# ---------------------------------------------------------------- утилиты
def key_loc(o, fv, i):
    for f, v in fv:
        o.location[i] = v
        o.keyframe_insert('location', index=i, frame=f)


def key_rot(o, fv, i):
    for f, v in fv:
        o.rotation_euler[i] = math.radians(v)
        o.keyframe_insert('rotation_euler', index=i, frame=f)


def key_scale(o, fv, i):
    for f, v in fv:
        o.scale[i] = v
        o.keyframe_insert('scale', index=i, frame=f)


def wave(N, base, amp, cycles=1, phase=0.0):
    """Ключи синусоиды: N кадров, ровно `cycles` периодов, f(N+1) == f(1)."""
    pts = []
    steps = 4 * cycles
    for k in range(steps + 1):
        f = 1 + round(N * k / steps)
        pts.append((f, base + amp * math.sin(2 * math.pi * (k / steps + phase))))
    return pts


def face_yaw(p, t):
    d = (mathutils.Vector((t[0], t[1])) - mathutils.Vector((p[0], p[1]))).normalized()
    return math.degrees(math.atan2(-d.x, d.y))


def place(pos, look_at, blend=0.55, tilt=0.0, z=0.05):
    yo = face_yaw(pos, look_at)
    yc = face_yaw(pos, (CAM.x, CAM.y))
    diff = (yo - yc + 180) % 360 - 180
    root.location = (pos[0], pos[1], z)
    root.rotation_euler = (math.radians(tilt), 0, math.radians(yc + diff * blend))
    return z, math.degrees(root.rotation_euler[2]), tilt


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


def wipe():
    sc.frame_set(1)
    for o in bpy.data.objects:
        o.animation_data_clear()
    for m in bpy.data.materials:
        if m.node_tree:
            m.node_tree.animation_data_clear()
    for l in bpy.data.lights:
        l.animation_data_clear()


# ---------------------------------------------------------- жизнь комнаты
def ambient(N, caw=False, seed=23):
    """Фон, одинаковый во всех роликах: огонь, небо, контуры, ворон, астролябия."""
    random.seed(seed)

    for L in [o for o in bpy.data.objects if o.name.startswith('TorchLight')]:
        base = L.data.energy
        seq = [(1, base)]
        f = 1
        while f < N:
            f += random.choice((30, 36, 42, 48))
            if f >= N:
                break
            seq.append((f, base * random.uniform(0.90, 1.09)))
        seq.append((N + 1, base))
        for fr, v in seq:
            L.data.energy = v
            L.data.keyframe_insert('energy', frame=fr)
        L.data.energy = base

    def drift(matname, amp):
        m = bpy.data.materials.get(matname)
        if not m:
            return
        for n in m.node_tree.nodes:
            if n.bl_idname == 'ShaderNodeMapping':
                loc = n.inputs['Location']
                for f, v in [(1, 0.0), (1 + N // 2, amp), (N + 1, 0.0)]:
                    loc.default_value = (v, v * 0.6, 0.0)
                    loc.keyframe_insert('default_value', frame=f)
    drift('WindowSky', 0.025 * N / 240.0)
    drift('NightSky', 0.28 * N / 240.0)

    mo = bpy.data.objects.get('Moon')
    if mo:
        bx, by, bz = mo.location
        for f, dx, dz in [(1, 0, 0), (1 + N // 2, 0.10, 0.06), (N + 1, 0, 0)]:
            mo.location[0] = bx + dx
            mo.keyframe_insert('location', index=0, frame=f)
            mo.location[2] = bz + dz
            mo.keyframe_insert('location', index=2, frame=f)

    for mn in ('OutlineGlow', 'OutlineGlowFlat'):
        m = bpy.data.materials.get(mn)
        if not m:
            continue
        em = [n for n in m.node_tree.nodes if n.bl_idname == 'ShaderNodeEmission'][0]
        for f, v in wave(N, 1.75, 0.20, cycles=max(1, N // 120)):
            em.inputs['Strength'].default_value = v
            em.inputs['Strength'].keyframe_insert('default_value', frame=f)

    # астролябия: кольца еле заметно качаются
    for i, (ring, amp) in enumerate((('AstroRing1', 3.5), ('AstroRing2', -2.8), ('AstroRing3', 2.2))):
        o = bpy.data.objects.get(ring)
        if o:
            key_rot(o, wave(N, math.degrees(o.rotation_euler[2]), amp, 1, i * 0.17), 2)

    rb = bpy.data.objects['RavenBody']
    key_rot(rb, wave(N, 0.0, 6.0, 1), 2)                  # поворот головы туда-обратно
    if caw:
        a, b, c, d = [1 + round(N * t) for t in (0.40, 0.47, 0.53, 0.63)]
        key_rot(rb, [(1, -8), (a, -8), (b, -19), (c, -4), (d, -8), (N + 1, -8)], 1)
        bl = bpy.data.objects.get('RavenBeakLower')
        if bl:
            key_rot(bl, [(1, -6), (a, -6), (b, -28), (c, -26), (d, -6), (N + 1, -6)], 1)
    else:
        key_rot(rb, wave(N, -8.0, 1.6, 1, 0.3), 1)


def breathe(N, z0, tilt0, blinks):
    """Дыхание корпуса + моргание. z0/tilt0 — база позы состояния."""
    cycles = max(1, N // BREATH)
    key_loc(root, wave(N, z0 + 0.0065, 0.0065, cycles, -0.25), 2)
    key_rot(root, wave(N, tilt0 + 0.55, 0.55, cycles, -0.25), 0)
    for t in blinks:
        fr = 1 + round(N * t)
        for i in range(4):
            r = bpy.data.objects.get('MascotEyeRing%d' % i)
            h = bpy.data.objects.get('MascotEyeHole%d' % i)
            if r:
                key_scale(r, [(1, 1.18), (fr - 3, 1.18), (fr, 0.14), (fr + 2, 0.14), (fr + 6, 1.18), (N + 1, 1.18)], 1)
            if h:
                key_scale(h, [(1, 1.00), (fr - 3, 1.00), (fr, 0.11), (fr + 2, 0.11), (fr + 6, 1.00), (N + 1, 1.00)], 1)


# ------------------------------------------------------------- состояния
def st_idle(N):
    z, yaw, tilt = place((0.10, -0.34), (CAM.x, CAM.y), blend=0.0)
    root.rotation_euler = (0, 0, math.radians(13))
    pose(head=(4, -7, -9), sh_p=(16, -24, -5), sh_m=(-9, 21, 4))
    relight()
    ambient(N, caw=True)
    breathe(N, 0.05, 0.0, (0.36, 0.82))
    hp = bpy.data.objects['MascotHeadPivot']
    key_rot(hp, wave(N, 4.0, 1.2, 1), 0)
    key_rot(hp, wave(N, -7.0, 2.0, 1, 0.2), 1)
    key_rot(bpy.data.objects['MascotShoulder1'], wave(N, 14.5, 1.5, 1), 0)
    key_rot(bpy.data.objects['MascotShoulder-1'], wave(N, -7.6, 1.4, 1, 0.5), 0)
    key_rot(root, [(1, 13.0), (1 + N // 2, 13.9), (N + 1, 13.0)], 2)


def st_raven(N):
    z, yaw, tilt = place((3.62, -0.10), (4.66, 0.16), blend=0.60)
    pose(head=(26, -10, -6), sh_p=(152, -16, 0), sh_m=(-10, 18, 4))
    relight()
    ambient(N, caw=False)
    breathe(N, z, tilt, (0.55,))
    # гладит: рука ходит вверх-вниз, ворон подставляет голову
    key_rot(bpy.data.objects['MascotShoulder1'], wave(N, 149.0, 5.0, 2), 0)
    key_rot(bpy.data.objects['MascotHeadPivot'], wave(N, 26.0, 2.2, 2), 0)
    rb = bpy.data.objects['RavenBody']
    rb.animation_data_clear()
    key_rot(rb, wave(N, -11.0, 3.5, 2, 0.5), 1)
    key_rot(rb, wave(N, 0.0, 4.0, 1), 2)


def st_chest(N):
    z, yaw, tilt = place((1.78, -2.28), (2.55, -2.05), blend=0.62, tilt=16, z=-0.28)
    pose(head=(-22, -6, -4), sh_p=(72, -14, 0), sh_m=(-16, 18, 4), hip_p=-62, hip_m=-58)
    relight()
    ambient(N, caw=False)
    breathe(N, z, tilt, (0.30, 0.78))
    key_rot(bpy.data.objects['MascotHeadPivot'], wave(N, -22.0, 3.0, 1), 0)
    key_rot(bpy.data.objects['MascotShoulder1'], wave(N, 70.0, 4.5, 1), 0)
    g = bpy.data.objects.get('ChestGlowL')
    if g:
        base = g.data.energy
        for f, v in wave(N, base * 1.05, base * 0.12, 2):
            g.data.energy = v
            g.data.keyframe_insert('energy', frame=f)
        g.data.energy = base


def st_books(N):
    z, yaw, tilt = place((2.30, -1.62), (3.60, -2.55), blend=0.58, z=0.16)
    pose(head=(14, -8, -6), sh_p=(118, -24, 0), sh_m=(-6, 14, 4), hip_p=84, hip_m=79)
    relight()
    ambient(N, caw=False)
    breathe(N, z, tilt, (0.45,))
    # тянется за книгой: рука вытягивается и возвращается
    key_rot(bpy.data.objects['MascotShoulder1'], wave(N, 122.0, 6.0, 1, -0.25), 0)
    key_rot(bpy.data.objects['MascotHeadPivot'], wave(N, 15.0, 2.6, 1, -0.25), 0)
    key_rot(bpy.data.objects['MascotHeadPivot'], wave(N, -8.0, 2.0, 1), 1)


def st_map(N):
    z, yaw, tilt = place((0.95, -3.70), (1.545, -4.755), blend=1.0)
    pose(head=(24, 0, 0), sh_p=(12, -16, 0), sh_m=(-10, 15, 0))
    relight()
    ambient(N, caw=False)
    breathe(N, z, tilt, (0.62,))
    # разглядывает карту: голова водит вдоль неё
    hp = bpy.data.objects['MascotHeadPivot']
    key_rot(hp, wave(N, 24.0, 2.0, 1, 0.25), 0)
    key_rot(hp, wave(N, 0.0, 7.0, 1), 2)
    key_rot(root, wave(N, yaw, 1.2, 1, 0.5), 2)


def st_astro(N):
    z, yaw, tilt = place((0.05, -1.92), (-0.70, -2.60), blend=0.62)
    pose(head=(30, -8, -6), sh_p=(132, -18, 0), sh_m=(-8, 15, 4))
    relight()
    ambient(N, caw=False)
    breathe(N, z, tilt, (0.40,))
    key_rot(bpy.data.objects['MascotShoulder1'], wave(N, 131.0, 2.6, 1), 0)
    key_rot(bpy.data.objects['MascotHeadPivot'], wave(N, 30.0, 2.0, 1), 0)
    g = bpy.data.objects.get('AstroGlow')
    if g:
        base = g.data.energy
        for f, v in wave(N, base * 1.1, base * 0.22, 2):
            g.data.energy = v
            g.data.keyframe_insert('energy', frame=f)
        g.data.energy = base


def st_mirror(N):
    z, yaw, tilt = place((-2.72, -2.00), (-3.60, -2.62), blend=0.66)
    pose(head=(6, -16, -12), sh_p=(24, -56, 0), sh_m=(18, 52, 0))
    relight()
    ambient(N, caw=False)
    breathe(N, z, tilt, (0.28, 0.74))
    # позирует: наклон головы и смена опоры
    hp = bpy.data.objects['MascotHeadPivot']
    key_rot(hp, wave(N, -16.0, 4.0, 1), 1)
    key_rot(hp, wave(N, -12.0, 3.0, 1, 0.25), 2)
    key_rot(bpy.data.objects['MascotShoulder-1'], wave(N, 20.0, 4.0, 1, 0.5), 0)
    key_rot(root, wave(N, yaw, 1.6, 1), 2)


def st_door(N):
    bpy.data.objects['DoorBackLight'].data.energy = 170
    z, yaw, tilt = place((-3.62, -1.10), (-4.75, -0.35), blend=0.70)
    pose(head=(4, -8, -5), sh_p=(98, -12, 0), sh_m=(-8, 16, 4))
    relight()
    ambient(N, caw=False)
    breathe(N, z, tilt, (0.52,))
    # дверь приоткрывается чуть больше и обратно, свет из щели дышит
    dh = bpy.data.objects['DoorHinge']
    key_rot(dh, wave(N, 13.2, 1.6, 1, -0.25), 2)
    key_rot(bpy.data.objects['MascotShoulder1'], wave(N, 99.5, 2.2, 1, -0.25), 0)
    L = bpy.data.objects['DoorBackLight'].data
    for f, v in wave(N, 178.0, 26.0, 2):
        L.energy = v
        L.keyframe_insert('energy', frame=f)


CLIPS = [
    ('00_idle',      st_idle,   240),
    ('01_raven',     st_raven,   96),
    ('02_chest',     st_chest,   96),
    ('03_bookshelf', st_books,   96),
    ('04_map',       st_map,     96),
    ('05_astrolabe', st_astro,   96),
    ('06_mirror',    st_mirror,  96),
    ('07_door',      st_door,    96),
]

for name, fn, N in CLIPS:
    if ONLY and ONLY != name:
        continue
    t0 = time.time()
    wipe()
    bpy.data.objects['DoorHinge'].rotation_euler = (0, 0, 0)
    bpy.data.objects['DoorBackLight'].data.energy = 0
    fn(N)
    d = os.path.join(OUT, name)
    os.makedirs(d, exist_ok=True)
    if TEST:
        for fr in (1, 1 + N // 4, 1 + N // 2):
            sc.frame_set(fr)
            sc.render.filepath = os.path.join(d, 't_%04d' % fr)
            bpy.ops.render.render(write_still=True)
    else:
        sc.frame_start = 1
        sc.frame_end = N
        sc.render.filepath = os.path.join(d, 'f_')
        bpy.ops.render.render(animation=True)
    print("CLIP DONE %s  %d frames  %.1f min" % (name, N, (time.time() - t0) / 60.0))

print("ALL CLIPS DONE")
