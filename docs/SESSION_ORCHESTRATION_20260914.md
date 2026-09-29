# PigPulse v3 — Session Orchestration (Chunked Build Plan)
> **September 14, 2026**
> **Canon Alignment:** `feat/v3-mqtt-pocketbase` branch, existing firmware scaffold, PocketBase+MQTT infra

---

## 📋 CHUNK OVERVIEW

| Chunk | Name | Priority | Est. | Depends On |
|-------|------|----------|------|------------|
| **1** | Audio Firmware (ESP32-D0WD) | P0 | 2 days | None |
| **2** | Thermal + Fusion (ESP32-S3) | P0 | 2 days | Chunk 1 |
| **3** | Edge Impulse ML Pipeline | P0 | 3 days | Chunk 1 |
| **4** | Calibration Engine | P0 | 2 days | Chunk 2, 3 |
| **5** | PocketBase Integration | P0 | 1 day | Chunk 2 |
| **6** | Expo App + Alerts | P0 | 2 days | Chunk 5 |
| **7** | Hardware Integration Test | P0 | 2 days | All above |
| **8** | Field Deployment + Data | P0 | 7 days | Chunk 7 |
| **9** | CCTV Add-on (Future) | P1 | 3 days | Chunk 8 |
| **10** | Cloud Sync Add-on (Future) | P1 | 2 days | Chunk 8 |

---

## 🔧 CHUNK 1: Audio Firmware (ESP32-D0WD)

**Goal:** Working WebSocket audio streaming from ESP32-D0WD to ESP32-S3

**Existing Base:** `firmware/esp32d0wd-pigpulse/` — has I2S DMA, INMP441 driver, MQTT

**Files to Modify:**
- `config.h` — add WebSocket settings
- `wifi.h` — add WebSocket client mode
- `esp32d0wd-pigpulse.ino` — add audio streaming task

**New Files:**
- `src/websocket_audio.cpp` — WebSocket client sending audio frames
- `src/websocket_audio.h` — header

**Prompt for Subagent:
```
You are building firmware for ESP32-D0WD (PigPulse audio node).

HARDWARE:
- ESP32-D0WD (520KB SRAM, 240MHz)
- INMP441 MEMS microphone (I2S, 16-bit, 16kHz sample rate)
- Shared I2S bus with dual INMP441 (L/R pin split)

EXISTING CODE:
- firmware/esp32d0wd-pigpulse/config.h — pin definitions
- firmware/esp32d0wd-pigpulse/esp32d0wd-pigpulse.ino — main firmware
- firmware/esp32d0wd-pigpulse/sensors.h — audio driver (I2S DMA)

REQUIREMENTS:
1. Add WebSocket client to stream raw audio to ESP32-S3 (IP: 192.168.254.10:8080)
2. Audio format: 16kHz, 16-bit signed, mono (or stereo if DUAL_MIC_ENABLE)
3. Frame size: 1024 samples per WebSocket frame (64ms at 16kHz)
4. Add deep sleep between inference windows (power saving)
5. Keep existing MQTT telemetry for BME280 + battery data
6. Add BME280 ambient temp reading (I2C, address 0x76)

CONSTRAINTS:
- Must compile with PlatformIO (existing platformio.ini)
- Use WebSocketsClient library (already in PlatformIO registry)
- Ring buffer for audio: 1 second = 16000 samples × 2 bytes = 32KB
- Total RAM budget: <200KB (leave room for WiFi stack)

DELIVERABLES:
- Modified config.h with WebSocket settings
- src/websocket_audio.cpp + .h
- Updated main loop with audio streaming task
- README with wiring diagram

TEST:
- Verify WebSocket connection to test server
- Verify audio streaming at 16kHz
- Measure RAM usage (<200KB)
- Measure current consumption (<50mA average)
```

