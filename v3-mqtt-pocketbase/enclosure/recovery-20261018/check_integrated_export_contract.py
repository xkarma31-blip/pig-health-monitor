"""Read-only digital contract. Run: blender -b --python this_file -- --self-test.

Only disposable objects are changed. Reports default to /tmp/opencode; neither
the candidate, accepted inputs, exports nor revision P are saved or repaired.
"""
import argparse
import hashlib
import json
import math
import sys
from collections import Counter
from pathlib import Path

import bpy
import bmesh
if bpy.app.version < (4,2,0):
    raise RuntimeError('Export contract requires Blender >=4.2 for thermal source scenes')
from mathutils import Matrix
from mathutils.kdtree import KDTree

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'research-adapters'
THERMAL = ['pcb25_4square', 'pcb25_4square_retainer',
           'pcb25_4square_retainer.001', 'PCB envelope', 'ASSUMED package',
           'M3_hex_nut_-30_-9', 'M3_hex_nut_-30_9',
           'M3_hex_nut_30_-9', 'M3_hex_nut_30_9']


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def snapshot(obj):
    return {'vertices': [list(obj.matrix_world @ v.co) for v in obj.data.vertices],
            'edges': [list(e.vertices) for e in obj.data.edges],
            'faces': [list(p.vertices) for p in obj.data.polygons],
            'matrix': [list(row) for row in obj.matrix_world]}


def matrix_error(a, b):
    return max(abs(a[i][j] - b[i][j]) for i in range(4) for j in range(4))


