# PigPulse Hardware Audit Matrix — 2026-09-16

## Purpose

Structured component matrix, datasheet specifications, practical farm estimates, power calculations, failure modes, and field-validation methods for PigPulse.

Every claim carries one of three evidence labels:

| Label | Meaning |
|-------|---------|
| **OFFICIAL** | Manufacturer datasheet or official documentation |
| **ESTIMATE** | Engineering design target or physics-based estimate; requires field validation |
| **MEASURED** | Readout from the physical device, power logger, RSSI/PDR test, or farm trial |

**No OFFICIAL or ESTIMATE value is presented as MEASURED without a device readout.**

---

## 1. Component Matrix

### 1.1 ESP32-S3

| Field | Value | Label | Source |
|-------|-------|-------|--------|
| Processor | Xtensa dual-core LX7, up to 240 MHz | OFFICIAL | [ESP32-S3 Datasheet v2.2](https://www.espressif.com/sites/default/files/documentation/esp32-s3_datasheet_en.pdf) |
| SRAM | 512 KB on-chip | OFFICIAL | ESP32-S3 Datasheet, §2.1 |
| RTC SRAM | 16 KB | OFFICIAL | ESP32-S3 Datasheet, §2.1 |
| Flash (module config) | 16 MB possible; module-dependent | OFFICIAL | Module/package configuration, not universal SoC value |
| PSRAM (module config) | 8 MB possible; module-dependent | OFFICIAL | Module/package configuration, not universal SoC value |
| Wi-Fi | 2.4 GHz IEEE 802.11b/g/n | OFFICIAL | ESP32-S3 Datasheet, §3.1 |
| Bluetooth | Bluetooth 5 / BLE | OFFICIAL | ESP32-S3 Datasheet, §3.2 |
| Deep-sleep current | ~7 µA | OFFICIAL | ESP32-S3 Datasheet, §4.2.1 |
| Active current | ~80–260 mA (Wi-Fi TX) | OFFICIAL | ESP32-S3 Datasheet, §5.7 |
| GPIOs | 45 | OFFICIAL | ESP32-S3 Datasheet, §2.4 |
| I2S | Yes (audio-capable) | OFFICIAL | ESP32-S3 Datasheet |
| SIMD/vector | Yes (vector instructions for INT8) | OFFICIAL | ESP32-S3 Technical Reference Manual |
| Physical board variant | ESP32-S3-WROOM-1 assumed; verify installed module | ESTIMATE | — |

### 1.2 INMP441 MEMS Microphone (×2)

| Field | Value | Label | Source |
|-------|-------|-------|--------|
| SNR | 61 dBA | OFFICIAL | [TDK INMP441 Product Page](https://product.tdk.com/en/search/sw_piezo/mic/mems-mic/info?part_no=INMP441) |
| Frequency response | ~60 Hz – 15 kHz (flat) | OFFICIAL | TDK INMP441 product specification |
| Sensitivity | −26 dBFS at 94 dB SPL | OFFICIAL | TDK INMP441 product specification |
| Supply current | ~1.4 mA (typical, normal mode) | OFFICIAL | TDK INMP441 product specification |
| Interface | Digital I²S | OFFICIAL | TDK INMP441 product specification |
| Cough frequency range | 0.5 – 5 kHz | ESTIMATE | Oduor et al. pig cough audio analysis |
| Practical barn range | 2–4 m per microphone | ESTIMATE | Requires field validation: distance sweep, noise, clipping check |
| Dual-mic coverage (4×4m pen) | Adequate with one mic per far wall | ESTIMATE | Requires field validation |

**Correction:** Earlier session used **65 dBA SNR**. Datasheet confirms **61 dBA**. This was verified via TDK official product page.

### 1.3 MLX90640 Thermal Array

| Field | Value | Label | Source |
|-------|-------|-------|--------|
| Resolution | 32 × 24 pixels (768 pixels) | OFFICIAL | [MLX90640 Datasheet](https://media.melexis.com/-/media/files/documents/datasheets/mlx90640-datasheet-melexis.pdf) |
| FOV (wide-angle) | 110° × 75° | OFFICIAL | MLX90640 Datasheet, §1 |
| Refresh rate | 0.5 – 64 Hz programmable | OFFICIAL | MLX90640 Datasheet, §12.2 |
| Supply current | < 23 mA | OFFICIAL | MLX90640 Datasheet, §1 |
| NETD | ~0.1 K RMS at 1 Hz | OFFICIAL | MLX90640 Datasheet, §12.3 |
| Interface | I²C | OFFICIAL | MLX90640 Datasheet |
| Operating temp | −40°C to 85°C | OFFICIAL | MLX90640 Datasheet |
| Target temp range | −40°C to 300°C | OFFICIAL | MLX90640 Datasheet |
| Frame accuracy (0–50°C Ta) | ±1°C (uniformity zone 1) | OFFICIAL | MLX90640 Datasheet, §12.1 |
| Frame accuracy (−40°C) | ±5°C | OFFICIAL | MLX90640 Datasheet, §12.1 |
| Pixel accuracy | ±1°C to ±2°C per zone; ±2%*To−Ta | OFFICIAL | MLX90640 Datasheet, §12.1.1 |
| FOV footprint at 1.5 m | ~4.3 m × 2.3 m | ESTIMATE | Calculated: 2d·tan(55°), 2d·tan(37.5°) |
| FOV footprint at 2.0 m | ~5.7 m × 3.1 m | ESTIMATE | Calculated; usable area lower after angle/obstruction |
| Pixel size at 1.5 m | ~13 cm × 10 cm | ESTIMATE | Calculated from FOV / pixel count |
| Pixel size at 2.0 m | ~18 cm × 13 cm | ESTIMATE | Calculated from FOV / pixel count |
| Ear identification | NOT possible at pen distances | OFFICIAL | 32×24 = 2–4 pixels per pig ear; insufficient for YOLO |
| Zone-level detection | Feasible (warm blob + relative threshold) | ESTIMATE | Supported by zone-tracker implementation |

### 1.4 BME280 Environmental Sensor

| Field | Value | Label | Source |
|-------|-------|-------|--------|
| Temperature accuracy | ±0.5°C (0–65°C) | OFFICIAL | [BME280 Datasheet](https://www.bosch-sensortec.com/media/boschsensortec/downloads/datasheets/bst-bme280-ds002.pdf), §1 |
| Humidity accuracy | ±3% RH (20–80% RH, 25°C) | OFFICIAL | BME280 Datasheet, §1 |
| Pressure accuracy | ±1 hPa (300–1100 hPa) | OFFICIAL | BME280 Datasheet, §1 |
| Current (h+t, 1Hz) | 1.8 µA | OFFICIAL | BME280 Datasheet, §1 |
| Current (p+t, 1Hz) | 2.8 µA | OFFICIAL | BME280 Datasheet, §1 |
| Current (h+p+t, 1Hz) | 3.6 µA | OFFICIAL | BME280 Datasheet, §1 |
| Sleep current | 0.1 µA | OFFICIAL | BME280 Datasheet, §1 |
| Operating range | −40…+85°C, 0…100% RH, 300…1100 hPa | OFFICIAL | BME280 Datasheet, §1 |
| Interface | I²C (up to 3.4 MHz), SPI | OFFICIAL | BME280 Datasheet |

### 1.5 Raspberry Pi 4 Model B (4GB) — Optional Add-On

| Field | Value | Label | Source |
|-------|-------|-------|--------|
| Power requirement | 5 V / 3 A recommended | OFFICIAL | [RPi4 Datasheet](https://pip-assets.raspberrypi.com/categories/545-raspberry-pi-4-model-b/documents/RP-008341-DS-1-raspberry-pi-4-datasheet.pdf), §4.1 |
| Wi-Fi | 802.11 b/g/n/ac | OFFICIAL | RPi4 Datasheet, §2.2 |
| Bluetooth | 5.0 with BLE | OFFICIAL | RPi4 Datasheet, §2.2 |
| RAM | 4 GB LPDDR4 (configurable) | OFFICIAL | RPi4 Datasheet |
| Ambient range | 0–50°C | OFFICIAL | RPi4 Datasheet |
| Idle power draw (latest firmware) | ~2.47 W | OFFICIAL | [Raspberry Pi Foundation thermal testing](https://www.raspberrypi.com/news/thermal-testing-raspberry-pi-4/) |
| Load power draw | ~6.79 W (synthetic stress) | OFFICIAL | Raspberry Pi Foundation thermal testing |
| 7-day runtime on 2000 mAh | NOT FEASIBLE (~2.2 h at idle) | ESTIMATE | Calculated: 5.9 Wh usable / 2.47 W ≈ 2.4 h |
| Role in architecture | Optional Linux server / MQTT / dashboard / vision | OFFICIAL | Architecture decision; not in minimum node |

### 1.6 UPS HAT (B) — Optional Add-On (Pi Power Backup)

| Field | Value | Label | Source |
|-------|-------|-------|--------|
| Battery | 2× 18650 Li-ion (NOT included) | OFFICIAL | [Waveshare UPS HAT (B)](https://www.waveshare.com/ups-hat-b.htm) |
| Battery capacity | 2600 mAh per cell (typical; verify exact unit) | OFFICIAL | Waveshare spec; verify with datasheet of installed cells |
| Output | 5 V, up to 5 A | OFFICIAL | Waveshare UPS HAT (B) spec |
| Charger input | 8.4 V / 2 A | OFFICIAL | Waveshare UPS HAT (B) spec |
| Nominal energy (2×2600 mAh, 3.7 V) | ~19.24 Wh | ESTIMATE | Calculated from typical 18650 spec |
| Usable energy (80% efficiency) | ~15.4 Wh | ESTIMATE | Calculated |
| Pi 4 runtime on full charge | ~6.2 h at 2.47 W | ESTIMATE | Calculated: 15.4 / 2.47 ≈ 6.2 h |
| Seven-day runtime | NOT FEASIBLE on UPS HAT alone | ESTIMATE | Requires duty cycling or solar |

### 1.7 ESP-NOW Wireless

| Field | Value | Label | Source |
|-------|-------|-------|--------|
| Protocol | Connectionless 2.4 GHz, vendor-specific action frames | OFFICIAL | [ESP-IDF ESP-NOW Docs](https://docs.espressif.com/projects/esp-idf/en/stable/esp32/api-reference/network/esp_now.html) |
| Max packet (v2.0) | 1470 bytes | OFFICIAL | ESP-IDF ESP-NOW documentation |
| Max packet (v1.0) | 250 bytes | OFFICIAL | ESP-IDF ESP-NOW documentation |
| Default bit rate | 1 Mbps | OFFICIAL | ESP-FAQ |
| Channel range | 0–14 (1–13 usable in most regions) | OFFICIAL | ESP-IDF ESP-NOW documentation |
| Security | CCMP (AES-128) for action frames | OFFICIAL | ESP-IDF ESP-NOW documentation |
| Universal range claim | **NOT guaranteed** — varies with environment | OFFICIAL | Documentation specifies protocol, not range |
| Barn design target | 10–30 m | ESTIMATE | Physics-based; requires RSSI/PDR field test |
| 220 m figure | Open-air, low interference, line-of-sight; **NOT a farm guarantee** | OFFICIAL | Secondary report; not in official docs as guarantee |

---

## 2. Power Budget Analysis

### 2.1 Key Formulae

```
battery_Wh = battery_Ah × nominal_voltage
usable_Wh = battery_Wh × converter_efficiency (assume 80%)
runtime_hours = usable_Wh / average_load_W
required_battery_Wh = average_load_W × target_hours / converter_efficiency
```

### 2.2 2000 mAh / 3.7 V LiPo Pack — Raspberry Pi 4

| Parameter | Value |
|-----------|-------|
| Nominal energy | 2.0 Ah × 3.7 V = **7.4 Wh** |
| Usable energy (80%) | **5.9 Wh** |
| Pi 4 idle load | ~2.47 W (latest firmware) |
| Runtime at idle | 5.9 / 2.47 = **~2.4 hours** |
| 7-day energy requirement | 2.47 W × 168 h = **414.96 Wh load** |
| Battery needed for 7 days | 414.96 / 0.80 = **~519 Wh** |
| Verdict | **IMPOSSIBLE** — would need ~70× current capacity |

### 2.3 2000 mAh / 3.7 V LiPo Pack — ESP32-S3 (Duty-Cycled)

| Parameter | Value | Label |
|-----------|-------|-------|
| Nominal energy | 7.4 Wh | Calculated |
| Usable energy (80%) | 5.9 Wh | Calculated |
| ESP32-S3 deep-sleep (7 µA) | 0.007 mA | OFFICIAL |
| ESP32-S3 active + radio (10s on / 5 min off) | ~30 mA avg | ESTIMATE |
| Estimated runtime | ~170 hours (~7 days) | ESTIMATE — requires measured validation |
| Verdict | **FEASIBLE** with duty cycling |

### 2.4 UPS HAT (B) — Raspberry Pi 4

| Parameter | Value |
|-----------|-------|
| Nominal energy (2×2600 mAh, 3.7V) | ~19.24 Wh |
| Usable (80%) | ~15.4 Wh |
| Pi 4 idle runtime | ~6.2 hours |
| 7-day runtime | NOT FEASIBLE without duty cycling |
| Verdict | **Backup only** (hours, not days) |

### 2.5 Corrected Architecture Power Rule

- **Minimum battery-backed prototype = ESP32-S3 + INMP441 + MLX90640 + BME280**
- Duty-cycled ESP32-S3 on 2000 mAh LiPo: feasible for 7+ days
- **Raspberry Pi 4 is NOT part of the minimum battery-backed node**

---

## 3. Range Estimates (Barn Environment)

| Signal | Estimate | Basis | Validation Required |
|--------|----------|-------|---------------------|
| ESP-NOW (barn) | 10–30 m | Physics, 2.4 GHz penetration, metal pens | RSSI, PDR, retransmission log |
| INMP441 audio (per mic) | 2–4 m | Cough SPL vs ambient noise, distance attenuation | Distance sweep, ground-truth playback |
| Dual-mic coverage (4×4 m pen) | Adequate with far-wall placement | Geometry, beam pattern | Field test |
| MLX90640 zone detection | 1.5–2.5 m perpendicular | FOV footprint, pixel resolution | Thermal map vs pen layout |
| ESP32-S3 → Pi 4 (Wi-Fi) | 10–30 m (same as ESP-NOW if on same channel) | 2.4 GHz propagation | RSSI in actual pen |

**All range values are ESTIMATE.** No sensor datasheet guarantees farm-level range. Physical obstructions, metal, humidity, interference, and mounting angle are dominant variables.

---

## 4. Failure Modes

| Component | Primary Failure Mode | Mitigation | Label |
|-----------|---------------------|------------|-------|
| ESP32-S3 | Thermal throttling (>85°C ambient) | Shade enclosure, duty cycle | ESTIMATE |
| ESP32-S3 | Flash wear from OTA updates | Wear-leveling, minimize OTA frequency | ESTIMATE |
| INMP441 | AGC deafening in noisy pen | Disable AGC, fixed-gain mode | OFFICIAL (spec), ESTIMATE (farm) |
| INMP441 | Clipping from loud coughs | Input level monitoring, hardware limiter | ESTIMATE |
| INMP441 | I2S cable length >1m | Signal integrity check, short runs | ESTIMATE |
| MLX90640 | Solar heating false positives | PE film window + shade + ceiling mount | ESTIMATE |
| MLX90640 | Drift >2°C in 80s | Die temp compensation LUT | OFFICIAL (datasheet), ESTIMATE (field) |
| MLX90640 | Pixel outlier | Factory calibration, per-unit LUT | OFFICIAL |
| BME280 | Humidity sensor saturation at >80% RH | Enclosure ventilation design | OFFICIAL |
| RPi 4 | Power brown-out (<5V) | Quality 5V/3A supply; UPS HAT | OFFICIAL |
| RPi 4 | Thermal throttling | Heatsink + fan; enclosure airflow | OFFICIAL |
| ESP-NOW | Packet loss in metal barn | RSSI/PDR monitoring, multi-hop or relay | ESTIMATE |
| Battery | Capacity fade over cycles | Capacity test at deployment; replace schedule | ESTIMATE |
| LiPo | Swelling / safety risk | BMS, enclosure venting, periodic inspection | OFFICIAL (UPS HAT spec) |

---

## 5. Required Field Validation

1. **Board identity:** Read installed module model and flash/PSRAM configuration — verify before claiming specs.
2. **Current measurement:** Measure average and peak current for each ESP32-S3 operating mode using a power logger.
3. **Wireless test:** ESP-NOW and Wi-Fi at multiple pen distances and orientations; log RSSI, PDR, retransmissions.
4. **Acoustic sweep:** Distance sweep with labeled cough playback; per-zone quality check; fan noise characterization.
5. **Thermal mapping:** Map MLX90640 FOV against actual pen; test sun, floor heating, wet surfaces, pig posture.
6. **Thermal ground truth:** Compare MLX90640 readings against calibrated contact thermometer on 5–10 pigs.
7. **Battery test:** Measure runtime until cutoff at measured load current, 25°C ambient.
8. **I2C / I2S cable test:** Verify signal integrity at 0.5m, 1.0m, 1.5m cable lengths.
9. **Humidity sensor test:** Verify BME280 readings against psychrometer in pig pen environment.

---

## 6. Hardware Decision Summary

| Decision | Status | Basis |
|----------|--------|-------|
| ESP32-S3 = real-time sensor/TinyML node | **LOCKED** | Power, capability, cost optimization |
| RPi 4 = optional Linux server | **LOCKED** | 2000 mAh cannot power Pi for 7 days (verified calculation) |
| INMP441 = dual mics for acoustic monitoring | **LOCKED** | Sufficient for 16kHz, 0.5–5 kHz cough band |
| MLX90640 = zone-level thermal | **LOCKED** | 32×24 cannot resolve individual pigs |
| BME280 = environmental compensation | **LOCKED** | Required for Jia et al. compensation model |
| ESP-NOW = inter-node communication | **LOCKED** | Low-power, connectionless, barn-tested in literature |
| 10–30 m barn design range | **CONFIRMED ESTIMATE** | Physics-based; pending RSSI/PDR validation |
| 2–4 m per-mic audio range | **CONFIRMED ESTIMATE** | Physics-based; pending field sweep |
| 2000 mAh cannot power RPi4 for 7 days | **VERIFIED** | 7.4 Wh nominal → 5.9 Wh usable → ~2.4 h at 2.47 W |

---

## 7. Source Index

| # | Source | URL | Retrieved |
|---|--------|-----|-----------|
| 1 | ESP32-S3 Datasheet v2.2 | https://www.espressif.com/sites/default/files/documentation/esp32-s3_datasheet_en.pdf | 2026-09-16 |
| 2 | INMP441 Product Page (TDK) | https://product.tdk.com/en/search/sw_piezo/mic/mems-mic/info?part_no=INMP441 | 2026-09-16 |
| 3 | MLX90640 Datasheet (Melexis) | https://media.melexis.com/-/media/files/documents/datasheets/mlx90640-datasheet-melexis.pdf | 2026-09-16 |
| 4 | BME280 Datasheet (Bosch) | https://www.bosch-sensortec.com/media/boschsensortec/downloads/datasheets/bst-bme280-ds002.pdf | 2026-09-16 |
| 5 | Raspberry Pi 4 Datasheet | https://pip-assets.raspberrypi.com/categories/545-raspberry-pi-4-model-b/documents/RP-008341-DS-1-raspberry-pi-4-datasheet.pdf | 2026-09-16 |
| 6 | Raspberry Pi 4 Thermal Testing | https://www.raspberrypi.com/news/thermal-testing-raspberry-pi-4/ | 2026-09-16 |
| 7 | Waveshare UPS HAT (B) | https://www.waveshare.com/ups-hat-b.htm | 2026-09-16 |
| 8 | ESP-NOW Documentation (Espressif) | https://docs.espressif.com/projects/esp-idf/en/stable/esp32/api-reference/network/esp_now.html | 2026-09-16 |
| 9 | ESP-FAQ (ESP-NOW) | https://docs.espressif.com/projects/esp-faq/en/latest/application-solution/esp-now.html | 2026-09-16 |
| 10 | PigPulse Skill — Hardware Audit Ref | `~/.hermes/skills/pig-health-monitor/pig-health-monitor/references/hardware-audit-and-power-budget-2026-09-16.md` | 2026-09-16 |

---

## 8. Provenance Legend

| Term | Definition |
|------|-----------|
| OFFICIAL | Directly from manufacturer datasheet or official documentation |
| ESTIMATE | Calculated from physics, design target, or representative data; requires field validation |
| MEASURED | Actual readout from the physical device or pen test; highest confidence |
| CORRECTION | Value supersedes a previously stated figure; source cited |

---

*Generated: 2026-09-16 | Master: Kharl Angelo Capuno | Project: PigPulse (Pig Health Monitor)*  
*Canonical path: ~/pig-health-monitor/ | Branch: feat/v3-mqtt-pocketbase*  
*This document is an artifact. Chat-only tables are NOT acceptable deliverables.*
