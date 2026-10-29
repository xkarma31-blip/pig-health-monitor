"""Ray-check actual exported screw bearing annuli, independent of mesh topology.
Assumed head/washer radius 3mm; no physical fastener measurement claimed.
"""
import bpy
import json
import math
import os
import hashlib
from pathlib import Path
from mathutils import Vector

root=Path(__file__).resolve().parent
out=root/os.environ.get('PIGPULSE_REVISION','revision-o')
bpy.ops.wm.read_factory_settings(use_empty=True)
results=[]
for name,coords in [('thermal_raised_cradle',[(x,y) for x in (-30,30) for y in (-9,9)]),
                    ('thermal_angled_hood',[(x,y) for x in (-40,40) for y in (-13,13)])]:
    bpy.ops.import_mesh.stl(filepath=str(out/(name+'.stl')))
    o=bpy.context.object
    for x,y in coords:
        expected=(9.2+y*math.tan(math.radians(15))) if name=='thermal_raised_cradle' else (16+(y-3.6)*math.tan(math.radians(15))-0.3)
        samples=[]
        for radius in (2.1,2.6,3.0):
            for i in range(24):
                angle=i*2*math.pi/24
                hit,point,normal,_=o.ray_cast(Vector((x+radius*math.cos(angle),y+radius*math.sin(angle),60)),Vector((0,0,-1)))
                samples.append({'hit':hit,'height':point.z if hit else None,
                                'flat_normal':normal.z>0.999 if hit else False})
        good=all(s['hit'] and abs(s['height']-expected)<0.025 and s['flat_normal'] for s in samples)
        results.append({'part':name,'center':[x,y],'expected_seat_z_mm':expected,
                        'sample_count':len(samples),'bearing_pass':good,
                        'failed_samples':[s for s in samples if not(s['hit'] and abs(s['height']-expected)<0.025 and s['flat_normal'])]})
report={'assumption':'2.1–3mm radial annulus, 24 samples per radius; 0.025mm height tolerance; normal Z>0.999',
        'pass':all(r['bearing_pass'] for r in results),'results':results}
report['input_sha256']={name:hashlib.sha256((out/(name+'.stl')).read_bytes()).hexdigest() for name in ('thermal_raised_cradle','thermal_angled_hood')}
(out/'bearing-seat-checks.json').write_text(json.dumps(report,indent=2))
print(json.dumps({'pass':report['pass'],'failed':[r['part']+str(r['center']) for r in results if not r['bearing_pass']]}))
if not report['pass']:
    raise SystemExit(1)
