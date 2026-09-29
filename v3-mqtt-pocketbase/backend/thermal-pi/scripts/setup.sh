#!/usr/bin/env bash
# PigPulse thermal-pi — provision/repair setup on the Pi (idempotent, offline).
#
#   sudo bash ~/thermal-pi/scripts/setup.sh
#
# Safe to re-run. It provisions the venv and, only when the unit is MISSING,
# installs a systemd unit. It deliberately does NOT overwrite an existing unit:
# the previous version rewrote it unconditionally and silently dropped the
# firstboot ordering, and any hand-applied drop-in adjacent to it (tls.conf)
# then describes a service that no longer matches the unit on disk.
#
# The unit files in the repo (backend/systemd/) are the source of truth; copy
# them across rather than letting this script generate them.
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV="$APP_DIR/.venv"
SERVICE=pigpulse-thermal.service
USER_NAME="${SUDO_USER:-pigpulse}"
WHEELS="$APP_DIR/wheels"

echo "[setup] app: $APP_DIR"
cd "$APP_DIR"

# 1) venv + deps (Debian trixie is PEP 668 — never pip install system-wide)
if [[ ! -x "$VENV/bin/python" ]]; then
  echo "[setup] creating venv..."
  python3 -m venv "$VENV"
fi

# The bridge shares this venv and needs paho-mqtt + requests. Installing them
# only when requirements.txt already lists them is what left the bridge
# crash-looping on ModuleNotFoundError for its whole life: the requirements
# file was edited days after firstboot had already been marked done, and
# firstboot never ran again. Always install the full requirements.txt here.
if compgen -G "$WHEELS/*.whl" >/dev/null 2>&1; then
  echo "[setup] offline install from $WHEELS"
  "$VENV/bin/pip" install --no-index --find-links "$WHEELS" -r requirements.txt
else
  echo "[setup] no local wheels — installing from PyPI"
  "$VENV/bin/pip" install --upgrade pip -q
  "$VENV/bin/pip" install -r requirements.txt
fi

# 2) Prove the things the services actually import. The venv existing is not
#    evidence the venv is usable; importing the two entry points is.
echo "[setup] verifying imports"
"$VENV/bin/python" - <<'PY'
import importlib, sys
mods = ["mlx.mlx90640", "paho.mqtt.client", "requests"]
bad = []
for m in mods:
    try:
        importlib.import_module(m)
        print(f"  ok      {m}")
    except Exception as e:
        bad.append(m)
        print(f"  MISSING {m}: {e}")
if bad:
    sys.exit(f"required modules missing: {bad}")
PY

# 3) i2c group (the service runs as this user and opens /dev/i2c-1)
if ! id -nG "$USER_NAME" | tr ' ' '\n' | grep -qx i2c; then
  echo "[setup] adding $USER_NAME to i2c (re-login / restart service for it to apply)"
  usermod -aG i2c "$USER_NAME" 2>/dev/null || true
fi

# 4) I2C bus node
if [[ ! -e /dev/i2c-1 ]]; then
  echo "[setup] WARN: /dev/i2c-1 missing — dtparam=i2c_arm=on then reboot"
else
  echo "[setup] /dev/i2c-1 present"
  "$VENV/bin/python" "$APP_DIR/i2c_scanDiag.py" || true
fi

# 5) systemd: install ONLY if absent, then start
UNIT_PATH="/etc/systemd/system/$SERVICE"
if [[ $EUID -eq 0 ]]; then
  if [[ -f "$UNIT_PATH" ]]; then
    echo "[setup] $UNIT_PATH already exists — leaving it untouched"
  else
    echo "[setup] ERROR: $UNIT_PATH missing. Copy it from backend/systemd/ (do"
    echo "        not generate it here — that is how the unit drifted before)."
    exit 1
  fi
  systemctl daemon-reload
  systemctl enable --now "$SERVICE"
  echo "[setup] enabled + started $SERVICE"
  systemctl --no-pager --full status "$SERVICE" | head -15 || true
else
  echo "[setup] skip systemd (not root) — needs: sudo bash $0"
fi

echo "[setup] done."
echo "  Scan:   $VENV/bin/python $APP_DIR/i2c_scanDiag.py"
echo "  Diag:   $VENV/bin/python $APP_DIR/scripts/pi_diag.py"
echo "  Health: curl -sk https://127.0.0.1:8080/health"
