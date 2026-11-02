# Track T5 — APPS (Monitor-first mobile app + Pi views)

> **Status: implemented, type-clean, lint-clean, web-export-verified.** Not yet
> deployed to the Pi or shipped as an APK. Read "Honest limits" before claiming
> any of this works on a physical phone.
>
> Session date: 2026-11-02 · Branch `feat/v3-mqtt-pocketbase`
> Scope dirs: `v3-mqtt-pocketbase/backend/thermal-pi/static/**`,
> `v3-mqtt-pocketbase/frontend/mobile_app/**`

---

## 1. What the brief asked, and where I diverged

| Brief | What shipped | Why |
|---|---|---|
| Feeds/Monitor becomes the primary view | Tabs are now `monitor / events / settings`; `/` redirects to `/tabs` (Monitor) | Direct |
| Surface CCTV + thermal + mic level + ESP link state | Monitor renders all four against real contracts | Direct |
| Demote roster to a secondary research log, anonymous `P-####` | Roster tab deleted; `/research` reached from Monitor; enrollment writes no name | Direct |
| Deep navy `#1a1a2e` + cyan, ≥16px | Navy/cyan **scoped to the video/sensor stage** and the Pi pages; green brand identity untouched | Master rejected a global theme flip ("huh? why change the theme?"). The stage palette matches the Pi technician console that already ships navy/cyan, so nothing else regresses |

The `>=16px` floor is enforced on every new monitor surface and on the Pi
pages. Navigation chrome was raised too (tab labels 10.5 → 15px, sidebar item
labels 14 → 16px, badges 9.5 → 11.5px).

---

## 2. Grounded contracts (nothing here is assumed)

Every number below was read from the deployed source, not inferred.

### ESP32-S3 barn mic — `s3-mic-01`

Source: `firmware/esp32s3-mic-ambient/arduino/esp32s3_telemetry/src/esp32s3_telemetry.ino`

- Publishes `pig/s3-mic-01/telemetry` **every 1000 ms**.
- Payload: `{"mic":bool,"rms":int,"peak":int,"sr":48000,"temperature"?,"humidity"?}`
  (`temperature`/`humidity` come from the SHT45 when it answers).
- `rms`/`peak` are **24-bit scale**: `#define FULL_SCALE 8388608.0`, and the
  firmware itself logs `20*log10(rms/FULL_SCALE)`.
- **LWT is retained on the same telemetry topic** with
  `{"mic":false,"rms":0,"peak":0,"sr":48000}`.
- It publishes **no `status` topic** → there may be no `devices` row for it at
  all. Recency of telemetry is the only honest liveness signal, so the app uses
  that plus the retained `mic:false` flag.

### Pi thermal node — `pi-thermal-01`

Source: `backend/thermal-pi/thermal_publish.py`

- Telemetry every `PUBLISH_INTERVAL_S = 10.0` s; status heartbeat every
  `STATUS_INTERVAL_S = 60.0` s.
- `bodyTemp` = centre spot (the pig reading). `temperature` = **pen average**.
  The app reads `bodyTemp` first and falls back to `center` — never
  `temperature`, which would silently report the wrong thing.

### Bridge

Source: `backend/bridge/local_bridge.py`

- Subscribes `pig/+/telemetry`, `+/alerts`, `+/audio`, `+/status`.
- Stamps a missing `timestamp` as **epoch milliseconds** (`int(time.time()*1000)`).
- `status` payloads with `online:true/false` upsert a `devices` row.

### PocketBase

- `pigs` schema (`deploy/pocketbase/bin/pb_migrations/1790499383_created_pigs.js`):
  `pigId` **required**, plus `name`, `healthStatus`, `tags`. There is **no
  `enrolledAt` column**.
- Consequence: the old `enrollPig(name)` sent no `pigId` and an undeclared
  `enrolledAt`, so **every enrollment was rejected** and the date silently
  dropped. This was a real, shipping bug — not a style issue.

### Pi HTTP surface

