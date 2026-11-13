# CALCULATION REFERENCE — Every Number, Its Formula, and Its Source
**PigPulse Capstone · 2026-11-02**
**Companion to:** `CALCULATION_SOURCE_AUDIT_20261102.md`
**Purpose:** for each quantitative claim, give (a) the formula, (b) the inputs and where each input came from, (c) the result, (d) the citation that justifies it.

---

## 0. How to read this document

**Provenance tags** — every input is tagged, because the repo's rule forbids calling a spec-sheet value "confirmed":

- `[DS]` **Datasheet** — read from the manufacturer's published datasheet this session
- `[PAPER]` **Peer-reviewed literature** — citation given, verified to exist
- `[CODE]` **Repo code** — read from the working tree
- `[DOC]` **Repo document** — asserted in a capstone document, not independently sourced
- `[MEASURED]` **Device readout** — read off real hardware this session
- `[DERIVED]` — arithmetic on the above

⚠️ **A value tagged `[DOC]` is not evidence.** It is the claim under test.

---

## 1. Hardware grounding status — what is actually connected

Read live this session, 2026-11-02. Reported plainly, per the hardware-fact rule:

| Check | Method | Result |
|---|---|---|
| Raspberry Pi edge node reachable | `ping 192.168.69.1` | ✅ **2/2 packets, 5.5 ms avg** `[MEASURED]` |
| Pi SSH access | `ssh solrahk@192.168.69.1` | ❌ **Permission denied (publickey,password)** — no laptop key is authorised. Tried `solrahk`, `pi`, `root`, `admin`; all denied. |
| Pi I²C / MLX90640 register read | `i2cdetect -y 1` over SSH | ⛔ **NOT OBTAINED** — blocked by the SSH failure above |
| ESP32-S3 attached to laptop | `ls /dev/ttyUSB* /dev/ttyACM*` | ❌ **No device** — the S3 is not cabled to this laptop |
| Laptop MQTT broker | `systemctl is-active mosquitto` | ❌ `inactive` |
| `pigpulse-bridge` | `systemctl is-active` | ✅ `active` |
| `openresty` | `systemctl is-active` | ✅ `active` |
| `pocketbase` | `systemctl is-active` | ❌ `inactive` |
| Laptop thermal zones | `/sys/class/thermal/thermal_zone*/temp` | **51.0 °C · 20.0 °C · 49.1 °C · 61.0 °C** `[MEASURED]` |
| RAM / swap | `free -h` | **1.4 GiB available · 5.3 GiB swap used** `[MEASURED]` |

### 🔴 The honest headline

> **No MLX90640 readout was obtained this session.** The Pi answers ping, but SSH public-key auth is refused, so `i2cdetect` could not run. The ESP32-S3 is not attached to the laptop at all.
>
> **Therefore every thermal and audio number in this document is `[DS]` or `[PAPER]` — datasheet or literature — and NONE is hardware-verified.** Do not write "confirmed" next to any of them.

**To close this gap** (three commands, once a key is authorised on the Pi):
```bash
i2cdetect -y 1                 # expect 0x33 = MLX90640
i2cget -y 1 0x33 0x2400 w      # first pixel of RAM
vcgencmd measure_temp          # Pi SoC temp
```
Until those run, the thermal pipeline is **spec-sheet-only**.

---

## 2. Datasheet ground truth (grounded this session)

Read from the Melexis MLX90640 datasheet, §12. `[DS]`
Source: `https://www.melexis.com/-/media/files/documents/datasheets/mlx90640-datasheet-melexis.pdf`

**§12.1.1 — the two conditions that invalidate casual accuracy claims:**

> *"All accuracy specifications apply under settled isothermal conditions only."*
> *"Furthermore, the accuracy is only valid if the object fills the FOV of the sensor completely."*

**§12.1.1 — accuracy table (rows as published):**

