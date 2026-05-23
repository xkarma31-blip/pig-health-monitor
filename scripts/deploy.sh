#!/bin/bash
# 🚀 Sovereign Vercel Deployment Script
# Automatically deploys the Pig Health Monitor to the correct production URL.

set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/mobile_app"

echo "Deploying PigPulse Expo web (mobile_app)..."
npx -y vercel link --project pig-health-monitor --yes >/dev/null 2>&1 || true
npx -y vercel --prod --yes

echo "App (canonical): https://pig-health-monitor.vercel.app"
echo "App (legacy alias): https://mobileapp-lyart.vercel.app"
echo "Research landing: run ./scripts/deploy-landing.sh → https://pig-health-research-portfolio.vercel.app"
