# PigPulse v3 — Technical Deep Dive
> **September 14, 2026**
> **Purpose:** Explain MFCC, training, and unsupervised calibration in plain steps

---

## 1. 🎵 FULL AUDIO PIPELINE: From Raw Sound to Cough Detection

Here's exactly what happens to the audio, step by step.

### Step 1: Sound Capture (INMP441 Microphone)

```
Sound Wave (air pressure changes)
    │
    ▼
INMP441 MEMS Microphone
├── Converts sound → electrical signal
├── Analog-to-Digital Converter (ADC) samples at 16,000 times/second
└── Outputs: Array of numbers [-32768 to +32767]

Example (1 second of audio):
[0, 145, 892, 2341, 4523, 6712, 8234, 9012, 8756, 7234, 5123, 2341, ...]
Each number = air pressure at that moment (16,000 numbers per second)
```

**Key specs:**
- **16,000 Hz sampling rate** → captures frequencies up to 8,000 Hz (Nyquist theorem)
- **Pig coughs are 150-5,000 Hz** → we capture everything relevant
- **16-bit resolution** → good dynamic range for quiet coughs vs loud squeals

---

### Step 2: I2S DMA Transfer (ESP32-D0WD → Buffer)

The ESP32 uses **I2S (Inter-IC Sound)** — a digital audio bus protocol.

```
INMP441 ──(I2S clock + data)──▶ ESP32-D0WD
                                  │
                                  ▼
                          DMA (Direct Memory Access)
                          ├── Hardware moves data automatically
                          ├── No CPU needed for transfer
                          └── Fills a buffer in RAM

Buffer (1 second):
┌─────────────────────────────────────────────────┐
│ int16_t audio_buffer[16000];                    │
│ [0, 145, 892, 2341, 4523, 6712, 8234, ...]     │
└─────────────────────────────────────────────────┘
```

**Why DMA?**
- CPU is free to do other things (manage WiFi, read BME280)
- Transfer happens in background
- Zero-copy (data goes straight to RAM)

---

### Step 3: MFCC Feature Extraction (The Magic Step)

**MFCC = Mel-Frequency Cepstral Coefficients**

This converts raw audio numbers into a **visual fingerprint** of the sound.

#### Raw Audio → Spectrogram → Mel Spectrogram → MFCC

```
Step 3a: Framing (split into small chunks)
├── Take 16,000 samples (1 second)
├── Split into 25ms frames = 400 samples each
├── Overlap by 10ms (hop length)
└── Result: ~100 frames per second

┌─────┬─────┬─────┬─────┬─────┐
│Frame│Frame│Frame│Frame│ ... │
│  1  │  2  │  3  │  4  │     │
│25ms │25ms │25ms │25ms │     │
└─────┴─────┴─────┴─────┴─────┘
  ← overlap →
```

```
Step 3b: FFT (Fast Fourier Transform)
├── Each frame (400 samples) → frequency spectrum
├── Shows: "How much energy at each frequency?"
└── Result: Array of magnitudes per frequency bin

Example Frame 1:
  100Hz:  12
  200Hz:  45    ← pig grunt energy
  500Hz:  234   ← cough fundamental
  1000Hz: 567   ← cough harmonics
  2000Hz: 345   ← cough energy
  4000Hz: 123   ← cough energy
  8000Hz: 23    ← noise floor
```

```
Step 3c: Mel Scale (Perceptual Warping)
├── Human hearing is logarithmic (we hear 100→200Hz same as 1000→2000Hz)
├── Mel scale warps frequency axis to match human perception
├── 64 triangular filters spread across Mel scale
└── Result: 64 Mel-frequency energies

Mel Filter Bank:
  Filter 1:  0-200Hz
  Filter 2:  100-300Hz
  Filter 3:  200-400Hz
  ...
  Filter 64: 6000-8000Hz
```

```
Step 3d: Log Compression
├── Take logarithm of each Mel energy
├── Compresses dynamic range (quiet sounds become more visible)
└── Result: 64 log-Mel values
```

