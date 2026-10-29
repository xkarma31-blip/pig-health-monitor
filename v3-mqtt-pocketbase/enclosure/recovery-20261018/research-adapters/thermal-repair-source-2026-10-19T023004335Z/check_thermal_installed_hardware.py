"""Independent final-mesh checker; never imports/runs the geometry builder.

blender -b --python-exit-code 1 --python check_thermal_installed_hardware.py
Optional arguments after --: installed.blend ...
Reports are exclusive-created, timestamped evidence, including failed runs.
Nominal envelopes are design assumptions, NOT measured hardware certification.
"""
import bpy
import bmesh
import hashlib
import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'research-adapters'
if bpy.app.version < (4, 2, 0):
    raise RuntimeError('Use Blender >=4.2 for the saved thermal installed scenes; system Blender4.0 is incompatible')
TOL = 0.03
VOLUME_TOL = 0.001
NOMINAL = {
    'M3': dict(shaft_radius=1.5, shaft_length=20, head_radius=2.5,
               head_height=2, washer_inner=1.6, washer_outer=3,
               washer_thickness=0.5, tool_radius=3, tool_length=20),
    'M2': dict(shaft_radius=1, shaft_length=5, head_radius=1.9,
               head_height=2, washer_inner=1.1, washer_outer=2.5,
               washer_thickness=0.3, tool_radius=2.2, tool_length=15),
}


def tree(obj):
    obj.data.calc_loop_triangles()
    return BVHTree.FromPolygons(
        [obj.matrix_world @ v.co for v in obj.data.vertices],
        [list(p.vertices) for p in obj.data.loop_triangles], all_triangles=True)


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
                for vertex in edge.verts:
                    if vertex in unseen:
                        unseen.remove(vertex)
                        stack.append(vertex)
    result = dict(islands=islands, nonmanifold=sum(not e.is_manifold for e in bm.edges),
                  volume=abs(bm.calc_volume()))
    bm.free()
    return result


def annulus(inner, outer):
    # Equal-area radial cells, not four isolated seat points.
    return [(math.sqrt(inner**2+(outer**2-inner**2)*(r+0.5)/6)*math.cos(a*math.tau/48),
             math.sqrt(inner**2+(outer**2-inner**2)*(r+0.5)/6)*math.sin(a*math.tau/48))
            for r in range(6) for a in range(48)]


def surface(bvh, point, axis, distance=40):
    hit, normal, _, _ = bvh.ray_cast(point+axis*distance, -axis, distance*2)
    return (hit, normal)


def footprint(bvh, center, axis, u, v, inner, outer, thickness):
    rows = []
    for x, y in annulus(inner, outer):
        p = center+u*x+v*y
        hit, normal = surface(bvh, p, axis)
        bottom, bn = surface(bvh, p, -axis)
        good = (hit is not None and bottom is not None
                and abs((hit-p).dot(axis)) <= TOL
                and normal.dot(axis) >= 0.999
                and (hit-bottom).dot(axis) >= thickness)
        rows.append(dict(ok=good, top=list(hit) if hit is not None else None,
                         bottom=list(bottom) if bottom is not None else None))
    return dict(ok=all(r['ok'] for r in rows), samples=rows,
                nominal_area_mm2=math.pi*(outer**2-inner**2),
                supported_samples=sum(r['ok'] for r in rows), total_samples=len(rows))


def cylinder(name, center, axis, radius, length, inner=0):
    bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=radius, depth=length,
                                      location=center)
    obj = bpy.context.object
    obj.name = name
    obj.rotation_mode = 'QUATERNION'
    obj.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(axis)
    bpy.context.view_layer.update()
    if inner:
        cutter = cylinder(name+'_bore', center, axis, inner, length+2)
        boolean(obj, cutter, 'DIFFERENCE')
        bpy.data.objects.remove(cutter, do_unlink=True)
    return obj


def boolean(obj, other, operation):
    bpy.context.view_layer.objects.active = obj
    mod = obj.modifiers.new('independent check', 'BOOLEAN')
    mod.operation, mod.solver, mod.object = operation, 'EXACT', other
    bpy.ops.object.modifier_apply(modifier=mod.name)


def intersection(a, b):
    probe = a.copy()
    probe.data = a.data.copy()
    bpy.context.collection.objects.link(probe)
    try:
        boolean(probe, b, 'INTERSECT')
        return topology(probe)['volume'] if len(probe.data.vertices) else 0
    finally:
        bpy.data.objects.remove(probe, do_unlink=True)


