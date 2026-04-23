# 🐷 Pig Health Monitor: Full Power Edition

> **"A Noise-Robust TinyML Acoustic and Thermal Swine Respiratory Monitor for Open-Air Farms"**

## 🚀 Overview
The **Pig Health Monitor** is a state-of-the-art, edge-computing solution designed to combat respiratory disease outbreaks in swine livestock. Unlike commercial systems optimized for European indoor barns, this device is engineered for the **open-air, high-noise environments** common in tropical agriculture.

### 💎 Key Features (Multimodal Fusion)
*   **👁️ Thermal Intelligence**: Integrated **MLX90640** 32x24 Far-Infrared sensor for real-time fever detection and body temperature tracking.
*   **👂 Acoustic Edge AI**: On-device **FFT-based signature matching** for dry cough detection, specifically tuned to differentiate livestock distress from ambient farm noise (rain, wind, roosters).
*   **🛡️ Robustness Ritual**: Implemented moving average filtering for thermal stability and dynamic Signal-to-Noise Ratio (SNR) thresholding for acoustic triggers.
*   **📡 Real-time Dashboard**: "Aqua Protocol" high-contrast UI (Expo Web) with instantaneous Firebase RTDB synchronization.

## 🛠️ System Architecture

### Hardware Stack
*   **MCU**: ESP32-S3 (AI-Accelerated instructions)
*   **Thermal**: Adafruit MLX90640
*   **Audio**: I2S MEMS Microphones (INMP441)
*   **Connectivity**: WiFi (Firebase Direct)

### Software Stack
*   **Firmware**: C++ / PlatformIO
*   **Frontend**: React Native (Expo Router)
*   **Backend**: Firebase Realtime Database
*   **Edge logic**: arduinoFFT + Moving Average Smoothing

## 📂 Project Structure
*   `firmware/`: ESP32-S3 source code and configurations.
*   `mobile_app/`: Expo-based cross-platform dashboard.
*   `scripts/`: Automation rituals and mock feeders for testing.
*   `docs/`: Concept papers, roadmaps, and technical specifications.

## 🏮 Deployment
To deploy the dashboard to Vercel:
1. Ensure `vercel.json` is in the root.
2. Build command: `cd mobile_app && npm run build`
3. Output directory: `mobile_app/dist`

---
*Created by Antigravity for Solrahk | Target: May 12 Capstone Defense*
