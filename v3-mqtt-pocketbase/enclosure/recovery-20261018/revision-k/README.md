# PigPulse revision K — reviewed digital prototype

**Not physically fit-tested or field-ready. No IP rating.**

## View the actual outcome

- `reference-comparison.png`: approved original poster, current front and rear.
- `assembled-reference-label.png`: current three-quarter render.
- `front-review.png`, `rear-attachment-review.png`: inspect branding and real spine.
- `assembled-review.blend`: packed artwork; imported actual STLs assembled together.
- `mechanical-prototype.blend`: separated manufacturing geometry.
- `verification-summary.json`, `export-checks.json`, `assembly-checks.json` and
  `slicer/*.log`: concrete digital evidence, not physical test results.

## Repairs since archived H

Read-only independent review found thermal fastener-head/hood collision, sloping
bearing surfaces and missing hardware-envelope tests. Fixed: lowered raised cradle,
flat bearing pads, hood counterbore seats, four head/washer keep-out checks and
explicit hood-off cradle assembly sequence. Full transcript retained.
See `../revision-j/REVIEW_REPAIRS.md` for dimensions and provisional hardware.

Printable main/lower tub and lid silhouettes now have matched 4mm rounded corners.
Source PigPulse logo and full tagline use an alpha-masked original crop so the
poster background does not render as a black rectangle. Purchased screw proxies
now have hex drives; body has subtle matte surface texture and directed lighting.
Real image inspection confirms rounded corners and readable, upright original
branding, plus improved finish. Reviews retained, including reported deficiencies.

## Printing and assembly

Use `../revision-h/README.md` for part quantities and `../revision-f/ASSEMBLY_AND_LIMITS.md`
for basic sequence, but J cradle/hood revisions SUPERSEDE their thermal bolt stack.
Raised cradle top pads are 9.2+y*tan(15°) above separator at y=±9mm. Use assumed
head+washer envelope ≤6mm diameter ×2.4mm high; larger hardware needs rechecking.
Install cradle with hood OFF, then fit hood. Counterbores accommodate ≤7.2mm
outside diameter, but select a head/washer within tested smaller envelope for
cradle joints. Through-hole nominal clearance 3.4mm; test print actual fit.

Source marking: original clean crop `../logo-source-clean-crop.png`; transparent
render/decal derivative `../logo-source-transparent.png`. Preserve aspect ratio:
65×32.5mm. Practical physical workflow: print a label, clear transfer decal or
professional surface marking. No embossed/multimaterial STL logo is claimed.
Optional acoustic trim rings require compatible adhesive or should be omitted;
they are not snap-fit and no adhesive durability is certified.

All 17 parts sliced with PrusaSlicer 2.7.2, assumed PETG235/bed80, 0.4mm nozzle,
0.2mm layers,4 perimeters,20% infill,220×220mm bed; hood/cradle buildplate supports.
G-code is diagnostic evidence only, not approved for an unknown printer. Reslice
STLs with your actual printer and filament profile before printing.

## What the evidence does and does not establish

Pass: 17 independent exported-STL topology/component/volume/scale checks, 13 defined
assembly pairs, all 20 installed printable-instance collision candidates and four
assumed cradle-head/hood envelopes. All 17 actual slicer jobs generated toolpaths
without final logged warnings. Slicing and meshes are necessary, not sufficient.

Not performed: real hardware dimensional measurement, physical print/test assembly,
actual board/antenna/header/wire-bend fit, optical pupil/FOV test, acoustic response,
SHT airflow accuracy, structural/retention/load test, battery/electrical safety,
chemical lifetime, ingress or animal-safety testing. No universal GY-SHT/MLX/mic
clone fit or reliability claim. Canonical thermal I2C remains attached to Pi.

Reference aesthetic retained but silhouette/proportions are reconstructed: real
bolted spine replaces illustrated locking couplers and external ventilated SHT
carrier adds width. Empty apertures honestly show no fitted electronics instead
of rendering imaginary glass/sensors. This is not an exact poster replica or a
proven working physical case. No fabricated aesthetic score.

## Reproduce

From parent: Blender build_revision.py, render_assembled.py, check_assembly.py;
`node check_exports.js revision-k`; `bash slice_revision.sh revision-k`.
Default script target is revision-k. Blender4.0.2 and actual PrusaSlicer2.7.2 used.
Optional spare optical trim/old flat thermal carrier STLs are not installed in
current assembly. No live firmware/services changed by enclosure work.
