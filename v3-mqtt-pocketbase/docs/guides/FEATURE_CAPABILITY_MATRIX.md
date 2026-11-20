# PigPulse feature / capability matrix — 2026-11-20

Statuses: **ENABLED** (working and measured), **PARTIAL** (works with a measured limit), **PLANNED** (not implemented), **BLOCKED** (cannot be exercised under the current external or safety constraint), **UNRESOLVED** (the outcome is known but the cause is not established).

Evidence labels: **measured** = actual device/app/API readout; **source-confirmed** = repository, configuration, or deployed-contract evidence; **handoff-reported** = supplied by an earlier operator but not independently captured; **inferred** = reasoning from measurements; **unresolved** = evidence gap remains.

| Capability | Status | Evidence | Honest note / operational limit |
|---|---|---|---|
| Native Android widget | ENABLED | measured (earlier APK) | Waveform icon is used; the earlier build was verified with an APK. |
| Local PocketBase reads | ENABLED | measured | Hotspot and venue-LAN reads were exercised. |
| Owner-enforced writes | ENABLED | measured | PocketBase rules and the app owner stamp were exercised; the spoof attempt was rejected. |
| Notification permission/channel | ENABLED | measured | A real Android notification was observed. |
| Thermal live frame | PARTIAL | measured | The service is live and the app uses the portal proxy, but the sensor remains intermittent. |
| Fever claim | PARTIAL | source-confirmed | Screening output only; it is not a clinical diagnosis. |
| CCTV mode toggle | ENABLED | measured | OFF, VIDEO, and VIDEO+AUDIO are present in the app; the camera itself is offline. |
| CCTV live frame | BLOCKED | measured | The camera does not answer; the SD/vendor issue remains unresolved. |
| S3 mic | PARTIAL | measured | Live MQTT telemetry was measured on 2026-11-20 (`mic=true`, about 96 kB/s, RSSI −23 dBm), but the Nov-17/18 power and I²C incidents remain unresolved, so continuous availability is not claimed. |
| SHT45 ambient | PARTIAL | measured | The sensor has been live, but intermittent readings and the Nov-18 command-phase I²C stall prevent an always-on claim. |
| 5 GHz Wi-Fi scan | PARTIAL | measured + source-confirmed | Radio roles are now resolved by MAC with no interface-name fallback. At the latest readout, the AP radio was `wlan0`/UP and the managed/WAN radio was `wlan1`/DOWN, so 5 GHz venue availability remains operationally limited. |
| Venue LAN fallback | PARTIAL | source-confirmed | The route and supporting code are present; end-to-end phone verification is blocked by unauthorized ADB. |
| Tailscale remote | ENABLED | measured | The Pi side is running and online; phone installation and device verification remain blocked by unauthorized ADB. |
| Vercel deployment | BLOCKED | measured | The provider returned HTTP 402; Vercel is not a current data-capable deployment. |
| Expo Hosting | ENABLED | measured | Production `https://pigpulse.expo.app` and deployment `https://pigpulse--3x12hwzewm.expo.app` are live. On 2026-11-20, `GET /api/telemetry?collection=telemetry&perPage=1`, `GET /api/pi`, and `POST /api/chat` returned HTTP 200; `/api/pi` reported `status=NORMAL`. The export uses server output for the `/api/*` routes. |
| Pi cough classifier | ENABLED | measured | The live Pi service uses PANNs `Cnn14_16k` plus the logistic head on `127.0.0.1:8096`. The 2026-11-20 readout was healthy (`ok=true`, audio connected, zero reconnects, 564 windows scored, verdict `LOW`). This is screening output, not clinical validation. |
| S3 mic transition watchdog | PARTIAL | measured + source-confirmed | Installed under `/home/pigpulse/bin/`, scheduled once per minute, and measured `ONLINE` after deployment. No natural transition occurred, so live transition publication and transition syslog remain unobserved; the contract is covered by hardware-free tests. |
| Passive admin-console verification | ENABLED | source-confirmed | The verifier performs AST/decoded-source checks and attributable child-process observation only; it has no reachable active `connect_ex` path to TCP `:9090`. |
| Nov-17/18 mic root cause | UNRESOLVED | handoff-reported + inferred | The exact frozen command-phase `Wire` call and reset cause were not captured. No incident-window serial fault log or backtrace exists. |
| Firmware remediation | BLOCKED | unresolved | No rebuild, reflash, reboot, or firmware change is authorized without a serial fault log showing the fault. |
| Phone APK installation | BLOCKED | measured | The physical phone is unauthorized to ADB, so the current APK cannot be installed for final device verification. |
| Remote monitor page | ENABLED | measured | `http://<pi>/monitor` works over the hotspot, venue LAN, and Tailscale. |
| Setup QR | ENABLED | measured | SVG/PNG generation was verified for `http://192.168.69.1/?setup=1`. |
| Sound feedback | ENABLED | measured | It is off by default and opt-in in Settings. |

| Planned capability | Status | Evidence | Honest note / operational limit |
|---|---|---|---|
| Synchronized thermal+CCTV | PLANNED | unresolved | Needs calibration and homography. |
| Pig ID/tracking | PLANNED | unresolved | Published systems need depth/ear tags and training data. |
| Cough-to-pig attribution | PLANNED | unresolved | A single microphone cannot support attribution. |
| Native trend chart | PLANNED | unresolved | A web chart exists; the native chart is deferred. |

No capability above should be described as clinical validation.
