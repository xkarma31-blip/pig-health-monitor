"""Read-only assembly intersection audit; temporary boolean copies only."""
import bpy
import bmesh
import json
import os
import hashlib
from pathlib import Path
from mathutils import Vector

out=Path(__file__).resolve().parent/os.environ.get('PIGPULSE_REVISION','revision-o')
bpy.ops.wm.open_mainfile(filepath=str(out/'assembled-review.blend'))

def bounds(o):
    vs=[o.matrix_world@Vector(v) for v in o.bound_box]
    return {'min':[min(v[k] for v in vs) for k in range(3)],
            'max':[max(v[k] for v in vs) for k in range(3)]}

def overlap(a,b):
    a=bpy.data.objects[a];b=bpy.data.objects[b]
    aa,bb=bounds(a),bounds(b)
    # Exact coplanar contact can produce boolean solver residue. Reject pairs
    # with no volumetric AABB penetration before invoking that solver.
    if any(min(aa['max'][k],bb['max'][k])-max(aa['min'][k],bb['min'][k])<=0.0001 for k in range(3)):
        return 0.0
    c=a.copy();c.data=a.data.copy();bpy.context.collection.objects.link(c)
    bpy.context.view_layer.objects.active=c
    mod=c.modifiers.new('audit intersection','BOOLEAN')
    mod.operation='INTERSECT';mod.solver='EXACT';mod.object=b
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bm=bmesh.new();bm.from_mesh(c.data)
    vol=abs(bm.calc_volume(signed=True));bm.free()
    bpy.data.objects.remove(c,do_unlink=True)
    return vol

pairs=[('main_tub','main_lid'),('thermal_tub','thermal_face'),
       ('thermal_face','thermal_angled_hood'),('acoustic_tub','acoustic_face'),
       ('mounting_spine','main_tub'),('mounting_spine','thermal_tub'),
       ('mounting_spine','acoustic_tub'),('mounting_spine','sht_mount_arm'),
       ('sht_mount_arm','sht_adjustable_carrier'),('main_tub','electronics_strap_tray'),
       ('thermal_face','thermal_raised_cradle'),('thermal_angled_hood','thermal_raised_cradle'),
       ('acoustic_face','microphone_strap_carrier')]
report={'method':'Exact boolean intersection of assembled exported STL meshes',
        'not_tested':['physical fit','electronic component interference','screw head/nut tool access','self intersections'],
        'parts':{n:bounds(bpy.data.objects[n]) for n in set(sum(([a,b] for a,b in pairs),[]))},
        'pairs':[{'a':a,'b':b,'overlap_mm3':overlap(a,b)} for a,b in pairs]}
report['pair_intersection_gate']=all(x['overlap_mm3']<0.01 for x in report['pairs'])
# Extend beyond hand-selected mating pairs. Broad-phase AABB rejects disjoint
# parts, exact boolean tests each remaining installed printable mesh pair.
expected=['main_tub','main_lid','thermal_tub','thermal_face','thermal_angled_hood',
          'thermal_raised_cradle','acoustic_tub','acoustic_face','mounting_spine',
          'sht_mount_arm','sht_adjustable_carrier','electronics_strap_tray',
          'microphone_strap_carrier','microphone_strap_carrier.001',
          'acoustic_trim','acoustic_trim.001']+['tray_spacer_6mm.%03d'%i for i in range(1,5)]
missing=[n for n in expected if n not in bpy.data.objects]
hidden=[n for n in expected if n in bpy.data.objects and bpy.data.objects[n].hide_render]
report['installed_inventory_gate']=not missing and not hidden
report['installed_inventory']={'expected':expected,'missing':missing,'unexpectedly_hidden':hidden}
installed=[bpy.data.objects[n] for n in expected if n in bpy.data.objects]
all_checks=[]
for i,a in enumerate(installed):
    for b in installed[i+1:]:
        aa,bb=bounds(a),bounds(b)
        if all(min(aa['max'][k],bb['max'][k])-max(aa['min'][k],bb['min'][k])>0.0001 for k in range(3)):
            all_checks.append({'a':a.name,'b':b.name,'overlap_mm3':overlap(a.name,b.name)})
