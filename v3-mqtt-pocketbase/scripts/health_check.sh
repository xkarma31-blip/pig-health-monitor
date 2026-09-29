#!/bin/bash
# PigPulse v3 — Bash health check (mirrors health_check.py)
# 2026-09-28 rig-awareness (grounded audit, session 2026-09-28):
#   * The Pi rig has NO Docker → the old docker/ValKey/OpenResty checks
#     false-failed there (3 of 5 fails were bogus).
#   * Mosquitto was only probed via 127.0.0.1 → a loopback-only bind reported
#     green while the ESP got refused on the AP address (serial rc=-2).
#     Now also probed via wlan0 (the address the ESP actually dials).
#   * ESP ingest :9090 is checked via /proc/net/tcp LISTEN state only —
#     connecting to it would kick the live ESP stream (single-client port).
set -u
PB_URL="http://127.0.0.1:8090"
ok=0; fail=0
check() { # name cmd
  local name="$1"; shift
  if eval "$@" >/dev/null 2>&1; then echo "✅ $name"; ok=$((ok+1)); else echo "❌ $name"; fail=$((fail+1)); fi
}
skip() { echo "⚠️  $1 — skipped ($2)"; }
ON_PI=0
[ -r /proc/device-tree/model ] && grep -qa "Raspberry" /proc/device-tree/model && ON_PI=1
RIG="laptop"; [ "$ON_PI" = 1 ] && RIG="pi"

echo "PigPulse v3 — Bash Health Check (rig: $RIG)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
curl -sf http://127.0.0.1:8090/api/health | head -c 80; echo
check "PocketBase :8090" "curl -sf http://127.0.0.1:8090/api/health"
check "Mosquitto :1883 loopback" "bash -c 'exec 3<>/dev/tcp/127.0.0.1/1883'"
check "Thermal-WS :8080" "bash -c 'exec 3<>/dev/tcp/127.0.0.1/8080'"
check "systemd pigpulse-pocketbase" "systemctl is-active --quiet pigpulse-pocketbase"
check "systemd pigpulse-bridge" "systemctl is-active --quiet pigpulse-bridge"

if [ "$ON_PI" = 1 ]; then
  # --- Pi rig: AP + CCTV + the ESP's real MQTT path ---
  WLAN_IP=$(ip -o -4 addr show wlan0 2>/dev/null | awk '{split($4,a,"/"); print a[1]; exit}')
  if [ -n "${WLAN_IP:-}" ]; then
    check "Mosquitto :1883 via $WLAN_IP (ESP path)" "bash -c 'exec 3<>/dev/tcp/$WLAN_IP/1883'"
  else
    skip "Mosquitto via wlan0 (ESP path)" "no wlan0 IPv4"
  fi
  check "ESP ingest :9090 LISTEN (no connect)" \
    "grep -qiE ':2382 [^ ]+ 0A ' /proc/net/tcp || grep -qiE ':2382 [^ ]+ 0A ' /proc/net/tcp6"
  check "systemd hostapd (AP PigPulse)" "systemctl is-active --quiet hostapd"
  check "systemd dnsmasq (DHCP + CCTV lease)" "systemctl is-active --quiet dnsmasq"
  check "systemd pigpulse-cctv" "systemctl is-active --quiet pigpulse-cctv"
  check "CCTV mjpeg :8091" "bash -c 'exec 3<>/dev/tcp/127.0.0.1/8091'"
else
  # --- laptop rig: docker stack + gateway (absent on the Pi) ---
  check "ValKey :6379" "bash -c 'exec 3<>/dev/tcp/127.0.0.1/6379'"
  check "ValKey :6380" "bash -c 'exec 3<>/dev/tcp/127.0.0.1/6380'"
  check "OpenResty :80 /health" "curl -sf http://127.0.0.1:80/health"
fi

if command -v docker >/dev/null 2>&1; then
  check "docker mosquitto" "docker inspect -f '{{.State.Running}}' pigpulse-mosquitto | grep -q true"
  check "docker valkey" "docker inspect -f '{{.State.Running}}' pigpulse-valkey | grep -q true"
  check "docker thermal-ws" "docker inspect -f '{{.State.Running}}' pigpulse-thermal-ws | grep -q true"
else
  skip "docker mosquitto/valkey/thermal-ws" "no docker binary"
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "ok=$ok fail=$fail"
[ $fail -eq 0 ] || exit 1
