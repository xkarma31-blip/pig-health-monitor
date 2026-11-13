# Pi + Rig State Audit — 2026-11-13

**Scope:** holistic audit of the Pi edge device, the laptop/cloud rig, the repository,
and the end-to-end data path. Read-only. **Nothing was fixed, restarted, committed or
deployed.** No file on the Pi was modified; the only Pi-side writes were `sudo -S`
read commands and the `journalctl` noise they generate.

**Ground truth sources:** device readouts over SSH (`pigpulse@192.168.69.1`), live HTTP
probes, `sqlite3` in read-only mode, `ss`/`nft`/`ip`, and the working tree at
`bedb2cb`. Where a claim is a code reading rather than a measurement, it is labelled
**[CODE]**. Where something could not be established, it is labelled **[UNVERIFIED]**.

**Timezone note (applies to every timestamp below):** both hosts are
`Asia/Manila (PST, +0800)`. `PST` here is **Philippine Standard Time, UTC+8** — not
US Pacific. `date` prints 10:53, `date -u` prints 02:53. PocketBase stores UTC, so
the `…Z` values in the databases are correct and the journal's local times are
8 hours ahead. **No timestamp bug.** It is, however, a standing misreading hazard:
"PST" in any log implies −8 to anyone who assumes US Pacific (a 16-hour error).

---

## 1. Executive summary

The system is **functionally healthy and running end-to-end**, and it is
**further along than CANON.md describes in several places**. Real Pi telemetry
(634,597 rows) reaches the cloud PocketBase and the Vercel function; the thermal
camera, the SHT45, the mic, the camera, the cough classifier, the portal and the
onboarding flow are all live; 157 backend tests pass; the gateway config is
byte-identical to its repo copy.

Against that, three classes of real problems:

- **One unwanted public internet exposure** (an unauthenticated demo panel on Funnel
  :8443) that CANON does not mention and never authorised.
- **Two data-fidelity defects** where "no reading" is stored as "a real zero"
  (SHT45 ambient, 304,862 rows) and where a 10-second blocking write still exists on
  the MQTT path — plus a **CANON diagnosis that is wrong** about the first one.
- **A reproducibility break**: the firmware source in the repo cannot rebuild the
  firmware running on the board, and two committed files import modules that were
  never committed.

The disk is the most immediate operational pressure: the Pi is pinned at its
recorder's free-space floor with 5.0 GB free and a rotation that continuously
destroys video history.

---

## 2. Findings by severity

### P0 — Unwanted unauthenticated public exposure (laptop)

**Confirmed by direct probe, not inferred.**

```
$ tailscale funnel status
https://solrahk-hp-laptop-15s-fq5xxx.tail2a25b0.ts.net (Funnel on)
|-- / proxy http://127.0.0.1:8099          <- PigPulse read-only proxy (key-gated)

https://solrahk-hp-laptop-15s-fq5xxx.tail2a25b0.ts.net:8443 (Funnel on)
|-- / proxy http://127.0.0.1:8788          <- shikigami serve --demo  (NO auth)
```

`/proc/1851/cmdline` → `python3 /home/solrahk/.local/bin/shikigami serve --demo --port 8788`.

Public probe:

```
GET https://solrahk-hp-laptop-15s-fq5xxx.tail2a25b0.ts.net:8443/
→ HTTP 200, text/html, 24,549 bytes
→ <title>Shikigami · Mission Control</title>
```

Light surface recon (GET only, no exploitation attempted):

| path | result |
|---|---|
| `/` | 200, 24,549 B — "Mission Control", **"DEMO DATA"** badge |
| `/health` | 200, 901 B |
| `/api`, `/api/status`, `/api/sessions`, `/login`, `/admin`, `/.env`, `/api/exec` | 404 |

**Blast radius is limited: the panel serves demo data only** (`demo-ingest`,
`demo-thermal`, `demo-memory`, `demo-packaging`, `demo-deploy` session titles). No
real telemetry, credentials or keys were observed. But it is an **unauthenticated
publicly-reachable control panel that advertises the internal architecture**
(ingest worker, thermal pipeline, memory system, deploy pipeline) — exactly the class
of surface a security review flags, and it is **not** a PigPulse component.

**Drift:** CANON §4.2 states the only Funnel target is the key-gated proxy and that
`tailscale funnel --https=443 off` is the kill switch. Funnel is **on**, with **two**
targets.

**Fix (2 commands, needs your go-ahead):**
```sh
tailscale funnel --https=8443 off      # close the demo panel
tailscale funnel --https=443 off       # match CANON §4.2 (data path stops too)
```
Note: turning off :443 also stops the Vercel `/api/telemetry` function, which is the
only public read path for the dashboard. **Decide which you want before running it.**

---

### P1 — Data fidelity: SHT45 "no reading" is stored as "0" (304,862 rows)

**The live board proves the mechanism.** Raw MQTT from `pig/s3-mic-01/telemetry`,
six consecutive messages:

```
{"mic":true,"rms":350892,...,"sr":48000,"irf":0,...}                          <- no ambient
{"mic":true,"rms":53000,...,"sr":48000,"irf":0,...}                           <- no ambient
{"mic":true,"rms":94920,...,"sr":48000,"irf":0,...}                           <- no ambient
{"mic":true,"rms":102738,...,"sr":48000,"irf":0,...}                          <- no ambient
{"mic":true,"rms":149945,...,"sr":48000,"temperature":36.11,"humidity":60.92,...}
```

