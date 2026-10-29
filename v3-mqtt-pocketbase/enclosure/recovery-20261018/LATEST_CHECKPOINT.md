# Continue autonomously from revision H — no routine approvals

User explicitly granted expanded budget and approved original-poster.png.
Goal active: digital prototype with honest physical limitations, no IP/fit claims.

## Current state

- Default generator/render/check scripts target revision-h (environment override
  PIGPULSE_REVISION supported). Older A–G directories preserved.
- H includes actual hollow modules, matched through-bolt lids/spine, bolted SHT
  arm and open carrier, raised 15° thermal cradle, microphone strap carriers,
  removable electronics tray/spacers, cable exits, actual optical/acoustic holes.
- Source logo crop corrected to include full tagline; OCR verified. Separate
  65×31.25mm label workflow. No fake embossed logo.
- Rendering fixed to assemble imported STL coordinates; previous fake gaps came
  from resetting mixed primitive origins. F's vision transcription confirmed
  complete tagline and proper logo orientation; E's corrected vision review
  confirmed lid seating. H's full comparison request returned no final content;
  NOT a completed H visual review. Retry compact single image if needed.
- Hood/cavity/cradle collision found and corrected via larger inner cavity and
  rectangular screw buttresses. Initial G failed; H passes.

## Fresh verification

`node check_exports.js revision-h`: all 17 parts single component, closed edges,
positive volume, correct binary STL length and Blender-matching mm bounds.
`check_assembly.py`: 13 listed pairs under 0.01mm³ overlap.
`node summarize_verification.js revision-h`: pass true, 17 parts, 13 pairs.
Real PrusaSlicer 2.7.2: 17 jobs, no logged warnings; hood AND cradle supports on.
Assumed PETG235/bed80, 0.4 nozzle, 0.2 layers, 4 perimeters,20% infill,220×220 bed.
Evidence G-code NOT approved for user's printer; no physical print performed.
Approved original SHA256 unchanged: 023d26a14c579d38401fee80d479b10d36004891dff9fdcba4fb7f281399102f.

## Deliverable entry point

revision-h/README.md, reference-comparison.png, assembled-review.blend,
front-review.png, rear-attachment-review.png, verification-summary.json.
Full provisional BOM/assembly ledger remains revision-f/ASSEMBLY_AND_LIMITS.md
with thermal-cradle correction in H README.

## Next meaningful tasks

1. Obtain final H visual review via working Gemini route (previous multi-image
   calls sometimes reasoning-only). Save final content only; never call empty
   content a review. Use /tmp/opencode/vision-models.json privately for route auth,
   never print/copy secrets into deliverables.
2. Independent code/mechanical review if harness permits. Prior attempts failed
   because supplied sessionID invalid; do not repeat invalid-session calls.
3. Inspect code/BOM for bolt-head/tool interference and account for optional unused
   spare STLs. Raised cradle optical target is provisional, not physical FOV proof.
4. Add reproducible slicer script and compact downloadable package if appropriate,
   final evidence/limitations summary. Complete only digital prototype scope once
   actual remaining gates pass; no physical testing claims or numeric fidelity scores.

No need to ask the user to resume/approve reference or provide printer measurements
to complete the expressly conditional digital prototype. Real physical fit remains
explicitly unverified. Do not change live firmware or services.
# Superseding integrated checkpoint

Read `LATEST_REVIEWED_CHECKPOINT.md` for the completed research-dimensioned
integrated candidate and reproducible archive. Historical content below remains
preserved; it is not the latest integration state.
