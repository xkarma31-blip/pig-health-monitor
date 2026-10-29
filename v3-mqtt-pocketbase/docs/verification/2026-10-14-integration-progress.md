# Integration execution checkpoint — 2026-10-14

Status: **in progress, not deployed, not end-to-end verified**.

User approved separate branch: `fix/local-firmware-app-integration-20261014`.
Existing uncommitted work was carried forward; it must not be included blindly
in a future commit or reverted wholesale.

## Recovery evidence

Local checkpoint `pigpulse-checkpoint-20261014-1791934666306` under the user's
sandbox was extracted into its own `restore-check` directory. All 619 manifest
files were present. Git bundle verification reported a valid complete history.
Previously captured SQLite backups passed integrity checks. This is not a
booted restoration of the app, a Pi SD backup, or an ESP flash backup.

## Changes made

- Sync no longer acknowledges old records without attempting destination
  delivery. Original timestamp values are preserved.
- Source/destination authentication or reachability failures increment failure
  counts, preventing those early exits from appearing successful.
- Preserve empty same-origin web base URL in the shared PocketBase client.
- Native main telemetry hook uses its existing polling path instead of its
  incomplete EventSource handshake.
- Prevent an older timestamped row overwriting a newer row for the same node.

## Verification performed

- Four stdlib sync regression tests: three failures reproduced before the fix;
  all four pass afterward. These use fake endpoints, not live databases.
- App TypeScript check passed after client/hook changes.
- No deployment, hardware flash, service restart or sync activation.

## Remaining work

- Sync fetch errors still need explicit propagation; duplicate delivery and
  backlog behavior require integration coverage.
- App setup endpoint consumption, cache/server isolation, freshness UI and
  acoustic field mapping remain unfinished.
- Hook ordering guard needs dedicated behavioral tests including invalid and
  future timestamps; incomplete SSE code remains unused and needs cleanup.
- UI polish, browser/phone tests and required code review have not run.
- Pi/ESP backup, current hardware access and actual-phone verification remain
  required before claiming hardware recovery or end-to-end success.
- Subagent review did not run successfully; do not claim independent review.

Resume from the local integration plan without treating this checkpoint as
completion. Hardware being unplugged is not a diagnosed defect.
