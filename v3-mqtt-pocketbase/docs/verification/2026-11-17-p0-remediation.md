# P0 remediation verification — 2026-11-17

**Status:** code and live-database work complete; fresh APK build and physical-phone verification in progress.
**Approval:** Master approved the full P0 batch after the read-only audit package.
**Branch:** `capstone-remediation-20261113`.

---

## 1. Evidence that drove the work

- Thermal service live but intermittent: valid 768-pixel frame, 2.07 FPS, 29 corrupt-frame rejections and one `not_converting` event this boot.
- App silently swallowed failed thermal fetches and pixel-count rejections.
- CCTV service active but camera offline: no lease, no AP association, no TCP:554, zero-byte snapshot, no on-disk frame.
- Only S3 mic is wired; it was offline. CCTV audio exists at the Pi's `/camera-audio`, but was not tied to an explicit app mode.
- Reads were open but pig writes were not server-enforced and carried no owner.
- App was local-only; Pi has Tailscale `100.69.139.63/32`.
- Notification permission was granted and channel existed at HIGH importance, but vibration was disabled on device and code did not explicitly enable it.

---

## 2. Scoped commits

| Commit | Scope |
|---|---|
| `3c7512f` | Thermal failure reasons and screening-only verdict labels |
| `40917bc` | CCTV mode control and grounded Tapo/CCTV recovery guide |
| `05ddd24` | Signed-in ownership policy for herd writes |
| `6305526` | PocketBase migration enforcing owner rules |
| `030dc73` | Local-first tunnel access to the same Pi |
| `96e5b89` | Notification channel and alert payload contract |

Unrelated dirty work (`docs/REPORT_*`, `docs/PROGRESS_UPDATE_20261115.md`, `docs/diagrams/`, `src/app/+not-found.tsx`, `src/app/thermal.tsx`, `scripts/dump_sources.py`, `tools/practice_*`) was not staged or changed.

---

## 3. Verification gates already passed

### Mobile
- `npm run test:unit` — all suites pass, including five new pure suites:
  - `thermal-diagnostics` 8 assertions
  - `cctv-control` 13 assertions
  - `pig-write-policy` 8 assertions
  - `remote-access` 10 assertions
  - `notification-policy` 9 assertions
  - `source-policy` 61 assertions now included in `test:unit`
- `npx tsc --noEmit --skipLibCheck` — clean.
- Scoped ESLint on changed files — 0 errors. One pre-existing `any` warning remains in `src/utils/pocketbase.ts`; no new warnings.

### Backend / portal
- `python3 -m unittest test_portal -v` — 11 tests OK, including the new remote-tunnel status assertion.
- `npm run ci:backend` from repo root — `backend OK`.

### Reviews
- `critic_loop.sh` passed on every changed source file. Markdown/HTML have no critic rules and were reported as such.
- `cr --plain --uncommitted` attempted; CodeRabbit remains unavailable (`cr: command not found`).

---

## 4. Live PocketBase migration

Backups taken before restart:

- Laptop: `/home/solrahk/sandbox/pigpulse-pb-migration-test/laptop-data.db.bak-20261117-134405`
- Pi: `/home/pigpulse/pocketbase/pb_data/data.db.bak-20261117-134405-pre-owner-writes` (+ WAL/SHM copies)

Sandbox validation:

- `pocketbase migrate up` applied `1794895200_updated_pigs_owner_writes.js`.
- Schema showed `ownerId` plus the expected create/update/delete rules.

Live result, verified through the admin API with credentials never printed:

```text
pigs create= '@request.auth.id != ""'
     update= '@request.auth.id != "" && ownerId = @request.auth.id'
     delete= '@request.auth.id != "" && ownerId = @request.auth.id'
fields= ['pigId', 'name', 'healthStatus', 'tags', 'ownerId']
```

Both Pi and laptop PocketBase instances report the same rules and field.

---

## 5. Behavior delivered

- Thermal failures now name the reason (`no-base`, `fetch-failed`, `frame-too-small:N`) in the subtitle and placeholder.
- Raw `FEVER`/`ALERT` verdicts are rendered as `ELEVATED SURFACE — SCREENING ONLY`; the center label is `Center (surface ROI)`.
- CCTV has OFF / VIDEO / VIDEO + AUDIO modes. OFF stops polling; stale frames are never rendered as live. AUDIO is enabled only when a recent camera frame proves reachability.
- Pig writes require a signed-in end user; owner id is stamped client-side and enforced server-side. Reads remain open for skip/guest users.
- Access is local-first: hotspot → encrypted tunnel to the same Pi → explicit offline recommendation. No cloud mirror or second box.
- Notification channel config is pinned (`alerts`, HIGH, vibrate enabled) and alert payload construction is tested.

---

## 6. Pending physical verification

- Install fresh preview APK over USB on `15187705AA004496`.
- Confirm notification permission/channel state after install.
- Confirm thermal failure reason is visible when the console frame is absent or malformed.
- Confirm CCTV OFF stops frame polling and VIDEO+AUDIO enables camera sound only with a recent frame.
- Confirm app still reaches Pi data on the PigPulse hotspot.
