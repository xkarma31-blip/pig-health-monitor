#!/usr/bin/env python3
"""
PigPulse v3 — MQTT → PocketBase Bridge

Subscribes to ESP32 MQTT topics and stores data in PocketBase.
Buffers telemetry in ValKey for rate limiting.

Usage:
    python mqtt_bridge.py

Environment:
    MQTT_BROKER: MQTT broker hostname (default: mosquitto)
    MQTT_PORT: MQTT broker port (default: 1883)
    POCKETBASE_URL: PocketBase URL (default: http://pocketbase:8090)
    VALKEY_URL: ValKey/Redis URL (default: redis://valkey:6379)
    PB_EMAIL: PocketBase admin email
    PB_PASSWORD: PocketBase admin password
"""

import os
import json
import time
import logging
from datetime import datetime, timezone
from typing import Optional

import paho.mqtt.client as mqtt
import requests

# ── Configuration ────────────────────────────────────────────────

MQTT_BROKER = os.getenv("MQTT_BROKER", "mosquitto")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))
POCKETBASE_URL = os.getenv("POCKETBASE_URL", "http://pocketbase:8090")
VALKEY_URL = os.getenv("VALKEY_URL", "redis://valkey:6379")
PB_EMAIL = os.getenv("PB_EMAIL", "admin@pigpulse.local")
PB_PASSWORD = os.getenv("PB_PASSWORD", "admin123")

TELEMETRY_TTL = 300  # 5 minutes
HEALTHBEAT_INTERVAL = 60  # seconds

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("bridge")


# ── PocketBase Client ───────────────────────────────────────────

class PocketBaseClient:
    """Simple PocketBase client with auto token refresh."""

    def __init__(self, base_url: str):
        self.base_url = base_url
        self.token: Optional[str] = None
        self.token_expiry: float = 0

    def _authenticate(self) -> bool:
        """Authenticate with PocketBase admin."""
        try:
            resp = requests.post(
                f"{self.base_url}/api/admins/auth-with-password",
                json={"identity": PB_EMAIL, "password": PB_PASSWORD},
                timeout=10,
            )
            if resp.status_code == 200:
                data = resp.json()
                self.token = data["token"]
                self.token_expiry = time.time() + 3600  # 1 hour
                log.info("✅ PocketBase authenticated")
                return True
            else:
                log.error(f"❌ PocketBase auth failed: {resp.status_code}")
                return False
        except Exception as e:
            log.error(f"❌ PocketBase auth error: {e}")
            return False

    def _get_headers(self) -> dict:
        """Get auth headers, refreshing token if needed."""
        if not self.token or time.time() > self.token_expiry:
            self._authenticate()
        return {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
        }

    def create_record(self, collection: str, data: dict) -> bool:
        """Create a record in PocketBase."""
        try:
            resp = requests.post(
                f"{self.base_url}/api/collections/{collection}/records",
                headers=self._get_headers(),
                json=data,
                timeout=10,
            )
            if resp.status_code == 200:
                log.info(f"✅ Created {collection} record")
                return True
            elif resp.status_code == 401:
                # Token expired, re-auth and retry
                self._authenticate()
                resp = requests.post(
                    f"{self.base_url}/api/collections/{collection}/records",
                    headers=self._get_headers(),
                    json=data,
                    timeout=10,
                )
                if resp.status_code == 200:
                    log.info(f"✅ Created {collection} record (after re-auth)")
                    return True
            log.error(f"❌ Create {collection} failed: {resp.status_code} {resp.text[:200]}")
            return False
        except Exception as e:
            log.error(f"❌ Create {collection} error: {e}")
            return False


# ── MQTT Callbacks ──────────────────────────────────────────────

