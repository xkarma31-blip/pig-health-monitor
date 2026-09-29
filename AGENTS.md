# PigPulse — Agent Context

> **Supersedes the v2-firebase guidance that used to live here.**
> That version pointed at `/home/solrahk/PigHealthMonitor/v2-firebase`
> (a path that no longer exists) and mandated Firebase as the backend.
>
> **`CANON.md` is authoritative.** Read it first for topology, canonical paths,
> deployment, and hard rules. This file is only the quick orientation.

Capstone: TinyML acoustic + thermal monitoring for swine respiratory distress.

## Workspace

- **Root**: `/home/solrahk/pig-health-monitor` (branch `feat/v3-mqtt-pocketbase`)
- **Canon**: [`CANON.md`](CANON.md) — read this before creating or moving anything
- **Soul**: `~/.hermes/SOUL.md`

## Layout — canonical paths only

| Component | Path |
|---|---|
| Mobile app (Expo) | `v3-mqtt-pocketbase/frontend/mobile_app/` |
| Landing page (Vercel prod) | `v3-mqtt-pocketbase/frontend/landing_page/` |
| **Pi edge backend** | `v3-mqtt-pocketbase/backend/` |
| Firmware (ESP32-S3 mic) | `v3-mqtt-pocketbase/firmware/esp32s3-mic-ambient/` |
| PB migrations | `v3-mqtt-pocketbase/deploy/pocketbase/bin/pb_migrations/` |
| Gateway (nginx) | `v3-mqtt-pocketbase/deploy/openresty/` |

Root `firmware/`, `landing_page/`, and `docs/` are **frozen** — see CANON §3.1.
Root `mobile_app/`, `firebase.json`, `.firebaserc`, `firebase_config/` were
**deleted** 2026-09-29. A CI job fails if they reappear.

## Backend: MQTT + PocketBase, **not** Firebase

```
ESP32-S3 ──MQTT──► mosquitto :1883 ──► local_bridge ──► PocketBase :8090
       ──TCP:9090─► thermal-pi (live PCM → phone browser)
MLX90640 ──I2C────► thermal-pi :8080 (HTTPS dashboard)
Tapo cam ──RTSP───► ffmpeg ──► :8091 (MJPEG, proxied through /cctv)
```

- Topics: `pig/{deviceId}/{telemetry,alerts,status,commands,response}`
- Collections: `telemetry`, `alerts`, `devices`, `pigs`, `audio_events`
- **The Pi and the laptop have no replication path** — the `synced` flag is
  write-only. See CANON §2.1. Do not assume the phone sees Pi data.
- **PocketBase silently drops unknown fields.** Schema changes need a migration.

## Commands

```bash
npm run lint            # eslint, v3 app
npm run test            # jest, v3 app
npm run ci:backend      # byte-compile + bash -n every backend file
npm run health:local    # laptop rig health (rig-aware)
npm run diag:pi         # 11-section diagnostic on the Pi
npm run deploy:landing  # Vercel landing page
```

## Constraints

- **Never commit a secret.** Pre-commit scanner + trufflehog enforce it.
- PocketBase admin creds come from `/etc/pigpulse/bridge.env`, never a default.
- **No `sudo`** except `/etc/systemd/`, `sysctl`, `apt`. It has created
  root-owned directories that later agents could not edit.
- **No new top-level directories** in this repo.
- Prefer minimal diffs; no dependency churn without a reason.
- Master has low vision — high-contrast UI, clear copy.

## Deploying

| What | How |
|---|---|
| Landing page | `~/bin/pigpulse-autodeploy.sh` (auto) or `scripts/deploy-landing.sh` |
| Expo app | `cd v3-mqtt-pocketbase/frontend/mobile_app && npx vercel --prod` |

`scripts/deploy.sh` is **DISABLED** — it deployed the stale app over the live
landing page. Do not re-enable it.

## Grounding rules

Never claim hardware is "confirmed" without a device readout (`cat /proc/*`,
`free -h`, `i2cdetect`, `arecord -l`, `ss -lntp`, …). Spec sheets and web
sources are not hardware grounding. Zeros on a capture line mean nothing is
driving it — not that the room is quiet.
