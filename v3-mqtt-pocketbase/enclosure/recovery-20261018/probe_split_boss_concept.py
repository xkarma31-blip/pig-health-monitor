"""Non-release split-boss feasibility coupon using preserved O exported parts.
No source STL replacement; geometry experiment only, not approved closure.
"""
import bpy
import bmesh
import json
import hashlib
import math
import os
from pathlib import Path
from mathutils import Vector

root=Path(__file__).resolve().parent
revision=os.environ.get('PIGPULSE_REVISION','revision-o')
installed=revision=='revision-p'
axis_x=-65.5 if installed else -64
out=root/revision/'split-boss-experiment'
out.mkdir(exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)

def boolean(obj,cut,operation):
    bpy.context.view_layer.objects.active=obj
    mod=obj.modifiers.new('Concept '+operation,'BOOLEAN')
    mod.operation=operation;mod.solver='EXACT';mod.object=cut
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(cut,do_unlink=True)

reports=[]
objects={}
for name,z0,height in [('main_tub',26,4),('main_lid',0,3)]:
    bpy.ops.import_mesh.stl(filepath=str(root/revision/(name+'.stl')))
    obj=bpy.context.object
    for y in (() if installed else (-32,32)):
        bpy.ops.mesh.primitive_cube_add(size=1,location=(-62,y,z0+height/2))
        ear=bpy.context.object;ear.dimensions=(12,14,height)
        bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
        # Bevel only vertical edges: keep head/nut bearing planes flat to edge.
        weights=ear.data.attributes.new('bevel_weight_edge','FLOAT','EDGE')
        for edge in ear.data.edges:
            a,b=(ear.data.vertices[i].co for i in edge.vertices)
            weights.data[edge.index].value=1.0 if abs(a.z-b.z)>0.1 and abs(a.x-b.x)<1e-6 and abs(a.y-b.y)<1e-6 else 0.0
        bevel=ear.modifiers.new('Rounded concept ear','BEVEL');bevel.limit_method='WEIGHT';bevel.width=1;bevel.segments=4
        bpy.context.view_layer.objects.active=ear
        bpy.ops.object.modifier_apply(modifier=bevel.name)
        boolean(obj,ear,'UNION')
        bpy.ops.mesh.primitive_cylinder_add(vertices=64,radius=1.7,depth=12,location=(-64,y,z0+height/2))
        boolean(obj,bpy.context.object,'DIFFERENCE')
    bm=bmesh.new();bm.from_mesh(obj.data)
    unseen=set(bm.verts);components=0
    while unseen:
        components+=1;stack=[unseen.pop()]
        while stack:
            for edge in stack.pop().link_edges:
                for vertex in edge.verts:
                    if vertex in unseen:unseen.remove(vertex);stack.append(vertex)
    reports.append({'part':name,'connected_components':components,
                    'nonmanifold_edges':sum(not e.is_manifold for e in bm.edges),
                    'volume_mm3':abs(bm.calc_volume(signed=True))})
    bm.free()
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True)
    bpy.context.view_layer.objects.active=obj
    bpy.ops.export_mesh.stl(filepath=str(out/(name+'-concept.stl')),use_selection=True)
    bpy.data.objects.remove(obj,do_unlink=True)
    bpy.ops.import_mesh.stl(filepath=str(out/(name+'-concept.stl')))
    objects[name]=bpy.context.object

def intersection(a,b):
    copy=a.copy();copy.data=a.data.copy();bpy.context.collection.objects.link(copy)
    cutter=b.copy();cutter.data=b.data.copy();bpy.context.collection.objects.link(cutter)
    boolean(copy,cutter,'INTERSECT')
    bm=bmesh.new();bm.from_mesh(copy.data);v=abs(bm.calc_volume(signed=True));bm.free()
    bpy.data.objects.remove(copy,do_unlink=True)
    return v

