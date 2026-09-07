# PigPulse Simulation Web UI Sandbox (SiL / HiL) Implementation Plan

> **Author**: Gemini 3.8 Flash (Orchestrator) + Sentinel Soul / Hermes Review Panel  
> **Target Path**: `v3-mqtt-pocketbase/tools/simulator-web/`  
> **Branch**: `feat/v3-mqtt-pocketbase`  
> **Status**: Approved & Executing

---

## 1. Executive Summary & Purpose
The **PigPulse Simulation Web UI Sandbox** is a browser-based Software-in-the-Loop (SiL) and Hardware-in-the-Loop (HiL) testbench emulating an edge node running on Cebu swine farms.

It emulates:
1. **ESP32 D0WD** (520KB SRAM, Xtensa LX6 dual-core, no PSRAM) running FreeRTOS tasks.
2. **MLX90640** 32×24 Far-Infrared Thermal Sensor array with noise, quantization, and bilinear interpolation.
3. **Dual INMP441** I2S MEMS Microphones with bioacoustic formants, ADSR envelopes, barn reverberation ($RT_{60} \approx 0.8\text{s}$), and weather noise (tin-roof rain).
4. **Raspberry Pi 5 Edge Compute**: Emulated in a dedicated WebWorker executing SciPy STFT denoising (~2ms), 40-bin Mel filterbanks (~4.8ms), CNN-LSTM cough classification (~22ms), and thermal ear-ROI refinement (~3.5ms).
5. **Cebu Farm Chaos Engine**: Power sags, I2C bus hangs, heap fragmentation, 802.11 beacon loss, and mud evaporative cooling.
6. **Strict Canonical Wire Protocol**: Real WebSocket MQTT over `ws://localhost:9001` directly through the canonical pipeline: Mosquitto $\to$ `mqtt_bridge.py` $\to$ PocketBase $\to$ Expo Mobile App.

---

## 2. Global Invariants & Decisions
- **Decision 12–14 Compliance**: No fake private gateway routes (`gateway.ts`). Simulator publishes strictly via standard MQTT topics (`pig/{deviceId}/[telemetry|alerts|status|commands|response]`).
- **Data Provenance**: Prominent, high-visibility UI badges (`SIMULATED`, `LOOPBACK`, `LIVE`) prevent any confusion with real field telemetry.
- **Accessibility Setting**: Accessible high-contrast mode toggle ($\ge 18\text{px}$, $>7:1$ contrast, bold outlines, WebAudio alert chimes) alongside the default cockpit density view.
- **Concurrency Guarding**: 60 FPS Canvas visualizers decoupled from React 18 reconciliation via mutable refs; WebWorker backpressure managed via single-flight semaphore and monotonic epoch tagging (`chaosEpoch`).

---

## 3. Wire Contract Parity

### Telemetry (`pig/{deviceId}/telemetry`, QoS 0, 5s Interval)
```json
{
  "temperature": 39.2,
  "bodyTemp": 39.2,
  "pigId": "pig-001",
  "targetX": 15,
  "targetY": 12,
  "thermalFrame": "<base64 encoded 768 bytes>",
  "coughRate": 2,
  "coughCluster": false,
  "healthTrend": "STABLE",
  "batteryPct": 88.5,
  "batteryV": 3.98,
  "powerState": "NORMAL",
  "wifiRssi": -68,
  "status": "NORMAL",
  "timestamp": 1725800000
}
```

### Alerts (`pig/{deviceId}/alerts`, QoS 1, Retained on FEVER)
```json
{
  "type": "FEVER",
  "severity": "CRITICAL",
  "pigId": "pig-001",
  "value": 40.4,
  "threshold": 40.0,
  "message": "Fever detected: 40.40°C",
  "timestamp": 1725800000
}
```

### Status (`pig/{deviceId}/status`, QoS 1, LWT on Disconnect)
```json
{
  "online": true,
  "batteryPct": 88.5,
  "batteryV": 3.98,
  "wifiRssi": -68,
  "uptime": 120,
  "freeHeap": 145200,
  "timestamp": 1725800000
}
```

---

## 4. Implementation Tasks

### Task 1: Scaffolding & Virtual Hardware Engine Types
- `package.json`, `vite.config.ts`, `tsconfig.json`, `tailwind.config.js`
- `src/types/canonMqtt.ts`, `src/types/virtualNode.ts`, `src/types/chaos.ts`
- Tests: `src/types/__tests__/types.test.ts` (Assert schema parity with `PigMqttTopics.h` and `shared/types.ts`)

