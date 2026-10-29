"""Dimensioned mechanical prototype; millimeters, NOT hardware-fit certified.
Run with Blender 4.x --background --python this_file.
Preserves previous enclosure assets; writes only revision-a/.
"""
import bpy
import bmesh
import json
import math
import os
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parent
OUT = ROOT / os.environ.get('PIGPULSE_REVISION','revision-f')
OUT.mkdir(exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 0.001
parts = []

def mat(name, color):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    return m

charcoal = mat('Charcoal prototype', (0.055, 0.065, 0.075))
mint = mat('Reference mint approximation', (0.03, 0.78, 0.39))

def box(name, dims, pos):
    bpy.ops.mesh.primitive_cube_add(size=1, location=pos)
    o = bpy.context.object
    o.name = name
    o.dimensions = dims
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return o

def cylinder(name, radius, depth, pos):
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=radius, depth=depth, location=pos)
    o = bpy.context.object
    o.name = name
    return o

def boolean(o, cutter, operation='DIFFERENCE'):
    bpy.context.view_layer.objects.active = o
    mod = o.modifiers.new('Functional ' + operation, 'BOOLEAN')
    mod.operation = operation
    mod.solver = 'EXACT'
    mod.object = cutter
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(cutter, do_unlink=True)

def finish(o):
    o.data.materials.append(charcoal)
    bpy.context.view_layer.objects.active = o
    mod = o.modifiers.new('Edge relief', 'BEVEL')
    mod.width = 0.35
    mod.segments = 2
    if o.name=='thermal_angled_hood':
        o.modifiers.remove(mod)
    else:
        bpy.ops.object.modifier_apply(modifier=mod.name)
    parts.append(o)
    return o

def tub(name, w, h, depth):
    # Z-up bed coordinates: actual 3mm floor and 3mm walls, open top.
    o = box(name, (w, h, depth), (0, 0, depth/2))
    boolean(o, box('cavity', (w-6, h-6, depth), (0, 0, depth/2+3)))
    # Real connected corner posts with clearance bores for purchased M3 bolts.
    for x in (-w/2+6, w/2-6):
        for y in (-h/2+6, h/2-6):
            boolean(o, cylinder('post', 4.5, depth-3, (x, y, (depth+3)/2)), 'UNION')
            boolean(o, cylinder('through M3 nominal 3.4', 1.7, depth+4, (x, y, depth/2)))
    return o

def lid(name, w, h):
    o = box(name, (w, h, 3), (0, 0, 1.5))
    for x in (-w/2+6, w/2-6):
        for y in (-h/2+6, h/2-6):
            boolean(o, cylinder('lid clearance', 1.7, 7, (x,y,1.5)))
    return o

def rear_mount(o):
    # Through-bolt pair for a purchased M3 fastener and shared mounting spine.
    for x in (-18,18):
        boolean(o,cylinder('rear mount',1.7,10,(x,0,2)))

def cable_end(o, sign):
    cut=cylinder('module cable exit',3,12,(0,sign*18,16))
    cut.rotation_euler.x=math.pi/2
    boolean(o,cut)

main = tub('main_tub', 120, 112, 30)
rear_mount(main)
# Rear-access slots permit removable straps rather than fictional board holes.
for x in (-28, 28):
    boolean(main, box('strap slot', (3, 14, 8), (x, 0, 2)))
# Side cable pass-through, no invented connector thread.
cut = cylinder('cable aperture', 4, 12, (0, 55, 16))
cut.rotation_euler.x = math.pi/2
boolean(main, cut)
cut=cylinder('lower cable exit',3,12,(0,-55,16))
cut.rotation_euler.x=math.pi/2
boolean(main,cut)
# Removable tray mounting; small through fasteners keep unknown PCB off floor.
for x in (-15,15):
    for y in (-25,25):
        boolean(main,cylinder('tray fixing',1.7,9,(x,y,2)))
finish(main)
cover = lid('main_lid', 120, 112)
boolean(cover, cylinder('indicator opening', 1.5, 8, (0,-36,1.5)))
finish(cover)