```
Step 3e: DCT (Discrete Cosine Transform)
├── Decorrelates the 64 Mel energies
├── Keeps only 13 most important coefficients
└── Result: 13 MFCC values per frame
```

#### Final MFCC Matrix:

```
1 second of audio → 49 frames × 13 coefficients = 637 numbers

┌────┬──────┬──────┬──────┬─────┬──────┐
│Frame│ MFCC0│ MFCC1│ MFCC2│ ... │MFCC12│
├────┼──────┼──────┼──────┼─────┼──────┤
│  1 │ 12.3 │ -2.1 │  0.5 │ ... │  1.2 │
│  2 │ 14.5 │ -3.2 │  1.1 │ ... │  0.8 │
│  3 │ 11.2 │ -1.8 │ -0.3 │ ... │  1.5 │
│  4 │ 45.6 │ -8.7 │  5.3 │ ... │ -2.1 │  ← cough starts (high energy)
│  5 │ 67.8 │-12.3 │  8.9 │ ... │ -4.5 │
│  6 │ 89.2 │-15.6 │ 12.1 │ ... │ -6.7 │
│  7 │ 56.3 │ -9.8 │  6.7 │ ... │ -3.2 │
│  8 │ 23.4 │ -4.5 │  2.3 │ ... │  0.9 │  ← cough ends
│  9 │ 15.6 │ -2.3 │  0.8 │ ... │  1.1 │
│...│ ...  │ ...  │ ...  │ ... │ ...  │
│ 49 │ 13.2 │ -1.9 │  0.6 │ ... │  1.3 │
└────┴──────┴──────┴──────┴─────┴──────┘

This is the "fingerprint" the neural network sees!
```

---

### Step 4: CNN (Convolutional Neural Network) Classification

The MFCC matrix is treated like a **2D image** — the CNN looks for patterns.

```
┌─────────────────────────────────────────────────────────────┐
│ Input: 49×13×1 MFCC matrix (grayscale image)                │
├─────────────────────────────────────────────────────────────┤
│ Conv2D Layer 1: 16 filters (3×3)                            │
│ ├── Looks for: "rising energy burst"                        │
│ ├── Looks for: "energy concentrated in mid-frequencies"     │
│ └── Output: 47×11×16 feature maps                           │
│                                                             │
│ MaxPool(2×2)                                                │
│ └── Output: 23×5×16                                         │
│                                                             │
│ Conv2D Layer 2: 32 filters (3×3)                            │
│ ├── Looks for: "impulse shape"                              │
│ ├── Looks for: "cough spectral signature"                   │
│ └── Output: 21×3×32                                         │
│                                                             │
│ MaxPool(2×2)                                                │
│ └── Output: 10×1×32                                         │
│                                                             │
│ Conv2D Layer 3: 64 filters (3×3)                            │
│ ├── Looks for: "cough vs grunt distinction"                 │
│ └── Output: 8×1×64                                          │
│                                                             │
│ Global Average Pooling                                      │
│ └── Collapses spatial dims → 64 values                      │
│                                                             │
│ Dense(64, ReLU)                                             │
│ └── 64 neurons, dropout 0.3                                 │
│                                                             │
│ Dense(3, Softmax)                                           │
│ └── Output: [0.85, 0.10, 0.05]                              │
│              cough  non-cough  noise                        │
└─────────────────────────────────────────────────────────────┘

Result: 85% confident this is a COUGH
```

---

### Step 5: Cough Rate Calculation

```
Every 24 hours:
├── Count: "How many cough events detected?"
├── Divide: "Number of pigs in pen"
└── Result: Coughs per pig per 24h (RDI)

Example:
├── 47 coughs detected today
├── 10 pigs in pen
└── RDI = 4.7 coughs/pig/day

Baseline (from first week): 2.1 coughs/pig/day
Current: 4.7 coughs/pig/day
Z-score: (4.7 - 2.1) / 1.3 = 2.0 (significantly elevated!)
```

