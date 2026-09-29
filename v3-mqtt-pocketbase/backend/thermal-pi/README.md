# PigPulse thermal-pi — MLX90640 on Raspberry Pi 4B (4GB)

Port of the bench-proven ESP32 firmware (`firmware/esp32d0wd-pigpulse/sensors.cpp`)
to Python for Raspberry Pi 4B. Thermal + **mic** (INMP441 wired straight to
the Pi's I2S pins — temporary direct-to-Pi path since the ESP32-D0WD, the
original mic host, was lost).

| | ESP32 | Pi 4B |
|--|-------|-------|
| I2C pins | SDA=21, SCL=22 | **SDA=pin 3 (GPIO2), SCL=pin 5 (GPIO3)** |
| Bus | `Wire` | `/dev/i2c-1` |
| Driver | Melexis C zip (Arduino) | **`mlx9064x-driver`** (Melexis FIR, `I2C-1`) |
| Web | `WebServer` + PROGMEM | `http.server` + `static/index.html` |
| Timing | `millis()` | `time.monotonic()` |
| WiFi role | SoftAP only (usually) | **client OR AP** — modular, same Python |

**Preserved from firmware:** 4 Hz, emissivity 0.95, hotspot-3×3 vs center-4,
ambient EMA solar comp, 4-frame average, thresholds 38.5 / 39.5 / 40.0 / 41.0,
fail-safe errors, I²C scan verdict for 0x33.

---

## Network modes (portable across sites)

The **web stack does not care** which WiFi role the Pi has — it binds `0.0.0.0`.
Only `scripts/network_setup.sh` changes how phones reach it.

| Mode | ESP equivalent | Who broadcasts | Phone joins | Dashboard URL |
|------|----------------|----------------|-------------|---------------|
| **client** (default) | `WiFi.begin()` | Your field/home router | That router | `http://<pi-ip>:8080/` |
| **ap** | `WiFi.softAP()` | **The Pi** | `PigPulse-Pi` (or your SSID) | `http://192.168.4.1:8080/` |

### Switch mode on the Pi

```bash
cd ~/thermal-pi   # or wherever you copied the folder

# A) Join an existing network (portable: new site → new SSID/pass only)
sudo scripts/network_setup.sh client "FarmWiFi" "secret-pass"

# B) Host own network like the ESP32 (no upstream router needed)
sudo scripts/network_setup.sh ap "PigPulse-Pi" "yourpass8+"

# C) Inspect
scripts/network_setup.sh status
```

**Porting to a new location:** re-run `client` with that site’s SSID — **no Python edits**.
Or stay in `ap` mode forever (field unit with no infrastructure).

**Bookworm note:** AP uses NetworkManager (`nmcli`) + `dnsmasq-base` (auto-installed by the script). You do **not** configure hostapd by hand on current Pi OS.

Environment overrides (no code edit):

```bash
NETWORK_MODE=ap AP_SSID=Pen3 AP_PASSWORD=strongpass1 python3 web_server.py
# /health will report mode + suggested URL
```

---

## Wiring (Pi 4B 40-pin)

```
MLX90640 VIN → pin 1  (3V3)
MLX90640 GND → pin 6  (GND)
MLX90640 SDA → pin 3  (GPIO2)
MLX90640 SCL → pin 5  (GPIO3)
Optional: 4.7kΩ SDA→3V3, SCL→3V3 on long jumpers
```

**3.3 V only — never 5 V.**

## INMP441 mic wiring (I2S → Pi 4B 40-pin)

```
INMP441 VDD  → pin 1  (3V3)     ← 3.3 V only, never 5 V
INMP441 GND  → pin 6  (GND)
INMP441 SCK  → GPIO18 (pin 12)  BCLK
INMP441 WS   → GPIO19 (pin 35)  LRCLK
INMP441 SD   → GPIO20 (pin 38)  DOUT  (mic → Pi)
INMP441 L/R  → pin 6  (GND)     ← must NOT float (channel pick; batch-dependent)
```

Overlay (already staged in `config.txt` on the SD card — takes effect at boot):

```text
dtparam=i2s=on
dtoverlay=googlevoicehat-soundcard
```

Native DAI of that overlay is **48 kHz / S32_LE / 2ch** (kernel source);
`arecord`'s `plughw` converts to S16_LE on the fly. Card appears as
`Google voiceHAT SoundCard` — selected by **name** (`plughw:CARD=…`), never
by index, because `dtparam=audio=on` also creates a `Headphones` card.

