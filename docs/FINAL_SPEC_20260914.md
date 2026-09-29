# PigPulse v3 — Final System Specification
> **Date:** September 14, 2026
> **Status:** LOCKED — Ready for Build

---

## 1. 🎯 THE FULL FLOW (Retold Simply)

### **What Happens, Step by Step:**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  HARDWARE LAYER                                                             │
│  ──────────────                                                             │
│                                                                             │
│  ┌──────────────────┐          ┌──────────────────────────────────┐        │
│  │  ESP32-D0WD       │          │  Raspberry Pi 5                   │        │
│  │  (Audio Node)     │          │  (Main Brain)                     │        │
│  │                   │          │                                   │        │
│  │  + INMP441 mic    │──WiFi──▶  │  + MLX90640 thermal camera        │        │
│  │  + BME280 ambient │ WebSocket│  + BME280 (via ESP32)             │        │
│  │                   │          │  + Camera (optional, future)      │        │
│  └──────────────────┘          │  + PocketBase (local server)      │        │
│                                └──────────────┬───────────────────┘        │
│                                               │                             │
│                                               │ WiFi / HTTP/3               │
│                                               ▼                             │
│                                ┌──────────────────────────────────┐        │
│                                │  Expo Mobile App                  │        │
│                                │  (Farmer's Phone)                 │        │
│                                │                                   │        │
│                                │  • Real-time health score         │        │
│                                │  • Push alerts                    │        │
│                                │  • Historical trends              │        │
│                                └──────────────────────────────────┘        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  SOFTWARE LAYER                                                             │
│  ──────────────                                                             │
│                                                                             │
│  ESP32 Firmware (Arduino C++)                                               │
│  ├── I2S DMA: Capture 16kHz audio from INMP441                             │
│  ├── BME280: Read ambient temp/humidity                                    │
│  ├── WebSocket: Stream audio to RPi 5                                      │
│  └── Deep sleep between samples (power saving)                             │
│                                                                             │
│  RPi 5 Software (Python)                                                    │
│  ├── WebSocket Server: Receive audio from ESP32                            │
│  ├── MFCC Extraction: Convert audio → 49×13 feature matrix                 │
│  ├── Band-wise Calibration: Unsupervised domain adaptation                 │
│  ├── CNN Inference: TensorFlow Lite → cough probability                    │
│  ├── Thermal Processing: MLX90640 → ear-base ROI → fever deviation        │
│  ├── Round-Robin Fusion: 0.6×cough_z + 0.4×fever_z → health score        │
│  ├── PocketBase API: Store data, serve Expo app                            │
│  └── Auto-Calibration: 24h noise learning, 7-day thermal baseline          │
│                                                                             │
│  Expo App (React Native)                                                    │
│  ├── Real-time health score display                                        │
│  ├── Push notifications (Yellow/Red alerts)                                │
│  ├── Historical data charts                                                │
│  └── Multi-pen support (future)                                            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  ML PIPELINE (Edge Impulse)                                                 │
│  ─────────────────────────                                                  │
│                                                                             │
│  1. Upload public datasets (Figshare 546, Thai 49)                         │
│  2. Configure MFCC block (25ms window, 10ms hop, 64 Mel bands)            │
│  3. Train auto-CNN (3 Conv layers + GAP + Dense)                           │
│  4. Evaluate (target: >85% accuracy, >0.80 F1)                             │
│  5. Quantize to INT8 (for RPi 5 TFLite)                                    │
│  6. Export .tflite model                                                   │
│  7. Deploy to RPi 5                                                        │
│                                                                             │
│  Later:                                                                     │
│  8. Record farm-specific noise                                             │
│  9. Re-train with farm data (improves accuracy)                            │
│  10. Re-deploy updated model                                               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  CALIBRATION FLOW (Unsupervised — Farmer Does Nothing)                      │
│  ────────────────────────────────────────────────────                       │
│                                                                             │
│  Day 0: Plug in device                                                      │
│  ├── ESP32 starts streaming audio                                          │
│  ├── RPi 5 starts recording ambient noise                                  │
│  └── MLX90640 starts learning thermal baseline                             │
│                                                                             │
│  Day 1: Audio calibration complete                                         │
│  ├── Compute per-frequency-band statistics                                 │
│  ├── Calculate correction factors (source vs farm)                         │
│  └── Apply to all future audio                                             │
│                                                                             │
│  Day 7: Thermal calibration complete                                       │
│  ├── Compute rolling average per time-of-day                               │
│  ├── Establish baseline profile                                            │
│  └── Start fever deviation monitoring                                      │
│                                                                             │
│  Day 8+: Full monitoring                                                   │
│  ├── Round-robin synthesis every 5 seconds                                 │
│  ├── Health score 0-100 updated in real-time                               │
│  ├── Alerts pushed to farmer's phone                                       │
│  └── Weekly baseline update (adapts to seasons/growth)                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 🔌 POWER SYSTEM — BOTH OPTIONS

### **Option A: UPS HAT (Plug-and-Play)**

| Component | Spec | Cost | Pros | Cons |
|-----------|------|------|------|------|
| Waveshare UPS HAT | 12V 10Ah support | ₱600 | Plug-and-play, safe, reliable | Less impressive for capstone |
| **Total** | | **₱600** | | |

**Wiring:**
```
12V Battery → UPS HAT → RPi 5 (5V)
                    → Buck Converter → ESP32 (3.3V)
```

---

### **Option B: DIY Power System (Custom Design)**

| Component | Spec | Cost | Purpose |
|-----------|------|------|---------|
| TP5100 Charge Controller | 2A charging | ₱50 | Battery charging |
| DW01A Protection IC | Overcharge/discharge | ₱30 | Battery safety |
| LM2596 Buck Converter | 12V → 5V/3A | ₱40 | RPi 5 power |
| MP1584 Buck Converter | 12V → 3.3V/3A | ₱30 | ESP32 power |
| INA219 I2C Monitor | Voltage/current | ₱60 | Battery monitoring |
| IRFZ44N MOSFET | Power path | ₱20 | Auto-switching |
| LiPo 3S 10Ah | 11.1V 120Wh | ₱1,500 | Main battery |
| Solar Panel 20W | 18V | ₱800 | Extended deployment |
| **Total** | | **₱2,530** | |

**Wiring Diagram:**
```
                    ┌─────────────────┐
                    │  Solar Panel    │ (Optional)
                    │  20W / 18V      │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │  TP5100         │
                    │  Charge Ctrl    │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │  LiPo 3S 10Ah   │
                    │  11.1V 120Wh    │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
        ┌──────────┐  ┌──────────┐  ┌──────────┐
        │ INA219   │  │ LM2596   │  │ MP1584   │
        │ Monitor  │  │ 5V/3A    │  │ 3.3V/3A  │
        └──────────┘  └────┬─────┘  └────┬─────┘
                           │              │
                           ▼              ▼
                    ┌──────────┐  ┌──────────┐
                    │  RPi 5   │  │ ESP32    │
                    └──────────┘  └──────────┘
```

**Recommendation:** Option B (DIY) — shows engineering design, better for capstone defense.

---

## 3. 📊 WHAT DOES SUCCESS LOOK LIKE?

### **Technical Success Criteria:**

| Metric | Minimum Target | Good | Excellent |
|--------|---------------|------|-----------|
| **Cough Detection Accuracy** | >80% | >85% | >90% |
| **Cough Detection F1-Score** | >0.75 | >0.80 | >0.85 |
| **Thermal Accuracy** | ±3°C | ±2°C | ±1.5°C |
| **Fever Detection Sensitivity** | >70% | >80% | >90% |
| **Inference Latency** | <200ms | <100ms | <50ms |
| **Battery Life (no solar)** | >12h | >24h | >48h |
| **Battery Life (with solar)** | Indefinite | Indefinite | Indefinite |
| **Calibration Time** | <48h | <24h | <12h |
| **False Positive Rate** | <30% | <20% | <10% |
| **System Uptime** | >95% | >98% | >99% |

### **Research Success Criteria:**

| Criterion | What It Means |
|-----------|---------------|
| **Novel Contribution** | First unsupervised domain adaptation for pig cough detection |
| **Reproducibility** | Full open-source hardware + software, others can rebuild |
| **Practical Deployability** | Farmer can plug in and use without technical knowledge |
| **Cross-farm Potential** | Calibration protocol shows promise for generalization |
| **Publication Quality** | Results worth publishing in a conference or journal |

### **Capstone Defense Success:**

| Question | Answer |
|----------|--------|
| "Why is this novel?" | First edge-based multi-modal system with unsupervised calibration for pigs |
| "How do you know it works?" | Lab testing + field deployment with accuracy metrics |
| "What are the limitations?" | Single farm, binary cough classification, no individual pig ID |
| "What would you do better?" | Multi-farm validation, CCTV integration, cloud sync |
| "How is this better than SoundTalks?" | $30 vs $500, offline, open-source, no subscription |

### **Farmer Success:**

| Scenario | What Happens |
|----------|-------------|
| **Normal day** | Health score 60-100, green indicator, no alerts |
| **Early warning** | Health score 40-59, yellow alert, farmer checks pen |
| **Outbreak detected** | Health score 0-39, red alert, farmer calls vet |
| **Power outage** | Battery backup kicks in, system continues monitoring |
| **Internet down** | Local monitoring continues, cloud sync pauses |

---

## 4. 📋 COMPLETE BILL OF MATERIALS

### **Core System:**

| Item | Qty | Cost (PHP) | Option A (UPS) | Option B (DIY) |
|------|-----|------------|-----------------|-----------------|
| Raspberry Pi 5 (4GB) | 1 | ₱4,500 | ✅ | ✅ |
| ESP32-D0WD DevKit | 1 | ₱350 | ✅ | ✅ |
| INMP441 Breakout | 1 | ₱150 | ✅ | ✅ |
| MLX90640 Breakout | 1 | ₱800 | ✅ | ✅ |
| BME280 Breakout | 1 | ₱100 | ✅ | ✅ |
| LiPo Battery 3S 10Ah | 1 | ₱1,500 | ✅ | ✅ |
| **UPS HAT** | 1 | ₱600 | ✅ | ❌ |
| TP5100 Charge Ctrl | 1 | ₱50 | ❌ | ✅ |
| DW01A Protection | 1 | ₱30 | ❌ | ✅ |
| LM2596 Buck 5V | 1 | ₱40 | ❌ | ✅ |
| MP1584 Buck 3.3V | 1 | ₱30 | ❌ | ✅ |
| INA219 Monitor | 1 | ₱60 | ❌ | ✅ |
| MOSFET + Misc | 1 | ₱20 | ❌ | ✅ |
| Solar Panel 20W | 1 | ₱800 | Optional | Optional |
| Enclosure | 1 | ₱500 | ✅ | ✅ |
| **Total (Option A)** | | **₱9,000** | | |
| **Total (Option B)** | | **₱8,930** | | |

---

## 5. 🎯 RESEARCH QUESTIONS (Final)

**Primary:**
> Can a distributed edge system (ESP32 audio + RPi 5 thermal) with unsupervised domain adaptation automatically calibrate to new pig farms, maintaining cough detection accuracy without farmer intervention?

**Secondary:**
1. How does band-wise feature normalization affect cross-farm cough detection accuracy?
2. Can relative thermal thresholding (±1.5°C from rolling baseline) detect fever without absolute calibration?
3. What is the optimal round-robin cycle time for multi-modal fusion?
4. How does custom BMS design affect deployment feasibility?

---

## 6. 📖 CHAPTER OUTLINE (Final)

| Chapter | Title | Status |
|---------|-------|--------|
| 1 | The Problem and Its Setting | ✅ Drafted |
| 2 | Review of Related Literature | ❌ TODO |
| 3 | Methodology | ❌ TODO |
| 4 | Results and Discussion | ❌ TODO |
| 5 | Summary, Conclusions, Recommendations | ❌ TODO |

---

## 7. 📁 ALL FILES

| File | Location |
|------|----------|
| `CHAPTER 1_DRAFT_20260914.md` | `~/pig-health-monitor/docs/` |
| `ARCHITECTURE_V3_20260914.md` | `~/pig-health-monitor/docs/` |
| `TECHNICAL_DEEP_DIVE_20260914.md` | `~/pig-health-monitor/docs/` |
| `SESSION_REFERENCE_20260914.md` | `~/pig-health-monitor/docs/` |
| `FINAL_SPEC_20260914.md` | `~/pig-health-monitor/docs/` (this file) |

---

## 8. ✅ NEXT STEPS

| # | Task | Owner | Status |
|---|------|-------|--------|
| 1 | Copy all files to OneDrive | You | TODO |
| 2 | Order hardware | You | TODO |
| 3 | Set up Edge Impulse project | Sentinel | TODO |
| 4 | Draft Chapter 2 | You/Sentinel | TODO |
| 5 | Draft Chapter 3 | You/Sentinel | TODO |
| 6 | Build firmware | Sentinel | TODO |
| 7 | Build software | Sentinel | TODO |
| 8 | Test in lab | You + Sentinel | TODO |
| 9 | Deploy in field | You | TODO |
| 10 | Collect data | Automatic | TODO |
| 11 | Evaluate results | Sentinel | TODO |
| 12 | Write Chapter 4 | You | TODO |
| 13 | Write Chapter 5 | You | TODO |

---

*End of Final Specification*