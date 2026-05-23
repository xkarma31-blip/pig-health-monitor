# 🧠 Pig Health Monitor: Technical Architecture & Engineering Specs

> **Objective:** Define exactly *WHAT* to code, from the Signal Processing (DSP) to the Tensor Operations (AI).

---

## 1. High-Level Data Flow (The "Broader" View)
Everything happens on the **ESP32-S3**.

```mermaid
graph LR
    MicA[INMP441 Mic A] -->|I2S Stream| DSP[DSP Engine: Spectral Sub]
    MicB[INMP441 Mic B] -->|I2S Stream| DSP
    DSP -->|MFE Spectrogram| AI[TinyML: MobileNetV2]
    AI -->|Inference Result| Logic[Application Logic]
    Logic -->|Realtime Alert| Firebase RTDB[Cloud: Firebase RTDB]
    Therm[MLX90640 Thermal] -->|I2C 32x24| Tracking[Spatiotemporal Tracking]
    Tracking -->|Individual ID| Logic
```

---

## 2. The Auditory Cortex (DSP Pipeline)

Before the AI "thinks," we must process the raw sound.

### A. Audio acquisition (The "Ear")
*   **Sample Rate:** 16,000 Hz (Standard for Speech/Cough).
*   **Bit Depth:** 16-bit Signed Integers (`int16_t`).
*   **Window Size:** 1 Second (16,000 samples).

### B. Noise Handling (The "Filter")
*   **Problem:** Rain creates "White Noise" (energy across all frequencies).
*   **Algorithm to Code:** **Spectral Subtraction**.
    *   *Step 1:* Compute FFT (Fast Fourier Transform) of the signal.
    *   *Step 2:* Estimate "Noise Profile" during silent periods.
    *   *Step 3:* Subtract Noise Profile from current FFT.
    *   *Step 4:* Reconstruct signal (Inverse FFT) OR feed FFT directly to AI.

### C. Feature Extraction (The "Translation")
The AI does not see "Waves." It sees "Images" (Spectrograms).
*   **Technique:** **MFE (Mel-Frequency Energy)**.
*   **Parameters you will configure in Edge Impulse:**
    *   Frame Length: 0.02s
    *   Frame Stride: 0.01s
    *   Filter Number: 40 (This gives the image "Height").
    *   Noise Floor: -72dB.

---

## 3. The Brain (Tensor Processor System)

We use **TensorFlow Lite for Microcontrollers (TFLM)**.

### A. The Model Architecture
We will not code the Neural Network from scratch. We define it in Edge Impulse.
*   **Architecture:** **MobileNetV2** (Scaled down `0.1` or `0.05`).
*   **Why:** It is optimized for image classification (Spectrograms) on low-power CPUs.

### B. The Tensors (Input/Output)
*   **Input Tensor:** `float32 [49, 40, 1]`
    *   49 Time steps (width).
    *   40 Mel Frequencies (height).
    *   1 Color Channel (Monochrome).
*   **Output Tensor:** `float32 [3]` (Softmax Probability).
    *   Index 0: `COUGH` (e.g., 0.95)
    *   Index 1: `NOISE_RAIN` (e.g., 0.02)
    *   Index 2: `SILENCE` (e.g., 0.03)

---

## 4. The Reflex System (Firmware Logic)

This is the C++ code you write in `main.cpp`.

### State Machine Logic
```cpp
enum State {
    LISTEN,     // Filling the buffer
    ANALYZE,    // Running DSP & Inference
    COOLDOWN    // Waiting to avoid spamming alerts
};
```

### The "Debounce" Logic (Critical)
*   **The Issue:** A single cough might trigger the AI 5 times in 1 second.
*   **The Code Fix:**
    *   Implement a **Moving Average Window**.
    *   *Rule:* "Alert only if `COUGH` > 0.8 confidence for 3 consecutive windows."
    *   *Rule:* "Max 1 alert per 10 seconds."

---

## 5. The Thermal Eye (Advanced Identification Subsystem)

The MLX90640 IR Array provides high-resolution non-contact tracking and fever detection.

### A. Sensor Specifications
*   **Resolution:** 32x24 pixels (768 thermopile elements).
*   **Accuracy:** ±1.5°C (Validated for animal body temp).
*   **Interface:** I2C (Address: 0x33).

### B. Tracking Algorithm: Spatiotemporal Thermal Bloom
*   **Objective:** Identify the coughing pig without ear tags.
*   **Algorithm:**
    *   1. The system listens for a `COUGH` detection (Acoustic Trigger).
    *   2. Upon trigger, the thermal buffer captures the subsequent 1 second of data.
    *   3. The sensor looks for a **Thermal Bloom** (pixel-level heat spike of >0.5°C) at the coordinates corresponding to the mouth/head area.
    *   4. Position identified via X/Y coordinates in the 32x24 grid.

### C. Motion History Image (MHI) Fusion
*   **Technique:** Combine thermal intensity with motion vectors.
*   **Rule:** If a heat spike coincides with a "body-jerk" motion pattern (MHI), confidence for individual ID increases to >90%.

### D. Ambient Offset (Philippine Tropical Calibration)
*   **Solution:** Continuous calibration via BME280.
*   **Fever Delta:** `Alert if (MaxHeat - BME_Ambient) > 5.0°C`.

---

## 6. Cloud Infrastructure (Firebase RTDB)
Instead of a simple database, we use **Firebase RTDB** for persistent logs and push notifications.
- **Backend:** PostgreSQL with Realtime Extensions.
- **Protocol:** WebSockets for <1s latency from Barn to Phone.

1.  **DSP Code:** Use the **Edge Impulse SDK**. It auto-generates the MFCC/MFE C++ code for you. You just feed it the buffer.
2.  **Inference Code:** call `run_classifier()`. It takes the features and returns the `result`.
3.  **Application Code:**
    *   `if (result.classification[0].value > 0.8) { trigger_alert(); }`
