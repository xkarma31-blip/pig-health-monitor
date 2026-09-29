# PigPulse v3 — Core vs Add-Ons (Clear Divide)
> **September 14, 2026**
> **Honest take, no fluff**

---

## 1. 🎯 CORE (Must Deliver — No Compromise)

| Component | What | Why Core |
|-----------|------|----------|
| **Audio acquisition** | ESP32 + INMP441 | Without this, no cough detection |
| **Cough detection** | MFCC + CNN | The primary research contribution |
| **Thermal fever** | MLX90640 | Second modality — multi-modal is the point |
| **Fusion engine** | Round-robin synthesis | Combines audio + thermal into health score |
| **Auto-calibration** | Band-wise stats | Solves the farmer-calibration problem |
| **Local storage** | PocketBase or SQLite | Works offline |
| **Mobile alerts** | Expo app | Farmer must be able to act |
| **Battery power** | LiPo + management | Must not rely on wall outlet |

**Minimum system = ESP32-S3 + INMP441 + MLX90640 + Battery + PocketBase + Expo**

---

## 2. 🔌 ADD-ONS (Future Support — Not Blocking)

| Add-On | What It Adds | Future Support | Cost |
|--------|-------------|----------------|------|
| **CCTV Pig ID** | Individual pig tracking | Camera connector + software pipeline | ₱1,500 + camera |
| **Cloud Sync** | Remote monitoring from anywhere | MQTT/HTTP bridge to cloud PocketBase | ₱0 (software) |
| **NH3/CO2 Sensors** | Environmental gas monitoring | I2C/ADC expansion + calibration | ₱200-500 |
| **Solar Charging** | Indefinite deployment | MPPT charge controller | ₱800 |
| **Voice Alerts** | On-device audio feedback | Speaker + TTS | ₱100 |
| **Multi-Pen** | Monitor multiple pens | Additional ESP32 audio nodes | ₱350/pen |
| **Vet Dashboard** | Web dashboard for veterinarians | Web frontend on RPi | ₱0 (software) |
| **SoundTalks RDI Comparison** | Benchmark against commercial | API integration or parallel deployment | Time |
| **Ota Updates** | Remote firmware updates | WebSocket firmware transfer | ₱0 (software) |

---

## 3. 🔮 FUTURE-PROOF DESIGN (How to Add Later)

### **Hardware Expansion Points:**

```
┌─────────────────────────────────────────────────────────────────┐
│  FUTURE-PROOF PIN LAYOUT (ESP32-S3 or RPi Zero 2W)              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ALREADY USED:                                                  │
│  ├── I2C (MLX90640) → Can daisy-chain: BME280, NH3 sensor     │
│  ├── I2S (INMP441) → Audio in                                  │
│  ├── WiFi → WebSocket + MQTT                                   │
│  └── 5V/3.3V power rails                                       │
│                                                                 │
│  AVAILABLE FOR ADD-ONS:                                         │
│  ├── GPIO 4,5,6,7 → SPI (SD card, display)                     │
│  ├── GPIO 8,9,10 → UART (GPS module, second ESP32)             │
│  ├── GPIO 11,12,13 → I2C expansion (CO2, NH3 sensors)          │
│  ├── GPIO 14,15 → ADC (analog sensors, battery voltage)         │
│  ├── USB port → Camera (future CCTV)                            │
│  └── Ethernet (RPi) → Wired network (backup WiFi)               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### **Software Expansion Points:**

```python
# Future add-on integration is just adding modules:

# In main loop:
def main_loop():
    # CORE (always runs)
    audio_data = get_audio()
    thermal_data = get_thermal()
    health_score = fuse(audio_data, thermal_data)
    send_to_expo(health_score)
    
    # ADD-ONS (optional, loaded at startup)
    if config['camera_enabled']:
        pig_id = track_pigs()
        correlate_with_health(pig_id, health_score)
    
    if config['cloud_enabled']:
        sync_to_cloud(health_score)
    
    if config['nh3_enabled']:
        nh3_level = read_nh3()
        adjust_health_for_air_quality(health_score, nh3_level)
    
    if config['solar_enabled']:
        monitor_solar_charging()
