# PigPulse v3 — MQTT + PocketBase Architecture

> Multimodal TinyML Acoustic Safeguard for Open-Air Swine Farming

## Architecture

```
ESP32 (D0WD) → MQTT (Mosquitto) → Bridge → PocketBase → OpenResty → Expo App
```

## Components

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Firmware** | ESP32 D0WD, PlatformIO | Thermal (MLX90640) + Acoustic (2x INMP441) sensors |
| **Broker** | Mosquitto | MQTT message routing |
| **Bridge** | Python | MQTT → PocketBase sync |
| **Database** | PocketBase | SQLite + REST API + Realtime |
| **Cache** | ValKey (Redis) | Buffer layer, LRU eviction |
| **Gateway** | OpenResty + Lua | Rate limiting, JWT auth, caching |
| **Frontend** | Expo (React Native) | Cross-platform mobile + web |
| **Deploy** | Docker Compose | 5-service stack |

## Quick Start

```bash
cd deploy/docker
cp .env.example .env
docker compose up -d
```

- **PocketBase Admin:** http://localhost:8091
- **API Gateway:** http://localhost:80
- **MQTT Broker:** localhost:1883

## Teammate Setup

See [docs/TEAMMATE_SETUP.md](docs/TEAMMATE_SETUP.md) for Docker Desktop instructions.

## Documentation

- [Architecture](docs/ARCHITECTURE.md) — Full system design
- [Deployment](docs/DEPLOYMENT.md) — Setup guide
- [API](docs/API.yaml) — OpenAPI 3.0 spec
- [Monitoring](docs/MONITORING.md) — Sentry, Watchdog, ValKey
- [Decisions](docs/DECISIONS.md) — 10 key design decisions

## License

MIT
