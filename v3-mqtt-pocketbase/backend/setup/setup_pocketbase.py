#!/usr/bin/env python3
"""
PigPulse v3 — PocketBase Schema Setup

Creates the required collections in PocketBase:
- devices: ESP32 device registry
- telemetry: Sensor readings
- alerts: Health alerts
- pigs: Pig roster

Usage:
    python setup_pocketbase.py
"""

import os
import sys
import requests
from typing import Optional

POCKETBASE_URL = os.getenv("POCKETBASE_URL", "http://localhost:8090")
PB_EMAIL = os.getenv("PB_EMAIL", "admin@pigpulse.local")
PB_PASSWORD = os.getenv("PB_PASSWORD", "admin123")


def authenticate(base_url: str) -> Optional[str]:
    """Authenticate with PocketBase and return token."""
    try:
        resp = requests.post(
            f"{base_url}/api/admins/auth-with-password",
            json={"identity": PB_EMAIL, "password": PB_PASSWORD},
            timeout=10,
        )
        if resp.status_code == 200:
            return resp.json()["token"]
        else:
            print(f"❌ Auth failed: {resp.status_code} {resp.text[:200]}")
            return None
    except Exception as e:
        print(f"❌ Auth error: {e}")
        return None


def create_collection(base_url: str, token: str, schema: dict) -> bool:
    """Create a collection if it doesn't exist."""
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    resp = requests.get(
        f"{base_url}/api/collections",
        headers=headers,
        params={"filter": f"name='{schema['name']}'"},
        timeout=10,
    )
    if resp.status_code == 200 and resp.json().get("totalItems", 0) > 0:
        print(f"✅ Collection '{schema['name']}' already exists")
        return True

    resp = requests.post(
        f"{base_url}/api/collections",
        headers=headers,
        json=schema,
        timeout=10,
    )
    if resp.status_code == 200:
        print(f"✅ Created collection '{schema['name']}'")
        return True
    else:
        print(f"❌ Failed to create '{schema['name']}': {resp.status_code} {resp.text[:200]}")
        return False


# ── Collection Schemas ──────────────────────────────────────────

DEVICES_SCHEMA = {
    "name": "devices",
    "type": "base",
    "fields": [
        {"name": "deviceId", "type": "text", "required": True, "unique": True},
        {"name": "name", "type": "text", "required": True},
        {"name": "type", "type": "select", "options": {"values": ["esp32", "webcam", "luckfox"]}},
        {"name": "status", "type": "select", "options": {"values": ["online", "offline", "hibernate"]}},
        {"name": "batteryPct", "type": "number"},
        {"name": "batteryV", "type": "number"},
        {"name": "wifiRssi", "type": "number"},
        {"name": "uptime", "type": "number"},
        {"name": "lastSeen", "type": "date"},
        {"name": "firmwareVersion", "type": "text"},
    ],
}

TELEMETRY_SCHEMA = {
    "name": "telemetry",
    "type": "base",
    "fields": [
        {"name": "deviceId", "type": "text", "required": True},
        {"name": "timestamp", "type": "number", "required": True},
        {"name": "temperature", "type": "number"},
        {"name": "bodyTemp", "type": "number"},
        {"name": "pigId", "type": "text"},
        {"name": "targetX", "type": "number"},
        {"name": "targetY", "type": "number"},
        {"name": "thermalFrame", "type": "text"},
        {"name": "coughRate", "type": "number"},
        {"name": "coughCluster", "type": "bool"},
        {"name": "healthTrend", "type": "select", "options": {"values": ["STABLE", "ELEVATED", "CLUSTER"]}},
        {"name": "batteryPct", "type": "number"},
        {"name": "batteryV", "type": "number"},
        {"name": "powerState", "type": "select", "options": {"values": ["NORMAL", "LOW", "CRITICAL", "HIBERNATE"]}},
        {"name": "wifiRssi", "type": "number"},
        {"name": "status", "type": "select", "options": {"values": ["NORMAL", "WARNING", "CRITICAL"]}},
    ],
}

ALERTS_SCHEMA = {
    "name": "alerts",
    "type": "base",
    "fields": [
        {"name": "deviceId", "type": "text", "required": True},
        {"name": "timestamp", "type": "number", "required": True},
        {"name": "type", "type": "select", "options": {"values": ["FEVER", "COUGH_CLUSTER", "LOW_BATTERY", "WEAK_WIFI"]}},
        {"name": "severity", "type": "select", "options": {"values": ["INFO", "WARNING", "CRITICAL"]}},
        {"name": "pigId", "type": "text"},
        {"name": "value", "type": "number"},
        {"name": "threshold", "type": "number"},
        {"name": "message", "type": "text"},
        {"name": "acknowledged", "type": "bool"},
    ],
}

PIGS_SCHEMA = {
    "name": "pigs",
    "type": "base",
    "fields": [
        {"name": "pigId", "type": "text", "required": True, "unique": True},
        {"name": "name", "type": "text", "required": True},
        {"name": "tags", "type": "json"},
        {"name": "healthStatus", "type": "select", "options": {"values": ["NORMAL", "FEVER", "COUGH", "SICK"]}},
        {"name": "thermalEmbedding", "type": "text"},
        {"name": "enrolledAt", "type": "date"},
        {"name": "lastSeen", "type": "date"},
        {"name": "deviceId", "type": "text"},
        {"name": "status", "type": "select", "options": {"values": ["active", "inactive", "removed"]}},
    ],
}


# ── Main ────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("🔧 Setting up PocketBase schema...")

    token = authenticate(POCKETBASE_URL)
    if not token:
        print("❌ Cannot authenticate. Is PocketBase running?")
        sys.exit(1)

    results = []
    results.append(create_collection(POCKETBASE_URL, token, DEVICES_SCHEMA))
    results.append(create_collection(POCKETBASE_URL, token, TELEMETRY_SCHEMA))
    results.append(create_collection(POCKETBASE_URL, token, ALERTS_SCHEMA))
    results.append(create_collection(POCKETBASE_URL, token, PIGS_SCHEMA))

    if all(results):
        print("\n✅ All collections created successfully!")
    else:
        print("\n⚠️ Some collections failed to create")
        sys.exit(1)
