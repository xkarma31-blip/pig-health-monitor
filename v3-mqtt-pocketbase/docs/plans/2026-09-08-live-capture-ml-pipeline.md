# PigPulse v3 — Live Deployment + ML Data Pipeline (Master Plan)

> **Version:** 1.0 — September 8, 2026
> **Branches:** `feat/v3-mqtt-pocketbase` (canon) · `main` (GitHub mirror)
> **Status:** Plan (simulator proof complete; live deployment is next)
> **Honesty rule:** anything marked `[measured]` is grounded in a live readout; `[spec]` is datasheet/web-only and NOT verified against hardware. Nothing in this plan claims otherwise.

---

## 1. Why this doc exists

The simulator (`tools/simulator-web`, 188 tests green) proves the **causal loop** — cough ring → STFT/Mel → classifier → firmware alert → MQTT → bridge → PocketBase → app — end to end in code. This plan takes that loop to a **real barn deployment** and turns the deployment itself into a **data-capture machine** for the ML pipeline:

- Live sensors generate labeled ground truth (pig identity, health band, weather, clock).
- PocketBase becomes the training corpus (storage retention already simulated as `StorageRing`).
- The model we train on that corpus replaces the heuristic classifier in the loop.

**Success criteria (30 days):** one barn instrumented, ≥ 2 weeks of continuous captured audio + labels in PocketBase, one retrained model that beats the heuristic baseline on the validation set.

---

## 2. Target architecture (from simulator, unchanged)

```
┌──────────────┐    MQTT     ┌────────────┐   MQTT    ┌─────────────┐   REST   ┌────────────┐   HTTP   ┌────────┐
│  ESP32-S3    │ ──────────► │ Mosquitto  │ ────────► │ v3 MQTT     │ ───────► │ PocketBase  │ ──────► │ Expo   │
│  (2× nodes:  │   wifi:1883 │  (Docker)  │           │ Bridge      │          │ (native)    │         │ app    │
│  mic + MLX)  │             └────────────┘           │ (systemd)   │          │  :8090      │         │ phone  │
└──────────────┘                                      └─────────────┘          └────────────┘         └────────┘
        │ wifi RTT / RSSI                                                             ▲
        ▼                                                                             │
   Pi 5 (edge) ── OpenResty :80 (API gateway) ────────────────────────────────────────┘
```

Components and their run mode (current, unchanged from deployment):

| Component | Runs as | Where |
|---|---|---|
| Mosquitto | Docker | Pi 5 |
| ValKey (Redis) | Docker | Pi 5 |
| ThermalWS | Docker | Pi 5 |
| PocketBase | **native systemd** (not Docker — UFW/Docker networking) | Pi 5 |
| MQTT Bridge | **native systemd** | Pi 5 |
| OpenResty API | native systemd | Pi 5 |

> Why native for PocketBase/Bridge: Docker + UFW default-DROP breaks container→host networking (2026-09-02). Only TCP-loopback-facing services stay in Docker.

---

## 3. Phase A — Live deployment (days 1–7)

### A1. Pi 5 baseline (measured where possible)

```bash
# Ground truth, not web facts:
cat /proc/cpuinfo | grep -E "Model|Revision"
free -h && df -h /
ls /dev/rknpu* 2>/dev/null || echo "no NPU device node"
systemctl list-units --type=service | grep -E "pigpulse|mosquitto|openresty"
```

- Confirm bridge restarts (`systemctl status pigpulse-bridge` — measured NRestarts=5347 during an earlier session; verify again live).
- Reserve swap headroom — the RNNT/STFT buffers are tight on 8 GB RAM.

### A2. Node bring-up (firmware path)

1. **Flash order:** one node at a time; verify each on the test bench (mic VU, MLX90640 32×24 frame, WiFi RSSI) before mounting.
2. **Watchdog → live:** same firmware code path the simulator runs, only with real ADC/PDM input. Keep the cough-ring classifier on-device (SoundTalks-style RDI 24-bin rolling day matches the sim engine).
3. **MQTT topics** (canon, unchanged): `pigpulse/{nodeId}/telemetry`, `pigpulse/{nodeId}/alerts`, `pigpulse/{nodeId}/events`. Bridge maps them into PocketBase collections.

### A3. Data-plane validation (the "is the loop real?" checklist)

```bash
# 1. Firmware publishes?
mosquitto_sub -h localhost -t 'pigpulse/#' -v

# 2. Bridge writes through?
curl -s http://localhost:8090/api/collections/telemetry/records?perPage=1

# 3. Gateway serves?
curl -s http://localhost:80/api/v1/health

# 4. Phone app (Expo) reads live?
#    PocketBase auth (AsyncStorage) + records list — the retired Firebase
#    path is gone; auth-web is PocketBase-only.
```

Exit criteria: 4/4 checks pass with the node physically mounted in the barn.

### A4. Optional: Home Assistant

- Not required. If added: use OpenResty gateway endpoint, not raw PocketBase, to avoid a second write path.

---

## 4. Phase B — Data capture (days 8–21, the ML corpus)

### B1. What we capture (and why)

