# Track T7 — Pi Edge Soak (Capture · Report · Live · Bench)

**Track note file** (worker-owned; T0 folds it into `CANON.md` — §7 lists the deltas).
**Scope:** `v3-mqtt-pocketbase/backend/scripts/soak_*.py`,
`v3-mqtt-pocketbase/backend/systemd/pigpulse-soak.service`,
`v3-mqtt-pocketbase/docs/SOAK_CONTRACT.md`, `docs/SESSION_ROLLOUT_20261105.md`.
**Never touched:** firmware, mobile app, landing page, bridge, thermal-pi, `CANON.md`.

---

## Track note 2026-11-05 — soak capture system built, deployed, verified on the live Pi

### 1. What changed

| File | Change |
|---|---|
| `v3-mqtt-pocketbase/docs/SOAK_CONTRACT.md` | **New.** Authoritative interface: DB schema, all four CLIs, stream record formats (`sample` / `event` / `sample_error`), jsonl event spellings, deploy facts, formula definitions, selftest requirements, worker rules (§12). |
| `v3-mqtt-pocketbase/backend/scripts/soak_collect.py` | **New.** Continuous Pi sampler (stdlib only). 10 s cadence; persists across link loss; captures CPU temp/freq/throttle, load, mem/swap/disk, thermal pipeline (`:8080` HTTPS), ESP stream status (never opens `:9090` — reads `/esp/status`), ambient THI, PB row deltas, Wi-Fi clients, interface operstate, per-unit journal scan; emits `events` on state changes; `--stream` JSONL mode; `--selftest`. **Deployed + active.** |
| `v3-mqtt-pocketbase/backend/systemd/pigpulse-soak.service` | **New.** `User=pigpulse`, `Restart=always`/`RestartSec=5`, `Nice=10`, `CPUWeight=50`, `MemoryMax=192M`. **Installed + enabled + active.** |
| `v3-mqtt-pocketbase/backend/scripts/soak_report.py` | **New.** Offline report from a DB snapshot: 5 PNGs (temperature, rates, availability, processing, journal) + `summary.md` + self-contained `report.html` (base64 PNGs). Read-only DB URI; `--since/--until`; `--selftest`. |
| `v3-mqtt-pocketbase/backend/scripts/soak_live.py` | **New.** Laptop live view: SSH-streams `soak_collect.py --stream` (BatchMode, ConnectTimeout 8) or tails a jsonl file. rich table + sparkline + event ticker; `--no-tty` plain fallback; `--count`; `--selftest`. |
| `v3-mqtt-pocketbase/backend/scripts/soak_bench.py` | **New.** Runs **on the Pi**: baseline → N-worker CPU load → cooldown, 1 Hz, records JSON (`/home/pigpulse/soak/bench_<UTC>.json`), writes `bench_start`/`bench_end` into `soak.db`, `--abort-temp` guard (exit 2), stale-PID-safe lock, `--dry-run`, `--selftest`. |
| `docs/SESSION_ROLLOUT_20261105.md` | **New.** Release manifest (roles, gates, ops, open items). |

Validation: `npm run ci:backend` = **backend OK** (covers all four scripts);
`critic_loop.sh` = **4/4 PASS** on the four Python files.

### 2. Elephant/Goldfish execution (as instructed: goldfish on Google models)

| Role | Model | Outcome |
|---|---|---|
| Elephant | `nvidia/deepseek-ai/deepseek-v4.1-flash` | Contract, collector, unit, deploys, integration, real-data verification, this note |
| Goldfish — report | `google/gemini-3.5-flash` | File complete; hit per-minute 429 mid-run; acceptance = elephant re-ran `--selftest` + real-data run (below) |
| Goldfish — live | `google/gemini-flash-lite-latest` | File complete; 429 mid-run; **elephant integration fix** below |
| Goldfish — bench | `google/gemini-3-flash-preview` | Completed cleanly; selftest PASS on the Pi |

