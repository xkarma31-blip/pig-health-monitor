# FROZEN — NOT THE CANONICAL FIRMWARE

The canonical firmware is `v3-mqtt-pocketbase/firmware/` (ESP32-S3 `s3-mic-ambient`).
See `../CANON.md` §3.1.

This tree is the retired **ESP32-D0WD / Firebase** era:
- `platformio.ini` still declared the `mobizt/Firebase Arduino Client` dep (removed 2026-09-29)
- `include/secrets.h` carried a committed Firebase URL + plaintext password (purged 2026-09-29)
- `esp32d0wd-pigpulse/` holds untracked D0WD hardware work and is the only reason this
  directory still exists — the **ESP32-D0WD itself is decommissioned**

Do not build, flash, or extend this tree. Do not copy its topic scheme:
`pig/telemetry/{x}` is **incompatible** with the bridge, which expects
`pig/{deviceId}/{channel}`.
