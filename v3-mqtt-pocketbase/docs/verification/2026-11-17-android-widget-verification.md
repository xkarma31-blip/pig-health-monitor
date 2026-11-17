# Native Android widget — verification record (2026-11-17)

Parent record: `CANON.md` §0.9. Style sibling:
`docs/verification/2026-10-14-integration-progress.md`.

## Verdict

**Implementation complete, independently reviewed, and verified on a physical
phone. The scoped implementation is committed on
`capstone-remediation-20261113`.**

- Implementation commits:
  - `06a6ebf99ffdcf9877ad08f54ad0afedd8576cb1` — `fix(pi): serve offline APK with Android package MIME`
  - `175c59a3db1930e47f9f64ca3b3f3fef050402e7` — `feat(app): add native Android home-screen widget`
  - `08d4a528257d84ba984c9635ea0c6a8ed274a2dc` — `fix(app): keep PocketBase credentials out of release builds`
- The widget is a **glanceable** surface, not a clinical instrument. It renders
  a versioned JSON cache written by the app; it never invents a verdict.
- Nothing here is a permanent hardware fix — the Pi thermal read below is a
  **recovered sample**.

## Build and install identity

| Field | Value |
|---|---|
| EAS preview build | `41fae1dd-7db6-43d3-8b35-34137148af79` |
| Artifact | `/tmp/opencode/pigpulse-widget-preview-41fae1dd.apk` |
| Size | 97,216,846 bytes |
| SHA-256 | `f12c77bbfac377bd689ee6d1e5e7518b8ebe5c92ab156028b7153fc10db0c8df` |
| Install | physical phone `15187705AA004496`, `adb install -r` → `Success` |
| MIME | `application/vnd.android.package-archive` |
| Same bytes on Pi | `/home/pigpulse/thermal-pi/app/PigPulse.apk` |

## Native widget contract (version 1)

- **Writer (JS):** `src/utils/widget-state.ts` builds the frame; the React-free
  runtime (`widget-runtime.ts`, `widget-poll-controller.ts`, `widget-sync.ts`) is
  mounted by `src/hooks/useWidgetSync.ts` from `src/app/_layout.tsx`.
- **File:** the app writes `pigpulse_widget_state.json` under its documents
  directory. The Kotlin provider reads it from `context.filesDir`.
- **Contract version:** `v: 1` in the JSON and `STATE_VERSION = 1` in
  `PigPulseWidgetProvider.kt`. A frame that is not a known v1 frame is rejected,
  and the provider keeps the last valid frame.
- **Reader (Kotlin):** `plugins/pigpulse-widget/PigPulseWidgetProvider.kt`, a
  native `AppWidgetProvider`.
- **Manifest:** the receiver is merged by `plugins/withPigPulseWidget.js` with
  `android:exported="false"` — it is local to the app, not a shared endpoint.
- **Theme:** follows the app's resolved, **saved** theme (key
  `pigpulse-theme-mode`, which may store `light`, `dark` or `auto`; it is
  resolved to `light` / `dark` for the widget frame). It adds **no**
  independent switch. Palette is checked in at
  `plugins/pigpulse-widget/widget_values.xml`.
- **Refresh:** while the app process is active, the controller polls every 30 s
  (`WIDGET_POLL_INTERVAL_MS = 30_000`, 10 s request deadline). This is most
  reliable while the app is foregrounded because Android may suspend background
  execution; there is no `AppState` foreground gate in the implementation. A
  cache write also triggers the provider's `FileObserver`, while Android's
  `updatePeriodMillis="1800000"` (30 min) is a fallback **render** window, not a
  guarantee of fresh data.
- **Honesty rules:** a barn **scene centre** is shown as a scene reading, never
  as a pig-temperature verdict; missing status renders "No reported device
  status"; freshness is recomputed from the sample time on every render, so a
  stale frame cannot show a false "fresh" label.
- **Auth:** no OAuth wall and no new authentication surface were added. The app
  still uses email/PocketBase auth.

## Device verification (physical phone)

| Check | Observed |
|---|---|
| Launcher instances | two widget instances present, ids **2671** and **2673** |
| Dark, connected | scene-centre **35.89**, "Updated just now" |
| Light, connected | scene-centre **35.64**, "Updated just now" |
| Offline after an update | last reading **35.64** retained, "Updated 4 min ago" |
| After reconnect | **36.03**, "Updated just now" |
| Later sample | **37.02**, "Data may be stale" |
| Normal hierarchy | `widget_logo` / `widget_device` / `widget_status` / `widget_reading` / `widget_reading_label` / `widget_freshness` present; the launcher's own fake host views are absent |
| Device status | "No reported device status" — **no fever verdict was inferred** |

