# PigPulse — Canon, Part 4: System, Power, Rules, Open Items

**Version 2.0 — 2026-11-02**

> **Credentials are deliberately omitted from this file.** Any password, key, or
> passphrase lives in the repo's own secrets section and must never be copied into
> a cloud document. Entries read `[REDACTED]` here by design.

---

## 1. Data path

```
┌──────────── PI EDGE — standalone AP "PigPulse", 192.168.69.0/24, NO WAN ────────────┐
│  MLX90640 ──I²C──► thermal-pi :8080 (HTTPS) ──► phone browser                       │
│  ESP32-S3 "s3-mic-01" ──TCP:9090──► esp_audio_ingest                                │
│                        └──MQTT──► mosquitto :1883 ──► local_bridge ──► PocketBase    │
│  Tapo C200C ──RTSP──► ffmpeg ──► tapo_mjpeg :8091 (loopback only)                   │
└───────────────────────────────────────┬─────────────────────────────────────────────┘
                                        ╳  no inbound replication path
┌───────────────────────────────────────┴─────────────────────────────────────────────┐
│  LAPTOP RIG: PocketBase :8090 (native) · ValKey :6379/:6380 · Mosquitto (docker)     │
│  OpenResty :80 (gateway) · thermal-ws :8080 (docker)                                │
└───────────────────────────────────────┬─────────────────────────────────────────────┘
                    Expo app ──HTTP/SSE──┘
```

**The two-island gap (closed 2026-09-29).** The Pi publishes its own thermal data
over MQTT as `pi-thermal-01`; the existing bridge picks it up with no new bridge
code and writes rows with `synced: false`. A separate worker, `cloud_sync.py`,
**runs on the laptop** and ships those rows to the cloud PocketBase, then marks
the source synced.

- **Why the worker runs on the laptop:** the Pi AP has no WAN, so the Pi cannot
  reach anything. Tailscale cannot fix this — every tailnet node must reach the
  coordination server over the public internet, so a node with no internet cannot
  enrol.
- **Delivery semantics: at-least-once.** A row is marked synced only *after* the
  cloud insert succeeds, so a crash mid-batch re-sends rather than loses.
- **Status:** built, but **never tested end-to-end** `[OPEN]`.

**MQTT wire contract — the topic shape is mandatory:**
`pig/{deviceId}/{channel}`. The legacy `pig/telemetry/{x}` form is **incompatible**
— the bridge would read `deviceId="telemetry"`.

## 2. Storage — PocketBase behaviour that silently eats data

- Version is **0.22.20** `[MEASURED]`. It **cannot run `.js` migrations** (those
  need 0.23+). `pocketbase migrate up` prints "Applied" for every `.js` file and
  **changes nothing**.
- **PocketBase silently discards unknown fields.** `ALTER TABLE` alone changes
  nothing — PocketBase serves only fields declared in the `_collections.schema`
  JSON. A thermal payload round-tripped with **7 of 14 keys missing** `[MEASURED]`.
- This previously cost the entire `audio_events` stream. **After any payload
  change: add the field via migration AND verify by publishing one row and
  diffing published-vs-stored.**
- Collections: `telemetry`, `alerts`, `devices`, `pigs`, `audio_events`, plus auth
  `users`.

## 3. Network constraints — 2.4 GHz is LOCKED

This is a **hard constraint, not a preference**:

| Device | Band | Consequence |
|---|---|---|
| Tapo CCTV | 2.4 GHz only | no 5 GHz fallback |
| ESP32-S3 | 2.4 GHz only | it is the only audio sensor |
| Pi 4B built-in radio | 2.4 GHz only | **a single radio cannot be AP and client at once** |

Making the Pi's built-in radio a WAN client **would take over the radio and drop
the CCTV and the ESP32-S3.** Bandwidth is not the constraint — the sensors are
tiny. Reach, and having any uplink at all, are. The planned topology uses a
second radio (USB adapter on 5 GHz) so the sensor band is untouched.

- Regulatory domain is **PH** `[MEASURED]`, capping 2.4 GHz to channels 1–11.
  The AP uses channel 6 — legal. **Do not move it to 12/13.**
- The Pi AP is an isolated island. **Router mode is armed and inert:** NAT and
  forwarding are configured, but there is no upstream. The moment any upstream
  exists (working ethernet lease, or a phone USB-tethered to the Pi), the whole
  AP gains internet with zero further configuration. This supersedes the
  island rule **outbound only** — no inbound ports are opened.
- **Known gotcha:** `wlan0` is hard-coded as the AP interface in five places.
  Plugging in a USB adapter can renumber interfaces and silently move the AP to
  `wlan1`, dropping the sensors with no obvious cause.

## 4. Deployment surface

- **One web deploy path:** Vercel project `pig-health-monitor` →
  `https://pig-health-monitor.vercel.app/`. `/` = landing page, `/app/` = Expo web
  shell, `/app/tabs` = dashboard, `/api/telemetry` = read-only JSON.
- The landing deployment is **combined** — it stages the Expo export under `app/`
  first. Deploying the landing alone silently kills the dashboard.
- **Admin surface is loopback only:** `/` `_/` and `/admin/` return **403** through
  the gateway; the admin UI is reachable only at `127.0.0.1` on the PocketBase port.
- **There is no port 8091 exposed.** Any document saying otherwise is stale.
- **Firebase is retired.** It must not reappear; CI fails the build if it does.

