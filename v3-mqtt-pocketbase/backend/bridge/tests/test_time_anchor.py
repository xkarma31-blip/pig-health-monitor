"""Regression coverage for the laptop-anchored timeline (stdlib only).

The Pi has no RTC. Its wall clock has jumped by days (the 2026-11-02
systemd-timesyncd step), so a stamp taken from the Pi clock is not a fact
about when a sample was produced. These tests pin the behaviour that makes
the timeline trustworthy:

  * the truth host (the NTP-synced laptop) sets the anchor,
  * the monotonic clock carries the timeline forward from there,
  * a wall-clock step on the Pi changes nothing,
  * a reboot (monotonic reset) invalidates the anchor instead of silently
    extrapolating from a dead monotonic clock.
"""
import importlib.util
import json
import os
import stat
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "time_anchor", Path(__file__).resolve().parents[1] / "time_anchor.py")
anchor_mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(anchor_mod)
TimeAnchor = anchor_mod.TimeAnchor


class FakeResponse:
    """Minimal stand-in for a requests.Response: only .headers matters."""

    def __init__(self, date_header):
        self.headers = {"Date": date_header} if date_header else {}


class Clock:
    """Injectable wall + monotonic clock."""

    def __init__(self, wall=1_793_684_000.0, mono=1000.0):
        self.wall = wall
        self.mono = mono

    def wall_time(self):
        return self.wall

    def monotonic(self):
        return self.mono


# 2026-11-03T04:59:13Z
TRUTH_DATE = "Tue, 03 Nov 2026 04:59:13 GMT"
TRUTH_MS = 1_793_681_953_000


class TimeAnchorTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.state = os.path.join(self.tmp.name, "anchor.json")
        self.clock = Clock()

    def tearDown(self):
        self.tmp.cleanup()

    def make(self, **kwargs):
        opts = dict(
            state_path=self.state,
            truth_urls=("http://truth.local:8090/",),
            http_get=self.fake_get,
            wall=self.clock.wall_time,
            mono=self.clock.monotonic,
            gap_threshold_s=120.0,
        )
        opts.update(kwargs)
        return TimeAnchor(**opts)

    def fake_get(self, url, timeout=2.0):
        # 200 ms round trip, burned across the monotonic clock.
        self.clock.mono += 0.2
        return FakeResponse(TRUTH_DATE)

    # ── anchoring ────────────────────────────────────────────────────────
    def test_anchor_comes_from_the_truth_host_not_the_local_clock(self):
        a = self.make()
        self.assertTrue(a.refresh())
        self.assertTrue(a.status()["anchored"])
        self.assertEqual(a.status()["source"], "http://truth.local:8090/")

    def test_unanchored_anchor_falls_back_to_the_local_wall_clock(self):
        a = self.make(truth_urls=())
        stamp = a.now_ms()
        self.assertAlmostEqual(stamp / 1000.0, self.clock.wall, delta=0.01)
        self.assertFalse(a.status()["anchored"])

    def test_failed_refresh_keeps_the_previous_anchor(self):
        a = self.make()
        a.refresh()
        before = a.now_ms()

        def boom(url, timeout=2.0):
            raise OSError("network down")

        a.http_get = boom
        self.clock.mono += 5.0
        self.assertFalse(a.refresh())
        # Still anchored, still moving forward on the monotonic clock.
        self.assertTrue(a.status()["anchored"])
        self.assertGreaterEqual(a.now_ms(), before)

    # ── wall-clock immunity ──────────────────────────────────────────────
    def test_wall_clock_step_does_not_move_the_timeline(self):
        a = self.make()
        a.refresh()
        first = a.now_ms()
        # The Pi clock jumps forward 32.8 days (the timesyncd step).
        self.clock.wall += 32.827844 * 86400
        self.clock.mono += 2.0
        second = a.now_ms()
        self.assertAlmostEqual((second - first) / 1000.0, 2.0, delta=0.2)

    def test_wall_clock_step_backwards_does_not_move_the_timeline(self):
        a = self.make()
        a.refresh()
        first = a.now_ms()
        self.clock.wall -= 86400
        self.clock.mono += 1.0
        self.assertAlmostEqual((a.now_ms() - first) / 1000.0, 1.0, delta=0.2)

    def test_timestamps_never_go_backwards(self):
        a = self.make()
        a.refresh()
        first = a.now_ms()
        # The truth host itself steps backwards (NTP correction).
        self.clock.mono += 1.0
        a.http_get = lambda url, timeout=2.0: FakeResponse(
            "Tue, 03 Nov 2026 04:00:00 GMT")
        a.refresh(force=True)
        self.assertGreaterEqual(a.now_ms(), first)

    # ── reboot handling ──────────────────────────────────────────────────
    def test_reboot_invalidates_the_anchor_instead_of_extrapolating(self):
        a = self.make()
        a.refresh()
        # Reboot: monotonic restarts near zero while the wall clock is still
        # whatever the (wrong) Pi clock says.
        self.clock.mono = 3.0
        self.assertFalse(a.status()["anchored"])
        stamp = a.now_ms()
        self.assertAlmostEqual(stamp / 1000.0, self.clock.wall, delta=0.01)

    def test_state_survives_a_restart(self):
        a = self.make()
        a.refresh()
        with open(self.state) as fh:
            state = json.load(fh)
        self.assertIn("anchor", state)
        self.assertEqual(state["anchor"]["source"], "http://truth.local:8090/")

        # New process, monotonic continued (no reboot): the anchor is reused
        # and the new instance projects exactly where the old one left off —
        # same anchor, same clock, so the two must agree to the millisecond
        # before the clock advances, then advance by exactly the elapsed 3 s.
        b = self.make()
        b.load()
        self.assertTrue(b.status()["anchored"])
        resumed = b.now_ms()
        self.assertEqual(resumed, a.now_ms())
        self.clock.mono += 3.0
        self.assertAlmostEqual((b.now_ms() - resumed) / 1000.0, 3.0, delta=0.2)

    def test_state_file_is_private(self):
        a = self.make()
        a.refresh()
        mode = stat.S_IMODE(os.stat(self.state).st_mode)
        self.assertEqual(mode, 0o600)

    # ── per-device ledger ────────────────────────────────────────────────
    def test_ledger_tracks_gaps_per_device(self):
        a = self.make()
        a.refresh()
        first = a.observe("s3-mic-01")
        self.assertIsNone(first["gap_s"])
        self.assertFalse(first["is_gap"])

        self.clock.mono += 300.0
        gap = a.observe("s3-mic-01")
        self.assertAlmostEqual(gap["gap_s"], 300.0, delta=1.0)
        self.assertTrue(gap["is_gap"])

        # A different device has its own timeline.
        other = a.observe("pi-thermal-01")
        self.assertIsNone(other["gap_s"])

    def test_short_intervals_are_not_reported_as_gaps(self):
        a = self.make()
        a.refresh()
        a.observe("s3-mic-01")
        self.clock.mono += 5.0
        self.assertFalse(a.observe("s3-mic-01")["is_gap"])

    def test_ledger_is_persisted(self):
        a = self.make()
        a.refresh()
        a.observe("s3-mic-01")
        a.save()
        with open(self.state) as fh:
            state = json.load(fh)
        self.assertIn("s3-mic-01", state["devices"])


if __name__ == "__main__":
    unittest.main()
