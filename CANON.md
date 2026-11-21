# ARCHITECTURAL CANON & SOURCE OF TRUTH

> **READ THIS BEFORE CREATING, MOVING, OR DEPLOYING ANYTHING IN THIS REPO.**
> Authority: repository location, branch, topology, deployment, safety rules.
> If any other document (including dated briefings, orientation snapshots, or
> a stale `AGENTS.md`) contradicts this file, **this file wins**.
> Last verified against the working tree: **2026-11-13** (full end-to-end audit:
> every claim below was read off the live Pi, the live laptop rig, raw MQTT on
> the wire, or the databases — not from a spec sheet). **Section 0.9's widget
> and thermal claims were verified 2026-11-17.** **§0.1's SHT45 live status was
> re-measured 2026-11-21.** The previous verification was 2026-10-29.

---

## 0. CORRECTIONS OF 2026-11-13 — READ FIRST

> Full audit record with every measurement: **`docs/AUDIT_20261113_PI_STATE.md`**.
> This section is the short form. Where it contradicts a later section of this
> file, **it wins**.

### 0.1 The SHT45 diagnosis in §2.5 was WRONG — and the fix is different

§2.5 says the SHT45's `ambient=0, humidity=0` rows were caused by the
trailing-comma JSON bug and that *"Fixed 2026-11-12"*. **The comma was fixed.
The zeros were not.** Three separate defects were behind them, all confirmed
from the board's own counters:

| # | Defect | Evidence |
|---|---|---|
| 1 | The publish gate tested the **last attempt's outcome**, not the age of the cached reading. `sht_task()` cleared `shtValid` on any transient failure, discarding a still-good value. | live counters; 14/40 messages carried the ambient fragment |
| 2 | **PubSubClient silently dropped every telemetry message** once the payload crossed `bufferSize − (5 + 2 + topic)` = **353 bytes**. The payload had crept to **346** — seven bytes of margin. | `PubSubClient.cpp:450`; any added counter killed all telemetry while the audio kept streaming |
| 3 | The SHT45 bus is **genuinely intermittent** — the sensor NACKs its own address (`sle=2`), plus short reads and CRC mismatches. | instrumented build: `sfw=35 sfs=9 sfc=6` |

Fixed in firmware `pigpulse-mic-sht45-20261113-shtretry` (archived with
sha256 under `firmware/esp32s3-mic-ambient/docs/known-good-20261113-shtretry/`).
Measured before → after, from raw MQTT:

```
messages carrying the ambient fragment   14/40 (35%)  ->  59/60 (98%)
PocketBase zero-rate, minute by minute   48.3% -> 32.2% -> 21.7% -> 4.5% -> 0.0%
```

**Residual, physical:** the SHT45's I²C connection still NACKs. The firmware
tolerates it; **the wiring wants attention.**

> **LIVE STATUS 2026-11-21 09:33 PST — the sensor is currently HEALTHY.**
> Measured on the Pi, not inferred:
>
> ```
> GET https://127.0.0.1:8080/ambient
>   {"state":"live","ok":true,"temperature":31.48,"humidity":72.38,
>    "thi":84.0,"thiClass":"severe","ambientCount":569,"micOnline":true}
> raw MQTT pig/s3-mic-01/telemetry
>   {"mic":true,"temperature":31.45,"humidity":72.52,...,"sle":2,
>    "boots":98,"rssi":-54}
> ```
>
> It came back after the ESP rebooted (`boots` 97 → 98) at ~09:13 PST. The
> `sle=2` counter is cumulative and predates this boot, so it is **not**
> evidence of a fault in the current session. Treat the I²C fault as
> **intermittent, not permanent** — do not report the SHT45 as dead without
> re-reading `/ambient`; and do not call it fixed either, since the wiring
> fault has not been touched.

> **POWER-LOSS INCIDENT 2026-11-21 09:46:37 PST — thermal and mic are DOWN.**
> Measured, not inferred:
>
> | Evidence | Reading |
> |---|---|
> | Last line of the previous boot | `09:46:37` bridge telemetry log, no shutdown sequence |
> | `last -x` shutdown records | none — hard cut, not a clean reboot |
> | Panic / OOM in previous boot | none found |
> | Camera 802.11 rx counter | `1,039,344,204` → `44,594,264` (counter reset = camera power-cycled) |
> | New boot | `09:46:35`, NTP re-synchronised |
>
> The Pi came back. The camera came back. **Two devices did not:**
>
> - **MLX90640 (thermal):** `pigpulse-thermal` is `active` but retries every
>   10 s and logs `I2C FAULT ... [EREMOTEIO]`. `sudo i2cdetect -y 1` shows
>   **no device at 0x33** — the sensor does not ACK at all. `/data` returns
>   `ok:false` (no cached frame after restart). Power flags are clean
>   (`get_throttled=0x0`), which only means the Pi's PMIC saw no sag — this
>   is the sensor's 3V3/wiring, not the SoC.
> - **ESP32-S3 (mic/ambient):** not associated to the AP, `ping
>   192.168.69.15` fails, and `dnsmasq` has logged **zero** DHCP requests
>   from `68:ee:8f:dd:31:3c` since the cut. Its last fresh row is
>   `01:47:06Z`; a single later row at `02:01:35Z` repeats `rms=74043`,
>   `ambient=31.55`, `humidity=72.67` **exactly**, so it is a frozen or
>   replayed buffer, not a live reading.
>
> The watchdog did its job in a real incident: `MIC_DISCONNECTED /
> CRITICAL` at `01:47:16.720Z` with a **77,039-byte JPEG** attached — the
> first live proof of the module-level `_capture_frame` fix.
> `pi-thermal-01`'s last row before the cut was `center=43.89,
> ambient=38.19, ambientSrc=mlx-internal, humidity=0` — the die-temp
> fallback, correctly labelled as such.
>
> **Do not** call either sensor dead: both were measuring minutes before
> the event. **Do not** call the power fixed either. Physical checks, in
> order: (1) measure 3V3 at the MLX90640 VDD and reseat SDA/SCL/GND,
> (2) confirm the ESP32-S3's own supply is alive and its WiFi credentials
> survived (brown-out NVS corruption is possible), (3) replace the 5 V
> feed with ≥2 A, 18 AWG, 1000 µF bulk — the measured 4.5 V / 3.13 V under
> load predates this incident and is the leading suspect.
>
> Schema note (same day): `telemetry` gained `ambientSrc` (`sht45` /
> `mlx-internal`) and `pipelineVerdict` (the radiometry verdict:
> `WARMUP|NORMAL|SUSPECT|FEVER|HYPERTHERMIA`). The bridge guard still
> strips `verdict`/`bodyTemp`/`temperature`/`alerts` by design — the raw
> frame claim stays out of the database; only the derived, zone-based
> verdict is persisted.


> **The clock hypothesis was tested and rejected (2026-11-13).** The obvious
> explanation — long leads raising bus capacitance so the sensor misreads its
> own address — was tested by A/B-ing the I²C clock on the live board over
> comparable ~145 s windows:
>
> | build | clock | total fails | address NACKs | ambient present | audio |
> |---|---|---|---|---|---|
> | `shtbus` | 50 kHz | 123 | 70 | 119/120 | clean |
> | `sht10k` | 10 kHz | 98 | 46 | 119/120 | clean |
> | **`shtfinal` (live)** | **100 kHz** | **60** | **36** | **119/120** | clean |
>
> A **10× reduction in clock speed did not clear the address NACKs**, and the
> slowest bus was measurably *worse* than the original. The clock is therefore
> back at 100 kHz — fastest, and best measured. **The fault is physical.**
> The physical checklist is in `KNOWN_GOOD.md` (pull-ups, lead length, cold
> joint, address, common ground).
>
> Kept because they are free and harmless: `Wire.setTimeOut(50)` instead of
> 5 ms, and an I²C bus reset after 6 consecutive failures (it fired once).
> New telemetry counters publish the truth: `srf` (failed attempts), `sage`
> (ms since the last good reading), `sfs`/`sfc`/`sfw` (failure kind), `sle`
> (I²C error), `sdt` (command→read ms), `slr` (last CRC byte), `sbr` (bus
> resets). **Absent is not zero** — check `sage`, not `ambient=0`.

### 0.2 The Pi is no longer an island — §2.4's wording is superseded

§2.4 describes an air-gapped Pi absent from the tailnet. Measured 2026-11-13:

- `wlan0sta 192.168.254.194/24` — farm router (2.4 GHz venue BSSID, metric 200)
- `eth1 10.42.0.28/24` — laptop tether (default route, metric 100)
- `tailscale0 100.69.139.63` — **the Pi IS on the tailnet**
- `ping 8.8.8.8` → 3/3, 23–31 ms

Tailscale's objection in §2.4 (a node with no internet cannot enrol) is
**moot** — the Pi now has WAN and did enrol. Read §2.4.1 for the mechanism.

### 0.3 §2.5's "the laptop rig shows seeded demo data" is FALSE

The Pi→cloud sync is **live and working**: 649,685 telemetry rows on the
laptop PocketBase — 574,070 × `s3-mic-01` and 71,042 × `pi-thermal-01`, the
freshest seconds old. Only 41 rows carry a seeded `esp32-00x` deviceId, all
from 2026-09-02. The `synced` flag genuinely toggles (the Pi holds ~11 rows in
flight against 634,007 synced). Interval is **10 s**, not the 60 s of §2.4.

### 0.4 Thermal alerts are suppressed on purpose — now documented

The Pi generates real thermal alerts (118 HYPERTHERMIA + 26 FEVER) and
`cloud_sync.py` **marks them handled without ever delivering them**
(`workers/cloud_sync.py:271-283`, via `bridge/thermal_guard.py:is_thermal_alert`).
The reason is sound: those rows carry physically impossible values — one read
*"unassigned centre 476.89C"* — so the bridge refuses to ship them. The Pi
bridge also suppresses at ingest, which is why no new thermal alert has
appeared since 2026-11-03.

**Consequence to remember:** the cloud `alerts` collection holds **only
seeded demo rows**, so the phone's alert feed shows fake "Peppa FEVER"
data. The seeded rows were deleted on 2026-11-13. A cloud alert now means
"a real non-thermal alert" (e.g. `MIC_DISCONNECTED`), never a thermal claim.

### 0.5 The admin surfaces are back where this canon says they should be

§4.1 ("admin UI, loopback only") and §6 item 1b ("Pi PocketBase now bound to
`192.168.69.1`") were both **drifted from in practice**. Re-tightened
2026-11-13, with backups:

- laptop PocketBase → `--http=127.0.0.1:8090`
- Pi PocketBase → `--http=192.168.69.1:8090` (the repo's unit already said so;
  the live unit had drifted to `0.0.0.0`)
- `~/.config/pigpulse/sync.env` → `SYNC_SOURCE_URL=http://192.168.69.1:8090`
  (`raspberrypi.local` resolves to `10.42.0.28`/eth1, which the new bind no
  longer serves)

Verified: the admin UI answers **200 on loopback only** and **000 (refused)**
on the home LAN, the tailnet, `10.42.0.28` and `192.168.254.194`. The
gateway's 403 guards on `/_/` and `/admin/` still hold.

### 0.6 Other corrections

