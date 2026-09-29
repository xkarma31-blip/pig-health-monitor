# ARCHITECTURAL CANON & SOURCE OF TRUTH

> **READ THIS BEFORE CREATING, MOVING, OR DEPLOYING ANYTHING IN THIS REPO.**
> Authority: repository location, branch, topology, deployment, safety rules.
> If any other document (including dated briefings, orientation snapshots, or
> a stale `AGENTS.md`) contradicts this file, **this file wins**.
> Last verified against the working tree: **2026-09-29**.

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
  │  Tapo CCTV ──RTSP──► ffmpeg ──► tapo_mjpeg :8091 ──proxy──► /cctv            │
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

### 2.1 The known structural gap — do not mistake it for a bug

**The Pi and the laptop are two isolated islands.** The bridge writes
`synced: false` on every record, and **nothing anywhere reads it**.
`backend/workers/` is empty.

- The Expo app reads the **laptop's** PocketBase. It has no reference to port
  8080, 8091, 9090, or the AP IP.
- The Pi's thermal dashboard `:8080` is a **standalone web page**, not part of
  the Expo data path.
- So: **thermal data collected on the Pi never reaches the phone app.**

This is the top open architecture item. The `synced` flag was designed for a
cloud-sync worker that was never written.

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
> with no error. This already cost us the whole `audio_events` stream. After any
> payload change, add the field via a migration or the data vanishes.

### 2.4 Hardware inventory

| Device | Role | Status |
|---|---|---|
| **Pi 4B** | edge: thermal + ingest + AP + PB | ✅ live |
| **ESP32-S3** (`s3-mic-01`) | the ONLY mic. TCP :9090 audio, MQTT telemetry | ✅ live |
| **Tapo camera** | CCTV, RTSP → MJPEG | ✅ live |
| ~~ESP32-D0WD~~ | original node | ☠️ **DECOMMISSIONED — do not resurrect** |
| ~~INMP441 on Pi GPIO~~ | fallback mic | ☠️ **REMOVED 2026-09-29** |

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

### 3.1 FROZEN / NON-CANONICAL — do not edit, do not revive

| Path | Why |
|---|---|
| `firmware/` (root) | Firebase-era D0WD tree. Frozen, kept only because it holds untracked D0WD hardware work. Canonical firmware is the v3 path. |
| `landing_page/` (root) | Stale subset. Production is served from the v3 path by the autodeploy cron. |
| `docs/` (root) | Dated reports. `docs/ARCHITECTURE_V3_20260914.md` is superseded by §2 of this file. |
| `downloads/` | Vendor reference material (Melexis MLX90640 datasheet/gerber). Reference only. |
| `v3-mqtt-pocketbase/.github/` | **DEAD** — GitHub only loads workflows from the repo root. Delete it. |
| `scripts/simulation/`, `scripts/firebase/` | **DELETED 2026-09-29.** Firebase-era, broken. |

**A CI job (`path-guard`) fails the build if `mobile_app/`, `landing_page/`,
`firebase.json`, `.firebaserc`, `firebase_config/`, or a nested workflow file
reappears.**

---

## 4. DEPLOYMENT

| What | How |
|---|---|
| Landing page | `~/bin/pigpulse-autodeploy.sh` (auto, 5 min) or `scripts/deploy-landing.sh` |
| Expo app | `cd v3-mqtt-pocketbase/frontend/mobile_app && npx vercel --prod` |
| Pi backend | `rsync` repo `backend/` → `/home/pigpulse/`, then `systemctl restart` |

- **Vercel project `pig-health-monitor`** → `https://pig-health-monitor.vercel.app/`
  - `/` = landing page (must stay the root)
  - `/app/` = Expo web shell, `/app/tabs` = dashboard
- `pig-health-research-portfolio.vercel.app` = secondary alias, not canonical.
- **`scripts/deploy.sh` is DISABLED** — it deployed the stale app over the
  landing page. Do not re-enable; use the commands above.

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
| 1 | Pi ↔ cloud sync (the `synced:false` worker) | **not built** — see §2.1 |
| 2 | `setup_pocketbase.py` stale vs migrations | not updated |
| 3 | `deploy/systemd/` is empty — laptop units unversioned | not done |
| 4 | Camera RTSP creds hard-coded in source | not moved |
| 5 | LWT/`status` topic missing from ESP32-S3 firmware | `devices` rows go stale |
| 6 | `pig/+/audio` has no publisher | orphaned contract |
| 7 | Tailscale not installed on Pi; AP has no WAN | blocks remote access |
| 8 | TLS cert has no `192.168.69.1` SAN | regen on the Pi |

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
