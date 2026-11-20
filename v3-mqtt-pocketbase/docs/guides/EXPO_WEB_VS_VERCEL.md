# Expo web hosting and Vercel status — 2026-11-20

## Current deployment

Expo Hosting is the current data-capable web deployment:

- Production: `https://pigpulse.expo.app`
- Deployment URL: `https://pigpulse--3x12hwzewm.expo.app`

The Expo server routes in `frontend/mobile_app/src/app/api/` mirror the former Vercel bridges:

- `GET /api/telemetry`
- `GET /api/pi`
- `POST /api/chat`

The proxy URL and key used by `/api/telemetry` and `/api/pi` remain server-side. `/api/chat` uses its offline fallback unless a provider key is configured.

## Export targets

`frontend/mobile_app/app.config.js` selects the export shape:

- `PIGPULSE_WEB_TARGET=expo-hosting` removes the `/app` base path and uses Expo's `server` output so the `/api/*` routes run on Expo Hosting.
- Without that variable, the app retains the static `single` output and `/app` base path used by the Pi portal. A plain export is not data-capable on Expo Hosting.

```bash
cd v3-mqtt-pocketbase/frontend/mobile_app
PIGPULSE_WEB_TARGET=expo-hosting npx expo export -p web
eas deploy              # deployment .expo.app URL
eas deploy --prod       # production .expo.app URL
```

## Measured verification

On 2026-11-20, `GET /api/telemetry?collection=telemetry&perPage=1`, `GET /api/pi`, and `POST /api/chat` returned HTTP 200 on the production Expo URL; `/api/pi` reported `status=NORMAL`. A telemetry request without a readable collection correctly returns HTTP 400.

The deployment URL identifies a particular release, while the production alias is the stable public URL.

## Vercel status

The Vercel provider returned HTTP 402 during the release check, so Vercel is not a current data-capable deployment. Keep the Pi portal's static `/app` export separate from the Expo Hosting server export.
