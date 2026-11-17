# P0 remediation verification — 2026-11-17

**Status:** complete. Code, live-database work, physical-phone verification, final rebuild, and final APK install are all done.
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
| `f5aeee2` | Mode-specific camera audio hint found during device testing |
| `c868cfe` | Documentation of physical P0 evidence |
| `d12d8d2` | Independent-review fixes: strict owner flow, re-probe, remote fallback |
| `c8026c8` | Strict owner-rule migration (force-added; migrations dir is gitignored) |

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

## 6. Physical-phone verification

Device: Infinix `15187705AA004496`, Android 16, connected to `PigPulse` at
`192.168.69.91`. Build `b2cc703f-6950-43b2-9f59-6e81f450f7d0` was installed
with `adb install -r` (`Success`). Artifact `97,227,266` bytes, SHA-256
`da6b203050384c87508ceef077cc080f11b9b507b24f8ec4c76bbab80e1074aa`.

Value-based APK scan: 1,665 ZIP entries / 129,484,195 decompressed bytes,
14 encoded variants of the `.env` credential values and variable names —
**PASS**, no hits.

Measured UI evidence:

- Thermal screen showed `No live frames — Pi console unreachable — check Pi
  power and PigPulse Wi-Fi`, `CENTER (SURFACE ROI)`, and
  `NO VERDICT — SURFACE ESTIMATE`.
- CCTV row showed `OFF / VIDEO / VIDEO + AUDIO`; VIDEO displayed
  `CCTV OFFLINE — no recent frame`, and tapping OFF changed the state to
  `CCTV OFF` with polling stopped.
- Camera-sound row was disabled with an honest mode-dependent hint. Physical
  testing found that `VIDEO + AUDIO` offline still said “switch to VIDEO +
  AUDIO”; this was fixed in `f5aeee2` and the final rebuild is in progress.
- Notification permission remained granted. A controlled verification alert
  (`deviceId=notification-verification`) produced a real Android notification
  with text `P0 notification verification — safe to delete`, and the channel
  then reported `mImportance=4`, `mVibrationPattern=[0,250,250,250]`,
  `mVibrationEnabled=true`. Both verification rows were deleted afterwards.
- The app continued to read live PocketBase telemetry over the PigPulse
  hotspot throughout testing.

### APKs

Intermediate build `a97c1bdf-64ba-445e-a7bc-783e07369092` (commit `c868cfe`)
verified the camera-audio copy fix: `97,227,570` bytes, SHA-256
`c27c20be21673289bf18c6aab099bc134718427e01e2938ad13bfd783a747bce`.

**Final review-fix build** `137f2c9d-bbca-440c-b332-9d19c41b9956`, commit
`9b7bfde`, installed with `adb install -r` (`Success`): `97,229,186` bytes,
SHA-256 `515837af637f93917fa0357329b16adf9900f1d9b6b2eef6f3d160abcf44544a`.
Value-based credential scan: 1,665 entries / 129,486,115 decompressed bytes,
14 encoded variants — **PASS**, no hits. The app launched cleanly and showed
live local PocketBase data after install.

Final UI check fixed the mode-specific audio hint: with `VIDEO + AUDIO` selected
and no camera frame, the row now reads
`No recent camera frame — camera audio unavailable`. The original bug had said
“switch to VIDEO + AUDIO” even while that mode was selected.

### Independent review follow-up

An independent read-only review found no Critical issues but four Required gaps,
all closed before final handoff:

1. **Create-rule owner binding:** migration `1794895500` now requires
   `ownerId = @request.auth.id` for create/update/delete. A temporary user test
   confirmed a spoofed owner create was rejected and a correct-owner create
   succeeded; both test records were deleted.
2. **Legacy rows:** the four pre-existing pigs were backfilled to
   `ownerId = legacy-admin` on both instances; they are explicitly admin-managed
   rather than silently unowned.
3. **Reachability re-probe:** `usePocketbaseRealtime` now re-probes with capped
   exponential backoff instead of pinning one launch-time result for the session.
4. **Malformed remote fallback:** a bad remote URL now fails closed only when
   remote is the selected source; it no longer disables a healthy local hotspot.

Live verification after `1794895500`:

```text
Pi + laptop:
create/update/delete = '@request.auth.id != "" && ownerId = @request.auth.id'
owners = {'legacy-admin': 4}
```

Temporary end-user test on the Pi: spoofed `ownerId` create returned HTTP 400;
correct-owner create succeeded; both the test pig and test user were deleted
and follow-up counts were zero.

Minor fixes: normalized remote URL, disabled portal tile no longer opens a dead
tab, and Mute stays tappable if the base disappears mid-listen.

Remote tunnel path was also measured from the laptop:
`http://100.69.139.63:8090/api/health` → HTTP 200, and
`https://100.69.139.63:8080/health` → valid frame (1.97 FPS, frame 41,655,
frame age 0.8 s) at 2026-11-17T14:22:10+08:00. The phone remained on the local
hotspot, so app-side failover was verified by the pure policy tests and tunnel
reachability, not by switching the phone to an external network.
