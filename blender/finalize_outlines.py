import bpy, math

# 1) френелевский ободок на самих объектах — чуть заметнее, но всё ещё только по краю
for m in bpy.data.materials:
    if '_gl_' not in m.name or not m.node_tree:
        continue
    nt = m.node_tree
    lw = [n for n in nt.nodes if n.bl_idname == 'ShaderNodeLayerWeight']
    mu = nt.nodes.get('GLOW_K')
    if not lw or not mu:
        continue
    lw[0].inputs['Blend'].default_value = 0.06
    mu.inputs[0].links[0].from_node.inputs[1].default_value = 2.5
    # у ворона ободок почти убран: иначе внутренние рёбра крыла читаются
    # как отдельная наклеенная пластина поверх тела
    mu.inputs[1].default_value = 1.2 if m.name.startswith('RavenFeather') else 4.0

# 2) медленная пульсация контуров в такт дыханию (2 цикла за 10 секунд)
mat = bpy.data.materials['OutlineGlow']
mat.node_tree.animation_data_clear()
em = [n for n in mat.node_tree.nodes if n.bl_idname == 'ShaderNodeEmission'][0]
for f, v in [(1, 1.55), (61, 1.95), (121, 1.55), (181, 1.95), (241, 1.55)]:
    em.inputs['Strength'].default_value = v
    em.inputs['Strength'].keyframe_insert('default_value', frame=f)
matf = bpy.data.materials['OutlineGlowFlat']
matf.node_tree.animation_data_clear()
emf = [n for n in matf.node_tree.nodes if n.bl_idname == 'ShaderNodeEmission'][0]
for f, v in [(1, 1.55), (61, 1.95), (121, 1.55), (181, 1.95), (241, 1.55)]:
    emf.inputs['Strength'].default_value = v
    emf.inputs['Strength'].keyframe_insert('default_value', frame=f)

bpy.context.scene.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=r"C:\Users\Admin\Downloads\hollowmere\scene\hollowmere_sanctum.blend")
print("FINALIZE DONE", len(bpy.data.objects))
