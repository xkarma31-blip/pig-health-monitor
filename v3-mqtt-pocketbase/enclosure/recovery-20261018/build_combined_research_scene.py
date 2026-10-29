"""Combine tested research options; thermal deliberately remains P pending repair."""
import bpy
import json
import math
import os
from pathlib import Path

ROOT=Path(__file__).resolve().parent
OUT=ROOT/'research-adapters'
bpy.ops.wm.open_mainfile(filepath=str(OUT/'sht-25.5x17.7-assembly.blend'))

def replace(old_name,filename,rotation,location):
    old=bpy.data.objects[old_name]
    materials=list(old.data.materials)
    bpy.data.objects.remove(old,do_unlink=True)
    bpy.ops.import_mesh.stl(filepath=str(OUT/filename))
    obj=bpy.context.object
    obj.name=old_name
    obj.rotation_euler=rotation
    obj.location=location
    for material in materials:
        obj.data.materials.append(material)
    return obj

for i in range(1,5):
    name='tray_spacer_6mm.%03d'%i
    position=bpy.data.objects[name].location.copy()
    replace(name,'optional_tray_spacer_3mm.stl',(math.pi/2,0,0),position)
bpy.data.objects['electronics_strap_tray'].location.y+=3
# Research-only spine replacement: rear access bores expose tray bolt heads.
# Preserve P STL; no assumed shared spine/tray bolt grip is hidden in the stack.
spine=bpy.data.objects['mounting_spine']
for x in (-15,15):
    for z in (-25,25):
        bpy.ops.mesh.primitive_cylinder_add(vertices=64,radius=3.8,depth=12,
            location=(x,3,z),rotation=(math.pi/2,0,0))
        cutter=bpy.context.object
        bpy.context.view_layer.objects.active=spine
        modifier=spine.modifiers.new('tray rear head access','BOOLEAN')
        modifier.operation='DIFFERENCE'
        modifier.solver='EXACT'
        modifier.object=cutter
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        bpy.data.objects.remove(cutter,do_unlink=True)
bpy.ops.object.select_all(action='DESELECT')
spine.select_set(True)
bpy.context.view_layer.objects.active=spine
# Match P manufacturing coordinates (width,height,depth), not world Y-depth.
# Export a detached mesh copy so installation transform cannot leak into STL.
export_copy=spine.copy()
export_copy.data=spine.data.copy()
bpy.context.collection.objects.link(export_copy)
export_copy.matrix_world.identity()
bpy.ops.object.select_all(action='DESELECT')
export_copy.select_set(True)
bpy.context.view_layer.objects.active=export_copy
bpy.ops.export_mesh.stl(filepath=str(OUT/'research_spine_tray_access.stl'),use_selection=True)
bpy.data.objects.remove(export_copy,do_unlink=True)
replace('microphone_strap_carrier','mic_14x12_corner_support.stl',
        (-math.pi/2,0,0),(-24,-30,-80))
replace('microphone_strap_carrier.001','mic_14x12_corner_support.stl',
        (-math.pi/2,0,0),(24,-30,-80))
thermal_variant=os.environ.get('PIGPULSE_THERMAL_VARIANT')
if thermal_variant:
    if thermal_variant not in ('pcb25_4x17_78','pcb25_4square','pcb28x16'):
        raise ValueError('Unknown thermal research variant')
    metadata=json.loads((OUT/(thermal_variant+'_installed_transform.json')).read_text())
    # Appended vertices are already world-mm baked; no second installation.
    with bpy.data.libraries.load(str(OUT/(thermal_variant+'_installed.blend')),link=False) as (source,target):
        missing=set(metadata['variant_objects'])-set(source.objects)
        if missing:
            raise ValueError('Missing thermal source objects: '+repr(missing))
        target.objects=[name for name in source.objects if name in metadata['variant_objects']]
    for obj in target.objects:
        if obj is not None:
            bpy.context.collection.objects.link(obj)
            obj['research_thermal_variant']=thermal_variant
            if obj.name.startswith(('PCB envelope','ASSUMED package','M3_hex_nut')):
                obj['research_nonprintable']=True
                obj.hide_render=True
            else:
                # Thermal engineering scenes have no presentation materials.
                # Match installed charcoal parts without altering their mesh.
                obj.data.materials.clear()
                for material in bpy.data.objects['thermal_raised_cradle'].data.materials:
                    obj.data.materials.append(material)
# Both sides use the same explicitly approximate 14x12 PCB-family scenario.
bpy.context.view_layer.update()
inventory={o.name:{'location_mm':list(o.location),
                   'rotation_rad':list(o.rotation_euler)}
           for o in bpy.context.scene.objects if o.type=='MESH' and not o.hide_render}
(OUT/('combined-thermal-inventory.json' if thermal_variant else 'combined-research-inventory.json')).write_text(json.dumps({
    'status':'integration candidate, not accepted release',
    'configuration':{'sht':'25.5x17.7','left_mic':'14x12',
                     'tray_spacers_mm':3,'thermal':thermal_variant or 'unchanged P'},
    'objects':inventory},indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/('combined-thermal-candidate.blend' if thermal_variant else 'combined-research-candidate.blend')))
