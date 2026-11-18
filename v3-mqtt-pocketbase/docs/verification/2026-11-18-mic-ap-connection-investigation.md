# 2026-11-18 — S3 mic silence: full step retrace and corrected root-cause analysis

> **This supersedes the first version of this file.** The first version labelled Pi-local
> wall-clock times as "PST". They are **Asia/Manila (UTC+8)**. That 8-hour error made the
> Pi reboot look like it happened *while* the mic was still transmitting, and sent the
> investigation after the wrong causal chain. Everything below is re-derived from **raw
> journal epochs** and **PocketBase `created` values**, which agree with each other.

## Provenance

- **Time base.** Pi `/etc/localtime` → `Asia/Manila`; `/etc/timezone` = `Asia/Manila`
  (mtime 2026-09-23). `journalctl` renders Manila wall-clock, so every "18:40 / 19:45" in
  earlier notes is Manila, not PST. All times here are **UTC** with Manila in parentheses.
- **Clock quality.** Journal boot entries overlap at boot boundaries (boot −2 last entry
  142 s *after* boot −1 first entry; boot −1 last 171 s after boot 0 first) — the Pi clock
  steps. Epoch *differences* are therefore used for sequencing, and the incident window is
  anchored by PocketBase `created`, the mosquitto log and hostapd agreeing to the second.
- **Pi facts:** live readouts over Tailscale (`iw`, `journalctl`, `dnsmasq`, `soak.db`,
  PocketBase admin API). **ESP32 facts:** the archived actually-flashed source
  `firmware/esp32s3-mic-ambient/docs/known-good-20261113-shtfinal/src/esp32s3_telemetry.ino`
  (1157 lines), firmware ID `pigpulse-mic-sht45-20261113-shtfinal`.
- **Nothing was changed on the ESP32 or in its firmware.**

## Corrected timeline (UTC; Manila = UTC+8)

| UTC | Manila | Event — measured |
|---|---|---|
| 08:54:11 | 16:54:11 | Mic authenticated + associated (aid 1) on **wlan1** (USB dongle); WPA pairwise handshake; DHCPACK `192.168.69.15`, host `esp32s3-DD313C`. |
| 09:42:06 | 17:42:06 | Watchdog restarts hostapd (`rx_rate_info` 20/10 < 40). Mic re-associates. |
| 09:44:41 | 17:44:41 | Watchdog restarts hostapd again. Mic re-associates + DHCPACK. |
| 09:51:51 | 17:51:51 | Watchdog restarts hostapd again. Mic re-associates + DHCPACK. |
| 09:54:15 | 17:54:15 | Audio stream established (≈96 kB/s sustained, soak `esp_bytes` climbing). |
| **10:38:57.9** | **18:38:57.9** | **LAST audio byte AND LAST telemetry row — same millisecond** (soak `lastms`=5199 at 10:39:03 ⇒ last byte 10:38:57.801; PB `timestamp`=1794911937898). |
| 10:39:03 | 18:39:03 | `esp_audio_ingest` closes the half-open socket after its 5 s silence timeout (`connected 1→0 stale 0→1, lastMs=5199`). No FIN observed before the ingest's own silence-close. |
| 10:40:22 | 18:40:22 | Watchdog: `ghost station 68:ee:8f:dd:31:3c: rx frozen … → deauthenticate`. |
| 10:40:27 | 18:40:27 | hostapd: `deauthenticated due to local deauth request`. |
| 10:40:28 | 18:40:28 | mosquitto: `Client s3-mic-01 has exceeded timeout, disconnecting` → LWT fires. Bridge inserts **zero row** (`mic=false, rms=0, peak=0, sr=48000`) = the retained will. |
| **11:45:53** | **19:45:53** | **Pi reboots — 67 minutes AFTER the mic died.** No shutdown sequence in the journal. |
| 11:46:09 | 19:46:09 | Bridge starts, restores anchor state, reconnects 11:46:16. |
| 16:10:00 | 00:10:00 (18th) | Bridge **reconnects** (not a board sighting); paho redelivers the **retained will** → `resumed after 13617 s of silence` + a second identical zero row. |
| 00:18:30 (18th) | 08:18:30 | Pi reboots again (2nd in 33 h). |
| 01:17 (18th) | 09:17 | Pi reboots again (3rd). |
| 00:54:52 / 01:09:47 / 01:19:57 | 08:54 / 09:09 / 09:19 | Three more **identical zero rows**, each timestamped to a bridge reconnect — same retained will. |

