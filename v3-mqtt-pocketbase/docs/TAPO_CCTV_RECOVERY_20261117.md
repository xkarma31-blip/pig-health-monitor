# Tapo / CCTV toggle, SD-format recovery, and audio-without-Tapo guide

**Date:** 2026-11-17 · **Status:** authoritative grounded guide from measured evidence + official vendor docs. The app's mode switch is session-only; persistence is a later slice.

---

## 1. Current measured state (do not skip)

- `[M]` `pigpulse-cctv.service` is **active**, but journal repeats: `CCTV: no camera answering on any candidate, retrying…`.
- `[M]` No Tapo camera lease in `dnsmasq.leases`; only laptop `192.168.69.30` and phone `192.168.69.91`.
- `[M]` No Tapo MAC in `iw dev wlan0 station dump`.
- `[M]` TCP:554 probes failed; `curl http://127.0.0.1:8091/?snapshot=1` returned 0 bytes after 8 s.
- `[M]` Frames are held in an in-memory deque; **no on-disk snapshot exists**.
- `[S]` The exact “format SD card according to guidelines” phrase is absent from the repo.

**Implication:** the “diabolical” captured frame cannot be accepted as a current successful camera capture. Treat any visible frame as stale/cached or from another source until a fresh RTSP frame is proven.

---

## 2. Product position: Tapo app dependence

**Good:** normal streaming does **not** need the Tapo app. TP-Link FAQ 4465 states: “Most Tapo cameras, except for battery-powered models, support the RTSP and ONVIF (Profile S) protocols” and “The standard RTSP stream URLs are rtsp://[IP Address]/stream1 (high quality) and rtsp://[IP Address]/stream2 (low quality).”

**Limited but acceptable:** the Tapo app may be needed for **provisioning** only — camera account, Wi-Fi credentials, microphone gain, SD card status. TP-Link FAQ 4465 says: “Ensure Tapo Camera is set up and the Camera Account is enabled.” That is setup, not daily viewing.

**Not acceptable:** requiring the Tapo app for routine health checks, toggling video/audio, or understanding a startup warning. Those belong in PigPulse.

**Vendor constraint:** “Only two of these three options can run at once: Tapo Care, SD card recording, and NVR/NAS/ONVIF software.” Our RTSP ingest + SD recording is a supported pair; Tapo Care must be off.

---

## 3. CCTV toggle design (session control implemented 2026-11-17)

| Mode | Intended behavior | Current feasibility |
|---|---|---|
| `OFF` | Stop snapshot polling in the app; UI states “CCTV OFF”. | Implemented as a session-only app mode. |
| `VIDEO` | Direct RTSP video → MJPEG proxy; UI shows LIVE/OFFLINE and never renders a stale frame as live. | Implemented in the app; Pi service remains the transport. |
| `VIDEO+AUDIO` | Direct RTSP video + camera audio from the Pi's `/camera-audio` endpoint. | App mode implemented; audio is enabled only when a recent camera frame proves reachability. Persistence and `audio_events` scoring remain later work. |
| `SD_RECORDING` | Operator-visible status of camera-local recording, with warning when ONVIF/RTSP conflicts. | Vendor-side; can only surface status, not replace vendor setup. |

Rules:

1. Never show a stale frame as live. Show `last successful frame age` and fail closed.
2. Never imply the camera speaker/two-way talk is part of ONVIF; “ONVIF Profile S does not support two-way audio.”
3. Never trigger SD formatting automatically. Formatting is destructive: “Formatting ensures compatibility but will erase all existing data, so be sure to back up important files in advance.”

---

## 4. Non-destructive recovery checklist

1. **Physical/power check.** Confirm camera has power and is within PigPulse 2.4 GHz coverage. The AP is on `wlan0`, channel 6.
2. **Association check on the Pi.**
   - `iw dev wlan0 station dump | grep -i <camera-mac>`
   - `cat /var/lib/misc/dnsmasq.leases | grep -i <camera-mac>`
   - If absent, re-run provisioning; do not change Pi radio roles.
3. **RTSP check from the Pi.**
   - Use the camera account from `/etc/pigpulse/cctv.env`; do not print it.
   - `ffprobe -v error -rtsp_transport tcp -show_entries stream=codec_name,codec_type -of csv=p=0 rtsp://<host>:554/stream1`
   - Expect at least one video stream; audio presence depends on camera config.
4. **Service check.**
   - `journalctl -u pigpulse-cctv -n 100 --no-pager`
   - Look for RTSP auth failure, timeout, or “no camera answering.”
5. **Frame proof.**
   - Request the MJPEG snapshot endpoint and require non-zero bytes plus valid JPEG magic (`ff d8 ff`).
   - Record dimensions and timestamp; only then call it a fresh frame.
6. **SD warning handling.**
   - Treat the warning as a camera/vendor-side status, not a PigPulse error.
   - Back up any footage first. Format **only** after backup and only if the vendor flow explicitly requires it.
   - After format/provisioning, re-enable the camera account and RTSP/ONVIF; confirm the “two of three” constraint.
7. **Audio enablement.**
   - In the Tapo app, enable camera microphone / adjust gain if RTSP reports no audio.
   - PigPulse currently ignores RTSP audio. Adding it is a separate implementation slice.

---

## 5. Using CCTV audio without the Tapo app at runtime

- Source: AAC track inside RTSP `stream1` (if enabled). Extract with ffmpeg; do not depend on Tapo cloud.
- Runtime control: PigPulse toggle should show `audio present / absent`, mute, and last audio time.
- Setup dependency: Tapo app may still be needed once to enable the camera account/microphone. Document this honestly.
- Attribution: a single camera microphone cannot reliably identify which pig coughed. TP-Link’s speaker audio is also filtered from recordings to prevent feedback; do not design talk-through as a data source.
- For individual attribution, the sourced path is microphone arrays or audio-visual localization, not this single mic.

---

## 6. Acceptance criteria for a future fix

- [ ] Camera MAC appears in AP association and DHCP lease.
- [ ] `ffprobe` shows RTSP video; audio presence is explicitly reported, not assumed.
- [ ] MJPEG snapshot returns non-zero valid JPEG with recorded dimensions and timestamp.
- [ ] UI shows live/stale/offline with last-frame age.
- [ ] SD-format action is behind backup confirmation and is never automatic.
- [ ] Tapo app is required only for documented provisioning steps.
