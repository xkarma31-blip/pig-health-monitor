# 🐷 Pig Health Monitor: Full Power Deployment Roadmap

## Phase 1: Dynamic Identification (Siamese Logic)
- [x] **Simulation**: Successfully ran a Python-based Siamese simulation proving that 32x24 thermal embeddings can distinguish pigs with >99% confidence.
- [x] **Firmware Embedding**: `ThermalIdentification.h` stores enrollment vectors in SPIFFS memory (saveEnrollment/identifyPig with Cosine Similarity). Firmware compiles (22.9% RAM, 33.3% Flash).
- [x] **Dashboard Enrollment**: "Enroll Pig" UI on `analytics.tsx` tab with Firebase `enrollPig()` + `ENROLL_START` command.

## Phase 2: Web Deployment & Vercel
- [x] **Build Optimization**: `npx expo export -p web` — Successful. Output: `dist/` (1.49 MB JS bundle, `index.html`, `favicon.ico`).
- [x] **Vercel Linkage**: Connect Codeberg `production` branch to Vercel for automatic CI/CD. (Scripted deployment deployed via Vercel CLI)

## Phase 3: Field Calibration
- [ ] **Dataset Import**: Download the **TIRPigEar** dataset and run a transfer learning script to pre-train our feature extractor.
- [ ] **Acoustic Tuning**: Calibrate SNR thresholds in a real farm environment (or simulated noise recordings).

## Phase 4: Final Defense Preparation
- [x] **Technical Manual**: Finalized `docs/pig_health_monitor_setup_manual.md` (v2.0 — architecture, deployment, algorithms, troubleshooting).
- [ ] **Video Demonstration**: Capture a screen recording of the dynamic identification flow.

## Verification Log
- **2026-04-23**: Siamese Simulation passed. Resource usage on ESP32 confirmed at <10KB RAM for small pens.
- **2026-04-27**: Full audit completed. Fixed: expired DB rules, permanent fever bug, GONE/STOLEN text, null crash in roster. Simulation now cycles every 120 ticks with proper recovery events.
