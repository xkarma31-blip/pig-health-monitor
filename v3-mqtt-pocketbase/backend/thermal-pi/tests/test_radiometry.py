#!/usr/bin/env python3
"""
Unit tests for radiometry.py. Stdlib unittest + NumPy only.

    cd backend/thermal-pi && python3 -m unittest discover -s tests -v
    # or
    python3 backend/thermal-pi/tests/test_radiometry.py
"""

from __future__ import annotations

import math
import os
import sys
import unittest

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
sys.path.insert(0, HERE)

import radiometry as R          # noqa: E402
import sim_thermal as S         # noqa: E402


class TestRadiometricInversion(unittest.TestCase):

    def test_forward_inverse_round_trip(self):
        """The inverse must recover the object temperature for a range of
        operating points — this is what makes the correction trustworthy."""
        for eps in (1.0, 0.98, 0.95, 0.90):
            for t_refl in (10.0, 25.0, 35.0, 50.0):
                for t_obj in (30.0, 36.0, 38.5, 41.0, 45.0):
                    meas = R.blackbody_equivalent(t_obj, eps, t_refl)
                    back = float(R.true_temperature(meas, eps, t_refl, "full"))
                    self.assertAlmostEqual(back, t_obj, places=6,
                                           msg=f"eps={eps} refl={t_refl} obj={t_obj}")

    def test_kelvin_division_is_the_zero_background_case(self):
        """T/eps^0.25 is not a different correction — it is the full equation
        evaluated at T_refl = 0 K. Proves the shortcut is a special case."""
        eps, t_meas = 0.978, 38.5
        shortcut = float(R.true_temperature(t_meas, eps, -273.15, "kelvin_div"))
        at_zero = float(R.true_temperature(t_meas, eps, -273.15, "full"))
        self.assertAlmostEqual(shortcut, at_zero, places=9)

    def test_emissivity_of_one_needs_no_correction(self):
        for mode in ("full", "kelvin_div", "celsius_div"):
            self.assertAlmostEqual(
                float(R.true_temperature(38.5, 1.0, 30.0, mode)), 38.5, places=9,
                msg=mode)

    def test_reflected_temperature_pushes_the_answer_down(self):
        """A hot surround inflates what the camera sees, so the true object
        temperature is LOWER than the reading — the opposite of the naive
        emissivity shortcut, which only ever pushes up."""
        t_meas, eps = 38.5, 0.978
        cold = float(R.true_temperature(t_meas, eps, 0.0, "full"))
        hot = float(R.true_temperature(t_meas, eps, 55.0, "full"))
        self.assertLess(hot, cold)
        self.assertLess(hot, t_meas)

    def test_clamped_input_never_returns_nan(self):
        """Degenerate input (reading below the reflected floor) must clamp, not
        produce NaN or a complex number mid-pipeline."""
        out = R.true_temperature(-10.0, 0.90, 80.0, "full")
        self.assertTrue(np.isfinite(out))


class TestAuditRegression(unittest.TestCase):
    """Locks in the 2026-11-02 source-audit numbers and settles defect #2."""

    def test_audit_three_modes_at_eps_0978(self):
        d = R.emissivity_diagnostic(38.5, 0.978, 30.0)
        # The legacy code path, exactly as the audit reproduced it.
        self.assertAlmostEqual(d["celsius_div_delta_c"], 0.215, places=2)
        # The audit's recommended "fix".
        self.assertAlmostEqual(d["kelvin_div_delta_c"], 1.74, places=2)
        # The physically complete equation, which neither of them is.
        self.assertTrue(0.10 < d["full_delta_c"] < 0.30, d["full_delta_c"])

    def test_the_audits_recommended_fix_is_wrong_by_an_order_of_magnitude(self):
        d = R.emissivity_diagnostic(38.5, 0.978, 30.0)
        self.assertGreater(abs(d["kelvin_div_delta_c"]), 6.0 * abs(d["full_delta_c"]))
        # i.e. the "correction" is ~10x the real correction, and ~4x the whole
        # 1.5 C fever band.

    def test_double_correction_at_the_configured_emissivity_is_catastrophic(self):
        """mlx_reader.py already hands emissivity to the driver. Redoing it in
        Python would add this much bias."""
        err = R.double_correction_error_c(38.5, 0.95, 30.0)
        self.assertGreater(err, 2.0)
        self.assertLess(err, 6.0)


