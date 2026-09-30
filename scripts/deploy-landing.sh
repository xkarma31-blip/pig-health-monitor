#!/usr/bin/env bash
# Deploy the COMBINED public site (landing at / + Expo dashboard at /app/).
#
# WARNING: the repo-root ./landing_page/ tree is FROZEN (Firebase-era). It has
# a NON-CANONICAL.md tombstone. This script used to point there, which would
# deploy the wrong page. It now points at the v3 tree.
#
# The authoritative deploy path is ~/.local/bin/pigpulse-autodeploy.sh, which
# additionally rebuilds the Expo export and stages it under app/. Prefer that;
# this script is the manual equivalent and only deploys a previously built
# dist/ if one is present.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$ROOT/v3-mqtt-pocketbase/frontend/landing_page"
APP="$ROOT/v3-mqtt-pocketbase/frontend/mobile_app"
STAGE="$ROOT/.deploy-stage"

if [ ! -f "$APP/dist/index.html" ]; then
  echo "ERROR: no Expo build found at $APP/dist." >&2
  echo "Build it first:  cd $APP && npx expo export -p web" >&2
  exit 1
fi

echo "Staging combined site (landing at /, dashboard at /app/)..."
rm -rf "$STAGE"
mkdir -p "$STAGE/app"
cp -a "$REPO/." "$STAGE/"
rm -rf "$STAGE/app" "$STAGE/.env.local" "$STAGE/.env" "$STAGE/.vercel"
cp -a "$APP/dist/." "$STAGE/app/"
if [ -d "$APP/api" ]; then
  mkdir -p "$STAGE/api"
  cp -a "$APP/api/." "$STAGE/api/"
fi

# Never publish a bundle that still contains the admin password or dev URLs.
if grep -rqE 'admin123|127\.0\.0\.1:18090|127\.0\.0\.1:8080' "$STAGE/app/_expo" 2>/dev/null; then
  echo "ERROR: secret guard tripped in staged bundle — refusing to deploy." >&2
  exit 1
fi

export NPM_CONFIG_USERCONFIG=/dev/null
npx -y vercel deploy --prod --yes --project pig-health-monitor \
  --scope solrahks-projects --cwd "$STAGE"

rm -rf "$STAGE"
echo
echo "Landing:  https://pig-health-monitor.vercel.app/"
echo "Dashboard: https://pig-health-monitor.vercel.app/app/tabs"
