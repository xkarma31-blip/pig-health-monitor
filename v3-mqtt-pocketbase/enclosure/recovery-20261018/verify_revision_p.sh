#!/usr/bin/env bash
# P-only reproducible digital candidate checks. Never deploys or prints.
set -euo pipefail
ROOT=$(cd -- "$(dirname -- "$0")" && pwd)
cd "$ROOT"
export PIGPULSE_REVISION=revision-p
blender -b --python-exit-code 1 --python build_revision.py
node check_exports.js revision-p
node fastener_ledger.js revision-p
for check in check_grip_surfaces.py check_strap_relief.py check_strap_corridor.py check_bearing_seats.py probe_split_boss_concept.py render_assembled.py check_assembly.py; do
  blender -b --python-exit-code 1 --python "$check"
done
blender -b --python-exit-code 1 --python check_p_closure_assembly.py
bash slice_revision.sh revision-p
node summarize_verification.js revision-p
