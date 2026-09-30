#!/usr/bin/env python3
"""
Pi thermal → MQTT publisher. Makes the Pi a first-class pipeline node.

Until this existed the Pi was a private website: it read the MLX90640, drew
a dashboard, and stopped. Every other device in this project (ESP32-S3, and
the retired D0WD) publishes to MQTT, and the existing local_bridge turns that
into PocketBase rows. The Pi published nothing, so its thermal data — the
whole point of a thermal camera — never entered the pipeline and could never
reach the phone.

This closes that by making the Pi publish on exactly the same wire contract
as every other node. NO new bridge code is needed: local_bridge.py already
subscribes to `pig/+/telemetry` and `pig/+/alerts` and writes them to
PocketBase with `synced: false`, which is precisely the flag
backend/workers/cloud_sync.py then ships to the cloud.

Contract (see firmware/include/PigMqttTopics.h):
    pig/{deviceId}/telemetry   -> telemetry collection
    pig/{deviceId}/alerts      -> alerts collection
    pig/{deviceId}/status      -> devices collection (LWT + heartbeat)

Payload keys intentionally match the ESP32-S3 so both device types land in
one collection with one schema. Anything PocketBase does not recognise is
DISCARDED SILENTLY, so a field added here without a migration just vanishes
with no error anywhere.
"""
from __future__ import annotations

import json
import threading
import time

import config

# The Pi is a node like any other. This id is what shows up in the
# `devices` collection and what the app filters on.
#
# 2026-09-30: this was a hardcoded literal that ignored config.DEVICE_ID, so the
# two layers disagreed about this node's identity. It now reads from config, and
# the *default* keeps the previously published id byte-for-byte — the MQTT topic
# and every stored deviceId are unchanged, only the source of truth moved.
DEVICE_ID = config.DEVICE_ID

# A pig is not 38.5 °C because the room is. Publishing every 0.5 s frame is
# 172,800 rows/day per collection, which is how a device ends up starving the
# real telemetry. One summary row per PUBLISH_INTERVAL_S.
PUBLISH_INTERVAL_S = 10.0
STATUS_INTERVAL_S = 60.0

# Only publish once the sensor is actually producing a valid frame. Before
# this, values are placeholder noise from a cold sensor.
MIN_CONFIDENCE_FRAMES = 3


