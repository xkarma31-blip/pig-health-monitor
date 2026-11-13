# known-good-20261113 — blockprobe

Source: `firmware/esp32s3-mic-ambient/docs/known-good-20261113/src/`
Built: 2026-11-13 from the 2026-11-12 jsonfix baseline + blocking-time counters.

| What | Where | sha256 |
|---|---|---|
| Image (staged on the Pi) | `/home/pigpulse/ota/firmware-blockprobe.bin` | f72efdfa7a9c1c77699b62a6c6ef3abc6198b1c38adcdfc6d031880a6417b71c |
| Image (laptop build) | `firmware-blockprobe.bin` | f72efdfa7a9c1c77699b62a6c6ef3abc6198b1c38adcdfc6d031880a6417b71c |

## Why this build exists

The audio loop stalls for ~5 s at a time, repeatedly, while the board stays
associated and does NOT reboot:

* `hostapd` deassociations in the stall window: **0**
* `boots` / `rr` in telemetry: constant (`boots=1`, `rr=1` = power-on)

So the stall is a **blocked write**, not a link loss. The two new telemetry
fields say which write blocks:

* `pubms` / `pubn` — the longest `mqtt.publish()` and how many took >100 ms
* `wrms`  / `wrn`  — the longest `tcpStream.write()` and how many took >100 ms

Both are max-since-boot counters.

## Baseline it was built on

The 2026-11-12 jsonfix source (922 lines) - which had the telemetry
trailing-comma fix and `payload[768]`. A copy of that source with the
trailing comma REGRESSED was built and flashed on 2026-11-13 21:0x; it is
recorded here and reverted by this build.
