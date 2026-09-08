# Simulation Web UI Sandbox — Session State (2026-09-08)

> **Handoff checkpoint.** Full plan: `docs/plans/2026-09-08-simulation-web-ui-sandbox.md`.
> Branch: `feat/v3-mqtt-pocketbase`. Repo root: `/home/solrahk/pig-health-monitor/v3-mqtt-pocketbase/`.

## STATUS: ALL SANDBOX TASKS DONE & COMMITTED ✅

| Task | Commit | Notes |
|------|--------|-------|
| 1–5 (scaffold, canon contracts, thermal, synth, D0WD state machine, MQTT) | `02a95e4`…`e9b975e` | committed earlier |
| 6 Thermal heatmap + Swine Arena | `c980436` | + utils (colormaps/heatmapGrid/arenaGeometry) + uiSmoke test |
| 7 Studio/Spectrogram/LatencyHUD | `dddbe97` | **fixed from baseline**: canvas now actually paints; honest 35 ms bars; soundboard wired |
| 8 Hardware/Chaos/OTA/TopNav | `b2cecb5` | **fixed**: always-visible a11y toggle; chaos sliders wired to node (+ sag override in chaos.ts/virtualEsp32.ts) |
| 9 E2E ingestion contract | `0299630` | at `tools/simulator-web/tests/e2e/ingestionContract.test.ts` (moved from stray repo-root `tests/`) |
| 11 c2 bridge status fix | `edba54e` | `backend/bridge/mqtt_bridge.py handle_status` + regression `backend/bridge/tests/test_bridge_status.py` |
| 10 README + cockpit entry | `a9b46c4` | index.html, main.tsx, App.tsx (4 Hz live loop), index.css, appSmoke test, .gitignore (pycache + dist) |

## Phase 2: Simulation Proof (environment → AI → trace → cockpit) ✅

Plan: `docs/plans/2026-09-08-simulation-proof-environment-ai-trace.md`. All 4 planned commits landed.

| Stage | Commit | Notes |
|-------|--------|-------|
| 1 BarnEnvironment herd model | `417e918` | fever/cough dynamics per pig health state; deterministic (seeded mulberry32); linear fever ramp 0.06 °C/s, plateaus exactly at target; INFECTED target 40.8 so fever crosses 40.0 latch → CRITICAL |
| 2 DSP + classifier + node overrides | `15433ef` | real STFT (radix-2 FFT) → 40-band Mel → log-mel features → 3-class readout; `generateCoughBurst(..., rand?)`; `node.setEnvironment({bodyTemp,coughRate,trend,position})` |
| 3 Pipeline trace + scenario runner | `c68a4a9` | SENSOR→DSP→ML→DECISION→MQTT→BRIDGE→DB journal; causal loop proven offline: sick pig → fever → CLUSTER → CRITICAL. Classifier is count-led (cough count primary, energy corroborates) |
| 4 Cockpit wiring | `6dff8f0` | BarnPanel (4 pigs, script-infection button) + ClassifierPanel (live Mel heatmap canvas + score bars) + PipelineTrace (auto-scroll journal) + ScenarioRunner (same engine as tests → on-screen PASS/FAIL). App loop: env.tick(0.25) → 1 s watchdog inference → setEnvironment → node.tick() → trace |

**Counts at Phase 2 close:** tsc clean · vitest **126/126 across 19 files** · `npm run build` OK · dev server 200 on `/` + all transformed modules.

## Phase 3: Full-Capstone Emulation (real herd → sensor farm → live backend) ✅

Plan: `docs/plans/2026-09-08-simulation-full-capstone-emulation.md`. Stages A–D landed, all grounded in measured live readouts (2026-09-08).

