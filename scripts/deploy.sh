#!/bin/bash
# 🚀 Sovereign Vercel Deployment Script
# Automatically deploys the Pig Health Monitor to the correct production URL.

set -e

cd /home/solrahk/.gemini/antigravity/scratch/shikigami_memory/capstone_pig_health_monitor

echo "🐷 Initiating Sovereign Aqua Protocol Deployment..."
echo "Linking to predefined 'mobile_app' project..."

# Ensure we are linking exactly to the correct capstone project
npx -y vercel link --project pig-health-monitor --yes > /dev/null 2>&1 || true

echo "Pushing code to Vercel Production..."
# Run the Vercel production deployment
npx -y vercel --prod --yes

echo "✅ Deployment Triggered Successfully."
echo "Your changes will be live at: https://pig-health-monitor.vercel.app"