| § | Was | Now |
|---|---|---|
| §4.2 | "Funnel off" | **the demo panel is off; the key-gated data path is deliberately still on.** The Funnel had **two** targets — `:443 → 127.0.0.1:8099` (the key-gated read-only proxy) and `:8443 → 127.0.0.1:8788` (an unauthenticated demo panel published to the public internet). **`:8443` was closed** on 2026-11-13. **`:443` was left ON on purpose**: it is the only path the Vercel `/api/telemetry` function uses to reach the data, so closing it would empty the public dashboard. §4.2's "Funnel off" remains the correct *end state* to reach if that path is ever replaced — it is not the current state. The demo panel is also stopped at the process level, not only at the Funnel. |
| §4 | autodeploy "cron, 5 min" | was **paused** since 2026-10-31 for a Vercel-token reason that no longer holds; restored 2026-11-13. The staging tree is `~/.local/state/pigpulse-stage/`, not `landing_page/app/`. |
| §3.2 | `tools/` is an "empty orphan" | **not empty** — 24 real, tested files (accessibility checker, evidence ledger, perf benchmarks). Committed 2026-11-13. |
| §6-9 | "no `/cctv` route" | still true of the **gateway**. But the read-only proxy serves a working **`/pi/cctv`** (live MJPEG) and Funnel republishes it — an undocumented public camera path. |
| §2.4 | "the live config has exactly nine locations" | it has **eight**; the enumerated list also had eight. |
| §6-11 | `PB_PASSWORD` unknown | the bridge still refuses to start without credentials, by design. |

### 0.7 Decision on record — the theme's accessibility FAILs are accepted