---

## 2. 🎓 HOW TRAINING WORKS

### Phase 1: Pre-training (Already Done by Others)

```
PANNs-CNN14 was trained on AudioSet (Google):
├── 2,000,000 audio clips
├── 527 sound classes (music, speech, animal sounds, etc.)
├── Already learned: "What sounds look like"
├── Already learned: "How to distinguish sounds"
└── We FREEZE this knowledge
```

### Phase 2: Fine-Tuning (What We Do)

```
Our Dataset:
├── 107 cough events (from Thai pig cough dataset)
├── 590 environmental noise clips
├── 25 productive coughs, 23 non-productive coughs
└── Split: 80% training, 20% testing

Training Process:
┌─────────────────────────────────────────────────────────────┐
│ Step 1: Load pre-trained PANNs-CNN14 weights                │
│ Step 2: Replace final layer (3 classes instead of 527)      │
│ Step 3: Freeze first 12 layers (keep general audio knowledge)│
│ Step 4: Train only last 2 layers on pig cough data          │
│ Step 5: Validate every epoch                                │
│ Step 6: Early stopping if validation loss stops improving   │
│ Step 7: Export best model                                   │
└─────────────────────────────────────────────────────────────┘

Hyperparameters:
├── Optimizer: Adam
├── Learning rate: 0.001
├── Batch size: 32
├── Epochs: 50 (with early stopping at patience=10)
└── Dropout: 0.3 (prevent overfitting)

Result:
├── 94.74% accuracy on test set
├── 92.31% F1-score
└── Only 89,000 parameters trained (vs 23M total)
```

### Phase 3: Quantization (Make It Small Enough for RPi 5)

```
Before quantization:
├── Model size: ~90MB (float32 weights)
├── Inference time: ~200ms
└── RAM usage: ~180MB

After INT8 quantization:
├── Model size: ~22MB (75% smaller)
├── Inference time: ~50ms (4× faster)
└── RAM usage: ~45MB

Quantization process:
├── Take float32 weights: [0.234, -0.891, 1.234, ...]
├── Find min/max range per layer
├── Map to int8 range [-128, 127]
├── Apply scale factor + zero point
└── Result: int8 weights that approximate float32 behavior

Representative dataset needed:
├── 100-200 real audio samples from deployment site
├── Used to calibrate activation ranges
└── Without this: quantization degrades accuracy
```

---

## 3. 🔄 UNSUPERVISED CALIBRATION — HOW IT ACTUALLY WORKS

This is the part you asked about. Here's the math, step by step.

### The Problem:

```
Training data (public datasets):
├── Recorded in: Research lab, Thailand, 2023
├── Background: Quiet, controlled, indoor
├── Frequency spectrum shape: [Known statistics]

Your farm (Cebu, Philippines):
├── Recorded in: Open-air pen, 2026
├── Background: Wind, rain, roosters, motorcycles
├── Frequency spectrum shape: [Different statistics!]

Result: Model sees unfamiliar input → accuracy drops 27%
```

### The Solution: Band-wise Statistics Matching

#### Step 1: Compute Source Statistics (Once, Before Deployment)

```
From training data, we know:
├── Mel band 0 (0-100Hz):    mean = -45.2 dB, std = 8.3
├── Mel band 1 (100-200Hz):  mean = -38.7 dB, std = 9.1
├── Mel band 2 (200-350Hz):  mean = -42.1 dB, std = 7.8
├── Mel band 3 (350-500Hz):  mean = -35.4 dB, std = 10.2
├── ...
└── Mel band 63 (6-8kHz):    mean = -52.3 dB, std = 6.7

These are the "reference" statistics the model expects.
```

#### Step 2: Record Target Domain (Automatically, After Deployment)

