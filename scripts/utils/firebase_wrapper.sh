#!/bin/bash
# 🔥 Firebase MCP Wrapper — Sovereign Aqua Protocol
# Purpose: Auto-inject project and DB config to fix the "join" error.

# Configuration
PROJECT_ID="studio-1248778633-99f62"
DB_URL="https://studio-1248778633-99f62-default-rtdb.firebaseio.com"
PROJECT_DIR="/home/solrahk/.gemini/antigravity/scratch/shikigami_memory/capstone_pig_health_monitor"

# Change to project directory to ensure firebase.json is found
cd "$PROJECT_DIR" || exit 1

# Set environment variables for firebase-tools
export FIREBASE_PROJECT=$PROJECT_ID
export FIREBASE_DATABASE_URL=$DB_URL

# Execute the original MCP command
npx -y firebase-tools@latest mcp --only database "$@"
