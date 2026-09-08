# PigPulse v3 — Barn Data-Capture Guide

> **Version:** 1.0 — September 8, 2026
> **Purpose:** run the capture phase (Plan §4) so the exported corpus is trainable.
> **Companion:** `docs/plans/2026-09-08-live-capture-ml-pipeline.md`

---

## 1. Daily capture checklist (10 min/day)

1. **Loop check** — run the 4 A3 probes:
   ```bash
   mosquitto_sub -h localhost -t 'pigpulse/#' -v -C 3
   curl -s http://localhost:8090/api/collections/telemetry/records?perPage=1 >/dev/null
   curl -s http://localhost:80/api/v1/health >/dev/null
   ```
2. **No gaps** — query a 5-min granularity:
   ```bash
   curl -s "http://localhost:8090/api/collections/telemetry/records?perPage=200&sort=-created" \
     | jq -r '.items[].created' | head -1
   ```
   A gap > 5 min = investigate RSSI/mic saturation before anything else.
3. **One barn log entry per alert episode** (vet-confirmed or not — mark which):
   `time, node, alertType, pigId, confirmedBy: vet|self, notes`

---

## 2. What each field means for the ML corpus

| Field | Meaning | Used as |
|---|---|---|
| `status` | `NORMAL\|WARNING\|CRITICAL\|INFO` (exact enum) | label (weak) |
| `band` | SoundTalks band: GREEN ≥ 60 / YELLOW 40–59 / RED < 40 (real ReHS semantics) | label (fine) |
| `rdi` / `rehs` | rolling 24-bin day health + hourly baseline ReHS | feature |
| `audioFrames` | 8 kHz cough ring | feature |
| `thermalRoi` | MLX90640 pig-mask crop frame | confounder check |
| `rain` / `timeOfDay` | weather + clock (the new v3.1 sim inputs) | confounder |
| `rssi` | wifi quality | quality flag |
| `suspect` | mic saturation / low RSSI flag | excluded from train |

---

## 3. Ground-truth hygiene rules

- **Never edit labels after export.** Amend a new record instead — the corpus stays append-only.
- **Down-weight flagged windows** (event keys `DOOR_OPEN`, `DRAFT`, `HEAT_SPIKE`) — same vocabulary the simulator uses.
- **Vet-confirmed beats auto:** if one episode is vet-flagged and everything else is not, trust only the vet flags for the fine labels; keep weak labels for the coarse `NORMAL/WARNING` task.

---

## 4. Export (end of capture)

```bash
mkdir -p /mnt/usb/pigpulse-corpus
for page in 1 2 3 4 5; do
  curl -s "http://localhost:8090/api/collections/telemetry/records?perPage=200&page=$page" \
    | jq -c '.items[]' >> /mnt/usb/pigpulse-corpus/telemetry.ndjson
done
python3 - <<'EOF'
import pandas as pd
df = pd.read_json('/mnt/usb/pigpulse-corpus/telemetry.ndjson', lines=True)
df.to_parquet('/mnt/usb/pigpulse-corpus/corpus.parquet')
print(df.shape, df['status'].value_counts().to_dict())
EOF
```

Expected shape after 14 days, 2 nodes: ~2 × 14 × 5760 ≈ **160k rows**, a few hundred `WARNING/CRITICAL`, handful of vet-confirmed.

---

## 5. Failure playbook

| Symptom | Check | Fix |
|---|---|---|
| No MQTT traffic | `mosquitto_sub` empty | node down → RSSI; bridge `systemctl status pigpulse-bridge` |
| PB empty but MQTT alive | bridge→PB mapping | bridge logs (`journalctl -u pigpulse-bridge`) |
| Continuous `suspect` flags | mic saturation | lower gain / move node |
| Retention not evicting | PB cron hook | verify against `StorageRing` test cases (age-then-capacity, 20 k cap) |
| Gaps > 5 min | wifi | AP closer to node, or extend node ring buffer (relay on reconnect) |