# SOAK_CONTRACT.md — Pi 4B edge soak monitoring (T7)

> **Status:** ACTIVE — 2026-11-05. Elephant/Goldfish release: `docs/SESSION_ROLLOUT_20261105.md`.
>
> This file is the contract between four tools. The collector is written by the
> elephant and is the only writer on the Pi. **Report / live / bench are written
> by separate workers against THIS document.** The collector's source
> (`backend/scripts/soak_collect.py`) is ground truth for exact SQLite column
> names; if this document and the source ever disagree, the source wins and the
> contract gets a fix.

## 1. Purpose & shape

One continuous, machine-parseable record of a ~24 h hardware soak of the Pi
edge rig, so that after the run the following are reconstructible with numbers,
not anecdotes:

1. **Temperature timeline** — CPU die temp rise-to-X, thermal headroom, ambient correlation.
2. **Throttling** — under-voltage / frequency capping / soft-limit events, first/last occurrence.
3. **Disconnects** — thermal pipeline, ESP32-S3 mic, network links, systemd services, sample gaps.
4. **Rates** — PocketBase write rate, SD write rate, frame/processing rates.
5. **Capability baseline** — a controlled CPU load bench (on demand) for long-term comparison.

```
Pi 192.168.69.1 (works standalone + wired)        Laptop (solrahk)
┌─────────────────────────────────────┐           ┌──────────────────────────────┐
│ pigpulse-soak.service               │   ssh     │ soak_report.py → PNG+MD+HTML │
│   soak_collect.py → soak.db (sqlite)│◄─────────►│ soak_live.py   → live view   │
│   soak_bench.py (on demand)         │  stream   └──────────────────────────────┘
└─────────────────────────────────────┘           bench runs ON the Pi itself
```

- The collector is **autonomous**: it keeps recording with the Wi-Fi link, the
  laptop, or the thermal pipeline down. Nothing else must run for a complete
  dataset to exist on the Pi.
- DB size ≈ 1–2 MB/day. No rotation; retention unlimited by default
  (`--retention-days N` optional).
- All DB writers set `PRAGMA busy_timeout=5000`; the collector sets
  `journal_mode=WAL` once at init (bench joins the same DB for two event rows).

## 2. Files (canonical paths)

| Role | On | Path |
|---|---|---|
| Collector | Pi | `/home/pigpulse/scripts/soak/soak_collect.py` — repo `backend/scripts/soak_collect.py` |
| Bench | Pi | `/home/pigpulse/scripts/soak/soak_bench.py` — repo `backend/scripts/soak_bench.py` |
| Report | laptop | repo `backend/scripts/soak_report.py` |
| Live | laptop | repo `backend/scripts/soak_live.py` |
| DB | Pi | `/home/pigpulse/soak/soak.db` |
| Bench JSON | Pi | `/home/pigpulse/soak/bench_<UTCstamp>.json` |
| Unit | Pi | `/etc/systemd/system/pigpulse-soak.service` — repo `backend/systemd/pigpulse-soak.service` |

Tools are single files, python3 stdlib only on the Pi side. Laptop tools may
use `matplotlib`+`numpy` (report) and `rich` (live) with a graceful fallback.

## 3. SQLite schema (authoritative DDL)

The collector creates these idempotently at startup.

