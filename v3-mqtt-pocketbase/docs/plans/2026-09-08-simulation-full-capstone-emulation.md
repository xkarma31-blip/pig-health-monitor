# Simulation V3 — Full Capstone Emulation (Grounded)

> **Date:** 2026-09-08 · Branch: `feat/v3-mqtt-pocketbase`
> Every design decision below cites a **measured live readout** taken 2026-09-08
> (systemd, docker ps, ss, PocketBase API, firmware sources). Nothing is spec-sheet fantasy.

## ✓ STATUS: ALL STAGES COMPLETE & COMMITTED (2026-09-08)

| Stage | Commit | Delivered |
|-------|--------|-----------|
| A Grounded world model | `77a42d1` | environment.ts v3: REAL_HERD, open-air factors, entropy events, contagion, scene CRUD (v2-congruent defaults, opt-in realism) |
| B Sensor farm | `56524b1` | SensorFarm: placeable/replaceable esp32 nodes, coverage→watched pig, geometric RSSI, 8-real-column telemetry |
| C Backend probes | `ef1217b` | backendProbe: tri-state liveness + mosquitto-down root-cause synthesis (live-verified in Node) |
| D Cockpit wiring | `385903a` | SceneEditor + EnvironmentConsole + BackendInspector wired to real herd + farm + loop |

Final gate: tsc clean · vitest **158/158 (20 files)** · build OK · dev server 200. Handoff: `2026-09-08-simulation-web-ui-sandbox-SESSION-STATE.md`.

## 1. Measured ground truth (this afternoon, live)

| Layer | State | Evidence |
|-------|-------|----------|
| PocketBase | **UP** :8090, healthy, `canBackup:true` | `curl /api/health`, admin auth OK |
| — schema | 5 collections: `users`(auth), `telemetry`, `alerts`, `devices`, `pigs` | live `/api/collections` with admin token |
| — real data | 43 telemetry, 6 alerts, 2 devices, 4 pigs (all NORMAL) | live record reads |
| OpenResty | **UP** :80 — routes `/api/`→PB, `/mqtt`→mosquitto_ws, `/thermal-ws`, `/health`, `/admin/` | `/etc/openresty/nginx.conf` |
| Mosquitto | **DOWN** — no :1883 listener, container not running (image present) | `ss -tlnp`, `docker ps` |
| Docker | only `pigpulse-thermal-ws`(:8080) + `pigpulse-valkey`(:6380→6379) up 6h | `docker ps` |
| Bridge | **CRASH-LOOPING, restart count 4017** — PB auth OK, then `[Errno 111] Connection refused` | `journalctl -u pigpulse-bridge` |
| Firmware ground truth | `DEVICE_ID="esp32-001"`; topics `pig/{id}/{telemetry,alerts,commands,status,response}`; FEVER_WARNING 39.5 / CRITICAL 40.0; TELEMETRY_INTERVAL 5000 ms; cough bands 500–800 Hz (infectious @600) vs 1200–2000 Hz (dry @1600) @512 smp/16 kHz; noise floor >4 kHz; SNR 5× | `firmware/src/main.cpp`, `PigMqttTopics.h`, `AcousticSignature.h` |
| Live pigs (DB) | `pig-001` Peppa (Duroc 6 mo), `pig-002` Boss Hog (Yorkshire 11 mo), `pig-003` Babe (Duroc 13 mo), `pig-004` Wilbur (Landrace 6 mo) | live `pigs` collection |
| Live devices (DB) | `esp32-001` online 78%, `esp32-002` online 77% | live `devices` collection |

## 2. Key findings (deliverables the sim must reflect + fix)

1. **Bridge crash-loop root cause = mosquitto not running.** The bridge binds
   `MQTT_BROKER=127.0.0.1:1883` (systemd unit) but no broker listens.
   → Sim's backend inspector must **probe real services** and surface this
   diagnosis immediately (red mosquitto tile → "start container" guidance).
2. **ID-model drift:** DB `pig-001..004` + devices `esp32-001/002` vs sim's
   fictional `d0wd-01`. → Assimilate: herd = real named pigs, nodes = real
   esp32 device ids, watched pig resolved via node *coverage*, not hardcode.
3. Firmware's `coughRate:0` / `coughCluster:false` are **hardcoded** in main.cpp
   (real limitation) → sim may stay ahead of firmware; label honestly.
4. Telemetry schema columns = `deviceId, timestamp, temperature, bodyTemp,
   pigId, status, batteryPct, wifiRssi` — the sim's telemetry payload must
   satisfy these exact fields for bridge ingestion.

## 3. Design (stages, each TDD GREEN + commit)

