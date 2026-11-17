#!/bin/bash
# Roll back the 2026-11-17 split-radio role correction.
#
# Usage:
#   sudo bash rollback-radio-roles.sh /root/pigpulse-backups/radio-roles-<stamp>
#
# The apply step creates that timestamped directory with copies of every live
# file it changed. This script restores them verbatim and restarts only the
# radio-facing services. It does not wipe PB data or network state.
set -euo pipefail

BK="${1:-}"
if [ -z "$BK" ] || [ ! -d "$BK" ]; then
  echo "usage: $0 <backup-directory>" >&2
  exit 2
fi

FILES=(
  "/usr/local/lib/pigpulse-portal/portal.py"
  "/usr/local/sbin/pigpulse-ap-resolve"
  "/usr/local/sbin/pigpulse-ap-static-ip"
  "/usr/local/sbin/pigpulse-uplink-apply"
  "/usr/local/sbin/pigpulse-portal-connect"
  "/usr/local/sbin/pigpulse-wan-sta-up"
  "/usr/local/sbin/pigpulse-wan-pick"
  "/etc/hostapd/hostapd.conf"
  "/etc/dnsmasq.conf"
)

for dest in "${FILES[@]}"; do
  name=$(basename "$dest")
  if [ -f "$BK/$name" ]; then
    cp -a "$BK/$name" "$dest"
    echo "restored $dest"
  else
    echo "warning: no backup for $dest" >&2
  fi
done

/usr/local/sbin/pigpulse-ap-resolve || true
systemctl restart dnsmasq.service 2>/dev/null || true
systemctl restart hostapd.service 2>/dev/null || true
systemctl restart pigpulse-portal.service 2>/dev/null || true

echo "radio role rollback complete from $BK"
