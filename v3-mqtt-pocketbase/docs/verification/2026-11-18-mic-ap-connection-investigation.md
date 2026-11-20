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
| `[E2]` | `…/hostapd.txt` | hostapd association/handshake; interface names are historical log labels, not current role truth |
| `[E3]` | `…/watchdog.txt` | AP watchdog, → 12:40:18 UTC 11-18 |
| `[E4]` | `…/mosquitto.log`, `.log.1`, `.log.2.gz` | broker connection events, → 16:35:02 UTC 11-18 |
| `[N1]` | `~/.hermes-vps/task-notes/pigpulse-mic-ap-recovery.md` | task state / evidence boundaries |
| `[N2]` | `~/.hermes-vps/task-notes/ota-hardening-20261118.md` | deployment + boots forensics |
| `[N3]` | `sandbox/…/firmware/…/docs/OTA-HARDENING-20261118.md` | OTA chronology |
| `[N4]` | `~/.hermes-vps/task-notes/esp32s3-mic-investigation-20261118.md` | investigation ranking |
| `[F]` | `/home/solrahk/sandbox/pigpulse-ota-hardening/v3-mqtt-pocketbase/firmware/esp32s3-mic-ambient/docs/known-good-20261118b/esp32s3_telemetry.ino` + framework headers; canonical 18c source under `v3-mqtt-pocketbase/firmware/esp32s3-mic-ambient/docs/known-good-20261118c/` | source, not a device readout |
| `[D]` | `/root/.local/share/opencode/opencode.db`, session `ses_e2dacb1cdf` | direct record of the ad hoc diagnostic |
| `[L]` | live SSH/HTTPS readouts on 2026-11-19 (~00:53 UTC) | device readouts |
| `[R]` | Pi `/usr/local/sbin/pigpulse-wlan-iface` + `ip -br link` readout, 2026-11-20 | current radio-role readout (device readout) |
| `[S]` | `/tmp/opencode/soak-fresh.db` | ingest-side SQLite |
| `[SER]` | `/dev/ttyACM0` on the laptop, 8 s capture 2026-11-19 ~01:31 UTC | board serial (device readout) |
| `[MQ]` | Pi broker retained telemetry `pig/s3-mic-01/telemetry`, 2026-11-19 ~01:31 UTC | board-published state (device readout) |

A verdict of **handoff-reported** means the claim comes from `[N1]`–`[N4]` and is
*not independently present in the supplied evidence files*. That is a citation
limitation, not a refutation.

---

## 1. Verdict table

