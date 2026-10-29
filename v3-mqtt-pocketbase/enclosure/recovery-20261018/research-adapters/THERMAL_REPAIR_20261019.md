# Thermal repair — current bar8.6 baseline

## Design constraints

- Revision P is read-only context. No P geometry is modified.
- PCB outlines and bar center height 8.6 mm remain unchanged.
- Square-board M2 axes move 0.4 mm outward to preserve the complete boss bearing annulus outside the PCB relief. Bars widen by 0.8 mm to retain PCB edge overlap.
- Rectangular-board M2 axes move 0.4 mm inward to keep their washer ears inside the hood throat.
- M3 screws require an **ultra-low-profile head ≤5.0 mm diameter and ≤1.5 mm height**, M3x20 shaft, OD6/ID3.2/thickness0.5 washer. Larger heads are rejected geometry, not interchangeable hardware.
- All fasteners are tightened **before** fitting the removable hood. Tool checks omit the not-yet-installed hood; permanent hardware checks include it.
- Nut bore clearance envelope is 3.04 mm around a nominal 3.0 mm shaft. Thread form and strength are not certified.

## Checker corrections

BVHs use Blender's actual loop-triangle tessellation. Boolean n-gons containing bores cannot safely be represented by a simple polygon fan: the previous rays missed real bore walls and reported false missing pilot/receiver surfaces. No contact threshold was relaxed for boss bearing.

The builder intentionally leaves legacy `mechanically_valid` and `repair_acceptance` false pending the independent hardware checker, so its exit status remains 1 even when its geometry gates pass. The independent report is authoritative for installed mechanical acceptance. The slicer now requires that report, its current checker hash and unchanged scene hashes.

## Evidence preservation

Failed hardware reports are timestamped and never overwritten. The builder archives replaced STLs, scenes and metadata under `thermal-history-*`. The first failed export audit is retained as `thermal-export-slicer-failed-20261019.json`; subsequent export audits also have timestamped copies.

Final acceptance requires the latest independent hardware report, all sampled optical scenarios, nine independently audited closed STL exports, fresh nine-part slicing, scene reopen validation and unchanged revision-P hashes. Consult those machine-readable reports for the result; this document does not substitute for a passing gate.

## Limits

Digital, nominal-envelope acceptance only. PCB outlines, package and fastener dimensions remain assumptions pending physical measurements. No purchased screw, printed fit, thread strength, structural load capacity, real optical sensitivity or printer-specific G-code is certified.

CodeRabbit was not installed; the located critic script could not be read due to tool permissions. Neither is claimed as completed review. No subagents were used.
