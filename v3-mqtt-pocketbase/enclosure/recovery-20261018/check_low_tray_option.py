"""Actual optional spacer replacement, printed-part checks only."""
import bpy
import bmesh
import json
import math
from pathlib import Path
from mathutils import Vector
root=Path(__file__).resolve().parent
out=root/'research-adapters'
bpy.ops.wm.open_mainfile(filepath=str(root/'revision-p/assembled-review.blend'))
names=json.loads((root/'revision-p/assembly-checks.json').read_text())['installed_inventory']['expected']
for i in range(1,5):
    old=bpy.data.objects['tray_spacer_6mm.%03d'%i]
    pos=old.location.copy();bpy.data.objects.remove(old,do_unlink=True)
    bpy.ops.import_mesh.stl(filepath=str(out/'optional_tray_spacer_3mm.stl'))
    obj=bpy.context.object;obj.name='tray_spacer_6mm.%03d'%i
    obj.rotation_euler=(math.pi/2,0,0);obj.location=pos
tray=bpy.data.objects['electronics_strap_tray'];tray.location.y+=3
bpy.context.view_layer.update()
def bounds(o):return [o.matrix_world@Vector(v) for v in o.bound_box]
def intersection(a,b):
    aa,bb=bounds(a),bounds(b)
    if any(min(max(v[k] for v in aa),max(v[k] for v in bb))-max(min(v[k] for v in aa),min(v[k] for v in bb))<0.0001 for k in range(3)):return 0
    c=a.copy();c.data=a.data.copy();bpy.context.collection.objects.link(c)
    for m in list(c.modifiers):c.modifiers.remove(m)
    bpy.context.view_layer.objects.active=c
    m=c.modifiers.new('option intersection','BOOLEAN');m.operation='INTERSECT';m.solver='EXACT';m.object=b
    bpy.ops.object.modifier_apply(modifier=m.name)
    bm=bmesh.new();bm.from_mesh(c.data);v=abs(bm.calc_volume(signed=True));bm.free()
    bpy.data.objects.remove(c,do_unlink=True);return v
parts=[bpy.data.objects[n] for n in names]
collisions=[]
for i,a in enumerate(parts):
    for b in parts[i+1:]:
        v=intersection(a,b)
        if v>0.01:collisions.append({'a':a.name,'b':b.name,'mm3':v})
top=max(-v.y for v in bounds(tray))
lid_inner=min(-v.y for v in bounds(bpy.data.objects['main_lid']))
bpy.ops.mesh.primitive_cube_add(size=1,location=(0,-(top+10),0))
pcb=bpy.context.object;pcb.dimensions=(30,20,24)
bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
bodyhits={o.name:intersection(pcb,o) for o in parts}
hardware=[]
for x in (-15,15):
    for z in (-25,25):
        # Prior provisional stack: head behind floor, shaft D0..14;
        # upper nut/washer ends within D14. No actual stock hardware measured.
        for role,radius,lo,hi in [('shaft',1.5,0,14),('nut_washer',3.5,9,12.4)]:
            bpy.ops.mesh.primitive_cylinder_add(vertices=64,radius=radius,depth=hi-lo,
                location=(x,-(lo+hi)/2,z),rotation=(math.pi/2,0,0))
            probe=bpy.context.object
            hits={o.name:intersection(probe,o) for o in parts}
            pcbhit=intersection(probe,pcb)
            hardware.append({'axis_mm':[x,z],'role':role,'printed_hits_mm3':hits,
                             'pcb_reservation_hit_mm3':pcbhit,
                             'pass':all(v<0.01 for v in hits.values()) and pcbhit<0.01})
            bpy.data.objects.remove(probe,do_unlink=True)
report={'pass':not collisions and all(v<0.01 for v in bodyhits.values()),
        'assumed_hardware_checks':hardware,
        'replaced_spacers':4,'tray_top_depth_mm':top,'lid_inner_depth_mm':lid_inner,
        'gross_clearance_mm':lid_inner-top,'stack20_margin_mm':lid_inner-top-20,
        'printed_part_collisions':collisions,'reservation_intersections_mm3':bodyhits,
        'candidate_hardware':'four M3x14, 9mm grip, 13.4mm minimum under prior assumptions',
        'limits':['Assumed shaft/nut envelopes only; no head/tool/actual hardware validation','No insulation,connector or actual PCB validation']}
report['pass']=report['pass'] and all(h['pass'] for h in hardware)
(out/'low-tray-installed-checks.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report))
if not report['pass']:raise SystemExit(1)