`tools/a11y/pigpulse_a11y.py audit` scores the live `theme.ts` and reports
**twelve FAILs** in the light palette (the five badge labels, two row glyphs,
"muted label on card", "thermal value", "card hairline boundary", "input
border on bg", "body small"/"secondary label"). The tool computes an exact
replacement hex for every one of them.

**Master was shown those fixes on 2026-11-13 and declined them: the theme is
to stay as it is.** These FAILs are a *measurement on record*, not an open
defect list.

> **Do not apply the `fix` suggestions to `src/theme/theme.ts`** without a
> fresh, explicit instruction from Master. The a11y tool is a measurement and a
> record — not a to-do list. The reason is documented in the tool's own header
> so a future agent reading the audit output cannot mistake it for a mandate.

Related: the healthy-green / alert-red pair keeps only ~17% of its separation
for deuteranopes. That is carried deliberately by a text label and an icon
shape on the badges (`Badge.tsx`), not by colour alone.

### 0.8 PERFORMANCE — the bottleneck was missing INDEXES, not threads (2026-11-16)

**The single biggest latency source in this system was that both PocketBase
instances had ZERO indexes.** Every read was a full table scan. Measured on
live data, same queries before and after:

| Query | Pi (726k rows, SD card) before → after | Laptop (737k rows, NVMe) before → after |
|---|---|---|
| `filter=(synced=false)&sort=-timestamp` (the sync) | 507.7 ms → **27.7 ms** | 86.3 ms → **0.8 ms** |
| `sort=-timestamp&perPage=5` (the app's realtime hook) | 4099.5 ms → **246.0 ms** | 352.6 ms → **32.3 ms** |
| `deviceId='..'&&timestamp>=..` (the app's analytics) | 582.4 ms → **15.9 ms** | 87.5 ms → **0.9 ms** |

Query plan now reads `SEARCH telemetry USING INDEX idx_telemetry_synced_ts
(synced=?)`. The index set is exactly the repo's own query shapes, not a
guess — see `backend/scripts/ensure_indexes.py` (idempotent, no restart) and
the migration `deploy/pocketbase/bin/pb_migrations/1799600000_add_query_indexes.js`.

> **Rule: a full table scan cannot be fixed with threads.** Threads multiply
> the *pipeline*; they do not remove a scan that costs 500 ms. Index first,
> then parallelise what is left.

**Where parallelism actually helped** — the Pi→cloud sync (`backend/workers/cloud_sync.py`):

- The per-record work is two HTTP round trips: insert into the destination,
  then mark the source row synced. The source is the Pi's PocketBase on an SD
  card, where a single-row round trip measures **~28 ms** → the sequential
  pipeline was *latency* bound at ~30 rows/s (a 726k backlog ≈ 8 hours).
- The Pi's PocketBase absorbs concurrency nearly linearly (read-only GET by
  id, 24 requests per client): 1 client 38.5 req/s → 2: 74.7 → 4: 123.0 →
  8: 241.4 req/s, with latency steady at 27–35 ms. It is not serialising.
- With `SYNC_WORKERS` (default 4): measured 283 → 432 rows/s on a scratch
  source/dest pair, and far more against the Pi, because that latency is what
  dominates. `SYNC_WORKERS=1` restores the old strictly sequential behaviour.

**Where parallelism did NOT help — the cough classifier** (CPU-bound, and the
obvious fix is a regression). Measured on the Pi with the real 304 MB
Cnn14_16k body:

| intra_op threads | 1 | 2 (default) | 3 | 4 |
|---|---|---|---|---|
| ms / 5 s window | 2552.9 | 1346.1 | 958.2 | 890.2 |

- The numpy log-mel front-end is **not** the bottleneck: 29.6 ms of the
  ~1376 ms, and float32 is *slower* (38.6 ms).
- **Multiple processes are a regression**: 2 processes × 2 threads measured
  0.82 windows/s against **0.94** for one process × 3 threads; 3 processes ×
  1 thread managed 0.69. Each extra process would also load another 304 MB of
  weights on an 8 GB Pi.
- The knob is now `REC_ORT_THREADS` (default 2, because the 4 Hz thermal loop
  shares the same 4 cores). Scaling is near-linear to 3 threads and then
  flattens — memory-bandwidth bound.

> **Rule: I/O-bound work → threads. CPU-bound numeric work → more threads
> INSIDE one native runtime, never more processes.**

**PocketBase 0.22.20 API facts (each verified in a scratch instance before
being used on production):**
- The index list is an **array of SQL strings**
  (`PATCH /api/collections/{id}` with `{"indexes":[...]}`), not the 0.23+
  `{"name":..., "columns":[...]}` shape.
- **No batch create/update.** An array body returns
  `400 Failed to load the submitted data due to invalid formatting`. Batch
  create landed in PB v0.23+.
- A JS migration must return `dao.saveCollection(collection)` — returning the
  `Dao` or a raw collection makes the runner fail with
  `could not convert [object Object] to error`, and `IF NOT EXISTS` is
  rejected by the collection validator.
- The laptop's PocketBase was started **without** a migrations dir
  (`WorkingDirectory=deploy/pocketbase`, but the migrations live in
  `deploy/pocketbase/bin/pb_migrations`) — the unit now passes
  `--migrationsDir=bin/pb_migrations`.

**Also fixed while measuring:** the thermal app server raised
`AttributeError: 'Handler' object has no attribute 'path'` on any malformed
HTTP request (`self.path` does not exist yet when `parse_request()` calls
`send_error()` → `log_error()` → `log_message()`). It now reads the path with
`getattr(self, "path", "")`.

### 0.9 Native Android widget shipped; Pi thermal sample recovered (2026-11-17)

**The PigPulse Expo app now ships a native Android home-screen widget.** It is a
*glanceable* surface, not a clinical instrument. The JS layer
(`src/utils/widget-state.ts`, `widget-poll-controller.ts`, `useWidgetSync.ts`)
writes a versioned JSON cache in the app's documents directory
(`pigpulse_widget_state.json`); the Kotlin `AppWidgetProvider` reads it from
`context.filesDir`. **Contract version 1.** The receiver is
`android:exported="false"` — it is local to the app, not a shared endpoint. The
widget follows the app's **saved effective** theme (`pigpulse-theme-mode` may
store `light`, `dark`, or `auto`; the widget receives the resolved light/dark
choice); it adds no independent switch. While the app process is active, its
polling controller requests fresh data every 30 s (10 s request deadline); this is most
reliable while the app is foregrounded because Android may suspend background
execution. A cache write also triggers the native provider's `FileObserver`, and
`updatePeriodMillis=1800000` (30 min) is the framework's fallback render window,
not a guarantee of fresh data. **No OAuth wall and no new authentication surface
were added — the app still uses email/PocketBase auth.**

Observed on the two launcher instances (widget ids 2671, 2673):

| Check | Observed |
|---|---|
| Dark, connected | scene-centre **35.89**, "Updated just now" |
| Light, connected | scene-centre **35.64**, "Updated just now" |
| Offline after an update | last reading **35.64** retained, "Updated 4 min ago" |
| After reconnect | **36.03**, "Updated just now" |
| Later sample | **37.02**, "Data may be stale" |
| Normal hierarchy | `widget_logo` / `widget_device` / `widget_status` / `widget_reading` / `widget_reading_label` / `widget_freshness` present; the launcher's own fake host views are absent |
| Device status | "No reported device status" — **no fever verdict is inferred from a scene centre** |

**Build / install identity:** EAS preview build
`41fae1dd-7db6-43d3-8b35-34137148af79`; artifact 97,216,846 bytes, SHA-256
`f12c77bbfac377bd689ee6d1e5e7518b8ebe5c92ab156028b7153fc10db0c8df`; installed
to the physical phone `15187705AA004496` with `adb install -r` → `Success`
(MIME `application/vnd.android.package-archive`); the same bytes were copied to
the Pi at `/home/pigpulse/thermal-pi/app/PigPulse.apk`. Credential hygiene: a
value-based scan over all **1,665** ZIP entries (129,473,735 decompressed bytes)
found **none** of the configured credential values or variable names in UTF-8,
UTF-16LE/BE, Base64 or URL-encoded form; the EAS production/preview env carry no
credential variables; `.easignore` excludes `.env` and `.env*`.

**Implementation commits:** `06a6ebf` (APK MIME), `175c59a` (native widget),
and `08d4a52` (release credential hygiene). The final validation recorded
unit/type/syntax passes, scoped ESLint with 0 errors, a 34-file critic-loop pass
with 0 failures, and no Critical or Required findings from the independent
scoped review. CodeRabbit was attempted but its CLI is unavailable (`cr` exit
127), so it is not represented as a passed review.

> Full widget record:
> **`v3-mqtt-pocketbase/docs/verification/2026-11-17-android-widget-verification.md`**.

**Pi thermal — a recovered sample, NOT a permanent fix.** A live `/health` read
at **2026-11-17T07:43:17+08:00** (Pi boot 2026-11-17 04:29:26) reported Sensor
ready **yes**, Frame valid **yes**, frame count **22655**, **1.98 FPS**, frame
age **0.6 s**, Last error **OK**, thermal MQTT **connected**, error **None**.
That is one good readout, not a cure: the journal shows a transient
`Remote I/O error` on the I²C bus at **05:02:49** that cleared only after two
corrupt frames were rejected, then recovered. **The MLX90640 remains
intermittent (§2.5, §6 item 12)** — the recovered sample does not eliminate the
recurrence risk.

> **Remaining blockers recorded 2026-11-17** (honest list; none fixed here):
> - **ESP32-S3 mic `68:ee:8f:dd:31:3c`**: no DHCP lease, absent from hostapd
>   logs, `/esp/status` times out, earlier `connected=false accepted=0
>   nonzeroPct=0.0`. **Needs physical inspection.**
> - **`pigpulse-cctv.service`**: active but the camera has **no DHCP lease and no
>   AP association**; journal says no camera is answering and HTTP probes time
>   out. Superseded by §0.10 for the app-side mode work.
> - **`pigpulse-ap-powersave.service`**: the earlier `237/KEYRING` failure has
>   **recovered** on this boot — measured `active (exited)`, status 0 on `wlan1`.
> - **5 GHz WAN**: unmet. The deployed `pigpulse-wan-pick` prefers 2.4 GHz and
>   `pigpulse-portal-connect` refuses 5 GHz; a working 5 GHz adapter / antenna
>   reseat is still required. **Scripts were not changed.**
> - **`health_check.py`**: PocketBase admin auth returns HTTP 400 and the table
>   token check fails.

### 0.10 P0 remediation shipped 2026-11-17

> Full record:
> **`v3-mqtt-pocketbase/docs/verification/2026-11-17-p0-remediation.md`**.

Master approved the full P0 batch after the read-only audit. Six narrow commits
landed on `capstone-remediation-20261113`:

- `3c7512f` — thermal fetch/pixel failures now surface a plain reason, and raw
  `FEVER`/`ALERT` verdicts render as `ELEVATED SURFACE — SCREENING ONLY`.
- `40917bc` — app-side CCTV OFF / VIDEO / VIDEO + AUDIO modes, honest offline
  text, and the grounded Tapo/SD recovery guide.
- `05ddd24` + `6305526` — pig writes require a signed-in owner; the migration
  was validated on a sandbox DB copy and applied to **both** live PocketBase
  instances after timestamped backups. Reads remain open.
- `030dc73` — local-first access: PigPulse hotspot → encrypted tunnel to the
  **same Pi** → explicit offline recommendation. No cloud mirror.
- `96e5b89` — notification channel and alert payload contract pinned and tested.

The radio roles were later corrected to the intended split: built-in `wlan0`
is the dual-band WAN client and USB dongle `wlan1` hosts the 2.4 GHz AP.
5 GHz scan now works. See
`v3-mqtt-pocketbase/docs/verification/2026-11-17-radio-roles-5ghz.md`.

The S3 mic was measured live after that correction (`mic=true`, RMS 57219,
`nonzeroPct=99.9`, AP station `68:ee:8f:dd:31:3c` on `wlan1`). Diagnostics now
labels stale telemetry honestly; see
`v3-mqtt-pocketbase/docs/verification/2026-11-17-mic-live-diagnostics.md`.

---

## 1. HARD RULES

### Live mic verification — 2026-10-13 (supersedes older mic status below)

- ESP USB readout: ESP32-S3 rev v0.2, MAC `68:ee:8f:dd:31:3c`, **4 MB flash**.
  USB is accessible; older “USB WEDGED” notes are historical, not current.
- Deployed canonical firmware: `pigpulse-mic-pcm16-20261013`, verified through
  USB diagnostics and retained MQTT `pig/s3-mic-01/audio/fmt`. Source remains
  `v3-mqtt-pocketbase/firmware/esp32s3-mic-ambient/arduino/esp32s3_telemetry/`.
- Audio is 48 kHz S16LE stereo (duplicated mono). Convert MSB-aligned I2S32
  with `>>16`; casting `>>8` directly to int16 caused wrapping/distortion.
  Actual WAV after repair: 144231 frames, RMS 932.907, range -3322 to 5151.
- Build uses espressif32 7.0.1 / Arduino 2.0.17 and
  **`board_upload.flash_size = 4MB`**. `board_build.flash_size` did not override
  the board's 8 MB image header and caused a measured boot assertion.
- An ESP-only stale AP association blocked reconnection even after restoring
  original flash. Measured ESP RSSI -21 dBm; Pi still marked the old station
  authenticated. Targeted `iw dev wlan0 station del 68:ee:8f:dd:31:3c`
  restored connection without restarting AP or thermal service. This is a
  diagnostic recovery action, not an automatic fix or routine periodic task.
- Live dashboard AudioWorklet output measured RMS 0.021451, peak 0.137512;
  thermal remained live near 2 FPS, service PID 1494 unchanged. User confirmed
  recognizable audio, **with residual static**. Do not claim noise-free sound
  or long-term reliability: underruns remain and soak testing is outstanding.
- Evidence and limitations: firmware `docs/MIC_FIX_20261013.md`.
- **Known-good archive + revert procedure: `firmware/esp32s3-mic-ambient/docs/KNOWN_GOOD.md`.**
  Archive the working binary/source *before* flashing anything, and record each
  change with a measured before/after reading. See repo `AGENTS.md`.

| # | Rule |
|---|---|
| **R1** | The ONLY project directory is `/home/solrahk/pig-health-monitor`. Never create `PigHealthMonitor/`, `pig_health_monitor/`, `PigPulse/`, or any other spelling. |
| **R2** | `/home/solrahk/PigHealthMonitor_ARCHIVE_OFFLINE` is **read-only**. Never edit, build, or deploy from it. |
| **R3** | Never create a new top-level directory in this repo. New code goes into an existing canonical path (see §3). |
| **R4** | Never `sudo` for builds, `npm`, `pip`, or git. Only for `/etc/systemd/system/`, `sysctl`, `apt`. `sudo` previously created root-owned dirs that agents then could not edit. |
| **R5** | Never commit a secret. A pre-commit scanner enforces this. Use env vars or an untracked file. |
| **R6** | Firebase is **retired**. It must not reappear — CI fails the build if it does. |
| **R7** | One Vercel project, one deploy path. Never create a second config for `pig-health-monitor`. |
| **R8** | **Confirm-and-Archive.** When any component is confirmed working, archive its state immediately — that archive is the revert path. **Firmware:** binary + source + sha256 into `KNOWN_GOOD.md` (exists). **Pi SD card:** at minimum `dpkg --get-selections` + service configs snapshot; ideally a `dd` image. **PocketBase:** copy `data.db` with timestamp suffix. **Config files** (hostapd, nginx, systemd units): `cp` with `-bak-YYYYMMDD`. Each archive entry needs **measured proof** (a readout, not "it compiled"). Without an archive, every fix is a forward-only gamble and we keep re-fixing things that were already solved. |

---

## 2. THE PIPELINE — what actually exists

> Read this section before assuming anything connects.

```
  ┌────────── PI EDGE (standalone AP "PigPulse", 192.168.69.0/24, NO WAN) ──────────┐
  │                                                                                │
  │  MLX90640 thermal ──I2C──► thermal-pi :8080 (HTTPS) ──► phone browser          │
  │                              ▲                    │                            │
  │  ESP32-S3 "s3-mic-01" ──TCP:9090──► esp_audio_ingest                          │
  │                        └──MQTT──► mosquitto :1883 ──► local_bridge ──► PB :8090│
  │  Tapo CCTV ──RTSP──► ffmpeg ──► tapo_mjpeg :8091 ──╳ NO /cctv PROXY (§2.4)  │
  │  hostapd + dnsmasq (AP)         wlan0-static-ip (192.168.69.1)                  │
  │  pigpulse-soak ──► soak.db (SQLite; §2.8, live 2026-11-05)                      │
  └────────────────────────────────────┬───────────────────────────────────────────┘
                                       ╳   NO REPLICATION PATH EXISTS
  ┌────────────────────────────────────┴───────────────────────────────────────────┐
  │  LAPTOP / CLOUD RIG                                                                 │
  │  PocketBase :8090 (native, systemd)  ·  ValKey :6379/:6380  ·  Mosquitto (docker)  │
  │  OpenResty :80 (gateway)  ·  thermal-ws :8080 (docker)                          │
  └────────────────────────────────────┬───────────────────────────────────────────┘
                                       ▲
                    Expo app ──HTTP/SSE──┘  (127.0.0.1:8090, or adb reverse :18090)
```

### 2.1 The two-island gap — CLOSED 2026-09-29

**Before:** the Pi and the laptop were isolated islands. The bridge wrote
`synced: false` on every record, nothing read it, and `backend/workers/` was
empty. The Expo app reads the laptop's PocketBase and had no reference to the
Pi's ports, so thermal data collected on the Pi never reached the phone. That
is why the capstone felt broken while every individual service was green.

**Now, two pieces:**

1. `backend/thermal-pi/thermal_publish.py` — the Pi publishes on the same MQTT
   wire contract as every other node, as `pi-thermal-01`. The existing
   `local_bridge` picks it up with **no new bridge code** and writes it to
   `telemetry` / `alerts` / `devices` with `synced: false`.
2. `backend/workers/cloud_sync.py` — ships `synced=false` rows from the Pi to
   the cloud PocketBase, then marks the source synced.

```
  thermal-pi ──MQTT pig/pi-thermal-01/*──► mosquitto ──► local_bridge ──► PB(pi) [synced=false]
                                                                            │
                                            cloud_sync.py (ON THE LAPTOP) │
                                                                            ▼
                                                                          PB(cloud) ──► Expo app
```

**Why the worker runs on the LAPTOP:** the Pi AP has no WAN. Tailscale cannot
help — every node must reach the coordination server over the public internet,
so a node with no internet cannot enrol. The Pi can only ever be the server.
The laptop joins the PigPulse AP and pulls.

**Delivery semantics: at-least-once.** A source row is marked `synced=true`
only *after* the cloud insert succeeds, so a crash mid-batch re-sends rather
than loses. The destination may briefly hold a duplicate. The alternative —
marking first — silently loses rows, which is the failure that hid the
audio_events loss for days.

**Requires on the Pi (one time):**
```sh
cd ~/pocketbase && ./pocketbase migrate up   # adds the 7 thermal fields
sudo systemctl restart pigpulse-pocketbase pigpulse-thermal
```
Until that migration runs, PocketBase **silently discards** `verdict`,
`hotspot`, `center`, `max`, `min`, `ambient`, `alerts` — measured, not guessed.

**And on the laptop (one time):**
```sh
mkdir -p ~/.config/pigpulse && chmod 700 ~/.config/pigpulse
cat > ~/.config/pigpulse/sync.env <<EOF
SYNC_SOURCE_URL=http://192.168.69.1:8090
SYNC_SOURCE_EMAIL=...      # the Pi's PocketBase admin
SYNC_SOURCE_PASSWORD=...
SYNC_DEST_URL=http://127.0.0.1:8090
SYNC_DEST_EMAIL=...        # the cloud/laptop PocketBase admin
SYNC_DEST_PASSWORD=...
EOF
chmod 600 ~/.config/pigpulse/sync.env
systemctl --user enable --now pigpulse-cloud-sync
```
Test before trusting it: `python3 backend/workers/cloud_sync.py --once --dry-run`

### 2.2 MQTT topics (the wire contract)

Canonical definition: `v3-mqtt-pocketbase/firmware/include/PigMqttTopics.h`

| Topic | Publisher | → Collection |
|---|---|---|
| `pig/{deviceId}/telemetry` | all devices | `telemetry` |
| `pig/{deviceId}/alerts` | all devices | `alerts` |
| `pig/{deviceId}/status` (LWT + heartbeat) | D0WD firmware | `devices` (upsert) |
| `pig/{deviceId}/commands` | *(nothing publishes it)* | — |
| `pig/{deviceId}/response` | D0WD firmware | — (log only) |
| `pig/+/audio` | **no publisher exists** | `audio_events` (orphaned) |

The topic shape **must** be `pig/{deviceId}/{channel}`. The legacy
`pig/telemetry/{x}` form in `firmware/esp32d0wd-pigpulse/config.h` is
**incompatible** — the bridge would read `deviceId="telemetry"`.

### 2.3 PocketBase collections

`telemetry`, `alerts`, `devices`, `pigs`, `audio_events`, plus auth `users`.
Live schema lives in `v3-mqtt-pocketbase/deploy/pocketbase/bin/pb_migrations/`.

> ⚠️ `backend/setup/setup_pocketbase.py` is **STALE** — it creates 4 collections
> with the old field set and no `audio_events`. Use the migrations, not this.

> ⚠️ **PocketBase silently discards unknown fields.** A schema drift loses data
> with no error. This cost the whole `audio_events` stream in September 2026,
> and it silently ate 7 of the 14 thermal keys when the Pi publisher was first
> wired up. After any payload change, add the field via a migration **and
> verify** by publishing one row and diffing published-vs-stored. Editing the
> schema JSON by hand does NOT create the SQLite columns — run the migration.

### 2.4 Network topology — the uplink problem

> **STATUS: DESIGN DECISION, NOT VERIFIED.** Diagnosed by inspection on
> 2026-09-30. The Pi was offline, so none of this has been tested on device.
> Do not quote any number here as a measurement.

**Current state (measured 2026-09-30; SUPERSEDED — see §0.2):** the Pi is an island. It runs hostapd
+ dnsmasq and serves `192.168.69.0/24`, with **no uplink and no WAN**. `ping
192.168.69.1` gave 100% packet loss and the Pi is absent from the tailnet.

**Tailscale is not a solution on its own.** Every tailnet node must reach the
coordination server over the public internet, so a node with no internet cannot
enrol. Tailscale becomes viable *only after* some uplink exists — it is a
private access path layered on top of an uplink, never a substitute for one.

**2.4 GHz is LOCKED — this is a hard constraint, not a preference.**

| Device | Band | Consequence |
|---|---|---|
| Tapo CCTV | 2.4 GHz only | Ethernet or 2.4 GHz. No 5 GHz fallback. |
| ESP32-S3 `s3-mic-01` | 2.4 GHz only | The only audio sensor. |
| Phone | dual-band | The only device that would survive a 5 GHz AP. |

> **CORRECTED 2026-11-12 — measured, not assumed.** The claim below that the
> Pi 4B's built-in radio is "2.4 GHz only" was **WRONG**. `iw phy phy0 info`
> on the Pi reads:
>
> ```
> Band 1:  * 2412.0 MHz [1] … * 2484.0 MHz [14]
> Band 2:  * 5170.0 MHz [34] … * 5700.0 MHz [140]
> ```
>
> The built-in radio (brcmfmac, BCM43438) is **dual-band 2.4 + 5 GHz**,
> including channel 116 = 5580 MHz — exactly the farm router's 5 GHz channel.
> With hostapd stopped, `iw dev wlan0 scan` sees **both** farm-router
> BSSIDs: `2c:b6:c2:1e:9b:d4` (2437 MHz, -52 dBm) and
> `2c:b6:c2:1e:9b:d5` (5580 MHz, -54 dBm).
>
> **Why it looked 2.4-only:** `wlan0` is owned by hostapd, so
> `nmcli dev wifi list` silently scans `wlan1` (the 2.4 GHz USB dongle)
> instead. Read the radio with `iw`, not nmcli.
>
> **The one-radio-one-band rule is still true** and is the real constraint
> (`iw phy phy0 info`): with an AP active, `#{managed} <= 1, #{AP} <= 1,
> #channels <= 1` — so an AP and a client on one radio must share a band.
> That is why the **laptop** is pinned to a 2.4 GHz uplink (-55 dBm): its
> hotspot must serve the 2.4 GHz-only CCTV and ESP32-S3. Two radios are
> still mandatory — the correction is to *which* radio does what.
>
> **Corrected topology (both radios 5 GHz-capable is false; the built-in is,
> the dongle is not):**
>
> ```
> Built-in radio (wlan0, brcmfmac, DUAL-BAND) → 5 GHz client → farm router → WAN
> USB adapter   (wlan1, rtl8192cu, 2.4 GHz only) → AP "PigPulse" 2.4 GHz → CCTV + ESP32-S3
> ```
>
> **⚠️ Both USB radios tried on 2026-11-12 were hardware-faulty**, so this
> topology is designed but not yet proven in anger:
> - `rtl8192cu` (RTL8188CUS, no antenna) **works as an AP** — verified with a
>   full WPA2 handshake. But as a *client* its USB endpoint fails:
>   `rtl_usb: Urb has error status 0xFFFFFFB9`, every scan `EBUSY`, surviving
>   `modprobe -r/-` and USB unbind/rebind. It cannot be the WAN client.
> - Atheros AR9271 (the antenna adapter) **never enumerated** — `ath: phyN:
>   Unable to initialize hardware; initialization status: -5` then
>   `usb 1-1.1-port2: Cannot enable. Maybe the USB cable is bad?` ->
>   `unable to enumerate USB device`. It is also 2.4 GHz only.
>
> So the remaining gap is: **one working 5 GHz-capable USB adapter**
> (e.g. RTL8812AU/rtl88x2bu) for the AP role, with the built-in radio on
> 5 GHz for WAN. Until then the Pi's only WAN is the laptop tether.

> **PROVEN END-TO-END 2026-11-16 — the built-in radio does 5 GHz in BOTH
> directions. Read this before repeating any "2.4 GHz only" claim.**
>
> Measured on the Pi (not inferred, not spec-sheet):
>
> - **RX** — `systemctl mask hostapd`, `wlan0` → managed, free scan:
>   `solrahK` at **5180 MHz, -52 dBm** (full 5 GHz beacon: RSN, HT caps,
>   primary channel 36).
> - **TX** — `hostapd` with `hw_mode=a channel=36` on `wlan0`:
>   `AP-ENABLED`, **channel 36 (5180 MHz), 20 MHz, txpower 31 dBm**; the
>   laptop (a separate 5 GHz radio) saw the beacon `PigPulse5GProbe` at
>   **5180 MHz, -49 dBm**. The Pi's 5 GHz antenna path is connected and
>   working — the earlier "5 GHz antenna not connected" claim was wrong.
>
> **`iw dev wlan0 set freq 5745` → `-95` (EOPNOTSUPP) says NOTHING about
> band capability.** Measured: the same call returns `-95` for **2437 MHz**
> (2.4 GHz) as well. brcmfmac refuses `set freq` on a managed interface with
> no associated BSS. In **AP** mode the same call returns **rc=0** for 5180
> and 5745. The `-95` is a driver artifact, not a hardware limit.
>
> **Two traps that manufacture a false "2.4 GHz only" reading:**
> 1. `nmcli dev wifi list` scans **wlan1** (the USB dongle), not `wlan0`,
>    because hostapd owns `wlan0`. Read the radio with `iw`.
> 2. `hostapd.service` has `Restart=on-failure` and **resurrects within
>    ~3 s** of being stopped, re-asserting AP mode on channel 6. A scan
>    taken in that window is **channel-locked to channel 6** and can never
>    see 5 GHz — this is almost certainly what produced the original
>    false reading. For a free scan: `systemctl mask hostapd` → scan →
>    `unmask` → `restart`. **The management path must not depend on the
>    AP**: use the USB-Ethernet link, where the **Pi is 10.42.0.28** and the
>    laptop is 10.42.0.1 (shared mode) — `192.168.69.1` is the AP address
>    and dies with the AP.
>
> **Dongle `wlan1` (RTL8188CUS, USB `0bda:8176`) — why it finds no networks:**
> `iw phy phy1 info` lists **Band 1 only** (2412 MHz) → a **2.4 GHz-only**
> radio, so it can never be a 5 GHz WAN client. Its scans return **0 BSS**,
> but that is the known `rtl8192cu` USB failure (`Urb has error status
> 0xFFFFFFB9`, every scan `EBUSY`), **not** a dead receiver: this same dongle
> completed a full WPA2 handshake when used as an **AP**. So: usable as the
> 2.4 GHz AP role, unusable as a client. It is also not 5 GHz-capable.
>
> **Gap restated precisely (the paragraph above is ambiguous):** the AP role
> must be **2.4 GHz** (CCTV + ESP32-S3 are 2.4 GHz-only), so the *adapter*
> needed is a **reliable 2.4 GHz AP-capable** radio; the *WAN* role needs
> **5 GHz**, which the built-in radio now proves it can do. A **dual-band**
> adapter (RTL8812AU / rtl88x2bu class) covers both and keeps the roles
> swappable, because the two roles cannot share one radio
> (`#channels <= 1`).

A single radio cannot be a WiFi client and an AP at the same time on the
*same band*, so an adapter that becomes the **WAN client would take over the
radio and drop the CCTV and the ESP32-S3** *unless the two roles are split
across the two radios*. Bandwidth is *not* the constraint — the sensors are
tiny. Reach and having any uplink at all are.

**Planned topology — two radios, independent interfaces:**

```
Built-in radio (wlan0, brcmfmac, DUAL-BAND) → client, farm router 5 GHz → WAN  [new]
USB adapter   (wlan1, 2.4 GHz only)           → AP "PigPulse" 2.4 GHz → CCTV + ESP32-S3
```

This is the only option that adds WAN without touching the sensor band. A
USB cellular modem is the alternative that also needs no radio.

**⚠️ Known gotcha — the repo hardcodes `wlan0` as the AP interface in five
places:** `wlan0-static-ip.service`, `config.py:64` (`WIFI_IFACE`),
`admin_console.py:494`, `health_check.py:43`, `pi_diag.py:220`. Plugging in a
USB adapter can renumber interfaces, which would silently move the AP to
`wlan1` and put `192.168.69.1` on the wrong interface — the ESP and CCTV would
drop with no obvious cause. **Pin the AP to the built-in radio by MAC
(udev rule) or set `WIFI_IFACE` per service before relying on this.**

> **Measured 2026-11-12 — the renumber did NOT happen, and two services are
> already parameterised:**
> - `wlan0` = `brcmfmac` (built-in), `wlan1` = `rtl8192cu` (dongle). The AP
>   stayed on `wlan0`; the USB adapter came up as `wlan1`.
> - `config.py` honours `WIFI_IFACE` and `AP_IP` from the environment, and
>   `pigpulse-ap-watchdog.sh` honours `PIGPULSE_AP_IFACE` (default `wlan0`).
>   So moving the AP needs **env changes, not code edits**.
> - The watchdog also hardcodes the stale-ctrl-socket path
>   `/var/run/hostapd/wlan0` in two places — that must follow the new
>   interface name, or the watchdog will not restart a failed hostapd.
> - `wlan0-static-ip.service` and `pigpulse-ap-powersave.service` bind the
>   interface name directly (`ip link set wlan0 up`, `iw dev wlan0 set
>   power_save off`) and need editing, not just an env override.
> - `dnsmasq.conf` has `interface=wlan0` plus `bind-interfaces` — it must
>   follow the AP interface too, or DHCP leases stop.
>
> **Also:** `/etc/NetworkManager/system-connections/GFiber_E9BD4.nmconnection.bak`
> on the Pi holds an 8-character **placeholder**, not the real farm-router PSK.
> The real key is on the laptop in
> `/etc/netplan/90-NM-716869f9-920f-42e7-a79a-7637c1176f68.yaml`
> (`auth: password:`). The laptop keeps **two** profiles for the same SSID with
> the same PSK: one pinned to the 2.4 GHz BSSID on `sta0`, one unpinned on
> `wlo1`. The Pi's saved wifi profile could therefore never authenticate.

**Two decisions this forces:**
1. **Isolation.** The Pi becomes multi-homed. Do **not** forward or NAT between
   the pig AP and the farm LAN — a stray or compromised device on the AP would
   otherwise gain a path onto the farm network.
2. **Subnet collision.** The AP is `192.168.69.0/24`. The farm router must not
   hand out that range.

**Unverified and blocking:** whether the farm router's 5 GHz actually reaches
inside the barn. A USB stick in a metal barn may not get a usable link. **Test
this before buying anything** — a phone hotspot held at the Pi's location is a
cheap proxy. Also unverified: regulatory domain (`iw reg get`, which caps 2.4 GHz
channels 12/13 in some regions), and actual interface enumeration.

#### Two dead links found 2026-09-30 (independent of the uplink)

- **There is no `/cctv` route in the live gateway.** The live config has exactly
  nine locations: `/health`, `/api/`, `/api/realtime`, `/_/`, `/admin/`,
  `/mqtt`, `/thermal-ws`, `/`. The §2 diagram claims
  `tapo_mjpeg → :8091 → proxy → /cctv`; **that proxy was never configured**, so
  the camera was never reachable even from the laptop, let alone remotely.
- **`cloud_sync.py` is not a live-feed mechanism.** It batches PocketBase
  records with a `synced` flag every 60s. Video is a stream and cannot be
  carried that way. "Remote live feed" therefore needs its own design — a relay
  or tailnet access — and that is still undecided.

Once an uplink exists, `cloud_sync.py` should move **onto the Pi**, since the Pi
can then reach both networks and the laptop no longer has to join the AP.

#### 2.4.1 Standalone WAN — built and measured 2026-11-12

**2026-11-13 local-app addition:** `http://192.168.69.1/?setup=1` is the QR
welcome URL. Skip and successful venue connection now open the full Expo app
at `/app/`, statically hosted on the **Pi**, not the laptop. Same-origin
read-only adapters use Pi PocketBase and thermal services; Vercel is optional.
Operator/deploy/rollback instructions: `v3-mqtt-pocketbase/backend/portal/README.md`.
Browser tested against the actual Pi with external requests blocked; physical
phone QR scanning and a long offline soak remain untested. The portal's
`ap.clients` value is DHCP leases, not a count of currently associated clients.

**The Pi no longer needs the laptop.** A 2.4 GHz venue on the AP's own channel
(ch 6 = 2437 MHz) carries real traffic with the tether route removed: `ping
8.8.8.8` 3/3, public IP `180.190.21.160`, `apt-get update` completes, and the
AP keeps its clients throughout. Code lives in
`v3-mqtt-pocketbase/deploy/wan-apsta/` (its README is the operator manual).

| Fact | Measured value |
|---|---|
| Boot association | **7–8 s** after vif-up, two consecutive cold boots |
| Radio at boot | phy parked on **5 GHz ch 34**; `iw dev … set channel` refused (`-95`) |
| Boot scan (`iw scan freq 2412…2472`) | **non-deterministic**: 1 BSS on one boot, **0 BSS on ten straight attempts** on the next, no error |
| Association without any scan | `COMPLETED` in **2 s**, `scans: 0` |
| Default route | `wlan0sta` metric **200**; tether `eth1` metric 100 always wins while plugged |
| Pi's own DNS | `nameserver 127.0.0.1` (its dnsmasq), NM `dns=none` |

**Design rule that follows: the boot path must never scan.** brcmfmac rejects
chanspec work for ~20 s after power-on, so a scan-then-associate boot is a coin
flip. `pigpulse-wan-sta-up` associates from the saved profile (`bssid` +
`scan_freq` + a **global** `freq_list`) and leaves discovery to a separate
`--discover` phase. `freq_list` inside a `network={}` block is silently ignored —
measured: the firmware then picked the venue's 5 GHz BSSID and the association
collapsed.

**`ap_scan=2` is reverted and must stay reverted.** It drops the BSSID from the
request, the firmware picks the venue's 5 GHz BSS, and `#channels <= 1` drags the
shared radio to ch 116 while hostapd still reports 2437.

**Onboarding portal** — `backend/portal/`, plain HTTP on **:80**, no certificate,
no framework, standard library only:

- `GET /` — the first page: Wi-Fi onboarding (with **Skip**), local app tiles
  (`https://192.168.69.1:8080/…`), the optional hosted-site link, live status.
- `/api/status`, `/api/scan` (0.9 s, non-disruptive — scans while the AP
  beacons), `/api/connect`, `/api/skip`, `/api/connect-result`.
- Connect is **asynchronous**: the POST is answered `202` before the radio
  moves, then `pigpulse-portal-connect` stops the AP, applies the venue, and
  writes a result the page polls after it reconnects (~15 s).
- A **failed** attempt restores the previous **venue and uplink**, not just the
  AP config.
- Why not the thermal dashboard: it is HTTPS with a private CA, so a phone that
  has never seen the Pi gets a certificate warning before it has any way to
  trust the cert.
- `:80` is reachable from the venue LAN too (the Pi is a station there), so every
  request is checked against an allowlist — AP subnet, tether subnet, loopback;
  everything else gets `403`. Mutations are POST-only.

> **`/run/pigpulse/ap-hold` is a hard contract.** `pigpulse-ap-watchdog.timer`
> restarts hostapd every ~30 s and brought it back **4 s after `systemctl stop`**,
> mid-association, making every portal connect time out at 90 s. The watchdog
> now exits 0 when that file exists, and `pigpulse-portal-connect` creates it
> (with an `EXIT` trap) for the duration of a venue change. Any future code that
> deliberately drops the AP must do the same.

**App side:** the Expo app's native default is now `http://192.168.69.1:8090`
(PocketBase on the AP gateway, CORS `*`), not the `adb reverse` tunnel. A phone
joined to the PigPulse hotspot therefore needs no laptop at all.

### 2.5 Hardware inventory

> **BOARD RESOLVED 2026-09-30 from a device readout, not a spec sheet.**
> The Pi's own kernel journal records `Machine model: Raspberry Pi 4 Model B
> Rev 1.2`. This closes the long-standing "4B or 5?" contradiction between
> `docs/ARCHITECTURE_V3_20260914.md` (Pi 5) and `RIG_DEVICE_INVENTORY.md`
> (Pi 4B) — **the board is a Pi 4B.** The `kernel_2712.img` / `bcm2712-*.dtb`
> files on the boot partition are just the standard multi-board firmware set
> and prove nothing.
>
> Also measured from the same boot: `cfg80211.ieee80211_regdom=PH`, which
> caps 2.4 GHz to channels 1-11. hostapd uses `channel=6`, so it is legal —
> but do not move it to 12/13 on this board.

|---|---|---|
| **Pi 4B Rev 1.2** | edge: thermal + ingest + AP + PB | ✅ **booted and serving** as of 2026-09-30 |
| **MLX90640** | thermal camera, I²C on Pi | ⚠️ **intermittent** — working as of 2026-10-13 (~2 FPS, confirmed by Master 2026-10-29). Has died and recovered before (dead 2026-09-28, back by 2026-10-13). Run `thermal_doctor.py --fix` if it drops again. A live sample on **2026-11-17** read ~1.98 FPS with a valid frame over MQTT, **but a transient I²C `Remote I/O error` preceded it the same day (§0.9) — the recovered sample does NOT eliminate the recurrence risk** |
| **ESP32-S3** (`s3-mic-01`) | the ONLY mic. TCP :9090 audio, MQTT telemetry | ✅ **USB accessible** (2026-10-13, §1). Firmware `pigpulse-mic-pcm16-20261013` deployed; 2026-11-03 wire reports build `pigpulse-mic-sht45-20261019` (SHT45-aware) with ~1 Hz telemetry and nonzero audio (`nonzero=99.9%`). Mic hardware intermittent — produced real audio 2026-10-13, returned all-samples-minus-one 2026-10-14. Master confirms working as of 2026-10-29. See `KNOWN_GOOD.md` for revert |
| **GY-SHT45** | environmental temp/humidity sensor (I²C on ESP32-S3) | ✅ **WORKING and live as of 2026-11-13** — was never a hardware fault. The sensor had been reporting real values all along (measured 34.2–35.6 °C / 62–66 % RH); the readings were being **thrown away in transport**. The trailing-comma JSON bug below is real but it is **NOT the whole cause** — see **§0.1** for the corrected diagnosis and the fix that actually landed (firmware `pigpulse-mic-sht45-20261113-shtretry`, verified: the ambient fragment now rides on 59 of every 60 messages and the PocketBase zero-rate is **0.0%**). The build (`pigpulse-mic-sht45-20261111-pilevel`) appended a `drops` fragment ending in `"txp":%ld,` — a **trailing comma before `}`** — so a strict `json.loads` rejected 60 of 61 messages (`Illegal trailing comma before end of object`). **The comma was removed** in `pigpulse-mic-sht45-20261113-nowriteblock` (archived, sha256 `db8f1641…`) and `backend/bridge/json_lenient.py` (`loads_lenient`) remains as belt-and-braces. **Two further defects** accounted for the rest: the publish gate discarded the cached reading on any transient failure, and **PubSubClient's 384-byte buffer capped the payload at 353 bytes** (it had crept to 346 — seven bytes of margin), silently dropping whole telemetry messages. The SHT45's **I²C connection still NACKs intermittently** (`sle=2`); the firmware now tolerates it, **the wiring needs attention**. OTA is available (ArduinoOTA UDP 3232, `~/ota/ota-flash.sh`); the ESP32-S3 has no USB serial on the Pi. Measures pen-air context; must NOT replace MLX90640's internal temperature compensation — see §2.7 |
| **Tapo C200C** | CCTV, RTSP → MJPEG | ⚠️ video reachable on Pi AP only. Management API blocked (needs cloud-owner password). See §8 |
| ~~ESP32-D0WD~~ | original node | ☠️ **DECOMMISSIONED — do not resurrect** |
| ~~INMP441 on Pi GPIO~~ | fallback mic | ☠️ **REMOVED 2026-09-29** |

> **HARDWARE STATUS — the Pi is ONLINE as of 2026-09-30.** It booted and served
> the dashboard over HTTPS at `https://192.168.69.1:8080` with a working secure
> context. Read at boot: `Machine model: Raspberry Pi 4 Model B Rev 1.2`,
> `cfg80211.ieee80211_regdom=PH`.
>
> ⚠️ **TWO SD CARDS EXIST AND THIS MATTERS.** The card that was repaired on
> 2026-09-30 (crash fix, thermal fields, migration reconciliation, new TLS
> cert) was **not** the card in the Pi. The Pi booted a different card, which
> had been in the `import admin_console` crash loop since 2026-09-28 13:35 and
> therefore had never read the sensor since 12:04. **Always confirm which card
> is booted before diagnosing the Pi.** See §2.6.
>
> Consequently: treat every Pi-side capability claim in this repo as
> unverified until read off the device.
>
> There are **no** CPU, thermal, throttling, memory, or SD-endurance
> measurements for the Pi in this repository, and none may be invented from a
> spec sheet. Before quoting a Pi number, read it off the device:
> `/proc/cpuinfo`, `/proc/meminfo`, `vcgencmd measure_temp`,
> `vcgencmd get_throttled`, `lsblk`, `dmesg | grep -iE 'mmc|ext4|throttl'`.
>
> **2026-10-13 update:** both audio and thermal were confirmed working (§1).
> ESP32-S3 USB is accessible — the "WEDGED" note from 2026-09-27 is resolved.
> Firmware `pigpulse-mic-pcm16-20261013` was flashed and produced recognizable
> audio. Thermal ran at ~2 FPS. ~~The laptop rig continues to show **seeded demo
> data** — live sensor data has not yet reached the laptop PocketBase (see §2.1:
> `cloud_sync.py` is built but never tested end-to-end).~~
> **SUPERSEDED — see §0.3.** The Pi→cloud sync is live and working: 649,685
> telemetry rows on the laptop PocketBase, 574,070 of them `s3-mic-01` and
> 71,042 `pi-thermal-01`, the freshest seconds old. The `synced` flag genuinely
> toggles. The 41 remaining seeded rows are all `esp32-00x` from 2026-09-02.

