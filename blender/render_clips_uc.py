"""Ролики крипты: цикл покоя + три сцены взаимодействия.

Зоны: тюремная камера слева, алтарь в центре, запертые ворота справа.
Персонаж дышит и моргает в каждой позе — та же механика, что в Санктуме.

    blender -b hollowmere_undercroft.blend --python render_clips_uc.py -- <outdir> [only] [test]
"""
import bpy, math, os, random, sys, time
import mathutils

argv = sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else []
OUT = argv[0] if argv else r"C:\Users\Admin\Downloads\hollowmere\renders\clips_uc"
ONLY = argv[1] if len(argv) > 1 else None
TEST = (len(argv) > 2 and argv[2] == 'test')

sc = bpy.context.scene
sc.render.fps = 24
sc.render.resolution_x = 1920
sc.render.resolution_y = 1080
sc.render.image_settings.file_format = 'PNG'
sc.eevee.taa_render_samples = 96

root = bpy.data.objects['Mascot']
CAM = mathutils.Vector((0.0, 3.95, 2.55))
HIP_YAW = {1: -13, -1: 10}
BREATH = 48


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
    steps = 4 * cycles
    return [(1 + round(N * k / steps),
             base + amp * math.sin(2 * math.pi * (k / steps + phase)))
            for k in range(steps + 1)]


def face_yaw(p, t):
    d = (mathutils.Vector((t[0], t[1])) - mathutils.Vector((p[0], p[1]))).normalized()
    return math.degrees(math.atan2(-d.x, d.y))


def place(pos, look_at, blend=0.6, tilt=0.0, z=0.05):
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
        bpy.data.objects['MascotHip%d' % s].rotation_euler = (math.radians(hx), 0,
                                                             math.radians(HIP_YAW[s]))


def relight():
    p = mathutils.Vector((root.location.x, root.location.y, 0.0))
    d = mathutils.Vector((CAM.x - p.x, CAM.y - p.y, 0)).normalized()
    perp = mathutils.Vector((-d.y, d.x, 0))
    k = bpy.data.objects['MascotKey']
    k.location = p + d * 2.0 + perp * 0.85 + mathutils.Vector((0, 0, 2.5))
    dv = (mathutils.Vector((p.x, p.y, 1.15)) - k.location).normalized()
    k.rotation_euler = dv.to_track_quat('-Z', 'Y').to_euler()
    bpy.data.objects['MascotRim'].location = p - d * 1.25 - perp * 0.65 + mathutils.Vector((0, 0, 1.7))


def wipe():
    sc.frame_set(1)
    for o in bpy.data.objects:
        o.animation_data_clear()
    for m in bpy.data.materials:
        if m.node_tree:
            m.node_tree.animation_data_clear()
    for l in bpy.data.lights:
        l.animation_data_clear()


