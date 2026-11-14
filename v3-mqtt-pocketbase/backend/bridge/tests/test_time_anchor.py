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
import math
import os
import stat
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

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


class BootScopeTests(unittest.TestCase):
    """Persisted timeline must be scoped to the kernel boot that made it.

    The Pi has no RTC. After a reboot the monotonic clock resets, but when the
    *new* boot has already been up longer than the stored anchor's uptime a
    monotonic-only check (``now_mono < anchor["mono"]``) cannot see it: the old
    implementation silently reuses the dead anchor (projecting fiction) and the
    per-device ledger (reporting fake gaps). These tests pin the boot-identity
    check that closes that hole.

    They must run against the *unmodified* module too, so the boot identity is
    stubbed through ``_default_boot_id`` with ``create=True`` — it exists only
    after the fix, and its absence must not turn the failure into a TypeError.
    """

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
        self.clock.mono += 0.2
        return FakeResponse(TRUTH_DATE)

    @staticmethod
    def boot(name):
        return patch.object(anchor_mod, "_default_boot_id",
                            create=True, return_value=name)

    def read_state(self):
        with open(self.state, encoding="utf-8") as fh:
            return json.load(fh)

    # ── the defect: a new boot that is already up longer ─────────────────
    def test_wrong_boot_with_higher_uptime_does_not_reuse_stale_anchor(self):
        with self.boot("boot-A"):
            a = self.make()
            self.assertTrue(a.refresh())
            a.observe("s3-mic-01")
            a.save()
        stored_mono = self.read_state()["anchor"]["mono"]

        # Boot B: a *new* boot already up far longer than the stored anchor's
        # uptime, so the monotonic value only went up and `_mono_valid` is
        # blind to the reboot.
        self.clock.mono = stored_mono + 500.0
        with self.boot("boot-B"):
            b = self.make()
            b.load()
            self.assertFalse(b.status()["anchored"])       # dead anchor reused?
            self.assertIsNone(b.observe("s3-mic-01")["gap_s"])  # fake gap?

    # ── positive control: same boot still reuses ────────────────────────
    def test_same_boot_restart_still_reuses_the_anchor(self):
        with self.boot("boot-A"):
            a = self.make()
            a.refresh()
            resumed_at = a.now_ms()
        with self.boot("boot-A"):
            b = self.make()
            self.assertTrue(b.load())
            self.assertTrue(b.status()["anchored"])
            self.assertEqual(b.now_ms(), resumed_at)

    # ── unknown / legacy / malformed provenance ─────────────────────────
    def test_absent_boot_identity_is_not_trusted(self):
        with self.boot(None):
            a = self.make()
            a.refresh()
            a.save()
        with self.boot(None):
            b = self.make()
            self.assertFalse(b.load())
            self.assertFalse(b.status()["anchored"])

    def test_legacy_state_without_boot_identity_is_rejected(self):
        legacy = {
            "anchor": {"truth_ms": TRUTH_MS,
                       "mono": self.clock.mono,
                       "source": "http://truth.local:8090/"},
            "devices": {"s3-mic-01": self.clock.mono},
        }
        with open(self.state, "w", encoding="utf-8") as fh:
            json.dump(legacy, fh)
        self.clock.mono += 500.0  # higher uptime than the stored anchor
        with self.boot("boot-A"):
            b = self.make()
            self.assertFalse(b.load())
            self.assertFalse(b.status()["anchored"])
            self.assertIsNone(b.observe("s3-mic-01")["gap_s"])

    def test_malformed_anchor_shape_fails_safe(self):
        for bad in ({"truth_ms": TRUTH_MS},   # missing mono
                    {"mono": 1.0},             # missing truth_ms
                    "not-a-dict"):             # wrong type entirely
            with open(self.state, "w", encoding="utf-8") as fh:
                json.dump({"anchor": bad, "devices": {}}, fh)
            with self.boot("boot-A"):
                a = self.make()
                self.assertFalse(a.load())          # fail safe, never raise
                self.assertFalse(a.status()["anchored"])

    # ── recovery and persistence ────────────────────────────────────────
    def test_wrong_boot_recovers_by_re_anchoring(self):
        with self.boot("boot-A"):
            a = self.make()
            a.refresh()
            a.save()
        self.clock.mono += 500.0
        with self.boot("boot-B"):
            b = self.make()
            b.load()
            self.assertFalse(b.status()["anchored"])
            # Truth host reachable: a fresh anchor restores the timeline.
            self.assertTrue(b.refresh())
            self.assertTrue(b.status()["anchored"])
            # Ledger was cleared, so the first sighting is not a fake gap.
            self.assertIsNone(b.observe("s3-mic-01")["gap_s"])

    def test_boot_identity_is_persisted(self):
        with self.boot("boot-A"):
            a = self.make()
            a.refresh()
        self.assertEqual(self.read_state().get("boot_id"), "boot-A")

    # ── malformed / non-finite persisted state (parent probe cases) ──────
    # `load()` is a startup/reload contract: unless a well-formed, same-boot
    # state is fully adopted, BOTH the anchor and the ledger are cleared and
    # it returns False. A half-adopted file would project fiction.
    def seed(self, state):
        """Write an arbitrary JSON-able state document."""
        with open(self.state, "w", encoding="utf-8") as fh:
            json.dump(state, fh)

    def test_nan_anchor_is_rejected_not_loaded_as_anchored(self):
        self.seed({"boot_id": "boot-A",
                   "anchor": {"truth_ms": float("nan"),
                              "mono": self.clock.mono,
                              "source": "http://truth.local:8090/"},
                   "devices": {}})
        with self.boot("boot-A"):
            b = self.make()
            self.assertFalse(b.load())
            self.assertFalse(b.status()["anchored"])
            self.assertTrue(math.isfinite(b.now_ms()))    # never project NaN
            self.assertIsNone(b.observe("s3-mic-01")["gap_s"])

    def test_infinite_or_negative_anchor_fields_are_rejected(self):
        for bad_truth, bad_mono in ((float("inf"), 1.0),
                                    (float("-inf"), 1.0),
                                    (TRUTH_MS, -1.0),
                                    (TRUTH_MS, float("nan"))):
            self.seed({"boot_id": "boot-A",
                       "anchor": {"truth_ms": bad_truth, "mono": bad_mono},
                       "devices": {}})
            with self.boot("boot-A"):
                b = self.make()
                self.assertFalse(b.load())
                self.assertFalse(b.status()["anchored"])

    def test_non_numeric_ledger_value_is_rejected_not_raised(self):
        self.seed({"boot_id": "boot-A",
                   "anchor": {"truth_ms": TRUTH_MS, "mono": self.clock.mono},
                   "devices": {"s3-mic-01": "500"}})
        with self.boot("boot-A"):
            b = self.make()
            self.assertFalse(b.load())                    # never raises
            self.assertIsNone(b.observe("s3-mic-01")["gap_s"])

    def test_negative_or_non_finite_ledger_value_is_rejected(self):
        for bad in (-5.0, float("nan"), float("inf")):
            self.seed({"boot_id": "boot-A",
                       "anchor": {"truth_ms": TRUTH_MS, "mono": self.clock.mono},
                       "devices": {"s3-mic-01": bad}})
            with self.boot("boot-A"):
                b = self.make()
                self.assertFalse(b.load())

    def test_non_string_or_empty_boot_identity_is_rejected(self):
        for bad_boot in (123, "", ["boot-A"], {"id": "boot-A"}):
            self.seed({"boot_id": bad_boot,
                       "anchor": {"truth_ms": TRUTH_MS, "mono": self.clock.mono},
                       "devices": {}})
            with self.boot("boot-A"):
                b = self.make()
                self.assertFalse(b.load())
                self.assertFalse(b.status()["anchored"])

    def test_empty_boot_identity_on_both_sides_is_rejected(self):
        # Pre-fix, "" == "" looked like a matching boot and reused state.
        with self.boot(""):
            a = self.make()
            a.refresh()
            a.save()
        with self.boot(""):
            b = self.make()
            self.assertFalse(b.load())
            self.assertFalse(b.status()["anchored"])
            self.assertIsNone(b.observe("s3-mic-01")["gap_s"])

    def test_same_boot_monotonic_reset_drops_the_ledger(self):
        # Boot matches and the anchor is well formed, but the stored monotonic
        # is *ahead* of this boot's clock (a reset). The ledger shares that
        # dead timeline, so it must not be restored to invent a gap.
        self.clock.mono = 900.0
        self.seed({"boot_id": "boot-A",
                   "anchor": {"truth_ms": TRUTH_MS, "mono": 1000.0},
                   "devices": {"s3-mic-01": 800.0}})
        with self.boot("boot-A"):
            b = self.make()
            self.assertFalse(b.load())
            self.assertFalse(b.status()["anchored"])
            self.assertIsNone(b.observe("s3-mic-01")["gap_s"])   # not 100

    def test_malformed_json_clears_a_reused_instance(self):
        with self.boot("boot-A"):
            a = self.make()
            a.refresh()
            a.observe("s3-mic-01")
        with open(self.state, "w", encoding="utf-8") as fh:
            fh.write("{ not valid json")
        with self.boot("boot-A"):
            self.assertFalse(a.load())
        self.assertFalse(a.status()["anchored"])
        self.assertIsNone(a.observe("s3-mic-01")["gap_s"])

    def test_non_dict_root_clears_a_reused_instance(self):
        with self.boot("boot-A"):
            a = self.make()
            a.refresh()
            a.observe("s3-mic-01")
        self.seed(["not", "a", "dict"])
        with self.boot("boot-A"):
            self.assertFalse(a.load())
        self.assertFalse(a.status()["anchored"])
        self.assertIsNone(a.observe("s3-mic-01")["gap_s"])

    def test_malformed_state_clears_a_reused_instance(self):
        with self.boot("boot-A"):
            a = self.make()
            a.refresh()
            a.observe("s3-mic-01")
        self.seed({"boot_id": "boot-A",
                   "anchor": {"truth_ms": float("nan"), "mono": 1.0},
                   "devices": {"s3-mic-01": "bad"}})
        with self.boot("boot-A"):
            self.assertFalse(a.load())
        self.assertFalse(a.status()["anchored"])
        self.assertIsNone(a.observe("s3-mic-01")["gap_s"])

    # ── numbers that are mathematically finite but unusable (G1) ─────────
    # A Python int is arbitrary precision, so `10 ** 400` is "finite" — but it
    # cannot become a float, and the projection / ledger arithmetic would then
    # raise OverflowError. Such state is unusable and must be rejected, never
    # allowed to reach the timeline.
    def test_huge_truth_ms_is_rejected_not_overflow(self):
        self.seed({"boot_id": "boot-A",
                   "anchor": {"truth_ms": 10 ** 400, "mono": self.clock.mono},
                   "devices": {}})
        with self.boot("boot-A"):
            b = self.make()
            self.assertFalse(b.load())
            self.assertFalse(b.status()["anchored"])
            self.assertTrue(math.isfinite(b.now_ms()))   # no OverflowError
            self.assertIsNone(b.observe("s3-mic-01")["gap_s"])

    def test_huge_ledger_value_is_rejected_not_overflow(self):
        self.seed({"boot_id": "boot-A",
                   "anchor": {"truth_ms": TRUTH_MS, "mono": self.clock.mono},
                   "devices": {"s3-mic-01": 10 ** 400}})
        with self.boot("boot-A"):
            b = self.make()
            self.assertFalse(b.load())
            self.assertIsNone(b.observe("s3-mic-01")["gap_s"])  # never raises

    def test_huge_mono_is_rejected_not_overflow(self):
        # Both the stored anchor and this boot's clock are huge, so the
        # monotonic-reset check cannot see it: the projection would overflow.
        self.clock.mono = 10 ** 401
        self.seed({"boot_id": "boot-A",
                   "anchor": {"truth_ms": TRUTH_MS, "mono": 10 ** 400},
                   "devices": {}})
        with self.boot("boot-A"):
            b = self.make()
            self.assertFalse(b.load())
            self.assertFalse(b.status()["anchored"])
            self.assertTrue(math.isfinite(b.now_ms()))   # no OverflowError

    # ── bounded derived arithmetic on upper finite floats ────────────────
    # Finite fields are not sufficient: a well-formed anchor can still project
    # to a non-finite value. The stamp must stay finite and fail safe rather
    # than emit inf or raise.
    def test_upper_finite_anchor_projection_stays_finite(self):
        self.clock.mono = 1e306
        self.seed({"boot_id": "boot-A",
                   "anchor": {"truth_ms": 1e308, "mono": 0.0},
                   "devices": {}})
        with self.boot("boot-A"):
            b = self.make()
            self.assertTrue(b.load())                    # well-formed floats
            self.assertTrue(math.isfinite(b.now_ms()))   # no inf / OverflowError
            self.assertFalse(b.status()["anchored"])     # unusable -> dropped

    # ── a legitimate null anchor must clear a stale in-memory anchor (G2) ─
    def test_valid_null_anchor_reload_clears_stale_anchor_on_same_instance(self):
        # A well-formed same-boot document that legitimately carries no anchor
        # (fresh boot, ledger only) must be adopted: the *same* instance drops
        # its stale anchor and source instead of keeping the old timeline.
        with self.boot("boot-A"):
            a = self.make()
            a.refresh()
            a.observe("s3-mic-01")
            self.assertTrue(a.status()["anchored"])
            self.seed({"boot_id": "boot-A", "anchor": None,
                       "devices": {"s3-mic-02": self.clock.mono}})
            self.assertTrue(a.load())                    # valid state adopted
            self.assertFalse(a.status()["anchored"])     # stale anchor gone
            self.assertIsNone(a.status()["source"])
            # Ledger replaced: the old device is gone, not a ghost gap.
            self.assertIsNone(a.observe("s3-mic-01")["gap_s"])


if __name__ == "__main__":
    unittest.main()
