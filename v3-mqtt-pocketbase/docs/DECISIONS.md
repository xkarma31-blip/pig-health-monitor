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
