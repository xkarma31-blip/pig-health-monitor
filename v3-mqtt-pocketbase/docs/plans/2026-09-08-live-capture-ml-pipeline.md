# PigPulse v3 — Live Deployment + ML Data Pipeline (Master Plan)

> **Version:** 1.1 — September 8, 2026 (Master answered the 6 open questions; spectral-subtraction A/B measured in-sim)
> **Branches:** `feat/v3-mqtt-pocketbase` (canon) · `main` (GitHub mirror)
> **Status:** Plan v1.1 (simulator proof complete; live deployment is next)
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

### B2. Retention policy (v1.1 — Master's decision: capture-length window, then trim)

- **Window during capture:** **30 real days** (StorageRing window = capture period, via `setRetentionSeconds`) — research depth while the corpus is being labeled.
- **After export:** a **trim job** drops the window to **7 days** (C1 export → C2 training happen from Parquet, not from PocketBase) so the live DB stays bounded.
- **Capacity:** 20 000 records per node before oldest-first eviction — PocketBase cron hook mirroring the tested `evict()` semantics (age-cutoff first, then capacity).
- **Why:** unbounded "24/7 piling-up" is the problem StorageRing was built for; the "grab 30, trim to 7" pattern gives us capture depth without unbounded live storage.

### B3. Labeling truth chain (v1.1 — automated-first, Master's decision)

1. **Auto-labeling (primary):** weak labels generated from the pipeline itself — health band (RDI/ReHS) + weather/clock context + `suspect` hygiene flags. **Only high-confidence auto-labels train** (per-record confidence field, thresholded in C2 folds).
2. Optional vet cross-check later: barn log per alert episode (confirms/overrides weak labels — becomes the "strong" subset).
3. Bridge stamps `receivedAt` + node id (provenance); `status` enum (`NORMAL | WARNING | CRITICAL | INFO`) — the exact enum the farm tests assert; no free-text health field.

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
| 1 | **Bench** (home, v1.1 decision): Pi baseline + 2 nodes flashed + bench-mounted, MQTT→Bridge→PB→app loop | 4/4 A3 checks, desk deployment |
| 2 | Capture confirmed on bench: audio + labels + 30 d retention + trim job | 24 h continuous corpus, no gaps > 5 min |
| 3 | Auto-labeled episodes (high-confidence subset), data-hygiene flags, export tool | ≥ 10 high-confidence episodes |
| 4 | Baseline vs CNN-LSTM on validation fold, latency measured | decision: ship model or ship pipeline |

---

## 7. Risks

1. **Barn noise floor** — ventilation/fans drown cough bands → labels degrade. Mitigation: mic placement ≤ 1.5 m from pig snout; monitor SNR in Phase B.
2. **WiFi reliability in barn** — metal/moisture. Mitigation: RSSI monitor + local ring buffer on node (relay on reconnect — bridge already handles NRestarts).
3. **Label drift** — vet-confirmed episodes are sparse. Mitigation: alert every episode; 10 episodes/week is the floor, else extend Phase B.
4. **Retention job bugs** — eviction must match tested semantics. Mitigation: unit-test the cron hook against `StorageRing` cases (age-cutoff then capacity; 20k cap).

---

## 8. Master's decisions (v1.1 — answers to the 6 open questions)

| # | Question | Decision | Consequence |
|---|---|---|---|
| 1 | Barn vs home first | **Bench-mount at home first** (same loop, no pigs), barn in Phase B | Phase A1/A2 fully executable on the desk; barn move is a re-mount, not a redesign |
| 2 | Vet labels vs barn log | **Automate labeling ourselves** (no vet); vet = optional later | B3 becomes weak-label design: auto-labels only, high-confidence subset trains (§4.1) |
| 3 | 2 nodes vs 4 | "2 nodes" was the **sim fleet default** — the topology scales to N | See the topology matrix below; no budget change yet |
| 4 | Pi 5 location | **Assumed dry room nearby** (unanswered explicitly) | Ethernet/AP to barn; UFW rules per §2 remain valid |
| 5 | Data residency | **Pi + USB mirror default** (cloud optional, not required) | Export path in C1 is laptop-bound either way |
| 6 | Retention window | **"Whatever works" → capture-length window**: grab 30 d during capture, **trim to 7 d after export** | StorageRing window = capture period; post-export trim job keeps the corpus bounded |

