# Thermal rear repair execution — NOT ACCEPTED

Scope: `build_thermal_rear_insert.py` and thermal-rear research outputs only.
Revision P was not edited. Original generator, STL files, checks and historical
logs were copied into `thermal-rear-before-repair-20261019/` before execution.
The copy command also matched that destination directory and returned an error
for that directory; the individually matched source files were copied.

Executed with `/home/solrahk/.local/blender-4.2.3-linux-x64/blender` (4.2.3 LTS):

```sh
/home/solrahk/.local/blender-4.2.3-linux-x64/blender -b --python-exit-code 1 --python build_thermal_rear_insert.py
```

The generator now records aggregate mechanical acceptance and returns exit 1
when any variant fails. Optical acceptance requires mechanical validity even
when sampled rays have no hits. Added checks include every exported part's
topology, installed internal collisions, fixed-part collisions, and surviving
edge-bearing slab intersections, with an upper-bound sanity check on area.
P input hashes are rechecked before the report is written.

The exact-union experiment failed with hundreds of nonmanifold edges; its
report is preserved as `thermal-rear-exact-union-failures-20261019.json`.
A 0.25mm voxel experiment also failed badly, including implausible Boolean
intersection volumes. That report is retained as
`thermal-rear-stale-transform-failures-20261019.json` (the filename describes a
hypothesis, NOT an established root cause). Updating the dependency graph did
not resolve those failures. The final run restores the existing 0.5mm voxel
resolution and still returns exit 1; see `thermal-rear-insert-checks.json` and
`thermal-rear-repair-final-20261019.log` for final measurements.

**Repair remains incomplete. Do not print/release these outputs.** In particular,
subtracting the hood from a carrier cannot repair a PCB-envelope/hood collision:
the square PCB placement itself needs a redesigned placement and load path,
followed by fresh topology, bearing, screw-seat and collision validation.
No physical hardware fit, continuous optical clearance, fastener load capacity,
or manufacturing acceptance is claimed. Boolean bearing measurements on failed
topology are diagnostic only, not trustworthy contact certificates.