```sql
CREATE TABLE IF NOT EXISTS samples (
  ts REAL PRIMARY KEY,            -- epoch seconds (float)
  boot_id TEXT,                   -- /proc/sys/kernel/random/boot_id
  -- SoC / CPU
  cpu_temp_c REAL,                -- /sys/class/thermal/thermal_zone0/temp / 1000
  cpu_freq_mhz REAL,              -- cpu0 cpufreq/scaling_cur_freq / 1000
  throttle_hex TEXT,              -- vcgencmd get_throttled raw ("0x0")
  uv_now INTEGER, freqcap_now INTEGER, thr_now INTEGER, softlim_now INTEGER,
  uv_ever INTEGER, freqcap_ever INTEGER, thr_ever INTEGER, softlim_ever INTEGER,
  cpu_pct REAL,                   -- busy% over the previous interval (formula §12)
  load1 REAL, load5 REAL, load15 REAL,
  mem_used_mb REAL, mem_total_mb REAL, swap_used_mb REAL,
  disk_free_mb REAL,
  sd_wr_mb_delta REAL,            -- MB written to mmcblk0 during this sample period
  sd_wr_mb_total REAL,            -- MB written since boot (cumulative)
  -- network
  eth_oper TEXT, wlan_oper TEXT,  -- operstate of eth1 / wlan0 ("up"/"down"/"unknown")
  wifi_clients INTEGER,           -- associated stations on wlan0 AP; NULL if unknown
  -- thermal endpoint (/data)
  th_ok INTEGER, th_frame INTEGER, th_fps REAL, th_read_ms INTEGER,
  th_center REAL, th_ambient REAL, th_alerts INTEGER, th_verdict TEXT,
  th_animals INTEGER, th_drift REAL,
  -- ambient endpoint (/ambient)
  amb_state TEXT, amb_temp_c REAL, amb_rh REAL, amb_thi REAL, amb_age_s REAL,
  -- ESP32-S3 mic endpoint (/esp/status)
  esp_conn INTEGER, esp_stale INTEGER, esp_last_ms INTEGER, esp_bytes INTEGER,
  esp_chunks INTEGER, esp_accepted INTEGER, esp_nonzero_pct REAL, esp_uptime_s INTEGER,
  -- PocketBase write path (read-only sqlite on pb_data/data.db)
  pb_max_rowid INTEGER, pb_new_total INTEGER, pb_new_json TEXT,
  -- collector self
  own_cpu_pct REAL, own_rss_mb REAL,
  -- services + journal
  svc TEXT,                       -- "mosquitto=active,pigpulse-bridge=active,..." (§5.4)
  j_err_total INTEGER             -- cumulative error-priority journal entries (NULL until first scan)
);

CREATE TABLE IF NOT EXISTS events (
  ts REAL NOT NULL,               -- epoch seconds
  type TEXT NOT NULL,             -- see §5.5
  detail TEXT                     -- human-readable or JSON (bench markers are JSON)
);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);

CREATE TABLE IF NOT EXISTS journal (   -- one row per unit per scan window (60 s)
  ts REAL NOT NULL,               -- scan time (window END, epoch seconds)
  unit TEXT NOT NULL,             -- e.g. "pigpulse-thermal" (suffix ".service" stripped)
  count INTEGER NOT NULL,         -- entries in this window
  err INTEGER NOT NULL,           -- entries with PRIORITY <= 3 (err and worse)
  last TEXT                       -- last MESSAGE in window, truncated to 300 chars
);
CREATE INDEX IF NOT EXISTS idx_journal_unit_ts ON journal(unit, ts);

CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
-- keys used: schema_version ("1"), last_boot_id
```

Missing value convention: **NULL** means "could not read" — never a fabricated 0.
`0` is a real zero (e.g. `wifi_clients=0`, `esp_conn=0`).

## 4. Data sources — exact key maps

All endpoints live on the Pi at `127.0.0.1:8080`, **TLS with a self-signed cert**
(verified 2026-11-05: `https` works with verification disabled; `http` may or may
not answer, so the collector tries `https` first with an unverified SSL context,
falls back to `http`, and caches the winning scheme).

### 4.1 `GET /data` (web_server.py)

Success (HTTP 200, JSON object; live example captured 2026-11-05):

```json
{"min":30.8,"max":56.26,"avg":44.42,"center":56.26,"center4":55.14,"hotspot":56.14,
 "maxX":14,"maxY":12,"minX":17,"minY":22,"hotspotX":14,"hotspotY":12,
 "ambient":48.68,"status":"HYPERTHERMIA","alerts":3,"verdict":"HYPERTHERMIA",
 "center_compensated":56.26,"pixels":[/*768 floats — IGNORED, never stored*/],
 "ambientSrc":"sht45","radiometry":{"animalCount":2,"driftBiasC":0.31, "...": "..."},
 "frame":123456,"readMs":94,"ts":1793848485000,"fps":9.9,"ok":true}
```

Failure (HTTP 200): `{"ok": false, "error": "Remote I/O error ..."}`.

Collector reads exactly: `ok`, `frame`, `fps`, `readMs`, `center`, `ambient`,
`alerts`, `verdict`, `radiometry.animalCount`, `radiometry.driftBiasC`.
Map: `th_ok=int(ok is True)`, `th_frame`, `th_fps`, `th_read_ms`, `th_center`,
`th_ambient`, `th_alerts`, `th_verdict`, `th_animals`, `th_drift`.
On `ok:false`: `th_ok=0`, all other `th_*` NULL, event on transition (§5.5).

