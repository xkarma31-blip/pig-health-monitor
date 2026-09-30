# Implementation Plan — Pi Technician / Admin Console

Design: `2026-09-30-pi-admin-console-design.md` (Option A, approved)
Branch: `feat/v3-mqtt-pocketbase`

## Task 1 — Redaction + provenance primitives

`admin_console.py` (new), with two independent, unit-testable primitives:

- `redact(text) -> (text, count)` — masks credential-shaped assignments
  (`password=`, `passwd=`, `PASSWORD=`, RTSP userinfo in URLs, `X-PigPulse-Key`,
  private-key PEM blocks). Never rewrites the file on disk.
- `prov(value, tag, source=None) -> dict` — the provenance envelope every
  rendered datum must pass through.

Exit: `python3 -m py_compile` clean; redaction of a synthetic credential string
returns `count >= 1` and the literal is absent from the output.

## Task 2 — Data providers (SD snapshot + live)

`admin_console.py` providers, each returning only provenance-tagged data:

- `collect_pocketbase(root)` — read the card's `data.db` **read-only**
  (`file:...?mode=ro`, never writable; the card is not ours to mutate).
  Collections, row counts, latest rows, `synced=false` backlog.
- `collect_schema_drift(root)` — `ast` over `thermal_publish.py` vs
  `PRAGMA table_info`. **This is the flagship check: it finds D1/D2 offline.**
- `collect_units(root)` — parse the SD `/etc/systemd/system` files, flag
  laptop-only `ExecStart` (D3) and hard-coded AP-IP binds (D4).
- `collect_network(root)` — hostapd/dnsmasq/NetworkManager from the card.
- `collect_sensors(...)` — live on Pi; **`unavailable`** in dev.
- `collect_runtime()` — env tag, bind port; never laptop metrics as Pi metrics.

Exit: with `--dev-source`, `collect_pocketbase` returns row counts matching a
direct `sqlite3` count on the same file, and the DB file's mtime is unchanged.

## Task 3 — Diagnostics engine

`collect_diagnostics(providers)` → list of findings with
`{id, severity, title, evidence, why, fix, command}`.

- `py_compile` (always)
- `shellcheck` (if on PATH; else `unavailable`, never `pass`)
- `pyright` (if on PATH; **filter** the `CallbackAPIVersion` false positive)
- `systemd-analyze verify` (treat "command not executable" as N/A in dev)
- schema drift (D1/D2), unit placement (D3), PB bind (D4)

Exit: running against the SD card emits findings for D1, D2, D3, D4 with the
expected severities. Missing tools render `unavailable`.

## Task 4 — Routing in web_server.py (additive, minimal)

- Lazy import of `admin_console` inside the handler.
- Dispatch on `path == "/admin"` or `path.startswith("/admin/")`, placed so it
  cannot shadow any existing branch.
- `--dev-source` and `--dev-allow-any` argparse flags.
- In dev mode: skip `_loop()`, skip `esp_audio_ingest.ensure_started()`, skip
  `_publisher.start()`.
- Refuse `0.0.0.0` bind in dev mode without `--dev-allow-any`.

Exit: `git diff --stat` on `web_server.py` stays small; every pre-existing route
still returns its original response (regression check below).

## Task 5 — UI pages

`static/admin/` — `index.html` (Overview), `sensors.html`, `data.html`,
`system.html`, `code.html`, `diagnostics.html`, plus `console.css` + `console.js`.

Requirements:
- High contrast, min 16px body, bold headers (low vision).
- `unavailable` renders as `NOT CONNECTED` — never `0`, never `--`.
- Dev banner showing the data source path and `runtime.env`.
- No global-`event` handlers; explicit `event` parameters.
- Source view: line numbers, redaction notice with applied count.

Exit: all six pages return 200 with no console errors; the System page in dev
mode shows **no** laptop CPU/RAM/disk.

## Task 6 — Regression + anti-mock verification

Automated script `scripts/verify_admin_console.py`:

1. Pre-existing routes (`/`, `/data`, `/health`, `/esp/status`, `/audio`) still
   behave as before in dev mode (`/audio` → 410 tombstone).
2. `ss -lntp` shows **no** `:9090` listener and no MQTT session after dev boot.
3. No `live`-tagged value in any dev-mode response.
4. Redaction: known credential literals absent from the source response.
5. SD card writability: DB and config mtimes unchanged across the whole run.

Exit: script exits 0 with a printed pass/fail per check.

## Task 7 — Commit

Commit code + plan. **Do not** touch the SD card. Report the findings (D1–D6)
separately from the console work so the operator can triage hardware actions.
