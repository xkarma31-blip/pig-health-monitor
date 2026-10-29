"""Cross-option printed-part collision audit of actual combined candidate."""
import bpy
import bmesh
import json
import os
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parent
OUT=ROOT/'research-adapters'
thermal=os.environ.get('PIGPULSE_THERMAL_VARIANT')
bpy.ops.wm.open_mainfile(filepath=str(OUT/('combined-thermal-candidate.blend' if thermal else 'combined-research-candidate.blend')))
names=json.loads((ROOT/'revision-p/assembly-checks.json').read_text())['installed_inventory']['expected']
if thermal:
    names += [thermal,thermal+'_retainer',thermal+'_retainer.001']
REPORT=OUT/('combined-thermal-checks.json' if thermal else 'combined-research-checks.json')
if os.environ.get('PIGPULSE_TEST_MISSING_PART')=='1':
    bpy.data.objects.remove(bpy.data.objects['main_lid'],do_unlink=True)
missing_thermal=os.environ.get('PIGPULSE_TEST_MISSING_THERMAL')
if thermal and missing_thermal:
    bpy.data.objects.remove(bpy.data.objects[missing_thermal],do_unlink=True)
actual={o.name for o in bpy.context.scene.objects if o.type=='MESH' and not o.hide_render
        and not o.name.startswith(('REFERENCE_','PURCHASED_'))}
inventory_check={'expected':sorted(names),'actual':sorted(actual),
                 'missing':sorted(set(names)-actual),'unexpected':sorted(actual-set(names))}
inventory_check['pass']=not inventory_check['missing'] and not inventory_check['unexpected']
if not inventory_check['pass']:
    REPORT.write_text(json.dumps(
        {'pass':False,'inventory_check':inventory_check},indent=2))
    raise SystemExit(1)
parts=[bpy.data.objects[n] for n in names]
def overlap(a,b):
    bpy.context.view_layer.update()
    aa=[a.matrix_world@Vector(v) for v in a.bound_box]
    bb=[b.matrix_world@Vector(v) for v in b.bound_box]
    if any(min(max(v[k] for v in aa),max(v[k] for v in bb))-max(min(v[k] for v in aa),min(v[k] for v in bb))<0.0001 for k in range(3)):
        return 0.0
    probe=a.copy()
    probe.data=a.data.copy()
    bpy.context.collection.objects.link(probe)
    for modifier in list(probe.modifiers):
        probe.modifiers.remove(modifier)
    bpy.context.view_layer.objects.active=probe
    modifier=probe.modifiers.new('cross option audit','BOOLEAN')
    modifier.operation='INTERSECT'
    modifier.solver='EXACT'
    modifier.object=b
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    bm=bmesh.new()
    bm.from_mesh(probe.data)
    volume=abs(bm.calc_volume(signed=True))
    bm.free()
    bpy.data.objects.remove(probe,do_unlink=True)
    return volume
collisions=[]
for i,a in enumerate(parts):
    for b in parts[i+1:]:
        volume=overlap(a,b)
        if volume>0.01:
            collisions.append({'a':a.name,'b':b.name,'overlap_mm3':volume})
reservations=[]
for label,dimensions,position in [
    ('ESP chosen 30x24x20 envelope',(30,20,24),(0,-19,0)),
    ('left mic nominal PCB',(14,1.6,12),(-24,-18.2,-80)),
    ('right mic nominal PCB',(14,1.6,12),(24,-18.2,-80)),
    ('SHT nominal PCB',(25.5,1.6,17.7),(104,-13.8,61))]:
    bpy.ops.mesh.primitive_cube_add(size=1,location=position)
    proxy=bpy.context.object
    proxy.dimensions=dimensions
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    hits={part.name:overlap(proxy,part) for part in parts}
    reservations.append({'label':label,'printed_intersections_mm3':hits,
                         'pass':all(v<0.01 for v in hits.values())})
    bpy.data.objects.remove(proxy,do_unlink=True)
report={'pass':not collisions,'installed_printed_instances':len(parts),
        'inventory_check':inventory_check,
        'unchecked_component':['Actual PCB underside components, cable and tie bends remain unmeasured'],
        'component_reservations':reservations,
        'pair_count':len(parts)*(len(parts)-1)//2,'collisions':collisions,
        'limits':['Printed-part geometry only; thermal remains P',
                  'No physical fit, cable routing or structural approval']}
report['pass']=report['pass'] and all(r['pass'] for r in reservations)
report['pass']=report['pass'] and inventory_check['pass']
# Explicit external tray bolt heads and straight-driver approach. No assertion
# that an actual purchased driver/fastener matches these chosen cylinders.
hardware=[]
for x in (-15,15):
    for z in (-25,25):
        for role,radius,lo,hi in [('rear_head',3.0,-2.4,0),
                                  ('rear_driver',3.5,-24,-2.4),
                                  ('shaft',1.5,0,14),
                                  ('nut_washer',3.5,9,12.4)]:
            bpy.ops.mesh.primitive_cylinder_add(vertices=64,radius=radius,depth=hi-lo,
                location=(x,-(lo+hi)/2,z),rotation=(1.5707963267948966,0,0))
            proxy=bpy.context.object
            hits={part.name:overlap(proxy,part) for part in parts}
            hardware.append({'axis_mm':[x,z],'role':role,
                             'assumed_radius_mm':radius,'depth_interval_mm':[lo,hi],
                             'printed_intersections_mm3':hits,
                             'pass':all(v<0.01 for v in hits.values())})
            bpy.data.objects.remove(proxy,do_unlink=True)
