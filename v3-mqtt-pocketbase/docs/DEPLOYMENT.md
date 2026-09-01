# PigPulse v3 — Deployment Guide

## Prerequisites

- Docker & Docker Compose
- ESP32 with MLX90640 + INMP441 sensors
- WiFi network

## Quick Start (Phone/Termux)

```bash
curl -sL https://raw.githubusercontent.com/.../termux-setup.sh | bash
```

## Quick Start (Laptop/Server)

```bash
cd v3-mqtt-pocketbase/deploy/docker
docker compose up -d
```

## Services

| Service | Port | URL |
|---------|------|-----|
| OpenResty | 80 | http://localhost |
| PocketBase API | 8090 | http://localhost:8090 |
| PocketBase Admin | 8091 | http://localhost:8091 |
| MQTT Broker | 1883 | localhost:1883 |
| MQTT WebSocket | 9001 | ws://localhost:9001 |
| ValKey | 6379 | localhost:6379 |

## Setup Steps

### 1. Start Services
```bash
docker compose up -d
```

### 2. Setup PocketBase Schema
```bash
cd backend/setup
python setup_pocketbase.py
```

### 3. Configure ESP32
Edit `firmware/src/main.cpp`:
```cpp
#define WIFI_SSID "YOUR_WIFI_SSID"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"
#define MQTT_BROKER "192.168.1.100"  // Your server IP
```

### 4. Flash Firmware
```bash
cd firmware
# Using PlatformIO or Arduino IDE
```

### 5. Open Dashboard
- PocketBase Admin: http://localhost:8091
- Expo App: http://localhost:8082 (if running)

## Environment Variables

Create `.env` in `deploy/docker/`:
```env
PB_EMAIL=admin@pigpulse.local
PB_PASSWORD=admin123
JWT_SECRET=your-secret-key
```

## Troubleshooting

### Bridge not connecting
```bash
docker compose logs mqtt-bridge
```

### PocketBase not responding
```bash
docker compose restart pocketbase
```

### MQTT broker offline
```bash
docker compose restart mosquitto
```

## Backup

```bash
# Backup PocketBase data
docker compose exec pocketbase tar -czf /pb/pb_data_backup.tar.gz /pb/pb_data

# Backup MQTT data
docker compose exec mosquitto tar -czf /mosquitto/data_backup.tar.gz /mosquitto/data
```
