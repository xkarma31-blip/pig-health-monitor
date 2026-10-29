#!/usr/bin/env bash
# Full current-source thermal evidence chain; does not certify physical hardware.
set -euo pipefail
cd -- "$(dirname -- "$0")"
BLENDER_THERMAL=${BLENDER_THERMAL:-/home/solrahk/.local/blender-4.2.3-linux-x64/blender}
# Builder deliberately cannot grant full installed-hardware acceptance. Its
# diagnostic exit1 must not suppress the stronger independent evaluation.
build_status=0
build_started=$(date +%s)
"$BLENDER_THERMAL" -b --python-exit-code 1 --python build_thermal_rear_insert.py || build_status=$?
if (( build_status != 0 && build_status != 1 )); then exit "$build_status"; fi
BUILD_STARTED="$build_started" node -e 'const fs=require("fs"),p="./research-adapters/thermal-rear-insert-checks.json";const r=JSON.parse(fs.readFileSync(p));if(fs.statSync(p).mtimeMs<Number(process.env.BUILD_STARTED)*1000||!r.P_unchanged||Object.keys(r.variants).length!==3||!Object.values(r.variants).every(v=>v.legacy_geometry_valid))process.exit(1)'
"$BLENDER_THERMAL" -b --python-exit-code 1 --python check_thermal_installed_hardware.py
node summarize_thermal_interfaces.js
bash slice_thermal_research.sh
node research-adapters/check_thermal_export_evidence.js
"$BLENDER_THERMAL" -b --python-exit-code 1 --python check_thermal_installed_scenes.py
node research-adapters/accept_thermal_repair.js
