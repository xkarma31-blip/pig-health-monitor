# 🐷 Pig Health Monitor — Technical Setup Manual

> **Title Defense Reference Document**  
> Version 2.0 — April 27, 2026  
> Capstone Project: IoT-Based Pig Health Monitoring System

---

## 1. System Architecture Overview

The Pig Health Monitor is a multi-modal IoT system for automated, real-time health surveillance of commercial pig farms. It consists of three integrated subsystems:

| Subsystem | Hardware | Function |
|-----------|----------|----------|
| **Thermal Perception** | MLX90640 (32×24 IR array) via I2C | Fever detection, pig identification via thermal embeddings |
| **Acoustic Perception** | Dual INMP441 I2S Microphones | Cough classification (infectious vs. non-infectious) via spectral subtraction |
| **Cloud Intelligence** | Firebase RTDB + Expo Mobile App | Real-time telemetry, alert dispatch, and remote monitoring dashboard |

### Architecture Diagram

```
┌─────────────────────────────────────────────┐
│              ESP32-S3 DevKitC-1             │
│  ┌─────────────┐    ┌──────────────────┐    │
│  │  Core 0     │    │  Core 1          │    │
│  │  Audio Task │    │  Thermal Task    │    │
│  │  (I2S+FFT)  │    │  (I2C+Firebase)  │    │
│  └──────┬──────┘    └────────┬─────────┘    │
│         │                    │              │
│  ┌──────▼──────┐    ┌────────▼─────────┐    │
│  │ INMP441 x2  │    │  MLX90640        │    │
│  │ (Stereo)    │    │  (32x24 IR)      │    │
│  └─────────────┘    └──────────────────┘    │
└─────────────────┬───────────────────────────┘
                  │ WiFi / Local AP
                  ▼
┌─────────────────────────────────────────────┐
│         Firebase Realtime Database          │
│  /telemetry  /alerts  /roster  /commands    │
└─────────────────┬───────────────────────────┘
                  │
    ┌─────────────┼─────────────┐
    ▼             ▼             ▼
┌────────┐  ┌─────────┐  ┌──────────┐
│ Mobile │  │ Web     │  │ Notif.   │
│ App    │  │ Dash    │  │ Service  │
│ (Expo) │  │(Vercel) │  │ (Node)   │
└────────┘  └─────────┘  └──────────┘
```

---

## 2. Hardware Requirements

| Component | Model | Qty | Purpose |
|-----------|-------|-----|---------|
| Microcontroller | ESP32-S3 DevKitC-1 | 1 | Dual-core processing (FreeRTOS) |
| Thermal Sensor | MLX90640 | 1 | 32×24 IR thermal array |
| Microphone (Target) | INMP441 I2S MEMS | 1 | Pig vocalization capture |
| Microphone (Ambient) | INMP441 I2S MEMS | 1 | Environmental noise reference |
| Power Supply | 5V 2A USB-C | 1 | ESP32 power |

### Pin Configuration

| Signal | ESP32-S3 Pin | Notes |
|--------|-------------|-------|
| I2S Serial Data (SD) | GPIO 10 | Mic DIN |
| I2S Word Select (WS) | GPIO 11 | Mic LRC |
| I2S Clock (SCK) | GPIO 12 | Mic BCLK |
| I2C SDA | GPIO 21 | MLX90640 |
| I2C SCL | GPIO 22 | MLX90640 |

**I2C Speed**: 1 MHz (Fast Mode Plus) — required for 768-pixel throughput at ≥2 Hz.

---

## 3. Software Dependencies

### 3.1 Firmware (PlatformIO)

```ini
[env:esp32-s3-devkitc-1]
platform = espressif32
board = esp32-s3-devkitc-1
framework = arduino

lib_deps =
    mobizt/Firebase Arduino Client Library for ESP8266 and ESP32 @ ^4.4.14
    arduino-libraries/NTPClient @ ^3.2.1
    bblanchon/ArduinoJson @ ^7.0.4
    adafruit/Adafruit MLX90640 @ ^1.0.2
    kosme/arduinoFFT @ ^2.0.2
```

**Memory Usage (last build):** RAM 22.9% | Flash 33.3%

