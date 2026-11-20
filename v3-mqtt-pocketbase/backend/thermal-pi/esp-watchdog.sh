#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
STATE_DIR=/home/pigpulse/.local/state/pigpulse
if [ -n "${PIGPULSE_WATCHDOG_STATE_DIR:-}" ]; then
  STATE_DIR=$PIGPULSE_WATCHDOG_STATE_DIR
fi
PYTHON=${PIGPULSE_WATCHDOG_PYTHON:-/usr/bin/python3}

mkdir -p "$STATE_DIR"

# Acquire the descriptor lock before starting the watchdog. Lock contention
# exits quietly; the watchdog's own exit status is propagated unchanged.
exec 9>>"$STATE_DIR/esp-watchdog.lock"
status=0
/usr/bin/flock -n -E 75 9 || status=$?
case "$status" in
  0) ;;
  75) exit 0 ;;
  *) exit "$status" ;;
esac
exec "$PYTHON" "$SCRIPT_DIR/esp_watchdog.py" \
  --state "$STATE_DIR/esp-watchdog.state"