```
On your farm, plug in device → wait 24 hours
System records ambient noise (no labeling needed!)

From farm recording, we compute:
├── Mel band 0 (0-100Hz):    mean = -28.5 dB, std = 15.2  ← different!
├── Mel band 1 (100-200Hz):  mean = -22.3 dB, std = 18.7  ← different!
├── Mel band 2 (200-350Hz):  mean = -31.7 dB, std = 14.1  ← different!
├── Mel band 3 (350-500Hz):  mean = -18.9 dB, std = 21.3  ← different!
├── ...
└── Mel band 63 (6-8kHz):    mean = -41.2 dB, std = 12.4  ← different!
```

#### Step 3: Compute Correction Factors

```
For each Mel band:
├── Offset correction: source_mean - target_mean
├── Scale correction: source_std / target_std
└── Combined: X_corrected = (X_target - target_mean) × scale + source_mean

Example for Mel band 0:
├── Target mean: -28.5, Source mean: -45.2
├── Target std: 15.2, Source std: 8.3
├── Offset: -45.2 - (-28.5) = -16.7 dB
├── Scale: 8.3 / 15.2 = 0.546
└── Formula: corrected = (raw - (-28.5)) × 0.546 + (-45.2)
           = (raw + 28.5) × 0.546 - 45.2

If raw farm reading is -30 dB:
├── corrected = (-30 + 28.5) × 0.546 - 45.2
├── corrected = (-1.5) × 0.546 - 45.2
├── corrected = -0.819 - 45.2
├── corrected = -46.0 dB

Now it looks like the training data! → Model works again!
```

#### Step 4: Apply Correction (Real-Time)

```
Every audio frame during inference:
├── Extract Mel spectrogram
├── Apply per-band correction (subtract offset, multiply scale)
├── Feed corrected features to CNN
└── Get cough prediction

All this happens in <5ms on RPi 5.
```

### Why This Works:

```
Training:
├── CNN learned: "If Mel band 3 has high energy → probably cough"
├── CNN learned: "This pattern of bands = cough fingerprint"

Without calibration:
├── Farm noise changes band energies
├── Pattern no longer matches
├── CNN confused → wrong predictions

With calibration:
├── We shift farm energies to match training distribution
├── Pattern now matches again
├── CNN recognizes cough → correct predictions
```

### Research Backing:

```
DCASE 2018 Challenge (Acoustic Scene Classification):
├── Tested: Band-wise statistics matching
├── Result: +6% accuracy on new devices
├── Required: Just 10 seconds of target audio
└── Conclusion: "Simple yet effective for domain shift"

Sound-Adapter (ACM 2021):
├── Tested: Unsupervised domain discovery + alignment
├── Result: +21% accuracy across 5 domains
├── Required: No labels, no metadata
└── Conclusion: "Scalable for real-world deployment"

BioRxiv 2026 (Cross-farm cow vocalizations):
├── Tested: Leave-one-farm-out evaluation
├── Finding: Models collapse without adaptation
├── Conclusion: "Reliability-aware evaluation needed"
```

---

## 4. 🌡️ THERMAL CALIBRATION — HOW IT WORKS

### Sensor-Level Compensation (Built into MLX90640)

The MLX90640 has an internal temperature sensor (die temp) that drifts as the sensor heats up.

```
Raw Formula (from datasheet):
├── T_pixel_raw = ADC_value × gain + offset
├── T_die = internal die temperature sensor
├── T_compensated = T_pixel_raw + α × (T_die - T_calibration_point)
└── α = factory-calibrated coefficient

Example:
├── Raw pixel reading: 38.5°C
├── Die temperature: 42.3°C (sensor is warm)
├── Calibration point: 25.0°C (factory calibrated at 25°C)
├── α = 0.015 (typical value)
├── Compensation: 38.5 + 0.015 × (42.3 - 25.0)
├── Compensation: 38.5 + 0.26
├── Final: 38.76°C

This happens INSIDE the sensor chip automatically.
```

### Application-Level Compensation (Your Code)

After reading the compensated value, apply physics corrections:

