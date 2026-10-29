#!/usr/bin/env bash
# Digital evidence only; this never prints or deploys anything.
set -euo pipefail
ROOT=$(cd -- "$(dirname -- "$0")" && pwd)
cd "$ROOT"
REV=${1:-revision-o}
[[ "$REV" =~ ^revision-[a-z]+$ ]] || { echo 'Invalid revision name' >&2; exit 2; }
[[ "$REV" == revision-o ]] || { echo 'This runner builds current O geometry only; refusing to overwrite another revision.' >&2; exit 2; }
export PIGPULSE_REVISION="$REV"
blender -b --python-exit-code 1 --python build_revision.py
node check_exports.js "$REV"
node fastener_ledger.js "$REV"
blender -b --python-exit-code 1 --python check_grip_surfaces.py
blender -b --python-exit-code 1 --python check_strap_relief.py
blender -b --python-exit-code 1 --python check_strap_corridor.py
blender -b --python-exit-code 1 --python check_bearing_seats.py
blender -b --python-exit-code 1 --python render_assembled.py
blender -b --python-exit-code 1 --python check_assembly.py
bash slice_revision.sh "$REV"
node summarize_verification.js "$REV"
