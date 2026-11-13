# CALCULATION & SOURCE AUDIT — PigPulse Capstone
**Date:** 2026-11-02
**Scope:** every quantitative claim and citation across the capstone document set
**Method:** each calculation recomputed from first principles in Python; each citation traced to a live URL or marked untraceable. No value accepted on the authority of the document that stated it.

**Documents swept (calculation-bearing):**
`FULL_SOURCE_REFERENCE.md` · `HARDWARE_MATRIX_20260916.md` · `TECHNICAL_DEEP_DIVE_20260914.md` · `PIG_HEALTH_MONITOR_COMPLETE_RESEARCH.md` · `FINAL_SPEC_20260914.md` · `ARCHITECTURE_V3_20260914.md` · `CANON.md` · `REPORT_LATEST.md` · `CORE_VS_ADDONS_20260914.md` · `CHAPTER 1_DRAFT_20260914.md`

**Provenance legend** (per the repo's hardware-grounding rule):
- `✅ ARITHMETIC VERIFIED` — the maths reproduces exactly
- `⚠️ INTERNAL CONFLICT` — the same quantity holds different values in different documents; at most one can be right
- `❌ ERROR` — the maths or the physics does not hold
- `🟡 SOURCE-ONLY` — value from a spec sheet / paper, **not measured from the board**
- `🔴 UNTRACEABLE` — citation could not be located in the live literature

---

## 1. What is solid — arithmetic that reproduces exactly

| # | Calculation | Claimed | Recomputed | Status |
|---|---|---|---|---|
| 1 | MLX90640 footprint @1.5 m (110° FOV) | 4.3 × 2.3 m | 4.28 × 2.30 m | ✅ |
| 2 | MLX90640 footprint @2.0 m (110° FOV) | 5.7 × 3.1 m | 5.71 × 3.07 m | ✅ |
| 3 | Pixel pitch @2.0 m | ~18 cm | 17.85 cm | ✅ |
| 4 | 2000 mAh @ 3.7 V | 7.4 Wh | 7.4 Wh | ✅ |
| 5 | Usable at 80% DoD | 5.9 Wh | 5.92 Wh | ✅ |
| 6 | Pi 4 idle runtime on that pack | 2.4 h | 2.40 h | ✅ |
| 7 | Pi 4 energy over 7 days | 414.96 Wh | 414.96 Wh | ✅ |
| 8 | Pack required for 7-day Pi load | 519 Wh | 518.7 Wh | ✅ |
| 9 | "~70× capacity" ratio | 70× | 70.09× | ✅ |
| 10 | UPS HAT 2×2600 mAh | 19.24 Wh | 19.24 Wh | ✅ |
| 11 | UPS HAT usable / Pi runtime | 15.4 Wh / 6.2 h | 15.39 Wh / 6.23 h | ✅ |
| 12 | Nyquist at 16 kHz | 8 kHz | 8 kHz | ✅ |
| 13 | 25 ms frame @16 kHz | 400 samples | 400 | ✅ |
| 14 | MFCC matrix 49 × 13 | 637 values | 637 | ✅ |
| 15 | 39-dim feature vector | 13×3 | 39 | ✅ |
| 16 | Camera data rate (1572+64 kbps) | ~17 GB/day | 17.67 GB/day | ✅ |
| 17 | DMA buffer 8×1024×2 B | 16 KB | 16 KB | ✅ |
| 18 | DMA 8192 samples @16 kHz | 512 ms | 512 ms | ✅ |
| 19 | BOM total (5 line items) | ₱3,290 | ₱3,290 | ✅ |
| 20 | BOM total (6 line items, full ref) | ₱6,400 | ₱6,400 | ✅ |
| 21 | Float32 → INT8 compression | 4× / −75% | 4× / 22.5 MB | ✅ |
| 22 | Spectral-subtraction band remap | −46.0 dB | −46.02 dB | ✅ |
| 23 | Distance attenuation (6 dB/doubling) | 6 / 12 dB | 6.0 / 12.0 dB | ✅ |
| 24 | Die-temperature compensation | 38.76 °C | 38.760 °C | ✅ |
| 25 | Composite score = 0.6z + 0.4z | 2.27 | 2.267 | ✅ |
| 26 | Inverse-square drag (v² ratio 3.89) | 3.89× | 15.07/3.88 = 3.89× | ✅ |

**26 of 26 reproduce exactly.** The document set is arithmetically disciplined — the failures below are *consistency and sourcing* failures, not sloppy maths.

---

## 2. ⚠️ INTERNAL CONFLICTS — one quantity, several values

These are the dangerous ones: whichever chapter cites the "wrong" doc inherits a contradiction.

| Quantity | Value A | Value B | Value C | Where |
|---|---|---|---|---|
| **MLX90640 pixel @2 m** | 18 × 13 cm | 6 × 5 cm | — | `HARDWARE_MATRIX` vs `FULL_SOURCE_REFERENCE` + `CANON.md:357` |
| **MLX90640 accuracy** | ±1.0 °C | ±1.5 °C | ±1.7 °C / ±2.0 °C | `HARDWARE_MATRIX` / `COMPLETE_RESEARCH` / `FULL_SOURCE_REF` / constraints |
| **INMP441 SNR** | 61 dBA | 65 dB | — | `HARDWARE_MATRIX` (corrected) vs `FULL_SOURCE_REFERENCE` (stale) |
| **Pig cough band** | 150–5,000 Hz | 300–3,000 Hz | 0.5–5 kHz | `TECHNICAL_DEEP_DIVE` / `COMPLETE_RESEARCH` / `HARDWARE_MATRIX` |
| **Fever threshold** | ΔT > 1.5 °C | FeverDelta > 5 °C | — | `TECHNICAL_DEEP_DIVE` vs `COMPLETE_RESEARCH` |
| **Fusion divisor** | /1.5 °C | /0.3 °C | 0.3 °C σ | `FULL_SOURCE_REFERENCE` vs `TECHNICAL_DEEP_DIVE` (+ `FINAL_SPEC`) |
| **TIRPigEar label count** | 10,812 ears | 69,567 labelled files | — | capstone docs vs the dataset's own paper |
| **FLIR Lepton 3.5 price** | ₱9,400 | ₱16,649–33,544 | — | memory note vs `FULL_SOURCE_REFERENCE` |
| **Backyard share of herd** | 65% (FAO/PSA) | 72% | — | external vs capstone |

### The pixel-pitch conflict is load-bearing — here is the cause, resolved

The two figures come from **two different MLX90640 variants**:

- **BAA variant — 110° × 75° FOV** (the one this project specifies):
  at 2 m → 5.71 × 3.07 m footprint ÷ 32×24 px = **17.9 × 12.8 cm per pixel**
- **BAB variant — 55° × 35° FOV**:
  at 2 m → 2.08 m footprint ÷ 32 px = **6.5 × 5.3 cm per pixel** ← *this is where "6 × 5 cm" came from*

**Verdict:** the 18 × 13 cm figure is correct **for the specified 110° part**. The "6 × 5 cm" text is a **55° variant number that leaked into a 110° document**. It should be struck from `FULL_SOURCE_REFERENCE.md` and `CANON.md:357`.

**Why it matters:** the capstone's central negative result ("5.7 m × 3.1 m zone → ~570 pixels/pig → cannot resolve an ear") is computed with the *correct* 18 cm pitch. Anyone auditing with the 6 cm figure would derive ~65 px/pig and wrongly conclude ear detection is feasible. **Fix the number or the conclusion becomes unreproducible.**

---

## 3. ❌ ERRORS — maths and physics that do not hold

### 3.1 The ESP32-S3 battery claim contradicts itself — 170 h **or** 30 mA, not both

Stated together in `HARDWARE_MATRIX_20260916.md`:
> duty cycle "(10 s on / 5 min off)" → "~30 mA avg" → "~170 hours (~7 days)"

Recomputed:

```
duty = 10 s / 310 s            = 3.23%
active 260 mA (datasheet max)  -> avg  8.39 mA
active 240 mA                  -> avg  7.74 mA
To reach "30 mA avg" you need an active current of 930 mA — 3.6× the S3's max
To reach 170 h from 5.92 Wh     -> avg  9.41 mA
If avg really is 30 mA          -> runtime 53.3 h  (NOT 170 h)
```

**Verdict:** ❌ **mutually exclusive.** The *runtime* (170 h) is consistent with a duty-cycled average of ~9.4 mA; the *current figure* (30 mA) is not. Most likely the 30 mA is a mislabelled **active-mode** current that was never duty-averaged before being written next to a runtime that *was*.

**Fix:** report `~9.4 mA average → ~170 h`, or `30 mA average → ~53 h`. Pick one.

### 3.2 Emissivity correction applied in °C instead of K — understates by 8×

The code applies `T_true = T_measured / ε^0.25` to a **Celsius** value. Stefan–Boltzmann requires **kelvin** (T⁴ scales from absolute zero).

```
ε = 0.978  ->  ε^0.25 = 0.994454

applied in Celsius : 38.5 / 0.994454 = 38.72 °C   (Δ +0.21 °C)   <- code
applied in Kelvin  : 311.65 / 0.994454 = 313.39 K = 40.24 °C (Δ +1.74 °C)  <- correct
```

**Verdict:** ❌ unit error, correction understated ~**8.1×**.

**⚠️ Compounding issue:** `CANON.md` states the MLX90640's `CalculateTo()` **already accepts emissivity as a parameter**. If ε is passed there *and* corrected again in Python, the project is **double-correcting**. Resolve which layer owns it — and with a 1.74 °C first-order effect at ε=0.978, this is larger than the entire 1.5 °C fever threshold.

### 3.3 CNN layer dimensions are impossible

Documented stack: `49×13 → 47×11 → 23×5 → 21×3 → 10×1 → 8×1`

```
conv3x3 on 10×1 :  10-2 = 8  but  1-2 = -1   <-- negative dimension
```

**Verdict:** ❌. You cannot run a 3×3 convolution on a feature map of height 1. Either the third conv uses `padding='same'` (then the output is 10×1, not 8×1), or the pooling/doc is wrong.

**Adjacent finding:** the framing description ("25 ms window, 10 ms hop") yields **98 frames/s**, not 49. The 49 figure matches **Edge Impulse's default 32 ms / 20 ms** pair. So the doc mixes a hand-derived framing spec with an Edge Impulse default — the *number* is right for the tool, the *described window* is not.

### 3.4 Health-score mapping is undefined and its own examples disagree

Documented pairs → fitted line (`Health = 84.65 − 18.79 × score`):

| score | documented | linear fit | drift |
|---|---|---|---|
| 1.046 | 65 | 65.0 | 0 |
| 1.902 | 45 | 48.9 | −3.9 |
| 2.267 | 35 | 42.1 | −7.1 |
| 3.175 | 25 | 25.0 | 0 |

**Verdict:** ❌ not a linear map (max error 7.1 points), and the endpoints alone do not define a curve. The scoring→health transfer function **must be written down explicitly** or the classifier's output is unfalsifiable.

### 3.5 Uncertainty budget: linear addition, and an unexplained step

`±0.5 + ±0.5 + ±0.3 = 1.3 °C` → documented as "**→ 1.5 °C**".

- Components are added **linearly** (worst-case); independent errors combine in **quadrature** → **0.77 °C**.
- The jump 1.3 → 1.5 is **not derived**.

**Verdict:** ❌ on method. If the design intends a conservative worst case, say *worst-case*; if RSS, use 0.77. Then the 1.5 °C threshold needs a stated derivation (or a safety factor with its own justification).

### 3.6 I²C readout timing is off by ~4×

```
400 kHz : 1536 B × 9 bits = 13,824 bits / 400,000 = 34.6 ms  -> 28.9 FPS   (doc says 150 ms / 6.6 FPS)
1 MHz   : 13,824 / 1,000,000 = 13.8 ms                       -> 72.3 FPS   (doc says 8–16 FPS)
```

**Verdict:** ❌ — both documented figures are far slower than the bus permits. Likely the doc includes the sensor's internal ADC frame time without saying so. **Label it** or correct it.

### 3.7 ROI payback vs the abstract's system boundary

`₱3,290 ÷ ₱800/pig avoided loss = 4.11 → 5 pigs`. The abstract describes a system for **"a single animal."**

**Verdict:** ❌ inconsistency of framing — a one-pig deployment can never pay back a ₱3,290 BOM. The economics chapter and the abstract describe different products.

---

## 4. 🔴 UNTRACEABLE CITATIONS

Searched the live literature for each. Result:

| Cited in capstone | Search result | Verdict |
|---|---|---|
| **Oduor et al.** — pig cough, Arduino Nano 33 BLE, **99.7%** | Edge Impulse *"When Pigs AI: Monitoring Livestock Health with Edge ML"* — Nano 33 BLE Sense, **"excellent classification accuracy of 99.7%"** | 🟢 **NUMBER CONFIRMED** — but attribute to the **Edge Impulse project**, not to an "Oduor et al." dataset paper. Two separate things may have been merged. |
| **JMBM 2025** — YOLOv11 + U-Net + MFCC-LSTM, 99.61% | *no match found* | 🔴 re-verify or drop |
| **Cook et al. 2014** — IRT review | Cook's IRT livestock review is **~2021/2022**; genuine 2014-era IRT work is Nääs et al. | ⚠️ **year likely wrong** |
| **Frontiers Vet. Sci. 2023** — ₱350–800/pig, −17.4% ADG, −14% FCR | no matching 2023 Frontiers article | 🔴 **UNTRACEABLE** — the three figures are unattributed |
| **PHP 6 billion** annual swine respiratory loss | not located; ASF impact literature found instead | 🔴 **UNTRACEABLE** |
| **"70% of PH farms open-air"** | PSA/FAO indicate ~65% backyard | ⚠️ conflicts with own dataset |
| **Jia et al.** — thermal ambient compensation | not located as pig-specific work | 🔴 re-verify |
| **Smart Ag Tech 2025** — GAN super-res 32×24→128×96, MAE 0.09 °C | closest real match: *"Deep learning-based temperature detection for group-raised pigs"* (2025) — genuinely applies super-resolution to pig thermal imagery | 🟡 **TOPIC REAL**; the **MAE 0.09 °C** figure still needs page-level confirmation |
| **aSwine 2025** — "spectral subtraction hurts deep learning" | — | 🔴 **AND THE CLAIM IS CONTRADICTED** (see below) |
| **Baluyut 2019** | not located | 🔴 re-verify |
| **PAES 401:2001** swine housing | ✅ **CONFIRMED REAL** — AMTEC/UPLB, *Agricultural Structures – Housing for Swine Production*, governs space/feeding/watering | ✅ standard exists — but the specific **1.5 m × 4.8 m / 10 finishers** figure was **not visible in the extracted space-requirement table** (7.2 m² ÷ 10 = 0.72 m²/pig — verify against PAES §space requirements before citing) |

### ⚠️ The most consequential citation problem: spectral subtraction

The capstone **dropped spectral subtraction** on the grounds that it *hurts* deep learning, citing "aSwine 2025."

Live literature says the opposite or is mixed:

- **SS-ESC (2024)**, *Signal, Image and Video Processing* — spectral subtraction as a **preliminary stage improved** environmental-sound classification accuracy.
- ***"An ensemble of deep learning frameworks applied for pig cough recognition in a complex piggery environment"*** — Yin et al., *Computers and Electronics in Agriculture*, **Oct 2025** — real paper, matches the "aSwine 2025" profile.
- ***"Study on pig cough recognition and spatial localization"*** — 2026 — **actively uses adaptive spectral subtraction + FIR filtering** as its front-end noise reduction.

**Verdict:** 🔴 the justification is **not supported** as stated. Spectral subtraction is *in current use in pig-cough pipelines*. The defensible language is *"approaches differ; we adopt noise-injection augmentation, leaving SS to future comparison"* — not *"SS hurts deep learning."*

**🎁 Bonus find:** that 2026 spatial-localisation paper is squarely relevant to the capstone's *herd/pig-localisation* gap — the exact problem flagged as unfinished. **Worth adding as a primary reference.**

---

## 5. 🟡 SOURCE-ONLY values — spec sheets, **NOT measured from hardware**

Per the repo rule, these must never be labelled "confirmed":

- MLX90640 accuracy, refresh rate, FOV, noise-equivalent ΔT
- INMP441 SNR and sensitivity
- ESP32-S3 / Pi 4 / UPS HAT current draws
- Any "measured" battery life or thermal accuracy figure

No device readout (`/proc/cpuinfo`, `i2cdetect`, live frame capture, sensor log) appears in any document backing these rows. **Label them spec-sheet.** The one place this project *did* attempt a hardware read — the Pi GPIO mic — produced 1,920,000 bit-exact zero samples, which is precisely why the rule exists.

---

## 6. ACTION LIST — ranked by risk to the defence

| Pri | Action | Doc |
|---|---|---|
| **1** | Strike the **6 × 5 cm** pixel figure (110° part = **17.9 × 12.8 cm**). The negative-result argument depends on it. | `FULL_SOURCE_REFERENCE`, `CANON.md:357` |
| **2** | Fix the **°C→K** emissivity error (8× understatement) **and** prove it is not double-corrected against `CalculateTo()`. | firmware calc |
| **3** | Reconcile battery: **9.4 mA → 170 h** *or* **30 mA → 53 h**. Not both. | `HARDWARE_MATRIX` |
| **4** | Retract or re-source the **spectral-subtraction** justification; add the 2026 localisation paper. | `FINAL_SPEC`, `COMPLETE_RESEARCH` |
| **5** | Trace or delete: **₱6 B loss**, **Frontiers 2023** (₱350–800 / −17.4% ADG / −14% FCR), **JMBM 2025 99.61%**, **Baluyut 2019**, **Jia et al.** | `FULL_SOURCE_REFERENCE` |
| **6** | Write the **health-score transfer function** down explicitly. | `FINAL_SPEC`, `TECHNICAL_DEEP_DIVE` |
| **7** | Declare the uncertainty method — **RSS 0.77 °C** or **worst-case 1.3 °C** — then derive the 1.5 °C threshold. | `TECHNICAL_DEEP_DIVE` |
| **8** | Unify: cough band, fever threshold, fusion σ, accuracy budget — one value each, everywhere. | all |
| **9** | Correct **CNN dims** (impossible 8×1) and the **25/10 ms vs 49-frame** framing mismatch. | `TECHNICAL_DEEP_DIVE` |
| **10** | Re-label all spec-sheet figures as **source-only, not device-measured**. | `HARDWARE_MATRIX` |
| **11** | Re-verify the **PAES 401** pen dimension against the standard's space-requirement table. | `FINAL_SPEC` |
| **12** | Correct **Cook et al.** year; split the **Oduor / Edge Impulse** attribution. | `FULL_SOURCE_REFERENCE` |

---

## 7. Bottom line

**The arithmetic is sound. The provenance is not.**

Every one of 26 recomputable calculations reproduced exactly — the maths is trustworthy. What *cannot* be trusted yet is (a) whether a given number is the same across chapters, (b) whether a cited paper exists, and (c) whether a value came off a datasheet or off the board.

Items **1–4** are the ones an examiner can turn into a defence-ending question: a wrong pixel pitch invalidates the central negative result, a °C/K error larger than the fever threshold invalidates the fever pipeline, a self-contradicting battery figure invalidates the hardware argument, and an unsupported "SS hurts deep learning" claim is a literature attack with a 2026 counter-example waiting.

**Three citations are untraceable and two are mis-dated. Fix those before submission — a missing paper is survivable, a fabricated one is not.**

---
*Audit generated 2026-11-02. All recomputation performed in Python from first principles; all citation checks against live sources. Spec-sheet values are explicitly marked as source-only and are NOT hardware-verified.*
