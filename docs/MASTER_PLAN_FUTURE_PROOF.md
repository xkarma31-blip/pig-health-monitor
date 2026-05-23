# Master Plan — Future-Proof (Capstone + Sentinel)

**Version:** 3.0 · **Date:** 2026-05-22  
**Index:** `docs/PLAN_INDEX.md` (authority when docs conflict)  
**Audience:** You, Cursor, Hermes, OpenCode, Telegram agents.  
**Do not** re-audit the whole UI unless a phase is blocked.

**Health check:** `bash ~/.cursor/scripts/health-check-all.sh`

**Hermes routing (live):** `active_profile: gemini` — see `~/.hermes/PROVIDER_STATUS.md`

**Online references used (2025–2026):**

- Expo web deploy: https://docs.expo.dev/guides/publishing-websites/ (`single` vs `server` vs `static`)
- Expo Router / Vercel: https://docs.expo.dev/router/web/api-routes/
- Firebase + Expo: https://firebase.google.com/docs + JS SDK auth/rules pattern
- CodeRabbit: https://docs.coderabbit.ai/cli + https://docs.coderabbit.ai/reference/configuration
- OpenClaw/Hermes gateway: https://docs.openclaw.ai/channels/telegram + model `primary` + `fallbacks` chain

---

## 0. What you did in Cursor (41 reviews)

| Action | Effect |
|--------|--------|
| Click **41 reviews** (CodeRabbit / review panel) | Shows **comments on uncommitted diff** — **not** commit, **not** push, **not** deploy |
| **65 uncommitted changes** in Source Control | Local only (~+842 / −10,522 lines — mostly deleted old tabs) |
| **Create Branch & Commit** (if pressed) | Saves to **local git**; still need **push** + **Vercel** for production |

**Assistant has NOT committed** unless you explicitly asked after this plan.

---

## 1. Canonical URLs & paths

| Item | Value |
|------|--------|
| Codeberg (public) | https://codeberg.org/Solrahk/pig-health-monitor |
| Local repo | `/home/solrahk/Projects/pig-health-monitor` |
| Production (**canonical**) | https://pig-health-monitor.vercel.app |
| Research landing | https://pig-health-research-portfolio.vercel.app (`landing_page/`, `config.js`) |
| Live app (canonical) | https://pig-health-monitor.vercel.app |
| Legacy app alias | https://pig-health-monitor.vercel.app — same Expo build; prefer canonical in new links |
| Sentinel hub | `~/.cursor/` (`MANIFEST.json`, `FUTURE_PROOF.md`) |
| Hermes | `~/.hermes/` (`sentinel_models.yaml`, `PROVIDER_STATUS.md`) |
| Secrets | `~/.config/environment.d/sentinel.conf` (never commit) |
| AI entry | This file + `AGENTS.md` |

---

## 2. Live provider status (probe 2026-05-22)

| Provider | Status | Action |
|----------|--------|--------|
| Groq | **error 1010** (network/CF) | Fix network; verify `GROQ_API_KEY`; retry probe |
| OpenRouter free | **429** daily quota | After ~08:00 local: `clear-openrouter-pool.py`, `active_profile: cloud`, sync, restart gateway |
| Ollama `phi4-mini` | Available (64K+) | Hermes fallback — slow on 8 GB RAM |
| `qwen2.5-coder:3b` | 32K only | **Never** Hermes main (crashes <64K) |

Commands:

```bash
python3 ~/.hermes/scripts/probe-providers.py
python3 ~/.hermes/scripts/sync-models-config.py   # after profile change
systemctl --user restart hermes-gateway.service
# Telegram: /reset then test message
```

---

## 3. Execution phases (strict order)

### Phase 0 — Security (before any push)

| ID | Task | Why |
|----|------|-----|
| S1 | Add `firebase_config/firebase-adminsdk.json` to `.gitignore` | Service account in tree |
| S2 | Remove adminsdk from git history if ever pushed | Rotate Firebase keys |
| S3 | Move API keys out of `mobile_app/eas.json` → EAS secrets | Expo best practice |
| S4 | Test passwords → env vars in `scripts/test/*` | Stop embedding `357631` |
| S5 | Rotate Codeberg password in remote URL → SSH | Remote currently has embedded credential |

### Phase A — Save capstone work (human says “commit”)

```bash
cd ~/Projects/pig-health-monitor
git status   # review 65 files — exclude APK, logs, secrets
git add mobile_app/src/hooks/ mobile_app/src/app/ scripts/test/ docs/*.md AGENTS.md .coderabbit.yaml
git commit -m "feat(mobile): Firebase telemetry, tab revamp, E2E routes, master plan"
git push origin master
```

### Phase B — Fix RTDB path alignment (**CRITICAL**)

**Problem:** Mobile uses `/users/$uid/commands|sensors|alerts|roster`. Firmware uses root `/commands/esp32-s3-01`, `/telemetry/{id}`, `/alerts`.

**Files:** `firmware/src/main.cpp`, `mobile_app/src/utils/firebase.ts`, `firebase_config/database.rules.json`

**Done when:** Enroll from Analytics reaches ESP32; telemetry appears under same tree mobile reads.

**Options (pick one in implementation):**

1. Firmware signs in / uses fixed service UID prefix under `/users/{farmUid}/...`
2. App also listens to legacy root paths during migration
3. Document dual-write period in rules

### Phase C — Deploy web (Expo + Vercel)