def check(path):
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    bpy.ops.wm.open_mainfile(filepath=str(path))
    meta = json.loads(bpy.context.scene['thermal_installation_metadata'])
    transform = Matrix(meta['sensor_local_to_installed_world'])
    rotation = transform.to_3x3()
    local_axis = (rotation @ Vector((0, 0, 1))).normalized()
    lu, lv = (rotation @ Vector((1, 0, 0))).normalized(), (rotation @ Vector((0, 1, 0))).normalized()
    parts = [bpy.data.objects[n] for n in meta['variant_objects']]
    fixed = [bpy.data.objects[n] for n in meta['fixed_context_objects']]
    carrier, bars, pcb, package = parts[0], parts[1:3], parts[3], parts[4]
    cradle = bpy.data.objects['thermal_raised_cradle']
    ct, bt = tree(carrier), [tree(b) for b in bars]
    result = dict(scene=str(path), sha256=digest, mounts=[], retainers=[],
                  collisions=[], optical=[], receivers=[], topology={p.name: topology(p) for p in parts[:3]})
    hardware = []
    tools = []

    def fastener(label, size, seat, axis, owner, engagement_owner=None):
        spec = NOMINAL[size]
        washer = cylinder(label+'_washer', seat+axis*spec['washer_thickness']/2,
                          axis, spec['washer_outer'], spec['washer_thickness'], spec['washer_inner'])
        head_base = seat+axis*spec['washer_thickness']
        head = cylinder(label+'_head', head_base+axis*spec['head_height']/2,
                        axis, spec['head_radius'], spec['head_height'])
        shaft = cylinder(label+'_shaft', seat-axis*spec['shaft_length']/2,
                         axis, spec['shaft_radius'], spec['shaft_length'])
        tool = cylinder(label+'_tool', head_base+axis*(spec['head_height']+spec['tool_length']/2+TOL),
                        axis, spec['tool_radius'], spec['tool_length'])
        # M2 thread interference with its pilot is intentional, not a clearance
        # exemption for the head, bar, enclosure, or other hardware.
        hardware.extend([(washer, set()), (head, set()),
                         (shaft, {engagement_owner} if engagement_owner else set())])
        # Screws are tightened before fitting the removable hood, as required
        # by the saved assembly contract. Permanent hardware still tests it.
        tools.append((tool, {head.name, washer.name, shaft.name, 'thermal_angled_hood'}))

    axis = Vector((0, -1, 0))
    u, v = Vector((1, 0, 0)), Vector((0, 0, 1))
    for x in (-30, 30):
        for y in (-9, 9):
            center = Vector((x, -30, 80+y))
            hit, _ = surface(ct, center+u*2.4, axis)
            if hit is not None:
                hit = center+axis*(hit-center).dot(axis)
            mount = dict(x=x, y=y, seat_present=hit is not None)
            result['mounts'].append(mount)
            if hit is None:
                mount['ok'] = False
                continue
            mount['washer'] = footprint(ct, hit, axis, u, v, 1.75, 3, 0.8)
            contacts = []
            for dx, dy in annulus(1.75, 3):
                p = hit+u*dx+v*dy
                underside, normal = surface(ct, p, -axis)
                support, sn = surface(tree(cradle), p, axis)
                gap = (underside-support).dot(axis) if underside is not None and support is not None else None
                contacts.append(dict(gap_mm=gap, ok=gap is not None and -TOL <= gap <= TOL
                                     and normal.dot(-axis) > 0.999 and sn.dot(axis) > 0.999))
            mount['underside_bearing'] = contacts
            mount['ok'] = mount['washer']['ok'] and all(c['ok'] for c in contacts)
            fastener(f'M3_{x}_{y}', 'M3', hit, axis, carrier)
            # Explicit DIN934 nominal nut: inspect the saved actual mesh,
            # including bore, bearing face and overlap with the screw's reach.
            nut = bpy.data.objects.get(f'M3_hex_nut_{x}_{y}')
            receiver = dict(name=nut.name if nut else None, ok=False)
            result['receivers'].append(receiver)
            if nut is not None:
                nt = tree(nut)
                center_n = Vector((x, -12.8, 80+y))
                front = center_n+axis*1.2
                back = center_n-axis*1.2
                shaft_end = hit-axis*NOMINAL['M3']['shaft_length']
                depth = min((hit-back).dot(axis), NOMINAL['M3']['shaft_length'])-max(0, (hit-front).dot(axis))
                bore = []
                for z in (-0.8, 0, 0.8):
                    for a in range(24):
                        # Avoid casting exactly along polygon vertex seams.
                        angle = (a+0.371)*math.tau/24
                        direction = u*math.cos(angle)+v*math.sin(angle)
                        wall, _, _, distance = nt.ray_cast(center_n+axis*z, direction, 4)
                        bore.append(dict(distance_mm=distance if wall is not None else None,
                                          ok=wall is not None and 1.49 <= distance <= 1.54))
                bearing = footprint(tree(bpy.data.objects['thermal_face']), front,
                                    -axis, u, v, 1.75, 2.7, 0.8)
                receiver.update(engagement_mm=depth, bore_samples=bore,
                                bearing=bearing, topology=topology(nut))
                receiver['ok'] = (depth >= 2 and all(r['ok'] for r in bore) and bearing['ok']
                                  and receiver['topology']['islands'] == 1
                                  and not receiver['topology']['nonmanifold'])

    w, h, _ = meta['proxy_dimensions_mm']['pcb']
    square = abs(w-h) < 0.001
    for sign, bar, bvh in zip((-1, 1), bars, bt):
        positions = [(sign*(w/2+1.8), y) for y in (-8, 8)] if square else [
            (x, sign*(h/2+0.3)) for x in (-w/2-2.4, w/2+2.4)]
        entry = dict(bar=bar.name, interfaces=[], overlap=[])
        result['retainers'].append(entry)
        for index, (x, y) in enumerate(positions):
            p = transform @ Vector((x, y, 9.5))
            seat, _ = surface(bvh, p+lu*1.5, local_axis)
            if seat is not None:
                seat = p+local_axis*(seat-p).dot(local_axis)
            interface = dict(seat_present=seat is not None)
            entry['interfaces'].append(interface)
            if seat is None:
                interface['ok'] = False
                continue
            interface['head_bearing'] = footprint(bvh, seat, local_axis, lu, lv, 1.25, 1.9, 1.0)
            # Bar underside / boss top must bear over a finite shared annulus.
            boss_rows = []
            for dx, dy in annulus(1.25, 1.6):
                q = seat+lu*dx+lv*dy
                bottom, _ = surface(bvh, q, -local_axis)
                top, normal = surface(ct, q, local_axis)
                gap = (bottom-top).dot(local_axis) if bottom is not None and top is not None else None
                boss_rows.append(dict(gap_mm=gap, ok=gap is not None and -TOL <= gap <= TOL
                                      and normal.dot(local_axis) > 0.999))
            interface['boss_bearing'] = boss_rows
            # Pilot void on axis, material surrounding the pilot through 2mm
            # engagement depth. Explicit nominal thread engagement assumption.
            engagement = []
            for depth in (0.5, 1, 1.5, 2):
                z = 7.8-depth
                origin = transform @ Vector((x, y, z))
                for angle in range(16):
                    theta = (angle+0.371)*math.tau/16
                    direction = lu*math.cos(theta)+lv*math.sin(theta)
                    wall, _, _, distance = ct.ray_cast(origin, direction, 3)
                    engagement.append(dict(distance_mm=distance if wall is not None else None,
                                           ok=wall is not None and 0.7 <= distance <= 0.9))
            interface['pilot_engagement_samples'] = engagement
            interface['ok'] = (interface['head_bearing']['ok'] and all(r['ok'] for r in boss_rows)
                               and all(r['ok'] for r in engagement))
            fastener(f'M2_{sign}_{index}', 'M2', seat, local_axis, bar, carrier.name)
        length = h if square else w
        for i in range(48):
            for inset in (0.15, 0.4, 0.65):
                a = -length/2+(i+0.5)*length/48
                p = transform @ Vector((sign*(w/2-inset), a, 7.6) if square else
                                       (a, sign*(h/2-inset), 7.6))
                hit, normal, _, gap = bvh.ray_cast(p, local_axis, 0.34)
                entry['overlap'].append(hit is not None and gap <= 0.31 and normal.dot(-local_axis) > 0.999)
        entry['ok'] = all(i['ok'] for i in entry['interfaces']) and all(entry['overlap'])

    # Exact PCB seat plane and oriented normal, not the builder's 0.07mm hit interval.
    result['pcb_bearing'] = []
    for sign in (-1, 1):
        samples = []
        length = h if square else w
        for i in range(100):
            for j in range(10):
                a = -length/2+(i+0.5)*length/100
                e = sign*((w if square else h)/2-(j+0.5)*1.5/10)
                p = transform @ Vector((e, a, 6) if square else (a, e, 6))
                hit, normal, _, distance = ct.ray_cast(p+local_axis*0.01, -local_axis, 0.08)
                samples.append(hit is not None and abs(distance-0.01) <= 0.005 and normal.dot(local_axis) > 0.999)
        result['pcb_bearing'].append(dict(edge=sign, fraction=sum(samples)/len(samples), ok=sum(samples)/len(samples) >= 0.95))

    solids = fixed+parts+[o for o, _ in hardware]
    for i, obj in enumerate(parts):
        for other in fixed+parts[i+1:]:
            volume = intersection(obj, other)
            if volume > VOLUME_TOL:
                result['collisions'].append(dict(a=obj.name, b=other.name, mm3=volume))
    for obj, excluded in hardware+tools:
        for other in solids:
            if other == obj or other.name in excluded:
                continue
            volume = intersection(obj, other)
            if volume > VOLUME_TOL:
                result['collisions'].append(dict(a=obj.name, b=other.name, mm3=volume))
    obstacles = [(o.name, tree(o)) for o in fixed+[carrier]+bars+[o for o, _ in hardware]]
    for pupil in (-2, 0, 2, 4, 8, 12):
        for offset in ((0, 0), (-2, -2), (2, 2)):
            for fov in ((55, 35), (110, 75)):
                for allowance in (0, 1):
                    hits = set()
                    for ix in range(11):
                        for iy in range(11):
                            d = rotation @ Vector(((ix/5-1)*math.tan(math.radians(fov[0]/2)),
                                                   (iy/5-1)*math.tan(math.radians(fov[1]/2)), 1))
                            for dx, dy in ((0, 0), (allowance, 0), (-allowance, 0), (0, allowance), (0, -allowance)):
                                origin = transform @ Vector((offset[0]+dx, offset[1]+dy, 7.6+pupil))
                                for name, bvh in obstacles:
                                    if bvh.ray_cast(origin, d.normalized(), 150)[0] is not None:
                                        hits.add(name)
                    result['optical'].append(dict(pupil=pupil, offset=offset, fov=fov,
                                                  allowance=allowance, hits=sorted(hits)))
    result['gates'] = dict(
        connected_solids=all(t['islands'] == 1 and not t['nonmanifold'] and t['volume'] > 0 for t in result['topology'].values()),
        four_mount_load_paths=len(result['mounts']) == 4 and all(m['ok'] for m in result['mounts']),
        fastened_retainers=len(result['retainers']) == 2 and all(r['ok'] for r in result['retainers']),
        exact_pcb_bearing=all(r['ok'] for r in result['pcb_bearing']),
        hardware_and_tool_clearance=not result['collisions'],
        m3_threaded_receiver_established=len(result['receivers']) == 4 and all(r['ok'] for r in result['receivers']))
    result['mechanically_valid'] = all(result['gates'].values())
    for scenario in result['optical']:
        scenario['accepted'] = result['mechanically_valid'] and not scenario['hits']
    return result


def main():
    args = sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
    paths = [Path(p).resolve() for p in args] if args else sorted(OUT.glob('pcb*_installed.blend'))
    report = dict(checker_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                  nominal_hardware_mm=NOMINAL, contact_tolerance_mm=TOL,
                  limitations=['Sampled finite footprints and rays, not structural/physical certification.',
                               'M2 washer is an optional clearance envelope; bearing requires nominal head footprint.',
                                'M3 DIN934 nominal nuts: AF5.5, thickness2.4, nominal bore3; thread strength is not physically certified.'],
                  variants=[])
    for path in paths:
        try:
            report['variants'].append(check(path))
        except Exception as error:
            report['variants'].append(dict(scene=str(path), mechanically_valid=False, error=repr(error)))
    report['acceptance'] = bool(paths) and all(v['mechanically_valid'] for v in report['variants'])
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    target = OUT / f'thermal-installed-hardware-checks-{stamp}.json'
    with target.open('x') as stream:
        json.dump(report, stream, indent=2)
    print('INSTALLED HARDWARE REPORT', target, 'acceptance=', report['acceptance'])
    if not report['acceptance']:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