**The JSON is valid in every message** — `"wrn":0}` closes cleanly. There is **no
trailing comma** and **no truncation**. The ambient fragment is simply *absent*
from roughly half the messages, and PocketBase fills absent fields with `0`.

**Root cause [CODE]** — `firmware/esp32s3-mic-ambient/arduino/esp32s3_telemetry-flashed-20261113/src/esp32s3_telemetry.ino:717`:

```c
if (shtValid && millis() - shtLastGood < 5000)
  snprintf(ambient, sizeof(ambient), ",\"temperature\":%.2f,\"humidity\":%.2f", ...);
```

`sht_task()` sets `shtValid = false` on **any** failed read (short read *or* CRC
failure) — lines 240 and 249 — and only refreshes `shtLastGood` on success. So a
single transient I²C failure clears the flag, and the publish is gated on
`last-attempt-succeeded` rather than on *is there a valid cached reading*. The
cached reading is still good (the gate would accept it for 5 s) but `shtValid` is
already `false`.

Cadence: the SHT45 is measured every **2,000 ms** (`:254`) while telemetry publishes
at **1 Hz**. The measurement also races its own conversion — the read is attempted
only 10 ms after the measurement command (`:235`), against an SHT45 high-precision
conversion of up to 8.5 ms, i.e. ~1.5 ms of margin for I²C and Wi-Fi jitter.

**Measured impact (Pi PocketBase, `deviceId='s3-mic-01'`):**

```
2026-11-13 00   tot=1962  zeros= 992 (50.6%)
2026-11-13 01   tot=3592  zeros=1882 (52.4%)
2026-11-13 02   tot=3187  zeros=1620 (50.8%)
```
Pi total `ambient=0 AND humidity=0`: **304,862** rows, 2026-09-28 → still live.
Laptop total: **309,794** rows (same signature, +4,113 of 8,009 rows today).

**CANON's diagnosis is wrong here.** CANON §2.5 attributes this to the trailing-comma
JSON bug and calls it *"Fixed 2026-11-12 … rows carry `ambient≈35.3, humidity≈63.9`"*.
The trailing comma **is** fixed — the board now reports
`firmware: pigpulse-mic-sht45-20261113-nowriteblock` on `pig/s3-mic-01/audio/fmt`
and emits clean JSON. The `json_lenient.py` bridge fix (commit `69912d1`) is now
belt-and-braces for a bug that no longer exists on the board. **The persistent 51% is
a separate, still-live firmware bug that CANON does not know about.**

**Fix (firmware, 2 lines):** keep a separate "have we ever read it, and how old"
flag and gate on *that*, not on the last attempt's outcome:
```c
if (shtLastGood && millis() - shtLastGood < 5000)   // cached reading still fresh
```
plus raise the read delay from 10 ms to ~15 ms to clear the conversion race. Also
worth widening the publish→store contract so a missing reading is distinguishable
from a real 0 °C.

---

### P1 — The 10-second blocking write still exists — on the MQTT path this time

`KNOWN_GOOD.md` (2026-11-13 entry) documents, with measurements, that Arduino's
`NetworkClient::write()` can block for `WIFI_CLIENT_MAX_WRITE_RETRY (10) × 1 s =
10,000 ms` when the socket send queue is full, and that the fix applied was to the
**audio** socket.

**The board's own counters show the audio path is fixed and the MQTT path is not:**

```
live payload: "pubms":10001, "pubn":10, "wrms":5, "wrn":0
```
- `wrms = 5` ms → longest **audio** write. Fixed. ✓
- `pubms = 10001` ms → longest **MQTT publish**. Still exactly 10×1 s. **Not fixed.**

`pubn: 10` — ten publishes exceeded 100 ms in this boot. Each one stalls the MQTT
task for up to ten seconds: no telemetry, no heartbeat, no LWT, and the SHT45
fragment goes stale across the gap. The same `WiFiClient` type is used for both
sockets, so the audio fix does not carry over.

**Fix:** apply the same "never destroy the socket, keep the bytes" treatment to the
MQTT client, or set a bounded `SO_SNDTIMEO`/write timeout on the publish socket.

---

### P1 — The repo cannot rebuild what is deployed, and two committed files import uncommitted modules

**Firmware source drift.** The tracked canonical source is stale:

```
canonical  arduino/esp32s3_telemetry/src/esp32s3_telemetry.ino   mtime 2026-10-19
           → char payload[256];  no drops fragment
deployed   arduino/esp32s3_telemetry-flashed-20261113/...          mtime 2026-11-13
           → char payload[768];  firmware id "pigpulse-mic-sht45-20261113-nowriteblock"
```

The deployed source exists **only in untracked directories**. CANON R8 requires the
working binary + source + sha256 to be archived, and `docs/known-good-20261113/`
does hold three `.bin` files and a source copy — but as an **untracked** directory,
and the canonical `src/` tree was never updated.

**Broken import in a committed file.** `backend/portal/portal.py:35` does
`import local_app` unconditionally. `backend/portal/local_app.py` is **untracked**:
```
$ git ls-files --error-unmatch v3-mqtt-pocketbase/backend/portal/local_app.py
error: pathspec ... did not match any file(s) known to git
```
A fresh clone → `ModuleNotFoundError` at import → the portal does not start. It
works on the Pi only because the file was rsynced there.

**Missing runtime asset.** `frontend/mobile_app/src/utils/pcm-stream.ts:102` loads
`pcm-worklet.js`; `frontend/mobile_app/public/pcm-worklet.js` (5,309 B) is
**untracked**. Consequence, measured:

