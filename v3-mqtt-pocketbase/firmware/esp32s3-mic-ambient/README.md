# ESP32-S3 Mic + TCP Stream + MQTT — Setup Guide

**Device ID:** `s3-mic-01` · **Board:** ESP32-S3 rev v0.2, 4 MB flash, 2 MB PSRAM
**Purpose:** INMP441 microphone → TCP audio stream to Pi :9090 + MQTT telemetry to Pi :1883

---

## 1. Wiring

### INMP441 microphone → ESP32-S3

| INMP441 pin | Connect to | ESP32-S3 GPIO |
|---|---|---|
| VDD (pin 1) | 3V3 | — |
| GND (pin 2) | GND | — |
| WS (pin 3) | LRCL | **GPIO4** |
| SCK (pin 4) | BCLK | **GPIO5** |
| SD (pin 5) | data in | **GPIO6** |
| L/R (pin 6) | GND | — (GND = LEFT channel) |

### Images (open these)

- **Wiring diagram:** `docs/wiring/WIRING-diagram.png`
- **ESP32-S3 DevKitC-1 pinout:** `docs/wiring/esp32s3-devkitc1-pinout.jpg`
- **INMP441 datasheet (with schematic):** `docs/wiring/INMP441-module-datasheet.pdf`

### Pins to NEVER use on this board

| GPIO | Why |
|---|---|
| 19, 20 | Native USB D−/D+ — needed to flash and for Serial |
| 0, 3, 45, 46 | Strapping pins (boot mode) |
| 35, 36, 37 | Used by octal-PSRAM modules (free on ours, but avoid for portability) |
| 43, 44 | UART0 console |
| 33, 34 | Not broken out on WROOM modules |

---

## 2. Build (compiles the firmware)

```bash
cd ~/pig-health-monitor/v3-mqtt-pocketbase/firmware/esp32s3-mic-ambient/arduino/esp32s3_telemetry
export ARDUINO_DIRECTORIES_DATA=/home/solrahk/.arduino15
export ARDUINO_DIRECTORIES_USER=/home/solrahk/arduino
arduino-cli compile --fqbn "esp32:esp32:esp32s3:CDCOnBoot=cdc,FlashSize=4M,PartitionScheme=default,PSRAM=enabled,DebugLevel=none" .
```

Expected: `Sketch uses ~958,667 bytes (73%)` — **no errors**.

---

## 3. Flash (only after wiring is done and the board is plugged in)

```bash
arduino-cli upload -p /dev/ttyACM0 --fqbn "esp32:esp32:esp32s3:CDCOnBoot=cdc,FlashSize=4M,PartitionScheme=default,PSRAM=enabled,DebugLevel=none" .
```

If the board is in a bad state (e.g. it was crash-looping), put it in download mode first:
**hold BOOT → tap RST → release BOOT**, then run the upload.

---

## 4. Connect it to WiFi

The firmware connects to the Pi AP (`PigPulse` / `capstone`). No setup page — it just joins.

---

## 5. Verify it is working

Serial monitor:
```
Starting INMP441 + TCP + MQTT...
[wifi] connected ip=192.168.xxx.xxx
[tcp] connected
RMS: 1234  Peak: 5678
```

MQTT: `pig/s3-mic-01/telemetry` gets `{"mic":true,"rms":...,"peak":...}` every second.

TCP: Pi bridge on `:9090` receives raw PCM → `:8080/audio/stream`.

---

## 6. Troubleshooting

| Symptom | Meaning | Fix |
|---|---|---|
| `RMS: 0` constantly | Mic not driving the bus | Check VDD=3V3, GND, WS/SCK/SD wiring |
| `[tcp] connect failed` | Pi not listening on :9090 (service down or port busy) | `sudo systemctl restart pigpulse-thermal`, then `curl -s localhost:8080/esp/status` (a failed bind now shows `"bindError"`) |
| `[mqtt] connect failed` | Pi MQTT broker down | Check mosquitto on Pi |
| No serial output | USB CDC not enabled | Enable in Tools → USB CDC On Boot |

---

## 7. Architecture

```
INMP441 → ESP32-S3 → TCP :9090 → Pi bridge → :8080/audio/stream
                     ↘ MQTT :1883 → :8080/audio/status
```
