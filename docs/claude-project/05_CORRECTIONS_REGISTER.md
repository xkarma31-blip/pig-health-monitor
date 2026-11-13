# PigPulse — Corrections Register

**Version 1.0 — 2026-11-02**

> **Purpose.** The project's memory entries (dated 2026-09-14 and 2026-09-30) and
> many repository documents predate a full calculation-and-source audit carried out
> on **2026-11-02**. This register lists every claim that changed. **Where a memory
> entry or older document states something below, the corrected value wins.**
>
> If a user references an old figure, do not repeat it — give the corrected value
> and note that it was superseded on 2026-11-02.

---

## A. Defence-critical — fix these first

| # | Old claim | Verdict | Corrected value |
|---|---|---|---|
| 1 | MLX90640 pixel pitch "6 × 5 cm at 2 m" | ❌ **wrong for this build** — that is the 55° BAB geometry | **17.9 × 12.8 cm** for the specified 110° BAA part. The stated pitch must match the specified sensor. The ear-ROI negative result holds under **either** pitch (ear = 0.22 px at 2 m for 110°, 1.46 px for 55°) — see Part 2 §1. |
| 1b | "~570 pixels per pig" (earlier working figure) | ❌ **withdrawn — did not reproduce** | 570 px × 228.3 cm² = 13.0 m², i.e. a whole pen, not an animal. Correct: **21 px/pig at 2 m**, 37 at 1.5 m. Use the ear-ROI table in Part 2 §1. |
| 2 | Emissivity correction yields +0.21 °C | ❌ **unit error** — applied to Celsius, not Kelvin | **+1.74 °C**. Understated **8.1×**, and larger than the whole 1.5 °C fever threshold. Also check for double correction against `CalculateTo()`, which already takes ε. |
| 3 | "~30 mA average → ~170 hours" | ❌ **self-contradictory** | `9.4 mA → 170 h` **or** `30 mA → 53 h`. Never both. |
| 4 | "Spectral subtraction hurts deep learning (aSwine 2025)" | 🔴 **contradicted by the literature** | SS-ESC 2024 found SS *improves* environmental-sound classification; a 2026 pig-cough localisation paper uses adaptive SS. Say "approaches differ" — never "SS hurts DL". |

## B. Internal conflicts — one quantity, several values

These are the dangerous ones: whichever chapter cites the "wrong" document inherits
a contradiction.

| Quantity | Values found in project documents | Guidance |
|---|---|---|
| MLX90640 pixel pitch @2 m | 18 × 13 cm / **6 × 5 cm** | use **17.9 × 12.8 cm** (110° part) |
| MLX90640 accuracy | ±1.0 / ±1.5 / ±1.7 / ±2.0 °C | datasheet: **±1.0 °C** frame in 0–100 °C at 25 °C ambient, **±2.0 °C** outside; **±3 °C** long-term drift. Not device-measured. |
| INMP441 SNR | 61 dBA / 65 dB | unresolved — neither is device-measured |
| Pig cough band | 150–5,000 Hz / 300–3,000 Hz / 0.5–5 kHz | pick **one** and use it everywhere |
| Fever threshold | ΔT > 1.5 °C / FeverDelta > 5 °C | unify |
| Fusion divisor | ÷1.5 °C / ÷0.3 °C | unify |
| TIRPigEar labels | 10,812 ears / 69,567 files | use the dataset paper's **10,812 ears** |
| FLIR Lepton 3.5 price | ₱9,400 / ₱16,649–33,544 | re-verify before citing |
| Backyard share of PH herd | 65 % (PSA/FAO) / 72 % | cite the source you actually used |

## C. Mathematical and logical errors