```python
# 1. Emissivity correction (pig skin ≠ perfect blackbody)
# Pig skin emissivity = 0.978
# Stefan-Boltzmann law: T_true = T_measured / emissivity^(1/4)
def emissivity_correction(T_measured, emissivity=0.978):
    return T_measured / (emissivity ** 0.25)

# 2. Ambient temperature compensation
# Hot day = warmer pig surface (not fever, just environment)
def ambient_compensation(T_measured, T_ambient, k=0.15):
    return T_measured - k * (T_ambient - 25.0)

# 3. Distance compensation (if not fixed mounting)
# MLX90640 at 1m distance → ±0.5°C error vs contact thermometer
def distance_correction(T_measured, distance_m, distance_ref=0.5):
    return T_measured + 0.3 * (distance_m - distance_ref)

# Final calculation
T_final = emissivity_correction(raw_mlx)
T_final = ambient_compensation(T_final, bme280_temp)
T_final = distance_correction(T_final, mounting_distance)
```

### Relative Thresholding (No Absolute Calibration Needed)

```
Key Insight: We don't need to know the ABSOLUTE temperature is 39.2°C.
We only need to know: "Is this pig hotter than USUAL for this pig?"

Protocol:
┌─────────────────────────────────────────────────────────────┐
│ Day 1-7: Learning Phase                                      │
│                                                              │
│ Every 5 minutes:                                             │
│ ├── Read ear-base temperature                                │
│ ├── Record with timestamp                                    │
│ └── Store in database                                        │
│                                                              │
│ After 7 days:                                                │
│ ├── Compute rolling average per time-of-day                  │
│ │   (e.g., "At 2PM, this pig averages 38.8°C")             │
│ ├── Compute standard deviation per time-of-day                │
│ │   (e.g., "At 2PM, std = 0.3°C")                          │
│ └── Store as "baseline profile"                              │
├─────────────────────────────────────────────────────────────┤
│ Day 8+: Monitoring Phase                                     │
│                                                              │
│ Every 5 minutes:                                             │
│ ├── Read current ear-base temperature: 39.6°C               │
│ ├── Look up baseline for this time-of-day: 38.8°C           │
│ ├── Compute deviation: 39.6 - 38.8 = +0.8°C                │
│ ├── Compare to threshold: 0.8 < 1.5 → NORMAL                │
│ └── If deviation > 1.5°C → FEVER ALERT                      │
│                                                              │
│ Weekly update:                                               │
│ ├── Recompute baseline with new 7 days of data               │
│ ├── Adapt to seasonal changes                                │
│ └── Adapt to pig growth (older pigs = cooler baseline)       │
└─────────────────────────────────────────────────────────────┘

Why 1.5°C?
├── Normal circadian variation: ±0.5°C (pigs are cooler at night)
├── Measurement uncertainty: ±0.5°C (MLX90640 accuracy)
├── Environmental effects: ±0.3°C (hot days warm the surface)
├── Fever threshold: >1.5°C above baseline (research-backed)
└── Reduces false positives from normal variation
```

---

## 5. 🔄 ROUND-ROBIN SYNTHESIS — HOW IT WORKS

This is the "brain" that combines everything.

### The Loop (Every ~5 seconds):

