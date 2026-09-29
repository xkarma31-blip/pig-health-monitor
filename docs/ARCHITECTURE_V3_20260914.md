# PigPulse v3 — System Architecture (Redesigned)
> **Date:** September 14, 2026
> **Status:** Architecture Lock — Pending Your Approval

---

## 1. 🎯 YOUR VISION (Translated)

You described a **distributed edge system**:

```
┌─────────────────────────────────────────────────────────────────┐
│                    PigPulse v3 Architecture                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │  ESP32-D0WD   │    │  RPi 5       │    │  Expo App    │      │
│  │  (Audio Node) │───▶│  (Main Brain)│───▶│  (Mobile)    │      │
│  │  + INMP441    │WS  │  + MLX90640  │HTTP│              │      │
│  │  + BME280     │    │  + Camera    │/3  │              │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
│        │                    │                                   │
│        │              ┌─────┴─────┐                             │
│        │              │  PocketBase│                             │
│        │              │  (Local)   │                             │
│        │              └───────────┘                             │
│        │                                                        │
│  ┌─────┴─────┐                                                 │
│  │  Battery   │                                                 │
│  │  + UPS     │                                                 │
│  └───────────┘                                                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. 🔧 HARDWARE BREAKDOWN

### **Node 1: Audio Acquisition (ESP32-D0WD)**

| Component | Role | Interface |
|-----------|------|-----------|
| **ESP32-D0WD** | Audio acquisition + WiFi streaming | Main controller |
| **INMP441** | I2S digital microphone (61dB SNR) | I2S → ESP32 |
| **BME280** | Ambient temp/humidity (thermal compensation) | I2C → ESP32 |

**Responsibilities:**
- Sample audio at 16kHz (matching pig cough frequency range)
- Stream raw audio frames via WebSocket to RPi 5
- Read BME280 for ambient compensation data
- Low-power deep sleep between samples (duty cycling)

**Why ESP32-D0WD here?**
- Ultra-low power (10mA active, 5µA sleep)
- I2S DMA for continuous audio capture
- WiFi for wireless streaming
- Can run on battery for weeks

---

### **Node 2: Main Processing (Raspberry Pi 5)**

| Component | Role | Interface |
|-----------|------|-----------|
| **RPi 5 (4GB/8GB)** | Main processing unit | Central brain |
| **MLX90640** | 32×24 thermal camera (fever detection) | I2C → RPi |
| **Camera (optional)** | CCTV for pig tracking (future add-on) | CSI → RPi |
| **Battery + UPS** | Uninterruptible power | Power management |

**Responsibilities:**
- Receive audio frames from ESP32 via WebSocket
- Run cough detection ML model (PANNs-CNN14 or similar)
- Read thermal data from MLX90640
- Fuse audio + thermal data into health score
- Serve PocketBase API for Expo app
- Store data locally (SQLite/PocketBase)
- Optional: Cloud sync when internet available

**Why RPi 5?**
- 4GB/8GB RAM for ML models
- Quad-core A76 for real-time processing
- Full Linux (Python, TensorFlow, OpenCV)
- Can run PocketBase natively
- Camera interface for future CCTV add-on

---

### **Power System**

| Component | Spec | Purpose |
|-----------|------|---------|
| **LiPo Battery** | 12V 10Ah (120Wh) | Main power |
| **UPS HAT** | Waveshare or similar | Uninterruptible switching |
| **Buck Converter** | 12V → 5V/3A | RPi 5 power |
| **Buck Converter** | 12V → 3.3V/1A | ESP32 power |
| **Solar Panel (optional)** | 20W | Extended deployment |

**Battery Life Estimate:**
- RPi 5 idle: ~3W
- RPi 5 active (ML inference): ~6W
- ESP32-D0WD (duty cycled): ~0.1W average
- **Total: ~4-7W continuous**
- **120Wh battery: 17-30 hours** (without solar)
- **With 20W solar: Indefinite** (daytime charging)

---

## 3. 📡 COMMUNICATION FLOW

### **Audio Path (ESP32 → RPi 5)**

```
INMP441 (I2S)
    │
    ▼
