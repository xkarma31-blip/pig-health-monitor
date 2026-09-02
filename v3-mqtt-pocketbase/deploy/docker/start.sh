#!/bin/bash
# PigPulse v3 — Docker Stack (hybrid: some native, some Docker)
# Usage: bash start.sh
set -e

NETWORK="pigpulse-net"

echo "🐷 Starting PigPulse v3 stack..."

# Create network
docker network create $NETWORK 2>/dev/null || true

# ── Mosquitto ─────────────────────────────────────────────────
echo "📡 Starting Mosquitto..."
docker rm -f pigpulse-mosquitto 2>/dev/null || true
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
docker run -d \
  --name pigpulse-mosquitto \
  --network $NETWORK \
  --restart unless-stopped \
  -p 1883:1883 \
  -p 9001:9001 \
  -v "$SCRIPT_DIR/mosquitto/mosquitto.conf:/mosquitto/config/mosquitto.conf" \
  -v pigpulse-mosquitto-data:/mosquitto/data \
  eclipse-mosquitto:2

# ── ValKey ────────────────────────────────────────────────────
echo "📦 Starting ValKey..."
docker rm -f pigpulse-valkey 2>/dev/null || true
docker run -d \
  --name pigpulse-valkey \
  --network $NETWORK \
  --restart unless-stopped \
  -p 6380:6379 \
  valkey/valkey:8 valkey-server --maxmemory 256mb --maxmemory-policy allkeys-lru

# ── Thermal WebSocket ────────────────────────────────────────
echo "🌡️  Starting Thermal WebSocket..."
docker rm -f pigpulse-thermal-ws 2>/dev/null || true
docker run -d \
  --name pigpulse-thermal-ws \
  --network $NETWORK \
  --restart unless-stopped \
  -p 8080:8080 \
  -e MQTT_BROKER=mosquitto \
  -e MQTT_PORT=1883 \
  -e THERMAL_TOPIC=pig/+/thermal/live \
  pigpulse-thermal-ws

echo ""
echo "✅ Docker services started!"
echo ""
echo "📊 Also running natively (systemd):"
echo "   pigpulse-pocketbase — http://localhost:8090"
echo "   pigpulse-bridge     — MQTT→PocketBase"
echo "   OpenResty           — http://localhost:80"
echo ""
echo "🔧 Commands:"
echo "   Stop Docker:  docker stop pigpulse-mosquitto pigpulse-valkey pigpulse-thermal-ws"
echo "   Stop native:  sudo systemctl stop pigpulse-pocketbase pigpulse-bridge"
echo "   Logs:         journalctl -u pigpulse-pocketbase -f"
