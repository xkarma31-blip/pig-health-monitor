# Reference recovered; manufacturing release pending

## Source and provenance

Repository candidate: `v3-mqtt-pocketbase/frontend/landing_page/pigpulse_poster.png`.
Preserved here as `original-poster.png` (1536 × 1024 pixels).
SHA-256: `023d26a14c579d38401fee80d479b10d36004891dff9fdcba4fb7f281399102f`.

OCR independently found PigPulse, “Edge Intelligence for Swine Health”, detachable
modules and dimensional callouts. A real request to the previously image-tested
`9router/ag/gemini-3.8-flash` route returned an image-specific visual inspection;
its extracted final answer is preserved as `vision-inspection.txt`.
This is delegated image inspection, not direct image perception by the current
text-only assistant. User approval that this is the intended original is pending.

## Appearance contract proposed for approval

- Preserve the charcoal industrial three-part stack rather than generic boxes.
- Preserve mint/green PigPulse title-case wordmark and broadcast-like curved
  signal accents; do not replace them with solid discs or a mascot.
- Preserve the stepped top optical hood, broad middle face, rounded corners,
  visible fastener locations, lower face indicator and two-port lower silhouette.
- Treat exact font, signal-arc count, angle, and RGB values as unresolved until
  original pixels are traced or source artwork is recovered. The vision response
  gives approximate colors/fonts, not authoritative vector artwork or CAD angles.
- Poster envelope callouts (200 × 120 × 35 mm) are design intent only, not measured
  hardware clearance or proof that the current electronics can fit.

## Hardware evidence ledger

- ESP32-S3: CANON.md records a USB-derived 4 MB flash result. This says nothing
  about PCB envelope, mounting holes, component heights or connector keep-outs.
- MLX90640: CANON.md places its I2C interface on the Pi. A sensor-package drawing
  cannot substitute for the actual breakout PCB's mechanical drawing.
- SHT: `firmware/esp32s3-mic-ambient/docs/wiring/mkwiring.py` labels SHT31;
  `docs/MIC_AUDIT_20261017.md` mentions SHT45. The opt-in `src/sht_probe.h`
  explicitly says an ACK does not identify the model. Exact GY-SHT breakout,
  dimensions, orientation and retention features remain unknown.
- Microphone: do not infer two working physical microphones from a dual-port
  concept graphic or duplicated-mono stereo PCM. Exact mic PCB and port geometry
  must be established before mechanical acoustic alignment can be checked.
- Battery, charger, connector series and mount diameter: poster concepts only;
  not established fitted hardware. No battery endurance or ingress rating inferred.

## Required next approval/input

1. Confirm that `original-poster.png` is the intended visual reference.
2. Supply exact breakout IDs/photos with scale or measured mechanical envelopes
   for the parts being fitted. Minimum: PCB length/width, tallest components on
   both faces, hole coordinates/diameters, connector protrusions, and cable exits.
3. Specify printer/build volume, nozzle and material for a meaningful slicer check.

Do not choose arbitrary vendor breakout dimensions merely because their sensor
name matches. Do not flash, rewire, or deploy firmware to obtain mechanical data.
Existing concept files remain untouched; no manufacturing-ready STL is released.