> The removed Pi GPIO mic used `dtoverlay=googlevoicehat-soundcard`, which needs
> a physical codec chip this board does not have. It returned **bit-exact zeros**
> (1,920,000 samples, all exactly 0, both channels — a null source, not a quiet
> room). Do not re-add the overlay without a real codec present.

### 2.6 PocketBase 0.22.20 and `.js` migrations — corrected 2026-11-03

> **The 2026-09-30 claim ("0.22.20 CANNOT run `.js` migrations") is superseded
> by direct measurement.** On 2026-11-03 the shipped 0.22.20 binary executed
> old-style `.js` migrations (`migrate((db) => {…})` with `new Dao(db)` —
> exactly the format these files use), in four checks:
>
> 1. Sandbox probe: `pocketbase migrate up` against a copy of the live laptop
>    DB with a throwaway `.js` printed `Applied`, added the field, and
>    recorded the `_migrations` row.
> 2. The real `1798100000_updated_telemetry_add_humidity.js` applied against a
>    consistent snapshot of the **Pi's** DB state: `Applied`, field declared
>    with the expected schema JSON.
> 3. **Live on the Pi**: the file was copied into
>    `/home/pigpulse/pocketbase/pb_migrations/` and
>    `pigpulse-pocketbase.service` restarted — PocketBase itself applied it at
>    startup (2026-11-03 08:44:24 local; the `_migrations` row carries PB's own
>    microsecond timestamp), and a real ESP32-S3 telemetry row then
>    round-tripped with humidity stored (33.43 °C / 72.22 %).
> 4. The laptop instance auto-applied the same file at its 2026-11-03 04:31
>    boot (service `ActiveEnterTimestamp` matches the `_migrations` row).
>
> What remains true from 2026-09-30 and still applies:
>
> 1. `ALTER TABLE telemetry ADD COLUMN …` **alone** is not enough —
>    PocketBase serves only fields declared in the `_collections.schema`
>    JSON, so an undeclared column is silently discarded. A migration writes
>    both halves (SQLite column + schema JSON) and records itself.
> 2. Migrations must exist in **each instance's own** `pb_migrations/` before
>    that instance's next boot — the laptop and the Pi are separate stores;
>    copying to one does nothing for the other.
> 3. Renaming a migration file fixes one database and breaks the other — that
>    happened on 2026-09-30 and put the laptop's `pigpulse-pocketbase.service`
>    into the same crash loop. Reconcile both in the same change.
> 4. `backend/scripts/add_thermal_fields.py` remains a working manual fallback
>    that writes both halves (it was used for the thermal fields).
>
> **`deploy/pocketbase/bin/pb_migrations/` and `bin/pb_data/` are the LAPTOP's
> live instance** (and are gitignored — deploy state, not source). The Pi
> keeps its own copy at `/home/pigpulse/pocketbase/`.

