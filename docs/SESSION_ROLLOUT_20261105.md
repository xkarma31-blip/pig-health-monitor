# SESSION ROLLOUT — 2026-11-05 (T7 SOAK RELEASE — Elephant/Goldfish)

> **Purpose:** a ~24 h hardware soak of the Pi edge rig (Master's run starts
> ~2026-11-06). Afterwards, "how hot did it get / what disconnected / at what
> rates / how does this compare next time" must be answerable with numbers,
> not anecdotes. This release builds the capture + report system for that.
>
> **Companion docs:** `SOAK_CONTRACT.md` (the interface all four tools share),
> `docs/track-t7-soak.md` (track note). The general T0–T6 track map lives in
> `docs/SESSION_ROLLOUT_20261029.md` and is unchanged by this release.

---

## 1. Release shape

```
Pi 192.168.69.1 (works standalone AP + wired)      Laptop (solrahk)
┌─────────────────────────────────────┐            ┌──────────────────────────────┐
│ pigpulse-soak.service               │   ssh      │ soak_report.py → PNG+MD+HTML │
│   soak_collect.py → soak.db (sqlite)│◄──────────►│ soak_live.py   → live view   │
│   soak_bench.py (on demand)         │  stream    └──────────────────────────────┘
└─────────────────────────────────────┘            bench runs ON the Pi itself
```

- The collector is **autonomous** — it records with Wi-Fi, laptop, or thermal
  pipeline down. Nothing else must run for a complete dataset to exist.
- **`SOAK_CONTRACT.md` is authoritative** for schema, CLI, event formats and
  selftests. Collector source wins over the contract on disagreement; the
  contract then gets a fix.

## 2. Roles — who owns what

| Role | Session / model | Owns (exclusive write) |
|---|---|---|
| **Elephant (T0)** | this session — `nvidia/deepseek-ai/deepseek-v4.1-flash` | `SOAK_CONTRACT.md`, `soak_collect.py`, `pigpulse-soak.service`, deploys, integration, real-data verification, this manifest + track note |
| Goldfish 1 | subagent `ses_e561a9cfeffef6xHtFuooNACRF` — `google/gemini-3.5-flash` | `backend/scripts/soak_report.py` |
| Goldfish 2 | subagent `ses_e561a9cfbffegUFvU9lisdb6h7` — `google/gemini-flash-lite-latest` | `backend/scripts/soak_live.py` |
| Goldfish 3 | subagent `ses_e561a9cf6ffeileHWoxAiLqK4C` — `google/gemini-3-flash-preview` | `backend/scripts/soak_bench.py` |

Elephant never edits goldfish feature files beyond integration fixes; goldfish
never touch the collector, the unit, or the contract (contract §12). Model
choice: Google models, one per worker to spread free-tier quota; all three
were live-probed for chat + tool-calling before launch.

## 3. Deliverables & status (measured 2026-11-05)

| # | Deliverable | Path | Status |
|---|---|---|---|
| 1 | Contract (schema, CLI, events, selftests) | `v3-mqtt-pocketbase/docs/SOAK_CONTRACT.md` | **DONE** |
| 2 | Collector — continuous sampler | `v3-mqtt-pocketbase/backend/scripts/soak_collect.py` | **DONE + DEPLOYED + VERIFIED on Pi** |
| 3 | systemd unit | `v3-mqtt-pocketbase/backend/systemd/pigpulse-soak.service` | **DONE + INSTALLED + ACTIVE** |
| 4 | Report tool (PNG×5 + summary.md + report.html) | `…/backend/scripts/soak_report.py` | **DONE + VERIFIED** — selftest PASS; 7/7 artifacts on the real DB (§5.2) |
| 5 | Live view (rich + fallback) | `…/backend/scripts/soak_live.py` | **DONE + VERIFIED** — selftest PASS; ran against the live Pi stream + `--host` fail paths |
| 6 | Bench tool (thermal capability baseline) | `…/backend/scripts/soak_bench.py` | **DONE + VERIFIED** — selftest PASS (laptop + Pi); rc convention 0 ok / 1 setup / 2 abort / 3 args |
| 7 | Real-data integration pass | — | **DONE 2026-11-05** — report on pulled real DB (7/7), live view on live stream, bench dry-run + real bench |
| 8 | Controlled bench on the Pi (~5 min, abort 82 °C) | — | **DONE 2026-11-05** — rc 0; baseline **66.22 °C** → load mean **77.05 °C** / max **80.34 °C**; throttle **0** throughout; `bench_20261105-042928.json` |

## 4. Deployed on the Pi (device-verified, not assumed)

- `pigpulse-soak.service` — `active`, enabled at boot. Drop-ins verified via
  `systemctl show`: `Restart=always`, `RestartSec=5`, `Nice=10`,
  `CPUWeight=50`, `MemoryMax=192M`, `User=pigpulse`.
