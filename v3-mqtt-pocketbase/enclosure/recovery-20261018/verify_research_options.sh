#!/usr/bin/env bash
# Repeatable approximate-hardware experiments; no physical-fit certification.
set -euo pipefail
ROOT=$(cd -- "$(dirname -- "$0")" && pwd)
cd "$ROOT"
BLENDER=${BLENDER:-blender}
for script in build_low_tray_spacer.py check_low_tray_option.py \
  build_mic_corner_support.py check_mic_corner_installed.py \
  build_sht_research_carrier.py build_combined_research_scene.py \
  check_combined_research_scene.py; do
  "$BLENDER" -b --python-exit-code 1 --python "$script"
done
PIGPULSE_COMBINED_MIC_CHECK=1 "$BLENDER" -b --python-exit-code 1 --python check_mic_corner_installed.py
PIGPULSE_COMBINED_MIC_CHECK=1 PIGPULSE_MIC_SIDE=right "$BLENDER" -b --python-exit-code 1 --python check_mic_corner_installed.py
node check_thermal_bridge_optical_budget.js
# Thermal builder is intentionally not added until its actual outputs
# and independent checks have been inspected. Never silently skip a failed job.
