#!/bin/bash
# 🚫 DISABLED 2026-09-29 — this script was a production landmine.
#
# WHAT IT DID (kept here so nobody re-creates it):
#   cd "$ROOT/mobile_app"                    # ← the STALE Firebase-era v2 app
#   npx vercel link --project pig-health-monitor --yes
#   npx vercel --prod --yes
#
# `pig-health-monitor` is the SAME Vercel project that the 5-minute autodeploy
# cron (~/bin/pigpulse-autodeploy.sh) publishes the canonical landing page to,
# from v3-mqtt-pocketbase/frontend/landing_page. So running this replaced the
# production landing page with a 2026-05 Firebase build.
#
# To deploy the landing page (the real, current one):
#   ~/bin/pigpulse-autodeploy.sh          # auto, every 5 min
#   bash scripts/deploy-landing.sh         # manual
#
# To deploy the Expo app, deploy from its own directory so the Vercel project
# is explicit and cannot silently collide with the landing page:
#   cd v3-mqtt-pocketbase/frontend/mobile_app && npx vercel --prod
set -euo pipefail

cat >&2 <<'MSG'
================================================================
 scripts/deploy.sh is DISABLED.

 It deployed the stale root mobile_app/ (Firebase-era v2) to the
 pig-health-monitor Vercel project -- the same project the landing
 page is autodeployed to, every 5 minutes.

 Use:  ~/bin/pigpulse-autodeploy.sh     (landing page, canonical)
       bash scripts/deploy-landing.sh    (landing page, manual)
       cd v3-mqtt-pocketbase/frontend/mobile_app && npx vercel --prod
================================================================
MSG
exit 1
