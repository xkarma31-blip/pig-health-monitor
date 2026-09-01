# How We Applied the 2 Reference Videos to PigPulse

## Video 1: AI Agent Workflows & Structured Outputs

**Source:** AI agent workflow automation (n8n-style)

### What We Applied

| Video Concept | PigPulse Implementation |
|---------------|------------------------|
| **Structured JSON outputs** | MQTT messages use strict JSON schemas: `{"temperature":float, "bodyTemp":float, "status":string, "timestamp":int}` |
| **Node-based data flow** | ESP32 → MQTT → Bridge → PocketBase → Expo (each step is a node) |
| **Error handling at each node** | Bridge has `try/except` for every MQTT message, PocketBase auth retry, connection recovery |
| **Buffering/rate limiting** | ValKey cache layer with TTL (5s telemetry, 60s alerts, 5min devices) |
| **Webhook triggers** | MQTT topics act as webhooks: `pig/+/telemetry`, `pig/+/alerts`, `pig/+/status` |
| **Data validation** | Bridge validates JSON before storing, rejects malformed messages |
| **Auto-retry** | MQTT client has `loop_forever()`, bridge auto-reconnects, PocketBase token refresh |

### Code References

```
backend/bridge/mqtt_bridge.py    — Node logic (MQTT → PocketBase)
deploy/openresty/lua/cache.lua   — Buffering layer
deploy/openresty/lua/rate_limit.lua — Rate limiting
```

---

## Video 2: ESP32 Thermal Camera + LoRa IoT System

**Source:** ESP32 MLX90640 thermal camera with LoRa communication

### What We Applied

| Video Concept | PigPulse Implementation |
|---------------|------------------------|
| **MLX90640 thermal sensor** | ✅ Same sensor — 32×24 pixel thermal array |
| **LoRa long-range** | → Replaced with MQTT over WiFi (simpler for small farm) |
| **Temperature threshold alerts** | ✅ >39.5°C warning, >40°C critical |
| **Multi-sensor fusion** | ✅ Added acoustic (2x INMP441) alongside thermal |
| **Low-power design** | ✅ ESP32 deep sleep between readings, battery monitoring |
| **Real-time monitoring** | ✅ MQTT pub/sub for live data streaming |
| **Alert system** | ✅ MQTT topics for alerts + LWT for offline detection |

### Code References

```
firmware/src/main.cpp              — ESP32 dual-core RTOS
firmware/include/ThermalCamera.h   — MLX90640 driver
firmware/include/PigMqttTopics.h   — MQTT topic structure
firmware/include/AcousticSignature.h — INMP441 audio processing
```

---

## Combined Architecture

```
VIDEO 2 (Hardware)          VIDEO 1 (Workflow)           RESULT
─────────────────────       ─────────────────────        ─────────────────
ESP32 D0WD                  Structured JSON              MQTT messages
MLX90640 thermal     →      Node-based flow       →     Real-time data
INMP441 acoustic            Error handling               Live alerts
Low-power design            Buffering                    Mobile dashboard
WiFi instead of LoRa        Rate limiting                Self-hosted DB
```

---

## Key Design Decisions

1. **MQTT over LoRa** — Simpler, WiFi covers small farm, no license needed
2. **PocketBase over Firebase** — Self-hosted, no vendor lock-in, SQLite
3. **OpenResty over Nginx** — Lua scripting for rate limiting at proxy layer
4. **Docker Compose** — Reproducible, portable, one-command deployment
5. **Dual-core RTOS** — One core for sensors, one for MQTT (no blocking)

---

## What We Built Beyond the Videos

| Feature | Not in Videos | Why |
|---------|--------------|-----|
| Acoustic monitoring | ✅ | Cough detection = early disease warning |
| PocketBase admin UI | ✅ | Non-technical users can manage data |
| Docker deployment | ✅ | Teammates can run entire stack |
| OpenResty gateway | ✅ | Production-ready API layer |
| Expo mobile app | ✅ | Cross-platform (iOS + Android + Web) |
| MQTT bridge | ✅ | Decouples IoT from database |
| ValKey cache | ✅ | Handles burst data from sensors |