### 4.2 `GET /esp/status` (esp_audio_ingest.status())

```json
{"connected":true,"socket":true,"stale":false,"peer":"192.168.69.15:57928",
 "bindError":null,"port":9090,"rate":48000,"channels":2,"format":"s16le",
 "sourceFormat":"s16le","bytes":83650560,"chunks":77609,"lastMs":3,
 "nonzeroPct":99.9,"signal":true,"accepted":1,"uptimeS":442}
```

Collector reads: `connected`, `stale`, `lastMs`, `bytes`, `chunks`, `accepted`,
`nonzeroPct`, `uptimeS` → `esp_*` columns (booleans as 0/1; missing → NULL).

### 4.3 `GET /ambient` (ambient_ingest.snapshot())

```json
{"state":"stale","ok":true,"device":"s3-mic-01","micOnline":true,
 "temperature":36.0,"humidity":59.17,"thi":88.1,"thiClass":"severe",
 "ageS":0.9,"ambientAgeS":15.9,"lastAmbientWall":1793848485.5,
 "msgCount":440,"ambientCount":185,"mqttConnected":true,
 "mqttBroker":"127.0.0.1:1883","error":""}
```

Collector reads: `state`, `temperature`, `humidity`, `thi`, `ageS` →
`amb_state`, `amb_temp_c`, `amb_rh`, `amb_thi`, `amb_age_s`.
`state` values seen in source: `live`, `stale`, `mqtt-offline`, `no-data`,
`esp-offline`, `sht-missing`.

### 4.4 Local sources (never subprocess where a file read works)

| Value | Source |
|---|---|
| cpu_temp_c | `/sys/class/thermal/thermal_zone0/temp` (millidegrees) |
| cpu_freq_mhz | `/sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq` (kHz) |
| throttle_hex + bits | `subprocess`: `/usr/bin/vcgencmd get_throttled` → `throttled=0x0` |
| cpu_pct, load | `/proc/stat` (first `cpu` line), `/proc/loadavg` |
| mem/swap | `/proc/meminfo` (MemTotal, MemAvailable, SwapTotal, SwapFree) |
| disk_free_mb | `os.statvfs("/")` — `f_bavail * f_frsize / 1e6` |
| sd_wr_* | `/proc/diskstats` line ` mmcblk0 ` — **sectors written = awk field 10** (Python `split()[9]`, 512 B/sector) |
| eth_oper/wlan_oper | `/sys/class/net/eth1/operstate`, `/sys/class/net/wlan0/operstate` |
| wifi_clients | `subprocess`: `/usr/sbin/iw dev wlan0 station dump` → count lines containing `Station`. **`iw` is NOT in PATH; use the full path.** Count 0 is valid; any error → NULL |
| own_cpu_pct/own_rss_mb | `/proc/self/stat` (utime+stime, fields 14/15) + `/proc/self/status` `VmRSS` |
| pb_* | read-only sqlite: `file:/home/pigpulse/pocketbase/pb_data/data.db?mode=ro` (§4.5) |
| svc | `subprocess`: `systemctl is-active <7 units>` — one call, one line per unit (§5.4) |
| journal | `journalctl` scan every 60 s (§5.6) |
| boot_id | `/proc/sys/kernel/random/boot_id` |

**Throttle bit map** (Raspberry Pi firmware, verified against `vcgencmd get_throttled` docs):

| Bit | Mask | Meaning |
|---|---|---|
| 0 | 0x1 | under-voltage **detected now** |
| 1 | 0x2 | ARM frequency capped **now** |
| 2 | 0x4 | currently throttled **now** |
| 3 | 0x8 | soft temperature limit active **now** |
| 16 | 0x10000 | under-voltage **has occurred** |
| 17 | 0x20000 | ARM frequency capping **has occurred** |
| 18 | 0x40000 | throttling **has occurred** |
| 19 | 0x80000 | soft temperature limit **has occurred** |

Columns: `uv_now, freqcap_now, thr_now, softlim_now, uv_ever, freqcap_ever,
thr_ever, softlim_ever` (0/1 each), plus raw `throttle_hex`.