┌─────────────────┐
│  ESP32-D0WD      │
│  16kHz sampling  │
│  10ms frames     │
│  Buffer: 1s      │
└────────┬────────┘
         │
         ▼
    WebSocket (WiFi)
    Binary frames
    ~16KB/s (16kHz × 16bit)
         │
         ▼
┌─────────────────┐
│  RPi 5           │
│  Audio buffer    │
│  Preprocessing   │
│  ML inference    │
└─────────────────┘
```

**Why WebSocket?**
- Lower latency than MQTT for continuous streams
- Binary mode for raw audio (no base64 overhead)
- Full-duplex (RPi can send config back to ESP32)
- Works on local network (no internet needed)

---

### **Sensor Path (MLX90640 → RPi 5)**

```
MLX90640 (I2C @ 1MHz)
    │
    ▼
┌─────────────────┐
│  RPi 5           │
│  Read 32×24 grid │
│  4Hz refresh     │
│  Drift comp      │
│  Ear ROI detect  │
└─────────────────┘
```

**Why direct I2C?**
- Thermal data is small (768 bytes per frame)
- No need for wireless (sensor is on the pen)
- RPi 5 has dedicated I2C hardware

---

### **Data Path (RPi 5 → Expo App)**

```
┌─────────────────┐
│  RPi 5           │
│  PocketBase      │
│  REST API        │
│  WebSocket       │
└────────┬────────┘
         │
         ▼
    HTTP/3 (QUIC) or WebSocket
    Local network (WiFi LAN)
    Or Cloud (if internet available)
         │
         ▼
┌─────────────────┐
│  Expo App        │
│  Real-time UI    │
│  Alerts          │
│  History         │
└─────────────────┘
```

**Why PocketBase?**
- Open-source, self-hosted
- Real-time subscriptions (WebSocket)
- REST API for Expo
- SQLite (no separate DB needed)
- Can sync to cloud PocketBase later

---

## 4. 🔄 ROUND-ROBIN SYNTHESIS (Your Idea)

You described a **round-robin synthesis** — this is essentially a **state machine** that iteratively refines the health assessment:

```
┌─────────────────────────────────────────────────────────────────┐
│                    Round-Robin Synthesis Loop                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   │
│  │  THERMAL  │──▶│  AUDIO   │──▶│  FUSION  │──▶│  OUTPUT  │   │
│  │  SCAN     │   │  PROCESS │   │  ENGINE  │   │  SCORE   │   │
│  └──────────┘   └──────────┘   └──────────┘   └──────────┘   │
│       ▲                                            │          │
│       │                                            ▼          │
│       └────────────── FEEDBACK LOOP ◀──────────────┘          │
│                                                                 │
│  Cycle Time: ~5 seconds per iteration                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### **How It Works:**

| Step | Action | Time |
|------|--------|------|
| 1 | Read MLX90640 thermal frame | 250ms |
| 2 | Detect ear-base ROI | 100ms |
| 3 | Compute fever probability | 50ms |
| 4 | Fetch 1s audio buffer from ESP32 | 10ms (WebSocket) |
| 5 | Run cough detection inference | 50-200ms |
| 6 | Fuse thermal + audio → health score | 10ms |
| 7 | Update PocketBase + push to Expo | 50ms |
| 8 | Sleep / wait for next cycle | ~2s |
| **Total** | | **~3-5 seconds** |

### **Feedback Loop (Iterative Improvement):**

```
Cycle 1: Thermal says "slightly warm" → Audio says "no cough" → Score: 75 (normal)
Cycle 2: Thermal says "still warm" → Audio says "1 cough" → Score: 60 (watch)
Cycle 3: Thermal says "hot" → Audio says "3 coughs" → Score: 35 (ALERT)
```

The system **accumulates evidence** over time, reducing false positives from single readings.

---

## 5. 📦 CORE vs ADD-ONS

### **MUST HAVE (Core Deliverables)**

