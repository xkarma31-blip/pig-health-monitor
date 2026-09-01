#!/usr/bin/env python3
"""
PigPulse v3 — PocketBase Schema Setup

Creates all required collections and fields on first run.
Run once: python setup_pocketbase.py
"""

import requests
import json
import sys

POCKETBASE_URL = "http://localhost:8090"
PB_EMAIL = "admin@pigpulse.local"
PB_PASSWORD = "admin123"


def authenticate():
    """Get admin token."""
    resp = requests.post(
        f"{POCKETBASE_URL}/api/admins/auth-with-password",
        json={"identity": PB_EMAIL, "password": PB_PASSWORD},
    )
    if resp.status_code == 200:
        return resp.json()["token"]
    else:
        print(f"❌ Auth failed: {resp.status_code} {resp.text}")
        sys.exit(1)


def create_collection(token, name, schema, fields):
    """Create a PocketBase collection."""
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    
    payload = {
        "name": name,
        "type": "base",
        "schema": schema,
        "listRule": None,
        "viewRule": None,
        "createRule": None,
        "updateRule": None,
        "deleteRule": None,
    }
    
    resp = requests.post(
        f"{POCKETBASE_URL}/api/collections",
        headers=headers,
        json=payload,
    )
    
    if resp.status_code == 200:
        print(f"✅ Created collection: {name}")
        return True
    elif resp.status_code == 409:
        print(f"⚠️  Collection {name} already exists")
        return True
    else:
        print(f"❌ Failed to create {name}: {resp.status_code} {resp.text[:200]}")
        return False


def setup_schema():
    """Create all collections."""
    print("🔧 Setting up PocketBase schema...")
    print("")
    
    token = authenticate()
    print("✅ Authenticated")
    print("")
    
    # 1. Telemetry collection
    create_collection(token, "telemetry", {
        "fields": [
            {"name": "deviceId", "type": "text", "required": True},
            {"name": "timestamp", "type": "number", "required": True},
            {"name": "temperature", "type": "number"},
            {"name": "bodyTemp", "type": "number"},
            {"name": "pigId", "type": "text"},
            {"name": "status", "type": "text", "options": {"default": "NORMAL"}},
            {"name": "batteryPct", "type": "number"},
            {"name": "wifiRssi", "type": "number"},
        ]
    }, ["deviceId", "timestamp", "temperature", "bodyTemp", "status"])
    
    # 2. Alerts collection
    create_collection(token, "alerts", {
        "fields": [
            {"name": "deviceId", "type": "text", "required": True},
            {"name": "type", "type": "text", "options": {"default": "FEVER"}},
            {"name": "severity", "type": "text", "options": {"default": "WARNING"}},
            {"name": "message", "type": "text"},
            {"name": "timestamp", "type": "number", "required": True},
        ]
    }, ["deviceId", "type", "severity", "timestamp"])
    
    # 3. Devices collection
    create_collection(token, "devices", {
        "fields": [
            {"name": "deviceId", "type": "text", "required": True},
            {"name": "name", "type": "text"},
            {"name": "type", "type": "text", "options": {"default": "esp32"}},
            {"name": "status", "type": "text", "options": {"default": "offline"}},
            {"name": "batteryPct", "type": "number"},
            {"name": "lastSeen", "type": "number"},
        ]
    }, ["deviceId", "name", "type", "status"])
    
    # 4. Pigs collection
    create_collection(token, "pigs", {
        "fields": [
            {"name": "pigId", "type": "text", "required": True},
            {"name": "name", "type": "text"},
            {"name": "healthStatus", "type": "text", "options": {"default": "NORMAL"}},
            {"name": "tags", "type": "json"},
        ]
    }, ["pigId", "name", "healthStatus"])
    
    print("")
    print("✅ Schema setup complete!")
    print("")
    print("📋 Collections created:")
    print("   • telemetry  — sensor readings")
    print("   • alerts     — health alerts")
    print("   • devices    — ESP32 devices")
    print("   • pigs       — pig roster")
    print("")
    print("🔗 Admin UI: http://localhost:8091")


if __name__ == "__main__":
    setup_schema()