## The two "zero rows" are broker artifacts, not board sightings

`backend/bridge/local_bridge.py`:

- **line 331** — `payload["timestamp"] = int(ANCHOR.now_ms())`: the row timestamp is the
  **bridge's arrival clock**, never the device's.
- **lines 307–310** — subscribes `pig/+/telemetry`; paho delivers **retained** messages on
  subscribe.
- **lines 333–336** — `ANCHOR.observe()` computes the gap in **monotonic** seconds from a
  state file (`/var/lib/pigpulse/bridge/anchor_state.json`, `ANCHOR.load()` on start), so a
  "13617 s silence" can span reboots and reconnects and is **not** a measurement of the
  board.
- Firmware **line 625/632** — the will is
  `{"mic":false,"rms":0,"peak":0,"sr":48000}` with **retain=true**.

⇒ Every zero row is the will being redelivered on a bridge reconnect. The last three rows
(08:54, 09:09, 09:19 Manila) are **reconnect artifacts**, not evidence the board returned.

## The decisive measurement: both streams died at the same millisecond

- Soak `esp_bytes` last increment: 395,850,680 at 10:38:57.8.
- Last telemetry row payload timestamp: 1794911937898 = 10:38:57.898.

Audio and MQTT are **separate tasks** on the board. A blocked `tcpStream.write()` (the
documented ~5 s stall at lines 99–105) would stall audio while MQTT kept publishing. Here
**both stopped together**, and the board stayed associated for another 90 s (the AP had to
deauth a ghost). That is a **chip-level event** — reset, brownout, crash or power loss —
not a software stall.

## The diagnostic counters exist but were thrown away

Firmware lines 869–883 build the telemetry payload with:

```
"boots":%lu, "rr":%lu, "br":%lu, "txp":%ld,
"pubms":%lu, "wrms":%lu, "pubn":%lu, "wrn":%lu
```

- `boots` = RTC boot count, `rr` = `esp_reset_reason()`, `br` = brownout-seen flag.
- Lines 906–917 compute exactly the discriminator the investigation needs:
  `reason 15/16 BROWNOUT` ⇒ rail sagged; `reason 1 POWER-ON` ⇒ supply dropped out.

**PocketBase's `telemetry` schema has no `boots` / `rr` / `br` / `txp` / `pubms` / `pubn` /
`wrn` fields**, and PocketBase silently drops unknown fields. Measured: **zero** occurrences
of `"boots":` anywhere in the journal. The board was transmitting the answer and the
pipeline discarded it.

## The Pi is itself unstable (separate, serious finding)

- **Five boots today**; hard resets roughly hourly (17th 19:45, 18th 08:18, 09:17, ~10:15,
  ~12:01). Each ends with **normal service logs and no shutdown sequence** — no `Stopping…`,
  no `Reached target Shutdown`, no kernel panic, no `Reached target Shutdown`.
- `/sys/fs/pstore` is **empty** — no saved panic/reset record from the previous boot.
- `bcm2835-wdt` is active via the stock Raspberry Pi drop-in
  `/usr/lib/systemd/system.conf.d/40-rpi-enable-watchdog.conf`
  (`RuntimeWatchdogSec=1m`, `RebootWatchdogSec=2m`). A systemd/kernel stall > 60 s produces
  exactly this signature: an abrupt reset with nothing logged.

**Ruled out by direct readout** (not by inference):

| Check | Reading | Verdict |
|---|---|---|
| `vcgencmd get_throttled` | `0x0` (bit 16 clear) | no undervoltage ever |
| `vcgencmd measure_temp` | 46.2 °C | not thermal |
| `free -h` | 3.1 GiB available, swap 0 B used | no memory pressure |
| OOM kills (all journal) | 0 | no OOM |
| D-state processes / `vmstat` `wa` | none / 0 after first sample | no I/O stall |
| `systemctl --failed` | 0 units | nothing failing |
| kernel log | no hung task / mmc / EXT4 error | no kernel fault |

