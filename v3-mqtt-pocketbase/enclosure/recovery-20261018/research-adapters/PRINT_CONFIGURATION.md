# Selected integrated print configuration

Use P parts except the replacements below. Do not print an old and replacement
part for the same installed instance. All dimensions are mm; STL units are mm.

- P main tub/lid, thermal tub/face/hood/cradle, acoustic tub/face, SHT arm,
  electronics tray and two acoustic trims remain in the selected assembly.
- Replace P spine with `research_spine_tray_access.stl`, quantity1.
- Replace both P mic carriers with `mic_14x12_corner_support.stl`, quantity2.
- Replace four6mm tray spacers with `optional_tray_spacer_3mm.stl`, quantity4.
- Replace P SHT carrier with `sht-25.5x17.7.stl`, quantity1 for the selected
  large-board scenario. Other SHT sizes are alternatives, not extra installed
  parts.
- Add `pcb25_4square_rear_insert.stl` quantity1 and its `retainer_1.stl` and
  `retainer_2.stl` quantity1 each. Other thermal board-size sets are alternatives.

23 installed printed instances total. The integrated manufacturing contract
contains the explicit installed-instance→file→quantity mapping and transforms.
The source Blender scene contains nonprintable PCB/package/nut reservations and
purchased visual proxies; never “export all meshes” as a manufacturing shortcut.

Thermal mounting hardware follows the explicit nominal contract in the thermal
checker/report; do not substitute taller heads without rechecking clearance.
Tray hardware is provisionally four M3×14. Both mics use the chosen0.5mm round
lacing-cord envelope, not conventional cable ties. SHT retained with its chosen
tie envelope, actual underside/component-safe lanes to inspect before use.

Slicer tests are provisional PETG235/80°C,0.2mm layer,0.4mm nozzle,four walls,
20%infill,buildplate-only supports. P main tub requires support. Slicing success
is not print orientation/material approval. Inspect printability and perform
the physical checklist before final fabrication or barn deployment.
