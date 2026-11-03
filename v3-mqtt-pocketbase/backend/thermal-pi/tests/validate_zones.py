#!/usr/bin/env python3
"""
End-to-end validation of the zone fever pipeline vs the legacy hotspot scan.

    cd backend/thermal-pi && python3 tests/validate_zones.py

Runs fifteen scenarios through:
  A. the LEGACY path — one scalar: the mean of a 3x3 cluster around the hottest
     pixel, compared against the absolute clinical fever threshold. This is what
     pigpulse_stats.py / mlx_reader.py do today.
  B. the NEW path — drift compensation -> per-pixel rolling baseline ->
     connected-zone deviation -> a three-layer verdict, with the layer that made
     each call recorded in `reason`.

The three layers, and what each one can see that the others cannot:
  1. absolute_floor      peak >= 40.0 C. No history needed, works on frame one.
                         Sees: a severe fever, a pig feverish since power-on.
  2. herd_relative       peak >= median(core temps of the other animals) + 1.5 C.
                         Simultaneous comparison, so no lag. Sees: one pig
                         rising among pennates, even when its absolute
                         temperature stays under 40 C.
  3. temporal_baseline   peak >= that pixel's own rolling median + 1.5 C.
                         Sees: the whole herd rising together, which layer 2 is
                         blind to by construction.

Writes JSON next to this file. All numbers are model-based: the scene is
synthetic (see sim_thermal.py), so these are algorithm-behaviour results — an
upper bound on a clean model, not field accuracy.
"""

from __future__ import annotations

import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
sys.path.insert(0, HERE)

import radiometry as R          # noqa: E402
import sim_thermal as S         # noqa: E402

H, W = R.H, R.W
FEVER_FLOOR = 40.0
ALERT = ("FEVER", "HYPERTHERMIA")


def legacy_scalar(frame: np.ndarray) -> dict:
    """Reproduces the current node's reduction: hottest pixel -> 3x3 mean."""
    f = np.asarray(frame, dtype=np.float64).reshape(H, W)
    r, c = np.unravel_index(int(np.argmax(f)), f.shape)
    r0, r1 = max(0, r - 1), min(H, r + 2)
    c0, c1 = max(0, c - 1), min(W, c + 2)
    return {
        "hotspot": float(f[r0:r1, c0:c1].mean()),
        "max": float(f.max()),
        "center": float(f[11:13, 15:17].mean()),
    }


def run_scenario(name: str, cfg: S.SimConfig, pigs=None,
                 pipe_cfg: R.PipelineConfig | None = None) -> dict:
    sim = S.ThermalSim(cfg, pigs)
    pipe = R.ZoneFeverPipeline(pipe_cfg)

    legacy_alarms, new_alarms = [], []
    hotspot_series, pig_true_series, t_series = [], [], []
    first_new_alert_t, first_legacy_alert_t = None, None
    correct_zone_hits, total_alert_zones = 0, 0
    reasons: dict[str, int] = {}
    animals, cand_px, zoned_px, coverage = 0, 0, 0, None

    truth_fever = [p for p in sim.pigs if p.fever]
    fever_rc = (truth_fever[0].row, truth_fever[0].col) if truth_fever else None

    for frame, true_field, meta in sim.run():
        leg = legacy_scalar(frame)
        out = pipe.update(frame, meta["t_s"], meta["ambientC"])

        if leg["hotspot"] >= FEVER_FLOOR or leg["max"] >= FEVER_FLOOR:
            legacy_alarms.append(meta["t_s"])
            if first_legacy_alert_t is None:
                first_legacy_alert_t = meta["t_s"]

        if out["alerts"]:
            new_alarms.append(meta["t_s"])
            if first_new_alert_t is None:
                first_new_alert_t = meta["t_s"]
            for z in out["zones"]:
                if z["classification"] in ALERT:
                    total_alert_zones += 1
                    rk = z.get("reason", "?")
                    reasons[rk] = reasons.get(rk, 0) + 1
                    if fever_rc and abs(z["peakRow"] - fever_rc[0]) <= 3 \
                            and abs(z["peakCol"] - fever_rc[1]) <= 3:
                        correct_zone_hits += 1

        hotspot_series.append(leg["hotspot"])
        pig_true_series.append(max((p["trueC"] for p in meta["pigs"]),
                                   default=float("nan")))
        t_series.append(meta["t_s"])
        animals = out["animalCount"]
        cand_px, zoned_px = out["candidatePx"], out["zonedPx"]
        coverage = out["pixelCoverage"]

    hotspot_series = np.asarray(hotspot_series)
    pig_true_series = np.asarray(pig_true_series)
    hs_drift = float(hotspot_series.max() - hotspot_series.min())
    pig_drift = float(np.nanmax(pig_true_series) - np.nanmin(pig_true_series))
    warm = np.asarray(t_series) <= 300.0
    warm_hs = float(hotspot_series[warm].max() - hotspot_series[warm].min()) if warm.any() else 0.0

    return {
        "scenario": name,
        "frames": len(t_series),
        "fever_present": bool(truth_fever),
        "legacy_alarm_frames": len(legacy_alarms),
        "new_alarm_frames": len(new_alarms),
        "legacy_first_alarm_s": first_legacy_alert_t,
        "new_first_alarm_s": first_new_alert_t,
        "detection_latency_s": (None if first_new_alert_t is None or not truth_fever
                                else round(first_new_alert_t - cfg.fever_start_s, 1)),
        "legacy_hotspot_span_c": round(hs_drift, 2),
        "true_pig_span_c": round(pig_drift, 2),
        "warmup_hotspot_span_c": round(warm_hs, 2),
        "zone_localisation_accuracy": (None if not total_alert_zones
                                       else round(correct_zone_hits / total_alert_zones, 3)),
        "layers_that_fired": reasons,
        "animal_count": animals,
        "candidate_px": cand_px,
        "zoned_px": zoned_px,
        "pixel_coverage": coverage,
        "final_drift_bias_c": round(pipe.drift.bias_c, 3),
        "baseline_frames": out["baselineFrames"],
        "herd_ref_c": out["herdRefC"],
        "sensor_fault": out.get("sensorFault"),
    }


