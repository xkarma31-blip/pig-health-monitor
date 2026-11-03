#!/usr/bin/env python3
"""State-machine tests for ambient_ingest.py — no broker, no hardware.

Feeds synthetic MQTT messages straight into AmbientIngest._on_message (the
same entry point paho calls) and checks the computed state. Time is rewound by
adjusting the monotonic bookkeeping instead of sleeping, so the whole file
runs in milliseconds.

    cd backend/thermal-pi && python3 -m unittest tests.test_ambient_ingest -v
    # or
    python3 backend/thermal-pi/tests/test_ambient_ingest.py
"""

from __future__ import annotations

import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

import ambient_ingest as ai  # noqa: E402

TOPIC = "pig/s3-mic-01/telemetry"


class FakeMsg:
    def __init__(self, payload: str, topic: str = TOPIC):
        self.topic = topic
        self.payload = payload.encode()


class AmbientStateTests(unittest.TestCase):

    def setUp(self):
        self.ing = ai.AmbientIngest()

    def feed(self, payload: str, topic: str = TOPIC):
        self.ing._on_message(None, None, FakeMsg(payload, topic))

    def rewind(self, seconds: float):
        """Age every stored timestamp by `seconds` (instead of sleeping)."""
        for attr in ("_last_msg", "_last_ambient"):
            v = getattr(self.ing, attr)
            if v is not None:
                setattr(self.ing, attr, v - seconds)

    # ---- baseline states ------------------------------------------------

    def test_broker_down_is_mqtt_offline(self):
        self.assertEqual(self.ing.snapshot()["state"], "mqtt-offline")

    def test_connected_but_silent_is_no_data(self):
        self.ing._connected = True
        s = self.ing.snapshot()
        self.assertEqual(s["state"], "no-data")
        self.assertIsNone(s["temperature"])

    def test_esp_online_without_ambient_keys_is_sht_missing(self):
        self.ing._connected = True
        self.feed('{"mic":true,"rms":10,"peak":20,"sr":48000}')
        s = self.ing.snapshot()
        self.assertEqual(s["state"], "sht-missing")
        self.assertIsNone(s["temperature"])
        self.assertIsNone(s["humidity"])
        self.assertTrue(s["micOnline"])

    # ---- happy path -----------------------------------------------------

    def test_fresh_ambient_is_live(self):
        self.ing._connected = True
        self.feed('{"mic":true,"rms":10,"peak":20,"sr":48000,'
                  '"temperature":34.09,"humidity":65.07}')
        s = self.ing.snapshot()
        self.assertEqual(s["state"], "live")
        self.assertTrue(s["ok"])
        self.assertAlmostEqual(s["temperature"], 34.09)
        self.assertAlmostEqual(s["humidity"], 65.07)
        self.assertEqual(s["device"], "s3-mic-01")
        self.assertEqual(s["ambientCount"], 1)

    def test_humidity_only_still_counts(self):
        self.ing._connected = True
        self.feed('{"humidity":65.0}')
        self.assertEqual(self.ing.snapshot()["state"], "live")

    # ---- ageing ---------------------------------------------------------

    def test_old_ambient_is_stale(self):
        self.ing._connected = True
        self.feed('{"mic":true,"temperature":34.09,"humidity":65.07}')
        self.rewind(ai.LIVE_S + 15.0)          # fresh enough for the ESP...
        s = self.ing.snapshot()
        self.assertEqual(s["state"], "stale")  # ...but the SHT read is old
        self.assertTrue(s["ok"])               # values exist; state marks staleness
        self.assertGreater(s["ambientAgeS"], ai.LIVE_S)

    def test_silent_beyond_offline_window_is_esp_offline(self):
        self.ing._connected = True
        self.feed('{"mic":true,"temperature":34.09,"humidity":65.07}')
        self.rewind(ai.OFFLINE_S + 60.0)
        s = self.ing.snapshot()
        self.assertEqual(s["state"], "esp-offline")
        # Values are kept for display — the state, not erasure, marks them old.
        self.assertAlmostEqual(s["temperature"], 34.09)

    # ---- LWT / recovery -------------------------------------------------

    def test_retained_lwt_makes_esp_offline_and_keeps_last_values(self):
        self.ing._connected = True
        self.feed('{"mic":true,"temperature":34.09,"humidity":65.07}')
        self.feed('{"mic":false,"rms":0,"peak":0,"sr":48000}')  # retained will
        s = self.ing.snapshot()
        self.assertEqual(s["state"], "esp-offline")
        self.assertAlmostEqual(s["temperature"], 34.09)
        self.assertAlmostEqual(s["humidity"], 65.07)

    def test_esp_recovery_returns_to_live(self):
        self.ing._connected = True
        self.feed('{"mic":false,"rms":0,"peak":0,"sr":48000}')
        self.feed('{"mic":true,"temperature":34.10,"humidity":65.00}')
        self.assertEqual(self.ing.snapshot()["state"], "live")

    # ---- robustness -----------------------------------------------------

    def test_garbage_payload_is_ignored(self):
        self.ing._connected = True
        self.feed("not json at all")
        self.feed("[1,2,3]")                    # valid JSON, wrong shape
        s = self.ing.snapshot()
        self.assertEqual(s["state"], "no-data")
        self.assertEqual(s["msgCount"], 0)

    def test_topic_without_device_is_tolerated(self):
        self.ing._connected = True
        self.feed('{"temperature":1.0}', topic="pig/telemetry")
        s = self.ing.snapshot()
        self.assertIsNone(s["device"])
        self.assertEqual(s["state"], "live")


if __name__ == "__main__":
    unittest.main(verbosity=2)
