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

## Follow-ups still open (OUTSIDE sandbox scope — not started)

1. **Task 11 c1** — PocketBase schema expansion: add 8 telemetry fields (`thermalFrame, targetX, targetY, coughRate, coughCluster, healthTrend, batteryV, powerState`) + 3 alert fields (`pigId, value, threshold`).
2. **Task 11 c3** — bridge timestamp normalization (boot-relative seconds → Unix epoch ms).
3. Optional: real-browser screenshot pass of the cockpit; formant filter improvement.

## Rules to not break (from AGENTS.md / SOUL.md)

- Only canonical dir: `~/pig-health-monitor/` branch `feat/v3-mqtt-pocketbase`. Never edit `~/PigHealthMonitor_ARCHIVE_OFFLINE`.
- No sudo for builds; no new top-level dirs in `$HOME`; `.planning/` + GSD only when Master invokes.
- Hardware claims need an actual device readout; "confirmed" = measured, else say "unverified — web/spec only".