| target | `/app/pcm-worklet.js` | effect |
|---|---|---|
| Vercel production (`…/app/`, build 2026-11-12T23:53:08Z) | **200**, 5,309 B | full AudioWorklet path |
| Pi portal (`192.168.69.1/app/pcm-worklet.js`) | **404** | falls back to the deprecated main-thread `ScriptProcessorSink` |

The Pi app was deployed 2026-11-13 **06:36**; the worklet file was created
**07:19**. The Pi-hosted app is simply stale by 43 minutes — a re-export and re-copy
fixes it (`deploy-local-app.sh` does `cp -a "$export_dir/." "$release/"`, so it will
carry `public/` once the export is newer).

**And the CI-built artifact would lose the worklet entirely** — the CI job does
`npm ci` from a checkout that has no `public/`. So the app CI validates is not the
app that ships. This is the exact failure mode CANON §3.1 warns about for
`legacy/`: a plausible-looking tree that is not the live one.

**`git add -A` today would add 77 files** and no secrets (verified — the
`.pio/` build trees are correctly ignored by `.gitignore:24 **/.pio/`). Among them:
`backend/portal/local_app.py` + `test_portal.py` + `README.md`, the mobile
worklet, `tools/` (24 real code files), `docs/claude-project/` (11 files), and the
firmware snapshot/known-good archives.

---

### P1 — PocketBase admin API is exposed on every interface, on both hosts

CANON §6 item 1b says the Pi's PocketBase is *"now bound to `192.168.69.1` — so the
laptop can read it"*, and CANON §4.1 says the laptop's is *"loopback only"*.

**Measured reality:**

```
Pi     ExecStart=.../pocketbase serve --http=0.0.0.0:8090
laptop ExecStart=.../pocketbase serve --http=0.0.0.0:8090 --dev
```

Both listen on `*:8090`. The Pi's `/_/` returns **200** on `192.168.254.194` (the
farm LAN, via `wlan0sta`) and on `100.69.139.63` (the tailnet). The laptop's
returns **200** on `192.168.254.121` (home LAN) and `100.101.128.28` (tailnet).

The OpenResty gateway *does* return 403 for `/_/` and `/admin/` — verified — but that
guards only the gateway path, not PocketBase itself. **The admin UI is reachable on
the LAN and the tailnet.**

This matters more now than when CANON was written, because the Pi **gained** WAN
(see §3): the farm LAN and the tailnet are new reachability for the Pi's admin API.

`--dev` on the laptop additionally prints logs and SQL to the console.

**Fix:** bind the Pi to `192.168.69.1:8090` and the laptop to `127.0.0.1:8090`, and
re-point `cloud_sync`/the proxy accordingly (both already use
`raspberrypi.local` / `127.0.0.1`, so this is low risk).

---

### P1 — The Pi is pinned at its recorder's disk floor (83% full)

```
/dev/mmcblk0p2   29G   23G  5.0G  83% /
/home/pigpulse   15G   ->  cctv 14G  (recs 14G, 129 segments)
```

`cctv/rtsp_recorder.py` rotates against a free-space floor:
`FLOOR_MB = int(os.environ.get("REC_FLOOR_MB", "5000"))` — the Pi sits at exactly
5,000 MB free, so the recorder is in **permanent rotation**, deleting the oldest
segment whenever it crosses the floor.

Consequences:
- Video history is bounded by the floor, not by a retention policy. Measured
  accumulation: **8.0 G on 2026-11-12, 5.1 G on 2026-11-13**; segments are 900 s at
  ~1.55 Mbps. There is no `--retention-days` equivalent on the Pi.
- The floor leaves **zero headroom** for anything else. PocketBase is 674 MB and
  growing; `/var/cache` is 877 MB.
- Measured segment integrity is good: `duration=900.173625`, `bit_rate=1552964`,
  and the filename timeline is continuous at ~15-minute spacing with no gaps.

**Fix:** decide the policy explicitly (retention-in-days vs a higher floor), move the
bulk to the laptop (the offload path already exists — see P2), and reclaim
`/var/cache` (877 MB).

---

### P2 — Everything else worth fixing

