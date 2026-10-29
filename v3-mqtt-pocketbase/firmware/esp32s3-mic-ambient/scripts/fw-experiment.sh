#!/usr/bin/env bash
# Create a fresh editable copy of the ESP32-S3 firmware so improvements are
# made in the COPY. The verified working snapshot is never edited in place.
#
# Usage:
#   fw-experiment.sh <short-label>                    # copy from current project
#   fw-experiment.sh <short-label> <project-dir>      # copy from a specific source
#
# Then edit/build/flash ONLY inside the copy it prints. See docs/KNOWN_GOOD.md.
set -euo pipefail

FW_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT="$FW_DIR/arduino/esp32s3_telemetry"
DEST_ROOT="$HOME/sandbox/fw-experiments"

label="${1:-}"
src="${2:-$PROJECT}"
if [ -z "$label" ]; then
  echo "usage: $(basename "$0") <short-label> [source-project-dir]" >&2
  exit 2
fi
case "$label" in
  *[!a-z0-9._-]*) echo "label must be lowercase letters, digits, dot, dash, underscore" >&2; exit 2 ;;
esac
[ -d "$src/src" ] || { echo "no src/ directory in: $src" >&2; exit 2; }

dest="$DEST_ROOT/$(date +%Y%m%d-%H%M%S)-$label"
[ -e "$dest" ] && { echo "already exists: $dest" >&2; exit 1; }
mkdir -p "$dest"
cp -r "$src/src" "$dest/src"
cp "$src"/platformio*.ini "$dest/"
[ -f "$src/test_pcm_conversion.cjs" ] && cp "$src/test_pcm_conversion.cjs" "$dest/"

echo "Experiment copy ready: $dest"
echo
echo "Work ONLY inside that copy. Build and flash from it:"
echo "  cd $dest"
echo "  ~/.platformio/penv/bin/pio run                 # build"
echo "  ~/.platformio/penv/bin/pio run -t upload       # flash (port /dev/ttyACM0)"
echo
echo "Only after it verifies on real hardware:"
echo "  1. copy the copy's src back over $PROJECT/src/"
echo "  2. create a new frozen snapshot with SHA256SUMS (see docs/KNOWN_GOOD.md)"
echo "  3. update LATEST_VERIFIED_BACKUP.txt and KNOWN_GOOD.md"
echo "The previous snapshots stay untouched and remain the way back."
