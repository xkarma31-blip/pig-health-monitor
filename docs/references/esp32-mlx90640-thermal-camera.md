# DIY Heat Vision Camera Using ESP32 & MLX90640 — Complete Reference

## Video Source
- **Title:** DIY Heat Vision Camera Using ESP32 & MLX90640
- **Creator:** How to Electronics
- **URL:** https://youtu.be/yBuEyAyZwvU
- **Views:** 24,583 | **Published:** May 10, 2026
- **Channel:** How to Electronics (100K subscribers)
- **Duration:** 11 min read (article)
- **Retrieved:** 2026-09-09

## Article Source
- **Title:** DIY ESP32 MLX90640 IR Thermal Camera with Live Web Display
- **URL:** https://how2electronics.com/diy-esp32-mlx90640-ir-thermal-camera-with-live-web-display
- **Author:** Mamtaz Alam
- **Published:** May 3, 2026 (Updated: May 10, 2026)

---

## Hardware Specifications

### MLX90640 Sensor
| Spec | Value |
|------|-------|
| Pixels | 32 × 24 (768 temp points) |
| Temp range | -40°C to 300°C |
| Accuracy | ±1°C |
| FOV options | 55°×35° or 110°×75° |
| Refresh rate | 0.5Hz – 64Hz |
| I2C address | 0x33 |
| I2C speed | Up to 1MHz |
| Operating voltage | 3.3V or 5V |
| Current consumption | <23mA |
| Package | TO39 (4-lead) |
| NETD | 0.1K RMS @1Hz |
| Extras | Ambient temp sensor, supply voltage sensor |

### ESP32 Board
| Component | Details |
|-----------|---------|
| MCU | ESP32-WROOM-32 |
| I2C SDA | GPIO21 |
| I2C SCL | GPIO22 |
| Power | USB Type-C + Li-ion battery |
| Battery charger | BQ24092D (CC/CV, auto cut-off) |
| Voltage regulator | TPS63020 (buck-boost, 3.0–4.2V → 3.3V) |
| Programming | FTDI adapter via PROG header |
| Auto-reset | Q1 + Q2 transistors (no buttons needed) |

### PCB Design
- Tool: EasyEDA
- Components: SMD 0603 package
- Layers: Single-sided (front only for critical parts)
- Order: Aivon ($1 prototype + $35 assembly + $30 shipping off)
- Gerber/BOM/Pick&Place files available for download

---

## Key Features

### Web Interface
- Live thermal heatmap with bilinear interpolation
- Color palette mapping (Iron/Rainbow/Arctic/Gray)
- Frame smoothing (temporal filter)
- Contrast enhancement (3%–97% percentile range)
- Hot/cold markers (crosshairs on min/max)
- Download current frame as CSV

### Real-Time Stats
- Minimum temperature + position (X,Y)
- Maximum temperature + position (X,Y)
- Average temperature (all 768 pixels)
- Center temperature (middle 4 pixels)
- Ambient temperature (sensor estimate)
- FPS + read duration

### Wi-Fi
- AP mode: SSID "MLX90640-Camera", pass "12345678"
- Browser: http://192.168.4.1
- Also supports STA mode (connect to existing router)

---

## Source Code Structure

### Files
1. **thermal_image.ino** — Main ESP32 program (Wi-Fi, webserver, sensor logic)
2. **webpage.h** — HTML/CSS/JS for browser UI
3. **MLX90640 custom library** — Separate download

### Downloads
- MLX90640 Custom Library: Available from article page
- Schematic PDF
- Bill of Materials (BOM)
- Pick & Place File
- Gerber File

---

## Code: thermal_image.ino

