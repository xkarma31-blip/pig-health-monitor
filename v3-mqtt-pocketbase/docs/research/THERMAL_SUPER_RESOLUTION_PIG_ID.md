# Thermal super-resolution, pig identity, and synchronized processing

## Bottom line

Super-resolution can make a 32×24 MLX90640 frame easier for a human to read and can help a detector propose regions, but it **does not create new radiometric detail**. It must never be used to claim a more precise temperature or a confirmed fever. Individual pig identity is a separate detection/tracking/re-ID problem requiring camera geometry, annotations, and validation.

## Grounded findings

- Huang et al. 2025: “thermal images typically exhibit low contrast, limited high-frequency details, and sensor-specific noise.”
- Raimundo et al. 2021: “the resolution of thermal sensors will not equal that of other sensors ... in the short and medium term.”
- Same paper: “a ratio of more than four may lead to unexpected artifacts and to the failure of processes.” Our RGB-to-thermal ratio exceeds this, so fusion output must carry a quality flag.
- TISR 2026 synthesis: “Remaining challenges include robust cross-spectral alignment, computational efficiency for resource-constrained deployment, broader dataset diversity across conditions, and resilience to noise and environmental variation.”
- Krapels et al. 2007: SR benefits undersampled imager outputs when there is sub-pixel motion; a fixed camera does not automatically qualify.
- Zhang et al. 2019 achieved precision 94.72%, recall 94.74%, MOTA 89.58% on 1080p commercial-farm video — not on a 32×24 thermal array.
- Psota et al. 2020 and Schmidt et al. 2022 used ear tags/depth cameras for >95% individual ID; those inputs are not present in PigPulse.

## Proposed preprocessing / synthesis pipeline

1. **Capture pairing:** fetch thermal `/api/pi?ep=data` and CCTV snapshot with Pi-clock `X-Frame-Ts`; accept only pairs within a bounded time window.
2. **Quality gate:** reject corrupt thermal frames (already done), require 768 valid pixels, record frame age, FPS, and sensor error.
3. **Calibration:** compute homography from a visible/thermal target when the camera moves; store reprojection error. If error exceeds budget, show side-by-side only — no fused claim.
4. **Region proposal:** run a pig/body detector on the visible RGB frame (later slice), project proposals into thermal ROI coordinates.
5. **Radiometric readback:** from the original 32×24 pixels only; SR output is for display/proposals, never for numeric temperature claims.
6. **Identity:** associate ROI across frames with tracker; link to an ear-tag/visual re-ID model only after a tagged dataset exists. Until then, label `pig-unknown`.
7. **Logging:** store frame timestamps, calibration version, ROI, original pixel stats, visible-frame hash, tracker id, and confidence. Do not store SR pixels as raw measurements.
8. **Visualization:** show a split thermal/RGB view, a confidence badge, and a plain-language explanation: “warm region in pen, identity not confirmed”.

## Research milestones

- M1: paired-frame logger + calibration target; no ML claims.
- M2: visible ROI detector with group/pig box metrics; human-in-loop labelling.
- M3: tracker with identity persistence; measure ID switches.
- M4: cough event association using audio-visual time windows; no single-mic attribution claims.
- M5: report precision/recall/MOTA/IDF1 with grouped and time-split validation.

## What not to do

- Do not train on random frame splits; use pig/session/time groups.
- Do not report SR PSNR as health accuracy.
- Do not call a warm ROI “fever” without animal identity, emissivity/ambient context, and veterinary confirmation.
- Do not merge frames with large clock skew or poor registration.
