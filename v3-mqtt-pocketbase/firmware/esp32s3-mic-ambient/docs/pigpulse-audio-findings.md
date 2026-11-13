# Barn mic link — findings 2026-11-10/11

Written from the live rig, every number below is measured, not inferred.

## What was actually wrong with "the audio stream cuts"

Four separate faults, found one at a time. Only the last one was the real
radio problem; the first three were software and are now fixed.

### 1. The Pi's access point was sleeping (FIXED)

```
iw dev wlan0 get power_save   ->  Power save: on
dmesg: brcmf_cfg80211_set_power_mgmt: power save enabled
```

brcmfmac enables 802.11 power save on the AP interface at boot. A sleeping AP
stalls and drops client traffic on a timer, which is exactly the ~60 s drop
pattern we saw, and exactly why every ArduinoOTA upload died mid-transfer.

Fix: `pigpulse-ap-powersave.service` (enabled, `RemainAfterExit=yes`).
Proof: 0 ping drops in 36 consecutive checks over 6 minutes.

### 2. Ghost stations locked the AP out (FIXED)

brcmfmac kept a station entry alive after the client was gone:

```
Station 68:ee:8f:dd:31:3c (on wlan0)
    inactive time:  1000 ms      <- frozen
    rx bytes:       11412257     <- frozen
    connected time: 420 seconds  <- still climbing
```

While that entry existed the AP refused a fresh association, so the board
looped on `WL_CONNECT_FAILED` and never got an IP. `iw ... station del` does
NOT clear it (returns 0, entry stays) — it needs hostapd's own
`deauthenticate`, which is why `ctrl_interface=/var/run/hostapd` was added.

Fix: `pigpulse-ap-watchdog.timer` (30 s). Evicts a MAC only when its rx
counter is frozen for 45 s AND it fails to answer ICMP, so a live-but-idle
client is never kicked. It has fired twice and recovered both times.

### 3. The TCP stall watchdog was killing a healthy socket (FIXED — my bug)

The `tcpwd` build watched `tcpStream.availableForWrite() == 0` and dropped the
socket after 15 s. **`WiFiClient` does not override `availableForWrite()`** —
it inherits `Print::availableForWrite()`, whose whole body is `{ return 0; }`
(`framework-arduinoespressif32@3.20016.0/cores/esp32/Print.h:80`).

So the condition was permanently true and the watchdog killed a perfectly
healthy stream every 15 s. Measured: `tse=2425` stall events and a clean
15 s connect/disconnect cycle in the Pi's ingest log.

The replacement rule lives on the receiver, because only the receiver can know
bytes stopped arriving: the ESP's `write()` kept returning a full byte count
for an entire dead session (`txp=0`), so the sender can never detect "my
writes go nowhere". `esp_audio_ingest.py` now closes a socket that has been
silent for `ESP_SILENCE_CLOSE_S` (5 s), which sends the ESP a FIN; the ESP's
`tcp_flush()` then does `stop()` (closing the pcb properly) and reconnects.

### 4. The radio silently degraded to 6 MBit/s (FIXED — needs a watchdog)

Over ~10 h the brcmfmac radio degraded until the AP's rate to the barn mic
collapsed:

```
rx_rate_info=60      (6 MBit/s)   <- degraded
rx_rate_info=260..390             <- healthy (26-39 MBit/s)
```

While degraded, the audio still "worked" but delivered only ~40% of what the
board was writing. The board's own counters were clean the whole time
(`sps=47984`, `bps=95968`, `txd=0`) — it had handed every byte to the stack and
the air ate them. That is the "the audio stream cuts" symptom.

A full Pi reboot cleared it and delivery went straight back to 100%.

Fix: the watchdog now reads `rx_rate_info` every 30 s and restarts hostapd if
it stays below 100 for three consecutive checks, and it re-asserts
`power_save off` in case something turns it back on.

## Other changes made on the way

