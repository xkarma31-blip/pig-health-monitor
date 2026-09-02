# PigPulse v3 — Agent & Human Orientation Guide

> **Purpose:** Onboard any AI assistant or new teammate in <5 minutes.  
> **Date:** 2026-09-02 **Stack:** ESP32 → Mosquitto → Python Bridge → PocketBase → OpenResty → Expo  
> **Live system status:** See §1 Health Matrix (verified 2026-09-02 10:55 PST)

---

## 1. System Health — Live Verified (2026-09-02)

Run `python3 scripts/health_check.py` or `bash scripts/health_check.sh` to re-verify.  
Below is the **last measured** state:

| Layer | Service | How it runs | Port | Status | Details |
|-------|---------|-------------|------|--------|---------|
| Broker | **Mosquitto** | Docker `pigpulse-mosquitto` | 1883 / 9001 | **✅ UP** | `allow_anonymous true`, `mosquitto.conf` at `deploy/docker/mosquitto/mosquitto.conf` |
| Cache | **ValKey** | Docker `pigpulse-valkey` + native `valkey-server` | 6380 (docker), 6379 (native) | **✅ UP** but **⚠️ UNWIRED** | Bridge declares `VALKEY_URL` but never imports `redis` — buffer is dead code |
| DB | **PocketBase** | systemd `pigpulse-pocketbase.service` | 8090 | **✅ UP** | Binary at `deploy/pocketbase/bin/pocketbase`, `pb_data/data.db` (143KB), admin `admin@pigpulse.local / admin123`, collections: `telemetry`, `alerts`, `devices`, `pigs`, `users` (auth) |
| Bridge | **MQTT→PB Bridge** | systemd `pigpulse-bridge.service` (`python3 mqtt_bridge.py`) | — | **✅ UP** | Subscribes `pig/+/telemetry` (qos0), `pig/+/alerts|status` (qos1); tested end-to-end via `paho-mqtt` publish → PB record appears |
| Gateway | **OpenResty** | native `openresty.service` (PID 19245) | 80 | **✅ UP** | Live config `/usr/local/openresty/nginx/conf/nginx.conf` proxies `/api/` → `127.0.0.1:8090/api/`, `/api/realtime` (SSE, no buffering), `/admin/`, `/mqtt` (WS), `/thermal-ws` |
| Live WS | **Thermal-WS** | Docker `pigpulse-thermal-ws` | 8080 | **✅ FIXED 2026-09-02** | Was `ENOTFOUND mosquitto` — fixed to `MQTT_BROKER=pigpulse-mosquitto` on `pigpulse-net` bridge (172.19.0.0/16). Subscribes `pig/+/thermal/live` and broadcasts to WS clients. |
| App | **Expo Mobile/Web** | `frontend/mobile_app` | — | **⚠️ GAP** | Code still 100% **Firebase** (`src/utils/firebase.ts`, `useAuth`, `useOfflineTelemetry`) — **no PocketBase SDK**. Screens show **hard-coded mock** (`PENS`, `NODES`, `pigs`, `generateMockData()`). Builds exist (`builds/PigPulse-v3-20260902.apk`) but not wired to PB. |
| Firmware | ESP32 D0WD | `firmware/src/main.cpp` | — | **✅ CODE READY** | Dual-core RTOS (AudioTask@core0, ThermalTask@core1), publishes `pig/esp32-001/telemetry|alerts|status|response`, `MQTT_BROKER_IP` hard-coded `192.168.1.100` — change via `secrets.h`. |

**Golden path tested 2026-09-02:**
```python
# MQTT publish → PB
publish("pig/esp32-001/telemetry", {"temperature":38.3,"bodyTemp":38.3,"pigId":"TestPig",...})
→ Bridge logs "✅ Created telemetry record"
→ GET /api/collections/telemetry/records returns it via both :8090 and :80 gateway
```

---

## 2. Repo Map — Where to Look

