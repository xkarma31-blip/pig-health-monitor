# PigPulse v3 — Final Architecture

> **Version:** v3-mqtt-pocketbase
> **Date:** September 1, 2026
> **Status:** Architecture finalized, implementation in progress

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          FIRMWARE LAYER                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ MLX90640     │  │ INMP441 #1   │  │ INMP441 #2   │  │ Battery/ADC  │  │
│  │ (32×24 IR)   │  │ (I2S mic)    │  │ (I2S mic)    │  │ (voltage)    │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
│         └────────┬────────┴────────┬────────┘                 │           │
│         ┌────────▼─────────────────▼──────────────────────────▼───────┐  │
│         │                    ESP32 FIRMWARE                            │  │
│         │  - Thermal processing (median filter, hotspot detection)    │  │
│         │  - Acoustic processing (cough detection, clustering)        │  │
│         │  - Pig identification (cosine similarity embeddings)        │  │
│         │  - Battery management (adaptive sampling, hibernation)      │  │
│         └────────┬────────────────────────────────────────────────────┘  │
│                  │ WiFi                                                   │
└──────────────────┼────────────────────────────────────────────────────────┘
                   │ MQTT (port 1883)
┌──────────────────▼────────────────────────────────────────────────────────┐
│                        DEPLOY LAYER (Docker)                              │
│                                                                          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │
│  │    Mosquitto    │  │    ValKey       │  │    OpenResty    │          │
│  │  (MQTT Broker)  │  │   (Cache/Buffer)│  │  (API Gateway)  │          │
│  │    :1883        │  │    :6379        │  │    :80/:443     │          │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘          │
│           │                    │                    │                    │
│           │    ┌───────────────▼───────────────┐    │                    │
│           │    │        MQTT Bridge            │    │                    │
│           │    │  (Python: paho-mqtt + requests)│    │                    │
│           │    │  - Subscribes to pig/+/...     │    │                    │
│           │    │  - Buffers in ValKey            │    │                    │
│           │    │  - POSTs to PocketBase API      │    │                    │
│           │    └───────────────┬───────────────┘    │                    │
│           │                    │                    │                    │
│           │    ┌───────────────▼───────────────┐    │                    │
│           │    │        PocketBase              │◄───┘                    │
│           │    │  - SQLite WAL mode             │                       │
│           │    │  - Realtime SSE subscriptions  │                       │
│           │    │  - Built-in auth (QR login)    │                       │
│           │    │  - :8090 API + :8091 Admin      │                       │
│           │    └───────────────┬───────────────┘                       │
└───────────┼────────────────────┼──────────────────────────────────────────┘
            │                    │
┌───────────▼────────────────────▼──────────────────────────────────────────┐
│                        BACKEND LAYER                                       │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │                    OpenResty (API Gateway)                          │ │
│  │  - Rate limiting (Lua scripts)                                      │ │
│  │  - JWT validation (proxy-level)                                     │ │
│  │  - Request transformation                                           │ │
│  │  - WebSocket proxy (MQTT over WS)                                   │ │
│  │  - Caching layer (Lua shared dict)                                  │ │
│  │  - Logging & metrics                                                │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │
│  │   Auth Service  │  │  Data Service   │  │  Command Service │          │
│  │  (PocketBase)   │  │  (PocketBase)   │  │  (MQTT Bridge)  │          │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘          │
└──────────────────────────────────────────────────────────────────────────────┘
                                 │
┌────────────────────────────────▼────────────────────────────────────────────┐
│                        FRONTEND LAYER                                      │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │                    Expo React Native App                            │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐          │ │
│  │  │   Home   │  │  Events  │  │ Analytics │  │  Nodes   │          │ │
│  │  │(Dashboard)│  │(Alerts)  │  │ (Charts)  │  │(Devices) │          │ │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘          │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │                    State Management                                 │ │
│  │  - PocketBase Realtime SSE (primary)                                │ │
│  │  - Firebase fallback (legacy)                                       │ │
│  │  - Mock data (offline/demo)                                         │ │
│  │  - Local storage (offline cache)                                    │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Directory Structure

```
v3-mqtt-pocketbase/
│
├── firmware/                    # ESP32 firmware
│   ├── src/
│   │   └── main.cpp            # Main firmware entry point
│   ├── include/
│   │   ├── MqttClient.h        # MQTT client wrapper
│   │   ├── PigMqttTopics.h     # Topic definitions
│   │   ├── SensorManager.h     # Sensor orchestration
│   │   ├── PowerManager.h      # Battery management
│   │   └── ThermalProcessor.h  # Thermal frame processing
│   └── tests/
│       └── test_firmware.py    # Python test suites
│
├── backend/                     # Server-side logic
│   ├── bridge/
│   │   ├── mqtt_bridge.py      # MQTT → PocketBase bridge
│   │   ├── requirements.txt    # Python dependencies
│   │   └── Dockerfile          # Bridge container
│   ├── setup/
│   │   ├── setup_pocketbase.py # Schema setup
│   │   └── seed_data.py        # Test data seeder
│   └── workers/
│       ├── alert_processor.py  # Alert aggregation
│       └── data_cleaner.py     # Data retention cleanup
│
├── frontend/                    # Client-side applications
│   ├── mobile_app/             # Expo React Native
│   │   ├── src/
│   │   │   ├── app/            # Expo Router pages
│   │   │   ├── components/     # Reusable UI components
│   │   │   ├── hooks/          # Custom React hooks
│   │   │   ├── services/       # API clients (PocketBase, Firebase)
│   │   │   ├── store/          # State management
│   │   │   └── utils/          # Helpers
│   │   └── package.json
│   ├── landing_page/           # Static landing page
│   └── shared/                 # Shared types/constants
│       └── types.ts            # TypeScript interfaces
│
├── deploy/                      # Deployment infrastructure
│   ├── openresty/
│   │   ├── conf/
│   │   │   └── nginx.conf      # OpenResty config
│   │   └── lua/
│   │       ├── auth.lua        # JWT validation
│   │       ├── rate_limit.lua  # Rate limiting
│   │       ├── cache.lua       # Response caching
│   │       └── websocket.lua   # MQTT WebSocket proxy
│   ├── docker/
│   │   ├── docker-compose.yml  # Full stack
│   │   ├── mosquitto/
│   │   │   └── mosquitto.conf  # Broker config
│   │   └── .env.example        # Environment template
│   └── scripts/
│       ├── termux-setup.sh     # Phone one-liner
│       ├── deploy.sh           # Server deployment
│       └── backup.sh           # Data backup
│
├── monitoring/                  # Observability
│   ├── dashboards/
│   │   └── grafana.json        # Grafana dashboard
│   └── alerts/
│       └── alert_rules.yml     # Alert definitions
│
└── docs/                        # Documentation
    ├── ARCHITECTURE.md          # This file
    ├── DEPLOYMENT.md            # Deployment guide
    ├── API.md                   # API reference
    ├── FIRMWARE.md              # Firmware guide
    └── DECISIONS.md             # Architecture decisions
```

