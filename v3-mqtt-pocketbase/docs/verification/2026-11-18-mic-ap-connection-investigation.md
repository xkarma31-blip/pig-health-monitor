# 2026-11-18 — `s3-mic-01` mic + AP connection investigation (verified record)

> **This file REPLACES the earlier version.** That version collapsed several distinct
> failures into one "simultaneous chip-level death at 10:38:57.9Z" narrative and labelled
> Pi wall-clock as PST (it is Asia/Manila, UTC+8). Both errors sent the investigation
> down the wrong causal chain. This version separates the incidents, states the
> provenance of every claim, and refuses to call anything "confirmed" without a readout.

**Scope:** `s3-mic-01` (ESP32-S3, MAC `68:ee:8f:dd:31:3c`) and the PigPulse AP.
**Time base:** UTC; Manila = UTC+8. Raw journal epochs are UTC; `journalctl` wall-clock
on the Pi is Manila. Never mix them.
**No hardware was flashed, reflashed, or changed by this investigation.**

---

## Source legend (used in every verdict)

| Code | Source | Nature |
|---|---|---|
| `[E1]` | `/tmp/opencode/evidence-20261118-mic-return/all-journal.txt` | Pi journal, epochs → 12:40:37 UTC 11-18 |
| `[E2]` | `…/hostapd.txt` | hostapd, wlan0, association/handshake |
| `[E3]` | `…/watchdog.txt` | AP watchdog, → 12:40:18 UTC 11-18 |
| `[E4]` | `…/mosquitto.log`, `.log.1`, `.log.2.gz` | broker connection events, → 16:35:02 UTC 11-18 |
| `[N1]` | `~/.hermes-vps/task-notes/pigpulse-mic-ap-recovery.md` | task state / evidence boundaries |
| `[N2]` | `~/.hermes-vps/task-notes/ota-hardening-20261118.md` | deployment + boots forensics |
| `[N3]` | `sandbox/…/firmware/…/docs/OTA-HARDENING-20261118.md` | OTA chronology |
| `[N4]` | `~/.hermes-vps/task-notes/esp32s3-mic-investigation-20261118.md` | investigation ranking |
| `[F]` | `known-good-20261118b/esp32s3_telemetry.ino` + framework headers | source, not a device readout |
| `[D]` | `/root/.local/share/opencode/opencode.db`, session `ses_e2dacb1cdf` | direct record of the ad hoc diagnostic |
| `[L]` | live SSH/HTTPS readouts on 2026-11-19 (~00:53 UTC) | device readouts |
| `[S]` | `/tmp/opencode/soak-fresh.db` | ingest-side SQLite |

A verdict of **handoff-reported** means the claim comes from `[N1]`–`[N4]` and is
*not independently present in the supplied evidence files*. That is a citation
limitation, not a refutation.

---

## 1. Verdict table