Source: `backend/thermal-pi/web_server.py` — `/` (index), `/data`, `/cctv`
(MJPEG proxy), `/esp/status`, `/esp/record`, `/health`, `/static/*`, `/admin/*`.
HTTPS with a self-signed certificate on `:8080`.

---

## 3. Files changed

### New

| File | Purpose |
|---|---|
| `mobile_app/src/components/monitor/tokens.ts` | Stage palette (`#1a1a2e` ground, `#35e0d0` live), `FONT_FLOOR`, text ramp |
| `mobile_app/src/components/monitor/LiveCamera.tsx` | Native renderer — WebView hosting an `<img>` (RN `<Image>` cannot decode MJPEG) |
| `mobile_app/src/components/monitor/LiveCamera.web.tsx` | Web renderer — raw DOM `<img>` streaming `/cctv` |
| `mobile_app/src/components/monitor/LiveCamera.types.ts` | Shared props |
| `mobile_app/src/components/monitor/LinkChip.tsx` | LIVE / LATE / OFFLINE / NO DATA chip |
| `mobile_app/src/components/monitor/AudioLevelMeter.tsx` | dBFS meter from 24-bit RMS, with peak mark |
| `mobile_app/src/components/monitor/index.ts` | Barrel |
| `mobile_app/src/utils/live-source.ts` | Pi URL derivation, endpoint map, per-device cadence, link-state thresholds, dBFS math (pure, testable) |
| `mobile_app/src/utils/anonymous.ts` | FNV-1a hash + anonymous `P-####` display code |
| `mobile_app/src/hooks/useDevices.ts` | `devices` list + realtime refresh |
| `mobile_app/src/app/research.tsx` | Demoted anonymous research log (not a tab) |
| `mobile_app/src/app/camera.tsx` | Full-screen CCTV route with browser fallback |
| `backend/thermal-pi/static/monitor-nav.css` | Shared Pi nav strip + 16px type floor |
| `docs/track-t5-apps.md` | This file |

### Rewritten / edited

| File | Change |
|---|---|
| `mobile_app/src/app/tabs/index.tsx` | Rewritten as the Monitor screen |
| `mobile_app/src/app/tabs/_layout.tsx` | Triggers → `monitor / events / settings` |
| `mobile_app/src/components/primitives/BottomNav.tsx` | `TabKey = 'monitor' \| 'events' \| 'settings'`; label/badge sizes raised |
| `mobile_app/src/components/primitives/SidebarNav.tsx` | Same tab set; 16px labels, larger badges |
| `mobile_app/src/components/primitives/index.ts` | Export `ChevronLeftIcon` (was missing from the barrel that two screens already needed) |
| `mobile_app/src/utils/pocketbase-data.ts` | `enrollPig(name)` → `nextPigCode()` + `enrollAnonymousPig()` |
| `backend/thermal-pi/static/index.html` | Nav strip, duplicate pills removed, 12–14px labels lifted to 16px |
| `backend/thermal-pi/static/fusion.html` | Nav strip, `id="mic"` anchor added (the old `#mic` link was dead), console exit link, accent aligned to `#35e0d0` |
| `backend/thermal-pi/static/admin/console.js` | Injects a "Live views →" exit link into every console page |
| `backend/thermal-pi/static/admin/console.css` | Style for that exit link |

### Deleted

| File | Reason |
|---|---|
| `mobile_app/src/app/tabs/feed.tsx` | Unreachable legacy feed with hardcoded 39.9 °C demo values. Master approved deletion |
| `mobile_app/src/app/tabs/roster.tsx` | Replaced by `/research` |
| `mobile_app/src/components/primitives/TemperatureDisplay.tsx` | **Irreparably corrupt**: the entire 7.8 KB file was one line with literal `\n` sequences and stripped JSX closing braces, producing 61 tsc errors. Unreferenced anywhere. Backup: `/tmp/opencode/TemperatureDisplay.tsx.orig` |

### Lint-only cleanups (pre-existing, disclosed)

These three errors pre-dated this track and were outside the feature diff. They
blocked a green `npx eslint src/`, so they were fixed rather than inherited:

