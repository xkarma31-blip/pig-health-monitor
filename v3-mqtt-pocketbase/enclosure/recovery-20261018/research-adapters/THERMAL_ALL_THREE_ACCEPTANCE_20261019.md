# Thermal active variants — all-three acceptance

This supersedes the earlier failure dispositions in `THERMAL_REAR_RESULTS.md`.
Executed with **Blender 4.2.3 LTS** using `../build_thermal_rear_insert.py`.

## Acceptance

- **25.4 × 17.78 mm: PASS.** Active carrier repaired with the larger variants'
  connected exact-boolean frame, construction-axis M3 bores and flat washer-seat
  pockets. The former tilted/voxel architecture is no longer active.
- **25.4 mm square: PASS.** All three exported STLs byte-for-byte unchanged.
- **28 × 16 mm: PASS.** All three exported STLs byte-for-byte unchanged.

Each passes single-island/manifold/positive-volume/nondegenerate topology,
fixed and internal collision thresholds (0.001 mm³), sampled edge bearing,
retention and four true flat bolt seats. Each seat uses four radius-2.4 mm
samples, axial normal >0.999 and level spread <0.02 mm. Each variant also
passes all 72 sampled optical scenarios (216 total). Full sample coordinates,
normals and gate results are in `thermal-rear-insert-checks.json`.

Revision P input SHA-256 hashes match before/after. No P geometry was edited.
Full PCB and 12 × 8 × 2 mm package proxies remain untrimmed.

## Historical smallest

Original smallest geometry is retained separately, not as the active release:

- `pcb25_4x17_78_rear_insert_historical_pre_flat_seat_20261019.stl`
- `pcb25_4x17_78_retainer_1_historical_pre_flat_seat_20261019.stl`
- `pcb25_4x17_78_retainer_2_historical_pre_flat_seat_20261019.stl`

## Parent integration

For each prefix `pcb25_4x17_78`, `pcb25_4square`, `pcb28x16`:

- `<prefix>_installed.blend`: installed carrier, both retainers, full PCB/package
  proxies and the ten unchanged P context objects; no other variant included.
- `<prefix>_installed_transform.json`: explicit forward/inverse 4×4 transform,
  construction origin, units, object lists and proxy dimensions. The same JSON
  is embedded in scene custom property `thermal_installation_metadata`.

Vertices are **already baked in installed world millimetres**, object matrices
are identity and scene scale is 0.001 m/unit. Do not apply the local-to-world
matrix again when appending these installed objects. STL exports remain in
sensor-local print coordinates. Mapping is local → X tilt 15° → construction
origin → `(x, -17-z, 80+y)`. Square origin is `(0,1.8,6.5)` mm; others use
`(0,0,6.5)` mm.

All three saved scenes were reopened in Blender 4.2.3; object membership,
embedded metadata, identity matrices and inverse transforms passed
`../check_thermal_installed_scenes.py`. Evidence:
`thermal-installed-scene-checks.json`, `thermal-installed-scene-checks.log`,
`thermal-rear-all-three-20261019.log`.

These are digital geometric gates, not measured hardware fit, load testing,
continuous optical-frustum certification or manufacturing approval. PCB edge
keepouts, connectors, actual package and purchased fasteners need validation.
# Acceptance scope correction

The independent interface review and `THERMAL_ACCEPTANCE_HOLD.md` supersede any
installability implication below. All-three passes cover the builder's current
gates only, not the missing cradle load path or nominal installed hardware.
Installed scenes are integration inputs, not release approval.
