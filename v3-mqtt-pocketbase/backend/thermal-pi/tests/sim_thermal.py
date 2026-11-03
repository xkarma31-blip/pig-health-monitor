#!/usr/bin/env python3
"""
Synthetic MLX90640 scene generator for the PigPulse thermal pipeline.

Honest scope
------------
This validates ALGORITHM behaviour — radiometric inversion, drift removal,
baseline logic, zone segmentation, latency — against a scene whose ground truth
is known exactly. It does NOT validate real-world accuracy: real pigs, real
barn, real sensor noise are all absent. Any accuracy number produced from this
simulator is an upper bound on a clean model, not a field result.

The chain modelled, in the order the real node applies it:

    true object field (C)
      -> forward radiometry   T_meas = [eps*T_obj^4 + (1-eps)*T_refl^4]^(1/4)
      -> driver inverse       MLX90640 do_compensation(emissivity=eps)
      -> sensor self-heating drift (exponential settling + spatial component)
      -> pixel noise + dead pixels
      = the 768-float frame Python actually receives

The forward and inverse steps cancel to machine precision (that cancellation is
itself asserted in the test suite), which is precisely why the Python layer must
not apply a second emissivity correction.
"""

from __future__ import annotations

import math
import os
import sys
from dataclasses import dataclass, field as dc_field
from typing import Iterator, Optional

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import radiometry as R  # noqa: E402

H, W, N = R.H, R.W, R.N


@dataclass
class PigTruth:
    pig_id: str
    row: float
    col: float
    surface_c: float
    radius_px: float = 2.4
    fever: bool = False


@dataclass
class SimConfig:
    seed: int = 7
    n_pigs: int = 4
    frames: int = 120
    dt_s: float = 4.0                 # matches the node's 4 Hz / averaged cadence
    # environment
    ambient_start_c: float = 26.0
    ambient_swing_c: float = 6.0      # +/- amplitude
    ambient_period_s: float = 900.0
    ambient_trend_c_per_s: float = 0.0
    solar_period_s: float = 900.0     # extra spike for the open-air case
    solar_gain_c: float = 0.0
    # pigs
    normal_c: float = 38.9
    fever_rise_c: float = 2.6
    fever_start_s: float = 200.0
    fever_ramp_s: float = 240.0       # how long the fever takes to fully develop
    pig_ambient_slope: float = 0.15   # C pig surface per C ambient (Jia r=0.26)
    # sensor
    emissivity: float = 0.95          # config.EMISSIVITY, owned by the driver
    ta_shift_c: float = 8.0           # config.TA_SHIFT
    warmup_drift_c: float = 2.6       # Jiao 2022: >2 C in the first minutes
    warmup_tau_s: float = 150.0
    drift_spatial_nonuniformity: float = 0.15
    noise_sigma_c: float = 0.15
    dead_pixels: int = 6
    bad_pixel_value_c: float = -40.0
    # scene props
    wall_patch_c: Optional[float] = None    # static hot object (sun-baked wall)
    wall_patch_rcwh: tuple = (2, 24, 4, 8)  # row, col, h, w
    # fault injection
    double_correct_emissivity: bool = False


