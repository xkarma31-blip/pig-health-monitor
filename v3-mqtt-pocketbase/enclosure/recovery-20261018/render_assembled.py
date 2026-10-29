"""Assemble prototype meshes for honest appearance review; logo is a label, not STL."""
import bpy
import math
import json
import os
import hashlib
from pathlib import Path
from mathutils import Vector

root=Path(__file__).resolve().parent
out=root/os.environ.get('PIGPULSE_REVISION','revision-o')
bpy.ops.wm.read_factory_settings(use_empty=True)
# Assemble from exported STL coordinates, NOT editable scene object origins.
# Earlier render reset centered primitive origins and introduced false gaps.
parts=json.loads((out/'mesh-checks.json').read_text())['parts']
import_manifest={p['name']:hashlib.sha256((out/(p['name']+'.stl')).read_bytes()).hexdigest() for p in parts}
bpy.context.scene['imported_stl_sha256']=json.dumps(import_manifest,sort_keys=True)
(out/'assembly-import-manifest.json').write_text(json.dumps(import_manifest,indent=2))
for part in parts:
    bpy.ops.import_mesh.stl(filepath=str(out/(part['name']+'.stl')))
    o=bpy.context.object
    o.name=part['name']
    # STL triangles carry no smoothing groups. Smooth shallow fillet facets,
    # split normals at functional sharp edges; this changes render normals only.
    for polygon in o.data.polygons:
        # Do not interpolate bevel normals over coplanar STL face triangles.
        polygon.use_smooth=max(abs(v) for v in polygon.normal)<0.9999
    o.data.use_auto_smooth=True
    o.data.auto_smooth_angle=math.radians(30)
    normals=o.modifiers.new('Planar faces and continuous fillet normals','WEIGHTED_NORMAL')
    normals.keep_sharp=True
    m=bpy.data.materials.new(part['name']+' charcoal')
    m.diffuse_color=(0.055,0.065,0.075,1)
    m.use_nodes=True
    bs=m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value=(0.055,0.065,0.075,1)
    bs.inputs['Roughness'].default_value=0.58
    if part['name']=='acoustic_trim':
        # Separate optional printed/painted accent, not an acoustic membrane.
        m.diffuse_color=(0.03,0.78,0.39,1)
        bs.inputs['Base Color'].default_value=(0.03,0.78,0.39,1)
    noise=m.node_tree.nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value=170
    bump=m.node_tree.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value=0.12
    bump.inputs['Distance'].default_value=0.025
    m.node_tree.links.new(noise.outputs['Fac'],bump.inputs['Height'])
    m.node_tree.links.new(bump.outputs['Normal'],bs.inputs['Normal'])
    if part['name'] in ('main_lid','acoustic_face','thermal_face'):
        # Plain matte removable faces: procedural STL-triangle bump artifacts
        # are not an acceptable substitute for a measured material finish.
        for link in list(bs.inputs['Normal'].links):
            m.node_tree.links.remove(link)
    o.data.materials.append(m)
# Tub coordinates X=width, Y=height, Z=depth become X, depth=-Y, height=Z.
layout={'main_tub':(0,0),'main_lid':(0,30),
        'thermal_tub':(80,0),'thermal_face':(80,14),
        'acoustic_tub':(-80,0),'acoustic_face':(-80,30),
        'optical_trim':(80,31),'acoustic_trim':(-80,33),
        'thermal_angled_hood':(80,17), 'mounting_spine':(0,-5),
        'sht_mount_arm':(61,-10),'sht_adjustable_carrier':(61,3),
        'electronics_strap_tray':(0,9),'tray_spacer_6mm':(0,3),
        'microphone_strap_carrier':(-80,27),'thermal_strap_carrier':(80,11),
        'thermal_raised_cradle':(80,17)}
for name,(height,depth) in layout.items():
    o=bpy.data.objects[name]
    # Restore construction centers after exploded layout offsets.
    o.rotation_euler=(math.pi/2,0,0)
    o.location=(0,-depth,height)
    if name=='sht_adjustable_carrier': o.location.x=80
    if name=='thermal_strap_carrier': o.hide_render=True
    if name=='microphone_strap_carrier':
        o.location.x=-24
        duplicate=o.copy();duplicate.data=o.data.copy()
        bpy.context.collection.objects.link(duplicate)
        duplicate.location.x=24
    if name=='tray_spacer_6mm':
        for x in (-15,15):
            for z in (-25,25):
                duplicate=o.copy()
                duplicate.data=o.data.copy()
                bpy.context.collection.objects.link(duplicate)
                duplicate.location=(x,-3,z)
        o.hide_render=True
    if name=='optical_trim': o.hide_render=True
    if name=='acoustic_trim':
        o.location.x=-24
        duplicate=o.copy()
        duplicate.data=o.data.copy()
        bpy.context.collection.objects.link(duplicate)
        duplicate.location.x=24

