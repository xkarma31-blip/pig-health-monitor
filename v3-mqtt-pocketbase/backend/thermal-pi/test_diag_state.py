"""Offline tests for honest stale telemetry labels in the diagnostics panel."""
import unittest

import diag_state


class EspTelemetryStateTests(unittest.TestCase):
    def test_no_payload_is_explicit(self):
        state, note = diag_state.esp_telemetry_state(None, None)
        self.assertEqual(state, "NO TELEMETRY")
        self.assertIn("no telemetry", note.lower())

    def test_fresh_payload_is_live(self):
        state, _ = diag_state.esp_telemetry_state({"mic": False}, 5.0)
        self.assertEqual(state, "LIVE")

    def test_old_payload_is_stale_even_when_mic_field_is_false(self):
        state, note = diag_state.esp_telemetry_state(
            {"mic": False, "rms": 0, "peak": 0}, 32076.4)
        self.assertEqual(state, "STALE")
        self.assertIn("9 h", note)
        self.assertIn("not a live reading", note.lower())


class ShtTelemetryStateTests(unittest.TestCase):
    def test_missing_reading_is_explicit(self):
        state, note = diag_state.sht_telemetry_state({}, 1.0)
        self.assertEqual(state, "NO READING")
        self.assertIn("no sht45", note.lower())

    def test_fresh_reading_is_live(self):
        state, note = diag_state.sht_telemetry_state(
            {"temperature": 33.45, "humidity": 69.69}, 0.8)
        self.assertEqual(state, "LIVE")
        self.assertIn("33.45", note)

    def test_old_reading_is_stale(self):
        state, note = diag_state.sht_telemetry_state(
            {"temperature": 33.45, "humidity": 69.69}, 7200.0)
        self.assertEqual(state, "STALE")
        self.assertIn("2.0 h", note)


if __name__ == "__main__":
    unittest.main()