### Stage A — Grounded world model (`engines/environment.ts` v3, additive)
- **Real herd defaults**: `pig-001 Peppa, pig-002 Boss Hog, pig-003 Babe,
  pig-004 Wilbur` with breed/age/tags (live DB) · add/remove/move pigs via API.
- **Open-air factors**: `ambientBaseTemp °C`, `diurnalAmplitude °C` (day cycle),
  `humidity 0–100%`, `airFlow 0–1` (ventilation: dampens temp + dilutes contagion),
  `entropy 0–1` (scales drift + event frequency).
- **Entropy events** (seeded, deterministic per seed): draft gust (temp spike),
  door open (humidity + cooling), heat spike (AC failure) — triggered by timer
  + entropy knob; visible in trace.
- **Contagion with more pigs**: proximity × airFlow decay — INFECTED pig seeds
  exposure to HEALTHY pigs within `contagionRadius`; dose accumulates; infect on
  threshold. Herd of 8/12/20 shows real dynamics.
- **Dynamic scene**: pigs wander (speed param), positions draggable via UI →
  `movePig(id, x, y)`; pen size configurable.
- API additions (all backward compatible): `setEnvironmentParams(p)`,
  `addPig/removePig/movePig`, `triggerEvent('DRAFT'|'HEAT_SPIKE'|'DOOR')`,
  `pig(id)`; tick keeps returning same shape.

### Stage B — Hardware placement + node farm (`engines/sensorFarm.ts`, new)
- Nodes = real device ids `esp32-001..N` (firmware canon); each has
  `{ id, x, y, coverageRadius, powered, batteryPct }`.
- Coverage: watched pig = nearest pig in radius (or NONE if out/off); RSSI from
  distance (20·log10) → feeds node packet-loss (ties into existing chaos).
- Add/remove/power-toggle node from UI ("place and replace hardware").
- Each running node owns a `VirtualEsp32Node`; telemetry publishes only for its
  watched pig with the 8 real columns (deviceId/time/temp/bodyTemp/pigId/
  status/batteryPct/wifiRssi).

### Stage C — Backend inspector (`services/backendProbe.ts` + panel, new)
Live, honest probes with per-tile status + latency + last error (auto-refresh):
- PocketBase `/api/health` (measured UP ✓)
- OpenResty `/health` on :80 (measured UP ✓)
- Mosquitto TCP :1883 (measured DOWN ✗ → **root cause diagnosis**)
- Thermal WS :8080 (measured UP ✓), Valkey :6380 (measured UP ✓)
- Bridge: process probe via `journalctl`/PID + last log line (measured
  CRASH-LOOP ✗) — panel shows "restart counter 4017" style evidence.
- **MQTT topic browser**: live subscribe `pig/+/telemetry|alerts|status` when
  broker is up; **PocketBase schema viewer**: read-only collection list with
  record counts (fetched live, admin token typed in-session, never stored).
Tests: probe services with mocked fetch + sockets → OK/DOWN/ERROR, latency ms.

### Stage D — Cockpit wiring + panels
- `SceneEditor` (drag pigs/nodes, add/remove/power, coverage circles, pen size)
- `EnvironmentConsole` (sliders: ambient/diurnal/humidity/airflow/entropy/
  contagion + event buttons + sim speed)
- `BackendInspector` (Stage C panels + bridge diagnosis + schema/topics tabs)
- App: env params flow into tick; watched pig from node farm; existing panels
  (Arena/Thermal/AI/Trace) stay coherent via watched-pig override.

## 4. Honest limitations (carry into README + SESSION-STATE)
- Browser runtime not screenshot-verified (headless; SSR + module transforms).
- Classifier = fixed-weight stand-in for TFLite CNN-LSTM; feature pipeline real.
- Contagion/entropy are **models**, grounded in farm-literature semantics
  (proximity, ventilation dilution), not validated against real outbreak data.
- Firmware `coughRate`/`coughCluster` hardcoded → sim is ahead of firmware;
  labeled as such.
- Live probes hit real local services — bridge crash-loop is REAL and displayed
  as evidence, not papered over.

## 5. Verification
- `npx tsc --noEmit` clean · `npx vitest run` grows (+env v3, +sensorFarm,
  +backendProbe) · `npm run build` · dev server 200 on `/` + modules.
- Existing 126 tests stay green (additive APIs, default params = old behavior).

## 6. Commits
- `feat(sim): grounded world model - real herd, open-air factors, entropy, contagion (TDD GREEN)`
- `feat(sim): sensor farm - placeable/replaceable esp32 nodes with coverage + RSSI (TDD GREEN)`
- `feat(sim): backend inspector - live probes, MQTT topic browser, PB schema viewer (TDD GREEN)`
- `feat(sim): scene editor + env console + inspector wired into cockpit (TDD GREEN)`