class TestOptics(unittest.TestCase):

    def test_d110_pixel_footprint_matches_the_source_audit(self):
        """CANON said '6x5 cm at 2 m'; the audit corrected it to 17.9x12.8 cm
        for the specified 110-degree part. Pin the corrected value."""
        px_w, px_h = R.pixel_footprint_m(2.0, 110.0, 75.0)
        self.assertAlmostEqual(px_w * 100.0, 17.85, places=1)
        self.assertAlmostEqual(px_h * 100.0, 12.79, places=1)

    def test_d55_pixel_footprint_is_the_source_of_the_old_6x5_cm_claim(self):
        px_w, px_h = R.pixel_footprint_m(2.0, 55.0, 35.0)
        self.assertAlmostEqual(px_w * 100.0, 6.51, places=1)
        self.assertAlmostEqual(px_h * 100.0, 5.25, places=1)


class TestZoneSegmentation(unittest.TestCase):

    def test_two_disjoint_blobs_give_two_labels(self):
        m = np.zeros((R.H, R.W), dtype=bool)
        m[5:8, 5:8] = True
        m[15:18, 25:28] = True
        lab = R.label_zones(m)
        self.assertEqual(len(np.unique(lab[lab > 0])), 2)

    @staticmethod
    def _n_zones(mask):
        lab = R.label_zones(mask)
        return len(np.unique(lab[lab > 0]))

    def test_touching_edge_on_is_one_zone(self):
        m = np.zeros((R.H, R.W), dtype=bool)
        m[5, 5] = True
        m[5, 6] = True
        self.assertEqual(self._n_zones(m), 1)

    def test_diagonal_touch_is_not_one_zone(self):
        """4-connectivity: two pixels meeting only at a corner stay separate, so
        a diagonal chain of noise cannot merge into one phantom zone."""
        m = np.zeros((R.H, R.W), dtype=bool)
        m[5, 5] = True
        m[6, 6] = True
        self.assertEqual(self._n_zones(m), 2)

    def test_ring_around_a_hole_is_one_zone(self):
        """A hollow blob must count once, not once per boundary pixel."""
        m = np.zeros((R.H, R.W), dtype=bool)
        m[10:15, 10:15] = True
        m[11:14, 11:14] = False
        self.assertEqual(self._n_zones(m), 1)

    def test_min_area_filter_kills_single_pixel_spikes(self):
        field = np.full((R.H, R.W), 30.0)
        field[10, 10] = 45.0          # 1 dead-hot pixel: a spike, not a pig
        self.assertEqual(len(R.extract_zones(field, 40.0, min_area_px=6)), 0)
        field[10:13, 10:13] = 41.0    # 9-pixel blob: plausible
        zs = R.extract_zones(field, 40.0, min_area_px=6)
        self.assertEqual(len(zs), 1)
        self.assertEqual(zs[0]["areaPx"], 9)

    def test_roi_excludes_the_wall(self):
        field = np.full((R.H, R.W), 30.0)
        field[0:3, 5:9] = 48.0        # hot wall in the excluded top rows
        roi = np.ones((R.H, R.W), dtype=bool)
        roi[:4, :] = False
        self.assertEqual(len(R.extract_zones(field, 40.0, roi=roi)), 0)

    def test_span_is_reported_in_centimetres_at_the_configured_distance(self):
        field = np.full((R.H, R.W), 30.0)
        field[10:12, 10:14] = 41.0    # 2 rows x 4 cols
        z = R.extract_zones(field, 40.0, min_area_px=4, distance_m=2.0)[0]
        px_w, px_h = R.pixel_footprint_m(2.0, 110.0, 75.0)
        self.assertAlmostEqual(z["spanWidthCm"], round(4 * px_w * 100, 2), places=2)
        self.assertAlmostEqual(z["spanHeightCm"], round(2 * px_h * 100, 2), places=2)


