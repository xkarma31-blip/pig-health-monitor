"""Diagnostic close-up of actual assembled hood, not a replacement hero render."""
import bpy
from pathlib import Path
from mathutils import Vector

root=Path(__file__).resolve().parent
out=root/'revision-m'
bpy.ops.wm.open_mainfile(filepath=str(out/'assembled-review.blend'))
scene=bpy.context.scene
cam=scene.camera
target=Vector((0,-27,80))
cam.location=(140,-180,160)
cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
cam.data.type='ORTHO'
cam.data.ortho_scale=125
scene.render.resolution_x=1400
scene.render.resolution_y=1000
scene.render.resolution_percentage=100
scene.render.filepath=str(out/'thermal-hood-detail.png')
bpy.ops.render.render(write_still=True)
