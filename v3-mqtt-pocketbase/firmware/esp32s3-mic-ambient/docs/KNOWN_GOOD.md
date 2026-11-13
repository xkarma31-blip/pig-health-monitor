
## Pre-flash archive — 2026-11-13 — shtcache (SHT45 ambient gate fix)

**STATUS: RECORDED BEFORE THE FLASH — 2026-11-13.**
Rollback image is the previous entry's `firmware-nowriteblock.bin`
(`db8f16419b261f7ca85408bfaa644a005b1a5566b9919202b052b34d1e83c43b`),
staged on the Pi at `/home/pigpulse/ota/firmware-nowriteblock.bin` and
archived at `known-good-20261113/bin/`.

### The defect this build fixes

The SHT45 ambient fragment was gated on **the last attempt's outcome** rather
than on **the age of the cached reading**:

```c
// BEFORE
if (shtValid && millis() - shtLastGood < 5000)
  snprintf(ambient, sizeof(ambient), ",\"temperature\":%.2f,\"humidity\":%.2f", ...);
```

`sht_task()` set `shtValid = false` on **every** failed measurement (short
read, CRC fail, I2C error), so a single transient failure threw away a
still-good cached reading. The publish gate then omitted the ambient fragment
entirely, and PocketBase — which fills absent fields with `0` — stored
`ambient=0, humidity=0`.

Measured on the live board before the flash (raw MQTT, 40 consecutive
messages from `pig/s3-mic-01/telemetry`):

| metric | value |
|---|---|
| messages WITH the ambient fragment | **14 / 40 (35%)** |
| messages WITHOUT it | **26 / 40 (65%)** |
| messages that were invalid JSON | **0 / 40** — the trailing-comma bug is already fixed |
| PocketBase zero-rate by hour (2026-11-13) | 50.6% / 52.4% / 51.3% / 58.8% |
| Pi rows carrying `ambient=0 AND humidity=0` | **304,862** (2026-09-28 → still live) |

**This is NOT the trailing-comma bug.** That comma was removed in the
`nowriteblock` build; `backend/bridge/json_lenient.py` (commit `69912d1`) is
now belt-and-braces for a fault that no longer exists on the board. The
persistent ~51% was a separate, still-live firmware bug that CANON.md §2.5
did not know about.

A contributing cause: the measurement was read only **10 ms** after the
command, against an SHT45 high-precision conversion of up to **8.5 ms** —
about 1.5 ms of margin for I²C and Wi-Fi jitter. Reading before conversion
completes fails the CRC, which is what cleared `shtValid`.

### The change (one change, five edits, all in the SHT45 path)

1. `shtValid` now means "we hold a good reading" — set on success, **never
   cleared by a failed attempt**.
2. The publish gate became
   `shtValid && shtLastGood && (millis() - shtLastGood) < 5000` — the 5 s
   window still makes a genuinely dead sensor drop the fragment on its own.
3. The measurement read waits **20 ms** instead of 10 ms, clearing the
   conversion race.
4. Failed attempts are counted in `shtReadFails` instead of discarded.
5. `drops[384]` → `drops[512]`: the worst-case fragment needs **439** bytes
   and the old buffer held 384, so a long-lived counter set could truncate
   the fragment into invalid JSON. (`snprintf` truncates safely — no memory
   corruption — but truncated JSON is dropped by every consumer.)

Two counters were added to the telemetry `drops` fragment so the fix is
measurable straight off the wire: **`srf`** (SHT45 read failures) and
**`sage`** (ms since the last good reading; 0 = never).

### Build provenance

| What | Where | sha256 |
|---|---|---|
| **Image (staged on the Pi)** | `/home/pigpulse/ota/firmware-shtcache.bin` | `f63e0260295669fe2511f36354738298c57fca14c95dfce37ae15d1d44bdbb3a` |
| **Archived image** | `known-good-20261113-shtcache/bin/firmware-shtcache.bin` | `f63e0260295669fe2511f36354738298c57fca14c95dfce37ae15d1d44bdbb3a` |
| Source | `known-good-20261113-shtcache/src/esp32s3_telemetry.ino` | `7a49213ea1b147d7e573474452364950751a05b41b9e9708a0c08a4118132bc0` |
| Build config | `known-good-20261113-shtcache/platformio.ini` | `aaad38f65d0d8de7ea896465de1008c3e10d4ac6bbbacba0a550c2416b152c17` |

Firmware ID: `pigpulse-mic-sht45-20261113-shtcache` (was
`pigpulse-mic-sht45-20261113-nowriteblock`).

Build: espressif32 7.0.1 / Arduino 2.0.17, `board_upload.flash_size = 4MB`.
RAM 116,876 B (35.7%, +8 B) · Flash 780,993 B (59.6%, +68 B) · image 781,376 B.

### Reproducibility note

The image is **not** byte-reproducible: the ESP32 app descriptor embeds a
build timestamp, so the checksum and validation hash differ between builds of
identical source. What *is* reproducible and was verified: image size, the six
segment lengths and load addresses, the entry point, and the RAM/Flash
footprint — all identical between the rebuilt `nowriteblock` source and its
archived binary.

### Flash procedure

```sh
scp firmware-shtcache.bin pigpulse@192.168.69.1:/home/pigpulse/ota/
ssh pigpulse@192.168.69.1 \
  '/home/pigpulse/ota/ota-flash.sh 192.168.69.15 /home/pigpulse/ota/firmware-shtcache.bin \
   f63e0260295669fe2511f36354738298c57fca14c95dfce37ae15d1d44bdbb3a'
```

### Post-flash verification

*(appended after the flash)*

---

## Pre-flash archive — 2026-11-13 — blockprobe (blocking-time instrumentation)

**STATUS: FLASHED AND VERIFIED — 2026-11-13 (wireless OTA, no USB attached).**
Recorded here BEFORE the flash, per the firmware-change discipline; the
post-flash measurements are at the end of this entry.

### The actual defect this build fixes

`tcp_flush()` destroyed the audio socket when a write could not place all its
bytes:

```c
if (n == 0) {
  txPartialWrites++;
  tcpStream.stop();                                    // <- killed the stream
  Serial.println("[tcp] stalled; buffer retained");   // <- the message lied
}
```

The socket's TCP send buffer is **5760 bytes** (`CONFIG_LWIP_TCP_SND_BUF_DEFAULT`)
= **59 ms of slack** at the stream's 96,000 B/s. Any WiFi hiccup longer than
that filled the buffer, `tcp_write()` returned 0, the socket was thrown away,
and the stream went silent until the reconnect finished - about 5 s. Then it
happened again.

Measured on the live board 2026-11-13 with the probe build's telemetry:

| counter | value | meaning |
|---|---|---|
| `wrms` | **1211 ms** | longest `tcpStream.write()` in the AUDIO task |
| `pubms` | 2 ms | longest `mqtt.publish()` in the MQTT task |
| `pubn` | 0 | publishes that took >100 ms |
| `wrn` | 1 | writes that took >100 ms |

