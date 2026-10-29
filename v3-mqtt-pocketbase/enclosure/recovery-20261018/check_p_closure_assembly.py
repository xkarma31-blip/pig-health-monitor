"""Installed P closure service envelopes. Assumed hardware, not physical fit."""
import bpy
import bmesh
import math
import json
import hashlib
from pathlib import Path
from mathutils import Vector

root=Path(__file__).resolve().parent
out=root/'revision-p'
bpy.ops.wm.open_mainfile(filepath=str(out/'assembled-review.blend'))
assembly=json.loads((out/'assembly-checks.json').read_text())
inventory=assembly['installed_inventory']['expected']
if assembly['scene_sha256']!=hashlib.sha256((out/'assembled-review.blend').read_bytes()).hexdigest():
    raise RuntimeError('Stale assembly report')

def overlap(a,b):
    aa=[a.matrix_world@Vector(v) for v in a.bound_box]
    bb=[b.matrix_world@Vector(v) for v in b.bound_box]
    if any(min(max(v[k] for v in aa),max(v[k] for v in bb))-max(min(v[k] for v in aa),min(v[k] for v in bb))<=0.0001 for k in range(3)):
        return 0.0
    obj=a.copy();obj.data=a.data.copy();bpy.context.collection.objects.link(obj)
    # Rendering-only normal modifiers must not precede geometric audit Boolean.
    for modifier in list(obj.modifiers):obj.modifiers.remove(modifier)
    bpy.context.view_layer.objects.active=obj
    mod=obj.modifiers.new('Service envelope intersection','BOOLEAN')
    mod.operation='INTERSECT';mod.solver='EXACT';mod.object=b
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bm=bmesh.new();bm.from_mesh(obj.data)
    volume=abs(bm.calc_volume(signed=True));bm.free()
    bpy.data.objects.remove(obj,do_unlink=True)
    return volume

checks=[]
required={'main_tub','main_lid','thermal_tub','thermal_face','thermal_angled_hood',
          'thermal_raised_cradle','acoustic_tub','acoustic_face','mounting_spine',
          'sht_mount_arm','sht_adjustable_carrier','electronics_strap_tray',
          'microphone_strap_carrier','microphone_strap_carrier.001',
          'acoustic_trim','acoustic_trim.001'}|{'tray_spacer_6mm.%03d'%i for i in range(1,5)}
if set(inventory)!=required or len(inventory)!=20 or any(n not in bpy.data.objects or bpy.data.objects[n].hide_render for n in inventory):
    raise RuntimeError('Incomplete installed inventory')
for station in (-32,32):
    # Local depth D becomes world -Y. Nut tool is deliberately independent
    # of the previously checked front driver envelope.
    for role,radius,lo,hi in [('head_washer',3,33,35.4),('front_driver',3.5,35.4,65.4),
                              ('rear_nut_tool',5,3,23),
                              ('nut',3.5,23,26)]:
        bpy.ops.mesh.primitive_cylinder_add(vertices=64,radius=radius,depth=hi-lo,
            location=(-65.5,-(lo+hi)/2,station),rotation=(math.pi/2,0,0))
        probe=bpy.context.object
        hits={n:overlap(probe,bpy.data.objects[n]) for n in inventory}
        checks.append({'station_mm':station,'role':role,'radius_mm':radius,
                       'depth_interval_mm':[lo,hi],'intersections_mm3':hits,
                       'pass':all(v<0.01 for v in hits.values())})
        bpy.data.objects.remove(probe,do_unlink=True)
lid=bpy.data.objects['main_lid'];initial=lid.location.copy()
lifts=[]
# Removed fasteners assumed. Sampled positions, not continuous path proof.
for distance in (0.05,0.5,2,5,15,35):
    lid.location.y=initial.y-distance
    bpy.context.view_layer.update()
    hits={n:overlap(lid,bpy.data.objects[n]) for n in inventory if n!='main_lid'}
    lifts.append({'lift_mm':distance,'intersections_mm3':hits,
                  'pass':all(v<0.01 for v in hits.values())})
lid.location=initial
report={'pass':all(c['pass'] for c in checks+lifts),'hardware_checks':checks,
        'sampled_installed_lid_lifts':lifts,
        'scene_sha256':hashlib.sha256((out/'assembled-review.blend').read_bytes()).hexdigest(),
        'limits':['Assumed cylindrical tools, no handle/finger/access approach proof',
                  'Printable inventory only; electronics and purchased hardware excluded',
                  'Fasteners removed before lid lift','Discrete samples, not continuous swept volume',
                  'No actual hardware, strength or physical fit test']}
(out/'closure-installed-service-checks.json').write_text(json.dumps(report,indent=2))
print(json.dumps({'pass':report['pass'],'failed':[c for c in checks+lifts if not c['pass']]}))
if not report['pass']:raise SystemExit(1)
