#!/usr/bin/env bash
# Ubuntu noble amd64 fallback; download/extract only, no system installation.
set -euo pipefail
ROOT=${1:-/tmp/opencode/pigpulse-slicer}
mkdir -p "$ROOT/runtime"
cd "$ROOT"
apt download prusa-slicer libboost-log1.83.0 libboost-filesystem1.83.0 \
  libboost-chrono1.83.0t64 libqhullcpp8.0 libnlopt0 libglew2.2 libwxgtk-gl3.2-1t64
for package in ./*.deb; do dpkg-deb -x "$package" runtime; done
export LD_LIBRARY_PATH="$ROOT/runtime/usr/lib/x86_64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
"$ROOT/runtime/usr/bin/prusa-slicer" --help > runtime-help.txt
sha256sum ./*.deb > downloaded-packages.sha256
echo "Extracted runtime at $ROOT/runtime"
