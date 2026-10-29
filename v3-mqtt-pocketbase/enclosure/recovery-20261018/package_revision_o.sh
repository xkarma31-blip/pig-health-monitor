#!/usr/bin/env bash
# Package current digital prototype only after verification passes.
set -euo pipefail
ROOT=$(cd -- "$(dirname -- "$0")" && pwd)
cd "$ROOT"
node summarize_verification.js revision-o
# Use a new archive rather than update an old ZIP (which retains stale entries).
STAGE=$(mktemp -d /tmp/opencode/pigpulse-o-package-XXXXXXXX)
ARCHIVE="$STAGE/pigpulse-revision-o-reviewed-prototype.zip"
zip -q -r "$ARCHIVE" revision-o \
  original-poster.png logo-source-clean-crop.png logo-source-transparent.png \
  build_revision.py render_assembled.py check_assembly.py check_bearing_seats.py \
  check_grip_surfaces.py check_exports.js summarize_verification.js \
  slice_revision.sh verify_revision.sh fastener_ledger.js \
  check_strap_relief.py check_strap_corridor.py package_revision_o.sh restore_slicer_runtime.sh \
  revision-n/microphone_strap_carrier.stl \
  -x '*.gcode' '*.blend1' '*/slicer/run-*/*'
unzip -t "$ARCHIVE" > "$STAGE/archive-test.log"
# Leave previous archive preserved instead of replacing it silently.
if [[ -f pigpulse-revision-o-reviewed-prototype.zip ]]; then
  cp --no-clobber pigpulse-revision-o-reviewed-prototype.zip "$STAGE/previous-release.zip"
fi
cp "$ARCHIVE" pigpulse-revision-o-reviewed-prototype.zip
sha256sum pigpulse-revision-o-reviewed-prototype.zip > pigpulse-revision-o-reviewed-prototype.zip.sha256
echo "Package verified; staging and previous release preserved at $STAGE"