Per [Expo publishing](https://docs.expo.dev/guides/publishing-websites/): project uses **`web.output: single`** SPA → `npx expo export -p web` → `mobile_app/dist`.

```bash
cd ~/Projects/pig-health-monitor/mobile_app
npx expo export -p web
# Vercel: root vercel.json → build + dist output
```

**Done when:** https://pig-health-monitor.vercel.app shows new bundle; login → Home has **live** Firebase data.

**Future:** If you need `api/chat.js` server routes on Vercel, migrate to `web.output: server` + Expo server adapter ([docs](https://docs.expo.dev/router/web/api-routes/)).

### Phase D — Wire remaining tabs

| Tab | File | Status |
|-----|------|--------|
| Home | `index.tsx` | ✅ `useOfflineTelemetry` |
| Events | `events.tsx` | ✅ `subscribeAlerts` (live list) |
| Analytics | `analytics.tsx` | ✅ `subscribeRoster` + `enrollPig` |
| Nodes | `nodes.tsx` | ⏳ mock OK for defense OR wire `subscribeTelemetry` later |

**Done when:** Logged-in user sees Firebase data on Home, Events, Analytics.

### Phase E — Code quality & tests

```bash
./scripts/test/capstone_smoke.sh
cd mobile_app && npx tsc --noEmit          # fix GlassCard/expo-blur, ScalePressable path
node scripts/test/e2e_test.js              # update guest banner / AUTHENTICATE assertions
```

**CodeRabbit** (from repo root, [CLI docs](https://docs.coderabbit.ai/cli)):

```bash
cr doctor
cr --plain
cr --agent --type uncommitted
```

Customize `.coderabbit.yaml`: exclude `firebase-adminsdk.json`, lockfiles, `scripts/test` credentials.

### Phase F — Docs & branding

- Replace Supabase/PocketBase → Firebase RTDB in `docs/technical_specs.md`, research docs
- `docs/task.md`: `roster.tsx` → `analytics.tsx`
- One product name (HUSH HOG vs PigPulse) across `index.tsx`, `Sidebar.tsx`
- Remove or relocate root `DESIGN.md` (unrelated OpenCode spec)

### Phase G — Defense & research (when ready)

- Phase 3 `docs/task.md`: TIRPigEar dataset, acoustic SNR calibration
- Phase 4: `node scripts/test/demo_recorder.js` → defense video
- Firmware field test on ESP32 AP `192.168.4.1/data` — align with `useOfflineTelemetry` URL

### Phase H — Sentinel maintenance (parallel)

```bash
bash ~/.cursor/scripts/maintain-sentinel.sh
bash ~/.cursor/scripts/verify-sentinel-base.sh
```

| Task | Reference |
|------|-----------|
| Sync model docs with `sentinel_models.yaml` | `VESSEL_RELIEF.md`, `MODEL_SETUP.md`, `PROVIDER_STATUS.md` |
| Cursor MCP enable | Full restart + Settings → Tools & MCP |
| Crontab | Remove `update_device_contents.sh` if unused |
| Hermes pull | `apply-overlays.sh` then restart gateway |
| CodeRabbit GitHub/Codeberg app | Install on remote for PR reviews |

**Future-proof rules:** `~/.cursor/FUTURE_PROOF.md` — single soul, single model YAML, overlays not forks, secrets in `sentinel.conf`.

---

## 4. What is already done (do not redo)

- `useOfflineTelemetry` → Firebase when online + authed
- `analytics.tsx` enroll → `enrollPig()`
- E2E scripts → `/events`, `/analytics`, `/nodes`, `/login`
- `scripts/test/capstone_smoke.sh`
- Sentinel: `sentinel_models.yaml`, overlays, Article VIII CodeRabbit skill, rituals archived
- Telegram handoff message (prior session)

---

## 5. Skills & commands (mandatory reuse)

| Need | Use |
|------|-----|
| Sentinel health | `maintain-sentinel` / `~/.cursor/scripts/maintain-sentinel.sh` |
| Code review | `/code-review` or `cr --agent` |
| Capstone check | `/capstone-check` if configured |
| PR/CI | skill `babysit` |
| Split PRs | skill `split-to-prs` |
| Cursor how-to | skill `cursor-guide` |

---

## 6. Architecture (single diagram)

```
ESP32-S3 ──writes──► RTDB (ALIGN PATHS Phase B)
                         ▲
                         │ subscribeSensors/Alerts/Roster
                    Expo Web (Vercel)
                         │
              Firebase Auth (farmer/vet)
```

Offline: ESP32 AP `http://192.168.4.1/data` OR cached mocks.

---

## 7. Definition of done (project)

- [ ] Phase S security complete
- [ ] Phase A pushed to Codeberg
- [ ] Phase B firmware/mobile paths aligned
- [ ] Phase C Vercel live with telemetry
- [ ] Phase D Events/Analytics wired
- [ ] Phase E smoke + tsc + CodeRabbit clean on staged diff
- [ ] Phase F docs accurate
- [ ] Phase G defense artifacts (optional date)
- [ ] Phase H Sentinel probes green + docs synced

---

## 8. When YOU are ready (one message to any AI)

Copy-paste:

> Execute `docs/MASTER_PLAN_FUTURE_PROOF.md` starting at Phase S, then A→B→C→D. I authorize commit and push. Stop and ask if RTDB alignment needs my choice.

---

## 9. Changelog

| Date | Change |
|------|--------|
| 2026-05-22 | v2.0 — Full re-audit, online refs, RTDB C1, provider probe, future-proof Sentinel |

*Break to breathe. Write to bind.*