| Frame accuracy | Non-uniformity | Note |
|---|---|---|
| ± 1 °C | NU zone1 ± 0.5 °C · zone2 ± 1 °C · zone3 ± 2 °C · ± 2 %·\|To−Ta\| | tighter device row |
| ± 2 °C | NU zone1 ± 1 °C · zone2 ± 2 °C · zone3 ± 3 °C · ± 2 %·\|To−Ta\| | wider device row |
| ± 5 °C | ± 2 %·\|To−Ta\| | reduced-performance case |

**§12.1.1 Note 2 — long-term drift:**
> *"As a result of long term (years) drift there can be an additional measurement deviation of ± 3 °C for object temperatures around room temperature."*

**§12.1.2 — Ta channel:**
> *"NOTE: Actual sensor surrounding temperature would be approximately 8 °C lower"*

**§12.3 — noise:** NETD **0.1 K RMS @ 1 Hz**

**§12.4 / Table 15 — FOV options, exactly as printed (and independently confirmed by Waveshare, SparkFun, joyllon, smart-bes):**

| Part | FOV X (typ) | FOV Y (typ) | Max central offset |
|---|---|---|---|
| **MLX90640-ESF-BAA** | **110°** | **75°** | 5° |
| MLX90640-ESF-BAB | 55° | 35° | 3° |

> ⚠️ **BAA is the 110° wide part.** The common assumption that "BAB is the wide one" is **wrong** — verified against the datasheet table plus four vendor listings. The project's specified part (110° × 75°) is therefore **MLX90640BAA**, sold as *MLX90640-D110*.

**Other datasheet figures** `[DS]`: supply 3.3 V · current **< 23 mA** · refresh 0.5–64 Hz · operating −40…+85 °C

---

## 3. Calculation-by-calculation reference

---

### A. OPTICAL GEOMETRY

The governing relation for a pinhole-equivalent FOV projection:

```
W = 2 · d · tan(θ / 2)          footprint width at distance d
pitch_x = W / 32                per-pixel spacing (32 columns)
pitch_y = H / 24                per-pixel spacing (24 rows)
```

Half-angles for the specified **110° × 75° (BAA)** part: X → 55°, Y → 37.5°.

---

#### CALC 1 — MLX90640 footprint at 1.5 m

| | |
|---|---|
| **Formula** | `W = 2·d·tan(θ/2)` |
| **Inputs** | d = 1.5 m `[DOC]` · θx = 110° `[DS]` · θy = 75° `[DS]` |
| **Work** | X: 2·1.5·tan(55°) = 2·1.5·1.42815 = **4.284 m**<br>Y: 2·1.5·tan(37.5°) = 2·1.5·0.76733 = **2.302 m** |
| **Result** | **4.28 × 2.30 m** (doc claimed 4.3 × 2.3) |
| **Status** | ✅ reproduces |

#### CALC 2 — MLX90640 footprint at 2.0 m

| | |
|---|---|
| **Formula** | as CALC 1, d = 2.0 |
| **Work** | X: 2·2.0·1.42815 = **5.713 m**<br>Y: 2·2.0·0.76733 = **3.069 m** |
| **Result** | **5.71 × 3.07 m** (doc claimed 5.7 × 3.1) |
| **Status** | ✅ reproduces |

#### CALC 3 — Per-pixel pitch at 2.0 m ⭐ *load-bearing*

| | |
|---|---|
| **Formula** | `pitch = W / n_cols` ; `pitch = H / n_rows` |
| **Inputs** | CALC 2 · 32 cols / 24 rows `[DS]` |
| **Work** | X: 5.713 / 32 = 0.17853 m = **17.85 cm**<br>Y: 3.069 / 24 = 0.12788 m = **12.79 cm** |
| **Result** | **17.9 × 12.8 cm per pixel** |
| **Status** | ✅ reproduces — and this is the figure the negative result depends on |

**Why this matters (the defect):** `FULL_SOURCE_REFERENCE.md` and `CANON.md:357` state **"~6 × 5 cm per pixel at 2 m."** That number is real — but it belongs to the **BAB (55° × 35°)** part:

```
BAB at 2.0 m:  X: 2·2·tan(27.5°) = 2.082 m / 32 = 6.51 cm
               Y: 2·2·tan(17.5°) = 1.261 m / 24 = 5.25 cm   → 6.5 × 5.3 cm ✓
```

**A 55°-variant number leaked into a 110°-variant document.** Someone auditing with 6 cm derives ≈65 px/pig and wrongly concludes ear detection is feasible — the *opposite* of the capstone's conclusion. **Strike it.**

**Source:** Melexis MLX90640 datasheet §12.4 Table 15 `[DS]`. Geometry is standard small-angle projection.

---

### B. RADIOMETRY & THERMAL ACCURACY

#### CALC 24 — Die-temperature (Ta) compensation

| | |
|---|---|
| **Formula** | `To = f(Ta, ε, T_refl, …)` — object temperature recovered from die temperature and per-pixel raw value |
| **Inputs** | Ta channel · Ta shift = **8.0 K** `[CODE]` `radiometry.py: DEFAULT_TA_SHIFT = 8.0` |
| **Result** | **38.76 °C** (claimed) |
| **Status** | ✅ reproduces |
| **Source** | 🟢 **Datasheet §12.1.2 — "Actual sensor surrounding temperature would be approximately 8 °C lower."** The 8 K shift in the code is **datasheet-grounded, not invented.** |

#### Emissivity correction — ⚠️ DEFECT (applied in °C, must be K)

| | |
|---|---|
| **Formula** | Stefan–Boltzmann with non-unity emissivity: `T_true = T_meas · ε^(−1/4)` — **T in kelvin** |
| **Inputs** | ε = **0.978** `[PAPER]` Soerensen et al. 2014 (pig skin emissivity) · T_meas = 38.5 °C |
| **Work — as coded (°C)** | 38.5 / 0.978^0.25 = 38.5 / 0.994454 = **38.72 °C** → Δ **+0.21 °C** |
| **Work — correct (K)** | 311.65 K / 0.994454 = 313.39 K = **40.24 °C** → Δ **+1.74 °C** |
| **Verdict** | ❌ **understated ≈8.1×** |
| **Source** | ε: **Soerensen, D.D., Clausen, S., Mercer, J.B., Keita, L.O. (2014)** *"Determining the emissivity of pig skin for accurate infrared thermography"*, **Computers and Electronics in Agriculture 109:112–118**, doi:10.1016/j.compag.2014.09.003 `[PAPER verified]`<br>Exponent: MDPI **Sensors 14(7):12305 (2014)**, doi:10.3390/s140712305, Eq. (16) `[PAPER verified]` |

**⚠️ Compounding risk — double-correction.** `CANON.md` states the MLX90640's `CalculateTo()` **already takes emissivity as a parameter.** Passing ε there *and* correcting again in Python double-applies it. With a **1.74 °C** first-order effect at ε = 0.978 — **larger than the entire 1.5 °C fever threshold** — this is defence-critical. Fix the unit **and** prove only one layer corrects.

#### Thermal accuracy budget — ⚠️ INTERNAL CONFLICT + method error

| | |
|---|---|
| **Claimed A** | ±1.0 °C `HARDWARE_MATRIX` |
| **Claimed B** | ±1.5 °C `COMPLETE_RESEARCH` |
| **Claimed C** | ±1.7 °C / ±2.0 °C `FULL_SOURCE_REFERENCE`, constraints |
| **Datasheet** | Frame accuracy **±1 °C or ±2 °C** by device type; NU **±0.5/±1/±2 °C** (zone 1/2/3) **±2 %·\|To−Ta\|**; **±3 °C long-term drift**; Ta note **8 °C** `[DS]` |
| **Budget as built** | ±0.5 + ±0.5 + ±0.3 = 1.3 °C, documented "→ **1.5 °C**" |
| **Quadrature** | √(0.5² + 0.5² + 0.3²) = **0.77 °C** |

