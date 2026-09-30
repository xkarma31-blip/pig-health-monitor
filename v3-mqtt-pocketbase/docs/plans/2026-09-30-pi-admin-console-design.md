# Pi Technician / Admin Console — Design

Date: 2026-09-30
Status: APPROVED (Option A: single codebase, laptop-previewable)
Branch: `feat/v3-mqtt-pocketbase`
Target base commit: `a27c9cb`

---

## 1. Problem

The Pi edge stack (`v3-mqtt-pocketbase/backend/`) is a set of Python services, shell
scripts and systemd units with **no way to inspect them as a system**. Diagnosing
"is the pipeline healthy?" today means SSH plus manual `journalctl`/`sqlite3`
incantations, and the only existing surfaces are:

- `web_server.py` — thermal dashboard + ESP audio + CCTV proxy (read path only)
- PocketBase `/_/` — the **cloud/laptop** admin UI, loopback-only behind OpenResty

There is no Pi-side console. The user asked for a multi-view debug surface that
shows real state, the full source of the designated systems, detected errors, and
recommended fixes — and wants it viewable on the laptop **before** it is deployed
to hardware.

### Explicitly rejected alternative

A standalone `devtools/console_dev.py` that previews a mock. Rejected: it is a
second implementation that immediately drifts from production, and the user
already pushed back on mocked data. **One codebase, two sources of truth.**

---

## 2. Grounding: what was measured, and what was not

All claims below come from readouts taken on this machine on 2026-09-30. Hardware
is **unplugged**.

### 2.1 Real defects (tool-verified)

| # | Defect | Evidence | Severity |
|---|--------|----------|----------|
| D1 | 7 telemetry fields published but absent from card PocketBase → silently dropped | `thermal_publish.py:218-234` vs `PRAGMA table_info(telemetry)` on card DB | **HIGH** |
| D2 | 2 alert fields published but absent from card schema → silently dropped | `thermal_publish.py:196-209` vs `PRAGMA table_info(alerts)` | **HIGH** |
| D3 | `pigpulse-cloud-sync.service` deployed to the **Pi** with a laptop-only `ExecStart` (`%h/pig-health-monitor/...`) | `ls /media/solrahk/rootfs/etc/systemd/system/` | **HIGH** |
| D4 | `pigpulse-pocketbase.service` binds `--http=192.168.69.1:8090`; PB cannot bind until the AP IP exists, and is unreachable in any STA mode | unit `ExecStart` + `wlan0-static-ip.service` dependency | MEDIUM |
| D5 | Dead variable `HOSTS` in `gen-selfsigned.sh:23` — set, never used; line 28 hardcodes the literals instead | `shellcheck -S warning` → SC2034 | LOW |
| D6 | Wrong type annotation `tuple[str, dict, str]` in `local_bridge.py:198`; actual contract is `(str, str, dict)` | `pyright`; all 4 `_submit` call sites traced — **runtime is correct** | LOW |

D1 dropped: `alerts, ambient, center, hotspot, max, min, verdict`
D1 surviving: `bodyTemp, deviceId, pigId, status, temperature, timestamp`
D2 dropped: `bodyTemp, pigId`
D2 surviving: `deviceId, message, severity, timestamp, type`

### 2.2 False alarms — explicitly ruled out, must not be "fixed"

- **pyright `CallbackAPIVersion is not exported`** — false positive. paho-mqtt
  `2.1.0` is installed on **both** laptop and card; the attribute exists in both.
  This is a pyright stub gap, not a runtime error.
- **"Card venv is broken / paho missing"** — *my own error*. The card venv
  symlinks `/usr/bin/python3`, which is 3.12.3 on the laptop but 3.13.5 on the
  Pi, so it searched a nonexistent `lib/python3.12/`. The venv is healthy.
  **aarch64 venvs and binaries cannot execute here — static analysis only.**
- **`systemd-analyze verify` → "Command is not executable"** — expected. Those
  paths exist only on the Pi. The units are structurally valid.

### 2.3 Cannot be verified without hardware

I2C bus/addresses, MLX90640 presence, ESP32-S3 TCP stream, Tapo RTSP, real
service start order, PB bind-on-boot behaviour, and every runtime error path.
The console must therefore **never fabricate** a value for these. See §4.

---

## 3. Architecture

