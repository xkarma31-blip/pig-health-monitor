"""Separate approximate support coupons. Not installed/approved release parts."""
import bpy
import bmesh
import json
from pathlib import Path

root=Path(__file__).resolve().parent
out=root/'research-adapters'
out.mkdir(exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)

def box(name,dims,pos):
    bpy.ops.mesh.primitive_cube_add(size=1,location=pos)
    o=bpy.context.object;o.name=name;o.dimensions=dims
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return o

def combine(a,b,operation='UNION'):
    bpy.context.view_layer.objects.active=a
    m=a.modifiers.new('Support coupon '+operation,'BOOLEAN');m.operation=operation;m.solver='EXACT';m.object=b
    bpy.ops.object.modifier_apply(modifier=m.name);bpy.data.objects.remove(b,do_unlink=True)

reports=[]
variants=[('sht_elevated_support',30,24,12,4),
          ('mic_elevated_support',22,16,8.5,3),
          ('sht_12mm_support_coupon',12,12,4.5,2),
          ('mic_14x12_support_coupon',14,12,5.5,2)]
for name,width,length,rail_x,rail_width in variants:
    # Two full-height side rails, joined at one end OUTSIDE central sensor path.
    # Broad feet bridge slots; removable ties capture through eyes in side rails.
    obj=box(name,(rail_width,length,8),(-rail_x,0,4))
    combine(obj,box('right rail',(rail_width,length,8),(rail_x,0,4)))
    combine(obj,box('end bridge',(2*rail_x+rail_width,3,3),(0,length/2-1.5,1.5)))
    # Eyes run along Y, not through the entire X section of the rail.
    # Keep a solid2mm base and2mm top so the rail does not become two islands.
    for x in (-rail_x,rail_x):
        combine(obj,box('retention eye',(rail_width+2,2,3),(x,0,4)),'DIFFERENCE')
    bm=bmesh.new();bm.from_mesh(obj.data)
    reports.append({'part':name,'nonmanifold_edges':sum(not e.is_manifold for e in bm.edges),
                    'volume_mm3':abs(bm.calc_volume(signed=True)),
                    'bearing_height_mm':8,'target_board_plan_mm':[width,length],
                    'rail_x_centers_mm':[-rail_x,rail_x],'rail_width_mm':rail_width,
                    'status':'uninstalled research coupon; exact underside-safe areas unknown',
                    'warning':'Small-board variants require separate base attachment; do not place small mic rails into existing radius6 sound path without revised acoustic interface'})
    bm.free()
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
    bpy.ops.export_mesh.stl(filepath=str(out/(name+'.stl')),use_selection=True)
    bpy.data.objects.remove(obj,do_unlink=True)
(out/'coupon-checks.json').write_text(json.dumps({'parts':reports,'limits':['Not yet checked against installed hardware','Strap capture route and support contact require review','No optical/acoustic/airflow or strength approval']},indent=2))
print(json.dumps(reports))
if any(r['nonmanifold_edges'] or r['volume_mm3']<=0 for r in reports):raise SystemExit(1)