**Success Criteria:**
- [ ] WebSocket connects to ESP32-S3
- [ ] Audio streams at 16kHz without dropouts
- [ ] BME280 reads ambient temp correctly
- [ ] MQTT still works for telemetry
- [ ] Compiles without errors

---

## 🔧 CHUNK 2: Thermal + Fusion (ESP32-S3)

**Goal:** MLX90640 thermal reading + round-robin fusion engine on ESP32-S3

**Existing Base:** PocketBase + MQTT infrastructure already running

**Files to Create:**
- `firmware/esp32s3-pigpulse/` — new PlatformIO project
- `src/thermal_pipeline.cpp` — MLX90640 driver + compensation
- `src/fusion_engine.cpp` — round-robin synthesis
- `src/websocket_server.cpp` — receive audio from ESP32-D0WD

**Prompt for Subagent:
```
You are building firmware for ESP32-S3 (PigPulse main controller).

HARDWARE:
- ESP32-S3 (8MB PSRAM, 240MHz, vector instructions)
- MLX90640 thermal camera (I2C, 32×24 pixels, 110° FOV)
- WiFi for WebSocket server + MQTT

EXISTING INFRASTRUCTURE:
- PocketBase running on 192.168.1.100:8090
- Mosquitto MQTT on 192.168.1.100:1883
- Topic: pig/telemetry/thermal, pig/telemetry/cough

REQUIREMENTS:
1. WebSocket server on port 8080 to receive audio from ESP32-D0WD
2. MLX90640 driver (I2C, 100kHz, address 0x33)
3. Thermal compensation pipeline:
   - Die temperature drift correction
   - Ambient compensation (from BME280 via MQTT or direct I2C)
   - Emissivity correction (0.978 for pig skin)
   - Ear-base ROI detection (center-bottom 5×5 pixels)
4. Round-robin fusion engine:
   - Cycle every 5 seconds
   - Read thermal frame
   - Get latest audio inference result
   - Compute health score: 0.6×cough_z + 0.4×fever_z
   - Publish to MQTT topic pig/telemetry/fusion
5. Store 7-day rolling baseline in NVS flash
6. Auto-calibration: 24h ambient noise learning (band-wise stats)

CONSTRAINTS:
- Use TensorFlow Lite Micro for cough detection model
- Model size: <200KB (INT8 quantized)
- Tensor arena: 256KB (uses PSRAM)
- Inference time: <100ms

DELIVERABLES:
- Complete PlatformIO project in firmware/esp32s3-pigpulse/
- src/thermal_pipeline.cpp + .h
- src/fusion_engine.cpp + .h
- src/websocket_server.cpp + .h
- config.h with all pin definitions
- README with wiring and setup

TEST:
- Verify MLX90640 reads thermal frames
- Verify WebSocket receives audio
- Verify fusion engine computes health score
- Verify MQTT publishes to correct topics
- Measure inference time (<100ms)
```

**Success Criteria:**
- [ ] MLX90640 reads 32×24 frames at 4Hz
- [ ] WebSocket server accepts connections
- [ ] Fusion engine produces health score 0-100
- [ ] MQTT publishes to pig/telemetry/fusion
- [ ] 7-day baseline stored in NVS
- [ ] Auto-calibration runs on first boot

---

## 🔧 CHUNK 3: Edge Impulse ML Pipeline

**Goal:** Train and export cough detection model for ESP32-S3

**Existing Base:** Public datasets (Figshare 546, Thai 49)

