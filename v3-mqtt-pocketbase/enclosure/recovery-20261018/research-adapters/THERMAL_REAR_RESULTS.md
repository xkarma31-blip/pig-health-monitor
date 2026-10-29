# Thermal rear insert experiment

Implemented `../build_thermal_rear_insert.py`; executed with installed Blender
4.0.2. Nine STL files exported: one carrier and two removable edge bars for each
of the three PCB outlines. Revision P was read only; input hashes are recorded
in `thermal-rear-insert-checks.json`.

## Dimensions versus assumptions

Source-envelope cases are 25.4 × 17.78, 25.4 square, and 28 × 16 mm from the
independent plan / existing archived source evidence. These are not measured
boards. Independent design assumptions: PCB thickness 1.6; side allowance 0.3;
component-free edge bearing strip 1.5; centered package proxy 12 × 8 × 2 mm.
Two rear rails provide positive-area nominal bearing (76.2, 76.2, 84 mm²).
Side/end walls oppose sliding; separate M2 screw-down bars oppose forward lift.
M2 1.6mm pilots require tapping/validation; no board mounting holes invented.
M3 bores follow construction-axis x=±30,y=±9 cradle/separator pattern.
Install with hood removed; remove bars before dropping in PCB. Actual connector,
underside-component, screw-length, tool access and edge-contact compatibility
remain unverified. These are research meshes, not ready-to-print fit releases.

## Executed gates and failures

- Initial failed export API log retained (`thermal-rear-build.log`).
- Initial collision/topology results retained in
  `thermal-rear-insert-initial-failures.json`.
- Concrete repair: union-seam remesh plus subtraction of unchanged installed
  cradle/hood from insert geometry. Fine 0.12mm remesh exhausted memory (exit
  137, log retained); final run uses **0.5mm voxel approximation**, which is NOT
  a fit allowance and can alter bores/contact surfaces.
- Final 25.4 × 17.78 carrier: zero nonmanifold edges, one island, positive
  volume; no tested insert/PCB/package versus fixed-part collision >0.001mm³.
- Final square carrier: manifold, one island, but **REJECTED installed**:
  PCB/hood intersection 36.95mm³; retainer/hood 121.74mm³; carrier/cradle
  24.00mm³ and carrier/hood 0.47mm³. Not repaired by changing P or shrinking PCB.
- Final 28 × 16 carrier: no tested fixed-part collision, but **REJECTED
  topology**: one nonmanifold edge remains. All six edge bars are manifold.

## Conditional optics

216 scenarios executed (72 per outline): pupil axial positions -2,0,2,4,8,12
relative to assumed front plane; offsets (0,0),(-2,-2),(2,2); FOV 55×35 and
110×75; allowances 0 and 1mm. Each uses an 11×11 angular grid and five translated
pupil origins, 150mm forward rays, actual baked tilt and assembled transforms.
No sampled printed-part ray hits were found. This is **not** a continuous
frustum certificate: pupil origins may lie beyond/inside physical structure;
mechanically rejected square placements cannot be rescued by optical passes.
Package/PCB are excluded as emitters; purchased fasteners and some remote
assembly accessories are not modeled in this test. No full offset/setback sweep,
solid-frustum test, slicer test or hardware measurement was performed.

## Disposition

Only the rectangular 25.4 × 17.78 case passes the implemented fixed-part
collision and topology checks. Positive bearing, M3 fastener seating/load path,
remesh-modified holes, bar contact, and actual board keepouts still need detailed
validation before manufacturing. The square and 28 × 16 failures are deliberately
preserved rather than labeled approved. Full machine-readable results and build
logs accompany the actual exports.
