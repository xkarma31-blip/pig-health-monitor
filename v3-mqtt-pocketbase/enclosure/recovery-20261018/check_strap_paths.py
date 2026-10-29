"""Probe face material behind microphone carrier slots; no fitted board claim."""
import bpy
import json
from pathlib import Path
from mathutils import Vector

out=Path(__file__).resolve().parent/'revision-n'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_mesh.stl(filepath=str(out/'acoustic_face.stl'))
face=bpy.context.object
results=[]
# Carrier upper surface and face underside coincide at assembled depth30.
# Face local Z=0 is that mating plane. Probe whether slots exit onto solid face.
for center in (-24,24):
    for slot in (-10,10):
        hits=[]
        for y in (-3,0,3):
            hit,p,_,_=face.ray_cast(Vector((center+slot,y,-0.1)),Vector((0,0,1)),distance=3.2)
            hits.append({'y_mm':y,'blocked_by_face':hit,'entry_z_mm':p.z if hit else None})
        results.append({'carrier_center_x_mm':center,'slot_local_x_mm':slot,'samples':hits})
report={'assumption':'Carrier face-side surface coincides with acoustic face underside; probe slot exits only,not complete strap path.',
        'slots':results,'all_slot_exits_blocked':all(s['blocked_by_face'] for r in results for s in r['samples']),
        'physical_fit_tested':False}
(out/'strap-slot-exit-probes.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report))
