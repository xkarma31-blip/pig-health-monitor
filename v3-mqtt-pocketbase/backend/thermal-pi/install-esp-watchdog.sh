#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
DEST_DIR=${PIGPULSE_WATCHDOG_DEST_DIR:-/home/pigpulse/bin}
STATE_DIR=${PIGPULSE_WATCHDOG_STATE_DIR:-/home/pigpulse/.local/state/pigpulse}
MOSQUITTO_SUB=/usr/bin/mosquitto_sub
MOSQUITTO_PUB=/usr/bin/mosquitto_pub
FLOCK=/usr/bin/flock
PYTHON=/usr/bin/python3
SOURCE_WRAPPER="$SCRIPT_DIR/esp-watchdog.sh"
SOURCE_PYTHON="$SCRIPT_DIR/esp_watchdog.py"

fail() {
  printf 'ESP watchdog installation failed: %s\n' "$1" >&2
  exit 1
}

for required_binary in \
  "$MOSQUITTO_SUB" \
  "$MOSQUITTO_PUB" \
  "$FLOCK" \
  "$PYTHON"
do
  if [ ! -x "$required_binary" ]; then
    fail "required executable not found: $required_binary"
  fi
done

for source_file in "$SOURCE_WRAPPER" "$SOURCE_PYTHON"; do
  if [ ! -f "$source_file" ] || [ ! -r "$source_file" ]; then
    fail "required source file not found or unreadable: $source_file"
  fi
done

check_client_version() {
  binary=$1
  label=$2
  version_status=0
  if output=$("$binary" --version 2>&1); then
    :
  else
    version_status=$?
  fi

  case "$output" in
    *" version "*) ;;
    *) fail "$label version check failed (status $version_status): $output" ;;
  esac
  version=${output#* version }
  version=${version%% *}
  major=${version%%.*}
  case "$major" in
    ''|*[!0-9]*) fail "could not parse $label version: $output" ;;
  esac
  if [ "$major" -lt 2 ]; then
    fail "mosquitto-clients 2.0 or newer is required ($label reports $version)"
  fi
}

check_client_version "$MOSQUITTO_SUB" mosquitto_sub
check_client_version "$MOSQUITTO_PUB" mosquitto_pub

/bin/sh -n "$SOURCE_WRAPPER" || fail "invalid shell source: $SOURCE_WRAPPER"
if ! "$PYTHON" - "$SOURCE_PYTHON" <<'PY'
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
compile(path.read_text(encoding="utf-8"), str(path), "exec")
PY
then
  fail "invalid Python source: $SOURCE_PYTHON"
fi

# A receive-window timeout (27) proves the anonymous local broker accepted the
# connection and subscription. Any other failure means the required endpoint
# is not usable yet.
if preflight_output=$("$MOSQUITTO_SUB" \
  -h 127.0.0.1 \
  -p 1883 \
  -t pig/s3-mic-01/telemetry \
  -W 15 2>&1); then
  preflight_status=0
else
  preflight_status=$?
fi
if [ "$preflight_status" -ne 0 ] && [ "$preflight_status" -ne 27 ]; then
  fail "anonymous local MQTT preflight failed (status $preflight_status): $preflight_output"
fi

backup_existing() {
  target=$1
  [ -e "$target" ] || return 0

  base="${target}.bak.${BACKUP_TIMESTAMP}"
  backup="$base"
  collision=1
  while [ -e "$backup" ]; do
    backup="${base}.${collision}"
    collision=$((collision + 1))
  done
  cp -p --no-clobber -- "$target" "$backup"
}

mkdir -p "$DEST_DIR" "$STATE_DIR"
BACKUP_TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
backup_existing "$DEST_DIR/esp-watchdog.sh"
backup_existing "$DEST_DIR/esp_watchdog.py"
install -m 0755 "$SOURCE_WRAPPER" "$DEST_DIR/esp-watchdog.sh"
install -m 0755 "$SOURCE_PYTHON" "$DEST_DIR/esp_watchdog.py"

printf 'Installed %s and %s\n' \
  "$DEST_DIR/esp-watchdog.sh" \
  "$DEST_DIR/esp_watchdog.py"