**Prompt for Subagent:
```
You are training a pig cough detection model using Edge Impulse.

DATASETS:
1. Figshare 546: https://doi.org/10.6084/m9.figshare.32237565
   - 546 pig cough audio clips
   - 16kHz WAV format
   
2. Thai 49: https://doi.org/10.6084/m9.figshare.30488054
   - 49 pig cough audio clips
   - Various formats, resample to 16kHz

3. Environmental noise: Record 24h from deployment site
   - Farm background noise
   - Wind, rain, machinery

EDGE IMPULSE PROJECT:
1. Create project: pigpulse-cough-detection
2. Upload datasets (cough vs non-cough vs noise)
3. Configure MFCC block:
   - Window size: 25ms
   - Hop size: 10ms
   - Mel bands: 64
   - FFT size: 512
   - Output: 49×40×1 spectrogram
   
4. Train auto-CNN:
   - 3 Conv layers + Global Average Pooling + Dense
   - 50 epochs, early stopping at patience=10
   - Data augmentation: noise injection, time shift
   
5. Evaluate:
   - Target: >85% accuracy, >0.80 F1
   - Source-isolated evaluation (no same-pig in train/test)
   - Confusion matrix
   
6. Quantize to INT8:
   - Representative dataset: 200 real farm audio samples
   - Export as TensorFlow Lite (.tflite)
   
7. Export for ESP32-S3:
   - Edge Impulse SDK for Arduino
   - C array model file (model_data.h)

DELIVERABLES:
- Edge Impulse project URL
- model_data.h (C array for firmware)
- Training report (accuracy, F1, confusion matrix)
- Quantization report (before/after accuracy comparison)

TEST:
- Verify model loads on ESP32-S3
- Verify inference runs in <100ms
- Verify accuracy on test samples
```

**Success Criteria:**
- [ ] Model accuracy >85%
- [ ] F1-score >0.80
- [ ] INT8 quantization successful
- [ ] model_data.h exported
- [ ] Inference <100ms on ESP32-S3

---

## 🔧 CHUNK 4: Calibration Engine

**Goal:** Unsupervised domain adaptation for automatic farm calibration

**Prompt for Subagent:
```
You are implementing the unsupervised calibration engine for PigPulse.

BACKGROUND:
The cough detection model is trained on public datasets (Thai farm, 2023).
When deployed to a new farm (Cebu, Philippines), the acoustic environment differs.
Performance drops ~27% without adaptation.

SOLUTION: Band-wise Statistics Matching (DCASE 2018)

ALGORITHM:
1. Compute source statistics (from training data):
   - For each Mel frequency band (64 bands):
     - mean_s[band] = average energy in training data
     - std_s[band] = standard deviation in training data
   
2. Record target domain (24h after deployment):
   - Record 24 hours of ambient noise
   - For each Mel frequency band:
     - mean_t[band] = average energy on farm
     - std_t[band] = standard deviation on farm
   
3. Compute correction factors:
   - For each band:
     - offset[band] = mean_s[band] - mean_t[band]
     - scale[band] = std_s[band] / std_t[band]
   
4. Apply correction (real-time):
   - For each audio frame:
     - corrected[band] = (raw[band] - mean_t[band]) × scale[band] + mean_s[band]
   - Feed corrected features to CNN

IMPLEMENTATION:
- Language: C++ (ESP32-S3) or Python (RPi co-processor)
- Storage: NVS flash (correction factors persist across reboots)
- Trigger: Automatic on first boot, manual via MQTT command

FILES:
- src/calibration.cpp — calibration engine
- src/calibration.h — header
- include/calibration_data.h — source statistics (from training)

DELIVERABLES:
- calibration.cpp + .h
- calibration_data.h (source statistics)
- Test script to verify correction
- Documentation of algorithm

TEST:
- Verify 24h recording completes
- Verify correction factors computed
- Verify accuracy improvement with/without calibration
```

**Success Criteria:**
- [ ] 24h ambient recording works
- [ ] Correction factors computed and stored
- [ ] Accuracy improves >10% with calibration
- [ ] Persists across reboots
- [ ] Can be triggered via MQTT

---

## 🔧 CHUNK 5: PocketBase Integration

**Goal:** Store sensor data in PocketBase, serve REST API to Expo app

**Existing Base:** PocketBase already running on `feat/v3-mqtt-pocketbase`