class ThermalPublisher:
    """Fire-and-forget MQTT publisher with its own reconnecting thread.

    Deliberately does NOT block or raise into the thermal read loop: a broker
    outage must never stop the dashboard from drawing. If MQTT is down the
    frames are simply not published and the next attempt tries again.
    """

    def __init__(self) -> None:
        self.enabled = bool(getattr(config, "THERMAL_PUBLISH_ENABLED", True))
        self._lock = threading.Lock()
        self._client = None
        self._connected = False
        self._frames = 0
        self._published = 0
        self._last_error = ""
        self._last_telemetry = 0.0
        self._last_status = 0.0
        self._started = 0.0
        # Latches so a permanently-sick pig produces ONE alert, not 8,640/hour.
        self._alerted = False

    # ---------------- lifecycle ----------------
    def start(self) -> None:
        if not self.enabled:
            print("[thermal-pub] disabled (THERMAL_PUBLISH_ENABLED=0)", flush=True)
            return
        self._started = time.monotonic()
        threading.Thread(target=self._run, name="thermal-mqtt", daemon=True).start()

    def _run(self) -> None:
        try:
            import paho.mqtt.client as mqtt
        except ImportError as e:
            self._last_error = f"paho-mqtt not installed: {e}"
            print(f"[thermal-pub] DISABLED: {self._last_error}", flush=True)
            return

        broker = getattr(config, "MQTT_BROKER", "127.0.0.1")
        port = int(getattr(config, "MQTT_PORT", 1883))

        while True:
            try:
                # CallbackAPIVersion.VERSION2 is paho 2.x; the compatibility
                # shim keeps this working if the venv ever holds 1.x.
                try:
                    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2,
                                         client_id="pigpulse-pi-thermal")
                except AttributeError:
                    client = mqtt.Client(client_id="pigpulse-pi-thermal")
                client.on_connect = self._on_connect
                client.on_disconnect = self._on_disconnect
                client.will_set(
                    f"pig/{DEVICE_ID}/status",
                    json.dumps({"online": False, "deviceId": DEVICE_ID}),
                    qos=1, retain=True,
                )
                with self._lock:
                    self._client = client
                client.connect(broker, port, 60)
                client.loop_forever()
            except Exception as e:  # broker down, auth refused, DNS, …
                self._last_error = str(e)[:200]
                with self._lock:
                    self._connected = False
                    self._client = None
                print(f"[thermal-pub] mqtt error: {self._last_error} "
                      f"(retry in 10 s)", flush=True)
                time.sleep(10)

    def _on_connect(self, client, userdata, flags, rc, properties=None) -> None:
        with self._lock:
            self._connected = (rc == 0)
            if rc == 0:
                self._last_error = ""
        if rc == 0:
            print(f"[thermal-pub] connected as {DEVICE_ID}", flush=True)
            self._publish_status(True)
        else:
            print(f"[thermal-pub] connect refused rc={rc}", flush=True)

    def _on_disconnect(self, client, userdata, *args) -> None:
        with self._lock:
            self._connected = False

    # ---------------- publishing ----------------
    def _publish(self, topic_suffix: str, payload: dict, qos: int = 0) -> bool:
        with self._lock:
            client = self._client
            connected = self._connected
        if client is None or not connected:
            return False
        try:
            client.publish(f"pig/{DEVICE_ID}/{topic_suffix}",
                           json.dumps(payload), qos=qos)
            return True
        except Exception as e:
            self._last_error = str(e)[:200]
            return False

    def _publish_status(self, online: bool) -> None:
        self._publish("status", {
            "deviceId": DEVICE_ID,
            "online": online,
            "status": "online" if online else "offline",
            "type": "thermal",
            "name": "PigPulse Pi 4B (MLX90640)",
            "lastSeen": int(time.time() * 1000),
        }, qos=1)

    def publish_frame(self, st: dict, frames_seen: int) -> None:
        """Called from web_server's thermal loop with a frame_stats dict.

        Rate-limited internally, so the caller can just call it every frame.
        """
        if not self.enabled:
            return
        now = time.monotonic()
        self._frames += 1

        # Heartbeat is independent of the data cadence, so a healthy-but-quiet
        # sensor still proves liveness.
        if now - self._last_status >= STATUS_INTERVAL_S:
            self._last_status = now
            self._publish_status(True)

        if frames_seen < MIN_CONFIDENCE_FRAMES:
            return

        # --- ALERTS FIRST, and NOT behind the telemetry rate limit. ---------
        # This was a real bug: the alert check used to sit after the 10 s
        # telemetry gate, so a fever onset could not raise an alert for up to
        # 10 s and was never evaluated at all if frames arrived faster than
        # the gate. A pig going from 39.0 C to 40.4 C is the event that
        # matters; it must not wait on a data-rate throttle.
        # The latch means the cost is one int compare per frame, and the
        # network I/O happens only on the transition into a fever state — so
        # a permanently sick pig produces ONE alert, not 8,640 an hour.
        flags = int(st.get("alerts", 0))
        if not flags:
            self._alerted = False
        elif not self._alerted:
            self._alerted = True
            pig = getattr(config, "PUBLISH_PIG_ID", "unassigned")
            body = round(float(st.get("center", 0.0)), 2)
            self._publish("alerts", {
                "deviceId": DEVICE_ID,
                "timestamp": int(time.time() * 1000),
                "pigId": pig,
                # 0x01 FEVER, 0x02 HYPERTHERMIA (pigpulse_stats.evaluate_alerts)
                "type": "HYPERTHERMIA" if flags & 0x02 else "FEVER",
                "severity": "critical" if flags & 0x02 else "warning",
                "message": (
                    f"{pig} centre {body}C ({st.get('verdict', 'UNKNOWN')}) "
                    f"— hotspot ({st.get('hotspotX', '?')},"
                    f"{st.get('hotspotY', '?')})"
                ),
                "bodyTemp": body,
            })
            self._published += 1

        # --- TELEMETRY, rate-limited. ---------------------------------------
        if now - self._last_telemetry < PUBLISH_INTERVAL_S:
            return
        self._last_telemetry = now

        center = float(st.get("center", 0.0))
        payload = {
            "deviceId": DEVICE_ID,
            "timestamp": int(time.time() * 1000),
            "pigId": getattr(config, "PUBLISH_PIG_ID", "unassigned"),
            # `bodyTemp` is what the app treats as the pig reading; `center`
            # is the hotspot estimate. Both, so either consumer works.
            "bodyTemp": round(center, 2),
            "temperature": round(float(st.get("avg", center)), 2),
            "center": round(center, 2),
            "hotspot": round(float(st.get("hotspot", center)), 2),
            "max": round(float(st.get("max", 0.0)), 2),
            "min": round(float(st.get("min", 0.0)), 2),
            "ambient": round(float(st.get("ambient", 0.0)), 2),
            "status": st.get("verdict", "UNKNOWN"),
            "alerts": flags,
            "verdict": st.get("verdict", "UNKNOWN"),
        }
        if self._publish("telemetry", payload):
            self._published += 1

    def status(self) -> dict:
        return {
            "enabled": self.enabled,
            "connected": self._connected,
            "deviceId": DEVICE_ID,
            "framesSeen": self._frames,
            "published": self._published,
            "intervalS": PUBLISH_INTERVAL_S,
            "uptimeS": int(time.monotonic() - self._started) if self._started else 0,
            "error": self._last_error or None,
        }
