# ARCHITECTURAL CANON & SOURCE OF TRUTH

> **READ THIS BEFORE CREATING, MOVING, OR DEPLOYING ANYTHING IN THIS REPO.**
> Authority: repository location, branch, topology, deployment, safety rules.
> If any other document (including dated briefings, orientation snapshots, or
> a stale `AGENTS.md`) contradicts this file, **this file wins**.
> Last verified against the working tree: **2026-09-30**.

---

## 1. HARD RULES

| # | Rule |
|---|---|
| **R1** | The ONLY project directory is `/home/solrahk/pig-health-monitor`. Never create `PigHealthMonitor/`, `pig_health_monitor/`, `PigPulse/`, or any other spelling. |
| **R2** | `/home/solrahk/PigHealthMonitor_ARCHIVE_OFFLINE` is **read-only**. Never edit, build, or deploy from it. |
| **R3** | Never create a new top-level directory in this repo. New code goes into an existing canonical path (see §3). |
| **R4** | Never `sudo` for builds, `npm`, `pip`, or git. Only for `/etc/systemd/system/`, `sysctl`, `apt`. `sudo` previously created root-owned dirs that agents then could not edit. |
| **R5** | Never commit a secret. A pre-commit scanner enforces this. Use env vars or an untracked file. |
| **R6** | Firebase is **retired**. It must not reappear — CI fails the build if it does. |
| **R7** | One Vercel project, one deploy path. Never create a second config for `pig-health-monitor`. |

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

**Current state (measured 2026-09-30):** the Pi is an island. It runs hostapd
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

The Pi 4B's built-in radio (BCM43438) is **2.4 GHz only**. A single radio
cannot be a WiFi client and an AP at the same time, so an adapter that becomes
the **WAN client would take over the radio and drop the CCTV and the ESP32-S3**.
Bandwidth is *not* the constraint — the sensors are tiny. Reach and having any
uplink at all are.

**Planned topology — two radios, independent interfaces:**

```
Built-in radio (wlan0) → AP "PigPulse", 2.4 GHz → CCTV + ESP32-S3  [unchanged]
USB adapter   (wlan1) → client, joins farm router (5 GHz) → WAN   [new]
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

### 2.5 Hardware inventory
|---|---|---|
| **Pi 4B** | edge: thermal + ingest + AP + PB | ⚠️ **OFFLINE as of 2026-09-30** — see note |
| **ESP32-S3** (`s3-mic-01`) | the ONLY mic. TCP :9090 audio, MQTT telemetry | ⚠️ **USB WEDGED** (recorded 2026-09-27) |
| **Tapo camera** | CCTV, RTSP → MJPEG | ⚠️ unreachable (lives on the Pi AP) |
| ~~ESP32-D0WD~~ | original node | ☠️ **DECOMMISSIONED — do not resurrect** |
| ~~INMP441 on Pi GPIO~~ | fallback mic | ☠️ **REMOVED 2026-09-29** |

> **HARDWARE STATUS IS UNVERIFIED — CHECK BEFORE YOU TRUST IT.**
> Verified unreachable on **2026-09-30**: `ping 192.168.69.1` = 100% packet
> loss, SSH connection timed out, and the Pi is **not on the Tailscale tailnet**
> (only the laptop is). The "live" marks above are inherited from an earlier
> session and are **not** current readouts.
>
> Consequently: **treat every Pi-side capability claim in this repo as
> unverified.** There are no CPU, thermal, throttling, memory, or SD-endurance
> measurements for the Pi in this repository, and none may be invented from a
> spec sheet. Before quoting a Pi number, read it off the device:
> `/proc/cpuinfo`, `/proc/meminfo`, `vcgencmd measure_temp`,
> `vcgencmd get_throttled`, `lsblk`, `dmesg | grep -iE 'mmc|ext4|throttl'`.
>
> **Which board?** `docs/ARCHITECTURE_V3_20260914.md` specifies a **Pi 5
> (4GB)**; `v3-mqtt-pocketbase/docs/RIG_DEVICE_INVENTORY.md` records a **Pi
> 4B**. These are different boards with different thermal and I/O behaviour.
> Unresolved — read the model off the device.
>
> **What is actually running today** is the **laptop rig**: PocketBase,
> bridge, Mosquitto, ValKey, thermal-ws, OpenResty, the read-only proxy, and
> the public dashboard reading from it. The public telemetry currently shown
> is **seeded demo data** (`backend/setup/seed_pocketbase.py`), not live
> sensor readings. The ESP32-S3 mic is the only audio path and its USB is
> wedged, so the audio tier is **not deployable** until it is recovered.

> The removed Pi GPIO mic used `dtoverlay=googlevoicehat-soundcard`, which needs
> a physical codec chip this board does not have. It returned **bit-exact zeros**
> (1,920,000 samples, all exactly 0, both channels — a null source, not a quiet
> room). Do not re-add the overlay without a real codec present.

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

---

## 4. DEPLOYMENT

| What | How |
|---|---|
| **Landing + dashboard (the only web deploy)** | `~/.local/bin/pigpulse-autodeploy.sh` (cron, 5 min) or `scripts/deploy-landing.sh` |
| Pi backend | `rsync` repo `backend/` → `/home/pigpulse/`, then `systemctl restart` |

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

| # | Item | State |
|---|---|---|
| 1 | Pi ↔ cloud sync | ✅ **built** 2026-09-29 — see §2.1. Needs the migration + `sync.env` to go live |
| 1b | Pi PocketBase now bound to `192.168.69.1` | ✅ so the laptop can read it. Anything on the AP can reach the admin API — the password is mandatory for that reason |
| 2 | `setup_pocketbase.py` stale vs migrations | still stale — use `pb_migrations/`, not that script |
| 3 | `deploy/systemd/` is empty — laptop units unversioned | not done |
| 4 | Camera RTSP creds hard-coded in source | not moved |
| 5 | LWT/`status` topic missing from ESP32-S3 firmware | `devices` rows go stale |
| 6 | `pig/+/audio` has no publisher | orphaned contract |
| 7 | **Pi has no WAN.** AP is an isolated island. Tailscale cannot help on its own — see §2.4 | blocks all remote access |
| 8 | TLS cert has no `192.168.69.1` SAN | regen on the Pi |
| 9 | **No `/cctv` route exists in the gateway** | **BROKEN LINK** — see §2.4. The §2 diagram claims a proxy that was never configured |
| 10 | **`cloud_sync.py` cannot carry live video** | design gap — see §2.4. It syncs PocketBase *records* on an interval, not a stream |

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
