# PigPulse — proper remote access (Cloudflare Tunnel + Access), 2026-11-21

## Why not Tailscale

Tailscale is excellent for **your** devices, but it only works for members of
the tailnet. For a capstone demo, a reviewer's browser, or a phone that is not
on the tailnet, it is not a public access path. Treat it as an **admin/SSH**
convenience, not the product's remote access.

## The proper architecture

| Surface | Path | Auth |
|---|---|---|
| **Dashboard** | `https://pigpulse.<your-domain>` → Pi `:8080` | **Cloudflare Access** (email OTP / Google / GitHub) |
| **App data API** | `https://api.pigpulse.<your-domain>` → Pi PocketBase `:8090` | Cloudflare Access (or the app's PocketBase user auth) |
| **Public read-only API** | `https://pigpulse--pigpulse.expo.app/api/*` | server-side key (already live) |
| **Admin SSH** | Tailscale (`100.69.139.63`) or Cloudflare Access for TCP | tailnet / Access |

Why Cloudflare Tunnel:
- **No inbound ports** on the Pi; works behind CGNAT and the barn AP.
- **Stable custom hostname** (not a random `trycloudflare.com` URL).
- **TLS** terminated by Cloudflare; the Pi keeps its self-signed cert internally.
- **Access** puts a real login in front of the dashboard — the dashboard itself
  has no auth, so this is mandatory before exposing it.

## One-time setup

You need a Cloudflare account and a domain on Cloudflare DNS.

```bash
# on the Pi (or via SSH), with sudo:
sudo PIGPULSE_DOMAIN=pigpulse.example.com \
     PIGPULSE_API_DOMAIN=api.pigpulse.example.com \
     bash ~/pig-health-monitor/v3-mqtt-pocketbase/backend/thermal-pi/scripts/setup-cloudflare-tunnel.sh
```

The script:
1. Installs `cloudflared` (arm64) if missing.
2. Runs `cloudflared tunnel login` (opens a browser URL — approve once).
3. Creates/reuses the named tunnel `pigpulse`.
4. Writes `~/.cloudflared/config.yml` with two ingress hosts (dashboard + PB).
5. Routes DNS for both.
6. Installs and starts `pigpulse-cloudflared.service`.

Then, in the Cloudflare dashboard:
- **Zero Trust → Access → Applications** → add an application for
  `pigpulse.example.com` and `api.pigpulse.example.com`.
- Policy: **Allow** emails in your domain (or Google/GitHub SSO).
- This is what makes the public URL safe.

## App connection toggle (implemented)

`Settings → Connection` now has **Auto / Local / Remote**:

- **Auto** — probes hotspot → venue LAN → tunnel; uses the fastest reachable.
- **Local** — PigPulse hotspot / saved Pi address; lowest latency, no internet.
- **Remote** — the public tunnel to the same Pi; higher latency; offline/stale
  states are labelled.
- **Test remote** — probes the saved remote URL's `/api/health` and shows
  reachable + latency.

The app stores the choice in `pigpulse/accessMode` and re-resolves on change.
Set **Remote → remotePbUrl** to `https://api.pigpulse.example.com` (the PocketBase
ingress), not the Tailscale IP.

## Fallbacks (not the product path)

- **Tailscale Funnel** (`https://pigpulse-pi.tail2a25b0.ts.net`) — public but
  tailnet-branded and unauthenticated. Stopgap only.
- **Cloudflare quick tunnel** (`trycloudflare.com`) — ephemeral, no account.
- **ngrok** — quick test, random URL.

## Security checklist

- [ ] Cloudflare Access on both hostnames (email/SSO).
- [ ] No `:9090` exposure (single-client mic).
- [ ] No `PB_PROXY_KEY` / AP PSK in any client bundle.
- [ ] Dashboard behind Access before sharing the URL.
- [ ] Rotate the AP PSK and sudo password (they are currently the same).

## Verify

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://pigpulse.example.com/health
curl -s -o /dev/null -w '%{http_code}\n' https://api.pigpulse.example.com/api/health
```
Both should be 200 (after Access login for the browser).