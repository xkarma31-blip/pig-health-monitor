"""Blender 4.0 research reservations; never edits or saves the input scene.

Run: blender -b --python check_integrated_routes.py
Outputs are intentionally scoped research evidence, not assembly approval.
"""
import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'research-adapters'
BOUNDS = {}


def inside(tree, point):
    """Parity, not normal orientation (imported STL normals are not trusted)."""
    bounds = BOUNDS.get(id(tree))
    if bounds and any(point[k] < bounds[0][k] or point[k] > bounds[1][k] for k in range(3)):
        return False
    direction = Vector((0.81113, 0.33117, 0.48191)).normalized()
    origin = point.copy()
    count = 0
    for _ in range(4096):
        hit, _, _, _ = tree.ray_cast(origin, direction, 1000)
        if hit is None:
            return count % 2 == 1
        count += 1
        origin = hit + direction * 0.001
    raise RuntimeError('Parity did not converge')


def trees():
    result = {}
    dg = bpy.context.evaluated_depsgraph_get()
    for obj in list(bpy.context.scene.objects):
        if obj.type != 'MESH' or obj.name.startswith('REFERENCE_'):
            continue
        evaluated = obj.evaluated_get(dg)
        mesh = evaluated.to_mesh()
        result[obj.name] = BVHTree.FromPolygons(
            [obj.matrix_world @ v.co for v in mesh.vertices],
            [list(p.vertices) for p in mesh.polygons], all_triangles=False)
        vertices = [obj.matrix_world @ v.co for v in mesh.vertices]
        BOUNDS[id(result[obj.name])] = ([min(v[k] for v in vertices) for k in range(3)],
                                      [max(v[k] for v in vertices) for k in range(3)])
        evaluated.to_mesh_clear()
    return result


def capsule_check(points, radius, obstacles, step=0.4):
    """Distance-to-solid capsule sweep with conservative Lipschitz sampling.

    Each sampled center must be outside every solid and distance must exceed
    radius + half sample spacing. Thus no inter-sample clearance is invented.
    Uncertain grazing is a failure, not a pass. Includes spherical bend unions;
    no claim that a real cable can take these sharp polyline bends.
    """
    hits = {}
    minimum = float('inf')
    for segment, (a, b) in enumerate(zip(points, points[1:])):
        a, b = Vector(a), Vector(b)
        count = max(1, math.ceil((b-a).length / step))
        allowance = (b-a).length / count / 2
        for i in range(count+1):
            p = a.lerp(b, i/count)
            for name, tree in obstacles.items():
                bounds = BOUNDS.get(id(tree))
                if bounds:
                    box_distance = math.sqrt(sum(max(bounds[0][k]-p[k], 0, p[k]-bounds[1][k])**2 for k in range(3)))
                    if box_distance > radius+allowance+1:
                        minimum = min(minimum, box_distance-radius-allowance)
                        continue
                nearest = tree.find_nearest(p)
                if nearest[0] is None:
                    continue
                distance = nearest[3]
                # Only expensive parity when sufficiently distant to otherwise pass.
                clearance = distance-radius-allowance
                if clearance > 0 and inside(tree, p):
                    clearance = -distance-radius-allowance
                minimum = min(minimum, clearance)
                if clearance <= 0 and name not in hits:
                    hits[name] = {'segment': segment, 'point_mm': list(p),
                                  'conservative_clearance_mm': clearance}
    return {'pass': not hits, 'minimum_clearance_lower_bound_mm': minimum,
            'collisions_or_uncertain_grazing': hits}


