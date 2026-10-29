# PigPulse Admin: staged implementation and verification

Status: resumed; not deployed or acceptance-tested.

## Guardrails

- Preserve existing thermal-pi paths and service names. Rebrand the interface,
  not the deployed directory tree. Reuse existing static/admin pages.
- Keep current HTTPS MJPEG route available. Do not expose go2rtc management API.
- Audio starts muted on load and reconnect. Explicit Listen action, low initial
  volume, independent CCTV/ESP volume, and Mute all. Never automatically unmute
  hardware playback tests. Browser volume does not change recorded samples.
- No AI capacity promise until the intended cough model is measured.
- No camera-to-screen latency claim from FPS, request timing, or RTP arrival.

## Current measured checkpoint

Resume SSH readout: RAM total 3795 MiB, available 3295 MiB, swap used 0 MiB.
Thermal valid, 1.96 FPS, frame age 0.8s, MQTT connected. Thermal and CCTV
services active; RTC trial inactive. ESP mic disconnected, bindError=None.
Service-active does not prove CCTV frames or audio playback.
Previous WebRTC playback evidence and corrected intentional camera power
interruption are in WEBRTC_TRIAL_20261017.md. No new playback test at resume.

## Work sequence

1. Map existing static/admin pages, web_server routes and deployed file hashes.
   Preserve pre-existing edits; do not overwrite live files from a divergent copy.
2. Add isolated viewer and read-only, allowlisted signaling. Enforce request
   size/time limits; reject management/config endpoints. Test negative routes.
3. Add audio controls and tests for initial mute, reconnect mute, volume range,
   source separation and teardown. Keep microphone capture permissions absent.
4. Test one then two viewers: frames decoded increase, audio tracks present,
   paused/muted state truthful; fallback delivers changing JPEGs concurrently.
5. Measure whole-service CPU deltas and memory (including child FFmpeg), system
   available RAM, swap, task counts, and thermal freshness before/during/after.
   Separate lifetime ps averages from interval measurements.
6. Exercise viewer close, camera power interruption and relay failure with
   explicit operator coordination. Record recovery times and error messages.
7. Promote only after checks pass; document exact backup and rollback commands.

## Debugging evidence requirements

Every test records host, timestamp plus monotonic duration, code/version hash,
viewer count, source (real/mock), expected result, observed result and limits.
Do not save camera credentials, raw admin API responses, or private recordings
in version control. Distinguish offline, stale, connected and actively playing.
Independent reviewer requested on Nemotron; delegation has not succeeded.

### Follow-up inventory and measurement

Live web_server.py SHA256 at inspection:
417cb58bd87cc60ea0ff61c520169d56edc0fb852c3610913566cb83d2993aba.
Existing deployed static/admin contains index, sensors, system, diagnostics,
data and code pages plus console.js and console.css. Extend these, not a
second application. Local web_server.py routes /admin separately and serves
flat /static files; no do_POST handler found in that inspection.

Two systemd CPU counters separated by a requested 10-second sleep:
CCTV 636975721000 -> 642252589000 ns (5.276868 CPU seconds);
thermal 264240868000 -> 265186763000 ns (0.945895 CPU seconds).
These include service children, but the precise elapsed interval was not
captured, so do not treat division by 10 as an exact utilization benchmark.
Tasks stayed 25/4, NRestarts=0; available RAM 3306 MiB, swap used 0.
MemoryCurrent returned [not set] for both services: whole-service memory
accounting is unavailable in this readout, NOT zero. A future sampler must
report unknown or collect cgroup process RSS with its shared-page caveat.

## Acceptance still open

- Safe viewer endpoint and audio controls implemented and browser-tested.
- Simultaneous WebRTC/MJPEG and thermal verification, sustained resource test.
- Physical A/V alignment and glass-to-glass delay test with operator assistance.
- Protected admin write actions reviewed separately; no generic shell endpoint.