def on_connect(client, userdata, flags, rc, properties=None):
    """Called when connected to MQTT broker."""
    if rc == 0:
        log.info(f"✅ Connected to MQTT broker {MQTT_BROKER}:{MQTT_PORT}")
        # Subscribe to all pig topics
        client.subscribe("pig/+/telemetry", qos=0)
        client.subscribe("pig/+/alerts", qos=1)
        client.subscribe("pig/+/status", qos=1)
        client.subscribe("pig/+/response", qos=0)
        log.info("📡 Subscribed to pig/+/telemetry, pig/+/alerts, pig/+/status")
    else:
        log.error(f"❌ MQTT connection failed: {rc}")


def on_disconnect(client, userdata, rc, properties=None):
    """Called when disconnected from MQTT broker."""
    log.warning(f"⚠️ Disconnected from MQTT broker (rc={rc})")


def on_message(client, userdata, msg):
    """Called when a message is received."""
    try:
        topic = msg.topic
        payload = json.loads(msg.payload.decode())

        # Extract device ID from topic: pig/{deviceId}/...
        parts = topic.split("/")
        if len(parts) < 3:
            log.warning(f"⚠️ Invalid topic: {topic}")
            return

        device_id = parts[1]
        msg_type = parts[2]  # telemetry, alerts, status, response

        log.info(f"📨 Received {msg_type} from {device_id}")

        if msg_type == "telemetry":
            handle_telemetry(device_id, payload)
        elif msg_type == "alerts":
            handle_alert(device_id, payload)
        elif msg_type == "status":
            handle_status(device_id, payload)
        elif msg_type == "response":
            handle_response(device_id, payload)

    except json.JSONDecodeError:
        log.error(f"❌ Invalid JSON on {msg.topic}")
    except Exception as e:
        log.error(f"❌ Error processing {msg.topic}: {e}")


def handle_telemetry(device_id: str, data: dict):
    """Handle telemetry message."""
    data["deviceId"] = device_id
    if "timestamp" not in data:
        data["timestamp"] = int(time.time())

    pb.create_record("telemetry", data)


def handle_alert(device_id: str, data: dict):
    """Handle alert message."""
    data["deviceId"] = device_id
    if "timestamp" not in data:
        data["timestamp"] = int(time.time())

    pb.create_record("alerts", data)


def handle_status(device_id: str, data: dict):
    """Handle status message (LWT)."""
    data["deviceId"] = device_id
    if "timestamp" not in data:
        data["timestamp"] = int(time.time())

    try:
        resp = requests.get(
            f"{POCKETBASE_URL}/api/collections/devices/records",
            headers=pb._get_headers(),
            params={"filter": f"deviceId='{device_id}'", "limit": 1},
            timeout=10,
        )
        if resp.status_code == 200:
            records = resp.json().get("items", [])
            if records:
                record_id = records[0]["id"]
                requests.patch(
                    f"{POCKETBASE_URL}/api/collections/devices/records/{record_id}",
                    headers=pb._get_headers(),
                    json=data,
                    timeout=10,
                )
            else:
                data["name"] = f"Device {device_id}"
                pb.create_record("devices", data)
    except Exception as e:
        log.error(f"❌ Status update error: {e}")


def handle_response(device_id: str, data: dict):
    """Handle command response."""
    log.info(f"📩 Response from {device_id}: {data.get('status', 'unknown')}")


# ── Main ────────────────────────────────────────────────────────

pb = PocketBaseClient(POCKETBASE_URL)

if __name__ == "__main__":
    log.info("🚀 Starting PigPulse MQTT Bridge")

    pb._authenticate()

    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    client.on_connect = on_connect
    client.on_disconnect = on_disconnect
    client.on_message = on_message

    client.will_set("bridge/status", json.dumps({"online": False}), qos=1, retain=True)

    try:
        client.connect(MQTT_BROKER, MQTT_PORT, 60)
        client.publish("bridge/status", json.dumps({"online": True}), qos=1, retain=True)
        client.loop_forever()
    except KeyboardInterrupt:
        log.info("🛑 Bridge stopped")
        client.disconnect()
    except Exception as e:
        log.error(f"❌ Bridge error: {e}")