| # | Claim | Verdict | Source / qualification |
|---|---|---|---|
| 1 | Nov 17 is interpreted as a full-board power loss from the handoff-reported RTC-era triple `boots=1`, `rr=1` (`ESP_RST_POWERON`), `br=0` — not brownout, reset, panic or watchdog | **handoff-reported, uncaptured; not NVS-backed** | `[N1]` for the Nov-17 triple. No image running on Nov 17 had NVS-backed boot counters; NVS backing shipped in 20261118b. `[MQ]` now reads the *current* boot chain `boots=3, rr=3, prr=1, br=0`: three boots, current = SW reset (18c OTA), previous = POWERON, no brownout — consistent with a power-on boot in the chain. The specific Nov-17 values and the power-loss interpretation were not captured from the device. |
| 2 | **Nov 18** was a *separate* incident: SHT45 command-phase I²C stall wedging `loop()`; `mqttTask` continued | **best-supported hypothesis, not proven** | `[N1]`; mechanism structurally possible in `[F]`. Exact frozen command-phase `Wire` call **uncaptured** — no serial attachment. The "mqttTask kept publishing" detail is handoff-reported, not in `[E1]`–`[E4]`. |
| 3 | Radio was not broken: reassociation succeeded; audio ≈ 96,000 B/s | **MEASURED 2026-11-19** | Reassociation + handshake: `[E2]:78,80`; DHCP: `[E1]:16341`; broker: `[E4]:605-606`. `[SER]` reads `tcp:96063 B/s` and `[MQ]` `bps=96063` (≈96,000). Current RSSI is −46 dBm, measured in `[MQ]`. Historical RSSI −53 (bench), −55 (revival), and −60 (post-OTA) are handoff-reported in `[N2]`; the earlier −49/−48…−52 figures are unsupported and are withdrawn. |
| 4 | `otaguard-20261118b` was resident throughout the broker session | **NOT PROVEN historically; current image MEASURED** | Historical image linkage only via a unique retained LWT literal `[N2]`; `[E4]` records client ID + IP, never payloads. `[MQ]` now reports `firmware=pigpulse-mic-sht45-otaguard-20261118c`, so the **current** session is 18c. The Nov-18 18b residency claim remains unproven; broker continuity never proved image identity. |
| 5 | Image mtime proves flash or boot time | **REJECTED** | Filesystem metadata, not a device readout. |
| 6 | 900 s `ESP.restart()` recovery is unreachable — the 120 s recycle resets `lastLinkMs` | **SUPPORTED (source)** | `[F]:603-604,630,650,669-673`; also true in 18c. |
| 7 | No firmware/NVS path can hold STA off across boot | **SUPPORTED (source)** | `[F]:433,454`; framework `_persistent=true` / `WIFI_STORAGE_FLASH`; no `WiFi.persistent(false)`. |
| 8 | `esp_uptime_s`, `esp_bytes`, `esp_chunks`, `esp_accepted` are **ingest-side**, not board-liveness | **SUPPORTED** | `[L]` `/esp/status` counters belong to `esp_audio_ingest`; `[S]` ingest accepts. |
| 9 | Duplicate JSON `txp` keys: final `txp=78` = 19.5 dBm; earlier value ignored | **SUPPORTED** | `[F]:979,983,999`; `78/4=19.5` per `[F]:471-473`; `[N2]` records live `txp:78`. The earlier `txp` value is the `txPartialWrites` counter, so the duplicate key masks the partial-write count entirely — a firmware-key cleanup item. |
| 10 | Two `:9090` evictions came from an **ad hoc** OpenCode/SSH `curl`, not a persisted client | **SUPPORTED** | `[D]`: loopback connects at epoch 1795005637/8 (12:40:37/8 UTC) occur 0.4 s after the SSH session started; the investigating agent concluded this at 16:59–17:06 UTC. Only two occurrences in the whole journal. **No cron, timer, portal, health-check or daemon connects to `:9090`.** |
| 11 | `local_bridge.py:331` stamps arrival time without filtering `msg.retain` → retained will looks fresh | **SUPPORTED** | `backend/bridge/local_bridge.py:307-310,331`; `[N1]`. |
| 12 | The final PCM ended ~14:33:16 UTC; the later 16:45–16:46 UTC radio/broker failure came **afterwards** | **SUPPORTED as two events** | `[L]` journal: `[esp-audio] ESP connected` 22:33:02 +08 (=14:33:02 UTC), `no audio for 90s` 22:34:46 +08 (=14:34:46 UTC); `~14:33:16` is the watchdog-window derivation `14:34:46 − 90 s`. `[N2]` records an alert stamped 00:46:16 +08 (=16:46:16 UTC) with 100% ping loss and ARP INCOMPLETE; that is an **alert timestamp, not a measured death instant**. The death instant itself is uncaptured. Do not collapse the two incidents. |
| 13 | Three Nov 17 zero rows at `09:42:07.109Z`, `09:44:42.274Z`, `09:51:53.691Z` | **UNRESOLVED** | Explicitly unresolved in this record; they are not attributed to `[N1]` and are not claimed to be caused by the retained-LWT mechanism until their trigger is evidenced. `[S]` has no rows at those exact epochs; nearest zero-block rows are `09:42:32.314Z`, `09:44:42.316Z`, `09:51:52.324Z` (see §5). |
| 14 | Mic is online now | **MEASURED 2026-11-19** | `[L]`: `connected:true`, `peer:192.168.69.15:51420`, `nonzeroPct:99.7`, ARP `.15 REACHABLE`, DHCP lease renewed. |