Measured palettes (`widget_values.xml`): light background `#F2F6F1`, primary
`#1E2A20`, secondary `#6B7C6D`; dark background `#121314`, primary `#F2F3F1`,
secondary `#A6A9A6`.

## Credential hygiene

- A **value-based** scan covered all **1,665** ZIP entries of the APK
  (**129,473,735** decompressed bytes).
- None of the configured credential values or their variable names appeared in
  UTF-8, UTF-16LE, UTF-16BE, Base64 or URL-encoded form.
- The EAS **production** and **preview** env blocks carry **no** credential
  variables (`EXPO_PUBLIC_PB_EMAIL` / `EXPO_PUBLIC_PB_PASSWORD` were removed).
- `.easignore` excludes `.env` and `.env*`.

## Live thermal state (recovered sample, NOT a permanent fix)

- Live `/health` read at **2026-11-17T07:43:17+08:00** (Pi boot 2026-11-17
  04:29:26): Sensor ready **yes**, Frame valid **yes**, frame count **22655**,
  **1.98 FPS**, frame age **0.6 s**, Last error **OK**, thermal MQTT
  **connected**, error **None**.
- The journal shows a transient `Remote I/O error` on the I²C bus at
  **05:02:49** that cleared only after two corrupt frames were rejected, then
  recovered.
- **The MLX90640 remains intermittent.** This one good readout does **not**
  eliminate the recurrence risk (see `CANON.md` §2.5 and §6 item 12).

## Unresolved blockers (none fixed here)

- **ESP32-S3 mic `68:ee:8f:dd:31:3c`**: no DHCP lease, absent from hostapd
  logs, `/esp/status` times out (earlier `connected=false accepted=0
  nonzeroPct=0.0`). **Needs physical inspection.**
- **`pigpulse-cctv.service`**: active and holding a camera lease, but the
  journal says no camera is answering and HTTP probes time out.
- **`pigpulse-ap-powersave.service`**: failed `status=237/KEYRING` on
  `iw dev wlan1 set power_save off`, although hostapd/AP are active.
- **5 GHz WAN requirement unmet.** The deployed `pigpulse-wan-pick` prefers
  2.4 GHz and `pigpulse-portal-connect` refuses 5 GHz; a working 5 GHz USB
  adapter / antenna reseat is still required. **Deployment scripts were not
  changed.**
- **`health_check.py`**: PocketBase admin auth returns HTTP 400 and the PB
  table token check fails.

## Validation commands and results

Fresh final gates were run **2026-11-17** after the review fixes and before
the documentation commit:

| # | Command | Result |
|---|---|---|
| 1 | `npm run test:unit` (mobile app) | **exit 0** — widget-state/runtime/sync/poll-controller, useWidgetSync, root-integration, login-credential-hygiene, plugin and widget-plugin tests all pass |
| 2 | `npx tsc --noEmit --skipLibCheck` (mobile app) | **exit 0** |
| 3 | scoped ESLint over 19 intended app files | **exit 0** — 0 errors, 11 warnings |
| 4 | full ESLint over 162 app files | **exit 1** — 14 pre-existing errors, 89 warnings; none in the scoped widget implementation |
| 5 | `node --check` on CommonJS plugin/test, `python3 -m py_compile` on the APK-MIME change, and `git diff --check` | **exit 0** |
| 6 | `critic_loop.sh` over all 34 intended files | **0 failures**; 11 unsupported extensions were recorded explicitly |
| 7 | CodeRabbit `cr --plain` | **unavailable** — exit 127: `/bin/bash: line 2: cr: command not found` |
| 8 | value-based APK credential scan | **passed** — 1,665 entries / 129,473,735 decompressed bytes, 24 patterns, 0 matches |

Evidence logs:

- `/tmp/opencode/widget-unit-final.log`
- `/tmp/opencode/widget-tsc-final.log`
- `/tmp/opencode/widget-eslint-scoped-final.json`
- `/tmp/opencode/widget-eslint-full-final.json`
- `/tmp/opencode/widget-syntax-diffcheck-final.log`
- `/tmp/opencode/widget-critic-loop-final.log` and
  `/tmp/opencode/widget-critic-loop-final.summary`
- `/tmp/opencode/widget-coderabbit-final.out`
- `/tmp/opencode/widget-credential-scan-final.log`

### Review outcome

- The independent scoped widget review returned **no Critical or Required
  findings**.
- Its Minor alert-colour finding was fixed: `widget_alert` now uses the
  correct light- or dark-mode alert tint.
- The provider description finding was fixed:
  `android:description="@string/widget_description"` is wired to the native
  metadata.
- The credential-hygiene finding was fixed and pinned by inspecting EAS
  build-profile environment **key names** without printing secret values.
- CodeRabbit could not be run because its CLI is not installed; the exact
  unavailable result is recorded above rather than treated as a passed review.
