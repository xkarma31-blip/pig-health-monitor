# Isolated WebRTC trial (not promoted)

go2rtc v1.9.14 ARM64 release downloaded, checked against release asset SHA256:
359fabade8a7a51e81a55fe6df6b0ef81764a5e1d63179577534eaaa71904b50.
Pi executable ~/cctv/go2rtc-trial, credentials in mode0600 go2rtc-trial.json.
Transient systemd unit pigpulse-rtc-trial (not enabled at boot).
API bound 127.0.0.1:1984, RTSP127.0.0.1:8554, WebRTC192.168.69.1:8555,
no STUN servers. Tested via SSH localhost1984 forwarding, not public admin API.

## Measured

Chromium on stream.html?src=cctv&mode=webrtc: connected peer; live video/audio
tracks. Video1920x1080, paused=false, muted=false, currentTime11.518;
decoded video frames154 ->274, audio samples91600 ->155680 over next8s,
audio energy0 ->5.8515 after unmuting. Real camera source, no mock.
Relay ps lifetime-average CPU3.0%, RSS29156KiB at63s lifetime. This is not
a controlled baseline comparison. Thermal valid1.96FPS, age0.6s.
Both media tracks are on one WebRTC peer; physical A/V synchronization and
glass-to-glass delay not measured. No latency improvement claim.

## Intentional power interruption and recovery (corrected)

During fallback coexistence test camera became unreachable (Pi ARP INCOMPLETE,
station still associated, tx failures205). The user subsequently clarified
that they unplugged the camera because laptop speaker playback caused loud
acoustic feedback, then plugged it back in after lowering volume. This is
not evidence of WebRTC instability or a spontaneous AP failure. Stopped trial
relay and restarted original CCTV; camera still unreachable. Targeted removal
of the camera's AP association was followed by restored reachability; with
the intentional power interruption now known, this does not establish that
association removal was necessary. Original HTTPS
/cctv then delivered HTTP200,2435646 bytes,101 complete JPEG frames in10s.
Thermal remained valid2.13FPS. Experimental relay left STOPPED, not promoted.

## Remaining

Repeat coexistence/soak with playback muted by default. Never automatically
unmute during testing. Add separate CCTV/ESP volume and mute controls, and
reset playback to muted on reconnect. Consider shared
single camera upstream only after proving relay stability; preserve direct
fallback rollback. Add viewer-only HTTPS signaling endpoint (never expose
management/config API) before offering a normal phone link. User listening
confirmation, physical synchronization and latency measurement remain pending.