---

## 2. Incident 1 — Nov 17 (reported power loss; uncaptured)

**Handoff-reported, uncaptured RTC-era boot triple (not NVS-backed):** `boots=1`,
`rr=1` (`ESP_RST_POWERON`), `br=0` `[N1]`. No image running on Nov 17 had
NVS-backed boot counters; NVS backing shipped only in 20261118b `[F]`. Nothing on
the broker or ingest side captured these values, so the power-loss reading is an
interpretation of handoff-reported state, not a device readout.

The later source does show how the counters are published in 18b `[F]`, and that
`br` is guaranteed to be 0 when `boots==1` because the brownout check is skipped;
this is source-confirmed behavior, not evidence that the uncaptured Nov-17 triple
was NVS-backed. The framework enum confirms `ESP_RST_POWERON=1` and
`ESP_RST_BROWNOUT=9` (the source comment's "15/16" uses a different numbering —
an inconsistency worth a follow-up, not a claim about the device).

**Broker-side corroboration only:** broker timeout at **10:40:28 UTC 11-17** and no
`s3-mic-01` reconnect until **12:29:50 UTC 11-18** `[E4]`. This is ~25 h 49 m of
*broker absence*, which is consistent with, but does not prove, a board power loss.

**Scoping — what Incident 1 does NOT explain:** the mic returned on Nov 18 at
12:29, streamed, its final PCM stopped around 14:33, and a later alert recorded
loss around 16:46. Those are separate events. Do not fold the Nov 18 evidence
into the Nov 17 power-loss verdict.

---

## 3. Incident 2 — Nov 18 (return, wedge, then reported power collapse)

### 3.1 Mic return — measured

| UTC | Event | Source |
|---|---|---|
| 12:29:45.898 | `wlan0: STA 68:ee:8f:dd:31:3c … associated` | `[E2]:78`, `[E1]:16332` |
| 12:29:47.260 | `WPA: pairwise key handshake completed (RSN)` | `[E2]:80`, `[E1]:16334` |
| 12:29:50.660 | `DHCPACK(wlan0) 192.168.69.15 68:ee:8f:dd:31:3c esp32s3-DD313C` | `[E1]:16341` |
| 12:29:50 | broker: `New client connected from 192.168.69.15 … as s3-mic-01` | `[E4]:605-606` |
| 12:29:50.826 | bridge: `resumed after 10042 s of silence` | `[E1]:16342` |
| 12:29:50.897 | `[esp-audio] ESP connected from 192.168.69.15` | `[E1]:16343` |

The `10042 s` figure is the bridge's own gap arithmetic on its subscribe timeline —
an inference about broker/bridge state, not a measurement of board silence or
liveness. Interface names in these quoted historical logs are not current role
truth; current roles are MAC-resolved in §8.

Same IP for DHCP and MQTT ⇒ same network endpoint; **not** proof of image identity.

### 3.2 MQTT sessions — measured

Connected 12:29:50 `[E4]:606`; replacement connection 13:40:15 (`:646-647`);
timeout 13:42:13 (`:649`); new connection 13:45:29 (`:660`). The broker logs show an
**unbroken session from 13:45:29 through at least 16:35:02 UTC** (end of coverage).
No 16:46:48 broker timeout is retained in this record; the earlier assertion was
unsupported and is **withdrawn**.

### 3.3 Final PCM and the later failure — two events

- `[L]` journal (Manila wall-clock): `22:33:02` = **14:33:02 UTC** ESP connected;
  `22:34:46` = **14:34:46 UTC** `no audio for 90s - closing dead socket`.
