# PigPulse Rig — Device Inventory & Mic Verification

> **Purpose:** one place that says what every device IS, how to identify it, and
> what it is **NOT**. Written 2026-09-27 after a session where three different
> "cameras" and two different "ESPs" were easy to confuse.
>
> **Rule:** never say a device is verified without a readout from that device.

---

## 1. Device table

| # | Device | Hardware ID (readout) | Connects via | Role | State 2026-09-27 |
|---|---|---|---|---|---|
| 1 | **thermal-pi** (Raspberry Pi 4B) | hostname `raspberrypi.local`; service `pigpulse-thermal` on **:8080 HTTPS** | Ethernet/WiFi, own AP | Pig thermal node: MLX90640 + INMP441, MQTT→PocketBase | **OFF** (not on LAN; user powered it down) |
| 2 | **ESP32-S3** (the new board) | MAC `68:EE:8F:DD:31:3C`, chip id **9**, rev v0.2, 4 MB XMC XM25QH32C + 2 MB PSRAM, `/dev/ttyACM0`, USB `303a:1001` | USB-C to laptop; WiFi for MQTT | New telemetry node, deviceId **`s3-mic-01`** | Flashed once with a panicking build → **USB wedged**, needs BOOT+RST recovery |
| 3 | **ESP32 (original)** | chip id **0** (plain ESP32, not S3) | — | The old dual-INMP441 test rig | **LOST** (physically missing) |
| 4 | **Laptop house webcam** | `HP TrueVision HD`, USB `30c9:0064`, `/dev/video0` (+`video1` metadata) | USB | Master's webcam | Working. **NOT project CCTV — do not feed pig data from it** |
| 5 | **OBS Virtual Camera** | `/dev/video10` | none (software) | Screen/cam output | **NOT a real camera** — never probe this by mistake |
| 6 | **Project CCTV** | not yet inventoried — **network** device | **Pi AP** (barn Ethernet/AP) | Optional far-field audio+video tier | **UNREACHABLE** (Pi is off). Not a USB device; there is no USB camera besides #4/#5 |
| 7 | **Laptop PigPulse stack** | mosquitto `:1883` + WS `:9001`, bridge, PocketBase `:8090`, OpenResty `:80` | localhost | **TEST target**, code dated Sep 2–8 2026 | Running. **Test-era, not canonical** — Pi is the real target |

### Confusing pairs — the traps

- **#2 vs #3 — two different ESPs.** The new board is an **S3 (chip 9)**. Every
  prebuilt binary in `~/flowtales/esp32_inmp441_webui/build/` and `build80/` is
  for the **old ESP32 (chip 0)** and **will not run** on it. Verified via
  `esptool image_info`: *"Unexpected chip id in image. Expected 9 but value was 0."*
- **#4 vs #6 — two different cameras.** #4 is the house webcam on the laptop's
  USB. #6 is the project's CCTV and lives on the **Pi's AP**. They are unrelated.
- **#1 vs #7 — two different backends.** #7 (laptop) is the older test stack;
  #1 (Pi) is the real deployment. `BROKER_HOST` in the ESP firmware is the one
  line that switches between them.

### Known open discrepancy
- The ESP32-S3 ROM reports **PSRAM 2 MB** (`esptool chip_id`) but the running
  firmware's `ESP.getPsramSize()` printed **1 MB**. Unresolved — do not quote a
  PSRAM size until it is read back and explained.

---

## 2. How to *really* confirm a mic works

Derived from the thermal-pi mic investigation (see
`backend/thermal-pi/audio_debug_20260926/`). The core lesson: **all-zero samples
mean the mic is driving nothing — that is NOT "a quiet room".**

Three stages, in order. Do not skip to stage 3.

### Stage A — Loopback (proves the INPUT PATH, ignores the mic)
1. Unplug the mic's SD wire from the I2S data pin.
2. Jumper **WS → SD** (short BCLK-adjacent clock into data is not enough — connect
   the **word-select line to the data line**).
3. Read N frames and check for **non-zero** samples.
   - **NON-ZERO** → MCU/driver/capture path is proven. Fault is the mic or its wiring.
   - **ALL-ZERO** → the fault is upstream: power, clock, driver, or wrong ALSA device.

### Stage B — Pull-up probe (proves POWER + that the line is driven)
Before I2S claims the pin: set the data pin `INPUT_PULLUP` and read it.
- Reads **HIGH** → the mic is **not driving** the line → unpowered / not clocked / bad solder.
- Reads **LOW** → the mic **is** pulling the line (driving) → power and continuity are OK.

This is the single most informative test, and it is why the old ESP sketch had it.

### Stage C — Real signal (proves the mic actually hears)
1. Attach the mic with **L/R strapped to a defined level** (GND = LEFT on INMP441).
2. Stay silent 3 s → record the noise floor.
3. Clap / speak → the same channel must show:
   - `nonzero%` clearly above the floor
   - `peak` in the thousands (not single digits)
   - `rms` rising, then falling back
4. **Pass = the SAME channel that Stage B showed as driven moves with sound.**

### The pass/fail signature table

| Observation | Means |
|---|---|
| All-zero + pull-up reads HIGH | Mic unpowered / not clocked / bad joint |
| All-zero + pull-up reads LOW | Line is driven but capture path is dead → back to Stage A |
| Noise floor only, `nonzero%` tiny, no clap response | Mic powered but not clocked (check SCK/WS) or wrong slot |
| One channel live, other flat | **Expected** with a single mic on `L/R→GND` — not a fault |
| `nonzero%` high and `rms` tracks speech | **Mic verified.** Stop looking at hardware |

### Hard rules
- A single mono mic drives **one** I2S slot. Never diagnose "channel 2 broken".
- Playback must be mixed `(L+R)/2` or a headphone test can look like "no sound"
  when only the other ear is driven.
- A green service dashboard proves the *process* is alive, never that samples are non-zero.
- A browser meter that reads the actual PCM bytes is the only end-to-end proof.

---

## 3. Bring-up order for the ESP32-S3 (device #2)

1. Recover the board: **hold BOOT, tap RST, release BOOT**, then
   `RESET_MODE=no_reset bash ~/flowtales/esp32s3_telemetry/flash.sh`
   (recovery is needed because the panicking build wedged its USB endpoint:
   writes ≤6 B succeed, ≥46 B block forever).
2. Confirm on serial: `chip=ESP32-S3 mac=68:EE:8F:DD:31:3C flash=4MB` and **no
   Guru Meditation**.
3. Join the network: the firmware raises AP **`PIGPULSE-SETUP`**; join it and
   submit the WiFi SSID/password in the captive page (no password is baked in).
4. Confirm it reaches the broker: records appear in PocketBase `:8090/_/`
   under `telemetry` with `deviceId = s3-mic-01`, and `devices.status = online`.
5. Only then attempt audio — which needs **arduino-esp32 3.x + `<driver/i2s_std.h>`**.
   Core 2.0.14 / IDF 4.4 *panics* on the S3 (measured, not assumed).

## 4. I2S pin safety on ESP32-S3

| GPIO | Status |
|---|---|
| 26–32 | **Module's own SPI flash — never use** (this is why the old `DOUT=32` is invalid here) |
| 33–37 | Octal-PSRAM modules consume these; we have quad, but don't rely on it |
| 0, 3, 45, 46 | Strapping pins (boot mode) — avoid |
| 4, 5, 6 | Chosen default: plain GPIOs, safe on every S3 module |