### 3.2 Mobile App (Expo / React Native)

- **Runtime**: Expo SDK 54 with Expo Router v6
- **Firebase**: `firebase ^11.6.0` (Web SDK for RTDB)
- **Charts**: Custom SVG bar chart via `react-native-svg` (no external chart library)

### 3.3 Backend Services (Node.js — systemd)

| Service | File | systemd Unit | Purpose |
|---------|------|-------------|---------|
| Thermal Simulator | `seed_live_thermal.mjs` | `pig-health-thermal.service` | Multi-pig stress test with cycling scenarios |
| Push Notifications | `notification_service.mjs` | `pig-health-notifications.service` | Dispatches Expo push alerts for HIGH/CRITICAL severity |

---

## 4. Firebase Database Structure

```
root/
├── telemetry/
│   └── esp32-s3-01/
│       ├── temperature: 38.5
│       ├── status: "NORMAL"
│       ├── identifiedPig: "Boss Hog"
│       ├── thermalFrame: "<base64 encoded 32x24 frame>"
│       ├── targetX: 16
│       ├── targetY: 12
│       └── timestamp: 1714200000000
├── roster/
│   ├── boss_hog/
│   │   ├── name: "Boss Hog"
│   │   ├── temperature: 38.5
│   │   ├── status: "NORMAL"
│   │   ├── tags: []
│   │   └── lastSeen: 1714200000000
│   └── peppa/ ...
├── alerts/
│   └── <auto-push-id>/
│       ├── pig: "Peppa"
│       ├── type: "FEVER_AND_COUGH_DETECTED"
│       ├── severity: "CRITICAL"
│       ├── message: "..."
│       ├── status: "active"
│       └── timestamp: 1714200000000
├── sensors/ (environment readings)
└── commands/
    └── esp32-s3-01/
        ├── command: "ENROLL_START"
        └── pigName: "New Pig"
```

### Security Rules

```json
{
  "rules": {
    ".read": "now < 1780243200000",
    ".write": "now < 1780243200000"
  }
}
```

**Expiry**: May 31, 2026. For production, implement `auth != null` rules.

---

## 5. Deployment Instructions

### 5.1 Firmware Upload (ESP32-S3)

```bash
# 1. Install PlatformIO
pip install platformio

# 2. Create firmware/include/secrets.h
cat > firmware/include/secrets.h << 'EOF'
#define WIFI_SSID "your-wifi"
#define WIFI_PASSWORD "your-password"
#define FIREBASE_API_KEY "AIzaSy..."
#define FIREBASE_DATABASE_URL "https://your-project.firebaseio.com"
#define FIREBASE_USER_EMAIL "your@email.com"
#define FIREBASE_USER_PASSWORD "your-password"
EOF

# 3. Build and upload
cd firmware
pio run --target upload

# 4. Monitor serial output
pio device monitor
# Expected: "🐷 Pig Health Monitor: Operational. Dual-Core Ritual Active."
```

### 5.2 Mobile App (Expo)

```bash
cd mobile_app

# 1. Install dependencies
npm install

# 2. Configure environment
echo "EXPO_PUBLIC_FIREBASE_API_KEY=your-api-key" > .env

# 3. Development
npx expo start           # Dev server (press 'w' for web, scan QR for mobile)

# 4. Production web export
npx expo export -p web   # Output: dist/ (deploy to Vercel/Netlify)
```

### 5.3 Background Services (Linux systemd)

```bash
# Enable and start
systemctl --user enable pig-health-thermal.service
systemctl --user enable pig-health-notifications.service
systemctl --user start pig-health-thermal.service
systemctl --user start pig-health-notifications.service

# Persist across logout (required for headless servers)
loginctl enable-linger $USER

# Check status
systemctl --user status pig-health-thermal.service
systemctl --user status pig-health-notifications.service
```

---

## 6. Algorithm Reference

### 6.1 Thermal Identification (Zero-Shot Siamese Embedding)

