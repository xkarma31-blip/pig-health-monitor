"""14x12mm sourced-example corner support: research coupon, not actual board fit."""
import bpy
import bmesh
import json
from pathlib import Path

root=Path(__file__).resolve().parent
out=root/'research-adapters'
bpy.ops.wm.read_factory_settings(use_empty=True)

def box(dims,pos):
    bpy.ops.mesh.primitive_cube_add(size=1,location=pos)
    o=bpy.context.object;o.dimensions=dims
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return o

def boolean(a,b,op):
    bpy.context.view_layer.objects.active=a
    m=a.modifiers.new(op,'BOOLEAN');m.operation=op;m.solver='EXACT';m.object=b
    bpy.ops.object.modifier_apply(modifier=m.name);bpy.data.objects.remove(b,do_unlink=True)

# Base perimeter ties positively to existing four nominal M3 carrier axes.
# Replaces carrier in coupon interpretation; does not stack over old carrier.
obj=box((26,26,3),(0,0,1.5))
bpy.ops.mesh.primitive_cylinder_add(vertices=96,radius=6.3,depth=12,location=(0,0,3))
boolean(obj,bpy.context.object,'DIFFERENCE')
for x in (-10,10):
    for y in (-10,10):
        bpy.ops.mesh.primitive_cylinder_add(vertices=64,radius=1.7,depth=12,location=(x,y,2))
        boolean(obj,bpy.context.object,'DIFFERENCE')
# Four supported corners of14x12 example; closest corner radius sqrt(5.5²+4.5²)
# >6.3mm. Continuous legs root on the base, avoiding the central acoustic bore.
for x in (-6.25,6.25):
    for y in (-5.25,5.25):
        boolean(obj,box((1.5,1.5,8),(x,y,7)),'UNION')
# Side stops remain outside nominal PCB and central bore. Two tie tunnels
# capture purchased retention over inspected PCB edges; thread before assembly.
for x in (-7.75,7.75):
    for y in (-5.25,5.25):
        boolean(obj,box((1.5,2,9.5),(x,y,7.75)),'UNION')
        boolean(obj,box((6,0.9,1.4),(x,y,9.5)),'DIFFERENCE')
bm=bmesh.new();bm.from_mesh(obj.data)
report={'status':'research coupon, uninstalled and unvalidated retention',
        'source_board_plan_mm':[14,12],'sound_keepout_radius_mm':6.3,
        'corner_bearing_total_nominal_mm2':9,'seat_z_mm':11,
        'nonmanifold_edges':sum(not e.is_manifold for e in bm.edges),
        'volume_mm3':abs(bm.calc_volume(signed=True)),
        'retention':'Four outboard stops/tie tunnels; purchased ties, prethreaded, not printed hardware',
        'limitations':['Tie bends/head and actual port/component-safe route require verification',
                      'Actual PCB underside/corner-safe areas unknown',
                      'Gasket,port alignment and response not validated',
                      'Must check installed bolt/tie/cable envelopes']}
bm.free()
bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
bpy.ops.export_mesh.stl(filepath=str(out/'mic_14x12_corner_support.stl'),use_selection=True)
(out/'mic-corner-checks.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report))
if report['nonmanifold_edges'] or report['volume_mm3']<=0:raise SystemExit(1)
