# PigPulse v3 — Teammate Setup Guide

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed
- Git installed

## Quick Start (3 steps)

### 1. Clone the Repository
```bash
git clone https://codeberg.org/Solrahk/pig-health-monitor.git
cd pig-health-monitor/v3-mqtt-pocketbase/deploy/docker
```

### 2. Start the Stack
```bash
# Copy environment template
cp .env.example .env

# Start all services
docker compose up -d
```

### 3. Open the Dashboard
- **PocketBase Admin:** http://localhost:8091
  - Email: `admin@pigpulse.local`
  - Password: `admin123`
- **API Gateway:** http://localhost:80
- **MQTT Broker:** localhost:1883

## What's Running

| Service | Port | URL | Purpose |
|---------|------|-----|---------|
| OpenResty | 80 | http://localhost | API gateway, rate limiting |
| PocketBase API | 8090 | http://localhost:8090 | Database + API |
| PocketBase Admin | 8091 | http://localhost:8091 | Admin dashboard |
| MQTT Broker | 1883 | localhost:1883 | IoT message broker |
| MQTT WebSocket | 9001 | ws://localhost:9001 | Web MQTT clients |
| ValKey | 6379 | localhost:6379 | Cache layer |

## Testing the System

### Send Test MQTT Message
```bash
# Install mosquitto clients
# macOS: brew install mosquitto
# Ubuntu: sudo apt install mosquitto-clients

# Subscribe to telemetry
mosquitto_sub -h localhost -t "pig/+/telemetry"

# Publish test data
mosquitto_pub -h localhost -t "pig/esp32-001/telemetry" \
  -m '{"temperature":38.5,"bodyTemp":39.2,"status":"NORMAL","timestamp":1234567890}'
```

### Check PocketBase
```bash
# List collections
curl http://localhost:8090/api/collections

# List telemetry records
curl http://localhost:8090/api/collections/telemetry/records
```

## Troubleshooting

### Port Already in Use
```bash
# Check what's using the port
lsof -i :8090

# Stop conflicting container
docker stop <container_name>
```

### Container Won't Start
```bash
# Check logs
docker compose logs pocketbase
docker compose logs mosquitto

# Restart specific service
docker compose restart pocketbase
```

### Reset Everything
```bash
# Stop and remove all data
docker compose down -v

# Start fresh
docker compose up -d
```

## Useful Commands

```bash
# View all containers
docker compose ps

# View logs (follow)
docker compose logs -f

# Stop all services
docker compose down

# Restart all services
docker compose restart

# Check ValKey cache
docker exec pigpulse-valkey valkey-cli INFO stats
```
