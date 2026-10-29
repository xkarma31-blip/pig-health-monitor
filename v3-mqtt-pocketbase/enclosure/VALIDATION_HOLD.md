# Enclosure validation hold — 2026-10-18

Existing BLEND, STL, and README assets are preserved. They are concept assets,
not released manufacturing files. This notice takes precedence over unsupported
print-readiness and environmental claims in the original README.

## Evidence and corrections

- The original clipboard reference has not been reliably recovered. The chat's
  claimed visual breakdown is not reliable evidence: the attachment reported an
  image-input error. Exact logo outlines, typography and proportions remain unapproved.
- The available generator creates the thermal and acoustic bodies as solid boxes,
  not serviceable hollow sensor housings. Rendered port cylinders do not cut holes.
- The main-body export selects the tub alone, omitting separately modeled corner
  bosses. These bosses also lack insert bores in the available generator.
- Separate gasket visualization does not create a mating gasket channel.
- Rendered electronics dimensions, battery capacity, dual microphones, couplers,
  mounting pole diameter and tilt are not physical measurements.
- CANON.md describes MLX90640 connected to the Pi over I2C, not proof of the
  illustrated ESP32-to-thermal wiring architecture. Its USB record reports 4 MB
  flash for the ESP32-S3; the chat's 16 MB claim is not applicable evidence.
- Repository SHT references conflict: wiring/mkwiring.py labels SHT31 while
  MIC_AUDIT_20261017.md mentions SHT45. Neither establishes breakout dimensions.
- No slicer pass, physical fit test, sensor obstruction test, environmental test
  or load test has been recorded for these exported parts.
- STL does not preserve Blender material colors. Colored branding requires a
  separately planned inlay/multimaterial workflow, paint, or a label.

## Release gates

1. Recover original reference and obtain approval of branding and silhouette.
2. Identify exact fitted board variants and record dimension provenance, PCB
   envelopes, hole centers, connector keep-outs and cable bend clearances.
3. Build actual cavities, retention, serviceable joints and sensor apertures;
   keep the SHT sensing area ventilated and separated from heat sources.
4. Check millimeter export scale, closed/manifold meshes, component intersections,
   minimum wall thickness, assembled fit and printable branding attachment.
5. Slice each part using a specified printer/nozzle/material profile; inspect
   layers, unsupported islands, bridges, supports and all functional openings.
6. Print fit coupons and perform an actual assembly and sensor-function check.

No visual fidelity score, IP rating, chemical resistance lifetime or physical
reliability score is established by the available evidence.