**Prompt for Subagent:
```
You are integrating PigPulse sensor data with PocketBase.

EXISTING INFRASTRUCTURE:
- PocketBase running on 192.168.1.100:8090
- Mosquitto MQTT on 192.168.1.100:1883
- MQTT Bridge subscribes to topics, writes to PocketBase

REQUIREMENTS:
1. Create PocketBase collections:
   - telemetry (device_id, timestamp, center_temp, ambient_temp, cough_count, health_score, alert_flags)
   - devices (device_id, pen_id, firmware_version, last_seen)
   - alerts (device_id, timestamp, alert_type, severity, acknowledged)
   - calibration (device_id, timestamp, correction_factors_json)

2. Update MQTT Bridge:
   - Subscribe to pig/telemetry/thermal
   - Subscribe to pig/telemetry/cough
   - Subscribe to pig/telemetry/fusion
   - Write to PocketBase collections

3. Create API endpoints:
   - GET /api/telemetry/:device_id — latest readings
   - GET /api/telemetry/:device_id/history?hours=24 — historical data
   - GET /api/devices — list all devices
   - GET /api/alerts?acknowledged=false — active alerts
   - POST /api/alerts/:id/acknowledge — acknowledge alert

4. Real-time subscriptions:
   - WebSocket subscription to telemetry collection
   - Push updates to connected clients

DELIVERABLES:
- PocketBase schema (collections + fields)
- Updated MQTT Bridge code
- API endpoint documentation
- Test script to verify data flow

TEST:
- Verify MQTT messages write to PocketBase
- Verify API returns correct data
- Verify real-time subscription works
```

**Success Criteria:**
- [ ] Collections created in PocketBase
- [ ] MQTT Bridge writes to PocketBase
- [ ] API endpoints return data
- [ ] Real-time subscription works
- [ ] Data persists across restarts

---

## 🔧 CHUNK 6: Expo App + Alerts

**Goal:** Mobile app showing real-time health score + push alerts

**Existing Base:** Expo app scaffold exists (TypeScript errors, mock data)

**Prompt for Subagent:
```
You are building the PigPulse mobile app (Expo + React Native).

EXISTING CODE:
- mobile_app/ — Expo app scaffold
- TypeScript errors need fixing
- Mock data currently used

REQUIREMENTS:
1. Fix TypeScript compilation errors
2. Replace mock data with PocketBase real-time subscription
3. Screens:
   - Dashboard: Real-time health score (0-100), color-coded (green/yellow/red)
   - Thermal: MLX90640 heatmap visualization (32×24 interpolated to 320×240)
   - History: 7-day trend charts (cough rate, temperature, health score)
   - Alerts: List of active alerts, acknowledge button
   - Settings: Device configuration, calibration trigger

4. Push notifications:
   - Yellow alert (health 40-59): "Check pen — possible respiratory issue"
   - Red alert (health 0-39): "URGENT: Respiratory distress detected"

5. Offline-first:
   - Cache last 100 readings in AsyncStorage
   - Work without internet (local WiFi only)

DELIVERABLES:
- Fixed TypeScript code
- PocketBase real-time hook (usePocketbaseRealtime.ts)
- All screen components
- Push notification setup
- APK build

TEST:
- Verify app compiles without errors
- Verify real-time data updates
- Verify push notifications fire
- Verify offline mode works
```

**Success Criteria:**
- [ ] Zero TypeScript errors
- [ ] Real-time health score updates
- [ ] Thermal heatmap renders
- [ ] Push notifications work
- [ ] Offline mode works
- [ ] APK builds successfully

---

## 🔧 CHUNK 7: Hardware Integration Test

**Goal:** End-to-end testing of all components together

