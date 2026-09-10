"""THE UNDERCROFT — вторая локация HOLLOWMERE, за дверью Санктума.

Крипта-темница: свод на нервюрах, лестница наверх к закрытой двери Санктума,
три камеры с решётками, алтарь со свечой в стрельчатой нише, висящая цепь
с кандалами, запертые железные ворота, светящиеся грибы, лужа и кости.

Материалы берутся прямо из hollowmere_sanctum.blend, поэтому камень, железо,
золото и дерево здесь ровно те же, что в первой локации.

Запуск:
    blender -b --factory-startup --python build_undercroft.py
"""
import bpy, bmesh, math, random
from mathutils import Vector, Matrix

random.seed(7)
SANCTUM = r"C:\Users\Admin\Downloads\hollowmere\scene\hollowmere_sanctum.blend"
OUTFILE = r"C:\Users\Admin\Downloads\hollowmere\scene\hollowmere_undercroft.blend"

# ------------------------------------------------------------------ габариты
XL, XR = -6.5, 6.5          # боковые стены
YB, YF = -6.0, 5.5          # задняя стена / передний край
SPRING = 3.30               # пята свода
APEX = 5.40                 # замок свода
BLK = (1.05, 0.40, 0.55)    # камень кладки, как в Санктуме

# ---------------------------------------------------------------- очистка
for c in (bpy.data.objects, bpy.data.meshes, bpy.data.materials, bpy.data.lights,
          bpy.data.cameras, bpy.data.worlds):
    for x in list(c):
        c.remove(x, do_unlink=True)

# ------------------------------------------------------------- материалы
WANT = ['Stone1', 'Stone2', 'Stone3', 'Stone4', 'Stone5', 'DarkStone', 'DomeStone',
        'Iron', 'Gold', 'Wood', 'WoodLight', 'Ember', 'Teal', 'Maroon',
        'CrystalMagic', 'Parchment', 'Atmos']
# В Санктуме часть материалов заменена на копии с контуром (*_gl_*), а базовые
# при сохранении вычистились как неиспользуемые. Поэтому берём и те, и другие,
# а у копий гасим свечение — в крипте контуры не нужны.
with bpy.data.libraries.load(SANCTUM, link=False) as (src, dst):
    dst.materials = [m for m in src.materials
                     if m in WANT or any(m.startswith(w + '_gl_') for w in WANT)]
M = {m.name: m for m in bpy.data.materials}


def degl(mat, name):
    """Копия материала без френелевского свечения, под базовым именем."""
    m = mat.copy()
    m.name = name
    nt = m.node_tree
    for n in list(nt.nodes):
        if n.bl_idname in ('ShaderNodeLayerWeight',) or n.name == 'GLOW_K':
            for nn in list(nt.nodes):
                pass
    b = next((n for n in nt.nodes if 'Emission Strength' in n.inputs), None)
    if b:
        inp = b.inputs['Emission Strength']
        for l in list(inp.links):
            nt.links.remove(l)
        inp.default_value = 0.0
    for n in list(nt.nodes):
        if n.bl_idname in ('ShaderNodeLayerWeight', 'ShaderNodeMath'):
            nt.nodes.remove(n)
    return m


for w in WANT:
    if w in M:
        continue
    sub = next((m for m in bpy.data.materials if m.name.startswith(w + '_gl_')), None)
    if sub:
        M[w] = degl(sub, w)
for m in list(bpy.data.materials):
    if '_gl_' in m.name:
        M.pop(m.name, None)
        bpy.data.materials.remove(m)
print("appended:", sorted(M))


def new_mat(name, base, rough=0.75, emit=None, emit_str=0.0, alpha=1.0, metal=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*base, 1.0)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if emit:
        b.inputs['Emission Color'].default_value = (*emit, 1.0)
        b.inputs['Emission Strength'].default_value = emit_str
    if alpha < 1.0:
        b.inputs['Alpha'].default_value = alpha
        m.blend_method = 'BLEND'
    M[name] = m
    return m


new_mat('Shroom',   (0.05, 0.30, 0.29), 0.55, (0.14, 0.72, 0.66), 0.55)
new_mat('ShroomStem', (0.34, 0.38, 0.36), 0.9)
new_mat('PoolWater', (0.02, 0.06, 0.07), 0.08, (0.09, 0.46, 0.43), 0.09)
new_mat('RuneTeal', (0.10, 0.28, 0.28), 0.5, (0.24, 0.84, 0.78), 0.34)
new_mat('CrackTeal', (0.08, 0.24, 0.24), 0.5, (0.24, 0.84, 0.78), 0.85)
new_mat('Bone',     (0.80, 0.78, 0.70), 0.8)
new_mat('Straw',    (0.62, 0.55, 0.32), 0.95)
new_mat('Cloth',    (0.40, 0.10, 0.13), 0.9)
new_mat('Wax',      (0.92, 0.90, 0.82), 0.6)
new_mat('BloodStain', (0.24, 0.05, 0.07), 0.95)
new_mat('Void',     (0.02, 0.02, 0.03), 1.0)

STONES = [M['Stone1'], M['Stone2'], M['Stone3'], M['Stone4'], M['Stone5']]

# ------------------------------------------------------------- примитивы
COLL = bpy.context.collection


def put(me, name, mat):
    o = bpy.data.objects.new(name, me)
    COLL.objects.link(o)
    if mat:
        me.materials.append(mat)
    return o


def box(name, center, size, rot=(0, 0, 0), mat=None):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    bm.to_mesh(me)
    bm.free()
    o = put(me, name, mat)
    o.location = center
    o.rotation_euler = tuple(math.radians(a) for a in rot)
    return o


def cyl(name, center, r, h, seg=10, rot=(0, 0, 0), mat=None):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg,
                          radius1=r, radius2=r, depth=h)
    bm.to_mesh(me)
    bm.free()
    o = put(me, name, mat)
    o.location = center
    o.rotation_euler = tuple(math.radians(a) for a in rot)
    return o


def cone(name, center, r, h, seg=8, rot=(0, 0, 0), mat=None):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg,
                          radius1=r, radius2=r * 0.06, depth=h)
    bm.to_mesh(me)
    bm.free()
    o = put(me, name, mat)
    o.location = center
    o.rotation_euler = tuple(math.radians(a) for a in rot)
    return o


def ring(name, center, R, r, maj=10, mnr=6, rot=(0, 0, 0), mat=None):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    for i in range(maj):
        a = 2 * math.pi * i / maj
        c = Vector((math.cos(a) * R, math.sin(a) * R, 0))
        n = Vector((math.cos(a), math.sin(a), 0))
        for j in range(mnr):
            b = 2 * math.pi * j / mnr
            bm.verts.new(c + n * (math.cos(b) * r) + Vector((0, 0, math.sin(b) * r)))
    bm.verts.ensure_lookup_table()
    for i in range(maj):
        for j in range(mnr):
            a0 = i * mnr + j
            a1 = i * mnr + (j + 1) % mnr
            b0 = ((i + 1) % maj) * mnr + j
            b1 = ((i + 1) % maj) * mnr + (j + 1) % mnr
            bm.faces.new((bm.verts[a0], bm.verts[a1], bm.verts[b1], bm.verts[b0]))
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    o = put(me, name, mat)
    o.location = center
    o.rotation_euler = tuple(math.radians(a) for a in rot)
    return o


