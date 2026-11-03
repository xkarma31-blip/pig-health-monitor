#!/usr/bin/env python3
"""
PigPulse v3 — Lightweight Local MQTT -> PocketBase Bridge (Raspberry Pi Edge)

Subscribes to local Mosquitto topics and posts records to local PocketBase.
Tags records with 'synced': False for downstream hybrid cloud sync.
Does not require Docker or Redis/ValKey.

T2 timeline (decision 2026-11-02): the Pi has no RTC and its wall clock has
stepped by days, so a device stamp is an opinion, not a fact. Every record
is stamped here from TimeAnchor — the laptop's (NTP-synced) HTTP Date header
carried forward by the monotonic clock — and the thermal guard strips the
pig-temperature claim (`bodyTemp`/`temperature`/`verdict`/...) while keeping
the raw instrument values. Thermal alert rows are suppressed outright.
"""

import os
import sys
import json
import queue
import threading
import time
import logging
from typing import Optional

# Support running directly or from venv
try:
    import paho.mqtt.client as mqtt
    import requests
except ImportError:
    # If not in global, try pointing to thermal-pi venv
    venv_site = "/home/pigpulse/thermal-pi/.venv/lib/python3.13/site-packages"
    if os.path.isdir(venv_site):
        sys.path.insert(0, venv_site)
    import paho.mqtt.client as mqtt
    import requests

# Sibling modules (same directory as this script).
from time_anchor import TimeAnchor
from thermal_guard import apply_telemetry_guard, is_thermal_alert

MQTT_BROKER = os.getenv("MQTT_BROKER", "127.0.0.1")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))

# PocketBase is bound to the AP address ONLY, deliberately NOT to 0.0.0.0 and
# NOT to 127.0.0.1 (see pigpulse-pocketbase.service). So the loopback default
# that used to live here could never connect -- it produced
#   "PocketBase unreachable at http://127.0.0.1:8090: ... Connection refused"
# on every boot. 192.168.69.1 is created by wlan0-static-ip.service, which is
# why that unit is now a declared dependency of pigpulse-pocketbase.service.
POCKETBASE_URL = os.getenv("POCKETBASE_URL", "http://192.168.69.1:8090")
PB_EMAIL = os.getenv("PB_EMAIL", "")
PB_PASSWORD = os.getenv("PB_PASSWORD", "")

if not (PB_EMAIL and PB_PASSWORD):
    # No baked-in default. admin123 shipped in this file for months, which
    # meant anyone who could reach :8090 owned the database. Credentials come
    # from an EnvironmentFile= in the unit, or an untracked env file.
    log_fatal = (
        "PB_EMAIL / PB_PASSWORD are not set. The bridge refuses to start "
        "without them rather than fall back to a hard-coded admin password. "
        "Set them in the systemd unit (EnvironmentFile=-/etc/pigpulse/bridge.env)."
    )
    raise SystemExit(log_fatal)

# ── T2: laptop-anchored timeline ─────────────────────────────────────────────
# The Pi has no RTC and its wall clock has stepped by days, so a stamp from
# time.time() is fiction. TimeAnchor holds the timeline set by the truth host
# (the NTP-synced laptop) via its HTTP Date header, carried forward by the
# monotonic clock. TRUTH_URLS are probed in order; the first Date header wins.
# State persists so a bridge restart does not reset the timeline.
ANCHOR_STATE_PATH = os.getenv(
    "ANCHOR_STATE_PATH", "/var/lib/pigpulse/bridge/anchor_state.json")
