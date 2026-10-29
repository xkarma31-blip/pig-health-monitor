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
from pathlib import Path
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'research-adapters'
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
    # local -> construction -> world, no double tilt
    for v in obj.data.vertices:
        q = O + R.to_3x3() @ (obj.matrix_world @ v.co)
        v.co = (q.x, -17-q.z, 80+q.y)
    obj.matrix_world = Matrix.Identity(4)
    obj.data.update()


def tree(obj):
    return BVHTree.FromPolygons([obj.matrix_world @ v.co for v in obj.data.vertices],
                               [list(p.vertices) for p in obj.data.polygons])


def intersection(a, b):
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
    # Open rear ladder: two 3mm-wide transverse rails joined by side beams.
    obj = box(name, (68, 3, 2), (0, -h/2+0.75, 5))
    boolean(obj, box('rail', (68, 3, 2), (0, h/2-0.75, 5)), 'UNION')
    for x in (-30, 30):
        boolean(obj, box('beam', (8, h+6, 2), (x, 0, 5)), 'UNION')
        for y in (-9, 9):
            # Vertical construction-axis bolt holes, not tilted PCB holes.
            q = R.inverted().to_3x3() @ (Vector((x, y, 9.2+y*math.tan(math.radians(15))+0.15))-O)
            foot = cyl('stand', 3.4, 3.0, (q.x, q.y, 3.5))
            boolean(obj, foot, 'UNION')
    # Positive side/end stops; open center for unknown underside components.
    for x in (-w/2-GAP-1, w/2+GAP+1):
        boolean(obj, box('side stop', (2, h+3, 3.8), (x, 0, 5.9)), 'UNION')
    for y in (-h/2-GAP-1, h/2+GAP+1):
        boolean(obj, box('end stop', (w+4, 2, 3.8), (0, y, 5.9)), 'UNION')
    # Two removable screw-down edge bars, not a snap fit or package crossbar.
    retainers = []
    for sign in (-1, 1):
        y = sign*(h/2+0.7)
        bar = box(name+'_retainer', (w+8, 3.4, 1.6), (0, y, 8.7))
        for x in (-w/2-2.4, w/2+2.4):
            boolean(obj, cyl('retainer boss', 2.7, 3.8, (x, y, 5.9)), 'UNION')
            boolean(obj, cyl('M2 pilot approximate', 0.8, 12, (x, y, 6)), 'DIFFERENCE')
            boolean(bar, cyl('M2 clearance', 1.2, 8, (x, y, 8.7)), 'DIFFERENCE')
        retainers.append(bar)
    # Drill in construction coordinates to match unchanged vertical P pattern.
    for v in obj.data.vertices:
        v.co = O + R.to_3x3() @ (obj.matrix_world @ v.co)
    obj.matrix_world = Matrix.Identity(4)
    for x in (-30, 30):
        for y in (-9, 9):
            boolean(obj, cyl('M3 clearance', 1.7, 30, (x, y, 10)), 'DIFFERENCE')
    # Return to local export frame.
    for v in obj.data.vertices:
        v.co = R.inverted().to_3x3() @ (v.co-O)
    # Resolve coplanar union seams before installed subtraction (0.5mm voxel
    # approximation; separate from source dimensions and fit allowances).
    bpy.context.view_layer.objects.active = obj
    remesh = obj.modifiers.new('Union seam repair', 'REMESH')
    remesh.mode = 'VOXEL'
    remesh.voxel_size = 0.5
    bpy.ops.object.modifier_apply(modifier=remesh.name)
    # Trim only research inserts against installed unchanged P solids. This
    # removes stand/platform penetration, not the enclosure's geometry.
    for part in [obj]+retainers:
        install(part)
        for fixed in active:
            if fixed.name in ('thermal_raised_cradle', 'thermal_angled_hood'):
                cutter = fixed.copy()
                cutter.data = fixed.data.copy()
                bpy.context.collection.objects.link(cutter)
                boolean(part, cutter, 'DIFFERENCE')
        bm = bmesh.new()
        bm.from_mesh(part.data)
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
    for a in installed:
        for b in active:
            vol = intersection(a, b)
            if vol > 0.001:
                checks['collisions'].append({'a': a.name, 'b': b.name, 'mm3': vol})
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
    for part in installed:
        bpy.data.objects.remove(part, do_unlink=True)
(OUT/'thermal-rear-insert-checks.json').write_text(json.dumps(report, indent=2))
print('THERMAL REAR CHECKS WRITTEN', OUT)
