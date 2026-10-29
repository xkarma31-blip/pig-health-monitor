"""Render actual replacement STL installation, retaining P artwork/materials."""
import bpy
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parent
OUT=ROOT/'research-adapters'
for variant in ('12x12','18x12.7','25.5x17.7'):
    bpy.ops.wm.open_mainfile(filepath=str(OUT/f'sht-{variant}-assembly.blend'))
    scene=bpy.context.scene
    scene.render.resolution_percentage=60
    scene.render.image_settings.file_format='PNG'
    scene.render.filepath=str(OUT/f'sht-{variant}-installed.png')
    scene.render.threads_mode='FIXED'
    scene.render.threads=2
    bpy.ops.render.render(write_still=True)
    # Separate close view resolves thin rails instead of inferring disconnection
    # from the distant whole-product perspective. No geometry is hidden.
    target=Vector((104,-9,61))
    scene.camera.location=(target+Vector((58,-95,52)))
    scene.camera.rotation_euler=(target-scene.camera.location).to_track_quat('-Z','Y').to_euler()
    scene.camera.data.type='ORTHO'
    scene.camera.data.ortho_scale=83
    scene.render.filepath=str(OUT/f'sht-{variant}-detail.png')
    bpy.ops.render.render(write_still=True)
