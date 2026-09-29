# PigPulse Research Session — Complete Reference
> Compiled: September 14, 2026
> Purpose: All research findings, citations, and design decisions from this session

---

## 1. 🔍 THE HONEST TRUTH ABOUT "PROOF"

### **What IS Proven:**

| For Pigs (Published) | For General Audio (Published, Not Pigs) |
|---------------------|----------------------------------------|
| Cough detection works (94.74% with PANNs) | Unsupervised domain adaptation works (+21% cross-domain) |
| SoundTalks counts coughs vs baseline | Band-wise stats adaptation works with 10 samples |
| 27% performance drop across farms | Self-training matches ground truth without labels |
| Thermal ear-base ROI correlates with core temp | Source-free adaptation works for bird soundscapes |

### **What is NOT Proven (The Research Gap):**

> **No published study has applied unsupervised domain adaptation specifically to pig cough detection.**

This is actually your contribution. The research SUPPORTS it will work (analogous studies show it works for audio/birds), but **nobody has tested it for pigs**.

**Your capstone hypothesis:**
> "Unsupervised domain adaptation methods (proven for general audio) can be successfully applied to pig cough detection in open-air farms, maintaining accuracy across varying environments without farmer calibration."

This is testable and defensible.

---

## 2. 📁 ALL FILES FROM THIS SESSION

### **Files Created/Modified:**

| File | Location | Status |
|------|----------|--------|
| `PLAN_DETAILED.md` | `~/pig-health-monitor/.planning/` | Exists, needs update |
| `PROGRESS_UPDATE_20260913.md` | `~/pig-health-monitor/docs/` | Exists, needs update |
| `REPORT_LATEST.md` | `~/pig-health-monitor/docs/` | Exists, daily cron output |
| `adversarial_review_firmware.json` | `~/pig-health-monitor/.planning/` | Exists |

### **Research Findings (This Session):**

All citations and findings are documented below in this file. Copy to your OneDrive collaborative doc as needed.

---

## 3. 🌡️ THERMAL CALIBRATION — HOW IT ACTUALLY WORKS

### **Method 1: Sensor-Level Calibration (Math)**

The MLX90640 has **built-in drift compensation**:

```
Raw Reading → Die Temp Sensor → Polynomial Correction → Compensated Reading

Formula (from Jia et al. 2020):
T_corrected = T_raw + α × (T_die - T_ref) + β × (T_amb - T_ref)

Where:
- T_raw = raw pixel temperature
- T_die = internal die temperature sensor reading
- T_amb = ambient temperature (from BME280)
- T_ref = reference temperature (calibration point)
- α, β = factory-calibrated coefficients
```

**This happens BEFORE your application code reads the data.** The sensor itself outputs compensated values.

### **Method 2: Application-Level Calibration (Math)**

After reading the compensated temperature, you apply:

| Step | Formula | Purpose |
|------|---------|---------|
| **Emissivity correction** | T_true = T_reading / ε^(1/4) | Pigs have emissivity ~0.978 |
| **Ambient compensation** | T_final = T_reading - k × (T_ambient - 25°C) | Adjust for hot/cold days |
| **Distance correction** | T_actual = T_measured + δ × distance_error | Fixed if pole-mounted |
| **Relative threshold** | Alert if T > rolling_baseline + 1.5°C | No absolute needed |

### **Method 3: Relative Thresholding (No Absolute Calibration)**

```
Key Insight: You don't need to know the ABSOLUTE pig temperature.
You only need to know when it ABNORMAL FOR THAT PIG.

Protocol:
├── Day 1-7: Learn baseline
│   ├── Record ear-base temp every 5 min
│   ├── Compute 7-day rolling average per time-of-day (circadian)
│   └── Store as "normal for this pig at this time"
│
├── Day 8+: Monitor
│   ├── Read current temp
│   ├── Compare to baseline for same time-of-day
│   └── Alert if deviation > 1.5°C (research-backed threshold)
```

**Research backing:**
- Wang et al. 2025, IEEE TIM: Ear-base ROI has highest correlation with core temperature
- Circadian rhythm: Pig body temp varies ±0.5°C naturally over 24h (your manuscript notes)
- Jia et al. 2020, Sensors: MLX90640 ±0.8°C compensated accuracy possible

---

## 4. 🤖 WHAT "UNSUPERVISED" MEANS

### **Supervised (What We Want to Avoid):**
```
Human labels data → Model learns from labels
├── Farmer listens to 1000 audio clips
├── Labels each as "cough" or "not cough"
├── Expert validates labels
└── Time-consuming, expensive, doesn't scale
```

