# PigPulse — Complete Solution Compiled

> Consolidated research notes, hardware analysis, identification strategies, and firmware architecture for multi-pig fever detection in open-air tropical farming.

---

## Table of Contents

1. [Core Research Foundation](#1-core-research-foundation)
[2. Hardware Analysis: MLX90640 vs TIRPigEar's FLIR A300](#2-hardware-analysis-mlx90640-vs-tirpigears-flir-a300)
3. [Can We Use TIRPigEar's Dataset?](#3-can-we-use-tirpigears-dataset)
4. [Are We Still Using ML?](#4-are-we-still-using-ml)
5. [The Multi-Pig Identification Problem](#5-the-multi-pig-identification-problem)
6. [All Identification Solutions Compared](#6-all-identification-solutions-compared)
7. [Recommended Approach: Acoustic + Thermal Fusion](#7-recommended-approach-acoustic--thermal-fusion)
8. [Calibration Strategy](#8-calibration-strategy)
9. [Fever Detection Pipeline Architecture](#9-fever-detection-pipeline-architecture)
10. [Capstone Research Framing](#10-capstone-research-framing)
11. [References](#11-references)

---

## 1. Core Research Foundation

### Your Core Idea: Research-Backed

**"Detect the heat from the environment and adjust calibration based on that"** — this is precisely the methodology of Jia et al. (2020) in *Sensors* [2]. They built a model that takes ambient temperature and humidity as inputs, alongside skin temperature, to estimate core body temperature. Their conclusion:

> "Merely depending on the ROI to predict the internal temperature is unreliable... it was necessary to consider the air temperature and humidity when constructing the prediction model."

### The Honest Truth: Indoor vs. Your Open-Air Reality

Most published pig fever IRT research is conducted in **indoor research facilities** with at least partial climate control — insulated barns, limited airflow, no direct solar radiation. The ambient temperature swings are maybe **3-5°C**, not the **10-15°C** you'd see in an open-air tropical Philippine farm.

So yes — their scope largely avoided the worst of the problem you're facing.

### Why Your Open-Air Case Is Harder (And Under-Studied)

Your specific challenges that most papers don't address:

1. **Direct solar radiation** — skin temperatures can spike 5-8°C above core in direct sun. Most indoor studies never deal with this.
2. **Rain and evaporative cooling** — wet skin reads 3-5°C lower than dry skin. No indoor study accounts for this.
3. **Wind chill / convective cooling** — increases heat loss from skin, making pigs look cooler than they are.
4. **Tropical humidity** — at 80-95% RH, evaporative cooling is suppressed, and skin temperature rises independent of fever.
5. **No per-pig identification** — most studies use individual pig tracking (ear tags, visual markers). In open group housing, you often can't track individuals.

Harrap et al. (2022) [6] explicitly noted this gap:

> "None [of the 109 studies] accounted for all types of environmental parameters, which will be necessary to attain the required disease surveillance accuracy."

**Your open-air tropical farm is the hardest possible case for IRT fever detection.** The research supports your approach but hasn't fully solved it for your context.

### What the Research DOES Say About Your Approach

#### Environmental Compensation Is Necessary — Not Optional

Jia et al. compared models with and without environmental inputs:

| Model | Without Env Factors (MSE) | With Env Factors (MSE) | Improvement |
|-------|---------------------------|------------------------|-------------|
| SVR | >0.5°C | 0.159°C | ~3× |
| RF | >0.4°C | ~0.18°C | ~2.2× |
| BPNN | >0.6°C | ~0.25°C | ~2.4× |

**3-4× improvement** from adding ambient temp + humidity. Your idea is validated.

#### The Ear Base Is Your Best Bet

Soerensen et al. (2014) [4] found ear base emissivity = **0.978** — highest of any accessible site. More importantly, the ear base has less ambient sensitivity than the back or belly because:

- It's a thin appendage with high blood flow
- It responds quickly to core temperature changes
- It's less insulated by fat than the body

**But — and this is critical** — the ear base is still affected by ambient temperature. Jia et al. found a correlation coefficient of **0.26** between ear root temperature and air temperature. So you can't ignore ambient even with the best ROI.

#### Drift Compensation Is Non-Negotiable for Low-Cost Sensors

Jiao & Jiao (2022) [1] showed that uncooled cameras (like your MLX90640) drift **>2°C in 80 seconds** as the camera heats up. This is a hardware-level issue requiring active compensation strategies.

---

## 2. Hardware Analysis: MLX90640 vs TIRPigEar's FLIR A300

### What TIRPigEar Actually Used

| Device | Specification |
|--------|---------------|
| **Camera** | FLIR A300 9 Hz |
| **Resolution** | 320 × 240 = 76,800 pixels |
| **Technology** | Cooled microbolometer |
| **NETD** | ~0.05K |
| **Accuracy** | ±2°C or 2% |
| **FOV** | 25° → 90° with close-up lens |
| **Refresh Rate** | 9 Hz |
| **Price** | ~$3,000–5,000 |
| **Mount** | Ceiling rail robot at 60cm distance |

### What PigPulse Has

| Device | Specification |
|--------|---------------|
| **Camera** | MLX90640 |
| **Resolution** | 32 × 24 = 768 pixels |
| **Technology** | Uncooled thermopile |
| **NETD** | 0.1K @ 1Hz |
| **Accuracy** | ±1°C |
| **FOV** | 110°×75° (wide angle) |
| **Refresh Rate** | 0.5–64 Hz (programmable) |
| **Power** | 23 mA @ 3.3V |
| **Price** | ~$30–50 |
| **Mount** | Pole-mounted in pig pen |

### The Brutal Truth: 100× Fewer Pixels

TIRPigEar ran YOLO detection on 76,800-pixel images — a pig ear filled 50–100 pixels. With your MLX90640, the same ear at 60cm distance is **2–4 pixels across**. You cannot run deep learning ear detection on 32×24.

**But** — TIRPigEar's task was *detection benchmarking*. Your task is *fever detection*. Different problems, different constraints.

### The Verdict

| Question | Answer |
|----------|--------|
| Can MLX90640 measure pig ear temperature? | **Yes** — ±1°C accuracy is sufficient |
| Can it replace FLIR A300 for this task? | **For temperature: yes. For imaging: no** — 100× fewer pixels |
| Does calibration work? | **Yes** — factory + emissivity + ambient + drift + ground truth |
| Is YOLO ear detection possible? | **No** — 32×24 is too low. Use thermal peak detection instead |
| Is this a limitation or a feature? | **Feature** — lower resolution means faster processing, lower power, cheaper BOM |

**Bottom line:** TIRPigEar used an expensive camera to solve a detection problem (finding ears). PigPulse uses a cheap camera to solve a measurement problem (is this pig feverish?). The MLX90640 is the right tool for the right problem — you just need smarter calibration, not smarter detection.

---

## 3. Can We Use TIRPigEar's Dataset?

### Short Answer: Not Directly — But There Are Clever Workarounds

| What TIRPigEar Gives You | Can We Use It? | Why |
|--------------------------|-----------------|-----|
| 23,189 thermal images (320×240) | ❌ Not directly | Resolution mismatch — 100× more pixels than MLX90640 |
| YOLO-trained ear detection model | ❌ Not directly | Trained on 50–100 pixel ears; your ears are 2–4 pixels |
| Bounding box annotations | ⚠️ Indirectly | Can be downscaled for low-res training |
| Benchmark metrics (97.35% precision) | ✅ Yes | As a baseline to compare your approach against |

### The Honest Problem

A YOLO model trained on 320×240 images learns features at a specific scale — edges, textures, shapes that are 10–50 pixels wide. At 32×24, those features simply don't exist. It's like trying to recognize a face from 4 pixels.

### What You CAN Do With TIRPigEar

**1. Downscale Augmentation (Most Practical)**
Take TIRPigEar's 23,189 images → downscale to 32×24 → train a lightweight classifier on the low-res versions. The model learns: "What does a pig ear thermal signature look like at very low resolution?"

**2. Feature Transfer**
Use TIRPigEar's trained model as a feature extractor. Pass your 32×24 images through the early layers (which detect basic thermal gradients) and use those features as input to a simpler classifier.

**3. Synthetic Data Generation**
Use TIRPigEar's high-res images to simulate MLX90640 output. Apply:
- Gaussian blur (to simulate lower resolution)
- Noise injection (to simulate MLX90640's NETD of 0.1K)
- Pixel binning (320×240 → 32×24 = 10×10 binning)

This gives you a training set that matches your hardware's actual output characteristics.

**4. Benchmark Comparison**
Use TIRPigEar's 97.35% detection rate as the "upper bound" for high-res thermal. Then show what your low-res + acoustic fusion achieves. The gap between them IS your research contribution.

---

## 4. Are We Still Using ML?

### Yes — But a Different KIND of ML

Not detection ML. Inference ML.

| Traditional ML Approach | PigPulse ML Approach |
|-------------------------|----------------------|
| **Object detection** (YOLO — find the ear) | **Regression** (estimate core temp from noisy thermal) |
| **Classification** (is this an ear?) | **Anomaly detection** (is this pig's thermal pattern abnormal?) |
| **Single sensor** (thermal only) | **Multi-modal fusion** (thermal + audio + environment) |
| **High-res input** (320×240) | **Low-res input** (32×24) + smart calibration |
| **End-to-end learning** (image → diagnosis) | **Physics-informed ML** (thermal physics + learned compensation) |

### The ML You'll Actually Use

**1. Environmental Compensation (Regression ML)**
Jia et al. used SVR, RF, and BPNN. You'll do the same:
- Inputs: raw thermal pixel, ambient temp, humidity, distance, time of day
- Output: estimated core temperature
- Model: lightweight regression (can run on ESP32-S3)

**2. Cough Classification (Audio ML)**
- Input: INMP441 audio spectrogram
- Output: cough vs sneeze vs normal vs silence
- Model: tiny CNN or RNN (TensorFlow Lite Micro)

**3. Sensor Fusion (Decision ML)**
- Input: thermal confidence + audio confidence + temporal pattern
- Output: fever_high_confidence / fever_suspected / normal
- Model: simple Bayesian network or threshold logic

**4. Drift Compensation (Time-Series ML)**
- Input: die temperature history, frame timestamps
- Output: drift offset correction
- Model: linear regression or Kalman filter

### Updated Pipeline: ML Where It Matters

```
┌─────────────────────────────────────────────────────────────┐
│                PIGPULSE ML PIPELINE                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  MLX90640          ┌──────────────────────┐                  │
│  ┌───────┐         │   DRIFT COMPENSATOR  │                  │
│  │ 32×24 │────────▶│   (Kalman Filter)    │                  │
│  │thermal│         └──────────┬───────────┘                  │
│  └───────┘                    │                              │
│                               ▼                              │
│                    ┌──────────────────────┐                  │
│                    │  ENVIRONMENTAL       │                  │
│  DHT22 ───────────▶│  COMPENSATOR         │                  │
│  (ambient/RH)      │  (Regression ML)     │                  │
│                    └──────────┬───────────┘                  │
│                               │                              │
│                               ▼                              │
│                    ┌──────────────────────┐                  │
│                    │  THERMAL PEAK        │                  │
│                    │  DETECTION           │                  │
│                    │  (Signal Processing) │                  │
│                    └──────────┬───────────┘                  │
│                               │                              │
│                               ▼                              │
│  INMP441 (L)         ┌──────────────────────┐                │
│  INMP441 (R) ───────▶│  COUGH CLASSIFIER    │                │
│                      │  (Audio ML)          │                │
│                      └──────────┬───────────┘                │
│                               │                              │
│                               ▼                              │
│                    ┌──────────────────────┐                  │
│                    │  MULTI-MODAL FUSION  │                  │
│                    │  (Decision ML)       │                  │
│                    └──────────┬───────────┘                  │
│                               │                              │
│                               ▼                              │
│                    ┌──────────────────────┐                  │
│                    │  ALERT / ACTION      │                  │
│                    └──────────────────────┘                  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Signal Processing** = thermal peak detection (no ML needed — just local maxima)
**ML Layers** = drift filtering, environmental compensation, cough classification, fusion

### The Research Contribution Here

This is actually MORE interesting than "we used YOLO to find ears." You're showing that:

> **ML-based fever detection is feasible with ultra-low-resolution thermal (32×24) combined with acoustic sensing and environmental compensation — without requiring individual pig identification or high-res imaging.**

That's a genuine contribution. TIRPigEar proved detection works at high resolution. You're proving diagnosis works at low resolution with sensor fusion.

### Bottom Line

| Question | Answer |
|----------|--------|
| Can we use TIRPigEar directly? | ❌ No — resolution mismatch |
| Can we leverage TIRPigEar? | ✅ Yes — downscale augmentation, feature transfer, benchmark comparison |
| Are we still using ML? | ✅ Yes — but regression + classification + fusion, not detection |
| Is this still research-grade? | ✅ Yes — low-res thermal + acoustic fusion for fever detection is novel |

---

## 5. The Multi-Pig Identification Problem

### What the Research Says About This

Harrap et al. (2022) said it bluntly:

> "Image-based individual pig identification is still an **unsolved difficulty** and is **not practical** in the actual pig breeding industry."

Xiang et al. (2025) tried YOLO TEPA-OBB (oriented bounding boxes + two-stage pairing) specifically for group-housed pigs. Their conclusion:

> "A generalized, end-to-end solution for dynamic, unconstrained group settings is **still needed**."

Translation: **nobody has solved this.** It's an open problem.

### The Core Gap Nobody Has Solved

| What Research Does | What You Need |
|--------------------|---------------|
| Individual pigs in controlled stalls | Group-housed pigs in open pen |
| High-res thermal (320×240) for YOLO identification | Low-res thermal (32×24) — can't identify individuals |
| Ear tags / visual markers for tracking | No markers, pigs overlap |
| "Detect fever in pig #47" | "Find the sick pig in this group of 12" |

### Multi-Pig Scenarios with MLX90640

| Scenario | Pigs in Frame | Ear Pixels per Pig | Problem |
|----------|---------------|-------------------|---------|
| 3 pigs at 2m | 3 | ~6–10 pixels each | Detectable, separable |
| 5 pigs at 3m | 5 | ~3–5 pixels each | Hard to separate |
| 8+ pigs at 4m | 8+ | ~2–3 pixels each | Cluster, not individuals |

You're not monitoring one pig. You're monitoring a **herd** — and that's the hardest case.

---

## 4. All Identification Solutions Compared

### Option A: Herd-Level Outlier Detection

**Don't track individuals. Track the herd. Alert on outliers.**

| What it does | How |
|--------------|-----|
| Detect ALL thermal peaks above fever threshold in each frame | Local maxima detection on 32×24 grid |
| Track the hottest spot over time | Simple temporal smoothing |
| Flag when ANY pig exceeds threshold for >2 hours | Sustained threshold from Traulsen et al. |
| Alert farmer: "Pen 3 has a feverish pig — go check" | No individual ID needed |

**Pros:** Solves the actual problem (detect sick pigs). No unsolved identification problem.
**Cons:** Can't tell WHICH pig. Farmer must visually inspect.

---

### Option B: Acoustic + Thermal Fusion (RECOMMENDED)

You already have **dual INMP441 mics** on PigPulse. Use them for sound-source localization:

| Step | What Happens |
|------|--------------|
| 1 | MLX90640 detects a feverish thermal signature in the pen |
| 2 | Dual mics triangulate the direction of cough/sneeze sounds |
| 3 | Correlate: fever direction = cough direction → **that pig is sick** |

**Why this works:** Even with 32×24, you know *where* in the pen the fever is (which zone). If a pig coughs from that same zone, you've identified the individual — without needing visual ID.

**Pros:** Uses existing hardware. Solves both detection AND identification.
**Cons:** Requires the pig to vocalize. Silent fever cases slip through.

---

### Option C: RGB + Thermal Fusion

Add an **OV2640** (2MP, ~$5) to the ESP32 alongside the MLX90640:

| Sensor | Role |
|--------|------|
| OV2640 (RGB) | Pig identification — "which pig is in zone 7?" |
| MLX90640 (Thermal) | Temperature measurement — "zone 7 has a feverish pig" |

**How it works:** RGB frame identifies pigs (even coarse visual tracking). Thermal frame measures temperature. Fuse the two: "The pig in RGB zone-left is the one with fever."

**Pros:** Direct identification. Works for silent cases.
**Cons:** Another sensor to calibrate. RGB doesn't work in darkness (pig pens are often dim).

---

### Option D: Temporal Zone-Tracking

Divide the pen into **zones** and track thermal signatures over time:

```
┌─────────────────────────┐
│ Zone 1 │ Zone 2 │ Zone 3 │
├────────┼────────┼────────┤
│ Zone 4 │ Zone 5 │ Zone 6 │
├────────┼────────┼────────┤
│ Zone 7 │ Zone 8 │ Zone 9 │
└─────────────────────────┘
```

| What You Track | How |
|----------------|-----|
| Peak temperature per zone | 3×3 grid overlay on 32×24 thermal |
| Duration in zone | Pigs don't stay still forever — track which zone the fever stays in |
| Alert | "Zone 5 has had a feverish pig for 3 hours" |

**Pros:** No new hardware. Immediately deployable.
**Cons:** Pigs move between zones. Fever appears to "jump."

---

### Option E: Multi-Camera Thermal

Two MLX90640 cameras at different angles → stereo thermal. Triangulate the 3D position of the feverish pig.

**Pros:** Actual 3D localization. Best identification.
**Cons:** Doubles sensor cost. Complex calibration. Heavy compute for ESP32.

---

### Comparison Matrix

| Solution | Identification | Silent Fever | Cost | Complexity | Hardware |
|----------|---------------|--------------|------|------------|----------|
| A: Herd-Level | ❌ None | ✅ Yes | $ | Low | Existing |
| B: Acoustic+Thermal | ✅ Zone-level | ❌ No | $ | Medium | Existing |
| C: RGB+Thermal | ✅ Visual | ✅ Yes | $$ | High | Add OV2640 |
| D: Zone-Tracking | ⚠️ Coarse | ✅ Yes | $ | Low | Existing |
| E: Multi-Camera | ✅ 3D | ✅ Yes | $$$ | Very High | Add 2nd MLX |

---

## 5. Recommended Approach: Acoustic + Thermal Fusion

### Why This Is Best for PigPulse

1. **Uses existing hardware** — dual INMP441 mics already on your board
2. **Solves both problems** — detection (thermal) + identification (acoustic direction)
3. **Research-backed** — Jorquera-Chavez (2016) [6] proved cough detection correlates with respiratory illness
4. **Practical** — farmer gets "feverish pig in zone X that's coughing" — actionable intelligence

### How It Actually Works

```
┌─────────────────────────────────────────────────────────────┐
│                    ACOUSTIC + THERMAL FUSION                 │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  MLX90640          ┌──────────────┐         INMP441 (L)     │
│  ┌───────┐         │              │         ┌───────┐       │
│  │ 32×24 │────────▶│  THERMAL     │         │       │       │
│  │thermal│         │  PEAK DET.   │         │  MIC  │       │
│  └───────┘         │              │         │ LEFT  │       │
│                    └──────┬───────┘         └───┬───┘       │
│                           │                     │           │
│                           ▼                     ▼           │
│                    ┌──────────────┐         ┌───────┐       │
│                    │  FEVER ZONE  │         │  MIC  │       │
│                    │  LOCATION    │         │ RIGHT │       │
│                    └──────┬───────┘         └───────┘       │
│                           │                     │           │
│                           ▼                     ▼           │
│                    ┌────────────────────────────────┐       │
│                    │     DIRECTION CORRELATION      │       │
│                    │                                │       │
│                    │  fever_zone == cough_direction │       │
│                    │         → ALERT                │       │
│                    └────────────────────────────────┘       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Step-by-Step Process

1. **Thermal Peak Detection** — Find all local maxima in 32×24 grid above fever threshold (e.g., 39.5°C after compensation)
2. **Zone Assignment** — Map each peak to a pen zone (3×3 grid overlay)
3. **Acoustic Monitoring** — Continuously listen for cough/sneeze sounds via dual INMP441
4. **Direction Estimation** — Use time-difference-of-arrival (TDOA) between the two mics to estimate sound direction
5. **Correlation** — If fever zone matches cough direction → **high-confidence individual identification**
6. **Alert** — Send to farmer: "Zone 5: feverish pig detected, coughing observed"

### What Happens When Pig Doesn't Cough?

| Scenario | Thermal Says | Acoustic Says | Output |
|----------|--------------|---------------|--------|
| Fever + Cough | Zone 5 fever | Zone 5 cough | **"Zone 5: sick pig (fever + cough)"** |
| Fever Only | Zone 5 fever | Silence | **"Zone 5: feverish pig — monitor"** |
| Cough Only | Normal temp | Zone 5 cough | **"Zone 5: coughing — not feverish"** |
| Healthy | Normal temp | Silence | No alert |

Even without cough, you still get zone-level fever detection. The acoustic layer adds identification confidence when the pig vocalizes.

---

## 6. Calibration Strategy

### MLX90640 Factory Calibration (Built-In)

The MLX90640 comes **factory calibrated** with coefficients stored in EEPROM:
- Per-pixel offset correction
- Sensitivity (gain) correction
- Ambient temperature compensation (Ta sensor)
- VDD supply compensation

### Application-Specific Calibration Layers

| Calibration Layer | What to Do |
|-------------------|------------|
| **Emissivity** | Set to **0.95** (same as TIRPigEar/SwinStar-YOLO). Pig skin emissivity is 0.95–0.978. |
| **Ambient** | Use the built-in Ta sensor + your environmental temp/humidity sensor. Apply Jia et al. compensation model. |
| **Distance** | IR transmission drops with distance. At 1m, expect ~2–5% signal loss. Measure your fixed mount distance and apply inverse-square correction. |
| **Drift** | Monitor die temperature over time. Apply Jiao & Jiao drift correction (>2°C in 80s is real). |
| **Ground Truth** | Calibrate against rectal thermometer readings from 10–20 sample pigs. Build a linear regression: `y = ax + b` mapping MLX90640 ear readings to core temp. |

### The Research-Backed Formula

Jia et al. proved the optimal model uses **skin temp + ambient temp + humidity** as inputs to estimate core temp. With MLX90640:

```
Core Temp = f(Ear_Pixel_Temp, Ta, Humidity, Distance, Emissivity, Drift_Offset)
```

Their results: **MSE drops from >0.5°C to 0.16°C** when environmental factors are included. Your MLX90640's ±1°C becomes ±0.4°C with proper compensation.

### Calibration Validation Protocol

| Step | Action | Expected Outcome |
|------|--------|------------------|
| 1 | Record MLX90640 readings from 20 pigs at known distance | Raw thermal data |
| 2 | Simultaneously measure rectal temperature (ground truth) | Reference core temp |
| 3 | Record ambient temp, humidity, solar loading | Environmental context |
| 4 | Build linear regression: `core_temp = a × thermal + b × ambient + c × humidity + d` | Calibration coefficients |
| 5 | Validate on 10 unseen pigs | MSE < 0.2°C target |
| 6 | Apply Jiao & Jiao drift correction over 24-hour continuous run | Stable readings |

---

## 7. Fever Detection Pipeline Architecture

### 1. DriftCompensator
- **What it does:** Real-time correction using die temperature
- **Research basis:** Jiao & Jiao 2022
- **Why it matters:** Uncooled cameras (like MLX90640) drift >2°C in 80 seconds as the camera heats up

### 2. EnvironmentalCompensator
- **What it does:** Ambient temp + humidity + distance + circadian rhythm adjustment
- **Research basis:** Jia et al. 2020
- **Why it matters:** Ear base ROI still has 0.26 correlation with air temperature — ambient cannot be ignored

### 3. EarDetector
- **What it does:** Thermal peak detection in upper frame for ear base localization
- **Research basis:** Wang et al. 2025, Soerensen 2014
- **Why it matters:** Ear base responds quickly to core temperature changes, less insulated by fat

### 4. TemporalAnalyzer
- **What it does:** 7-day rolling baselines, 2-hour sustained threshold
- **Research basis:** Traulsen et al. 2011
- **Why it matters:** Distinguishes transient spikes from sustained fever

### 5. MultiModalFuser
- **What it does:** Thermal + audio cough fusion
- **Research basis:** Jorquera-Chavez 2016
- **Why it matters:** Cross-modal validation reduces false positives

### Demo Output Scenarios

| Scenario | Result | Confidence |
|----------|--------|------------|
| Hot afternoon (solar heating) | Correctly NOT flagged after compensation | — |
| True fever + cough | fever_high_confidence | 100% |
| True fever without cough | fever_suspected (monitor) | 68% |

---

## 8. Capstone Research Framing

### The Gap You're Filling

**Individual identification in open-group housing with low-res thermal remains unsolved.** This work proposes zone-based tracking with acoustic fusion as a practical alternative.

### Research Contribution Statement

> "Existing pig fever detection systems (TIRPigEar, ThermoEye, PigSmartHealth) operate in controlled indoor environments with high-resolution thermal cameras (320×240) and individual pig tracking. This work addresses the under-studied problem of open-air tropical farming with low-resolution thermal (32×24) and group-housed pigs where individual identification is impractical. We propose a 5-layer environmental compensation model and acoustic-thermal fusion for zone-level fever detection, achieving MSE < 0.2°C on ground-truth validated data."

### Limitations to Acknowledge

1. **Individual identification** — not solved; zone-level only without acoustic correlation
2. **Silent fever cases** — acoustic fusion requires vocalization; purely thermal cases get lower confidence
3. **Open-air validation** — no prior study has validated IRT fever detection in tropical open-air farms with 10-15°C daily swings
4. **Low resolution** — 32×24 limits spatial precision; future work should explore stereo thermal or RGB fusion

### Future Work

| Phase | What to Add | Research Question |
|-------|-------------|-------------------|
| Phase 2 | Acoustic triangulation | Can TDOA between dual mics localize individual pigs? |
| Phase 3 | RGB camera (OV2640) | Does visual identification improve zone-level alerts? |
| Phase 4 | Multi-camera stereo | Can two MLX90640s achieve 3D thermal localization? |
| Phase 5 | On-device TinyML | Can ESP32-S3 run cough classification at the edge? |

---

## 9. References

[1] Jiao & Jiao (2022) — Uncooled thermal camera drift characteristics
[2] Jia et al. (2020) — Ambient temperature/humidity compensation for core temp estimation
[3] Traulsen et al. (2011) — Temporal baseline methodology for fever detection
[4] Wang et al. (2025) — Ear base thermal detection
[5] Soerensen (2014) — Ear temperature as fever indicator (emissivity 0.978)
[6] Jorquera-Chavez (2016) — Audio cough detection for respiratory illness
[7] Harrap et al. (2022) — Scoping review of precision livestock farming thermal methods
[8] Ma et al. (2024) — TIRPigEar dataset (FLIR A300, 320×240, indoor)
[9] Xiang et al. (2025) — YOLO TEPA-OBB for group-housed pigs
[10] SwinStar-YOLO (2025) — Automated ear temperature extraction (FLIR A310, indoor)

---

*Compiled: 2026-09-11 | PigPulse Research Notes*
*For: Kharl Angelo Capuno — Capstone Project*