**Verdict:** ❌ on **method** and ⚠️ on **consistency**.

1. Components are **added linearly** (worst-case) but never labelled worst-case; independent errors combine in **quadrature → 0.77 °C**.
2. The jump **1.3 → 1.5 is not derived.**
3. 🔴 **The two datasheet conditions both fail in the pen scenario:** accuracy is valid only *"under settled isothermal conditions"* and only *"if the object fills the FOV completely."* At 2 m a pig occupies a **fraction** of a 5.7 × 3.1 m footprint. **Absolute accuracy claims are out of spec.**
4. **±3 °C long-term drift** is larger than the 1.5 °C threshold — survivable **only** if the pipeline is *relative to a re-referenced baseline*, never absolute.

> ✅ **The design is methodologically right for the wrong stated reason.** Baseline-relative / zone-differential thresholding is precisely the approach that cancels frame accuracy and long-term drift. Say *that* — and cite the datasheet rows — instead of quoting a bare ±1.0 or ±1.5 °C.

**Source:** Melexis datasheet §12.1.1–12.1.2 `[DS]`; Jia et al. `[DOC]` — see source register for its status.

---

### C. POWER & ENERGY

#### CALC 4 — Pack energy

| | |
|---|---|
| **Formula** | `E = V · Q` | 
| **Inputs** | 3.7 V · 2000 mAh `[DOC]` |
| **Work** | 3.7 × 2.0 Ah = **7.4 Wh** |
| **Status** | ✅ |

#### CALC 5 — Usable energy at 80 % depth of discharge

| | |
|---|---|
| **Formula** | `E_usable = E · DoD` |
| **Work** | 7.4 × 0.80 = **5.92 Wh** |
| **Status** | ✅ (doc claimed 5.9) |

#### CALC 6 — Pi 4 idle runtime on that pack

| | |
|---|---|
| **Formula** | `t = E_usable / P_idle` |
| **Implied input** | P_idle = 5.92 / 2.4 = **2.47 W** ← *this is an assumption, state it* |
| **Result** | **2.40 h** |
| **Status** | ✅ arithmetic; ⚠️ the 2.47 W idle figure is `[DOC]`, **not measured** |
| **Source** | Pi 4 idle is commonly quoted ~2.5–3.0 W; **must be measured with a USB power meter** to be citable |

#### CALC 7 — Pi 4 energy over 7 days

| | |
|---|---|
| **Formula** | `E = P · t` |
| **Work** | 2.47 W × 168 h = **414.96 Wh** |
| **Status** | ✅ |

#### CALC 8 — Pack required for a 7-day Pi load

| | |
|---|---|
| **Formula** | `E_pack = E_7d / DoD` |
| **Work** | 414.96 / 0.80 = **518.7 Wh** |
| **Equivalent** | 518.7 / 3.7 V = 140.2 Ah = **≈140,000 mAh** |
| **Status** | ✅ |

#### CALC 9 — The "~70× capacity" ratio

| | |
|---|---|
| **Formula** | `ratio = E_required / E_pack` |
| **Work** | 518.7 / 7.4 = **70.09×** |
| **Status** | ✅ |

#### CALC 10 — UPS HAT capacity

| | |
|---|---|
| **Formula** | `E = V · (Q₁ + Q₂)` |
| **Work** | 3.7 × (2 × 2600 mAh) = 3.7 × 5.2 = **19.24 Wh** |
| **Status** | ✅ |

#### CALC 11 — UPS usable energy and Pi runtime

| | |
|---|---|
| **Work** | 19.24 × 0.80 = **15.39 Wh** ; 15.39 / 2.47 = **6.23 h** |
| **Doc claimed** | 15.4 Wh / 6.2 h |
| **Status** | ✅ |

#### CALC — ESP32-S3 battery claim — ⚠️ SELF-CONTRADICTING

`HARDWARE_MATRIX_20260916.md` states together: duty cycle *(10 s on / 5 min off)* → **~30 mA avg** → **~170 hours**.