### 4.5 PocketBase write-path probe

The bridge writes telemetry rows into PocketBase's SQLite. The collector reads
`MAX(rowid)` every cycle and the per-device delta since the previous cycle:

```sql
SELECT MAX(rowid) FROM telemetry;
SELECT deviceId, COUNT(*) FROM telemetry WHERE rowid > ? GROUP BY deviceId;
```

- First cycle: baseline only → `pb_max_rowid` set, `pb_new_total=0`, `pb_new_json='{}'`.
- Every later cycle: `pb_new_total = sum(counts)`, `pb_new_json = '{"s3-mic-01": 10, "pi-thermal-01": 1}'`.
- If the table is missing or DB locked → all three NULL (never crash the cycle).
- This DB is **read-only** for the collector; the bridge/PocketBase own writes.

## 5. Collector spec — `soak_collect.py` (elephant-owned, deployed)

### 5.1 CLI

```
soak_collect.py
  --db PATH              default /home/pigpulse/soak/soak.db
  --interval SECONDS     default 10
  --thermal-url HOST:PORT  default 127.0.0.1:8080 (scheme auto: https then http)
  --stream               sample every interval, print JSONL to stdout; NO DB writes
  --stream-file PATH     like --stream, append to file ('-' = stdout; file mode 'a', flushed)
  --once                 take exactly one sample, print JSON line, exit 0
  --disk-low-mb N        default 3000; disk_low/disk_ok crossing events
  --retention-days N     default 0 = keep forever; else prune samples/events/journal older than N days each cycle
  --selftest             temp-db functional test (§10), exit 0/1
  --verbose              one status line per cycle to stderr
```

Exit codes: 0 ok / selftest pass; 1 unusable args or fatal init; 2 selftest fail.

### 5.2 Cadence & resilience

- Sample immediately at start, then drift-corrected sleep (target `interval`
  measured from sample start).
- **Every source read is individually wrapped**: any exception → that field
  group is NULL for that sample; the cycle and the run continue. The collector
  must survive: TLS hiccups, thermal pipeline dead, ESP offline, PB locked,
  journald reconfigure, clock jumps.
- `sample_miss` event when the interval between successive samples exceeds
  `2.5 × interval` (suspend, clock jump, SIGSTOP).
- SIGTERM/SIGINT → insert `collector_stop` event, commit, exit 0 (systemd
  restarts it: `Restart=always`).
- Memory must stay bounded (long runs): no unbounded in-process lists.
- Self-monitoring: `own_cpu_pct`, `own_rss_mb` per sample.

### 5.3 Startup sequence

1. Open/create DB (§3 DDL), `PRAGMA journal_mode=WAL`, `busy_timeout=5000`, meta.
2. Reboot detect: if `meta.last_boot_id` differs from current boot_id → insert
   `reboot` event (`detail: "<old> -> <new>"`), update meta.
3. Insert `collector_start` event.
4. Loop (§5.2).

### 5.4 Service string — exact 7 units, this order

```
mosquitto pigpulse-bridge pigpulse-pocketbase pigpulse-cctv
pigpulse-rtsp-recorder pigpulse-thermal pigpulse-soak
```

One `systemctl is-active` call → one line per unit → `svc =
"mosquitto=active,pigpulse-bridge=active,..."`. Any change between cycles →
`svc_change` event, detail lists only changed units: `"pigpulse-bridge: active->failed"`.

### 5.5 Event types (inserted at the sample's ts)

| type | detail (exact format) | fired when |
|---|---|---|
| `collector_start` | `"schema=1 interval=10 db=/home/pigpulse/soak/soak.db"` | startup, after reboot check |
| `collector_stop` | `"signal SIGTERM"` | signal handler |
| `reboot` | `"<old boot_id> -> <new boot_id>"` | boot_id changed since last run |
| `sample_miss` | `"gap 37.4s (expected 10s)"` | gap > 2.5×interval |
| `svc_change` | `"pigpulse-bridge: active->failed"` (comma-join if several) | svc string changed |
| `throttle_change` | `"0x0->0x50000"` | throttle_hex changed |
| `esp_change` | `"connected 1->0 stale 0->1 (lastMs=2300)"` — fires on any `(connected, stale)` pair change; `?` where the previous value is unknown | esp connected/stale changed (NULL-safe) |
| `th_ok_change` | `"1->0: Remote I/O error"` | thermal ok changed (`/data` error text appended when 0) |
| `amb_state_change` | `"live->stale"` | amb state changed |
| `link_change` | `"eth1 up->down"` (comma-join if both) | eth1/wlan0 operstate changed |
| `disk_low` | `"free 2841 MB < 3000 MB"` | free crossed below threshold |
| `disk_ok` | `"free 4210 MB"` | free recovered above threshold |
| `collector_error` | `"<source>: <error>"` | internal source exception, rate-limited to 1/60 s per source |
| `bench_start` | JSON (see §9) | written by soak_bench.py |
| `bench_end` | JSON (see §9) | written by soak_bench.py |