**Prompt for Subagent:
```
You are testing the complete PigPulse system.

HARDWARE SETUP:
- ESP32-D0WD + INMP441 (audio node)
- ESP32-S3 + MLX90640 (main controller)
- LiPo battery 12V 10Ah
- WiFi network (192.168.254.0/24)

SOFTWARE SETUP:
- PocketBase on 192.168.254.1:8090
- Mosquitto on 192.168.254.1:1883
- MQTT Bridge running

TEST PLAN:

1. Audio Pipeline Test:
   - [ ] ESP32-D0WD connects to WiFi
   - [ ] WebSocket connects to ESP32-S3
   - [ ] Audio streams at 16kHz without dropouts
   - [ ] BME280 reads ambient temp

2. Thermal Pipeline Test:
   - [ ] MLX90640 reads 32×24 frames
   - [ ] Ear-base ROI detection works
   - [ ] Drift compensation active
   - [ ] Ambient compensation active

3. ML Inference Test:
   - [ ] Model loads on ESP32-S3
   - [ ] Inference runs in <100ms
   - [ ] Cough detection accuracy >80% (with test samples)

4. Calibration Test:
   - [ ] 24h ambient recording completes
   - [ ] Correction factors computed
   - [ ] Accuracy improves with calibration

5. Fusion Test:
   - [ ] Round-robin cycle runs every 5s
   - [ ] Health score computed correctly
   - [ ] MQTT publishes to pig/telemetry/fusion

6. PocketBase Test:
   - [ ] Data written to collections
   - [ ] API returns correct data
   - [ ] Real-time subscription works

7. Expo App Test:
   - [ ] App connects to PocketBase
   - [ ] Real-time health score updates
   - [ ] Push notifications fire
   - [ ] Offline mode works

8. Power Test:
   - [ ] Battery lasts >12 hours
   - [ ] Deep sleep current <1mA
   - [ ] Solar charging works (if connected)

DELIVERABLES:
- Test report (pass/fail per item)
- Performance metrics (latency, accuracy, power)
- Bug list with severity
- Recommendations for fixes

TEST:
- Run all tests
- Document results
- Fix critical bugs
```

**Success Criteria:**
- [ ] All tests pass
- [ ] Inference <100ms
- [ ] Accuracy >80%
- [ ] Battery >12 hours
- [ ] No critical bugs

---

## 🔧 CHUNK 8: Field Deployment + Data Collection

**Goal:** Deploy in actual pig pen, collect 7+ days of data

**Prompt for Subagent:
```
You are deploying PigPulse in an actual pig pen for field testing.

DEPLOYMENT SITE:
- Location: Cebu Technological University – Sabang Danao City
- Pen: Open-air, 10-20 pigs
- Climate: Tropical (hot, humid, rainy)

HARDWARE INSTALLATION:
1. Mount ESP32-D0WD + INMP441 at pig height (1m)
2. Mount ESP32-S3 + MLX90640 at top of pen (2m, angled down)
3. Connect battery + solar panel
4. Verify WiFi coverage

CALIBRATION PROTOCOL:
1. Day 0: Plug in device
2. Day 0-1: Record 24h ambient noise (audio calibration)
3. Day 1-7: Learn thermal baseline (7-day rolling average)
4. Day 8+: Full monitoring active

DATA COLLECTION:
- Every 5 seconds: Health score, cough count, thermal data
- Every 5 minutes: MQTT publish to PocketBase
- Daily: Sync to cloud (if internet available)

MONITORING:
- Check device health daily (battery, WiFi, sensors)
- Verify data quality (no dropouts, reasonable values)
- Note any environmental events (rain, wind, feeding time)

DELIVERABLES:
- Deployment photos
- 7-day data export (CSV)
- Field test report
- Accuracy analysis (if ground truth available)

TEST:
- Verify all sensors working
- Verify data quality
- Verify battery life
- Verify calibration effectiveness
```

**Success Criteria:**
- [ ] Device deployed and running
- [ ] 7 days of continuous data
- [ ] No hardware failures
- [ ] Calibration effective
- [ ] Data quality acceptable

---

## 🔧 CHUNK 9: CCTV Add-on (Future)

**Goal:** Add camera for individual pig identification