tub=objects['main_tub'];lid=objects['main_lid']
# Known translated overlap controls exercise world-space boolean semantics.
controls=[]
for offset,expected in ((1,4),(5,0)):
    bpy.ops.mesh.primitive_cube_add(size=2,location=(100,100,100));a=bpy.context.object
    bpy.ops.mesh.primitive_cube_add(size=2,location=(100+offset,100,100));b=bpy.context.object
    measured=intersection(a,b)
    controls.append({'translation_mm':offset,'expected_mm3':expected,'measured_mm3':measured,'pass':abs(measured-expected)<0.001})
    bpy.data.objects.remove(a,do_unlink=True);bpy.data.objects.remove(b,do_unlink=True)
sweep=[]
for distance in (0,0.05,0.5,2,5,15,35):
    lid.location.z=30+distance
    bpy.context.view_layer.update()
    sweep.append({'lift_mm':distance,'intersection_mm3':intersection(tub,lid)})
lid.location.z=30
bpy.context.view_layer.update()
hardware=[]
bores=[]
seats=[]
for y in (-32,32):
    for name,z,direction,outer in [('main_tub',26,1,3.5),('main_lid',33,-1,3)]:
        obj=objects[name];samples=[]
        for radius in (2,outer-0.05):
            for i in range(48):
                a=2*math.pi*i/48
                start=Vector((axis_x+radius*math.cos(a),y+radius*math.sin(a),z-direction*0.5))
                local=obj.matrix_world.inverted()@start
                hit,point,normal,_=obj.ray_cast(local,Vector((0,0,direction)))
                world=obj.matrix_world@point
                samples.append(bool(hit and abs(world.z-z)<0.02 and abs(normal.z)>0.999))
        seats.append({'part':name,'station_y_mm':y,'outer_radius_mm':outer,'samples':len(samples),'pass':all(samples)})
    bpy.ops.mesh.primitive_cylinder_add(vertices=64,radius=1.5,depth=9,location=(axis_x,y,29.5))
    shaft=bpy.context.object
    bores.append({'station_y_mm':y,'shaft_radius_mm':1.5,
                  'intersection_mm3':{n:intersection(shaft,o) for n,o in objects.items()}})
    bpy.data.objects.remove(shaft,do_unlink=True)
    for role,radius,z,height in [('head',3,33,2.4),('nut',3.5,23,3),('driver',3.5,35.4,30)]:
        bpy.ops.mesh.primitive_cylinder_add(vertices=64,radius=radius,depth=height,location=(axis_x,y,z+height/2))
        probe=bpy.context.object
        hardware.append({'station_y_mm':y,'role':role,'radius_mm':radius,'depth_range_mm':[z,z+height],
                         'intersection_mm3':{n:intersection(probe,o) for n,o in objects.items()}})
        bpy.data.objects.remove(probe,do_unlink=True)
report={'status':'installed P exported geometry local audit; release candidate' if installed else 'experiment only; not installed or released geometry',
        'ear_bounds_x_mm':[-70,-56] if installed else [-68,-56],'bore_x_mm':axis_x,'bore_y_mm':[-32,32],
        'tub_ear_depth_mm':[26,30],'lid_ear_depth_mm':[0,3],
        'checks':reports,'sampled_lid_lift':sweep,'assumed_hardware_envelopes':hardware,'aligned_shaft_probes':bores,'bearing_seats':seats,
        'boolean_controls':controls,
        'input_sha256':{n:hashlib.sha256((root/revision/(n+'.stl')).read_bytes()).hexdigest() for n in objects},
        'output_sha256':{n:hashlib.sha256((out/(n+'-concept.stl')).read_bytes()).hexdigest() for n in objects},
        'limitations':['No load or print fit test','No sealing claim',
        'Hardware envelopes assumed; no full installed assembly audit',
        'Visible side-boss function in poster unknown']}
(out/'concept-checks.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report))
if not all(s['pass'] for s in seats+controls) or any(r['connected_components']!=1 or r['nonmanifold_edges'] for r in reports) or any(s['intersection_mm3']>0.01 for s in sweep) or any(v>0.01 for h in hardware+bores for v in h['intersection_mm3'].values()):
    raise SystemExit(1)