### 5.6 Journal scan — every 60 s (first scan at startup+60 s)

```
/usr/bin/journalctl --no-pager -o json --output-fields=MESSAGE,PRIORITY,_SYSTEMD_UNIT \
  --since "@<previous_scan_ts>" -u mosquitto -u pigpulse-bridge -u pigpulse-pocketbase \
  -u pigpulse-cctv -u pigpulse-rtsp-recorder -u pigpulse-thermal -u pigpulse-soak
```

- **JSON output deliberately** — journald's short format collapses repeats into
  `(repeated Nx)` markers; JSON mode emits every entry, so counts are exact
  without dedup heuristics.
- Parse line-by-line (bounded memory). `PRIORITY` arrives as a string; missing
  → 6. `MESSAGE` may be a list of byte values when non-UTF-8 → stringify safely.
- `_SYSTEMD_UNIT` like `pigpulse-thermal.service` → strip `.service`.
- Per unit per window: `count`, `err` (PRIORITY ≤ 3), `last` (last message,
  truncate 300 chars) → one `journal` row per unit, even when count=0.
- `j_err_total` (cumulative across scans) goes into each sample row; NULL
  before the first ever scan.
- Scan timeout 15 s; failure must not kill the cycle (skip; count as
  `collector_error`).

### 5.7 Stream mode (`--stream` / `--stream-file`)

- Same sampling path, **no DB access at all** (safe to run beside the service;
  no write conflicts). 
- Per cycle: one line `{"type":"sample", ...}` where `...` uses **exactly the
  §3 column names** as keys; every transition event also emits one line
  `{"type":"event","event_type":"esp_change","detail":"connected 1->0 stale 0->1 (lastMs=2300)"}`
  immediately after the sample line.
- One JSON object per line, LF-terminated, flushed every cycle. Non-finite
  floats must be emitted as `null` (never `NaN`/`Infinity`).

## 6. Report spec — `soak_report.py` (laptop)

```
soak_report.py --db PATH [--since T] [--until T] [--out DIR] [--selftest]
```

- `--since/--until`: epoch seconds or `"YYYY-MM-DD HH:MM[:SS]"` (local time).
  Default: whole DB.
- `--out DIR`: default `./soak_report_<UTCstamp>/`.
- Reads SQLite read-only. matplotlib Agg backend only, **no pandas** (laptop has
  matplotlib 3.6.3 + numpy 1.26.4, NOT pandas). No network, no SSH.

Outputs (fixed names):

| File | Content |
|---|---|
| `01_temperature.png` | cpu_temp_c over wall time (+ amb_temp_c, th_ambient); 75/80/82 °C guide lines; throttle_change events as red markers; bench_start/end vertical lines |
| `02_rates.png` | subplots: PB rows/min (pb_new_total per interval), SD MB/min (sd_wr_mb_delta), frames/min (th_frame deltas), fps |
| `03_availability.png` | one horizontal band per signal (thermal ok, esp_conn, eth, wlan, all-services-active, ambient live|stale) — green up / red down / gray unknown, shared time axis |
| `04_processing.png` | fps, th_read_ms, own_cpu_pct, load1 |
| `05_journal.png` | journal errors/min per unit (from `journal` table windows) + total line |
| `summary.md` | computed stats (§6.1) with formulas shown |
| `report.html` | self-contained: inline CSS, PNGs embedded as base64 data URIs, **no external references** |

### 6.1 Required summary sections & formulas

- **Headline**: max CPU temp + timestamp; throttle events count; % thermal ok;
  % ESP connected; PB rows written; mean PB rows/min; MB written to SD; journal errors total.