```cpp
/*
  ESP32-WROOM-32 + MLX90640 Enhanced Web Thermal Camera

  Only two sketch files are normally edited:
    thermal_image/thermal_image.ino   -> ESP32, Wi-Fi, web server, MLX90640 read logic
    thermal_image/webpage.h           -> Browser UI and thermal image rendering

  MLX90640 library stays in:
    libraries/MLX90640/

  Hardware wiring:
    ESP32 GPIO21 -> MLX90640 SDA
    ESP32 GPIO22 -> MLX90640 SCL
    ESP32 3V3    -> MLX90640 VIN / 3V3
    ESP32 GND    -> MLX90640 GND

  Browser:
    Connect to ESP32 Wi-Fi AP: MLX90640-Camera
    Password: 12345678
    Open: http://192.168.4.1
*/

#include <Arduino.h>
#include <Wire.h>
#include <WiFi.h>
#include <WebServer.h>

#include <MLX90640_I2C_Driver.h>
#include <MLX90640_API.h>

#include "webpage.h"

// ---------------- ESP32 I2C pins ----------------
#define I2C_SDA 21
#define I2C_SCL 22

// ---------------- MLX90640 settings ----------------
static const uint8_t MLX90640_ADDR = 0x33;
static const float EMISSIVITY = 0.95f;
static const float TA_SHIFT = 8.0f;

// Refresh-rate register values used by the Melexis API:
// 0x00=0.5Hz, 0x01=1Hz, 0x02=2Hz, 0x03=4Hz,
// 0x04=8Hz, 0x05=16Hz, 0x06=32Hz, 0x07=64Hz
static const uint8_t MLX_REFRESH_RATE = 0x04;  // 8 Hz

// 0x00=16-bit, 0x01=17-bit, 0x02=18-bit, 0x03=19-bit
static const uint8_t MLX_RESOLUTION = 0x02;    // 18-bit ADC resolution

static const uint32_t I2C_CLOCK_HZ = 800000UL;
static const uint32_t FRAME_INTERVAL_MS = 110;

// Wi-Fi mode: 1=AP mode, 0=STA mode
#define USE_AP_MODE 1

#if USE_AP_MODE
const char* AP_SSID = "MLX90640-Camera";
const char* AP_PASS = "12345678";
#else
const char* WIFI_SSID = "YOUR_WIFI_NAME";
const char* WIFI_PASS = "YOUR_WIFI_PASSWORD";
#endif

WebServer server(80);

paramsMLX90640 mlxParams;
float thermalPixels[32 * 24];
uint16_t mlxFrame[834];

float minTemp, maxTemp, avgTemp, centerTemp, ambientTemp;
uint16_t minIndex, maxIndex;
uint8_t minX, minY, maxX, maxY;
bool sensorReady = false;
bool frameValid = false;
uint32_t lastFrameRequestMs, lastFrameCompleteMs, frameCounter, lastReadDurationMs;
float measuredFps = 0.0f;
String lastError = "Starting";
```

### Key Functions

| Function | Purpose |
|----------|---------|
| `isMLXConnected()` | Check sensor on I2C bus |
| `calculateStats()` | Compute min/max/avg/center temps |
| `readMLX90640Frame()` | Read 2 subpages, calculate temps |
| `makeJsonData()` | JSON payload with all 768 pixels + stats |
| `makeCsvData()` | CSV of 32×24 temp matrix |
| `setupWebServer()` | HTTP endpoints: /, /data, /csv, /health |
| `initializeMLX90640()` | Extract params, set refresh/resolution/mode |
| `setupWiFi()` | AP or STA mode |
| `setup()` | Init serial, I2C, WiFi, server, sensor |
| `loop()` | Handle web clients, read frames at interval |

### Web Endpoints
| Endpoint | Type | Description |
|----------|------|-------------|
| `/` | HTML | Serve webpage |
| `/data` | JSON | Full frame data + stats |
| `/csv` | CSV | Raw temperature matrix |
| `/health` | Text | Sensor status + diagnostics |

---

## Code: webpage.h (JavaScript)

### Canvas Rendering
- 32×24 sensor → 512×384 canvas (16× upscaling)
- Bilinear interpolation for smooth image
- Four color palettes: Iron, Rainbow, Arctic, Gray

### Controls
- Palette selector
- Smooth/Pixel interpolation toggle
- Detail boost (0–1.2, edge enhancement)
- Frame smoothing (0–0.85, temporal filter)
- Enhanced contrast (checkbox, uses 3%–97% range)
- Hot/cold markers (checkbox, draws crosshairs)
- Download CSV button

### Real-Time Updates
- Fetches `/data` every 85ms
- Displays: center, min (with pos), max (with pos), avg, ambient, FPS, readMs

---

## Related Projects

1. [DIY Thermal Camera with MLX90640 & Raspberry Pi](https://how2electronics.com)
2. [Thermal Fever Detector with MLX90640 & OpenCV](https://how2electronics.com)

---

## Links Summary
- [Video](https://youtu.be/yBuEyAyZwvU)
- [Written Tutorial](https://how2electronics.com/diy-esp32-mlx90640-ir-thermal-camera-with-live-web-display)
- [PCB Order - Aivon](https://www.aivon.com/welcome-credits?code=K5)
- [How2Electronics Facebook](https://facebook.com/howtoelectronicsfb)
- [How2Electronics Instagram](https://instagram.com/howtoelectronics)
- [How2Electronics Twitter](https://twitter.com/how2electronics)

---

## Local Downloads

All files saved to: `~/pig-health-monitor/downloads/esp32-mlx90640-thermal-camera/`

| File | Size | Description |
|------|------|-------------|
| `mlx90640-datasheet.pdf` | 2.4 MB | Official Melexis datasheet |
| `schematic.pdf` | 185 KB | Circuit schematic |
| `mlx90640-custom-library.zip` | 9 KB | Arduino library for sensor |
| `gerber-file.zip` | 131 KB | PCB Gerber files |
| `bom.xlsx` | 9 KB | Bill of Materials |
| `pick-place.xlsx` | 10 KB | Pick & Place file |
| `thermal_image.ino` | 13 KB | Main ESP32 firmware |
| `webpage.h` | 27 KB | Web interface (HTML/CSS/JS) |
