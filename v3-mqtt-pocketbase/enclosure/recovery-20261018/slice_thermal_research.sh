#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "$0")"
# Never slice rejected research geometry under a success label.
node - <<'JS'
const fs=require('fs'),crypto=require('crypto');
const dir='research-adapters';
const files=fs.readdirSync(dir).filter(n=>/^thermal-installed-hardware-checks-.*\.json$/.test(n)).sort();
const r=JSON.parse(fs.readFileSync(`${dir}/${files.at(-1)}`));
const b=JSON.parse(fs.readFileSync(`${dir}/thermal-rear-insert-checks.json`));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
if(!b.P_unchanged||!r.acceptance||r.checker_sha256!==hash('check_thermal_installed_hardware.py')||r.variants.length!==3||r.variants.some(v=>hash(v.scene)!==v.sha256))process.exit(1);
JS
SLICER=${SLICER:-/tmp/opencode/pigpulse-slicer/runtime/usr/bin/prusa-slicer}
export LD_LIBRARY_PATH=/tmp/opencode/pigpulse-slicer/runtime/usr/lib/x86_64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}
for board in pcb25_4x17_78 pcb25_4square pcb28x16; do
  for suffix in rear_insert retainer_1 retainer_2; do
    name=${board}_${suffix}
    "$SLICER" --export-gcode --layer-height 0.2 --nozzle-diameter 0.4 \
      --perimeters 4 --fill-density '20%' --temperature 235 --bed-temperature 80 \
      --filament-type PETG --support-material --support-material-buildplate-only \
      --bed-shape '0x0,220x0,220x220,0x220' \
      --output "research-adapters/slicer/$name.gcode" "research-adapters/$name.stl" \
      > "research-adapters/slicer/$name.log" 2>&1
  done
done