| # | Claim | Verdict | Fix |
|---|---|---|---|
| 5 | CNN stack `49×13 → … → 10×1 → 8×1` | ❌ **impossible** — a 3×3 convolution on height 1 is a negative dimension | use `padding='same'` (output stays 10×1) or correct the pooling/doc |
| 6 | "25 ms window, 10 ms hop → 49 frames" | ❌ inconsistent | 25/10 ms yields **98 fps**; 49 matches **Edge Impulse's 32 ms/20 ms** default. Adopt one and describe it accurately. |
| 7 | Health-score mapping | ❌ **not linear** — neither fit holds | endpoint line drifts **7.06 pts**, least-squares **4.28 pts** | write the transfer function down explicitly |
| 8 | Uncertainty "0.5 + 0.5 + 0.3 = 1.3 → 1.5 °C" | ❌ method error; the 1.3→1.5 jump is underived | declare **worst-case 1.3 °C** *or* **RSS 0.77 °C**, then derive 1.5 °C |
| 9 | I²C readout "150 ms / 6.6 FPS" | ❌ ~4× too slow | 400 kHz → **34.6 ms / 28.9 FPS**; 1 MHz → 13.8 ms. Likely the doc silently includes the ADC frame time — label it. |
| 10 | ROI "5 pigs payback" vs abstract's "single animal" | ❌ framing inconsistency | the two chapters describe different products — reconcile |

## D. Citation problems

| Citation | Verdict |
|---|---|
| **99.7 % pig-cough accuracy — "Oduor et al."** | ⚠️ **misattributed.** The number is real and belongs to the **Edge Impulse project "When Pigs AI"** (Arduino Nano 33 BLE Sense). Two things were merged. |
| **Cook et al. 2014** (IRT review) | ⚠️ **year wrong** — Cook's livestock IRT review is ~2021/2022; genuine 2014-era IRT work is Nääs et al. |
| **"70 % of PH farms open-air"** | ⚠️ conflicts with PSA/FAO's ~**65 %** |
| **PHP 6 billion** annual swine respiratory loss | 🔴 **untraceable** |
| **Frontiers Vet. Sci. 2023** — ₱350–800/pig, −17.4 % ADG, −14 % FCR | 🔴 **untraceable**; the three figures have no located source |
| **JMBM 2025** — 99.61 % | 🔴 **untraceable** |
| **Baluyut 2019** | 🔴 **untraceable** |
| **Jia et al.** — thermal ambient compensation | 🔴 not located as pig-specific work |
| **"Smart Ag Tech 2025"** — GAN 32×24→128×96, MAE 0.09 °C | 🟡 the *topic* is real (2025 group-raised-pig thermal SR paper); the **MAE figure is unconfirmed** |
| **PAES 401:2001** swine housing | ✅ **standard confirmed real** (AMTEC/UPLB). But the specific **1.5 m × 4.8 m / 10 finishers** figure was not visible in the extracted space-requirement table — re-verify before citing. |

**A missing paper is survivable. A fabricated one is not.** Trace or delete.

## E. Spec-sheet values that must never be called "confirmed"

No device readout backs any of these. Label them **spec-sheet only**:

- MLX90640 accuracy, refresh rate, FOV, noise-equivalent ΔT
- INMP441 SNR and sensitivity
- ESP32-S3, Pi 4, UPS HAT current draws
- Any "measured" battery-life or thermal-accuracy figure

The one place this project *did* attempt a hardware read — the Pi GPIO mic —
produced **1,920,000 bit-exact zero samples**, which is exactly why the rule exists.

## F. Statements that must never appear in any answer

1. Spectral subtraction hurts deep learning.
2. Individual pig identification is achievable with the MLX90640.
3. Ear-base temperature can be measured with the MLX90640.
4. MLX90640 accuracy of ±0.8 °C.
5. Thermal super-resolution used to *measure* temperature.
6. "Confirmed" or "verified" about hardware with no device readout.
7. Real-time 30 FPS vision on a Raspberry Pi 4B.
8. "Noise-free" or "long-term reliable" audio.
9. That the telemetry proxy's `/cctv` route exists on the laptop gateway — it does not.

## G. What is genuinely solid

The arithmetic is not the problem. **26 of 26 recomputable calculations reproduced
exactly** `[VERIFIED]`. The failures above are **consistency and sourcing**
failures — the same quantity holding different values in different documents, and
citations that cannot be located. Frame it that way: the maths is trustworthy, the
provenance is not yet.