So the resets are **not** power-thermal-memory-software as far as the Pi can measure itself.
The remaining cause is an **external reset with no on-device trace** — most consistent with a
brief VBUS/power interruption (a loose USB-C connection or a sagging 5 V supply), which a
clean power loss would not log and which would not necessarily trip the undervoltage flag.

- Consequence: the Pi is a **hostile host** for the AP and all services, independent of the
  mic. This did **not** cause the mic's death (the mic died 67 min before the first reset),
  but it will keep taking the AP down.

## Firmware audit (static, 2026-11-18)

A line-by-line audit of the flashed source found four real defects. None is proven to have
fired on the device, but they change what "the firmware cannot stay silent" means:

1. **The 900 s chip restart is unreachable.** `wifi_task()` recycles at 120 s
   (`WIFI_RECYCLE_MS`) and resets `lastLinkMs = nowMs` at **line 542**, so
   `nowMs - lastLinkMs` can never reach `WIFI_HARD_RESET_MS` (900 s, line 561).
   `ESP.restart()` is dead code in an ongoing outage. A wedged WiFi driver is therefore
   never cleared by a full chip reboot.
2. **Radio re-init failures are unchecked and unlogged.** Lines 537–541 call
   `WiFi.mode(WIFI_STA)`, `WiFi.begin(...)`, `WiFi.setTxPower(...)` and discard every
   return value. If STA re-init or `begin()` fails, the radio stays off with no log line.
3. **TX power is downgraded on every recycle and never restored.** Boot uses
   `WIFI_POWER_19_5dBm` (line 453); the recycle sets `WIFI_POWER_8_5dBm` (line 541).
   Weakens the link after the first recycle; not a silence cause.
4. **PubSubClient is used without `mqttMutex` in two failure paths** (lines 1000–1004 and
   1032–1033), racing the MQTT task. A genuine thread-safety violation that could produce
   MQTT-only silence.

Also confirmed: **no NVS/Preferences radio-off flag exists**, `disconnect()` is always
called with `eraseap=false`, and every boot runs `WiFi.mode(WIFI_STA)` +
`WiFi.begin(WIFI_SSID, WIFI_PASS)`. So **no persistent state can keep the radio off across
a power-cycle.** Boot's longest pre-association wait is ~25 s (10 s scan + 15 s connect
loop) — far shorter than our 23 h observation window.

## Root-cause ranking (corrected)

1. **Board-level power loss / brownout at 10:38:57.9Z** — best fit. Explains: simultaneous
   loss of both tasks, no FIN, no reassociation, no association/authentication attempt
   afterwards, survival of a user power-cycle, and other clients unaffected. The firmware's own comment (lines
   107–118) names the mechanism: USB-powered from a *DIY 5 V brick with mixed cables*,
   500–600 mA peaks at 19.5 dBm, series resistance sagging 3V3 under the brownout
   threshold. **Unconfirmed** — needs the serial readout.
