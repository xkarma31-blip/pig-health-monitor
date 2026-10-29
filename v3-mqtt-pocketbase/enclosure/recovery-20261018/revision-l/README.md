# Revision L — bearing-seat regression repaired

Latest revision supersedes K for the thermal raised cradle and validation scripts.
Open `reference-comparison.png` for approved poster versus current front and rear.
`reference-critical-review.txt` records a real two-image comparison. It found
missing mint acoustic accents; render material was incorrectly all-charcoal and
is now corrected on the actual separate trim meshes. Optional trim needs adhesive
as previously documented; mint material is a rendering approximation, not a
measured color match or acoustic membrane.

Remaining reference differences include thermal hood shape, closer satellite
spacing, exposed screws, simpler casing and external SHT bracket. Suggested dummy
hinges/IP collars and circular thermal shroud were not adopted: they would imply
unimplemented functions or risk reducing the unmeasured optical cone. The review
is visual evidence, not mechanical authority; its IP terminology is not a rating.
Visual design/marking and part quantities remain as documented in
README_PREVIOUS_K.md, but default generators now target revision-l, not K.

Second independent reviewer found an actual remaining defect: uphill sloped cradle
material exceeded the nominal flat pad within the assumed head footprint by about
0.157mm. Earlier claim of fully flat cradle bearing was too broad. Transcript
retained in second-independent-review.txt; no physical fit claim is implied.

## Repair and stronger evidence

- Lowered tilted platform another 0.5mm (center construction origin Z=6.5).
  Pad heights remain 9.2+y*tan(15°); roof clearance unchanged.
- Did not bevel cradle bearing faces; decorative bevel must not remove bearing.
- New check_bearing_seats.py tests actual exported-STL surfaces by downward rays:
  three annular radii 2.1,2.6,3mm ×24 angles on each of eight seats. All **576**
  sampled points hit intended plane within0.025mm with normalZ>0.999. This is
  discrete coverage, not proof of every continuous point/real washer contact.
- Head envelopes now checked against BOTH hood and cradle above seating plane.
  Hood overlap0 for all four; cradle numerical residues below0.000066mm³, versus
 0.01mm³ acceptance threshold. Head assumptions remain6mm diameter×2.4mm high.
- Export topology/component/volume/scale checks pass17 parts. Printable collision
  gates pass; actual slicer jobs pass17 parts without final logged warnings.
  Summary now REQUIRES annular seat check; missing report fails overall gate.

## Still explicitly unverified

Hardware board dimensions/fit, physical printing, holes, nut/thread engagement,
full driver/access envelopes, actual thermal pupil/FOV, microphone response,
SHT airflow/accuracy, load/retention/chemical/ingress performance and battery safety.
Lowered platform increases lens-setback assumption by0.5mm; use actual sensor
position to test optics. No certified IP, field-readiness or numeric fidelity score.
Reslice with actual printer profile; evidence G-code is not approved for your printer.

## Follow-up review and optional physical-test aid

`third-independent-review.txt` independently checked the repaired platform/pads
and regressions. No blocking defect found within its four-file scope; calculated
uphill platform clearance below pad is about0.343mm across assumed3mm head radius.
Reviewer did not rerun Blender. Stale platform-height comments were corrected.

Negative-control regression was rerun against preserved K and repaired L using
the same checker. K fails four cradle seats and exits1; L fails zero seats and
exits0. `bearing-regression-comparison.json` retains the comparison. Reproduce:
`PIGPULSE_REVISION=revision-k blender -b --python-exit-code 1 --python check_bearing_seats.py`
and repeat with revision-l. The checker now honors the revision environment
variable and fails the process on a failed report; use Blender's exit-code flag.

`optional_M3_hole_coupon.stl` is a separate58×16×3mm test plate, NOT an installed
enclosure part or one of the17 validated production exports. Nominal holes from
negativeX to positiveX:3.0,3.2,3.4,3.6mm. `fit-coupon.json` records zero
nonmanifold edges and positive volume from Blender. It has not been independently
STL-audited, sliced or printed. Print with actual material/profile and measure
real bolt clearance before applying any dimensional compensation to case parts.

Reproduce parent scripts: Blender build_revision.py, render_assembled.py,
check_assembly.py and check_bearing_seats.py; node check_exports.js revision-l;
bash slice_revision.sh revision-l. Source label stays original approved artwork;
no firmware or production service changes.
