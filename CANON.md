# ARCHITECTURAL CANON & SOURCE OF TRUTH

> **READ THIS BEFORE CREATING, MOVING, OR DEPLOYING ANYTHING IN THIS REPO.**
> Authority: repository location, branch, topology, deployment, safety rules.
> If any other document (including dated briefings, orientation snapshots, or
> a stale `AGENTS.md`) contradicts this file, **this file wins**.
> Last verified against the working tree: **2026-10-29** (board model, regdom, PocketBase
> version, migration filenames and thermal schema all verified from device
> readouts; repo structure, open items, hardware status, and branch inventory
> re-verified in a full Q&A review on this date).

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
| **MLX90640** | thermal camera, I²C on Pi | ⚠️ **intermittent** — working as of 2026-10-13 (~2 FPS, confirmed by Master 2026-10-29). Has died and recovered before (dead 2026-09-28, back by 2026-10-13). Run `thermal_doctor.py --fix` if it drops again |
| **ESP32-S3** (`s3-mic-01`) | the ONLY mic. TCP :9090 audio, MQTT telemetry | ✅ **USB accessible** (2026-10-13, §1). Firmware `pigpulse-mic-pcm16-20261013` deployed. Mic hardware intermittent — produced real audio 2026-10-13, returned all-samples-minus-one 2026-10-14. Master confirms working as of 2026-10-29. See `KNOWN_GOOD.md` for revert |
| **GY-SHT45** | environmental temp/humidity sensor (I²C) | 🔲 **owned, unconnected, untested.** Planned for ESP32-S3 I²C bus. Measures pen-air context; must NOT replace MLX90640's internal temperature compensation — see §2.7 |
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
> audio. Thermal ran at ~2 FPS. The laptop rig continues to show **seeded demo
> data** — live sensor data has not yet reached the laptop PocketBase (see §2.1:
> `cloud_sync.py` is built but never tested end-to-end).

> The removed Pi GPIO mic used `dtoverlay=googlevoicehat-soundcard`, which needs
> a physical codec chip this board does not have. It returned **bit-exact zeros**
> (1,920,000 samples, all exactly 0, both channels — a null source, not a quiet
> room). Do not re-add the overlay without a real codec present.

### 2.6 PocketBase is 0.22.20 and CANNOT run `.js` migrations

> **MEASURED 2026-09-30, not inferred.** `pocketbase --version` on the shipped
> binary returns `pocketbase version 0.22.20`, and its CLI exposes `admin`
> (v0.22 naming), not `superuser` (v0.23+). JS migrations require **0.23+**.

Consequences, all verified by inserting a real telemetry row and reading it
back rather than by assumption:

1. `pocketbase migrate up` prints `Applied <file>.js` for every `.js` file and
   **changes nothing**. It does not execute them and does not record them.
2. `ALTER TABLE telemetry ADD COLUMN verdict TEXT` also changes **nothing** —
   PocketBase serves only fields declared in the `_collections.schema` JSON, so
   an undeclared column is silently discarded. A thermal payload round-tripped
   with 7 of 14 keys missing.
3. So the thermal fields were applied with
   `backend/scripts/add_thermal_fields.py`, which writes both the SQLite
   columns and the `_collections.schema` JSON using the migration's own field
   ids (`thmvrdct`, `thmhotpt`, …). It is idempotent.
4. All 8 `.js` migrations are recorded in both databases' `_migrations` tables,
   so 0.22.20 attempts none of them and boots clean.

**`deploy/pocketbase/bin/pb_migrations/` and `bin/pb_data/` are the LAPTOP's
live instance.** The Pi keeps its own copy at `/home/pigpulse/pocketbase/`.
Renaming a migration file fixes one database and breaks the other — that
happened on 2026-09-30 and put the laptop's `pigpulse-pocketbase.service` into
the same crash loop. Reconcile both in the same change; see the README in that
directory.

### 2.7 Sensor fusion — what is grounded vs. aspirational (2026-10-29)

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
its own validation before adoption. Owned but unconnected/untested as of
2026-10-29.

**Modality capability matrix:**

| Sensor | What it CAN do (demonstrated) | What it CANNOT do |
|---|---|---|
| **MLX90640 thermal** | Pen-level surface-temperature patterns; group thermal trends; display via bicubic interpolation | Individual pig temperature at pen distances (each pixel ≈ 6×5 cm at 2 m covers too much body); SR cannot recover optics-averaged detail or improve ±1.5°C sensor accuracy |
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
| 12 | **MLX90640 I²C** | ⚠️ **intermittent** — was dead (EIO) after 2026-09-28, recovered by 2026-10-13 (thermal live at ~2 FPS per §1). Master confirms working as of 2026-10-29. Run `thermal_doctor.py --fix` if it drops again. **Archive working state per R8 after next confirmed session** |
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
