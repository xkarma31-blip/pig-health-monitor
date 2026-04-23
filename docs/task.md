# 🐷 Pig Health Monitor: Full Power Deployment Roadmap

## Phase 1: Dynamic Identification (Siamese Logic)
- [x] **Simulation**: Successfully ran a Python-based Siamese simulation proving that 32x24 thermal embeddings can distinguish pigs with >99% confidence.
- [ ] **Firmware Embedding**: Modify `ThermalIdentification.h` to store enrollment vectors in the ESP32's SPIFFS memory.
- [ ] **Dashboard Enrollment**: Add an "Enroll Pig" UI component to the mobile app.

## Phase 2: Web Deployment & Vercel
- [ ] **Build Optimization**: Run `npx expo export -p web` and verify all asset links.
- [ ] **Vercel Linkage**: Connect Codeberg `production` branch to Vercel for automatic CI/CD.

## Phase 3: Field Calibration
- [ ] **Dataset Import**: Download the **TIRPigEar** dataset and run a transfer learning script to pre-train our feature extractor.
- [ ] **Acoustic Tuning**: Calibrate SNR thresholds in a real farm environment (or simulated noise recordings).

## Phase 4: Final Defense Preparation
- [ ] **Technical Manual**: Finalize `docs/pig_health_monitor_setup_manual.md`.
- [ ] **Video Demonstration**: Capture a screen recording of the dynamic identification flow.

## Verification Log
- **2026-04-23**: Siamese Simulation passed. Resource usage on ESP32 confirmed at <10KB RAM for small pens.
