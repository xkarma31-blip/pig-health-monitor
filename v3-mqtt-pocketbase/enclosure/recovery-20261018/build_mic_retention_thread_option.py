"""Run with Blender 4.0 --background --python; only mic-retention-* outputs.

Nominal cord reservation, not a purchased-product or component-fit approval.
"""
import bpy
import bmesh
import hashlib
import json
import math
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'research-adapters'
bpy.ops.wm.open_mainfile(filepath=str(OUT / 'combined-thermal-candidate.blend'))
original = [o for o in bpy.context.scene.objects if o.type == 'MESH']


def fingerprint(obj):
    return hashlib.sha256(repr((list(obj.matrix_world),
        [tuple(v.co) for v in obj.data.vertices],
        [tuple(p.vertices) for p in obj.data.polygons])).encode()).hexdigest()


before = {o.name: fingerprint(o) for o in original}


def intersection(a, b):
    aa = [a.matrix_world @ Vector(v) for v in a.bound_box]
    bb = [b.matrix_world @ Vector(v) for v in b.bound_box]
    if any(min(max(v[k] for v in aa), max(v[k] for v in bb)) <=
           max(min(v[k] for v in aa), min(v[k] for v in bb)) for k in range(3)):
        return 0.0
    c = a.copy()
    c.data = a.data.copy()
    bpy.context.collection.objects.link(c)
    bpy.context.view_layer.objects.active = c
    mod = c.modifiers.new('collision', 'BOOLEAN')
    mod.operation = 'INTERSECT'
    mod.solver = 'EXACT'
    mod.object = b
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bm = bmesh.new()
    bm.from_mesh(c.data)
    value = abs(bm.calc_volume(signed=True))
    bm.free()
    bpy.data.objects.remove(c, do_unlink=True)
    return value


def sphere(name, p, radius, transform):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=16,
                                      radius=radius, location=transform @ Vector(p))
    obj = bpy.context.object
    obj.name = name
    return obj


def sweep(name, points, transform):
    # Closed, watertight swept circular polygon. Spherical bend envelopes
    # conservatively fill the joins: no centreline-only collision tests.
    pieces = []
    for i, p in enumerate(points):
        q = points[(i + 1) % len(points)]
        a, b = transform @ Vector(p), transform @ Vector(q)
        bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=0.25,
            depth=(b-a).length, location=(a+b)/2)
        obj = bpy.context.object
        obj.name = name + '_segment_' + str(i)
        obj.rotation_euler = (b-a).to_track_quat('Z', 'Y').to_euler()
        pieces.append(obj)
        pieces.append(sphere(name + '_bend_' + str(i), p, 0.25, transform))
    return pieces


results = []
for side, support_name in [('left', 'microphone_strap_carrier'),
                           ('right', 'microphone_strap_carrier.001')]:
    support = bpy.data.objects[support_name]
    transform = support.matrix_world.copy()
    bpy.ops.mesh.primitive_cube_add(size=1)
    pcb = bpy.context.object
    pcb.name = 'mic-retention_' + side + '_nominal_PCB'
    pcb.matrix_world = transform
    pcb.location = transform @ Vector((0, 0, 11.8))
    pcb.scale = (14, 12, 1.6)
    bpy.context.view_layer.objects.active = pcb
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bpy.ops.mesh.primitive_cylinder_add(vertices=128, radius=6.3, depth=24)
    sound = bpy.context.object
    sound.name = 'mic-retention_' + side + '_sound_keepout'
    sound.matrix_world = transform
    sound.location = transform @ Vector((0, 0, 12))
    for sign in (-1, 1):
        # Through both existing tunnels at this side; wrap around the PCB's
        # +/-Y edges, then follow the top X edge lane. No support modification.
        points = [(9.2, -5.25, 9.5), (5.1, -5.25, 9.5),
                  (5.1, -6.65, 9.5), (5.1, -6.65, 13.0),
                  (6.65, -6.65, 13.0), (6.65, 6.65, 13.0),
                  (5.1, 6.65, 13.0), (5.1, 6.65, 9.5),
                  (5.1, 5.25, 9.5), (9.2, 5.25, 9.5)]
        points = [(sign*x, y, z) for x, y, z in points]
        name = 'mic-retention_' + side + '_' + str(sign)
        pieces = sweep(name, points, transform)
        # Reserved knot + trimmed-tail bounding envelope, not knot topology.
        # At the external return strand, not on the PCB or over the sound bore.
        knot = sphere(name + '_knot_tail_envelope', (sign*9.2, 0, 9.5),
                      0.9, transform)
        pieces.append(knot)
        bpy.context.view_layer.update()
        obstacles = original + [pcb, sound]
        hits = []
        for piece in pieces:
            for obstacle in obstacles:
                value = intersection(piece, obstacle)
                if value > 0.00001:
                    hits.append({'cord_part': piece.name, 'obstacle': obstacle.name,
                                 'intersection_mm3': value})
        results.append({'side': side, 'x_sign': sign,
                        'closed_loop_local_mm': points,
                        'swept_radius_mm': 0.25,
                        'knot_tail_envelope_radius_mm': 0.9,
                        'collision_hits': hits, 'pass': not hits})
    pcb.hide_render = True
    sound.hide_render = True
    pcb.hide_set(True)
    sound.hide_set(True)