- `app/_layout.tsx` — removed `spacing` / `isDesktop` / `useWindowDimensions`
  (all unused; no behavior change).
- `app/tabs/edge-impulse.tsx` — removed a no-op effect that defined an
  `onChange` handler never registered on any listener, whose only body was
  `setStatus(prev => prev)`.
- `utils/pocketbase.ts` — removed an assigned-but-never-read `subscribed` flag
  whose comments described a guard that did not exist. Comments corrected.

### Dependency added

`react-native-webview@^13.16.1` (Master's choice for native CCTV).

Installed with `--legacy-peer-deps` because the repo already has an unresolved
peer conflict: `react-native@0.86.3` demands `react@^19.2.3`, the repo pins
`react@19.1.0`. That conflict is **pre-existing** and untouched.

---

## 4. Design decisions

**Monitor is the app.** `/` → `/tabs` → Monitor. The research log is reached by
a row on the Monitor (`router.push('/research')`) and is not a tab, so it cannot
compete for attention with live data.

**Anonymity is structural.** Enrollment writes `pigId`, `healthStatus`, `tags`
only. The UI reads `pigId` (or a deterministic code derived from the record id)
and **never reads `name`**, so a stored name cannot leak into a screenshot or an
export. Display codes are `P-0001`-style; hashed fallbacks are stable across
renders because they are FNV-1a of the record id.

**Thresholds come from cadence, not vibes.** `live-source.ts` encodes each
device's real publish interval and derives: stale = 3 missed publishes (≥5 s),
offline = 6 missed publishes, at least 2 heartbeats, at least 30 s. A 1 s
publisher is therefore not judged by the same clock as a 10 s publisher.

**dBFS uses the firmware's own formula.** `20*log10(rms/8388608 + 1e-9)`, clamped
to [−60, 0]. The app number matches the serial monitor instead of drifting by a
scale factor.

**Zero is "no signal", not "quiet".** The Pi's GPIO mic once returned bit-exact
zeros that looked like a silent room. The meter says "no signal" when RMS is 0
or the link is not live.

**No fabricated values anywhere on the Monitor.** Missing data renders as `—`,
`NO DATA`, or an explicit explanation ("No Pi address yet"). There is no demo
herd, no placeholder temperature.

---

## 5. Honest limits (do not oversell these)

1. **Native CCTV will almost certainly *not* stream on a stock build.** The Pi
   serves HTTPS with a **self-signed certificate**. WebView validates against the
   OS trust store, does **not** inherit a browser tab's manual exception, and
   `react-native-webview@13.16.1` exposes **no `onSslError` prop** (verified by
   grepping `lib/WebViewTypes.d.ts`). So the stream is expected to fail — and the
   only thing this track guarantees is that **it fails visibly**: the hosted page
   reports the `<img>` `error` back over `postMessage`, a 12 s first-frame
   watchdog catches the silent case, and the state stays `connecting` until a
   frame actually decodes. The stage never claims "live" without a decoded frame,
   and the fallback offers "Open in browser".
   *Fix path:* bundle the Pi certificate + an Android `network_security_config`
   via a config plugin, or use a proper CA. That is a build-config task, not a
   React task. **Not attempted here.**
2. **Web works.** The web export streams `/cctv` inline (browsers decode
   `multipart/x-mixed-replace` in `<img>`); the certificate must be accepted once
   for the Pi origin.
3. **The app only sees what reaches PocketBase.** The Pi publishes over MQTT to
   the laptop bridge; if `cloud_sync` / the bridge is not running, the Monitor
   correctly shows stale/offline rather than inventing data.
4. **SHT45 humidity is dropped by PocketBase.** The `telemetry` collection has no
   `humidity` column, so the firmware's reading never persists. The app displays
   it only when a live frame carries it. Schema fix belongs to the PB owner.
5. **No hardware was measured this session.** All of the above is source-level
   contract reading. Nothing here proves a board is powered or transmitting.
6. **Deployment is manual.** `static/monitor-nav.css` must be copied to the Pi
   with the HTML files; there is no build step for `static/`.

---

## 6. Verification evidence

Run from `v3-mqtt-pocketbase/frontend/mobile_app` on 2026-11-02:

| Command | Result |
|---|---|
| `npx tsc --noEmit --skipLibCheck` | **clean** (was 61 errors before `TemperatureDisplay.tsx` was removed) |
| `npx eslint src/` | **0 errors**, 55 pre-existing warnings (`no-explicit-any`, `no-console`) |
| `npx expo export -p web` | **succeeded**; confirms the `.web.tsx` platform split — `RNCWebView` appears **0 times** in the web bundle. The one `react-native-webview` string is a "bridge not available" error message from a DOM helper, not the native module |
| `critic_loop.sh` (21 TS/TSX files) | **PASS** on every file |
| `node --check static/admin/console.js` | **OK** (`critic_loop.sh` times out on this file, so it is syntax-gated only) |
| HTML tag-balance parse of `index.html` + `fusion.html` | **no orphan or unclosed tags** |
| `git diff --cached` secret scan (`AIza…`, PEM headers, JWT shape) | **no matches**; `core.hooksPath = .husky` |
| Pre-commit guard, tested for real | planted an `AIza`-shaped fake key, staged it, attempted a commit → **BLOCKED** with the scanner's message; `HEAD` unchanged, plant removed. The guard is live, not assumed |

### Review layers

- **Layer 1 — `critic_loop.sh`:** PASS, above.
- **Layer 2 — CodeRabbit (`cr review --plain`): COULD NOT RUN.** The CLI requires
  an interactive browser sign-in and the localhost callback timed out twice.
  **Layer 2 did not pass — it did not execute.**
- **Substitute:** an independent read-only reviewer subagent reviewed the full
  staged diff against the grounded contracts in §2. Its findings and their
  dispositions are in §6.1. That is a real second opinion, but it is *not*
  CodeRabbit, and no one should record it as such.

### 6.1 Review findings and dispositions

The reviewer raised eight findings. Seven were in this track's own new code and
were fixed before the commit; the rest are recorded rather than quietly dropped.

| # | Severity | Finding | Disposition |
|---|---|---|---|
| 1 | **HIGH** | Native camera TLS failure never reached the fallback. `onError`/`onHttpError` only fire for main-frame loads, so a certificate rejection on the `<img>` subresource produced a black stage under a **green live dot**. | **Fixed.** The hosted page now posts `load`/`error` from the `<img>` back via `postMessage`; a 12 s first-frame watchdog catches the silent case; camera state is tri-state (`connecting → live \| failed`) and only `live` paints green. Refresh and retry reset to `connecting`. |
| 2 | MEDIUM | Research log ran a cosmetic 900 ms timer, then rendered "No entries yet" when the query had actually failed — an outage shown as an empty log. | **Fixed.** Timer removed; `records === null` is the only loading state. `subscribeRoster` gained an `onError` callback, and the screen renders an explicit "Could not reach PocketBase / the log is unknown, not empty" card. |
| 3 | MEDIUM | Pi dashboard fed both "L" and "R" VU bars from the same `nonzeroPct` — read as stereo loudness, actually signal presence. | **Fixed.** One bar labelled **Signal**, with the caption "Share of non-zero samples — signal presence, not loudness." The `#micBarL/R`, `#micValL/R` ids are gone, not orphaned. |
| 4 | LOW | The "no telemetry yet" branch required `connectionStatus === 'connected'`, which an empty list never produces (`.some()` on `[]` is false → `'stale'`), so the honest message was unreachable. | **Fixed.** Branch is keyed on `deviceIds.length === 0` and the copy distinguishes "connected but nothing has arrived" from "nothing has arrived". |
| 5 | LOW | `events.tsx` skips the live subscribe for signed-in admins and falls back to `DEMO_EVENTS`; the "DEMO DATA" pill only renders when signed out, so an **admin** sees fabricated fever/cough alerts as a real log. | **Deferred — not fixed.** `events.tsx` is outside this diff's rewrite; the file was not modified. Needs a real events source or an always-on demo banner. Recorded in §7. |
| 6 | LOW | `tabs/edge-impulse.tsx` is unreachable (nothing navigates to it), and it simulates a sample counter/accuracy while claiming "16kHz, 16-bit" against a real 48 kHz S16LE stream. | **Partially addressed.** The no-op accessibility effect was removed for the lint gate. The fabricated telemetry and the dead route are **left in place pending Master's decision** — deleting a screen is not mine to decide. Recorded in §7. |
| 7 | MINOR | Sub-16px text on changed surfaces. | **Fixed** for `research.tsx` (the 12px "SECONDARY LOG" tag was removed entirely rather than restyled). `events.tsx:114`'s 10px "DEMO DATA" pill remains, in the same deferred file as #5. |
| 8 | MINOR | `onRefresh`'s 1200 ms `setTimeout` was not cleared on unmount. | **Fixed.** Held in a ref and cleared on unmount and before each new refresh. |

Two things the reviewer confirmed clean, worth recording because they were the
riskiest parts: the expo-router `TabTrigger` names match the `TabKey` union and
hrefs in `BottomNav`/`SidebarNav`; and the `tsc` units/NaN handling is sound —
`usePocketbaseRealtime` drops non-finite frames, `dbfs` matches the firmware's
own `20*log10(rms/FULL_SCALE)`, and the timestamp guard covers sec/ms/ISO.

**No tests were added.** `jest` is not installed in this app (no `test` dep, no
`test` script) despite `AGENTS.md` advertising `npm run test`, so the three pure
modules that most deserve tests — `anonymous.ts` (FNV-1a code derivation),
`live-source.ts` (`dbfs`, `linkState`, cadence thresholds), `telemetry-time.ts`
(sec/ms/ISO) — are verified only by reading. Standing up a test harness is a
separate decision, not something to smuggle into a UI track.

---

## 7. Follow-ups (not done, deliberately)

1. **Native certificate trust** for the CCTV WebView (see §5.1).
2. **Legacy screens still in the tree:** `src/app/feed.tsx` (root) and
   `src/app/web/*` still contain named/emoji pigs and hardcoded temperatures.
   They are unreachable from the new nav but remain buildable. Deleting them needs
   Master's approval — only `tabs/feed.tsx` was approved this session.
3. **`tabs/edge-impulse.tsx`** — unreachable, and it fabricates a sample counter
   and accuracy while claiming 16 kHz against a real 48 kHz S16LE stream. Delete
   it or wire it to real data; do not leave it as a buildable fiction (§6.1 #6).
4. **`events.tsx` demo fallback** — signed-in admins see `DEMO_EVENTS` with no
   warning pill (§6.1 #5). Needs a real events source, or the pill shown
   unconditionally.
5. **No test harness** — `jest` is referenced by `AGENTS.md` but not installed.
   `anonymous.ts`, `live-source.ts` and `telemetry-time.ts` are pure and would be
   cheap to cover.
6. **`telemetry.humidity` column** so the SHT45 reading survives ingestion.
7. **Deep links:** `/tabs/roster` no longer exists. Any external link or QR code
   pointing at it will 404; repoint to `/tabs`.
8. **Pi-side smoke test:** load `/`, `/static/fusion.html`, `/admin/*` on the Pi
   and confirm the nav strip + 16px floor look right at 1024×600 before calling
   the Pi half done.
9. **EAS rebuild** is required for the WebView dependency to exist on device.

---

## 8. For T0 (canon folding)

Facts worth promoting into `CANON.md`:

- The `pigs` collection requires `pigId` and has no `enrolledAt`; the old
  enrollment call could never have succeeded.
- The ESP32-S3 publishes no `status` topic, so `devices` may legitimately have no
  row for `s3-mic-01`; liveness must be derived from telemetry recency + the
  retained LWT.
- `pi-thermal-01` telemetry carries **both** `bodyTemp` (pig) and `temperature`
  (pen average) — consumers must pick deliberately.
- `react-native-webview` is now a dependency of the mobile app, and native CCTV
  remains blocked on certificate trust.