def herd(spread=0.25, n=4):
    """A pen of n pigs around 38.8 C with per-animal variation."""
    rng = np.random.default_rng(11)
    spots = [(9.0, 7.0), (12.0, 18.0), (16.0, 27.0), (14.0, 9.0), (9.0, 22.0)]
    return [S.PigTruth(f"pig-{i+1:02d}", r, c, 38.8 + float(rng.normal(0, spread)))
            for i, (r, c) in enumerate(spots[:n])]


def febrile(pigs, idx=1):
    pigs[idx].fever = True
    return pigs


def all_febrile(pigs):
    for p in pigs:
        p.fever = True
    return pigs


def main() -> int:
    sc = []

    # ---- 1-8: the operating envelope --------------------------------------
    sc.append(run_scenario(
        "healthy_stable_barn",
        S.SimConfig(frames=90, n_pigs=4, fever_rise_c=0.0, warmup_drift_c=0.0,
                    ambient_swing_c=0.0, noise_sigma_c=0.12),
        herd()))

    sc.append(run_scenario(
        "febrile_pig_clean",
        S.SimConfig(frames=110, n_pigs=4, warmup_drift_c=0.0,
                    ambient_swing_c=0.0, noise_sigma_c=0.12,
                    fever_start_s=100.0, fever_rise_c=2.4),
        febrile(herd())))

    sc.append(run_scenario(
        "ambient_swing_open_air",
        S.SimConfig(frames=90, n_pigs=4, fever_rise_c=0.0, warmup_drift_c=0.0,
                    ambient_swing_c=6.0, ambient_period_s=900.0,
                    noise_sigma_c=0.12),
        herd()))

    sc.append(run_scenario(
        "sensor_warmup_drift",
        S.SimConfig(frames=90, n_pigs=4, fever_rise_c=0.0,
                    warmup_drift_c=2.6, warmup_tau_s=150.0,
                    ambient_swing_c=0.0, noise_sigma_c=0.12),
        herd()))

    sc.append(run_scenario(
        "drift_plus_fever",
        S.SimConfig(frames=110, n_pigs=4, warmup_drift_c=2.6, warmup_tau_s=150.0,
                    ambient_swing_c=0.0, noise_sigma_c=0.12,
                    fever_start_s=100.0, fever_rise_c=2.4),
        febrile(herd())))

    sc.append(run_scenario(
        "static_warm_wall_39c",
        S.SimConfig(frames=90, n_pigs=4, fever_rise_c=0.0, warmup_drift_c=0.0,
                    ambient_swing_c=0.0, noise_sigma_c=0.12, wall_patch_c=39.5,
                    wall_patch_rcwh=(6, 24, 4, 7)),
        herd()))

    sc.append(run_scenario(
        "static_hot_wall_44c",
        S.SimConfig(frames=90, n_pigs=4, fever_rise_c=0.0, warmup_drift_c=0.0,
                    ambient_swing_c=0.0, noise_sigma_c=0.12, wall_patch_c=44.0,
                    wall_patch_rcwh=(6, 24, 4, 7)),
        herd()))

    sc.append(run_scenario(
        "double_emissivity_correction",
        S.SimConfig(frames=90, n_pigs=4, fever_rise_c=0.0, warmup_drift_c=0.0,
                    ambient_swing_c=0.0, noise_sigma_c=0.12,
                    double_correct_emissivity=True),
        herd()))

    # ---- 8: layer 2 alone can make the call -------------------------------
    # A cold barn where 40 C is never reached, and one chronically hot animal.
    # The absolute floor is silent by construction; the temporal baseline is
    # silent because nothing is changing. Only the cross-sectional test sees it.
    cold = [S.PigTruth("pig-01", 9.0, 7.0, 37.3),
            S.PigTruth("pig-02", 12.0, 18.0, 37.4),
            S.PigTruth("pig-03", 16.0, 27.0, 37.2),
            S.PigTruth("pig-04", 14.0, 9.0, 37.5),
            # Chronically hot, not newly hot: 1.6 C above its pennates and
            # nowhere near the 40 C clinical floor. Marked febrile so the
            # localisation metric has a ground-truth animal to aim at, but
            # fever_rise_c is 0 so nothing is rising: the temporal layer is
            # blind by construction and the absolute layer is silent. Only the
            # cross-sectional layer can see this animal.
            S.PigTruth("pig-05", 9.0, 22.0, 38.9, fever=True)]
    sc.append(run_scenario(
        "L2_hot_animal_cold_herd",
        S.SimConfig(frames=90, n_pigs=5, fever_rise_c=0.0, warmup_drift_c=0.0,
                    ambient_swing_c=0.0, noise_sigma_c=0.12),
        cold))

    # ---- 9a: a dense pen — does the census survive merging? ----------------
    # Twenty animals close enough that their fringes merge. Zone count is not an
    # animal count; the local-maxima census must still find them.
    packed = [S.PigTruth(f"pig-{i+1:02d}", 5.0 + 3.0 * (i // 7),
                         3.0 + 4.0 * (i % 7), 38.7)
              for i in range(20)]
    packed[6] = S.PigTruth("pig-07", 5.0, 27.0, 40.6, fever=True)
    sc.append(run_scenario(
        "dense_pen_20_animals",
        S.SimConfig(frames=60, n_pigs=20, warmup_drift_c=0.0,
                    ambient_swing_c=0.0, noise_sigma_c=0.12,
                    fever_start_s=40.0, fever_rise_c=0.8),
        packed))

    # ---- 9b: the oversize drop, and the test that survives it -------------
    # The camera is covered, or looking at a sun-baked surface: every pixel
    # reads 42 C. One component of 768 px, above max_area_px, so extract_zones
    # returns NOTHING — the zone path and every test built on it go silent, and
    # a blind camera reports a calm empty pen. The pixel-level absolute test has
    # no geometry to defeat. pixelCoverage and sensorFault make the difference
    # between "fever" and "this camera is not seeing a pen" observable.
    sc.append(run_scenario(
        "camera_covered_42c",
        S.SimConfig(frames=60, n_pigs=4, fever_rise_c=0.0, warmup_drift_c=0.0,
                    ambient_swing_c=0.0, noise_sigma_c=0.12,
                    wall_patch_c=42.0, wall_patch_rcwh=(0, 0, 24, 32)),
        herd()))

    # ---- 10: layer 3 alone can make the call ------------------------------
    # The whole herd rises together and stays under 40 C. Layer 2 is blind (the
    # median rises with them). A 30 s ramp is far shorter than the 120 s
    # baseline window, so the rolling median is still sitting on pre-fever
    # values when the fever peaks and layer 3 sees the full excursion.
    fast_herd = [S.PigTruth(f"pig-{i+1:02d}", r, c, 37.0)
                 for i, (r, c) in enumerate([(9.0, 7.0), (12.0, 18.0),
                                             (16.0, 27.0), (14.0, 9.0)])]
    sc.append(run_scenario(
        "L3_herd_wide_rise_fast",
        S.SimConfig(frames=110, n_pigs=4, warmup_drift_c=0.0,
                    ambient_swing_c=0.0, noise_sigma_c=0.12, fever_start_s=100.0,
                    fever_rise_c=2.6, fever_ramp_s=30.0),
        all_febrile(fast_herd)))

    # ---- 11/12: the honest gap, and the parameter that closes it ----------
    # Same slow, herd-wide, sub-40 C fever. The only difference is the baseline
    # window: 30 frames (2 min) vs 900 frames (1 h).
    slow_cfg = dict(frames=1500, n_pigs=4, warmup_drift_c=0.0,
                    ambient_swing_c=0.0, noise_sigma_c=0.12,
                    fever_start_s=3600.0, fever_rise_c=2.6, fever_ramp_s=600.0)

    def slow_pigs():
        return [S.PigTruth(f"pig-{i+1:02d}", r, c, 37.0)
                for i, (r, c) in enumerate([(9.0, 7.0), (12.0, 18.0),
                                            (16.0, 27.0), (14.0, 9.0)])]

    sc.append(run_scenario(
        "L3_slow_rise_window_2min",
        S.SimConfig(**slow_cfg), all_febrile(slow_pigs())))

    sc.append(run_scenario(
        "L3_slow_rise_window_1h",
        S.SimConfig(**slow_cfg), all_febrile(slow_pigs()),
        R.PipelineConfig(baseline_window=900, baseline_warmup=30)))

    # ---- 13: the drift compensator's own failure mode ---------------------
    # An open-air ambient swing looks exactly like sensor drift when the
    # reference region sits in that air. Measures how much real scene change the
    # correction absorbs.
    sc.append(run_scenario(
        "ambient_swing_plus_fever",
        S.SimConfig(frames=110, n_pigs=4, warmup_drift_c=0.0,
                    ambient_swing_c=6.0, ambient_period_s=900.0,
                    noise_sigma_c=0.12, fever_start_s=100.0, fever_rise_c=2.4),
        febrile(herd())))

    # ---- report -----------------------------------------------------------
    wt = 27
    print("=" * 128)
    print("ZONE FEVER PIPELINE — END-TO-END SCENARIO MATRIX (synthetic MLX90640 scene)")
    print("=" * 128)
    print(f"{'scenario':<{wt}} {'fever':>5} {'legacy':>7} {'zone':>5} {'lat_s':>6} "
          f"{'legSpan':>8} {'trueSpan':>8} {'loc':>5} {'pigs':>4} {'cov':>5}  "
          f"layers that fired")
    print("-" * 128)
    for s in sc:
        lat = s["detection_latency_s"]
        loc = s["zone_localisation_accuracy"]
        cov = s["pixel_coverage"]
        cov_s = f"{cov:.2f}" if cov is not None else "-"
        layers = ", ".join(f"{k}:{v}" for k, v in sorted(s["layers_that_fired"].items()))
        if not layers and s["sensor_fault"]:
            layers = f"FAULT:{s['sensor_fault']}"
        print(f"{s['scenario']:<{wt}} "
              f"{'yes' if s['fever_present'] else 'no':>5} "
              f"{s['legacy_alarm_frames']:>7} "
              f"{s['new_alarm_frames']:>5} "
              f"{(str(lat) if lat is not None else '-'):>6} "
              f"{s['legacy_hotspot_span_c']:>8.2f} "
              f"{s['true_pig_span_c']:>8.2f} "
              f"{(f'{loc:.2f}' if loc is not None else '-'):>5} "
              f"{s['animal_count']:>4} "
              f"{cov_s:>5}  {layers}")
    print("-" * 128)
    print("legacy/zone = frames raising an alarm.  lat_s = seconds after modelled fever")
    print("onset (negative = the animal was already hot when the run began, so onset is")
    print("not meaningful).  legSpan = how far the legacy hotspot scalar moved over the")
    print("run vs trueSpan = how far the pigs actually moved (C); the gap between them is")
    print("drift the legacy path cannot distinguish from fever.  loc = fraction of alerted")
    print("zones within 3 px of the truly febrile animal.")
    print("pigs = animals found by local maxima in the last frame (zones merge, so zone")
    print("count is NOT an animal count).  cov = fraction of the hot scene the zone layer")
    print("kept; low cov with an alarm means the pixel-level test was the only thing left.")

    out_path = os.path.join(HERE, "validation_results.json")
    with open(out_path, "w") as fh:
        json.dump({"results": sc,
                   "note": "synthetic scene; algorithm behaviour only, not field "
                           "accuracy"}, fh, indent=2)
    print(f"\nwrote {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
