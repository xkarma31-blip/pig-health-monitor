#!/usr/bin/env bash
# Capstone smoke battery — post-V3 (MQTT + PocketBase) rewrite, 2026-09-30.
#
# The previous version of this script was Firebase-era: it asserted a root
# mobile_app/ tree, validated firebase_config/database.rules.json (deleted in
# the MQTT+PocketBase migration), and grepped for subscribeAlerts/
# subscribeSensors hooks. Every one of those paths is gone, so the battery
# failed 100% of the time and was referenced by nothing.
#
# This version checks the architecture that actually ships.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
V3="$ROOT/v3-mqtt-pocketbase"
APP="$V3/frontend/mobile_app"
LANDING="$V3/frontend/landing_page"
PASS=0
FAIL=0
WARN=0

ok()   { echo "OK   $1"; PASS=$((PASS+1)); }
fail() { echo "FAIL $1"; FAIL=$((FAIL+1)); }
warn() { echo "WARN $1"; WARN=$((WARN+1)); }

echo "=== Capstone Smoke Battery (V3) ==="
echo "Root: $ROOT"
echo ""

# 1 — Canonical structure
for p in CANON.md v3-mqtt-pocketbase/backend/bridge/mqtt_bridge.py \
         v3-mqtt-pocketbase/backend/workers/readonly_pb_proxy.py \
         v3-mqtt-pocketbase/frontend/mobile_app/package.json \
         v3-mqtt-pocketbase/frontend/landing_page/index.html \
         legacy/README.md; do
  test -e "$ROOT/$p" && ok "exists $p" || fail "missing $p"
done

# 2 — Frozen trees must stay quarantined
for d in legacy/firmware legacy/landing_page; do
  test -f "$ROOT/$d/NON-CANONICAL.md" \
    && ok "$d labelled NON-CANONICAL" \
    || fail "$d missing NON-CANONICAL.md"
done
test ! -d "$ROOT/firmware" && ok "no firmware/ at repo root" || fail "firmware/ reappeared at root"
test ! -d "$ROOT/landing_page" && ok "no landing_page/ at repo root" || fail "landing_page/ reappeared at root"

# 3 — Firebase must stay retired
if test -e "$ROOT/.firebaserc" || test -d "$ROOT/firebase_config" \
   || grep -rq 'firebase' "$APP/package.json" 2>/dev/null; then
  fail "Firebase has returned to the canon"
else
  ok "Firebase absent from the canon"
fi

# 4 — Security: the client bundle must never carry admin credentials.
# Source-level guard, independent of whether a build exists.
if rg -q 'EXPO_PUBLIC_PB_(EMAIL|PASSWORD)' "$APP/src" 2>/dev/null; then
  fail "src references EXPO_PUBLIC_PB_* — inlined into the public bundle"
else
  ok "no EXPO_PUBLIC_PB_* credential reads in src"
fi
if rg -q 'admin123' "$APP/src" 2>/dev/null; then
  fail "src hardcodes admin123"
else
  ok "no hardcoded admin password in src"
fi

# 5 — The read-only proxy refuses writes and the admin surface
for verb in POST PUT PATCH DELETE; do
  if rg -q "do_$verb" "$V3/backend/workers/readonly_pb_proxy.py" 2>/dev/null; then
    ok "proxy handles $verb explicitly (refuses)"
  else
    warn "proxy has no explicit $verb handler"
  fi
done
rg -q 'admins' "$V3/backend/workers/readonly_pb_proxy.py" \
  && ok "proxy blocks /api/admins" || fail "proxy does not block /api/admins"
rg -q 'location /_/' "$V3/deploy/openresty/conf/nginx.conf" \
  && ok "gateway blocks /_/ (admin)" || fail "gateway does not block /_/"
rg -q 'localAppUrl' "$LANDING/config.js" \
  && ok "landing has a localhost app override" || warn "landing missing localAppUrl"

# 6 — Deploy path must not target a frozen tree
if rg -q 'ROOT/landing_page' "$ROOT/scripts/deploy-landing.sh" 2>/dev/null; then
  fail "deploy-landing.sh still points at the frozen root landing_page/"
else
  ok "deploy-landing.sh targets the v3 tree"
fi
rg -q 'secret guard tripped' "$ROOT/scripts/deploy-landing.sh" \
  && ok "deploy has a secret guard" || warn "deploy-landing.sh has no secret guard"

# 7 — TypeScript, when deps are installed
if test -d "$APP/node_modules"; then
  (cd "$APP" && npx tsc --noEmit --skipLibCheck >/tmp/capstone_tsc.log 2>&1) \
    && ok "mobile_app tsc --noEmit" \
    || { fail "mobile_app tsc — see /tmp/capstone_tsc.log"; tail -5 /tmp/capstone_tsc.log || true; }
else
  warn "node_modules absent — skipped tsc"
fi

# 8 — Live public routes. The single-domain topology is load-bearing:
# landing at /, Expo dashboard under /app.
check_title() {
  local path="$1" expect="$2"
  local title
  title=$(curl -s -L --max-redirs 5 --max-time 25 "https://pig-health-monitor.vercel.app$path" \
          | grep -oE '<title>[^<]+' | head -1 | sed 's/<title>//')
  if printf '%s' "$title" | grep -qi "$expect"; then
    ok "$path serves '$title'"
  else
    fail "$path expected '$expect', got '${title:-<none>}'"
  fi
}
check_title "/"         "Edge Intelligence"
check_title "/app/"     "Pig Health Monitor"
check_title "/app/tabs" "Pig Health Monitor"

# 9 — Public telemetry API is read-only
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 25 \
      "https://pig-health-monitor.vercel.app/api/telemetry?collection=telemetry&perPage=1" || echo 000)
test "$code" = "200" && ok "public /api/telemetry $code" || warn "public /api/telemetry $code"
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 25 -X POST \
      "https://pig-health-monitor.vercel.app/api/telemetry?collection=telemetry" || echo 000)
test "$code" = "405" && ok "POST /api/telemetry refused ($code)" || fail "POST returned $code, expected 405"
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 25 \
      "https://pig-health-monitor.vercel.app/api/telemetry?collection=users" || echo 000)
test "$code" = "400" && ok "users collection refused ($code)" || fail "users returned $code, expected 400"

# 10 — Local gateway: admin blocked, API live
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1/api/health || echo 000)
test "$code" = "200" && ok "gateway /api/health $code" || warn "gateway /api/health $code (stack may be down)"
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1/_/ || echo 000)
test "$code" = "403" && ok "gateway /_/ blocked ($code)" || fail "gateway /_/ returned $code, expected 403"

echo ""
echo "=== Summary: $PASS passed, $FAIL failed, $WARN warnings ==="
test "$FAIL" -eq 0
