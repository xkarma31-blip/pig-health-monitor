# AI Master Handoff — Pig Health Monitor + Sentinel

**Purpose:** Any AI (Cursor, Hermes, OpenCode, Telegram agent) can open this file and finish work without re-auditing the whole codebase or UI.

**Read first:** `docs/PLAN_INDEX.md` → `docs/MASTER_PLAN_FUTURE_PROOF.md` → this file (checklist only).

**Last updated:** 2026-05-22

---

## 1. What the human likely did (41 reviews)

Pressing **“41 reviews”** (or similar) in Cursor/CodeRabbit is **not a git commit**. It usually means:

- CodeRabbit (or built-in review) ran on **uncommitted** or **PR** changes and showed **41 findings/comments**.
- That is a **read/review UI action** — it does not push code, deploy, or save a snapshot.

**Git truth (verify with `git status`):**

- Repo: `~/Projects/pig-health-monitor` (symlink may exist under `shikigami_memory/capstone_pig_health_monitor`)
- Remote: `https://codeberg.org/Solrahk/pig-health-monitor` (branch `master`)
- **No commit was made by the assistant in the 2026-05-22 capstone session** — large dirty working tree (telemetry hook, new tabs, test scripts, `docs/CAPSTONE_PLAN.md`, etc.)

Human must say **“commit and push”** explicitly before assuming anything is on Codeberg.

---

## 2. Repo & deploy URLs (copy-paste safe)

| Item | Value |
|------|--------|
| Codeberg | https://codeberg.org/Solrahk/pig-health-monitor |
| Local path | `/home/solrahk/Projects/pig-health-monitor` |
| Production web | https://mobileapp-lyart.vercel.app |
| Firebase | RTDB (not Supabase) — paths under `/users/$uid/` |

---

## 3. Execution order (do not skip)

### Phase A — Save work (human or AI with permission)

```bash
cd ~/Projects/pig-health-monitor
git status
git add mobile_app/src/hooks/useOfflineTelemetry.ts \
  mobile_app/src/app/(tabs)/analytics.tsx \
  scripts/test/*.js scripts/test/capstone_smoke.sh \
  docs/CAPSTONE_PLAN.md docs/AI_MASTER_HANDOFF.md
# Add other intentional files; NEVER add .env, sentinel.conf, or secrets
git commit -m "fix(mobile): wire Firebase telemetry, enroll, and E2E routes"
git push origin master
```

### Phase B — Deploy capstone to production

```bash
cd ~/Projects/pig-health-monitor/mobile_app
npx expo export -p web
# Deploy dist/ via Vercel CLI or connected Codeberg → Vercel CI
```

### Phase C — Smoke (must pass except known tsc)

```bash
./scripts/test/capstone_smoke.sh
```

Known **tsc** failures (pre-existing, fix in Phase D): `ScalePressable` sounds path, `GlassCard` + `expo-blur`.

### Phase D — Code fixes (priority)

| ID | Task | File(s) | Done when |
|----|------|---------|-----------|
| D1 | Live sensors on Home when logged in | `useOfflineTelemetry.ts` | ✅ Wired — verify after deploy |
| D2 | Enroll sends `ENROLL_START` | `analytics.tsx` + `firebase.ts` | ✅ Wired — test on web |
| D3 | E2E routes match tabs | `scripts/test/*` | ✅ Fixed — run `node scripts/test/e2e_test.js` |
| D4 | Fix tsc errors | `ScalePressable.tsx`, `GlassCard.tsx`, install `expo-blur` if needed | `npx tsc --noEmit` clean |
| D5 | Docs: Supabase → Firebase | `technical_specs.md`, research docs | No “Supabase” for this project |
| D6 | Advisor API real or documented mock | `mobile_app/api/chat.js` | Env keys or README note |

### Phase E — UI (minimal checklist only)

Do **not** re-audit every screen. Only:

- [ ] After deploy: login → Home shows **live** data (not static mocks).
- [ ] Tabs load: `/`, `/events`, `/analytics`, `/nodes`, `/login`.
- [ ] Enroll button shows alert / Firebase command.
- [ ] Logout clears cloud view for guest.

Screens live under `mobile_app/src/app/(tabs)/`.

### Phase F — Defense / research (lower priority)

- [ ] Phase 3 `docs/task.md`: TIRPigEar dataset, acoustic calibration.
- [ ] Phase 4: demo video — `node scripts/test/demo_recorder.js`.

---

## 4. Sentinel / Hermes (parallel stack)

**Config roots:** `~/.cursor/`, `~/.hermes/`, `~/.config/environment.d/sentinel.conf`

| Task | Command / note |
|------|----------------|
| Verify hub | `~/.cursor/scripts/verify-sentinel-base.sh` |
| Provider probe | `python3 ~/.hermes/scripts/probe-providers.py` |
| Hermes model profile | `~/.hermes/sentinel_models.yaml` — was `groq`; switch to `cloud` after OpenRouter quota reset |
| Gateway restart | `systemctl --user restart hermes-gateway.service` |
| Telegram test | Send `/reset` then normal message after model changes |
| CodeRabbit local | `cr --plain` from repo root; skill: `~/.cursor/skills-cursor/` + command `/code-review` |
| Maintain ritual | Skill/command `maintain-sentinel` |

**Do not** paste `sentinel.conf` or bot tokens into commits or chat logs.

---

## 5. Skills & commands (use these, don’t reinvent)

| Need | Use |
|------|-----|
| Cursor product help | skill `cursor-guide` |
| PR / CI loop | skill `babysit` |
| Split work into PRs | skill `split-to-prs` |
| Code review (CodeRabbit) | `~/.cursor/commands/code-review` or `cr --agent` |
| Sentinel maintenance | `maintain-sentinel` command |
| SDK automations | skill `sdk` |
| Rich tables / charts deliverable | skill `canvas` |

---

## 6. Test matrix (one line each)

```bash
./scripts/test/capstone_smoke.sh          # aggregate
cd mobile_app && npx tsc --noEmit        # types
cd mobile_app && npx expo export -p web  # build
node scripts/test/e2e_test.js            # login E2E (network)
node scripts/test/demo_recorder.js       # defense screenshots
```

---

## 7. Architecture (for agents — no UI tour)

```
ESP32-S3 → Firebase RTDB (/users/$uid/sensors|alerts|roster|commands)
                ↓ subscribeSensors / subscribeAlerts / enrollPig
         Expo app (Vercel) — tabs: index, events, analytics, nodes
```

Offline: ESP32 AP `192.168.4.1/data` or cached mocks.

---

## 8. Definition of done

- [ ] `git push` contains telemetry + enroll + test route fixes
- [ ] Vercel serves new bundle; logged-in Home uses live Firebase
- [ ] `capstone_smoke.sh` — 0 FAIL (tsc may WARN until D4)
- [ ] `AI_MASTER_HANDOFF.md` + `CAPSTONE_PLAN.md` on default branch
- [ ] Human received Telegram with repo link (one-time notify script)

---

## 9. Blockers — ask human only if

- Codeberg push auth fails → `gh` / git credentials / SSH
- Vercel not linked to latest push
- Firebase rules reject writes → check `firebase_config/database.rules.json`
- Hermes still 429 → keep `groq` profile per `~/.hermes/PROVIDER_STATUS.md`

---

*End of handoff. Do not re-run full codebase exploration unless a task above is blocked.*
