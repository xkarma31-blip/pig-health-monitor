#!/bin/bash
# PigPulse v3 — Stop all services
set -e

echo "Stopping PigPulse v3..."

# Docker services
docker stop pigpulse-mosquitto pigpulse-valkey pigpulse-thermal-ws 2>/dev/null || true
docker rm pigpulse-mosquitto pigpulse-valkey pigpulse-thermal-ws 2>/dev/null || true

# Native services
sudo systemctl stop pigpulse-pocketbase pigpulse-bridge 2>/dev/null || true

# OpenResty
sudo openresty -s stop 2>/dev/null || true

echo "All services stopped."