| Change | Why |
|---|---|
| Mono on the wire (S16LE, 1 ch, 48 kHz, 96,000 B/s) | The old firmware sent the SAME sample in both channels. Half the airtime carried zero extra information. The Pi duplicates mono back to stereo in `to_pcm()`, so the browser worklet, the cough classifier and the WAV recorder are untouched. |
| `WiFi.setTxPower` 8.5 -> 19.5 dBm | The AP was hearing the ESP at MCS 0-1 while the downlink ran at MCS 7. More TX power took the uplink from 1.0 to 26-39 MBit/s. |
| `tcpStream.stop()` before every reconnect | `connect()` on a client whose pcb is still open leaks the pcb. |
| Telemetry gained `sps`, `batch`, `bps`, `rssi`, `heap`, `txr` | Every future failure should be attributable to a layer without needing the USB cable (opening the serial port RESETS the chip). |
| `hostapd.service.d/10-stale-ctrl-socket.conf` | A failed hostapd start leaves `/var/run/hostapd/wlan0` behind; the next start then dies with "ctrl_iface exists and seems to be in use" and the AP never returns. This actually happened. |
| `lead_ms` in web_server uses `FRAME_BYTES` | The frame size is now 2 bytes, not a hardcoded 4. |

## Verified end state

```
30/30 samples connected over 6 minutes
rate 96,600 - 97,300 B/s  (offered 96,000 = 100%+)
lastMs 0-12 ms
watchdog events: 0
```

Thermal `NORMAL` centre 33.9 C, ambient 30.5 C. The FEVER/SUSPECT flag that
appears intermittently is the *relative* test (`delta_fever_c = 1.5`) firing on
a warm spot ~4.5 C above the frame median; the absolute floor (40 C) never
fires.

## Wireless flashing

`espota.py -i <ip> -p 3232 -a <password> -f <image>` over UDP 3232.
Proven 6 times today, including twice with the USB cable completely
unplugged. The board reboots, rejoins the AP within 10 s and reports its new
identity on the retained MQTT topic `pig/s3-mic-01/audio/fmt`.

## Known hardware limits

* The ESP's lwIP is built with `CONFIG_LWIP_TCP_WND_DEFAULT 5760` and
  `CONFIG_LWIP_TCP_SND_BUF_DEFAULT 5760`. Throughput ceiling is window/RTT
  (~120 KB/s at the measured 47.7 ms RTT). Mono at 96,000 B/s fits; the old
  stereo at 192,000 B/s never could.
* `SAMPLE_RATE 16000` does NOT work: with `use_appl = false` the I2S clock is
  inaccurate at 16 kHz (measured 19.6 kHz). 48 kHz is accurate (47,936).
* The MLX90640 still needs the SDA/SCL jumper reseat (pins 3/5, plus 1 and 6)
  for long-term stability. That needs physical access to the barn board.

---

## Mic level / gain stage (added 2026-11-11, afternoon)

### The problem
The mic was far too quiet to monitor. Measured at the browser (16 kHz mono,
the real consumer), from the deployed firmware:

```
peak = 992 / 32767 = -30.4 dBFS
rms  = 166 / 32767 = -45.9 dBFS
```

-46 dBFS RMS on a recording you are meant to listen to AND classify. There was
30.4 dB of headroom before clipping and nothing was using it.

### What was built
A digital gain stage in the ESP firmware, before the sample goes on the wire:

1. **Peak-targeting AGC.** A smoothed peak envelope with fast attack (a
   transient can never clip) and slow release (~0.3 s, so the gain does not
   pump). It aims the output PEAK at a target level.
2. **DC blocker / high-pass**, one pole at 40 Hz.
3. **Hard clamp** at the 16-bit rail, with the clipped-sample count reported so
   the stage can never silently eat transients.
4. **Runtime control over MQTT**, no reflash needed:
   ```
   mosquitto_pub -h 127.0.0.1 -t "pig/s3-mic-01/cmd/gain" -m "-6"
   ```
   The payload is the dBFS level the AGC aims the output peak at. Clamped to
   -24 .. -1 dBFS.

### Two bugs found in this stage (both caught by measuring, not by reading)

**A. The extraction shift.** An intermediate version took the top 24 bits of
the I2S word (`rawBuffer[i] >> 8`). That produced an ALL-POSITIVE output (0%
negative samples) - a rectified waveform that would have wrecked the cough
classifier. Reverting to the top 16 bits (`>> 16`, what the firmware always
used) gives a properly bipolar signal, confirmed on the board:
`smin=-271 smax=+319`.

