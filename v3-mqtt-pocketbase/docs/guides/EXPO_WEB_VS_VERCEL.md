# Expo web (.expo.app) vs Vercel

Official Expo docs state: “Expo Hosting is a react hosting service that allows you to deploy an exported Expo web build to a preview or production URL.”

## What `.expo.app` is

It is a hosting URL for an exported Expo web build. It is **not** a different app runtime and `.expo/` is not a deploy target.

Example from Expo docs: preview `https://my-app--or1170q9ix.expo.app/`, production `https://my-app.expo.app/`.

## Difference from current Vercel setup

- Current app uses `web.output: single` (SPA) and Vercel rewrites all routes to `/`.
- Current data bridges `/api/telemetry` and `/api/pi` are Vercel serverless functions. A static SPA export to Expo Hosting will not run those functions.
- Expo docs warn: “Uploading only the client directory to a static host does not provide server rendering.”
- Expo Hosting with `server` output can support API routes, but that is a different deployment shape and needs migration/testing.

## Safe path

1. Keep Vercel as the data+app bridge until Expo server deployment is validated.
2. Export with `npx expo export -p web`.
3. Preview on Expo Hosting only as a UI check, with the API limitation labelled.
4. To move fully, migrate `/api/telemetry` and `/api/pi` into Expo server routes and verify `/app/tabs`, `/app/thermal`, and deep-route reload.

## Deployed preview

A preview Expo Hosting deployment was created on 2026-11-18:

`https://pigpulse--je9n921m7v.expo.app`

Verified HTTP 200. It is the same exported Expo web app, but the current `/api/telemetry` and `/api/pi` bridges are Vercel serverless functions; until they are migrated to Expo server routes, treat this URL as a UI preview. Vercel remains the data-capable deployment.

## Commands

```bash
npx expo export -p web
eas deploy              # preview .expo.app URL
eas deploy --prod       # production .expo.app URL
```
