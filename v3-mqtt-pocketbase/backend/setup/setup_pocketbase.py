#!/usr/bin/env python3
"""
PigPulse v3 — PocketBase Schema Setup (v0.22.x compatible)
"""

import requests
import sys

POCKETBASE_URL = "http://localhost:8090"
PB_EMAIL = "admin@pigpulse.local"
PB_PASSWORD = "admin123"


def authenticate():
    resp = requests.post(
        f"{POCKETBASE_URL}/api/admins/auth-with-password",
        json={"identity": PB_EMAIL, "password": PB_PASSWORD},
    )
    if resp.status_code == 200:
        return resp.json()["token"]
    else:
        print(f"Auth failed: {resp.status_code} {resp.text}")
        sys.exit(1)


def create_collection(token, name, schema):
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    
    payload = {
        "name": name,
        "type": "base",
        "schema": schema,
        "listRule": "",
        "viewRule": "",
        "createRule": "",
        "updateRule": "",
        "deleteRule": "",
    }
    
    resp = requests.post(
        f"{POCKETBASE_URL}/api/collections",
        headers=headers,
        json=payload,
    )
    
    if resp.status_code == 200:
        print(f"  Created: {name}")
        return True
    elif resp.status_code == 409:
        print(f"  Exists:  {name}")
        return True
    else:
        print(f"  Failed:  {name} — {resp.status_code} {resp.text[:200]}")
        return False


def setup():
    print("Setting up PocketBase schema...")
    
    token = authenticate()
    print("Authenticated")
    
    create_collection(token, "telemetry", [
        {"name": "deviceId", "type": "text", "required": True, "system": False},
        {"name": "timestamp", "type": "number", "required": True, "system": False},
        {"name": "temperature", "type": "number", "required": False, "system": False},
        {"name": "bodyTemp", "type": "number", "required": False, "system": False},
        {"name": "pigId", "type": "text", "required": False, "system": False},
        {"name": "status", "type": "text", "required": False, "system": False, "options": {"default": "NORMAL"}},
        {"name": "batteryPct", "type": "number", "required": False, "system": False},
        {"name": "wifiRssi", "type": "number", "required": False, "system": False},
    ])
    
    create_collection(token, "alerts", [
        {"name": "deviceId", "type": "text", "required": True, "system": False},
        {"name": "type", "type": "text", "required": False, "system": False, "options": {"default": "FEVER"}},
        {"name": "severity", "type": "text", "required": False, "system": False, "options": {"default": "WARNING"}},
        {"name": "message", "type": "text", "required": False, "system": False},
        {"name": "timestamp", "type": "number", "required": True, "system": False},
    ])
    
    create_collection(token, "devices", [
        {"name": "deviceId", "type": "text", "required": True, "system": False},
        {"name": "name", "type": "text", "required": False, "system": False},
        {"name": "type", "type": "text", "required": False, "system": False, "options": {"default": "esp32"}},
        {"name": "status", "type": "text", "required": False, "system": False, "options": {"default": "offline"}},
        {"name": "batteryPct", "type": "number", "required": False, "system": False},
        {"name": "lastSeen", "type": "number", "required": False, "system": False},
    ])
    
    create_collection(token, "pigs", [
        {"name": "pigId", "type": "text", "required": True, "system": False},
        {"name": "name", "type": "text", "required": False, "system": False},
        {"name": "healthStatus", "type": "text", "required": False, "system": False, "options": {"default": "NORMAL"}},
        {"name": "tags", "type": "json", "required": False, "system": False, "options": {"maxSize": 1000000}},
    ])
    
    print("Schema setup complete!")


if __name__ == "__main__":
    setup()
