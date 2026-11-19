"""Regression check for the cough classifier's systemd audio gate."""
from configparser import ConfigParser
from pathlib import Path
import unittest

UNIT = Path(__file__).resolve().parents[1] / "pigpulse-cough.service"


class CoughServiceGateTests(unittest.TestCase):
    def test_audio_gate_condition_is_in_unit_section(self):
        # Systemd permits repeated keys, so parse leniently. Preserve key case to
        # make the negative section assertion meaningful instead of vacuous.
        unit = ConfigParser(interpolation=None, strict=False)
        unit.optionxform = str
        unit.read(UNIT)
        self.assertEqual(
            unit.get("Unit", "ConditionPathExists", fallback=None),
            "/run/pigpulse/audio-ok",
        )
        self.assertNotIn("ConditionPathExists", unit["Service"])


if __name__ == "__main__":
    unittest.main()
