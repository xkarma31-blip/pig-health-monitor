"""Finite corridor and retained material checks on exported O carrier."""
import bpy
import bmesh
import json
import hashlib
import os
from pathlib import Path

root=Path(__file__).resolve().parent
out=root/os.environ.get('PIGPULSE_REVISION','revision-o')
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_mesh.stl(filepath=str(out/'microphone_strap_carrier.stl'))
carrier=bpy.context.object

def box(dims,pos):
    bpy.ops.mesh.primitive_cube_add(size=1,location=pos)
    obj=bpy.context.object;obj.dimensions=dims
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return obj

def intersect(a,b):
    obj=a.copy();obj.data=a.data.copy();bpy.context.collection.objects.link(obj)
    bpy.context.view_layer.objects.active=obj
    mod=obj.modifiers.new('Intersection probe','BOOLEAN');mod.operation='INTERSECT';mod.solver='EXACT';mod.object=b
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bm=bmesh.new();bm.from_mesh(obj.data);volume=abs(bm.calc_volume());bm.free()
    bpy.data.objects.remove(obj,do_unlink=True)
    return volume

checks=[]
for sign in (-1,1):
    # Straight slot leg joins the escape corridor at x=10..10.5,z=2..2.8.
    # Overlapping straight envelopes do not model a real curved tie bend.
    leg=box((0.8,4,3.2),(sign*10.1,0,1.6))
    leg_overlap=intersect(carrier,leg)
    checks.append({'side':sign,'slot_leg_overlap_mm3':leg_overlap,'pass':leg_overlap<0.001})
    bpy.data.objects.remove(leg,do_unlink=True)
    # From inside through-slot to beyond edge; 4mm-wide,0.8mm-thick tail envelope.
    corridor=box((3.8,4,0.8),(sign*11.9,0,2.4))
    overlap=intersect(carrier,corridor)
    controls=[]
    for x in (10.9,12.9):
        wall=box((0.3,4,0.8),(sign*x,0,2.4))
        controls.append(intersect(wall,corridor)>0.1)
        bpy.data.objects.remove(wall,do_unlink=True)
    checks.append({'side':sign,'corridor_overlap_mm3':overlap,'blocked_junction_and_edge_controls':controls,
                   'pass':overlap<0.001 and all(controls)})
    bpy.data.objects.remove(corridor,do_unlink=True)
    floor=box((1,4,1.2),(sign*12,0,0.9))
    retained=intersect(carrier,floor)
    checks.append({'side':sign,'floor_probe_volume_mm3':4.8,'retained_mm3':retained,'pass':abs(retained-4.8)<0.01})
    bpy.data.objects.remove(floor,do_unlink=True)
# Bolt-bearing annuli sampled independently from channel clearances.
from mathutils import Vector
import math
for x in (-10,10):
    for y in (-10,10):
        good=True
        for i in range(24):
            angle=i*math.tau/24
            hit,p,normal,_=carrier.ray_cast(Vector((x+2.5*math.cos(angle),y+2.5*math.sin(angle),5)),Vector((0,0,-1)))
            good=good and hit and abs(p.z-3)<0.025 and normal.z>0.999
        checks.append({'bolt_axis':[x,y],'annulus_radius_mm':2.5,'pass':bool(good)})
report={'pass':all(c['pass'] for c in checks),'checks':checks,
        'limits':'Finite straight tail corridor only; no actual tie dimensions,bend,locking head,board or acoustic coupling verified. Floor probe is selected region,not whole-part strength.'}
report['input_stl_sha256']=hashlib.sha256((out/'microphone_strap_carrier.stl').read_bytes()).hexdigest()
(out/'strap-corridor-checks.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report))
if not report['pass']:raise SystemExit(1)
