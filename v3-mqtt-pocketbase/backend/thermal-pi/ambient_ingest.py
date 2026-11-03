#!/usr/bin/env python3
"""Ambient (SHT45) MQTT watcher — barn temperature/humidity, live on the dashboard.

WHY A SUBSCRIBER, NOT A POLLER:
  The SHT45 hangs off the ESP32-S3 (s3-mic-01), which publishes telemetry every
  ~1 s. The Pi's job here is only to *observe*. It must NOT connect to the ESP's
  TCP :9090 to ask — that port is single-client, and a probe would evict the
  live mic stream. MQTT is made for this: the broker is local, the topic is
  already flowing, and subscribing costs the ESP nothing.

CONTRACT (re-verified 2026-11-02 against the flashed source):
  firmware/esp32s3-mic-ambient/arduino/esp32s3_telemetry/src/esp32s3_telemetry.ino
    publish_telemetry() every 1000 ms:
      {"mic":true,"rms":..,"peak":..,"sr":48000[,"temperature":X,"humidity":Y]}
      ^ the ambient keys exist ONLY while the SHT read is fresh
        (shtValid && millis()-shtLastGood < 5000 ms) — an ESP that is online
        but silent about temperature means the SENSOR is not reporting, which
        is a different fault from the ESP being offline. The state model below
        keeps those two apart on purpose.
    LWT, retained, same topic: {"mic":false,"rms":0,"peak":0,"sr":48000}
      A late subscriber receives this immediately when the ESP is down.

STATE MODEL (what /ambient and the dashboard card show):
  mqtt-offline  Pi's broker link is down — nothing can be trusted
  no-data       connected, no telemetry seen yet
  esp-offline   last telemetry said mic:false (LWT) or is older than OFFLINE_S
  sht-missing   ESP is live, but the latest telemetry carries no temperature/
                humidity — the SHT45 itself is not reporting
  stale         ambient values exist but the last good read is older than LIVE_S
  live          ambient values are fresh

  "ok" in the snapshot means "an ambient reading exists" (live or stale) —
  freshness is the state field's job, not ok's. Consumers that must not act on
  an old value check state == "live".

Singleton contract matches esp_audio_ingest: get() / ensure_started().
"""

from __future__ import annotations

import json
import threading
import time

import config

try:
    import paho.mqtt.client as mqtt
except ImportError:  # paho is in requirements.txt; degrade, never crash
    mqtt = None  # type: ignore[assignment]

# Freshness thresholds (seconds).
#   Telemetry arrives every ~1 s; the firmware only includes ambient keys while
#   the SHT read is <5 s old, so 15 s of silence on the ambient keys is already
#   two firmware gate expiries — "stale" is generous on purpose (WiFi hiccups).
LIVE_S = 15.0
#   No telemetry at all for this long => treat the ESP as gone even without an
#   LWT (covers a network partition where the retained will is never published).
OFFLINE_S = 120.0

TOPIC = "pig/+/telemetry"


