# Verbatim code / config excerpts — Chapter 3 data form (2026-11-14)

Extracted with sed from the live repo (branch `feat/v3-mqtt-pocketbase`) the same day.
Line numbers refer to the source files at this commit.

## B11 — threshold + verdict bands  [backend/cough/cough_classifier.py]
```python
COEF = np.asarray(HEAD["coef"], dtype=np.float64)
INTERCEPT = float(HEAD["intercept"])
THRESH = float(HEAD["threshold"])
META = HEAD["meta"]

```
```python

# ------------------------------------------------------------- aggregation
VERDICT_BANDS = (
    (0.00, "QUIET",    "no window in the last 60 s crossed the threshold"),
    (0.05, "LOW",      "under 5 % of windows crossed the threshold"),
    (0.20, "ELEVATED", "5-20 % of windows crossed the threshold"),
    (1.01, "HIGH",     "over 20 % of windows crossed the threshold"),
)

```

## B12 — window/aggregation constants + gap discard  [backend/cough/cough_classifier.py]
```python
SR = 16000
WINDOW_S = 5.0
WINDOW_N = int(SR * WINDOW_S)          # 80 000 samples
AGG_WINDOW_S = 60.0
UPSTREAM_HOST = "127.0.0.1"
UPSTREAM_PORT = 8080
# Pull native 48 kHz when we can downmix locally, so web_server stays cheap.
# 20261111: &raw=1 asks the Pi for the UNBOOSTED stream.
#
# The classifier is calibrated on the raw barn mic (threshold 0.2061, F1-optimal
# on the aSwine holdout) and its score is NOT level-invariant. With the +32 dB
# level stage it went from a LOW verdict (mean_p 0.005) to HIGH (25% of windows
# over threshold) - false positives from a louder signal, not louder coughs.
UPSTREAM_PATH = ("/esp/stream?rate=native&raw=1" if pcm_downmix is not None
                 else "/esp/stream?rate=16000&raw=1")
LISTEN_HOST = "127.0.0.1"
LISTEN_PORT = 8096
ORT_THREADS = 2                        # the 4 Hz thermal loop keeps the other cores
# The ESP is a real-time 48 kHz source, so 80 000 samples must arrive in ~5 s
# of wall time. When the mic collapses it sends FEWER samples, not silence,
# so a slow-filling window is a window full of gaps and must be thrown away.
GAP_TOLERANCE = 1.25

```
```python
                    ST.buffered = acc.size / SR
                    enabled = ST.enabled
                while acc.size >= WINDOW_N:
                    span = time.time() - acc_t0
                    w = acc[:WINDOW_N].copy()
                    acc = acc[WINDOW_N:]
                    acc_t0 = time.time()
                    if span > WINDOW_S * GAP_TOLERANCE:
                        # 5 s of audio that took far longer than 5 s to arrive:
                        # the source dropped samples, so this window has holes.
                        with ST.lock:
```
```python
            "iso": time.strftime("%H:%M:%S", time.localtime(ts)),
            "p": round(p, 6),
            "above": bool(p >= THRESH),
            "dbfs": round(db(rms), 2),
            "peak_dbfs": round(db(float(np.max(np.abs(w)))), 2),
            "infer_ms": round(ms, 1),
```

## B13 / D2 — bridge T2 suppression + timestamp rule  [backend/bridge/local_bridge.py]
```python

        payload.setdefault("deviceId", device_id)
        # A device stamp (or the Pi wall clock) is an opinion, not a fact:
        # the Pi has no RTC and its clock has stepped by days. The anchor's
        # monotonic-carried timeline is the only stamp we trust, so it
        # overwrites any arriving stamp unconditionally (T2 decision).
        payload["timestamp"] = int(ANCHOR.now_ms())
        # Per-device ledger: make barn outages visible in the journal.
        seen = ANCHOR.observe(device_id)
        if seen["is_gap"]:
            log.warning("device %s resumed after %.0f s of silence",
                        device_id, seen["gap_s"])

        if channel == "telemetry":
            # Strip the pig-temperature claim, keep the raw instrument
            # values (T2 decision 2026-11-02).
            payload, dropped = apply_telemetry_guard(payload)
            if dropped:
                log.info("telemetry/%s: dropped semantic fields: %s",
                         device_id, ", ".join(sorted(dropped)))
            _submit("insert", "telemetry", payload)
        elif channel == "alerts":
            # Thermal alert rows are scene-camera claims with impossible
            # values (measured up to 476.89 "degC"). Suppress at ingest;
            # cloud_sync drains the historical backlog the same way.
            if is_thermal_alert(payload):
                log.info("alerts/%s: suppressed thermal claim row", device_id)
                return
            _submit("insert", "alerts", payload)
        elif channel == "audio":
            _submit("insert", "audio_events", payload)
        elif channel == "status":
            _submit("status", device_id, payload)

    except json.JSONDecodeError as e:
        # Keep the first 200 bytes: without them a truncated/esc-less payload
        # is undiagnosable from the error alone (see firmware jsonEscape()).
        log.error(f"Invalid JSON on {msg.topic}: {e} | payload={msg.payload[:200]!r}")
    except Exception as e:
        log.error(f"Error handling message on {msg.topic}: {e}")

```

