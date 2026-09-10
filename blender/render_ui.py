"""Renders the low-poly furniture for the site's widgets.

Two kinds of output:
  icons/<name>.png   one interactive object, isolated, on transparency
  panel_stone.png    a faceted stone slab used as the panel background

Everything is lit by the same three-point rig so the whole UI reads as one
material, and every object keeps the materials it has in the room.

    blender -b <scene>.blend --python render_ui.py -- <sanctum|undercroft> <outdir>
"""
import bpy, math, os, random, sys
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
WHICH = argv[0] if argv else "sanctum"
OUT = argv[1] if len(argv) > 1 else "D:/hollowmere/site/public/ui"

GROUPS = {
    "sanctum": {
        "raven": ["RavenBody", "RavenHead", "RavenNeck", "RavenBreast", "RavenTail",
                  "RavenWing", "RavenBeak", "RavenLeg", "RavenFoot", "RavenEye"],
        "chest": ["ChestBody", "ChestLid", "ChestLidTrim", "ChestBand", "ChestHinge",
                  "ChestInner", "ChestTreasure", "Coin"],
        "books": ["ShelfBack", "ShelfBoard", "ShelfPost", "Book_"],
        "map": ["WallMap", "MapNail"],
        "astro": ["AstroBase", "AstroColumn", "AstroCap", "AstroStep", "AstroRing",
                  "AstroSpindle", "AstroGem", "AstroSpike"],
        "mirror": ["MirFrame", "MirrorGlassPane", "MirCrack", "MirArch"],
        "door": ["DoorPlank", "DoorBand", "DoorStud", "DoorTriangle"],
        "sigil": ["RuneArc", "RuneCore", "RuneInset", "RuneRay"],
    },
    "undercroft": {
        "cage": ["CageBar", "CageJamb", "CageRail", "CageLintel", "GateFrame", "GateBar",
                 "GateRail", "GateHandle"],
        "altar": ["AltarStep", "AltarSlab", "AltarLip", "AltarLeg", "AltarCrack",
                  "CandleBody", "CandleDrip", "CandleFlame", "Cloth"],
        "gate": ["GateLeaf", "GateBand", "GateStud", "GateHinge", "GateChain", "Padlock"],
    },
}

sc = bpy.context.scene
sc.render.engine = "BLENDER_EEVEE"
sc.render.film_transparent = True
sc.render.image_settings.file_format = "PNG"
sc.render.image_settings.color_mode = "RGBA"
sc.eevee.taa_render_samples = 96
for attr, val in (("shadow_pool_size", "512"),):
    if hasattr(sc.eevee, attr):
        setattr(sc.eevee, attr, val)
for o in bpy.data.objects:
    if o.type == "LIGHT" and hasattr(o.data, "shadow_maximum_resolution"):
        o.data.shadow_maximum_resolution = max(o.data.shadow_maximum_resolution, 0.012)

# The room's own lights are wrong for an isolated object, so build a rig that
# every icon shares: warm key, cool fill, teal rim.
RIG = []


def lamp(name, kind, loc, energy, color, radius=0.6):
    d = bpy.data.lights.new(name, kind)
    d.energy = energy
    d.color = color
    if kind != "SUN":
        d.shadow_soft_size = radius
    d.use_shadow = False
    ob = bpy.data.objects.new(name, d)
    ob.location = loc
    bpy.context.collection.objects.link(ob)
    RIG.append(ob)
    return ob


def build_rig(center, size):
    for ob in list(RIG):
        bpy.data.objects.remove(ob, do_unlink=True)
    RIG.clear()
    r = max(size, 0.6) * 3.2
    # Flat, high-albedo pieces (the parchment map) clip if the key carries the
    # whole exposure, so it is dialled back and the fill and rim pick up the
    # difference.
    p = 620 * (r / 3.2) ** 2
    lamp("UiKey", "POINT", center + Vector((r * 0.8, r * 0.9, r * 0.9)), p, (1.0, 0.83, 0.64))
    lamp("UiFill", "POINT", center + Vector((-r * 0.9, r * 0.7, r * 0.2)), p * 0.62,
         (0.60, 0.68, 0.92))
    lamp("UiRim", "POINT", center + Vector((0.0, -r * 1.1, r * 0.5)), p * 0.55,
         (0.36, 0.95, 0.88))


def isolate(prefixes):
    keep = []
    for o in bpy.data.objects:
        if o.type != "MESH":
            continue
        hit = any(o.name.startswith(p) for p in prefixes)
        o.hide_render = not hit
        if hit:
            keep.append(o)
    for o in bpy.data.objects:
        if o.name.startswith("HL_") or o.name.startswith("CageMark") \
                or o.name.startswith("GateMark") or o.name == "AtmosVolume":
            o.hide_render = True
    return keep


