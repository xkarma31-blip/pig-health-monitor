#!/bin/bash
# Poll EAS build status and send APK link to Telegram when done
BOT_TOKEN="8790537676:AAGtSub4zRjsFDdU2MzHzbzyN9UIgnuDGgQ"
CHAT_ID="8735175607"
BUILD_ID="e6882032-fec2-4ab2-b082-db7343028ccc"
APP_DIR="/home/solrahk/.gemini/antigravity/scratch/shikigami_memory/capstone_pig_health_monitor/mobile_app"

while true; do
  sleep 120  # Check every 2 minutes

  JSON=$(cd "$APP_DIR" && npx eas-cli build:view "$BUILD_ID" --json --non-interactive 2>/dev/null)
  STATUS=$(echo "$JSON" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)
  
  if [ "$STATUS" = "FINISHED" ]; then
    URL=$(echo "$JSON" | grep -o '"buildUrl":"[^"]*"' | head -1 | cut -d'"' -f4)
    curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
      -d chat_id="$CHAT_ID" \
      -d text="✅ Pig Health Monitor APK v2 is READY!

Download directly (no login needed):
${URL}

Changes:
• Login persists across restarts
• All mock data purged from guest mode
• Every screen auth-gated"
    echo "$(date) - APK delivered to Telegram"
    exit 0
  elif [ "$STATUS" = "ERRORED" ]; then
    curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
      -d chat_id="$CHAT_ID" \
      -d text="❌ EAS Build FAILED. Check: https://expo.dev/accounts/solrahk/projects/pig-health-monitor/builds/${BUILD_ID}"
    echo "$(date) - Build failed"
    exit 1
  fi
  
  echo "$(date) - Status: $STATUS - waiting..."
done