Free-tier reality: Google enforces ~250 K input tokens/min per model — separate
buckets per model, which is why one model per worker. 429s arrived near the end
of the two big workers; both had already written complete files. Integration
fixes are elephant-owned: `soak_live.py` plain mode rendered `event` records as
all-`N/A` sample rows (observed live) — now prints
`[N] EVENT <type>: <detail>`, routes `sample_error` to stderr, skips unknown
record types. Re-verified: selftest + two real SSH runs, exit 0.

### 3. Deployed on the Pi — device-verified

- `pigpulse-soak.service` — `active`, enabled. `systemctl show` confirms every
  designed property (`Restart=always`, `RestartSec=5`, `Nice=10`,
  `CPUWeight=50`, `MemoryMax=192M`, `User=pigpulse`).
- `/home/pigpulse/scripts/soak/soak_collect.py` + `soak_bench.py` —
  hash-identical to repo copies (sha256 verified). `soak_verify.py` is a
  Pi-only one-shot DB check helper (not tracked in the repo).
- `/home/pigpulse/soak/soak.db` — WAL. At first snapshot: **148 samples, 51
  events**, exact 10 s cadence, all fields populated from live sources.
- `vcgencmd` throttle reads work as `pigpulse`; journal scan reads all 7 units
  (`svc=` active everywhere); user in `adm` verified.

### 4. Verification evidence (all gates re-run by elephant)

| Gate | Command | Result |
|---|---|---|
| Py compile, both machines | `py_compile` ×4 (laptop) + ×2 (Pi) | PASS |
| Repo backend gate | `npm run ci:backend` | **backend OK** |
| Collector selftest (Pi) | `soak_collect.py --selftest` | PASS, 3 samples |
| Collector live | service journal + DB rows | **148 samples @10 s, 51 events** |
| Report selftest (laptop) | `soak_report.py --selftest` | PASS (5 PNGs >10 KB + summary + html) |
| Report real data | snapshot → `--db` run | 7/7 artifacts, real numbers (below) |
| Live selftest (laptop) | `soak_live.py --selftest` | PASS (pre- and post-fix) |
| Live real stream | `--host pigpulse@192.168.69.1 --count N --no-tty` | exit 0; bug found + fixed + re-run exit 0 |
| Bench selftest (Pi) | `soak_bench.py --selftest` | PASS |
| Bench dry-run (Pi) | `--dry-run` | exit 0, JSON + DB events written |
| **Real bench (Pi, approved)** | `--seconds 300 --abort-temp 82` | **exit 0, no abort** — see §6 |
| Critic loop | `critic_loop.sh` ×4 | 4/4 PASS |

Snapshot window for the numbers below: **2026-11-05 11:51–12:28 (0.72 h)**,
includes the real bench. Demo artifacts:
`~/sandbox/soak_report_demo_20261105/`.

### 5. First real findings (what the system already captured)

- **Max CPU 79.8 °C** (during the bench), mean 68.4 °C; 0 throttle events
  (`0x0` all window) — at 36 °C ambient.
- **ESP32-S3 stream is flaky**: `87.2 % up`, **23 outages in 43 min**, longest
  0.5 min — short repeated drops (lastMs rises to 3–12 s, then recovers).
  This is exactly the class of event the 24 h run must characterize; candidate
  follow-up (cable/power/RSSI) after the run.
- **Ambient sensor**: `89.9 % live`, 15 transitions, longest 1.3 min — the
  stale↔live flicker is captured as events.
- **Rates**: PB **49.5 rows/min** total (s3-mic-01 43.6, pi-thermal-01 5.9);
  SD ~**23.7 GB/day**; thermal pipeline steady 2.0 fps, read 164 ms mean /
  182.5 ms p95; collector itself 0.3 % CPU mean; **0 journal error entries**
  across all 7 units; eth/wlan/services 100 % up.
- Gaps: none detected (>3×median sample gaps).

### 6. Bench baseline (capability register — compare future runs to this)

Real run 2026-11-05 12:23–12:29 (Pi 4B Rev 1.2, 4 workers = all cores,
ambient ≈36 °C, `bench_20261105-042928.json`, 361 samples):