class ThermalSim:
    """Deterministic, seekable thermal scene."""

    def __init__(self, cfg: Optional[SimConfig] = None,
                 pigs: Optional[list[PigTruth]] = None):
        self.cfg = cfg or SimConfig()
        self.rng = np.random.default_rng(self.cfg.seed)
        self.pigs = pigs if pigs is not None else self._default_pigs()
        self._rr, self._cc = np.mgrid[0:H, 0:W].astype(np.float64)
        self._dead = self._pick_dead_pixels()
        self.drift_history: list[tuple[float, float]] = []

    # -- scene construction -------------------------------------------------
    def _default_pigs(self) -> list[PigTruth]:
        rng = np.random.default_rng(self.cfg.seed + 1)
        out = []
        # Keep the pen in the lower 2/3 of the frame; the top rows are wall and
        # are deliberately outside the pipeline's ROI.
        slots = [(8, 6), (10, 15), (14, 9), (16, 22), (12, 26), (17, 4)]
        for i in range(min(self.cfg.n_pigs, len(slots))):
            row = slots[i][0] + float(rng.normal(0, 0.6))
            col = slots[i][1] + float(rng.normal(0, 0.6))
            conv = float(rng.normal(0, 0.25))
            out.append(PigTruth(f"pig-{i+1:02d}", row, col,
                                self.cfg.normal_c + conv,
                                radius_px=float(rng.uniform(2.0, 3.0))))
        if out:
            out[0].fever = False
        return out

    def _pick_dead_pixels(self) -> np.ndarray:
        if self.cfg.dead_pixels <= 0:
            return np.zeros((H, W), dtype=bool)
        idx = self.rng.choice(N, size=self.cfg.dead_pixels, replace=False)
        m = np.zeros(N, dtype=bool)
        m[idx] = True
        return m.reshape(H, W)

    def ambient_c(self, t_s: float) -> float:
        c = self.cfg
        a = (c.ambient_start_c
             + c.ambient_trend_c_per_s * t_s
             + c.ambient_swing_c * math.sin(2 * math.pi * t_s / c.ambient_period_s))
        if c.solar_gain_c:
            a += c.solar_gain_c * max(0.0, math.sin(2 * math.pi * t_s / c.solar_period_s)) ** 3
        return a

    def drift_c(self, t_s: float) -> float:
        """Sensor self-heating offset, C. Saturating exponential after power-on."""
        c = self.cfg
        return c.warmup_drift_c * (1.0 - math.exp(-max(t_s, 0.0) / c.warmup_tau_s))

    def true_pig_temp(self, p: PigTruth, t_s: float) -> float:
        c = self.cfg
        base = p.surface_c + c.pig_ambient_slope * (self.ambient_c(t_s) - c.ambient_start_c)
        if p.fever and t_s >= c.fever_start_s:
            # real fever ramps in over a few minutes, it does not step
            ramp = min(1.0, (t_s - c.fever_start_s) / max(c.fever_ramp_s, 1e-6))
            base += c.fever_rise_c * ramp
        return base

    def true_field(self, t_s: float) -> np.ndarray:
        ambient = self.ambient_c(t_s)
        field = np.full((H, W), ambient, dtype=np.float64)
        # mild background gradient so the pen is not a flat plate
        field += 0.35 * (self._rr / H) + 0.20 * (self._cc / W)
        for p in self.pigs:
            t = self.true_pig_temp(p, t_s)
            d2 = (self._rr - p.row) ** 2 + (self._cc - p.col) ** 2
            g = np.exp(-d2 / (2.0 * p.radius_px ** 2))
            field = np.maximum(field, ambient + (t - ambient) * g)
        if self.cfg.wall_patch_c is not None:
            r, c0, ph, pw = self.cfg.wall_patch_rcwh
            field[r:r + ph, c0:c0 + pw] = self.cfg.wall_patch_c
        return field

    # -- frames -------------------------------------------------------------
    def frame(self, t_s: float) -> tuple[np.ndarray, np.ndarray, dict]:
        """
        Returns (delivered_frame_768, true_field, meta).

        delivered_frame is what the Python layer receives: driver-corrected
        temperature plus drift plus noise plus dead pixels.
        """
        c = self.cfg
        true = self.true_field(t_s)
        ambient = self.ambient_c(t_s)
        t_refl = ambient - c.ta_shift_c

        # 1) forward radiometry — what a real sensor integrates
        apparent = R.blackbody_equivalent(true, c.emissivity, t_refl)
        # 2) driver inverse — mlx_reader.py sets dev.emissivity, do_compensation
        #    inverts the same equation, so this returns `true` back.
        delivered = R.true_temperature(apparent, c.emissivity, t_refl, "full")

        # 2b) fault injection: the Python layer re-applying the correction
        if c.double_correct_emissivity:
            delivered = R.true_temperature(delivered, c.emissivity, t_refl, "kelvin_div")

        # 3) self-heating drift, mostly uniform with a mild horizontal tilt so
        #    a single scalar reference correction cannot remove all of it
        d = self.drift_c(t_s)
        tilt = 1.0 + c.drift_spatial_nonuniformity * (self._cc / W - 0.5)
        delivered = delivered + d * tilt
        self.drift_history.append((float(t_s), float(d)))

        # 4) noise + dead pixels
        delivered = delivered + self.rng.normal(0.0, c.noise_sigma_c, size=(H, W))
        delivered[self._dead] = c.bad_pixel_value_c

        meta = {
            "t_s": float(t_s),
            "ambientC": round(ambient, 4),
            "driftC": round(d, 4),
            "pigs": [{"pigId": p.pig_id, "row": p.row, "col": p.col,
                      "trueC": round(self.true_pig_temp(p, t_s), 3),
                      "fever": bool(p.fever and t_s >= c.fever_start_s)}
                     for p in self.pigs],
        }
        return delivered.reshape(-1), true, meta

    def run(self) -> Iterator[tuple[np.ndarray, np.ndarray, dict]]:
        for i in range(self.cfg.frames):
            yield self.frame(i * self.cfg.dt_s)


def mark_fever(sim: ThermalSim, pig_id: str, rise: Optional[float] = None) -> None:
    for p in sim.pigs:
        if p.pig_id == pig_id:
            p.fever = True
    if rise is not None:
        sim.cfg.fever_rise_c = rise