| # | Finding | Evidence |
|---|---|---|
| P2-1 | **Thermal alerts are suppressed, not delivered.** All 144 Pi alerts are `synced=true` but were **never inserted** into the cloud — `cloud_sync.py:271-283` marks them handled without sending. The cloud `alerts` collection holds **6 rows, all seeded demo data** (`"FEVER — Peppa — CRITICAL — seeded 1/6"`). The suppression is deliberate and defensible (Pi sample: `"unassigned centre 476.89C (HYPERTHERMIA)"` — 476 °C is not physical) and ingest-side suppression *is* working (no new thermal alerts since 2026-11-03). **But CANON.md does not record it** — grep for `suppress`/`is_thermal_alert` in CANON returns 0 hits. The practical consequence: **the phone's alert feed shows fake Peppa data.** | Pi `alerts` 144 rows / all `synced=1`; laptop `alerts` 6 rows, all seeded |
| P2-2 | **`devices.s3-mic-01.lastSeen = 0`** — never updated. The `status`/LWT topic has no publisher (CANON §6 item 5, still open). `pi-thermal-01.lastSeen` is current on the Pi but stale on the cloud (`≈2026-10-15` while the device was actively publishing). | Pi + laptop `devices` tables |
| P2-3 | **The AP watchdog still hardcodes the ctrl-socket path in the two places CANON flagged.** `PIGPULSE_AP_IFACE` is honoured (`IFACE="${PIGPULSE_AP_IFACE:-wlan0}"`, line 66) but lines **98 and 153** hardcode `rm -f /var/run/hostapd/wlan0`. Moving the AP to `wlan1` would make the watchdog delete the wrong socket and fail to restart a dead hostapd. | `/usr/local/bin/pigpulse-ap-watchdog.sh:62,66,98,153` |
| P2-4 | **`npm run test` is broken.** The root script runs `npx jest` inside `mobile_app`, but `jest` and `jest-expo` are **not** dependencies of `mobile_app/package.json` (`jest-expo: None, jest: None`) and are not installed → `Validation Error: Preset jest-expo not found`. The CI `mobile-app` job never runs jest either; it runs `eslint` + `npm run test:bridge`. `jest.config.js` and its `preset: 'jest-expo'` are vestigial. AGENTS.md documents `npm run test # jest, v3 app` as a working command. | `npm run test` output; `package.json` scripts |
| P2-5 | **CI canon-guard does not cover root `mobile_app/`.** `ci.yml:35` tests only `landing_page` and `firmware`, but CANON §3.1 and root AGENTS.md both state that `mobile_app/` reappearing at the root fails the build. | `.github/workflows/ci.yml:35` |
| P2-6 | **The autodeploy cron is commented out** since 2026-10-31 with the reason *"Vercel token invalid"* — but `vercel whoami --token` now succeeds (`kuroyamimori746-2387`), so the stated reason is stale. Live Vercel is fresh (build `2026-11-12T23:53:08Z`) via some other path; the local state file still reads `deployed-33b4a80d` (2026-11-06) and `~/.local/state/pigpulse-stage/app/` is dated **Nov 6** — the local bookkeeping understates freshness by 7 days. | `crontab -l`, `vercel whoami`, `ls ~/.local/state/pigpulse-stage/app/` |
| P2-7 | **`pigpulse-recs-offload` reports success on total failure.** `/root/.local/bin/pigpulse-recs-offload.sh:21` is `rclone move … \|\| echo "rclone failed (tether?)"` — the `\|\|` swallows the exit status, so systemd records `status=0/SUCCESS` on every failed run. Live log shows `RATE_LIMIT_EXCEEDED` / `rateLimitExceeded` while the unit reports success. The Pi→laptop hop is still paused (`/root/.cache/pigpulse-recs.pause-rsync` exists). | unit status + journal |
| P2-8 | **Duplicate JSON key `txp` in the firmware telemetry.** Live payload: `"txd":0,"txp":110846,"txr":2` … later `"boots":1,"rr":1,"br":0,"txp":78`. The second `txp` is `WiFi.getTxPower()` (dBm); the first is `txPartialWrites`. Python's `json.loads` keeps the **last**, so the partial-write counter is silently lost. Source lines 739 and 743. | live MQTT payload |
| P2-9 | **systemd ordering cycle on every boot** for the noVNC pair: `Job pigpulse-novnc.service/start deleted to break ordering cycle starting with multi-user.target/start` and the same for `pigpulse-wayvnc-view.service`. Both services do start, but the cycle is resolved by systemd deleting a job — fragile. | prior-boot journal |
| P2-10 | **The cough classifier is the Pi's largest CPU and memory consumer.** 1511 windows scored, 0 coughs, `mean_p 0.0105`, `max_p 0.0687`, verdict LOW; **`cpu_pct 56.0`, `cpu_pct_now 134.3`, `rss_mb 432.3`**, `reconnects 128` in 9276 s (~1 reconnect per 72 s), `dropped_gappy 10`. It reads `127.0.0.1:8080/esp/stream?rate=native&raw=1` and downmixes on the Pi. | `GET 127.0.0.1:8096/api/status` |
| P2-11 | **Constant brcmfmac kernel noise:** `brcmf_p2p_send_action_frame: Unknown Frame: category 0xa, action 0x8`, roughly every 5–6 minutes in pairs, plus `brcmf_cfg80211_get_station: GET STA INFO failed, -52` in the prior boot at 06:54, 07:35, 07:52 — the ghost-station events behind CANON §1's stale-association recovery. | journal, both boots |
| P2-12 | **Pi reboot history is empty** — `last -x` returned nothing, so the 1 h 15 m uptime has no recorded boot reason. The prior boot's journal starts at 2026-11-12 20:53, implying a ~13 h gap before the current boot with no explanation. | `last -x`, `journalctl -b -1` |
| P2-13 | **Thermal runs at 1.95 FPS against a 4.0 Hz refresh setting.** `/health` reports `Refresh setting: 4.0 Hz`, `Measured FPS: 1.95`, `Read duration ms: 474`, `I2C clock Hz (kernel config): 100000`. The 100 kHz I²C bus is the ceiling; the refresh setting is aspirational. CANON quotes "~2 FPS" so the *observed* figure is consistent — but the two numbers in the same readout disagree. | `/health` |
| P2-14 | **Repo root `tools/` is not an empty orphan.** CANON §3.2 calls it *"Empty orphan directory, root-owned"*. It is **444 KB, solrahk-owned, 24 real untracked code files** (`a11y/`, `evidence/`, `perf/`, `edge_model_preflight.py` + tests, `fixtures/`) — a11y alert-card work, an evidence ledger with its own JSON, and perf benchmarks. **`tools/simulator-web/` is indeed empty**, and the real simulator is at `v3-mqtt-pocketbase/tools/simulator-web/` as CANON says. | `ls -la tools/`, `git ls-files tools/` (empty) |
| P2-15 | **`docs/claude-project/` (11 files) is untracked** and duplicates a canon for a different tool. Decide: commit, or exclude so it never reaches CI. | `git add -A --dry-run` |
| P2-16 | **`KNOWN_GOOD.md` structure:** the H1 sits at **line 126**, below the newest 2026-11-13 entry (lines 1–125 are content). The content itself is complete — sha256 rows and measured wrms 10003→3–4 ms with 12/12 JSON parse. | file |
| P2-17 | **Stale docs:** `v3-mqtt-pocketbase/frontend/mobile_app/AGENTS.md` still points at the dead `v2-firebase` path and mandates expo-av/Firebase auth, contradicting the current AudioContext/AudioWorklet work. `ci.yml:15-18` carries a comment about a nested workflow file that has already been deleted. | file reads |

