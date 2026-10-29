"""Exported-STL top-surface checks for nominal bolt stacks, not real metrology."""
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
checks=[]
specs=[('thermal_angled_hood',[(x,y,16+(y-3.6)*math.tan(math.pi/12)-0.3) for x in (-40,40) for y in (-13,13)]),
       ('thermal_raised_cradle',[(x,y,9.2+y*math.tan(math.pi/12)) for x in (-30,30) for y in (-9,9)]),
       ('sht_mount_arm',[(80,y,13) for y in (-12,12)]),
       ('tray_spacer_6mm',[(0,0,6)])]
for name,seats in specs:
    bpy.ops.import_mesh.stl(filepath=str(out/(name+'.stl')))
    obj=bpy.context.object
    for x,y,z in seats:
        # Outside clearance bore; within intended bearing annulus.
        hit,p,n,_=obj.ray_cast(Vector((x+2.3,y,60)),Vector((0,0,-1)))
        checks.append({'part':name,'xy_mm':[x,y],'expected_top_mm':z,
                       'stl_top_mm':p.z if hit else None,
                       'pass':hit and abs(p.z-z)<0.025})
report={'method':'One annular downward STL ray per stack; not whole-seat or physical engagement proof',
        'checks':checks,'pass':all(c['pass'] for c in checks)}
report['input_stl_sha256']={name:hashlib.sha256((out/(name+'.stl')).read_bytes()).hexdigest() for name,_ in specs}
(out/'grip-surface-checks.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report))
if not report['pass']:
    raise SystemExit(1)
