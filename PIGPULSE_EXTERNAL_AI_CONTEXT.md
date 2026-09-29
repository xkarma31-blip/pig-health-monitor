# PigPulse External AI Context

> Portable handoff for online AIs and collaborators without access to the local repository.
> Canon revision: 2026-09-29.
> Sanitized: no credentials, tokens, private IP addresses, local usernames, or private filesystem paths.

## Mission

PigPulse, also called Pig Health Monitor, is a multimodal edge-health monitoring system for open-air swine farming. It combines thermal sensing, acoustic sensing, ESP32 edge processing, MQTT transport, PocketBase persistence, and an Expo mobile/web dashboard.

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
- `https://pig-health-research-portfolio.vercel.app/` is a secondary portfolio alias, not the canonical app entry point.

Deployment rules:

- The landing page owns the domain root `/`.
- The current Expo web export is mounted below `/app`.
- Do not deploy the Expo app over `/`.
- Do not create a separate public dashboard hostname when the same-domain `/app` route is sufficient.

## Architecture

```text
ESP32 thermal/acoustic sensors
    -> Mosquitto MQTT broker
    -> Python MQTT-to-PocketBase bridge
    -> PocketBase REST API + realtime SSE
    -> OpenResty gateway
    -> Expo React Native / React Native Web application
```

| Layer | Technology | Responsibility |
|---|---|---|
| Firmware | ESP32 + C++/PlatformIO | Sensor acquisition, edge processing, MQTT publishing |
| Thermal | MLX90640 | 32x24 infrared thermal frames |
| Acoustic | I2S MEMS microphones such as INMP441 | Farm sound and respiratory signal capture |
| Broker | Mosquitto | MQTT topic routing |
| Bridge | Python | MQTT message handling and PocketBase writes |
| Database | PocketBase / SQLite | REST records, auth, and realtime SSE |
| Gateway | OpenResty + Lua | HTTP proxying, rate limiting, and SSE/websocket routing |
| Thermal stream | Node websocket service | Live thermal frame broadcasting |
| Cache | ValKey/Redis-compatible service | Intended buffering/cache layer; verify wiring before relying on it |
| Client | Expo Router + React Native Web | Mobile app and browser dashboard |

## Repository Map

Use relative paths when discussing files:

```text
v3-mqtt-pocketbase/
├── backend/
│   ├── bridge/              MQTT-to-PocketBase bridge
│   └── setup/               PocketBase setup and test seeders
├── deploy/
│   ├── docker/              Mosquitto, ValKey, and thermal websocket deployment
│   ├── openresty/           Gateway configuration copy
│   └── pocketbase/          PocketBase binary, migrations, and data layout
├── firmware/                ESP32 firmware
├── frontend/
│   ├── landing_page/        Static landing page; deployed at `/`
│   └── mobile_app/          Expo source; exported and mounted at `/app`
├── scripts/                 Health checks and operational scripts
└── docs/
    ├── ARCHITECTURE.md      Detailed architecture
    ├── DEPLOYMENT.md        Deployment instructions
    ├── API.yaml             API contract
    └── DECISIONS.md         Architectural decisions
```

Important boundaries:

- The landing page is not the dashboard.
- The Expo dashboard source is under `frontend/mobile_app`.
- The combined production deployment has the landing at the root and the Expo export under `frontend/landing_page/app/`.
- Generated web output should not be hand-edited as a substitute for changing Expo source.

## Frontend Behavior

The Expo app uses Expo Router with its route root under `src/app`.

The root route redirects to `/tabs`. The route tree also includes dashboard tabs, events, roster, settings, feed, thermal, setup, login, and web-oriented views.

The main dashboard presents PigPulse branding, farm/device status, healthy/watch/alert summaries, device telemetry rows, connection status, and realtime telemetry when the backend URL is reachable.

The dashboard can show demo fallback values when live telemetry is unavailable. Never describe fallback values as measured farm data.

## Backend Data Model

Primary PocketBase collections:

- `telemetry`: device ID, timestamp, temperature/body temperature, pig ID, status, battery, and Wi-Fi signal fields.
- `alerts`: device ID, alert type, severity, message, and timestamp.
- `devices`: device identity, name, type, status, battery, and last-seen information.
- `pigs`: pig identity, name, health status, and tags.
- `users`: application authentication records where configured.

