"""Blender-only replacement SHT carriers and installed P geometry audit (mm)."""
import bpy
import bmesh
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'research-adapters'
OUT.mkdir(exist_ok=True)


def box(name, size, center):
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return obj


def boolean(a, b, operation='UNION'):
    bpy.context.view_layer.objects.active = a
    mod = a.modifiers.new('exact', 'BOOLEAN')
    mod.operation, mod.solver, mod.object = operation, 'EXACT', b
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(b, do_unlink=True)


def cylinder(radius, depth, center):
    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=radius, depth=depth,
                                      location=center)
    return bpy.context.object


def volume(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    value = abs(bm.calc_volume(signed=True))
    bm.free()
    return value


def intersection(a, b):
    from mathutils import Vector
    aa=[a.matrix_world@Vector(v) for v in a.bound_box]
    bb=[b.matrix_world@Vector(v) for v in b.bound_box]
    if any(min(max(v[k] for v in aa),max(v[k] for v in bb))-max(min(v[k] for v in aa),min(v[k] for v in bb))<=0.0001 for k in range(3)):
        return 0.0
    # Work in world coordinates: essential after installing the STL in P.
    copy = a.copy()
    copy.data = a.data.copy()
    bpy.context.collection.objects.link(copy)
    other = b.copy()
    other.data = b.data.copy()
    bpy.context.collection.objects.link(other)
    for obj in (copy, other):
        obj.data.transform(obj.matrix_world)
        obj.matrix_world.identity()
    boolean(copy, other, 'INTERSECT')
    result = volume(copy)
    bpy.data.objects.remove(copy, do_unlink=True)
    return result


reports = []
for label, width, length in [('12x12', 12, 12), ('18x12.7', 18, 12.7),
                              ('25.5x17.7', 25.5, 17.7)]:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    name = 'sht-' + label
    carrier = box(name, (32, 32, 3), (0, 0, 1.5))
    boolean(carrier, box('source ventilation', (16, 16, 9), (0, 0, 3)), 'DIFFERENCE')
    for x in (-11, 11):
        boolean(carrier, box('source strap opening', (3, 12, 8), (x, 0, 1.5)), 'DIFFERENCE')
    # Outboard open frame: no solid platform underneath the sensor PCB.
    for y in (-length / 2 - 3, length / 2 + 3):
        boolean(carrier, box('frame rail', (width + 8, 4, 3), (24, y, 1.5)))
    for x in (24 - width / 2 - 2, 24 + width / 2 + 2):
        boolean(carrier, box('frame end', (4, length + 10, 3), (x, 0, 1.5)))
    # Four elevated edge pads, with separate lateral and end stops.
    pads = []
    for x in (24 - width / 2 + 0.6, 24 + width / 2 - 0.6):
        for sign in (-1, 1):
            y = sign * (length / 2 - 0.6)
            pad = box('contact', (1.2, 3.6, 7.2), (x, y + sign * 1.2, 6.4))
            pads.append((x, y))
            boolean(carrier, pad)
            boolean(carrier, box('end stop', (2, 1.2, 9),
                                 (x, sign * (length / 2 + 0.8), 7.5)))
    for x in (24 - width / 2 - 0.8, 24 + width / 2 + 0.8):
        boolean(carrier, box('side stop', (1.2, 4, 9), (x, 0, 7.5)))
    for y in (-12, 12):
        boolean(carrier, cylinder(1.7, 12, (0, y, 3)), 'DIFFERENCE')
    # Two positive tie loops over the PCB, through opposed frame slots.
    for x in (21, 27):
        for sign in (-1, 1):
            boolean(carrier, box('tie slot', (2, 2, 8),
                                  (x, sign * (length / 2 + 3), 2)), 'DIFFERENCE')
    # Later frame unions must not refill the preserved source ventilation window.
    boolean(carrier, box('final ventilation restoration', (16, 16, 8), (0, 0, 2)), 'DIFFERENCE')
    witness=box('ventilation clearance witness',(15.98,15.98,2.98),(0,0,1.5))
    ventilation_overlap=intersection(carrier,witness)
    bpy.data.objects.remove(witness,do_unlink=True)
    tie_passages=[]
    for x in (21,27):
        for sign in (-1,1):
            # Finite section through the complete base, not a point ray.
            witness=box('tie through witness',(1.8,1.8,3.2),
                        (x,sign*(length/2+3),1.5))
            obstruction=intersection(carrier,witness)
            tie_passages.append({'xy_mm':[x,sign*(length/2+3)],
                                 'section_mm':[1.8,1.8],
                                 'obstruction_mm3':obstruction,'pass':obstruction<0.01})
            bpy.data.objects.remove(witness,do_unlink=True)
    bm = bmesh.new()
    bm.from_mesh(carrier.data)
    nonmanifold = sum(not e.is_manifold for e in bm.edges)
    remaining = set(bm.verts)
    components = 0
    while remaining:
        components += 1
        pending = [remaining.pop()]
        while pending:
            for edge in pending.pop().link_edges:
                for vertex in edge.verts:
                    if vertex in remaining:
                        remaining.remove(vertex)
                        pending.append(vertex)
    bm.free()
    checks = {'ventilation_overlap_mm3':ventilation_overlap,'nonmanifold_edges': nonmanifold, 'connected_components': components,
              'tie_passages':tie_passages,
              'volume_mm3': volume(carrier)}
    for radius, depth, z, kind in [(3.5, 6, 6, 'head'), (3.5, 40, 29, 'tool')]:
        for y in (-12, 12):
            probe = cylinder(radius, depth, (0, y, z))
            checks[f'{kind}_{y}_collision_mm3'] = intersection(carrier, probe)
            bpy.data.objects.remove(probe, do_unlink=True)
    board = box('published PCB envelope UNDERSIDE UNKNOWN', (width, length, 1.6), (24, 0, 10.8))
    checks['board_penetration_mm3'] = intersection(carrier, board)
    # Thin inward contact witness verifies real pad/PCB contact, not just AABBs.
    contact = []
    for x, y in pads:
        witness = box('contact witness', (1.2, 1.2, 0.02), (x, y, 9.999))
        contact.append(intersection(carrier, witness) / 0.011)
        bpy.data.objects.remove(witness, do_unlink=True)
    checks['contact_area_mm2_each'] = contact
    bpy.data.objects.remove(board, do_unlink=True)
    bpy.ops.object.select_all(action='DESELECT')
    carrier.select_set(True)
    bpy.context.view_layer.objects.active = carrier
    stl = OUT / (name + '.stl')
    if bpy.app.version >= (4, 1, 0):
        bpy.ops.wm.stl_export(filepath=str(stl), export_selected_objects=True)
    else:
        bpy.ops.export_mesh.stl(filepath=str(stl), use_selection=True)
    # Import actual exported mesh into actual P assembly; replace, never stack.
    bpy.ops.wm.open_mainfile(filepath=str(ROOT / 'revision-p/assembled-review.blend'))
    old = bpy.data.objects['sht_adjustable_carrier']
    source_materials=list(old.data.materials)
    bpy.data.objects.remove(old, do_unlink=True)
    if bpy.app.version >= (4, 1, 0):
        bpy.ops.wm.stl_import(filepath=str(stl))
    else:
        bpy.ops.import_mesh.stl(filepath=str(stl))
    installed = bpy.context.object
    installed.name = 'sht_adjustable_carrier'
    # STL carries no materials; preserve the approved carrier's charcoal finish.
    installed.data.materials.clear()
    for material in source_materials:
        installed.data.materials.append(material)
    installed.rotation_euler = (math.pi / 2, 0, 0)
    installed.location = (80, -3, 61)
    bpy.context.view_layer.update()
    checks['installed_collisions_mm3'] = {
        o.name: intersection(installed, o) for o in list(bpy.context.scene.objects)
        if o != installed and o.type == 'MESH' and not o.hide_render}
    checks['replacement_count'] = sum(o.name.startswith('sht_adjustable_carrier')
                                      for o in bpy.context.scene.objects)
    checks['pass'] = (all(p['pass'] for p in tie_passages) and ventilation_overlap<0.01 and nonmanifold == 0 and components == 1 and checks['volume_mm3'] > 0
                      and all(v < 0.01 for k, v in checks.items() if 'collision_mm3' in k or k == 'board_penetration_mm3')
                      and all(v > 1 for v in contact)
                      and all(v < 0.01 for v in checks['installed_collisions_mm3'].values())
                      and checks['replacement_count'] == 1)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT / (name + '-assembly.blend')))
    reports.append({'variant': label, 'checks': checks})