class AmbientIngest:
    """Last-known ambient state from pig/+/telemetry, with an age clock."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._client = None
        self._thread: threading.Thread | None = None
        self._connected = False
        self._device: str | None = None
        self._mic_online: bool | None = None
        self._temperature: float | None = None
        self._humidity: float | None = None
        self._last_msg: float | None = None       # monotonic, any telemetry
        self._last_ambient: float | None = None   # monotonic, ambient keys only
        self._last_msg_wall: float | None = None  # unix time, for display
        self._last_ambient_wall: float | None = None
        self._last_had_ambient = False
        self._msg_count = 0
        self._ambient_count = 0
        self._error = ""

    # ---- lifecycle -----------------------------------------------------

    def ensure_started(self) -> None:
        if mqtt is None:
            with self._lock:
                self._error = "paho-mqtt not installed"
            return
        if self._thread and self._thread.is_alive():
            return
        self._thread = threading.Thread(
            target=self._run, name="ambient-ingest", daemon=True
        )
        self._thread.start()

    def _run(self) -> None:
        while True:
            try:
                try:
                    client = mqtt.Client(
                        mqtt.CallbackAPIVersion.VERSION2,
                        client_id="pigpulse-pi-ambient",
                    )
                except AttributeError:  # paho 1.x
                    client = mqtt.Client(client_id="pigpulse-pi-ambient")
                client.on_connect = self._on_connect
                client.on_disconnect = self._on_disconnect
                client.on_message = self._on_message
                self._client = client
                client.connect(config.MQTT_BROKER, config.MQTT_PORT, 60)
                client.loop_forever()  # handles its own reconnect after this
            except Exception as e:  # broker down, DNS, refused — retry forever
                with self._lock:
                    self._connected = False
                    self._error = f"{type(e).__name__}: {e}"
            time.sleep(5)

    # ---- MQTT callbacks ------------------------------------------------

    def _on_connect(self, client, userdata, flags, rc, properties=None) -> None:
        ok = rc == 0  # works for VERSION1 int and VERSION2 ReasonCode
        with self._lock:
            self._connected = bool(ok)
            if ok:
                self._error = ""
        if ok:
            client.subscribe(TOPIC, qos=0)

    def _on_disconnect(self, client, userdata, *args) -> None:
        with self._lock:
            self._connected = False

    def _on_message(self, client, userdata, msg) -> None:
        try:
            payload = json.loads(msg.payload.decode())
        except (ValueError, UnicodeDecodeError):
            return
        if not isinstance(payload, dict):
            return

        parts = msg.topic.split("/")
        device = parts[1] if len(parts) >= 3 else None
        now = time.monotonic()
        wall = time.time()
        t_present = "temperature" in payload
        h_present = "humidity" in payload

        with self._lock:
            self._msg_count += 1
            self._device = device
            self._last_msg = now
            self._last_msg_wall = wall
            if "mic" in payload:
                self._mic_online = bool(payload.get("mic"))
            if t_present:
                try:
                    self._temperature = float(payload["temperature"])
                except (TypeError, ValueError):
                    t_present = False
            if h_present:
                try:
                    self._humidity = float(payload["humidity"])
                except (TypeError, ValueError):
                    h_present = False
            # Values are kept after they stop arriving (a glitch must not blank
            # the card) — freshness is expressed by the state, not by erasure.
            self._last_had_ambient = bool(t_present or h_present)
            if self._last_had_ambient:
                self._ambient_count += 1
                self._last_ambient = now
                self._last_ambient_wall = wall

    # ---- readout -------------------------------------------------------

    def snapshot(self) -> dict:
        now = time.monotonic()
        with self._lock:
            connected = self._connected
            device = self._device
            mic = self._mic_online
            temp = self._temperature
            hum = self._humidity
            last_msg = self._last_msg
            last_amb = self._last_ambient
            last_amb_wall = self._last_ambient_wall
            had_ambient = self._last_had_ambient
            msg_count = self._msg_count
            ambient_count = self._ambient_count
            error = self._error

        age_msg = (now - last_msg) if last_msg is not None else None
        age_amb = (now - last_amb) if last_amb is not None else None

        if not connected:
            state = "mqtt-offline"
        elif last_msg is None:
            state = "no-data"
        elif mic is False or (age_msg is not None and age_msg > OFFLINE_S):
            state = "esp-offline"
        elif not had_ambient:
            state = "sht-missing"
        elif age_amb is not None and age_amb <= LIVE_S:
            state = "live"
        else:
            state = "stale"

        return {
            "state": state,
            "ok": state in ("live", "stale"),
            "device": device,
            "micOnline": mic,
            "temperature": temp,
            "humidity": hum,
            "ageS": round(age_msg, 1) if age_msg is not None else None,
            "ambientAgeS": round(age_amb, 1) if age_amb is not None else None,
            "lastAmbientWall": last_amb_wall,
            "msgCount": msg_count,
            "ambientCount": ambient_count,
            "mqttConnected": connected,
            "mqttBroker": f"{config.MQTT_BROKER}:{config.MQTT_PORT}",
            "error": error,
        }


_ambient = AmbientIngest()


def get() -> AmbientIngest:
    return _ambient


def ensure_started() -> None:
    _ambient.ensure_started()
