#!/bin/bash
# PigPulse v3 — Termux One-Liner Setup
# Run on Android phone via Termux
#
# Usage:
#   curl -sL https://raw.githubusercontent.com/.../termux-setup.sh | bash

set -e

echo "🐷 PigPulse v3 — Phone Setup"
echo "=============================="
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "📦 Docker not found. Installing..."
    pkg update -y
    pkg install docker -y
    echo "✅ Docker installed"
fi

# Check if Docker Compose is available
if ! docker compose version &> /dev/null; then
    echo "📦 Docker Compose not found. Installing..."
    pkg install docker-compose -y
    echo "✅ Docker Compose installed"
fi

# Create project directory
PROJECT_DIR="$HOME/pigpulse"
mkdir -p "$PROJECT_DIR"
cd "$PROJECT_DIR"

echo "📁 Project directory: $PROJECT_DIR"

# Download docker-compose.yml
echo "📥 Downloading docker-compose.yml..."
curl -sL https://raw.githubusercontent.com/Solrahk/pig-health-monitor/master/v3-mqtt-pocketbase/deploy/docker/docker-compose.yml -o docker-compose.yml

# Download configs
echo "📥 Downloading configs..."
mkdir -p mosquitto/config
curl -sL https://raw.githubusercontent.com/Solrahk/pig-health-monitor/master/v3-mqtt-pocketbase/deploy/docker/mosquitto/mosquitto.conf -o mosquitto/config/mosquitto.conf

# Download OpenResty configs
echo "📥 Downloading OpenResty configs..."
mkdir -p openresty/conf openresty/lua
curl -sL https://raw.githubusercontent.com/Solrahk/pig-health-monitor/master/v3-mqtt-pocketbase/deploy/openresty/conf/nginx.conf -o openresty/conf/nginx.conf
curl -sL https://raw.githubusercontent.com/Solrahk/pig-health-monitor/master/v3-mqtt-pocketbase/deploy/openresty/lua/rate_limit.lua -o openresty/lua/rate_limit.lua
curl -sL https://raw.githubusercontent.com/Solrahk/pig-health-monitor/master/v3-mqtt-pocketbase/deploy/openresty/lua/cache.lua -o openresty/lua/cache.lua
curl -sL https://raw.githubusercontent.com/Solrahk/pig-health-monitor/master/v3-mqtt-pocketbase/deploy/openresty/lua/auth.lua -o openresty/lua/auth.lua

# Download bridge
echo "📥 Downloading MQTT bridge..."
mkdir -p mqtt_bridge
curl -sL https://raw.githubusercontent.com/Solrahk/pig-health-monitor/master/v3-mqtt-pocketbase/backend/bridge/mqtt_bridge.py -o mqtt_bridge/mqtt_bridge.py
curl -sL https://raw.githubusercontent.com/Solrahk/pig-health-monitor/master/v3-mqtt-pocketbase/backend/bridge/requirements.txt -o mqtt_bridge/requirements.txt
curl -sL https://raw.githubusercontent.com/Solrahk/pig-health-monitor/master/v3-mqtt-pocketbase/backend/bridge/Dockerfile -o mqtt_bridge/Dockerfile

echo ""
echo "🚀 Starting PigPulse stack..."
docker compose up -d

echo ""
echo "✅ PigPulse v3 is running!"
echo ""
echo "📊 Services:"
echo "   OpenResty (API Gateway): http://localhost:80"
echo "   PocketBase API: http://localhost:8090"
echo "   PocketBase Admin: http://localhost:8091"
echo "   MQTT Broker: localhost:1883"
echo "   MQTT WebSocket: ws://localhost:9001"
echo ""
echo "🔧 Commands:"
echo "   Start:   cd $PROJECT_DIR && docker compose up -d"
echo "   Stop:    cd $PROJECT_DIR && docker compose down"
echo "   Logs:    cd $PROJECT_DIR && docker compose logs -f"
echo "   Status:  cd $PROJECT_DIR && docker compose ps"