report['tray_head_driver_envelopes']=hardware
report['pass']=report['pass'] and all(h['pass'] for h in hardware)
support=bpy.data.objects['microphone_strap_carrier']
mic_bearing=[]
for x in (-6.25,6.25):
    for y in (-5.25,5.25):
        center=support.matrix_world@Vector((x,y,10.99))
        bpy.ops.mesh.primitive_cube_add(size=1,location=center)
        witness=bpy.context.object
        witness.dimensions=(1.5,0.02,1.5)
        bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
        area=overlap(witness,support)/0.02
        mic_bearing.append({'xy_mm':[x,y],'area_mm2':area,'pass':2.20<area<2.30})
        bpy.data.objects.remove(witness,do_unlink=True)
tunnels=[]
for sign in (-1,1):
    for y in (-5.25,5.25):
        clear=[]
        for dy in (-0.3,0,0.3):
            for dz in (-0.5,0,0.5):
                hit,_,_,_=support.ray_cast(Vector((sign*10,y+dy,9.5+dz)),Vector((-sign,0,0)),distance=5)
                clear.append(not hit)
        tunnels.append({'side':sign,'y_mm':y,'pass':all(clear)})
report['combined_mic_bearing']=mic_bearing
report['combined_mic_tunnels']=tunnels
report['pass']=report['pass'] and all(b['pass'] for b in mic_bearing) and all(t['pass'] for t in tunnels)
spine=bpy.data.objects['mounting_spine']
bm=bmesh.new()
bm.from_mesh(spine.data)
remaining=set(bm.verts)
islands=0
while remaining:
    islands+=1
    pending=[remaining.pop()]
    while pending:
        for edge in pending.pop().link_edges:
            for vertex in edge.verts:
                if vertex in remaining:
                    remaining.remove(vertex)
                    pending.append(vertex)
topology={'nonmanifold_edges':sum(not e.is_manifold for e in bm.edges),
          'islands':islands,'volume_mm3':bm.calc_volume(signed=True)}
bm.free()
report['research_spine_topology']=topology
report['research_spine_nominal_ligaments_mm']={
    'access_bore_to_outer_side':24-15-3.8,
    'access_bore_to_nearest_strap_slot_y':45-7.5-25-3.8,
    'note':'Nominal planar geometry, not measured printed strength or fatigue'}
ligaments=report['research_spine_nominal_ligaments_mm']
report['spine_ligament_design_gate']={
    'minimum_chosen_mm':4.0,
    'pass':min(ligaments['access_bore_to_outer_side'],ligaments['access_bore_to_nearest_strap_slot_y'])>=4.0,
    'scope':'Nominal layout regression guard only; no structural load rating'}
report['pass']=report['pass'] and report['spine_ligament_design_gate']['pass']
report['pass']=report['pass'] and topology['nonmanifold_edges']==0 and islands==1 and topology['volume_mm3']>0
# Roundtrip manufacturing export back to its installed transform. Equal volume
# alone cannot catch an incorrectly oriented/translated STL.
bpy.ops.import_mesh.stl(filepath=str(OUT/'research_spine_tray_access.stl'))
roundtrip=bpy.context.object
roundtrip.rotation_euler=spine.rotation_euler.copy()
roundtrip.location=spine.location.copy()
bpy.context.view_layer.update()
aa=[spine.matrix_world@Vector(v) for v in spine.bound_box]
bb=[roundtrip.matrix_world@Vector(v) for v in roundtrip.bound_box]
bound_error=max(abs(fn(v[k] for v in aa)-fn(v[k] for v in bb))
                for k in range(3) for fn in (min,max))
common=overlap(spine,roundtrip)
roundtrip_check={'bounds_error_mm':bound_error,'intersection_mm3':common,
                 'expected_volume_mm3':topology['volume_mm3'],
                 'pass':bound_error<0.001 and abs(common-topology['volume_mm3'])<0.05}
report['spine_export_roundtrip']=roundtrip_check
report['pass']=report['pass'] and roundtrip_check['pass']
bpy.data.objects.remove(roundtrip,do_unlink=True)
if thermal:
    proxy_checks=[]
    for proxy in bpy.context.scene.objects:
        if proxy.get('research_nonprintable'):
            hits={part.name:overlap(proxy,part) for part in parts}
            # Nuts intentionally engage their own threaded shaft, not printed
            # solids. No printed-intersection exemption is needed here.
            proxy_checks.append({'name':proxy.name,'printed_intersections_mm3':hits,
                                 'pass':all(v<0.01 for v in hits.values())})
    report['thermal_nonprintable_reservations']=proxy_checks
    report['pass']=report['pass'] and len(proxy_checks)==6 and all(p['pass'] for p in proxy_checks)
REPORT.write_text(json.dumps(report,indent=2))
print(json.dumps(report))
if not report['pass']:
    raise SystemExit(1)
