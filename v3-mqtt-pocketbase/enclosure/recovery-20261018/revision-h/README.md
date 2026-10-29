# PigPulse — revision H digital enclosure prototype

**Status: digitally checked prototype, NOT physically fit-tested or deployment-ready.**
No electronics are included in printable STL exports. Old assets remain preserved.

## Start here

- `assembled-reference-label.png`: three-quarter view.
- `front-review.png` and `rear-attachment-review.png`: actual exported-part assembly.
- `reference-comparison.png`: approved poster alongside prototype front/rear.
- `assembled-review.blend`: editable assembly; original artwork packed inside.
- `mechanical-prototype.blend`: separated parts; STL files remain bed-oriented.
- `verification-summary.json`: 17 export checks, 13 listed assembly pairs and
  17 actual PrusaSlicer toolpath outputs all passed the defined digital gates.
- `slicer/*.log`: real slicer evidence. G-code is for an assumed profile only.

## What changed from the poster

Retained original PigPulse wordmark/signal arcs/full tagline as a separate label,
charcoal stepped three-module silhouette, angled upper optical hood, two lower
acoustic openings and lower status-light opening. The original 200×120×35mm
envelope is NOT a verified fitted-device size. Bolted rear spine replaces imaginary
twist-lock couplers; external SHT carrier adds width but avoids burying a humidity
sensor with warm electronics. These functional changes are deliberate, not an
exact replica or an independently rated high-fidelity score.

Label is original source crop, not substitute typography. STL has no colors.
Print a 65×31.25mm adhesive label from `../logo-source-with-tagline.png`, or use
the artwork in a professional marking process. It is NOT a multicolor STL logo.
Render-only metal screw heads and green light are purchased-hardware proxies.

## Printable parts / quantities

One each main_tub, main_lid, thermal_tub, thermal_face, thermal_angled_hood,
thermal_raised_cradle, acoustic_tub, acoustic_face, mounting_spine,
electronics_strap_tray, sht_mount_arm and sht_adjustable_carrier.
Two microphone_strap_carrier and acoustic_trim if actually fitting two microphones;
four tray_spacer_6mm. The historical thermal_strap_carrier and optical_trim exports
are optional alternatives/spares, NOT installed with the raised thermal cradle.
Do not cover the rectangular thermal opening with the circular trim.

## Mechanical assembly

Use `../revision-f/ASSEMBLY_AND_LIMITS.md` for the provisional hardware ledger,
with this correction: install raised thermal cradle ON TOP of thermal_face, not
the old flat thermal carrier behind it. Cradle bases meet the plate; strap platform
is tilted 15 degrees parallel to hood and centered ~5mm behind roof. Actual sensor
pupil position, finite pupil size, header/board clearance and optical axis must be
checked with the exact fitted breakout. Provisional M3 cradle bolts need ~20mm
length, varied with local stand height; measure engagement after a test print.

Matched holes are real 3.4mm nominal M3 through-bores. Rear module mounts are
bolted to shared spine at vertical centers -80, 0, +80mm. SHT arm bolts to spine,
and open carrier bolts to its two 8mm standoffs. Tray mounts on four 6mm spacers.
Use washers/nuts and nonconductive straps; no claimed heat-set insert fit.
No physical measurement or physical test has been performed.

## Printing evidence and safe next physical steps

PrusaSlicer 2.7.2, assumed 220×220mm bed, PETG 235 C / bed 80 C, 0.4mm nozzle,
0.2mm layers, 4 perimeters, 20% infill. Hood AND raised cradle use buildplate-only
supports. All 17 jobs produced G-code without reported print warnings. This does
not mean supports remove cleanly, holes fit, settings suit your filament or a
specific printer can execute the G-code. Reslice STLs in your actual printer profile.

First print hole/strap coupons or small carrier parts, check bolt fit and board
clearance, then print a module, then test thermal FOV/acoustics/SHT response before
full installation. No IP rating, washdown safety, farm chemical lifetime, battery
endurance, structural strength or animal-safety performance is claimed.

## Hardware provenance

No actual board dimensions measured. Canon USB readout gives ESP32-S3 4MB flash,
not PCB dimensions. Web SuperMini references disagree (22.5 vs 23.5mm length).
Repository references both SHT31 and SHT45; I2C ACK cannot identify the model.
Vendor/example breakout dimensions are NOT the user's physically verified board.
See `../REFERENCE_AND_HARDWARE.md`, `../revision-e/VERIFIED_CHECKPOINT.md` and
`../revision-f/OPTICAL_CLEARANCE.md`. Adjustable straps avoid invented hole patterns;
they do not guarantee every clone fits. Canon thermal I2C remains on the Pi;
no live firmware or service has been changed.

## Reproduce digital checks

From recovery-20261018/: run Blender build_revision.py, render_assembled.py,
check_assembly.py; run `node check_exports.js revision-h` and
`node summarize_verification.js revision-h` after real slicing. Blender 4.0.2
was used. Slicer runtime was isolated under /tmp/opencode/pigpulse-slicer, not
installed system-wide. Do not confuse mesh/assembly checks with physical validation.
