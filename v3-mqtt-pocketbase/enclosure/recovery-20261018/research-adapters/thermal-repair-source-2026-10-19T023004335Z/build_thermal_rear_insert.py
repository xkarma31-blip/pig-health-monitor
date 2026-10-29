"""Blender research only: rear carriers, mm; no measured hardware-fit claim.
Run: blender -b --python build_thermal_rear_insert.py
Exports are in sensor-local print coordinates; installed tests use the baked
15-degree cradle transform followed by render_assembled's assembly mapping.
"""
import bpy
import bmesh
import json
import math
import hashlib
import sys
import shutil
from datetime import datetime, timezone
from pathlib import Path
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'research-adapters'
OUT.mkdir(exist_ok=True)
# Preserve every replaced mesh/scene, including earlier passing research meshes.
history = OUT / ('thermal-history-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'))
history.mkdir()
for pattern in ('pcb*.stl', 'pcb*_installed.blend', 'pcb*_installed_transform.json',
                'thermal-rear-insert-checks.json'):
    for previous in OUT.glob(pattern):
        shutil.copy2(previous, history / previous.name)
P = ROOT / 'revision-p'
bpy.ops.wm.read_factory_settings(use_empty=True)
R = Matrix.Rotation(math.radians(15), 4, 'X')
O = Vector((0, 0, 6.5))
# Outline estimates only; source evidence already archived in research-adapters.
BOARDS = {'pcb25_4x17_78': (25.4, 17.78),
          'pcb25_4square': (25.4, 25.4), 'pcb28x16': (28, 16)}
T, GAP, BEARING = 1.6, 0.3, 1.5
REAR, FRONT = 6.0, 7.6


def box(name, dims, pos):
    bpy.ops.mesh.primitive_cube_add(size=1, location=pos)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dims
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return obj


def cyl(name, radius, depth, pos):
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=radius,
                                    depth=depth, location=pos)
    bpy.context.object.name = name
    return bpy.context.object


def boolean(obj, tool, operation):
    bpy.context.view_layer.update()
    bpy.context.view_layer.objects.active = obj
    mod = obj.modifiers.new(operation, 'BOOLEAN')
    mod.operation, mod.solver, mod.object = operation, 'EXACT', tool
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(tool, do_unlink=True)


