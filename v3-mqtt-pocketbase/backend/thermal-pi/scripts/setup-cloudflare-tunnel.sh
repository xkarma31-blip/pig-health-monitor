#!/usr/bin/env bash
# ============================================================================
# PigPulse — proper public remote access via Cloudflare Tunnel + Access
# ============================================================================
#
# WHY THIS EXISTS
#   Tailscale only works for devices on the tailnet. For a capstone demo or
#   research review, remote access must work for ANY browser, with a stable
#   URL and authentication. Cloudflare Tunnel gives:
#     * a stable public hostname (your domain)
#     * TLS terminated by Cloudflare
#     * no open inbound ports on the Pi / no CGNAT problem
#     * Cloudflare Access (email OTP / Google / GitHub) in front of the app
#
# WHAT YOU NEED
#   * A Cloudflare account and a domain on Cloudflare DNS.
#   * This script run on the Pi (or via SSH) with sudo for the systemd unit.
#
# WHAT IT DOES
#   1. Installs cloudflared (arm64) if missing.
#   2. Runs `cloudflared tunnel login` (opens a browser URL — do this once).
#   3. Creates/reuses a named tunnel `pigpulse`.
#   4. Writes ~/.cloudflared/config.yml with two ingress hosts:
#        <HOST>      -> https+insecure://127.0.0.1:8080  (dashboard)
#        <API_HOST>  -> http://127.0.0.1:8090            (PocketBase)
#   5. Routes DNS for both hostnames.
#   6. Installs pigpulse-cloudflared.service (system) and starts it.
#
# SECURITY
#   Add a Cloudflare Access application for both hostnames and require an
#   email/Google/GitHub login. Without Access, the dashboard is public.
# ============================================================================
set -euo pipefail

DOMAIN="${PIGPULSE_DOMAIN:-}"
API_DOMAIN="${PIGPULSE_API_DOMAIN:-}"
TUNNEL_NAME="${PIGPULSE_TUNNEL_NAME:-pigpulse}"
PI_USER="${SUDO_USER:-pigpulse}"

say() { printf '\n\033[1;32m== %s\033[0m\n' "$1"; }
die() { printf '\033[1;31mFAIL: %s\033[0m\n' "$1" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "run with sudo (installs a system service)"
[ -n "$DOMAIN" ] || die "set PIGPULSE_DOMAIN (e.g. pigpulse.example.com)"
[ -n "$API_DOMAIN" ] || API_DOMAIN="api.${DOMAIN}"

# 1. cloudflared
if [ ! -x /home/pigpulse/bin/cloudflared ]; then
  say "1. installing cloudflared"
  mkdir -p /home/pigpulse/bin
  curl -fsSL --max-time 180 -o /home/pigpulse/bin/cloudflared \
    https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64
  chmod +x /home/pigpulse/bin/cloudflared
  chown "$PI_USER":"$PI_USER" /home/pigpulse/bin/cloudflared
fi
sudo -u "$PI_USER" /home/pigpulse/bin/cloudflared --version

# 2. login (interactive)
say "2. Cloudflare login (opens a browser URL; approve it once)"
if [ ! -f /home/pigpulse/.cloudflared/cert.pem ]; then
  sudo -u "$PI_USER" /home/pigpulse/bin/cloudflared tunnel login
fi

# 3. create/reuse tunnel
say "3. creating/reusing tunnel '$TUNNEL_NAME'"
TUNNEL_ID="$(sudo -u "$PI_USER" /home/pigpulse/bin/cloudflared tunnel list 2>/dev/null \
  | awk -v n="$TUNNEL_NAME" '$1==n {print $2; exit}')"
if [ -z "${TUNNEL_ID:-}" ]; then
  sudo -u "$PI_USER" /home/pigpulse/bin/cloudflared tunnel create "$TUNNEL_NAME" >/dev/null
  TUNNEL_ID="$(sudo -u "$PI_USER" /home/pigpulse/bin/cloudflared tunnel list 2>/dev/null \
    | awk -v n="$TUNNEL_NAME" '$1==n {print $2; exit}')"
fi
[ -n "${TUNNEL_ID:-}" ] || die "could not create tunnel"

# 4. config
say "4. writing ~/.cloudflared/config.yml"
sudo -u "$PI_USER" mkdir -p /home/pigpulse/.cloudflared
sudo -u "$PI_USER" tee /home/pigpulse/.cloudflared/config.yml >/dev/null <<EOF
tunnel: ${TUNNEL_ID}
credentials-file: /home/pigpulse/.cloudflared/${TUNNEL_ID}.json

ingress:
  - hostname: ${DOMAIN}
    service: https+insecure://127.0.0.1:8080
  - hostname: ${API_DOMAIN}
    service: http://127.0.0.1:8090
  - service: http_status:404
EOF

# 5. DNS routes
say "5. routing DNS"
sudo -u "$PI_USER" /home/pigpulse/bin/cloudflared tunnel route dns "$TUNNEL_NAME" "$DOMAIN" || true
sudo -u "$PI_USER" /home/pigpulse/bin/cloudflared tunnel route dns "$TUNNEL_NAME" "$API_DOMAIN" || true

# 6. service
say "6. installing pigpulse-cloudflared.service"
install -o root -g root -m 0644 \
  "$(dirname "$0")/pigpulse-cloudflared.service" \
  /etc/systemd/system/pigpulse-cloudflared.service
systemctl daemon-reload
systemctl enable --now pigpulse-cloudflared.service
sleep 3
systemctl is-active pigpulse-cloudflared.service

say "Done"
echo "  Dashboard: https://${DOMAIN}/"
echo "  API:       https://${API_DOMAIN}/"
echo
echo "NEXT: add a Cloudflare Access application for both hostnames and require"
echo "an email/Google/GitHub login. Without Access, the dashboard is public."
echo "Then set the app's Remote URL to https://${API_DOMAIN} (Settings → Connection)."