Firmware may produce additional values such as thermal frames, target coordinates, cough rate, cough clusters, health trend, battery voltage, and power state. Before claiming those fields are persisted, inspect the current PocketBase schema and bridge transformation behavior.

## MQTT Convention

```text
pig/{deviceId}/telemetry
pig/{deviceId}/alerts
pig/{deviceId}/status
pig/{deviceId}/commands
pig/{deviceId}/response
pig/{deviceId}/thermal/live
```

The bridge consumes telemetry, alert, and status messages. The thermal websocket service consumes live thermal topics and broadcasts frames to connected clients.

When testing a data path, verify the complete chain:

```text
MQTT publish
  -> bridge receives message
  -> PocketBase record exists
  -> gateway exposes the record
  -> dashboard reads or subscribes to it
```

## Verified Deployment Facts

Verified on 2026-09-29:

- The canonical public root returns the landing page.
- The canonical `/app/` route returns an Expo document titled `Pig Health Monitor`.
- The canonical `/app/tabs` route returns the Expo dashboard document.
- Landing-page dashboard buttons render links to the same-domain `/app/tabs` route.
- Landing and dashboard are deployed together under one Vercel project/domain.
- The local combined preview used the landing page at port `3457` and dashboard at port `8094/app/tabs`; these are development conveniences, not public production contracts.

These facts verify routing and document identity. They do not prove that a remote browser can reach a private/local PocketBase instance or that live telemetry is flowing through production.

## Known Risks and Stale Documentation

Treat dated orientation snapshots as historical evidence, not automatic current truth:

- Older docs may describe the landing page and Expo app as separate top-level Vercel sites.
- Older docs may claim the Expo app is entirely Firebase/mock-driven. Current V3 source includes PocketBase-oriented utilities and realtime hooks, but inspect current code before making a broad claim.
- A local `.env` may contain loopback development URLs. Never assume those URLs work from a public browser.
- The public dashboard can load while telemetry/auth remains unavailable if no public backend URL is configured.
- The repository OpenResty config may differ from the live host configuration; compare before changing gateway behavior.
- ValKey is an intended cache/buffer component. Verify that the active bridge imports and uses a Redis-compatible client before relying on it.

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

## Useful Local Verification Commands

These commands apply to a collaborator with a local checkout and configured services:

```bash
# From the repository root
bash v3-mqtt-pocketbase/scripts/health_check.sh

# Build the Expo web export
cd v3-mqtt-pocketbase/frontend/mobile_app
npx expo export -p web

# Typecheck and lint when dependencies are installed
npx tsc --noEmit --skipLibCheck
npx eslint src/

# Verify public routing after deployment
curl -I https://pig-health-monitor.vercel.app/
curl -I https://pig-health-monitor.vercel.app/app/
curl -I https://pig-health-monitor.vercel.app/app/tabs
```

Never put passwords, access tokens, private API keys, or private network addresses into a shared AI prompt.

## Copy-Paste Handoff Prompt

```text
You are assisting with PigPulse, a multimodal swine-health monitoring system.

Canonical web topology:
- https://pig-health-monitor.vercel.app/ is the landing page.
- https://pig-health-monitor.vercel.app/app/ is the Expo web app.
- https://pig-health-monitor.vercel.app/app/tabs is the main dashboard.
- Keep the landing page at `/`; never replace the root with the dashboard.

Architecture:
ESP32 thermal/acoustic sensors -> Mosquitto MQTT -> Python bridge -> PocketBase -> OpenResty -> Expo dashboard.

Repository areas:
- `v3-mqtt-pocketbase/backend/`: bridge and setup
- `v3-mqtt-pocketbase/deploy/`: Docker, OpenResty, PocketBase
- `v3-mqtt-pocketbase/firmware/`: ESP32 firmware
- `v3-mqtt-pocketbase/frontend/landing_page/`: landing page at `/`
- `v3-mqtt-pocketbase/frontend/mobile_app/`: Expo source mounted at `/app`
- `v3-mqtt-pocketbase/docs/`: architecture, deployment, API, decisions

Work carefully:
- Do not assume old Firebase/mock-data notes are current without checking source.
- Do not expose or request secrets.
- Distinguish route verification from live backend/telemetry verification.
- Preserve the same-domain `/app` deployment structure.
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