def prism(name, pts, z0, z1, mat=None):
    """Многоугольник в плане, выдавленный по Z."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    low = [bm.verts.new((p[0], p[1], z0)) for p in pts]
    high = [bm.verts.new((p[0], p[1], z1)) for p in pts]
    bm.faces.new(low[::-1])
    bm.faces.new(high)
    n = len(pts)
    for i in range(n):
        bm.faces.new((low[i], low[(i + 1) % n], high[(i + 1) % n], high[i]))
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    return put(me, name, mat)


def rough(o, amt=0.012):
    """Лёгкая неровность вершин — камень не должен быть идеальным."""
    for v in o.data.vertices:
        v.co += Vector([random.uniform(-amt, amt) for _ in range(3)])


def pointed(t, half_w, spring_z, apex_z):
    """Профиль стрельчатой арки: t 0..1 слева направо -> (x, z)."""
    x = (t * 2 - 1) * half_w
    k = 1.0 - abs(t * 2 - 1)
    z = spring_z + (apex_z - spring_z) * math.sin(k * math.pi / 2) ** 0.78
    return x, z


# =============================================================== ПОЛ
# Плиты строятся как ячейки Вороного по разбросанным точкам: соседние ячейки
# делят общее ребро, поэтому щелей нет — только тонкий шов от усадки внутрь,
# как на референсе.
FLOOR = []
POOL_C, POOL_R = (-2.50, -0.55), 1.55
SEED_STEP = 1.32


def clip_half(poly, a, b):
    """Оставляем часть многоугольника, которая ближе к точке a, чем к b."""
    n = b - a
    m = (a + b) * 0.5
    out = []
    N = len(poly)
    for i in range(N):
        p, q = poly[i], poly[(i + 1) % N]
        dp = (p - m).dot(n)
        dq = (q - m).dot(n)
        if dp <= 0:
            out.append(p)
        if (dp <= 0) != (dq <= 0):
            t = dp / (dp - dq)
            out.append(p + (q - p) * t)
    return out


seeds = []
for gy in range(-7, 8):
    for gx in range(-8, 9):
        sx = gx * SEED_STEP + random.uniform(-0.34, 0.34)
        sy = gy * SEED_STEP + random.uniform(-0.34, 0.34)
        if sx < XL - 1.6 or sx > XR + 1.6 or sy < YB - 1.6 or sy > YF + 1.6:
            continue
        seeds.append(Vector((sx, sy)))

fi = 0
for i, sd in enumerate(seeds):
    if sd.x < XL - 0.8 or sd.x > XR + 0.8 or sd.y < YB - 0.5 or sd.y > YF + 0.8:
        continue
    if math.hypot(sd.x - POOL_C[0], sd.y - POOL_C[1]) < POOL_R * 0.72:
        continue
    R = SEED_STEP * 2.4
    poly = [sd + Vector((-R, -R)), sd + Vector((R, -R)), sd + Vector((R, R)), sd + Vector((-R, R))]
    for j, other in enumerate(seeds):
        if j == i or (other - sd).length > R * 1.6:
            continue
        poly = clip_half(poly, sd, other)
        if len(poly) < 3:
            break
    if len(poly) < 3:
        continue
    c = sum(poly, Vector((0, 0))) / len(poly)
    shrink = 0.965                      # шов между плитами ~2 см
    pts = [(c + (v - c) * shrink).to_tuple() for v in poly]
    d = math.hypot(c.x - POOL_C[0], c.y - POOL_C[1])
    tilt = random.uniform(0, .045) if d < POOL_R * 1.5 else 0.0
    o = prism('Flag_%d' % fi, pts, -0.12, random.uniform(.02, .05) - tilt,
              random.choice(STONES))
    FLOOR.append(o)
    fi += 1

# лужа
pool_pts = []
for i in range(14):
    a = 2 * math.pi * i / 14
    k = POOL_R * random.uniform(.80, .98)
    pool_pts.append((POOL_C[0] + math.cos(a) * k * 1.15, POOL_C[1] + math.sin(a) * k * .88))
prism('PoolBed', pool_pts, -0.18, -0.07, M['DarkStone'])
prism('PoolWater', pool_pts, -0.16, 0.010, M['PoolWater'])
for i in range(8):                      # выломанные плиты по краю лужи
    a = 2 * math.pi * i / 8 + .3
    px = POOL_C[0] + math.cos(a) * POOL_R * 1.18
    py = POOL_C[1] + math.sin(a) * POOL_R * .95
    box('PoolShard%d' % i, (px, py, .04), (random.uniform(.4, .7), random.uniform(.35, .6), .08),
        (random.uniform(-14, 14), random.uniform(-14, 14), random.uniform(0, 90)),
        random.choice(STONES))

# кровь у алтаря
prism('BloodStain', [(0.35, -3.05), (1.15, -3.30), (1.62, -2.95), (1.30, -2.45),
                     (0.62, -2.40)], 0.055, 0.07, M['BloodStain'])


# =============================================================== КЛАДКА
def wall_run(name, x0, x1, y, z_top, normal_y, skips=(), z_from=0.0):
    """Стена вдоль X: ряды камней, пропуская проёмы skips=[(x0,x1,z0,z1),...]."""
    bw, bd, bh = BLK
    rows = int(math.ceil((z_top - z_from) / bh))
    i = 0
    for r in range(rows):
        z0 = z_from + r * bh
        z1 = min(z0 + bh, z_top)
        off = (bw / 2) if r % 2 else 0.0
        x = x0 - off
        while x < x1:
            w = min(bw, x1 - x)
            if w < 0.22:
                break
            cx = x + w / 2
            cz = (z0 + z1) / 2
            hit = any(cx > sx0 - w / 2 and cx < sx1 + w / 2 and cz > sz0 - bh / 2 and cz < sz1 + bh / 2
                      for sx0, sx1, sz0, sz1 in skips)
            if not hit:
                o = box('%s_%d' % (name, i), (cx, y + normal_y * bd / 2, cz),
                        (w - 0.035, bd, (z1 - z0) - 0.035), mat=random.choice(STONES))
                rough(o, 0.010)
                i += 1
            x += w
    return i


def wall_run_y(name, y0, y1, x, z_top, normal_x, skips=(), z_from=0.0):
    """Стена вдоль Y."""
    bw, bd, bh = BLK
    rows = int(math.ceil((z_top - z_from) / bh))
    i = 0
    for r in range(rows):
        z0 = z_from + r * bh
        z1 = min(z0 + bh, z_top)
        off = (bw / 2) if r % 2 else 0.0
        y = y0 - off
        while y < y1:
            w = min(bw, y1 - y)
            if w < 0.22:
                break
            cy = y + w / 2
            cz = (z0 + z1) / 2
            hit = any(cy > sy0 - w / 2 and cy < sy1 + w / 2 and cz > sz0 - bh / 2 and cz < sz1 + bh / 2
                      for sy0, sy1, sz0, sz1 in skips)
            if not hit:
                o = box('%s_%d' % (name, i), (x + normal_x * bd / 2, cy, cz),
                        (bd, w - 0.035, (z1 - z0) - 0.035), mat=random.choice(STONES))
                rough(o, 0.010)
                i += 1
            y += w
    return i


# проёмы задней стены: три камеры, ниша алтаря, железные ворота, дверь наверху
CAGE = (-3.98, -0.50)        # решётка от пилона до пилона, без перегородок
CAGE_TOP = 2.45              # пята арки над решёткой
CAGE_RISE = 0.80
DOOR_GAP = (-2.42, -1.47)    # единственный проём в решётке
CELL_TOP = CAGE_TOP + CAGE_RISE
NICHE = (0.02, 2.10)
NICHE_TOP = 2.75
GATE = (3.35, 5.45)
GATE_TOP = 3.05
UPDOOR = (-6.25, -4.75)
UPDOOR_Z = (3.00, 5.55)

skips_back = [(CAGE[0], CAGE[1], 0.0, CAGE_TOP + CAGE_RISE)]
skips_back.append((NICHE[0], NICHE[1], 0.55, NICHE_TOP))
skips_back.append((GATE[0], GATE[1], 0.0, GATE_TOP))
skips_back.append((UPDOOR[0], UPDOOR[1], UPDOOR_Z[0], UPDOOR_Z[1]))
wall_run('BackBlk', XL, XR, YB, SPRING + 1.9, +1, skips_back)

# боковые стены; в левой — проём под лестницу наверх
wall_run_y('LeftBlk', YB, YF, XL, SPRING + 1.0, +1)
wall_run_y('RightBlk', YB, YF, XR, SPRING + 1.0, -1)

# =============================================================== ПИЛОНЫ
PIERS = [-4.30, -0.18, 2.72, 5.75]
for i, px in enumerate(PIERS):
    box('Pier_%d' % i, (px, YB + 0.62, SPRING / 2), (0.86, 0.86, SPRING), mat=M['Stone2'])
    box('PierCap_%d' % i, (px, YB + 0.62, SPRING + 0.10), (1.04, 1.04, 0.20), mat=M['Stone1'])
    box('PierBase_%d' % i, (px, YB + 0.62, 0.11), (1.02, 1.02, 0.22), mat=M['Stone1'])

# =============================================================== СВОД
VSEG = 14
RIBS_Y = [YB + 0.35, -3.2, -0.6, 2.0, 4.6]


def vault_shell():
    me = bpy.data.meshes.new('Vault')
    bm = bmesh.new()
    ys = [YB, -3.6, -1.2, 1.2, 3.6, YF + 0.6]
    grid = []
    for y in ys:
        row = []
        for i in range(VSEG + 1):
            x, z = pointed(i / VSEG, XR + 0.35, SPRING, APEX)
            row.append(bm.verts.new((x, y, z)))
        grid.append(row)
    for r in range(len(ys) - 1):
        ymid = (ys[r] + ys[r + 1]) / 2
        for i in range(VSEG):
            xmid = (pointed(i / VSEG, XR + 0.35, SPRING, APEX)[0]
                    + pointed((i + 1) / VSEG, XR + 0.35, SPRING, APEX)[0]) / 2
            # над лестницей свода нет: там шахта наверх, из неё падает свет
            if xmid < -4.25 and ymid < -1.0:
                continue
            bm.faces.new((grid[r][i], grid[r][i + 1], grid[r + 1][i + 1], grid[r + 1][i]))
    bm.normal_update()
    bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    bm.to_mesh(me)
    bm.free()
    return put(me, 'Vault', M['DomeStone'])


vault_shell()

for k, ry in enumerate(RIBS_Y):
    for i in range(VSEG):
        x0, z0 = pointed(i / VSEG, XR + 0.30, SPRING, APEX)
        x1, z1 = pointed((i + 1) / VSEG, XR + 0.30, SPRING, APEX)
        mx, mz = (x0 + x1) / 2, (z0 + z1) / 2
        ln = math.hypot(x1 - x0, z1 - z0)
        ang = math.degrees(math.atan2(z1 - z0, x1 - x0))
        box('Rib%d_%d' % (k, i), (mx, ry, mz - 0.10), (ln + 0.02, 0.30, 0.24),
            (0, -ang, 0), M['Stone1'])

# балка под замком свода, на ней висит цепь
box('Beam', (0.6, -2.0, APEX - 0.42), (7.4, 0.34, 0.30), mat=M['Wood'])
box('BeamBrace0', (-2.9, -2.0, APEX - 0.62), (0.5, 0.30, 0.26), (0, 22, 0), M['Wood'])
box('BeamBrace1', (4.1, -2.0, APEX - 0.62), (0.5, 0.30, 0.26), (0, -22, 0), M['Wood'])


# =============================================================== АРКИ ПРОЁМОВ
def arch_over(name, x0, x1, y, top, rise=0.85, depth=0.5, n=9, mat=None):
    half = (x1 - x0) / 2
    cx = (x0 + x1) / 2
    for i in range(n):
        t0, t1 = i / n, (i + 1) / n
        ax0, az0 = pointed(t0, half + 0.10, top, top + rise)
        ax1, az1 = pointed(t1, half + 0.10, top, top + rise)
        mx, mz = (ax0 + ax1) / 2, (az0 + az1) / 2
        ln = math.hypot(ax1 - ax0, az1 - az0)
        ang = math.degrees(math.atan2(az1 - az0, ax1 - ax0))
        o = box('%s_%d' % (name, i), (cx + mx, y, mz), (ln + 0.03, depth, 0.34),
                (0, -ang, 0), mat or random.choice(STONES))
        rough(o, 0.008)


arch_over('CageArch', CAGE[0], CAGE[1], YB + 0.30, CAGE_TOP, CAGE_RISE, 0.62)
arch_over('NicheArch', NICHE[0], NICHE[1], YB + 0.30, NICHE_TOP, 0.95, 0.62)
arch_over('GateArch', GATE[0], GATE[1], YB + 0.34, GATE_TOP, 0.95, 0.70)
arch_over('UpDoorArch', UPDOOR[0], UPDOOR[1], YB + 0.30, UPDOOR_Z[1] - 0.55, 0.5, 0.55)

# =============================================================== ТЕМНИЦА
# За решёткой одно общее помещение: перегородок нет, решётка идёт от пилона
# до пилона и заполняет проём целиком, включая арку. Дверь одна.
CGX = (CAGE[0] + CAGE[1]) / 2
CGW = CAGE[1] - CAGE[0]
CG_HALF = CGW / 2 + 0.10
DEPTH = 3.35
RW = CGW + 1.10                                   # помещение шире проёма
box('CageFloor', (CGX, YB - DEPTH / 2 - 0.10, -0.02), (RW, DEPTH, 0.14), mat=M['Stone4'])
box('CageBack', (CGX, YB - DEPTH - 0.05, 2.20), (RW, 0.30, 4.40), mat=M['Stone3'])
for sgn in (-1, 1):
    box('CageSide%d' % sgn, (CGX + sgn * RW / 2, YB - DEPTH / 2, 2.20),
        (0.30, DEPTH, 4.40), mat=M['Stone2'])
box('CageCap', (CGX, YB - DEPTH / 2, 4.30), (RW, DEPTH, 0.30), mat=M['Void'])


def bar_top(x):
    """Высота решётки в точке x: идёт по кривой арки, а не обрывается на полпути."""
    t = (x - CAGE[0]) / CGW
    return pointed(min(max(t, 0.0), 1.0), CG_HALF, CAGE_TOP, CAGE_TOP + CAGE_RISE)[1]


# вертикальные прутья по всему пролёту, кроме дверного проёма
bx = CAGE[0] + 0.11
bi = 0
while bx < CAGE[1] - 0.05:
    if not (DOOR_GAP[0] - 0.05 < bx < DOOR_GAP[1] + 0.05):
        h = bar_top(bx) - 0.06
        cyl('CageBar%d' % bi, (bx, YB + 0.12, h / 2), 0.036, h, 6, mat=M['Iron'])
        bi += 1
    bx += 0.205
# косяки дверного проёма толще прутьев
for gx in DOOR_GAP:
    h = bar_top(gx)
    cyl('CageJamb%d' % int(gx * 100), (gx, YB + 0.12, h / 2), 0.055, h, 8, mat=M['Iron'])
box('CageLintel', ((DOOR_GAP[0] + DOOR_GAP[1]) / 2, YB + 0.12, bar_top(DOOR_GAP[0]) - 0.05),
    (DOOR_GAP[1] - DOOR_GAP[0] + 0.11, 0.09, 0.10), mat=M['Iron'])
# горизонтальные связи, разорванные дверным проёмом
for zr in (0.55, 1.25, 1.95, 2.42):
    for x0, x1 in ((CAGE[0] + 0.06, DOOR_GAP[0]), (DOOR_GAP[1], CAGE[1] - 0.06)):
        if zr > bar_top((x0 + x1) / 2) - 0.12:
            continue
        box('CageRail%d_%d' % (int(zr * 10), int(x0 * 10)), ((x0 + x1) / 2, YB + 0.12, zr),
            (x1 - x0, 0.055, 0.075), mat=M['Iron'])

# ---- единственная дверь: распахнутая золотая решётка ----
GW = DOOR_GAP[1] - DOOR_GAP[0] - 0.06
GH = CAGE_TOP - 0.28
hinge = bpy.data.objects.new('CageGateHinge', None)
COLL.objects.link(hinge)
hinge.location = (DOOR_GAP[1] - 0.03, YB + 0.16, 0)
hinge.rotation_euler = (0, 0, math.radians(-72))
parts = [box('GateFrameL', (-GW + 0.05, 0, GH / 2 + 0.10), (0.09, 0.09, GH), mat=M['Gold']),
         box('GateFrameR', (-0.05, 0, GH / 2 + 0.10), (0.09, 0.09, GH), mat=M['Gold']),
         box('GateFrameT', (-GW / 2, 0, GH + 0.10), (GW, 0.09, 0.09), mat=M['Gold']),
         box('GateFrameB', (-GW / 2, 0, 0.14), (GW, 0.09, 0.09), mat=M['Gold'])]
for k in range(4):
    parts.append(cyl('GateBar%d' % k, (-GW * (k + 1) / 5, 0, GH / 2 + 0.10), 0.03, GH - 0.1, 6,
                     mat=M['Gold']))
for zr in (0.85, 1.55):
    parts.append(box('GateRail%d' % int(zr * 10), (-GW / 2, 0, zr), (GW - 0.05, 0.05, 0.06),
                     mat=M['Gold']))
parts.append(ring('GateHandle', (-GW + 0.16, -0.09, 1.15), 0.09, 0.022, 10, 5, (90, 0, 0), M['Gold']))
for pt in parts:
    pt.parent = hinge
    pt.matrix_parent_inverse = Matrix.Identity(4)

# ---- наполнение темницы ----
for k in range(14):                                       # солома по всему полу
    box('Straw%d' % k, (CGX + random.uniform(-RW / 2 + .3, RW / 2 - .3),
                        YB - random.uniform(.3, DEPTH - .3), 0.07),
        (random.uniform(.35, .75), random.uniform(.06, .13), 0.03),
        (0, 0, random.uniform(0, 180)), M['Straw'])
box('CageBed', (CGX + RW / 2 - 0.95, YB - DEPTH + 0.75, 0.13), (1.35, 0.90, 0.20), (0, 0, 5),
    M['Straw'])
for k in range(5):                                        # цепь с кандалом на дальней стене
    ring('CageChain%d' % k, (CGX - RW / 2 + 0.42, YB - DEPTH + 0.30, 1.85 - k * 0.17),
         0.075, 0.022, 8, 5, (90, 0, 90 * (k % 2)), M['Iron'])
box('CageCuff', (CGX - RW / 2 + 0.42, YB - DEPTH + 0.30, 1.00), (0.16, 0.16, 0.06), mat=M['Iron'])
cyl('CagePail', (CGX + 0.30, YB - DEPTH + 0.55, 0.17), 0.19, 0.30, 10, mat=M['Wood'])
ring('CagePailHoop', (CGX + 0.30, YB - DEPTH + 0.55, 0.27), 0.20, 0.022, 10, 5, mat=M['Iron'])
sk = cyl('CageSkull', (CGX - 0.95, YB - DEPTH + 0.70, 0.16), 0.17, 0.26, 8, (0, 0, 34), M['Bone'])
sk.scale = (1.0, 0.86, 0.78)
box('CageSkullEye', (CGX - 0.89, YB - DEPTH + 0.57, 0.20), (0.06, 0.05, 0.06), (0, 0, 34), M['Void'])
for k, ba in enumerate((14, -42, 68, 105)):
    cyl('CageBone%d' % k, (CGX + random.uniform(-1.2, 1.2),
                           YB - random.uniform(.9, DEPTH - .4), 0.09),
        0.05, random.uniform(.45, .68), 6, (90, 0, ba), M['Bone'])
for k in range(6):                                        # обвалившиеся камни
    box('CageRubble%d' % k, (CGX + random.uniform(-RW / 2 + .4, RW / 2 - .4),
                             YB - random.uniform(.6, DEPTH - .4), random.uniform(.06, .18)),
        (random.uniform(.26, .5), random.uniform(.22, .42), random.uniform(.13, .26)),
        (random.uniform(-16, 16), random.uniform(-16, 16), random.uniform(0, 90)),
        random.choice(STONES))

# =============================================================== НИША И АЛТАРЬ
NCX = (NICHE[0] + NICHE[1]) / 2
box('NicheBack', (NCX, YB - 0.18, 1.6), (NICHE[1] - NICHE[0], 0.5, 2.4), mat=M['Stone4'])
# врезанный треугольник-знак
TS = 0.52
for k in range(3):
    a = math.radians(90 + k * 120)
    b = math.radians(90 + (k + 1) * 120)
    p0 = Vector((math.cos(a) * TS, math.sin(a) * TS))
    p1 = Vector((math.cos(b) * TS, math.sin(b) * TS))
    mid = (p0 + p1) / 2
    ln = (p1 - p0).length
    ang = math.degrees(math.atan2(p1.y - p0.y, p1.x - p0.x))
    box('Sigil%d' % k, (NCX + mid.x, YB + 0.06, 2.05 + mid.y), (ln, 0.07, 0.075),
        (0, -ang, 0), M['RuneTeal'])
box('SigilRing', (NCX, YB + 0.05, 2.05), (1.30, 0.05, 0.06), mat=M['Stone1'])

# ступени и плита алтаря
box('AltarStep0', (NCX, YB + 1.35, 0.11), (3.30, 1.90, 0.22), mat=M['Stone3'])
box('AltarStep1', (NCX, YB + 1.30, 0.32), (2.80, 1.65, 0.22), mat=M['Stone3'])
box('AltarLegL', (NCX - 1.00, YB + 1.28, 0.75), (0.34, 1.05, 0.66), mat=M['Stone2'])
box('AltarLegR', (NCX + 1.00, YB + 1.28, 0.75), (0.34, 1.05, 0.66), mat=M['Stone2'])
box('AltarSlab', (NCX, YB + 1.28, 1.18), (2.55, 1.25, 0.22), mat=M['Stone1'])
box('AltarLip', (NCX, YB + 1.28, 1.30), (2.72, 1.40, 0.09), mat=M['Stone1'])
# светящаяся трещина по фасаду
for k in range(5):
    box('AltarCrack%d' % k, (NCX - 0.9 + k * 0.45, YB + 0.66, 0.72 + (k % 2) * 0.10),
        (random.uniform(.30, .46), 0.035, 0.035), (0, random.uniform(-12, 12), 0), M['CrackTeal'])
# ткань, свисающая с правого края
box('ClothTop', (NCX + 0.75, YB + 1.28, 1.31), (0.75, 1.15, 0.05), mat=M['Cloth'])
box('ClothFall', (NCX + 1.05, YB + 1.05, 0.86), (0.34, 0.55, 0.90), (0, -6, 0), M['Cloth'])
box('ClothTail', (NCX + 1.10, YB + 0.95, 0.36), (0.26, 0.36, 0.42), (0, -12, 0), M['Cloth'])
# свеча
cyl('CandleBody', (NCX - 0.12, YB + 1.22, 1.52), 0.085, 0.44, 10, mat=M['Wax'])
cyl('CandleDrip', (NCX - 0.12, YB + 1.22, 1.33), 0.11, 0.07, 10, mat=M['Wax'])
cone('CandleFlame', (NCX - 0.12, YB + 1.22, 1.82), 0.055, 0.20, 8, mat=M['Ember'])

# =============================================================== ЖЕЛЕЗНЫЕ ВОРОТА
GCX = (GATE[0] + GATE[1]) / 2
GWD = GATE[1] - GATE[0]
box('GateRecess', (GCX, YB - 0.30, GATE_TOP / 2), (GWD + 0.2, 0.7, GATE_TOP + 0.6), mat=M['Void'])
for s, sx in ((-1, GCX - GWD / 4), (1, GCX + GWD / 4)):
    box('GateLeaf%d' % s, (sx, YB + 0.20, GATE_TOP / 2), (GWD / 2 - 0.06, 0.16, GATE_TOP - 0.05),
        mat=M['DarkStone'])
    for r in range(3):
        box('GateBand%d_%d' % (s, r), (sx, YB + 0.29, 0.55 + r * 1.0),
            (GWD / 2 - 0.10, 0.05, 0.16), mat=M['Iron'])
    for r in range(3):
        for c in range(3):
            box('GateStud%d_%d_%d' % (s, r, c),
                (sx - 0.42 + c * 0.42, YB + 0.33, 0.55 + r * 1.0), (0.09, 0.05, 0.09),
                (0, 0, 45), M['Gold'])
for zr in (0.7, 2.3):
    box('GateHinge%.0f' % (zr * 10), (GATE[0] + 0.18, YB + 0.30, zr), (0.30, 0.06, 0.22), mat=M['Gold'])
    box('GateHinge2%.0f' % (zr * 10), (GATE[1] - 0.18, YB + 0.30, zr), (0.30, 0.06, 0.22), mat=M['Gold'])
# цепь поперёк ворот и замок
for k in range(9):
    ring('GateChain%d' % k, (GATE[0] + 0.35 + k * 0.19, YB + 0.34, 1.62 + math.sin(k * .7) * .05),
         0.085, 0.026, 8, 5, (90, 0, 90 * (k % 2)), M['Iron'])
box('Padlock', (GCX, YB + 0.40, 1.50), (0.30, 0.14, 0.34), mat=M['Gold'])
ring('PadlockShackle', (GCX, YB + 0.40, 1.68), 0.11, 0.028, 10, 5, (90, 0, 0), M['Gold'])
box('PadlockHole', (GCX, YB + 0.47, 1.46), (0.07, 0.04, 0.10), mat=M['DarkStone'])

# =============================================================== ЛЕСТНИЦА НАВЕРХ
STEPS = 12
SX0, SX1 = -6.35, -4.65
SY0, SZ0 = 0.55, 0.0
run, rise = 0.47, 0.25
for k in range(STEPS):
    y = SY0 - k * run
    z = SZ0 + k * rise
    box('Step%d' % k, ((SX0 + SX1) / 2, y - run / 2, z + rise / 2),
        (SX1 - SX0, run, rise), mat=random.choice(STONES[:3]))
LANDZ = SZ0 + STEPS * rise
box('Landing', ((SX0 + SX1) / 2, YB + 0.85, LANDZ - 0.13), (SX1 - SX0, 1.9, 0.26), mat=M['Stone1'])
# парапет вдоль лестницы
for k in range(STEPS + 3):
    y = SY0 - k * run
    z = min(SZ0 + k * rise, LANDZ)
    box('Parapet%d' % k, (SX1 + 0.12, y - run / 2, z + 0.42), (0.30, run + 0.02, 0.62),
        mat=random.choice(STONES))
box('StairSideWall', ((SX0 + SX1) / 2, YB + 0.9, LANDZ / 2), (SX1 - SX0 + 0.2, 0.3, LANDZ),
    mat=M['Stone3'])

# =============================================================== ЛЕСТНИЧНАЯ ШАХТА
# Стены колодца, в который уходит лестница. Свод здесь прорезан, сверху падает
# холодный свет — именно оттуда персонаж и спустился.
SH_X0, SH_X1 = -6.55, -4.30
SH_Y0, SH_Y1 = -5.90, -1.10
SH_TOP = 7.10
# Со стороны зала шахта открыта — иначе дверь наверху лестницы не видно
# из кадра. Закрываем только верхнюю перемычку.
box('ShaftInner', (SH_X1, (SH_Y0 + SH_Y1) / 2, (SH_TOP + 5.15) / 2),
    (0.34, SH_Y1 - SH_Y0, SH_TOP - 5.15), mat=M['Stone2'])
box('ShaftLintel', ((SH_X0 + SH_X1) / 2, SH_Y1, (SH_TOP + 5.15) / 2),
    (SH_X1 - SH_X0, 0.34, SH_TOP - 5.15), mat=M['Stone3'])
box('ShaftOuter', (SH_X0, (SH_Y0 + SH_Y1) / 2, (SPRING + SH_TOP) / 2),
    (0.34, SH_Y1 - SH_Y0, SH_TOP - SPRING), mat=M['Stone2'])
box('ShaftBack', ((SH_X0 + SH_X1) / 2, SH_Y0, (UPDOOR_Z[1] + SH_TOP) / 2),
    (SH_X1 - SH_X0, 0.34, SH_TOP - UPDOOR_Z[1]), mat=M['Stone3'])
for _k in range(6):
    box('ShaftStep%d' % _k, ((SH_X0 + SH_X1) / 2, SH_Y1 - 0.35 - _k * 0.44,
                             SH_TOP - 1.4 + _k * 0.26),
        (SH_X1 - SH_X0 - 0.7, 0.44, 0.26), mat=random.choice(STONES[:3]))

# =============================================================== ДВЕРЬ САНКТУМА (закрыта)
DCX = (UPDOOR[0] + UPDOOR[1]) / 2
DW = UPDOOR[1] - UPDOOR[0]
DZ0, DZ1 = UPDOOR_Z
DH = DZ1 - DZ0 - 0.55
box('UpDoorJambL', (UPDOOR[0] - 0.16, YB + 0.30, DZ0 + DH / 2), (0.32, 0.62, DH + 0.3), mat=M['Stone3'])
box('UpDoorJambR', (UPDOOR[1] + 0.16, YB + 0.30, DZ0 + DH / 2), (0.32, 0.62, DH + 0.3), mat=M['Stone3'])
box('UpDoorSill', (DCX, YB + 0.30, DZ0 - 0.06), (DW + 0.7, 0.62, 0.14), mat=M['Stone1'])
NP = 5
for k in range(NP):
    px = UPDOOR[0] + 0.06 + (DW - 0.12) * (k + 0.5) / NP
    box('UpDoorPlank%d' % k, (px, YB + 0.42, DZ0 + DH / 2),
        ((DW - 0.12) / NP - 0.03, 0.16, DH), mat=M['WoodLight'] if k % 2 else M['Wood'])
for r, zr in enumerate((0.45, 1.35, 2.15)):
    if zr > DH:
        continue
    box('UpDoorBand%d' % r, (DCX, YB + 0.50, DZ0 + zr), (DW - 0.12, 0.05, 0.15), mat=M['Iron'])
    for c in range(4):
        box('UpDoorStud%d_%d' % (r, c), (UPDOOR[0] + 0.28 + c * (DW - 0.56) / 3, YB + 0.54,
                                         DZ0 + zr), (0.10, 0.05, 0.10), (0, 0, 45), M['Iron'])
ring('UpDoorRing', (DCX + 0.42, YB + 0.55, DZ0 + 1.05), 0.13, 0.03, 10, 5, (90, 0, 0), M['Iron'])

# =============================================================== ЦЕПЬ С КАНДАЛАМИ
CH_X, CH_Y = 1.35, -2.0
z = APEX - 0.58
links = 11
for k in range(links):
    ring('Chain%d' % k, (CH_X, CH_Y, z), 0.115, 0.032, 8, 5,
         (90, 0, 90 * (k % 2)), M['Iron'])
    z -= 0.185
ring('Shackle', (CH_X, CH_Y, z - 0.16), 0.26, 0.075, 12, 6, (90, 0, 0), M['Iron'])
ring('ShackleInner', (CH_X, CH_Y, z - 0.16), 0.19, 0.02, 12, 5, (90, 0, 0), M['DarkStone'])
# пивот у балки, чтобы цепь с кандалами могла качаться целиком
bpy.context.view_layer.update()
_piv = bpy.data.objects.new('ChainPivot', None)
COLL.objects.link(_piv)
_piv.location = (CH_X, CH_Y, APEX - 0.50)
_inv = Matrix.Translation(Vector((CH_X, CH_Y, APEX - 0.50))).inverted()
for _o in [o for o in bpy.data.objects
           if o.name.startswith('Chain') or o.name.startswith('Shackle')]:
    if _o is _piv:
        continue
    _o.parent = _piv
    _o.matrix_parent_inverse = _inv

# =============================================================== ГРИБЫ
SHROOMS = [(6.2, -0.6, 0.25, 5), (-2.05, 0.55, 0.10, 4),
           (-3.10, -1.35, 0.10, 3), (0.9, -0.9, 0.09, 3),
           (5.6, -4.2, 0.12, 4)]
sn = 0
for (mx, my, mz, cnt) in SHROOMS:
    for _ in range(cnt):
        ox = mx + random.uniform(-.30, .30)
        oy = my + random.uniform(-.14, .14)
        oz = mz + random.uniform(-.22, .22)
        h = random.uniform(.10, .20)
        cyl('ShroomStem%d' % sn, (ox, oy, oz), 0.022, h, 6, mat=M['ShroomStem'])
        cone('ShroomCap%d' % sn, (ox, oy, oz + h * 0.62), random.uniform(.07, .11),
             random.uniform(.10, .16), 8, mat=M['Shroom'])
        sn += 1

# =============================================================== ФАКЕЛЫ
TORCHES = [(-4.30, YB + 1.15, 2.35, 0), (2.72, YB + 1.15, 2.35, 0),
           (6.28, -2.60, 2.45, -90), (6.28, 0.30, 2.45, -90),
           (-6.28, -1.20, 2.45, 90)]
for i, (tx, ty, tz, ry) in enumerate(TORCHES):
    box('Sconce%d' % i, (tx, ty, tz), (0.17, 0.34, 0.17), (0, 0, ry), M['Iron'])
    cyl('TorchStick%d' % i, (tx, ty, tz + 0.24), 0.045, 0.42, 6, mat=M['Iron'])
    cone('Flame%d' % i, (tx, ty, tz + 0.58), 0.105, 0.40, 8, mat=M['Ember'])
    L = bpy.data.lights.new('TorchLight%d' % i, 'POINT')
    L.energy, L.color, L.shadow_soft_size = 820, (1.0, 0.57, 0.25), 0.16
    L.use_custom_distance, L.cutoff_distance = True, 13.0
    L.shadow_maximum_resolution = 0.012
    ob = bpy.data.objects.new('TorchLight%d' % i, L)
    ob.location = (tx, ty, tz + 0.60)
    COLL.objects.link(ob)


def add_light(name, kind, loc, energy, color, radius=0.3, cutoff=None, rot=(0, 0, 0),
              spot_size=60, shadow=True):
    L = bpy.data.lights.new(name, kind)
    L.energy, L.color = energy, color
    if kind != 'SUN':
        L.shadow_soft_size = radius
    if cutoff:
        L.use_custom_distance, L.cutoff_distance = True, cutoff
    if kind == 'SPOT':
        L.spot_size = math.radians(spot_size)
        L.spot_blend = 0.45
    L.use_shadow = shadow
    if hasattr(L, 'shadow_maximum_resolution'):
        L.shadow_maximum_resolution = 0.012
    ob = bpy.data.objects.new(name, L)
    ob.location = loc
    ob.rotation_euler = tuple(math.radians(a) for a in rot)
    COLL.objects.link(ob)
    return ob


add_light('GateWarm', 'POINT', (GCX, YB + 1.9, 2.2), 60, (1.0, 0.66, 0.36), 0.9, 5.0, shadow=False)
add_light('CandleLight', 'POINT', (NCX - 0.12, YB + 1.22, 1.86), 55, (1.0, 0.73, 0.42), 0.07, 4.2)
add_light('AltarRune', 'POINT', (NCX, YB + 0.72, 0.80), 16, (0.32, 0.95, 0.88), 0.3, 3.2, shadow=False)
add_light('SigilLight', 'POINT', (NCX, YB + 0.50, 2.05), 6, (0.32, 0.95, 0.88), 0.25, 2.0, shadow=False)
add_light('PoolLight', 'POINT', (POOL_C[0], POOL_C[1], 0.28), 22, (0.28, 0.92, 0.86), 0.9, 6.5, shadow=False)
add_light('ShroomFillA', 'POINT', (-3.6, -5.0, 2.4), 9, (0.30, 0.95, 0.88), 0.7, 3.6, shadow=False)
add_light('ShroomFillB', 'POINT', (6.0, -2.0, 1.0), 8, (0.30, 0.95, 0.88), 0.7, 3.4, shadow=False)
# луч из лестничного проёма
add_light('StairShaft', 'SPOT', (-5.5, -3.0, 7.2), 2600, (0.76, 0.84, 1.0), 0.6, 18.0,
          rot=(12, 0, 0), spot_size=44)
# общая заливка: без неё кладка и свод проваливаются в чёрное
add_light('FillRoom', 'POINT', (0.0, 0.5, 3.4), 26, (0.58, 0.60, 0.66), 3.0, 22.0, shadow=False)
add_light('FillBack', 'POINT', (0.0, YB + 2.2, 2.4), 18, (0.62, 0.61, 0.62), 2.4, 12.0, shadow=False)
add_light('FillVault', 'POINT', (0.0, -1.0, 4.6), 20, (0.50, 0.54, 0.66), 2.6, 14.0, shadow=False)
add_light('FillFloor', 'POINT', (0.0, 3.4, 1.4), 16, (0.58, 0.58, 0.62), 2.4, 12.0, shadow=False)
add_light('CageGlow', 'POINT', (CGX, YB - 0.45, 0.9), 16, (0.70, 0.62, 0.52), 0.8, 3.0,
          shadow=False)

# ---- свет на узлах взаимодействия ----------------------------------------
# Каждое место, с которым игрок сможет что-то сделать, должно читаться само
# по себе: общий свет в крипте намеренно низкий, поэтому узлы подсвечиваются
# отдельными лампами без теней.
INTERACT = [
    # алтарь со свечой
    ('KeyAltar',   (NCX, YB + 2.5, 2.20),  70, (1.00, 0.74, 0.46), 0.7, 3.2),
    ('KeyAltarLo', (NCX, YB + 1.9, 0.70),  30, (0.55, 0.90, 0.86), 0.6, 2.4),
    # дверь наверху лестницы — выход обратно в Санктум
    ('KeyDoor',    (DCX + 0.8, YB + 2.4, DZ0 + 1.5), 190, (1.00, 0.73, 0.44), 0.8, 4.2),
    ('KeyStair',   (-5.5, -1.8, 2.60),      60, (0.74, 0.82, 1.00), 0.9, 3.6),
    # запертые ворота
    ('KeyGate',    (GCX, YB + 1.9, 1.80),   85, (1.00, 0.70, 0.40), 0.7, 3.4),
    # висящие кандалы
    ('KeyShackle', (CH_X, CH_Y + 0.7, 3.45), 32, (0.72, 0.80, 0.98), 0.5, 2.2),
    # бочка и кости
    # лужа
    ('KeyPool',    (POOL_C[0], POOL_C[1] - 0.4, 0.90), 26, (0.42, 0.92, 0.86), 0.8, 2.8),
]
for _n, _p, _e, _c, _r, _cut in INTERACT:
    add_light(_n, 'POINT', _p, _e, _c, _r, _cut, shadow=False)

# камеры: свет внутри, чтобы за решётками была глубина, и по прутьям спереди
add_light('CageNear', 'POINT', (CGX, YB - 0.85, 1.35), 90, (0.96, 0.72, 0.46), 0.8, 3.4,
          shadow=False)
add_light('CageDeep', 'POINT', (CGX, YB - DEPTH + 0.55, 1.75), 34, (0.60, 0.66, 0.84), 0.7, 2.6,
          shadow=False)
add_light('CageBarsLit', 'POINT', (CGX, YB + 1.5, 1.55), 40, (0.82, 0.86, 0.98), 0.9, 3.0,
          shadow=False)
# распахнутая золотая решётка
add_light('KeyOpenGate', 'POINT', ((DOOR_GAP[0] + DOOR_GAP[1]) / 2 - 0.7, YB + 1.2, 1.50), 46, (1.00, 0.82, 0.52), 0.5, 2.4,
          shadow=False)

# объём под луч и общую дымку
vol = box('AtmosVolume', (-4.6, -2.6, 3.2), (4.0, 5.0, 6.4), mat=None)
vm = bpy.data.materials.new('Atmos2')
vm.use_nodes = True
nt = vm.node_tree
nt.nodes.clear()
pv = nt.nodes.new('ShaderNodeVolumePrincipled')
out = nt.nodes.new('ShaderNodeOutputMaterial')
pv.inputs['Color'].default_value = (0.62, 0.70, 0.88, 1.0)
pv.inputs['Density'].default_value = 0.10
nt.links.new(pv.outputs[0], out.inputs['Volume'])
vol.data.materials.append(vm)

# ================================================== ЗЕРКАЛО ПО X
# Камера смотрит вдоль -Y, значит экранное «вправо» — это мир -X. Чтобы
# планировка совпала с концептом (лестница слева, ворота справа), отражаем
# всю сцену и выворачиваем нормали.
# Без апдейта вьюлеера matrix_world у только что созданных объектов ещё
# единичная — умножение на зеркало обнулило бы все позиции.
bpy.context.view_layer.update()
MIR = Matrix.Diagonal((-1.0, 1.0, 1.0, 1.0))
for o in bpy.data.objects:
    if o.parent is None:
        o.matrix_world = MIR @ o.matrix_world
for me in bpy.data.meshes:
    bm = bmesh.new()
    bm.from_mesh(me)
    for f in bm.faces:
        f.normal_flip()
    bm.to_mesh(me)
    bm.free()
    me.update()

# ============================================ КОНТУРЫ ИНТЕРАКТИВНЫХ ЗОН
# Тот же приём, что в Санктуме: раздутая копия меша выворачивается наизнанку,
# материал с backface culling — виден только силуэт. Строится ПОСЛЕ зеркала,
# иначе нормали вывернутся дважды.
bpy.context.view_layer.update()
CY = (0.36, 0.97, 0.92, 1.0)
THICK = 0.030


def outline_mat(name, cull):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    em = nt.nodes.new('ShaderNodeEmission')
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    em.inputs['Color'].default_value = CY
    em.inputs['Strength'].default_value = 1.75
    nt.links.new(em.outputs[0], out.inputs['Surface'])
    m.use_backface_culling = cull
    return m


MAT_HULL = outline_mat('OutlineGlow', True)
MAT_FLAT = outline_mat('OutlineGlowFlat', False)


def no_influence(o):
    o.visible_shadow = False
    o.visible_diffuse = False
    o.visible_glossy = False
    o.visible_volume_scatter = False


def hull_from(prefixes, name, mode='hull'):
    src = [o for o in bpy.data.objects
           if o.type == 'MESH' and any(o.name.startswith(pr) for pr in prefixes)]
    if not src:
        print("outline: nothing for", name)
        return None
    copies = []
    for o in src:
        c = o.copy()
        c.data = o.data.copy()
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
    me = hl.data
    me.materials.clear()
    me.materials.append(MAT_HULL)
    bm = bmesh.new()
    if mode == 'box':                                  # общий габарит вместо силуэта каждой части
        R = src[0].matrix_world.to_quaternion().to_matrix().to_4x4()
        Ri = R.inverted()
        pts = [Ri @ (o.matrix_world @ v.co) for o in src for v in o.data.vertices]
        mn = Vector((min(q.x for q in pts), min(q.y for q in pts), min(q.z for q in pts)))
        mx = Vector((max(q.x for q in pts), max(q.y for q in pts), max(q.z for q in pts)))
        ctr = (mn + mx) / 2
        hl.matrix_world = R
        hl.location = R @ ctr.to_4d().to_3d()
        me.clear_geometry()
        hh = (mx - mn) / 2
        verts = [(sx * hh.x, sy * hh.y, sz * hh.z)
                 for sx in (-1, 1) for sy in (-1, 1) for sz in (-1, 1)]
        faces = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1),
                 (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
        me.from_pydata(verts, [], faces)
        me.update()
    bm.from_mesh(me)
    bm.normal_update()
    # После зеркала у объектов отрицательный определитель матрицы и вывернутая
    # намотка, поэтому геометрически наружу смотрит -normal, а не +normal.
    sgn = -1.0 if hl.matrix_world.determinant() < 0 else 1.0
    for v in bm.verts:
        v.co += v.normal * THICK * sgn
    # У зеркальных объектов намотка уже перевёрнута, второй раз выворачивать
    # нельзя — иначе culling оставит ближнюю сторону и силуэт станет заливкой.
    for f in bm.faces:
        if sgn > 0:
            f.normal_flip()
        f.material_index = 0
    bm.to_mesh(me)
    bm.free()
    me.update()
    no_influence(hl)
    return hl


hull_from(['AltarStep', 'AltarLeg', 'AltarSlab', 'AltarLip'], 'HL_altar')


def frame_marker(name, xa, xb, y, spring, rise, z0=0.04, nseg=10):
    """Светящаяся рамка по периметру арочного проёма, вынесенная перед аркой."""
    half = (xb - xa) / 2 + 0.10
    cx = (xa + xb) / 2
    parts = []

    def top_at(x):
        t = (x - xa) / (xb - xa)
        return pointed(min(max(t, 0.0), 1.0), half, spring, spring + rise)[1]

    for sx in (xa, xb):
        h = top_at(sx) - z0
        parts.append(box('%sV%d' % (name, int(sx * 100)), (sx, y, z0 + h / 2), (0.05, 0.05, h)))
    parts.append(box('%sB' % name, (cx, y, z0), (xb - xa, 0.05, 0.05)))
    for k in range(nseg):
        x0 = xa + (xb - xa) * k / nseg
        x1 = xa + (xb - xa) * (k + 1) / nseg
        z_0, z_1 = top_at(x0), top_at(x1)
        ln = math.hypot(x1 - x0, z_1 - z_0)
        ang = math.degrees(math.atan2(z_1 - z_0, x1 - x0))
        parts.append(box('%sA%d' % (name, k), ((x0 + x1) / 2, y, (z_0 + z_1) / 2),
                         (ln + 0.02, 0.05, 0.05), (0, -ang, 0)))
    for pt in parts:
        pt.data.materials.clear()
        pt.data.materials.append(MAT_FLAT)
        no_influence(pt)
    return parts


# арки этих проёмов имеют глубину 0.62 и 0.70 и стоят на y = YB+0.30 / YB+0.34,
# то есть их передняя плоскость примерно на YB+0.61 и YB+0.69 — рамки ставим перед ними
frame_marker('CageMark', -CAGE[1], -CAGE[0], YB + 0.66, CAGE_TOP, CAGE_RISE)
frame_marker('GateMark', -GATE[1], -GATE[0], YB + 0.74, GATE_TOP, 0.95)

# ============================================ ПЕРСОНАЖ
# Тот же маскот, что в Санктуме: подтягиваем всю иерархию из первого файла,
# чтобы модель, материалы и пивоты для дыхания и моргания были те же самые.
with bpy.data.libraries.load(SANCTUM, link=False) as (src, dst):
    dst.objects = [n for n in src.objects if n.startswith('Mascot')]
for o in dst.objects:
    if o is not None and o.name not in COLL.objects:
        COLL.objects.link(o)
mroot = bpy.data.objects.get('Mascot')
if mroot:
    mroot.location = (0.35, -2.05, 0.05)
    mroot.rotation_euler = (0, 0, math.radians(8))       # лицом к камере
    for nm, ang in (('MascotHeadPivot', (4, -7, -9)),
                    ('MascotShoulder1', (16, -24, -5)),
                    ('MascotShoulder-1', (-9, 21, 4))):
        ob = bpy.data.objects.get(nm)
        if ob:
            ob.rotation_euler = tuple(math.radians(a) for a in ang)
    for sgn, yaw in ((1, -13), (-1, 10)):
        ob = bpy.data.objects.get('MascotHip%d' % sgn)
        if ob:
            ob.rotation_euler = (0, 0, math.radians(yaw))
    # свет персонажа переставляем под крипту
    k = bpy.data.objects.get('MascotKey')
    if k:
        k.location = (mroot.location.x + 0.9, mroot.location.y + 2.1, 2.55)
        dv = (Vector((mroot.location.x, mroot.location.y, 1.15)) - k.location).normalized()
        k.rotation_euler = dv.to_track_quat('-Z', 'Y').to_euler()
        k.data.energy = 105
    r = bpy.data.objects.get('MascotRim')
    if r:
        r.location = (mroot.location.x - 0.7, mroot.location.y - 1.3, 1.7)
        r.data.energy = 46
    print("mascot linked:", len([o for o in bpy.data.objects if o.name.startswith('Mascot')]))

# =============================================================== КАМЕРА И РЕНДЕР
cam_data = bpy.data.cameras.new('MainCamera')
cam_data.lens = 20
cam_data.sensor_width = 36
cam = bpy.data.objects.new('MainCamera', cam_data)
COLL.objects.link(cam)
cam.location = (0.0, 3.95, 2.55)
target = Vector((0.0, -4.50, 1.55))
d = (target - Vector(cam.location))
cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()

sc = bpy.context.scene
sc.camera = cam
sc.render.engine = 'BLENDER_EEVEE'
sc.render.resolution_x, sc.render.resolution_y = 1920, 1080
sc.render.fps = 24
ev = sc.eevee
ev.taa_render_samples = 96
for attr, val in (('use_volumetric_lights', True), ('volumetric_samples', 128),
                  ('shadow_pool_size', '512'), ('use_shadows', True),
                  ('volumetric_start', 0.1), ('volumetric_end', 40.0)):
    if hasattr(ev, attr):
        setattr(ev, attr, val)

world = bpy.data.worlds.new('World')
world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.016, 0.019, 0.030, 1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = 1.0
sc.world = world

bpy.ops.wm.save_as_mainfile(filepath=OUTFILE)
print("UNDERCROFT BUILT objects=%d  saved=%s" % (len(bpy.data.objects), OUTFILE))
