# Autonomous verification checkpoint

Approved reference remains original-poster.png. No routine user approval needed.

## New evidence

- Real comparative vision review saved in revision-a/visual-review.txt. Identified
  flat thermal face, weak label subtext, absent indicator and missing interconnects.
  Suggested latches/hinges are model observations, not authoritative requirements.
- Isolated Ubuntu PrusaSlicer 2.7.2 extracted under /tmp/opencode/pigpulse-slicer;
  no system packages installed. Runtime plus missing libraries downloaded with
  apt-get download and extracted without sudo/system installation.
- Revision A: all eight STLs sliced to G-code, process exit 0 each.
- Revision B: added rear mounting spine with matched through-holes at module
  centers -80/0/+80mm and open adjustable SHT carrier. All ten STLs sliced with
  process exit 0 each. Logs and G-code in revision-b/slicer/.
- Revision C: added real 15-degree hollow wedge hood with clearance bores and
  optical opening. Eleven construction meshes have zero non-manifold edges and
  positive volume. Hood alone additionally sliced exit 0; other C files need
  their own exported-STL verification/slicing before claiming C-wide slice pass.

## Slicer assumptions and important warning

CLI: --export-gcode --layer-height 0.2 --nozzle-diameter 0.4 --perimeters 4
--fill-density 20% --bed-shape 0x0,220x0,220x220,0x220.
Remaining settings are slicer defaults: embedded config reports PLA, 200 C nozzle,
0 C bed, supports disabled. This is geometry/toolpath generation evidence ONLY.
G-code IS NOT approved for the user's printer and must not be executed blindly.
No layer-by-layer visual approval, physical print, chemical/IP or strength test.

## Remaining engineering issues (do not conceal)

- Hood's mounting posts currently extend to a common 23mm height and can protrude
  above the sloped face. Need variable-height posts and minimum wall check.
- Hood opening must be aligned to the thermal-face opening in an assembled check;
  optical sensor mounting angle and wide-FOV clearance still unverified.
- Revision B/C spine holes match rear module holes but fastener access and
  component interference require assembly verification and suitable M3 nuts.
- Adjustable SHT carrier is not yet attached to a stand-off or integrated mount;
  actual GY-SHT identity/dimensions remain unknown (SHT31/SHT45 record conflict).
- No exact measured electronic hardware dimensions; no physical fit claimed.
- Reference label remains raster/adhesive workflow, not embossed STL geometry.
- revision-a assembled render predates B/C changes; a new assembled view is needed.
- No fake waterproof circular connectors; actual spine substitutes bolted assembly.

## Latest safe refinement — revision D

Clipped hood posts against the true 15-degree outer envelope so the posts no
longer protrude above the sloping face. Regenerated eleven parts in revision-d/;
all eleven again passed zero-non-manifold-edge and positive-volume gates.
Independent binary-STL triangle-count/byte-length checks passed for all eleven.
Hood Z envelope is now 21.091 mm (previous C envelope was 23 mm).
Revision D has not yet been sliced; do not transfer C's slice evidence to it.

Next: exported-STL reimport scale/connected-component checks, assemble D,
integrate SHT carrier attachment, run fresh reference comparison and slice every
final part with documented profile. No further routine user approval required.
