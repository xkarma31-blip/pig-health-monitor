# PigPulse — Pi File Manifest (for review)

**Generated:** 2026-09-30
**Source:** `/home/solrahk/pig-health-monitor/v3-mqtt-pocketbase/backend/`
**Branch:** `feat/v3-mqtt-pocketbase` @ `24c32ae`

## ⚠️ READ FIRST — these are REPO COPIES, not live device readouts

**The Pi is OFFLINE.** Verified at manifest-generation time:

| Probe | Result |
|---|---|
| `ping -c 2 192.168.69.1` | **2 transmitted, 0 received, 100% packet loss** |
| `ssh pigpulse@192.168.69.1` | **Connection timed out** (port 22) |
| Tailscale tailnet | 5 nodes, **Pi is not among them** |

The laptop is on `192.168.254.121/24` (home LAN) — **not** joined to the
PigPulse AP (`192.168.69.0/24`).

Therefore every file below is the **git working-tree copy**, which is the
`rsync` source for `/home/pigpulse/`. It is **not** proof of what is running
on the device. Per CANON §2.5, no Pi-side capability claim may be made
without a device readout.

To get real readouts, the laptop must first join the AP:

```bash
nmcli con down GFiber_E9BD4
nmcli con up uuid 4f088feb-bb8d-4dd6-b238-16241cbc89c0
```

Then, on the Pi, run the diagnostic (CANON `npm run diag:pi`):
`vcgencmd measure_temp`, `vcgencmd get_throttled`, `free -h`, `i2cdetect -y 1`,
`lsblk`, `dmesg | grep -iE 'mmc|ext4|throttl'`.

---

## 1. thermal-pi/ — sensor + ingest tier (836K)

| File | Size | Role |
|---|---|---|
| `web_server.py` | 27,313 | **Main HTTPS dashboard**, port 8080. Serves thermal grid + live PCM |
| `admin_console.py` | 36,234 | Read-only technician console at `/admin` |
| `mlx_reader.py` | 10,135 | **MLX90640 I2C reader — uncommitted work** (75 lines added 09-30) |
| `esp_audio_ingest.py` | 9,041 | TCP :9090 PCM ingest from ESP32-S3 |
| `thermal_publish.py` | 10,606 | 🔴 **root-owned** — publishes to MQTT |
| `config.py` | 5,287 | 🔴 **root-owned**. `WIFI_IFACE` at line 64 |
| `pigpulse_stats.py` | 4,872 | Stats helper |
| `i2c_scanDiag.py` | 2,475 | I2C bus scanner |
| `tls.crt` / `tls.key` | 1,273 / 1,704 | 🔴 **root-owned**. Port 8080 is HTTPS-only |
| `requirements.txt` | 397 | venv deps |
| `README.md` | 11,382 | thermal-pi documentation |
| `static/` | dir | Web assets |
| `scripts/` | dir | thermal helper scripts |
| `wheels/` | dir | Offline pip wheels (staged debs pattern) |

## 2. bridge/ — MQTT → PocketBase (88K)

| File | Size | Role |
|---|---|---|
| `local_bridge.py` | 11,803 | 🔴 **root-owned**. **The real bridge.** Refuses to start w/o creds |
| `mqtt_bridge.py` | 9,547 | ⚠️ **Legacy twin.** This is what the LIVE laptop unit runs |
| `Dockerfile` | 175 | Container variant |
| `requirements.txt` | 34 | |
| `tests/` | dir | |

## 3. cctv/ — Tapo camera (24K)

| File | Size | Role |
|---|---|---|
| `tapo_mjpeg_server.py` | | RTSP → MJPEG on :8091. **CANON: no `/cctv` route exists in the live gateway — the proxy was never configured.** RTSP creds still hard-coded |

## 4. workers/ — cross-island sync (64K)

| File | Size | Role |
|---|---|---|
| `cloud_sync.py` | | Pi → cloud PB batch sync, 60s, `synced` flag. **Laptop-side only** |
| `readonly_pb_proxy.py` | | Loopback :8099 read-only proxy → Tailscale Funnel → Vercel. **Strongest sandboxed unit** |

## 5. scripts/ — ops (100K)

| File | Role |
|---|---|
| `bootstrap_mosquitto.sh` | Offline staged-deb install (called by oneshot unit) |
| `health_check.py` | `WIFI_IFACE` at line 43 |
| `thermal_doctor.py` | 🔴 **UNTRACKED** — new 09-30, "make a dead MLX90640 visible" |
| `add_thermal_fields.py` | 🔴 **UNTRACKED** — PB migration helper |
| `backup_to_cloud.sh` | |

## 6. setup/ — seed data

| File | Role |
|---|---|
| `seed_pocketbase.py` | ⚠️ **Source of the seeded demo data** currently on the public dashboard |
| `seed_mqtt.py` | |
| `setup_pocketbase.py` | |

## 7. systemd/ — units (52K)

8 units + `mosquitto-pigpulse.conf` + `config.txt` + `pigpulse-thermal.service.d/tls.conf`.
Full contents were reviewed separately — see prior message.

## 8. firmware/ (not Pi-deployed, listed for completeness)

`v3-mqtt-pocketbase/firmware/esp32s3-mic-ambient/` — the only node. Zero ESP-NOW
in source; MQTT via `include/PigMqttTopics.h`.

---

## 🔴 Ownership damage (violates CANON R4 — "no casual sudo")

**Root-owned files inside the rsync deploy path:**

```
thermal-pi/thermal_publish.py
thermal-pi/tls.crt
thermal-pi/tls.key
bridge/local_bridge.py
```

Plus at repo root: `CANON.md`, `legacy/`, `tools/`, `node_modules/`.

These break `npm run ci:backend` (byte-compile) and any agent edit without sudo.
`tls.key` at `0600 root` is correct and must **stay** root-owned.

## 🔴 Uncommitted work (8 files, 151 insertions)

```
.gitignore                                      |   4 +
backend/bridge/local_bridge.py                   |   9 +-
backend/systemd/pigpulse-bridge.service          |   4 +-
backend/systemd/pigpulse-pocketbase.service      |  16 +-
backend/thermal-pi/mlx_reader.py                 |  75 +++-
backend/thermal-pi/static/index.html             |   2 +-
backend/thermal-pi/tls.crt                       |  35 +--
backend/thermal-pi/web_server.py                 |  32 ++-
```

Untracked: `thermal_doctor.py`, `add_thermal_fields.py`.
Last commit `24c32ae` is 2026-09-30; the tree has moved since.