- **Temperature**: cpu mean/min/max; minutes ≥75 / ≥80 / ≥82 °C. **Two ambient
  series, reported separately:** standalone ambient sensor (`amb_temp_c`,
  SHT45) and the thermal camera's own reported ambient (`th_ambient`) are
  different sensors — never merged into one number.
- **Availability**: per signal: % up (`100 × Σ dt_up / Σ dt_all`, dt from
  consecutive sample gaps, capped at 3× median interval), outage count
  (up→down transitions), longest outage (minutes, **raw uncapped dt**), and
  **% unknown** (NULL/unknown samples count toward Σ dt_all but never as up
  or down).
- **Rates**: PB rows/min overall and per device (sum `pb_new_json`); SD GB/day
  (`Σ sd_wr_mb_delta / hours × 24 / 1000`); frames/min (`(frame_last −
  frame_first) / minutes`); fps mean/min; read_ms mean/p95.
- **Processing**: own_cpu mean/max; load1 mean/max.
- **Journal**: per unit: total count, err count, err/min.
- **Events**: chronological table (local time, type, detail).
- **Gaps**: every sample gap > 2.5× median interval, with duration.

`summary.md` must contain the exact substrings: `Max CPU temp`, `Availability`,
`Rates`, `Journal`, `Events` (used by the selftest).

### 6.2 Report selftest

`--selftest` builds a **synthetic 3 h DB** (10 s cadence: temp ramp 55→81 with
dip, one `0x0→0x50000` throttle event, an ESP disconnect window, a service
`failed` window, frames/PB counters growing, journal err rows, bench markers),
runs the full pipeline into a temp dir and asserts: all five PNGs exist and are
>10 KB, `summary.md` contains the §6.1 substrings, `report.html` contains
`data:image/png;base64`, exit 0. Print PASS/FAIL; exit 2 on fail.

## 7. Live spec — `soak_live.py` (laptop)

```
soak_live.py --host HOST [--interval 2] [--count N]
             [--stream-file PATH] [--no-tty] [--selftest] [--db PATH]
```

- `--host`: runs over SSH — command executed remotely:
  `python3 /home/pigpulse/scripts/soak/soak_collect.py --stream --interval <N>`
  (batched mode: `-o BatchMode=yes -o ConnectTimeout=8`). Read the JSONL from its stdout.
- `--stream-file PATH`: tail-follow a local JSONL file instead of SSH (testing /
  offline replay).
- `--count N`: exit after N samples (0 = forever). Default 0.
- `--no-tty` or non-TTY stdout: plain text fallback, one status line per sample
  (no ANSI).
- Display (rich 13.x if importable, else fallback): table with cpu temp (color
  bands <70 green / 70–79 yellow / ≥80 bold red) + freq, throttle hex (flag when
  ≠ 0x0), load1 + own cpu%, mem/swap/disk, thermal ok/fps/readMs/verdict, ESP
  conn/stale/lastMs/nonzero%, ambient state/temp/rh/thi, PB rows/min (delta of
  pb_new_total), wifi clients, eth/wlan; CPU-temp sparkline (last 120 samples,
  unicode blocks); event ticker (last 8 events).
- Bad line / truncated JSONL must be skipped, not fatal. SSH exit → clear
  message, exit 1 (unless `--count` reached → exit 0).
- `--selftest`: feed ~20 synthetic stream lines (samples + events) through the
  parser + one render pass into a StringIO; assert no exception, keys present;
  PASS/exit 0. No network.

## 8. Bench spec — `soak_bench.py` (runs ON the Pi)

```
soak_bench.py --seconds 300 --abort-temp 82 [--workers N] [--cooldown-max 180]
              [--out DIR] [--db PATH] [--dry-run] [--selftest]
```

- Purpose: controlled CPU thermal load (baseline → load → cooldown) so future
  runs can be compared ("is the Pi slower/hotter than in Nov 2026?").
- Workers: `multiprocessing` busy-loop processes (pure stdlib — **no stress-ng
  on the Pi**), default `--workers = nproc` (4). No taskset pinning by default.
