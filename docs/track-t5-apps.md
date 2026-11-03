# Track T5 — APPS (Home-first app revamp: honest labels, end-user / technician split)

**Track note file** (worker-owned; T0 folds it into `CANON.md`).
**Scope (rollout manifest):** `v3-mqtt-pocketbase/frontend/mobile_app/**`,
`v3-mqtt-pocketbase/backend/thermal-pi/static/**`.
**This change set (2026-11-03):** `frontend/mobile_app/src/**` only.
**Never touched:** firmware, `backend/**` (incl. `thermal-pi/static/`), `CANON.md`, landing page.

> **Status: approved by Master and committed (2026-11-03; hash in `git log`).**
> tsc 0 · eslint 0 errors · critic_loop 9/9 · expo web export OK · DOM checks 41/41.
> Not deployed, no APK. Read "Honest limits" before claiming anything works on a phone.

---

## 1. Direction reset — this note supersedes the 2026-10-29 T5 brief

The 2026-10-29 rollout brief asked for a **monitor-first** app ("Feeds/Monitor becomes the
primary tab", roster demoted to a hidden research sub-view, anonymous `P-####` IDs).
That direction was implemented as `fd5f5f1` and **reverted by Master in `d660e31`**.
The version of this file that described it was deleted by the revert; it is still
readable as history: `git show fd5f5f1:docs/track-t5-apps.md` (306 lines, superseded).

**Standing direction (what this change set implements):**

| 2026-10-29 brief (superseded) | Standing direction (this change set) |
|---|---|
| Feeds/Monitor becomes the primary tab | **Home stays primary.** No tab restructure. |
| Roster demoted to a hidden research sub-view; anonymous `P-####` | **Roster stays a normal tab** with real pig names; copy says the barn mic monitors the whole pen. |
| Navy/cyan extends over the app | Navy/cyan `#1A1A2E` is the **Pi console** palette, not the app's. App keeps neutral canvas + green accent (`#1E8449` light / `#3DDC84` dark). |
| (implied) monitor surfaces everywhere | **End users must not get admin-like monitoring surfaces.** Technician surfaces (web island: CCTV / thermal diagnostics / serial-only info) are **admin-gated**. |
| — | Consistency + honesty pass: naming restored (saved farm/pen names, PB `devices.name`), simulations labeled as simulations. |

---

## 2. What changed — 9 modified + 1 deleted (all under `mobile_app/src`)

| File | Change |
|---|---|
| `src/components/AuthGuard.tsx` | New `requireAdmin` prop: `allowed = Boolean(user) && (!requireAdmin \|\| Boolean(user?.admin))`. Gate copy: "Admins only" + "This dashboard is for the technician account…" (was "🔒 Authentication Required"). Re-themed via `useTheme()` — dropped the hardcoded navy `#1A1A2E`. Blocked state has **no dead ends**: "← Back to app" always, plus "Admin sign-in" (signed out) / "Sign out & switch account" (signed in, non-admin). |
| `src/app/web/_layout.tsx` | `<AuthGuard>` → `<AuthGuard requireAdmin>` — **the technician island no longer opens for ordinary signed-in users.** |
| `src/app/tabs/index.tsx` (Home) | Farm name from `loadFarmerSetup()` (re-read on focus) instead of hardcoded "Sundown Farm". Device rows labelled via `subscribeDeviceNames` (PB `devices.name` keyed by `deviceId`). Thermal card: "Live thermal feed" → **"Thermal view"** + "Simulated preview of the thermal camera" + always-**"Demo"** badge. Pen label falls back to the saved pen name. |
| `src/app/tabs/roster.tsx` | Demo pill when `!user \|\| user.admin \|\| !liveHerd`. Enroll copy: "Adds this pig to the roster. The barn mic (s3-mic-01) monitors the whole pen…" (no INMP441 near-pig-capture claim). Toast "added to the roster". `enrolled` date reads `record.created` (the real schema field). |
| `src/app/tabs/events.tsx` | Demo pill when `!user \|\| user.admin \|\| !liveEvents`. |
| `src/app/tabs/settings.tsx` | Demo pill when `!user \|\| user.admin \|\| !liveNodes`. Demo nodes relabelled "Thermal node (MLX90640)" / "Barn mic (ESP32-S3)". `mapSensor` shows the PB `label` as-is (no inferred "INMP441/MLX90640" suffixes). Login CTA copy: "Switch from demo data to live events, roster, and sensor readings". |
| `src/app/thermal.tsx` | Removed the dead "Open live Pi dashboard" button (self-signed-cert technician path). Header **"Thermal view"** / "Preview of the thermal camera grid"; keeps the **DEMO SIMULATION** badge. |
| `src/components/ThermalLiveView.tsx` | HUD is now conditional: real frame → sensor HUD; **no frame → "SIMULATED PREVIEW \| RES: 32x24" + "NO SENSOR STREAM — DEMO FRAME"** (was sensor HUD text unconditionally). |
| `src/utils/pocketbase-data.ts` | `enrollPig` writes schema-fitting fields (`pigId`, `name`, `healthStatus`, `tags`; dropped `enrolledAt`). New `subscribeDeviceNames` — `deviceId → devices.name` (refresh is best-effort — see §6.6). |
| `src/components/primitives/TemperatureDisplay.tsx` | **Deleted** — dead component; it carried **all 61 of HEAD's tsc errors** (see §4). |

---

## 3. The split, precisely (who sees what)

**End-user surfaces:** tabs (Home / Events / Roster / Settings), `/thermal`, `/login`.

**Technician surface:** the `/web/**` island (dashboard, nodes, logs…).

- The gate is `user.admin === true`, which only happens when the **PocketBase admin
  endpoint** answered the login (`utils/pocketbase-auth.ts`, login-page role toggle).
  A normal `users` record can never set it — verified in the session matrix (§4).
- **Demo marking matrix** (demo data shown in exactly these states):
  - roster pill: `!user || user.admin || !liveHerd`
  - events pill: `!user || user.admin || !liveEvents`
  - settings pill: `!user || user.admin || !liveNodes`
  - Home: no pill; stale public telemetry is labeled "Stored readings · waiting for
    fresh sensor data" / "Stored data" (pre-existing design), and the thermal card
    always carries the "Demo" badge because the thermal view is always a simulation.

**Before → after evidence (same routes, chromium, real PocketBase):**

| Surface | Before (HEAD `fefeb33` app) | After |
|---|---|---|
| `/web/dashboard` as normal user | Island **rendered** — "Welcome back, demo.farmer! … Herd Health Overview … Add Pig" | **"Admins only"** — island hidden |
| `/web/dashboard` signed out | "🔒 Authentication Required …" | "Admins only" |
| `/web/dashboard` as PB admin | Island rendered | Island rendered (unchanged) |
| Home thermal card | "Live thermal feed" + "Live" badge | **"Thermal view"** + "Demo" badge + "Simulated preview…" |
| Home device rows | raw IDs (`esp32-002`, `s3-mic-01`) | PB names ("Node esp32-001", "Device s3-mic-01", "PigPulse Pi 4B (MLX90640)") |
| Home header | hardcoded "Sundown Farm · …" | saved farm name, or neutral "Connecting to PocketBase…" |

---

## 4. Verification performed (measured 2026-11-03)

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | **0 errors.** HEAD baseline measured in a detached worktree: **61 errors — all 61 in the deleted `TemperatureDisplay.tsx`**. |
| `npx eslint` on the 9 changed files | **0 errors**; 11 warnings, all pre-existing patterns (identical counts at HEAD). |
| `critic_loop.sh` (Article VIII layer 1) | **9/9 PASS.** |
| `npx expo export -p web` | Success (after build and before build both exported). |
| DOM-text assertions (chromium harness) | **41/41** — signed-out 20/20, end-user 15/15, admin 6/6 (incl. the 2 back-affordance checks added after review feedback); 0 page errors, 0 HTTP ≥ 400. |
| Stash round-trip safety | Before-build export taken via `git stash push -- …/mobile_app/src` → export → `git stash pop`; working tree **STATUS MATCHES + TREE MATCHES** byte-for-byte (92 files). Branch HEAD has since advanced (`905a61e`…`64544c0`, thermal-pi + docs only); `mobile_app` is untouched between `fefeb33` and HEAD (verified). |
| Evidence bundle | `~/sandbox/app-revamp-20261103/` — `before/` 22 files, `after/` 32 files (PNGs + DOM text dumps), `compare/` 6 labeled before/after side-by-side PNGs (the Telegram approval pack), `src-after.patch` + full byte-identical `src-backup-20261103-074424/`, harness (`spa_server.py`, `verify_dom.js`, `capture.js`, `probe_before.js`). |

**Harness notes (durable, avoid re-learning):**

- `spa_server.py` serves the Expo web export under `/app` (same baseUrl as production)
  and proxies `/api/*` to PocketBase on `:8090`, including an emulation of the Vercel
  read-only bridge (`api/telemetry.js`) so signed-out/stored-data paths behave like prod.
- A viewport-resize race made early verification runs **falsely fail**: crossing the
  mobile/desktop breakpoint unmounts device rows for ~300 ms–1 s. `dump()` now waits
  for the text to settle (two identical reads); screenshots settle 1600 ms. This was a
  harness bug, not an app bug.
- The `user` session needs a PocketBase *user* account. A temporary one
  (`demo.farmer@pigpulse.local`) was created for the run and **deleted afterwards** —
  users collection is back to 0 items, so re-running that session means recreating it.
- **Review-feedback round (2026-11-03):** back affordances added to the blocked screens
  ("← Back to app" + "Admin sign-in" / "Sign out & switch account"); full re-run after the
  change: tsc 0, eslint 0, re-export, **41/41**, screenshots refreshed.
- Review layers: layer 1 (critic_loop) ran. Layer 2 (CodeRabbit `cr`) could **not**
  run — the CLI is installed but not signed in (`coderabbit auth login` is an
  interactive step). A read-only reviewer-agent pass over the diff ran instead:
  3 MED + 1 LOW, **all pre-existing** — provenance confirmed against `git diff HEAD`
  (none of the flagged lines were touched by this change set); folded into §5/§6.
  The same pass confirmed `enrollPig` matches the migrated `pigs` schema, the gate is
  correct for signed-out/user/admin, `subscribeDeviceNames` keys match telemetry
  keying, and there are no dangling references to the deleted component.

---

## 5. Honest limits (do not oversell)

- **Committed — and revert-verified.** Approved by Master 2026-11-03; committed on
  `feat/v3-mqtt-pocketbase` (hash in `git log`). Revert = `git revert <hash>` (verified
  clean in a scratch worktree) or restore from the evidence bundle (patch + byte-identical
  `src` backup). **Not pushed.**
- No deployment, no APK, no physical-phone run — verification was the web export in
  headless chromium against the local PocketBase.
- DOM assertions check rendered text, not pixels; the PNGs in the evidence bundle are
  the visual record.
- PocketBase telemetry is stale (newest frame 2026-09-27). The "live" surfaces were
  exercised against stored frames; the app labels this honestly ("Stored readings").
- The thermal view remains **always the simulated preview** — no live frame path from
  the Pi is wired to the app today. It is now labeled as a simulation in all three
  places (Home card badge, `/thermal` header, HUD).
- The Pi was unreachable (unplugged) this session — nothing here is Pi-side verified.
- **The admin gate is UI separation, not a security boundary.** `user.admin` is
  rehydrated from localStorage/AsyncStorage and is client-forgeable (only a token
  string is checked — `pocketbase-auth.ts`), and the collections the island reads are
  anon-readable (PB list rules open — spot-checked 200 without auth). Before this
  change the island opened to *any* signed-in user, so the gate is a strict
  improvement, but it must not be described as access control.
- Pre-existing working-tree changes outside this change set were left untouched
  (`docs/REPORT_*.md`, `backend/thermal-pi/static/index.html`,
  `backend/thermal-pi/web_server.py`, untracked docs/tools); the stash round-trip
  proved they were unaffected.

---

## 6. Follow-ups (found during the pass — deliberately NOT fixed here)

1. **`lastSeen` unit mismatch — live settings shows wrong node states.** ESP32 rows
   carry epoch **seconds**, the Pi carries **ms**, `s3-mic-01` carries `0`; the
   devices→sensor mapping (`toLiveSensor`) and `mapSensor` parse as ms, so captured
   live settings rendered esp32-001/002 and the Pi as **"Offline"** and `s3-mic-01`
   as **"Active"** (falsy `0` falls back to "now"). Fix needs per-value normalization
   (`telemetryTime`-style) in `pocketbase-data.ts` / `usePocketbaseRealtime.ts`.
2. **Events timestamps are mixed-unit.** The six seeded demo alerts carry **seconds**
   (`backend/setup/seed_pocketbase.py:134`), the live bridge writes **ms**
   (`local_bridge.py:279`), and `formatTimestamp` treats raw numbers as ms → the
   seeded alerts render "Jan 22" (**1970**, year hidden) instead of Sep 2 — visible
   in `after/v-12-events-user.txt`. One shared normalizer fixes both units.
3. **`batteryPct` / `rssi` / `firmware` unmapped.** Devices rows carry `batteryPct`
   (78/77) but `toLiveSensor` drops it; settings renders battery "—", signal "—",
   version "unknown" for every live node.
4. **`toLiveSensor` defaults non-mic device types to `'thermal'`** — a Pi node will be
   typed as thermal regardless.
5. **`subscribeSensors` ripple.** Two other consumers exist
   (`AdvisorModal.tsx:72`, `useOfflineTelemetry.ts:42`) — revisit together with #1/#3.
6. **Device-name refresh is best-effort (LOW).** Native polls only newly *created*
   records; deployed web depends on the SSE path through the hosting proxy — a rename
   may need a reload. Cosmetic; mirrors the roster/alerts subscriptions.
7. **`src/app/web/nodes.tsx:17` still says "INMP441"** — inside the now-admin-gated
   island (technician-facing), so lower priority; decide whether to correct the label.
8. **Signed-out Home shows stored public bridge telemetry** ("Stored data"). Pre-existing
   design; decide whether end users should see stored readings at all before sign-in.
9. **Push notifications and widgets** — future track, explicitly not in this change set.
10. **Web island numbers are hardcoded mock** — `app/web/dashboard.tsx` builds its pigs
    with `generateMockData()` (Bessie/Daisy/Coco/Lucy, invented temps). The island is a
    legacy technician review surface. Decide: keep it as a clearly-labeled review surface
    or wire real PB data. (Review feedback 2026-11-03.)
11. **Live thermal is NOT wired into the app.** The Pi serves live frames today (web
    `/data` endpoint, MQTT `pig/+/thermal/live`, broker WS on `:9001`; console live at
    `https://192.168.69.1:8080/` — reachable and verified 2026-11-03). The app's legacy
    `/feed` route looks for `thermalFrame` from `esp32-s3-01` — a device id and field
    names that no longer exist — so the app always falls back to the labeled simulation.
    Next step: wire the Pi path when on the PigPulse network, keep the simulation otherwise.
12. **Data attribution model (Master's direction, 2026-11-03).** Unsigned sessions may show
    live data but unattributed ("temporary"); signing in should record/classify data to a
    farm/pen. Not implemented today — sign-in is currently view-only.
13. **The island itself has no "back to app" link** (admins navigate via the island's own
    bottom nav). Add one when the island is next touched.

---

## 7. Reproduce

```bash
cd v3-mqtt-pocketbase/frontend/mobile_app

npx tsc --noEmit          # expect 0
npx eslint src/app/tabs/{events,index,roster,settings}.tsx src/app/thermal.tsx \
  src/app/web/_layout.tsx src/components/{AuthGuard,ThermalLiveView}.tsx \
  src/utils/pocketbase-data.ts                      # expect 0 errors

npx expo export -p web --output-dir /tmp/opencode/dist

# serve + verify (harness copies: ~/sandbox/app-revamp-20261103/)
python3 spa_server.py /tmp/opencode/dist 9301      # /api -> PB :8090
node verify_dom.js http://127.0.0.1:9301 /tmp/out signedout
CAP_EMAIL='<temp pb user>' CAP_PASS='<pw>' node verify_dom.js http://127.0.0.1:9301 /tmp/out user
CAP_EMAIL='<pb admin>'     CAP_PASS='<pw>' node verify_dom.js http://127.0.0.1:9301 /tmp/out admin

# before-build comparison (HEAD app state):
git stash push -m before-build -- v3-mqtt-pocketbase/frontend/mobile_app/src
npx expo export -p web --output-dir /tmp/opencode/dist-before
git stash pop
```

Local dev credentials come from `/etc/pigpulse/bridge.env` (never a default).

---

## 8. Canon deltas for T0

- **T5 direction reset (supersedes the 2026-10-29 T5 brief):** Home stays primary;
  app accent stays green; end-user vs technician split — the `/web/**` island is
  gated `requireAdmin` (`user.admin === true` = PB admin login only).
- "Roster deleted / anonymous `P-####`" is **not** the direction; roster stays as a
  normal tab with whole-pen copy, demo-pill logic as in §3.
- The thermal view is **always simulated today** and is now labeled as such in all
  three surfaces (Home card, `/thermal`, HUD).
- `enrollPig` writes schema-conforming `pigs` fields (`pigId`, `name`,
  `healthStatus`, `tags`).
- Home device rows are named from PB `devices.name` keyed by `deviceId`
  (`subscribeDeviceNames`).
- New open items (see §6): `lastSeen` unit mismatch + `s3-mic-01` `lastSeen: 0` falsy →
  wrong node states; events timestamps are mixed-unit (seed **seconds** / bridge **ms**)
  → seeded alerts display 1970 dates until normalized.
- The `requireAdmin` gate is UI separation, not access control (client-side flag;
  collections are anon-readable).
- Live-path facts (2026-11-03): the Pi is reachable at `192.168.69.1` and streams real
  data (PB `:8090`, thermal console `:8080`, MQTT `:1883`, broker WS `:9001`, mic TCP
  `:9090`); the app wires **none** of it yet (§6.11). The web island's numbers are
  hardcoded mock (§6.10).
- Blocked technician screens must never dead-end: "← Back to app" + sign-in /
  switch-account affordances are part of the gate (AuthGuard).
- Status: **committed** 2026-11-03 (`feat/v3-mqtt-pocketbase`); revert = `git revert <hash>`; not pushed.