unchanged = all(fingerprint(o) == before[o.name] for o in original)
report = {'blender_version': bpy.app.version_string,
          'status': 'nominal geometry only; physical retention NOT qualified',
          'cord_assumption': '0.5 mm round polyester lacing cord purchasing family; unmeasured, no vendor research',
          'scene_mesh_count_checked': len(original),
          'original_scene_geometry_unchanged': unchanged,
          'loops': results,
          'pass': unchanged and all(r['pass'] for r in results),
          'method': '32-sided swept cylinders plus spherical bend envelopes; exact Boolean volume against every combined-scene mesh, nominal solid PCB and radius-6.3 full-depth sound keepout; 1e-5 mm3 reporting threshold',
          'limitations': ['No component, copper, solder or actual board measurements supplied',
                         'No knot security, tension, abrasion, creep, vibration or acoustic testing',
                         'No assembly insertion-motion or cord self-collision qualification',
                         'Knot/tail sphere is a reserved maximum, not a simulated tied knot']}
(OUT / 'mic-retention-thread-checks.json').write_text(json.dumps(report, indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'mic-retention-thread-option.blend'))
(OUT / 'mic-retention-thread-assembly.md').write_text('''# Microphone lacing-cord research option

**Not cable ties. Not measured hardware. Not release/fit approval.**
Chosen purchasing-family assumption: round polyester lacing cord, nominal 0.5 mm
diameter. No web research, vendor, stock, insulation rating or tensile claim is
made. Measure the actual cord including coating/fuzz before use. Reject anything
that binds in the existing 0.9 x 1.4 mm tunnels; never enlarge accepted support.

## Assembly (power disconnected; ESD-safe handling)
1. Inspect and deburr printed tunnels without changing their geometry. Prethread
   two independent loops per board, one on each X side, before seating the PCB.
2. Each loop enters a tunnel from local X=+/-9.2 toward +/-5.1 at Y=-5.25,
   Z=9.5. Turn around the nearby outer Y edge at Y=-6.65, rise behind the
   board to Z=13, then run along the top edge lane X=+/-6.65 to Y=+6.65.
   Descend outside that board edge, return through the Y=+5.25 tunnel and
   close the loop along the outboard X=+/-9.2 return. Coordinates are mm in
   support-local axes, not enclosure-world axes. See JSON for every waypoint.
3. Seat the nominal 14 x 12 x 1.6 mm PCB on the unchanged four corner pads.
   Snug by hand only. The model leaves a nominal 0.15 mm gap above the PCB;
   it is a routing envelope, NOT a tension/contact or preload simulation.
4. Tie and trim on the outboard return, inside the reserved 1.8 mm diameter
   knot/tail sphere at X=+/-9.2,Y=0,Z=9.5. If the real knot/tails do not fit,
   reject this option; do not move them over the acoustic bore or PCB.
5. Inspect under magnification before power-up; verify board cannot slip,
   cord cannot migrate inward, fasteners remain accessible and closure clears.

## Electrical and component safety gates
The nominal PCB is a solid rectangular proxy, not a component map. Both edge
lanes and corner bearing patches MUST be inspected on the actual PCB: no cord
over microphone package/port, connectors, pads, exposed copper, solder joints,
sharp leads or fragile components. Polyester is not a certified insulation
barrier: confirm material/coating, temperature, moisture and contamination
compatibility; avoid metallic/conductive thread. Do not use heat or adhesive
near the mic. Do not bend the PCB or load the acoustic package. Reject if safe
edge lanes do not exist. Bench-test pull/slip, knot security, abrasion, vibration,
humidity/creep and acoustic response before deployment. Not a cable strain relief.

The checker uses actual finite swept cord solids and a conservative external
knot envelope against all combined-scene mesh objects, the nominal PCB and sound
keepout. It does not certify threadability, knot topology or real assembly.
''')
print(json.dumps(report, indent=2))
if not report['pass']:
    raise SystemExit(1)
