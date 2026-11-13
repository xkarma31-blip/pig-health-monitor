#!/bin/bash
# Install the PigPulse local portal on the Pi. Idempotent; safe to re-run.
set -eu
SRC=$(cd "$(dirname "$0")" && pwd)
DEST=/usr/local/lib/pigpulse-portal
PSK_OWNER=${SUDO_USER:-root}

[ "$(id -u)" -eq 0 ] || { echo "run me with sudo" >&2; exit 1; }

echo "== installing the portal"
install -d -m 755 "$DEST"
install -m 755 "$SRC/portal.py"   "$DEST/portal.py"
install -m 644 "$SRC/local_app.py" "$DEST/local_app.py"
install -m 644 "$SRC/portal.html" "$DEST/portal.html"
[ -f "$SRC/README.md" ] && install -m 644 "$SRC/README.md" "$DEST/README.md"
install -m 755 "$SRC/pigpulse-portal-connect" /usr/local/sbin/pigpulse-portal-connect

echo "== systemd unit"
install -m 644 "$SRC/pigpulse-portal.service" /etc/systemd/system/pigpulse-portal.service
systemctl daemon-reload
systemctl enable pigpulse-portal.service >/dev/null 2>&1
systemctl restart pigpulse-portal.service
sleep 2

echo "== health"
systemctl is-active pigpulse-portal.service | sed 's/^/  service: /'
ok=0
for _ in 1 2 3 4 5; do
  if curl -fsS --max-time 4 http://127.0.0.1/api/status >/tmp/portal-status.json 2>/dev/null; then
    ok=1; break
  fi
  sleep 1
done
if [ "$ok" = 1 ]; then
  python3 - <<'PY'
import json
d = json.load(open("/tmp/portal-status.json"))
print("  api: ok  state=%s venue=%s hotspot_ch=%s clients=%s internet=%s"
      % (d["state"], d["venue"]["ssid"] or "-", d["ap"]["channel"],
         d["ap"]["clients"], d["internet"]))
PY
else
  echo "  api: NOT ANSWERING — see: journalctl -u pigpulse-portal -n 30"
fi
rm -f /tmp/portal-status.json

echo
echo "  portal:      http://192.168.69.1/   (also http://<pi-ip>/ on the tether)"
echo "  page:        $DEST/portal.html"
echo "  worker:      /usr/local/sbin/pigpulse-portal-connect (log: /var/log/pigpulse-portal.log)"
echo "  service:     systemctl status pigpulse-portal"
echo "  owner hint:  $PSK_OWNER"
