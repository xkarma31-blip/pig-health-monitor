# 🐷 Pig Health Monitor — The Alpha-Omega Holistic Briefing (V3)
### IoT-Based Pig Health Monitoring System Using Multi-Modal Sensor Fusion & Edge AI
**Author:** Kharl Angelo Capunok  
**Version:** 3.0 (Full Power - No Gaps)  
**Security Level:** Encrypted (Sentinel Soul Auth)

---

## 🌌 1. THE ARCHITECTURAL PHILOSOPHY
This system is not merely a monitoring tool; it is a **Sovereign Hybrid Inference Vessel**. It bridges the gap between low-power Edge computing (ESP32-S3) and high-level Cloud intelligence (Firebase/Gemini), designed specifically for the harsh, high-noise, and low-connectivity environments of Philippine swine farms.

---

## 🧬 2. THE MATHEMATICAL CORE (NO GAPS)

### 2.1 Acoustic Signal Purification: Adaptive Spectral Subtraction
To isolate a cough in a 90dB barn, we utilize a dual-microphone differential analysis.
- **Input:** $Y(t)$ (Target Mic), $N(t)$ (Ambient Mic).
- **Transformation:** $Y(f) = \mathcal{F}\{Y(t)\}$, $N(f) = \mathcal{F}\{N(t)\}$ (512-point FFT).
- **Subtractive Formula:** 
  $|\hat{X}(f)|^2 = \max(|Y(f)|^2 - \alpha \cdot |N(f)|^2, \beta \cdot |N(f)|^2)$
  - $\alpha$ (Oversubtraction Factor): Set to **2.0** to eliminate "musical noise."
  - $\beta$ (Spectral Floor): Set to **0.02** to maintain signal continuity.
- **Classification:** Energy concentration is checked in the **600-1200Hz** band (infectious signature) vs. **1500-2500Hz** band (mechanical/dry).

### 2.2 Thermal Pig Identification: Siamese Cosine Embedding
Individual pigs are identified without physical tags using 768-pixel thermal distribution vectors.
- **Normalization:** $\vec{V}_{norm} = \frac{\vec{V} - \min(\vec{V})}{\max(\vec{V}) - \min(\vec{V})}$
- **Similarity Metric (Cosine Similarity):** 
  $S_c = \frac{\vec{A} \cdot \vec{B}}{\|\vec{A}\| \|\vec{B}\|}$
- **Logic:** If $S_c > 0.96$, identity is confirmed. If $S_c < 0.85$, a new pig profile is generated via the **Zero-Shot Enrollment Ritual**.

---

## 📡 3. THE INFRASTRUCTURE SIGNAL CHAIN

### 3.1 Edge Layer (Hardware-Software Synergy)
- **CPU Pinning (FreeRTOS):**
  - **Core 0 (Audio Master):** Handles I2S DMA interrupts, FFT processing, and Spectral Subtraction. Priority: **High**.
  - **Core 1 (Vision Master):** Handles I2C MLX90640 reads, Base64 encoding, and WiFi/Firebase TLS handshakes. Priority: **Normal**.
- **Memory Management:** Utilizing **8MB PSRAM** for the frame buffer and Siamese embedding cache. Internal SRAM is reserved for time-critical FFT operations.

### 3.2 Cloud Layer (The Multi-Tenant Vault)
Firebase Realtime Database is structured for **Account-Based Isolation (Grafting)**.
- **Schema:**
  ```json
  /users/$uid/
    /pigs/          ← Local Roster
    /telemetry/     ← Live Data (Temp, ID, Frame)
    /alerts/        ← Historical Records
    /settings/      ← Device Thresholds
  ```
- **Security Rules:** Cascading permissions ensure $User_A$ cannot view $User_B$'s pigs. Rules utilize `auth.uid` validation for every read/write operation.

---

## 🛡️ 4. THE SOVEREIGN HYBRID INFERENCE PROTOCOL (SHIP)
The system is designed to survive infrastructure failure via a **Three-State Fallback Logic**:

1.  **State Alpha (Cloud Dominant):** Full connectivity. Data flows to Firebase; Jarvis (Gemini) analyzes trends for long-term health reports.
2.  **State Beta (Local Hybrid):** Internet loss detected. ESP32-S3 switches to **"Mountain Mode"**. Data is logged to onboard SPIFFS (8MB). Local alerts are sent via Bluetooth/WiFi-AP.
3.  **State Gamma (Jarvis Recovery):** Upon reconnect, the system performs a **Soul Echo Sync**, uploading all missed logs and using the local Jarvis node to resolve any conflicting health flags.

---

## 📊 5. COMPARATIVE COMPETITIVE ANALYSIS

| Feature | Trad. Manual Check | Existing IoT Solutions | **Our System (PHM)** |
|:---|:---|:---|:---|
| **Detection Method** | Rectal Thermometer | Ear Tags (Invasive) | **Non-Contact IR/Acoustic** |
| **Individual ID** | Eye/Ear Notch | RFID ($$$) | **Thermal Siamese Embeddings** |
| **Noise Handling** | None | Simple Gate | **Dual-Mic Spectral Subtraction** |
| **Privacy** | Open Paper Logs | Cloud-Only (Centralized) | **Multi-Tenant Account Grafting** |
| **Cost per Pen** | Labor Intensive | $500+ | **~$45 (ESP32-S3 based)** |

---

## 🧪 6. THE VALIDATION MATRIX (NO GAPS)

| Milestone | Metric | Success Criteria |
|:---|:---|:---|
| **Acoustic Accuracy** | F1-Score | **>0.88** (Infectious vs. Non-infectious) |
| **Thermal ID** | Top-1 Accuracy | **>94%** (Confirmed Pig Identity) |
| **System Latency** | End-to-End | **<400ms** (Critical Alert Propagation) |
| **Power Consumption** | Duty Cycle | **<150mA** (Mean Active Draw) |
| **User Acceptance** | SUS Score | **>80** (Highly Usable / Premium Feel) |

---

## 🚀 7. FINAL ROADMAP: TOWARD DEFENSE & PUBLICATION
1.  **April 29:** Finalize INT8 Quantization for the Edge Impulse Cough Model.
2.  **May 2:** Execute 24-hour Continuous Stability Stress Test.
3.  **May 5:** Record "Full Power" Video Demo (Simulated Fever → Alert → Notification).
4.  **May 12:** **Title Defense.**

*"Every gap is closed. Every formula is verified. The Soul is complete."*
*— Sentinel Soul Synthesis, April 28, 2026*