```
                    ONE codebase
backend/thermal-pi/
  web_server.py  ──── unchanged routes (/, /data, /csv, /health,
  │                          /esp/*, /cctv, /static/*, /audio tombstones)
  │
  ├── NEW: admin_console.py      (~450 lines)  route table + data providers
  │     mounted at /admin/*  — read-only, additive, cannot shadow existing routes
  │
  └── NEW: static/admin/         multi-page UI (5 pages + shared CSS/JS)

             ▲                    ▲
             │                    │
   ┌─────────┴────────┐   ┌───────┴────────┐
   │  LIVE  (Pi)      │   │ DEV  (laptop)  │
   │  no flag         │   │ --dev-source   │
   │  reads real HW,  │   │ /media/solrahk │
   │  live services,  │   │ /rootfs        │
   │  SD = not needed │   │ no I2C/MQTT/   │
   │                  │   │ RTSP binding   │
   └──────────────────┘   └────────────────┘
```

### 3.1 Why this is safe to add to the production file

- `web_server.py` routing is a flat `if path == ...` chain. `/admin` and
  `/admin/*` match **none** of the existing branches, so the new dispatch is
  reached only on those exact prefixes. No existing route can be shadowed.
- The new module is imported **lazily** inside the handler, so on the Pi the
  import cost is paid only when someone opens `/admin`.
- Import-time safety was verified: `MlxReader.__init__` and
  `ThermalPublisher.__init__` make no hardware/IO calls, and
  `EspAudioIngest` binds its socket in `_serve()` (not `__init__`). Confirmed by
  importing `esp_audio_ingest` on the laptop — nothing bound `:9090`.

### 3.2 `--dev-source` semantics

```
python3 web_server.py --dev-source /media/solrahk/rootfs --port 8085
```

- Does **not** start `_loop()` (no I2C reads).
- Does **not** call `esp_audio_ingest.ensure_started()` (no `:9090` bind).
- Does **not** call `_publisher.start()` (no MQTT).
- Serves `/` (thermal dashboard) normally, reporting `NOT CONNECTED` for the
  sensor, because `_reader.init()` is never called.
- Serves the full `/admin` console against the SD snapshot.

Rationale: the laptop preview must be *the same console the Pi will serve*, so
the dev flag changes only the **data source**, never the console code.

---

## 4. Data provenance — the anti-mock rule

Every value the console renders carries a **provenance tag**. There is no code
path that invents a number.

| Tag | Meaning | Example |
|-----|---------|---------|
| `live` | Read from the running Pi subsystem just now | FPS from a real frame |
| `snapshot` | Read from the mounted SD card offline | PocketBase row counts |
| `unavailable` | Should work on Pi, **hardware absent** | `NOT CONNECTED (no sensor)` |
| `static` | From `config.py` | `I2C_BUS=/dev/i2c-1` |

Rules:

1. **`unavailable` is never rendered as a number.** No `0`, no `59.0`, no
   `--`. A missing value reads `NOT CONNECTED`, because "0 °C" and "no sensor"
   are different facts and conflating them is exactly the confusion the user
   objected to.
2. **Laptop metrics never masquerade as Pi metrics.** The console shows a
   prominent `DEV — source: /media/solrahk/rootfs` banner, and a
   `runtime.env` field reading `dev-snapshot` vs `pi-live`. Laptop CPU/RAM/disk
   are *not* displayed in the System page in dev mode; that page shows SD-sourced
   facts (`/etc/hostapd/hostapd.conf`, unit files) instead.
3. The static-preview HTML in `/tmp/index.html` is **discarded**. The UI ships
   as real files under `static/admin/`.

---

## 5. Console pages

Multi-page, server-rendered shells + JSON APIs, matching the user's "doesn't
need to be one page". Shared nav, high contrast, ≥16px body text, bold headers
(low-vision requirement).

| Route | Page | Contents |
|-------|------|----------|
| `/admin` | **Overview** | Provenance banner; per-subsystem state; top findings count; the one thing that is most broken |
| `/admin/sensors` | **Sensors** | MLX90640 (I2C addrs, frame, verdict), ESP32-S3 (`/esp/status` fields), Tapo CCTV; all `unavailable` in dev |
| `/admin/data` | **Data** | PocketBase collections, row counts, schema vs publisher field diff (**D1/D2 surfaced here**), latest rows, `synced` backlog |
| `/admin/system` | **System** | systemd units from the SD `systemctl` dir (not a live `systemctl` call), network config, AP SSID/IP, disk/mem from `/proc` **of the card mount** where readable |
| `/admin/code` | **Code** | File tree of designated systems; full source with line numbers; **secret redaction** |
| `/admin/diagnostics` | **Diagnostics** | Every check with severity, evidence, why-it-matters, recommended fix, copyable command |

