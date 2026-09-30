#!/usr/bin/env python3
"""
PigPulse thermal — Raspberry Pi 4B configuration
Port of firmware/esp32d0wd-pigpulse/config.h (thermal section only).

Provenance: values copied from ESP32 config.h / sensors.cpp (bench firmware).
Pi pin map is the only hardware remap (ESP GPIO21/22 → Pi header pins 3/5).
"""

import os as _os

# --- Device -----------------------------------------------------------
# Single source of truth for this node's identity.
# 2026-09-30: this was hardcoded as "PIGPULSE-RPI4B" while thermal_publish.py
# separately hardcoded "pi-thermal-01" and never imported config at all — the two
# layers disagreed and the config value was dead code. The value below is the one
# that was actually being published and stored, so switching to it changes no
# topic and no stored deviceId.
DEVICE_ID = _os.environ.get("DEVICE_ID", "pi-thermal-01")
FIRMWARE_VERSION = "0.1.0-pi"

# --- MLX90640 I2C (Raspberry Pi hardware bus) -------------------------
# Physical header: SDA = pin 3 (GPIO2), SCL = pin 5 (GPIO3) → /dev/i2c-1
I2C_BUS = "/dev/i2c-1"
MLX90640_ADDR = 0x33

# Melexis refresh codes → Hz for mlx9064x-driver frame_rate argument
# ESP config: MLX_REFRESH_RATE 0x03 = 4 Hz
REFRESH_HZ = 4.0

# ESP: MLX_EMISSIVITY 0.95f
EMISSIVITY = 0.95

# ESP: MLX_TA_SHIFT 8.0f (reflected temp guard) — applied to ambient if driver exposes Ta
TA_SHIFT = 8.0

# ESP: MLX_I2C_CLOCK_HZ 100000UL — kernel baud is set in /boot/firmware/config.txt
# dtparam=i2c_arm_baudrate=100000 (raise to 400000 only on short, stable wiring)
I2C_CLOCK_HZ = 100000

# --- Thermal thresholds (Celsius) — from config.h ---------------------
PIG_TEMP_NORMAL_MIN = 38.5
PIG_TEMP_NORMAL_MAX = 39.5
PIG_TEMP_FEVER = 40.0
PIG_TEMP_HYPERTHERMIA = 41.0

AMBIENT_COMP_ENABLE = True
AMBIENT_COMP_ALPHA = 0.3     # EMA factor
SOLAR_COMP_FACTOR = 0.1      # °C pull-down per °C ambient above 25°C
FRAME_AVERAGE_COUNT = 4

# --- Web --------------------------------------------------------------
WEB_HOST = "0.0.0.0"         # bind all interfaces (client OR AP mode)
WEB_PORT = 8080             # 80 needs root; change only if you have capabilities
STATIC_DIR = "static"

# --- Network mode -------------------------------------------------------
# Field deployment: the Pi is its OWN access point (no WAN, no router uplink).
# Clients join SSID "PigPulse" and reach the dashboard over https://192.168.69.1:8080
# The AP itself is configured OUTSIDE python — hostapd.conf + dnsmasq.conf +
# wlan0-static-ip.service (see backend/systemd/). These values exist only so
# /health can print the correct URL for the operator; they do not configure WiFi.
#   NETWORK_MODE=ap python3 web_server.py
# (`import os as _os` moved to the top of this file on 2026-09-30 so DEVICE_ID
#  could be read from the environment before it is used.)

NETWORK_MODE = _os.environ.get("NETWORK_MODE", "ap").strip().lower()  # ap | client

# Mirrors the live hostapd.conf / dnsmasq.conf / wlan0-static-ip.service values.
# Keep in sync if the AP is ever re-addressed.
AP_SSID = _os.environ.get("AP_SSID", "PigPulse")
AP_IP = _os.environ.get("AP_IP", "192.168.69.1")
WIFI_IFACE = _os.environ.get("WIFI_IFACE", "wlan0")

# --- HTTPS (self-signed; unlocks AudioWorklet on the AP origin) ---------
# Enabled via systemd drop-in (pigpulse-thermal.service.d/tls.conf).
# The phone must accept the cert once: Advanced -> Proceed (unsafe).
TLS_CERT = _os.environ.get("TLS_CERT", "")   # e.g. thermal-pi/tls.crt
TLS_KEY  = _os.environ.get("TLS_KEY", "")    # e.g. thermal-pi/tls.key
# Empty TLS_CERT => plain http on WEB_PORT.

# --- MQTT: publish the Pi as a pipeline node (see thermal_publish.py) ------
# The Pi used to be a private website: it read the sensor, drew a dashboard,
# and stopped. Every other node publishes to MQTT. This makes the Pi publish
# on the same wire contract, so its thermal data reaches PocketBase (via the
# existing local_bridge) and can then be shipped to the cloud.
MQTT_BROKER = _os.environ.get("MQTT_BROKER", "127.0.0.1")
MQTT_PORT = int(_os.environ.get("MQTT_PORT", "1883"))
THERMAL_PUBLISH_ENABLED = _os.environ.get("THERMAL_PUBLISH_ENABLED", "1") != "0"
PUBLISH_PIG_ID = _os.environ.get("PUBLISH_PIG_ID", "unassigned")

# --- Audio: ESP32-S3 barn mic (s3-mic-01) — the ONLY mic ----------------
# There is no Pi GPIO mic. The original ESP32-D0WD is decommissioned and the
# direct-wired INMP441 on the 40-pin header was removed 2026-09-29: it relied
# on dtoverlay=googlevoicehat-soundcard, which needs a physical codec chip
# that this board does not have, so every capture returned bit-exact zeros.
# The firmware pushes raw PCM over TCP :9090; esp_audio_ingest.py receives it.
# CONTRACT, re-verified 2026-09-28 10:30 against the source FLASHED to the board
#   firmware/esp32s3-mic-ambient/arduino/esp32s3_telemetry/esp32s3_telemetry.ino
#     #define SAMPLE_RATE 48000                       (line 46)
#     stereoBuf[i*2] = stereoBuf[i*2+1] = rawBuf[i]   (lines 239-240)  L/R dup
#     tcp_send(stereoBuf, samplesRead * 4)            (line 242)
# If the firmware moves, flip these two keys — ingest/status/UI all follow.
ESP_AUDIO_ENABLED = True
ESP_AUDIO_RATE = 48000             # firmware SAMPLE_RATE
ESP_AUDIO_FORMAT = "s16le"         # "s16le" (current) | "s32le" (raw I2S words)
