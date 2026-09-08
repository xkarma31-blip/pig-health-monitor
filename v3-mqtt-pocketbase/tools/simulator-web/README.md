# PigPulse v3 — Simulation Cockpit

A browser-based, zero-hardware simulation of the PigPulse v3 stack: a virtual
ESP32 D0WD node running the canonical firmware state machine, feeding the same
MQTT wire contract that the production bridge consumes.

> **What this is NOT:** a mock. Every simulation domain (FreeRTOS life cycle,
> 32×24 thermal sensing, cough audio synthesis, MQTT payload shaping) is a
> TypeScript implementation of the v3 firmware/architecture — verified by 95
> unit/integration tests, not by screenshots.

---

## Quick Start

```bash
cd tools/simulator-web
npm install          # first time
npm run dev          # → open http://localhost:5173
```

Production build + typecheck + test:

```bash
npm run build        # tsc + vite build (strict mode)
npm test             # vitest run — 95 tests / 14 files
```

---

## What you're looking at

| Panel | Powered by | Notes |
|-------|-----------|-------|
| **Swine Arena** | `virtualEsp32` + `arenaGeometry` | Pig position = the firmware's **argmax thermal hotspot** (`targetX/targetY`), not a fake walk |
| **Thermal Heatmap** | `thermalEngine` ↔ `heatmapGrid` | Renders the **actual base64 frame** from the latest telemetry payload (`decodeBase64Frame`) |
| **Audio Spectrogram** | `audioSynthesizer` + `AudioSpectrogram` | 512×256 waterfall, ref-driven canvas (zero React state at 60fps); formant follows the studio selector |
| **Bioacoustics Studio** | `audioSynthesizer.generateCoughBurst` | ⚠️ WebAudio requires a user gesture — click **Trigger Cough**; the formant selector drives both sound and spectrogram |
| **Pi 5 Compute Budget** | `ComputeLatencyHud` | Honest breakdown: STFT 2 ms · Mel 5 ms · CNN-LSTM 22 ms · Thermal ROI 6 ms = **35 ms** (bars are proportional) |
| **Hardware Monitor** | `virtualEsp32.snapshot()` | Live FreeRTOS heap, battery %, RSSI from the node |
| **Chaos Monkey** | `chaos.ts` → `node.injectChaos` | Sliders **do** affect the running simulation (packet drops, I2C lockup, brownout pulse, TX sag override) |

The top-nav **Accessible mode** toggle (always visible) raises contrast/font-size
for low-vision use — the UI targets ≥18px at >7:1 contrast when enabled.

---

## Architecture

```
src/
  engines/     virtualEsp32 (FreeRTOS state machine, tx/telemetry/alerts)
               thermalEngine (32x24 MLX90640 model + byte encoding per main.cpp)
               audioSynthesizer (cough burst + ADSR envelope)
  services/    mqttService (loopback | live MQTT), loopbackBroker (canon broker)
  types/       canonMqtt (wire contract), virtualNode, chaos
  utils/       heatmapGrid, colormaps, arenaGeometry
  components/  cockpit panels + smoke tests (__tests__/)
tests/e2e/     ingestionContract.test.ts — Topic routing + status mapping
               + payload schema compliance vs the canon wire contract
```

**Simulation loop:** `App.tsx` ticks one `VirtualEsp32Node` every 250 ms
(4 Hz — the same cadence the production bridge delivers). All seven panels
read from that single node snapshot, so telemetry, alerts, arena, heatmap and
hardware can never disagree. Canvas work (heatmap, spectrogram) runs in
`requestAnimationFrame` loops that read latest values from refs — deliberately
zero React state at 60fps.

---

## The wire contract this stands in for

```
publish   pig/{deviceId}/telemetry   CanonTelemetryPayload (15 fields)
publish   pig/{deviceId}/alerts      CanonAlertPayload     (7 fields: type, severity, pigId, value, threshold, message, timestamp)
publish   pig/{deviceId}/status      CanonStatusPayload    (online/battery/wifi/uptime/heap)
subscribe pig/{deviceId}/commands    ENROLL_START|ENROLL_STOP|OTA|CONFIG|PING
```

Thresholds (firmware canon): FEVER_WARNING 39.5 °C · FEVER_CRITICAL 40.0 °C ·
BATTERY_LOW 20 % · BATTERY_CRITICAL 10 % · WIFI_WEAK −85 dBm · thermal byte
encoding `(t − 20.0) × 12.75`.

---

## Verification rituals

```bash
npm test                 # 95 tests green (unit + smoke + E2E contract)
npx tsc --noEmit         # strict mode, zero errors
npm run build            # tsc + vite production bundle
python3 ../backend/bridge/tests/test_bridge_status.py   # status-mapping fix regression
```

The bridge-side Task 11 fix (`mqtt_bridge.py handle_status`: `online:true →
status:"online"`) is exercised by both the TypeScript E2E suite
(`tests/e2e/ingestionContract.test.ts`) and the Python regression above.

---

## Honest limitations

- **Cough formant fidelity:** `generateCoughBurst` shapes a noise burst with an
  ADSR envelope. The 600/1600 Hz formant claim is approximate — the current
  resonator feedback factor leaves it closer to filtered noise than a true
  formant. Band energy is asserted by test, spectral purity is not.
- **Battery sag:** the node has a natural 150–250 mV radio-burst sag model.
  The Chaos Panel's sag slider overrides it (0–300 mV); SOC is unchanged.
- **One pig:** the virtual node models the firmware's single-pen pipeline.
  Multi-pen farms are a bridge-side aggregation concern, out of scope here.
- **Live MQTT mode** exists in `mqttService` (via `mqtt` package) but the
  cockpit runs in LOOPBACK by default — see `MqttMode` for wiring a broker.