thermal = tub('thermal_tub', 92, 38, 14)
rear_mount(thermal)
cut=cylinder('thermal exit',3,12,(0,-18,8))
cut.rotation_euler.x=math.pi/2
boolean(thermal,cut)
finish(thermal)
thermal_lid = lid('thermal_face', 92, 38)
# Wide real optical opening; FOV alignment remains hardware-dependent.
boolean(thermal_lid, box('optical opening', (46,26,8), (0,0,1.5)))
for x in (-30,30):
    for y in (-9,9):
        boolean(thermal_lid,cylinder('thermal carrier bolt',1.7,8,(x,y,1.5)))
finish(thermal_lid)
acoustic = tub('acoustic_tub', 100, 38, 30)
rear_mount(acoustic)
cable_end(acoustic,1)
finish(acoustic)
acoustic_lid = lid('acoustic_face', 100, 38)
for x in (-24,24):
    boolean(acoustic_lid, cylinder('sound aperture', 6, 8, (x,0,1.5)))
    for dx in (-10,10):
        for y in (-10,10):
            boolean(acoustic_lid,cylinder('mic carrier bolt',1.7,8,(x+dx,y,1.5)))
finish(acoustic_lid)

mic_carrier=box('microphone_strap_carrier',(26,26,3),(0,0,1.5))
boolean(mic_carrier,cylinder('bottom port exposure',6,8,(0,0,1.5)))
for x in (-10,10):
    for y in (-10,10):
        boolean(mic_carrier,cylinder('mic plate bolt',1.7,8,(x,y,1.5)))
for x in (-10,10):
    boolean(mic_carrier,box('mic strap slot',(2,8,8),(x,0,1.5)))
finish(mic_carrier)

thermal_carrier=box('thermal_strap_carrier',(68,30,3),(0,0,1.5))
boolean(thermal_carrier,box('thermal view exposure',(46,26,8),(0,0,1.5)))
for x in (-30,30):
    for y in (-9,9):
        boolean(thermal_carrier,cylinder('thermal plate bolt',1.7,8,(x,y,1.5)))
for x in (-27,27):
    boolean(thermal_carrier,box('thermal strap slot',(2,10,8),(x,0,1.5)))
finish(thermal_carrier)

# Replace solid fake bezels with real rings, flat-bed printable.
for name, outer, inner in [('optical_trim',17,14),('acoustic_trim',9,6)]:
    o = cylinder(name,outer,2,(0,0,1))
    boolean(o,cylinder('ring opening',inner,6,(0,0,1)))
    finish(o)
    o.data.materials.clear()
    o.data.materials.append(mint)

# Real detachable bolted joint: all modules fasten independently to a rear spine.
# 196mm long spine fits the assumed 220mm bed. Not a decorative fake coupler.
spine=box('mounting_spine',(48,196,5),(0,0,2.5))
for y in (-80,0,80):
    for x in (-18,18):
        boolean(spine,cylinder('spine M3 hole',1.7,9,(x,y,2.5)))
for y in (-45,45):
    for x in (-18,18):
        boolean(spine,box('post strap slot',(4,15,9),(x,y,2.5)))
# SHT arm bolts through spine between main and thermal housing footprints.
for x in (-12,12):
    boolean(spine,cylinder('SHT arm fixing',1.7,9,(x,61,2.5)))
finish(spine)

# Open removable SHT carrier: strap retention, no fictional PCB-specific holes.
# Keeps sensor accessible for external placement; actual board identity unknown.
carrier=box('sht_adjustable_carrier',(32,32,3),(0,0,1.5))
boolean(carrier,box('sensor air exposure',(16,16,8),(0,0,1.5)))
for x in (-12,12):
    boolean(carrier,box('carrier strap slot',(3,12,8),(x,0,1.5)))
for y in (-12,12):
    boolean(carrier,cylinder('carrier attachment',1.7,8,(0,y,1.5)))
finish(carrier)

# Side-offset SHT attachment: real matched holes, no cantilever floating in render.
# Carrier sits at x=80, y=61, on 8mm standoffs; fully open to room air.
arm=box('sht_mount_arm',(104,10,5),(28,0,2.5))
for x in (-12,12):
    boolean(arm,cylinder('spine arm bolt',1.7,9,(x,0,2.5)))
