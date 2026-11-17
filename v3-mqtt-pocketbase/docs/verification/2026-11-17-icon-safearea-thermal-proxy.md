# Icon, top safe-area, and portal live-frame fix — 2026-11-17

**Status:** implemented and physically verified; LAN-fallback/boot-fix rebuild in progress.

---

## 1. Why the desktop live frame was not visible in the app

The browser view at `http://192.168.69.1:8080` works because the operator
accepted the Pi's self-signed thermal certificate in the browser. The native
app fetched `https://<selected-host>:8080` directly; React Native rejects that
certificate, `fetchPiJson` swallowed the error, and the UI showed
`Camera frames unavailable` with no reason. That was the cause; the sensor
itself was producing a real frame.

The Pi portal already exposes an allowlisted plain-HTTP adapter at
`/api/pi?ep=data` which trusts the Pi certificate server-side and forwards only
allowlisted endpoints. Native live data now uses that path.

---

## 2. Changes

- Replaced all Expo icon assets from Master's supplied `icon.webp`:
  `icon.png`, `dark-icon.png`, `adaptive-icon.png`, `monochrome-icon.png`,
  `splash-icon.png`, `favicon.png`. Adaptive foreground is the green glyph on
  transparency; adaptive background is black to match the supplied artwork.
- Added `rootTopPadding(insets)` and applied the device top inset to the root
  shell so Android 16 edge-to-edge status-bar text no longer overlaps the
  PigPulse brand wordmark.
- Native thermal/CCTV/audio base resolution now derives
  `http://<selected-host>/api/pi` from the same PocketBase host instead of
  `https://<selected-host>:8080`. Web remains same-origin and explicit operator
  overrides are still honored.
- Added RED→GREEN tests for safe-area padding and portal base derivation.

---

## 3. Gates

- `npm run test:unit` — all suites pass, including `safe-area` 3 assertions and
  updated `source-policy` 61 assertions.
- `npx tsc --noEmit --skipLibCheck` — clean.
- Scoped ESLint — 0 errors; warnings are pre-existing console statements.
- `critic_loop.sh` — passed on changed source/config files; binary PNG assets
  have no critic rules.
- CodeRabbit attempted; still unavailable (`cr: command not found`).

---

## 4. Physical verification

Build `283ede8b-5e7f-4e6b-944a-3260bab2a9f2` was installed with
`adb install -r` (`Success`). On the phone:

- The launcher icon now uses the supplied black/green artwork.
- The Android status-bar clock sits above the PigPulse wordmark with no overlap.
- The portal proxy returned a 768-pixel live frame at
  `http://192.168.69.1/api/pi?ep=data` (frame 50,469, center 38.63 °C) before
  the phone switched networks.
- Later, the phone switched to `GFiber_E9BD4` and the app correctly showed an
  offline/error state; this is expected before venue-LAN fallback was added.

Final LAN-fallback + boot-fix build is pending installation.