1. Read 768-pixel (32×24) frame from MLX90640 via I2C
2. Apply **Min-Max normalization** to [0, 1] range (robust to ambient temperature shifts)
3. Store normalized frame as 768-float embedding in SPIFFS (`/roster.bin`)
4. For identification: compute **Cosine Similarity** against all enrolled embeddings
5. Thresholds:
   - **>0.95**: Confirmed identity
   - **0.85–0.95**: Near match (prompt re-enrollment)
   - **<0.85**: Unknown pig → auto-enroll with `NEW_ENROLLMENT` tag

### 6.2 Acoustic Classification (Dual-Mic Spectral Subtraction)

Based on peer-reviewed research (NIH / ASABE):

1. Read stereo I2S buffer (Channel 0: Target mic, Channel 1: Ambient mic)
2. Apply **RMS silence gate** (skip FFT if room is quiet, threshold: 50)
3. Compute **512-point FFT** with Hamming window on both channels
4. **Spectral Subtraction**: Subtract ambient magnitude from target magnitude per-bin
5. Extract diagnostic frequency bands:
   - **Band A (500–800 Hz)**: Infectious cough marker (moist/expectoration)
   - **Band B (1200–2000 Hz)**: Non-infectious cough marker (dry)
6. Compute **dynamic noise floor** from bins >4 kHz (above pig vocalization range)
7. Apply dual threshold: SNR > 5× noise floor AND absolute magnitude > 1500
8. Classify by dominant band energy

### 6.3 Veterinary Health Parameters

| Parameter | Normal Range | Warning | Critical |
|-----------|-------------|---------|----------|
| Core Temperature | 38.5–39.5°C | >39.5°C | >40.5°C |
| Respiratory Rate | 15–40 bpm | >40 bpm | >50 bpm |
| Activity Level | Baseline | <50% baseline | <10% (Lethargy) |
| Hypothermia | — | <37.5°C | <36.0°C |

---

## 7. Stress Test Simulation Cycle

The simulation (`seed_live_thermal.mjs`) runs on a **120-tick cycle** (1 tick/second):

| Tick | Event | Alert Type | Severity |
|------|-------|-----------|----------|
| 0–19 | Normal operation (2 pigs orbiting trough) | — | — |
| 20 | New unidentified pig appears (auto-enrollment) | `ZERO_SHOT_ENROLLMENT` | LOW |
| 40 | Peppa develops fever (40.5°C) + respiratory distress | `FEVER_AND_COUGH_DETECTED` | CRITICAL |
| 60–79 | Boss Hog becomes lethargic (stops moving) | `LETHARGY_DETECTION` | HIGH |
| 80 | Boss Hog recovers normal activity | — | — |
| 100 | Peppa fever subsides (38.6°C) after intervention | `RECOVERY_CONFIRMED` | LOW |
| 120 | **Cycle resets** — all pigs return to baseline | — | — |

---

## 8. Mobile App Features

| Tab | Screen | Key Features |
|-----|--------|-------------|
| 📊 Dashboard | `index.tsx` | Hero card (identified pig + temp), cough count, quick stats, active roster with health tags |
| 🌡️ Sensors | `sensors.tsx` | Live sensor grid, thermal heatmap visualization |
| 🔔 Alerts | `alerts.tsx` | SVG cough frequency chart (8h trend), filter pills, chronological alert log |
| 🐗 Roster | `roster.tsx` | Pig enrollment, Mountain Mode toggle, tag management (Fever/Respiratory/Lethargic) |

---

## 9. Troubleshooting

| Symptom | Cause | Solution |
|---------|-------|---------|
| MLX90640 not found | I2C wiring or clock speed | Verify SDA/SCL pins. Ensure `Wire.setClock(1000000)` |
| Firebase auth fails | Expired rules or wrong credentials | Check `database.rules.json` expiry. Verify `.env` API key |
| No cough alerts | Silence gate too aggressive | Lower `SILENCE_RMS` in `AcousticSignature.h` (default: 50) |
| Dashboard shows mock data | Firebase empty or disconnected | Check if `pig-health-thermal.service` is running |
| Permanent fever in simulation | Old simulation script | Restart: `systemctl --user restart pig-health-thermal.service` |
| Web build fails | Missing dependencies | Run `npm install` then `npx expo export -p web` |

---

*This document serves as the technical reference for the Title Defense on May 12, 2026.*