def volume(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.transform(obj.matrix_world)
    result = abs(bm.calc_volume(signed=True))
    bm.free()
    return result


def bounds(obj):
    points = [obj.matrix_world @ v.co for v in obj.data.vertices]
    return [f(v[k] for v in points) for k in range(3) for f in (min, max)]


def intersection(a, b):
    probe = a.copy()
    probe.data = a.data.copy()
    bpy.context.collection.objects.link(probe)
    try:
        bpy.context.view_layer.objects.active = probe
        mod = probe.modifiers.new('contract intersection', 'BOOLEAN')
        mod.operation = 'INTERSECT'
        mod.solver = 'EXACT'
        mod.object = b
        bpy.ops.object.modifier_apply(modifier=mod.name)
        return volume(probe)
    finally:
        bpy.data.objects.remove(probe, do_unlink=True)


def triangle_hash(obj):
    # STL may reorder/weld vertices. Canonical world triangles ignore ordering,
    # not geometry; the independent bounds/solid checks guard quantization.
    obj.data.calc_loop_triangles()
    points = [obj.matrix_world @ v.co for v in obj.data.vertices]
    triangles = sorted(tuple(sorted(tuple(round(c, 3) for c in points[i])
                                    for i in t.vertices))
                       for t in obj.data.loop_triangles)
    return hashlib.sha256(repr(triangles).encode()).hexdigest()


def vertex_distance(a, b):
    def directed(first, second):
        tree = KDTree(len(second.data.vertices))
        for i, v in enumerate(second.data.vertices):
            tree.insert(second.matrix_world @ v.co, i)
        tree.balance()
        return max(tree.find(first.matrix_world @ v.co)[2] for v in first.data.vertices)
    return max(directed(a, b), directed(b, a))


def geometry_modifiers(obj):
    # Blender4.2 migrates legacy auto-smoothing to geometry nodes. Rather than
    # exempting arbitrary nodes by name, compare evaluated vertices and faces.
    if not obj.modifiers:
        return []
    if any(m.show_viewport != m.show_render for m in obj.modifiers):
        return list(obj.modifiers)
    evaluated=obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh=evaluated.to_mesh()
    try:
        def canonical(data):
            points=[tuple(round(c,5) for c in v.co) for v in data.vertices]
            return sorted(tuple(sorted(points[i] for i in p.vertices)) for p in data.polygons)
        unchanged=(canonical(mesh)==canonical(obj.data))
        return [] if unchanged else list(obj.modifiers)
    finally:
        evaluated.to_mesh_clear()


def installed(rotation, location):
    from mathutils import Euler
    return Matrix.Translation(location) @ Euler(rotation).to_matrix().to_4x4()


def mappings(metadata):
    rows = []
    layout = {'main_tub': (0, 0), 'main_lid': (0, 30),
              'thermal_tub': (80, 0), 'thermal_face': (80, 14),
              'thermal_angled_hood': (80, 17), 'thermal_raised_cradle': (80, 17),
              'acoustic_tub': (-80, 0), 'acoustic_face': (-80, 30),
              'mounting_spine': (0, -5), 'sht_mount_arm': (61, -10),
              'sht_adjustable_carrier': (61, 3), 'electronics_strap_tray': (0, 6)}
    for name, (height, depth) in layout.items():
        file = ROOT / 'revision-p' / (name + '.stl')
        if name == 'mounting_spine':
            file = OUT / 'research_spine_tray_access.stl'
        if name == 'sht_adjustable_carrier':
            file = OUT / 'sht-25.5x17.7.stl'
        rows.append((name, file, installed((math.pi/2, 0, 0),
                     (80 if name == 'sht_adjustable_carrier' else 0, -depth, height))))
    for suffix, x in [('', -24), ('.001', 24)]:
        rows.append(('microphone_strap_carrier' + suffix,
                     OUT / 'mic_14x12_corner_support.stl',
                     installed((-math.pi/2, 0, 0), (x, -30, -80))))
        rows.append(('acoustic_trim' + suffix, ROOT / 'revision-p/acoustic_trim.stl',
                     installed((math.pi/2, 0, 0), (x, -33, -80))))
    for i, (x, z) in enumerate([(x, z) for x in (-15, 15) for z in (-25, 25)], 1):
        rows.append(('tray_spacer_6mm.%03d' % i, OUT / 'optional_tray_spacer_3mm.stl',
                     installed((math.pi/2, 0, 0), (x, -3, z))))
    for name, file in zip(THERMAL[:3], ['rear_insert', 'retainer_1', 'retainer_2']):
        rows.append((name, OUT / ('pcb25_4square_' + file + '.stl'),
                     Matrix(metadata['sensor_local_to_installed_world'])))
    assert len(rows) == 23 and len({r[0] for r in rows}) == 23
    return rows


def check(args, mutation=None):
    metadata_path = OUT / 'pcb25_4square_installed_transform.json'
    metadata = json.loads(metadata_path.read_text())
    source = OUT / 'pcb25_4square_installed.blend'
    acceptance_path = OUT / 'thermal-digital-acceptance.json'
    acceptance = json.loads(acceptance_path.read_text())
    hardware_path = OUT / acceptance['hardware_report']
    hardware = json.loads(hardware_path.read_text())
    source_accepted = (acceptance['acceptance'] is True
                       and digest(hardware_path) == acceptance['hardware_sha256']
                       and hardware['acceptance'] is True
                       and hardware['checker_sha256'] == digest(ROOT/'check_thermal_installed_hardware.py')
                       and any(Path(v['scene']).name == source.name
                               and v['sha256'] == digest(source)
                               for v in hardware['variants']))
    bpy.ops.wm.open_mainfile(filepath=str(source))
    accepted = {n: snapshot(bpy.context.scene.objects[n]) for n in THERMAL}
    bpy.ops.wm.open_mainfile(filepath=str(args.scene))
    scene = bpy.context.scene.objects
    if mutation:
        kind, name = mutation
        if kind == 'render_modifier':
            modifier=bpy.data.objects[name].modifiers.new('negative render divergence','SOLIDIFY')
            modifier.thickness=2
            modifier.show_viewport=False
            modifier.show_render=True
        obj = scene[name]
        if kind == 'displaced':
            obj.location.x += 2
        elif kind == 'substituted':
            obj.data = scene['main_lid'].data.copy()
        elif kind == 'stale_sht':
            obj.data = obj.data.copy()
            for v in obj.data.vertices:
                v.co.x *= 0.9
    bpy.context.view_layer.update()
    rows = mappings(metadata)
    expected = {r[0] for r in rows}
    actual = {o.name for o in scene if o.type == 'MESH' and not o.hide_render
              and not o.name.startswith(('REFERENCE_', 'PURCHASED_'))}
    report = {'pass': True, 'mutation': mutation, 'blender': bpy.app.version_string,
              'scene': str(args.scene), 'scene_sha256': digest(args.scene),
              'accepted_source_sha256': digest(source),
              'source_acceptance_pass': source_accepted,
              'acceptance_report_sha256': digest(acceptance_path),
              'transform_metadata_sha256': digest(metadata_path),
              'scope': 'Digital export identity only; no physical hardware approval',
              'inventory': {'expected_quantity': 23, 'actual_quantity': len(actual),
                            'missing': sorted(expected-actual),
                            'unexpected': sorted(actual-expected)},
              'thermal': [], 'manufacturing': []}
    report['pass'] = (source_accepted and actual == expected
                      and set(metadata['variant_objects']) == set(THERMAL))
    tagged = {o.name for o in scene if o.get('research_thermal_variant')}
    nonprint = {o.name for o in scene if o.get('research_nonprintable')}
    report['thermal_tag_inventory_pass'] = tagged == set(THERMAL) and nonprint == set(THERMAL[3:])
    report['pass'] &= report['thermal_tag_inventory_pass']
    for name in THERMAL:
        if mutation and name != mutation[1]:
            continue
        obj = scene.get(name)
        result = {'name': name, 'pass': False}
        if obj and obj.type == 'MESH':
            a, b = accepted[name], snapshot(obj)
            topology = a['edges'] == b['edges'] and a['faces'] == b['faces']
            error = max((abs(x-y) for va, vb in zip(a['vertices'], b['vertices'])
                         for x, y in zip(va, vb)), default=0)
            result.update(topology_equal=topology, world_vertex_error_mm=error,
                          matrix_error=matrix_error(a['matrix'], b['matrix']))
            result['pass'] = (topology and len(a['vertices']) == len(b['vertices'])
                              and error < 0.0001 and result['matrix_error'] < 0.000001
                              and not obj.modifiers and not obj.constraints)
        report['thermal'].append(result)
        report['pass'] &= result['pass']
    quantities = Counter(str(file.relative_to(ROOT)) for _, file, _ in rows)
    report['file_quantities'] = dict(sorted(quantities.items()))
    for name, file, transform in rows:
        # Baseline checks every manufacturing instance. Mutation controls need
        # only recheck the changed instance: untouched mappings are already
        # covered, avoiding nineteen full repetitions of expensive Booleans.
        if mutation and name != mutation[1]:
            continue
        obj = scene.get(name)
        result = {'instance': name, 'file': str(file.relative_to(ROOT)),
                  'quantity': quantities[str(file.relative_to(ROOT))],
                  'manufacturing_to_world': [list(r) for r in transform], 'pass': False}
        if obj and file.is_file():
            result['file_sha256'] = digest(file)
            bpy.ops.wm.stl_import(filepath=str(file))
            imported = bpy.context.object
            try:
                imported.matrix_world = transform
                bpy.context.view_layer.update()
                av, bv = volume(obj), volume(imported)
                common = intersection(obj, imported)
                error = max(abs(a-b) for a, b in zip(bounds(obj), bounds(imported)))
                ah, bh = triangle_hash(obj), triangle_hash(imported)
                distance = vertex_distance(obj, imported)
                # Thermal meshes are baked world-mm; their object matrix is identity.
                expected_matrix = Matrix.Identity(4) if name in THERMAL else transform
                me = matrix_error(obj.matrix_world, expected_matrix)
                result.update(bounds_error_mm=error, installed_volume_mm3=av,
                              export_volume_mm3=bv, intersection_mm3=common,
                              symmetric_difference_mm3=max(0, av+bv-2*common),
                              installed_geometry_sha256=ah, roundtrip_geometry_sha256=bh,
                              triangle_hash_equal=ah == bh, vertex_distance_mm=distance,
                              matrix_error=me)
                result['pass'] = (error < 0.001 and av > 0 and bv > 0
                                  and abs(av-common) < 0.2 and abs(bv-common) < 0.2
                                  and distance < 0.001 and me < 0.00001
                                  and not geometry_modifiers(obj) and not obj.constraints)
            finally:
                bpy.data.objects.remove(imported, do_unlink=True)
        report['manufacturing'].append(result)
        report['pass'] &= result['pass']
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--scene', type=Path, default=OUT/'combined-thermal-candidate.blend')
    parser.add_argument('--reports', type=Path, default=Path('/tmp/opencode/integrated-export-contract'))
    parser.add_argument('--self-test', action='store_true')
    args = parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    args.reports.mkdir(parents=True, exist_ok=True)
    def run(label, mutation=None):
        try:
            report = check(args, mutation)
        except Exception as exc:
            report = {'pass': False, 'error': repr(exc), 'mutation': mutation}
        path = args.reports / (label + '.json')
        path.write_text(json.dumps(report, indent=2) + '\n')
        print('CONTRACT', label, 'PASS' if report['pass'] else 'FAIL', path, flush=True)
        return report
    baseline = run('baseline')
    tests = []
    if args.self_test:
        for kind, names in [('displaced', THERMAL), ('substituted', THERMAL),
                            ('stale_sht', ['sht_adjustable_carrier']),
                            ('render_modifier',['main_lid'])]:
            for index, name in enumerate(names):
                report = run('%s-%02d' % (kind, index+1), (kind, name))
                # Exceptions are test errors, not evidence of detecting a regression.
                section = 'manufacturing' if kind in ('stale_sht','render_modifier') else 'thermal'
                key = 'instance' if kind in ('stale_sht','render_modifier') else 'name'
                detected = (not report['pass'] and 'error' not in report
                            and any(r[key] == name and not r['pass']
                                    for r in report.get(section, [])))
                tests.append({'mutation': [kind, name], 'detected': detected})
    summary = {'blender_version':bpy.app.version_string,'pass': baseline['pass'] and all(t['detected'] for t in tests),
               'baseline_pass': baseline['pass'], 'negative_tests': tests}
    (args.reports/'summary.json').write_text(json.dumps(summary, indent=2)+'\n')
    if not summary['pass']:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
