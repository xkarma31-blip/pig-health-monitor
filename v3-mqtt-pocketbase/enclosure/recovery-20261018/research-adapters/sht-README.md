# External SHT replacement research carriers

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