| Stream | Source | Rate / size | Use |
|---|---|---|---|
| Audio (cough ring) | node mic, 8 kHz mono, ~35 ms frames | ~12 MB/day/node raw | training audio |
| Health band (RDI/ReHS) | on-device SoundTalks-style engine | 1 record/15 s bin | labels |
| Thermal ROI | MLX90640 32×24, pig mask | 1 frame/2 s | fever cross-check |
| Weather + clock | env sensors / barn clock | 1 record/min | confounders |
| Alerts (FEVER, RESP_DISTRESS…) | watchdog decision path | event-driven | outcome labels |

### B2. Retention policy (matches the sim's `StorageRing` defaults)

- **Window:** 7 accelerated sim-days in the sim → **7 real days** in production (PocketBase record TTL job).
- **Capacity:** 20 000 records per node before oldest-first eviction — enforced by a PocketBase cron hook mirroring the tested `evict()` semantics.
- **Why:** unbounded "24/7 piling-up" (the real problem this feature was built for) is bounded and honest; old data is evicted by age first, then capacity.

### B3. Labeling truth chain

1. Veterinary confirmation of each alert episode (barn log entry per alert).
2. Bridge stamps `receivedAt` + node id (provenance).
3. `status` enum (`NORMAL | WARNING | CRITICAL | INFO`) — the exact enum the farm tests assert; no free-text health field.

### B4. Data hygiene

- Guard for sensor faults: RSSI < -85 dBm or mic saturation flags the record `suspect` (does not train).
- Days with barn-door ops / power tool noise are flagged via the simulator's event vocabulary (`DOOR_OPEN`, `DRAFT`, `HEAT_SPIKE`) — reuse those keys so the ML pipeline can down-weight them.

---

## 5. Phase C — Model training (days 22–30)

### C1. Export

```bash
# PocketBase → Parquet on the Pi (or laptop)
curl -s "http://localhost:8090/api/collections/telemetry/records?perPage=200&page=..." \
  | jq -c '.items[]' > telemetry.ndjson
python3 - <<'EOF'
import pandas as pd
pd.read_json('telemetry.ndjson', lines=True).to_parquet('corpus.parquet')
EOF
```

### C2. Baseline vs candidate

- **Baseline:** current heuristic classifier (sim-engine class): cough-rate ring → STFT/Mel → thresholds. Score on the validation fold.
- **Candidate:** small CNN-LSTM (the 22 ms budget in `ComputeLatencyHud` is the KPI) trained on 8 kHz cough clips + labels.
- **Acceptance:** candidate ≥ baseline − 2 pts on validation, AND fits the edge budget (measurable latency on the Pi, `perf` timings).

### C3. Honest failure mode

If < 2 weeks of labeled audio: do NOT ship the model. Ship the labeled-corpus tooling (Phases A+B are the deliverable) and re-run Phase C when data exists. The pipeline is the product; the model is downstream.

---

## 6. One-month timeline

| Week | Deliverable | Exit check |
|---|---|---|
| 1 | Pi baseline + 2 nodes flashed + mounted, MQTT→Bridge→PB→app loop | 4/4 A3 checks |
| 2 | Capture confirmed: audio + labels + retention job | 24 h continuous corpus, no gaps > 5 min |
| 3 | Vet-labeled episodes, data-hygiene flags, export tool | ≥ 10 vet-confirmed episodes |
| 4 | Baseline vs CNN-LSTM on validation fold, latency measured | decision: ship model or ship pipeline |

---

## 7. Risks

1. **Barn noise floor** — ventilation/fans drown cough bands → labels degrade. Mitigation: mic placement ≤ 1.5 m from pig snout; monitor SNR in Phase B.
2. **WiFi reliability in barn** — metal/moisture. Mitigation: RSSI monitor + local ring buffer on node (relay on reconnect — bridge already handles NRestarts).
3. **Label drift** — vet-confirmed episodes are sparse. Mitigation: alert every episode; 10 episodes/week is the floor, else extend Phase B.
4. **Retention job bugs** — eviction must match tested semantics. Mitigation: unit-test the cron hook against `StorageRing` cases (age-cutoff then capacity; 20k cap).

---

## 8. Open questions (for the Master — answers steer Phase A/B)

1. **Barn access:** is the target barn reachable within 7 days, or do we bench-mount at home first (same loop, no pigs) and move to the barn in Phase B?
2. **Labeling:** will a vet be available during capture weeks, or should the barn log be our sole ground truth (weaker labels, train on `NORMAL`/`WARNING` only)?
3. **Node count:** 2 nodes planned; budget for 4 (40 pigs → 4×10) or is 2 the ceiling?
4. **Pi 5 location:** inside the barn (better RSSI, harsher env) or a dry room nearby (run Ethernet/AP)? Matters for the UFW/Docker rules and heat.
5. **Data residency:** corpus stays on the Pi + a USB mirror, or is a cloud bucket acceptable (training on the laptop either way)?
6. **Retention window:** 7 real days acceptable, or do you want 30 for research depth? (Storage math already supports any window via `setRetentionSeconds`.)

---

## 9. Source of truth

- Simulator: `tools/simulator-web/` (engines `environment.ts`, `soundTalks.ts`, `sensorFarm.ts`; 188 tests).
- Existing live docs: `docs/DEPLOYMENT.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`.
- Measured bridge state: `systemctl status pigpulse-bridge` (re-verify live before Phase A1).