## C1–C5 — emissivity, criteria, classification  [backend/thermal-pi/radiometry.py]
```python
W, H, N = 32, 24, 768

# --- Constants --------------------------------------------------------------
T_ZERO_K = 273.15

# Soerensen et al. 2014: pig ear base emissivity. Only used by the *forward*
# model and by the diagnostics; the live correction is owned by the driver.
EPS_EAR_BASE = 0.978
# Reflected-temperature offset. Mirrors config.TA_SHIFT (ESP: MLX_TA_SHIFT 8.0).
# The MLX90640's internal thermopile sees the scene at Ta - TA_SHIFT, which the
# driver turns into the taTr term.
```
```python
        pass
    return out


@dataclass
class PipelineConfig:
    # --- correction ownership ------------------------------------------------
    eps_driver: float = 0.95      # what mlx_reader.py hands the Melexis driver
    eps_here: float = 1.0         # MUST be 1.0; the driver already corrected
    ta_shift_c: float = DEFAULT_TA_SHIFT

    # --- zone detection ------------------------------------------------------
    delta_suspect_c: float = 1.0
    delta_fever_c: float = 1.5
    min_area_px: int = 6
    max_area_px: int = 600
    sustain_frames: int = 5
    absolute_fever_floor_c: float = 40.0   # independent of the baseline

    # --- cross-sectional (herd) reference ------------------------------------
    # Pixels this far above the frame median are taken to be animal tissue. The
    # median of those pixels is the herd reference: what "normal" looks like in
    # THIS frame, THIS ambient, THIS distance. Needs 2+ animals to be meaningful.
    animal_offset_c: float = 3.0
    herd_min_animals: int = 3
    # Below this, no pixel can be a pig: barn floor, wall and air all read far
    # lower. Environment-relative tests (deviation from the pixel's own history)
    # are gated on it, because a fast ambient swing moves those surfaces by more
```
```python
        peak = zone["peakC"]
        delta = zone["deltaC"] if zone["deltaC"] is not None else 0.0
        d_herd = zone.get("deltaHerdC")
        sustained = zone["streakFrames"] >= self.cfg.sustain_frames

        if peak >= self.proj["hyperthermia"]:
            zone["reason"] = "absolute_hyperthermia"
            return "HYPERTHERMIA", 1.0
        if peak >= self.cfg.absolute_fever_floor_c:
            # Layer 1, absolute floor: catches a zone both other tests would
            # learn away or miss (a pig feverish since power-on; every pig
            # febrile at once). Works on frame one, needs no history.
            zone["reason"] = "absolute_floor"
            return "FEVER", 0.95
        # Cross-sectional test: hot relative to the pennates, same frame.
        # No lag, no reliance on a stable reference region, no warm-up needed.
        if d_herd is not None and d_herd >= self.cfg.delta_fever_c:
            excess = d_herd - self.cfg.delta_fever_c
            zone["reason"] = "herd_relative"
            return "FEVER", round(min(0.99, 0.55 + 0.1 * excess), 3)

        # Temporal test: hot relative to this pixel's own history. Catches the
        # whole herd rising together, which the cross-sectional test cannot see.
        if not baseline_ready:
            zone["reason"] = "warmup"
            return "WARMUP", 0.0
        if delta >= self.cfg.delta_fever_c and sustained:
            span = self.cfg.delta_fever_c - self.cfg.delta_suspect_c
            base = min(1.0, (delta - self.cfg.delta_suspect_c) / max(span, 1e-6))
            area_factor = min(1.0, zone["areaPx"] / 12.0)
            zone["reason"] = "temporal_baseline"
            return "FEVER", round(0.6 * base + 0.4 * area_factor, 3)
        if d_herd is not None and d_herd >= self.cfg.delta_suspect_c:
```
```python
    for part of the window does not drag the baseline up with it.
    """

    def __init__(self, window: int = 30, warmup: int = 10):
        self.window = int(window)
        self.warmup = int(warmup)
        self._buf: deque[np.ndarray] = deque(maxlen=self.window)
        self.frames_seen = 0

    def push(self, frame_c: np.ndarray) -> bool:
        self._buf.append(np.asarray(frame_c, dtype=np.float32).copy())
        self.frames_seen += 1
        return self.ready

    @property
    def ready(self) -> bool:
        return len(self._buf) >= self.warmup

    def baseline(self) -> Optional[np.ndarray]:
        if not self._buf:
            return None
        return np.median(np.stack(self._buf, axis=0), axis=0).astype(np.float64)

```

## C1–C5 — thermal config  [backend/thermal-pi/config.py — FULL FILE]
```python
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
```
