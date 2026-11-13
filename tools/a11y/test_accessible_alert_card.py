#!/usr/bin/env python3
"""TDD contract for non-colour-dependent PigPulse zone alert cards."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from accessible_alert_card import build_alert_card  # noqa: E402


class TestAccessibleAlertCard(unittest.TestCase):
    def test_urgent_alert_has_redundant_visual_and_spoken_status(self):
        card = build_alert_card(
            zone="Pen A / Zone 2",
            thermal_delta_c=1.4,
            coughs_10m=6,
            baseline_coughs_10m=1,
        )
        self.assertEqual(card["severity"], "urgent")
        self.assertEqual(card["symbol"], "!!")
        self.assertEqual(card["label"], "URGENT — inspect Pen A / Zone 2 now")
        self.assertEqual(
            card["spoken"],
            "Urgent health alert. Pen A, Zone 2. Thermal reading is 1.4 degrees Celsius above its zone baseline. Six cough events were detected in ten minutes, compared with a baseline of one. Inspect this zone now.",
        )
        self.assertGreaterEqual(card["contrast_ratio"], 7.0)
        self.assertEqual(card["aria_live"], "assertive")

    def test_watch_alert_is_actionable_without_using_colour_as_the_message(self):
        card = build_alert_card(
            zone="Nursery",
            thermal_delta_c=0.5,
            coughs_10m=3,
            baseline_coughs_10m=2,
        )
        self.assertEqual(card["severity"], "watch")
        self.assertEqual(card["symbol"], "!")
        self.assertEqual(card["label"], "WATCH — recheck Nursery within 30 minutes")
        self.assertIn("Recheck this zone within 30 minutes.", card["spoken"])
        self.assertEqual(card["aria_live"], "polite")

    def test_normal_alert_uses_zone_baseline_and_does_not_overstate_individual_fever(self):
        card = build_alert_card(
            zone="Finisher 1",
            thermal_delta_c=0.2,
            coughs_10m=1,
            baseline_coughs_10m=1,
        )
        self.assertEqual(card["severity"], "normal")
        self.assertEqual(card["symbol"], "OK")
        self.assertIn("zone baseline", card["spoken"])
        self.assertNotIn("individual fever", card["spoken"].lower())
        self.assertEqual(card["aria_live"], "off")

    def test_rejects_unsafe_inputs(self):
        with self.assertRaises(ValueError):
            build_alert_card("", 0.2, 1, 1)
        with self.assertRaises(ValueError):
            build_alert_card("Pen A", -0.1, 1, 1)
        with self.assertRaises(ValueError):
            build_alert_card("Pen A", 0.2, -1, 1)


if __name__ == "__main__":
    unittest.main(verbosity=2)
