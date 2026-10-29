"""Research-informed reservation boxes, NOT fitted electronics or print exports."""
import bpy
import bmesh
import json
import hashlib
import math
from pathlib import Path

root=Path(__file__).resolve().parent
out=root/'revision-p'
bpy.ops.wm.open_mainfile(filepath=str(out/'assembled-review.blend'))
inventory=json.loads((out/'assembly-checks.json').read_text())['installed_inventory']['expected']

def overlap(a,b):
    obj=a.copy();obj.data=a.data.copy();bpy.context.collection.objects.link(obj)
    for mod in list(obj.modifiers):obj.modifiers.remove(mod)
    bpy.context.view_layer.objects.active=obj
    mod=obj.modifiers.new('Reservation intersection','BOOLEAN');mod.operation='INTERSECT';mod.solver='EXACT';mod.object=b
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bm=bmesh.new();bm.from_mesh(obj.data);v=abs(bm.calc_volume(signed=True));bm.free()
    bpy.data.objects.remove(obj,do_unlink=True)
    return v

# World X,width; -Y forward depth; Z vertical. Body boxes deliberately omit
# acoustic gasket/optical geometry. Candidate seats are hypotheses, not approval.
cases=[('esp_body',(30,12,24),(0,-18,0)),
       ('esp_socketed',(30,20,24),(0,-22,0)),
       ('esp_socketed_low_profile_tray_hypothesis',(30,20,24),(0,-19,0)),
       ('mic_left_body',(22,12,20),(-24,-21,-80)),
       ('mic_right_body',(22,12,20),(24,-21,-80)),
       ('sht_body',(30,12,24),(80,-12,61)),
       ('thermal_body',(34,16,24),(0,-27,80))]
results=[]
for name,dims,pos in cases:
    tray=bpy.data.objects['electronics_strap_tray']
    original_tray=tray.location.copy()
    if name=='esp_socketed_low_profile_tray_hypothesis':
        tray.location.y+=3
        bpy.context.view_layer.update()
    bpy.ops.mesh.primitive_cube_add(size=1,location=pos)
    obj=bpy.context.object;obj.dimensions=dims
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if name=='thermal_body':obj.rotation_euler.x=math.radians(15)
    hits={n:overlap(obj,bpy.data.objects[n]) for n in inventory}
    results.append({'name':name,'reservation_mm':dims,'world_center_mm':pos,
                    'collisions_mm3':{n:v for n,v in hits.items() if v>0.01},
                    'clear_of_printed_parts':all(v<0.01 for v in hits.values())})
    bpy.data.objects.remove(obj,do_unlink=True)
    tray.location=original_tray
    bpy.context.view_layer.update()
report={'status':'Approximate reservation experiment, NOT measured boards or fit certification',
        'results':results,'scene_sha256':hashlib.sha256((out/'assembled-review.blend').read_bytes()).hexdigest(),
        'limits':['Chosen extra allowances are engineering assumptions',
                  'No connector cable bend,fastener protrusion,electrical or antenna approval',
                  'Thermal tilted seat requires separate oriented envelope test']}
(out/'component-reservation-experiment.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report))
