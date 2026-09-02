#!/bin/bash
# PigPulse v3 — Bash health check (mirrors health_check.py)
set -u
PB_URL="http://127.0.0.1:8090"
ok=0; fail=0
check() { # name cmd
  local name="$1"; shift
  if eval "$@" >/dev/null 2>&1; then echo "✅ $name"; ok=$((ok+1)); else echo "❌ $name"; fail=$((fail+1)); fi
}
echo "PigPulse v3 — Bash Health Check"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
curl -sf http://127.0.0.1:8090/api/health | head -c 80; echo
check "PocketBase :8090" "curl -sf http://127.0.0.1:8090/api/health"
check "Mosquitto :1883 open" "bash -c 'exec 3<>/dev/tcp/127.0.0.1/1883'"
check "ValKey :6379" "bash -c 'exec 3<>/dev/tcp/127.0.0.1/6379'"
check "ValKey :6380" "bash -c 'exec 3<>/dev/tcp/127.0.0.1/6380'"
check "OpenResty :80 /health" "curl -sf http://127.0.0.1:80/health"
check "Thermal-WS :8080" "bash -c 'exec 3<>/dev/tcp/127.0.0.1/8080'"
check "systemd pigpulse-pocketbase" "systemctl is-active --quiet pigpulse-pocketbase"
check "systemd pigpulse-bridge" "systemctl is-active --quiet pigpulse-bridge"
check "docker mosquitto" "docker inspect -f '{{.State.Running}}' pigpulse-mosquitto | grep -q true"
check "docker valkey" "docker inspect -f '{{.State.Running}}' pigpulse-valkey | grep -q true"
check "docker thermal-ws" "docker inspect -f '{{.State.Running}}' pigpulse-thermal-ws | grep -q true"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "ok=$ok fail=$fail"
[ $fail -eq 0 ] || exit 1