## One-time setup

```bash
# 1. Enable I2C
sudo raspi-config   # Interface Options → I2C → Enable
#    or ensure in /boot/firmware/config.txt:
#    dtparam=i2c_arm=on
#    dtparam=i2c_arm_baudrate=100000   # safe default; 400000 if wiring short

# 2. Permissions (non-root)
sudo usermod -aG i2c "$USER"
# re-login

# 3. Python deps
cd ~/pig-health-monitor/v3-mqtt-pocketbase/backend/thermal-pi
python3 -m pip install -r requirements.txt
```

## Verify hardware

```bash
python3 i2c_scanDiag.py
# expect: MLX90640 PRESENT at 0x33

python3 web_server.py --once
# expect: JSON with center/max/avg/ambient (ambient ~ room temp)
```

> Hardware is **verified** only when these commands run **on the Pi** and print ACK / plausible temperatures. On a laptop or without the sensor, results are **unverified — not measured from the board**.

## Run dashboard

```bash
python3 web_server.py --port 8080
# open http://<pi-ip>:8080/
```

| Route | Purpose |
|-------|---------|
| `/` | Live heatmap (palettes, markers, CSV button) + **mic panel** (status, L/R meters, listen, record 10 s) |
| `/data` | JSON: `ok, frame, min, max, avg, center, ambient, fps, readMs, minX/Y, maxX/Y, pixels[768]` |
| `/csv` | 24×32 CSV download |
| `/health` | Plain-text readiness + I²C addrs + **network mode / local IP / URL hint** + audio state |
| `/audio` | Mic page: live listen, level meters, WAV record, recordings list |
| `/audio/status` | JSON: `ok, running, device, label, rate, channels, frames, levels[L,R], subscribers, recording, error, mock` |
| `/audio/stream` | Raw PCM **S16LE stereo 48 kHz**, read-until-close (Web Audio worklet consumes it) |
| `/audio/record?seconds=N` | Block-record N s (≤60) → WAV download (`attachment`) |
| `/audio/recordings` | JSON list of `recordings/mic_*.wav` |
| `/audio/file?name=mic_…` | Serve one recording (name regex-whitelisted, no traversal) |

### Mic test without hardware (laptop / pre-boot)

```bash
PIGPULSE_AUDIO_MOCK=1 python3 web_server.py --port 8099
# /audio → L=440 Hz, R=220 Hz sine — proves stream, meters, record paths
curl -s -o /tmp/s.pcm localhost:8099/audio/stream & sleep 2; kill %1
wc -c /tmp/s.pcm          # ≈ 48000*2*2*2 bytes/s
curl -s -o /tmp/r.wav 'localhost:8099/audio/record?seconds=2'
file /tmp/r.wav           # RIFF WAVE, 2 ch, 48000 Hz
```

> Hardware is **verified** only when `arecord -l` on the **Pi** lists the
> voiceHAT card and `/audio/status` reports real (non-mock) levels. Laptop
> mock results prove the **software path only** — unverified for the board.

### HTTPS / AudioWorklet (grounded 2026-09-26)

**Does live listen need SSL/HTTPS?** The AudioWorklet path does — but the app
does **not** require HTTPS: plain `http://<pi-ip>:8080` works everywhere via an
automatic fallback. No certificate setup needed.

Research basis:

- **MDN (AudioWorklet / AudioWorkletNode):** "Secure context: This feature is
  available only in secure contexts (HTTPS), in some or all supporting
  browsers." The `BaseAudioContext.audioWorklet` property carries
  `[SecureContext]` (W3C `WebAudio/web-audio-api` issue #1436).
- **Chrome official blog (audio-worklet):** "Worklet APIs including Audio
  Worklet are only available in a secure context, thus a page using them must
  be served over HTTPS, although `http://localhost` is considered a secure
  context for local testing."
- **Secure Contexts spec / MDN:** potentially trustworthy origins are
  `https`/`wss`/`file`, `127.0.0.0/8`, `::1`, `localhost`. A LAN origin like
  `http://raspberrypi.local:8080` or `http://192.168.x.x:8080` is **not**.
- **Not secure-gated:** `AudioContext`, `fetch()`, and `ScriptProcessorNode`
  (deprecated, but still implemented everywhere we care about).

Empirical confirmation — Firefox 155.0.1 headless, laptop, 2026-09-26:

| Origin | `isSecureContext` | `ctx.audioWorklet` | `addModule()` | `AudioWorkletNode` | `createScriptProcessor` |
|--------|-------------------|--------------------|---------------|--------------------|-------------------------|
| `http://127.0.0.1` (loopback) | `true` | present | ok | ok | ok |
| `http://192.168.254.121` (LAN) | `false` | **undefined** | **blocked** | **`typeof` = undefined** | ok |

`static/mic.js` (shared by `/` and `/audio`) exploits exactly this split:

- secure context → **AudioWorklet** (`pcm-worklet.js`, off main thread),
- plain HTTP LAN → **ScriptProcessorNode** fallback (main thread; same FIFO,
  preroll, resample, underrun-resync logic mirrored from the worklet),
- the UI reports which path is active ("Playback" row on `/audio`, mode line
  in the dashboard mic card).

Optional (not implemented): serve real HTTPS with a self-signed cert if you
ever specifically want the worklet over LAN — phones require installing the
cert first, which is why the fallback is the primary answer instead.

Port 8080 avoids needing root. To bind :80: `sudo python3 web_server.py --port 80` or systemd `AmbientCapabilities=CAP_NET_BIND_SERVICE`.

## Files

```
config.py                 # ← config.h thermal tunables + Pi bus + network mode + AUDIO knobs
mlx_reader.py             # Melexis driver wrapper (init + read_frame)
pigpulse_stats.py         # hotspot cluster, ambient EMA, frame avg, thresholds
i2c_scanDiag.py           # bus scan + 0x33 verdict (stdlib only)
audio_capture.py          # INMP441: arecord → stream fan-out + WAV recorder (stdlib)
web_server.py             # / /data /csv /health + /audio* + background sampler
static/index.html         # dashboard UI (from reference webpage.h) + mic panel
static/audio.html         # mic page: live listen, meters, record buttons
static/mic.js             # shared client: AudioWorklet + ScriptProcessor fallback
static/pcm-worklet.js     # browser-side PCM → Web Audio (prebuffer + resample)
scripts/network_setup.sh  # client | ap | status  (modular WiFi role)
requirements.txt          # unchanged — mic code is stdlib-only
```

## systemd (optional)

```ini
# /etc/systemd/system/pigpulse-thermal.service
[Unit]
Description=PigPulse MLX90640 web (Pi 4B)
After=network.target

[Service]
User=pigpulse
WorkingDirectory=/home/pigpulse/thermal-pi/v3-mqtt-pocketbase/backend/thermal-pi
ExecStart=/home/pigpulse/thermal-pi/.venv/bin/python /home/pigpulse/thermal-pi/web_server.py --port 8080
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now pigpulse-thermal
```

## MQTT (future phase)

Not wired yet. When enabled, publish to `pig/telemetry/thermal`
(see `config.h` `MQTT_TOPIC_THERMAL`) via existing `backend/bridge/`.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `/dev/i2c-1` missing | Enable I2C, reboot |
| Permission denied | `usermod -aG i2c`, re-login |
| Scan empty | Wiring: swap SDA/SCL check, 3V3, GND, pull-ups |
| `mlx9064x-driver not available` | `pip install mlx9064x-driver` |
| Init fail on laptop | Expected — run on Pi with sensor attached |
| `/audio/status` → "no I2S capture card" | `config.txt`: `dtparam=i2s=on` + `dtoverlay=googlevoicehat-soundcard`, reboot; then `arecord -l` must show voiceHAT |
| Mic silent (0%) both channels | Check WS/SD not swapped; L/R not floating; mic actually 3V3 |
| `arecord: device or resource busy` | Only one capture owner — the app owns it; don't run manual `arecord` while the service runs |
| Stream stalls / gappy | WiFi too weak for 192 kB/s — test wired or closer to AP; 200 ms ALSA buffer is the floor |
| Record button → 503 "capture not running" | Read `/audio/status.error` — almost always the overlay line missing |
| Live listen button errors about secure context | Should not happen — `mic.js` auto-falls back to ScriptProcessorNode on plain HTTP; only if both AudioWorklet (gated) and ScriptProcessor are unavailable, open the page via `http://localhost:8080` on the Pi or add HTTPS |

Skill reference: `~/.agents/skills/raspberry-pi-4b/`