### Task 2: 32×24 Thermal Grid & Hotspot Math Engine
- `src/engines/thermalEngine.ts`
- 32×24 grid upsampling, NETD noise ($\sigma=0.15^\circ\text{C}$), uint8 clamping `(t-20.0)*12.75`, Base64 encoding.
- Dual Hotspot detection: Firmware global `maxT` and Pi 5 cranial orientation + $3\times3$ ear-base ROI.
- Tests: `src/engines/__tests__/thermalEngine.test.ts`

### Task 3: WebAudio Bioacoustics Synthesizer & Noise Engine
- `src/engines/audioSynthesizer.ts`
- 16 kHz `AudioContext` lifecycle manager, ADSR envelopes (600Hz infectious, 1600Hz non-infectious).
- ConvolverNode barn reverb ($RT_{60} \approx 0.8\text{s}$), WaveShaper soft-clipping, torrential rain noise buffer.
- Tests: `src/engines/__tests__/audioSynthesizer.test.ts`

### Task 4: Virtual ESP32 D0WD State Machine & Chaos Engine
- `src/engines/virtualEsp32.ts`
- FreeRTOS dual-core task simulation, TWDT watchdog trigger, persistent I2C bus hang, LiPo non-linear discharge curve with TX voltage sag (150–250mV), 4096-byte MQTT TX ceiling.
- Tests: `src/engines/__tests__/virtualEsp32.test.ts`

### Task 5: MQTT WebSocket Client & In-Browser Loopback Broker
- `src/services/mqttService.ts`
- `mqtt.js` WebSocket transport to `ws://localhost:9001` with fallback in-memory mock broker.
- Backpressure throttling on `ws.bufferedAmount`, full-jitter backoff (1s $\to$ 60s).
- Tests: `src/services/__tests__/mqttService.test.ts`

### Task 6: UI — Swine Arena & Thermal Heatmap
- `src/components/SwineArena.tsx`, `src/components/ThermalHeatmap.tsx`
- Interactive 2D roaming pen with drag-and-drop into camera FOV.
- Independent 60 FPS `requestAnimationFrame` Canvas renderer with IronBow / Plasma LUT colormaps.

### Task 7: UI — Bioacoustics Studio, FFT Waterfall & Pi 5 Latency HUD
- `src/components/BioacousticsStudio.tsx`, `src/components/AudioSpectrogram.tsx`, `src/components/ComputeLatencyHud.tsx`
- 0–8 kHz audio waterfall, soundboard triggers, and real-time breakdown of the $\le 35\text{ms}$ Pi 5 compute budget.

### Task 8: UI — Chaos Monkey, Hardware Monitor & Accessibility Toggle
- `src/components/HardwareMonitor.tsx`, `src/components/ChaosPanel.tsx`, `src/components/OtaDialog.tsx`, `src/components/TopNav.tsx`
- Sliders for packet loss, I2C lockup, battery sag, brownout triggers.
- Accessible mode toggle ($\ge 18\text{px}$, $>7:1$ contrast, WebAudio alert chimes).

### Task 9: End-to-End Ingestion Integration Verification
- `tests/e2e/ingestionContract.test.ts`
- Smoke test verifying the full pipeline: Simulator $\to$ Mosquitto (`:9001`) $\to$ `mqtt_bridge.py` $\to$ PocketBase (`:8090`).
- Validates records land in PocketBase via REST API.

### Task 10: Documentation & README
- `tools/simulator-web/README.md` documenting architecture, usage instructions, and standalone verification rituals.

---

## 5. Companion Canon-Fix Plan (Post-Sandbox Task 11)
Applied after the sandbox reaches GREEN:
1. **PocketBase Schema Expansion**: Add 7 missing fields to `telemetry` collection (`thermalFrame, targetX, targetY, coughRate, coughCluster, healthTrend, batteryV, powerState`) and 3 fields to `alerts` collection (`pigId, value, threshold`).
2. **`mqtt_bridge.py` Status Fix**: Map incoming `online: true` to `status: "online"` in `handle_status`.
3. **Timestamp Normalization**: Convert boot-relative seconds to Unix Epoch ms in the bridge.
