# legacy/ — frozen, superseded, NOT deployable

> Everything in this directory is **historical reference only**.
> Nothing here builds, flashes, or deploys. Do not edit it to "fix" anything —
> the canonical code lives elsewhere (see `../CANON.md`).

## Why this directory exists

These trees were superseded when PigPulse moved to the V3 MQTT + PocketBase
architecture, but they were kept checked in because they document *why* the
current design looks the way it does. Deleting them would lose the record of
the Firebase-era era and the D0WD firmware lineage.

They previously sat at the repository root, where their plausible filenames
(`firmware/platformio.ini`, `landing_page/index.html`) made them look live.
That is not a hypothetical problem: during work on 2026-09-30 a repo file was
read as if it were the active gateway config when the live config was a
different architecture entirely. They are now quarantined here so the repo
root only ever contains canonical trees.

## Contents

### `firmware/` — retired ESP32-D0WD

Frozen ESP32-D0WD + Firebase firmware. **The D0WD itself is decommissioned.**

- `platformio.ini` declared the `mobizt/Firebase Arduino Client` dependency,
  removed 2026-09-29.
- `include/secrets.h` carried a committed Firebase URL and plaintext password,
  purged 2026-09-29.
- `esp32d0wd-pigpulse/` holds untracked D0WD hardware work. The D0WD is
  decommissioned, so this is the only reason the tree still existed.
- **Do not reuse its MQTT topic scheme.** It uses `pig/telemetry/{x}`, which is
  *incompatible* with the bridge, which expects `pig/{deviceId}/{channel}`.

Canonical firmware: `../v3-mqtt-pocketbase/firmware/`.

### `landing_page/` — Firebase-era landing copy

A stale subset of the marketing page carrying a Firebase-era `vercel.json`
and `config.js`.

**Do not deploy from it.** Production is the combined site assembled from the
canonical landing plus the Expo export:

- landing: `../v3-mqtt-pocketbase/frontend/landing_page/`
- dashboard source: `../v3-mqtt-pocketbase/frontend/mobile_app/`
- public: `https://pig-health-monitor.vercel.app/` (landing) and
  `https://pig-health-monitor.vercel.app/app/tabs` (dashboard)

`scripts/deploy-landing.sh` used to point at this directory. That was a loaded
footgun and now points at the v3 tree.

## Rules

1. Never build, flash, deploy, or extend anything in here.
2. Never copy topic schemes, ports, or config out of here without checking the
   canonical tree first.
3. If you need the historical *reasoning*, read it here. If you need the
   *current truth*, read `../CANON.md` and `../PIGPULSE_EXTERNAL_AI_CONTEXT.md`.
4. CI enforces that these directories carry their `NON-CANONICAL.md` markers.
   Do not remove those files.