- `[N2]` records an alert stamped **00:46:16 +08 = 16:46:16 UTC** with 100% ping
  loss and ARP INCOMPLETE. This is an **alert timestamp, not a measured death
  instant**; the death instant itself is uncaptured.
- Boots arithmetic: `boots:2` is the revival POWERON at approximately
  **23:41:46 UTC** (`rr:1`, streaming resumed), and `boots:3` is the 18c OTA SW
  reset at approximately **23:44:57 UTC**. The **daytime streaming session**
  lasted approximately three hours; the broker session was unbroken from
  13:45:29 through at least 16:35:02 UTC (§3.2). **Inferred:** no board boot
  occurred during 16:46–23:41 UTC, from the boots arithmetic plus `[N2]`'s
  handoff-reported "app never executed" statement.
- The earlier "`boots:2` ≈ 14:30 UTC charger move, streamed ~2 h" reading is
  **withdrawn**. Charger-transfer timing and mechanism remain unresolved. The
  blue-LED/power-path account is `[N2]`-reported inference, not a device readout.

The 14:33 audio stop and the later reported power collapse are ~2 h apart. The
handoff's SHT45-wedge hypothesis applies to the **14:33** window; the separate
power-path interpretation applies to the **16:46** window. They do not contradict
each other. `[N2]`'s "app never executed" statement is explicitly about
16:46–23:41 UTC, *after* the board had already returned and streamed.

### 3.4 The 14:33 wedge hypothesis — mechanism and limits

`[F]` supports the *mechanism*: `loop()` owns `sht_task()` and `wifi_task()`
(`1122-1125`) while `mqttTask` is a separate priority-1 task (`1112`, `692-725`).
The SHT45 command transaction is `Wire.beginTransmission(0x44)`, `Wire.write(0xfd)`,
`Wire.endTransmission()` (`368-370`); `Wire.requestFrom()` lives in the other branch
(`335`) and is not reached if `endTransmission()` stalls. In the locally installed
Arduino-ESP32 core **3.3.12**, `Wire.setTimeOut(50)` bounds only
`i2c_master_cmd_begin()`; the `timeOutMillis` value reaches
`i2c_master_cmd_begin()` in `esp32-hal-i2c.c:244`, while the I²C mutex takes use
`xSemaphoreTake(..., portMAX_DELAY)` (`Wire.cpp:423,494`;
`esp32-hal-i2c.c:102,178,210,264,295,324`), so a mutex-held wedge is unbounded.
Framework line anchors are version-specific; the 18b build's exact core version
was not captured.

**What is missing:** no serial attachment, no backtrace, no logic-analyzer capture,
and no telemetry frame proving "frozen loop counters + live MQTT" at 14:33. The
exact frozen **command-phase** call (`Wire.beginTransmission`, `Wire.write`, or
`Wire.endTransmission`) or a `portMAX_DELAY` mutex take on entry to any `Wire`
call is **uncaptured**. `Wire.requestFrom()` is **not** a candidate: it is reached
only in the read branch after `endTransmission()` succeeds, so the command-phase
diagnosis means it was never reached. This remains a hypothesis. Do not flash a
fix on its strength.

---

## 4. Running-image caveat

- `otaguard-20261118b` is linked to a session only by a **unique retained LWT literal**
  reported in `[N2]`. Mosquitto logs record client ID + source IP, never payloads
  `[E4]`, so `[E1]`–`[E4]` cannot re-verify that literal or its later
  retention/supersession sequence.
- Broker continuity proves *presence of a client calling itself `s3-mic-01` at
  192.168.69.15*, **not** which image was executing.
- **18c** was OTA-flashed just after revival, at approximately
  **07:44:57 +08 = 23:44:57 UTC**, with fmt
  `pigpulse-mic-sht45-otaguard-20261118c` and binary sha
  `d5543f14…e2a050c` — verified on the Pi `[L]`, matching `[N2]`. 18b is the rollback bin.
