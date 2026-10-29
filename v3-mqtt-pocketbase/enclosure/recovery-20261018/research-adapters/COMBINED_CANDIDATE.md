# Combined installed research candidate

Build `build_combined_research_scene.py` after the research-options builders;
audit with `check_combined_research_scene.py`, using Blender 4.0-compatible STL
operators. The repeatable `verify_research_options.sh` includes both steps.

Configuration: P enclosure and thermal geometry unchanged; left 14×12 mic
corner support replaces only the left P carrier, right P carrier retained;
largest 25.5×17.7 SHT option replaces the P SHT carrier; four 3mm spacers replace
the four installed 6mm spacers and the tray lowers 3mm. Nominal tray bolts M3×14
remain a purchased-hardware assumption, not a measured bill of materials.

A concrete integrated defect was subsequently found: assumed tray rear heads
and driver approaches collided with P's spine. The candidate now uses a separate
`research_spine_tray_access.stl` with four radius3.8mm access bores; P is preserved.
Combined tray shaft/nut/head/driver envelopes now pass, as do the mic's finite
bearing and tunnel checks. Research spine has zero nonmanifold edges and one
connected component, and slices successfully. This supersedes the earlier
unchanged-spine configuration, not the untouched P release.
The retained right mic is explicitly unchecked for board accommodation.

Manufacturing export repair: the modified spine now exports in P construction
coordinates via a detached identity-transform copy. Reimport at the installed
P transform is an explicit acceptance gate: zero bounds error and matching
intersection volume (44570.43094mm³ in the current run). This prevents a
world-oriented STL from being silently shipped despite a correct scene.

The new access bores leave nominal5.2mm to the spine outer side and8.7mm in
the height direction to the nearest original strap slot. These are geometric
ligaments only; neither fatigue nor allowable loading is established.

Initial integrated checks passed 190 printed-part pairs across 20 installed
instances and separate nominal ESP30×24×20, mic14×12×1.6 and SHT25.5×17.7×1.6
body reservations. Subsequent gates may reject this candidate; consult current
`combined-research-checks.json`, not this historical initial result.

Not a released enclosure: no accepted thermal rear-board accommodation yet,
no measured insulation/cable/tie route, no strength/print fit/environmental
tests. One millimetre nominal lid margin above the 20mm ESP scenario is not
permission to squeeze components or wires into that space. Choose a lower
stack if actual wiring/insulation requires more clearance.