So it was never the radio (0 hostapd deassociations in the stall window) and
never MQTT. It was this write, and the socket being killed instead of the
data being kept.

**The fix (round 1, `firmware-nostop.bin`):** keep the unsent bytes in the ring
buffer and retry; never destroy the socket because of a full send buffer.
`TX_BUF_SZ` also goes 32 KB -> 64 KB (340 ms -> 680 ms of audio at 96,000 B/s)
so the ring rides out a hiccup without dropping a sample.

### Round 2 - `firmware-nowriteblock.bin` - the 10-second write trap

Round 1 stopped the socket from being destroyed, but the **stall remained**,
because the stall was never in the ESP's code - it was inside Arduino's
`NetworkClient::write()`:

```c
#define WIFI_CLIENT_MAX_WRITE_RETRY     (10)
#define WIFI_CLIENT_SELECT_TIMEOUT_US   (1000000)   /* 1 second */
...
while (retry) {
    tv.tv_sec = 0; tv.tv_usec = WIFI_CLIENT_SELECT_TIMEOUT_US;
    retry--;
    if (select(fd + 1, NULL, &set, NULL, &tv) < 0) return 0;
    if (FD_ISSET(fd, &set)) { res = send(fd, buf, bytesRemaining, MSG_DONTWAIT); ... }
}
```

So one `write()` call can block for **10 x 1 s = 10,000 ms** whenever the
socket's send queue is full. Measured on the live board with the probe build's
telemetry: `wrms = 10,003 ms` - an exact match for 10 x 1 s, while
`pubms = 2 ms` (MQTT never blocked) and `hostapd` deassociations in the stall
window were **0**.

Measured effect of the stall (60 s window, live board 2026-11-13):

| metric | value |
|---|---|
| audio offered by the ESP | 96,000 B/s |
| bytes the ESP pushed into the socket (`bps`) | 85,844 B/s |
| bytes the Pi actually received | 53,350 B/s (**56 %**) |
| `txd` (bytes dropped by ring overflow) | 0 |

The missing 32 KB/s is the time the ESP sat inside `write()` waiting for a
writable socket. The Pi then saw 5 s of silence, closed the socket, and the
ESP reconnected - a gap of seconds, repeatedly. That is the "weird pause".

**The fix:** call `send()` directly with `MSG_DONTWAIT` (`tcp_send_nowait()`),
bypassing the select()+retry loop entirely. A full queue returns `-1`/`EAGAIN`
immediately; the bytes stay in the 64 KB ring and are retried on the next loop
iteration. The write can no longer block, so the socket survives and the Pi
never sees a 5 s silence.

Pi-side companion change: `ESP_SILENCE_CLOSE_S` 5.0 -> 15.0 s in
`/home/pigpulse/thermal-pi/esp_audio_ingest.py`, so a slow-but-alive link is not
declared dead while the ESP is still holding buffered audio.

| What | Where | sha256 |
|---|---|---|
| **Image (staged on the Pi)** | `/home/pigpulse/ota/firmware-nowriteblock.bin` | `db8f16419b261f7ca85408bfaa644a005b1a5566b9919202b052b34d1e83c43b` |
| Previous build (nostop, superseded) | `/home/pigpulse/ota/firmware-nostop.bin` | `a479738fc6255b69dade431271d7f2be3da200b9d0074a4efe96a76f4a1714d4` |
| Probe build (superseded, still archived) | `/home/pigpulse/ota/firmware-blockprobe.bin` | `f72efdfa7a9c1c77699b62a6c6ef3abc6198b1c38adcdfc6d031880a6417b71c` |
| Image (laptop build) | `firmware/esp32s3-mic-ambient/docs/known-good-20261113/bin/` | same |
| **Source** | `firmware/esp32s3-mic-ambient/docs/known-good-20261113/src/` | — |
| Baseline it was built from | 2026-11-12 jsonfix source (922 lines) | — |
| Rollback image (the known-good jsonfix build) | `/home/pigpulse/ota/firmware-jsonfix-20261112.bin` | `ccdf343a560de7881616e2027bc146e214c66c0116b0a030f77031fa363f80cd` |

### Why

The audio loop stalls for ~5 s at a time, repeatedly. Measured during the
stall:

* `hostapd` deassociations: **0** — the board stays associated
* `boots` / `rr` in telemetry: **constant** — the board does not reboot

So it is a **blocked write**, not a link loss. The only other user of the
board's network stack is MQTT, so this build adds the counters that prove it:
`pubms`/`pubn` (longest `mqtt.publish()`) and `wrms`/`wrn` (longest
`tcpStream.write()`).

### Incident note — a regression was flashed and has been reverted

On 2026-11-13 21:0x a build made from a **stale copy** of the source was
flashed. That copy had the **2026-11-12 telemetry trailing-comma fix
reverted** (`"txp":%ld,` instead of `"txp":%ld`) and `payload[512]` instead
of `payload[768]` — i.e. exactly the defect the 2026-11-12 entry documents,
where a truncated/invalid payload is dropped by every consumer.

The 2026-11-13 archive is built from the **jsonfix source**, so the fix is
present again. The live telemetry JSON was re-verified valid.

# KNOWN-GOOD RECORD — ESP32-S3 barn mic firmware

## Pre-flash archive — 2026-11-12 — telemetry JSON trailing-comma fix

**STATUS: FLASHED AND VERIFIED — 2026-11-12 16:19.** All four success criteria
met; see "Post-flash result" below for the measurements. The board is now
running `firmware-jsonfix-20261112.bin`.

### The defect (measured on the live board 2026-11-12)

`publish_telemetry()` concatenates a prefix + an optional SHT45 fragment + a
`drops` fragment. The `drops` format string ended in a **comma before `}`**:

```c
snprintf(drops, sizeof(drops),
         ..., "\"boots\":%lu,\"rr\":%lu,\"br\":%lu,\"txp\":%ld,", ...);
```

So the wire payload looked like `...,"br":0,"txp":34,}` — invalid JSON. Measured
impact on the Pi: `json.loads` rejected **60 of 61** messages
(`Illegal trailing comma before end of object: line 1 column ~303`), the bridge
logged `Invalid JSON on pig/s3-mic-01/telemetry` once per second, and ~498,000
telemetry rows were stored with `ambient=0, humidity=0, mic=False`. The SHT45
was reporting correctly the whole time (34.2–35.6 °C / 62–66 % RH) and its
readings were discarded in transport.

**This is not a hardware fault and never was.** The earlier KNOWN_GOOD/CANON
note blaming I²C wiring/pull-ups was wrong and has been corrected.

### The fix (two changes, nothing else)

1. Trailing comma removed: `"txp":%ld",` → `"txp":%ld"`
2. `char payload[512]` → `char payload[768]`. The widest possible payload
   (every counter at max + the SHT45 fragment) measures **436–452 bytes**;
   512 was survivable but `-Wformat-truncation` was warning about a genuine
   hazard, and truncating mid-JSON reproduces exactly this failure mode.

