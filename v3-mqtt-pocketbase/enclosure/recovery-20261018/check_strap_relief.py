"""Discrete escape-channel probe; not complete tie bend/head compatibility."""
import bpy
import json
import hashlib
import os
from pathlib import Path
from mathutils import Vector

root=Path(__file__).resolve().parent
reports=[]
target=os.environ.get('PIGPULSE_REVISION','revision-o')
for revision in ('revision-n',target):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_mesh.stl(filepath=str(root/revision/'microphone_strap_carrier.stl'))
    obj=bpy.context.object
    samples=[]
    for sign in (-1,1):
        for x in (11.2,11.8,12.4):
            for y in (-2,0,2):
                hit,p,_,_=obj.ray_cast(Vector((sign*x,y,5)),Vector((0,0,-1)))
                samples.append({'xy':[sign*x,y],'floor_z_mm':p.z if hit else None,
                                'clearance_mm':3-p.z if hit else None,
                                'valid':bool(hit and (1.7<=p.z<=1.9 if revision==target else 2.9<=p.z<=3.1)),
                                'pass':bool(hit and 1.7<=p.z<=1.85)})
    reports.append({'revision':revision,'valid':all(s['valid'] for s in samples),'pass':all(s['pass'] for s in samples),'samples':samples})
report={'method':'18 downward rays through outward escape channels; requires >=1.15mm nominal face-side clearance at sampled locations.',
        'limitations':'Not continuous route proof; tie thickness,width,bend radius and locking head unmeasured. Slot bends and real print fit untested.',
        'results':reports}
report['input_sha256']={r:hashlib.sha256((root/r/'microphone_strap_carrier.stl').read_bytes()).hexdigest() for r in ('revision-n',target)}
(root/target/'strap-relief-comparison.json').write_text(json.dumps(report,indent=2))
print(json.dumps({'negative_control_n':reports[0]['pass'],'repaired_o':reports[1]['pass']}))
if not all(r['valid'] for r in reports) or any(s['pass'] for s in reports[0]['samples']) or not reports[1]['pass']:
    raise SystemExit(1)