| # | Claim | Verdict | Source / qualification |
|---|---|---|---|
| 1 | **Nov 17** was a full-board power loss: `boots=1`, `rr=1` (`ESP_RST_POWERON`), `br=0` — not brownout, reset, panic or watchdog | **board-published, handoff-reported** | `[N1]`; NVS values are board-published per the record. `[E4]` only shows the broker timeout at 10:40:28 UTC 11-17 and no reconnect until 12:29:50 11-18; it supplies no NVS fields. |
| 2 | **Nov 18** was a *separate* incident: SHT45 command-phase I²C stall wedging `loop()`; `mqttTask` continued | **best-supported hypothesis, not proven** | `[N1]`; mechanism structurally possible in `[F]`. Exact frozen `Wire` call **uncaptured** — no serial attachment. The "mqttTask kept publishing" detail is handoff-reported, not in `[E1]`–`[E4]`. |
| 3 | Radio was not broken: reassociation succeeded; RSSI ≈ −49 / −48…−52 dBm; audio ≈ 96,000 B/s | **partly measured, partly handoff-reported** | Reassociation + handshake: `[E2]:78,80`; DHCP: `[E1]:16341`; broker: `[E4]:605-606`. RSSI −49/−48…−52 not in `[E1]`–`[E4]`; `[N2]` measures −55 and −60 dBm at revival/after OTA. 96,000 B/s not logged literally; `[N2]` measures 95,968 / 98,677 bps and `[S]` byte growth over 14:33:12–14:33:22 is ≈95,846 B/s. |
| 4 | `otaguard-20261118b` was resident throughout the broker session | **NOT PROVEN — do not claim** | Image-linked only by a unique retained LWT literal reported in `[N2]`; broker continuity proves MQTT presence, not image residency `[E4]`. The retained LWT was later lost. |
| 5 | Image mtime proves flash or boot time | **REJECTED** | Filesystem metadata, not a device readout. |
| 6 | 900 s `ESP.restart()` recovery is unreachable — the 120 s recycle resets `lastLinkMs` | **SUPPORTED (source)** | `[F]:603-604,630,650,669-673`; also true in 18c. |
| 7 | No firmware/NVS path can hold STA off across boot | **SUPPORTED (source)** | `[F]:433,454`; framework `_persistent=true` / `WIFI_STORAGE_FLASH`; no `WiFi.persistent(false)`. |
| 8 | `esp_uptime_s`, `esp_bytes`, `esp_chunks`, `esp_accepted` are **ingest-side**, not board-liveness | **SUPPORTED** | `[L]` `/esp/status` counters belong to `esp_audio_ingest`; `[S]` ingest accepts. |
| 9 | Duplicate JSON `txp` keys: final `txp=78` = 19.5 dBm; earlier value ignored | **SUPPORTED** | `[F]:979,983,999`; `78/4=19.5` per `[F]:471-473`; `[N2]` records live `txp:78`. |
| 10 | Two `:9090` evictions came from an **ad hoc** OpenCode/SSH `curl`, not a persisted client | **SUPPORTED** | `[D]`: loopback connects at epoch 1795005637/8 (12:40:37/8 UTC) occur 0.4 s after the SSH session started; the investigating agent concluded this at 16:59–17:06 UTC. Only two occurrences in the whole journal. **No cron, timer, portal, health-check or daemon connects to `:9090`.** |
| 11 | `local_bridge.py:331` stamps arrival time without filtering `msg.retain` → retained will looks fresh | **SUPPORTED** | `backend/bridge/local_bridge.py:307-310,331`; `[N1]`. |
| 12 | The final PCM ended ~14:33:16 UTC; the 16:45–16:46 UTC radio/broker failure came **afterwards** | **SUPPORTED as two events** | `[L]` journal: `[esp-audio] ESP connected` 22:33:02 +08 (=14:33:02 UTC), `no audio for 90s` 22:34:46 +08 (=14:34:46 UTC); `[N2]`: board died 00:46:16 +08 (=16:46:16 UTC). Do not collapse them. |
| 13 | Three Nov 17 zero rows at `09:42:07.109Z`, `09:44:42.274Z`, `09:51:53.691Z` | **UNRESOLVED** | `[N1]` flags them separate from the confirmed retained-LWT mechanism until their trigger is evidenced. `[S]` has no rows at those exact epochs; nearest zero-block rows are `09:42:32.314Z`, `09:44:42.316Z`, `09:51:52.324Z` (see §5). |
| 14 | Mic is online now | **MEASURED 2026-11-19** | `[L]`: `connected:true`, `peer:192.168.69.15:51420`, `nonzeroPct:99.7`, ARP `.15 REACHABLE`, DHCP lease renewed. |

---

## 2. Incident 1 — Nov 17 (full-board power loss)

