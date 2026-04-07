# 🗺️ Project Pig Health Monitor: The 6-Era Strategic Roadmap

> **Canonical Reference:** See `PIG_HEALTH_MONITOR_COMPLETE_RESEARCH.md` for full technical detail.

| **Era** | **Timeline** | **Objective** | **Key Deliverable** |
| :--- | :--- | :--- | :--- |
| **1. The Vague Spark** | Months 1–2 | Literature Review + Conceptual Framework | Concept Paper, Scope/Delimitations, BOM |
| **2. Breadboard Purgatory** | Months 3–4 | Hardware Assembly + First TinyML Test | Working I2S Mic + 85% accuracy on MFE |
| **3. The Barn Odyssey** | Months 5–6 | Field Data Collection (500+ samples) | "Golden Dataset" of real pig coughs |
| **4. The Digital Bridge** | Months 7–8 | Supabase + Expo Dashboard Integration | Real-time phone vibration on cough detect |
| **5. The Paper War** | Months 9–10 | Statistical Validation + Chapter 1–5 | Confusion Matrix + F1 Score results |
| **6. Defense & Legacy** | Months 11–12 | Panel Presentation + Publication | Final Prototype + Defense PPT |

---

## 🛠️ Detailed Breakdown by Role

### 🧙‍♂️ Era 2: Breadboard Purgatory (Hardware Focus)
*   **Hardware (Member 1):**
    *   [ ] Solder ESP32-S3 (N16R8) headers
    *   [ ] Wire 2× INMP441 Mics (Pins: SD=10, WS=11, SCK=12)
    *   [ ] Wire MLX90640 Thermal Camera (I2C: SDA, SCL)
    *   [ ] Wire BME280 Environmental Sensor (I2C)
    *   [ ] Flash `main.cpp` "Mic Test" firmware
    *   [ ] Verify audio waves in Arduino Serial Plotter
*   **Software (Member 2):**
    *   [ ] Set up PlatformIO environment
    *   [ ] Write Python script to save Serial data to `.wav` files
*   **App (Member 3):**
    *   [ ] Init Expo (React Native) project with Router
    *   [ ] Design the "Dashboard" wireframe (Figma)

### 🐖 Era 3: The Barn Odyssey (Data Collection)
*   **Mission:** Go to a local piggery (Balamban or target breed farm)
*   **Action:** Record 24+ hours of audio with dual-mic setup
*   **Labeling:** Cut audio into 1–2 second chunks:
    *   `cough_001.wav`, `squeal_001.wav`, `rain_001.wav`, `silence_001.wav`
*   **Target:** 500+ coughs, 500+ noise samples minimum
*   **Thermal:** Capture MLX90640 readings of healthy vs. sick pigs

### 🧠 Era 4: The Training + Integration (AI + Cloud)
*   **Edge Impulse:**
    *   [ ] Upload `.wav` files to Edge Impulse
    *   [ ] Extract MFE features (40 filters, -72dB noise floor)
    *   [ ] Train MobileNetV2 (0.1 alpha) — target >90% accuracy
    *   [ ] Export as C++ Arduino Library (`.zip`)
    *   [ ] Import into PlatformIO firmware
*   **Supabase:**
    *   [ ] Create project on supabase.com
    *   [ ] Run SQL schema (see PIG_HEALTH_MONITOR_COMPLETE_RESEARCH.md §IX)
    *   [ ] Enable Realtime on `health_events` table
*   **Expo App:**
    *   [ ] Connect app to Supabase via `@supabase/supabase-js`
    *   [ ] Build Dashboard with real-time alerts + vibration
    *   [ ] Deploy web via EAS Hosting / Vercel

### 📄 Era 5 & 6: The Paper War & Defense
*   **Paper:** Write Chapters 1–5 (see PIG_HEALTH_MONITOR_COMPLETE_RESEARCH.md §XV)
*   **Testing:** Run device for 72+ hours in field — does it crash?
*   **Confusion Matrix:** 100 coughs × 100 noises → precision, recall, F1
*   **Defense:** Prepare for "Kill Questions" (see §XIII)

---

## 🛑 Critical Path (Don't Fail Here)
1.  **Power:** Dual 18650 + Deep Sleep — the panel's favorite attack
2.  **Dataset:** Real pig coughs REQUIRED — human coughs have different spectrograms
3.  **Scope Shield:** "Decision Support Tool" — NOT a veterinary diagnosis system
4.  **The Fox:** Spectral Subtraction + Debounce (3-in-10s) = no false positives from rain/gates