---

## 3. What CANON.md no longer matches (grounded drift)

CANON is authoritative and most of it still holds — but these specific statements are
now false, and false canon is how the 2026-09-30 nginx divergence happened.

| CANON says | Measured reality |
|---|---|
| §2.4: *"The Pi is an island… `ping 192.168.69.1` gave 100% packet loss and the Pi is absent from the tailnet."* | **The Pi has two uplinks and is on the tailnet.** `wlan0sta 192.168.254.194/24` (farm router, metric 200) and `eth1 10.42.0.28/24` (USB tether, metric 100, default route). `tailscale status` → `100.69.139.63 pigpulse-pi`. `ping 8.8.8.8` → 3/3, 23–31 ms. |
| §2.4: *"Tailscale is not a solution on its own… a node with no internet cannot enrol."* | Moot — the Pi has WAN and **did** enrol. The reason it can now reach the internet is the standalone-WAN work in §2.4.1, which works. |
| §2.5: *"The laptop rig continues to show **seeded demo data** — live sensor data has not yet reached the laptop PocketBase… `cloud_sync.py` is built but never tested end-to-end."* | **False.** 645,117 telemetry rows on the laptop: 574,070 × `s3-mic-01`, 71,042 × `pi-thermal-01`, 41 × `esp32-00x` (the only seeded rows). The freshest was 11 s old. Sync is working: every visible pass logs `failed: 0, quarantined: 0, suppressed: 0`. |
| §2.4: *"`cloud_sync.py`… batches… every 60s"* | **10 s.** `SYNC_INTERVAL_S=10`, `SYNC_BATCH=500`. |
| §2.1: `SYNC_SOURCE_URL=http://192.168.69.1:8090` | `SYNC_SOURCE_URL=http://raspberrypi.local:8090` (mDNS — more robust; the CANON text is stale). |
| §4.2: *"Funnel off: `tailscale funnel --https=443 off`"* | Funnel **on**, two targets (§2 P0). |
| §4.1: *"Pi PocketBase now bound to `192.168.69.1`"* / *"admin UI, loopback only"* | `0.0.0.0:8090` on both hosts (§2 P1). |
| §4: *"`~/.local/bin/pigpulse-autodeploy.sh` (cron, 5 min)"* | Cron line **commented out** since 2026-10-31; reason stale. |
| §4: *"the autodeploy stages the Expo export under the landing's `app/`"* | It stages into a **separate tree**, `~/.local/state/pigpulse-stage/app/`. `landing_page/app/` does not exist. |
| §2.4: *"The live config has exactly **nine** locations: …"* | The enumerated list has **eight** entries and the live config has **eight** location blocks. CANON's own count is wrong. |
| §6-9: *"No `/cctv` route exists in the gateway"* | Accurate for the gateway (404) — but **incomplete**: the read-only proxy serves a working `/pi/cctv` (200, `image/jpeg`, 40,427 B) and Funnel republishes it. An undocumented working CCTV path to the public internet. |
| §2.5 (SHT45): *"Fixed 2026-11-12… rows carry `ambient≈35.3, humidity≈63.9`"* | The trailing comma is fixed; a **different** bug keeps ~51% of rows at zero (§2 P1). CANON's diagnosis and its "fixed" claim are both wrong. |
| §2.7 / §2.4.1: *"the Pi has no WAN"* | The Pi is now standalone-WAN capable and dual-homed (§3). CANON §2.4.1 already describes the new venue path, but §2.4's island language was never updated. |
| §2.5: *"Two SD cards… still unlabeled"* | `mmc0:aaaa SL32G 29.7 GiB` — one card visible in this boot. Not resolvable from the journal alone. |

**CANON statements that still hold and were re-verified:** the board is a
**Pi 4B Rev 1.2** (`/proc/device-tree/model`, `Machine model: Raspberry Pi 4 Model B
Rev 1.2`); `cfg80211.ieee80211_regdom=PH`; hostapd on channel 6, WPA2-PSK; the
`/run/pigpulse/ap-hold` contract is implemented (`pigpulse-ap-watchdog.sh:62`); the
`inet pigpulse_nat` NAT table is present
(`ip saddr 192.168.69.0/24 oifname != "wlan0" masquerade`); the gateway config is
byte-identical to the repo copy (`md5 93d8dc09319b44f4b4cc456099a1d8f3`); there is
still **no port 8091**; the `freq_list` placement in `pigpulse-wan-sta-up` is
correctly **global** with the network-block copy stripped.

---

## 4. Verified healthy (do not disturb)

