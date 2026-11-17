# 2026-11-18 — S3 mic silence: AP/connection investigation

## Provenance

- Pi facts: live device readouts over Tailscale (`iw`, `journalctl`, `dnsmasq`, `curl /api/pi?ep=diag.json`, `ip neigh`, `ss`).
- Firmware facts: read from the **archived actually-flashed source**
  `firmware/esp32s3-mic-ambient/docs/known-good-20261113-shtfinal/src/esp32s3_telemetry.ino`
  (1157 lines), firmware ID `pigpulse-mic-sht45-20261113-shtfinal`.
- Nothing in this investigation was changed on the ESP32 or in its firmware. The Pi-side
  AP watchdog calibration and the Expo deploy fix are recorded in commit `777fbac`.

## Timeline (Pi-local PST)

| Time | Event — measured |
|---|---|
| 17:42, 17:44, 17:51 | Watchdog `AP radio degraded: rx_rate_info=20/10 (< 40) → restarting hostapd`. AP restarts drop all clients. |
| 17:44:41 | Mic associated (aid 1), WPA pairwise handshake completed. |
| 17:51:51 | Mic authenticated + associated again; 17:51:52 DHCPDISCOVER/OFFER/REQUEST/ACK → `192.168.69.15`, host `esp32s3-DD313C`. |
| 18:40:22 | Watchdog: `ghost station 68:ee:8f:dd:31:3c: rx frozen at 287781041 for 61s, 192.168.69.15 unreachable → deauthenticate` / `deauthenticate sent`. |
| 18:40:27 | hostapd: `STA 68:ee:8f:dd:31:3c IEEE 802.11: deauthenticated due to local deauth request`. |
| 19:45:45 | Pi rebooted (cause still unknown; no undervoltage evidence). |
| 19:47:11–18 | hostapd failed 34× (`No such device` — USB dongle not yet enumerated); AP back 19:47:41. |
| 06:13:18 (18 Nov) | Portal hotspot connect stopped hostapd under `/run/pigpulse/ap-hold`; `ASSOC-REJECT status=16` on 5 GHz / 5180 MHz. AP restored 06:16:24. |

## AP/connection checks — all measured

- `ssid=PigPulse`, `hw_mode=g`, `channel=6`, `wpa=2`, `wpa_key_mgmt=WPA-PSK`,
  `rsn_pairwise=CCMP`, `macaddr_acl=0`, `ignore_broadcast_ssid=0`, `wmm_enabled=0`.
- The AP passphrase **matches** the constant hard-coded in the flashed firmware (compared
  in-shell; value not recorded in this document).
- AP BSSID is `00:1f:05:6c:51:bc` on wlan1. The mic completed a full WPA handshake and DHCP
  on **this same BSSID** at 17:44 and 17:51 — so AP identity, credentials, channel and
  encryption are proven workable for this exact firmware.
- Entire hostapd journal contains **no** wrong-password, 4-way-handshake failure, auth reject,
  or blacklist line for any client.
- AP restarted again at 19:47 and 06:16; the mic ignored both.
- After 18:40:27 there is no mic MAC in hostapd, dnsmasq, kernel logs, ARP/neighbour table,
  or `:9090` connections. `esp.age_s` ≈ 38,000 s (last telemetry 19:46:08, 17 Nov).
- A CCTV station is currently associated to this AP at −10 dBm (`rx_rate_info=360`), proving
  the AP is beaconing and accepting clients.

**Conclusion: the AP is not refusing the mic. The mic is emitting nothing.**

## Code review of the flashed firmware

- `setup()` calls `wifi_connect()` unconditionally (line 984).
- `wifi_connect()` always runs `WiFi.scanNetworks()` (line 428) then `WiFi.begin()` (436).
  No stored flag or conditional can skip it.
- `loop()` calls `wifi_task()` every pass (991). It retries at 10 s (definite failure) / 30 s,
  performs a full radio reset at 120 s (`disconnect(true,false)` → `mode(WIFI_STA)` → `begin`,
  lines 529–542), and `ESP.restart()` at 900 s (561–565).
- `sht_task()` (304) is a bounded state machine with a 50 ms Wire timeout; `i2s_install()`
  returns errors. No unbounded loop exists before `wifi_connect()`.

