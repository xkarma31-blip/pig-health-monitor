# PigPulse — Canon, Part 2: Thermal Measurement (CORRECTED)

**Version 2.0 — 2026-11-02.** This section contains the corrections that matter
most to the defence. Read it before quoting any thermal number.

---

## 1. Geometry — the load-bearing correction

The project specifies **MLX90640-ESF-BAA = 110° × 75° FOV**, 32 × 24 pixels.

Assuming a pinhole model, footprint at distance *d* is `2 · d · tan(θ/2)` per axis:

| Distance | Full footprint | Per-pixel pitch | Status |
|---|---|---|---|
| 1.5 m | 4.28 × 2.30 m | 13.4 × 9.6 cm | `[VERIFIED]` |
| 2.0 m | 5.71 × 3.07 m | **17.85 × 12.79 cm** | `[VERIFIED]` |

### `[CORRECTED]` The "6 × 5 cm per pixel at 2 m" figure is WRONG for this build

"6 × 5 cm" is the geometry of the **55° BAB** part (2.08 m footprint ÷ 32 px =
6.5 cm). A 55°-variant number leaked into a 110° document.

- **Correct value for the specified 110° part: ≈ 17.9 × 12.8 cm per pixel at 2 m.**
- It must be struck from `FULL_SOURCE_REFERENCE.md` and `CANON.md` (line ~357).

### `[VERIFIED]` The ear-ROI argument — do the geometry, don't assert it

`[CORRECTED]` An earlier working figure of "~570 pixels per pig" did **not**
reproduce and has been withdrawn: 570 px × 228.3 cm² = 13.0 m², which is a *whole
pen*, not an animal. Do not use it. The traceable computation is below.

**Assumptions (state these when you use the result):** finisher pig seen top-down
≈ 1.2 m × 0.4 m = 4,800 cm²; ear ROI ≈ 10 × 5 cm = 50 cm².

| Distance | Pixel pitch (110° part) | px per pig | Pig is | **Ear ROI is** |
|---|---|---|---|---|
| 1.0 m | 8.93 × 6.39 cm | 84 px | ~9 × 9 px | **0.88 px** |
| 1.5 m | 13.39 × 9.59 cm | 37 px | ~6 × 6 px | **0.39 px** |
| 2.0 m | 17.85 × 12.79 cm | 21 px | ~4.6 × 4.6 px | **0.22 px** |

*For comparison, the 55° part at 2 m gives 140 px/pig and an ear of **1.46 px**.*

**The negative result — stated so it survives either pitch:**

> The ear ROI is **sub-pixel at every practical distance, with either FOV variant.**
> An ear or eye temperature therefore cannot be measured — not because of a
> software or training-data limitation, but because the geometry does not exist.

This is the stronger form of the argument: it does **not** depend on which pixel
pitch you quote. **But the pitch you *state* must match the sensor you *specified*** —
asserting 6 × 5 cm while specifying the 110° part is an inconsistency an examiner
will find, and it invites the false inference that a 6 cm pitch would make ear
detection feasible when the table above shows it would not.

## 2. Accuracy — what the datasheet actually says

`[DATASHEET]`. The project documents currently carry four different values
(±1.0, ±1.5, ±1.7, ±2.0 °C). Reconcile to the datasheet:

- **Frame accuracy: ±1.0 °C** for target temperatures 0–100 °C at ~25 °C ambient;
  **±2.0 °C** outside that window.
- **Zone 1 (central ~4×4) accuracy: ±0.5 / ±1.0 °C** depending on range.
- **Long-term drift: ±3 °C.**
- **Uniformity: ±2 % of |T_object − T_ambient|.**

### Two datasheet conditions that void the headline accuracy as normally quoted

1. *"All accuracy specifications apply under settled isothermal conditions only."*
2. Accuracy is *"only valid if the object fills the FOV of the sensor completely."*

**Neither condition holds in this deployment.** At 2 m a pig occupies a *fraction*
of a 5.71 × 3.07 m footprint, and a barn is not isothermal. This is not a fatal
flaw — it is the technical justification for the design that follows.

