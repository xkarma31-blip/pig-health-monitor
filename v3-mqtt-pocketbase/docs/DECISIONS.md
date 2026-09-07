# PigPulse v3 — Architecture Decisions

## 1. Firebase → MQTT + PocketBase
**Decision:** Replace broken Firebase with self-hosted stack
**Rationale:** No vendor lock-in, full control, free

## 2. MLX90640 Only
**Decision:** Thermal camera only, no RGB
**Rationale:** Sufficient for fever detection, lower power, simpler

## 3. Flat MQTT Topics
**Decision:** `pig/{deviceId}/telemetry` structure
**Rationale:** Simple, sufficient for single-pen, easy to extend

## 4. OpenResty over Nginx
**Decision:** Use OpenResty for API gateway
**Rationale:** Lua scripting, rate limiting, WebSocket proxy, caching

## 5. Docker Deployment
**Decision:** Containerize all services
**Rationale:** Isolation, reproducibility, easy updates

## 6. Termux One-Liner
**Decision:** Phone setup via single command
**Rationale:** Demo-friendly, portable

## 7. Local AI First
**Decision:** Ollama/unsloth, cloud fallback (Groq)
**Rationale:** Free, private, offline

## 8. QR Login
**Decision:** PocketBase built-in auth
**Rationale:** Simple for non-technical users

## 9. Dual Source
**Decision:** Keep Firebase as fallback
**Rationale:** Zero risk, graceful degradation

## 10. Conservative Thresholds
**Decision:** >39.5°C warning, >40°C critical
**Rationale:** Safe defaults, manual override

## 11. Mobile UI Copy — Farmer-Plain Language (2026-09-07)
**Decision:** All farmer-facing screen strings come from a single EN/TL table
(`frontend/mobile_app/src/utils/farmerText.ts`), Grade-4 reading level; no
jargon ("MQTT", "telemetry", "dBm", "firmware") on screens.
**Rationale:** Ported from fork branch `polish/farmer-setup`; user approved
the "less jargon" improvement. Contract test asserts EN/TL key parity.

## 12. Setup Wizard Targets PocketBase, NOT a Compute-Node Gateway (2026-09-07)
**Decision:** The 3-step setup wizard ("Find your box") probes PocketBase
`/api/health`; the box address a farmer enters is the PocketBase base URL.
**Rationale:** Canon data path is ESP32 → MQTT → Bridge → PocketBase → app.
A direct gateway connection bypasses PocketBase and breaks the data contract.

## 13. REJECTED — Direct Compute-Node Gateway Client (gateway.ts) (2026-09-07)
**Decision:** `gateway.ts` + `useOfflineTelemetry.ts` (fork branches
`polish/farmer-setup` / `polish/app-readiness`) are NOT ported.
**Rationale:** They fetch telemetry straight from the compute node on a
private port, bypassing PocketBase — breaking the canonical contract above.
If offline-edge telemetry is ever needed, it must be re-architected against
PocketBase (e.g. a local cache of PB records), never a second data path.

## 14. REJECTED — Fork Simulation Scripts (scripts/sim) (2026-09-07)
**Decision:** `compute-node-sim.mjs` + its contract test are NOT ported.
**Rationale:** They test the rejected fork gateway contract, not the canon
ESP32 → MQTT → Bridge → PocketBase path. Canon has its own seed/sim tooling
(`backend/setup/seed_mqtt.py`, `seed_pocketbase.py`).

## 15. Setup Wizard Entry Points
**Decision:** The wizard lives at `src/app/setup.tsx`, reachable from the
Home DEMO banner (when setup not done) and Settings → "＋ Set up a device".
**Rationale:** expo-router `Slot`-based routing auto-registers the route; no
manual Stack registration needed. Setup state persists in AsyncStorage via
`src/utils/setupStore.ts` (`@pigpulse/…` keys).