---

## Data Flow

### Telemetry Pipeline
```
ESP32 → MQTT (Mosquitto:1883) → mqtt_bridge.py → PocketBase:8090
                                                      ↓
OpenResty (cache) ← Expo App ← useOfflineTelemetry hook ← PocketBase SSE
```

### Alert Pipeline
```
ESP32 detects fever → pig/{id}/alerts → Mosquitto → mqtt_bridge.py
    → PocketBase alerts collection → PocketBase Realtime SSE
        → Expo App → Push notification + sound + haptic feedback
```

### Command Pipeline
```
Expo App → OpenResty (rate limit + JWT) → PocketBase commands collection
    → mqtt_bridge.py → Mosquitto → pig/{id}/commands → ESP32
        → ESP32 executes → publishes to pig/{id}/response
```

### Cache Strategy (from System Design video)
```
L1: OpenResty Lua shared dict (in-memory, 10ms)
L2: ValKey (Redis-compatible, 1ms network)
L3: PocketBase SQLite (disk, 10ms)
L4: Mock data (offline, 0ms)

Cache invalidation:
- Telemetry: TTL 5 seconds (real-time data)
- Alerts: TTL 60 seconds (near real-time)
- Devices: TTL 5 minutes (slow-changing)
- Pigs: TTL 1 hour (rarely changes)
```

---

## OpenResty Configuration

### Rate Limiting (from System Design video)
```lua
-- lua/rate_limit.lua
local limit = require "resty.rate limiting"

-- 100 requests per minute per IP
local lim, err = limit.new("rate_limit_store", 100, 60)
if not lim then
    ngx.log(ngx.ERR, "failed to instantiate rate limiter: ", err)
    return ngx.exit(500)
end

local key = ngx.var.binary_remote_addr
local delay, err = lim:incoming(key, true)
if not delay then
    if err == "rejected" then
        ngx.header["Retry-After"] = 60
        return ngx.exit(429)
    end
    ngx.log(ngx.ERR, "failed to rate limit: ", err)
    return ngx.exit(500)
end
```

### JWT Validation (from Frontend System Design video)
```lua
-- lua/auth.lua
local jwt = require "resty.jwt"

local function validate_token()
    local auth_header = ngx.var.http_authorization
    if not auth_header then
        return ngx.exit(401)
    end

    local token = string.match(auth_header, "Bearer (.+)")
    if not token then
        return ngx.exit(401)
    end

    local jwt_obj = jwt:verify("your-secret-key", token)
    if not jwt_obj.verified then
        return ngx.exit(401)
    end

    ngx.req.set_header("X-User-ID", jwt_obj.payload.sub)
end

validate_token()
```

### Response Caching
```lua
-- lua/cache.lua
local shared_cache = ngx.shared.cache

local function cache_response(ttl)
    local key = ngx.var.request_uri
    local cached = shared_cache:get(key)
    if cached then
        ngx.header["X-Cache"] = "HIT"
        ngx.say(cached)
        return ngx.exit(200)
    end

    ngx.header["X-Cache"] = "MISS"
    -- Let request pass through, cache response in body filter
end

local function set_cache(ttl)
    local key = ngx.var.request_uri
    local body = ngx.arg[1]
    shared_cache:set(key, body, ttl)
end
```

---

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| API Gateway | OpenResty | Lua scripting, rate limiting, WebSocket proxy |
| Database | PocketBase (SQLite) | Single binary, built-in auth, realtime |
| MQTT Broker | Mosquitto | Lightweight, reliable, industry standard |
| Cache | ValKey | Redis-compatible, open source |
| Frontend | Expo React Native | Cross-platform, fast development |
| State | PocketBase SSE + Mock | Real-time + offline support |

---

## Scaling Strategy

### Current (1 Device, 1 User)
- Single Docker stack on laptop
- 1 ESP32 → 1 PocketBase instance

### Future (Multiple Devices)
- Multiple ESP32s → Same Mosquitto broker
- PocketBase queries by `deviceId`
- OpenResty scales horizontally

### Future (Multiple Users)
- PocketBase auth handles multi-user
- OpenResty rate limiting per user
- ValKey session cache

### Future (Production)
- Grafana monitoring dashboard
- Alert rules for system health
- Automated backups