2. **Hard fault / crash loop before WiFi init** — possible, but a resetting chip re-runs `esp_wifi_init` and would attempt association; **no association or authentication attempt** appears in 23 h of hostapd/dnsmasq logs, which argues against it. (Probe requests are not logged at hostapd's default level, so "zero probes" is **not** a measurable claim here.)
3. **Watchdog deauth** — real, but it happened **90 s after** the board stopped; it is a
   *consequence* (ghost cleanup), not the cause. The three earlier AP restarts explain the
   09:42/09:44/09:51 reassociations, not the death.
4. **Firmware defect** — **partially supported, as a persistence mechanism rather than the
   trigger.** The audit above shows a wedged board *can* stay silent indefinitely (unreachable
   900 s restart + unchecked reinit), but **not across a genuine power-cycle**, because no NVS
   flag stores radio-off and every boot re-runs `WiFi.begin()`. So the firmware explains
   *why it never self-healed*, not *why it stopped*. A rebuild is still not justified without
   a serial fault — but defects 1–4 are real and should be fixed regardless.
5. **AP credentials / config** — ruled out: passphrase matches the flashed constant, full
   WPA handshakes + DHCP on this BSSID at 08:54/09:42/09:44/09:51, no auth-failure lines in
   the entire hostapd journal, and the mic ignored later AP restarts.
6. **Hotspot fallback / "alive on another network"** — ruled out: the flashed source defines
   only `WIFI_SSID = "PigPulse"` (line 48) and calls `WiFi.begin(WIFI_SSID, WIFI_PASS)`
   **explicitly** at lines 436, 540 and 556. No second SSID, no `softAP`, no stored-config
   path, no NVS BSSID lock. A powered, running board therefore *must* attempt PigPulse with
   the right credentials — which is why silence implies it is not executing the WiFi path.

## What is still unproven

- Whether the board **lost power**, **browned out**, or **hard-faulted** at 10:38:57.9Z.
  Only `boots`/`rr`/`br` on serial can separate these, and those fields never reached
  PocketBase.
- Whether the board is currently **unpowered** (brick/cable/connector) or **powered but not
  running the app**.

## The one decisive physical test

Board USB → laptop, then:

```bash
ls /dev/ttyACM*                                   # expect /dev/ttyACM0
esptool --chip esp32s3 --port /dev/ttyACM0 chip_id
python3 -m serial.tools.miniterm /dev/ttyACM0 115200
```

Read the boot lines:

- `[boot] count=N reason=15 BROWNOUT` (or 16) ⇒ **the 3V3 rail sagged** → replace the 5 V
  brick / cable / connector first.
- `[boot] count=N reason=1 POWER-ON` with `count` **not** rising across resets ⇒ **the
  supply is dropping out completely** → power path.
- `[wifi] scan count=0` or no `[wifi]` line at all ⇒ the app never reaches WiFi init →
  flash/boot fault.

## Recommended fixes (not yet applied)

1. **Close the observability gap** — add `boots`, `rr`, `br`, `txp`, `pubms`, `pubn`, `wrn`
   to the `telemetry` collection via a PocketBase migration, so the next event is diagnosable
   without serial.
2. **Stop the retained-will artifact** — the bridge inserts a zero row on every reconnect.
   Skip retained messages (`msg.retain`) or stop retaining the LWT, so the app never shows a
   fabricated "mic offline" sample. Note the firmware's retained `mic:false` also leaves
   retained-state-only consumers reporting offline even after live telemetry resumes.
3. **Pi hard resets (~hourly)** — software causes are ruled out by the readout table above.
   Check/replace the Pi's 5 V supply and USB-C cable first; raising `RuntimeWatchdogSec` via
   an `/etc/systemd/system.conf.d/` drop-in is a **mitigation, not a fix**.
4. **Firmware defects (queue; do not flash blind)** — per the audit:
   (a) make the 900 s chip restart reachable (the 120 s recycle resets `lastLinkMs`);
   (b) check and log `WiFi.mode`/`WiFi.begin`/`WiFi.setTxPower` return values;
   (c) restore 19.5 dBm after a successful (re)connect;
   (d) take `mqttMutex` in the two failure paths.
   These explain why the board never self-healed, but a flash needs the serial readout first.

## Radio-role rollback (unchanged, 06:53–06:56 Manila)

- Pre-change snapshot `/root/pigpulse-backups/radio-roles-pre-revert-20261118-065345` (9 files).
- `backend/portal/rollback-radio-roles.sh` applied; AP resolved to `wlan0`.
- Measured: hostapd active, `ssid=PigPulse` on `wlan0` (brcmfmac `dc:a6:32:87:63:a1`), ch 6,
  gateway `192.168.69.1` on wlan0, stale dongle IP flushed.
- Watchdog calibration drop-in removed/archived; `PIGPULSE_AP_MIN_RATE=40` restored.
- CCTV re-associated with a fresh lease for `192.168.69.2`.
- Mic still absent: **0** hostapd lines for `68:ee:8f:dd:31:3c` since boot.