def ambient(N, seed=11):
    """Жизнь крипты: огонь, свеча, лужа, цепь, пульсация контуров."""
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

    cl = bpy.data.objects.get('CandleLight')
    if cl:
        base = cl.data.energy
        seq = [(1, base)]
        f = 1
        while f < N:
            f += random.choice((7, 9, 11, 13))
            if f >= N:
                break
            seq.append((f, base * random.uniform(0.86, 1.12)))
        seq.append((N + 1, base))
        for fr, v in seq:
            cl.data.energy = v
            cl.data.keyframe_insert('energy', frame=fr)
        cl.data.energy = base
    fl = bpy.data.objects.get('CandleFlame')
    if fl:
        key_scale(fl, wave(N, 1.0, 0.09, max(2, N // 40)), 2)

    for nm, amp in (('PoolLight', 0.14), ('KeyPool', 0.12), ('AltarRune', 0.10)):
        ob = bpy.data.objects.get(nm)
        if ob:
            base = ob.data.energy
            for f, v in wave(N, base, base * amp, max(1, N // 90)):
                ob.data.energy = v
                ob.data.keyframe_insert('energy', frame=f)
            ob.data.energy = base

    cp = bpy.data.objects.get('ChainPivot')
    if cp:
        key_rot(cp, wave(N, 0.0, 1.1, 1), 0)
        key_rot(cp, wave(N, 0.0, 0.8, 1, 0.25), 1)

    for mn in ('OutlineGlow', 'OutlineGlowFlat'):
        m = bpy.data.materials.get(mn)
        if not m:
            continue
        em = [n for n in m.node_tree.nodes if n.bl_idname == 'ShaderNodeEmission'][0]
        for f, v in wave(N, 1.75, 0.20, max(1, N // 120)):
            em.inputs['Strength'].default_value = v
            em.inputs['Strength'].keyframe_insert('default_value', frame=f)


def breathe(N, z0, tilt0, blinks):
    cycles = max(1, N // BREATH)
    key_loc(root, wave(N, z0 + 0.0065, 0.0065, cycles, -0.25), 2)
    key_rot(root, wave(N, tilt0 + 0.55, 0.55, cycles, -0.25), 0)
    for t in blinks:
        fr = 1 + round(N * t)
        for i in range(4):
            r = bpy.data.objects.get('MascotEyeRing%d' % i)
            h = bpy.data.objects.get('MascotEyeHole%d' % i)
            if r:
                key_scale(r, [(1, 1.18), (fr - 3, 1.18), (fr, 0.14), (fr + 2, 0.14),
                              (fr + 6, 1.18), (N + 1, 1.18)], 1)
            if h:
                key_scale(h, [(1, 1.00), (fr - 3, 1.00), (fr, 0.11), (fr + 2, 0.11),
                              (fr + 6, 1.00), (N + 1, 1.00)], 1)


# ------------------------------------------------------------- состояния
def st_idle(N):
    z, yaw, tilt = place((0.35, -2.05), (CAM.x, CAM.y), blend=0.0)
    root.rotation_euler = (0, 0, math.radians(8))
    pose(head=(4, -7, -9), sh_p=(16, -24, -5), sh_m=(-9, 21, 4))
    relight()
    ambient(N)
    breathe(N, 0.05, 0.0, (0.34, 0.80))
    hp = bpy.data.objects['MascotHeadPivot']
    key_rot(hp, wave(N, 4.0, 1.3, 1), 0)
    key_rot(hp, wave(N, -7.0, 2.2, 1, 0.2), 1)
    key_rot(bpy.data.objects['MascotShoulder1'], wave(N, 14.5, 1.6, 1), 0)
    key_rot(bpy.data.objects['MascotShoulder-1'], wave(N, -7.6, 1.4, 1, 0.5), 0)
    key_rot(root, [(1, 8.0), (1 + N // 2, 8.9), (N + 1, 8.0)], 2)


def st_cage(N):
    # у решётки: рука на прутьях, взгляд внутрь темницы
    z, yaw, tilt = place((2.40, -4.95), (2.00, -6.20), blend=0.62)
    pose(head=(8, -12, -10), sh_p=(88, -18, 0), sh_m=(-10, 16, 4))
    relight()
    ambient(N)
    breathe(N, z, tilt, (0.45,))
    key_rot(bpy.data.objects['MascotShoulder1'], wave(N, 86.0, 4.0, 1), 0)
    hp = bpy.data.objects['MascotHeadPivot']
    key_rot(hp, wave(N, 8.0, 2.4, 1), 0)
    key_rot(hp, wave(N, -10.0, 5.0, 1, 0.25), 2)


def st_altar(N):
    # у алтаря: обе руки к свече, голова опущена
    z, yaw, tilt = place((-2.10, -3.20), (-1.00, -4.80), blend=0.72)
    pose(head=(-16, -4, -2), sh_p=(62, -14, 0), sh_m=(52, 16, 0))
    relight()
    ambient(N)
    breathe(N, z, tilt, (0.30, 0.76))
    key_rot(bpy.data.objects['MascotShoulder1'], wave(N, 60.0, 5.0, 1, -0.25), 0)
    key_rot(bpy.data.objects['MascotShoulder-1'], wave(N, 50.0, 4.5, 1, -0.25), 0)
    key_rot(bpy.data.objects['MascotHeadPivot'], wave(N, -16.0, 3.0, 1, -0.25), 0)
    # огонь отвечает на приближение руки
    cl = bpy.data.objects.get('CandleLight')
    if cl:
        cl.data.animation_data_clear()
        base = cl.data.energy
        for f, v in wave(N, base * 1.12, base * 0.16, 2):
            cl.data.energy = v
            cl.data.keyframe_insert('energy', frame=f)
        cl.data.energy = base


def st_gate(N):
    # у запертых ворот: толкает створку, смотрит на замок
    z, yaw, tilt = place((-4.05, -4.30), (-4.45, -5.95), blend=0.70)
    pose(head=(14, -8, -5), sh_p=(96, -14, 0), sh_m=(-8, 16, 4))
    relight()
    ambient(N)
    breathe(N, z, tilt, (0.52,))
    # толкнул, не поддалось, отпустил
    key_rot(bpy.data.objects['MascotShoulder1'],
            [(1, 96), (1 + N // 4, 101), (1 + N // 2, 97), (1 + 3 * N // 4, 100), (N + 1, 96)], 0)
    key_rot(root, wave(N, tilt + 1.4, 1.4, 1, -0.25), 0)
    key_rot(bpy.data.objects['MascotHeadPivot'], wave(N, 14.0, 3.5, 1, 0.25), 0)
    kg = bpy.data.objects.get('KeyGate')
    if kg:
        base = kg.data.energy
        for f, v in wave(N, base * 1.06, base * 0.10, 2):
            kg.data.energy = v
            kg.data.keyframe_insert('energy', frame=f)
        kg.data.energy = base


CLIPS = [('00_idle', st_idle, 240), ('01_cage', st_cage, 96),
         ('02_altar', st_altar, 96), ('03_gate', st_gate, 96)]

for name, fn, N in CLIPS:
    if ONLY and ONLY != name:
        continue
    t0 = time.time()
    wipe()
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
    print("UC CLIP DONE %s  %d frames  %.1f min" % (name, N, (time.time() - t0) / 60.0))

print("UC ALL CLIPS DONE")