TRUTH_URLS = [
    url.strip() for url in os.getenv(
        "TRUTH_URLS",
        "http://192.168.69.62:8090/api/health,http://192.168.69.62:8090/",
    ).split(",") if url.strip()
]
# Re-anchor at most this often on the writer thread; refresh() itself backs
# off after failures, so a dead truth host is never hammered per message.
ANCHOR_REFRESH_S = 60.0

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [bridge] [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("local_bridge")


def _pb_literal(value: str) -> str:
    """Escape a value for use inside a PocketBase single-quoted filter string.

    PocketBase filter literals are single-quoted; a backslash is the escape
    character, so escape backslash first, then the quote.
    """
    return value.replace("\\", "\\\\").replace("'", "\\'")


class LocalPocketBaseClient:
    def __init__(self, base_url: str):
        self.base_url = base_url
        self.token: Optional[str] = None
        self.token_expiry: float = 0

    def authenticate(self) -> bool:
        try:
            resp = requests.post(
                f"{self.base_url}/api/admins/auth-with-password",
                json={"identity": PB_EMAIL, "password": PB_PASSWORD},
                timeout=5,
            )
            if resp.status_code == 200:
                self.token = resp.json().get("token")
                # Re-auth well before PocketBase's own 15 min default rather
                # than guessing an hour; the 401 path below is the real safety
                # net, this just avoids needless re-auths.
                self.token_expiry = time.time() + 600
                log.info("PocketBase authenticated")
                return True
            else:
                log.warning(f"PocketBase auth failed ({resp.status_code}) - retrying later")
                return False
        except Exception as e:
            log.warning(f"PocketBase unreachable at {self.base_url}: {e}")
            return False

    def _invalidate(self) -> None:
        self.token = None
        self.token_expiry = 0

    def _ensure_token(self) -> bool:
        if not self.token or time.time() > self.token_expiry:
            return self.authenticate()
        return True

    def insert_record(self, collection: str, data: dict) -> bool:
        if not self._ensure_token():
            return False

        headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
        }
        # Mark local records as unsynced for hybrid cloud sync
        if "synced" not in data:
            data["synced"] = False

        try:
            resp = requests.post(
                f"{self.base_url}/api/collections/{collection}/records",
                json=data,
                headers=headers,
                timeout=5,
            )
            if resp.status_code in (200, 201):
                return True
            if resp.status_code == 401:
                # Our local clock said the token was fine but PocketBase
                # disagreed. Drop it so the next call re-authenticates —
                # without this the bridge is dead until the process restarts.
                self._invalidate()
                log.warning("PocketBase token rejected (401) - will re-authenticate")
                return False
            # Never drop silently: PB rejects with 404 (missing
            # collection) or 400 (validation) and without the body
            # the failure is invisible — this is exactly how the
            # audio_events loss stayed hidden.
            log.error(
                f"PB insert into {collection} failed: "
                f"HTTP {resp.status_code}: {resp.text[:300]}"
            )
            return False
        except Exception as e:
            log.error(f"Failed to insert record into {collection}: {e}")
            return False

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
        }

    def find_record(self, collection: str, field: str, value: str) -> Optional[str]:
        """Return the id of the first record where field==value, else None.

        `value` arrives from an MQTT topic segment, so it is untrusted input
        that can contain a single quote and terminate the filter expression.
        PocketBase accepts a literal-URL-encoded value, which is what we use.
        """
        if not self._ensure_token():
            return None
        try:
            resp = requests.get(
                f"{self.base_url}/api/collections/{collection}/records",
                params={"filter": f"{field}='{_pb_literal(value)}'", "limit": 1},
                headers=self._headers(),
                timeout=5,
            )
            if resp.status_code == 200:
                items = resp.json().get("items", [])
                return items[0]["id"] if items else None
            log.warning(f"Lookup {collection} failed ({resp.status_code})")
        except Exception as e:
            log.error(f"Lookup {collection} error: {e}")
        return None

    def update_record(self, collection: str, record_id: str, data: dict) -> bool:
        if not self._ensure_token():
            return False
        try:
            resp = requests.patch(
                f"{self.base_url}/api/collections/{collection}/records/{record_id}",
                json=data,
                headers=self._headers(),
                timeout=5,
            )
            if resp.status_code == 401:
                self._invalidate()
            return resp.status_code == 200
        except Exception as e:
            log.error(f"Failed to update {collection}/{record_id}: {e}")
            return False


pb_client = LocalPocketBaseClient(POCKETBASE_URL)

# One anchor for the whole process: on_message stamps from it, the writer
# thread maintains it. main() restores persisted state and adopts the truth
# host's time; a failed refresh keeps the previous anchor.
ANCHOR = TimeAnchor(ANCHOR_STATE_PATH, truth_urls=TRUTH_URLS)

# PocketBase writes happen on a worker thread, never inside the paho network
# loop. A synchronous HTTP POST with a 5 s timeout inside on_message() blocks
# the loop, so the broker stops ACKing and QoS-0 telemetry is dropped during
# every PocketBase hiccup. The queue is bounded and drops OLDEST: for live
# health data a fresh sample is always more valuable than a stale backlog.
WRITE_QUEUE: "queue.Queue[tuple[str, str, dict]]" = queue.Queue(maxsize=512)


def _writer_loop() -> None:
    last_anchor_maint = 0.0
    while True:
        job = WRITE_QUEUE.get()
        if job is None:
            break
        kind, a, b = job
        if kind == "insert":
            pb_client.insert_record(a, b)
        elif kind == "status":
            handle_status(a, b)
        # Piggyback anchor maintenance on write traffic: re-anchor at most
        # once per interval, so an unanchored timeline (fresh boot, truth
        # host down) heals itself as soon as the laptop answers again.
        now_mono = time.monotonic()
        if now_mono - last_anchor_maint >= ANCHOR_REFRESH_S:
            last_anchor_maint = now_mono
            prev_source = ANCHOR.status()["source"]
            if ANCHOR.refresh() and ANCHOR.status()["source"] != prev_source:
                log.info("timeline anchored via %s", ANCHOR.status()["source"])


