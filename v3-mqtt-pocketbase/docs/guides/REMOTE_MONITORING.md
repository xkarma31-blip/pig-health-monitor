# Remote monitoring and logging

## What it is

`http://<pi>/monitor` is a read-only web page that polls the Pi every 5 seconds. It works through the hotspot, the venue LAN, or Tailscale — no app required.

It shows:

- Pi state, internet, uplink IP, tunnel URL, AP status
- thermal health: frame count, FPS, age, last error
- S3 mic state and SHT45 state with honest STALE/NO READING labels
- recent PocketBase telemetry rows as a plain log

It does **not** show a stale CCTV frame as live, and it does not change settings.

## URLs

- On hotspot: `http://192.168.69.1/monitor`
- On same venue LAN: `http://<uplink-ip>/monitor`
- From anywhere with Tailscale on the phone/laptop: `http://100.69.139.63/monitor`

The tunnel URL is derived by the Pi from `tailscale0`; do not hardcode it in scripts.

## Recovery

If the page says `state=DOWN` or the sensors show STALE:

1. Confirm the phone/laptop is on PigPulse or Tailscale.
2. Check `/api/status` for uplink and internet.
3. Check `journalctl -u pigpulse-thermal` and `pigpulse-cctv`.
4. For remote fixes, use SSH over Tailscale, not public port forwarding.

TP-Link's own FAQ says remote RTSP access should use a VPN; the same principle applies here.
