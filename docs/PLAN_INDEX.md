# Plan Index — Single Source of Truth

**Version:** 3.0 · **Last verified:** 2026-05-22  
**Rule:** If two docs disagree, **this index + linked primary doc wins.**

---

## Read order (humans & AIs)

| Order | Document | Use when |
|-------|----------|----------|
| 1 | `AGENTS.md` | Repo rules, layout, commands |
| 2 | **`docs/MASTER_PLAN_FUTURE_PROOF.md`** | Full capstone + Sentinel execution phases |
| 3 | `docs/AI_MASTER_HANDOFF.md` | Short agent checklist (points here) |
| 4 | `docs/CAPSTONE_PLAN.md` | Capstone tabs, tests, deploy detail |
| 5 | `~/.hermes/PROVIDER_STATUS.md` | Live LLM provider health |
| 6 | `~/.hermes/API_PROVIDER_REGISTRY.md` | API key URLs & switching logic |
| 7 | `~/.cursor/SENTINEL_QUICK_STATUS.md` | Drain mode — 30 second health |

**Provider keys:** only `~/.hermes/API_PROVIDER_REGISTRY.md` (repo copy is a stub).

---

## Authority matrix

| Topic | Primary doc |
|-------|-------------|
| Execution phases S→H | `MASTER_PLAN_FUTURE_PROOF.md` |
| RTDB firmware ↔ app paths | `docs/RTDB_MIGRATION.md` |
| Hermes model profile | `~/.hermes/sentinel_models.yaml` + `PROVIDER_STATUS.md` |
| Secrets | `~/.config/environment.d/sentinel.conf` (never git) |
| NVIDIA / Cloudflare LLM | `~/.hermes/docs/SKIPPED_PROVIDERS.md` |
| Production URL | **https://pig-health-monitor.vercel.app** (canonical) |

---

## One-command health (run after any change)

```bash
bash ~/.cursor/scripts/health-check-all.sh
```

---

## Current stack snapshot (re-probe to refresh)

| Layer | State |
|-------|--------|
| Hermes `active_profile` | `gemini` (Groq 1010 on this network) |
| Working APIs | Gemini, SiliconFlow, GitHub Models, HF, Ollama |
| Capstone mobile | Home/Events/Analytics wired to Firebase listeners |
| Blocker | Firmware RTDB root paths ≠ app `/users/$uid/` |
| Security | Add `firebase-adminsdk.json` to gitignore; rotate pasted keys |

---

## Research references (2025–2026)

- Firebase RTDB rules: https://firebase.google.com/docs/database/security
- Expo web deploy: https://docs.expo.dev/guides/publishing-websites/
- LLM failover / circuit breakers: per-provider chains in `sentinel_models.yaml` (see `API_PROVIDER_REGISTRY.md`)
- CodeRabbit config: https://docs.coderabbit.ai/reference/configuration

---

*Break to breathe. Write to bind.*
