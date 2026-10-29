"""Sensitivity sweep, not optical free-zone or measured device certification."""
import bpy
import json
import math
import runpy
from pathlib import Path
from mathutils import Matrix

root=Path(__file__).resolve().parent
data=runpy.run_path(str(root/'check_optical_cone.py'))
axis=data['axis'];horizontal=data['horizontal'];vertical=data['vertical']
center=data['center'];objects=data['objects']
results=[]
for fov in ((110,75),(55,35)):
    for setback in (9.5,12,16):
        pupil=center-axis*setback
        for yaw,pitch in ((0,0),(-5,0),(5,0),(0,-5),(0,5)):
            # Individual X/Y extrema; not a claim of independent combined limits.
            rotation=Matrix.Rotation(math.radians(yaw),3,vertical) @ Matrix.Rotation(math.radians(pitch),3,horizontal)
            blocked=0
            for i in range(21):
                for j in range(21):
                    u=(i/20*2-1)*math.tan(math.radians(fov[0]/2))
                    v=(j/20*2-1)*math.tan(math.radians(fov[1]/2))
                    direction=(rotation@(axis+horizontal*u+vertical*v)).normalized()
                    if any(obj.ray_cast(pupil,direction,distance=100)[0] for _,obj in objects):
                        blocked+=1
            results.append({'nominal_fov_deg':fov,'setback_mm':setback,
                            'yaw_deg':yaw,'pitch_deg':pitch,'rays':441,'blocked_rays':blocked})
report={'basis':'Melexis rev12 FOV options and up to5degree pointing from normal; individual-axis sensitivity sweep only. Nominal FOV uses50percent sensitivity,not hard optical boundary.',
        'limitations':['Actual lens variant,pupil,orientation and assembly tolerance unknown',
                       'No sensitivity tails,radiometry,finite pupil,PCB,cables or hardware model',
                       'Zero ray obstruction is NOT physical FOV or temperature accuracy proof'],
        'results':results}
report['provenance']=data['provenance']
(root/'revision-n/optical-alignment-sweep.json').write_text(json.dumps(report,indent=2))
print(json.dumps({'cases':len(results),'blocked_cases':[r for r in results if r['blocked_rays']]}))
offset_results=[]
for setback in (9.5,12,16):
    for dx,dy in ((-2,0),(2,0),(0,-2),(0,2)):
        pupil=center-axis*setback+horizontal*dx+vertical*dy
        for yaw,pitch in ((0,0),(-5,0),(5,0),(0,-5),(0,5)):
            rotation=Matrix.Rotation(math.radians(yaw),3,vertical) @ Matrix.Rotation(math.radians(pitch),3,horizontal)
            blocked=0
            for i in range(21):
                for j in range(21):
                    u=(i/20*2-1)*math.tan(math.radians(55))
                    v=(j/20*2-1)*math.tan(math.radians(37.5))
                    direction=(rotation@(axis+horizontal*u+vertical*v)).normalized()
                    if any(obj.ray_cast(pupil,direction,distance=100)[0] for _,obj in objects):
                        blocked+=1
            offset_results.append({'setback_mm':setback,'offset_horizontal_mm':dx,
                                   'offset_vertical_mm':dy,'yaw_deg':yaw,'pitch_deg':pitch,
                                   'rays':441,'blocked_rays':blocked})
offset_report={'basis':'Exploratory wide-FOV placement sensitivity: chosen2mm offsets,not measured tolerances. Individual angular extremes,not exhaustive combined worst case.',
               'limitations':report['limitations'],'results':offset_results}
offset_report['provenance']=data['provenance']
(root/'revision-n/optical-offset-sweep.json').write_text(json.dumps(offset_report,indent=2))
print(json.dumps({'offset_cases':len(offset_results),'blocked_cases':sum(r['blocked_rays']>0 for r in offset_results)}))