Therefore a powered, *running* board cannot stay radio-silent for ~12 h. The only documented
code-adjacent mechanism is a boot/reset loop: lines 107–120 record that the board runs on a
"DIY 5 V brick with mixed cables", draws 500–600 mA at the TX power set on lines 440–455
(`WIFI_POWER_19_5dBm`, raised from 8.5 dBm on 2026-11-11), and that this can sag 3V3 below
brownout and reset the chip. The firmware carries a brownout detector (RTC boot count +
reset reason) whose output is only visible on serial / MQTT telemetry.

## Additional evidence (direct PocketBase query, admin auth in-process)

- The last genuine mic row is `timestamp=1794911935894` (19:46:15 PST) with `mic=true`.
- The next row, 19:47:08 PST, is the firmware's MQTT **will** (`mic=false`, `rms=0`) — the
  broker saw the session drop, not the mic reporting a failure.
- The firmware's diagnostic counters (`boots`, `rr`, `br`, `rssi`, `wrms`, …) are **not present
  in the PocketBase schema** (unknown fields are silently dropped), so they cannot confirm or
  refute a brownout. The 19.5 dBm brownout theory is therefore **unverified speculation**, not
  a grounded finding.

## Root-cause ranking (revised)

1. **Power loss / board-level fault at ~18:40** — the only hypothesis consistent with all
   measurements: the AP is accepting clients, credentials match, the firmware lacks any path
   to stay silent while running, and no RF appears after the watchdog deauth. Not confirmed —
   requires a device readout.
2. **Boot-loop / hard fault on the board** — possible but unverified; the firmware's brownout
   counter exists but its value is only available on serial. Do **not** rebuild firmware on
   this theory alone.
3. **AP triggered the original event** — the watchdog deauth at 18:40:22 is real, caused by
   the old brcmfmac-calibrated watchdog running against the USB-dongle AP; now calibrated.
   It explains the trigger, not the 12 h silence.
4. **Firmware defect** — not supported. The firmware worked normally until 18:40 (WPA, DHCP,
   audio), so a rebuild is not justified without a serial log showing a fault. The "known
   good" label is an archive-documentation claim, not a fresh readout from the chip.
5. **AP credential/config mismatch** — ruled out (password matches, successful handshakes on
   this BSSID, no auth-failure logs, two later AP restarts ignored).

## Constraints and next steps

- The board is updated **by OTA only**; with no IP it is unreachable, so any firmware rebuild
  requires a one-time USB flash. No USB-serial adapter is attached to the Pi (checked).
- `tcpdump` is not installed on the Pi, so probe-frame sniffing was not possible (no config was
  changed by that attempt).
- To distinguish brownout loop from dead supply/radio, capture the serial boot lines
  (`[boot] count=N reason=15/16 BROWNOUT` vs `reason=1 POWER-ON`, then `[wifi] scan count=`).
- A firmware rebuild is NOT warranted on current evidence: the firmware worked normally until
  18:40. Do not rebuild without a serial log showing a fault.

## Radio-role rollback (per operator request, 06:53–06:56 PST)

- Fresh snapshot of the live (swapped) state before changing anything:
  `/root/pigpulse-backups/radio-roles-pre-revert-20261118-065345` (9 files).
- Applied `backend/portal/rollback-radio-roles.sh` with the original
  `radio-roles-20261117-161319` backup — all 9 files restored, AP resolved to `wlan0`.
- Measured after: hostapd active, AP `ssid=PigPulse` on `wlan0` (brcmfmac,
  `dc:a6:32:87:63:a1`), channel 6, gateway `192.168.69.1` on wlan0; stale AP address flushed
  from the dongle `wlan1`.
- Watchdog calibration drop-in (added for the USB dongle) removed and archived; effective
  environment restored to `PIGPULSE_AP_MIN_RATE=40` (original brcmfmac calibration).
- CCTV re-associated at 06:54:27 with a fresh DHCP lease for `192.168.69.2`, proving the
  reverted AP accepts clients.
- **Mic still absent 3+ minutes after rollback:** no association, no DHCP, no hostapd event;
  telemetry age 11.17 h. The AP/connection side is now fully reverted and working, so the
  remaining fault is at the board (power or radio), unconfirmed without a device readout.