```
v3-mqtt-pocketbase/
├── firmware/                     # ESP32 C++ (PlatformIO)
│   ├── src/main.cpp              # 439 lines, dual RTOS tasks, MQTT pub @5s + alerts @fever
│   └── include/
│       ├── PigMqttTopics.h       # Flat topics: pig/{id}/telemetry|alerts|commands|status|response
│       ├── ThermalCamera.h / ThermalIdentification.h
│       └── audio_config.h / AcousticSignature.h
├── backend/
│   ├── bridge/mqtt_bridge.py     # 258 lines, PocketBaseClient (admin auth + token refresh), on_message demux
│   ├── setup/
│   │   ├── setup_pocketbase.py   # Idempotent collection creation (4 collections, listRule="" open)
│   │   ├── seed_pocketbase.py    # ★ NEW: PB mock seeder (telemetry+alerts+pigs+devices via REST)
│   │   └── seed_mqtt.py          # ★ NEW: MQTT mock publisher (thermal frames base64 32×24)
│   └── workers/                  # (empty, planned: alert_processor, data_cleaner)
├── deploy/
│   ├── docker/
│   │   ├── docker-compose.yml    # 5-service stack (out-of-sync with live systemd+docker hybrid)
│   │   ├── docker-compose.dev.yml
│   │   ├── mosquitto/mosquitto.conf
│   │   ├── start.sh / stop.sh    # ★ Hybrid launcher (docker: mosquitto,valkey,thermal-ws; systemd: PB,bridge,openresty)
│   │   └── .env.example
│   ├── openresty/conf/nginx.conf # ★ REPO COPY is stale (points to 172.18.0.1) — LIVE is /usr/local/openresty/nginx/conf/nginx.conf
│   ├── pocketbase/bin/           # PB binary + pb_migrations/*.js (4 migrations) + pb_data/data.db
│   └── thermal-ws/               # Node 20 WS broadcaster
├── frontend/
│   ├── shared/types.ts           # MqttTelemetry, Alert, Pig etc — shared but unused by app
│   ├── mobile_app/
│   │   ├── src/utils/firebase.ts # Firebase RTDB, NOT PB — replace with pocketbase.ts
│   │   ├── src/utils/pocketbase.ts # ★ NEW: fetch-based PB client + realtime SSE helper
│   │   ├── src/hooks/useOfflineTelemetry.ts  # Firebase listeners + mockSensors
│   │   ├── src/data/mockSensors.ts, mockAlerts.ts
│   │   ├── src/app/tabs/index.tsx, events.tsx, feed.tsx, etc  # All mock/hardcoded
│   │   └── package.json          # firebase ^12.16, expo ~57 — NO pocketbase yet
│   └── landing_page/             # static
├── docs/                         # ARCHITECTURE, DEPLOYMENT, API.yaml, MONITORING, TEAMMATE_SETUP
├── scripts/                      # ★ NEW: health_check.py/.sh, demo.sh legacy
└── AGENT_ORIENTATION.md          # THIS FILE
```

---

## 3. How to Work on This — Rules for AIs & Humans

### 3.1 Start Every Task with Verification

```bash
# 1. Health pulse (30s)
python3 scripts/health_check.py
# or
bash scripts/health_check.sh

# 2. PB sanity
TOKEN=$(curl -s -X POST http://localhost:8090/api/admins/auth-with-password \
  -H "Content-Type: application/json" \
  -d '{"identity":"admin@pigpulse.local","password":"admin123"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
curl -s http://localhost:8090/api/collections -H "Authorization: Bearer $TOKEN" | python3 -m json.tool | head -n 30
curl -s "http://localhost:8090/api/collections/telemetry/records?perPage=2&sort=-created" -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

# 3. MQTT round-trip
python3 backend/setup/seed_mqtt.py --once
journalctl -u pigpulse-bridge --no-pager -n 20  # expect "✅ Created telemetry record"
```

### 3.2 Hybrid Deployment — Don't Fight It

* **Docker:** Mosquitto, ValKey, Thermal-WS only (via `deploy/docker/start.sh`).  
* **Systemd:** PocketBase, Bridge, OpenResty (survives `docker compose down`).  
* **Gotcha:** `docker compose ps` will say “can't find config” if run outside `deploy/docker`. `docker ps` is truth.  
* **PB migrations** live in `deploy/pocketbase/bin/pb_migrations/` — they run automatically on PB start; editing schema via Admin UI auto-generates new migration files there.

### 3.3 Frontend ↔ DB Wiring — The Big Gap

The app is **not** connected to PB. Two options:

* **Quick (fetch, no SDK):** Use `src/utils/pocketbase.ts` (new, zero-dep) — `pbList(collection, {filter, sort, perPage})`, `pbSubscribeRealtime(collection, cb)` via EventSource on `/api/realtime`. Copy pattern from `firebase.ts` → replace `subscribeAlerts`/`subscribeTelemetry`.  
* **Full (SDK):** `npm install pocketbase` then `import PocketBase from 'pocketbase'; const pb = new PocketBase('http://localhost:8090')`. SDK handles auth + realtime better but adds dep.

All screens currently call `subscribeAlerts`/`subscribeSensors` from `firebase.ts` or render `PENS` hard-coded. Search `grep -rn "mockSensors\|PENS\|NODES\|generateMockData" src --include="*.tsx"` to find mocks to replace.

### 3.4 Schema — What Exists vs What Firmware Sends