class TestDriftCompensation(unittest.TestCase):

    def test_uniform_drift_is_removed(self):
        """A known reference temperature lets the correction be exact and
        immediate (alpha=1)."""
        comp = R.ReferenceDriftCompensator(ref_true_c=30.0, alpha=1.0)
        field_true = np.full((R.H, R.W), 30.0)
        frame = field_true + 2.0                 # +2 C self-heating
        out, info = comp.update(frame, 10.0)
        residual = float(np.abs(out - field_true).max())
        self.assertLess(residual, 0.05, f"residual {residual}")
        self.assertAlmostEqual(info["driftBiasC"], 2.0, places=2)

    def test_smoothed_correction_converges(self):
        """With smoothing the estimate must reach the true bias within a few
        frames instead of chasing per-frame thermopile noise."""
        comp = R.ReferenceDriftCompensator(ref_true_c=30.0, alpha=0.5)
        field_true = np.full((R.H, R.W), 30.0)
        out = field_true
        info = {}
        for _ in range(12):
            out, info = comp.update(field_true + 2.0, 0.0)
        self.assertLess(float(np.abs(out - field_true).max()), 0.01)
        self.assertAlmostEqual(info["driftBiasC"], 2.0, places=2)

    def test_frozen_mode_needs_calibration_then_tracks(self):
        comp = R.ReferenceDriftCompensator(ref_true_c=None, calib_frames=4, alpha=0.5)
        info = {}
        for _ in range(4):
            _, info = comp.update(np.full((R.H, R.W), 30.0), 0.0)
        self.assertFalse(info["driftReady"])
        out, info = comp.update(np.full((R.H, R.W), 32.0), 4.0)
        self.assertTrue(info["driftReady"])
        self.assertLess(float(np.abs(out - 30.0).max()), 1.5)

    def test_median_reference_ignores_a_passing_pig(self):
        """A pig crossing the reference region must not lurch the correction:
        that is why the reference statistic is a median, not a mean."""
        comp = R.ReferenceDriftCompensator(ref_true_c=30.0, alpha=1.0)
        frame = np.full((R.H, R.W), 30.0)
        frame[0:2, 10:20] = 39.5                 # pig walks through the top rows
        _, info = comp.update(frame, 0.0)
        self.assertLess(abs(info["driftBiasC"]), 0.01)

    def test_settling_model_recovers_known_constants(self):
        m = R.ShutterSettlingModel()
        t = np.linspace(0, 900, 200)
        A_true, tau_true = 2.4, 140.0
        d = A_true * (1.0 - np.exp(-t / tau_true))
        m.fit(t.tolist(), d.tolist())
        self.assertTrue(m.fitted)
        self.assertAlmostEqual(m.A, A_true, places=1)
        self.assertGreater(m.r2, 0.99)


class TestBaseline(unittest.TestCase):

    def test_static_hot_object_is_absorbed_by_the_baseline(self):
        """Honest trade-off, asserted rather than hidden: a static warm region
        becomes the new normal. That is why the pipeline also keeps an absolute
        fever floor — a feverish zone must not be able to learn itself away."""
        bl = R.PixelBaseline(window=12, warmup=6)
        for _ in range(12):
            f = np.full((R.H, R.W), 30.0)
            f[10:13, 10:13] = 39.0
            bl.push(f)
        base = bl.baseline()
        self.assertIsNotNone(base)
        self.assertAlmostEqual(float(base[11, 11]), 39.0, places=3)
        self.assertAlmostEqual(float(base[11, 11] - base[5, 5]), 9.0, places=3)

    def test_median_baseline_resists_a_part_time_occupant(self):
        bl = R.PixelBaseline(window=10, warmup=5)
        for i in range(10):
            f = np.full((R.H, R.W), 30.0)
            if i % 3 == 0:
                f[10, 10] = 40.0      # present 1/3 of the window only
            bl.push(f)
        b = bl.baseline()
        self.assertIsNotNone(b)
        self.assertLess(abs(float(b[10, 10]) - 30.0), 0.6)