```

---

## 4. 🧠 HONEST TAKE: WHAT'S THE PERFECT PROCESSOR?

### **If NOT RPi 5, what then?**

| Option | Cost | Pros | Cons | Verdict |
|--------|------|------|------|---------|
| **ESP32-S3 (8MB PSRAM)** | ₱500 | Cheapest, lowest power, proves TinyML | No Linux, no camera, limited RAM | ✅ **BEST for capstone** |
| **RPi Zero 2W** | ₱1,500 | Linux, TFLite, PocketBase, camera | Slower than Pi 5, limited RAM | ✅ **BEST balance** |
| **RPi 4 (2GB)** | ₱2,500 | Full Linux, fast, camera, Ethernet | More power, more expensive | ✅ **If budget allows** |
| **Orange Pi Zero 2W** | ₱1,200 | Cheaper than RPi, similar specs | Less community support | ⚠️ Risky |
| **NVIDIA Jetson Nano** | ₱5,000 | GPU for computer vision | Overkill, expensive, power-hungry | ❌ Overkill |
| **ESP32-S3 + RPi Zero 2W** | ₱2,000 | Best of both worlds | More complex | ✅ **PERFECT COMBO** |

### **My Honest Recommendation:**

#### **Option A: ESP32-S3 ALONE (Most Impressive for Research)**

```
┌─────────────────────────────────────────────────────────────┐
│  ESP32-S3 (8MB PSRAM) — THE HONEST PERFECT CONTROLLER       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Why it's perfect:                                          │
│  ├── ₱500 vs ₱4,500 (RPi 5) — 9× cheaper                  │
│  ├── 0.3W vs 6W — 20× less power                           │
│  ├── TinyML is the research — this IS the contribution      │
│  ├── Proves edge AI without Linux crutch                   │
│  ├── Battery-friendly — runs for days                      │
│  └── More impressive to panel (you built a real embedded AI)│
│                                                             │
│  What it does:                                              │
│  ├── Audio CNN inference (proven: Clinton Oduor 2021)       │
│  ├── MLX90640 thermal (I2C, simple)                        │
│  ├── Band-wise calibration (math, easy)                    │
│  ├── Round-Robin fusion (state machine, trivial)           │
│  ├── MQTT to phone (no PocketBase needed)                  │
│  ├── WebSocket to RPi (if you add one later)               │
│  └── Deep sleep between inference (power saving)           │
│                                                             │
│  What it can't do (yet):                                    │
│  ├── No camera (needs USB + JPEG encoder)                  │
│  ├── No Linux (no PocketBase, no Python)                   │
│  ├── No USB peripherals                                    │
│  └── Limited to TFLite Micro models                        │
│                                                             │
│  Future add-ons:                                            │
│  ├── Add RPi Zero 2W later for camera + cloud              │
│  ├── Add NH3 sensor via I2C                                │
│  ├── Add solar via GPIO monitoring                         │
│  └── Upgrade firmware via OTA                              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### **Option B: RPi Zero 2W (Best Balance)**

```
┌─────────────────────────────────────────────────────────────┐
│  RPi Zero 2W — BEST BALANCE                                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Why it's good:                                             │
│  ├── Runs Linux (Python, OpenCV, TensorFlow)               │
│  ├── PocketBase compatible                                 │
│  ├── Camera port (future CCTV)                             │
│  ├── WiFi built-in                                        │
│  ├── ~₱1,500 vs ₱4,500 (Pi 5)                             │
│  └── Still low power (~1.5W)                               │
│                                                             │
│  Downsides:                                                 │
│  ├── Less impressive for capstone (just Linux)             │
│  ├── Slower than Pi 5 (but fine for audio)                 │
│  └── Only 512MB RAM (limits model size)                    │
│                                                             │
│  Verdict: If you want camera + cloud later, get this.      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### **Option C: ESP32-S3 + RPi Zero 2W (PERFECT COMBO)**

```
┌─────────────────────────────────────────────────────────────┐
│  ESP32-S3 + RPi Zero 2W — PERFECT COMBO                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Architecture:                                              │
│  ├── ESP32-S3: Audio + Thermal + Calibration (real-time)   │
│  ├── RPi Zero 2W: PocketBase + Camera + Cloud (server)     │
│  └── WebSocket between them                                │
│                                                             │
│  Why perfect:                                               │
│  ├── ESP32 handles real-time (deterministic, low power)    │
│  ├── RPi handles storage + camera + cloud (flexible)       │
│  ├── Best of both worlds                                   │
│  ├── Panel will love the distributed design                │
│  └── Total: ~₱2,000 (still cheaper than Pi 5 alone)        │
│                                                             │
│  Future add-ons: All supported                             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. 🏆 FINAL RECOMMENDATION

### **For Capstone Defense:**

