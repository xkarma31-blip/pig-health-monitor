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

**The build of record is PlatformIO.** It uses Arduino core **2.0.17** — the exact
toolchain `docs/KNOWN_GOOD.md` pins for the firmware that produced working audio.

```bash
cd ~/pig-health-monitor/v3-mqtt-pocketbase/firmware/esp32s3-mic-ambient/arduino/esp32s3_telemetry
pio run
```

Expected (verified 2026-10-19): `[SUCCESS]` in ~13 s,
`Flash: 54.7% (716653 bytes)` · `RAM: 14.3% (46724 bytes)`.

> `platformio.ini` already sets `upload_port` / `monitor_port` to `/dev/ttyACM0`,
> so you never pass `-p` by hand.

### arduino-cli — syntax checks only, **never flash it**

`arduino-cli` builds this same source against core **3.3.12** — a major version
apart from 2.0.17 — and produces a **different binary** (~904 KB vs ~717 KB).
It is a convenient fast library/syntax check, but it is **not** a substitute for
the PlatformIO build and its output is **not** the known-good firmware.

It also cannot build this folder in place. Arduino requires the sketch folder to
be named after its `.ino`, and here the `.ino` lives in `src/` (PlatformIO
layout), so `arduino-cli compile … .` fails with:

```
Can't open sketch: main file missing from sketch: .../esp32s3_telemetry/esp32s3_telemetry.ino
```

---

## 3. Flash (only after wiring is done and the board is plugged in)

```bash
cd ~/pig-health-monitor/v3-mqtt-pocketbase/firmware/esp32s3-mic-ambient/arduino/esp32s3_telemetry
pio run -t upload                                   # normal streaming firmware
pio run -c platformio.usb-diagnostic.ini -t upload  # USB-only diagnostic (no WiFi)
```

If the board is in a bad state (e.g. it was crash-looping), put it in download mode first:
**hold BOOT → tap RST → release BOOT**, then run the upload.

> ⚠️ **Archive the working state before every flash.** `docs/KNOWN_GOOD.md` is the
> way back — copy the `.bin` + source into `docs/known-good-YYYYMMDD/` and add a
> row with its sha256 *first*, then flash.

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
| No serial output | USB CDC not enabled | `build_flags` must contain `-DARDUINO_USB_CDC_ON_BOOT=1` in `platformio.ini` |
| `could not open port /dev/ttyACM0` | The port is held by another program | Close any open monitor (PlatformIO, Arduino IDE, esptool) — only one can hold it |

---

## 7. Architecture

```
INMP441 → ESP32-S3 → TCP :9090 → Pi bridge → :8080/audio/stream
                     ↘ MQTT :1883 → :8080/audio/status
```

---

## 8. Where everything lives (debug map)

### Edit these — firmware source

| File | Role |
|---|---|
| `arduino/esp32s3_telemetry/src/esp32s3_telemetry.ino` | **The firmware.** I2S mic → TCP :9090 + MQTT |
| `arduino/esp32s3_telemetry/src/sht_probe.h` | SHT I²C probe (`sht pins SDA SCL` / `sht scan`). **Orphaned — no `.ino`/`.cpp`/build file includes it, so it has never been compiled.** Not present in either firmware |
| `arduino/esp32s3_telemetry/src/sensor_usb_diagnostic.cpp` | USB-only diagnostic — **excluded from the normal build** |
| `arduino/esp32s3_telemetry/platformio.ini` | Normal build config |
| `arduino/esp32s3_telemetry/platformio.usb-diagnostic.ini` | Diagnostic-only build config |

`platformio.ini` sets `build_src_filter = +<*> -<sensor_usb_diagnostic.cpp>`, so
the streaming firmware can never contain the diagnostic. The diagnostic ini
inverts it: `-<*> +<sensor_usb_diagnostic.cpp>`.

### Read these — build output

| Path | What |
|---|---|
| `arduino/esp32s3_telemetry/.pio/build/esp32-s3/firmware.elf` | ELF for **crash decoding** — must match what is flashed |
| `arduino/esp32s3_telemetry/.pio/build/esp32-s3/firmware.bin` | the binary that gets flashed |
| `arduino/esp32s3_telemetry/build/` · `arduino/build/` | ⚠️ **stale arduino-cli artifacts**, committed historically. `pio run` does not produce these — ignore them |

### The register — the way back

| Path | What |
|---|---|
| `docs/KNOWN_GOOD.md` | Pinned toolchain + sha256 per known-good build |
| `docs/known-good-20261013/firmware-normal.bin` | Archived known-good binary |
| `docs/MIC_AUDIT_20261017.md` · `docs/MIC_FIX_20261013.md` | Investigation history |
| `docs/wiring/` | Wiring diagram, pinout, INMP441 datasheet |

### Toolchains — outside the repo

| Tool | Path |
|---|---|
| PlatformIO | `~/.local/bin/pio` · packages in `~/.platformio/packages/` |
| Arduino CLI | `~/.local/bin/arduino-cli` · core in `~/.arduino15/` |
| arduino-cli libraries | `~/Arduino/libraries` — **capital A**, not `~/arduino` |
| esptool (flash-level) | `~/.arduino15/packages/esp32/tools/esptool_py/*/esptool` |
| addr2line (crash decode) | `~/.arduino15/packages/esp32/tools/esp-x32/*/bin/xtensa-esp32s3-elf-addr2line` |

### Debug recipes

**Is the chip alive at all?** Bypasses Arduino and talks to the flash directly:
```bash
~/.arduino15/packages/esp32/tools/esptool_py/*/esptool --port /dev/ttyACM0 chip_id
```
If this fails too, it is cable / port / boot-mode — not your code.

**Decode a crash backtrace** (`Guru Meditation Error`):
```bash
cd ~/pig-health-monitor/v3-mqtt-pocketbase/firmware/esp32s3-mic-ambient/arduino/esp32s3_telemetry
pio run    # rebuild first so the .elf matches what is on the board
~/.arduino15/packages/esp32/tools/esp-x32/*/bin/xtensa-esp32s3-elf-addr2line \
  -pfiaC -e .pio/build/esp32-s3/firmware.elf 0x42012345 0x4201abcd
```

**Smoke test when something breaks** — `pio run` compiles, `pio device monitor`
talks to the board. If the compile fails, the board is irrelevant.