### 8.1 Topology matrix (question 3, clarified)

| Tier | Device | Job | Why |
|---|---|---|---|
| Per-pen acoustic | ESP32-S3 + PDM mic (the "node") | 8 kHz cough-ring frames, on-device SoundTalks RDI + ReHS | close range, < 1.5 m from snout — the classifier's primary signal |
| Overall compute + thermal | **Pi 5** (aggregator, existing edge services) | MQTT hub, bridge, storage, MLX90640 thermal ROI at pen level | not per-pen compute; one thermal cam per pen at most |
| Optional far-field | CCTV camera + mic | night/distance coverage | where spectral subtraction may matter (see §6.5) |

The "2 nodes" number was the simulator's fleet *default* (2 pens) — not a hard ceiling. The code path is node-agnostic (`nodeId` topics); scaling = flashing more ESP32s.

### 8.2 Remaining open

- Pi 5 location (Q4) is *assumed* dry-room; confirm before buying cabling.
- CCTV far-field (Q3 tier 3) is a nice-to-have — the spectral subtraction decision in §6.5 says YES only if far-field mics are actually deployed.

---

## 9. Spectral subtraction experiment (the far-field mic question, v1.1)

**Question from Master:** "How do we actually do spectral subtraction — and is it worth it?"

**Engine:** `tools/simulator-web/src/engines/spectralSubtractor.ts` (TDD — 5 tests pin the numbers below). Recipe: Hann-windowed complex STFT (256 pt / 128 hop) → noise spectrum estimate → per-bin `max(|X| − α·N, β·|X|)` with phase preserved → overlap-add ISTFT (COLA `w[i]+w[i+N/2]=1`). β = 0.02 spectral floor guards musical noise. `'first'` mode = mean of first N frames; `'gated'` = seeded EMA updated only in energy-quiet frames (adapts during silences, ignores speech bursts).

**[measured]** in-sim results (deterministic seeds, 8 kHz):

| Scenario | Result |
|---|---|
| Pure stationary noise, first-N estimate, α=2 | −20.4 dB floor drop |
| Same, gated estimate, α=2 | −14.4 dB (deliberately more conservative) |
| 0.7 s cough in 0.5 s noise lead, α=1.5 (default) | −14.1 dB global floor drop |
| Cough-band preservation (600 ± 200 Hz) | band drop within **0.14 dB** of global drop — subtraction does NOT preferentially damage the cough band |
| Band-concentration "gain" | **−0.14 dB ≈ 0** — the honest finding |

**Verdict (worth it?): marginal-to-no for close-range node mics; YES as a pre-filter for far-field CCTV audio.**
1. A broadband cough buried in broadband noise cannot be "revealed" by floor subtraction — there is no spectral contrast to concentrate (gain ≈ 0 dB, measured). The buy is a uniform noise-floor drop (14–20 dB).
2. A 14–20 dB cleaner floor is directly useful for: gating/detection thresholds, the RNNoise-style front-end of the CNN-LSTM (C2), and night-time CCTV where SNR is the limiting factor.
3. Budget order: the far-field tier is optional; the sim A/B (this §) is the cheap decision tool — if the CCTV mic experiment repeats these numbers on a real barn clip, deploy subtraction in front of the far-field classifier; otherwise skip it.

Param checkpoints for tuning: `oversubtraction` (1.5 default, 2–3 for stationary), `floor` (0.02), `noiseMode` (first for fixed mounts, gated for drifting background).

---

## 10. Source of truth

- Simulator: `tools/simulator-web/` (engines `environment.ts`, `soundTalks.ts`, `sensorFarm.ts`, `spectralSubtractor.ts`; 193 tests).
- Existing live docs: `docs/DEPLOYMENT.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`.
- Measured bridge state: `systemctl status pigpulse-bridge` (re-verify live before Phase A1).