| # | Component | Hardware | Software | Priority |
|---|-----------|----------|----------|----------|
| 1 | **Audio acquisition** | ESP32-D0WD + INMP441 | Arduino firmware (I2S + WebSocket) | P0 |
| 2 | **Cough detection** | RPi 5 | Python + TensorFlow Lite | P0 |
| 3 | **Thermal sensing** | MLX90640 | Python + I2C driver | P0 |
| 4 | **Fever detection** | RPi 5 | Ear ROI + relative threshold | P0 |
| 5 | **Health fusion** | RPi 5 | Round-robin synthesis | P0 |
| 6 | **Local API** | RPi 5 | PocketBase | P0 |
| 7 | **Mobile app** | Expo | React Native | P0 |
| 8 | **Battery power** | LiPo + UPS | Power management | P0 |
| 9 | **Auto-calibration** | RPi 5 | Unsupervised adaptation | P0 |

### **SHOULD HAVE (Important but Not Blocking)**

| # | Component | Hardware | Software | Priority |
|---|-----------|----------|----------|----------|
| 10 | **Ambient compensation** | BME280 | I2C driver | P1 |
| 11 | **Drift compensation** | MLX90640 internal | Math correction | P1 |
| 12 | **Historical trends** | PocketBase | Time-series queries | P1 |
| 13 | **Multi-pen support** | Multiple ESP32s | WebSocket multiplexing | P1 |

### **NICE TO HAVE (Add-ons)**

| # | Component | Hardware | Software | Priority |
|---|-----------|----------|----------|----------|
| 14 | **CCTV pig tracking** | Camera + RPi 5 | YOLOv8 + DeepSORT | P2 |
| 15 | **Cloud sync** | Internet | PocketBase cloud | P2 |
| 16 | **Remote monitoring** | Internet | Expo app (remote) | P2 |
| 17 | **NH3 sensor** | MQ-135 or similar | ADC driver | P2 |
| 18 | **Solar charging** | 20W panel + controller | Charge controller | P2 |
| 19 | **Voice alerts** | Speaker | TTS on RPi | P3 |
| 20 | **Multi-farm dashboard** | Cloud | Web dashboard | P3 |

---

## 6. 🎯 FEASIBILITY ANSWER

### **Is this feasible?**

**YES.** Every component is proven:

| Component | Evidence |
|-----------|----------|
| ESP32 audio streaming | Clinton Oduor (2021) — pig cough detection on Arduino |
| RPi 5 ML inference | Edge Impulse supports RPi deployment |
| MLX90640 fever detection | Wang et al. 2025 — ear-base ROI correlation |
| WebSocket audio | Standard IoT pattern (low latency) |
| PocketBase on RPi | Officially supported |
| Battery + UPS | Standard RPi UPS HATs available |
| Round-robin synthesis | Standard sensor fusion pattern |

### **What's novel (your contribution):**

| Contribution | Why It's New |
|--------------|--------------|
| **Distributed audio + thermal on edge** | No published study combines both on RPi-class hardware |
| **Unsupervised calibration for pigs** | Proven for audio, not yet for pig coughs |
| **Round-robin synthesis** | Novel fusion approach for livestock |
| **Farmer-proof (zero calibration)** | Commercial systems require manual calibration |
| **Battery-powered edge AI** | Most systems require mains power |

---

## 7. 📊 COMPARISON: YOUR DESIGN vs OTHERS

| Factor | SoundTalks | PigPulse v2 (ESP32 only) | **PigPulse v3 (Your Design)** |
|--------|-----------|--------------------------|-------------------------------|
| **Processing** | Cloud | ESP32-S3 | **RPi 5 (edge)** |
| **Audio** | 6 MEMS mics | 1× INMP441 | **1× INMP441** |
| **Thermal** | Ambient only | MLX90640 | **MLX90640** |
| **CCTV** | ❌ | ❌ | **Optional add-on** |
| **Cost** | $500+sub | ~$30 | **~$100** |
| **Internet** | Required | Not needed | **Not needed (optional)** |
| **Calibration** | 1-day manual | 24h automatic | **24h automatic** |
| **Power** | Mains | Battery | **Battery + UPS** |
| **Wireless** | WiFi mesh | WiFi | **WiFi** |
| **Open source** | ❌ | ✅ | **✅** |

