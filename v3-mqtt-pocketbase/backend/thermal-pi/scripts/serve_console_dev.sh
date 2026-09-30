#!/usr/bin/env bash
# Start the PigPulse technician console on the laptop, detached.
#
# The console is the SAME code that runs on the Pi (see
# docs/plans/2026-09-30-pi-admin-console-design.md). This only points it at a
# mounted SD card instead of live hardware:
#
#   http://127.0.0.1:8085/admin
#
# Usage:
#   ./scripts/serve_console_dev.sh              # start (default SD root)
#   ./scripts/serve_console_dev.sh /path/to/sd  # start from another card root
#   ./scripts/serve_console_dev.sh stop         # stop it
#   ./scripts/serve_console_dev.sh status       # is it up?
#
# Loopback only on purpose: the console can read source and config, so it must
# not land on a network by accident. web_server.py refuses a non-loopback bind
# in --dev-source mode without --dev-allow-any.
set -euo pipefail

APP="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PIGPULSE_CONSOLE_PORT:-8085}"
HOST="127.0.0.1"
SD_ROOT="${2:-/media/solrahk/rootfs}"
LOG="${PIGPULSE_CONSOLE_LOG:-/tmp/pigpulse-console.log}"
ACTION="${1:-start}"

# A distinct log per port so two consoles never clobber each other's log.
LOG="${LOG%.log}-$PORT.log"

running() { pgrep -f "web_server.py --dev-source .*--port ${PORT}\$" >/dev/null 2>&1; }

case "$ACTION" in
  stop)
    if pkill -f "web_server.py --dev-source .*--port ${PORT}\$"; then
      echo "[console] stopped on :${PORT}"
    else
      echo "[console] nothing was running on :${PORT}"
    fi
    exit 0
    ;;
  status)
    if running; then
      echo "[console] UP    http://${HOST}:${PORT}/admin   (log: ${LOG})"
      exit 0
    fi
    echo "[console] DOWN  nothing listening on :${PORT}"
    exit 1
    ;;
  start) ;;
  *)
    echo "usage: $0 [start|stop|status] [sd_root]" >&2
    exit 64
    ;;
esac

if running; then
  echo "[console] already up on :${PORT} — use '$0 stop' first to change sources"
  exit 0
fi

if [ ! -d "$SD_ROOT" ]; then
  echo "[console] SD root not mounted: ${SD_ROOT}" >&2
  echo "          plug the card in, or pass the mount point as the 2nd arg" >&2
  exit 2
fi

cd "$APP"
# setsid --fork returns immediately and puts the server in its own session, so
# it survives the shell that launched it. Without --fork, setsid's own process
# keeps the calling shell's pipe open and the caller appears to hang.
setsid --fork python3 -u web_server.py \
  --dev-source "$SD_ROOT" --host "$HOST" --port "$PORT" \
  </dev/null >"$LOG" 2>&1

# Wait for the bind rather than claiming success optimistically.
for _ in $(seq 1 40); do
  if (exec 3<>"/dev/tcp/${HOST}/${PORT}") 2>/dev/null; then
    exec 3<&- 3>&-
    echo "[console] UP    http://${HOST}:${PORT}/admin"
    echo "          data source: ${SD_ROOT}  (offline snapshot)"
    echo "          log: ${LOG}"
    exit 0
  fi
  sleep 0.25
done

echo "[console] FAILED to bind :${PORT} — last log lines:" >&2
tail -n 20 "$LOG" >&2 || true
exit 1
