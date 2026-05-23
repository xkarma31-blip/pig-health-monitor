#!/usr/bin/env bash
# Capstone smoke battery — run from repo root or scripts/test
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PASS=0
FAIL=0
WARN=0

ok() { echo "OK   $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL $1"; FAIL=$((FAIL + 1)); }
warn() { echo "WARN $1"; WARN=$((WARN + 1)); }

echo "=== Capstone Smoke Battery ==="
echo "Root: $ROOT"
echo ""

# 1 — Structure
for p in mobile_app/package.json firmware/platformio.ini firebase_config/database.rules.json AGENTS.md .coderabbit.yaml; do
  test -f "$ROOT/$p" && ok "exists $p" || fail "missing $p"
done

# 2 — TypeScript (mobile)
if (cd "$ROOT/mobile_app" && npx tsc --noEmit 2>/tmp/capstone_tsc.log); then
  ok "mobile_app tsc --noEmit"
else
  fail "mobile_app tsc — see /tmp/capstone_tsc.log"
  tail -5 /tmp/capstone_tsc.log 2>/dev/null || true
fi

# 3 — Firebase rules JSON
python3 -c "import json; json.load(open('$ROOT/firebase_config/database.rules.json'))" && ok "database.rules.json valid" || fail "database.rules.json invalid"

# 4 — Hermes / stack (optional)
if test -x "$HOME/.cursor/scripts/verify-sentinel-base.sh"; then
  if "$HOME/.cursor/scripts/verify-sentinel-base.sh" >/tmp/capstone_verify.log 2>&1; then
    ok "sentinel verify-sentinel-base"
  else
    warn "sentinel verify — see /tmp/capstone_verify.log"
  fi
fi

# 5 — Provider probe
if test -f "$HOME/.hermes/scripts/probe-all-providers.py"; then
  python3 "$HOME/.hermes/scripts/probe-all-providers.py" >/tmp/capstone_probe.log 2>&1 && ok "probe-all-providers.py" || warn "probe issues — see log"
elif test -f "$HOME/.hermes/scripts/probe-providers.py"; then
  python3 "$HOME/.hermes/scripts/probe-providers.py" >/tmp/capstone_probe.log 2>&1 && ok "probe-providers.py" || warn "probe issues"
fi
# Live Firebase tabs
rg -q "subscribeAlerts" "$ROOT/mobile_app/src/app/(tabs)/events.tsx" 2>/dev/null && ok "events.tsx uses subscribeAlerts" || fail "events.tsx not wired"
rg -q "subscribeRoster" "$ROOT/mobile_app/src/app/(tabs)/analytics.tsx" 2>/dev/null && ok "analytics.tsx uses subscribeRoster" || fail "analytics.tsx roster not wired"

# 6 — Production URL reachability
code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 https://mobileapp-lyart.vercel.app/ || echo "000")
test "$code" = "200" && ok "Vercel app HTTP $code" || warn "Vercel app HTTP $code"

# 7 — Tab routes (no stale paths in test scripts)
for stale in "/sensors" "/roster" "/alerts" "/auth"; do
  if rg -q "$stale" "$ROOT/scripts/test/" --glob '!capstone_smoke.sh' 2>/dev/null; then
    warn "stale route $stale still in scripts/test/"
  else
    ok "no stale route $stale in test scripts"
  fi
done
rg -q "URL \+ '/events'" "$ROOT/scripts/test/demo_recorder.js" 2>/dev/null && ok "demo_recorder uses /events" || warn "demo_recorder tab routes"

# 8 — Firebase hook wired
if rg -q "subscribeSensors" "$ROOT/mobile_app/src/hooks/useOfflineTelemetry.ts"; then
  ok "useOfflineTelemetry uses Firebase listeners"
else
  fail "useOfflineTelemetry still mock-only"
fi

echo ""
echo "=== Summary: $PASS passed, $FAIL failed, $WARN warnings ==="
test "$FAIL" -eq 0
