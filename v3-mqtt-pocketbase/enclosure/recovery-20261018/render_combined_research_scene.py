"""Render the installed combined candidate, not an exploded parts illustration."""
import bpy
import os
from pathlib import Path
ROOT=Path(__file__).resolve().parent
OUT=ROOT/'research-adapters'
thermal=os.environ.get('PIGPULSE_THERMAL_VARIANT')
bpy.ops.wm.open_mainfile(filepath=str(OUT/('combined-thermal-candidate.blend' if thermal else 'combined-research-candidate.blend')))
scene=bpy.context.scene
# Presentation-only: planar faces use flat normals; do not change/export mesh.
for name in ('main_lid','thermal_face','acoustic_face'):
    obj=bpy.data.objects[name]
    for polygon in obj.data.polygons:
        if max(abs(v) for v in polygon.normal)>0.9999:
            polygon.use_smooth=False
led=bpy.data.objects.get('PURCHASED_LED_VISUAL_ONLY')
if led:
    for material in led.data.materials:
        material.use_nodes=True
        shader=material.node_tree.nodes.get('Principled BSDF')
        shader.inputs['Base Color'].default_value=(0.01,0.9,0.2,1)
        shader.inputs['Emission Color'].default_value=(0.01,0.9,0.2,1)
        shader.inputs['Emission Strength'].default_value=0.4
scene.render.resolution_percentage=70
scene.render.threads_mode='FIXED'
scene.render.threads=2
scene.render.image_settings.file_format='PNG'
scene.render.filepath=str(OUT/('combined-thermal-installed.png' if thermal else 'combined-research-installed.png'))
bpy.ops.render.render(write_still=True)