### **Unsupervised (What We Want):**
```
System learns from RAW data → No human labels needed
├── Record 24h ambient noise
├── System learns noise profile automatically
├── Compute statistics (mean, variance per frequency band)
├── Apply correction factors
└── No farmer intervention required
```

### **Three Types of Unsupervised Adaptation:**

| Type | What It Does | Evidence |
|------|-------------|----------|
| **Feature normalization** | Match frequency band statistics to training data | DCASE 2018: +6% with just 10 samples |
| **Domain discovery** | Cluster audio by environment, adapt each cluster | Sound-Adapter 2021: +21% across 5 domains |
| **Self-training** | Teacher model labels target data, student retrains | Uni Paderborn 2023: Near ground-truth accuracy |

**For your system:**

```
1. Factory: Train model on public pig cough datasets (supervised)
           → This is done ONCE, before deployment

2. Deployment: System records 24h ambient noise (unsupervised)
              → Computes noise profile
              → Adjusts feature normalization
              → No farmer needed

3. Monitoring: Counts coughs, compares to baseline
              → Alerts on deviation
              → Continuous adaptation
```

---

## 5. 📚 ALL CITATIONS FROM THIS SESSION

### **Pig Cough Detection:**

| # | Citation | Finding |
|---|----------|---------|
| 1 | Animals 2026, 16(2), 253 | PANNs-CNN14-TFDS: 94.74% accuracy, 92.31% F1, only 89K trainable params |
| 2 | Agriculture 2026, 16(7), 753 | ESP32-S3 TinyML piglet scream detection: 95.56% accuracy, 5.1KB model |
| 3 | Electronics 2022, 11(21), 3562 | SE-DenseNet pig cough: 93.8% accuracy with spectral subtraction |
| 4 | PLOS One 2025, Multi-SVDD | IMCRA + spectral subtraction: 95% accuracy, 95.4% precision |
| 5 | Vet Sci 2025, 12(9), 818 | AI vs farmers: AI better at non-productive cough detection (κ=0.79 for M. hyo) |
| 6 | Sensors 2024, 24(22), 7232 | Audio-visual multimodal: 95% accuracy, F1=0.83 |
| 7 | Sci Rep 2025, PVMC framework | SEGAN+ for pig vocalizations: 4-stage ensemble, handles non-stationary noise |
| 8 | AgriEngineering 2025, 7(5), 140 | Hybrid CNN-RNN: F1=98.6%, recall=98.6% on field data |

### **Domain Adaptation (General Audio):**

| # | Citation | Finding |
|---|----------|---------|
| 9 | ACM 2021, Sound-Adapter | Multi-source domain adaptation: +21% accuracy across 5 domains, unsupervised |
| 10 | Uni Paderborn 2023 | Self-training for sound recognition: near ground-truth without labels |
| 11 | DCASE 2018 / arXiv 2020 | Band-wise statistics matching: +6% with just 10 target samples |
| 12 | arXiv 2023, NOTELA | Source-free domain adaptation for bird soundscapes |
| 13 | bioRxiv 2026, Cross-farm eval | Dairy cow vocalization: LOFO macro-F1=0.763 for physiological sounds |
| 14 | InterSpeech 2025 | Audio-text models: audio-based adaptation outperforms text-based |

### **Thermal / Fever Detection:**

| # | Citation | Finding |
|---|----------|---------|
| 15 | Jia et al. 2020, Sensors 20:4282 | MLX90640: ±3-4°C uncompensated → ±0.8°C compensated with SVR |
| 16 | Wang et al. 2025, IEEE TIM | Ear-base ROI: emissivity 0.978, highest core temp correlation |
| 17 | MDPI IoT 2024, 7(6), 165 | Open-air pig housing IoT: year-round environmental monitoring |
| 18 | Frontiers 2026, YOLOv11 | Outdoor pig detection: precision/recall ≥0.97 for posture detection |

### **Calibration & Sensors:**

| # | Citation | Finding |
|---|----------|---------|
| 19 | US Patent 12332229 (2024) | Multi-sensor auto-calibration via cross-sensor relations |
| 20 | MDPI Sensors 2024, 24(6), 1849 | IMU auto-calibration via Kalman filter, no user intervention |
| 21 | Sci Direct 2026, NEIKER-kABE | IoT dairy farm: sensor calibration against certified lab methods |
| 22 | MDPI 2026, semi-arid pigs | Automated thermal control: R²=0.83 for temperature accuracy |

### **Commercial Systems (For Comparison):**

| System | Key Feature | Limitation |
|--------|-------------|------------|
| SoundTalks | Cloud CNN, 1-day self-calibration, ReHS 0-100 | $500+sub, needs internet |
| D-Care | Plug-and-play D-Tags, BLE | No published accuracy data |
| Crodeon Reporter | Plug & play, M12 connectors | No AI, just threshold alerts |
| Monnit | 15-minute setup, 80+ sensors | No cough detection, environmental only |

