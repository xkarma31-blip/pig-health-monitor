#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd -- "$(dirname -- "$0")" && pwd)
cd "$ROOT"
node summarize_verification.js revision-p
STAGE=$(mktemp -d /tmp/opencode/pigpulse-p-release-XXXXXXXX)
ARCHIVE="$STAGE/pigpulse-revision-p-reviewed-prototype.zip"
zip -q -r "$ARCHIVE" revision-p original-poster.png logo-source-clean-crop.png \
  logo-source-transparent.png build_revision.py render_assembled.py \
  check_assembly.py check_bearing_seats.py check_grip_surfaces.py check_exports.js \
  summarize_verification.js slice_revision.sh fastener_ledger.js \
  check_strap_relief.py check_strap_corridor.py probe_split_boss_concept.py check_p_closure_assembly.py \
  verify_revision_p.sh package_revision_p.sh restore_slicer_runtime.sh \
  revision-n/microphone_strap_carrier.stl \
  -x '*.gcode' '*.blend1' '*/slicer/run-*/*'
unzip -t "$ARCHIVE" > "$STAGE/integrity.log"
if [[ -f pigpulse-revision-p-reviewed-prototype.zip ]]; then
  cp pigpulse-revision-p-reviewed-prototype.zip "$STAGE/previous-release.zip"
fi
cp "$ARCHIVE" pigpulse-revision-p-reviewed-prototype.zip
sha256sum pigpulse-revision-p-reviewed-prototype.zip > pigpulse-revision-p-reviewed-prototype.zip.sha256
echo "Preserved staging: $STAGE"