- **Discipline gap:** `known-good-20261118c` is now archived with a
  `KNOWN_GOOD.md` row (2026-11-19). The remaining gap is **18b only**: no
  canonical 18b row/archive exists; its source and binary live in
  `/home/solrahk/sandbox/pigpulse-ota-hardening/v3-mqtt-pocketbase/firmware/esp32s3-mic-ambient/docs/known-good-20261118b/`.
  This still breaches the repo's confirm-and-archive rule (R8) and must be
  rectified before relying on the 18b rollback.

---

## 5. Retained-LWT behavior and the three zero rows

`local_bridge.py:331` overwrites every payload timestamp with the bridge's arrival
clock and does **not** filter `msg.retain`; paho redelivers retained messages on
subscribe (`307-310`). Consequently a retained `mic:false` LWT can appear as a fresh zero row. This
mechanism is **source-confirmed**
(`local_bridge.py:307-310,331`) and is the **candidate** explanation for the
reconnect-correlated zero rows in the earlier record; the broker-session-takeover
correlation in `[E4]` is a candidate trigger, not proof.

**Explicitly unresolved:** the three Nov 17 rows at `09:42:07.109Z`, `09:44:42.274Z`
and `09:51:53.691Z` are **not** claimed to be caused by that mechanism; they remain
separate until their trigger is evidenced. This is this record's explicit position
per the authoritative decision record; it is not attributed to `[N1]`. `[S]`
contains no rows at those exact epochs; the nearest zero-block samples are
`09:42:32.314Z`, `09:44:42.316Z` and `09:51:52.324Z` — each with `esp_conn=0`,
`esp_bytes/chunks/accepted=0`, `esp_nonzero_pct=0.0`, `amb_state='esp-offline'`,
NULL ambient readings, and all services active. Their trigger is still **not**
established.

The retained `death:true` LWT from the unique 18b literal was **held during
triage** (observed at 01:14 UTC) and by 01:31 UTC had been **superseded by live
`mic:true` telemetry** `[L]` — it was not lost. `[N2]`'s earlier "lost" phrasing
is corrected here. No supplied broker log contains MQTT payloads `[E4]`, so the
observed retention/supersession sequence cannot be re-derived from that log set.

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

## 7. Independent device readouts (2026-11-19, ~01:31 UTC)

These were taken directly from the board during this investigation, not from the
handoff. They are the strongest grounding in this record.

**Serial (`[SER]`, 8 s capture on `/dev/ttyACM0`, read-only; mic stayed connected):**

```
[sht45] temperature=31.15 C humidity=76.42 % CRC=OK
RMS24: 78446 Peak24: 162138 nz:512% -40.6 dBFS tcp:96063 B/s wifi:1 mqtt:1 tcp:1
[sht45] temperature=31.14 C humidity=76.72 % CRC=OK
[mqtt] connected
RMS24: 54519 Peak24: 104422 nz:512% -43.7 dBFS tcp:95968 B/s wifi:1 mqtt:1 tcp:1
RMS24: 27596 Peak24: 78012 nz:512% -49.7 dBFS tcp:121 B/s wifi:1 mqtt:1 tcp:1
[sht45] temperature=32.54 C humidity=70.64 % CRC=OK
```

**Retained MQTT telemetry (`[MQ]`, `pig/s3-mic-01/telemetry`, retain=true):**

```
mic=True  rms=87075  peak=158406  sr=48000
boots=3  rr=3  prr=1  br=0
txp=78  rssi=-46  heap=174936  sps=48031
irf=0  irr=0  txd=0  txr=1  bps=96063  dc=-27  clip=0  batch=512  omax=692
temperature=32.56  humidity=70.63
firmware=pigpulse-mic-sht45-otaguard-20261118c
fmt: rate=48000 encoding=s16le endian=little channels=1 bytes_per_frame=2 bytes_per_sec=96000
```

**What this proves:**

