"""Optional 3mm tray spacer for researched tall-stack scenario, not default P."""
import bpy
import bmesh
import json
from pathlib import Path
root=Path(__file__).resolve().parent
out=root/'research-adapters'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.mesh.primitive_cylinder_add(vertices=64,radius=3.5,depth=3,location=(0,0,1.5))
obj=bpy.context.object
bpy.ops.mesh.primitive_cylinder_add(vertices=64,radius=1.7,depth=8)
cut=bpy.context.object;bpy.context.view_layer.objects.active=obj
mod=obj.modifiers.new('M3 nominal clearance','BOOLEAN');mod.operation='DIFFERENCE';mod.object=cut
bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(cut,do_unlink=True)
bm=bmesh.new();bm.from_mesh(obj.data)
report={'nonmanifold_edges':sum(not e.is_manifold for e in bm.edges),'volume_mm3':abs(bm.calc_volume(signed=True)),
        'nominal_height_mm':3,'optional_tray_top_depth_mm':9,
        'gross_clearance_to_lid_mm':21,'nominal_20mm_stack_margin_mm':1,
        'bolt_stack_grip_mm':9,'candidate_bolt_length_mm':14,
        'minimum_length_under_prior_assumptions_mm':13.4,
        'limits':['Only1mm nominal top margin before tolerances and cables',
                  '3mm underside gap requires electrical/solder protrusion assessment',
                  'Use four spacers; change tray bolts rather than retain18mm bolt blindly',
                  'Not a physical fit or universal header compatibility claim']}
bm.free();bpy.ops.object.select_all(action='DESELECT');obj.select_set(True)
bpy.ops.export_mesh.stl(filepath=str(out/'optional_tray_spacer_3mm.stl'),use_selection=True)
(out/'optional-low-tray-checks.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report))
if report['nonmanifold_edges']:raise SystemExit(1)