def frame(objs):
    pts = []
    for o in objs:
        for c in o.bound_box:
            pts.append(o.matrix_world @ Vector(c))
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return (lo + hi) / 2, (hi - lo)


cam_data = bpy.data.cameras.new("UiCam")
cam_data.type = "ORTHO"
cam = bpy.data.objects.new("UiCam", cam_data)
bpy.context.collection.objects.link(cam)
sc.camera = cam

# Three-quarter view from above: reads as a solid object rather than a flat plate.
DIR = Vector((0.72, 0.62, 0.42)).normalized()

# Per-icon exposure trims: the parchment map is almost white and clips
# at the exposure that suits stone, wood and iron.
EXPO = {"map": -1.9, "sigil": -0.4}

# The map hangs on the 288-degree panel, so the shared three-quarter
# direction catches it almost edge-on. Look along its own normal instead.
DIR_OVERRIDE = {"map": Vector((-0.31, 0.95, 0.34))}

os.makedirs(OUT + "/icons", exist_ok=True)
sc.render.resolution_x = 320
sc.render.resolution_y = 320

for name, prefixes in GROUPS[WHICH].items():
    objs = isolate(prefixes)
    if not objs:
        print("UI skip", name)
        continue
    center, dim = frame(objs)
    span = max(dim.x, dim.y, dim.z)
    cam_data.ortho_scale = span * 1.42
    view = DIR_OVERRIDE.get(name, DIR).normalized()
    cam.location = center + view * (span * 4.0 + 4.0)
    cam.rotation_euler = (-view).to_track_quat("-Z", "Y").to_euler()
    build_rig(center, span)
    sc.view_settings.exposure = EXPO.get(name, 0.0)
    sc.render.filepath = OUT + "/icons/" + name + ".png"
    bpy.ops.render.render(write_still=True)
    print("UI ICON", name, round(span, 2))

# ---- Wick's portrait for the mirror --------------------------------------
if WHICH == "sanctum":
    objs = isolate(["Mascot"])
    if objs:
        center, dim = frame(objs)
        span = max(dim.x, dim.z)
        cam_data.ortho_scale = span * 1.30
        # Almost head-on, only slightly to the side: this is a portrait, not a
        # prop, so the face has to read.
        view = Vector((0.34, 0.92, 0.16)).normalized()
        cam.location = center + view * (span * 4.0 + 4.0)
        cam.rotation_euler = (-view).to_track_quat("-Z", "Y").to_euler()
        build_rig(center, span)
        sc.view_settings.exposure = -0.35
        sc.render.resolution_x = 560
        sc.render.resolution_y = 720
        sc.render.filepath = OUT + "/wick.png"
        bpy.ops.render.render(write_still=True)
        print("UI PORTRAIT wick", round(span, 2))
    sc.render.resolution_x = 320
    sc.render.resolution_y = 320
    sc.view_settings.exposure = 0.0

# ---- the stone slab behind every panel -----------------------------------
if WHICH == "sanctum":
    random.seed(4)
    for o in bpy.data.objects:
        o.hide_render = True
    import bmesh
    me = bpy.data.meshes.new("UiSlab")
    bm = bmesh.new()
    N, M = 15, 10
    W, H = 13.0, 8.4
    grid = []
    for j in range(M + 1):
        row = []
        for i in range(N + 1):
            x = -W / 2 + W * i / N + random.uniform(-0.13, 0.13)
            y = -H / 2 + H * j / M + random.uniform(-0.13, 0.13)
            z = random.uniform(-0.26, 0.26)
            row.append(bm.verts.new((x, y, z)))
        grid.append(row)
    for j in range(M):
        for i in range(N):
            bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    slab = bpy.data.objects.new("UiSlab", me)
    bpy.context.collection.objects.link(slab)
    stone = bpy.data.materials.get("Stone2") or bpy.data.materials.get("Stone2_gl_astro")
    if stone:
        me.materials.append(stone)
    slab.hide_render = False

    center = Vector((0, 0, 0))
    build_rig(center, 6.0)
    for ob in RIG:
        ob.data.energy *= 0.30
    sc.view_settings.exposure = -0.9
    cam_data.ortho_scale = 13.2
    cam.location = Vector((0, 0, 14))
    cam.rotation_euler = (0, 0, 0)
    sc.render.film_transparent = False
    sc.render.resolution_x = 1200
    sc.render.resolution_y = 780
    sc.render.filepath = OUT + "/panel_stone.png"
    bpy.ops.render.render(write_still=True)
    print("UI SLAB done")

print("UI ALL DONE", WHICH)
