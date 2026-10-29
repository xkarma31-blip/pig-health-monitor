# PigPulse N — current reviewed digital prototype

**Not physically fitted, printed, sensor-tested, IP-rated or field-ready.**
Approved-source aesthetic retained in artwork, charcoal modular stack, tilted
thermal hood and dual mint acoustic accents. Proportions, joints and external SHT
carrier are reconstructed, not an exact poster replica. No fidelity score.

## Inspect

- `assembled-reference-label.png`, `front-review.png`, `rear-attachment-review.png`:
  actual exported STLs assembled with original-source artwork and render-only
  optional dark fasteners. No fitted electronics or thermal window modeled.
- `reference-comparison.png`: approved poster beside latest N front and rear
  views. Side attachment is SHT carrier, not a proven wall bracket.
- `mechanical-prototype.blend`: separated editable manufacturing geometry.
- `assembled-review.blend`: assembled STL scene, packed original artwork.

## Manufacture and assemble — conditional only

17 distinct STL exports, millimeters. One each except acoustic trim×2,
microphone carrier×2 and tray spacer×4. Optical trim and old flat thermal carrier
are spares, not installed. Electronics and purchased fasteners are NOT printable
parts. Optional acoustic trims need compatible adhesive; no retention lifetime
or acoustic membrane is claimed.

Read `ASSEMBLY_CURRENT.md` and `fastener-ledger.json` before selecting hardware.
The ledger is nominal arithmetic, not measured fit. Cradle head/washer envelope:
6mm diameter×2.4mm height. SHT forward hardware:7mm diameter×3mm depth; notch radial
margin only0.3mm nominal. Larger parts/tools need rechecking. Upper thermal bolt
margin is especially small. Do not blindly install longer bolts near electronics.

Install cradle with hood removed, then fit hood. Actual PCB identity, headers,
wire bends, antenna keep-outs, pupil and sound-port position remain unmeasured.
Microphone straps provide retention, not validated acoustic coupling. No fitted
gasket supplied. Keep ordinary glass/plastic out of thermal optical path.

## Reproduce

From parent directory: `bash verify_revision.sh revision-n`.
Runner is N-specific and rejects historical targets to preserve earlier assets.
Requires Blender4.0-compatible STL operators, Node, and PrusaSlicer runtime at
configured path (override PRUSA_SLICER as needed). Slicer assumes PETG235/bed80,
0.4mm nozzle,0.2mm layers,4 perimeters,20% infill,220×220mm bed. Hood/cradle
use supports. This is evidence profile, not approval for an unknown printer.
Standalone fastener-ledger generator now also defaults N; tested no-argument run
leaves historical M ledger hash unchanged. Archived/helper scripts outside this
workflow may retain historical targets intentionally.

ZIP excludes G-code. Rerun slicing to reproduce full summary locally; do not
expect the G-code-dependent summary to run directly from the archive alone.
Reslice actual print jobs with actual printer/material profile.

## Evidence and its limits

`verification-summary.json`:17 independent STL audits,13 selected assembly pairs,
explicit20-instance inventory and collision screening,576 discrete bearing rays,
four cradle heads,limited axial driver and two SHT hardware envelopes,provisional
length ledger,and17 actual slicer jobs. Hashes bind reports to checked inputs;
The11 selected grip-surface samples now target N and are required by summary,
including their input hashes. Failed/missing report negative controls both exit1;
restored report exits0 (grip-gate-regression.json).
negative controls document known-defect rejection. No formal solid proof,
continuous contact/load analysis or physical tolerance validation.

Concrete repairs include cradle bearing protrusion and SHT hardware/wall collision;
independent reviews and prior failing geometry retained. See CHECKPOINT_HISTORY.md
for chronology, including failed visual diagnoses. Vision descriptions are not
mechanical authority; false window/bracket inferences are explicitly rejected.

## Manufacturer research and optical exploration

Read `MANUFACTURER_RESEARCH.md` and `INTEGRATION_DECISIONS.md`. Melexis nominal
FOV is sensitivity-defined, not hard cutoff. Both lens variants and individual
±5degree pointing probes tested. Wide-angle16mm setback clips under sampled
misalignment; centered-only clearance must NOT be treated as placement approval.
9.5/12mm sampled clearance also is not physical certification. Reports include
STL hashes,Blender version and coordinate/control assertions. Optical sweeps are
separate conditional explorations, not included as physical-performance gates.

`PHYSICAL_VALIDATION_REQUIRED.md` lists unperformed measurement,print/assembly,
sensor response,load,electrical and environmental checks. Open apertures/notches
mean no ingress claim. No battery safety,chemical resistance,animal contact or
washdown approval. Physical testing cannot be substituted by more web research.
