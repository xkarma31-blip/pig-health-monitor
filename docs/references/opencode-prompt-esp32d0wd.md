# OpenCode Prompt: ESP32 D0WD Pig Health Thermal Monitor

You are programming an **ESP32-D0WD** microcontroller for a **pig health monitoring device** (PigPulse). This is NOT a generic thermal camera — it is a livestock fever screening system for open-air tropical pig pens.

## Hardware Target

**Microcontroller:** ESP32-D0WD (dual-core, 240MHz, 520KB SRAM, 4MB flash)
- NOT ESP32-S3. This is the original ESP32 variant.
- WiFi + Bluetooth built-in

**Sensors:**
1. **MLX90640** Thermal Camera (32×24 pixels, 768 temp points)
   - I2C address: 0x33
   - I2C SDA: GPIO21
   - I2C SCL: GPIO22
   - FOV: 110°×75° (wide angle for pig pen coverage)
   - Purpose: Screen pig body surface temperature for fever detection

2. **INMP441** MEMS Microphone (×2, stereo)
   - I2S BCLK: GPIO26
   - I2S LRCK: GPIO25
   - I2S DOUT: GPIO33 (mic 1), GPIO32 (mic 2)
   - Purpose: Audio cough/respiratory distress detection

**Power:**
- 3.7V LiPo battery (2000mAh target)
- Battery voltage divider: GPIO34 (ADC1_CH6)
- Charging: TP4056 module or similar

**Connectivity:**
- WiFi AP mode for configuration
- ESP-NOW long-range for data transmission to gateway
- Optional: Bluetooth for phone configuration

## Reference Material

All reference files are at: `~/pig-health-monitor/downloads/esp32-mlx90640-thermal-camera/`

Key files:
- `thermal_image.ino` — Generic ESP32 thermal camera (ADAPT THIS FOR PIGPULSE)
- `webpage.h` — Web UI (ADAPT FOR PIG HEALTH DASHBOARD)
- `schematic.pdf` — Reference circuit (MLX90640 + ESP32 wiring)
- `mlx90640-datasheet.pdf` — Sensor specifications
- `bom.xlsx` — Component list
- `gerber-file.zip` — PCB design files

## What to Build

Create a new Arduino project at `~/pig-health-monitor/firmware/esp32d0wd-pigpulse/` with:

### 1. Main Firmware (`esp32d0wd-pigpulse.ino`)
Adapt the reference `thermal_image.ino` for:
- **Pig-specific thermal logic:**
  - Fever threshold detection (pig normal: 38.5-39.5°C, fever: >40°C)
  - Ambient temperature compensation (solar loading correction)
  - Frame averaging to reduce noise from dust/humidity
  - Hotspot detection (identify hottest pixel cluster = pig body)
  - Center-zone temp (primary measurement)
  - Min/max/avg for health assessment
  
- **Audio pipeline:**
  - I2S dual-mic sampling at 16kHz
  - RMS energy calculation (cough detection)
  - Simple frequency analysis (distress vocalization)
  - Buffer audio features, not raw audio (memory constrained)
  
- **Power management:**
  - Deep sleep between readings (target: 1 reading per 5 min)
  - Wake from timer + GPIO (external trigger)
  - Battery voltage monitoring
  - Low-battery warning threshold (<3.3V)
  
- **Communication:**
  - ESP-NOW send structured telemetry packet to gateway
  - WiFi AP fallback for direct phone connection (configuration mode)
  - Data packet: {device_id, timestamp, center_temp, max_temp, ambient_temp, audio_rms, battery_v, alert_flags}
  
- **Web dashboard:**
  - Serve real-time thermal view (like reference but pig-themed stats)
  - Show fever alert status prominently
  - Audio level indicator
  - Battery status
  - Historical sparkline (last 24h if stored in NVS)

### 2. Web Interface (`webpage.h`)
Adapt the reference `webpage.h` with:
- **Dashboard layout** (not just thermal image)
- **Fever alert banner** (red when temp > threshold)
- **Pig pen stats panel:**
  - Current reading
  - 24h trend (mockup)
  - Alert history
- **Audio panel:**
  - Live level meter
  - Cough event counter
- **System panel:**
  - Battery %
  - WiFi signal
  - Uptime
  - Free heap

### 3. Configuration (`config.h`)
Separate config file with:
- Pin definitions
- Thresholds (fever temp, low battery)
- WiFi credentials (AP mode defaults)
- ESP-NOW peer address (gateway MAC)
- Sampling interval
- Device ID

### 4. Data Structures (`types.h`)
- Telemetry packet struct
- Alert flags enum
- Sensor reading struct

## Key Differences from Reference Project

| Feature | Reference (Generic) | PigPulse (Target) |
|---------|-------------------|-------------------|
| Purpose | Electronics troubleshooting | Livestock fever screening |
| Thermal logic | Min/max/avg + markers | Fever threshold + ambient compensation |
| Audio | None | Dual INMP441 for cough detection |
| Power | USB/battery, always on | Deep sleep, 5-min intervals, LiPo managed |
| Display | Web dashboard only | Web + ESP-NOW to gateway |
| Environment | Indoor bench | IP65 pig pen, tropical outdoor |
| Refresh rate | 8 FPS continuous | 1 reading per 5 min (power saving) |
| Alerts | None | Fever threshold, low battery, sensor fail |

## Code Structure Requirements

1. **Modular:** Separate files for sensors, wifi, web, power, config
2. **Non-blocking:** Use millis() timing, no delay() in loop
3. **Memory conscious:** ESP32-D0WD has only 520KB SRAM. Avoid large buffers.
4. **Fail-safe:** Sensor failure should not crash device — report error via alert flag
5. **OTA-ready:** Reserve space for future OTA updates (even if not implemented now)

## Output

Generate all source files and save to `~/pig-health-monitor/firmware/esp32d0wd-pigpulse/`. Include:
- `esp32d0wd-pigpulse.ino` — main file
- `config.h` — configuration
- `types.h` — data structures
- `sensors.cpp` / `sensors.h` — MLX90640 + INMP441 drivers
- `wifi.cpp` / `wifi.h` — ESP-NOW + WiFi management
- `web.cpp` / `web.h` — web server
- `webpage.h` — HTML/CSS/JS
- `power.cpp` / `power.h` — deep sleep + battery
- `CMakeLists.txt` or `platformio.ini` — build config

Use the reference thermal_image.ino and webpage.h as starting points but significantly adapt for the pig health monitoring use case.
