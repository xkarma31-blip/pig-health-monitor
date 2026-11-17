# Tapo / CCTV recovery and audio guide

## Current measured state

- `pigpulse-cctv.service` is active, but the camera is offline: journal repeats `no camera answering on any candidate`.
- No fresh frame is stored; the app must not show a stale frame as live.
- The “format SD card according to guidelines” warning is vendor/camera-side, not PigPulse code.

## What the official docs say

TP-Link FAQ 2680 states: “The Tapo RTSP stream URL uses the format `rtsp://username:password@IP Address/stream1` ...”. It also states: “You must create a camera account in the Tapo app before connecting to any third-party platform.” So the Tapo app is needed for setup, not daily viewing.

FAQ 4465 states: “Only two of these three options can run at once: Tapo Care, SD card recording, and NVR/NAS/ONVIF software.” Keep **SD + RTSP/NVR**, turn Tapo Care off.

## SD-format warning: safe procedure

1. Do **not** format just to silence the warning.
2. Back up any footage first. Tapo community guidance says formatting “will result in a complete loss of the data on the Card.”
3. In the Tapo app: Device Settings → Storage and Recording → microSD Card → check status.
4. If the app reports FAT32/error, format only after backup.
5. Re-enable the camera account and RTSP; confirm the “two of three” rule.
6. Verify from the Pi: `journalctl -u pigpulse-cctv -n 100` must stop reporting no camera, and `curl http://127.0.0.1:8091/?snapshot=1` must return a valid JPEG.

## Audio without the Tapo app at runtime

- Tapo FAQ 4465: “ONVIF Profile S does not include two-way audio.”
- RTSP stream audio can be read by ffmpeg from `stream1` once the camera account exists.
- Microphone gain may need one-time setup in the Tapo app: “adjust the camera microphone settings in the Tapo app.”
- The Pi exposes `/camera-audio`, and the app has a camera-sound control. This is not the same as using the camera speaker for two-way talk.

## Product implication

The Tapo app should be a one-time provisioning tool, not a dependency for daily PigPulse use. PigPulse owns health state, stream status, recording choice, and recovery guidance.
