"""Bolt-pattern thermal support bridge; optical aperture NOT validated."""
import bpy
import bmesh
import json
from pathlib import Path
root=Path(__file__).resolve().parent
out=root/'research-adapters'
bpy.ops.wm.read_factory_settings(use_empty=True)
def box(dims,pos):
    bpy.ops.mesh.primitive_cube_add(size=1,location=pos)
    o=bpy.context.object;o.dimensions=dims
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return o
def boolean(a,b,op):
    bpy.context.view_layer.objects.active=a
    m=a.modifiers.new(op,'BOOLEAN');m.operation=op;m.solver='EXACT';m.object=b
    bpy.ops.object.modifier_apply(modifier=m.name);bpy.data.objects.remove(b,do_unlink=True)
obj=box((68,30,2),(0,0,1))
# Supports published small rectangular examples on y edges; square board may
# use same rails. Clear opening is intentionally provisional and must be ray-tested.
boolean(obj,box((42,12,8),(0,0,1)),'DIFFERENCE')
for x in (-30,30):
    for y in (-9,9):
        bpy.ops.mesh.primitive_cylinder_add(vertices=64,radius=1.7,depth=8,location=(x,y,1))
        boolean(obj,bpy.context.object,'DIFFERENCE')
bm=bmesh.new();bm.from_mesh(obj.data)
report={'status':'research thermal bridge coupon only, not installed',
        'size_mm':[68,30,2],'central_opening_mm':[42,12],
        'mount_axes_mm':[[x,y] for x in (-30,30) for y in (-9,9)],
        'source_board_plan_examples_mm':[[28,16],[25.4,25.4],[25.8,17.8]],
        'nonmanifold_edges':sum(not e.is_manifold for e in bm.edges),
        'volume_mm3':abs(bm.calc_volume(signed=True)),
        'limits':['Reduced opening could obstruct optical free zone; do not install without ray/placement check',
                  'Planar coupon not yet adapted to15degree tilted cradle/pads',
                  'PCB underside contact and straps/connector clearance unknown',
                  'Additional2mm changes bolt stack and pupil position']}
bm.free();bpy.ops.object.select_all(action='DESELECT');obj.select_set(True)
bpy.ops.export_mesh.stl(filepath=str(out/'thermal_bridge_coupon.stl'),use_selection=True)
(out/'thermal-bridge-checks.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report))
if report['nonmanifold_edges']:raise SystemExit(1)
