#!/usr/bin/env bash
# Install the PigPulse audio-quality gate + classifier auto-start on the Pi.
# Run ON THE PI with sudo. Idempotent. No credentials are read or printed.
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "Run with sudo on the Pi." >&2; exit 1; }

SRC_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SRC_DIR/../../.." && pwd)"
GATE_SRC="$REPO_ROOT/backend/cough/audio_gate.py"
PI_USER="${SUDO_USER:-pigpulse}"

[ -f "$GATE_SRC" ] || { echo "Missing $GATE_SRC" >&2; exit 1; }

echo "== 1. install audio_gate.py =="
install -o "$PI_USER" -g "$PI_USER" -m 0755 "$GATE_SRC" /home/pigpulse/cough/audio_gate.py

echo "== 2. install units =="
for u in pigpulse-audio-gate.service pigpulse-audio-gate.timer \
         pigpulse-audio-ok.path pigpulse-cough.service; do
  if [ -f "$SRC_DIR/$u" ]; then
    install -o root -g root -m 0644 "$SRC_DIR/$u" "/etc/systemd/system/$u"
    echo "  installed $u"
  else
    echo "  SKIP $u (not found in $SRC_DIR)"
  fi
done

echo "== 3. runtime dir =="
mkdir -p /run/pigpulse

echo "== 4. reload + enable =="
systemctl daemon-reload
systemctl enable --now pigpulse-audio-gate.timer
systemctl enable --now pigpulse-audio-ok.path

echo "== 5. first gate check =="
systemctl start pigpulse-audio-gate.service
sleep 2
if [ -e /run/pigpulse/audio-ok ]; then
  echo "  audio-ok OPEN — classifier should start via the path unit"
else
  echo "  audio-ok CLOSED — mic failed the quality gate; classifier stays off (correct)"
fi

echo "== 6. status =="
systemctl is-active pigpulse-audio-gate.timer pigpulse-audio-ok.path pigpulse-cough || true
journalctl -u pigpulse-audio-gate.service --no-pager -n 3
echo "Done. No firmware or mic configuration was changed."
