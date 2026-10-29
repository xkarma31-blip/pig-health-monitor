#!/usr/bin/env bash
# Digital slicing only: temperatures are provisional, not printer qualification.
set -euo pipefail
cd -- "$(dirname -- "$0")"
SLICER=${SLICER:-/tmp/opencode/pigpulse-slicer/runtime/usr/bin/prusa-slicer}
if [[ "$SLICER" == /tmp/opencode/pigpulse-slicer/runtime/usr/bin/prusa-slicer ]]; then
  export LD_LIBRARY_PATH=/tmp/opencode/pigpulse-slicer/runtime/usr/lib/x86_64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}
fi
[[ -x "$SLICER" ]] || { echo 'Set SLICER to a compatible PrusaSlicer executable.' >&2; exit 1; }
mkdir -p research-adapters/slicer
for name in sht-12x12 sht-18x12.7 sht-25.5x17.7 mic_14x12_corner_support research_spine_tray_access; do
  "$SLICER" --export-gcode --layer-height 0.2 --nozzle-diameter 0.4 \
    --perimeters 4 --fill-density '20%' --temperature 235 --bed-temperature 80 \
    --filament-type PETG --support-material --support-material-buildplate-only \
    --bed-shape '0x0,220x0,220x220,0x220' \
    --output "research-adapters/slicer/$name.gcode" "research-adapters/$name.stl" \
    > "research-adapters/slicer/$name.log" 2>&1
done
node check_research_slicing.js