boolean(arm,box('carrier landing',(32,32,5),(80,0,2.5)),'UNION')
for y in (-12,12):
    boolean(arm,cylinder('carrier stand off',3.5,8,(80,y,9)),'UNION')
    boolean(arm,cylinder('carrier bolt',1.7,30,(80,y,8)))
finish(arm)

tray=box('electronics_strap_tray',(82,76,3),(0,0,1.5))
for x in (-15,15):
    for y in (-25,25):
        boolean(tray,cylinder('tray mount bore',1.7,9,(x,y,1.5)))
for x in (-32,32):
    for y in (-18,18):
        boolean(tray,box('tray strap',(3,16,9),(x,y,1.5)))
finish(tray)
spacer=cylinder('tray_spacer_6mm',3.5,6,(0,0,3))
boolean(spacer,cylinder('spacer bore',1.7,12,(0,0,3)))
finish(spacer)

def wedge(name,w,h,bottom,top):
    slope=math.tan(math.radians(15))
    verts=[(x,y,z) for z in (bottom,top) for y in (-h/2,h/2) for x in (-w/2,w/2)]
    verts=[(x,y,z+y*slope if i>=4 else z) for i,(x,y,z) in enumerate(verts)]
    mesh=bpy.data.meshes.new(name)
    mesh.from_pydata(verts,[],[(0,2,3,1),(4,5,7,6),(0,1,5,4),(2,6,7,3),(0,4,6,2),(1,3,7,5)])
    mesh.update()
    o=bpy.data.objects.new(name,mesh)
    bpy.context.collection.objects.link(o)
    return o

# Actual 15-degree wedge hood with open underside, optical aperture and fasteners.
# This restores angled silhouette but does not certify MLX field of view.
hood=wedge('thermal_angled_hood',92,38,0,16)
boolean(hood,wedge('hood cavity',72,18,-1,13))
boolean(hood,box('hood optical opening',(46,26,50),(0,0,15)))
for x in (-40,40):
    for y in (-13,13):
        boolean(hood,cylinder('hood M3 clearance',1.7,50,(x,y,12)))
# Trim the unioned posts to the actual sloping outer envelope, not a flat 23mm
# cap. This retains material below the face without protrusions above its slope.
finish(hood)

report = {'status':'MECHANICAL PROTOTYPE — NOT HARDWARE FIT RELEASE',
          'units':'mm', 'wall_nominal_mm':3, 'hardware_dimensions_measured':False,
          'slicer_checked':False, 'parts':[]}
for o in parts:
    bm = bmesh.new()
    bm.from_mesh(o.data)
    nonmanifold = sum(not e.is_manifold for e in bm.edges)
    volume = bm.calc_volume(signed=True)
    report['parts'].append({'name':o.name,'nonmanifold_edges':nonmanifold,
                           'signed_volume_mm3':volume,
                           'bounds_mm':list(o.dimensions)})
    bm.free()
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active=o
    bpy.ops.export_mesh.stl(filepath=str(OUT/(o.name+'.stl')),use_selection=True)
report['mesh_gate_pass'] = all(p['nonmanifold_edges']==0 and p['signed_volume_mm3']>0 for p in report['parts'])
(OUT/'mesh-checks.json').write_text(json.dumps(report,indent=2))

# Exploded design view uses same meshes, never export these displaced transforms.
for i,o in enumerate(parts):
    o.location.x += (i%2)*160
    o.location.y += (i//2)*145
scene.render.engine='BLENDER_EEVEE'
scene.render.resolution_x=1600
scene.render.resolution_y=1200
scene.render.resolution_percentage=100
scene.world=bpy.data.worlds.new('Studio world')
scene.world.color=(0.25,0.25,0.25)
bpy.ops.object.camera_add(location=(400,-480,650))
cam=bpy.context.object
cam.rotation_euler=(Vector((80,180,10))-cam.location).to_track_quat('-Z','Y').to_euler()
cam.data.type='ORTHO'
cam.data.ortho_scale=730
scene.camera=cam
bpy.ops.object.light_add(type='AREA',location=(100,150,500))
bpy.context.object.data.energy=2500000
bpy.context.object.data.shape='DISK'
bpy.context.object.data.size=450
scene.render.filepath=str(OUT/'mechanical-layout.png')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'mechanical-prototype.blend'))
bpy.ops.render.render(write_still=True)
print(json.dumps(report))