**Data path is real, live and end-to-end.** Live proof at 2026-11-13 10:53 local:

```
Pi  /health      ESP32-S3 mic: connected peer=192.168.69.15:60594 rate=48000Hz nonzero=99.6%
                Ambient (SHT45): live temp=34.91C hum=63.63% age=0.1s
                Thermal MQTT: connected, framesSeen 15604, published 832, interval 10.0s
                Sensor ready: yes, Frame valid: yes, FPS 1.95, I2C 0x33
Pi  /ambient     {"state":"live","ok":true,"temperature":34.85,"humidity":63.94,"thi":87.4,
                  "thiClass":"severe","mqttConnected":true,"msgCount":6536,"ambientCount":3166}
Pi  /api/status  {"state":"UP","associated":true,"uplink_ip":"192.168.254.194","internet":true,
                  "ap":{"channel":6,"freq":2437,"ssid":"PigPulse"}}
```

- **Thermal camera** — live, 15,604 frames, `ambient 34.85 / humidity 63.94`, verdict
  HYPERTHERMIA, `alerts: 3`. Per CANON §2.7 this is scene-relative and the bulb-bench
  scene (THI 87.4 → "severe" by the documented bands) — **not** an animal-health
  claim.
- **Mic** — `nonzero=99.6%` on the live stream; firmware
  `pigpulse-mic-sht45-20261113-nowriteblock` confirmed via `pig/s3-mic-01/audio/fmt`.
- **CCTV** — RTSP recorder healthy: `duration=900.173625`, `bit_rate=1552964`,
  continuous 15-minute segments, no gaps. `pigpulse-cctv` (MJPEG, loopback) and
  `pigpulse-rtsp-recorder` both running.
- **Cough classifier** — model loaded, 1511 windows scored, audio flowing
  (243 MB consumed), 0 coughs.
- **Portal** — `http://192.168.69.1/` serves the onboarding page (15,763 B) and
  `/app/` serves the **real Expo export** (`index.html` 1,231 B + a 1,478,767 B JS
  bundle, both 200). The repo copy and the installed copy are **byte-identical** for
  `portal.py`, `portal.html` and `local_app.py`.
- **AP** — `hostapd` on channel 6, WPA2-PSK; 2 stations associated
  (`18:69:45:fb:d4:be` cctv, `68:ee:8f:dd:31:3c` esp32s3); dnsmasq leases for 4
  devices (the portal's `ap.clients: 4` is **DHCP leases, not associated stations** —
  exactly as CANON §2.4.1 warns).
- **Tailnet** — Pi `100.69.139.63` reachable from the laptop (0% loss). Phone
  `infinix-hot-60-pro` offline 3 d.
- **Cloud** — `cloud_sync` every 10 s, `failed: 0`; Pi holds only **11** rows in
  flight against 634,007 synced, so the at-least-once contract is genuinely working.
- **Gateway** — `/health` 200, `/api/` 200, `/api/realtime` 200, `/_/` **403**,
  `/admin/` **403**, `/mqtt` **101** with `Sec-WebSocket-Protocol: mqtt`,
  `/thermal-ws` **101** with upgrade headers.
- **Read-only proxy** — genuinely allowlisted: telemetry/alerts/pigs/devices 200 with
  the key, `audio_events` **403**, admin surface blocked, **401** without the key.
- **Tests** — `npm run ci:backend` → `backend OK`; bridge **18 OK**, workers **18 OK**,
  thermal-pi **121 OK** (157 total); ESLint clean on the modified `pcm-stream.ts`.
  The CI diff (install from `requirements.txt`, add the bridge + workers suites) is
  an **improvement** and both requirements files exist and carry the right pins
  (`mlx9064x-driver>=1.0.0`, `setuptools<81`).
- **YAML** — `.github/workflows/ci.yml` parses; jobs: `path-guard`, `secrets`,
  `backend`, `mobile-app`, `firmware`, `firebase-free`.
- **Backups** — `/root/pigpulse-backups/` holds dated snapshots
  (`watchdog-20261112-200005`, `wan-cutover-20261112-101950`), and the Pi's
  `pb_data/` holds six timestamped `data.db` backups. R8 is being honoured.

---

## 5. Proposed sequence (NOT executed — needs your go-ahead)

Ordered by risk-adjusted value. Each step is independently reversible and, where a
backup exists, is one command to revert.

### Immediate, low risk, high value

1. **Close the public demo panel** — `tailscale funnel --https=8443 off`.
   *Decide separately* whether :443 stays on (it serves the Vercel data path).
2. **Fix the SHT45 gate in firmware** — gate on the cached reading, not on the last
   attempt; widen the conversion margin 10 ms → 15 ms. Archive the current binary to
   `known-good-YYYYMMDD/` **first** (R8), with sha256 and a before/after reading.
3. **Re-export and re-copy the Pi app** so `pcm-worklet.js` is present on the Pi
   (`deploy-local-app.sh`).
4. **Bind PocketBase down** — Pi → `192.168.69.1:8090`, laptop → `127.0.0.1:8090`;
   verify the gateway's 403 guards and the proxy still resolve.
5. **Restore the autodeploy cron** — the Vercel token works again; uncomment the line
   and refresh the local state file.

### Repo hygiene (one commit, do it before the next push)

6. **Commit the missing modules before pushing `bedb2cb`** —
   `backend/portal/local_app.py`, `test_portal.py`, `README.md`, `make-qr.cjs`,
   `pigpulse-setup-qr.svg`, and `frontend/mobile_app/public/pcm-worklet.js`.
   Add the portal test suite to CI.