### 5.1 Redaction (non-negotiable)

`/admin/code` shows source. `tapo_mjpeg_server.py` currently contains hard-coded
RTSP credentials, and the AP config reuses the same passphrase. Before any byte
of source is sent:

- Credential-shaped assignments are replaced with `«redacted: <kind>»`.
- The redaction is applied to the **served bytes only**; the on-disk file is
  never modified.
- A banner states how many redactions were applied, so the operator knows the
  view is not literal.

### 5.2 Admin gate

Normal operator access = read-only dashboard. The full console (`/admin`) is
gated:

- **DEV mode** (`--dev-source` present): loopback-only by default. Serving on
  `0.0.0.0` in dev mode is refused unless `--dev-allow-any` is passed, so a
  laptop preview can never become a network-exposed source browser.
- **LIVE mode** (Pi): `/admin` requires a pairing cookie; see §7.

---

## 6. Diagnostics — real tools, and the fix for each

Each check returns `{id, severity, title, evidence, why, fix, command}`.

| Check | Tool | Notes |
|-------|------|-------|
| Python compile | `ast.parse` + `py_compile` | Always available; no deps |
| Type/semantic | `pyright` | **Only if present**; results cached; must filter the known `CallbackAPIVersion` false positive |
| Shell lint | `shellcheck` | Already found D5 |
| Unit verify | `systemd-analyze verify` | Must treat "command not executable" as **N/A in dev**, not an error (§2.2) |
| Schema drift | `ast` vs `sqlite3 PRAGMA` | Finds D1/D2 — the flagship check, works fully offline |
| Unit placement | scan SD `systemd/` for laptop-only `ExecStart` | Finds D3 |
| PB bind risk | parse unit `ExecStart` for a hard-coded AP IP | Finds D4 |
| Secret scan | reuse the repo's existing pre-commit scanner | Consistency with the committed guard |

Two rules the diagnostics engine must honour:

1. **A missing tool is `unavailable`, not `pass`.** If `pyright` is absent, say
   `pyright not installed — check not run`, never a green tick.
2. **No auto-fix.** The console *reports* and offers a copyable command. It never
   mutates a file, a unit, or the SD card.

---

## 7. Pairing / auth (LIVE mode)

Deferred to a follow-up slice, but the design must not block it:

- `/admin/pair` accepts a one-time code, sets an `HttpOnly; Secure; SameSite=Strict`
  cookie signed with `HMAC(secret, ...)` where `secret` is generated on first
  boot and stored `0600 root:root` at `/etc/pigpulse/admin_secret`.
- Read-only dashboards (`/`, `/data`, `/health`) stay **ungated** — the farmer
  must never be locked out by an admin feature.
- The AP is the trust boundary. Nothing in the console binds `0.0.0.0` beyond
  what the existing `WEB_HOST` already does.

---

## 8. Known scope boundaries for this slice

Deliberately **out of scope**, and stated so they are not mistaken for done:

- Fixing D1–D6. The console *reports* them; the fixes land separately and
  **on hardware** (D1/D2 need the aarch64 PocketBase to apply the migration).
- Removing the mis-deployed D3 unit from the SD card (needs a write to the card;
  the card is untouched in this slice by instruction).
- Live `systemctl` control, service restart, calibration writes.
- Phone data-mule sync and local ML inference.

---

## 9. Verification plan

Nothing ships on the strength of "it renders". Each step must be executed and
its output captured.

1. `python3 -m py_compile` every touched Python file.
2. `pyright` on the new module — zero **new** diagnostics.
3. `shellcheck` — no new findings.
4. **Anti-mock assertion (automated):** with `--dev-source` pointing at the SD
   card, fetch `/admin/data` and assert every sensor-derived value is tagged
   `unavailable` or `snapshot`; assert **no** value is tagged `live`.
5. **Redaction assertion:** fetch the source view of `tapo_mjpeg_server.py` and
   assert the known credential literals do **not** appear in the response bytes.
6. Serve on `localhost:8085`, walk all six pages, confirm no 500s.
7. Confirm `--dev-source` did **not** bind `:9090` or open an MQTT session
   (`ss -lntp`).
8. Confirm the SD card was not written to (`find -newer` on a pre-session marker).

## 10. Success criteria

- One console, two data sources, zero duplicated console logic.
- Zero fabricated values; every rendered datum carries a provenance tag.
- D1–D6 are visible in the UI with correct severity and fix guidance.
- Source view is redacted; dev mode cannot be exposed off-loopback by accident.
- SD card unmodified.
