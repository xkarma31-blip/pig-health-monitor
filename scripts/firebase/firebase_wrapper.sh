#!/bin/bash

# Firebase MCP Server Wrapper
# This script sets up the necessary environment and runs the Python MCP server.

# Provide path to the service account key if needed, or rely on .env
export GOOGLE_APPLICATION_CREDENTIALS="/home/solrahk/.gemini/antigravity/scratch/shikigami_memory/capstone_pig_health_monitor/firebase-adminsdk.json"

# Run the correct Python script using the local venv
exec /home/solrahk/.gemini/antigravity/scratch/shikigami_memory/scripts/venv/bin/python /home/solrahk/.gemini/antigravity/scratch/shikigami_memory/scripts/firebase_mcp_server.py
