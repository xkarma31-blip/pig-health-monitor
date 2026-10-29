# PigPulse External AI Context

> **⚠️ THIS FILE SUPERSEDES ALL PREVIOUS PIGPULSE CONTEXT IN THIS PROJECT.**
> If you have older PigPulse context documents, briefings, orientation files,
> `.planning/PROJECT.md` content, or any prior handoff — **ignore them where
> they conflict with this file.** This is canon revision **2026-10-29**.
>
> Portable handoff for online AIs and collaborators without access to the local repository.
> Sanitized: no credentials, tokens, private IP addresses, local usernames, or private filesystem paths.
> **If this file conflicts with `CANON.md` in the repo, `CANON.md` wins.**

## What changed since older context files you may have

**If any older context says any of the following, it is WRONG:**

| ❌ Old claim | ✅ Current truth (2026-10-29) |
|---|---|
| Firebase is the backend | **Firebase is RETIRED.** CI fails the build if it reappears. Backend is MQTT + PocketBase. |
| ESP32-D0WD is the main MCU | **ESP32-D0WD is DECOMMISSIONED.** The ESP32-S3 is the only edge MCU. |
| Dual INMP441 microphones | **One INMP441 on the ESP32-S3.** The Pi GPIO mic is removed (returned bit-exact zeros). |
| ESP32-S3 USB is wedged / audio not deployable | **USB is accessible.** Firmware `pigpulse-mic-pcm16-20261013` deployed and verified. |
| MLX90640 is dead / not answering on I²C | **Intermittent but working** as of 2026-10-29. Has died and recovered before. |
| Port 8091 is a real endpoint | **There is no port 8091.** The MJPEG server is loopback-only, proxied by thermal-pi. |
| MLX90640 accuracy is ±0.5°C | **±1.5°C typical** per datasheet. |
| Pi ↔ cloud sync is working | **Built, NEVER tested end-to-end.** `sync.env` does not exist. |
| Thermal super-resolution improves measurement | **Cosmetic only** at 32×24. RGB-guided SR causes texture leakage — actively harmful. |
| One mic can localize which pig coughed | **Physics: 1 mic = zero spatial information.** Audio-visual fusion (mic + camera) can attribute coughs — see Sensor Fusion section. |
| The project directory is `PigHealthMonitor` or `pig_health_monitor` | **The ONLY directory is `pig-health-monitor`** (lowercase, hyphenated). |

## Mission

PigPulse, also called Pig Health Monitor, is a multimodal edge-health monitoring system for open-air swine farming. It combines thermal sensing, acoustic sensing, environmental sensing, ESP32 edge processing, MQTT transport, PocketBase persistence, and an Expo mobile/web dashboard.

The product goal is early detection and understandable visualization of swine respiratory distress using thermal and acoustic signals in noisy farm environments.

## Canonical Web Experience

There is one canonical public domain and one intended user flow:

```text
https://pig-health-monitor.vercel.app/
        landing / research / product page
                    |
                    | dashboard buttons
                    v
https://pig-health-monitor.vercel.app/app/tabs
        Expo PigPulse dashboard
```

Public routes:

- `/` is the landing page and must be the first page visitors see.
- `/app/` is the Expo web app shell.
- `/app/tabs` is the main dashboard route.
- `/api/telemetry?collection=telemetry|alerts|pigs|devices` = read-only JSON.
- `https://pig-health-research-portfolio.vercel.app/` is a secondary portfolio alias, not the canonical app entry point.

Deployment rules:

- The landing page owns the domain root `/`.
- The current Expo web export is mounted below `/app`.
- Do not deploy the Expo app over `/`.
- Do not create a separate public dashboard hostname when the same-domain `/app` route is sufficient.
- `scripts/deploy.sh` is **DISABLED** — it deployed the stale app over the landing page.

## Architecture

```text
┌── PI EDGE (standalone AP "PigPulse", NO WAN) ──────────────────────┐
│                                                                     │
│  MLX90640 thermal ──I2C──► thermal-pi :8080 (HTTPS) ──► phone      │
│  ESP32-S3 "s3-mic-01" ──TCP:9090──► esp_audio_ingest               │
│                        └──MQTT──► mosquitto :1883 ──► bridge ──► PB │
│  Tapo C200C ──RTSP──► ffmpeg ──► tapo_mjpeg :8091                  │
│  GY-SHT45 (planned) ──I2C──► ESP32-S3 (unconnected)               │
│  hostapd + dnsmasq (AP)                                             │
│  Router mode: armed, inert (activates with any upstream)            │
└─────────────────────────────┬───────────────────────────────────────┘
                              ╳   NO REPLICATION PATH TESTED
┌─────────────────────────────┴───────────────────────────────────────┐
│  LAPTOP / CLOUD RIG                                                 │
│  PocketBase :8090 · Mosquitto (docker) · OpenResty :80 (gateway)    │
│  readonly_pb_proxy :8099 → Tailscale Funnel → Vercel function       │
└─────────────────────────────┬───────────────────────────────────────┘
                              ▲
                 Expo app ──HTTP/SSE──┘
```

