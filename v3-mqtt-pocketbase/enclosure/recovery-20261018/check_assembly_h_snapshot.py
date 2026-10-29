"""Read-only assembly intersection audit; temporary boolean copies only."""
import bpy
import bmesh
import json
import os
from pathlib import Path
from mathutils import Vector

out=Path(__file__).resolve().parent/os.environ.get('PIGPULSE_REVISION','revision-h')
bpy.ops.wm.open_mainfile(filepath=str(out/'assembled-review.blend'))

def bounds(o):
    vs=[o.matrix_world@Vector(v) for v in o.bound_box]
    return {'min':[min(v[k] for v in vs) for k in range(3)],
            'max':[max(v[k] for v in vs) for k in range(3)]}

def overlap(a,b):
    a=bpy.data.objects[a];b=bpy.data.objects[b]
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
installed=[o for o in bpy.data.objects if o.type=='MESH' and not o.hide_render
           and not o.name.startswith(('PURCHASED_','REFERENCE_'))]
all_checks=[]
for i,a in enumerate(installed):
    for b in installed[i+1:]:
        aa,bb=bounds(a),bounds(b)
        if all(min(aa['max'][k],bb['max'][k])-max(aa['min'][k],bb['min'][k])>0.0001 for k in range(3)):
            all_checks.append({'a':a.name,'b':b.name,'overlap_mm3':overlap(a.name,b.name)})
report['installed_part_count']=len(installed)
report['all_broadphase_candidate_pairs']=all_checks
report['all_installed_intersection_gate']=all(x['overlap_mm3']<0.01 for x in all_checks)
(out/'assembly-checks.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report))