def _submit(kind: str, a: str, b: dict) -> None:
    try:
        WRITE_QUEUE.put_nowait((kind, a, b))
    except queue.Full:
        try:
            WRITE_QUEUE.get_nowait()      # drop oldest — stay live
            WRITE_QUEUE.put_nowait((kind, a, b))
        except (queue.Empty, queue.Full):
            log.warning("write queue saturated, dropping record")


def handle_status(device_id: str, data: dict) -> None:
    """Upsert devices row from a status/LWT message.

    Mirrors backend/bridge/mqtt_bridge.py handle_status(): online:true ->
    status "online", online:false -> "offline", absent key leaves status alone.
    """
    if data.get("online") is True:
        data["status"] = "online"
    elif data.get("online") is False:
        data["status"] = "offline"

    data["deviceId"] = device_id
    # Anchor seconds, not the Pi wall clock: the Pi clock has stepped by
    # days, and lastSeen drives the app's online/stale view of devices.
    data["lastSeen"] = int(ANCHOR.now_ms() // 1000)

    record_id = pb_client.find_record("devices", "deviceId", device_id)
    if record_id:
        pb_client.update_record("devices", record_id, data)
        return

    data.setdefault("name", f"Device {device_id}")
    if not pb_client.insert_record("devices", data):
        log.warning(f"Could not create devices row for {device_id}")


def on_connect(client, userdata, flags, rc, properties=None):
    if rc == 0:
        log.info("Connected to local Mosquitto broker")
        client.subscribe("pig/+/telemetry")
        client.subscribe("pig/+/alerts")
        client.subscribe("pig/+/audio")
        client.subscribe("pig/+/status")
    else:
        log.error(f"MQTT connect failed code {rc}")


def on_message(client, userdata, msg):
    try:
        topic_parts = msg.topic.split("/")
        if len(topic_parts) < 3:
            return
        _, device_id, channel = topic_parts[0], topic_parts[1], topic_parts[2]
        payload = json.loads(msg.payload.decode("utf-8"))

        if not isinstance(payload, dict):
            return

        payload.setdefault("deviceId", device_id)
        # A device stamp (or the Pi wall clock) is an opinion, not a fact:
        # the Pi has no RTC and its clock has stepped by days. The anchor's
        # monotonic-carried timeline is the only stamp we trust, so it
        # overwrites any arriving stamp unconditionally (T2 decision).
        payload["timestamp"] = int(ANCHOR.now_ms())
        # Per-device ledger: make barn outages visible in the journal.
        seen = ANCHOR.observe(device_id)
        if seen["is_gap"]:
            log.warning("device %s resumed after %.0f s of silence",
                        device_id, seen["gap_s"])

        if channel == "telemetry":
            # Strip the pig-temperature claim, keep the raw instrument
            # values (T2 decision 2026-11-02).
            payload, dropped = apply_telemetry_guard(payload)
            if dropped:
                log.info("telemetry/%s: dropped semantic fields: %s",
                         device_id, ", ".join(sorted(dropped)))
            _submit("insert", "telemetry", payload)
        elif channel == "alerts":
            # Thermal alert rows are scene-camera claims with impossible
            # values (measured up to 476.89 "degC"). Suppress at ingest;
            # cloud_sync drains the historical backlog the same way.
            if is_thermal_alert(payload):
                log.info("alerts/%s: suppressed thermal claim row", device_id)
                return
            _submit("insert", "alerts", payload)
        elif channel == "audio":
            _submit("insert", "audio_events", payload)
        elif channel == "status":
            _submit("status", device_id, payload)

    except json.JSONDecodeError as e:
        # Keep the first 200 bytes: without them a truncated/esc-less payload
        # is undiagnosable from the error alone (see firmware jsonEscape()).
        log.error(f"Invalid JSON on {msg.topic}: {e} | payload={msg.payload[:200]!r}")
    except Exception as e:
        log.error(f"Error handling message on {msg.topic}: {e}")


def main():
    log.info("Starting PigPulse local bridge...")
    if ANCHOR.load():
        log.info("restored anchor state from %s", ANCHOR_STATE_PATH)
    if ANCHOR.refresh():
        log.info("timeline anchored via %s", ANCHOR.status()["source"])
    else:
        log.warning(
            "truth host unreachable — stamps fall back to the (untrusted) "
            "wall clock until it answers; state file: %s", ANCHOR_STATE_PATH)
    threading.Thread(target=_writer_loop, name="pb-writer", daemon=True).start()
    time.sleep(2)  # brief wait for broker / pocketbase
    pb_client.authenticate()

    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="pigpulse-local-bridge")
    client.on_connect = on_connect
    client.on_message = on_message

    while True:
        try:
            client.connect(MQTT_BROKER, MQTT_PORT, 60)
            client.loop_forever()
        except KeyboardInterrupt:
            break
        except Exception as e:
            log.warning(f"Connection lost ({e}), reconnecting in 5s...")
            time.sleep(5)


if __name__ == "__main__":
    main()
