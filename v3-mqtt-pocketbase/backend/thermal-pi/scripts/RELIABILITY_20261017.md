# Pi reliability investigation — 2026-10-17, ongoing

## Verified and deployed

HTTPS froze while SSH and the thermal process remained alive. Available RAM
3.3 GiB, swap unused, CPU temperature about 50 C. A plain TCP socket held open
on :8080 reproduced a global HTTPS timeout; closing it restored HTTPS.

Cause: wrapping the listening socket with default synchronous TLS handshake
blocks accept before ThreadingHTTPServer can dispatch a request thread.
Added tls_server.py: handshake runs in request thread (5s timeout), then 15s
socket I/O timeout. Existing stream subscribers are not deliberately capped
by duration. Only this targeted change deployed onto the Pi's live source;
backup web_server.py.bak-tls-20261017 retained. Other local changes not deployed.

Tests: local scripts/test_tls_server.py passes. Live Pi with 8 idle TCP clients:
three HTTPS /health requests succeeded in 0.07, 0.03, 0.03s; thermal valid.
After clients close, service TasksCurrent=4, NRestarts=0, PID4267.

References:
- https://docs.python.org/3/library/ssl.html (handshake defaults and timeouts)
- https://docs.python.org/3/library/http.server.html (preopened sockets/threading;
  this lightweight server is not a hardened public internet server)

## Still unresolved

Camera RTSP works from laptop FFmpeg6 but fails from Pi FFmpeg7.1.5 with the
same constructed credentials. User-agent substitution did not help. Do not
blame credentials alone or assume a version bug without isolating it.
Pi CCTV retried 401 failures every second. Service stopped during investigation,
then restarted with targeted retry patch: 60s after authentication rejection,
5s after other failures; exited ffmpeg child explicitly reaped. Both services
active afterward. Camera still returned 401 on first attempt; no video claimed.
Thermal remains active. Backup tapo_mjpeg_server.py.bak-retry-20261017 retained.

Pi clock says September29 while laptop says October17. Offline AP has no WAN;
do not assume time-based auth impact without evidence. Sensor I2C errors were
intermittent before restart; current valid frames do not prove wiring stable.
Mic disconnected. Long-duration soak and independent code review outstanding.

## Camera isolation checkpoint

Fresh probes: laptop succeeds, Pi rejects, both using exact lowercase camera
account. Both ARP tables resolve 192.168.69.2 to 18:69:45:fb:d4:be. Pi direct
Basic and challenge-derived Digest DESCRIBE requests also return 401, so an
FFmpeg-only issue is not established. Service stopped again for a controlled
180-second no-request cooldown. No Pi reboot performed.

Official troubleshooting reference: https://www.tapo.com/us/faq/724/ recommends
checking account, closing other viewers, testing stream2, then camera restart.
Temporary lockout is a hypothesis, not a confirmed diagnosis.

## Camera recovery VERIFIED

The controlled 180s quiet test returned success from the Pi with unchanged
credentials: 1920x1080 H.264 and pcm_alaw audio. This supports temporary
camera-side authentication state/lockout; exact internal policy is unknown.
Restarted CCTV and verified HTTPS /cctv: initial 79 complete JPEG frames,
54 distinct frame hashes. Three consecutive reconnect tests (about 10s each)
returned HTTP200 and 65/130/99 complete frames (46/73/68 distinct), with valid
thermal health after each. No credential change, network change or Pi reboot.

Changed authentication-failure quiet interval from 60 to 180 seconds to match
the successful experiment, preserving 5s general retry interval. Deployed
only that delta and restarted CCTV. Final post-deployment test delivered 80
complete JPEG frames in about 8s. Both services active, NRestarts=0. Backup:
tapo_mjpeg_server.py.bak-cooldown-20261017. Mic remains disconnected; no claim
of multi-hour soak reliability or automatic recovery from every camera fault.