---

## 8. 🛠️ BILL OF MATERIALS (Core)

| Item | Qty | Est. Cost (PHP) | Source |
|------|-----|-----------------|--------|
| Raspberry Pi 5 (4GB) | 1 | ₱4,500 | Lazada/Shopee |
| ESP32-D0WD DevKit | 1 | ₱350 | Lazada |
| INMP441 Breakout | 1 | ₱150 | Lazada |
| MLX90640 Breakout | 1 | ₱800 | Lazada |
| BME280 Breakout | 1 | ₱100 | Lazada |
| LiPo Battery 12V 10Ah | 1 | ₱1,500 | Lazada |
| UPS HAT for RPi | 1 | ₱600 | Lazada |
| Buck Converters | 2 | ₱100 | Lazada |
| Enclosure | 1 | ₱500 | Local |
| **Total** | | **~₱8,500** | |

---

## 9. 📋 NEXT STEPS

### **Immediate (This Week):**

| # | Task | Owner | Status |
|---|------|-------|--------|
| 1 | Order hardware (RPi 5, ESP32, sensors) | You | TODO |
| 2 | Set up RPi 5 (OS, Python, PocketBase) | Sentinel | TODO |
| 3 | Flash ESP32 audio streaming firmware | Sentinel | TODO |
| 4 | Test WebSocket audio (ESP32 → RPi) | Sentinel | TODO |
| 5 | Test MLX90640 thermal reading | Sentinel | TODO |
| 6 | Train cough model on public datasets | Sentinel | TODO |
| 7 | Deploy model to RPi 5 | Sentinel | TODO |
| 8 | Build PocketBase API | Sentinel | TODO |
| 9 | Build Expo app UI | Sentinel | TODO |
| 10 | Integrate all components | Sentinel | TODO |

### **Before Deployment:**

| # | Task | Owner | Status |
|---|------|-------|--------|
| 11 | Test in lab (controlled environment) | You + Sentinel | TODO |
| 12 | Deploy in pig pen (24h calibration) | You | TODO |
| 3 | Collect 7-day baseline | Automatic | TODO |
| 14 | Evaluate accuracy | Sentinel | TODO |

---

## 10. ❓ YOUR DECISIONS NEEDED

| # | Question | My Rec | Your Call |
|---|----------|--------|-----------|
| 1 | **ESP32-D0WD for audio?** | Yes — low power, proven | ✅ / ❌ |
| 2 | **RPi 5 for main processing?** | Yes — enough power for ML | ✅ / ❌ |
| 3 | **WebSocket for audio?** | Yes — low latency | ✅ / ❌ |
| 4 | **PocketBase for API?** | Yes — open source, real-time | ✅ / ❌ |
| 5 | **Battery + UPS?** | Yes — farmer-friendly | ✅ / ❌ |
| 6 | **CCTV as add-on?** | Yes — future work | ✅ / ❌ |
| 7 | **Cloud sync as add-on?** | Yes — future work | ✅ / ❌ |
| 8 | **NH3 sensor as add-on?** | Yes — future work | ✅ / ❌ |

---

## 11. 🎯 RESEARCH QUESTIONS (Updated for v3)

**Primary:**
> Can a distributed edge system (ESP32 audio + RPi 5 thermal) with unsupervised domain adaptation automatically calibrate to new pig farms, maintaining cough detection accuracy across varying open-air environments without farmer intervention?

**Secondary:**
1. How does WebSocket audio streaming latency affect real-time cough detection?
2. Can relative thermal thresholding (±1.5°C from rolling baseline) detect fever without absolute calibration?
3. What is the optimal round-robin cycle time for multi-modal fusion?
4. How does battery life vary with inference frequency?

---

*End of Architecture Document*