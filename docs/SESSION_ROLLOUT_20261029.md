# SESSION ROLLOUT — 2026-10-29 (Elephant/Goldfish track map)

> Purpose: separate future work into focused sessions so no context bleeds between
> domains. The **elephant** (T0) holds the long memory: `CANON.md` + this manifest.
> The **goldfish** (T1–T6) are fresh sessions that load ONLY their track block below.
> All state flows through FILES — git, `CANON.md`, per-track notes — never chat memory.

---

## GLOBAL RULES (every session, append to any kickoff)

1. Claims require **device readouts**, peer-reviewed sources, or manufacturer docs — never assumptions.
2. **R8** — the moment something is confirmed working: archive with measured proof (firmware → `KNOWN_GOOD.md`, PB → timestamped `data.db` copy, configs → `-bak-YYYYMMDD`).
3. Double review (SOUL Article VIII): `critic_loop.sh` per touched file, then `cr --plain` inside the repo.
4. **Canon edits = T0's job only.** Workers append a short `## Track note YYYY-MM-DD` to `docs/track-<id>.md` and commit; T0 folds them into `CANON.md`.
5. Directory discipline: non-overlapping track dirs; risky refactors in a worktree.
6. Never commit secrets. `PB_PASSWORD`/RTSP creds live in untracked env files (`/etc/pigpulse/*`, `~/.config/pigpulse/*`).

---

## TRACKS

### T0 — CANON & ORCHESTRATION (the elephant)
- **Scope:** holds `CANON.md`, `AGENTS.md`, this manifest; folds track notes in; plans phases; runs the weekly progress update + Telegram handoffs.
- **Goal:** canon stays truthful, one file, supersession semantics (old claims struck, never deleted).
- **Never:** touch feature code.
- **Kickoff:** "You are the canon-keeper for PigPulse. Read CANON.md fully. Fold pending notes from docs/track-*.md into the canon (supersede, don't append duplicate truths). Update §6 open items with statuses. Produce the weekly update. No feature code."

### T1 — FIRMWARE (ESP32-S3 + sensors)
- **Scope dirs:** `v3-mqtt-pocketbase/firmware/**`
- **Goal:** (a) LWT/status MQTT topic so the dashboard shows alive/dead; (b) fresh serial capture **while WiFi connected** to settle the mic state against the Oct-19 flatline evidence (R8 once meaningfully captured); (c) SHT45 wired to verified-good I2C pins → CRC-valid readings → archive.
- **First move:** serial capture script + front-header pin sweep (Oct-17 audit discriminator).
- **Note file:** `docs/track-t1-firmware.md`.

### T2 — BACKEND & SYNC (the unblock)
- **Scope dirs:** `v3-mqtt-pocketbase/backend/{bridge,workers,scripts,systemd}/**`
- **Goal:** PB superuser password set (Telegram msg 34496 has credentials + runbook) → bridge green → `~/.config/pigpulse/sync.env` → `cloud_sync.py --once --dry-run` → real run → **first end-to-end Pi→cloud sync**, then R8 archive the data.db.
- **Never:** touch firmware or apps.
- **Note file:** `docs/track-t2-backend.md`.

### T3 — CCTV & AUDIO PROCESSING (offline-first corpus)
- **Scope dirs:** `v3-mqtt-pocketbase/backend/cctv/**`, new `v3-mqtt-pocketbase/backend/processing/audio/**`
- **Goal:** verify Tapo C200 RTSP **audio track exists** (ffmpeg probe, measured); creds → env; ingest normalizer = **16 kHz mono WAV, one shared schema** for INMP441 + CCTV sources; cough-clip extractor (VAD windowing) → corpus builder; then first cough-classifier prototype (Edge Impulse or PyTorch CPU) on collected clips.
- **Deep principle:** everything trains/evals **offline on recorded files first**. The classifier does not care which mic produced the clip, only that the format is identical.
- **Note file:** `docs/track-t3-audio.md`.

### T4 — FUSION & VISION (calibration + re-ID)
- **Scope dirs:** new `v3-mqtt-pocketbase/backend/processing/vision/**`
- **Goal:** two-camera calibration harness (AprilTag print → homography thermal↔CCTV), bbox overlay (CCTV pixel space; thermal reads real MLX grid), anonymous re-ID = register-once-then-match embeddings (no naming; cold start = new `P-####`).
- **Rule from canon §2.7:** thermal upscaling for **visual alignment only**, never for measured temperature; Pi 4B ceiling 2–3 FPS NCNN → event-driven, not continuous.
- **Note file:** `docs/track-t4-fusion.md`.

### T5 — APPS (web admin + mobile)
- **Scope dirs:** `v3-mqtt-pocketbase/backend/thermal-pi/static/**`, `frontend/mobile_app/**`
- **Goal:** **Feeds/Monitor becomes the primary tab** (CCTV + thermal + audio + ESP LWT status, surfacing serial-only diagnostics in dashboard); roster demoted to a hidden research sub-view; anonymous `P-####` IDs; TemperatureDisplay/PocketBase realtime polish.
- **Note file:** `docs/track-t5-apps.md`.

### T6 — RESEARCH / PAPER
- **Scope dirs:** `docs/**`, manuscript workspace
- **Goal:** manuscript checklist (0/8) starts moving: experiment-log template fed by T3/T4 eval outputs; methods section seeded from canon §2.7 provenance; defense narrative.
- **Note file:** `docs/track-t6-research.md`.

---

## PARALLELISM PROTOCOL

- **Day 1 order:** T2 + T3's RTSP-audio verification in parallel (independent dirs). Once T2 is green, all remaining tracks run freely.
- **Merge discipline:** tracks commit only into their own dirs on `feat/v3-mqtt-pocketbase`; T0 is the only canon writer; T5 owns all `static/**` + mobile.
- **Quality gates before any "done" claim:** hook scan (verified live 2026-10-29), critic_loop, CodeRabbit, honest status render, R8 archive.

## CURRENT BLOCKERS RECAP (canon §6 honest state)

| Item | Status | Unlocked by |
|---|---|---|
| PB admin password (11) 🔴 | set pending | Telegram 34496 runbook |
| cloud_sync end-to-end (1) 🔴 | never tested | T2 |
| mic fresh-capture decision | Oct-19 flatline | T1 |
| SHT45 unconnected | owned | T1 wiring |
| RTSP creds hard-coded (4) | in code | T3 |
| SD labels (14) | physical | Master |
| endurance microSD (18/19) | pending | T5/T3 ops |
