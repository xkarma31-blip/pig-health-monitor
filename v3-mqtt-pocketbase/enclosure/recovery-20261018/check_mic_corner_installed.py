"""Research corner carrier replacement; not physical/acoustic fit approval."""
import bpy
import bmesh
import math
import json
from pathlib import Path
from mathutils import Vector

root=Path(__file__).resolve().parent
out=root/'research-adapters'
import os
import hashlib
combined=os.environ.get('PIGPULSE_COMBINED_MIC_CHECK')=='1'
right=os.environ.get('PIGPULSE_MIC_SIDE')=='right'
offset=24 if right else -24
scene_path=Path(os.environ.get('PIGPULSE_MIC_SCENE',str(out/'combined-research-candidate.blend' if combined else root/'revision-p/assembled-review.blend')))
bpy.ops.wm.open_mainfile(filepath=str(scene_path))
inventory=json.loads((root/'revision-p/assembly-checks.json').read_text())['installed_inventory']['expected']
if combined:
    support=bpy.data.objects['microphone_strap_carrier.001' if right else 'microphone_strap_carrier']
else:
    bpy.ops.import_mesh.stl(filepath=str(out/'mic_14x12_corner_support.stl'))
    support=bpy.context.object
if combined and os.environ.get('PIGPULSE_TEST_MIC_TRANSFORM')=='1':
    support.location.x+=1
# Flip local depth, so base occupies D27..30 and supports rise REARWARD.
if not combined:
    support.rotation_euler=(-math.pi/2,0,0)
    support.location=(offset,-30,-80)
bpy.context.view_layer.update()
transform_ok=(support.location-Vector((offset,-30,-80))).length<0.001 and all(
    abs(a-b)<0.00001 for a,b in zip(support.rotation_euler,(-math.pi/2,0,0)))

def volume(a,b):
    aa=[a.matrix_world@Vector(v) for v in a.bound_box];bb=[b.matrix_world@Vector(v) for v in b.bound_box]
    if any(min(max(v[k] for v in aa),max(v[k] for v in bb))-max(min(v[k] for v in aa),min(v[k] for v in bb))<0.0001 for k in range(3)):return 0
    c=a.copy();c.data=a.data.copy();bpy.context.collection.objects.link(c)
    for mod in list(c.modifiers):c.modifiers.remove(mod)
    bpy.context.view_layer.objects.active=c
    m=c.modifiers.new('audit','BOOLEAN');m.operation='INTERSECT';m.solver='EXACT';m.object=b
    bpy.ops.object.modifier_apply(modifier=m.name)
    bm=bmesh.new();bm.from_mesh(c.data);v=abs(bm.calc_volume(signed=True));bm.free()
    bpy.data.objects.remove(c,do_unlink=True);return v

excluded='microphone_strap_carrier.001' if right else 'microphone_strap_carrier'
hits={n:volume(support,bpy.data.objects[n]) for n in inventory if n!=excluded}
# PCB body starts at seat D19, extends rearward. No component/port claim.
board=bpy.data.objects.new('research_PCB',None)
bpy.ops.mesh.primitive_cube_add(size=1,location=(offset,-18.2,-80))
pcb=bpy.context.object;pcb.dimensions=(14,1.6,12)
bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
boardhits={n:volume(pcb,bpy.data.objects[n]) for n in inventory if n!=excluded}
bearing=[]
contact_patches=[]
# A finite thin witness replaces point-only bearing evidence. Intersect both
# nominal board footprint and seat; divide volume by the 0.02mm witness depth.
for x in (-6.25,6.25):
    for y in (-5.25,5.25):
        local=Vector((x,y,10.99))
        world=support.matrix_world@local
        bpy.ops.mesh.primitive_cube_add(size=1,location=world)
        witness=bpy.context.object
        witness.dimensions=(1.5,0.02,1.5)
        bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
        area=volume(witness,support)/0.02
        contact_patches.append({'local_xy_mm':[x,y],'seat_area_mm2':area,
                                'pass':2.20<area<2.30})
        bpy.data.objects.remove(witness,do_unlink=True)
tunnels=[]
for sign in (-1,1):
    for y in (-5.25,5.25):
        clear=[]
        for dy in (-0.3,0,0.3):
            for dz in (-0.5,0,0.5):
                hit,_,_,_=support.ray_cast(Vector((sign*10,y+dy,9.5+dz)),Vector((-sign,0,0)),distance=5)
                clear.append(not hit)
        tunnels.append({'side':sign,'y_mm':y,'reserved_section_mm':[0.6,1.0],
                        'probe_count':len(clear),'pass':all(clear)})
for x in (-6.25,6.25):
    for y in (-5.25,5.25):
        # Local seat rays, independent of world installation transform.
        hit,point,normal,_=support.ray_cast(Vector((x,y,12)),Vector((0,0,-1)))
        bearing.append({'xy_mm':[x,y],'hit':bool(hit),'seat_z_mm':point.z if hit else None,
                        'pass':bool(hit and abs(point.z-11)<0.01 and normal.z>0.999)})
hardware=[]
for x in (-10,10):
    for y in (-10,10):
        # Rear of replacement base is D27; existing nominal bolt tail allowance
        # checked through D21. Actual purchased orientation remains provisional.
        bpy.ops.mesh.primitive_cylinder_add(vertices=64,radius=3.5,depth=6,
            location=(offset+x,-24,-80+y),rotation=(math.pi/2,0,0))
        probe=bpy.context.object
        hardware.append({'axis_mm':[x,y],'support_hit_mm3':volume(probe,support),
                         'board_hit_mm3':volume(probe,pcb)})
        bpy.data.objects.remove(probe,do_unlink=True)
report={'status':'research replacement carrier installation',
        'scene_sha256':hashlib.sha256(scene_path.read_bytes()).hexdigest(),
        'checker_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        'saved_transform_valid':transform_ok,
        'finite_contact_patches':contact_patches,
        'through_tunnel_checks':tunnels,
        'assumed_rear_hardware':hardware,
        'sampled_corner_bearing':bearing,
        'support_intersections_mm3':hits,'board_intersections_mm3':boardhits,
        'support_board_intersection_mm3':volume(support,pcb),
        'pass':all(b['pass'] for b in bearing) and all(v<0.01 for v in list(hits.values())+list(boardhits.values())) and volume(support,pcb)<0.01,
        'limits':['PCB body only; no underside component or acoustic port validation',
                  'Existing carrier removed; new fastener grip and retention unfinished',
                  'No gasket or measured acoustic coupling supplied']}
report['pass']=report['pass'] and transform_ok and all(p['pass'] for p in contact_patches) and all(t['pass'] for t in tunnels) and all(h['support_hit_mm3']<0.01 and h['board_hit_mm3']<0.01 for h in hardware)
(out/('mic-corner-right-combined-checks.json' if combined and right else 'mic-corner-combined-checks.json' if combined else 'mic-corner-installed-checks.json')).write_text(json.dumps(report,indent=2))
print(json.dumps(report))
if not report['pass']:raise SystemExit(1)