- **96,000 B/s is real** — serial `tcp:96063 B/s`, MQTT `bps=96063`, fmt `bytes_per_sec=96000`.
- **The live image is 18c** — `firmware=...otaguard-20261118c`.
- **The boot chain is consistent with a power-on in its history** — `boots=3`,
  `rr=3` (SW reset, the OTA reboot), `prr=1` (previous reset = POWERON), `br=0`
  (no brownout flag).
- **TX power is 19.5 dBm** — `txp=78`, and `78/4 = 19.5`.
- **The SHT45 is healthy right now** — repeated `CRC=OK`, `temperature≈31–33 °C`,
  `humidity≈70–77 %`, `irf=0`, `irr=0`. The Nov-18 wedge does not reproduce in
  this readout and remains unproven.
- **Audio is real, not zeros** — serial RMS `27k–78k`, peak `78k–162k`,
  `−40.6 to −49.7 dBFS`, `dc=-27`, `clip=0`.
- **RSSI is −46 dBm** — measured current RSSI, stronger than the
  handoff-reported −53 (bench), −55 (revival), and −60 (post-OTA) values `[N2]`.

**Correction to the handoff:** the retained `death:true` LWT was observed at
01:14 UTC and by 01:31 UTC the retained telemetry had been **overwritten by live
`mic:true` telemetry** — it was superseded, not "lost".

---

## 8. Evidence boundaries

- Evidence was gathered in fallback order: **PigPulse hotspot → Pi venue LAN →
  Tailscale → offline**.
- **No ESP serial/readout from the incident window itself** (Nov 17–18): no NVS dump,
  no `[sht45]`/`[wifi]` lines, no backtrace from 14:33 or 16:46. The only `Saved PC`
  is from a 2026-10-19 capture. **Current** serial and retained telemetry were read on
  2026-11-19 (§7); they describe the healthy present, not the failure.
- `[E1]`/`[E3]` end 12:40:37/12:40:18 UTC; `[E4]` ends 16:35:02 UTC. No
  16:46:48 broker timeout is retained in this record; the earlier assertion was
  unsupported and is withdrawn.
- The `[E1]`–`[E4]` files were session-scoped under `/tmp/opencode/` and are not
  archived in this worktree, so their line anchors are historical citations and
  cannot be re-checked from the repository alone.
- No RSSI, no AP channel/width/mode, no PCM byte-rate, and no MQTT payloads are
  present in `[E1]`–`[E4]`. `/diag.json` is **not** an AP-interface source:
  `diag_state.py:192-201` contains the stale name↔role mapping (`wlan1` as AP and
  `wlan0sta`) and reads the dongle.
- **Current radio roles are MAC-resolved, not name-resolved** `[R]`: AP radio
  `dc:a6:32:87:63:a1` resolves to `wlan0` (`UP`); managed radio
  `00:1f:05:6c:51:bc` resolves to `wlan1` (`DOWN`). Historical logs and
  `diag_state.py` use older name↔role assignments; those names must not be read
  as current truth. See also
  `docs/verification/2026-11-17-radio-roles-5ghz.md`, which is a historical
  record rather than the current measured topology.
- Historical "Pi hard resets hourly" was a finding of the replaced document, not of
  this evidence set; it is not carried forward as established.
- **Device readouts in §7 are real measurements of the current board** (serial and
  retained MQTT). No statement about the *incident* is a device confirmation — those
  remain measurements of cited logs or inferences explicitly labelled as such.

---

## 9. Recovery steps

1. **Physical (blocking):** 5 V ≥ 2 A ESP supply, short thick cable, 470–1000 µF +
   100 nF at the inlet, fan on its own branch. Pi PSU/USB-C cable swap test.
   SHT45 wiring check (pull-ups, lead length, cold joint, address, common ground).
2. **Archive before any change:** 18c is already canonical under
   `known-good-20261118c/` with a `KNOWN_GOOD.md` row. The remaining discipline
   gap is 18b: archive its source + binary + sha256 and add its canonical row
   before relying on that rollback (R8).
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
