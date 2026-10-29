#!/usr/bin/env bash
# Evidence profile only. Never execute resulting G-code blindly on a printer.
set -euo pipefail
ROOT=$(cd -- "$(dirname -- "$0")" && pwd)
REV=${1:-revision-o}
SLICER=${PRUSA_SLICER:-/tmp/opencode/pigpulse-slicer/runtime/usr/bin/prusa-slicer}
export LD_LIBRARY_PATH="/tmp/opencode/pigpulse-slicer/runtime/usr/lib/x86_64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
test -x "$SLICER"
mkdir -p "$ROOT/$REV/slicer"
RUN=$(mktemp -d "$ROOT/$REV/slicer/run-XXXXXXXX")
sha256sum "$ROOT/$REV"/*.stl > "$RUN/input-before.sha256"
for f in "$ROOT/$REV"/*.stl; do
  n=$(basename "$f" .stl)
  support=()
  case "$n" in thermal_angled_hood|thermal_raised_cradle)
    support=(--support-material --support-material-buildplate-only);;
  esac
  if [[ "$REV" == revision-p && "$n" == main_tub ]]; then
    support=(--support-material --support-material-buildplate-only)
  fi
  "$SLICER" --export-gcode --layer-height 0.2 --nozzle-diameter 0.4 \
    --perimeters 4 --fill-density '20%' --temperature 235 \
    --first-layer-temperature 235 --bed-temperature 80 \
    --first-layer-bed-temperature 80 --filament-type PETG \
    --bed-shape '0x0,220x0,220x220,0x220' "${support[@]}" \
    --output "$RUN/$n.gcode" "$f" > "$RUN/$n.log" 2>&1
  test -s "$RUN/$n.gcode"
  grep -q 'Slicing result exported' "$RUN/$n.log"
done
sha256sum --check "$RUN/input-before.sha256" > "$RUN/input-check.log"
cp "$RUN"/*.gcode "$RUN"/*.log "$ROOT/$REV/slicer/"
node - "$ROOT/$REV" <<'JS'
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const dir=process.argv[2],hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const parts=JSON.parse(fs.readFileSync(path.join(dir,'mesh-checks.json'))).parts;
const records=Object.fromEntries(parts.map(p=>[p.name,{
  stl_sha256:hash(path.join(dir,p.name+'.stl')),
  gcode_sha256:hash(path.join(dir,'slicer',p.name+'.gcode')),
  log_sha256:hash(path.join(dir,'slicer',p.name+'.log'))
}]));
fs.writeFileSync(path.join(dir,'slicer','input-manifest.json'),JSON.stringify(records,null,2));
JS
node "$ROOT/summarize_verification.js" "$REV"
