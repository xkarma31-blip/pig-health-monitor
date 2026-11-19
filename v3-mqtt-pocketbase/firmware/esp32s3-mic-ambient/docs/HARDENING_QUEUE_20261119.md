# Firmware hardening queue — 2026-11-19 (DESIGN ONLY — NOT BUILT, NOT FLASHED)

> Every item below comes from a line-cited audit of the 18b source
> (`docs/known-good-20261118b/esp32s3_telemetry.ino`, 1291 lines) and its
> toolchain (`framework-arduinoespressif32` v3.20017.241212).
> **No firmware was changed, compiled, or flashed.** Nothing here may be
> applied until a serial capture shows the fault. The current live image is
> 18c, archived under `docs/known-good-20261118c/` with a measured readout.

## Why this is queued, not shipped

The Nov-18 14:33 UTC wedge hypothesis (SHT45 command-phase I²C stall) is
best-supported but **unproven**: no serial attachment, no backtrace, and no
frame showing "frozen loop counters + live MQTT" exist. The exact frozen call
(`Wire.endTransmission()`, `Wire.requestFrom()`, or a `portMAX_DELAY` mutex) is
**uncaptured**. A blind flash would replace a rollback-known image with an
unproven one — the exact failure mode this repo's KNOWN_GOOD rule exists to stop.

## Findings, in build order (one change at a time, each with before/after measurement)

| # | Defect | Evidence | Proposed fix | Acceptance test |
|---|---|---|---|---|
| 1 | **Loop can wedge forever on I²C.** `Wire.setTimeOut(50)` bounds only `i2c_master_cmd_begin` (`esp32-hal-i2c.c:176`); mutex takes use `portMAX_DELAY` (`Wire.cpp:421,504`; `esp32-hal-i2c.c:60,142`). | `[F] 300,1073`; command phase `368-370`, `requestFrom` at `335` unreachable in that branch | Move SHT45 work into its own FreeRTOS task; bound or watchdog `endTransmission`; quarantine a dead sensor after N failures | Serial `[sht45]` heartbeat stops and the watchdog fires; loop counters and MQTT keep advancing |
| 2 | **900 s restart unreachable.** 120 s recycle resets `lastLinkMs` (`650`) before the hard-reset check (`669`). | `[F] 603-604,630,650,669-673`; same in 18c | Track offline duration in a separate counter that the recycle does not reset | Force link down >900 s in a soak; observe exactly one `ESP.restart()` with reason logged |
| 3 | **Unchecked radio re-init.** `WiFi.mode/begin/setTxPower` return values discarded in recycle. | `[F] 510,518,640,643` | Check and log each return; retry with backoff | Serial shows failure reason; AP association event within expected window |
| 4 | **TX power downgraded on recycle.** Boot `WIFI_POWER_19_5dBm` (`471`); recycle path uses 19.5 dBm in 18b but older builds used 8.5 dBm. | `[F] 471-473,649`; `OTA-HARDENING…md:104-109` | Restore 19.5 dBm after every successful (re)connect; publish `txp` | `txp=78` (19.5 dBm) after each reconnect, measured in telemetry |
| 5 | **MQTT mutex violations.** loop calls `mqtt.loop()`/`mqtt_ensure()` unmutexed at `1134,1138,1166,1167` while mqttTask holds the mutex at `696-723`. | `[F]` as cited | Take `mqttMutex` in all paths, or make those calls task-owned only | No concurrent access in a 24 h soak; `pubms/wrms` stay low |
| 6 | **Cross-task state races.** `fmtPublished` (`635` vs `775`), `gFmtDirty` (`745`), `tcpBytes*`/`samp*` (`923-924,970-976,1259-1261`), SHT45 floats (`359-364` vs `949-950`), WiFi API from both tasks. | `[F]` as cited | Atomic/protected access; single-owner per field | No torn values; consistent telemetry in soak |
| 7 | **Duplicate `txp` JSON keys.** `979` emits `txp=txPartialWrites`; `983` emits `txp=WiFi.getTxPower()`. Parsers keep the last, hiding partial writes. | `[F] 979,983,999`; `78/4=19.5` per `471-473` | Rename the first key (`tpw`) | Both values present in telemetry; migration added before publish |
| 8 | **No loop liveness signal.** No task WDT; a wedged loop is invisible off-board. | `OTA-HARDENING…md:110-111` | Publish explicit loop counter/heartbeat over MQTT **and** serial; add a task WDT | Heartbeat visible; failure produces a Telegram alert within 60 s |
| 9 | **Observability dropped at the bridge.** PocketBase `telemetry` has no `boots/rr/prr/br/txp/rssi`; unknown fields are silently discarded. | `local_bridge.py:331`; CANON §2.3 | Migration + publish, then verify published-vs-stored | One row diffed field-for-field after migration |

## Physical work that must happen regardless of firmware

The power path is the only mechanism with direct device evidence (zero boots
16:46–23:41 UTC while the blue LED stayed lit — CPU held below its operating
floor). Do this before any barn re-install:

1. 5 V **≥2 A** supply; short, thick USB cable; no shared fan branch.
2. 470–1000 µF + 100 nF at the ESP inlet.
3. SHT45 wiring check: pull-ups, lead length, cold joint, address, common ground.
4. Optional future telemetry: `vin` via GPIO7 (ADC1_CH6), 2×10 kΩ divider + 100 nF.

## Gate to proceed

Attach USB and capture the boot reset reason **before** any change:

```bash
ls /dev/ttyACM*
esptool --chip esp32s3 --port /dev/ttyACM0 chip_id
python3 -m serial.tools.miniterm /dev/ttyACM0 115200
```

If the capture shows the frozen Wire call or a repeat of the same wedge,
implement **one** row from the table, archive the result under
`docs/known-good-YYYYMMDD/` with a measured before/after, and only then consider
the next row.
