#!/bin/bash
# PigPulse v3 — Demo Script
# Run this to test the system end-to-end

echo "🐷 PigPulse v3 Demo"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Start Docker Desktop first."
    exit 1
fi

# Check if containers are running
echo "📋 Checking containers..."
RUNNING=$(docker ps | grep pigpulse | wc -l)
if [ "$RUNNING" -lt 5 ]; then
    echo "⚠️  Only $RUNNING containers running. Starting stack..."
    cd ~/PigHealthMonitor/v3-mqtt-pocketbase/deploy/docker
    docker-compose up -d
    sleep 10
fi

echo "✅ All containers running"
echo ""

# Test MQTT
echo "📡 Testing MQTT..."
docker exec pigpulse-mosquitto mosquitto_pub -t "pig/esp32-001/telemetry" \
    -m '{"temperature":38.5,"bodyTemp":39.2,"status":"NORMAL","batteryPct":85}' 2>/dev/null
echo "✅ MQTT message sent"
echo ""

# Test ValKey
echo "🗄️  Testing ValKey..."
docker exec pigpulse-valkey valkey-cli ping 2>/dev/null
echo "✅ ValKey responding"
echo ""

# Test OpenResty
echo "🌐 Testing OpenResty gateway..."
curl -s http://localhost/health 2>/dev/null
echo ""
echo "✅ Gateway responding"
echo ""

# Test PocketBase
echo "💾 Testing PocketBase..."
curl -sk https://localhost:8091/api/health 2>/dev/null | head -1
echo "✅ PocketBase responding"
echo ""

# Show bridge logs
echo "📨 Recent bridge activity:"
docker logs pigpulse-bridge 2>&1 | tail -5
echo ""

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ ALL SYSTEMS OPERATIONAL"
echo ""
echo "🔗 Links:"
echo "   PocketBase Admin: https://localhost:8091"
echo "   Expo App: http://localhost:8082"
echo "   MQTT Broker: localhost:1883"
echo ""
echo "📱 To simulate sensor data:"
echo "   mosquitto_pub -h localhost -t 'pig/esp32-001/telemetry' \\"
echo "     -m '{\"temperature\":40.1,\"status\":\"CRITICAL\"}'"
echo ""
echo "🛑 To stop: docker-compose down"
