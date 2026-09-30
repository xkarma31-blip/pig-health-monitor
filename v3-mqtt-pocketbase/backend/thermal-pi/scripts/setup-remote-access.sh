#!/usr/bin/env bash
# ============================================================================
# PigPulse Pi — one-time remote-access setup
# ============================================================================
#
# WHY THIS EXISTS
#   The Pi is a headless sensor node. It has no desktop, so the only ways in
#   are SSH and a browser. This installs a browser-based terminal so you can
#   operate the Pi from a phone or laptop over the PigPulse AP without a
#   GUI, a VNC password dance, or a second monitor.
#
# READ THIS BEFORE RUNNING
#   * Run this WHILE THE PI STILL HAS INTERNET. The PigPulse AP has no WAN,
#     so `apt install` cannot work after you join it. Plug into Ethernet or
#     join your home WiFi first, run this, THEN join the AP.
#   * It does NOT install a desktop. A full LXDE/XFCE on a 4 GB Pi in a hot
#     barn costs RAM, CPU and SD writes, and can destabilise a working
#     headless sensor node. Use the web terminal + the thermal dashboard.
#   * Idempotent: safe to re-run.
#
# WHAT YOU GET
#   http://192.168.69.1:7681   -> web terminal (ttyd), runs as the pigpulse user
#   ssh pigpulse@192.168.69.1 -> normal shell
#   https://192.168.69.1:8080 -> the thermal dashboard (already running)
#
# USAGE
#   scp this-script.sh pigpulse@<pi-ip>:~/ && ssh pigpulse@<pi-ip> 'bash ~/this-script.sh'
#   or paste the contents into a terminal on the Pi and run it.
# ============================================================================
set -uo pipefail

PORT="${TTYD_PORT:-7681}"
USER_NAME="${SUDO_USER:-pigpulse}"

say() { printf '\n\033[1;32m== %s\033[0m\n' "$1"; }
warn() { printf '\033[1;33m   %s\033[0m\n' "$1"; }
die() { printf '\033[1;31mFAIL: %s\033[0m\n' "$1"; exit 1; }

# ── 0. Sanity ───────────────────────────────────────────────────────────────
say "0. Environment"
[ "$(id -u)" -eq 0 ] || die "run as root or with sudo (needs apt + systemd)"
if ping -c1 -W3 1.1.1.1 >/dev/null 2>&1 || ping -c1 -W3 archive.ubuntu.com >/dev/null 2>&1; then
  echo "   internet: YES (good — required for this install)"
else
  die "no internet. Run this BEFORE joining the PigPulse AP (it has no WAN)."
fi
echo "   host    : $(hostname)"
echo "   user    : $USER_NAME"

# ── 1. SSH must work (it is the fallback if the web terminal fails) ─────────
say "1. Ensuring SSH"
if systemctl list-unit-files ssh.service >/dev/null 2>&1 && \
   systemctl is-enabled ssh >/dev/null 2>&1; then
  echo "   ssh already enabled"
else
  apt-get install -y openssh-server >/dev/null 2>&1 || warn "openssh-server install failed"
  systemctl enable ssh 2>/dev/null || systemctl enable ssh.service 2>/dev/null
fi

# ── 2. Web terminal (ttyd) ──────────────────────────────────────────────────
say "2. Installing ttyd (browser terminal)"
if command -v ttyd >/dev/null 2>&1; then
  echo "   ttyd already present: $(ttyd --version 2>&1 | head -1)"
else
  DEB=$(mktemp /tmp/ttyd.XXXXXX.deb)
  # ttyd names its release assets ttyd.<arch> using uname-style arch names.
  # Verified: ttyd.aarch64 and ttyd.x86_64 both return HTTP 200 for 1.7.7.
  # (ttyd.arm64 does NOT exist and 404s — do not "fix" this back to arm64.)
  case "$(uname -m)" in
    aarch64) ARCH=aarch64 ;;
    x86_64)  ARCH=x86_64  ;;
    armv7l)  die "armv7 is not published as a prebuilt ttyd binary; use SSH" ;;
    *) die "unsupported arch $(uname -m)" ;;
  esac
  VER=1.7.7
  URL="https://github.com/tsl0922/ttyd/releases/download/${VER}/ttyd.${ARCH}"
  echo "   downloading ttyd ${VER} (${ARCH}) ..."
  if curl -fsSL "$URL" -o "$DEB"; then
    apt-get install -y "$DEB" >/dev/null 2>&1 && echo "   installed" || warn "apt install of the .deb failed"
  else
    warn "download failed — trying apt"
    apt-get install -y ttyd >/dev/null 2>&1 || warn "ttyd unavailable; SSH still works"
  fi
  rm -f "$DEB"
fi

# ── 3. Bind it to the AP address so it works with no DNS ───────────────────
say "3. Service"
AP_IP=$(ip -4 -o addr show wlan0 2>/dev/null | awk '{split($4,a,"/"); print a[1]; exit}')
AP_IP="${AP_IP:-192.168.69.1}"
echo "   binding to $AP_IP:$PORT"

cat > /etc/systemd/system/pigpulse-webterm.service <<EOF
[Unit]
Description=PigPulse browser terminal (ttyd) for remote operation
After=network-online.target
Wants=network-online.target

[Service]
# -W writable, -p port, -i listen addr, -c credential, -t options
ExecStart=/usr/bin/ttyd -W -p ${PORT} -i ${AP_IP} -t disableLeaveAlert=true -t fontSize=15 -m 60 ${USER_NAME}
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable pigpulse-webterm >/dev/null 2>&1
systemctl restart pigpulse-webterm
sleep 2
if systemctl is-active --quiet pigpulse-webterm; then
  echo "   webterm: ACTIVE"
else
  warn "webterm did not start — journalctl -u pigpulse-webterm"
fi

# ── 4. Tell you where everything is ─────────────────────────────────────────
say "DONE — connect to the PigPulse AP, then use these"
cat <<EOF

   Web terminal (phone/laptop browser):
       http://${AP_IP}:${PORT}

   SSH:
       ssh ${USER_NAME}@${AP_IP}

   Thermal dashboard (already running):
       https://${AP_IP}:8080/

   Thermal diagnosis (run over SSH):
       cd ~/thermal-pi && .venv/bin/python i2c_scanDiag.py
       curl -sk https://127.0.0.1:8080/data; echo
       journalctl -u pigpulse-thermal -n 25 --no-pager

EOF

say "Verify the thermal service was not disturbed"
systemctl is-active pigpulse-thermal || echo "   (thermal not running — run the diagnosis above)"