| Layer | Technology | Responsibility |
|---|---|---|
| Firmware | ESP32-S3 + C++/PlatformIO | Sensor acquisition, MQTT publishing, TCP audio stream |
| Thermal | MLX90640 (32×24, I²C) | Infrared thermal frames, pen-level surface temperature |
| Acoustic | INMP441 MEMS mic on ESP32-S3 | Farm sound and respiratory signal capture (mono, 48 kHz) |
| Environmental | GY-SHT45 (planned, unconnected) | Pen-air temperature/humidity context |
| Broker | Mosquitto | MQTT topic routing |
| Bridge | Python | MQTT message handling and PocketBase writes |
| Database | PocketBase 0.22.20 / SQLite | REST records, auth, and realtime SSE |
| Gateway | OpenResty + Lua | HTTP proxying, rate limiting, SSE/websocket routing |
| CCTV | Tapo C200C (RTSP) | Live video, MJPEG proxy on Pi |
| Client | Expo Router + React Native Web | Mobile app and browser dashboard |

## Hardware Status (2026-10-29)

| Device | Role | Status |
|---|---|---|
| Pi 4B Rev 1.2 | edge: thermal + ingest + AP + PB | ✅ online |
| MLX90640 | thermal camera | ⚠️ intermittent — working as of 2026-10-29 |
| ESP32-S3 (s3-mic-01) | mono mic, MQTT, TCP audio | ✅ USB accessible, firmware deployed |
| GY-SHT45 | environmental sensor | 🔲 owned, unconnected |
| Tapo C200C | CCTV | ⚠️ video accessible on Pi AP only; management API blocked |
| ~~ESP32-D0WD~~ | original node | ☠️ decommissioned |

## Repository Map

Branch: **`feat/v3-mqtt-pocketbase`** (canonical). Remotes: Codeberg (origin) + GitHub.

```text
v3-mqtt-pocketbase/
├── backend/
│   ├── bridge/              MQTT-to-PocketBase bridge
│   ├── thermal-pi/          Pi thermal + dashboard + audio ingest
│   ├── cctv/                Tapo MJPEG server + record/backup tools
│   ├── workers/             cloud_sync.py, readonly_pb_proxy.py
│   ├── scripts/             Ops scripts (health check, diag, thermal fields)
│   └── systemd/             Pi systemd units
├── deploy/
│   ├── docker/              Mosquitto, ValKey, thermal websocket
│   ├── openresty/           Gateway configuration
│   └── pocketbase/          PB binary, migrations, data
├── firmware/
│   └── esp32s3-mic-ambient/ ESP32-S3 firmware + KNOWN_GOOD.md
├── frontend/
│   ├── landing_page/        Static landing page; deployed at `/`
│   └── mobile_app/          Expo source; exported and mounted at `/app`
├── tools/
│   └── simulator-web/       Research simulator
└── docs/
legacy/                      Frozen Firebase-era trees (read-only, NON-CANONICAL markers)
```

## MQTT Convention

```text
pig/{deviceId}/telemetry   → telemetry collection
pig/{deviceId}/alerts      → alerts collection
pig/{deviceId}/status      → devices collection (upsert)
pig/{deviceId}/commands    → (nothing publishes it)
pig/{deviceId}/response    → (log only)
```

The topic shape **must** be `pig/{deviceId}/{channel}`. The legacy `pig/telemetry/{x}` form is incompatible.

## PocketBase Collections

`telemetry`, `alerts`, `devices`, `pigs`, `audio_events`, plus auth `users`.

**PocketBase is version 0.22.20** — it cannot run `.js` migrations. Schema changes use `backend/scripts/add_thermal_fields.py` (writes both SQLite columns and `_collections.schema` JSON). PocketBase **silently discards unknown fields** — a schema drift loses data with no error.

## Key Open Items (2026-10-29)

| Item | Status |
|---|---|
| Pi ↔ cloud sync (`cloud_sync.py`) | ⚠️ Built, never tested end-to-end |
| PB admin password | 🔴 Unknown, blocks the bridge |
| Pi WAN uplink | 🔴 None — router mode armed but no upstream |
| Two SD cards unlabeled | 🔴 Always confirm which card is booted |
| Camera management API | 🔴 Needs cloud-owner password |
| Camera RTSP creds hard-coded | ⚠️ Not moved to env |
| LWT/status topic missing from ESP32-S3 | ⚠️ devices rows go stale |
| Laptop dashboard data | ⚠️ Seeded demo data, not live sensors |

