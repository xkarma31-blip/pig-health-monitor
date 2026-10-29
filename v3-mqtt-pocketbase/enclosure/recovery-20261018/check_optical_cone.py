"""Ideal cone rays against actual hood STL. Not real sensor FOV validation."""
import bpy
import json
import math
import hashlib
from pathlib import Path
from mathutils import Vector

out=Path(__file__).resolve().parent/'revision-n'
bpy.ops.wm.read_factory_settings(use_empty=True)
objects=[]
for name,offset in [('thermal_angled_hood',0),('thermal_raised_cradle',0),('thermal_face',-3),('thermal_tub',-17)]:
    bpy.ops.import_mesh.stl(filepath=str(out/(name+'.stl')))
    obj=bpy.context.object
    assert all(abs(obj.matrix_world[i][j]-(1 if i==j else 0))<1e-7 for i in range(4) for j in range(4)), 'Nonidentity STL import transform'
    # Common frame: separator front=0,hood bottom=0,tub rear=-17.
    for vertex in obj.data.vertices:
        vertex.co.z+=offset
    objects.append((name,obj))
# Axis normal to 15degree roof, ideal centered pupil; no PCB/lens assembly model.
axis=Vector((0,-math.sin(math.pi/12),math.cos(math.pi/12)))
horizontal=Vector((1,0,0))
vertical=horizontal.cross(axis)
center=Vector((0,0,16))
assert all(abs(v.length-1)<1e-6 for v in (axis,horizontal,vertical))
assert max(abs(axis.dot(horizontal)),abs(axis.dot(vertical)),abs(horizontal.dot(vertical)))<1e-6
by_name=dict(objects)
for name,expected in [('thermal_face',(-3,0)),('thermal_tub',(-17,-3))]:
    actual=(min(v.co.z for v in by_name[name].data.vertices),max(v.co.z for v in by_name[name].data.vertices))
    assert all(abs(a-b)<0.001 for a,b in zip(actual,expected)), 'Unexpected mating planes: '+name
assert not by_name['thermal_angled_hood'].ray_cast(Vector((0,0,40)),Vector((0,0,-1)),distance=30)[0]
assert by_name['thermal_angled_hood'].ray_cast(Vector((30,0,40)),Vector((0,0,-1)),distance=30)[0]
provenance={'blender_version':bpy.app.version_string,
            'input_stl_sha256':{name:hashlib.sha256((out/(name+'.stl')).read_bytes()).hexdigest() for name,_ in objects},
            'controls':'Identity imports,orthonormal basis,mating Z planes,central aperture miss and off-aperture roof hit asserted'}
results=[]
for setback in (5,9.5,12,16,22):
    pupil=center-axis*setback
    hits=[]
    for i in range(21):
        for j in range(21):
            u=(i/20*2-1)*math.tan(math.radians(55))
            v=(j/20*2-1)*math.tan(math.radians(37.5))
            direction=(axis+horizontal*u+vertical*v).normalized()
            for name,obj in objects:
                hit,point,_,_=obj.ray_cast(pupil,direction,distance=100)
                if hit:
                    hits.append({'sample':[i,j],'part':name,'hit_mm':list(point)})
    results.append({'ideal_axis_setback_mm':setback,'rays':441,'blocked_count':len(hits),
                    'unique_blocked_rays':len({tuple(h['sample']) for h in hits}),
                    'part_intersections':{name:sum(h['part']==name for h in hits) for name,_ in objects},
                    'example_hits':hits[:8]})
report={'assumptions':'Centered point pupil,roof-normal axis,ideal110x75degree rectilinear cone; hood,cradle,separator,tub in common construction frame. Counts are part-ray intersections,not unique rays. Setback values exploratory,not measured sensor positions.',
        'results':results,'physical_fov_verified':False}
report['provenance']=provenance
(out/'optical-cone-exploration.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report))
