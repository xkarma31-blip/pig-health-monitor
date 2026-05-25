# Plan Index — Single Source of Truth

**Version:** 3.1 · **Last verified:** 2026-05-25  
**Rule:** If two docs disagree, **this index + linked primary doc wins.**

---

## Read order (humans & AIs)

| Order | Document | Use when |
|-------|----------|----------|
| 1 | `AGENTS.md` | Repo rules, layout, commands |
| 2 | `docs/PROJECT_DOSSIER.md` | Full capstone + Sentinel execution phases |
| 3 | `docs/AI_MASTER_HANDOFF.md` | Short agent checklist |
| 4 | `docs/RTDB_MIGRATION.md` | Firebase RTDB schema + firmware paths |
| 5 | `docs/technical_specs.md` | Hardware specs, pinouts, I2C addresses |

**Provider keys:** only `~/.hermes/API_PROVIDER_REGISTRY.md` (repo copy is a stub).

---

## Authority matrix

| Topic | Primary doc |
|-------|-------------|
| Full project scope | `docs/PROJECT_DOSSIER.md` |
| RTDB firmware ↔ app paths | `docs/RTDB_MIGRATION.md` |
| Hardware specs | `docs/technical_specs.md` |
| Secrets | `~/.config/environment.d/sentinel.conf` (never git) |
| Production URL | **https://pig-health-monitor.vercel.app** (canonical) |
| CI status | `.github/workflows/ci.yml` |
| Pre-commit hooks | `.husky/pre-commit` (runs `npx lint-staged`) |
| ESLint config | `mobile_app/eslint.config.mjs` |
| Test runner | `mobile_app/jest.config.js` (run: `npx jest --no-cache`) |

---

## One-command health

```bash
# Mobile app lint + test
cd mobile_app && npx eslint . --ext .ts,.tsx && npx jest --no-cache
```

---

## Current stack snapshot

| Layer | State |
|-------|-------|
| Backend | Firebase RTDB (migrated from PocketBase) |
| Mobile app | Expo SDK 54, Expo Router, TypeScript strict |
| CI | Lint + Jest + PlatformIO + pyright + trufflehog |
| Pre-commit | husky v9 + lint-staged (ESLint on staged TS/TSX) |
| Firmware | ESP32-S3, dual-core RTOS (Audio + Thermal tasks) |
| Landing page | Vercel, Three.js r170, GSAP, CSP headers |
| Security | `secrets.h` gitignored, `*.apk` gitignored, credential scanner in CI |
| Known issue | Firebase API key exposed in 13 tracked files + git history (rotation deferred) |

---

## Build & Deploy

```bash
# Preview APK via EAS
cd mobile_app && npx eas build --platform android --profile preview

# Web export
cd mobile_app && npx expo export -p web

# Landing page (auto-deployed by Vercel)
# https://pig-health-monitor.vercel.app
```

---

## Research references

- Firebase RTDB rules: https://firebase.google.com/docs/database/security
- Expo web deploy: https://docs.expo.dev/guides/publishing-websites/
- CodeRabbit config: https://docs.coderabbit.ai/reference/configuration
- Expo Router docs: https://docs.expo.dev/router/introduction/

---

*Break to breathe. Write to bind.*