**B. The fixed-point high-pass had a dead zone.** With R = 0.99478 in Q16:

```
(-99 * 65179) >> 16  ==  -99      <- a FIXED POINT
```

The filter only decays a sample by 0.5% per step, but the integer
multiply-and-shift rounds down, so any value below 65536/357 = 183 never
decreases. The filter added a permanent -91 to everything it passed and the
AGC amplified it. Simulated proof:

```
integer filter: source DC -99 -> output mean -91.3   (not removed)
float   filter: source DC -99 -> output mean  -0.1   (removed)
```

Fixed by keeping the two filter state values in FLOAT. The ESP32-S3 has an FPU
and this is 48,000 multiply-adds per second.

### Result (measured, native 48 kHz output)

| | before | after |
|---|---|---|
| peak | -30.4 dBFS | **-2.0 dBFS** (exactly the AGC target) |
| rms | -45.9 dBFS | **-15.2 dBFS** |
| DC | -0.4 | -6.2 |
| negative samples | 49.5% | **49.8%** |
| clipped | 0 | **0** |
| browser (16 kHz) rms | -45.9 dBFS | **-15.9 dBFS** |

**+30.0 dB at the browser, +30.7 dB on the wire.** The stream stayed at 100%
delivery (96,188 B/s of 96,000 offered) with zero drops and zero reconnects.

### Telemetry added so this stays explainable
`gain` (dB x10), `opk` (output peak), `clip` (clipped samples), `dc`,
`omin`/`omax` (output min/max - the sign check), `smin`/`smax` (source
min/max), plus the earlier `sps`/`batch`/`bps`/`rssi`/`heap`/`txr`.

### What the mic is actually hearing right now
The board is on a desk next to a laptop, not in a barn. The spectrum is
dominated by low frequency (25-200 Hz) with a ~1050 Hz tone. The AGC amplifies
whatever is loudest, so in the barn it will amplify pig sound - and on the desk
it amplifies desk noise. That is expected behaviour for a gain stage, not a
fault.

---

## THE REAL "the audio cuts" bug (found 2026-11-11, late afternoon)

**Symptom:** the audio was not a continuous stream. It cut out.

**Root cause — it was never the radio.** The telemetry arrived every **2 seconds**
instead of every 1:

```
09:13:14.71  16.70  17.71  19.71  21.70 ...
```

and the audio rate oscillated with it:

```
sps: 48810 / 16200 / 51352 / 16136 / 17973 ...
```

(48k is the ceiling; the low values are a 2 s window containing 1 s of samples —
the audio gap.)

**Why:** `PubSubClient`'s socket timeout is in **SECONDS**
(`MQTT_SOCKET_TIMEOUT`), so `mqtt.publish()` / `mqtt.loop()` / `mqtt.connect()`
can each block for a **full second**. Those calls were running **inside the
audio loop**, so every second of telemetry stalled the audio for a second.

**Fix:** MQTT, telemetry, the OTA handler and the retained-format publish moved
into their own FreeRTOS task behind a mutex. The audio path now touches
**nothing that can block** — only the TCP audio socket.

Also hardened at the same time:
- `Serial.setTxTimeoutMs(0)` — the USB TX buffer made every `Serial.printf`
  block for 250 ms when the cable was plugged in and nothing was reading.
- `wifiClient.setTimeout(100)` — the same socket is used for the OTA session.
- The serial status line is rate-limited to every 5 s.
- **Peer heartbeat:** the Pi sends one byte every 2 s on the audio socket. The
  ESP reads them and drops the socket if they stop for 8 s. This closes the
  half-open case that Linux's 1 MB receive window used to hide: the ESP's
  `write()` kept succeeding while nothing arrived, so the ESP could never tell
  its socket was dead.

**Result:** 30/30 samples connected over 10 minutes, sustained **96,665-97,280
B/s** (= 100%+ of the 96,000 offered), `lastMs` 0-13 ms, zero disconnects.

### Everything that was blamed on the radio was actually this

The "radio degraded to 6 MBit/s" and "only 40% of the frames arriving" were
the **audio loop stalling**, not the radio: when the loop stalls, the ESP
produces no bytes, so the AP sees fewer bytes. A Pi reboot "fixed" it because
the USB TX buffer starts empty and takes ~20 s to fill.

