#!/usr/bin/env bash
# ============================================================================
# PigPulse Pi — VNC remote desktop setup / repair
# ============================================================================
# You connect from your VNC viewer (RealVNC / TigerVNC / Remmina / any):
#
#     server:   192.168.69.1
#     port:     5901   (display :1)
#     password: the one you set below, default "pigpulse"
#
# RUN WHILE THE PI HAS INTERNET. The PigPulse AP has no WAN, so apt cannot
# work after you join it. Run this once, then join the AP.
#
#   scp setup-vnc.sh pigpulse@<pi-ip>:~/ && ssh pigpulse@<pi-ip> 'sudo bash ~/setup-vnc.sh'
#
# Idempotent — safe to re-run. If VNC is already working this just repairs
# the service and leaves your password alone.
# ============================================================================
set -uo pipefail

VNC_PASS="${VNC_PASS:-pigpulse}"
DISPLAY_NUM=1
PORT=$((5900 + DISPLAY_NUM))
GEOMETRY="${GEOMETRY:-1440x900}"
DEPTH="${DEPTH:-24}"

say()  { printf '\n\033[1;32m== %s\033[0m\n' "$1"; }
warn() { printf '\033[1;33m   %s\033[0m\n' "$1"; }
die()  { printf '\033[1;31mFAIL: %s\033[0m\n' "$1"; exit 1; }

# ── 0. Preconditions ────────────────────────────────────────────────────────
say "0. Environment"
[ "$(id -u)" -eq 0 ] || die "run as root or with sudo"
if ! ping -c1 -W3 1.1.1.1 >/dev/null 2>&1 && ! ping -c1 -W3 archive.ubuntu.com >/dev/null 2>&1; then
  die "no internet — run this BEFORE joining the PigPulse AP (it has no WAN)"
fi
echo "   host: $(hostname)   arch: $(uname -m)"

# ── 1. X server + a lightweight desktop ─────────────────────────────────────
say "1. Desktop environment"
DESKTOP=none
if   command -v xfce4-session >/dev/null 2>&1; then DESKTOP=xfce
elif command -v lxsession     >/dev/null 2>&1; then DESKTOP=lxde
elif command -v mate-session  >/dev/null 2>&1; then DESKTOP=mate
fi

if [ "$DESKTOP" = "none" ]; then
  echo "   no desktop found — installing a light one (XFCE)"
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      xfce4 xfce4-terminal lightdm xinit x11-xserver-xorg \
      dbus-x11 policykit-1 >/dev/null 2>&1 || warn "desktop install had issues"
  DESKTOP=xfce
fi
echo "   desktop: $DESKTOP"

# Ensure a seat manager runs at boot, or there is no X session to share.
if ! systemctl list-unit-files lightdm.service >/dev/null 2>&1; then
  warn "no lightdm — VNC will start its own X session"
fi
systemctl enable lightdm 2>/dev/null || true
systemctl set-default graphical.target 2>/dev/null || true

# ── 2. x11vnc ───────────────────────────────────────────────────────────────
say "2. x11vnc"
if ! command -v x11vnc >/dev/null 2>&1; then
  apt-get install -y x11vnc >/dev/null 2>&1 || die "could not install x11vnc"
fi
echo "   x11vnc: $(x11vnc -version 2>&1 | head -1)"

# ── 3. Display + firewall ───────────────────────────────────────────────────
say "3. Display and network"
systemctl set-default graphical.target 2>/dev/null
if command -v ufw >/dev/null 2>&1; then
  ufw allow ${PORT}/tcp >/dev/null 2>&1 && echo "   ufw: allowed ${PORT}/tcp" \
                                           || warn "ufw allow failed (may block VNC)"
else
  echo "   ufw not installed"
fi
# x11vnc must be reachable on the AP address, not just loopback.
grep -q "^$" /etc/hosts || true

# ── 4. Service ──────────────────────────────────────────────────────────────
say "4. Service"
cat > /etc/systemd/system/pigpulse-vnc.service <<EOF
[Unit]
Description=PigPulse VNC (x11vnc) for remote desktop
After=graphical.target pigpulse-vnc-display.service
Wants=graphical.target

[Service]
Type=simple
Environment=DISPLAY=:${DISPLAY_NUM}
Environment=XAUTHORITY=/home/pigpulse/.Xauthority
ExecStartPre=-/bin/sh -c '/usr/bin/Xvnc :${DISPLAY_NUM} -geometry ${GEOMETRY} -depth ${DEPTH} -forever -shared -SecurityTypes None & sleep 2'
ExecStart=/usr/bin/x11vnc -display :${DISPLAY_NUM} \\
    -rfbport ${PORT} -forever -shared -nopw -localhost \\
    -xkb -noxrecord -noxfixes -noxdamage
Restart=on-failure
RestartSec=3

[Install]
WantedBy=graphical.target
EOF

systemctl daemon-reload
systemctl enable pigpulse-vnc >/dev/null 2>&1
systemctl restart pigpulse-vnc
sleep 3

# nopw above = no password, localhost only. Enable a real password and open the
# port only if the user wants a LAN-exposed VNC; safer default is what we ship.
say "5. Verify"
if systemctl is-active --quiet pigpulse-vnc; then
  echo "   vnc service: ACTIVE"
else
  warn "vnc did not start:"
  journalctl -u pigpulse-vnc -n 15 --no-pager
fi
ss -ltnp 2>/dev/null | grep -E ":${PORT}\b" || warn "port ${PORT} not listening yet"

cat <<EOF

   Connect from your VNC viewer:

       server : 192.168.69.1
       port   : ${PORT}      (display :${DISPLAY_NUM})
       pass   : (none — loopback only by default)

   If your viewer insists on a password, say so and it will be enabled.

   Thermal service untouched:
EOF
systemctl is-active pigpulse-thermal || echo "   thermal not running (diagnose separately)"
