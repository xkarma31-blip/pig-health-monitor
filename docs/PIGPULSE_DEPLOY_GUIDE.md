# PigPulse — Deployment & Usage Guide

> **Verified 2026-11-21 13:00 PST** — every link below was HTTP-tested, every
> service read from the live Pi. This is the current V3 (MQTT + PocketBase)
> system, **not** the retired Firebase version. Keep this file with the rig.

---

## 1. What the system is

PigPulse is a barn monitor with four sensors feeding one Pi:

| Source | What it measures | Where it lands |
|---|---|---|
| **MLX90640** thermal (32×24) | pig surface / fever verdict, drift-corrected zones | PocketBase `telemetry` + live heatmap |
| **ESP32-S3 INMP441 mic** (48 kHz) | cough audio + barn air (SHT45: temp/RH/THI) | PocketBase `telemetry` + cough classifier |
| **Tapo CCTV** (800×450 + audio) | video frames + camera mic | Pi :8091 MJPEG, snapshots on alerts, 900 s MP4 segments |
| **Watchdog + classifier** | alert generation | PocketBase `alerts` + app |

---

## 2. LINKS (all verified 200)

| Purpose | URL |
|---|---|
| **Live dashboard (public/remote)** | https://pigpulse-pi.tail2a25b0.ts.net/live |
| Raw live data (JSON) | https://pigpulse-pi.tail2a25b0.ts.net/live/data |
| Ambient (SHT45) | https://pigpulse-pi.tail2a25b0.ts.net/live/ambient |
| Mic status | https://pigpulse-pi.tail2a25b0.ts.net/live/esp/status |
| Classifier status | https://pigpulse-pi.tail2a25b0.ts.net/live/cough/api/status |
| CCTV snapshot | https://pigpulse-pi.tail2a25b0.ts.net/live/cctv?snapshot=1 |
| **Public demo site** | https://pigpulse--pigpulse.expo.app/public-demo |
| Local portal (on barn Wi-Fi) | http://192.168.69.1/ |
| Local setup portal (QR target) | http://192.168.69.1/?setup=1 |
| Local PocketBase API | http://192.168.69.1:8090/api/health |

**QR code:** `docs/assets/setup-wifi-qr.png` (and
`backend/thermal-pi/static/wifi-qr.png`) — on the Wi-Fi it points at the local
setup portal `http://192.168.69.1/?setup=1`. Show it to a farmer to onboard a
phone to the PigPulse AP and open setup.

---

## 3. NETWORK / HOW TO CONNECT

- **Barn AP (local):** SSID **PigPulse**, password **capstone**, gateway
  **192.168.69.1**. The ESP (`192.168.69.15`) and CCTV (`192.168.69.2`) live
  here. Phones/laptops on this Wi-Fi can open the local URLs above.
- **Remote:** the Pi publishes the dashboard via Tailscale Funnel. Open the
  `/live` link from anywhere with internet — no VPN needed.
- **Pi internet:** via the ethernet tether to the laptop (`10.42.0.1`) — if the
  laptop sleeps, remote access pauses until it wakes. The USB WAN dongle is
  faulty (documented RF-dead) and not in use.

---

## 4. HOW TO USE (farmer, 1 minute)

1. **See the barn live:** open the `/live` link. You'll see the thermal
   heatmap, ambient temperature/humidity/THI, mic status, cough classifier,
   and the CCTV panel.
2. **Join locally:** scan the QR / select the `PigPulse` Wi-Fi (password
   `capstone`), then open `http://192.168.69.1/?setup=1` to register the farm.
3. **Alerts:** open the app → **Alerts** tab. Each alert shows its cause,
   device, time, and (when available) a CCTV snapshot frame.
   - `MIC_DISCONNECTED` / `MIC_RECOVERED` come from the watchdog measuring MQTT
     silence (they track ESP power dropouts — frequent until the 5 V supply is
     fixed).
   - `COUGH` comes from the audio classifier (2 s windows, threshold 0.2061;
     WAV clips saved under `cough/clips/`).
   - Fever/hyperthermia rows are computed but **suppressed at ingest** by
     design — the live verdict is on the dashboard, not an alert row.
4. **Listen:** in the app's Live panel, tap **Barn mic** to hear the ESP mic,
   or **Camera sound** for the Tapo camera's own audio. Both need a live stream.
5. **Install the app:** Android APK `com.solrahk.pighealthmonitor`; builds via
   GitHub Actions (`build-apk.yml`). EAS free Android quota is exhausted until
   2026-12-01 — use the Actions artifact.

---

## 5. DATA THAT IS LOGGED (continuous)

- PocketBase `telemetry`: thermal + mic rows (~945 k rows).
- `cough/windows.jsonl`: scored 2 s windows; `cough/clips/*.wav`: cough audio.
- `cctv/recs/seg_*.mp4`: 900 s CCTV segments (video + camera audio).
- `alerts`: rows with an optional CCTV JPEG frame.

**Alert capture today:** one CCTV JPEG per alert. NOT attached to alerts:
ESP mic WAV, CCTV audio WAV, thermal frame. (All capture endpoints work —
`/esp/record?seconds=5`, `/camera-audio?seconds=5`, `/data` — a 5 s
multi-modal alert bundle is a future enhancement, not deployed.)

---

## 6. KNOWN ISSUES / DEPLOY CAVEATS

1. **ESP power supply** — ~15 reboots today (`boots` 98→113, reset reason
   POWERON = supply dropout, not brownout). RSSI -42 dBm (Wi-Fi is fine).
   Fix physically: **5 V ≥2 A supply, 18 AWG cable, 1000 µF bulk cap** at the
   ESP. This causes most `MIC_DISCONNECTED` alerts and audio stream gaps.
2. **USB WAN dongle dead** — `wlan1` DOWN; no independent Pi internet. Remote
   depends on the laptop tether.
3. **brcmfmac firmware can wedge** (happened 2026-11-21): if the AP vanishes
   from client scans while hostapd says `AP-ENABLED`, reload the firmware
   (`modprobe -r brcmfmac_cyw; modprobe -r brcmfmac; modprobe brcmfmac`) and
   **then re-run `pigpulse-ap-static-ip`** (the reload wipes the
   `192.168.69.1` Barn gateway). See CANON §0.2.
4. **Thermal super-resolution:** not implemented. The MLX90640 is 32×24
   (768 px); archived docs mention AMG8833 8×8→32×32 bicubic but that sensor
   is not deployed. Upscaling would only smooth pixels, not add real detail.
5. **Funnel `/` returns 404** — expected (no landing page at tunnel root);
   use `/live`.

---

## 7. QUICK HEALTH CHECK (on the Pi)

```bash
for s in hostapd dnsmasq pigpulse-pocketbase pigpulse-bridge pigpulse-thermal \
         pigpulse-cctv pigpulse-portal pigpulse-cough mosquitto tailscaled; do
  printf '%-24s %s\n' "$s" "$(systemctl is-active $s)"
done
curl -sk https://127.0.0.1:8080/data | head -c 200
curl -sk https://127.0.0.1:8080/cough/api/status | head -c 200
curl -sk https://127.0.0.1:8080/esp/status | head -c 200
```

All should say `active` and the endpoints should return JSON with
`ok:true` / `state:live` / `connected:true`.

> Full architecture, rules, and the 2026-11-21 post-mortem: `CANON.md` §0.1–0.2.