- Sampling: **1 sample/s** throughout, all phases: `t` (s from start), `phase`
  (`baseline`/`load`/`cooldown`), `temp` (°C), `freq_mhz`, `throttled` ("0x0",
  or **null** when `vcgencmd` is unreadable — never a fabricated "0x0"),
  `load1`.
- Phases: **baseline** 30 s idle; **load** until `--seconds` (default 300) or
  abort; **cooldown** until temp ≤ baseline_mean+5 °C or `--cooldown-max`
  (default 180) s.
- Abort: temp ≥ `--abort-temp` (default 82.0) → kill workers immediately,
  `abort: true`, `abort_reason: "temp"`. Exit code 2 on abort.
- Exit codes: **0 = ok; 1 = setup/lock failure (no data written); 2 = safety
  abort (JSON + DB events still written); 3 = invalid arguments** (`--workers
  < 1`, `--seconds < 1`, `--cooldown-max < 0`, `--abort-temp` outside
  40–95 °C).
- Output JSON — `/home/pigpulse/soak/bench_<YYYYmmdd-HHMMSS>.json` (UTC stamp):

```json
{"type":"bench","host":"raspberrypi","nproc":4,"model":"Raspberry Pi 4 Model B Rev 1.2",
 "started":"2026-11-05T12:00:00Z","ended":"2026-11-05T12:08:02Z",
 "args":{"seconds":300,"workers":4,"abort_temp":82.0,"cooldown_max":180,"dry_run":false},
 "baseline":{"temp_mean":55.1,"freq_mean":1500.0,"samples":30},
 "result":{"max_temp":78.3,"load_temp_mean":74.2,"load_temp_max":78.3,
           "freq_mean_load_mhz":1450.0,"cooldown_seconds":62,"end_temp":58.9,
           "throttle_events":0,"throttle_ever_hex":"0x0","throttle_reads_ok":300,
           "abort":false,"abort_reason":null},
 "db_events":true,
 "samples":[{"t":0.03,"phase":"baseline","temp":55.0,"freq_mhz":1500.0,"throttled":"0x0","load1":0.2}, "..."]}
```

- **Throttle honesty:** `throttle_events` counts changes between valid reads;
  `throttle_reads_ok` counts reads that succeeded; `throttle_ever_hex` is the
  OR of those reads — **null** when there were no valid reads (never a
  fabricated `"0x0"`).
- DB events (best effort; if `--db` missing → warn, `"db_events": false`, continue):
  `bench_start` at overall start, `bench_end` at exit. `detail` = compact JSON:
  `{"seconds":300,"workers":4,"abort_temp":82.0,"dry_run":false}` /
  `{"max_temp":78.3,"abort":false,"reason":null,"file":"bench_....json"}`.
  Insert with `busy_timeout=5000`.
- `--dry-run`: baseline 2 s, load 5 s with 2 workers, cooldown max 3 s;
  `"dry_run": true` in JSON. Still real (small) load — validates mechanics.
- Lock: `O_EXCL` pidfile `/home/pigpulse/soak/bench.lock`; stale (dead pid or
  empty file) is replaced; a live lock → exit 1 with message. An **unusable
  lock path** (`OSError` on create) prints a warning and also exits 1 — same
  rc, no traceback.
- Progress: one line to stderr every 10 s (temp/freq/phase) — visible when run
  in foreground; harmless under nohup.
- `--selftest`: temp dir + temp db; baseline 2 s / load 2 s (1 worker) /
  cooldown max 2 s; assert JSON exists, parses, `samples` ≥ 5, db has
  `bench_start`+`bench_end`, and the throttle XOR holds (`throttle_reads_ok
  == 0` ⇒ `throttle_ever_hex` is null; `> 0` ⇒ parseable hex); PASS/exit 0,
  FAIL/exit 2. (~8 s total.)

## 9. Deployment facts (measured 2026-11-05 — the ground truth workers can rely on)

- SSH: `ssh pigpulse@192.168.69.1` — key-based, passwordless. `sudo` on the Pi
  works **both** passwordless and with password. From the agent shell (root),
  the working key is `/root/.ssh/id_ed25519`.
- Pi python: 3.13.5 at `/usr/bin/python3`. **stdlib only** available. No
  `sqlite3` CLI, no `stress-ng`, no `curl` needed by tools.