Built clean (`pio run`, no warnings). The compiled artifact's format strings were
extracted from `firmware.bin` and round-tripped through `json.loads`: valid with
AND without the SHT45 fragment.

### Artifacts

| What | Where | sha256 |
|---|---|---|
| Fixed image (staged on the Pi) | `/home/pigpulse/ota/firmware-jsonfix-20261112.bin` | `ccdf343a560de7881616e2027bc146e214c66c0116b0a030f77031fa363f80cd` |
| Fixed image (laptop build) | `~/sandbox/fw-experiments/20261112-144838-json-comma-fix/.pio/build/esp32-s3/firmware.bin` | same |
| Fixed **source** | `~/sandbox/fw-experiments/20261112-144838-json-comma-fix/src/` | — |
| Source of what is currently on the board | `arduino/esp32s3_telemetry-flashed-20261111/` | — |
| Rollback images (19 prior) | `/home/pigpulse/ota/*.bin` on the Pi | see `sha256sum` there |

Presumed-current rollback: `/home/pigpulse/ota/firmware-brwnout.bin`
(781,200 B, sha `4baa292e…`) — the newest image staged before this build, dated
2026-11-11 20:45. **Not independently confirmed against the board** (the
firmware publishes no build tag and there is no USB serial on the Pi), so treat
it as "most likely" rather than verified.

### Flash command (ArduinoOTA, UDP 3232 — A/B slots, aborted upload leaves the board running)

```bash
# on the Pi
cd ~/ota
./ota-flash.sh 192.168.69.15 ./firmware-jsonfix-20261112.bin \
  ccdf343a560de7881616e2027bc146e214c66c0116b0a030f77031fa363f80cd
```

### Rollback

```bash
cd ~/ota
./ota-flash.sh 192.168.69.15 ./firmware-brwnout.bin
```

### Success criteria (measured, not assumed)

1. `mosquitto_sub -t pig/s3-mic-01/telemetry -C 5` → every message parses with a
   **strict** `json.loads` (no trailing comma before `}`).
2. `curl -sk https://192.168.69.1:8080/ambient` → `state=live`, `temperature`
   non-null.
3. `curl -sk https://192.168.69.1:8080/health` → `ESP32-S3 mic: ... nonzero≈100%`
   and `Ambient (SHT45): live`.
4. `journalctl -u pigpulse-bridge -f` → no new `Invalid JSON` lines.

The tolerant parser (`backend/bridge/json_lenient.py`) stays deployed regardless:
it is the transport-side guard that made this incident non-fatal, and any future
firmware regression of the same kind should also be survivable.

### Post-flash result — measured 2026-11-12 16:19–16:21

Flashed with the command above (`espota` authenticated, A/B slot, board
rejoined `192.168.69.15` on its own). Evidence the new image is running, and
that the defect is gone:

| Criterion | Measurement |
|---|---|
| Strict `json.loads` on live MQTT | **12 / 12 messages parsed, 0 failed** |
| Payload tail | `…"rr":3,"br":0,"txp":78}` — **no trailing comma** |
| `pigpulse-bridge` `Invalid JSON` lines | **0** |
| Board rebooted + rejoined | `txd:0` (fresh boot), mic `nonzero=100.0 %` |

Note: `FIRMWARE_ID` was **not** bumped by this fix, so the `audio/fmt` banner
still reads `pigpulse-mic-sht45-20261111-pilevel`. Do not use that string to
decide whether this image is running — use the absence of the trailing comma,
which is the actual proof.

**Still open, and NOT caused by this image:** the SHT45 stopped reading at
~16:16 and a board reboot did not restore it — 0 of 76 telemetry messages over
75 s carried `temperature`, `ambientCount` froze at 261, `ambientAgeS` reached
352 s. It had been reporting normally for the preceding ~16 minutes
(`ambientCount` 44 → 261). This reproduces the 2026-10-19 entry below
("SHT45 repeatedly NACKs (I2C error 2)") and is therefore a **board-side I²C
fault — wiring, contact or sensor** — not a firmware or JSON defect. The JSON
transport is now correct whenever the sensor does report.

---

## Latest preserved functional baseline — 2026-10-19 14:33

**Use `known-good-20261019-143307-mic-sht45/RESTORE.md` for the exact source,
binary and restore commands.** Pointer: `LATEST_VERIFIED_BACKUP.txt`.
Actual pins: mic SCK=4, WS=5, SD=6, L/R=GND; SHT SDA=8/SCL=9; 3.3V supplies.
Combined firmware ID `pigpulse-mic-sht45-20261019`.
Network connections and CRC-valid SHT readings observed with varied mic levels.
SHT intermittent NACK/CRC/read failures remain; TCP throughput sometimes dips.
Do not call this error-free or claim verified audio fidelity. Evidence is archived.
Second checksummed tarball: `/home/solrahk/sandbox/firmware-backups/known-good-20261019-143307-mic-sht45.tar.gz`.
Preserve these snapshots before changes; never substitute the old reversed pinout.

## Workflow — snapshots are frozen, improvements happen in copies (2026-10-19)

Enforced, not just promised:

1. **Verified snapshots are physically read-only.** `known-good-20261019-143307-mic-sht45/`,
   `known-good-20261013/` and the sandbox tarballs have `chmod a-w` applied.
   Verified as `solrahk`: appending to a file in the archive and creating a new
   file both fail with `Permission denied`.
2. **Every change starts from a copy, never an edit in place:**
   `firmware/esp32s3-mic-ambient/scripts/fw-experiment.sh <label>`
   → creates `~/sandbox/fw-experiments/<timestamp>-<label>/` containing `src/`
   plus `platformio*.ini`, then prints the exact build/flash commands.
3. Build and flash **only** from that copy. Verify on real hardware first
   (measured serial or `/esp/stream` values — a compile alone proves nothing).
4. **Only after hardware verification:** promote the copy's `src/` back into
   `arduino/esp32s3_telemetry/src/`, then freeze a new snapshot (directory +
   `SHA256SUMS` + tarball) and update `LATEST_VERIFIED_BACKUP.txt` and this file.
5. **Never delete an older snapshot** — there must always be a way back.

**Copy fidelity, measured 2026-10-19:** building from a fresh copy produced an
image with identical structure and byte-identical loadable segments (5/5 same
sizes, same entry point). Only 64 of 736,112 bytes differed: the 32-byte
`app_elf_sha256` descriptor field and the trailing image validation hash — both
change only because the ELF embeds the build directory path. The running code
is the same code.

## Corrected user mic sketch — clean test 2026-10-19

