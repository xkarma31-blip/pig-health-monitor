"""Optional low-material hole-clearance test. Not a hardware measurement."""
import bpy
import bmesh
import json
from pathlib import Path

root=Path(__file__).resolve().parent
out=root/'revision-l'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.mesh.primitive_cube_add(size=1,location=(0,0,1.5))
plate=bpy.context.object
plate.name='optional_M3_hole_coupon'
plate.dimensions=(58,16,3)
bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
holes=[]
for x,d in zip((-21,-7,7,21),(3.0,3.2,3.4,3.6)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=48,radius=d/2,depth=9,location=(x,0,1.5))
    cutter=bpy.context.object
    bpy.context.view_layer.objects.active=plate
    m=plate.modifiers.new('test hole','BOOLEAN');m.operation='DIFFERENCE';m.object=cutter
    bpy.ops.object.modifier_apply(modifier=m.name)
    bpy.data.objects.remove(cutter,do_unlink=True)
    holes.append({'center_x_mm':x,'nominal_diameter_mm':d})
bpy.ops.object.select_all(action='DESELECT')
plate.select_set(True)
bpy.context.view_layer.objects.active=plate
bpy.ops.export_mesh.stl(filepath=str(out/'optional_M3_hole_coupon.stl'),use_selection=True)
bm=bmesh.new();bm.from_mesh(plate.data)
report={'optional_not_installed_part':True,'dimensions_mm':[58,16,3],
        'holes_left_to_right':holes,'nonmanifold_edges':sum(not e.is_manifold for e in bm.edges),
        'volume_mm3':bm.calc_volume(signed=True),
        'instructions':'Print on intended printer/material. Identify left-to-right using listed X coordinates. Measure/try real bolt; do not infer nominal hole prints exactly. No coupon printed in this task.'}
(out/'fit-coupon.json').write_text(json.dumps(report,indent=2))
bm.free()
print(json.dumps(report))