- `/home/pigpulse/scripts/soak/soak_collect.py` — py_compiles; `--selftest`
  PASS on the Pi (3 samples, `collector_error` path proven honest).
- `/home/pigpulse/soak/soak.db` — WAL. Evidence at ~18 min uptime: **109
  samples at exact 10 s cadence**, `cpu_temp_c`/throttle/thermal/ambient/
  ESP/PB fields populated from live sources; events already captured
  (`collector_start`, `amb_state_change live->stale`, `stale->live`);
  journal scan producing per-unit rows; `svc=` shows all 7 units with
  `pigpulse-soak=active`.
- One real event already proves the pipeline: ambient sensor flickered
  stale→live; both transitions are in `events`.
- **Updated 2026-11-05 08:41 UTC (4.8 h uptime):** **1,738 samples / 125
  events**, exact 10 s cadence across the whole span; `NRestarts=0`, PID
  unchanged (32306). Event mix: `amb_state_change` 60, `esp_change` 58
  (≈12/h — ESP32-S3 stream flakiness, see track note), `th_ok_change` 2
  (MLX90640 EIO flicker, recovered in 10 s), `bench_start/end` ×2 pairs,
  `collector_start` 1. WAL-safe snapshot round-trip tested the same day (§6).

## 5. Verification gates (in order)

1. **Worker selftests** — ✅ **executed**: all four tools `--selftest` PASS
   (report/live on laptop; bench laptop + Pi); elephant re-ran each.
2. **Real-data integration** — ✅ **executed 2026-11-05**: `soak_report.py` ran
   on a pulled real DB snapshot (7/7 artifacts, `~/sandbox/soak_report_verify/`);
   `soak_live.py --host` ran against the live stream; bench dry-run then the
   approved real bench (§3 #8). WAL-safe snapshot round-trip tested (§6).
3. **Double review** (SOUL Article VIII) — critic_loop ✅ **PASS on all four
   soak tools** (2026-11-05); CodeRabbit ⚠️ **skipped** — CLI not signed in,
   `cr auth login` needs an interactive browser. Re-run when authorized:
   `cr review --uncommitted --include-untracked --dir v3-mqtt-pocketbase/backend/scripts`.
4. **Commit** — ✅ **committed 2026-11-05**: by explicit path only (never
   `git add -A`); **not pushed** (branch 53 ahead / 40 behind origin — pushing
   is Master's call).
5. **The 24 h run** — ⏳ future: collector runs unattended; laptop topped up
   only when convenient (the DB lives on the Pi; nothing is lost while the
   laptop is off).
6. **R8 archive** — ⏳ future, after the run: pulled DB copy + report dir,
   timestamped.

## 6. Operating guide (after integration)

```bash
# Live view from the laptop (SSH stream, read-only)
python3 v3-mqtt-pocketbase/backend/scripts/soak_live.py --host pigpulse@192.168.69.1

# Report from a pulled DB snapshot — WAL-SAFE (never scp soak.db directly:
# a plain copy misses un-checkpointed commits; tested 2026-11-05)
ssh pigpulse@192.168.69.1 python3 - <<'PY'
import sqlite3
src = sqlite3.connect('/home/pigpulse/soak/soak.db')
dst = sqlite3.connect('/home/pigpulse/soak/soak_snapshot.db')
src.backup(dst); dst.close(); src.close()
PY
scp pigpulse@192.168.69.1:/home/pigpulse/soak/soak_snapshot.db /tmp/opencode/soak_snapshot.db
ssh pigpulse@192.168.69.1 'rm -f /home/pigpulse/soak/soak_snapshot.db'
python3 v3-mqtt-pocketbase/backend/scripts/soak_report.py --db /tmp/opencode/soak_snapshot.db --out ~/soak_report/

# Bench (on the Pi; aborts at 82 °C; ~6–8 min)
ssh pigpulse@192.168.69.1 'python3 /home/pigpulse/scripts/soak/soak_bench.py --seconds 300 --abort-temp 82'
```

Pi side, day to day: `systemctl status pigpulse-soak`,
`journalctl -u pigpulse-soak -n 20`, DB growth `du -h /home/pigpulse/soak`.

## 7. Open items

| # | Item | Owner |
|---|---|---|
| T7-1 | ✅ **DONE 2026-11-05** — rc 0; baseline 66.22 °C → load mean 77.05 °C / max 80.34 °C @ ~1498 MHz; throttle **0** throughout; cooldown 30 s. `bench_20261105-042928.json` (Pi + `/tmp/opencode/`) | elephant |
| T7-2 | ✅ **DONE 2026-11-05** — report 7/7 artifacts on real DB; live view on live stream; snapshot round-trip tested (§6) | elephant |
| T7-3 | 24 h run → report → findings (temperature curve, disconnects, rates) | elephant + Master |
| T7-4 | ✅ **DONE 2026-11-05** — CANON §2.8 (new) + §3 soak row + §4 deploy row | T0 |
| T7-5 | R8 archive after the run (DB snapshot + report dir) | T0 |