**Prompt for Subagent:
```
You are adding CCTV pig tracking to PigPulse.

HARDWARE ADDITION:
- Raspberry Pi Zero 2W (co-processor)
- Camera module (OV5647 or similar)
- WiFi connection to main network

SOFTWARE:
1. Pig detection: YOLOv8-nano (TensorFlow Lite)
2. Pig tracking: DeepSORT or ByteTrack
3. Pig re-identification: ReID network (optional)
4. Correlate pig positions with thermal zones

INTEGRATION:
- Pi Zero 2W subscribes to MQTT topics
- Receives thermal zone data from ESP32-S3
- Tracks pigs in camera view
- Publishes pig positions to MQTT topic pig/tracking/positions
- ESP32-S3 or PocketBase correlates positions with health data

DELIVERABLES:
- Pi Zero 2W setup guide
- YOLOv8 model (fine-tuned on pigs)
- Tracking code (Python)
- MQTT integration
- Test results

TEST:
- Verify pig detection works
- Verify tracking maintains ID
- Verify correlation with thermal data
```

---

## 🔧 CHUNK 10: Cloud Sync Add-on (Future)

**Goal:** Sync data to cloud for remote monitoring

**Prompt for Subagent:
```
You are adding cloud sync capability to PigPulse.

ARCHITECTURE:
- Local PocketBase (on ESP32-S3 or RPi Zero 2W)
- Cloud PocketBase (on VPS or PocketBase Cloud)
- Sync via MQTT or REST API

REQUIREMENTS:
1. When internet available:
   - Sync telemetry data to cloud
   - Sync alerts to cloud
   - Receive remote commands
   
2. When internet unavailable:
   - Store locally
   - Queue for sync
   - Auto-sync when reconnected

3. Security:
   - TLS encryption
   - API key authentication
   - Device certificate (optional)

DELIVERABLES:
- Cloud PocketBase setup
- Sync script (Python or Node.js)
- Security configuration
- Remote monitoring dashboard (optional)

TEST:
- Verify sync works with internet
- Verify offline mode works
- Verify auto-sync on reconnect
- Verify security (no unauthorized access)
```

---

## 📊 EXECUTION TIMELINE

| Week | Chunks | Deliverables |
|------|--------|--------------|
| **Week 1** | 1, 3 | Audio firmware + ML model |
| **Week 2** | 2, 4 | Thermal + calibration |
| **Week 3** | 5, 6 | PocketBase + Expo app |
| **Week 4** | 7 | Integration testing |
| **Week 5-6** | 8 | Field deployment |
| **Week 7+** | 9, 10 | Add-ons |

---

## 🔗 DEPENDENCY GRAPH

```
Chunk 1 (Audio) ──┬──▶ Chunk 2 (Thermal+Fusion) ──┬──▶ Chunk 5 (PocketBase) ──▶ Chunk 6 (Expo)
                  │                                │
Chunk 3 (ML) ─────┘                                └──▶ Chunk 7 (Integration Test) ──▶ Chunk 8 (Field)
                                                                                        │
                                                                                        ├──▶ Chunk 9 (CCTV)
                                                                                        └──▶ Chunk 10 (Cloud)
```

---

## ✅ CANON ALIGNMENT CHECK

| Decision | Canon Source | Aligned? |
|----------|--------------|----------|
| ESP32-D0WD for audio | Existing firmware | ✅ Yes |
| ESP32-S3 for main | New (replaces RPi 5) | ✅ Yes |
| MQTT + PocketBase | `feat/v3-mqtt-pocketbase` | ✅ Yes |
| Edge Impulse | Research findings | ✅ Yes |
| Round-robin fusion | New design | ✅ Yes |
| Unsupervised calibration | Research findings | ✅ Yes |
| Expo app | Existing scaffold | ✅ Yes |
| Battery power | Existing design | ✅ Yes |

---

*End of Orchestration Document*