| Goal | Best Choice |
|------|-------------|
| **Cheapest** | ESP32-S3 alone (₱500) |
| **Most impressive** | ESP32-S3 alone (proves TinyML) |
| **Most flexible** | RPi Zero 2W (₱1,500) |
| **Best balance** | ESP32-S3 + RPi Zero 2W (₱2,000) |
| **Safest** | RPi 4 (₱2,500) — no surprises |

### **My Honest Vote:**

> **ESP32-S3 ALONE for the capstone.**

**Why:**
1. **It's the research.** TinyML on a $3 microcontroller is more impressive than Linux on a $60 SBC.
2. **It's cheaper.** More budget for sensors, enclosure, solar.
3. **It's lower power.** Battery lasts days, not hours.
4. **It's real engineering.** You're not just running Python scripts.
5. **Panel will ask "Why RPi 5 for audio inference?"** — you won't have a good answer.

**But if you need camera + cloud later:**
> Add RPi Zero 2W as co-processor. ESP32 does real-time, RPi does storage + camera.

---

## 6. 📊 UPDATED BOM (ESP32-S3 Core)

| Item | Qty | Cost (PHP) | Notes |
|------|-----|------------|-------|
| **ESP32-S3 (8MB PSRAM)** | 1 | ₱500 | Core controller |
| **INMP441 Breakout** | 1 | ₱150 | Microphone |
| **MLX90640 Breakout** | 1 | ₱800 | Thermal camera |
| **BME280 Breakout** | 1 | ₱100 | Ambient sensor |
| **TP5100 Charge Ctrl** | 1 | ₱50 | Battery charging |
| **DW01A Protection** | 1 | ₱30 | Battery safety |
| **LM2596 Buck 5V** | 1 | ₱40 | Power regulation |
| **LiPo 3S 10Ah** | 1 | ₱1,500 | Battery |
| **Solar Panel 20W** | 1 | ₱800 | Optional |
| **Enclosure** | 1 | ₱500 | Weatherproof |
| **Misc (PCB, wires)** | 1 | ₱200 | |
| **Total** | | **~₱4,670** | |

**Add RPi Zero 2W later: +₱1,500**

---

## 7. 🔮 ADD-ON INTEGRATION MAP

```
┌─────────────────────────────────────────────────────────────────┐
│  FUTURE-PROOF ARCHITECTURE                                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  CORE (ESP32-S3)                                                │
│  ├── INMP441 → Audio → CNN → Cough detection                   │
│  ├── MLX90640 → Thermal → Ear ROI → Fever detection            │
│  ├── BME280 → Ambient → Compensation                           │
│  ├── Band-wise calibration → Unsupervised adaptation           │
│  ├── Round-robin fusion → Health score                         │
│  ├── MQTT → Expo app (alerts)                                  │
│  └── WebSocket → RPi Zero 2W (future)                          │
│                                                                 │
│  ADD-ON LAYER 1 (RPi Zero 2W — Future)                         │
│  ├── PocketBase → Local storage + REST API                     │
│  ├── Camera → Pig ID tracking (OpenCV + YOLO)                  │
│  ├── Cloud sync → Remote monitoring                            │
│  ├── Vet dashboard → Web interface                             │
│  └── MQTT bridge → Subscribe to ESP32 data                    │
│                                                                 │
│  ADD-ON LAYER 2 (Sensors — Future)                             │
│  ├── NH3 sensor → Air quality monitoring (I2C)                 │
│  ├── CO2 sensor → Ventilation assessment (I2C)                 │
│  ├── GPS module → Location tracking (UART)                     │
│  └── Speaker → On-device alerts (I2S)                          │
│                                                                 │
│  ADD-ON LAYER 3 (Power — Future)                               │
│  ├── Solar MPPT → Indefinite deployment                        │
│  ├── Supercapacitor → Peak power buffering                     │
│  └── PoE → Wired power (if available)                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 8. ✅ SUMMARY

| Question | Answer |
|----------|--------|
| **Core must-haves** | ESP32-S3 + INMP441 + MLX90640 + BME280 + Battery + MQTT + Expo |
| **Add-ons** | Camera, cloud, NH3, solar, voice, multi-pen, vet dashboard |
| **Future-proofing** | I2C/SPI/UART expansion, MQTT topics, modular firmware |
| **Perfect processor** | **ESP32-S3 alone** (most impressive, cheapest, lowest power) |
| **If need camera later** | Add RPi Zero 2W as co-processor |
| **Total core cost** | **~₱4,670** (with DIY power) |
| **Panel impression** | High — real TinyML on microcontroller |

---

*Honest take: ESP32-S3 is the perfect controller for this research. It's the engineering equivalent of "doing more with less" — exactly what capstone panels want to see.*