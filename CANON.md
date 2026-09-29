# ARCHITECTURAL CANON & SOURCE OF TRUTH

> **CRITICAL DIRECTIVE FOR ALL AGENTS (HERMES, OPENCODE, CURSOR, CODEX, SCRIPT RUNNERS)**
>
> 1. **CANONICAL LOCATION**:
>    - The single, immutable project directory for the Pig Health Monitor / PigPulse system is:
>      `/home/solrahk/pig-health-monitor`
>    - Primary Git Remote: `git@github.com:xkarma31-blip/pig-health-monitor.git`
>    - Active Working Branch: `feat/v3-mqtt-pocketbase`
>
> 2. **OFFLINE ARCHIVE RULE**:
>    - `/home/solrahk/PigHealthMonitor_ARCHIVE_OFFLINE` is a read-only historical archive.
>    - **NEVER** edit, create, build, or deploy files in `PigHealthMonitor_ARCHIVE_OFFLINE`.
>    - **NEVER** create parallel PascalCase folders like `PigHealthMonitor`.
>
> 3. **PROJECT TOPOLOGY (V3 MQTT POCKETBASE)**:
>    - **Backend (Bridge & Setup)**: `/home/solrahk/pig-health-monitor/v3-mqtt-pocketbase/backend/`
>    - **Database & Services**: `/home/solrahk/pig-health-monitor/v3-mqtt-pocketbase/deploy/pocketbase/`
>    - **Docker Services (Mosquitto, Valkey, Thermal WS)**: `/home/solrahk/pig-health-monitor/v3-mqtt-pocketbase/deploy/docker/`
>    - **Mobile App (Expo / React Native)**: `/home/solrahk/pig-health-monitor/v3-mqtt-pocketbase/frontend/mobile_app/`
>    - **Landing Page (Vercel Production)**: `/home/solrahk/pig-health-monitor/v3-mqtt-pocketbase/frontend/landing_page/`
>    - **Firmware**: `/home/solrahk/pig-health-monitor/v3-mqtt-pocketbase/firmware/`
>
> 4. **PERMISSIONS & SYSTEM INTEGRITY**:
>    - **NEVER** run commands in this repo using `sudo` unless modifying a `/etc/systemd/system/` unit file.
>    - Builds, installs (`npm`, `pip`), git operations, and script edits MUST run under user `solrahk`.
>    - The automated Vercel deploy script (`/home/solrahk/.local/bin/pigpulse-autodeploy.sh`) deploys strictly from `frontend/landing_page`.

## Current Public Web Canon (2026-09-29)

The public PigPulse experience uses one Vercel project and one canonical domain:

- `https://pig-health-monitor.vercel.app/` is the landing page and first visitor entry point.
- `https://pig-health-monitor.vercel.app/app/` is the Expo web app shell.
- `https://pig-health-monitor.vercel.app/app/tabs` is the main Expo dashboard route.
- Landing-page dashboard buttons must link to the same-domain `/app/tabs` route.
- The current Expo export is staged below `frontend/landing_page/app/` for the combined deployment.
- The domain root must remain the landing page; do not replace `/` with the dashboard.
- `https://pig-health-research-portfolio.vercel.app/` is a secondary portfolio alias, not the canonical app entry point.

## Documentation Authority

- This file is authoritative for repository location, branch, deployment topology, and safety rules.
- `PIGPULSE_EXTERNAL_AI_CONTEXT.md` is the sanitized portable handoff for AIs without local-file access.
- Current source and deployment configuration take priority over dated orientation snapshots.
- Any document describing the domain root as the Expo dashboard or describing a separate dashboard hostname is historical unless this section is explicitly updated.
