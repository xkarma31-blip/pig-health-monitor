"""Behavioral tests for the PigPulse bounded alert-budget monitor."""

from __future__ import annotations

import math
import unittest

from pigpulse_alert_budget import AlertBudgetMonitor


class AlertBudgetMonitorTests(unittest.TestCase):
    def test_classifies_healthy_watch_and_urgent_windows(self) -> None:
        monitor = AlertBudgetMonitor(window_size=4, fever_threshold_c=39.5, watch_ratio=0.5, urgent_ratio=0.75)

        for reading in (38.8, 39.5, 39.7, 38.9):
            monitor.add(reading)
        self.assertEqual(monitor.snapshot().level, "WATCH")

        monitor.add(40.0)
        self.assertEqual(monitor.snapshot().level, "URGENT")

    def test_eviction_can_deescalate_an_alert(self) -> None:
        monitor = AlertBudgetMonitor(window_size=3, fever_threshold_c=39.5, watch_ratio=1 / 3, urgent_ratio=2 / 3)
        for reading in (40.0, 40.1, 38.7):
            monitor.add(reading)
        self.assertEqual(monitor.snapshot().level, "URGENT")

        monitor.add(38.8)
        snapshot = monitor.snapshot()
        self.assertEqual(snapshot.fever_samples, 1)
        self.assertEqual(snapshot.level, "WATCH")

    def test_snapshot_exposes_constant_time_statistics(self) -> None:
        monitor = AlertBudgetMonitor(window_size=4, fever_threshold_c=39.5)
        for reading in (38.0, 40.0, 39.5, 41.0):
            monitor.add(reading)

        snapshot = monitor.snapshot()
        self.assertEqual(snapshot.sample_count, 4)
        self.assertEqual(snapshot.minimum_c, 38.0)
        self.assertEqual(snapshot.maximum_c, 41.0)
        self.assertAlmostEqual(snapshot.mean_c, 39.625)
        self.assertEqual(snapshot.fever_samples, 3)
        self.assertAlmostEqual(snapshot.fever_ratio, 0.75)

    def test_rejects_invalid_configuration_and_samples(self) -> None:
        for kwargs in (
            {"window_size": 0},
            {"window_size": True},
            {"window_size": 2, "watch_ratio": 0.8, "urgent_ratio": 0.7},
            {"window_size": 2, "watch_ratio": -0.1},
            {"window_size": 2, "urgent_ratio": 1.1},
        ):
            with self.subTest(kwargs=kwargs), self.assertRaises(ValueError):
                AlertBudgetMonitor(**kwargs)

        monitor = AlertBudgetMonitor(window_size=2)
        for reading in (math.nan, math.inf, -math.inf):
            with self.subTest(reading=reading), self.assertRaises(ValueError):
                monitor.add(reading)


if __name__ == "__main__":
    unittest.main()