```
duty = 10 / 310                                   = 3.23 %
active 260 mA (S3 datasheet max) → 260 × 0.0323    =   8.39 mA avg
active 240 mA                    → 240 × 0.0323    =   7.74 mA avg
To average 30 mA you need active = 930 mA  → 3.6× the S3's rated maximum. Impossible.
170 h from 5.92 Wh               → 5.92 / 170      =   9.41 mA avg   ✓ consistent
30 mA average                    → 5.92 / 0.030    =  53.3 h         ✗ NOT 170 h
```

**Verdict:** ❌ **mutually exclusive.** 170 h implies **9.4 mA** average. 30 mA implies **53 h**. The 30 mA is almost certainly a mislabelled **active-mode** current never duty-averaged before being placed beside a runtime that *was*.

**Fix:** publish `~9.4 mA avg → ~170 h` **or** `30 mA avg → ~53 h`. Pick one.

#### CALC — MLX90640 supply current (add this)

| | |
|---|---|
| **Input** | **< 23 mA** `[DS]` §— |
| **Use** | The single largest always-on consumer in the edge node; add it to the duty-cycle table explicitly |

---

### D. AUDIO DSP & FEATURE EXTRACTION

#### CALC 12 — Nyquist frequency

| | |
|---|---|
| **Formula** | `f_Nyquist = f_s / 2` |
| **Work** | 16,000 / 2 = **8,000 Hz** |
| **Status** | ✅ |

#### CALC 13 — Samples in a 25 ms frame

| | |
|---|---|
| **Formula** | `n = f_s · t` |
| **Work** | 16,000 × 0.025 = **400 samples** |
| **Status** | ✅ |

#### CALC 14 — MFCC coefficient matrix

| | |
|---|---|
| **Formula** | `n = frames × coefficients` |
| **Work** | 49 × 13 = **637 values** |
| **Status** | ✅ |

#### CALC 15 — Cepstral feature vector dimension

| | |
|---|---|
| **Formula** | `13 coefficients × [static, Δ, ΔΔ]` |
| **Work** | 13 × 3 = **39** |
| **Status** | ✅ |

#### CALC 17 — I²S DMA buffer size

| | |
|---|---|
| **Formula** | `bytes = descriptors × samples × bytes_per_sample` |
| **Work** | 8 × 1024 × 2 = **16,384 B = 16 KB** |
| **Status** | ✅ |

#### CALC 18 — DMA buffer duration

| | |
|---|---|
| **Formula** | `t = n / f_s` |
| **Work** | 8192 / 16,000 = 0.512 s = **512 ms** |
| **Status** | ✅ |

#### CALC — CNN layer dimensions — ❌ IMPOSSIBLE

Documented stack: `49×13 → 47×11 → 23×5 → 21×3 → 10×1 → 8×1`

```
conv3×3 on a 10×1 map:   width  10 − 2 =  8   ✓
                         height  1 − 2 = −1   ✗ NEGATIVE DIMENSION
```

**Verdict:** ❌. You cannot convolve 3×3 over height 1. Either the third conv uses `padding='same'` (output stays 10×1, not 8×1) or the diagram is wrong.

#### CALC — Framing: window/hop vs frame count — ⚠️ MIXED PROVENANCE

```
stated 25 ms window, 10 ms hop  →  1 / 0.010  = 100 windows/s  (98 after edge trimming)
stated 49 frames/s              →  1 / 0.049  =  20.4 ms hop
```

**Verdict:** the **49** figure matches **Edge Impulse's default 32 ms / 20 ms** pair, not the described 25/10 ms. The *number* is right for the tool; the *described window* is not. **Say "Edge Impulse default 32 ms/20 ms → 49 frames."**

**Source:** Edge Impulse DSP defaults `[CODE/tool doc]`.

---

### E. DATA RATES

#### CALC 16 — Camera data rate

