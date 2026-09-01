# AGENTS.md — PigPulse v2

## Project
**Name:** PigPulse v2 — Green-Accent Redesign
**Location:** `/home/solrahk/PigHealthMonitor/v2-firebase/mobile_app`
**Live:** https://pig-health-monitor.vercel.app/
**Stack:** Expo Router, React Native, Firebase
**Theme:** Neutral canvas + green accent (light `#1E8449` / dark `#3DDC84`)

## Architecture
```
mobile_app/
├── .planning/          → ROADMAP.md, PROJECT.md, PLAN.md
├── src/
│   ├── app/            → Expo Router screens
│   │   ├── (tabs)/     → Home, Events, Analytics, Nodes
│   │   ├── login.tsx
│   │   ├── feed.tsx
│   │   └── _layout.tsx
│   ├── components/     → Reusable UI components
│   ├── theme/           → theme.ts (colors, spacing, typography)
│   ├── utils/          → sounds.ts, haptics.ts, auth.ts, firebase.ts
│   └── hooks/          → useOfflineTelemetry.ts
├── assets/             → Images, icons, splash
├── package.json        → Dependencies
├── app.json            → Expo config
└── eas.json            → EAS build profiles
```

## Conventions
- All colors must come from `Theme.colors` — no hardcoded hex values
- All spacing must come from `Theme.spacing` — no magic numbers
- All typography must come from `Theme.typography` — minimum 16px body
- All interactive elements must be ≥ 44×44px touch target
- All buttons must have `accessibilityLabel` and `accessibilityHint`
- All platform-specific code must be guarded with `Platform.OS === 'web'` / `'ios'` / `'android'`
- Haptic + sound feedback on all interactive elements (`playSound`, `haptic`)
- Use expo-av for native audio, Web Audio API for web — never `AudioContext` unconditionally
- Firebase auth: use `useAuth()` hook, never duplicate listeners
- Errors must be shown inline, not just via `Alert.alert` or `window.alert`

## Boundaries
**Always:**
- Use EAS for builds, never `npx expo run:android`
- Run `npx eslint` and `npx tsc --noEmit` before committing
- Send screenshots/APKs to Telegram when testing
- Follow the AGUA agent system for parallel work
- Reference `.planning/ROADMAP.md` for phase order

**Ask first:**
- Switching git branches or force-pushing
- Deploying to staging or production
- Adding or removing npm dependencies
- Changing Firebase security rules

**Never:**
- Hardcode `#05050A` or `#00D4AA` (deprecated; replaced by new green-accent tokens)
- Hardcode `#3FA8B8` or other Sovereign Aqua legacy hex values
- Use `signInWithPopup` (web-only, breaks native)
- Use `HTMLCanvasElement` type without `Platform.OS` guard
- Use relative `/api/` URLs on native (no web origin)
- Commit `.env`, `credentials.env`, or any secrets
- Skip accessibility labels on interactive elements

## Testing
- Lint: `npx eslint src/`
- Typecheck: `npx tsc --noEmit --skipLibCheck`
- Web build: `npx expo export -p web`
- EAS build: `eas build --platform android --profile preview`
- Device: install APK on physical device (emulator broken)

## Deployment
- Mobile: EAS internal distribution (preview profile)
- Web: Vercel (https://pig-health-monitor.vercel.app/)
- Assets: Telegram bot for screenshot/APK delivery
- Credentials: `/home/solrahk/.local/servers/credentials.env`

## AGENTS
This project uses the **AGUA modular agent system** (configured in `/home/solrahk/.config/kilo/agents/`):

- **agua-router** (primary) — routes all work to specialists
- **agua-scout** — read-only codebase exploration
- **agua-researcher** — web/docs research
- **agua-builder** — implementation with verification
- **agua-auditor** — diff review, design system audits
- **agua-qa** — tests, accessibility, device verification
- **agua-pilot** — EAS builds, Vercel deploy, artifact delivery

**Usage:** Switch to `agua-router` in Kilo, paste goal. Router auto-delegates to specialists.
Or invoke directly: `@agua-builder fix signInWithPopup`

## Redesign Flow (AGUA Orchestrated)
```
Goal: Redesign PigPulse v2 to match new-design.tsx
│
├── ask
│   └── Validate design reference, confirm navigation strategy, resolve blockers
│
├── architect
│   └── Token extraction, file structure, component inventory, navigation wiring
│
├── frontend specialist
│   └── Component specs, accessibility compliance, spacing/typography standards
│
├── plan
│   └── Atomic task breakdown, file-by-file execution order, acceptance criteria
│
├── code
│   └── Builder implements one component per commit, app stays runnable
│
├── code reviewer
│   └── Diff review, design system compliance, leftover old pattern scan
│
├── debug
│   └── Fix build/runtime failures, rollback to last green commit if needed
│
└── test engineer
    └── QA, screenshots → Telegram, EAS build, accessibility validation
```

**Current phase:** code — theme system, primitives, and screen rewrites in progress.

## Known Issues
- 30+ hardcoded colors need Theme migration
- `login.tsx`: `signInWithPopup` is web-only, breaks native
- `ThermalLiveView.tsx`: `HTMLCanvasElement` type breaks native TS
- `AdvisorModal.tsx`: `/api/chat` relative URL fails on native
- `events.tsx`: duplicate style key (fixed in latest commit)
- Zero accessibility labels across entire app
- `textMuted`/`tabInactive` fail WCAG AA contrast
- Android emulator package manager broken — use physical device

## References
- `.planning/ROADMAP.md` — phase-by-phase execution checklist
- `src/theme/theme.ts` — new design tokens
- `/home/solrahk/.local/servers/credentials.env` — Telegram/EAS credentials
- Kilo agents: `/home/solrahk/.config/kilo/agents/agua-*.md`