(OUT / 'sht-checks.json').write_text(json.dumps(reports, indent=2))
(OUT / 'sht-README.md').write_text('''# External SHT replacement research carriers

Three published plan envelopes: 12×12, 18×12.7, 25.5×17.7 mm; PCB thickness
1.6 mm is assumed. Actual underside, component keep-outs and safe contact areas
are UNKNOWN: four 1.2×1.2 mm edge contacts are provisional, not hardware approval.
Board center is outboard at local X24; underside Z10, with 7 mm elevation above
the 3 mm frame. Original 16×16 ventilation window remains fully open.

Two removable ties (assumed ≤1.8 mm wide) thread opposed 2×2 through-slots at
X21 and X27 and pass over the PCB. Four end stops and two side stops constrain
translation; ties constrain lift. Do not cover the sensing aperture with ties;
actual component/tie routing must be checked before printing/use. No strength,
thermal bias, weather sealing, tie bend radius or physical fit approval.

Attachment axes remain (0,±12), radius1.7 holes. Assumed hardware radius3.5
projects 6 mm above the base; axial tool radius3.5 extends 40 mm above it.
Assembly mapping is (local x,y,z) → (80+x,-3-z,61+y). Each saved P assembly
removes the old carrier and imports one replacement STL. P source is untouched.
Run with Blender --background --python build_sht_research_carrier.py.
Actual mesh, contact witness, hardware/tool and installed collision results:
sht-checks.json. Published plans are not measured hardware.
''')
print(json.dumps(reports, indent=2))
if not all(r['checks']['pass'] for r in reports):
    raise SystemExit('SHT geometry gates failed; inspect sht-checks.json')