| | |
|---|---|
| **Formula** | `bytes/day = (bitrate_up + bitrate_down) · 86400 / 8` |
| **Inputs** | 1572 kbps + 64 kbps `[DOC]` |
| **Work** | (1572 + 64) × 1000 × 86,400 / 8 = **17.67 GB/day** |
| **Status** | ✅ |
| **Source** | `[DOC]` — the 1572/64 kbps pair needs a datasheet or measurement citation |

---

### F. COST & ECONOMICS

#### CALC 19 — BOM, 5 line items

| | |
|---|---|
| **Work** | Sum of 5 listed unit prices = **₱3,290** |
| **Status** | ✅ arithmetic |

#### CALC 20 — BOM, 6 line items (full reference)

| | |
|---|---|
| **Work** | Sum = **₱6,400** |
| **Status** | ✅ arithmetic; ⚠️ **two BOM totals coexist — pick one and reconcile** |

#### CALC — ROI payback — ❌ FRAMING INCONSISTENCY

| | |
|---|---|
| **Work** | ₱3,290 ÷ ₱800/pig avoided loss = 4.11 → **"5 pigs"** |
| **Verdict** | ❌ The abstract describes a system for **"a single animal."** A one-pig deployment can never pay back a ₱3,290 BOM. The economics chapter and the abstract describe **different products.** |
| **Bonus problem** | The **₱800/pig** input is `[DOC]` and traces to the **untraceable "Frontiers Vet. Sci. 2023"** citation |

---

### G. MODEL COMPRESSION

#### CALC 21 — Float32 → INT8

| | |
|---|---|
| **Formula** | `bytes_int8 = bytes_fp32 / 4` (32-bit → 8-bit) |
| **Work** | 90 MB / 4 = **22.5 MB** → **4×**, **−75 %** |
| **Status** | ✅ |
| **Note** | ⚠️ 22.5 MB **does not fit** in a small on-chip tensor arena; needs PSRAM or external flash. Confirm against the actual arena budget. |

---

### H. SIGNAL-PROCESSING CLAIMS

#### CALC 22 — Spectral-subtraction band remap

| | |
|---|---|
| **Formula** | `ΔdB = 20 · log₁₀(A₂/A₁)` |
| **Result** | **−46.02 dB** |
| **Status** | ✅ arithmetic — but see the **citation defect** in §4 |

#### CALC 23 — Distance attenuation

| | |
|---|---|
| **Formula** | inverse-square: `ΔdB = 20 · log₁₀(d₂/d₁)` |
| **Work** | doubling: 20·log₁₀(2) = **6.02 dB** ; ×4: **12.04 dB** |
| **Status** | ✅ |
| **Note** | ⚠️ Valid in **free field**. In a reverberant barn, near-field and reflection change this — cite as an *idealised* model. |

#### CALC 26 — Inverse-square drag / v² ratio

| | |
|---|---|
| **Work** | 15.07 / 3.88 = **3.88 → 3.89×** |
| **Status** | ✅ |

---

### I. SENSOR FUSION

#### CALC 25 — Composite fusion score

| | |
|---|---|
| **Formula** | `score = w_thermal · z_thermal + w_audio · z_audio` (0.6 / 0.4) |
| **Result** | **2.267** (doc claimed 2.27) |
| **Status** | ✅ |
| **Problem** | ⚠️ the **divisor** is inconsistent: `/1.5 °C` in `FULL_SOURCE_REFERENCE` vs `/0.3 °C` in `TECHNICAL_DEEP_DIVE`; `FINAL_SPEC` uses σ = 0.3 °C. **One value, one place.** |

#### Health-score mapping — ❌ UNDEFINED

Documented pairs → fitted line `Health = 84.65 − 18.79 · score`:

| score | documented | linear fit | drift |
|---|---|---|---|
| 1.046 | 65 | 65.0 | 0 |
| 1.902 | 45 | 48.9 | **−3.9** |
| 2.267 | 35 | 42.1 | **−7.1** |
| 3.175 | 25 | 25.0 | 0 |

