# Revision A — mechanical prototype, not final enclosure

The user approved `original-poster.png` as the intended visual reference.
No further routine reference approval is needed.

## Generated evidence

- Eight individual millimeter STL files, exported before display assembly.
- `mesh-checks.json`: all eight construction meshes have zero non-manifold
  edges and positive signed volume. This is not a self-intersection, slicer,
  wall-thickness, fit, seal or structural test.
- `mechanical-prototype.blend` and `mechanical-layout.png`: separated parts.
- `assembled-review.blend` and `assembled-reference-label.png`: assembled review.
- The wordmark is a crop of the actual approved poster, packed as a texture.
  It is explicitly a LABEL workflow, not a claimed engraved/raised STL logo.
  Exact physical label size in this review is 65 × 26.25 mm; crop includes
  background. No guessed font or solid-disc replacement mark was used.

## Real improvements over legacy assets

Hollow upper/lower housings; connected corner posts; matched 3.4 mm nominal
clearance bores through posts/lids; optical opening; two actual acoustic holes;
side cable aperture; main rear strap slots; independently printable trim rings.
Nominal walls/floors are 3 mm. Use purchased bolts/nuts with length selected
after measuring a print, not the fictional heat-set insert features previously
claimed. Trim rings require adhesive retention and are not twist-lock couplers.

## Remaining limitations — do not hide these

- No actual fitted PCB dimensions established. Strap slots are generic retention
  provisions, not proof of safe component retention or board-specific mounting.
- Main/thermal/acoustic housings are separate; no inter-module mechanical joint
  has been engineered. They must not be mounted or load-tested as one device.
- Thermal hood angle and optical keep-outs still need reconstruction; current
  face is flat, not a faithful angled final hood. Opening does not prove FOV.
- SHT identity and ventilation module remain unresolved; do not seal a humidity
  sensor inside the main compartment and call the design functional.
- Rear strap openings are unsealed. No gasket, IP rating or washdown capability.
- Available CLI checks found no PrusaSlicer, CuraEngine, Slic3r or OpenSCAD.
  No slicer pass or G-code has been generated. No physical test print performed.
- Do not infer dual-microphone electronics from the retained dual-port aesthetic.
- No physical hardware reliability or numeric aesthetic fidelity score asserted.

## Resume next

Review assembled rendering against poster through the working vision route,
reconstruct the angled hood and connecting mounting spine, establish exact
breakout variants from project evidence, then run a real slicer when available.
Keep all previous assets and distinguish tested facts from engineering assumptions.
