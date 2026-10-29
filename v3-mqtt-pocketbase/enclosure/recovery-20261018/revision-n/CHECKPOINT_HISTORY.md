# Revision N — real SHT joint interference repaired

Independent noncradle audit identified buried SHT arm/spine forward hardware at
X±12,height61. Thermal wall crossed these axes; printable parts alone did not
collide, but purchased hardware would. Transcript retained here.

Added two radius3.8mm clearance notches in thermal tub lower/rear edge, to local
depth6mm. These are deliberate open cutouts, NOT sealed pockets or an IP feature.
Assumed forward hardware envelope radius3.5mm×depth3mm now clears wall exactly in
Boolean test. Same checker on preserved M gives48.1106mm³ overlap at EACH joint;
N gives0 at both. Negative control establishes detection of this actual CAD bug.
Real fastener/socket/nut dimensions and retention/access remain unmeasured.

N17 exports,installed printable collision gates,cradle bearing/head/driver checks
and17 actual slicer jobs pass. Summary now requires SHT hardware gate. Slicing
manifest binds input STL,G-code and logs; export,bearing,assembly input hashes
also checked. These guard accidental stale results, not physical correctness.

Use PIGPULSE_REVISION=revision-n for Blender build/render/assembly/bearing scripts;
node check_exports.js revision-n; bash slice_revision.sh revision-n. Defaults
are mixed pending consolidation; always pass N explicitly at this checkpoint.
See previous M ASSEMBLY_CURRENT.md for provisional fasteners and sequence.
No physical print,fit,sensor response,ingress,structural or animal-safety tests.
Original aesthetic/art preserved with explicitly documented reconstruction gaps.

## Consolidated reproduction (supersedes mixed-default checkpoint above)

Core build,render,assembly,bearing,export,slicer and summary defaults now all N.
Run `bash verify_revision.sh revision-n` from parent. It builds17 parts,independently
audits exported STLs,checks bearing seats,renders assembled imported STLs,tests
assembly/hardware envelopes,slices all17 and requires passing hash-bound summary.
Fresh full run completed successfully; reproduction.log retains output.
Optional coupon/detail/selected-grip helper scripts retain historical fixed targets
and are not part of this N pipeline. Fastener ledger supplied here is provisional
and independently reviewed in M; no geometry-stack change beyond clearance notches.

Start visual inspection at reference-comparison.png and assembled-reference-label.png.
Source reference and logo derivatives are included in package; electronics are not
printable parts. optical_trim and old flat thermal carrier are spare/not installed.

PHYSICAL_VALIDATION_REQUIRED.md provides explicit unperformed measurement,bench
assembly,sensor and safety tests. It is not a test result or deployment approval.
Slicer freshness negative control: invalid G-code hash in copied/restored manifest
causes summary exit1; restored manifest yields0. Actual STL/G-code unchanged.
See slicer-freshness-regression.json. Packaged archive excludes G-code intentionally;
rerun pipeline to recreate it before reproducing full summary verification.

Scene-provenance fix: imported STL hashes are now embedded in the saved Blender
scene,not just written to a sidecar before rendering. Assembly audit reads that
embedded manifest and summary requires agreement with current exported STLs.
This closes interrupted-render/new-sidecar/old-scene accidental freshness gap.
Fresh scene render/audit passes; negative-control missing embedded manifest fails
summary(exit1),restored report passes(exit0). See scene-provenance-regression.json.
No physical measurements or new mechanical conclusions follow from this guard.

Independent workflow audit found three gaps; transcript workflow-independent-review.txt.
First repair: slicer uses fresh per-run output directories,requires nonempty new
G-code and export log,hashes STLs before loop and rejects changed inputs before
publishing outputs. Real17-part rerun passes; zero-exit/no-output stub is rejected
(exit1),previous successful evidence unchanged. Failed run diagnostics retained.
Remaining findings pending: ledger omitted from overall gate; installed inventory
derived from render visibility. These are not yet repaired at this checkpoint.
Runner now rejects historical revision targets(exit2) to preserve archived geometry.