**Verdict:** ❌ **not linear** (max error 7.1 points) and endpoints alone don't define a curve. **Write the transfer function down explicitly** or the classifier's output is unfalsifiable.

---

## 4. Citation status — what is real, what is not

| Citation | Verified against | Status |
|---|---|---|
| **Soerensen et al. 2014**, Comput. Electron. Agric. 109:112–118 | doi:10.1016/j.compag.2014.09.003 | 🟢 **REAL** |
| **MDPI Sensors 14(7):12305 (2014)**, Eq. (16) | doi:10.3390/s140712305 | 🟢 **REAL** |
| **Jiao et al. 2022**, Front. Phys. **10:893131** | doi:10.3389/fphy.2022.893131 | 🟢 **REAL** |
| **Chae et al. 2024**, Sensors **24(22):7232** | doi:10.3390/s24227232 | 🟢 **REAL** |
| **PAES 401:2001**, AMTEC/UPLB, *Housing for Swine Production* | amtec.uplb.edu.ph/wp-content/uploads/2019/07/401.pdf | 🟢 **STANDARD REAL** — but the **1.5 × 4.8 m / 10 finishers** figure was **not found** in the space table. Re-verify against §space requirements. |
| **Edge Impulse, "When Pigs AI: Monitoring Livestock Health with Edge ML"** | edgeimpulse.com project write-up | 🟢 **REAL — 99.7 % is THIS project**, not "Oduor et al." Split the attribution. |
| **Yin et al., Oct 2025**, *Computers and Electronics in Agriculture* — pig-cough ensemble | journal listing | 🟢 **REAL** — matches the "aSwine 2025" profile |
| **"Pig cough recognition and spatial localization" (2026)** | current literature | 🟢 **REAL — uses adaptive spectral subtraction + FIR + KL-NMF.** Directly relevant to the herd-localisation gap. **Add as a primary reference.** |
| **SS-ESC (2024)**, *Signal, Image and Video Processing* | journal listing | 🟢 **REAL** — spectral subtraction as a preliminary stage **improved** classification |
| **MLX90640 datasheet** | melexis.com | 🟢 **REAL** — read this session |
| "**JMBM 2025**" — 99.61 % | live literature | 🔴 **UNTRACEABLE** |
| "**Frontiers Vet. Sci. 2023**" — ₱350–800/pig, −17.4 % ADG, −14 % FCR | live literature | 🔴 **UNTRACEABLE** |
| "**PHP 6 billion**" annual swine respiratory loss | live literature | 🔴 **UNTRACEABLE** |
| "**Baluyut 2019**" | live literature | 🔴 **UNTRACEABLE** |
| "**Cook et al. 2014**" IRT review | real IRT reviews are ~2021/22 | ⚠️ **YEAR LIKELY WRONG** — 2014-era IRT work is Nääs et al. |
| "**aSwine 2025** — SS hurts deep learning" | contradicted by SS-ESC 2024 **and** the 2026 localisation paper | 🔴 **CLAIM CONTRADICTED** |
| "**Smart Ag Tech 2025**" — GAN super-res MAE 0.09 °C | topic matches *"Deep learning-based temperature detection for group-raised pigs"* (2025) | 🟡 **TOPIC REAL**; the **MAE 0.09 °C** needs page-level confirmation |
| "**Jia et al.**" thermal ambient compensation | not located as pig-specific work | 🔴 **RE-VERIFY** |
| "**70 %** of PH farms open-air" | PSA/FAO indicate **~65 % backyard** | ⚠️ conflicts with the project's own dataset |

> 🔴 **The single most consequential citation problem.** The capstone **dropped spectral subtraction** because it supposedly "hurts deep learning." Live literature says the **opposite or is mixed**: SS-ESC 2024 found it **improves** environmental-sound classification, and the 2026 pig-cough localisation paper **actively uses adaptive spectral subtraction**. Defensible wording: *"approaches differ; we adopt noise-injection augmentation and leave SS to future comparison"* — **not** *"SS hurts deep learning."* A 2026 counter-example is waiting for that sentence.

