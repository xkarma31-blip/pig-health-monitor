# How PigPulse works

```text
ESP32-S3 mic ──TCP:9090──► thermal-pi audio ingest ──► app/WebAudio
             └─MQTT──────► Mosquitto ──► local_bridge ──► PocketBase ──► app
MLX90640 ──I2C────────────► thermal-pi :8080 ──portal /api/pi──► app
Tapo cam ──RTSP───────────► ffmpeg ──► :8091 MJPEG ──portal /api/pi──► app
Pi portal :80 ─────────────► setup page, local app, status, scan, QR target
Tailscale ─────────────────► same Pi from away; no cloud mirror
```

## Local first

The app chooses one source at a time: PigPulse hotspot → Pi on the same venue LAN → Tailscale tunnel to the same Pi → explicit offline recommendation. It never silently falls back to a different box or a cloud copy.

## Thermal honesty

The MLX90640 measures surface radiation, not core body temperature. The app labels results as surface estimates and screening signals. Fever claims require animal context and veterinary confirmation.

## Pig identity

Current capability is pen-level. Published high-accuracy individual tracking uses RGB/depth/ear tags; our scaffold cannot claim that yet.

## Data separation

Reads are open so a skipped user can inspect data. Writes require a signed-in user and an owner id enforced by PocketBase rules.

## Diagnostics

The Pi diagnostics page labels telemetry `LIVE`, `STALE`, `NO READING`, or `UNKNOWN AGE`. This prevents old MQTT rows from looking current.
