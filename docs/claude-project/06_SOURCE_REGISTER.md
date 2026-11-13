# PigPulse — Source Register

**Version 1.0 — 2026-11-02**

> Only sources listed in **Section 1** may be cited as established fact. Section 2
> lists citations whose text exists in project documents but which **could not be
> located in the live literature** — do not cite them until traced.

---

## 1. Verified sources — safe to cite

### Thermal measurement and pig thermography

| Source | What it supports |
|---|---|
| **Melexis MLX90640 datasheet** | FOV options (55°×35°, 110°×75°), part numbering (BAA = 110°, BAB = 55°), accuracy tables, the settled-isothermal and object-fills-FOV validity conditions, ±3 °C long-term drift, ±2 % of \|To−Ta\| uniformity |
| **Soerensen et al. 2014**, *Computers and Electronics in Agriculture* **109**:112–118 | pig-skin emissivity **ε = 0.978** at the ear base |
| ***Sensors* 14(7):12305** | the radiometric equation and the T^(1/4) emissivity-correction form (Eq. 16) |
| **Jiao et al. 2022**, *Frontiers in Physics* **10**:893131 | thermal drift in uncooled microbolometer measurement |
| **Traulsen et al. 2011** | infrared thermography vs rectal temperature for pig fever |
| **Ma et al. 2024**, *Animals* (MDPI) — **TIRPigEar** | 23,189 thermal images / 10,812 labelled pig ears; open access; **requires 320×240+ FLIR-class optics** |
| **Zhang et al. 2025**; **Xiang et al. 2025** — SwinStar-YOLO / YOLOv11m-OBB | ear detection on TIRPigEar at 93–98 % (supervised) |

### Audio, cough detection, and localisation

| Source | What it supports |
|---|---|
| **Yin et al., Oct 2025**, *Computers and Electronics in Agriculture* | ensemble deep-learning frameworks for pig cough recognition in a complex piggery environment |
| **"Study on pig cough recognition and spatial localization" (2026)** | **uses adaptive spectral subtraction + FIR filtering + KL-NMF** — the counter-example to "SS hurts deep learning", and directly relevant to the herd-localisation gap |
| **SS-ESC (2024)**, *Signal, Image and Video Processing* | spectral subtraction as a preliminary stage **improved** environmental-sound classification |
| **Silva et al. 2008** | acoustic localisation in piggeries — 7 mics, 0–1.5 m error |
| **Cao et al. 2026** | 8-channel array + voiceprint database, 91–98 % per-pig F1 |

### Fusion, vision, and identification

| Source | What it supports |
|---|---|
| **Chae et al. 2024**, *Sensors* **24(22):7232** (PMC11598093) | **95 % top-1** "which pig coughed" with one mono mic + one overhead camera; SED-CRNN + YOLO + cross-attention. Ran on an RTX 2070. |
| **Dionne-Pierre 2025** | thermal–visible **position-level late fusion** via homography, F1 93.0 % |
| **Mora et al. 2024** | RFID + computer-vision hybrid tracking, 97 % |
| **BMCTrack-d (2026)** | painted back-mark tracking, side-view tolerant |
| **Edge Impulse — "When Pigs AI: Monitoring Livestock Health with Edge ML"** | the **99.7 %** pig-cough classification figure (Arduino Nano 33 BLE Sense). **This is the true owner of that number.** |

### Standards and context

| Source | Status |
|---|---|
| **PAES 401:2001** — *Agricultural Structures – Housing for Swine Production* (AMTEC, UPLB) | ✅ **confirmed real**. Governs space/feeding/watering requirements. Re-verify any *specific* pen dimension against its space-requirement table before citing. |
| **PSA / FAO** backyard-share statistics | cite the specific source used; project documents conflict between 65 % and 72 % |
| **Smart Watt** (reference system supplied by the professor) | a comparable IoT livestock-monitoring system — use as a primary methodology reference for Chapter 2/3 |

## 2. Untraced citations — do NOT cite until located

| Citation in project documents | Problem |
|---|---|
| **"JMBM 2025"** — YOLOv11 + U-Net + MFCC-LSTM, 99.61 % | no match found in the live literature |
| **"Frontiers Vet. Sci. 2023"** — ₱350–800/pig, −17.4 % ADG, −14 % FCR | no matching 2023 article; the three figures are unattributed |
| **"PHP 6 billion"** annual swine respiratory loss | not located; ASF impact literature found instead |
| **"Baluyut 2019"** | not located |
| **"Jia et al."** — thermal ambient compensation | not located as pig-specific work |
| **"Smart Ag Tech 2025"** — GAN 32×24→128×96, MAE 0.09 °C | the *topic* is real; **the MAE figure is unconfirmed** |
| **"Cook et al. 2014"** | year is wrong — Cook's livestock IRT review is ~2021/2022 |
| **"Oduor et al."** (99.7 %) | misattribution — see the Edge Impulse entry above |

## 3. Citation hygiene rules

1. **Never cite a paper you have not located.** Write "untraceable" instead.
   A missing paper is survivable; a fabricated one is not.
2. **Distinguish the claim from its source.** "A dataset paper reported 93–98 %"
   is different from "our system achieves 93–98 %".
3. **Separate publication venue from number.** If a figure came from a vendor blog,
   a project write-up, or a dataset's README, say so — do not dress it as a journal
   finding.
4. **Mark provenance on every quantitative claim** — `[MEASURED]`, `[DATASHEET]`,
   `[PAPER]`, `[VERIFIED]`, or `[OPEN]`.
5. **A paper's existence does not validate a derived figure.** "Deep learning
   temperature detection for group-raised pigs" (2025) genuinely applies
   super-resolution to pig thermal imagery — that does not confirm a specific MAE
   of 0.09 °C.