---

## 5. Ranked action list

| Pri | Action | Where |
|---|---|---|
| **1** | Strike **"6 × 5 cm"** → **17.9 × 12.8 cm**. The negative result depends on it. | `FULL_SOURCE_REFERENCE`, `CANON.md:357` |
| **2** | Fix the **°C→K** emissivity error (**8×** understatement) **and** prove no double-correction against `CalculateTo()`. At 1.74 °C it exceeds the whole 1.5 °C threshold. | radiometry code |
| **3** | Reconcile battery: **9.4 mA → 170 h** *or* **30 mA → 53 h**. Not both. | `HARDWARE_MATRIX` |
| **4** | Retract / re-source the **spectral-subtraction** claim; **add the 2026 localisation paper**. | `FINAL_SPEC`, `COMPLETE_RESEARCH` |
| **5** | Quote the **datasheet accuracy rows** and state the two conditions that void them (*settled isothermal*; *object fills FOV*). Argue the 1.5 °C threshold on **relative/zone-differential** grounds. | thermal chapter |
| **6** | Trace or delete: **₱6 B loss**, **Frontiers 2023**, **JMBM 2025**, **Baluyut 2019**, **Jia et al.** | `FULL_SOURCE_REFERENCE` |
| **7** | Write the **health-score transfer function** explicitly. | `FINAL_SPEC`, `TECHNICAL_DEEP_DIVE` |
| **8** | Declare the uncertainty method — **RSS 0.77 °C** or **worst-case 1.3 °C** — then derive 1.5 °C. | `TECHNICAL_DEEP_DIVE` |
| **9** | Unify cough band, fever threshold, fusion σ, accuracy budget — **one value each, everywhere**. | all |
| **10** | Correct **CNN dims** (impossible 8×1) and the **25/10 ms vs 49-frame** mismatch. | `TECHNICAL_DEEP_DIVE` |
| **11** | Reconcile the **two BOM totals** (₱3,290 vs ₱6,400) and the **ROI-vs-single-animal** contradiction. | `FINAL_SPEC`, abstract |
| **12** | Re-verify **PAES 401** pen dimensions; correct **Cook et al.** year; split **Oduor / Edge Impulse**. | `FULL_SOURCE_REFERENCE` |
| **13** | 🆕 **Authorise an SSH key on the Pi**, then run `i2cdetect -y 1` — until then every thermal value is spec-sheet-only. | hardware |

---

## 6. Bottom line

**The arithmetic is sound; the provenance is not.**

All **26** recomputable calculations reproduce exactly. What cannot yet be trusted is (a) whether a number is the same in every chapter, (b) whether a cited paper exists, and (c) whether a value came off a **datasheet** or off the **board**.

This session added one hard grounding: the **datasheet's own conditions** — accuracy holds only *under settled isothermal conditions* and only *if the object fills the FOV completely*. **In the pen scenario neither holds.** That is not a weakness to hide; it is the strongest available justification for the project's baseline-relative design — and it should be stated in those words, with the datasheet cited.

**Items 1–4 are defence-ending if left.** A wrong pixel pitch invalidates the central negative result; a °C/K error larger than the fever threshold invalidates the fever pipeline; a self-contradicting battery figure invalidates the hardware argument; and an unsupported *"SS hurts deep learning"* claim is a literature attack with a 2026 counter-example already published.

**Four citations are untraceable and one claim is contradicted. Fix those before submission — a missing paper is survivable; a fabricated one is not.**

---

*Generated 2026-11-02. Every calculation recomputed from first principles in Python. Datasheet values read from the Melexis MLX90640 datasheet this session. Citations checked against live sources. **No MLX90640 or ESP32 readout was obtained — SSH to the Pi failed and no ESP32 is attached. All hardware figures are spec-sheet/source-only, NOT device-verified.***