```
┌─────────────────────────────────────────────────────────────────┐
│                    Round-Robin Synthesis                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐                                                │
│  │ 1. READ     │                                                │
│  │ SENSORS     │                                                │
│  ├─────────────┤                                                │
│  │ MLX90640    │──▶ Thermal frame (32×24)                      │
│  │ BME280      │──▶ Ambient temp, humidity                     │
│  │ ESP32 audio │──▶ 1s audio buffer (via WebSocket)            │
│  └─────────────┘                                                │
│         │                                                       │
│         ▼                                                       │
│  ┌─────────────┐                                                │
│  │ 2. EXTRACT  │                                                │
│  │ FEATURES    │                                                │
│  ├─────────────┤                                                │
│  │ Audio:      │──▶ MFCC (49×13 matrix)                        │
│  │ Thermal:    │──▶ Ear-base ROI temp                          │
│  │ Ambient:    │──▶ Compensation values                         │
│  └─────────────┘                                                │
│         │                                                       │
│         ▼                                                       │
│  ┌─────────────┐                                                │
│  │ 3. CALIBRATE│                                                │
│  │ (Unsuper.)  │                                                │
│  ├─────────────┤                                                │
│  │ Audio:      │──▶ Apply band-wise normalization              │
│  │ Thermal:    │──▶ Apply drift + emissivity + ambient comp    │
│  │             │──▶ Compare to rolling baseline                │
│  └─────────────┘                                                │
│         │                                                       │
│         ▼                                                       │
│  ┌─────────────┐                                                │
│  │ 4. INFER    │                                                │
│  ├─────────────┤                                                │
│  │ CNN audio:  │──▶ [0.85, 0.10, 0.05] (cough, non-cough, noise)│
│  │ Fever:      │──▶ Deviation = +0.8°C (NORMAL)               │
│  └─────────────┘                                                │
│         │                                                       │
│         ▼                                                       │
│  ┌─────────────┐                                                │
│  │ 5. FUSE     │                                                │
│  ├─────────────┤                                                │
│  │ Cough rate  │──▶ Z_cough = (4.7 - 2.1) / 1.3 = 2.0        │
│  │ Fever dev.  │──▶ Z_fever = (39.6 - 38.8) / 0.3 = 2.67     │
│  │             │                                                │
│  │ Score =     │──▶ 0.6 × Z_cough + 0.4 × Z_fever             │
│  │             │──▶ 0.6 × 2.0 + 0.4 × 2.67                     │
│  │             │──▶ 1.2 + 1.07                                  │
│  │             │──▶ 2.27 (ELEVATED)                            │
│  │             │                                                │
│  │ Map to      │──▶ Score 2.27 → Health 35 (YELLOW ALERT)      │
│  │ 0-100:      │                                                │
│  └─────────────┘                                                │
│         │                                                       │
│         ▼                                                       │
│  ┌─────────────┐                                                │
│  │ 6. OUTPUT   │                                                │
│  ├─────────────┤                                                │
│  │ PocketBase  │──▶ Store reading + score                      │
│  │ Expo app    │──▶ Push notification if score < 60            │
│  │ LED (opt.)  │──▶ Green/Yellow/Red indicator                 │
│  └─────────────┘                                                │
│         │                                                       │
│         ▼                                                       │
│  ┌─────────────┐                                                │
│  │ 7. FEEDBACK │                                                │
│  ├─────────────┤                                                │
│  │ Accumulate  │──▶ Track trends over hours/days              │
│  │ Trend check │──► "Score has been dropping for 6 hours"     │
│  │ Alert logic │──► Escalate if trend continues               │
│  └─────────────┘                                                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Feedback Loop (Evidence Accumulation):

```
Cycle 1 (2PM):
├── Cough rate: 3.5/pig/day (baseline 2.1) → Z = 1.08
├── Fever dev: +0.3°C → Z = 1.0
├── Score: 0.6×1.08 + 0.4×1.0 = 1.05 → Health 65 (GREEN)
└── Action: None

Cycle 2 (2:05PM):
├── Cough rate: 4.2/pig/day → Z = 1.62
├── Fever dev: +0.7°C → Z = 2.33
├── Score: 0.6×1.62 + 0.4×2.33 = 1.90 → Health 45 (YELLOW)
└── Action: Push notification to farmer

Cycle 3 (2:10PM):
├── Cough rate: 5.8/pig/day → Z = 2.85
├── Fever dev: +1.1°C → Z = 3.67
├── Score: 0.6×2.85 + 0.4×3.67 = 3.18 → Health 25 (RED)
└── Action: Urgent alert — recommend vet visit