---

## The level stage MOVED TO THE PI

Levelling is post-processing, so it belongs on the machine with the CPU, not
on the radio link. The ESP now sends the signal **exactly as captured** (unity
gain) and the Pi applies the level:

- `esp_audio_ingest.py` runs a numpy peak-targeting AGC (fast attack, slow
  release) on the mono stream **once**, before fan-out, so the browser, the
  cough classifier and the WAV recorder all get the same levelled signal.
- Cost: **0.03 ms per 8 KB chunk = 0.2% of one core.**
- `ESP_AUDIO_TARGET_DBFS = -3.0` (target peak), `ESP_AUDIO_MAX_GAIN = 64`
  (36 dB ceiling, so a silent barn cannot turn mic self-noise into full-scale
  hiss).

**Measured:** browser stream went from **-45.9 dBFS RMS to -14.1 dBFS**
(+31.8 dB), peak -2.9 dBFS, DC -8.6, 49.8% negative samples, **0 clipped**.

The cough classifier does NOT over-trigger with the louder signal: its score
stayed at `mean_p=0.0054` against a threshold of 0.2061 (verdict LOW).

---

## Volume controls in the UI

- `mic.js` gained `setVolume` / `volume` / `setMaxVolume`, and a
  **DynamicsCompressor limiter** after the gain node (threshold 0 dBFS, ratio
  20:1, 3 ms attack) so that pushing past unity is loud rather than clipped.
- The dashboard mic card and the **Barn mic studio** (`/static/fusion.html`)
  both got a **0-300% slider**, a **🔊 SOUND ON / 🔇 MUTED** toggle and a
  **MAX VOLUME** button. The value is kept in `localStorage`.

---

## FINAL STATE (2026-11-11)

### The four bugs behind "the audio cuts"

1. **PubSubClient busy-wait.** `readByte()` spins for `socketTimeout` SECONDS
   when the socket is idle, and `loop()` calls it unconditionally. With
   `setSocketTimeout(1)` every `mqtt.loop()` froze the firmware for a second.
   Fixed by moving MQTT/OTA into their own FreeRTOS task, and by using
   `setSocketTimeout(1)` only for the connect handshake and `0` afterwards.

2. **The heartbeat byte corrupted the PCM.** I added a 1-byte heartbeat to the
   audio socket to detect a half-open socket. The audio is 16-bit, so a
   ONE-byte write permanently shifts every sample after it:
   `clean [100,-100,200,-200]` -> `dirty [100,-100,-14336,14336]`.
   That is what the "peak at 32,700" measurements were: misaligned samples,
   not signal. The heartbeat is gone. The socket carries audio and nothing else.

3. **The AGC lived in the ESP.** Moved to the Pi (`esp_audio_ingest.py` +
   `web_server.py`), where levelling is post-processing and belongs. The
   cough classifier asks for `?raw=1` because its threshold (0.2061) was
   calibrated on the unboosted signal - with +32 dB it went from LOW to HIGH
   (25% of windows over threshold), pure false positives.

4. **The browser was pulling 192 KB/s** (48 kHz stereo) over an AP also
   carrying 1080p CCTV, into a worklet with only 170 ms of buffer. Now
   16 kHz stereo (64 KB/s) with a 500 ms rate-aware pre-roll.

Plus: `Serial.setTxTimeoutMs(0)` (a full USB TX buffer stalled every print
for 250 ms), and the fixed-point DC blocker that had a dead zone at +-183
(its integer multiply-and-shift rounds down, so any value below that never
decayed - it added a permanent -91 to the signal).

### Measured end state

```
ESP -> Pi        96,665 - 97,484 B/s   (= 100%+ of the 96,000 offered)
Pi -> phone      16 kHz stereo = 64 KB/s (was 192 KB/s)
browser          0 buffer underruns over 60 s (worklet path)
ESP disconnects  1 in 25 min (was one every 14-23 s)
classifier       cough=0 rate=0.0% verdict=LOW mean_p=0.0117
```

The dashboard now SHOWS the underrun counter and the volume next to the mic
card, so "it sounds like it is buffering" can be checked instead of guessed.

### Volume controls

