# Revision O — microphone strap escape repair

Latest candidate geometry supersedes N only for microphone carrier relief.
Current reproduction: `bash verify_revision.sh revision-o` from parent. Runner
now O-only and refuses historical targets. Fresh complete run passes; retained
reproduction.log. Explicit revision-o remains required for standalone scripts
whose historical defaults are N. Statements below describe earlier checkpoints.
Previous revisions preserved. Parent scripts require explicit revision-o target;
default full runner remains N pending consolidation. Do not rebuild N with O
geometry: generator currently selects relief only when revision-o requested.

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
strap-relief-comparison.json. Follow-up independent O review pending.
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

See ../revision-n/START_HERE.md,ASSEMBLY_CURRENT.md,MANUFACTURER_RESEARCH.md and
PHYSICAL_VALIDATION_REQUIRED.md for unchanged assembly and physical limitations.
Acoustic relief does not create sealed sound coupling; breakout-specific measured
gasket path and response tests still required. No IP,sensor or field-ready claims.
