# Minimum inputs to finish sensor-interface CAD

Existing enclosure evidence was searched again after P service repair. The root
REFERENCE_AND_HARDWARE.md ledger still identifies no measured breakout geometry;
USB flash readout is not a PCB measurement. SHT31/SHT45 references conflict.
Do not substitute arbitrary vendor dimensions or flash hardware for this task.

Provide clear front/back photos of the actual boards beside a ruler, plus:

- Each PCB: length, width, thickness and tallest protrusion on each face.
- Microphone: port side and center distances from two PCB edges; intended gap
  to enclosure face. Identify whether one or two actual microphone boards exist.
- MLX90640 breakout: exact lens variant, lens/pupil position relative to PCB,
  mounting/connector protrusions and intended viewing direction.
- GY-SHT: readable model/board markings and sensor position on PCB.
- Retention/routing: actual tie width/thickness/head, cable/connector outer sizes,
  fastener head/nut/washer dimensions and intended printer/material.

Measurements must come from the fitted hardware or an exact identified board
mechanical drawing. Photos with scale support identification but may not resolve
thickness, optical pupil or component heights sufficiently. None are pre-filled.

P is useful for prototype review and coupons now; these inputs unlock the actual
gasket/seat/optical/routing CAD. Physical fit, load and sensor response must then
be tested before a functional enclosure can honestly be approved.
