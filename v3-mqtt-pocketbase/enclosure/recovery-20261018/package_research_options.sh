#!/usr/bin/env bash
# Self-contained digital research candidate, not physical approval.
set -euo pipefail
ROOT=$(cd -- "$(dirname -- "$0")" && pwd)
cd "$ROOT"
STAGE=$(mktemp -d /tmp/opencode/pigpulse-research-package-XXXXXXXX)
zip -q -r "$STAGE/pigpulse-component-research-options.zip" research-adapters \
  research_component_envelopes.json build_research_adapters.py \
  build_mic_corner_support.py check_mic_corner_installed.py \
  build_low_tray_spacer.py check_low_tray_option.py \
  check_component_reservations.py build_thermal_bridge_coupon.py \
  check_thermal_bridge_optical_budget.js verify_research_options.sh \
  build_sht_research_carrier.py build_thermal_rear_insert.py \
  render_research_sht.py \
  check_research_slicing.js \
  slice_research_options.sh \
  build_combined_research_scene.py check_combined_research_scene.py \
  render_combined_research_scene.py \
  check_thermal_installed_hardware.py check_thermal_installed_scenes.py \
  slice_thermal_research.sh \
  summarize_thermal_interfaces.js \
  verify_thermal_research.sh \
  check_integrated_routes.py check_integrated_export_contract.py \
  build_mic_retention_thread_option.py \
  verify_integrated_candidate.sh \
  accept_integrated_candidate.js \
  package_research_options.sh revision-p original-poster.png \
  -x '*.gcode' 'research-adapters/*.blend1' 'research-adapters/*/*.blend1' '*/source-evidence/*.html'
unzip -t "$STAGE/pigpulse-component-research-options.zip" > "$STAGE/integrity.log"
if [[ -f pigpulse-component-research-options.zip ]]; then
  cp pigpulse-component-research-options.zip "$STAGE/previous.zip"
fi
cp "$STAGE/pigpulse-component-research-options.zip" .
sha256sum pigpulse-component-research-options.zip > pigpulse-component-research-options.zip.sha256
echo "Self-contained research candidate; external Blender/Node/slicer required. Stage $STAGE"