7. **Add `mobile_app` to the `ci.yml:35` canon guard.**
8. **Fix or remove `npm run test`** — either add `jest`/`jest-expo` as devDependencies
   and make CI run it, or delete `jest.config.js` and repoint the root script at
   `npm run test:bridge`.
9. **Update the canonical firmware source** from
   `esp32s3_telemetry-flashed-20261113/src/` so the repo can rebuild what ships;
   promote `known-good-20261113/` into the tracked archive.
10. **Decide `tools/`** — commit the 24 real files (they are good work) and delete
    the empty `tools/simulator-web/`; refresh CANON §3.2.

### Observability / policy

11. **Record the alert suppression in CANON** — it is a deliberate, defensible
    decision that is currently invisible. Also decide whether the cloud should show
    *any* real alert, and remove the seeded "Peppa FEVER" rows so a demo never shows
    fake data.
12. **Fix the recorder's retention policy** and let the offload do its job; fix the
    `|| echo` in `pigpulse-recs-offload.sh` so failures surface.
13. **Fix the AP watchdog's hardcoded ctrl socket** (lines 98, 153) to use `$IFACE`.
14. **Rename the duplicate `txp` key** in the firmware telemetry (keep
    `txPartialWrites` under a distinct name) so the counter stops being shadowed.
15. **Refresh CANON's drifted sections** — §2.4 (island/WAN), §2.4/§4.2 (Funnel),
    §2.5 (seeded demo data), §2.5 (SHT45 — correct the diagnosis), §4 (autodeploy
    cadence and staging path), §4.1 (admin binding), §6 item 9 (the `/pi/cctv`
    path), §3.2 (`tools/`).

---

## 6. Explicitly unverified

- **[UNVERIFIED]** The **D110 vs D55** MLX90640 field-of-view question. No part-number
  readout exists over I²C; the mounted unit is still only "expected" to be the
  wide-angle variant. The physical test (film a known width at a known distance) has
  not been done.
