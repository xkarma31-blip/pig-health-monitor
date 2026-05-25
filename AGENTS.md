# Pig Health Monitor — Agent Context

Capstone: TinyML acoustic monitoring for swine respiratory distress.

## Workspace

- **Root**: `/home/solrahk/PigHealthMonitor/v2-firebase` (symlink → `~/.gemini/antigravity/scratch/shikigami_memory/capstone_pig_health_monitor`)
- **Soul**: `~/.hermes/SOUL.md` (Sentinel Soul — accessibility + Wei Wu Wei)
- **OpenCode agent**: `~/.config/opencode/agents/sentinel-soul.md`

## Layout

| Directory | Purpose |
|-----------|---------|
| `mobile_app/` | React Native / Expo client |
| `firmware/` | ESP32-S3 edge code |
| `firebase_config/` | Firebase rules/config |
| `landing_page/` | Static marketing/demo page |
| `scripts/test/` | E2E and integration tests |

## Commands (typical)

```bash
cd mobile_app && npm install && npx expo start
```

```bash
node scripts/test/e2e_test.js
```

## Constraints

- Firebase **Realtime Database** (not Firestore unless explicitly migrating)
- Secrets in `.env.local` / env vars — never commit API keys
- Master has low vision — high-contrast UI and clear copy
- Prefer minimal diffs; no dependency churn without reason

## Planning (read order)

1. `docs/PLAN_INDEX.md` — authority & health commands  
2. `docs/MASTER_PLAN_FUTURE_PROOF.md` — execution phases  
3. `docs/RTDB_MIGRATION.md` — firmware path blocker  
4. `~/.hermes/API_PROVIDER_REGISTRY.md` — LLM keys (not repo stub)

```bash
bash ~/.gemini/antigravity/scratch/shikigami_memory/scripts/health_pulse.sh
```

## Indexing

Large training data and vendor dirs are excluded via `.cursorignore`.