report['installed_part_count']=len(installed)
report['all_broadphase_candidate_pairs']=all_checks
report['all_installed_intersection_gate']=all(x['overlap_mm3']<0.01 for x in all_checks)
# Purchased fastener keep-outs: explicit assumptions, not real hardware meshes.
# Cradle is fixed to the separator BEFORE hood installation; driver path checked
# with hood removed below; installed head envelopes checked with hood fitted.
head_checks=[]
for x in (-30,30):
    for y in (-9,9):
        top=9.2+y*__import__('math').tan(__import__('math').radians(15))
        bpy.ops.mesh.primitive_cylinder_add(vertices=32,radius=3,depth=2.4,
            location=(x,-(17+top+1.2),80+y),rotation=(__import__('math').pi/2,0,0))
        head=bpy.context.object;head.name='AUDIT_cradle_head'
        v=overlap(head.name,'thermal_angled_hood')
        cradle_v=overlap(head.name,'thermal_raised_cradle')
        head_checks.append({'x':x,'local_y':y,'head_radius_mm':3,
            'head_plus_washer_height_mm':2.4,'hood_collision_mm3':v,
            'cradle_collision_above_seat_mm3':cradle_v})
        bpy.data.objects.remove(head,do_unlink=True)
report['cradle_head_envelopes']=head_checks
report['cradle_head_clearance_gate']=all(x['hood_collision_mm3']<0.01 and x['cradle_collision_above_seat_mm3']<0.01 for x in head_checks)
driver_checks=[]
for x in (-30,30):
    for y in (-9,9):
        top=9.2+y*__import__('math').tan(__import__('math').radians(15))
        # Conservative cylindrical shaft envelope above installed head; no hood
        # because sequence explicitly installs cradle before fitting hood.
        bpy.ops.mesh.primitive_cylinder_add(vertices=64,radius=3.5,depth=40,
            location=(x,-(17+top+2.4+20),80+y),rotation=(__import__('math').pi/2,0,0))
        tool=bpy.context.object;tool.name='AUDIT_driver'
        hits={n:overlap(tool.name,n) for n in ('thermal_raised_cradle','thermal_face','thermal_tub')}
        driver_checks.append({'x':x,'local_y':y,'radius_mm':3.5,'length_mm':40,'collisions_mm3':hits})
        bpy.data.objects.remove(tool,do_unlink=True)
report['cradle_driver_envelopes']=driver_checks
report['cradle_driver_gate']=all(v<0.01 for d in driver_checks for v in d['collisions_mm3'].values())
joint_checks=[]
for x in (-12,12):
    bpy.ops.mesh.primitive_cylinder_add(vertices=64,radius=3.5,depth=3,
        location=(x,-1.5,61),rotation=(__import__('math').pi/2,0,0))
    hardware=bpy.context.object;hardware.name='AUDIT_SHT_joint'
    joint_checks.append({'x':x,'height_mm':61,'radius_mm':3.5,'forward_depth_mm':3,
                         'thermal_wall_collision_mm3':overlap(hardware.name,'thermal_tub')})
    bpy.data.objects.remove(hardware,do_unlink=True)
report['sht_joint_hardware_envelopes']=joint_checks
report['sht_joint_hardware_gate']=all(c['thermal_wall_collision_mm3']<0.01 for c in joint_checks)
report['driver_access_assumption']='Hood removed; 7mm diameter x40mm axial cylinder above assumed head. Real driver tip, handle, approach and hand access untested.'
report['scene_sha256']=hashlib.sha256((out/'assembled-review.blend').read_bytes()).hexdigest()
report['scene_imported_stl_sha256']=json.loads(bpy.context.scene.get('imported_stl_sha256','{}'))
report['stl_sha256']={p.stem:hashlib.sha256(p.read_bytes()).hexdigest() for p in out.glob('*.stl')}
report['freshness_limit']='Hashes bind this report to files present during audit; render scene provenance must also be checked against its import manifest.'
(out/'assembly-checks.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report))
