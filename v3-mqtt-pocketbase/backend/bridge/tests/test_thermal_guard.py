"""Regression coverage for the thermal-semantics guard (stdlib only).

The MLX90640 frames a scene, not a pig. The thermal publisher copies the
frame centre into `bodyTemp` and the frame average into `temperature`, and
labels the frame `OUT_OF_BAND` — claims the phone app then reads as a pig
temperature (`frame.temperature > 39.5` -> fever alert). The guard strips
the CLAIM and keeps the raw instrument values.
"""
import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "thermal_guard", Path(__file__).resolve().parents[1] / "thermal_guard.py")
guard_mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard_mod)
apply_telemetry_guard = guard_mod.apply_telemetry_guard
is_thermal_alert = guard_mod.is_thermal_alert


THERMAL_ROW = {
    "deviceId": "pi-thermal-01",
    "timestamp": 1793674357246,
    "bodyTemp": 37.04,          # == centre, labelled as pig temperature
    "temperature": 35.8,       # == frame average, labelled as pig temperature
    "status": "OUT_OF_BAND",   # classification, not a measurement
    "verdict": "OUT_OF_BAND",
    "alerts": 1,
    "center": 37.04,
    "hotspot": 39.47,
    "max": 40.66,
    "min": 31.33,
    "ambient": 49.29,
    "pigId": "unassigned",
}

MIC_ROW = {
    "deviceId": "s3-mic-01",
    "timestamp": 1793667462000,
    "mic": True,
    "rms": 23991,
    "peak": 62092,
    "sr": 48000,
    "temperature": 31.11,       # SHT45 ambient, not a pig temperature
    "humidity": 55.5,
    "bodyTemp": 0,
    "status": "",
    "verdict": "",
    "alerts": 0,
}


class ThermalGuardTests(unittest.TestCase):
    def test_pig_claims_are_dropped_and_raw_values_survive(self):
        cleaned, dropped = apply_telemetry_guard(dict(THERMAL_ROW))
        for field in ("bodyTemp", "temperature", "status", "verdict", "alerts"):
            self.assertNotIn(field, cleaned)
            self.assertIn(field, dropped)
        for field in ("center", "hotspot", "max", "min", "ambient"):
            self.assertEqual(cleaned[field], THERMAL_ROW[field])

    def test_mic_ambient_reading_is_kept_as_a_raw_value(self):
        cleaned, dropped = apply_telemetry_guard(dict(MIC_ROW))
        self.assertNotIn("temperature", cleaned)
        self.assertIn("temperature", dropped)
        # The SHT45 reading is a real instrument value: keep it, but under a
        # name that cannot be read as a pig body temperature.
        self.assertEqual(cleaned["ambient"], 31.11)
        self.assertEqual(cleaned["humidity"], 55.5)
        self.assertNotIn("bodyTemp", cleaned)
        self.assertNotIn("verdict", cleaned)
        self.assertNotIn("alerts", cleaned)

    def test_device_status_is_preserved(self):
        row = {"deviceId": "s3-mic-01", "status": "online", "mic": True}
        cleaned, dropped = apply_telemetry_guard(row)
        self.assertEqual(cleaned["status"], "online")
        self.assertNotIn("status", dropped)

    def test_input_payload_is_not_mutated(self):
        original = dict(THERMAL_ROW)
        apply_telemetry_guard(original)
        self.assertEqual(original, THERMAL_ROW)

    def test_thermal_alert_rows_are_recognised(self):
        self.assertTrue(is_thermal_alert({
            "deviceId": "pi-thermal-01", "type": "HYPERTHERMIA",
            "severity": "critical", "timestamp": 1790820701364}))
        self.assertTrue(is_thermal_alert({
            "deviceId": "pi-thermal-01", "type": "FEVER"}))
        self.assertTrue(is_thermal_alert({
            "deviceId": "pi-thermal-01", "type": "CUSTOM",
            "bodyTemp": 40.1}))

    def test_unrelated_alert_rows_are_not_suppressed(self):
        self.assertFalse(is_thermal_alert({
            "deviceId": "s3-mic-01", "type": "MIC_DISCONNECTED",
            "severity": "warning"}))


if __name__ == "__main__":
    unittest.main()