**Board-published NVS state:** `boots=1`, `rr=1` (`ESP_RST_POWERON`), `br=0` `[N1]`.
`boots=1` means the RTC/NVS boot count had no prior boot to compare, and `rr=1` is
the power-on reset reason — **power loss, not brownout**. `[F]` writes these in
`setup()` (`1032-1044`) and publishes them (`983-998`); `br` is *guaranteed* 0 when
`boots==1` because the check is skipped. The framework enum confirms `ESP_RST_POWERON=1`
and `ESP_RST_BROWNOUT=9` (the source comment's "15/16" uses a different numbering —
an inconsistency worth a follow-up, not a claim about the device).

**Broker-side corroboration only:** broker timeout at **10:40:28 UTC 11-17** and no
`s3-mic-01` reconnect until **12:29:50 UTC 11-18** `[E4]`. This is ~25 h 49 m of
*broker absence*, which is consistent with, but does not prove, a board power loss.

**Scoping — what Incident 1 does NOT explain:** the mic returned on Nov 18 at
12:29, streamed, and then failed again at ~14:33 and ~16:46. Those are separate
events. Do not fold the Nov 18 evidence into the Nov 17 power-loss verdict.

---

## 3. Incident 2 — Nov 18 (return, wedge, then power collapse)

### 3.1 Mic return — measured

| UTC | Event | Source |
|---|---|---|
| 12:29:45.898 | `wlan0: STA 68:ee:8f:dd:31:3c … associated` | `[E2]:78`, `[E1]:16332` |
| 12:29:47.260 | `WPA: pairwise key handshake completed (RSN)` | `[E2]:80`, `[E1]:16334` |
| 12:29:50.660 | `DHCPACK(wlan0) 192.168.69.15 68:ee:8f:dd:31:3c esp32s3-DD313C` | `[E1]:16341` |
| 12:29:50 | broker: `New client connected from 192.168.69.15 … as s3-mic-01` | `[E4]:605-606` |
| 12:29:50.826 | bridge: `resumed after 10042 s of silence` | `[E1]:16342` |
| 12:29:50.897 | `[esp-audio] ESP connected from 192.168.69.15` | `[E1]:16343` |

Same IP for DHCP and MQTT ⇒ same network endpoint; **not** proof of image identity.

### 3.2 MQTT sessions — measured

Connected 12:29:50 `[E4]:606`; replacement connection 13:40:15 (`:646-647`);
timeout 13:42:13 (`:649`); new connection 13:45:29 (`:660`). The broker logs show an
**unbroken session from 13:45:29 through at least 16:35:02 UTC** (end of coverage).
The asserted 16:46:48 timeout is **outside all supplied log coverage** and cannot be
re-verified here.

### 3.3 Final PCM and the later failure — two events

- `[L]` journal (Manila wall-clock): `22:33:02` = **14:33:02 UTC** ESP connected;
  `22:34:46` = **14:34:46 UTC** `no audio for 90s - closing dead socket`.
- `[N2]`: board died at **00:46:16 +08 = 16:46:16 UTC**. Boots arithmetic:
  `boots:2` ≈ 14:30 UTC (charger move, `rr:1` = fresh power-on), streamed ~2 h,
  then **zero boots during 16:46–23:41 UTC**. Blue LED stayed lit while the CPU was
  held below its operating floor ⇒ **power path**, not a boot loop and not a wedge.

The 14:33 audio stop and the 16:46 power collapse are ~2 h apart. The handoff's
SHT45-wedge hypothesis applies to the **14:33** window; the boots arithmetic's
power-path conviction applies to the **16:46** window. They do not contradict each
other. `[N2]`'s "app never executed" statement is explicitly about 16:46–23:41,
*after* the board had already returned and streamed.

### 3.4 The 14:33 wedge hypothesis — mechanism and limits

`[F]` supports the *mechanism*: `loop()` owns `sht_task()` and `wifi_task()`
(`1122-1125`) while `mqttTask` is a separate priority-1 task (`1112`, `692-725`).
The SHT45 command transaction is `Wire.beginTransmission(0x44)`, `Wire.write(0xfd)`,
`Wire.endTransmission()` (`368-370`); `Wire.requestFrom()` lives in the other branch
(`335`) and is not reached if `endTransmission()` stalls. `Wire.setTimeOut(50)`
bounds only `i2c_master_cmd_begin()` (`esp32-hal-i2c.c:176`); the I²C mutex takes are
`xSemaphoreTake(..., portMAX_DELAY)` (`Wire.cpp:421,504`; `esp32-hal-i2c.c:60,142`),
so a mutex-held wedge is unbounded.