def strip_check(points, width, thickness, obstacles):
    # Tile oriented rectangular cross-sections with covering spheres. World Z
    # is local mic Y (strip width); tangent and width define thickness normal.
    # At joints both segment end sections are tested; bend mechanics unsupported.
    hits = {}
    minimum = float('inf')
    nw, nt = math.ceil(width/.3), math.ceil(thickness/.3)
    radius = math.hypot(width/nw, thickness/nt)/2 + .025
    for segment, (a,b) in enumerate(zip(points, points[1:])):
        a,b = Vector(a),Vector(b)
        normal = (b-a).normalized().cross(Vector((0,0,1))).normalized()
        for i in range(nw):
            for j in range(nt):
                offset = Vector((0,0,(i+.5)*width/nw-width/2)) + normal*((j+.5)*thickness/nt-thickness/2)
                check = capsule_check([a+offset,b+offset], radius, obstacles, step=.15)
                minimum = min(minimum, check['minimum_clearance_lower_bound_mm'])
                for name,witness in check['collisions_or_uncertain_grazing'].items():
                    hits.setdefault(name, {**witness, 'route_segment': segment})
    return {'pass': not hits, 'minimum_clearance_lower_bound_mm': minimum,
            'collisions_or_uncertain_grazing': hits}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--self-test', action='store_true')
    args = parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    if bpy.app.version[:2] != (4, 0):
        raise RuntimeError('This evidence run requires Blender 4.0')
    if args.self_test:
        vertices = [(x,y,z) for x,y,z in [(-1,-1,-1), (1,-1,-1), (1,1,-1),
                    (-1,1,-1), (-1,-1,1), (1,-1,1), (1,1,1), (-1,1,1)]]
        tree = BVHTree.FromPolygons(vertices, [(0,3,2,1),(4,5,6,7),
                    (0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)])
        obs = {'test solid': tree}
        tests = {
            'crossing': not capsule_check([(-3,0,0),(3,0,0)], .2, obs)['pass'],
            'contained': not capsule_check([(0,0,0),(.1,0,0)], .1, obs)['pass'],
            'clear': capsule_check([(-3,3,0),(3,3,0)], .2, obs)['pass'],
            'finite_not_ray': not capsule_check([(-3,1.1,0),(3,1.1,0)], .2, obs)['pass'],
            'strip_width': not strip_check([(-3,1.4,0),(3,1.4,0)], 2.5, 1, obs)['pass']}
        (OUT/'integrated-route-tests.json').write_text(json.dumps(tests, indent=2))
        print(tests)
        if not all(tests.values()):
            raise SystemExit(1)
        return
    source = OUT/'combined-thermal-candidate.blend'
    bpy.ops.wm.open_mainfile(filepath=str(source))
    obstacles = trees()
    inventory = {o.name: {'matrix_world': [list(row) for row in o.matrix_world],
                 'bounds_world_mm': [list(o.matrix_world @ Vector(v)) for v in o.bound_box]}
                 for o in bpy.context.scene.objects if o.type == 'MESH'}
    # Existing main upper/lower bores: world (0,-16,+/-55).
    # Existing thermal lower bore: (0,-8,62); acoustic upper: (0,-16,-62).
    routes = {
        'thermal_initial_depth_mismatch': [(0,-19,14),(0,-16,50),(0,-16,65),(0,-28,72)],
        'thermal_initial_cradle_approach': [(0,-19,14),(0,-16,48),(0,-16,58),
                    (0,-8,58),(0,-8,66),(20,-8,70),(20,-20,70),(8,-25,70)],
        'thermal_repaired_existing_lower_bore': [(0,-19,14),(0,-16,48),(0,-16,58),
                    (0,-8,58),(0,-8,66),(20,-8,70),(20,-20,70),(8,-20,70)],
        'mic_left': [(0,-19,-14),(0,-16,-48),(0,-16,-66),(-24,-16,-70),(-24,-16,-80)],
        'mic_right': [(0,-19,-14),(0,-16,-48),(0,-16,-66),(24,-16,-70),(24,-16,-80)],
        'sht_initial_through_sidewall': [(12,-19,0),(104,-14,61)],
        'sht_repaired_upper_exit_external': [(12,-19,0),(0,-16,48),(0,-16,58),
                    (52,-16,58),(80,-20,58),(104,-20,61),(104,-16,61)]}
    wire = []
    for name, points in routes.items():
        wire.append({'name': name, 'points_world_mm': points,
                     'bundle_diameter_mm': 2, 'radial_allowance_mm': .25,
                     **capsule_check(points, 1.25, obstacles)})
    ties = []
    for name in ('microphone_strap_carrier', 'microphone_strap_carrier.001'):
        matrix = bpy.data.objects[name].matrix_world
        for y in (-5.25, 5.25):
            # Thread UNDER PCB via both real stop tunnels at local z=9.5;
            # return above nominal board z=12.6, around both outer stop ends.
            local = [(-10,y,9.5),(-7.75,y,9.5),(7.75,y,9.5),(10,y,9.5),
                     (10,y,14),(-10,y,14),(-10,y,9.5)]
            points = [list(matrix @ Vector(p)) for p in local]
            for scenario, width, thickness, head in (
                    ('hypothetical_narrow_NOT_generic_tie', .6, 1, (2,2,2)),
                    ('conventional_example_NOT_product_spec', 2.5, 1.1, (5,5,4))):
                check = strip_check(points, width, thickness, obstacles)
                # Full finite head bounding sphere at exterior latch station.
                center = list(matrix @ Vector((-10,y,14)))
                head_check = capsule_check([center, center], Vector(head).length/2+.05, obstacles)
                ties.append({'carrier': name, 'local_lane_y_mm': y,
                             'scenario': scenario, 'strip_width_thickness_mm': [width,thickness],
                             'points_world_mm': points, 'strip_check': check,
                             'head_dimensions_mm': head, 'head_center_world_mm': center,
                             'head_check': head_check, 'pass': check['pass'] and head_check['pass']})
    report = {'status': 'SCOPED_RESEARCH_ONLY', 'blender': bpy.app.version_string,
              'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
              'units': 'scene coordinates interpreted as mm, consistent with builders',
              'method': 'evaluated world meshes; capsule distance sweep with solid parity and Lipschitz sampling bound',
              'wire_routes': wire, 'mic_ties': ties, 'geometry_inventory': inventory,
              'physical_underside_fit': 'UNSUPPORTED: actual PCB underside, connectors and solder joints unmeasured',
              'limitations': ['No input geometry changes; failures retained, no P repairs.',
                  '2mm bundle + 0.25mm radial reservation is an assumed scenario, not measured wiring.',
                  'Polyline capsule union reserves space, not minimum bend radius or threading feasibility.',
                  'Tie strip uses oriented rectangular cross-section tiles with covering spheres and 0.025mm allowance; joint sections overlap, bend mechanics unvalidated.',
                  'Narrow tie and head dimensions hypothetical; no assertion generic or purchased ties fit.',
                  'Nominal PCB contact, underside-safe tie lanes, acoustic response, assembly sequence unsupported.',
                  'Routes tested independently; shared wire trunks are ONE common 2mm bundle assumption, not multiple independent bundles.',
                  'No connector insertion envelopes, strain relief, fatigue, waterproofing or physical approval.']}
    report['all_selected_reservations_clear'] = all(r['pass'] for r in wire if 'initial' not in r['name']) and all(t['pass'] for t in ties if t['scenario'].startswith('hypothetical'))
    (OUT/'integrated-routes.json').write_text(json.dumps(report, indent=2))
    lines = ['# Integrated route research evidence', '', 'Physical underside fit: **UNSUPPORTED**.',
             'Input and P geometry unchanged. Failed reservations are retained.', '']
    for entry in wire:
        lines.append('- '+entry['name']+': '+('CLEAR (digital scenario only)' if entry['pass'] else 'FAIL / uncertain grazing')+
                     '; obstacles: '+', '.join(entry['collisions_or_uncertain_grazing']))
    for entry in ties:
        lines.append('- '+entry['carrier']+' lane '+str(entry['local_lane_y_mm'])+' '+entry['scenario']+
                     ': '+('CLEAR (hypothetical only)' if entry['pass'] else 'FAIL / conservative envelope'))
    lines += ['', '## Limits', *['- '+x for x in report['limitations']],
              '', 'Coordinates, transforms, first collision witnesses and clearance bounds: `integrated-routes.json`.']
    (OUT/'integrated-routes.md').write_text('\n'.join(lines)+'\n')
    print('\n'.join(lines))


if __name__ == '__main__':
    main()