class TestPipelineContract(unittest.TestCase):

    def test_python_side_emissivity_correction_is_refused(self):
        cfg = R.PipelineConfig(eps_here=0.95)
        with self.assertRaises(ValueError) as ctx:
            R.ZoneFeverPipeline(cfg)
        self.assertIn("double", str(ctx.exception).lower())

    def test_driver_round_trip_is_identity_so_python_must_not_repeat_it(self):
        """The simulator's forward+inverse pair must cancel to machine
        precision. If the driver already inverted the equation, a Python
        correction has nothing left to fix."""
        sim = S.ThermalSim(S.SimConfig(noise_sigma_c=0.0, dead_pixels=0,
                                       warmup_drift_c=0.0, ambient_swing_c=0.0))
        delivered, true, _ = sim.frame(0.0)
        err = float(np.abs(delivered.reshape(R.H, R.W) - true).max())
        self.assertLess(err, 1e-6, f"driver round-trip error {err}")

    def test_payload_is_a_superset_of_the_live_telemetry_schema(self):
        """Dropping this into thermal_publish.py must not break the app."""
        legacy = {"deviceId", "timestamp", "pigId", "bodyTemp", "temperature",
                  "center", "hotspot", "max", "min", "ambient", "status",
                  "alerts", "verdict"}
        sim = S.ThermalSim(S.SimConfig(frames=20))
        pipe = R.ZoneFeverPipeline()
        for frame, _, meta in sim.run():
            out = pipe.update(frame, meta["t_s"], meta["ambientC"])
        tel = R.to_telemetry_payload(out, "pi-thermal-01")
        self.assertTrue(legacy.issubset(set(tel)), legacy - set(tel))
        self.assertIn("zones", tel)


class TestFeverDetectionEndToEnd(unittest.TestCase):

    def _run(self, cfg: S.SimConfig, pigs=None):
        sim = S.ThermalSim(cfg, pigs)
        pipe = R.ZoneFeverPipeline()
        rows = []
        for frame, true, meta in sim.run():
            rows.append((meta, pipe.update(frame, meta["t_s"], meta["ambientC"])))
        return sim, pipe, rows

    def test_injected_fever_is_detected(self):
        cfg = S.SimConfig(frames=110, n_pigs=3, noise_sigma_c=0.12,
                          ambient_swing_c=0.0, warmup_drift_c=0.0,
                          fever_start_s=100.0, fever_rise_c=2.4)
        pigs = [
            S.PigTruth("pig-01", 9.0, 7.0, 38.8),
            S.PigTruth("pig-02", 12.0, 18.0, 38.9, fever=True),
            S.PigTruth("pig-03", 16.0, 27.0, 38.7),
        ]
        _, _, rows = self._run(cfg, pigs)
        late = [p for m, p in rows if m["t_s"] >= 400.0]
        self.assertTrue(late, "no frames past t=400 s")
        flagged = [p for p in late if p["alerts"] & 0x01]
        self.assertGreater(len(flagged), 0, "fever never detected")
        worst = max(late, key=lambda p: p["center"])
        self.assertGreater(worst["center"], 40.5)
        # and the detected zone must be near the feverish pig, not a random spot
        z = worst["zones"][0]
        self.assertLess(abs(z["peakRow"] - 12), 3)
        self.assertLess(abs(z["peakCol"] - 18), 3)

    def test_healthy_pen_on_a_cool_morning_is_silent(self):
        cfg = S.SimConfig(frames=90, n_pigs=3, fever_rise_c=0.0,
                          ambient_start_c=24.0, ambient_swing_c=0.0,
                          warmup_drift_c=0.0, noise_sigma_c=0.12)
        _, _, rows = self._run(cfg)
        alarms = [p for _, p in rows if p["alerts"]]
        self.assertEqual(len(alarms), 0, f"{len(alarms)} false alarms")

    def test_ambient_swing_alone_does_not_raise_an_alarm(self):
        """The open-air case: 6 C swing over 15 minutes, every pig healthy."""
        cfg = S.SimConfig(frames=90, n_pigs=3, fever_rise_c=0.0,
                          ambient_swing_c=6.0, ambient_period_s=900.0,
                          warmup_drift_c=0.0, noise_sigma_c=0.12,
                          pig_ambient_slope=0.0)
        _, _, rows = self._run(cfg)
        alarms = [p for _, p in rows if p["alerts"]]
        self.assertEqual(len(alarms), 0, f"{len(alarms)} false alarms")


if __name__ == "__main__":
    unittest.main(verbosity=2)