### The design consequence — state it, don't hide it

Because absolute frame accuracy and ±3 °C long-term drift cannot be relied on,
the pipeline must use **relative / baseline-referenced screening**: compare a
**pen-level** statistic against that pen's own recent baseline rather than against
an absolute 39.5 °C figure. Baseline referencing is precisely what cancels frame
error and long-term drift. **This is a defence strength, not a weakness** — but it
must be described that way, with the datasheet conditions cited.

## 3. Emissivity — `[CORRECTED]` an order-of-magnitude unit error

Emissivity of pig skin at the ear base: **ε = 0.978** — Soerensen et al. 2014,
*Computers and Electronics in Agriculture* 109:112–118 `[PAPER, verified real]`.
The T^(1/4) correction form follows the radiometric equation in *Sensors*
14(7):12305, Eq. 16.

**The correction is `T_true = T_measured / ε^0.25`, and it requires KELVIN.**
Stefan–Boltzmann scales from absolute zero. The project applied it to a
**Celsius** value:

| Applied in | Working | Result | Error |
|---|---|---|---|
| **Celsius (as coded — wrong)** | 38.5 / 0.994454 | 38.72 °C → **+0.21 °C** | 8.1× understated |
| **Kelvin (correct)** | 311.65 / 0.994454 = 313.39 K | **40.24 °C → +1.74 °C** | — |

**+1.74 °C is larger than the entire 1.5 °C fever threshold.** The error is not
cosmetic; it can invert a fever verdict.

### ⚠️ Compounding risk — possible double correction

The MLX90640's `CalculateTo()` **already accepts emissivity as a parameter.**
If ε is passed there *and* the Python layer corrects again, the pipeline
double-corrects. **Determine which layer owns the correction, and document it.**
This must be resolved before submission.

## 4. Super-resolution — forbidden for measurement

- Thermal SR for **dashboard display** via bicubic interpolation: acceptable.
- Thermal SR used to **derive temperature**: **prohibited.**
- Rationale: **no peer-reviewed SR work exists below 80 × 64** (this sensor is
  32 × 24). RGB-guided SR demonstrably transfers visual textures — fur, shadows,
  pen markings — into the thermal image as **false temperature edges**, which is
  actively harmful to fever detection.
- A claim of GAN super-resolution 32×24 → 128×96 at MAE 0.09 °C: the *topic* is
  real (a 2025 paper genuinely applies SR to group-raised pig thermal imagery),
  but **the MAE figure is unconfirmed** `[OPEN]`.
- Thermal re-identification claims from `training_data/.edge_impulse/reid_simulator.py`
  are **disproved** — do not cite them.

## 5. Readout timing — `[CORRECTED]`

The I²C frame read is not the bottleneck the documents claim:

| Bus | Bits for a 1536-byte frame | Time | Throughput | Document said |
|---|---|---|---|---|
| 400 kHz | 13,824 | 34.6 ms | 28.9 FPS | 150 ms / 6.6 FPS |
| 1 MHz | 13,824 | 13.8 ms | 72.3 FPS | 8–16 FPS |

Both documented figures are ~4× slower than the bus permits. Most likely the
document includes the sensor's **internal ADC frame time** without labelling it.
**Label it, or correct it.** Observed in-service rate is ~2 FPS `[MEASURED]`.

## 6. Uncertainty budget — `[CORRECTED]` method error

`±0.5 + ±0.5 + ±0.3 = ±1.3 °C`, documented as "→ ±1.5 °C".

- Adding independent errors **linearly** gives a worst case of **1.3 °C**.
- Combining them **in quadrature** (root-sum-square) gives **±0.77 °C**.
- The jump from 1.3 to 1.5 is **not derived anywhere**.

**Fix:** declare the method — worst-case 1.3 °C *or* RSS 0.77 °C — then derive the
1.5 °C fever threshold from it, with its own justification if a safety factor is
applied.