| Stage | Commit | Notes |
|-------|--------|-------|
| Plan | `56fb130` | `docs: full-capstone emulation plan` — grounded in bridge crash-loop, PB schema, firmware topics |
| A Grounded world model | `77a42d1` | environment.ts v3: `REAL_HERD` (pig-001 Peppa … pig-004 Wilbur from live `pigs`), open-air factors, entropy events (DRAFT/HEAT_SPIKE/DOOR_OPEN), contagion (proximity × airflow × humidity → exposure → INFECTED), scene CRUD. **Defaults reverted to v2-congruent** (diurnal 0, entropy 0, contagion 0) so every seed-dependent test keeps its exact PRNG stream — realism is opt-in via `setParams`. +11 v3 tests. |
| B Sensor farm | `56524b1` | `SensorFarm`/`SensorNodeConfig`: placeable/replaceable esp32 nodes (esp32-001/002 match live `devices`), watched pig = nearest in coverage radius, RSSI from geometry (free-space-ish path loss, WIFI_WEAK_RSSI → 50% packet loss), online = powered && !hibernating, 8-column telemetry records (deviceId, timestamp, temperature, bodyTemp, pigId, status, batteryPct, wifiRssi) matching the live `telemetry` collection; node alerts surfaced. +10 tests. |
| C Backend probes | `ef1217b` | `backendProbe.ts`: tri-state liveness (`up`/`down`/`unreachable` — browser CORS ≠ dead service), HTTP/WS/TCP kinds with injectable fetch/ws/net, root-cause synthesis (Mosquitto DOWN + bridge crash-loop chain, NRestarts input). **Live-verified in Node**: PB 200, OpenResty 200, thermal-ws 426, Mosquitto refused, ValKey open. +11 tests. |
| D Cockpit wiring | `385903a` | `SceneEditor` (click-to-place + numeric inputs + coverage circles + power/remove/add), `EnvironmentConsole` (9 sliders incl. diurnal/entropy/contagion, event buttons, sim speed 0.5–4×), `BackendInspector` (live probes + root-cause diagnosis + measured bridge evidence 5347 restarts). App: REAL_HERD → farm coverage → watched-pig pipeline → trace; barn/arena/heatmap now driven by the real herd. +CSS (a11y high contrast), smoke test updated to `pig-001…004` + new panels. |

**Counts at Phase 3 close:** tsc clean · vitest **158/158 across 20 files** (+21 vs Phase 2) · `npm run build` OK · dev server 200 on `/`.

## Verification (all PASSED at handoff time)

- `npx tsc --noEmit` (in `tools/simulator-web/`) — **clean** (was 10 errors pre-fix)
- `npx vitest run` — **95/95, 14 files** (was 78/11 pre-fix)
- `npm run build` — production bundle OK
- `PYTHONPATH=backend/bridge python3 backend/bridge/tests/test_bridge_status.py` — all passed
- Dev server served 200 on `/`, `/src/main.tsx`, all modules; zero Vite errors

## How to run / see it

```bash
cd tools/simulator-web
npm run dev    # → http://localhost:5173
```

## Not verified / known limitations (HONEST)

- **Browser runtime not screenshot-verified** — headless env could not screenshot localhost. SSR output confirms full cockpit markup; visual check pending on a real browser.
- **Cough formant fidelity** — `generateCoughBurst` ≈ ADSR-shaped noise; 600/1600 Hz formant is approximate (band energy tested, spectral purity not). Known, documented in README.
- **Live MQTT mode** exists in `mqttService` (`MqttMode 'live'`) but cockpit runs LOOPBACK by default.
- **Bridge crash-loop is REAL** (measured: Mosquitto :1883 refused, `pigpulse-bridge` NRestarts 4017 → 5347 during this session). It is *shown* in the BackendInspector, not fixed here — fixing the broker is separate work (`docker run` mosquitto per `deploy/docker/`, then bridge connects).
- **TCP probes (Mosquitto/ValKey) only run in Node** — in the browser they report `unreachable` (honest tri-state), verified live via `tsx` against the actual deployment.
- **Contagion/entropy are literature-grounded, not outbreak-validated** — realistic dynamics, no farm-outbreak calibration data. Defaults stay OFF until the EnvironmentConsole switches them on.

## Follow-ups still open (OUTSIDE sandbox scope — not started)

1. **Task 11 c1** — PocketBase schema expansion: add 8 telemetry fields (`thermalFrame, targetX, targetY, coughRate, coughCluster, healthTrend, batteryV, powerState`) + 3 alert fields (`pigId, value, threshold`).
2. **Task 11 c3** — bridge timestamp normalization (boot-relative seconds → Unix epoch ms).
3. Optional: real-browser screenshot pass of the cockpit; formant filter improvement.

## Rules to not break (from AGENTS.md / SOUL.md)

- Only canonical dir: `~/pig-health-monitor/` branch `feat/v3-mqtt-pocketbase`. Never edit `~/PigHealthMonitor_ARCHIVE_OFFLINE`.
- No sudo for builds; no new top-level dirs in `$HOME`; `.planning/` + GSD only when Master invokes.
- Hardware claims need an actual device readout; "confirmed" = measured, else say "unverified — web/spec only".