**What is missing:** no serial attachment, no backtrace, no logic-analyzer capture,
and no telemetry frame proving "frozen loop counters + live MQTT" at 14:33. The
exact frozen call (`endTransmission`, `requestFrom`, or a `portMAX_DELAY` mutex take)
is **uncaptured**. This remains a hypothesis. Do not flash a fix on its strength.

---

## 4. Running-image caveat

- `otaguard-20261118b` is linked to a session only by a **unique retained LWT literal**
  reported in `[N2]`. Mosquitto logs record client ID + source IP, never payloads
  `[E4]`, so `[E1]`–`[E4]` cannot re-verify that literal or its later loss.
- Broker continuity proves *presence of a client calling itself `s3-mic-01` at
  192.168.69.15*, **not** which image was executing.
- **18c** was OTA-flashed at revival (07:44:57 +08 = 23:44:57 UTC) with
  fmt `pigpulse-mic-sht45-otaguard-20261118c` and binary sha
  `d5543f14…e2a050c` — verified on the Pi `[L]`, matching `[N2]`. 18b is the rollback bin.
- **Discipline gap:** no `20261118b`/`20261118c` row or archive exists in the canonical
  `firmware/esp32s3-mic-ambient/docs/KNOWN_GOOD.md` / `docs/` tree; the 18b archive
  exists only in the sandbox worktree `[F]`. This breaches the repo's own
  confirm-and-archive rule (R8) and must be rectified before relying on the rollback.

---

## 5. Retained-LWT loss and the three zero rows

`local_bridge.py:331` overwrites every payload timestamp with the bridge's arrival
clock and does **not** filter `msg.retain`; paho redelivers retained messages on
subscribe (`307-310`). Consequently a retained `mic:false` will can appear as a fresh
zero row. This mechanism is confirmed, and it explains the reconnect-correlated zero
rows in the earlier record.

**Explicitly unresolved:** the three Nov 17 rows at `09:42:07.109Z`, `09:44:42.274Z`
and `09:51:53.691Z` are **not** claimed to be caused by that mechanism; they remain
separate until their trigger is evidenced `[N1]`. `[S]` contains no rows at those
exact epochs; the nearest zero-block samples are `09:42:32.314Z`, `09:44:42.316Z`
and `09:51:52.324Z` — each with `esp_conn=0`, `esp_bytes/chunks/accepted=0`,
`esp_nonzero_pct=0.0`, `amb_state='esp-offline'`, NULL ambient readings, and all
services active. Their trigger is still **not** established.

The final retained `death:true` LWT from the unique 18b literal was **later lost**
`[N2]`; no supplied broker log contains MQTT payloads `[E4]`, so the loss cannot be
re-derived from this evidence set.

---

## 6. Telemetry findings

**Measured in `[S]` (ingest-side):**

- `events.esp_change` at `1795009222.476` (13:40:22.476Z) — `connected 0→1 stale 1→0`;
  `esp_accepted 6→7`.
- `events.esp_change` at `1795012382.514` (14:33:02.514Z) — `connected 0→1 stale 0→0`;
  `esp_accepted 7→8`. This is the last accept, and it opens the final burst.
- The burst continued ~20 s past that epoch: `esp_bytes` 93,314,220 → 94,272,684 →
  **94,655,660**, `esp_chunks` 86,622 → 87,519 → **87,885** at 14:33:22.514Z, where
  `esp_change` reads `connected 1→0 stale 0→1 (lastMs=6023)`.
- **The counters do not all freeze at the same instant:** `accepted` froze at
  **14:33:02.514Z**, while `bytes`/`chunks` froze **14:33:22.514Z** and stayed
  byte-identical for 1,911 samples through 19:51:42.730Z.
