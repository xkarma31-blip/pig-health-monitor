# PigPulse user manual (plain language)

## Connect

1. Join the Wi‑Fi network named **PigPulse**.
2. Open the PigPulse app. If you have internet, the app can also use the encrypted tunnel to the same Pi when you are away.
3. The QR code in `SETUP_QR.md` opens the Pi setup page directly.

## What you see

- **Home:** device counts and freshness. It says “not reported” when a device has no status; it never invents a healthy pig count.
- **Thermal view:** live MLX90640 surface image. “Elevated surface — screening only” means check the animals, not a diagnosis.
- **CCTV:** Tapo camera frame with OFF / VIDEO / VIDEO + AUDIO modes. If offline, the panel says so and does not show a stale frame as live.
- **Alerts:** plain-language alert list. A test alert is not a current health verdict.
- **History:** recorded readings and trends where enabled.
- **Settings:** appearance, account, and notification state.

## Sign in or skip

You can skip sign-in to read live data. PigPulse clearly marks guest mode as read-only. Sign-in is required before changing pig records, device settings, or other saved data.

## Notifications

Android notification permission is requested once. A HIGH-importance `alerts` channel with vibration is used. If notifications do not appear, check Android Settings → Notifications → PigPulse.

## If something looks wrong

- “Pi console unreachable”: check that your phone is on PigPulse or that the tunnel is connected.
- “Camera frames unavailable”: the thermal service may still have readings, but no full frame reached the app.
- “STALE” or “NO READING” in diagnostics: the sensor has not reported recently; do not treat old values as live.
- “CCTV OFFLINE”: camera power, Wi‑Fi association, or RTSP credentials need checking.