Compiled and flashed `docs/mic-test-corrected.ino` through PlatformIO with
SCK=4/WS=5/SD=6, left channel, 44100 Hz. No WiFi or I2C initialization.
Combined firmware preserved as `pre-change-20261019-sht45/combined-firmware.bin`.
Capture `pre-change-20261019-sht45/mic-clean-serial.txt` shows repeated blocks
with min=max=mean=-8388608, RMS=8388608 and AC_RMS=0; occasional transitions
to -4194304 or 0. Not usable audio. Removing networking and SHT software did
not resolve the fault; physical SHT isolation and supply voltage are unverified.
Restored combined production firmware with `PLATFORMIO_BUILD_DIR=build/sht45
~/.platformio/penv/bin/pio run -t upload`; esptool verified write hash.
Post-restore serial showed WiFi scan count=4 and txPower output. No diagnostic
build left on board.

## 2026-10-19 — combined SHT45 repair, pre-flash archive

User explicitly confirmed SHT45 SDA=8/SCL=9 and mic SCK=4/WS=5/SD=6,
L/R=GND; both powered from 3.3V. This supersedes the unresolved wiring question below.
Before changing the firmware, USB reported RMS24=0, Peak24=0, nz=0%,
wifi=0/mqtt=0/tcp=0. This is a rollback snapshot, **not known-good audio**.
Full 4 MB flash read from ESP32-S3 MAC 68:ee:8f:dd:31:3c archived in
`pre-change-20261019-sht45/flash-backup.bin` with source and platformio.ini.
Flash SHA256: `cf1c590a0271f0f63ea04ded8a100f4d5d765a1b9dc887fbf0be7c2758531c8b`.
New firmware adds asynchronous CRC-checked SHT4x measurements at 0x44,
GPIO8/9, and fresh temperature/humidity fields to MQTT telemetry.

**After flash:** PlatformIO build and upload passed; flash hash verified by
esptool. USB banner `pigpulse-mic-sht45-20261019` and explicit pin assignments
confirmed the deployed build. Capture: `pre-change-20261019-sht45/after-serial.txt`.
SHT45 repeatedly NACKs (I2C error 2); no temperature/humidity measured.
Mic RMS24 ~2.1 million with repeated power-of-two peaks (4194304/6291456/8388608);
this is not verified acoustic audio. WiFi/MQTT/TCP remain disconnected.
Board is left on combined production firmware, not a diagnostic build.
PCM conversion regression check passed. `critic_loop.sh` and `cr` unavailable on PATH.

Build/upload as solrahk using the working virtualenv CLI (system pio misses tabulate):
`PLATFORMIO_BUILD_DIR=build/sht45 ~/.platformio/penv/bin/pio run -t upload`
from `arduino/esp32s3_telemetry`. Separate build directory avoids pre-existing
root-owned `.pio/build` artifacts.

> **Rule: every firmware change gets a before/after record here.** If a working
> state exists, it is archived *before* the next flash. No change is made
> without a way back. This file is the way back.

---

## How to revert (two commands)

```bash
cd v3-mqtt-pocketbase/firmware/esp32s3-mic-ambient/arduino/esp32s3_telemetry
pio run -t upload                                    # normal streaming firmware
pio run -c platformio.usb-diagnostic.ini -t upload    # USB-only diagnostic (no WiFi)
```

`platformio.ini` carries `build_src_filter = +<*> -<sensor_usb_diagnostic.cpp>`
so the normal build always excludes the diagnostic file. The diagnostic env
(`platformio.usb-diagnostic.ini`) compiles **only** `sensor_usb_diagnostic.cpp`.

Restore the exact archived binary instead of rebuilding:

```bash
pio run -t upload --upload-port /dev/ttyACM0    # rebuild from archived source
esptool.py --chip esp32s3 --port /dev/ttyACM0 write_flash 0x10000 firmware-normal.bin
```

---

## Known-good #1 — 2026-10-13 (produced recognisable audio)

| Item | Value |
|---|---|
| Firmware ID string | `pigpulse-mic-pcm16-20261013` |
| Source | `known-good-20261013/esp32s3_telemetry.ino` (sha256 `8f4fa92b94b45702dd190d0addd47a264129dbd354d1daf6e861af886fd7032d`) |
| Build config | `known-good-20261013/platformio.ini` (sha256 `72dc76955032e3fd7da64f52b1fe95390e8ddf0d15a31f4178d0f0877fc242d1`) |
| Binary | `known-good-20261013/firmware-normal.bin` (sha256 `906996736800b736ef0e5b915599665b1d842da97076b2bd27c382db9fe5f2fa`, 716944 bytes) |
| Toolchain | espressif32 **7.0.1**, Arduino **2.0.17**, `board_upload.flash_size = 4MB` |
| Pinout | WS=GPIO4, SCK=GPIO5, SD=GPIO6, L/R=GND, VDD=3.3V, GND=GND |
| I2S | 48 kHz, 32-bit slot, `I2S_CHANNEL_FMT_ONLY_LEFT`, `use_apll=false` |
| Conversion | `raw32 >> 16` → S16, mono duplicated to L/R, 4 bytes/frame |
| Network | TCP `192.168.69.1:9090`, MQTT `pig/s3-mic-01/telemetry` |
| **Measured proof it worked** | Pi `/esp/stream` 2026-10-13 17:18 → 4.98 s capture, **6,719 distinct sample values**, min −14639, max +4814, AC RMS **1104** |
| Also recorded in | `CANON.md` §1 (user-confirmed audio, residual static) and `MIC_FIX_20261013.md` |

**Expected healthy serial line:**
```
RMS24: <large and varying> Peak24: <large> nz:100% <dBFS> tcp:192127 B/s wifi:1 mqtt:1 tcp:1
```

**Expected healthy Pi status:** `"connected":true,"stale":false,"nonzeroPct":100.0`

---

## State at 2026-10-14 (NOT working — hardware-side)

Measured with the mic connected, SHT **physically removed**, Pi powered:

- `/esp/stream`: 4.88 s capture, **1 distinct value**, every sample `-1`, AC RMS **0.00**
- Serial: `RMS24: 1 Peak24: 1 nz:100% -138.4 dBFS` while `wifi:1 mqtt:1 tcp:1`
- I2S matrix test (v6): **stereo LEFT/RIGHT, ONLY_LEFT, ONLY_RIGHT, 16 kHz and APLL
  all idle at all-ones**, ~0 transitions → not slot selection, not clock mode, not rate
- Line test (v7): **GPIO6 with internal pull-DOWN reads LOW (0/50)** → the data
  line is *not* shorted high and the ESP pad is not stuck high; the mic simply
  never drives it
- SHT removed → fault persists ⇒ **the SHT is ruled out as the cause**
- SHT was never detected: **0 I²C devices ACK on GPIO8/9** (full 1–126 scan),
  0x44/0x45 NACK

**Interpretation:** the ESP generates clocks and reads a tri-stated line; the
microphone is not outputting. Remaining candidates are mic-side: module in
power-down (`CHIPEN` low / not tied high on this breakout), module damaged,
or a signal-path fault that continuity alone cannot see.