`mic.js`: `setVolume` / `volume` / `setMaxVolume` plus a
`DynamicsCompressor` limiter after the gain node (threshold 0 dBFS, ratio
20:1, 3 ms attack) so pushing past unity is loud rather than clipped.
Both the dashboard and the Barn mic studio have a 0-300% slider, a mute
toggle and a MAX button, persisted in `localStorage`.

Bug found and fixed while testing: the slider passed a PERCENTAGE to a
function expecting a MULTIPLIER, so dragging it down made it LOUDER
(everything was clamped to the maximum).

---

## Volume controls + maximum level (2026-11-11, afternoon)

### Where the level now lives
The AGC is on the **Pi** (`esp_audio_ingest.py`), not the ESP. Levelling is
post-processing and belongs where the CPU is free and the radio airtime is not.
The ESP sends the signal exactly as captured; the firmware's own gain stage was
removed (firmware ID `...-pilevel`).

The ingest owns the whole format pipeline and builds every output format ONCE
per chunk, in numpy, then hands out finished bytes:

```
ESP mono 48k -> DC block -> AGC -> stereo 48k -> 127-tap resample -> stereo 16k
                       -> raw stereo 48k (for the cough classifier)
```

* `?format=48`    leveled stereo 48 kHz
* `?format=16`    leveled stereo 16 kHz  (64 KB/s, for the phone)
* `?format=raw48` raw stereo 48 kHz      (the classifier's calibrated input)

Cost: **0.30 ms per chunk = 1.4% of one core**, replacing work that used to be
done once per subscriber, inside the web server's request threads, partly in
pure Python under the GIL.

### The browser
`mic.js` gained `setVolume` / `volume` / `setMaxVolume` and a
**DynamicsCompressor limiter** after the gain node (threshold 0 dBFS, ratio
20:1, 3 ms attack) so that pushing past unity is loud rather than clipped.
Both the dashboard mic card and the Barn mic studio (`/static/fusion.html`)
have a **0-300% slider**, a **🔊/🔇 mute toggle** and a **MAX VOLUME** button,
persisted in `localStorage`.

Bug found and fixed while testing: the slider passed a PERCENTAGE to a function
expecting a MULTIPLIER, so dragging it DOWN made it LOUDER (everything was
clamped to the maximum).

### Measured result
```
browser 16 kHz stereo : peak -0.8 dBFS   rms -13.5 dBFS
vs the original level : +32.5 dB
buffer underruns      : 0 (worklet path, 60 s)
Pi -> phone rate      : 96,307 B/s = 100% of offered
```

### What is STILL causing the pauses (not software)
The remaining stalls are **WiFi drops on the ESP**, not the audio path:

```
hostapd deauth/disassoc for the ESP : 54 in 60 min
ingest "no audio for 5s"           : 16 in 60 min
ESP uplink (AP sees it)   : rx_rate_info=390  (39 Mbit/s)
camera uplink (AP sees it): rx_rate_info=722  (72.2 Mbit/s)
```

The camera on the same AP, one metre away, holds MCS 7. The ESP only reaches
MCS 1 and drops. The ESP is already at its maximum TX power (19.5 dBm) and the
AP is at 31 dBm, so the remaining variable is the **ESP board's antenna and
its supply** - it is USB-powered, and a sagging 3.3 V rail would reduce its
transmit power exactly like this.

**⇒ PHYSICAL CHECK NEEDED:** what is the ESP32-S3 board powered from now that
the laptop USB is unplugged? A weak or shared supply would explain the drops.

---

## 2026-11-13 — THE "WEIRD PAUSE" ROOT CAUSE: a 10-SECOND WRITE TRAP

### Symptom
Audio cut out for several seconds at a time, repeatedly, on the dashboard and
the phone. Two candidate causes had been on the table: the phone's
ScriptProcessor fallback being suspended on screen lock, and the v3 app's
schedule-ahead scheduler (`MAX_LEAD_MS = MAX_LAG_MS + 5000 = 13,000 ms`).

Both are real, but **neither was the main fault.** The main fault was on the
ESP and it was measurable.

### How it was found
Instrumented the firmware with blocking-time counters (`pubms`/`pubn` for
`mqtt.publish()`, `wrms`/`wrn` for `tcpStream.write()`), flashed that probe
build over the air, and read them off the live telemetry.

First reading:

```
pubms = 2 ms     pubn = 0     <- MQTT never blocked
wrms  = 1211 ms  wrn  = 1     <- the AUDIO write blocked
```

Round 2 of the same instrumentation, after the first fix, showed the real
number:

```
wrms = 10,003 ms
```

**10,003 ms.** That is not a coincidence — it is a constant in the Arduino core:

```c
// libraries/Network/src/NetworkClient.cpp
#define WIFI_CLIENT_MAX_WRITE_RETRY     (10)
#define WIFI_CLIENT_SELECT_TIMEOUT_US   (1000000)   /* 1 second */
```

`NetworkClient::write()` wraps `send()` in `while (retry) { select(1 s); ... }`.
When the socket's send queue is full, one `write()` call blocks for
**10 x 1 s = 10 seconds**.

The socket's TCP send buffer is `CONFIG_LWIP_TCP_SND_BUF_DEFAULT = 5760` bytes
= **59 ms of slack** at the stream's 96,000 B/s. Any WiFi hiccup longer than
that fills it, the write parks for 10 s, the Pi sees 5 s of silence, closes the
socket, and the ESP reconnects. Then it happens again.

Ruled out along the way, with measurements:

* **Not a reboot.** `boots = 1`, `rr = 1` (power-on) constant across the stalls.
* **Not a WiFi drop.** `hostapd` deassociations in the stall window: **0**.
* **Not brownout.** `br = 0` (the brownout detector never fired).
* **Not MQTT.** `pubms` = 2 ms, `pubn` = 0.
* **Not the radio.** `rssi` -44 to -58 dB throughout.

### The fix (on the board now)
`tcp_send_nowait()` — `send()` called directly with `MSG_DONTWAIT`, bypassing
the select()+retry loop. A full queue returns `EAGAIN` immediately; the bytes
stay in the 64 KB ring buffer (`TX_BUF_SZ`, 680 ms of audio) and are retried
on the next loop iteration.

Plus, from round 1: the socket is **never destroyed** because of a full send
buffer (the old code called `tcpStream.stop()` while printing
`"[tcp] stalled; buffer retained"` — the message lied), and the ring grew from
32 KB to 64 KB.

Plus, on the Pi: `ESP_SILENCE_CLOSE_S` 5.0 -> 15.0 s, so a slow-but-alive link
is not declared dead while the ESP is still holding buffered audio.

### Measured after the fix

| metric | before | after |
|---|---|---|
| longest `tcpStream.write()` (`wrms`) | 10,003 ms | **3-4 ms** |
| writes over 100 ms (`wrn`) | 84 | **0** |
| Pi received vs offered | 56 % | **91-99 %** |
| 5 s stalls in a 5-minute soak | 7 | **0** |
| bytes dropped (`txd`) | — | **0** |
| exact-zero gaps in 39.7 s of raw 48 kHz PCM | — | **0** |

Firmware: `pigpulse-mic-sht45-20261113-nowriteblock`, flashed OTA with no USB
attached. Source archived at
`firmware/esp32s3-mic-ambient/arduino/esp32s3_telemetry-flashed-20261113/`
and `firmware/esp32s3-mic-ambient/docs/known-good-20261113/`.

### A regression to remember
An intermediate build was flashed from a **stale copy** of the source that had
the 2026-11-12 telemetry trailing-comma fix reverted (`"txp":%ld,` instead of
`"txp":%ld`) — the exact defect the 2026-11-12 entry documents. The live
payload was invalid JSON (`..."txp":78}`) and every consumer dropped it. It was
caught, reverted, and the archive is now built from the jsonfix source. The
lesson: **always diff against the newest archive before flashing, never against
a copy you happen to have open.**

---

## 2026-11-13 — v3 app: the schedule-ahead player becomes an AudioWorklet

### What changed

| File | Change |
|---|---|
| `v3-mqtt-pocketbase/frontend/mobile_app/public/pcm-worklet.js` | **NEW** — the AudioWorklet processor |
| `v3-mqtt-pocketbase/frontend/mobile_app/src/utils/pcm-stream.ts` | rewritten: the worklet path plus a faithful ScriptProcessor fallback |

The old player scheduled one `AudioBufferSourceNode` per chunk and started it
at a future time, so that the sound would land together with the frame
showing the same moment. Every scheduling decision and every byte went
through the **main thread**. The new player fetches on the main thread and
posts each block — with the time it must be heard — to a worklet that owns
the rendering.

`public/` is copied to the root of the web export, so the module ships as
`/pcm-worklet.js` next to `index.html`. Verified: `npx expo export -p web`
produces `dist/pcm-worklet.js` (5,309 bytes).

The `ScriptProcessorNode` path is kept as a fallback for browsers without
AudioWorklet (a plain-HTTP LAN origin is **not** a secure context and does not
expose the worklet API). It is reported through the new `onMode` callback and
in the state detail, because it is the degraded path.

### Verified

* `npx tsc --noEmit --skipLibCheck` — clean
* `npx eslint src/utils/pcm-stream.ts src/components/LiveThermalPanel.tsx` — clean
* `npx expo export -p web` — exit 0, worklet published
* Headless-Chromium harness against the **real Pi stream**
  (`/esp/stream?format=16`), 44.1 kHz context:
  * the worklet loads and renders — 0 underruns, 740,864 output frames
  * worst silence after the first audible sample: **4.3 ms**
  * the 16 kHz -> 44.1 kHz resample preserves the tone (measured 439.2 Hz for
    a 440 Hz input in the unit harness)

### Unit harness (headless)

`public/pcm-worklet.js` was evaluated with the AudioWorkletGlobalScope
stubbed out, so the exact file that ships is what gets tested: 8/8 checks —
scheduled silence before `playAt`, tone rendered after it, resampled frequency
preserved, mono mixdown identical on both output channels, `flush()` drops
pending audio, an empty queue is counted as an underrun, `config` accepted, and
a single-channel input is not halved.

### The measured finding — the pause is NOT the renderer

A main-thread stall of 2.5 s was injected while the audio played, and the
signal was measured by a **silence detector that runs on the audio thread**
(so a blocked main thread cannot blind it). Both players behaved the same:

| player | longest silence after the audio started | where |
|---|---|---|
| AudioWorklet (new) | 2,480 ms | t = 11.88 s |
| ScriptProcessor (old) | 2,455 ms | t = 11.92 s |

The stall ran from t = 8 s to t = 10.5 s. **Neither player went quiet during
the stall** — the renderer kept producing audio (the worklet from its parked
queue; Chrome runs the ScriptProcessor callback off the main thread as well).
The hole appears *after* the stall, at t ≈ 11.9 s, and it is exactly the
stall length.

The instrumented worklet shows why. During the stall it kept 251 blocks
queued, the head playing on time (`headPlayAt` tracking `currentTime` within
1 ms, `clockFrozen = 0`). After the stall the queue's head jumped forward:
`headPlayAt = 14.4 s` while the clock read 12.8 s.

**So the hole is created by the SCHEDULER, not the renderer.** The schedule is
`startAt = max(ctx.currentTime + lead, nextFree)`: after a stall the wall clock
has jumped forward, so the next block is re-anchored to a *fresh* full lead and
the audio between `nextFree` and the new `startAt` is never scheduled. The
picture jumps by the same amount (the app skips to the freshest frame that is
old enough), so audio and picture stay consistent — but the listener hears
dead air for the length of the stall.

### What the worklet does buy

1. **Rendering off the main thread.** The renderer is no longer a
   main-thread task, so a busy or throttled main thread cannot interrupt it.
2. **No per-chunk node allocation.** The old path created an `AudioBuffer`,
   a `BufferSourceNode`, a connection and a `start()` call for every chunk —
   60+ per second, all on the main thread, all garbage. Now it is one
   `postMessage` per chunk.
3. **No schedule-ahead ceiling.** The old `MAX_LEAD_MS = MAX_LAG_MS + 5000`
   (13 s) clamped the lead, which forced early playback when the lead was
   longer. The worklet parks the audio that is waiting for its turn, so the
   lead is bounded by memory (`MAX_LEAD_MS = MAX_LAG_MS * 4`) instead. A lead
   beyond even that is treated as a strike and re-anchors, exactly like a late
   block — the sound is never played early, out of step with the picture.
4. **A supported API instead of a deprecated one** (Chrome logs
   *"The ScriptProcessorNode is deprecated"* on the fallback path).
5. **Real counters.** `underruns`, `gaps`, `pending` and rendered `frames`
   come back from the worklet instead of being guessed at.

### Open item — the scheduler hole

Closing the post-stall hole is a **scheduling** change, not a rendering one,
and it is a trade-off the app owner should choose:

* **drop and catch up** — skip the audio the picture also skipped, so the
  sound stays aligned with the image but a jump is heard;
* **play it through** — keep the audio continuous and let it run a few
  seconds ahead of the picture.

This change did **not** alter the alignment model: `pcm-stream.ts` still
refuses to play audio that is not aligned to the shared PiClock lag. The
hole therefore persists for the length of a main-thread stall, exactly as
before. On a phone with the screen on, nothing stalls the main thread for
seconds; the stall that matters on a phone is the screen lock, which freezes
the whole page — picture included.

---

## 2026-11-13 — v3 app: LIVE is continuous, CAPTURE stays synced

### The rule the operator set

> for the live [continuous] yes, but when we capture specific frames when a
> detection happens it should all be synced — but the live doesn't need to be
> synced, as long as it is communicated what is happening and how behind

That splits cleanly, because the two paths are **different mechanisms**:

| path | mechanism | sync |
|---|---|---|
| **LIVE** | the never-ending PCM stream (`/esp/stream`) played by `pcm-stream.ts` | continuity first; the lag is REPORTED |
| **CAPTURE** | point-in-time fetches: `/cctv` (JPEG with `X-Frame-Ts`) and `/esp/record?seconds=N` (WAV) | already synced by construction — each artefact carries its own Pi-clock stamp, and the capture code was NOT touched |

### What changed in the player

`pcm-stream.ts` gained a `sync` option:

* `'live'` (default) — **continuity first.** The sound follows its OWN
  timeline (`startAt = nextFree`) instead of being re-anchored to a fresh
  `now + lead` after every block. A late block is never dropped and lateness
  never triggers a re-anchor. If the drift behind live grows past twice the
  clock's lag ceiling, the backlog is skipped and the sound jumps to the live
  edge (`active.flush()` + re-anchor) — the listener hears a skip, not dead
  air.
* `'aligned'` — the previous strict behaviour, kept for any playback that
  must line up with the picture.

**Communication of the lag** (the "what is happening and how behind" part):
the state detail now reads

```
3.2 s behind live · picture 4.0 s behind live (AudioWorklet)
```

and it is refreshed every 2 s while live. A new `onLag(lagMs)` callback
carries the same number for any UI that wants it.

### Measured — the dead air is gone

Headless Chromium, the real Pi stream, a 2.5 s main-thread stall injected at
t = 8 s, measured by a silence detector running on the audio thread:

| schedule | longest silence after the audio started | where |
|---|---|---|
| old (re-anchor to a fresh lead) | **2,482 ms** | t = 11.93 s |
| **new live (own timeline)** | **0.045 ms** | t = 5.72 s |

The instrumented worklet confirms the mechanism. Old schedule: the head
jumped from `playAt = 6.44` to `playAt = 14.41` while the clock read 12.85 —
the schedule had been re-anchored forward and the audio in between was never
scheduled. New schedule: `headPlayAt = 12.82` at `t = 12.84` — the head
tracks the clock, the queue drains at 1x, and the sound is simply a little
further behind live afterwards, which is what the UI now reports.

`underruns = 0` in both.

### Deployed

`https://pig-health-monitor.vercel.app` — landing at `/`, Expo dashboard at
`/app/tabs`, worklet at `/app/pcm-worklet.js` (5,309 bytes).

Deployed through `scripts/deploy-landing.sh`, which stages the landing page
plus the Expo export under `app/` into the ONE `pig-health-monitor` Vercel
project and refuses to publish a bundle that still carries `admin123` or the
dev URLs. (`npx vercel --prod` from `frontend/mobile_app` would have replaced
the production landing page with the bare app — `mobile_app` has no Vercel
project binding, and `scripts/deploy.sh` is disabled for exactly that reason.)
