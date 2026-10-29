#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "$0")"
BLENDER=${BLENDER:-blender}
BLENDER_THERMAL=${BLENDER_THERMAL:-/home/solrahk/.local/blender-4.2.3-linux-x64/blender}
bash verify_research_options.sh
bash verify_thermal_research.sh
export PIGPULSE_THERMAL_VARIANT=pcb25_4square
"$BLENDER" -b --python-exit-code 1 --python build_combined_research_scene.py
"$BLENDER" -b --python-exit-code 1 --python check_combined_research_scene.py
for side in left right; do
  PIGPULSE_COMBINED_MIC_CHECK=1 PIGPULSE_MIC_SIDE=$side PIGPULSE_MIC_SCENE="$PWD/research-adapters/combined-thermal-candidate.blend" "$BLENDER" -b --python-exit-code 1 --python check_mic_corner_installed.py
done
"$BLENDER" -b --python-exit-code 1 --python check_integrated_routes.py
"$BLENDER" -b --python-exit-code 1 --python check_integrated_routes.py -- --self-test
"$BLENDER" -b --python-exit-code 1 --python build_mic_retention_thread_option.py
"$BLENDER_THERMAL" -b --python-exit-code 1 --python check_integrated_export_contract.py -- --reports research-adapters/export-contract-42 --self-test
bash slice_research_options.sh
node - <<'JS'
const fs=require('fs'),crypto=require('crypto');
const files=['research-adapters/combined-thermal-candidate.blend','research-adapters/combined-thermal-checks.json','research-adapters/integrated-routes.json','research-adapters/mic-retention-thread-checks.json','research-adapters/export-contract-42/baseline.json','research-adapters/export-contract-42/summary.json',...fs.readdirSync('.').filter(n=>/\.(py|js|sh)$/.test(n))];
const hashes=Object.fromEntries(files.map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')]));
fs.writeFileSync('research-adapters/integrated-run-inputs.json',JSON.stringify(hashes,null,2));
JS
node accept_integrated_candidate.js