**Next discriminating step (physical, power off first):**
1. Check for a `CHIPEN` pad/pin on the module and whether it is tied HIGH.
2. If CHIPEN is fine → substitute a known-good INMP441 module, one change at a time.
3. With a scope/logic analyser: confirm WS = 48 kHz and SCK = 3.072 MHz **at the
   mic's own pins** (continuity does not prove signal presence).

---

## Addendum 2026-10-17 (v8 + v9 — measured with the board live)

**v8 — Master's verbatim sketch (44100, ONLY_LEFT, >>8), 3 captures:**
- Idle signature on Master's code = `RMS: 1.0 Peak: 1` (arithmetic shift keeps
  −1; the earlier "16,777,215 on idle" prediction was **wrong** — corrected).
- 158 distinct RMS values over 22 s and 46% "active" windows in later runs —
  so the line is not permanently idle *today* (Oct 14 measured 0–2 transitions
  per 3 s window in every config; the condition has changed).
- The active content is NOT audio: maxRMS repeats at **exactly 370,727.6 in
  every second**, burst peaks are exactly 2^k+1 (257, 8193, 16385, 4194305),
  and a per-second acoustic-correlation test (quiet 4 s → noise 8 s → quiet
  4 s) showed **zero correlation**. Verdict: deterministic bit-slip debris from
  a line that is not solidly driven.

**v9 — refined data-pin sweep (front header {3,6,7,8,9,10,11,12,13}, WS=4/SCK=5):**
- No reachable GPIO carries a coherent stream → "wire on another pin" closed.
- pin3/8/9: 100% all-ones; pins 11/12/13: 100% all-zeros (unconnected, low);
  pin10: ~99.9% all-ones, tiny debris; pin6: 99.98–100% all-ones (trans 2–14).
- Pin 7 and pin 11 **flip state between passes** with nobody touching the
  board → line-state intermittency confirmed at pass granularity.

**Net verdict after v8+v9:** the semiconductor/mic side (or its immediate
contact perimeter) is the only remaining fault zone: dead chip, CHIPEN
power-down, or marginal SD joint at the module. Decisive next: per-wire reseat
with a live capture; look for a CHIPEN pad; substitute a spare INMP441 if
available. normal streaming firmware restored after the tests (boot banner
`pigpulse-mic-pcm16-20261013` verified).

---

## Addendum 2026-10-17 (offline audit, no device used)

- Raw /tmp artifacts from Oct 13–14 are gone; this file + the archive are now
  the primary record. All 3 archive sha256 re-verified today.
