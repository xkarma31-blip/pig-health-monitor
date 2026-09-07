# Firebase — RETIRED (2026-09-07)

The Firebase Realtime Database + Firebase Auth stack has been **retired** in
favor of the self-hosted **PocketBase** backend (v3-mqtt-pocketbase).

## Why

- v2 used Firebase (RTDB + Auth) — in scope for the capstone, but the v3
  architecture (ESP32 → MQTT → Bridge → PocketBase) made a self-hosted,
  credentials-owned stack the canonical backend.
- Firebase npm package is a heavy web-first bundle; keeping it in
  `src/` risked accidental import back into the mobile bundle.

## What this backup contains

| File | Was | Status |
|------|-----|--------|
| `firebase.ts` | `src/utils/firebase.ts` — RTDB + Auth client (`studio-1248778633-99f62`) | READ-ONLY reference |
| `auth-web.ts` | `src/utils/auth-web.ts` — web auth bridge | READ-ONLY reference |
| `auth-unified.ts` | `src/utils/auth-unified.ts` — unified auth bridge | READ-ONLY reference |
| `firebase-auth-rn.d.ts` | `src/types/firebase-auth-rn.d.ts` — RN persistence type augmentation | READ-ONLY reference |
| `notifications.ts` | `src/utils/notifications.ts` — expo-notifications push util (imported firebase; orphaned) | READ-ONLY reference |
| `firebase_config/database.rules.json` | Firebase RTDB security rules | READ-ONLY reference |
| `firebase_config/users.json` | Firebase test users seed | READ-ONLY reference |

## Replacements

| Firebase | PocketBase equivalent |
|----------|----------------------|
| `subscribeRoster / subscribeTelemetry / subscribeAlerts / subscribeSensors` | `src/utils/pocketbase-data.ts` (same API names) |
| Firebase Auth (`signInWithEmailAndPassword`) | `src/utils/pocketbase-auth.ts` (self-hosted PB auth) |
| Firebase RTDB | PocketBase collections: `pigs`, `devices`, `telemetry`, `alerts`, `users` |

## Restore (unlikely needed)

Copy `firebase.ts` back to `src/utils/firebase.ts`, restore `auth-web.ts` /
`auth-unified.ts` if referenced, re-add `firebase` to `package.json`
(`npx expo install firebase`), and reverse the import swaps in:
`src/app/web/feed.tsx`, `src/app/web/events.tsx`, `src/app/feed.tsx`,
`src/hooks/useOfflineTelemetry.ts`, `src/components/AdvisorModal.tsx`.

> ⚠️ Secrets: `firebase_config/firebase-adminsdk*.json` is **never** committed
> (gitignored at `**/firebase-adminsdk*.json`). This backup contains rules +
> seed data only — API keys in `firebase.ts` were public web-client keys.