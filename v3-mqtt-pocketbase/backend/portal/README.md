# Pi-local PigPulse: QR → optional Wi-Fi → full app

## Open it

1. Join **PigPulse Wi-Fi** on the phone (keep it even if Android says no internet).
2. Scan `pigpulse-setup-qr.svg`, or open `http://192.168.69.1/?setup=1`.
3. Choose venue Wi-Fi for the **Pi**, or **Skip — continue offline**.
4. Both successful connection and Skip open `http://192.168.69.1/app/`.

The full existing Expo app is served from the Pi; no laptop, Metro server,
Vercel or internet is required for local monitoring. Phone-to-Pi Wi-Fi is still
required: this is internet-offline operation, not an installed disconnected PWA.
The QR opens a URL, not an automatic join-and-open command. Join the hotspot
first; some phones need a separate Wi-Fi-join QR for that step.

Only compatible 2.4 GHz venues are listed with the present radio. A 5 GHz-only
venue still requires a working second radio. Skip never changes the saved venue
or tears down the AP. Hosted site remains an optional external alternative.

## Serving and data

- Existing `pigpulse-portal.service` serves welcome and static `/app/` export.
- `/api/telemetry` reads allowlisted collections from **Pi PocketBase :8090**.
- `/api/pi?ep=…` forwards allowlisted sensor reads to the **Pi thermal service**;
  TLS trusts `/home/pigpulse/thermal-pi/pigpulse-ca.crt` at fixed loopback.
- `/api/health` probes Pi PocketBase. Unknown APIs are not SPA fallbacks.
- No PB admin credentials, cloud proxy key or venue password is embedded in the
  build. No blanket PocketBase/admin write proxy is exposed. Administrative
  mutations/login are not implemented by this read-only local adapter.
- Cloud advisor returns 503 with an explicit internet-required message; it
  does not silently call paid services. Advanced browser audio may need trusted
  HTTPS, because HTTP LAN origins are not secure contexts. Diagnostic thermal
  HTTPS links remain available with the Pi's existing certificate.

## Export and deploy

On the laptop, from `v3-mqtt-pocketbase/frontend/mobile_app`:

```bash
EXPO_NO_DOTENV=1 CI=1 ./node_modules/.bin/expo export --platform web --output-dir /tmp/opencode/pigpulse-pi-app
```

The existing app config uses base path `/app`. Do not enable dotenv for this
export: public env credentials must not enter browser bundles. Copy the export,
`portal.py`, `local_app.py`, `portal.html`, `deploy-local-app.sh` and optional QR
to a staging directory on the Pi, then from a root shell:

```bash
bash deploy-local-app.sh /path/to/export
```

The script keeps timestamped releases under `/usr/local/lib/pigpulse-portal/releases/`,
backs up portal files and the old app link under `/root/pigpulse-backups/`, and
switches the `app` symlink. Only the portal restarts, not radio/sensor services.
Initial deployment: release `20261113-063741`, backup
`/root/pigpulse-backups/local-app-20261113-063741/`.

Rollback the first local-app deployment, from a root shell on the Pi:

```bash
bk=/root/pigpulse-backups/local-app-20261113-063741
install -m 755 "$bk/portal.py" /usr/local/lib/pigpulse-portal/portal.py
install -m 644 "$bk/portal.html" /usr/local/lib/pigpulse-portal/portal.html
systemctl restart pigpulse-portal
```

This leaves the new app release on disk but restores the old portal routes.
For subsequent releases also restore the symlink recorded in `previous-app-link`.
Do not remove backups or releases to perform rollback.

## Evidence and tests

2026-11-13 browser spot check on the actual Pi over its bench address:
welcome → real Skip → `/app/tabs`, two devices streaming, thermal live, deep
route reload works, no page exceptions/failed requests/external requests while
all non-Pi browser traffic was blocked. Telemetry and thermal APIs both 200.
Wi-Fi-success navigation was browser-mocked, avoiding another radio outage;
actual connection/failed-venue restore was measured in the prior WAN tests.
This is not yet a physical-phone QR scan or long-duration offline soak test.

From repository root:

```bash
python3 -m unittest discover -s v3-mqtt-pocketbase/backend/portal -v
bash -n v3-mqtt-pocketbase/backend/portal/deploy-local-app.sh
npm run ci:backend
```

Regenerate the QR without dependencies using the EAS CLI's existing encoder:
`node v3-mqtt-pocketbase/backend/portal/make-qr.cjs`.
The served QR is `/app/pigpulse-setup-qr.svg`.