- All-ones on ESP32-S3 I²S = **documented reading of a floating RX data line**
  (independent source: m5stack/uiflow-micropython PR #97, Cardputer-Adv case).
  GPIO6 pulldown-LOW and I²S-all-ones agree: the line floats, nothing drives it.
- INMP441 datasheet: CHIPEN low/floating = power-down = SD never drives —
  matches every measurement. SD trace also should have a 100 kΩ pulldown (none
  fitted). Note: e.g. typo guard — term is CHIPEN.
- **New rule: never run I²S firmware while the mic's VDD is disconnected**
  (datasheet: clocks into unpowered mic conduct through ESD diodes, degrading it).
- Full reasoning: `docs/MIC_AUDIT_20261017.md`. Next: flash Master's verbatim
  sketch (v8, already built), reseat wires, refined front-pin sweep.

---

## Addendum 2026-10-17 (v10 register-pad-watch — the chain, decoded with the board live)

### Fact 1 — WS/SCK "dead-flat" reads were an INPUT-BUFFER artifact
Every earlier run (v8/v9/v10a–d) read GPIO4/5 through `GPIO_IN_REG` flat-zero because the
legacy I2S driver routes BCK/WS pads **output-only** — IOMUX `FUN_IE` (input buffer, IO_MUX
bit9) stays 0 on exactly those pads. Data rule extracted: **all `ie=0` pads read constant 0;
all `ie=1` pads read live truth** (GPIO0–3 read 100% hi with ie=1; GPIO6/9 toggle with ie=1;
GPIO4/5/7/8 flat-0 all have ie=0). v10f proved the watch chain itself valid (GPIO3 CPU-pulse
calibration: ~12k transitions, 50.3% duty). v10g forced FUN_IE by direct IO_MUX bit-write
(0x200 into IO_MUX_GPIO4/5_REG) *without touching the matrix routing* and the clock pads
became readable: pad-WS = 47,949 Hz (48 kHz nominal ✓), pad-BCK ≈ 3.07 MHz duty-49.7%
(aliased to ~350 kHz at our ~2.0 MS/s register poll). **Do NOT treat "GPIO_IN reads 0 on a
routed peripheral pad" as pad-level evidence.**

### Fact 2 — bck/ws firmware config vs physical wiring were CROSS-CLOCKED
Master's wiring statement (2026-10-17, authoritative): mic **SCK/BCLK→GPIO4,
WS/LRCL→GPIO5, SD/DOUT→GPIO6, L/R→GND**. Prior firmware config (incl. the Oct-13
known-good source, byte-proven identical) had `bck_io_num=5, ws_io_num=4` — the mic's
bit-clock pin was driven with the 48 kHz word-select and its WS pin with 3.07 MHz BCK.
v10g swapped the diagnostic to `bck=4, ws=5` (matching physicals) and clocks landed
correctly. **Production must take the same swap before restore.**

### Fact 3 — disposition: SD–WS SHORT (no direct electrical probe yet; paths unverified)
v10g/i/j: with pad5 carrying WS, the SD pad toggles at **exactly** WS rate (112,717
transitions — identical count and 51.2% duty to WS), and the RX slots are constant:
LEFT = 0x00000000, RIGHT = 0xFFFFFFFE, 8 s clap-watch = **zero deviations in 386,048
samples**. In the cross-clocked era (pad5 = BCK 3.07 MHz), SD measured ~350 kHz ≈ the
aliased BCK. **SD tracked the pad-5 net under BOTH configs ⇒ electrical continuity
SD↔WS.** Candidates (unverified): solder bridge between the module's adjacent WS/SD pads,
wire-to-wire contact, SuperMini GPIO5/6 header bridge. The mic's real DOUT is invisible
while the short stands; clap-silence follows because the "data" is a clock mirror.
Micro integrity (alive vs dead) remains UNKNOWN until the short is lifted.

### Provenance correction (Master, 2026-10-19)
The Oct-13 "recognisable audio" build was most likely **NOT** this repo's copy.
Correct artifact: `/home/solrahk/Arduino/esp32s3_mic_telemetry/` — its own pio workspace
(env `esp32s3-mic`), sketch `esp32s3_mic_telemetry.ino` (16,417 B, Oct 8 15:47, with
grab_clip.py / live_audio.py / local_server.py sibling scripts), firmware.bin built
Oct 8 15:43 — five days before the working stream. Its defines read
`I2S_WS=4 / I2S_SCK=5 / I2S_SD=6` — identical pin values to this repo's copy, so the
code base never disagreed on pins; the workspace sketch is however a DIFFERENT and
larger code tree (local server + clip runner etc.). Register correction: "known-good
#1" should cite the Arduino workspace build as the artifact that actually streamed on
Oct 13; this repo's archive is related-but-not-identical source with a pio-rebuilt bin
(assembled 2026-10-14 13:04). Revert-to-working = flash the Arduino workspace bin
(also satisfying the "record what works" rule better than any repo rebuild).

### Register corrections this implies
- v8 "all-ones" interpretation: under the cross-clocked config the RX was sampling a
  displaced constant; treat as config-fault evidence, not mic health.
- The floating-line/all-ones note in the offline audit stays valid as *general* ESP32
  behaviour, but the dominant decoder for THIS board is the cross-clock + short chain.
- Master asked what touched the setup in the Oct-13 16:40→17:18 window: if the wiring was
  re-placed then, a bridge born in that session fits the whole timeline.
  (Narrative, unverified — on record only.)

---

## Addendum 2026-10-19 (board found on the diagnostic build — restored)

### Found
The board was powered and enumerated (`303a:1001` USB-Serial-JTAG, `ttyACM0`) while
running **`PAD-REGISTER-WATCH-v10`** — the v10k diagnostic. **No note here said so**,
which is exactly what rule 3 exists to prevent.

Why the serial looked dead: v10k's `loop()` is
`if (pass > 1) { delay(4000); return; }` — it probes **once** at boot
(`shortProbe()` + `printOutMatrix()`) and then idles silently forever. The board had
been up 1,535 s, so a 12 s capture returned **0 bytes**. Reset + re-capture returned
6,488 bytes of pass 1 → `docs/serial-capture-20261019-pad-watch-v10.txt`.

### Restored
`pio run -t upload` → `Wrote 717024 bytes ... Hash of data verified`, hard reset.

**Measured after restore** (`docs/serial-capture-20261019-streaming-restored.txt`):
- Boot banner `pigpulse-mic-pcm16-20261013` present ✓
- `RMS24:` printing once per second ✓ — serial live again, diagnostic gone
- Content: `RMS24: 4194304 Peak24: 4194304 nz:100% -6.0 dBFS tcp:0 B/s wifi:0 mqtt:0 tcp:0`
  — **identical to the digit across every sample** → no audio. Consistent with the
  Fact-3 short / floating-line chain. *(Mic connection state at capture time: unknown —
  not verified either way.)*
- `[wifi] disconnected` throughout, `wifi:0 mqtt:0 tcp:0` → the Pi AP (`PigPulse`) was
  not up, so no TCP/MQTT. Expected on the bench; not a firmware fault.

### v10k drive-test reading — raw, mechanism NOT established
`shortProbe()` output, pad5 (WS) vs pad6 (SD), each row a separate pass:

| pass | drive | pad5 hi | pad6 hi |
|---|---|---|---|
| S1 | pad6 LOW | 0.0% | 0.0% |
| S2 | pad6 HIGH | **100.0%** | 0.0% |
| S3 | pad6 released | 89.3% | 88.5% |
| S5 | pad5 LOW | 0.0% | 0.0% |
| S4 | pad5 HIGH | 0.0% | **100.0%** |

Driving one pad, the *other* reads high and the driven one reads low.

**Two pads on one net must read the same level. S2 shows opposite levels within a single
pass, so pad5 and pad6 were not one net during S2** — this pass does not reproduce the
Fact-3 short. Since v9 already recorded "line-state intermittency at pass granularity",
an intermittent short fits. **Unverified — do not build on this table until it repeats.**

### Code audit of the diagnostic — two corrections
1. **Label table and bit indexing are CORRECT.** `PN[14]` = Boot,IO1,IO2,IO3,SCK4,WS5,SD6,
   IO7,SDA8,SCL9,IO10…IO13; `hi[p] += (cur >> p) & 1`; printed as `PN[p]` with `hi[p]`.
   `p` is the pad number in every place. **A suspicion that these were shifted by one is
   REFUTED.**
2. **The `SCK4`, `IO7`, `SDA8` rows read a constant 0.0% — an `ie=0` artifact, not pin
   truth.** `shortProbe()` forces FUN_IE only on pads **5, 6, 9**; `printOutMatrix()`
   confirms GPIO4/7/8 `ie=0`. Per Fact 1 those rows carry no information about those pins.

### Open contradiction — wiring table vs both firmwares
| Source | WS/LRCL | SCK/BCLK |
|---|---|---|
| `README.md` §1 (Sep 28) | **GPIO4** | **GPIO5** |
| This file, known-good #1 line 39 (Oct 13) | GPIO4 | GPIO5 |
| **main firmware** `src/esp32s3_telemetry.ino` (v10g) | **5** | **4** |
| **diagnostic** `sensor_usb_diagnostic.cpp` (v10g) | **5** | **4** |

Both firmwares carry the v10g swap; both documents carry the pre-swap values.
**Unresolved:** known-good #1 produced real audio on the *pre-swap* config, while Fact 2
records Master's Oct-17 statement that the physical wiring is SCK→4 / WS→5. Both cannot
describe the same wiring — so the wiring must have changed between Oct 13 and Oct 17.
**`README.md` §1 was NOT changed in this session.** Only Master can say which wiring is
true on the board right now; until then this table and that README row disagree.

### Pin-config A/B test (2026-10-19) — the swap is NOT the fix
Master confirmed the INMP441 **is** connected. Rule 2 applied: one change, before/after.

| Firmware `I2S_WS` / `I2S_SCK` | `RMS24` reading | Distinct | Verdict |
|---|---|---|---|
| **5 / 4** — as found (v10g) | `4194304 Peak24: 4194304 nz:100% -6.0 dBFS` | 1 | idle artifact |
| **4 / 5** — swapped | `1 Peak24: 1 nz:100% -138.4 dBFS` | 4 | **idle artifact** |

**The pin config demonstrably changes the RX result** — the defines do take effect. But
**neither config produces audio**, and the swapped reading `RMS24: 1 Peak24: 1 nz:100%
-138.4 dBFS` is *character-for-character* the entry already on this page under
"State at 2026-10-14", and is the documented all-ones reading of a floating RX line
(offline audit, above).

**Conclusion: the WS/SCK assignment is not the root fault.** The data line is not driven in
either config. This *removes* cross-clocking as the prime suspect and puts the fault back on
the mic/electrical side (Fact 3 short, CHIPEN, dead module) — consistent with Oct 14.

**Reverted** to the as-found v10g config and re-flashed; source restored byte-identical from
backup (8,761 bytes, mtime 2026-10-17 14:17, owner `solrahk`). Reading returned to `4194304`.
Working tree is as found apart from its own pre-existing uncommitted changes.

**Still open for Master:** which physical wiring is true. Both configs idle, so this A/B
**cannot** decide it electrically — it needs eyes on the module's WS/SCK wires.

---

## 2026-10-19 — SHT / I²C investigation ("have you tested the SHT?")

**Answer as of before this session: no.** The SHT had never been exercised by anything
we ran, and this was checkable, not assumed:

- The streaming firmware's entire include list is `driver/i2s.h`, `math.h`, `WiFi.h`,
  `PubSubClient.h` — no `Wire.h`, no I²C, no `#include "sht_probe.h"`.
- `sensor_usb_diagnostic.cpp` contains **no I²C code at all**.
- `src/sht_probe.h` is **orphaned dead code**: a repo-wide grep finds it referenced only
  by itself and one README row. No `.ino`/`.cpp`/`.ini` includes it, so it has never been
  compiled. Its own header says "Opt-in only."

So both builds flashed on 2026-10-19 were SHT-blind. The SHT was untested, not working.

### Method

A **standalone** PlatformIO project at `/tmp/opencode/sht-test/` (deliberately *outside*
the repo — adding a second `setup()/loop()` `.cpp` under `src/` would have collided with
the normal build unless `platformio.ini`'s `build_src_filter` were also edited, and that
file has uncommitted user changes). Built against the same `espressif32@7.0.1` /
`esp32-s3-devkitc-1` as the repo. Mic pins 4/5/6 are never driven; USB 19/20 and
flash/PSRAM pins excluded. Sources archived beside the captures
(`sht-hunt-v4-standalone-scanner.cpp`, `sht-hunt-v6-allpairs-scanner.cpp`).

Five runs, each archived: `serial-capture-20261019-sht-hunt-v{1..6}*.txt`.

### Measured findings

**FACT S1 — there are no pull-up resistors on GPIO8/9.** Forcing the internal ~45 kΩ
pull-down wins the tug-of-war (both read 0); driving an internal pull-up is the only thing
that makes them read 1. A real I²C bus on that pair would be held high from outside.
Consequence: earlier register-watch `SCL9`/`SDA8` values were the ESP32's own internal
pull-ups, not bus activity.

**FACT S2 — no I²C device ACKs on GPIO8/9 under valid bus conditions.** v4's bit-banged
scan supplied pull-ups explicitly, confirmed the bus idling `SDA=1 SCL=1`, and got
**126 NACKs, 0 timeouts**. Zero timeouts is the important part: the bus was electrically
clean, so this is a real "nothing there", not a stuck-bus artifact.

**FACT S3 — GPIO8 and GPIO9 are electrically coupled.** v5 tested every ordered pair with
a **control group**: 11/11 independent pairs correctly read "separate", so the method is
sound; 8↔9 read coupled in both directions with the pull-up bits *read back from the
IO_MUX register at the instant of the sense read*. If this is a real short, **an I²C bus
on GPIO8/9 can never work** regardless of the module — which alone would explain
"SHT never detected". Caveat: the hit counter logged 1 confirmation out of 2 attempts, so
it may be intermittent. **Needs an ohmmeter, not firmware — see below.**

**FACT S4 — no other coupling exists on the board.** The v5 full matrix (17 sensors ×
14 drivers) found *only* the 8↔9 pair. The mic lines 4/5/6 are **not** shorted to anything
in the safe set — relevant to the still-open Fact-3 "SD↔WS short" question, which this
**does not** confirm or refute (5/6 were sensors only, never driven).

### CORRECTION — the documented SHT pair cannot work, and no sensor is connected

I had been scanning GPIO8/9 because that is what `README.md` and the earlier entries here
say. **The authoritative pinout is `docs/wiring/mkwiring.py`** — it *generates*
`WIRING-diagram.png` and is the source both documents were derived from. Read properly, it
says two things:

```
line 30-33  SHT31 ambient (I2C):  VCC->3V3  GND->GND  SDA->GPIO8  SCL->GPIO9   addr 0x44
line 49-50  ALSO SAFE if you prefer:   mic: 15/16/17
                                       ambient: 1 / 2          <-- the ambient alternative
```

v7/v8 then used the **ESP32 hardware I²C peripheral** (`Wire`) rather than my hand-rolled
bit-bang, and recorded the **error code** from `endTransmission()` — which is what makes a
"0 devices" result interpretable at all: **0 = ACK, 2 = NACK (bus clocked fine, nobody
answered), 5 = bus busy (bus could not be acquired).**

| Pair | Idle, all internal pulls off | Error codes | Verdict |
|---|---|---|---|
| **1/2** | SDA=1 SCL=1, IE=1 WPU=0 WPD=0 | **8 NACK, 0 errors** | **working I²C bus, no device on it** |
| **2/1** | same | 8 NACK, 0 errors | working bus, no device |
| **12/13** | same | 8 NACK, 0 errors | working bus, no device |
| **13/12** | same | 8 NACK, 0 errors | working bus, no device |
| **8/9** (documented) | SDA=1 SCL=1 | **0 NACK, 8 errors — every address code 5 = BUS BUSY** | **bus cannot be acquired at all** |

Captures: `serial-capture-20261019-sht-hunt-v7-hw-I2C.txt`,
`...-v8-errorcodes.txt`, source `sht-hunt-v8-hw-I2C-scanner.cpp`.

**CORRECTION 1 — the SHT is not connected.** Across four working buses with clean NACKs,
**zero devices** answer. This agrees with this file's own 2026-10-14 note that the SHT was
**physically removed**: it was removed and never reinstalled. Nothing is wrong with the
sensor because there is no sensor present to be wrong.

**CORRECTION 2 — the documented pair GPIO8/9 is electrically unusable as I²C.** `Wire`
returns **BUS BUSY (code 5) on all 8 probe addresses and 0 NACKs** — it cannot even acquire
the bus. That is independently consistent with FACT S3 (the 8↔9 coupling) and FACT S1 (no
pull-ups). **Reinstalling the SHT on GPIO8/9 exactly as documented would fail.** This also
retroactively explains every "SHT never detected on GPIO8/9" line in this file — those
tests were pointed at a dead pair.

**CORRECTION 3 — use GPIO1/2, and the pull-ups are already there.** GPIO1/2 and GPIO12/13
are *verified working* buses that idle HIGH from **external** pull-ups (register shows
WPU=0/WPD=0, so it is not the ESP32 holding them up). They are already electrically ready
for an I²C sensor. **GPIO1/2 is precisely the "ALSO SAFE ... ambient: 1 / 2" option the
wiring diagram already lists** — so the fix is to move the SHT to pin 1/2 and correct
`mkwiring.py`, not to fight GPIO8/9.

**Correction to my own earlier work:** my first 8/9-only scans reported "no device on
8/9", which was true but useless — they tested a pair that cannot work, and did not check
anywhere else. The "182 safe ordered pin pairs" figure in FACT S5 was also over-stated; the
trustworthy coverage is the four working buses above.

### Two wrong readings, caught and discarded (kept so they are not repeated)

1. **v2's "lines stuck low" was a broken measurement.** `pinMode(pin, INPUT)` on this core
   leaves an internal pull-up enabled, which made the lines look externally pulled high;
   and the 2 ms release timeout was shorter than the real settle time. Both fixed by using
   `gpio_set_pull_mode(pin, GPIO_FLOATING)` and longer budgets.
2. **v6's 173 "ACKs" are artifacts, not devices.** Every hit is on `SDA=8` only, and the
   ACK test was `sda reads 0 -> ACK` — GPIO8 is a pin that can sit low, so it ACKs
   everything. A real device ACKs *one* address; v6 reported 15–16 scattered per pair. The
   pair `SDA=8 SCL=9` found nothing precisely because FACT S3 stops SCL rising, so every
   attempt timed out. **v6's `VERDICT: an I2C device IS present` line is wrong — do not
   cite it.** The honest result is: **no I²C device responds on any of the 182 safe
   ordered pin pairs.**

**FACT S5 — the "true float" level of the spare pins is NOT reproducible.** v4 measured
GPIO7/8/9/10/11 all LOW with internal pulls off; v6 measured GPIO7–13 all HIGH with the
same call sequence. These pins are high-impedance, so their level is residual charge and
must not be quoted as evidence either way. (v4's capacitance figures are also void:
`pullUp()` charges the line before the timing loop starts, so the microsecond values are
the tail of an already-completed rise.)

### Bug found and fixed in the diagnostic

`printOutMatrix()` in `sensor_usb_diagnostic.cpp` had **FUN_WPU and FUN_WPD swapped**
(bit 7 was labelled WPU, bit 8 labelled WPD). Isolated empirically:
`gpio_set_pull_mode(pin, PULLUP_ONLY)` sets **bit 8** and reads 1;
`PULLDOWN_ONLY` sets **bit 7** and reads 0. So on ESP32-S3 IO_MUX: **bit 7 = WPD,
bit 8 = WPU, bit 9 = IE.** Only the labels were wrong — `FUN_IE` (bit 9, the bit Fact 1
depends on) was always correct, and `shortProbe()`'s `REG_SET_BIT(IO_MUX_GPIO9_REG, 0x200)`
= bit 9 = IE was correct. Fixed 2026-10-19 with the proof in a code comment.

### State after this session

- Board **restored to the streaming build**: `pigpulse-mic-pcm16-20261013`, 717,024 bytes,
  hash verified. Diagnostic traces confirmed absent
  (`serial-capture-20261019-restore-verify.txt`).
- **Network path is now working**: `wifi:1 mqtt:1 tcp:1`, TCP at ~170–207 KB/s — the Pi AP
  came back up during this session. Earlier `wifi:0 mqtt:0 tcp:0` entries were the AP
  being down, not a firmware fault.
- Mic unchanged: `RMS24: 4194304 Peak24: 4194304 nz:100% -6.0 dBFS` — still constant.

### What is needed from Master

**The SHT is not installed** — that is the finding, and it matches this file's own
2026-10-14 note that it was physically removed. So the first question is simply: **do you
want it back on?**

If yes, the wiring decision is already made by measurement:

1. **Wire it to GPIO1/2** (SDA=1, SCL=2) — a verified working bus with external pull-ups
   already present, and the same choice `mkwiring.py` already lists as ALSO SAFE.
   **Do not use GPIO8/9** — `Wire` reports BUS BUSY there on every address.
2. **Correct the documentation**: `docs/wiring/mkwiring.py` lines 32 (SDA/SCL) and 50; then
   regenerate `WIRING-diagram.png` (`python3 mkwiring.py`). `README.md` §1 and this file's
   pin row follow from that. Leaving the docs at GPIO8/9 guarantees the next person repeats
   this whole investigation.
3. SHT31 default address **0x44** — my v8 scanner will confirm presence in one flash.

Optional, and now **diagnostic rather than blocking** — the GPIO8/9 fault itself, with the
board **unpowered** and a multimeter:

1. GPIO8 pad ↔ GPIO9 pad on the module: shorted? (would confirm FACT S3, which firmware
   could only infer)
2. If shorted, is it on the module pads or in the jumper wires?

Worth doing only because a shorted pair is a latent fault that could bite a future sensor —
not because it blocks the SHT.

---

## Standing rules (added 2026-10-14 at Master's request)

1. **Archive before you flash.** Copy the current working `.bin` + source into a
   dated `docs/known-good-YYYYMMDD/` folder and record its sha256 here.
2. **One change at a time**, each with a measured before/after line in this file.
3. **Never leave the board on a diagnostic build silently.** If the diagnostic
   firmware is flashed, note it here and restore the normal build when done.
4. **A known-good entry requires measured evidence**, not "it compiled" —
   a distinct-value/RMS reading from `/esp/stream` or the USB serial.
5. **Do not overwrite a known-good folder.** New good states get a new date.

### Post-flash result — 2026-11-13

Flashed OTA via `espota.py` (UDP 3232) with **no USB attached**; upload rc=0,
board back ~10 s later, firmware ID confirmed as
`pigpulse-mic-sht45-20261113-nowriteblock`.

| metric | before | after |
|---|---|---|
| longest `tcpStream.write()` — telemetry `wrms` | 10,003 ms | **3–4 ms** |
| writes over 100 ms — telemetry `wrn` | 84 | **0** |
| longest `mqtt.publish()` — telemetry `pubms` | 2 ms | 2 ms (unchanged) |
| bytes dropped by ring overflow — telemetry `txd` | 0 | **0** |
| TCP reconnects — telemetry `txr` | 3 | **1** (one, at the flash itself) |
| Pi received vs offered (60 s window) | 56 % | **98.8 %** |
| Pi received vs offered (5-minute soak) | — | **91.2 %** |
| 5 s silence-close stalls in the 5-minute soak | 7 | **0** |
| `hostapd` deassociations | 0 | 0 |
| sample rate — telemetry `sps` | 48,031 | 48,031 |

**Ground-truth PCM check** (the authoritative one): a 39.72 s capture of
`/esp/stream?format=raw48` was pulled off the Pi and analysed:

| check | result |
|---|---|
| exact-zero runs ≥ 5 ms (digital silence = a gap) | **0** |
| total digital silence | **0 ms (0.00 %)** |
| non-zero samples | 99.7 % |
| 20 ms block level p10 / median / p90 | −54.0 / −49.6 / −43.9 dBFS |
| blocks below −60 dBFS | 0.05 % |
| peak | 32,402 (no clipping) |

The byte-rate counters read 91–99 % because of bytes in flight in the socket;
the **decoded PCM itself has no gap at all**, which is what a listener hears.

Pi-side companion change: `ESP_SILENCE_CLOSE_S` 5.0 → 15.0 s in
`/home/pigpulse/thermal-pi/esp_audio_ingest.py` (backup
`esp_audio_ingest.py.bak-20261113-silence`), so a slow-but-alive link is not
declared dead while the ESP is still holding buffered audio.

**Current source on the board:**
`firmware/esp32s3-mic-ambient/arduino/esp32s3_telemetry-flashed-20261113/`.