| Metric | Value |
|---|---|
| Baseline temp mean (30 s) | **66.22 °C** (freq mean 1476.7 MHz — idle downclock) |
| Load temp mean / max (300 s) | **77.05 / 80.34 °C** |
| Freq mean under load | **1498.0 MHz** (no downclock) |
| Throttle events / ever-hex | **0 / 0x0** |
| Cooldown to baseline+5 °C | **30 s** (end 70.6 °C) |
| Abort | no (82 °C guard never hit) |

Interpretation: full 4-core saturation at this ambient runs ~11 °C above idle,
peaks just under 80 °C, and holds full clock — the thermal envelope has
headroom for the 24 h workload, and any future run that throttles where this
one did not is a regression signal.

### 7. CANON deltas for T0 (§12-style)

> **Folded into `CANON.md` on 2026-11-05 — §2.8 (new) + §3 soak row + §4 deploy
> row (T7-4 ✅).**

1. **New persistent Pi service `pigpulse-soak`** — `User=pigpulse`,
   `Restart=always`, `Nice=10`, `CPUWeight=50`, `MemoryMax=192M`; runs
   `soak_collect.py --db /home/pigpulse/soak/soak.db --interval 10`.
2. **Canonical paths:** tools in `v3-mqtt-pocketbase/backend/scripts/soak_*.py`;
   contract `v3-mqtt-pocketbase/docs/SOAK_CONTRACT.md`; Pi copies under
   `/home/pigpulse/scripts/soak/`; data/artifacts `/home/pigpulse/soak/`.
3. **Read-only rule:** the collector never opens TCP `:9090` (single-client ESP
   stream) — it reads `/esp/status` only.
4. Soak DB is a **diagnostic side-channel** — never a data path for the app.

### 8. Open items

| # | Item | Owner |
|---|---|---|
| T7-3 | 24 h run → pull snapshot → report → findings (curve, disconnects, rates) | elephant + Master |
| T7-5 | R8 archive after the run (DB snapshot + report dir, timestamped) | T0 |
| — | `cr` (CodeRabbit) layer skipped for this release: CLI installed but **not signed in** (no auth for root or solrahk; no API key in any key file). Run `cr auth login` once, then `cr review --uncommitted --include-untracked --dir v3-mqtt-pocketbase/backend/scripts`. Critic loop + selftests + real runs carried the review load. | Master (auth) then reviewer |
| — | `~/.config/pigpulse/sync.env` still unset → `PB new` deltas grow locally; cloud sync of the soak window not live yet (unrelated to this track) | Master |

### 9. Ops quick reference

```bash
# Live view (laptop, read-only)
python3 v3-mqtt-pocketbase/backend/scripts/soak_live.py --host pigpulse@192.168.69.1

# Report from a snapshot — WAL-SAFE (snapshot ON the Pi first; a plain scp of
# soak.db misses un-checkpointed commits; full form in SESSION_ROLLOUT_20261105.md §6)
ssh pigpulse@192.168.69.1 python3 - <<'PY'
import sqlite3
src = sqlite3.connect('/home/pigpulse/soak/soak.db')
dst = sqlite3.connect('/home/pigpulse/soak/soak_snapshot.db')
src.backup(dst); dst.close(); src.close()
PY
scp pigpulse@192.168.69.1:/home/pigpulse/soak/soak_snapshot.db /tmp/opencode/soak_snapshot.db
ssh pigpulse@192.168.69.1 'rm -f /home/pigpulse/soak/soak_snapshot.db'
python3 v3-mqtt-pocketbase/backend/scripts/soak_report.py --db /tmp/opencode/soak_snapshot.db --out ~/soak_report/

# Bench on the Pi (abort guard 82 °C)
ssh pigpulse@192.168.69.1 'python3 /home/pigpulse/scripts/soak/soak_bench.py --seconds 300 --abort-temp 82'

# Pi day-to-day
systemctl status pigpulse-soak   # is it alive
journalctl -u pigpulse-soak -n 20  # what it says
du -h /home/pigpulse/soak        # DB growth
```