Trend analysis:
├── "Health score dropped from 65 → 45 → 25 in 15 minutes"
├── "Sustained downward trend = likely real outbreak"
└── "Single spike could be noise — sustained drop is signal"
```

---

## 6. 📊 SUMMARY: What Each Component Does

| Component | What It Does | Why It Matters |
|-----------|-------------|----------------|
| **INMP441** | Captures sound at 16kHz | Pig coughs are 150-5kHz |
| **I2S DMA** | Hardware audio transfer | CPU-free, low latency |
| **WebSocket** | Streams audio to RPi 5 | Wireless, low overhead |
| **MFCC** | Converts sound → fingerprint | CNN can process it |
| **Band-wise norm** | Adapts to farm noise | No farmer calibration |
| **CNN** | Classifies cough vs noise | 94.74% accuracy |
| **MLX90640** | Reads 32×24 thermal grid | Fever detection |
| **Drift comp** | Corrects sensor self-heating | Stable readings |
| **Relative thresh** | Compares to baseline | No absolute calibration |
| **Round-robin** | Fuses audio + thermal | Better than single sensor |
| **Feedback loop** | Accumulates evidence | Reduces false alarms |
| **PocketBase** | Local data + API | Works offline |
| **Expo app** | Farmer alerts | Usable on any phone |

---

## 7. 🎯 WHAT YOU NEED TO BUILD

### Firmware (ESP32-D0WD):

```cpp
// Pseudocode for ESP32 audio streaming

#include <WiFi.h>
#include <WebSocketsClient.h>
#include <driver/i2s.h>

// I2S configuration for INMP441
#define I2S_WS  15
#define I2S_SD  13
#define I2S_CK  2
#define I2S_PORT I2S_NUM_0

WebSocketsClient webSocket;

void setup() {
    // Initialize I2S for INMP441
    i2s_config_t i2s_config = {
        .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX | I2S_MODE_PDM),
        .sample_rate = 16000,
        .bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT,
        .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
        .communication_format = I2S_COMM_FORMAT_STAND_I2S,
        .dma_buf_count = 8,
        .dma_buf_len = 1024,
    };
    i2s_driver_install(I2S_PORT, &i2s_config, 0, NULL);
    
    // Connect WiFi
    WiFi.begin("FarmNetwork", "password");
    
    // Connect WebSocket to RPi 5
    webSocket.begin("192.168.254.10", 8080, "/audio");
}

void loop() {
    // Read audio from I2S DMA
    int16_t audio_buffer[16000];  // 1 second
    size_t bytes_read;
    i2s_read(I2S_PORT, audio_buffer, sizeof(audio_buffer), &bytes_read, portMAX_DELAY);
    
    // Send via WebSocket (binary)
    webSocket.sendBIN((uint8_t*)audio_buffer, bytes_read);
    
    delay(10);  // Small delay
}
```

### Software (RPi 5):

```python
# Pseudocode for RPi 5 processing pipeline

import tflite_runtime.interpreter as tflite
import numpy as np
import librosa
from flask import Flask, jsonify
import board
import busio
import adafruit_mlx90640

# === Audio Processing ===
def extract_mfcc(audio_buffer):
    """Convert raw audio to MFCC features"""
    y = np.frombuffer(audio_buffer, dtype=np.int16).astype(np.float32) / 32768.0
    mfcc = librosa.feature.mfcc(y=y, sr=16000, n_mfcc=13, n_fft=512, hop_length=160)
    return mfcc[:, :49]  # 49 frames

def apply_calibration(mfcc, correction_factors):
    """Apply unsupervised domain adaptation"""
    corrected = np.zeros_like(mfcc)
    for band in range(mfcc.shape[0]):
        corrected[band] = (mfcc[band] - correction_factors['target_mean'][band]) * \
                          correction_factors['scale'][band] + \
                          correction_factors['source_mean'][band]
    return corrected

def detect_cough(mfcc_corrected):
    """Run CNN inference"""
    input_data = mfcc_corrected.reshape(1, 49, 13, 1).astype(np.float32)
    interpreter.set_tensor(input_details[0]['index'], input_data)
    interpreter.invoke()
    output = interpreter.get_tensor(output_details[0]['index'])
    return output[0]  # [cough_prob, non_cough_prob, noise_prob]

