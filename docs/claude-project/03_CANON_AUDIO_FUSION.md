# PigPulse — Canon, Part 3: Audio, Machine Learning, Sensor Fusion

**Version 2.0 — 2026-11-02**

---

## 1. Machine learning — exactly one trained model

Do not blur these four cases. They are different kinds of computation and the
capstone is graded on stating them correctly.

| Task | Type | Notes |
|---|---|---|
| **Cough detection (audio)** | **SUPERVISED** | The only trained model. Labelled cough / noise. Edge Impulse auto-CNN, INT8. |
| **Noise calibration** | **UNSUPERVISED** | Band-wise statistics matching on *unlabelled* ambient audio. No training. |
| **Fever screening (thermal)** | **RULE-BASED** | Threshold comparison. **No ML at all.** |
| *(If FLIR ever added)* ear detection | supervised YOLO | Not applicable — the sensor cannot support it. |

## 2. Audio front-end — `[CORRECTED]` framing inconsistency

- **Nyquist:** 16 kHz sampling → 8 kHz band `[VERIFIED]`.
- **25 ms frame at 16 kHz** = 400 samples `[VERIFIED]`.
- **MFCC matrix 49 × 13** = 637 values `[VERIFIED]`.
- **39-dimensional feature vector** = 13 × 3 (static + Δ + ΔΔ) `[VERIFIED]`.
- **DMA buffer:** 8 × 1024 × 2 B = 16 KB `[VERIFIED]`; 8192 samples at 16 kHz =
  512 ms `[VERIFIED]`.

### The framing contradiction

Documents say "25 ms window, 10 ms hop" **and** "49 frames". Those disagree:
25 ms / 10 ms yields **98 frames per second**, not 49.

**49 frames matches Edge Impulse's default 32 ms window / 20 ms hop.** So the
*numer is right for the tool*, but the *described window is wrong*. Adopt the
Edge Impulse pair and describe it as such, or recompute at 25/10 ms.

### `[CORRECTED]` The documented CNN layer stack is impossible

Documented: `49×13 → 47×11 → 23×5 → 21×3 → 10×1 → 8×1`

A 3×3 convolution on a feature map of **height 1** requires `1 − 2 = −1` — a
negative dimension. **That layer cannot run.** Either the final convolution uses
`padding='same'` (output stays 10×1), or the pooling/document is wrong. Fix the
stack or the claim.

### `[CORRECTED]` Spectral subtraction — the justification does not hold

The project dropped spectral subtraction on the grounds that it "hurts deep
learning", citing "aSwine 2025". The live literature says otherwise:

- **SS-ESC (2024)**, *Signal, Image and Video Processing* — spectral subtraction as
  a **preliminary stage improved** environmental-sound classification.
- **"Study on pig cough recognition and spatial localization" (2026)** — **actively
  uses adaptive spectral subtraction + FIR filtering** as its front-end.

**Never state "spectral subtraction hurts deep learning."** The defensible wording
is: *"approaches differ; we adopt noise-injection augmentation and leave spectral
subtraction to future comparison."*

**🎁 That 2026 localisation paper is directly relevant to the herd-localisation gap
this capstone flags as unfinished — treat it as a primary reference.**

## 3. Single-mic physics — say this plainly

One microphone gives **detection**, not **location**. A mono mic encodes zero
spatial information: no direction, no distance, no identity of which pig coughed.
Published detection accuracy for "a cough occurred" is high (94–99 %). Attribution
requires either more microphones or a camera.

**Acoustic localisation, if a mic array is ever added:**
- 2 mics → crude single-axis direction. 3+ mics → 2D position (TDOA / GCC-PHAT).
- Demonstrated in piggeries: Silva 2008 (7 mics, 0–1.5 m error);
  Cao 2026 (8-channel array + voiceprint DB, 91–98 % per-pig F1).
- GCC-PHAT runs comfortably on a Pi 4B (~8.6 ms/frame). **Future path only.**

## 4. Fusion — what is actually demonstrated

### 4.1 Audio–visual cough attribution: the strongest real path

**Chae et al. 2024**, *Sensors* 24(22):7232 (PMC11598093) — **95 % top-1 accuracy**
identifying *which pig* coughed, using **exactly PigPulse's hardware**: one mono
mic + one overhead camera.

Mechanism — and it is **not** acoustic localisation:
1. Audio detects the cough window (SED-CRNN).
2. YOLO finds each pig in frame.
3. A cross-attention network checks which pig's body showed cough-consistent
   convulsive motion — analogous to active-speaker detection.

Requirements: labelled training data, sufficient lighting, one-cough-at-a-time
windows. **The published model ran on an RTX 2070.** Pi 4B feasibility requires
optimisation and is **unvalidated**. Do not imply it runs on the Pi today.

### 4.2 Thermal–visible fusion must be LATE fusion

Match thermal blobs to CCTV-detected pigs via a **calibrated homography** —
position-level late fusion. F1 93.0 % demonstrated (Dionne-Pierre 2025).
**Pixel-level fusion of a 32 × 24 thermal with 1080p visible is meaningless.**

### 4.3 CCTV capability, measured and published

- Detect/count pigs: YOLOv8n, **97.6 % mAP**.
- Short-term tracking (minutes): Deep SORT-P, **89.6 % MOTA**.
- **Cannot** reliably identify unmarked same-breed pigs over hours; ear-tag
  reading at pen distance is unreliable; face recognition needs close-up frontal
  images.
- Proven routes *if* identity is ever needed: painted back-marks (side-view
  tolerant, BMCTrack-d 2026) or RFID + CV hybrid (97 % tracking, Mora 2024).

### 4.4 Pi 4B vision ceiling — a hard number, not a hope

YOLOv8n via NCNN ≈ **2–3 FPS** inference; full RTSP + tracking pipeline ≈
**1–2 FPS** end-to-end. Adequate for health monitoring (respiratory distress
develops over hours). **Not adequate for "real-time 30 FPS" anything.** A Coral
USB TPU (~$60) lifts lighter models to 5–15 FPS.

## 5. Datasets — what exists but cannot be used here

**TIRPigEar** (Ma et al. 2024, *Animals*, MDPI) — 23,189 thermal infrared images,
10,812 labelled pig ears. Open access. Used to train YOLO ear detectors at
93–98 % accuracy.

**It requires a FLIR-class camera at 320 × 240 or better.** The MLX90640 is 32 × 24.
**This dataset is not usable with the current sensor** — state that as a sensor
limitation, not a data problem.

`[OPEN]` Label-count conflict in project documents: 10,812 ears (the dataset's own
paper) versus 69,567 labelled files. Use the paper's figure.

**FLIR Lepton 3.5** (160 × 120) is the minimum credible upgrade for ear-region
work. Price figures in project documents conflict (₱9,400 vs ₱16,649–33,544) —
re-verify before citing. The original dismissal of FLIR on cost grounds was wrong:
it is roughly 3–5× the MLX90640's price, not orders of magnitude more.