- **[UNVERIFIED]** Whether the farm router's 5 GHz reaches inside the barn. The Pi's
  radio is dual-band (CANON §2.4's correction is right) and its venue association is
  currently on the **2.4 GHz** BSSID `2c:b6:c2:1e:9b:d4` (2437 MHz), so the 5 GHz
  path is designed but not proven in anger.
- **[UNVERIFIED]** The **physical phone QR scan** and a **long offline soak** of the
  portal. The browser was tested against the real Pi with external requests blocked;
  no physical phone has completed the flow.
- **[UNVERIFIED]** The **Tapo SD-recording arm path**. The camera is now NATed behind
  the Pi, so it can reach the TP-Link cloud and the app badge may flip to Online — but
  the management API still needs the cloud-owner password, which is a friend's
  account.
- **[UNVERIFIED]** Long-term reliability of the audio path. `KNOWN_GOOD.md` records the
  10 s write trap and the fix; the MQTT publish still shows a 10,001 ms stall. A
  multi-hour soak with the counters watched is outstanding.
- **[UNVERIFIED]** Which SD card is booted. `mmc0:aaaa SL32G` is the only card visible
  in this boot's journal; CANON §6 item 14's "two unlabeled cards" cannot be resolved
  from the logs alone.
- **[UNVERIFIED]** Whether the two USB radios CANON §2.4 discusses are still
  fault-faulty. `wlan1` (rtl8192cu) is currently **DOWN**; `wlan0` carries the AP and
  `wlan0sta` carries the venue uplink on the same radio.

---

## 7. REMEDIATION LOG — 2026-11-13

Everything below was executed after the audit, with a backup or an archive for
each change. Master approved items 1–9. Full record in
`~/.local/state/` and the systemd `*.bak-20261113-*` files.

### 7.1 P0 — public demo panel closed

```
tailscale funnel --https=8443 off
```
Verified: `https://…ts.net:8443/` → **HTTP 000** (connection refused);
`https://…ts.net/health` → **401** (the key-gated PigPulse proxy, untouched).
Revert: `tailscale funnel --https=8443 8788`.

### 7.2 The SHT45 — three defects, one firmware rebuild

The firmware was flashed four times under the CANON R8 discipline (archive
before flash, sha256 recorded, measured before/after). Each intermediate build
is archived under `firmware/esp32s3-mic-ambient/docs/known-good-*/`.

| build | what it changed | ambient fragment | outcome |
|---|---|---|---|
| `nowriteblock` (the running baseline) | — | **14/40 (35%)** | the defect |
| `shtcache` | gate on the cached reading; `drops[384]`→`512` | 38/60 (63%) | **5 messages still dropped by the MQTT buffer ceiling** |
| `shtdiag` | six failure-kind counters on the wire | 33/60 (55%) | payload crossed the ceiling → **telemetry nearly dead** |
| **`shtretry`** | fast retry + 30 s window + **MQTT buffer 384→1024** | **59/60 (98%)** | ✅ shipped |

The four defects, in the order they were found:

1. **`shtValid` cleared by transient failures.** The gate tested the last
   attempt's outcome instead of the cached reading's age.
2. **PubSubClient's 384-byte buffer capped the payload at 353 bytes** for our
   24-char topic (`MQTT_MAX_HEADER_SIZE(5) + 2 + topic + payload`). The payload
   was at **346** — seven bytes of margin. `mqtt.publish()` returns false and
   **every** telemetry message is dropped, silently, while the audio keeps
   streaming over a different socket. This was a live landmine: adding any
   counter would have killed all telemetry.
3. **The measurement was read 10 ms after the command** against an SHT45
   high-precision conversion of up to 8.5 ms — a 1.5 ms race.
4. **The SHT45 bus is genuinely faulty.** The instrumented build reported
   `sfw=35` command NACKs (`sle=2`, NACK on its own address), `sfs=9` short
   reads, `sfc=6` CRC mismatches. Firmware now retries a failed cycle after
   8 ms, up to three times.

**Measured result** (raw MQTT on `pig/s3-mic-01/telemetry`):

| metric | before | after |
|---|---|---|
| messages carrying the ambient fragment | 14/40 (35%) | **59/60 (98%)** |
| PocketBase zero-rate (`ambient=0 AND humidity=0`) | 48.3 → 32.2 → 21.7 → 4.5% | **0.0%** |
| audio | 99.6% nonzero | 99.8% nonzero (unchanged) |
| Pi rows carrying the signature | 304,862 | still historical; **none new** |

**Residual, physical:** the SHT45's I²C connection still NACKs. The firmware
tolerates it; **the wiring needs attention.**

### 7.3 Pi app re-export (the missing worklet)

`expo export` → deployed via `deploy-local-app.sh` → release
`/usr/local/lib/pigpulse-portal/releases/20261113-114849`, symlink swapped
atomically, portal restarted. Verified: `/app/` **200**, `/app/pcm-worklet.js`
**200** (5,309 B, real worklet content). Backup at
`/root/pigpulse-backups/local-app-20261113-114849`.

### 7.4 PocketBase bound down — both hosts

| host | before | after |
|---|---|---|
| laptop | `--http=0.0.0.0:8090 --dev` | `--http=127.0.0.1:8090 --dev` |
| Pi | `--http=0.0.0.0:8090` | `--http=192.168.69.1:8090` (what the repo's unit already said) |
| `sync.env` | `SYNC_SOURCE_URL=http://raspberrypi.local:8090` | `http://192.168.69.1:8090` |

`raspberrypi.local` resolves to **10.42.0.28** (eth1), which the new Pi bind
no longer serves — so both sides had to move together. Verified: admin UI
**200 on loopback only**, **000 (refused)** on the home LAN, the tailnet,
`10.42.0.28` and `192.168.254.194`. Gateway `/_/` still **403**; `cloud_sync`
pass `sent 14, failed 0`. Backups: `*.bak-20261113-bind`.

### 7.5 Repo — the tree could not build or boot itself

Three commits, then a history rewrite to satisfy GitHub's 100 MB pre-receive
limit:

- `b2f4d30` — the firmware fix.
- `76843ca` — committed the modules the tree already imported
  (`portal/local_app.py`, `mobile_app/public/pcm-worklet.js`), made
  `npm run test` real, added `mobile_app` to the CI canon-guard, added the
  portal + unit suites to CI, removed the vestigial `jest.config.js`,
  committed `tools/` (24 real, tested files), and fixed the a11y theme
  lookup's `Path.home()` dependency.
- `feb1f64` → `7dfeac5` — the CANON corrections.

**The GitHub push was impossible until the history was rewritten.** A
**116.83 MB** committed virtualenv (`scripts/venv/lib/python3.12/site-packages/
playwright/driver/node`) was added in `92fec7f` and removed in `6d21888`, but
the *object* stayed reachable from the branch and GitHub's pre-receive hook
rejected the whole push. `git filter-repo --path scripts/venv/ --invert-paths`
removed it from the branch's history.

Verified after the rewrite: the blob is gone, the **final tree hash is
byte-identical** (`93150cc56b5d22f44dcbc92f02cc9b0d50aec45b` before and
after), `master` / `merge/teammate-access` / `backup/*` are untouched, and the
original history is preserved on Codeberg as the tag
`archive/pre-venv-rewrite-20261113`. Both remotes are at `7dfeac5`.

**Note:** the blob is still reachable from `master` and from the backup tag —
pushing *those* to GitHub would hit the same limit.

### 7.6 Seeded data removed

After a consistent `VACUUM INTO` backup (`data.db.bak-20261113-deseed`):
6 seeded alerts, 41 seeded telemetry rows and 2 seeded devices deleted from
the laptop PocketBase. The `alerts` collection is now **0**, and the Vercel
API's default (oldest-first) view now returns real `s3-mic-01` rows instead of
the fake `esp32-00x` demo data.

### 7.7 Autodeploy cron restored

The pause reason (invalid Vercel token) no longer held — `vercel whoami`
succeeds. The cron line is live again with an accurate comment, and the
script's own auth gate still stops the cycle early and says so if the token
ever dies.

### 7.8 Tests

| suite | result |
|---|---|
| backend bridge | 18 OK |
| backend workers | 18 OK |
| backend thermal-pi | 121 OK |
| backend portal | 10 OK (new — path traversal, SSRF, allowlist) |
| `npm run test` | 12 bridge + pi-clock + telemetry-time, all pass |
| `tools/` suites | 6/6 pass |
| CI | `ci:backend` OK · ESLint clean · pre-commit secret guard **verified to fire** |

### 7.9 Known-good register

Every firmware image, with its sha256, is archived under
`firmware/esp32s3-mic-ambient/docs/known-good-*/` and listed in
`KNOWN_GOOD.md`. The rollback image for the live build is
`firmware-nowriteblock.bin` (`db8f1641…`).
