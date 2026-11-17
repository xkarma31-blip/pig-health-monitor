# PigPulse feature / capability matrix — 2026-11-17

Statuses: **ENABLED** (measured), **PARTIAL** (works with limits), **PLANNED** (not implemented), **BLOCKED** (external dependency).

| Capability | Status | Honest note |
|---|---|---|
| Native Android widget | ENABLED | Waveform icon now used; verified previously with APK. |
| Local PocketBase reads | ENABLED | Hotspot and venue LAN measured. |
| Owner-enforced writes | ENABLED | PB rules + app owner stamp; spoof test rejected. |
| Notification permission/channel | ENABLED | Real Android notification observed. |
| Thermal live frame | PARTIAL | Service live; app uses portal proxy; sensor intermittent. |
| Fever claim | PARTIAL | Screening only; not clinical diagnosis. |
| CCTV mode toggle | ENABLED | OFF/VIDEO/VIDEO+AUDIO in app; camera offline. |
| CCTV live frame | BLOCKED | Camera not answering; SD/vendor issue. |
| S3 mic | PARTIAL | Was live, then offline again; intermittent. |
| SHT45 ambient | PARTIAL | Was live, then offline again; diagnostics honest. |
| 5 GHz Wi‑Fi scan | ENABLED | Portal sees 5 GHz after radio-role swap. |
| Venue LAN fallback | PARTIAL | Unit-tested; final APK install blocked by ADB. |
| Tailscale remote | ENABLED on Pi | Phone install/verification blocked. |
| Vercel deployment | BLOCKED | HTTP 402. |
| Expo Hosting | PLANNED | Docs written; API-route limitation noted. |
| Synchronized thermal+CCTV | PLANNED | Needs calibration + homography. |
| Pig ID/tracking | PLANNED | Published systems need depth/ear tags/training. |
| Cough-to-pig attribution | PLANNED | Single mic cannot support it. |
| Native trend chart | PLANNED | Web chart exists; native deferred. |

No capability above should be described as clinical validation.