- At 14:33:02.514Z, `amb_state='sht-missing'` with cached `amb_temp_c=32.66`,
  `amb_rh=69.33`, `amb_age_s=0.7` — a cached ambient value, not a fresh reading.
- At **16:46:52.608Z**, a *different* event: `amb_state_change sht-missing→esp-offline`
  as `amb_age_s` climbed to 85.0. No ESP reconnect accompanies it. This confirms
  §3.3: the 14:33 audio stop and the 16:46 state change are separate.
- `esp_uptime_s` rose 17,516 → 36,616 s while `esp_conn=0` and all three counters were
  frozen — in lockstep with the 10 s sampling clock. `esp_last_ms` grew from 6,023 ms
  to 19,106,238 ms. Both are collector-side ages, not board self-reports (#8).

**Not present in `[S]`:** the handoff-reported payload fields `sfw=508`, `srf=508`,
`sbr=84`, `sage=0`, `sle=2` and MQTT health fields `pubms=2`, `pubn=0`, `wrms=2`, `wrn=0`
have no columns or literals in this database. The interpretations "sage=0 ⇒ no
successful SHT45 reading since boot" and "sle=2 ⇒ address-phase NACK" are therefore
**unsupported by the supplied evidence** and are not carried forward as measured facts.
Captured telemetry payloads in `[S]` contain only `mic, rms, peak, sr, irf, irr, txd,
txp, txr, rssi, heap, sps, temperature, humidity, batch`.

Audio and telemetry must not be collapsed into one failure — see §3.3.

---

## 7. Evidence boundaries

- **No ESP serial/readout** for Nov 17–18: no NVS dump, no `[sht45]`/`[wifi]` lines,
  no backtrace from the incident. The only `Saved PC` is from a 2026-10-19 capture.
- `[E1]`/`[E3]` end 12:40:37/12:40:18 UTC; `[E4]` ends 16:35:02 UTC. Claims about
  16:46:48 come from `[N2]`, not these files.
- No RSSI, no AP channel/width/mode, no PCM byte-rate, and no MQTT payloads are
  present in `[E1]`–`[E4]`. `/diag.json` is **not** an AP-interface source:
  `diag_state.py:196` hardcodes `"wlan1"` and reads the dongle.
- Historical "Pi hard resets hourly" was a finding of the replaced document, not of
  this evidence set; it is not carried forward as established.
- **No physical-device confirmation is made here.** Every statement is a measurement
  of a cited source or an inference explicitly labelled as such.

---

## 8. Recovery steps

1. **Physical (blocking):** 5 V ≥ 2 A ESP supply, short thick cable, 470–1000 µF +
   100 nF at the inlet, fan on its own branch. Pi PSU/USB-C cable swap test.
   SHT45 wiring check (pull-ups, lead length, cold joint, address, common ground).
2. **Archive before any change:** copy the working 18c `.bin` + source + sha256 into
   the canonical `known-good-20261119/` and add the `KNOWN_GOOD.md` row (R8).
3. **Observability:** add `boots`, `rr`, `prr`, `br`, `txp`, `rssi` to PocketBase via
   migration; filter `msg.retain` in `local_bridge.py`; publish explicit loop-liveness
   over MQTT and serial; durable association/DHCP/retained-payload monitoring with
   immediate Telegram alerts.
4. **Firmware (queue, do not flash blind):** isolate SHT45 in its own task; bound or
   watchdog `Wire.endTransmission()`; make the 900 s restart reachable; check/log
   `WiFi.mode`/`begin`/`setTxPower`; take `mqttMutex` in the two failure paths.
   **Requires a serial fault log before any flash.**
5. **Verify recovery:** `/esp/status` `connected:true`, `peer` non-empty,
   `nonzeroPct` > 0, ARP `REACHABLE`, and a 7-day soak with no unexplained reset.
   Label stale data honestly; never substitute fabricated zeros.
