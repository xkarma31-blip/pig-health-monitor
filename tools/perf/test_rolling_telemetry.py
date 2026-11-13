"""Tests for the bounded O(1) PigPulse telemetry aggregator."""

from __future__ import annotations

import math
import unittest

from rolling_telemetry import RollingTelemetry


class RollingTelemetryTests(unittest.TestCase):
    def test_window_evicts_oldest_and_updates_mean(self) -> None:
        stream = RollingTelemetry(window_size=3, fever_threshold_c=39.5)
        for value in (38.0, 39.0, 40.0, 41.0):
            stream.add(value)

        snapshot = stream.snapshot()

        self.assertEqual(snapshot.sample_count, 3)
        self.assertEqual(snapshot.minimum_c, 39.0)
        self.assertEqual(snapshot.maximum_c, 41.0)
        self.assertAlmostEqual(snapshot.mean_c, 40.0)

    def test_fever_count_tracks_eviction(self) -> None:
        stream = RollingTelemetry(window_size=3, fever_threshold_c=39.5)
        for value in (40.0, 38.0, 40.0, 38.0):
            stream.add(value)

        snapshot = stream.snapshot()

        self.assertEqual(snapshot.fever_samples, 1)
        self.assertAlmostEqual(snapshot.fever_ratio, 1 / 3)

    def test_rejects_invalid_window_and_sample_values(self) -> None:
        for window_size in (0, -1, 2.5, math.inf, True):
            with self.subTest(window_size=window_size), self.assertRaises(ValueError):
                RollingTelemetry(window_size=window_size)

        stream = RollingTelemetry(window_size=2)
        for value in (math.nan, math.inf, -math.inf):
            with self.subTest(value=value), self.assertRaises(ValueError):
                stream.add(value)

    def test_counts_threshold_equality_as_fever(self) -> None:
        stream = RollingTelemetry(window_size=1, fever_threshold_c=39.5)
        stream.add(39.5)

        self.assertEqual(stream.snapshot().fever_samples, 1)

    def test_repeated_extrema_survive_one_expiry(self) -> None:
        stream = RollingTelemetry(window_size=3)
        for value in (40.0, 38.0, 38.0, 39.0):
            stream.add(value)

        snapshot = stream.snapshot()
        self.assertEqual(snapshot.minimum_c, 38.0)
        self.assertEqual(snapshot.maximum_c, 39.0)

    def test_empty_snapshot_has_no_mean(self) -> None:
        snapshot = RollingTelemetry(window_size=2).snapshot()

        self.assertEqual(snapshot.sample_count, 0)
        self.assertIsNone(snapshot.mean_c)
        self.assertEqual(snapshot.fever_ratio, 0.0)


if __name__ == "__main__":
    unittest.main()