---

## 6. 🎯 LOCKED RESEARCH DESIGN

### **System Architecture:**

```
┌─────────────────────────────────────────────────────────────┐
│                    PigPulse v2 (Locked)                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  ESP32-S3 (Edge AI)                                  │   │
│  │  + INMP441 (audio)                                   │   │
│  │  + MLX90640 (thermal)                                │   │
│  │  + BME280 (ambient)                                  │   │
│  │                                                      │   │
│  │  Audio Pipeline:                                     │   │
│  │  16kHz → Band-wise normalization (auto-calibrate)    │   │
│  │  → MFCC → Edge Impulse CNN (INT8) → cough/not-cough  │   │
│  │  → Cough rate per 24h                                │   │
│  │                                                      │   │
│  │  Thermal Pipeline:                                   │   │
│  │  MLX90640 → Drift compensation (sensor-level math)   │   │
│  │  → Emissivity correction (application-level math)    │   │
│  │  → Ear-base ROI detection                            │   │
│  │  → Relative threshold vs 7-day baseline              │   │
│  │                                                      │   │
│  │  Auto-Calibration (Unsupervised):                    │   │
│  │  1. Record 24h ambient noise                         │   │
│  │  2. Compute noise statistics per frequency band       │   │
│  │  3. Match to training distribution                    │   │
│  │  4. Learn thermal baseline over 7 days               │   │
│  │  5. Farmer does NOTHING                              │   │
│  │                                                      │   │
│  │  Fusion:                                             │   │
│  │  Health Score = 0.6×cough_rate_zscore + 0.4×fever_z  │   │
│  │  Scale: 0-100 (comparable to SoundTalks ReHS)        │   │
│  └─────────────────────────────────────────────────────┘   │
│                          │                                   │
│                          ▼                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  PocketBase + OpenResty + Expo App                   │   │
│  │  Data logging, alerts, visualization                 │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### **Research Questions:**

**Primary:**
> Can unsupervised domain adaptation enable a $30 edge device to automatically calibrate to new pig farms, maintaining cough detection accuracy across varying open-air environments without farmer intervention?

**Secondary:**
1. How does band-wise feature normalization affect cross-farm cough detection accuracy?
2. Can relative thermal thresholding (±1.5°C from rolling baseline) detect fever without absolute temperature calibration?
3. What is the minimum ambient noise recording duration for effective unsupervised adaptation?
4. How does multi-modal fusion (audio + thermal z-scores) compare to single-modality health scoring?

### **Hypotheses:**

| # | Hypothesis | Test |
|---|-----------|------|
| H1 | Unsupervised normalization improves cross-farm accuracy by ≥15% | A/B test with/without adaptation |
| H2 | Relative thermal thresholding detects fever with ≥80% sensitivity | Compare to vet thermometer readings |
| H3 | 24h calibration achieves comparable accuracy to 7-day calibration | Compare 1-day vs 7-day baselines |
| H4 | Fusion score correlates with SoundTalks RDI (r ≥ 0.7) | Parallel deployment comparison |

---

## 7. 📋 CHAPTER OUTLINE (Final)

### **Chapter 1: The Problem and Its Setting**
1.1 Background of the Study
- Respiratory disease in swine: economic impact (Philippines, global)
- Current monitoring: manual, subjective, labor-intensive
- Commercial solutions: SoundTalks, limitations (cost, cloud, calibration)
- Edge AI opportunity: low-cost, offline, automatic

1.2 Statement of the Problem
- Research gap: No self-calibrating system for open-air pig monitoring
- 27% performance drop across farms without adaptation
- Farmers cannot perform technical calibration

1.3 Research Questions (as above)

1.4 Objectives
- General: Develop self-calibrating edge AI system for respiratory monitoring
- Specific: Audio adaptation, thermal thresholding, fusion scoring

1.5 Scope and Limitations
- Single pen, open-air, Philippines climate
- Binary cough classification (not productive/unproductive)
- No individual pig ID
- 24h automatic calibration period

1.6 Significance of the Study
- Farmers: Zero-calibration, affordable ($30 vs $500), offline
- Researchers: First unsupervised adaptation study for pig coughs
- Industry: Open-source alternative to proprietary black-box systems

1.7 Definition of Terms
- Edge AI, TinyML, Unsupervised Domain Adaptation, ReHS, RDI, etc.

1.8 Assumptions and Delimitations

---

### **Chapter 2: Review of Related Literature**

2.1 Pig Vocalizations and Respiratory Disease
- Acoustic characteristics of pig coughs (150Hz-5kHz)
- Productive vs non-productive coughs
- Pathogen correlations (M. hyo, PRRS, PCV2)

2.2 Machine Learning for Pig Cough Detection
- Traditional methods (MFCC + SVM)
- Deep learning methods (CNN, RNN, PANNs, Transformers)
- Transfer learning approaches

2.3 Domain Adaptation for Audio
- Supervised vs unsupervised adaptation
- Feature-level vs model-level adaptation
- Sound-Adapter, DCASE methods, self-training

2.4 Thermal Imaging for Livestock Health
- Infrared thermography principles
- MLX90640 specifications and compensation
- Ear-base ROI detection

2.5 Multi-Modal Sensor Fusion
- Audio-visual fusion for pig monitoring
- Decision-level vs feature-level fusion

2.6 Related Commercial Systems
- SoundTalks (cloud, proprietary)
- D-Care, Crodeon, Monnit (comparison)

2.7 Research Gap
- No unsupervised adaptation study for pig coughs
- No self-calibrating edge system for open-air pigs
- No multi-modal fusion at the edge for livestock

---

### **Chapter 3: Methodology**

3.1 Research Design
- Experimental design with pre-post calibration comparison
- Single-case deployment with time-series analysis

3.2 Hardware Development
- ESP32-S3 selection rationale
- Sensor integration (INMP441, MLX90640, BME280)
- Power management and enclosure design

3.3 Software Architecture
- Audio processing pipeline (MFCC, normalization, CNN)
- Thermal processing pipeline (drift comp, ROI, threshold)
- Fusion algorithm

3.4 Data Collection
- Public datasets (Figshare 546, Thai 49)
- Field recording protocol
- Ground truth establishment (vet diagnosis, parallel SoundTalks)

3.5 Model Development
- Baseline model training (public datasets)
- Quantization and optimization for ESP32-S3
- Edge Impulse workflow

3.6 Calibration Protocol
- Unsupervised noise profiling algorithm
- Band-wise statistics matching implementation
- Thermal baseline learning (7-day rolling)

3.7 Validation Plan
- Accuracy, precision, recall, F1
- Comparison with/without adaptation (A/B)
- Latency and power measurements
- Correlation with SoundTalks RDI (if available)

3.8 Statistical Analysis
- Paired t-test for pre-post adaptation
- Pearson correlation for health score vs RDI
- Confusion matrix analysis

---

### **Chapter 4: Results and Discussion**
(To be filled after deployment)

### **Chapter 5: Summary, Conclusions, Recommendations**
(To be filled after results)

---

## 8. 🎯 ACTION ITEMS (Updated)

| # | Task | Owner | Status |
|---|------|-------|--------|
| 1 | Download public datasets (Figshare 546, Thai 49) | You/Sentinel | TODO |
| 2 | Set up Edge Impulse project, upload datasets | Sentinel | TODO |
| 3 | Train baseline model, export to PlatformIO | Sentinel | TODO |
| 4 | Order ESP32-S3 + INMP441 + MLX90640 | You | TODO |
| 5 | Flash firmware, test audio pipeline | Sentinel | TODO |
| 6 | Flash firmware, test thermal pipeline | Sentinel | TODO |
| 7 | Deploy in pig pen for calibration period | You | TODO |
| 8 | Collect 24h ambient noise for adaptation | Automatic | TODO |
| 9 | Collect 7-day thermal baseline | Automatic | TODO |
| 10 | Evaluate cough detection accuracy | Sentinel | TODO |
| 11 | Evaluate thermal fever detection | Sentinel | TODO |
| 12 | Draft Chapter 1 (full) | You | TODO |
| 13 | Draft Chapter 2 (literature review) | You/Sentinel | TODO |
| 14 | Draft Chapter 3 (methodology) | You | TODO |

---

## 9. ❓ OPEN DECISIONS (Your Call Needed)

| # | Question | Options | My Rec |
|---|----------|---------|--------|
| 1 | CCTV for pig ID? | Include / Exclude / Future work | Exclude (delimitation) |
| 2 | NH3 sensor? | Include / Exclude | Exclude (overscoping) |
| 3 | Raspberry Pi 5? | For CCTV / Not needed | Not needed if no CCTV |
| 4 | SoundTalks for comparison? | Yes / No | Yes (if accessible) |
| 5 | Smart Watt reference? | Primary / Secondary / Not used | Need citation details |
| 6 | Chapter to draft first? | Ch1 / Ch2 / Ch3 | Ch1 (lock foundation) |

---

*End of session reference document*
*Copy to OneDrive collaborative doc as needed*