- `pigpulse` user is in `adm` — journalctl read of all units verified working.
- Units live: mosquitto, pigpulse-bridge, pigpulse-cctv, pigpulse-pocketbase,
  pigpulse-rtsp-recorder, pigpulse-thermal, pigpulse-soak (all `active`;
  `pigpulse-soak` added 2026-11-05).
- PB DB: `/home/pigpulse/pocketbase/pb_data/data.db` (mode read-only works as
  pigpulse). `telemetry` rowid max 134464; deviceIds seen: `pi-thermal-01`,
  `s3-mic-01`.
- `/home/pigpulse/scripts/soak/` — deployed tools (`soak_collect.py`,
  `soak_bench.py`). `/home/pigpulse/soak/` — live DB `soak.db` (WAL),
  `bench_<UTCstamp>.json` results, `bench.lock` while a bench runs.
- **WAL-safe pull:** never plain-`scp` a live `soak.db` — WAL keeps recent
  commits in `soak.db-wal` until checkpoint, so a naive copy can miss them.
  Snapshot via the SQLite backup API on the Pi, then `scp` the snapshot
  (command in `docs/SESSION_ROLLOUT_20261105.md` §6).
- `iw` at `/usr/sbin/iw` (NOT in PATH); `vcgencmd` at `/usr/bin/vcgencmd`;
  `taskset`, `timeout`, `nice` under `/usr/bin`.
- `nproc` = 4; `/proc/cpuinfo` Model: "Raspberry Pi 4 Model B Rev 1.2"
  (no x86-style `model name` line).
- `/proc/diskstats` mmcblk0 example (sectors written = awk $10):
  `179 0 mmcblk0 18412 12384 1690804 161397 72947 12622 5013652 7034138 0 451208 7195536 ...`
- Laptop: python3 3.12.3, matplotlib 3.6.3, numpy 1.26.4, rich 13.7.1
  (**no pandas**). `ssh` to the Pi works. Report/live run here, from the repo
  directory: `python3 backend/scripts/soak_report.py --db <pulled copy> --out ~/soak_report/`.

## 10. Conventions & formulas

- Times stored as **epoch seconds (float)**. Plot in local time; filename
  stamps in UTC.
- `cpu_pct = 100 × (Δtotal − Δidle − Δiowait) / Δtotal` from `/proc/stat`
  first line, total = sum of first 8 fields (user…steal; guest fields excluded
  to avoid double counting).
- `sd_wr_mb_delta = (sectors_now − sectors_prev) × 512 / 1e6` (MB decimal);
  NULL if counter decreased. `sd_wr_mb_total = sectors × 512 / 1e6`.
- `own_cpu_pct = 100 × (Δutime + Δstime) / HZ / Δwall` with
  `HZ = os.sysconf("SC_CLK_TCK")` (100 on the Pi).
- `mem_used_mb = (MemTotal − MemAvailable)/1024`; `swap_used_mb =
  (SwapTotal − SwapFree)/1024` (kB → MiB).
- `disk_free_mb = f_bavail × f_frsize / 1e6`.
- Availability uses dt-weighted samples capped at 3× interval so a long gap
  cannot fake 100 % uptime on either side.
- Wi-Fi clients and ESP counters are **cumulative** — rates are computed from
  deltas and must handle counter resets (service restart) as NULL, not negative.

## 11. Out of scope (deliberate)

- MQTT broker `$SYS` metrics — not sampled; the PB write path (`pb_*`) is the
  end-to-end write-rate proxy.
- The ESP TCP `:9090` stream is **never opened** — it is single-client and owned
  by `web_server` (pigpulse-thermal). ESP state comes from `/esp/status` only.
- `pixels` (768-float frame) is ignored — heatmap data is not a soak metric.
- No Pi-side dependencies beyond stdlib; no repo dependencies added.

## 12. Integration rules for workers (Elephant/Goldfish)

- Write **only your own file** (`backend/scripts/soak_report.py` /
  `soak_live.py` / `soak_bench.py`) plus its selftest inside the same file.
- Your `--selftest` must pass on the target machine (report/live: laptop;
  bench: Pi) — run it for real and paste the output in your final message.
- Do not modify the collector, the unit, or this contract. If a needed field is
  missing, say so in your final message; the elephant decides.
- Python 3.9+ compatible syntax (tools run on 3.12/3.13; keep it clean).
- No secrets, no network calls except the documented SSH/stream path.