## Sensor Fusion — what is grounded vs. aspirational

| Capability | Evidence | Status |
|---|---|---|
| Pen-level thermal monitoring (32×24) | MLX90640 at pen distance, bicubic interpolation for display | ✅ Demonstrated |
| Cough event detection (mono mic) | 94–99% accuracy, heavily published | ✅ Strong evidence |
| Audio-visual cough attribution (mic + camera) | Chae et al. 2024, 95% accuracy, same hardware setup | ⚠️ Published but not implemented in PigPulse |
| Thermal super-resolution | ❌ Cosmetic only at 32×24. RGB-guided SR causes texture leakage | ❌ Not viable for temperature measurement |
| Individual pig ID without markers | Open research problem for same-breed pigs from 2D video | ❌ Unsolved |
| Audio source localization (1 mic) | Physics: 1 mic = zero spatial information | ❌ Impossible |

## Safe Operating Rules for External AIs

1. Preserve the one-domain topology: landing at `/`, Expo under `/app`.
2. Do not replace the landing page with the dashboard at the domain root.
3. Do not invent a second public dashboard hostname unless explicitly requested.
4. Treat route success and backend data connectivity as separate checks.
5. Do not expose, request, or reproduce secrets from environment files.
6. Do not present spec-sheet values as physical-hardware measurements.
7. Ask for current command output when a claim depends on live service state.
8. Prefer the smallest change that preserves existing routes and data contracts.
9. Check current source before trusting a dated document.
10. Before deployment, verify the staged tree contains the landing at `/` and Expo assets below `/app`.
11. **When something is confirmed working, archive its state immediately** (R8). Firmware: binary + sha256 into KNOWN_GOOD.md. Configs: timestamped backup copy. Each archive needs measured proof.
12. Firebase is **retired**. It must not reappear — CI fails the build if it does.

## Copy-Paste Handoff Prompt

```text
You are assisting with PigPulse, a multimodal swine-health monitoring system.

Canonical web topology:
- https://pig-health-monitor.vercel.app/ is the landing page.
- https://pig-health-monitor.vercel.app/app/ is the Expo web app.
- https://pig-health-monitor.vercel.app/app/tabs is the main dashboard.
- Keep the landing page at `/`; never replace the root with the dashboard.

Architecture:
Pi edge (standalone AP, no WAN): MLX90640 thermal + ESP32-S3 mic + Tapo CCTV
  → Mosquitto MQTT → Python bridge → PocketBase → thermal-pi dashboard
Laptop: PocketBase + OpenResty gateway + readonly proxy → Vercel function
  → Expo dashboard

Hardware: Pi 4B, MLX90640 (intermittent), ESP32-S3 mic (working), Tapo C200C,
  GY-SHT45 (unconnected). ESP32-D0WD decommissioned. Firebase retired.

PocketBase is 0.22.20 — cannot run .js migrations. Silently discards unknown fields.
cloud_sync.py is built but never tested end-to-end.
PB admin password is unknown — blocks the bridge.

Repository: branch `feat/v3-mqtt-pocketbase`
- `v3-mqtt-pocketbase/backend/`: bridge, thermal-pi, cctv, workers, systemd
- `v3-mqtt-pocketbase/firmware/esp32s3-mic-ambient/`: ESP32-S3 firmware
- `v3-mqtt-pocketbase/frontend/landing_page/`: landing page at `/`
- `v3-mqtt-pocketbase/frontend/mobile_app/`: Expo source mounted at `/app`
- `legacy/`: frozen Firebase-era trees (read-only)

Work carefully:
- Do not assume old Firebase/mock-data notes are current without checking source.
- Do not expose or request secrets.
- Hardware claims require device readouts — never say "confirmed" from a spec sheet.
- When something is confirmed working, archive it immediately (R8).
- Prefer minimal, testable changes and report exactly what was verified.

Task: [describe the task here]
Success criteria: [describe observable behavior here]
```

## Source of Truth

For current rules and deployment topology, use `CANON.md` in the repository root together with this document.

For implementation details, consult current source and:

- `v3-mqtt-pocketbase/docs/ARCHITECTURE.md`
- `v3-mqtt-pocketbase/docs/DEPLOYMENT.md`
- `v3-mqtt-pocketbase/docs/API.yaml`
- `v3-mqtt-pocketbase/docs/DECISIONS.md`

If sources conflict, prefer current `CANON.md`, then current code/configuration, then dated documentation.
