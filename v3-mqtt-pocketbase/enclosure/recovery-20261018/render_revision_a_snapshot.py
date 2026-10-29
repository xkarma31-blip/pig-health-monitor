"""Assemble prototype meshes for honest appearance review; logo is a label, not STL."""
import bpy
import math
from pathlib import Path
from mathutils import Vector

root=Path(__file__).resolve().parent
out=root/'revision-a'
bpy.ops.wm.open_mainfile(filepath=str(out/'mechanical-prototype.blend'))
# Tub coordinates X=width, Y=height, Z=depth become X, depth=-Y, height=Z.
layout={'main_tub':(0,0),'main_lid':(0,30),
        'thermal_tub':(80,0),'thermal_face':(80,30),
        'acoustic_tub':(-80,0),'acoustic_face':(-80,30),
        'optical_trim':(80,33),'acoustic_trim':(-80,33)}
for name,(height,depth) in layout.items():
    o=bpy.data.objects[name]
    # Restore construction centers after exploded layout offsets.
    original_z=15 if name.endswith('tub') else 1.5 if name.endswith(('lid','face')) else 1
    o.rotation_euler=(math.pi/2,0,0)
    o.location=(0,-depth-original_z,height)
    if name=='acoustic_trim':
        o.location.x=-24
        duplicate=o.copy()
        duplicate.data=o.data.copy()
        bpy.context.collection.objects.link(duplicate)
        duplicate.location.x=24

# Preserve exact raster wordmark in a separately identified adhesive-label workflow.
# This is deliberately not exported as a printable logo mesh.
bpy.ops.mesh.primitive_plane_add(size=1,location=(0,-33.08,12),rotation=(math.pi/2,0,0))
label=bpy.context.object
label.name='REFERENCE_ARTWORK_LABEL_NOT_STL'
label.scale=(65,26.25,1)
m=bpy.data.materials.new('Original poster crop — label artwork')
m.use_nodes=True
bsdf=m.node_tree.nodes.get('Principled BSDF')
tex=m.node_tree.nodes.new('ShaderNodeTexImage')
tex.image=bpy.data.images.load(str(root/'logo-source-crop.png'))
tex.image.pack()
m.node_tree.links.new(tex.outputs['Color'],bsdf.inputs['Base Color'])
bsdf.inputs['Roughness'].default_value=0.8
label.data.materials.append(m)
scene=bpy.context.scene
cam=scene.camera
cam.location=(240,-430,210)
cam.rotation_euler=(Vector((0,0,0))-cam.location).to_track_quat('-Z','Y').to_euler()
cam.data.ortho_scale=310
scene.render.resolution_x=1500
scene.render.resolution_y=1500
scene.render.filepath=str(out/'assembled-reference-label.png')
bpy.ops.wm.save_as_mainfile(filepath=str(out/'assembled-review.blend'))
bpy.ops.render.render(write_still=True)