def topology(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    unseen = set(bm.verts)
    islands = 0
    while unseen:
        islands += 1
        stack = [unseen.pop()]
        while stack:
            for edge in stack.pop().link_edges:
                for v in edge.verts:
                    if v in unseen:
                        unseen.remove(v)
                        stack.append(v)
    result = dict(nonmanifold_edges=sum(not e.is_manifold for e in bm.edges),
                  degenerate_faces=sum(f.calc_area() < 1e-10 for f in bm.faces),
                  volume_mm3=bm.calc_volume(), islands=islands)
    bm.free()
    return result


def export(obj, filename):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    if bpy.app.version >= (4, 1, 0):
        bpy.ops.wm.stl_export(filepath=str(filename), export_selected_objects=True)
    else:
        bpy.ops.export_mesh.stl(filepath=str(filename), use_selection=True)


def install(obj):
    bpy.context.view_layer.update()
    # local -> construction -> world, no double tilt
    for v in obj.data.vertices:
        q = O + R.to_3x3() @ (obj.matrix_world @ v.co)
        v.co = (q.x, -17-q.z, 80+q.y)
    obj.matrix_world = Matrix.Identity(4)
    obj.data.update()
    bpy.context.view_layer.update()


def tree(obj):
    obj.data.calc_loop_triangles()
    return BVHTree.FromPolygons([obj.matrix_world @ v.co for v in obj.data.vertices],
                               [list(p.vertices) for p in obj.data.loop_triangles], all_triangles=True)


def intersection(a, b):
    bpy.context.view_layer.update()
    probe = a.copy()
    probe.data = a.data.copy()
    bpy.context.collection.objects.link(probe)
    bpy.context.view_layer.objects.active = probe
    mod = probe.modifiers.new('measured intersection', 'BOOLEAN')
    mod.operation, mod.solver, mod.object = 'INTERSECT', 'EXACT', b
    bpy.ops.object.modifier_apply(modifier=mod.name)
    volume = abs(topology(probe)['volume_mm3']) if len(probe.data.vertices) else 0
    bpy.data.objects.remove(probe, do_unlink=True)
    return volume


active = []
manifest = {}
layout = {'main_tub': (0, 0), 'main_lid': (0, 30),
          'thermal_tub': (80, 0), 'thermal_face': (80, 14),
          'thermal_raised_cradle': (80, 17), 'thermal_angled_hood': (80, 17),
          'acoustic_tub': (-80, 0), 'acoustic_face': (-80, 30),
          'mounting_spine': (0, -5), 'sht_mount_arm': (61, -10)}
for name, (height, depth) in layout.items():
    path = P / (name+'.stl')
    manifest[name] = hashlib.sha256(path.read_bytes()).hexdigest()
    if bpy.app.version >= (4, 1, 0):
        bpy.ops.wm.stl_import(filepath=str(path))
    else:
        bpy.ops.import_mesh.stl(filepath=str(path))
    obj = bpy.context.object
    obj.name = name
    obj.rotation_euler.x = math.pi/2
    obj.location = (0, -depth, height)
    active.append(obj)
bpy.context.view_layer.update()
report = {'units': 'mm', 'P_sha256': manifest, 'source_outlines_mm': BOARDS,
          'assumptions': {'pcb_thickness': T, 'lateral_allowance': GAP,
                          'edge_bearing_width': BEARING, 'rear_plane': REAR,
                          'front_plane': FRONT, 'component_free_edge_required': 1.5,
                          'package_proxy': [12, 8, 2],
                          'not_measured': True}, 'variants': {}}
for name, (w, h) in BOARDS.items():
    # Board-specific placement experiment; dimensions remain full envelopes.
    # Reserve its full outline; do not trim electronics to fit the enclosure.
    if name == 'pcb25_4square':
        # Center the tall PCB in the construction-axis aperture: its tilt
        # moves the board center rearward in Y by sin(15)*6.8 mm.
        O = Vector((0, 1.8, 6.5))
    else:
        O = Vector((0, 0, 6.5))
    # Broad square board: carry it on side edges, with the end retainers
    # replaced by side retainers. This keeps tall stops inside the hood's
    # horizontal aperture instead of pushing them beyond its narrow Y throat.
    # Open rear ladder: two 3mm-wide transverse rails joined by side beams.
    rail_y = 8 if name == 'pcb25_4square' else h/2-0.75
    obj = box(name, (68, 3, 2), (0, -rail_y, 5))
    boolean(obj, box('rail', (68, 3, 2), (0, rail_y, 5)), 'UNION')
    if name == 'pcb25_4square':
        for x in (-w/2+0.75, w/2-0.75):
            boolean(obj, box('side bearing', (3, h, 2), (x, 0, 5)), 'UNION')
    for x in (-30, 30):
        boolean(obj, box('beam', (8, h+6, 2), (x, 0, 5)), 'UNION')
        for y in (-9, 9):
            # Vertical construction-axis bolt holes, not tilted PCB holes.
            q = R.inverted().to_3x3() @ (Vector((x, y, 9.2+y*math.tan(math.radians(15))+0.15))-O)
            foot = cyl('stand', 3.4, 3.0, (q.x, q.y, 3.5))
            boolean(obj, foot, 'UNION')
    if True:  # All active variants use the proven connected-frame architecture.
        # Inboard longitudinal webs bypass the cradle strap slots; positive
        # overlap joins both bearing rails before any enclosure subtraction.
        for x in (-20, 20):
            boolean(obj, box('inboard load web', (3, h+3, 2), (x, 0, 5)), 'UNION')
    # Positive side/end stops; open center for unknown underside components.
    if True:
        # A single connected frame avoids exact-boolean unions between the
        # coplanar, initially disconnected ladder rails. Keep load paths inside
        # the cradle's strap slots (x=26..28), with continuous outer bolt beams.
        bpy.data.objects.remove(obj, do_unlink=True)
        obj = box(name, (68, h+2, 2), (0, 0, 5))
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
        boolean(obj, box('component opening', (w-3, h-3, 6), (0, 0, 5)), 'DIFFERENCE')
        for x in (-30, 30):
            boolean(obj, box('bolt load beam', (8, max(h+8, 28), 2), (x,0,5)), 'UNION')
        # Real compression columns: construction-vertical, with planar bottoms
        # exactly on the unchanged cradle stand tops. Do not trim these feet
        # away using an expanded cradle cutter later.
        for x in (-30, 30):
            for y in (-9, 9):
                bottom = 9.2+y*math.tan(math.radians(15))
                top = O.z+(y-O.y)*math.tan(math.radians(15))+6/math.cos(math.radians(15))
                foot = cyl('cradle compression foot', 3.4, top-bottom,
                           R.inverted().to_3x3() @ (Vector((x,y,(bottom+top)/2))-O))
                foot.rotation_euler.x = -math.radians(15)
                boolean(obj, foot, 'UNION')
    for x in (-w/2-GAP-1, w/2+GAP+1):
        boolean(obj, box('side stop', (2, h+3, 3.8), (x, 0, 5.9)), 'UNION')
    for y in (-h/2-GAP-1, h/2+GAP+1):
        if name != 'pcb25_4square':
            boolean(obj, box('end stop', (w+4, 2, 3.8), (0, y, 5.9)), 'UNION')
    # Two removable screw-down edge bars, not a snap fit or package crossbar.
    retainers = []
    for sign in (-1, 1):
        if name == 'pcb25_4square':
            # Keep the full M2 shaft outside the unmodified PCB outline.
            x = sign*(w/2+1.8)
            bar = box(name+'_retainer', (4.8, h, 1.6), (x, 0, 8.6))
            for y in (-8, 8):
                boolean(bar, cyl('M2 washer ear', 2.6, 1.6, (x,y,8.6)), 'UNION')
                boolean(obj, cyl('boss bearing collar', 2.7, 3.9, (x,y,5.85)), 'UNION')
                boolean(obj, cyl('M2 pilot approximate', 0.8, 12, (x, y, 6)), 'DIFFERENCE')
                boolean(bar, cyl('M2 clearance', 1.2, 8, (x, y, 8.7)), 'DIFFERENCE')
            retainers.append(bar)
            continue
        y = sign*(h/2+0.3)
        bar = box(name+'_retainer', (w+8, 3.4, 1.6), (0, y, 8.6))
        for x in (-w/2-2.4, w/2+2.4):
            boolean(bar, cyl('M2 washer ear', 2.6, 1.6, (x,y,8.6)), 'UNION')
            boolean(obj, cyl('boss bearing collar', 2.7, 3.9, (x,y,5.85)), 'UNION')
            boolean(obj, cyl('M2 pilot approximate', 0.8, 12, (x, y, 6)), 'DIFFERENCE')
            boolean(bar, cyl('M2 clearance', 1.2, 8, (x, y, 8.7)), 'DIFFERENCE')
        retainers.append(bar)
    # Drill in construction coordinates to match unchanged vertical P pattern.
    if True:
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=0.00001)
        bmesh.ops.dissolve_degenerate(bm, edges=list(bm.edges), dist=0.00001)
        # Keep planar n-gons for subsequent EXACT booleans: triangulating
        # coplanar unions here creates sliver edges at the drilled interfaces.
        bm.to_mesh(obj.data)
        bm.free()
    obj.data.update()
    bpy.context.view_layer.update()
    for x in (-30, 30):
        for y in (-9, 9):
            drill = cyl('M3 clearance', 1.7, 30, (x, y, 10))
            if True:
                drill.location = R.inverted().to_3x3() @ (Vector((x,y,10))-O)
                drill.rotation_euler.x = -math.radians(15)
            boolean(obj, drill, 'DIFFERENCE')
            if True:
                # 0.9 mm minimum load-bearing floor above each cradle stand.
                # Low-profile M3 head required by the unchanged hood roof.
                seat_z = 10.1+y*math.tan(math.radians(15))
                pocket = cyl('flat M3 washer seat', 3.1, 20, (x,y,seat_z+10))
                pocket.location = R.inverted().to_3x3() @ (pocket.location-O)
                pocket.rotation_euler.x = -math.radians(15)
                boolean(obj, pocket, 'DIFFERENCE')
    obj.data.update()
    bpy.context.view_layer.update()
    boolean(obj, box('PCB boss relief',(w+0.1,h+0.1,8),
                     (0,0,REAR+4-0.0001)), 'DIFFERENCE')
    # Recut the complete pilot after frame/stop/relief booleans, avoiding
    # residual coincident fragments at the nominal engagement depths.
    for sign in (-1, 1):
        positions = ([(sign*(w/2+1.8), y) for y in (-8,8)]
                     if name == 'pcb25_4square' else
                      [(x,sign*(h/2+0.3)) for x in (-w/2-2.4,w/2+2.4)])
        for x,y in positions:
            boolean(obj, cyl('final M2 pilot', 0.81, 12, (x,y,6)), 'DIFFERENCE')
    # Trim only research inserts against installed unchanged P solids. This
    # removes stand/platform penetration, not the enclosure's geometry.
    for part in [obj]+retainers:
        install(part)
        for fixed in active:
            if fixed.name in ('thermal_raised_cradle', 'thermal_angled_hood'):
                cutter = fixed.copy()
                cutter.data = fixed.data.copy()
                bpy.context.collection.objects.link(cutter)
                if True:
                    # Offset the solid boundary, including cavity walls, rather
                    # than leaving coincident surfaces after subtraction.
                    for v in cutter.data.vertices:
                        v.co += v.normal * (0.01 if fixed.name == 'thermal_raised_cradle' else 0.02)
                    cutter.data.update()
                boolean(part, cutter, 'DIFFERENCE')
        bm = bmesh.new()
        bm.from_mesh(part.data)
        bmesh.ops.dissolve_degenerate(bm,dist=0.00001,edges=list(bm.edges))
        bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=0.0001)
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        bm.to_mesh(part.data)
        bm.free()
    checks = {'carrier': topology(obj), 'retainers': [topology(b) for b in retainers],
              'bearing_area_mm2': 2*w*BEARING,
              'collisions': [], 'optical': []}
    for i, part in enumerate([obj]+retainers):
        # Installed world -> sensor-local, then export and restore installation.
        for v in part.data.vertices:
            q = Vector((v.co.x, v.co.z-80, -v.co.y-17))
            v.co = R.inverted().to_3x3() @ (q-O)
        export(part, OUT/(name+('_rear_insert' if i == 0 else '_retainer_'+str(i))+'.stl'))
        install(part)
    board = box('PCB envelope', (w, h, T), (0, 0, (REAR+FRONT)/2))
    package = box('ASSUMED package', (12, 8, 2), (0, 0, FRONT+1))
    for proxy in (board, package):
        install(proxy)
    installed = [obj]+retainers+[board, package]
    # Explicit removable threaded receiver: DIN 934 M3 hex nuts, 5.5 AF,
    # 2.4 thick, beneath the stand at construction z=0. Fit nuts before
    # closing the thermal face; hold with a 5.5 mm spanner from below.
    nuts = []
    for x in (-30, 30):
        for y in (-9, 9):
            bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=5.5/math.sqrt(3),
                                               depth=2.4, location=(x,y,-4.2))
            nut = bpy.context.object
            nut.name = 'M3_hex_nut_%s_%s' % (x,y)
            boolean(nut, cyl('M3 threaded bore envelope', 1.52, 4, (x,y,-4.2)), 'DIFFERENCE')
            bpy.context.view_layer.update()
            for vertex in nut.data.vertices:
                q = nut.matrix_world @ vertex.co
                vertex.co = (q.x,-17-q.z,80+q.y)
            nut.matrix_world = Matrix.Identity(4)
            nut.data.update()
            nuts.append(nut)
    installed += nuts
    # Measure surviving support rather than nominal area. Use a 100x10 ray
    # footprint per edge; this is a sampled geometric check, not load testing.
    checks['bearing'] = []
    for sign in (-1, 1):
        # Boolean volume is undefined for a zero-clearance seating contact:
        # use a finite sampled bearing footprint on the final installed mesh.
        area = 0
        bearing_tree = tree(obj)
        for along in range(100):
            for across in range(10):
                length = h if name == 'pcb25_4square' else w
                a = -length/2+(along+0.5)*length/100
                e = sign*(w/2-(across+0.5)*BEARING/10) if name == 'pcb25_4square' else sign*(h/2-(across+0.5)*BEARING/10)
                local = Vector((e,a,REAR+0.01) if name == 'pcb25_4square' else (a,e,REAR+0.01))
                q = O+R.to_3x3() @ local
                dc = R.to_3x3() @ Vector((0,0,-1))
                direction = Vector((dc.x,-dc.z,dc.y))
                hit, normal, _, distance = bearing_tree.ray_cast(Vector((q.x,-17-q.z,80+q.y)), direction, 0.07)
                if hit is not None and abs(distance-0.01) <= 0.005 and normal.dot(-direction) > 0.999:
                    area += length*BEARING/1000
        checks['bearing'].append({'edge': sign, 'area_mm2': area,
                                  'measurement_valid': 0 <= area <= w*BEARING+0.01,
                                  'required_mm2': w*BEARING*0.95})
    checks['bearing_area_mm2'] = sum(b['area_mm2'] for b in checks['bearing'])
    # Retention is measured on the actual exported bars: downward rays must
    # reach their underside above both opposed PCB edges, not merely a boss.
    checks['retention'] = []
    for sign, bar in zip((-1, 1), retainers):
        local = (Vector((sign*(w/2-0.4), 0, FRONT)) if name == 'pcb25_4square'
                 else Vector((0, sign*(h/2-0.4), FRONT)))
        q = O + R.to_3x3() @ local
        start = Vector((q.x, -17-q.z, 80+q.y))
        dc = R.to_3x3() @ Vector((0, 0, 1))
        direction = Vector((dc.x, -dc.z, dc.y))
        hit, _, _, distance = tree(bar).ray_cast(start, direction, 1)
        checks['retention'].append({'edge': sign, 'gap_mm': distance if hit is not None else None,
                                    'captured': hit is not None and distance <= 0.31})
    # Flat vertical-axis M3 seats must be designed explicitly; a tilted frame
    # and a clearance bore alone cannot qualify as a bolt bearing seat.
    checks['bolt_seats'] = []
    carrier_tree = tree(obj)
    for x in (-30, 30):
        for y in (-9, 9):
            samples = []
            for dx, dy in ((2.4,0),(-2.4,0),(0,2.4),(0,-2.4)):
                start = Vector((x+dx, -60, 80+y+dy))
                hit, normal, _, _ = carrier_tree.ray_cast(start, Vector((0,1,0)), 60)
                samples.append((hit, normal))
            flat = all(hit is not None and abs(normal.y) > 0.999 for hit, normal in samples)
            levels = [hit.y for hit, _ in samples if hit is not None]
            checks['bolt_seats'].append({'x': x, 'y': y, 'flat': flat and max(levels)-min(levels)<0.02,
                                        'samples': [{'hit': list(hit) if hit is not None else None,
                                                     'normal': list(normal) if normal is not None else None} for hit,normal in samples]})
    checks['internal_collisions'] = []
    for i, a in enumerate(installed):
        for b in installed[i+1:]:
            vol = intersection(a, b)
            if vol > 0.001:
                checks['internal_collisions'].append({'a': a.name, 'b': b.name, 'mm3': vol})
    for a in installed:
        for b in active:
            vol = intersection(a, b)
            if vol > 0.001:
                checks['collisions'].append({'a': a.name, 'b': b.name, 'mm3': vol})
    topologies = [checks['carrier']]+checks['retainers']
    checks['mechanical_gates'] = {
        'topology': all(t['nonmanifold_edges'] == 0 and t['degenerate_faces'] == 0
                        and t['islands'] == 1 and t['volume_mm3'] > 0 for t in topologies),
        'fixed_clearance': not checks['collisions'],
        'internal_clearance': not checks['internal_collisions'],
        'bearing': all(b['measurement_valid'] and b['area_mm2'] >= b['required_mm2']
                       for b in checks['bearing']),
        'retention': all(r['captured'] for r in checks['retention']),
        'bolt_seats': all(s['flat'] for s in checks['bolt_seats']),
    }
    checks['mechanically_valid'] = all(checks['mechanical_gates'].values())
    # This builder's legacy gates are insufficient for installed hardware.
    # Only the independent checker may establish final hardware acceptance.
    checks['legacy_geometry_valid'] = checks['mechanically_valid']
    checks['mechanically_valid'] = False
    checks['independent_hardware_validation_required'] = True
    obstacles = active+[obj]+retainers
    trees = [(b, tree(b)) for b in obstacles]
    # Finite 150mm forward ray grid. Excludes emitting package and PCB explicitly.
    for pupil in (-2, 0, 2, 4, 8, 12):
        for offset in ((0, 0), (-2, -2), (2, 2)):
            for fov in ((55, 35), (110, 75)):
                for allowance in (0, 1):
                    hits = {}
                    origin_local = Vector((*offset, FRONT+pupil))
                    q = O+R.to_3x3() @ origin_local
                    origin = Vector((q.x, -17-q.z, 80+q.y))
                    for ix in range(11):
                        for iy in range(11):
                            d = Vector(((ix/5-1)*math.tan(math.radians(fov[0]/2)),
                                        (iy/5-1)*math.tan(math.radians(fov[1]/2)), 1))
                            # allowance via pupil translation (five-point envelope),
                            # not a claimed continuous solid-frustum clearance test.
                            for du, dv in ((0, 0), (allowance, 0), (-allowance, 0), (0, allowance), (0, -allowance)):
                                shift = R.to_3x3() @ Vector((du, dv, 0))
                                start = origin+Vector((shift.x, -shift.z, shift.y))
                                dc = R.to_3x3() @ d
                                direction = Vector((dc.x, -dc.z, dc.y)).normalized()
                                for obstacle, bvh in trees:
                                    hit, normal, index, distance = bvh.ray_cast(start, direction, 150)
                                    if hit is not None and obstacle.name not in hits:
                                        hits[obstacle.name] = {'world_mm': list(hit), 'grid': [ix, iy]}
                    checks['optical'].append({'pupil_from_front': pupil, 'offset': offset,
                                             'fov': fov, 'allowance': allowance, 'hits': hits})
    report['variants'][name] = checks
    for scenario in checks['optical']:
        scenario['accepted'] = checks['mechanically_valid'] and not scenario['hits']
    checks['optical_success'] = checks['mechanically_valid'] and all(
        not s['hits'] for s in checks['optical'])
    # Mesh vertices are baked in installed world millimetres; object matrices
    # are identity. Save only this variant plus unchanged P context.
    transform = Matrix(((1,0,0,0),(0,0,-1,-17),(0,1,0,80),(0,0,0,1))) @ Matrix.Translation(O) @ R
    checks['installation'] = {
        'scene': name+'_installed.blend', 'units': 'mm',
        'sensor_local_to_installed_world': [list(row) for row in transform],
        'installed_world_to_sensor_local': [list(row) for row in transform.inverted()],
        'vertices_baked_world': True, 'object_matrices_identity': True,
        'cradle_rotation_x_degrees': 15, 'construction_origin_mm': list(O),
        'variant_objects': [part.name for part in installed],
        'fixed_context_objects': [part.name for part in active],
        'proxy_dimensions_mm': {'pcb': [w,h,T], 'package': [12,8,2]},
        'fastener_contract': {
            'M3': 'Four M3x20 low-profile socket screws: head diameter <=5.0, height <=2.0; washer OD6 ID3.2 thickness0.5; DIN934 nuts AF5.5 thickness2.4 at construction z=-5.4..-3, behind thermal face. Standard 3mm socket heads do NOT fit. Verify face through-bores before assembly.',
            'M2': 'Four M2x5 thread-forming screws into 1.6mm pilots; 2mm minimum engagement, washer OD5 ID2.2 thickness0.3. Qualify pilot with printed coupon before assembly.',
            'assembly': 'Install/hold M3 nuts from underside before thermal face closure. Fit PCB and edge bars before hood. Do not substitute standard-height M3 heads.'},
    }
    bpy.context.scene.unit_settings.system = 'METRIC'
    bpy.context.scene.unit_settings.scale_length = 0.001
    bpy.context.scene['thermal_installation_metadata'] = json.dumps(checks['installation'])
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/(name+'_installed.blend')))
    (OUT/(name+'_installed_transform.json')).write_text(json.dumps(checks['installation'], indent=2))
    for part in installed:
        bpy.data.objects.remove(part, do_unlink=True)
report['P_unchanged'] = all(hashlib.sha256((P/(name+'.stl')).read_bytes()).hexdigest() == digest
                            for name, digest in manifest.items())
report['mechanical_acceptance'] = report['P_unchanged'] and all(
    c['mechanically_valid'] for c in report['variants'].values())
report['blender_version'] = bpy.app.version_string
report['historical_smallest'] = 'pcb25_4x17_78_rear_insert_historical_pre_flat_seat_20261019.stl'
report['repair_acceptance'] = report['mechanical_acceptance']
report['limitations'] = [
    'Historical smallest preserved separately; all active variants require flat bolt seats.',
    'Bearing, retention and optics are sampled geometric checks, not physical fit or load certification.',
    'Optical acceptance is per scenario and always requires every mechanical gate.']
(OUT/'thermal-rear-insert-checks.json').write_text(json.dumps(report, indent=2))
print('THERMAL REAR CHECKS WRITTEN', OUT)
if not report['repair_acceptance']:
    sys.exit(1)
