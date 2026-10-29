"""Reopen each thermal integration scene in Blender and validate metadata."""
import json
from pathlib import Path
import bpy
from mathutils import Matrix

root = Path(__file__).resolve().parent / 'research-adapters'
report = json.loads((root / 'thermal-rear-insert-checks.json').read_text())
results = {}
for name, checks in report['variants'].items():
    meta = checks['installation']
    bpy.ops.wm.open_mainfile(filepath=str(root / meta['scene']))
    assert json.loads(bpy.context.scene['thermal_installation_metadata']) == meta
    assert bpy.context.scene.unit_settings.scale_length > 0.0009999
    for object_name in meta['variant_objects']:
        obj = bpy.data.objects[object_name]
        assert all(abs(obj.matrix_world[i][j] - Matrix.Identity(4)[i][j]) < 1e-6
                   for i in range(4) for j in range(4)), object_name
    assert set(bpy.data.objects.keys()) == set(meta['variant_objects'] + meta['fixed_context_objects'])
    transform = Matrix(meta['sensor_local_to_installed_world'])
    inverse = Matrix(meta['installed_world_to_sensor_local'])
    assert all(abs((transform @ inverse)[i][j] - Matrix.Identity(4)[i][j]) < 1e-5
               for i in range(4) for j in range(4))
    results[name] = {'reopened': True, 'metadata_matches': True,
                     'baked_identity_transforms': True, 'object_count': len(bpy.data.objects)}
(root / 'thermal-installed-scene-checks.json').write_text(json.dumps(results, indent=2))
print('ALL THREE INSTALLED SCENES VERIFIED', results)