Subsequent repairs supersede the pending statement: runner regenerates provisional
ledger; summary requires all10 joint rows,nominal length allowances and current STL
hashes. Deliberately insufficient bolt length is rejected; restored ledger passes.
Hashes establish generation inputs,not that hard-coded CAD constants were derived
from meshes. Selected grip-surface checks remain separate historical helper scope.
Assembly now uses explicit20-object installed inventory,including duplicated
carriers,rings and four spacers,independently of hide_render. Missing/hidden expected
parts fail inventory gate; hidden parts are still included in collision checks.
Fresh assembly and summary pass. Inventory negative-control remains to run.

Inventory negative-control completed: temporarily saved scene with duplicate
microphone carrier hidden. Audit fails inventory gate,still checks20 installed
objects,and identifies that exact hidden carrier. Original scene bytes restored,
audit rerun and final summary passes. inventory-negative-control.json retained.
Initial in-memory override attempt did not affect audit scene and is NOT evidence.

Latest visual-route comparison failed with unrelated commit text; retained
latest-reference-review.txt is explicitly INVALID visual evidence. Narrow retry
latest-render-inspection.txt correctly describes branding/rings and flags bright
silver fasteners as distracting, but hallucinates glass/plastic and wall/rail
purpose. Actual thermal opening has NO window and side attachment is SHT carrier.
Do not repeat those inferences as design facts. Fastener proxies now present an
optional dark purchased finish; hardware not supplied or physically selected.
No corrosion/chemical suitability claim. STL geometry unchanged; fresh render,
assembly/hash-bound summary pass. Final dark-finish view still needs inspection.

Dark-finish inspection now retained: dark-fastener-visual-review.txt confirms
discernible dark heads,full readable source branding,two visible mint rings.
It flags faint diagonal main-face banding. Renderer now flat-shades axis-aligned
face polygons,retaining smooth fillet facets and sharp-edge normal splitting,
to avoid interpolating bevel normals across broad STL face triangles. Geometry
unchanged; fresh assembly/summary passes. Banding repair needs visual reinspection;
do not assert it eliminated the artifact merely because render completed.

Follow-up flat-face-visual-review.txt still reports diagonal line,so normal-only
fix was insufficient. Next removed procedural bump normal links from main,
acoustic and thermal removable faces,leaving plain matte surfaces. Fresh render
and assembly/summary pass; visual result pending. Retain failed inspection and
do not claim eliminated seam without review. No printable geometry changes.

Controlled diagnosis: identical A/B fronts with only label shadow disabled show
no detectable difference (label-shadow-ab-review.txt). Reviewer now classifies
diagonal as soft lighting gradient,not hard seam,contradicting earlier single-image
judgment. Actual main-lid front has284 triangles,all localZ3.0,none smooth shaded.
Do not claim label-shadow change fixed anything. Branding unchanged in A/B.
This supports stopping speculative geometry repairs for an unestablished seam.

Optical exploration now ray-tests actual hood STL,not just aperture arithmetic:
441 ideal rays at each centered roof-normal pupil setback5,9.5,12,16,22mm for
assumed110x75degree rectilinear cone. First four sets have0 blocked rays;22mm
has216 blocked rays (positive obstruction control). Results in
optical-cone-exploration.json; reproduce check_optical_cone.py. Hood only,discrete
rays,no board/lens model or measured pupil,axis,FOV. NOT physical optical proof or
full assembled-path check; does not expand fit/performance claims.

Exploration extended to four printable thermal parts in common frame:hood,
raised cradle,separator and tub. Same441 rays at5,9.5,12,16mm yield0 intersections.
At22mm216 unique rays blocked:216 hood intersections plus21 cradle intersections.
JSON now separates unique rays from part hits. Earlier hood-only result superseded.
No PCB,lens,cables or purchased hardware in optical model; centered axis and actual
pupil still unknown. This remains conditional exploration,not a functional gate.