## 5. Power and energy — `[CORRECTED]` a self-contradiction

### 5.1 The ESP32-S3 battery claim does not compute

Documents state together: duty cycle "10 s on / 5 min off" → "~30 mA average" →
"~170 hours (~7 days)". These are **mutually exclusive** `[VERIFIED]`:

```
duty cycle            = 10 s / 310 s                     = 3.23 %
active 260 mA (max)   → duty-averaged                     =  8.39 mA
active 240 mA         → duty-averaged                     =  7.74 mA
to reach "30 mA avg" you need an active current of 930 mA = 3.6× the S3's maximum
170 h from 5.92 Wh usable                                 =  9.41 mA average
if the average really is 30 mA → runtime                  = 53.3 h  (NOT 170 h)
```

**Verdict:** the *runtime* (170 h) is consistent with a duty-averaged ~9.4 mA; the
*current figure* (30 mA) is not. Most likely 30 mA is a mislabelled **active-mode**
current that was never duty-averaged before being written beside a runtime that
was.

**Fix — pick one and use it everywhere:**
- `~9.4 mA average → ~170 h`, **or**
- `30 mA average → ~53 h`.

### 5.2 Energy figures that reproduce exactly `[VERIFIED]`

| Quantity | Value |
|---|---|
| 2000 mAh @ 3.7 V | 7.4 Wh |
| Usable at 80 % depth of discharge | 5.92 Wh |
| Pi 4 idle runtime on that pack | 2.40 h |
| Pi 4 energy over 7 days | 414.96 Wh |
| Pack required for 7-day Pi load | 518.7 Wh (~519 Wh) |
| Capacity ratio (pack ÷ small battery) | ~70× |
| UPS HAT 2 × 2600 mAh | 19.24 Wh |
| UPS HAT usable / Pi runtime | 15.39 Wh / 6.23 h |

**Interpretation:** the Pi cannot run on a small battery for a week — it needs
mains plus a UPS hold-up. Battery duty-cycling belongs to the ESP32-S3 sensor
node, not the Pi. Keep these two power budgets separate.

## 6. Health score — `[CORRECTED]` undefined

Documented score→health pairs (1.046→65, 1.902→45, 2.267→35, 3.175→25) do **not**
fall on a line `[VERIFIED]`:

| Fit | Equation | Worst deviation |
|---|---|---|
| Two-endpoint line (1.046→65 and 3.175→25) | `H = 84.65 − 18.79 × score` | **7.06 points** |
| Least-squares over all four points | `H = 82.30 − 18.97 × score` | 4.28 points |

Neither is a fit worth defending — the four documented points are simply not
collinear.

**The transfer function must be written down explicitly**, or the classifier's
output is unfalsifiable. Two endpoints do not define a curve.

## 7. Cost / benefit framing — `[CORRECTED]` inconsistent

`₱3,290 ÷ ₱800 avoided loss per pig = 4.11 → 5 pigs` for payback. But the abstract
describes a system for **"a single animal."** A one-pig deployment can never pay
back a ₱3,290 BOM.

**The economics chapter and the abstract describe different products.** Fix the
framing: either it is a multi-pig pen system (then say so and scale the BOM), or it
is a single-animal prototype (then drop the payback arithmetic).

## 8. Repository hard rules

| # | Rule |
|---|---|
| R1 | The only project directory is `/home/solrahk/pig-health-monitor`. No alternative spellings. |
| R2 | `PigHealthMonitor_ARCHIVE_OFFLINE` is read-only. Never edit, build, or deploy from it. |
| R3 | Never create a new top-level directory. New code goes into an existing canonical path. |
| R4 | Never `sudo` for builds, `npm`, `pip`, or git — only for system paths. |
| R5 | Never commit a secret. |
| R6 | Firebase is retired; CI fails the build if it reappears. |
| R7 | One Vercel project, one deploy path. |
| R8 | **Confirm-and-Archive** — when a component is confirmed working, archive its state immediately with measured proof; that archive is the revert path. |

**Source-of-truth direction is repo → card.** Card→repo drift caused six real bugs.

**Hardware grounding rule:** never write "confirmed" about a board, mic, or I²C bus
without a device readout. Zeros ≠ a quiet mic.

## 9. Open items that block or limit results

| # | Item | State |
|---|---|---|
| 1 | Pi ↔ cloud sync | built, **never tested end-to-end** |
| 2 | Bridge cannot start — its PocketBase password is unknown (bcrypt, unrecoverable) | **blocks the bridge** |
| 3 | MLX90640 I²C | **intermittent** — has died and recovered before |
| 4 | ESP32-S3 mic | firmware deployed and produced real audio; has also returned all-samples-minus-one. Revert path exists |
| 5 | Two SD cards in circulation, unlabelled | always confirm which card booted before diagnosing |
| 6 | Camera SD recording cannot be armed app-less | management API needs the original cloud-owner credential — a third party's account |
| 7 | Camera SD card is dying | all 87 finalized clips salvaged; card retired — never reuse |
| 8 | GY-SHT45 | owned, unconnected, untested |
| 9 | No `/cctv` route in the **laptop** gateway | the Pi's route exists; the laptop's does not |
| 10 | Live video cannot ride the record-sync worker | it syncs records on an interval, not a stream |

**Per-Pi capability claims are unverified until read off the device.** There are no
CPU, throttling, memory, or SD-endurance measurements for the Pi in the repository,
and none may be invented from a spec sheet.