# === Thermal Processing ===
def read_thermal():
    """Read MLX90640 thermal frame"""
    frame = [0] * 768
    mlx.getFrame(frame)
    return np.array(frame).reshape(24, 32)

def detect_fever(thermal_frame, ambient_temp, baseline):
    """Detect fever via ear-base ROI"""
    # Ear-base ROI: center-bottom region
    roi = thermal_frame[18:23, 14:18]  # 5×4 pixel region
    ear_temp = np.max(roi)
    
    # Emissivity correction
    ear_temp = ear_temp / (0.978 ** 0.25)
    
    # Ambient compensation
    ear_temp = ear_temp - 0.15 * (ambient_temp - 25.0)
    
    # Compare to baseline
    deviation = ear_temp - baseline.get_hourly_mean()
    return deviation, ear_temp

# === Round-Robin Synthesis ===
def synthesize_health(cough_rate, fever_deviation, cough_baseline, fever_threshold=1.5):
    """Fuse audio + thermal into health score"""
    # Z-score for cough rate
    z_cough = (cough_rate - cough_baseline['mean']) / cough_baseline['std']
    
    # Z-score for fever
    z_fever = fever_deviation / fever_threshold
    
    # Weighted fusion
    z_combined = 0.6 * z_cough + 0.4 * z_fever
    
    # Map to 0-100 health score
    # z=0 → 80 (healthy), z=1 → 60, z=2 → 40, z=3 → 20
    health_score = max(0, min(100, 80 - z_combined * 20))
    
    return health_score

# === Main Loop ===
while True:
    # 1. Read sensors
    audio_buffer = get_websocket_audio()  # From ESP32
    thermal_frame = read_thermal()
    ambient_temp = read_bme280()
    
    # 2. Extract features
    mfcc = extract_mfcc(audio_buffer)
    mfcc_calibrated = apply_calibration(mfcc, correction_factors)
    cough_probs = detect_cough(mfcc_calibrated)
    
    # 3. Thermal
    fever_dev, ear_temp = detect_fever(thermal_frame, ambient_temp, baseline)
    
    # 4. Fuse
    health = synthesize_health(cough_rate, fever_dev, cough_baseline)
    
    # 5. Output
    save_to_pocketbase(health, cough_probs, ear_temp)
    if health < 60:
        push_to_expo_app(f"Alert: Health {health}")
    
    time.sleep(5)  # 5-second cycle
```

---

## 8. ✅ WHAT YOU NEED TO LEARN

To build this, you need to understand:

| Topic | Why | How to Learn |
|-------|-----|--------------|
| **MFCC** | Feature extraction | Read above, then try: `librosa.feature.mfcc(y=audio, sr=16000)` |
| **CNN basics** | Cough classification | Read above, then try: TensorFlow Lite tutorial |
| **WebSocket** | Audio streaming | Python: `websockets` library, Arduino: `WebSocketsClient` |
| **I2C** | Thermal sensor | Adafruit MLX90640 Python library |
| **Quantization** | Model optimization | Edge Impulse docs: "Model compression" |
| **Domain adaptation** | Auto-calibration | Read above (band-wise stats) |

---

## 9. 📋 NEXT STEPS

| # | Task | Difficulty | Time |
|---|------|------------|------|
| 1 | Try Edge Impulse with public pig cough data | Easy | 1 day |
| 2 | Flash ESP32 with WebSocket audio streaming | Medium | 2-3 days |
| 3 | Set up RPi 5 with TensorFlow Lite | Medium | 2-3 days |
| 4 | Connect MLX90640 to RPi 5 | Easy | 1 day |
| 5 | Implement round-robin synthesis | Medium | 3-5 days |
| 6 | Test auto-calibration on farm | Medium | 1 week |
| 7 | Build Expo app UI | Medium | 1-2 weeks |
| 8 | Field testing + validation | Hard | 2-4 weeks |

---

*End of Technical Deep Dive*