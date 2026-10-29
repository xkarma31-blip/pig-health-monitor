# Resumed digital verification — 2026-10-19

`bash verify_research_options.sh` completed successfully after adding the SHT
builder to the existing low-tray/mic workflow. Thermal is deliberately excluded
until repaired mechanical acceptance exists; this is not full assembly release.

`blender -b --python-exit-code 1 --python check_mic_corner_installed.py`
completed exit 0 after adding finite bearing witnesses. Four 1.5×1.5 mm seat
patches measured approximately 2.25 mm² each in the Boolean geometry test.
These are nominal PCB-edge contact areas, not inspected component-safe zones.
All four tie passages retain nine sampled clearance rays each; actual tie loop,
head routing, fastener grip and acoustic coupling still need validation.

SHT reports three passing variants (12×12,18×12.7,25.5×17.7), each with zero
overlap in the preserved ventilation witness. This does not establish sensor
response or weather resistance. The largest frame's original refilled opening
was repaired by a final ventilation cut and is now an explicit acceptance gate.

Critic syntax checks passed for the changed mic checker and research runner.
CodeRabbit executable `cr` is unavailable; no CodeRabbit review is claimed.
No firmware/services modified, no physical-fit or IP claim, no release promotion.

Fresh PrusaSlicer runs exported G-code successfully for all three repaired SHT
variants and the repaired mic corner carrier. Their individual logs in `slicer/`
contain export-success lines and no warning/error lines. Settings: 0.2mm layers,
0.4mm nozzle, four perimeters, 20% infill, nominal PETG235/80°C, buildplate-only
supports. These are software slicing scenarios, not printer/material approval.
The nominal tie passages are small; actual printed passage clearance and tie
threading remain bench tests even where the digital cross-section is clear.
