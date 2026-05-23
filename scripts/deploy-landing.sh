#!/usr/bin/env bash
# Deploy static marketing landing (pig-health-research-portfolio on Vercel)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/landing_page"

echo "Deploying HUSH HOG research landing to Vercel production..."
npx -y vercel link --yes >/dev/null 2>&1 || true
npx -y vercel --prod --yes

echo "Live (portfolio): https://pig-health-research-portfolio.vercel.app"
echo "Live app (Expo web): https://mobileapp-lyart.vercel.app"