**PB telemetry fields (8):** `deviceId*`, `timestamp*`, `temperature`, `bodyTemp`, `pigId`, `status`, `batteryPct`, `wifiRssi`  
**Firmware sends (+ extras that PB silently drops):** `thermalFrame` (base64 768B → 1500B), `targetX`, `targetY`, `coughRate`, `coughCluster`, `healthTrend`, `batteryV`, `powerState`, `wifiRssi` (duplicated), etc.  
**Fix:** Either add columns to PB (`setup_pocketbase.py` → `create_collection` or via Admin UI) or make bridge strip/transform before insert. Current bridge does **no transform** — PB just ignores unknown keys (verified: extra fields return 200 but aren't stored).

**Alerts fields (5):** `deviceId*`, `type`, `severity`, `message`, `timestamp*`  
**Pigs fields (4):** `pigId*`, `name`, `healthStatus`, `tags` (json)  
**Devices fields (6):** `deviceId*`, `name`, `type`, `status`, `batteryPct`, `lastSeen`

### 3.5 ValKey Is Dead Code — Don't Rely on It

Bridge defines `VALKEY_URL` but never `import redis`. Caching described in `docs/MONITORING.md` (L1 OpenResty dict → L2 ValKey → L3 PB) is aspirational. If you need caching, wire `redis-py` into `mqtt_bridge.py` or delete the docs claim.

### 3.6 Firmware Gotchas

* `MQTT_BROKER_IP` is hard-coded `192.168.1.100` in `main.cpp:28`. Override via `include/secrets.h` defines `WIFI_SSID`/`WIFI_PASSWORD` expected.  
* `DEVICE_ID` defaults `esp32-001` in `PigMqttTopics.h:19` — change via `-D DEVICE_ID` build flag or edit header.  
* Telemetry JSON is built with `snprintf` into 2048B buffer — adding fields can overflow. Base64 frame adds 1024+ bytes.

### 3.7 OpenResty — Two Configs, One Live

* **Repo copy:** `deploy/openresty/conf/nginx.conf` — stale, references `172.18.0.1:8090` and `pigpulse-mosquitto:9001`.  
* **Live:** `/usr/local/openresty/nginx/conf/nginx.conf` — uses `127.0.0.1:8090` upstream blocks, correct.  
* After editing live config: `sudo openresty -t && sudo systemctl reload openresty`.

---

## 4. Mock Data & Scripting

### 4.1 PB Direct Seeder (Recommended for App Dev)

```bash
# Seed PB via REST (no MQTT needed) — creates pigs, devices, telemetry history, alerts
python3 backend/setup/seed_pocketbase.py --clean --pigs 4 --telemetry 40 --alerts 6

# Verify
curl -s "http://localhost:8090/api/collections/pigs/records" -H "Authorization: Bearer $TOKEN" | python3 -m json.tool | head
```

Source: `backend/setup/seed_pocketbase.py` — uses admin auth, `create_record` with retry, generates realistic 32×24 thermal-ish temps (38–40°C) + fever spikes, pig rotation (Peppa, Boss Hog...), per-pig healthTrend.

### 4.2 MQTT Streamer (For Bridge & Realtime Testing)

```bash
# One-shot publish
python3 backend/setup/seed_mqtt.py --once

# Continuous stream (5s interval, drifts pig position, injects fever at tick 60)
python3 backend/setup/seed_mqtt.py --loop --interval 5

# Background
nohup python3 backend/setup/seed_mqtt.py --loop > /tmp/mqtt_seed.log 2>&1 &
tail -f /tmp/mqtt_seed.log
```

Publishes to `pig/esp32-001/telemetry`, `pig/esp32-001/alerts`, `pig/esp32-001/thermal/live` — bridge picks up first two, thermal-ws broadcasts third.

### 4.3 Legacy Firebase Seeders (Don't Use for v3)

`~/pig-health-monitor/seed_live.py` and `seed_telemetry.py` target `studio-1248778633-99f62.firebaseio.com` + hard-coded `API_KEY`/`TOKEN` — keep for v2 regression only. v3 seeders above target PB/MQTT.

### 4.4 Frontend Mock vs Real Toggle

`src/hooks/useOfflineTelemetry.ts` currently:

```ts
subscribeSensors(...) // Firebase
// fallback to mockSensors if !user
```

To test PB from Expo:

```ts
import { pbList, pbSubscribeRealtime } from '../utils/pocketbase';
// list
const {items} = await pbList('telemetry', {filter: "deviceId='esp32-001'", sort: '-timestamp', perPage: 20});
// realtime
const unsub = pbSubscribeRealtime('telemetry', (e) => setTelemetry(e.record));
```

---

## 5. Commands Cheat Sheet

```bash
# ── Health ──
python3 scripts/health_check.py          # full JSON health report
bash scripts/health_check.sh             # bash variant
journalctl -u pigpulse-pocketbase -f     # PB logs
journalctl -u pigpulse-bridge -f         # bridge logs
docker logs pigpulse-mosquitto --tail 20
docker logs pigpulse-thermal-ws --tail 20
docker logs pigpulse-valkey --tail 20

# ── Stack ──
bash deploy/docker/start.sh              # start docker trio
bash deploy/docker/stop.sh               # stop docker trio
sudo systemctl restart pigpulse-pocketbase pigpulse-bridge openresty
sudo systemctl status pigpulse-pocketbase pigpulse-bridge openresty --no-pager

# ── PB ──
python3 backend/setup/setup_pocketbase.py  # idempotent schema
python3 backend/setup/seed_pocketbase.py --clean
curl -s http://localhost:8090/api/health | python3 -m json.tool

# ── MQTT ──
python3 backend/setup/seed_mqtt.py --once
# or raw socket via python paho (mosquitto_pub cli not installed on this host)
python3 -c "import paho.mqtt.client as m, json; c=m.Client(m.CallbackAPIVersion.VERSION2); c.connect('127.0.0.1',1883,60); c.loop_start(); c.publish('pig/esp32-001/telemetry', json.dumps({'temperature':38.5,'bodyTemp':38.5,'status':'NORMAL','timestamp':int(__import__('time').time())})); __import__('time').sleep(1)"

# ── Frontend ──
cd frontend/mobile_app && npm install && npx expo start --web   # web on :8082
npx tsc --noEmit --skipLibCheck
npx eslint src/

# ── Thermal WS ──
# Test WS client
python3 -c "import asyncio, websockets; print('ws://localhost:8080')"
# Or via wscat: npx wscat -c ws://localhost:8080

# ── Firmware ──
# Requires PlatformIO
cd firmware && pio run
pio run --target upload --upload-port /dev/ttyUSB0
```

---

## 6. Known Issues & Next Steps

| Priority | Issue | Fix | Effort |
|----------|-------|-----|--------|
| **P0** | Expo app not wired to PB — all screens use mock/Firebase | Install `pocketbase` (or use `utils/pocketbase.ts`), replace `subscribe*` calls, add env `EXPO_PUBLIC_POCKETBASE_URL` | ~1 day |
| **P0** | Telemetry `thermalFrame`, `targetX/Y`, `coughRate` etc dropped | Add columns to `telemetry` collection (either via `setup_pocketbase.py` or Admin UI → new migration auto-generated) | 10 min |
| **P1** | ValKey unused — docs imply caching | Wire `redis` into bridge or remove claim; add `pip install redis` | 30 min |
| **P1** | `deploy/openresty/conf/nginx.conf` stale (172.18.0.1) | Sync live config into repo or make live config symlink to repo | 5 min |
| **P1** | Thermal-WS `MQTT_BROKER=mosquitto` DNS failure (fixed 2026-09-02) — needs persistence | Commit fix to `deploy/docker/start.sh` (done 2026-09-02) | ✓ Done |
| **P2** | Firmware broker IP hard-coded `192.168.1.100` | Move to `secrets.h` with fallback env / build flag | 5 min |
| **P2** | Bridge `handle_status` does PATCH without auth retry wrapper | Refactor `_get_headers` reuse + error handling | 15 min |
| **P2** | No data retention policy | Implement `backend/workers/data_cleaner.py` (delete telemetry >30d) | 1 hr |

---

## 7. For the Next Agent — Do This First

1. **Read:** This file + `docs/ARCHITECTURE.md` (full diagram) + `docs/API.yaml` (4 endpoints).  
2. **Run:** `python3 scripts/health_check.py` — confirm all 6 services still green before touching code.  
3. **Seed:** `python3 backend/setup/seed_pocketbase.py --clean` + `python3 backend/setup/seed_mqtt.py --once` — gives you live data to build against.  
4. **Pick a track:**
   * **Frontend track:** `frontend/mobile_app/src/utils/pocketbase.ts` → wire `tabs/index.tsx` + `tabs/events.tsx` to real data.  
   * **Firmware track:** Increase PB schema to capture `thermalFrame` or build compression pipeline.  
   * **Ops track:** Wire ValKey, add retention worker, sync OpenResty configs.  
5. **Verify before pushing:** Re-run health_check + curl PB + MQTT publish → confirm bridge still `✅ Created`.

---

## 8. Provenance

Verified against live hardware by reading:
* `systemctl status pigpulse-pocketbase|bridge|openresty`, `docker ps`, `ss -tlnp`, `curl /api/health`, `valkey-cli ping`, raw socket to `127.0.0.1:1883`, `paho.mqtt` publish → PB query, `pb_data/data.db` size, migration JS timestamps, `journalctl` tails, `deploy/openresty/conf/nginx.conf` diff vs `/usr/local/openresty/nginx/conf/nginx.conf`.

Not web-sourced. If any service shows DOWN, re-run `scripts/health_check.py` — don't trust this snapshot past its date.
