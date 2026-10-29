# Final digital audit — 2026-10-18

## Passed, with retained evidence

1. Approved poster unchanged: SHA256
   023d26a14c579d38401fee80d479b10d36004891dff9fdcba4fb7f281399102f.
2. Source-derived logo and full tagline: original crop packed as texture and
   supplied for an adhesive label. OCR and actual vision transcription agree.
3. 17 binary STL exports: exact file length, single connected component, closed
   edges, positive signed volume, millimeter bounds matching Blender.
4. 13 explicit assembly-pair booleans pass <0.01mm³ intersection threshold.
5. All 20 installed printable instances screened by world AABB followed by exact
   boolean for every candidate pair: no volume collision above threshold.
6. Actual PrusaSlicer 2.7.2 produced 17 G-code outputs with layers and toolpath
   moves, no final logs reporting print warnings. Supported hood/cradle, assumed
   PETG 235/80,0.4 nozzle,0.2 layer,4 perimeters,20% infill,220×220 bed.
7. Final actual vision response using ag/gemini-3.8-flash-low describes charcoal
   three-part housing, upper recess, dual lower holes, fasteners, side bracket,
   green PigPulse mark and complete white tagline. Saved final-visual-review.txt.
8. Front, rear, assembled, layout and reference comparison images generated.

## Functional design corrections versus old model

Actual cavities/openings, bolted modular mounting spine, cable routing holes,
removable electronics retention tray, mic strap carriers, thermal raised/tilted
carrier and attached open SHT carrier. No printed electronics; no fake solid
sound/lens bezels or fictional heat-set inserts/twist-lock connector function.

## Fidelity limitations and intentional deviations

This is a functional adaptation of the approved visual identity, not an exact
industrial-design reproduction. Source label is exact raster artwork; geometry
is reconstructed and visually simpler than poster. Corner radii and seams are
not identical. Real rear spine substitutes connector hardware; SHT protrudes
externally; fastener proxies do not model purchased screw drives/threads. No
numeric fidelity or reliability score has been invented. Optional unused trim
and old flat thermal carrier are exported spares, not installed final parts.

## Unperformed physical validation

No fitted board physical measurements, print, test assembly, sensor response,
FOV, acoustic coupling, WiFi, retention strength, chemical/thermal lifetime,
battery safety/endurance, animal safety or ingress testing performed. Generic
strap-mount dimensions are assumptions, not physically grounded fits. Web
dimensions recorded as examples, not silently adopted as actual hardware.
Raised thermal platform is not a measured optical pupil. Lens must fit inside
hood and align with window; exact real-board shimming may be required. This is
an explicit digital-prototype limitation, not evidence of a working physical case.

No self-intersection proof, full structural analysis, screw-tool accessibility
simulation or layer-by-layer human slicer inspection. Digital topology and slice
generation are not substitutes. G-code is evidence, NOT printer-ready delivery.
No IP rating, washdown capability, field-readiness or physical-fit claim.

## Review/tool limitations

Separate read-only subagent delegation was attempted but not completed; no
independent mechanical review is claimed. Completed visual review was an actual
image request through a separately image-tested model route. Source scripts and
verification JSON permit reproduction. Live firmware/services untouched by this
enclosure work. Existing unrelated repository changes were not modified.
