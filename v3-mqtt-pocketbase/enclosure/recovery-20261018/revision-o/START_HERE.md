# Revision O — microphone strap escape repair

Latest geometry supersedes N only for microphone carrier relief.
Current reproduction: `bash verify_revision.sh revision-o` from parent. Runner
now O-only and refuses historical targets. Fresh complete run passes; retained
reproduction.log. Core standalone defaults now all O. Previous revisions preserved;
historical checkpoint narrative is in CHECKPOINT_HISTORY.md. Optional optical
scripts remain explicitly N-specific exploratory helpers,not O workflow gates.

## Concrete defect and repair

Independent review confirms N carrier face-side slots meet solid acoustic face
at assembled depth30. Prethreading does not provide thickness clearance; a tie
running over the flush interface is pinched. Review retained here.

O cuts short outward escape channels from both slots to carrier edges,nominal
8mm width,1.2mm depth,leaving1.8mm floor outside through-slot. Channels stay
outside central6mm-radius acoustic opening and away from bolt rows atY±10.
Prethread tie tails outward,locking head outside mating interface; no validated
tie size,complete bend route or locking-head placement supplied.

Discrete18-ray relief comparison rejects preserved N and passes O at sampled
locations. This tests channel floor,not full tie compatibility. Detailed report
strap-relief-comparison.json.
Follow-up review completed: no cutter-placement defect found; identified missing
corridor/floor/bolt-land coverage. New strap-corridor-checks.json shows zero
intersection for4mm-wide×0.8mm-thick straight tail corridors from slot to outside
edge; deliberate junction/edge blockers detected. Selected floor volumes retained
and four bolt-bearing annuli pass. Not full tie bend/head/board compatibility.
Two straight slot-leg envelopes(0.8mm×4mm cross-section)join outward corridors
with zero carrier intersection. This is not a curved tie bend model. Report now
hashes actual carrier STL; summary requires matching hash and all10 checks.

Fresh existing gates pass:17 exports,20 installed instances,assembly/head/limited
driver/SHT hardware,bearing samples,selected grip surfaces,provisional ledger and
17 actual slicer jobs. No physical printing,assembly or actual boards measured.

Read local ASSEMBLY_CURRENT.md, MANUFACTURER_RESEARCH.md,
INTEGRATION_DECISIONS.md and PHYSICAL_VALIDATION_REQUIRED.md for assembly,
manufacturer guidance and physical limitations. N optical research is historical
thermal-geometry evidence, not a new O sensor validation.
Acoustic relief does not create sealed sound coupling; breakout-specific measured
gasket path and response tests still required. No IP,sensor or field-ready claims.

## Files and packaging

## External prerequisites

Project inputs are packaged; executable dependencies are not. Before verification,
provide compatible Blender4.0 STL operators,Node.js,and PrusaSlicer2.7.2 with its
shared libraries. Packaging also requires zip,unzip and sha256sum. On the tested
Ubuntu noble amd64 host, `bash restore_slicer_runtime.sh` restores the default
temporary slicer path. Otherwise configure PRUSA_SLICER to your executable and
provide its libraries. The helper assumes other host libraries already exist;
it is not a portable complete environment. Run prerequisite setup BEFORE
`bash verify_revision.sh revision-o`; temporary runtime may disappear after restart.

reference-comparison.png places approved poster beside current front/rear.
REFERENCE_DEVIATIONS.md records significant unresolved visual differences and
rejects incorrect reviewer function inferences. This is not an approved replica.
LUG_DESIGN_DECISION.md records rejection of ungrounded wall ears; the source-only
proposal assumed a wall-mount requirement and could not inspect the poster.
Release gate now enforces hash-bound N-fails/O-passes relief comparison; missing
report and stale-control hash both fail(exit1),restored passes(exit0).

Open assembled-reference-label.png, front-review.png and rear-attachment-review.png
for current views. The assembled blend contains imported STLs, original artwork
and render-only optional dark hardware. No actual sensor or thermal window modeled.
There are17 distinct STL exports; installed assembly has20 printable instances.
Print one each except microphone carrier×2, acoustic trim×2, tray spacer×4.
Optical trim and old flat thermal carrier are spare/not installed. Electronics and
purchased hardware are not printable parts. Trim adhesive remains unvalidated.

After a passing verification run, `bash package_revision_o.sh` creates a fresh ZIP,
tests integrity and writes SHA256. It excludes G-code and per-run slicer artifacts.
Summary requires regenerated G-code; rerun pipeline rather than attempting to run
summary directly from the ZIP alone. Slicer profile is diagnostic, not approval
for an unknown printer. N carrier included solely as strap negative-control input.
Temporary slicer runtime was lost after restart; restored through Ubuntu noble
amd64 package download/extraction without system installation. Optional helper
restore_slicer_runtime.sh documents this distro-specific fallback. It does not
resolve every dependency on other machines. Latest17-part slicing rerun passed
after restoration; earlier interrupted run was not a successful verification.
