# Independent review repairs — revision J

Actual read-only reviewer CLI session completed after a restart cancelled the
first attempt. Full transcript: independent-review-transcript.txt. Reviewer found:
cradle head/roof collision, sloping cradle bearing, sloping hood bearing, loose
acoustic trim and tests omitting purchased-fastener envelopes.

## Repairs made and verified

- Hood: four 7.2mm diameter flat bearing pockets cut into slope. Vertical M3 bolts
  no longer depend on tilted roof for bearing. Pocket floor calculated below
  lowest local edge; requires compatible head/washer, not arbitrary screw hardware.
- Cradle: platform lowered 4mm and stands extended into explicit horizontal pads.
  Pad top = 9.2 + y*tan(15°) mm above separator. At 3mm head radius worst ideal
  inner-roof gap = 2.996mm, leaving ~0.596mm over assumed 2.4mm head+washer.
- Test: each installed 6mm diameter ×2.4mm head envelope boolean-checked against
  hood; all four collision volumes 0. This does not test every purchased head.
- Assembly sequence: fasten cradle to separator with hood REMOVED, then install
  hood. Do not require a driver to pass through the installed roof.
- Acoustic trim retention explicitly requires compatible adhesive; trim is optional
  cosmetic, not snap-fit. Degrease/test adhesive on printed material; no bond strength
  or chemical resistance claimed. Alternatively omit trim entirely.

## New evidence

17 exported STLs pass topology/component/volume/scale checks. 13 mating-pair and
all installed broad-phase candidate intersections pass. Four new head-envelope
checks pass. All 17 actual PrusaSlicer jobs pass with no reported warnings using
documented assumed PETG/support settings. physical fit remains unverified.

## Optical consequence and untested assumptions

Lower cradle increases ideal center setback from ~5mm to ~9mm. For 46×26 window,
ideal point-pupil 110×75 cone is still geometrically possible (half cone at 9mm:
12.85×6.91mm), but actual pupil location, finite sensor size, alignment and housing
stack matter. Not an optical performance pass. Board/component heights still
unknown. Test real sensor view and shim platform/strap holder before deployment.

Reviewer findings do not validate physical strength, arbitrary nut/tool access,
thread engagement or safe animal-facing installation. No IP/fit rating claimed.
