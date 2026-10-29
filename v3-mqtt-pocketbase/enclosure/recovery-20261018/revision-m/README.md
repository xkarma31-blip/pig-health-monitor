# Revision M — rounded thermal hood shell

Latest geometry supersedes L. Prior revisions preserved. See
`../revision-l/README.md` for reviewed bearing repair and explicit physical limits.

Direct reference comparison identified overly sharp thermal hood corners. Applied
3mm vertical outer corner rounds before cavity/optical/fastener cuts. Optical
opening remains46×26mm; no speculative circular shroud or fake lens added.
The corner operation genuinely alters exported geometry: vertices simultaneously
at absX>45.99 and absY>18.99 decrease from131(L) to0(M). This is a geometry
regression observation, not a visual fidelity score or physical measurement.

Fresh run:17 independent STL checks,13 assembly pairs,installed-part collision
gate,four assumed cradle-head envelopes,576 bearing samples and17 actual slicer
jobs all pass defined gates. See verification-summary.json and detailed reports.
Use default build/render/assembly/bearing scripts (now M), node check_exports.js
revision-m, bash slice_revision.sh revision-m. Blender uses --python-exit-code1.

Original-source logo/tagline and mint acoustic trim presentation retained. Trim
requires adhesive; it is not a membrane or sealing feature. Render is not evidence
of real board fit. No physical print,assembly,FOV,acoustics,SHT response,strength,
ingress,IP,animal-safety or electrical-safety testing performed. Unmeasured board
geometry and hardware/access/engagement assumptions still require real testing.
No claim of exact poster replication or finished field-ready hardware.

Actual image review `reference-visual-review.txt` confirms visible mint rings and
readable original branding but did NOT verify a smoothly rounded thermal look.
It perceived faceting despite real corner-radius geometry. Imported STL normals
were flat per triangle; render now uses shallow-angle smoothing with30° sharp-edge
split and weighted normals. This is shading only, not a geometry/fit improvement.
Fresh assembly/summary gates still pass. Do not treat normal smoothing as final
visual acceptance; refreshed image needs critical review.

Close-up follow-up (`thermal-hood-detail.png`, `hood-detail-review.txt`) resolves
the full-view ambiguity: reviewer identifies small curved fillets, smooth hood
corners and intentional planar roof, retracting earlier coarse-faceting judgment
for hood body. This is qualified visual evidence, not complete source fidelity.
Screw rim tessellation was visible; render-only heads increased24→96 segments.
All main/detail renders regenerated and assembly/summary gates still pass.
Reviewer also notes faint side boundary and low-contrast internals; interfaces
between removable bodies remain real seams, not hidden sealing claims.

Axial tool-access assumption now has a limited explicit simulation: four7mm
diameter×40mm cylindrical envelopes above the assumed cradle heads, hood removed,
tested against cradle,separator and thermal tub. All12 overlaps zero. Summary
now requires cradle_driver_gate; absent results fail. This does NOT test real
driver tip engagement,handle,hand,angled approach,nut access or other joints.
Earlier comment implying a driver path check before simulation was corrected.

Independent ledger review (`fastener-independent-review.txt`) found no nominal
grip/washer arithmetic mistakes; it explicitly flags duplicated hard-coded source
dimensions as future-drift risk. Selected STL seat checks mitigate this only
partially; do not call them full assembled-grip coverage. Current assembly source
is ASSEMBLY_CURRENT.md, not historical F bolt-length recommendations.

Reproduction defaults repaired: export checker formerly targeted E, slicer and
summary formerly H. All three now default M; archived snapshot scripts retain
their original targets intentionally. Fresh no-argument export,slicing and summary
run passes17 parts. Optional fit-coupon generator remains explicitly L-specific.

Export evidence now records SHA256 of each STL; summary rejects absent/mismatched
export hashes. Negative-control report hash deliberately invalidated temporarily:
summary exit1; restored original report:exit0. No STL modified. Evidence saved
in export-freshness-regression.json. This covers export-report freshness only;
assembly,bearing and slicer reports are not yet cryptographically tied to inputs.

Subsequent freshness extension: bearing report hashes both checked STLs. Renderer
records assembly-import-manifest.json for17 imported meshes; assembly report hashes
current STLs and saved scene. Summary now requires scene hash and agreement between
import manifest,assembly hashes and independent export hashes. Fresh render and
checks pass. These are accidental-staleness guards, not tamper-proof attestation.
Slicer evidence still lacks input binding; earlier statement is superseded for
assembly/bearing only. No additional physical validation is implied.
