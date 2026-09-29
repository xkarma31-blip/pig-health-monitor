#!/usr/bin/env bash
# =============================================================================
# PigPulse — self-signed TLS cert for the Pi web dashboard.
#
# The dashboard serves HTTPS so the browser treats the origin as secure, which
# is what unlocks AudioWorklet (mic playback) on a LAN/AP origin. Plain
# http://<lan-ip> is NOT a secure context, so without this the dashboard falls
# back to the deprecated ScriptProcessorNode path.
#
# Run ON THE PI (it folds the Pi's real IPs into the SAN list):
#   bash ~/thermal-pi/scripts/gen-selfsigned.sh
#
# Output: <app>/tls.crt and <app>/tls.key  (paths referenced by
#         /etc/systemd/system/pigpulse-thermal.service.d/tls.conf)
#
# The phone accepts the cert once per origin: Advanced -> Proceed (unsafe).
# =============================================================================
set -eu

APP="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP"

HOSTS="localhost,raspberrypi.local,pigpulse.local"
IPS="127.0.0.1"
for ip in $(hostname -I 2>/dev/null || true); do
  case "$ip" in *:*) ;; *) IPS="$IPS,$ip" ;; esac
done
SANS="DNS:localhost,DNS:raspberrypi.local,DNS:pigpulse.local"
for ip in ${IPS//,/ }; do SANS="$SANS,IP:$ip"; done

# The AP address is the one clients actually connect to. hostname -I reports it
# only once wlan0-static-ip.service has run, so add the known value explicitly
# when it is not already present — a missing AP SAN means the phone sees a
# plain name-mismatch on the address it was told to use.
case ",$IPS," in
  *",192.168.69.1,"*) ;;
  *) SANS="$SANS,IP:192.168.69.1"; IPS="$IPS,192.168.69.1" ;;
esac

echo "Generating cert with SANs: $SANS"

# Back up the live cert: regenerating changes the fingerprint, so every device
# that already trusted the old one has to accept the new one again.
if [ -f tls.key ]; then
  cp -a tls.key "tls.key.bak-$(date +%Y%m%d-%H%M%S)"
  echo "  (backed up the previous tls.key)"
fi

openssl req -x509 -newkey rsa:2048 -nodes -days 825 \
  -keyout tls.key -out tls.crt \
  -subj "/CN=pigpulse.local/O=PigPulse" \
  -addext "subjectAltName=$SANS"

chmod 600 tls.key
chmod 644 tls.crt
echo
echo "Created: $APP/tls.crt  $APP/tls.key"
openssl x509 -in tls.crt -noout -subject -dates -ext subjectAltName
echo
echo "Next:"
echo "  sudo systemctl restart pigpulse-thermal"
echo "  curl -sk https://127.0.0.1:8080/health"
echo
echo "REMINDER: tls.key is a private key and is gitignored. Never commit it."