# Preserve exact raster wordmark in a separately identified adhesive-label workflow.
# This is deliberately not exported as a printable logo mesh.
bpy.ops.mesh.primitive_plane_add(size=1,location=(0,-33.08,12),rotation=(math.pi/2,0,0))
label=bpy.context.object
label.name='REFERENCE_ARTWORK_LABEL_NOT_STL'
label.scale=(65,32.5,1)
m=bpy.data.materials.new('Original poster crop — label artwork')
m.use_nodes=True
bsdf=m.node_tree.nodes.get('Principled BSDF')
tex=m.node_tree.nodes.new('ShaderNodeTexImage')
tex.image=bpy.data.images.load(str(root/'logo-source-transparent.png'))
tex.image.pack()
m.node_tree.links.new(tex.outputs['Color'],bsdf.inputs['Base Color'])
m.node_tree.links.new(tex.outputs['Alpha'],bsdf.inputs['Alpha'])
m.blend_method='BLEND'
m.shadow_method='NONE'
m.use_screen_refraction=False
bsdf.inputs['Roughness'].default_value=0.8
label.data.materials.append(m)
# Purchased fastener visual proxies, excluded from all printable exports.
steel=bpy.data.materials.new('Optional dark-finish purchased fastener proxy — not supplied')
steel.diffuse_color=(0.085,0.095,0.11,1)
steel.use_nodes=True
steel.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(0.085,0.095,0.11,1)
steel.node_tree.nodes.get('Principled BSDF').inputs['Metallic'].default_value=0.65
steel.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=0.38
def screw(x,y,z):
    bpy.ops.mesh.primitive_cylinder_add(vertices=96,radius=2.7,depth=1.8,location=(x,y,z),rotation=(math.pi/2,0,0))
    o=bpy.context.object
    o.name='PURCHASED_M3_HEAD_VISUAL_ONLY'
    o.data.materials.append(steel)
    # Recess is rendering-only purchased screw detail, never exported as print.
    bpy.ops.mesh.primitive_cylinder_add(vertices=6,radius=1.15,depth=1.0,location=(x,y-0.7,z),rotation=(math.pi/2,0,0))
    cutter=bpy.context.object
    bpy.context.view_layer.objects.active=o
    mod=o.modifiers.new('Hex drive recess visual','BOOLEAN')
    mod.operation='DIFFERENCE';mod.object=cutter
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(cutter,do_unlink=True)
for x in (-54,54):
    for z in (-50,50): screw(x,-33.9,z)
if out.name=='revision-p':
    for z in (-32,32): screw(-65.5,-33.9,z)
for x in (-44,44):
    for z in (-93,-67): screw(x,-33.9,z)
for x in (-40,40):
    for local_z in (-13,13):
        seat_z=16+(local_z-3.6)*math.tan(math.radians(15))-0.3
        screw(x,-(17+seat_z)-0.9,80+local_z)
# Render-only LED lens clearly separate from printable indicator opening.
bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=8,radius=1.25,location=(0,-33.2,-36))
led=bpy.context.object
led.name='PURCHASED_LED_VISUAL_ONLY'
lm=bpy.data.materials.new('Green LED visualization')
lm.diffuse_color=(0.01,0.9,0.2,1)
led.data.materials.append(lm)
scene=bpy.context.scene
scene.unit_settings.system='METRIC'
scene.unit_settings.scale_length=0.001
scene.render.engine='BLENDER_EEVEE'
scene.world=bpy.data.worlds.new('Studio world')
scene.world.color=(0.16,0.18,0.2)
bpy.ops.object.light_add(type='AREA',location=(100,-220,400))
bpy.context.object.data.energy=2500000
bpy.context.object.data.size=450
key=bpy.context.object
key.rotation_euler=(Vector((0,0,0))-key.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.light_add(type='AREA',location=(-200,-100,100))
fill=bpy.context.object
fill.data.energy=700000;fill.data.size=300
fill.rotation_euler=(Vector((0,0,0))-fill.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add()
cam=bpy.context.object
scene.camera=cam
cam.data.type='ORTHO'
cam.location=(240,-430,210)
cam.rotation_euler=(Vector((0,0,0))-cam.location).to_track_quat('-Z','Y').to_euler()
cam.data.ortho_scale=310
scene.render.resolution_x=1500
scene.render.resolution_y=1500
scene.render.filepath=str(out/'assembled-reference-label.png')
bpy.ops.wm.save_as_mainfile(filepath=str(out/'assembled-review.blend'))
bpy.ops.render.render(write_still=True)
# Useful close-up and rear evidence views, not only a hero angle.
cam.location=(0,-440,20)
cam.rotation_euler=(Vector((0,0,0))-cam.location).to_track_quat('-Z','Y').to_euler()
cam.data.ortho_scale=250
scene.render.filepath=str(out/'front-review.png')
bpy.ops.render.render(write_still=True)
cam.location=(230,400,180)
cam.rotation_euler=(Vector((15,0,0))-cam.location).to_track_quat('-Z','Y').to_euler()
cam.data.ortho_scale=310
scene.render.filepath=str(out/'rear-attachment-review.png')
bpy.ops.render.render(write_still=True)