### 2.7 Sensor fusion — what is grounded vs. aspirational (2026-10-29; radiometry addendum 2026-11-04)

> Researched against peer-reviewed literature; every claim below carries its
> provenance. The objective is **whole-pen monitoring**, not close-range
> individual measurement. "This pen needs attention" is the primary alert;
> individual pig attribution is conditional on image quality supporting it.

**Monitoring objective.** A variable-size pen is covered by the cameras; the
system watches the group. Individual attribution happens only where resolution
and visibility allow it.

**Environmental sensor (GY-SHT45).** Measures representative pen-air
temperature/humidity for environmental context. Placement rules:
near the monitored area at animal height, thermally isolated from electronics,
in a ventilated shaded guard, wired to the ESP-S3 over I²C. **SHT45 data must
NOT replace MLX90640's internal temperature compensation** — the
`CalculateTo()` function takes only `emissivity` and reflected temperature;
it has no humidity or distance parameter. Environmental correction requires
its own validation before adoption. **Connected and reporting as of
2026-11-03** — fresh readings (~33-34 °C / ~72 % RH) arrive in the s3-mic-01
telemetry bursts, are live on the Pi dashboard (`/ambient`) and store in
PocketBase. (The earlier note "owned but unconnected/untested as of
2026-10-29" is superseded.)

**Modality capability matrix:**

| Sensor | What it CAN do (demonstrated) | What it CANNOT do |
|---|---|---|
| **MLX90640 thermal** | Pen-level surface-temperature patterns; group thermal trends; display via bicubic interpolation | Individual pig temperature at pen distances (each pixel ≈ 6×5 cm at 2 m for the D55 variant; the mounted unit is expected to be the wide-D110 — unverified — which doubles the footprint to ≈ 12×10 cm, see the 2026-11-04 addendum below); SR cannot recover optics-averaged detail or improve ±1.5°C sensor accuracy |
| **Mono mic** | Detect THAT a cough happened (94–99% accuracy, heavily published) | Direction, distance, or which pig — physics: one mic encodes zero spatial information |
| **Tapo CCTV** | Detect/count pigs (YOLOv8n 97.6% mAP); short-term tracking (minutes, Deep SORT-P 89.6% MOTA); group activity | Reliably identify unmarked same-breed pigs over hours; ear-tag reading at pen distance; real-time 30 FPS on Pi 4B |
| **SHT45** | Representative pen-air temperature/humidity context | Replace thermal internal calibration; directly convert surface to core body temperature |

**Thermal super-resolution is FORBIDDEN for temperature measurement.** No
peer-reviewed SR work exists below 80×64 (the MLX90640 is 32×24); RGB-guided
SR demonstrably transfers visual textures (fur, shadows, pen markings) into
the thermal image as false temperature edges — actively harmful for fever
detection. Bicubic interpolation for dashboard display is the honest path.
Thermal re-ID claims from `training_data/.edge_impulse/reid_simulator.py` are
**disproved** — do not cite them (§3.2).

**Audio-visual cough attribution is the strongest demonstrated fusion path.**
Chae et al. 2024 (*Sensors* 24(22):7232, PMC11598093) achieved **95% top-1
accuracy** identifying which pig coughed with exactly PigPulse's hardware —
one mono mic + one overhead camera. The mechanism is NOT acoustic
localization: audio detects the cough window (SED-CRNN), YOLO finds each pig,
and a cross-attention network checks which pig's body showed cough-consistent
convulsive motion (analogous to active-speaker detection). Requirements:
labeled training data, sufficient lighting, one-cough-at-a-time windows. The
published model ran on an RTX 2070 — Pi 4B feasibility requires optimization
and is unvalidated.

**Acoustic multi-mic localization exists but needs hardware PigPulse does not
have.** 2 mics = crude one-axis direction; 3+ = 2D position (TDOA/GCC-PHAT).
Demonstrated in piggeries: Silva 2008 (7 mics, 0–1.5 m error) and Cao 2026
(8-channel array + voiceprint DB, 91–98% per-pig F1). GCC-PHAT runs fine on a
Pi 4B (8.6 ms/frame) — this is a future path if a mic array is ever added.

**Individual pig identification without physical markers (paint marks, RFID)
remains an open research problem** for same-breed same-color pigs from 2D
video over long durations. Painted back-marks (side-view tolerant,
BMCTrack-d 2026) or RFID+CV hybrid (97% tracking accuracy, Mora 2024) are the
proven routes if ever needed. Ear-tag reading from a pen camera is unreliable;
face recognition requires close-up frontal images.

**Thermal–visible fusion must be position-level late fusion** (match
thermal blobs to CCTV-detected pigs via a calibrated homography; F1 93.0%
demonstrated, Dionne-Pierre 2025). Pixel-level fusion of 32×24 thermal with
1080p visible is meaningless.

**Pi 4B vision math (hard ceiling):** YOLOv8n via NCNN ≈ 2–3 FPS inference;
end-to-end RTSP + tracking ≈ 1–2 FPS. This is sufficient for health
monitoring (respiratory distress develops over hours), NOT for real-time 30
FPS anything. A Coral USB TPU (~$60) lifts lighter models to 5–15 FPS.

**Radiometry wiring — live 2026-11-04 (commit `b87332f`); three scope
corrections from code-trace + live decomposition.** `radiometry.ZoneFeverPipeline`
(drift comp → per-pixel baseline → zone scoring) now runs inside the live
`web_server.py` feed; kill switch `PIGPULSE_RADIOMETRY=0` restores the legacy
scalar path. Facts that are easy to get wrong:

- **SHT45 ambient is NOT an input to the fever math.** In the pipeline path
  `ambient_c` is used in exactly one place — `t_refl_c = ambient − 8 °C`
  (ta_shift, Melexis self-heating convention; verified live 2026-11-04:
  32.93 °C ambient → `reflectedTempC` 24.94) — and that value is only
  *recorded* in `/data`, never used in verdicts. Verdicts come from drift +
  baseline + zones, scene-relative by design (a whole-field ambient swing
  must not read as fever). The SHT45 fixes dashboard room numbers, THI, and
  the legacy fallback path — nothing else. The §2.6 internal-Ta discrepancy
  (43.6 vs 31.1 °C, ~1.25 °C over-pull) applied to the LEGACY compensator
  (`pull = (EMA − 25) × 0.1`), which the pipeline path bypasses.
- **`center` semantics changed under the pipeline.** Legacy: smoothed 3×3
  cluster average. Pipeline: zone-of-interest peak (`roiPeakC`). A "+2 °C"
  delta between paths is methodology + drift, not a calibration fix — compare
  like with like.
- **`driftMode: "frozen"` is normal operation, not a fault** (no reference
  thermometer in view): the first 8 frame medians set the zero point, only
  drift away from it is removed, clamp ±2.5 °C, EMA α = 0.2
  (ReferenceDriftCompensator, Jiao et al. 2022). `refMedianC` stability is
  the tell that the correction absorbs sensor drift rather than scene change
  (2026-11-04: absorbed 1.52 °C, refMedian moved ~0.2 °C — stable).

**Field-of-view variant — expected D110, UNVERIFIED (2026-11-04).** The
mounted MLX90640 is *supposed to be* the 110°×75° wide-angle variant
(Master, 2026-11-04). No variant readout exists over I²C — the part number
sits on the module silkscreen only — so this stays unverified until the
physical test: film a known-width object at a known distance and compare the
measured angular span against the datasheet (datasheet-derived: D55 ≈
1.7°/pixel ≈ 6×5 cm per pixel at 2 m; D110 ≈ 3.4°/pixel ≈ 12×10 cm at 2 m —
spec-sheet values, not measured). If D110: whole-pen framing is unaffected,
individual-pig attribution is strictly worse, and the reference mask / zone
geometry should be re-checked against the wider scene before trusting zone
verdicts.

**Scene lesson (2026-11-04 bulb bench).** Scenes evolve: the bulb heated the
whole room (ambient 32.9 °C / 71 % RH → THI 85.9, "severe"), frame minimum
rose to 33 °C with ~43 % of pixels ≥ 36.5 °C. A latched FEVER on a bulb
hotspot is *expected* (alerts latch, no spam; verdict settled to NORMAL as
history accumulated). Without pigs in view, verdicts are scene-relative
sanity only — animal-health claims stay gated on pig-scene validation.
THI bands (<74 ok / 74–78 mild / 78–82 moderate / ≥82 severe) follow general
livestock convention; some swine sources place severe at ≥83 — variance
acknowledged, no code change warranted (85.9 is severe under any variant).
CCTV was offline this day ("no camera answering on any candidate"), so blob
identity was inferred numerically from the thermal frame, not visually.

### 2.8 Soak monitoring — live 2026-11-05

`pigpulse-soak.service` (Pi; unit
`v3-mqtt-pocketbase/backend/systemd/pigpulse-soak.service`) runs
`soak_collect.py` continuously → `/home/pigpulse/soak/soak.db` (SQLite, WAL):
10 s samples of CPU temp/throttle, thermal/ambient state, ESP + MQTT health,
PocketBase rates, plus state-change events (`esp_change`, `amb_state_change`,
`th_ok_change`, `bench_start/end`). Interface doc (authoritative):
`v3-mqtt-pocketbase/docs/SOAK_CONTRACT.md`. Tools
(`v3-mqtt-pocketbase/backend/scripts/`): `soak_report.py` (PNG+MD+HTML),
`soak_live.py` (read-only SSH stream), `soak_bench.py` (thermal capability
bench — runs ON the Pi).

- **WAL rule:** never `scp soak.db` while the collector runs — snapshot on
  the Pi via the SQLite backup API first
  (`docs/SESSION_ROLLOUT_20261105.md` §6). A plain file copy misses
  un-checkpointed commits (tested 2026-11-05).
- The collector is **autonomous**: it keeps recording with Wi-Fi, laptop, or
  the thermal pipeline down; nothing else needs to run for the dataset to grow.

---


## 3. CANONICAL PATHS

Everything below is under `/home/solrahk/pig-health-monitor/`.
Branch: **`feat/v3-mqtt-pocketbase`**

| Component | Canonical path |
|---|---|
| Mobile app (Expo) | `v3-mqtt-pocketbase/frontend/mobile_app/` |
| Landing page (Vercel prod) | `v3-mqtt-pocketbase/frontend/landing_page/` |
| **Pi edge backend** | `v3-mqtt-pocketbase/backend/` |
| ├ thermal-pi | `v3-mqtt-pocketbase/backend/thermal-pi/` |
| ├ MQTT→PB bridge | `v3-mqtt-pocketbase/backend/bridge/` |
| ├ CCTV | `v3-mqtt-pocketbase/backend/cctv/` |
| ├ ops scripts | `v3-mqtt-pocketbase/backend/scripts/` |
| ├ soak monitoring | `v3-mqtt-pocketbase/backend/scripts/soak_*.py` (§2.8, 2026-11-05) |
| └ **systemd units** | `v3-mqtt-pocketbase/backend/systemd/` |
| Firmware (ESP32-S3) | `v3-mqtt-pocketbase/firmware/esp32s3-mic-ambient/` |
| PB migrations | `v3-mqtt-pocketbase/deploy/pocketbase/bin/pb_migrations/` |
| Gateway (nginx) | `v3-mqtt-pocketbase/deploy/openresty/` |
| Simulator (research) | `v3-mqtt-pocketbase/tools/simulator-web/` |
| Read-only PB proxy | `v3-mqtt-pocketbase/backend/workers/readonly_pb_proxy.py` |
| Serverless telemetry fn | `v3-mqtt-pocketbase/frontend/mobile_app/api/telemetry.js` |
| **Frozen reference** | `legacy/` (see §3.1 — reference only, never build) |

### 3.1 FROZEN / NON-CANONICAL — do not edit, do not revive

**Moved 2026-09-30:** the two frozen frontend/firmware trees were moved out of
the repo root into `legacy/`, under one README that explains what they are and
why they must not be built. They sat at the root with plausible filenames
(`firmware/platformio.ini`, `landing_page/index.html`), which is not a
hypothetical hazard: on 2026-09-30 a repo copy of the OpenResty config was read
as if it were the live one, and the two had diverged into entirely different
architectures.

| Path | Why |
|---|---|
| `legacy/firmware/` | Firebase-era D0WD tree. Frozen; the D0WD is decommissioned. See `legacy/README.md`. |
| `legacy/landing_page/` | Stale Firebase-era subset. Production is the v3 path. |
| `docs/` (root) | Dated reports. `docs/ARCHITECTURE_V3_20260914.md` is superseded by §2 of this file. |
| `downloads/` | Vendor reference material (Melexis MLX90640 datasheet/gerber). Reference only. |
| `youtube/` | Media reference. Not needed to build or run anything. |
| `v3-mqtt-pocketbase/.github/` | **DEAD** — GitHub only loads workflows from the repo root. Delete it. |
| `scripts/simulation/`, `scripts/firebase/` | **DELETED 2026-09-29.** Firebase-era, broken. |

**Never** reuse the legacy firmware's MQTT topic scheme (`pig/telemetry/{x}`);
the bridge expects `pig/{deviceId}/{channel}` (see §2.2).

**A CI job (`path-guard`) fails the build if `firmware/`, `landing_page/`, or
`mobile_app/` reappears at the repo root, and if any `legacy/` tree loses its
`NON-CANONICAL.md` marker.**

### 3.2 Non-canonical supplementary directories

| Path | What it is | Status |
|---|---|---|
| `training_data/.edge_impulse/` | Early TinyML exploration scripts (2026-09-02). Simulated data only — no real audio samples, no trained models, no Edge Impulse project. `reid_simulator.py` claims thermal re-ID works on 32×24 — **disproved by peer-reviewed evidence** (see §2.7). Do not cite it. | 📦 Historical — do not extend |
| `.planning/` | GSD planning artifacts from 2026-09-12. **Outdated:** references ESP32-D0WD (decommissioned), dual INMP441 (we have 1 mic on ESP32-S3), and ±0.5°C accuracy (datasheet says ±1.5°C). If reading these files, cross-check every claim against this canon. | ⚠️ Stale — this canon supersedes on every conflict |
| `.opencode/` | Antigravity/OpenCode session state. Automatically generated, not project content. | Transient — gitignore |
| `tools/` (repo root) | Empty orphan directory, root-owned. Real simulator is at `v3-mqtt-pocketbase/tools/simulator-web/`. | ⚠️ Delete when convenient |

### 3.3 Branch inventory (verified 2026-10-29)

| Branch | Last commit | What it is | Status |
|---|---|---|---|
| **`feat/v3-mqtt-pocketbase`** | 2026-09-30 (137 commits) | **CANONICAL.** V3 MQTT+PocketBase architecture — all active work. 81 commits ahead of master. Pushed to Codeberg + GitHub. | ✅ **Use this** |
| `master` | 2026-09-01 (56 commits) | Historical base. `feat/v3-mqtt-pocketbase` branched from its tip. | 📦 Keep |
| `defense-final-candidate` | 2026-04-18 (13 commits) | First capstone defense submission snapshot. Firebase era. | 📦 Keep — defense archive |
| `fix/local-firmware-app-integration-20261014` | 2026-09-30 | **Identical** to `feat/v3-mqtt-pocketbase` (same commit, zero divergence). | 🗑️ **Deleted 2026-10-29** — archived as tag `archive/fix-local-firmware-app-integration-20261014` |
| `feature/landing-page-mobile-fixes` | 2026-05-26 | Already merged into master. | 🗑️ **Deleted 2026-10-29** — tag `archive/feature-landing-page-mobile-fixes` |
| `production` | 2026-06-02 | Stale copy of master + 1 utility commit. | 🗑️ **Deleted 2026-10-29** — tag `archive/production` |
| `sandbox-lab` | 2026-06-14 | 1 commit past production: AI-generated research docs. | 🗑️ **Deleted 2026-10-29** — tag `archive/sandbox-lab` |

**Deletion policy:** deleted branches are recoverable via `archive/<branch-name>` tags — never hard-delete a snapshot. `v5-1-full-power` remains (pre-defense experiment, Master's call; checked out in the `/tmp/pigpulse-v5-1` worktree).
| `v5-1-full-power` | 2026-04-16 | Pre-defense experiment. Subset of `defense-final-candidate`. Worktree at `/tmp/pigpulse-v5-1`. | ⚠️ Safe to delete |

**Remotes:** `origin` = Codeberg (`git@codeberg.org:Solrahk/pig-health-monitor.git`), `github` = GitHub (`git@github.com:xkarma31-blip/pig-health-monitor.git`). Both have `feat/v3-mqtt-pocketbase` pushed.

---

## 4. DEPLOYMENT

| What | How |
|---|---|
| **Landing + dashboard (the only web deploy)** | `~/.local/bin/pigpulse-autodeploy.sh` (cron, 5 min) or `scripts/deploy-landing.sh` |
| Pi backend | `rsync` repo `backend/` → `/home/pigpulse/`, then `systemctl restart` |
| Soak collector (Pi, since 2026-11-05) | deployed copy `/home/pigpulse/scripts/soak/soak_collect.py`; re-rsync + `systemctl restart pigpulse-soak` after edits |

- The web deploy is **combined**: the autodeploy stages the Expo export under
  the landing's `app/` before every push. Deploying the landing alone silently
  kills the dashboard, so the script also holds `.env` out of the export and
  refuses to deploy if `admin123` or `127.0.0.1` dev URLs appear in the bundle.
- **Vercel project `pig-health-monitor`** → `https://pig-health-monitor.vercel.app/`
  - `/` = landing page (must stay the root)
  - `/app/` = Expo web shell, `/app/tabs` = dashboard
  - `/api/telemetry?collection=telemetry|alerts|pigs|devices` = read-only JSON
- `pig-health-research-portfolio.vercel.app` = secondary alias, not canonical.
- **`scripts/deploy.sh` is DISABLED** — it deployed the stale app over the
  landing page. Do not re-enable; use the commands above.

### 4.1 Admin surface — loopback only

PocketBase serves its admin UI at `/_/`, and the gateway's catch-all
`location /` proxied to it, so admin used to ride the public API path. The
gateway now returns **403** for `/_/` and `/admin/`.

| Access | Result |
|---|---|
| `http://127.0.0.1:8090/_/` | 200 — admin UI, **loopback only** |
| `http://127.0.0.1/_/` via gateway | **403** |
| `http://127.0.0.1/api/health` | 200 |

There is **no port 8091**. Any doc saying otherwise is stale.

The live gateway config lives at
`/usr/local/openresty/nginx/conf/nginx.conf`. The repo copy
(`v3-mqtt-pocketbase/deploy/openresty/conf/nginx.conf`) is now a verbatim copy
of it — they had diverged into different architectures, which caused a real
outage on 2026-09-30. After editing the live file: `openresty -t` then
`openresty -s reload` (`systemctl reload openresty` is a silent no-op here).
Backups: `nginx.conf.bak-20260930`, `nginx.conf.bak-20260930b`.

### 4.2 The read-only telemetry proxy (laptop)

`backend/workers/readonly_pb_proxy.py` on `127.0.0.1:8099`, published to the
internet by Tailscale Funnel, reached only by the Vercel function.

- systemd unit: `pigpulse-readonly-proxy.service`; key in
  `/etc/pigpulse/readonly-proxy.env` (root-only, **not** in the repo).
- Env secrets `PB_PROXY_URL` / `PB_PROXY_KEY` live in the Vercel project.
- Funnel off: `tailscale funnel --https=443 off`.
- To shut off the whole public data path, stop the unit and the funnel.

---

## 5. SECRETS

Credentials are **never** in the repo.

| What | Where it lives |
|---|---|
| PocketBase admin | `/etc/pigpulse/bridge.env` on the Pi (`EnvironmentFile=`) |
| ESP32-S3 WiFi | `firmware/.../secrets.h` — template only, real values untracked |
| Camera RTSP | `cctv/tapo_mjpeg_server.py` — **still hard-coded, needs moving** |
| AP WPA2 | `/etc/hostapd/hostapd.conf` |

`local_bridge.py` **refuses to start** without `PB_EMAIL`/`PB_PASSWORD` rather
than falling back to a default. `.husky/pre-commit` blocks keys/JWTs/PEMs.
`trufflehog` runs in CI.

> Removing a secret from the tree does not invalidate it. **Rotate on the
> server side.**

---

## 6. KNOWN OPEN ITEMS

> Re-verified 2026-10-29 in a full Q&A review with Master.

| # | Item | State |
|---|---|---|
| 1 | Pi ↔ cloud sync | ⚠️ **built** 2026-09-29 — see §2.1. **Never tested end-to-end.** Still needs `sync.env` on the laptop and a first real run against Pi data |
| 1b | Pi PocketBase now bound to `192.168.69.1` | ✅ so the laptop can read it. Anything on the AP can reach the admin API — the password is mandatory for that reason |
| 2 | `setup_pocketbase.py` stale vs migrations | still stale — use `pb_migrations/`, not that script |
| 3 | `deploy/systemd/` empty — laptop units unversioned | not done |
| 4 | Camera RTSP creds hard-coded in source | not moved |
| 5 | LWT/`status` topic missing from ESP32-S3 firmware | `devices` rows go stale |
| 6 | `pig/+/audio` has no publisher | orphaned contract |
| 7 | **Pi has no WAN.** AP is an isolated island. Tailscale cannot help on its own — see §2.4 | blocks all remote access. Router mode armed and inert (§8) — any upstream will activate it |
| 8 | TLS cert has no `192.168.69.1` SAN | ✅ **fixed** 2026-09-30 — the generator already handled it (it had just never been run). Cert is valid to 2029-01-02. The phone must re-accept it once, fingerprint changed |
| 9 | **No `/cctv` route exists in the gateway** | ⚠️ **partly wrong**. The *Pi's* `/cctv` route **does** exist (`web_server.py`, proxies to `127.0.0.1:8091`). The gap is the **laptop's** OpenResty gateway only. The MJPEG server is now loopback-only (2026-09-30), which is safe *because* thermal-pi proxies it |
| 10 | **`cloud_sync.py` cannot carry live video** | design gap — see §2.4. It syncs PocketBase *records* on an interval, not a stream |
| 11 | **`PB_PASSWORD` unknown** — bcrypt, unrecoverable | 🔴 **still blocks the bridge** (confirmed 2026-10-29). `/etc/pigpulse/bridge.env` exists with `PB_EMAIL=admin@pigpulse.local` and a blank password. The bridge now *refuses to start* without it, by design. Reset with `~/pocketbase/pocketbase admin create admin@pigpulse.local <new>` (v0.22 uses `admin`, not `superuser`) |
| 12 | **MLX90640 I²C** | ⚠️ **intermittent** — was dead (EIO) after 2026-09-28, recovered by 2026-10-13 (thermal live at ~2 FPS per §1). Master confirms working as of 2026-10-29. Run `thermal_doctor.py --fix` if it drops again. A 2026-11-17 sample read ~1.98 FPS / valid frame over MQTT **after** a transient I²C `Remote I/O error` the same day — **recovered, not fixed** (§0.9). **Archive working state per R8 after next confirmed session** |
| 13 | ESP32-S3 USB | ✅ **fixed** 2026-10-13 — USB accessible, firmware flashed and verified. Older "WEDGED" notes are historical (§1). Known-good binary archived in `KNOWN_GOOD.md` |
| 14 | **Two SD cards in circulation** | 🔴 **still unlabeled** (confirmed 2026-10-29). See §2.5. Always confirm which card is booted before diagnosing |
| 15 | `pigpulse-cloud-sync.service` is a dead copy in the Pi image | not enabled (correct) but has `User=solrahk` + `/home/solrahk/...` paths and a non-optional `EnvironmentFile=`. It belongs to the laptop only |
| 16 | Desktop services on an edge box | `cups`, `wayvnc`, `bluetooth`, `lightdm` all enabled on the AP. `wayvnc` is now configured for TigerVNC (`enable_pam=false`, `password=…`, `allow_broken_crypto=true`) because **DES auth does not work with PAM** |
| 17 | AP passphrase is `capstone`, broker `allow_anonymous true` | known open. Fine for a barn, but these two plus loopback-only CCTV are the whole exposure surface |
| 18 | **Tapo SD recording cannot be armed or read app-less** | 🔴 open — management API needs the cloud-owner password (a friend's account). Full measured picture in **§8**. Offload pipeline is built and live (no-op until a credential exists) |
| 19 | **Camera SD card is dying** — kernel-confirmed FAT read failures; caused the recorder wedge (137 blank shells) | ✅ **salvaged 2026-10-21: all 87 finalized clips archived** at `backend/recordings/sdcard-archive-20261021/` (~25 GB, playability verified from archive; the 137 shells held no data — 0xFF throughout). **Card retired — never reuse. Replace with an endurance-rated microSD before runbook Phase 4** |

---

## 7. HOW TO VERIFY, NOT GUESS

```bash
npm run health:local     # laptop rig health (rig-aware)
npm run diag:pi          # SSH to the Pi and run the 11-section diagnostic
npm run ci:backend       # byte-compile + bash -n every backend file
python3 backend/scripts/pi_diag.py   # ON the Pi — the best diagnostic here
```

**Hardware claims require a device readout.** Never write "confirmed" about
a board, a mic, or an I2C bus from a spec sheet or from the laptop. Zeros ≠ a
quiet mic — zeros mean the line is not being driven.

---

## 8. TAPO C200C CCTV — MEASURED FACTS & AP-LESS ACCESS (2026-10-21)

Everything below was read off the device (ONVIF over :2020, ffprobe over
RTSP, journalctl) — not from spec sheets.

### Identity (measured)

| Fact | Value |
|---|---|
| Model / HW / FW | Tapo **C200C**, HW 5.0, FW 1.2.1 Build 250324 |
| Serial / MAC | `7461d4be` / `18:69:45:fb:d4:be` → dnsmasq pins it at **192.168.69.2** |
| Streams | RTSP `:554/stream1` = 1080p H264 + `pcm_alaw` audio (camera has its own mic); video encoder BitrateLimit **1572 kbps** |
| ONVIF | `:2020` open, auths with the Camera Account (digest WS-Security) |

### The access split (why pigpulse/capstone is not enough)

| Door | Credential accepted on this firmware |
|---|---|
| RTSP `:554` — video/audio | **Camera Account** (`pigpulse`/`capstone`) ✅ |
| Management API `:443` — settings, SD record plan, recordings, speaker | **TP-Link cloud-owner password only** (SPAKE2+, verified offline on-device). Camera Account rejected — measured |

The camera's cloud binding belongs to a friend's TP-Link account. Master's own
password and `capstone`-as-cloud-password were both tried cleanly (post-lockout)
and rejected — measured. Consequence: **arming SD recording, reading record
state, and pytapo clip download are all blocked** until either the friend
taps it in their logged-in app / shares their password, or the camera is
factory-reset and rebound to Master's account.

**Login lockout:** ~30 min suspension after a few failed logins, enforced
on-device (fires even with no WAN). Probe auth sparingly.

### ONVIF surface (Camera Account works here)

Works: `GetDeviceInformation`, `GetProfiles`, `GetSystemDateAndTime`,
`GetReplayUri` (returns an **empty** URI — decoy), `SetSystemDateAndTime`.
Unimplemented (HTTP 500): the whole `trc` recording service (`GetRecordings`,
`GetRecordingSummary`, capabilities), snapshot URI, storage config.
⇒ **ONVIF cannot read or arm SD recording.** It did fix the clock.

### Router mode (2026-10-21) — the air-gap is now conditional

Master asked for internet sharing; deployed on the Pi and **version-controlled**
(`backend/systemd/pigpulse-router.service` + `nftables-pigpulse.conf`):

- `net.ipv4.ip_forward=1` (`/etc/sysctl.d/90-pigpulse-router.conf`)
- nft NAT: any barn-subnet traffic leaving via **any interface except wlan0**
  is masqueraded — upstream-agnostic (eth0, phone-tether usb0, whatever works)
- dnsmasq now announces the Pi as gateway + DNS (`dhcp-option=3/6`)
- `pigpulse-router.service` re-arms all of it on boot

**State: armed and inert.** eth0 has carrier but the far end runs **no DHCP
server** (measured: dhcpcd fell back to 169.254.x). The moment ANY upstream
exists — working ethernet lease or **phone USB-tethered to the Pi** — the whole
PigPulse AP gets internet with zero further configuration. Revert:
`systemctl disable --now pigpulse-router && nft delete table inet pigpulse_nat`
+ remove the two dnsmasq lines.

Consequences once an upstream appears: Tapo app badge flips to Online (camera
reaches TP-Link cloud), Tailscale enrol becomes possible on the Pi, cloud sync
simplifies. The "isolated island" hard rule above is superseded **only
outbound** (NAT; no inbound ports open).

### Clock incident (fixed)

Until 2026-10-21 the camera's calendar was pinned ~20 days behind (local date
stuck at 2026-09-30; time-of-day correct). Fixed via ONVIF
`SetSystemDateAndTime`, verified by read-back (2026-10-20 23:42:36 UTC).
Reboot may lose it again — no NTP on the air-gapped AP. Any SD clip timestamps
follow the camera's clock.

### Storage math (continuous 24/7, if ever armed)

1572 kbps video + 64 kbps audio ≈ **17 GB/day**. Camera SD size unverified
(~2 days if 32 GB, circular overwrite essential). The Pi (20 GB free) cannot
hold the offload — **rejected on measured disk math**. Offload target is the
laptop (82 GB free, `--retention-days 3` default ≈ 51 GB steady state).

### Tooling added (version-controlled, no secrets)

- `backend/cctv/tapo_record_setup.py` — audit / arm 24/7 + circular / verify /
  list / format(gated, typed YES). Env-driven auth (`TAPO_USER`/`TAPO_PASS`/
  `TAPO_CLOUD_PASS`/`TAPO_AUTH_MODE=cloud`).
- `backend/cctv/tapo_clip_backup.py` — idempotent SD→disk offload (skip by
  filename, temp-dir + rename, retention prune, free-space guard,
  **credential-guard no-op** so the timer never fails pre-credential).
- `backend/systemd/pigpulse-tapo-backup.{service,timer}` — **laptop** unit,
  hourly, `Persistent=true`, optional `EnvironmentFile=`. Enabled 2026-10-21;
  currently no-ops until `~/.config/pigpulse/tapo.env` gets a working
  `TAPO_CLOUD_PASS` (0600, solrahk-owned, never committed).
- pytapo venvs: `/home/solrahk/sandbox/tapo-venv` (x86) and
  `/root/sandbox/tapo-venv`; aarch64 cp313 wheels staged in
  `/tmp/opencode/tapo-wheels-arm313` for any future Pi need.
- Pi SSH: `pigpulse@192.168.69.1` with the capstone password works
  (Master-provided); no laptop key is authorised on the Pi.
- **MJPEG latency fix (2026-10-21):** `tapo_mjpeg_server.py` fanned frames
  out synchronously per client and sockets carried `settimeout(300)` — one
  stalled reader (phone wifi doze) could block the shared pump for up to
  5 min, dragging every stream behind. Now: per-client latest-frame queue
  (maxsize 2, drop-oldest) + writer thread + `SO_SNDTIMEO` 10 s (send-only;
  the keepalive recv stays unbounded — idle browsers never send). Pump never
  blocks. `fusion.html` also auto-reconnects a dropped stream every 3 s
  (it used to freeze on the last frame). Remaining ~1–2 s is camera-side
  encode + RTSP/TCP transport — inherent to the C200 firmware; UDP transport
  was deliberately not traded for it (see RELIABILITY_20261017).
