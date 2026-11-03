#!/usr/bin/env python3
"""
Radiometry + drift compensation + zone-level fever detection — MLX90640 (32x24).

Additive module for the PigPulse v3 thermal node. It does NOT replace
mlx_reader.py / pigpulse_stats.py; it consumes the same 768-float frame and
emits an extended telemetry payload that is a strict superset of
thermal_publish.py's current one.

Why this exists
---------------
The thermal node currently reduces a whole 32x24 field to a single scalar:
the hottest 3x3 cluster ("center") plus the optical-centre 2x2. That gives one
number for a pen that may hold several pigs, and it has no notion of a
per-pixel baseline, so a 10-15 C open-air ambient swing or the sensor's own
self-heating drift moves that scalar directly.

This module adds three things, each mapped to a published result:

1. RADIOMETRIC INVERSION (standard ITM form).
       T_meas^4 = eps*T_obj^4 + (1-eps)*T_refl^4          (tau_atm ~= 1)
       T_obj = [ (T_meas^4 - (1-eps)*T_refl^4) / eps ]^(1/4)
   Sources: MDPI Sensors 14(7):12305 Eq.(16); FLIR T810442 reference doc Eq.(4);
   Melexis MLX90640 driver's `taTr` term (functions/MLX90640_API.c). The
   shortcut `T/eps^0.25` is the T_refl = 0 K special case of the same equation.

   *** The MLX90640 driver ALREADY owns this correction. *** mlx_reader.py sets
   `dev.emissivity = config.EMISSIVITY` and the driver performs the emissivity
   division plus the taTr reflected-temperature term inside do_compensation().
   Applying it again in Python double-corrects; see double_correction_error_c()
   and the guard in ZoneFeverPipeline. Keeping eps_here = 1.0 is the contract.

2. SELF-HEATING DRIFT COMPENSATION (internal calibration).
   Jiao et al. 2022, Front. Phys. 10:893131 — an uncooled camera drifted with
   +-3 C accuracy, improved to 0.3 C after real-time drift compensation.
   Implemented as a tracked in-frame reference region of stable temperature,
   with an exponential settling model for the startup transient.

3. ZONE DETECTION AGAINST A PER-PIXEL BASELINE.
   Jia et al. 2020 (ambient/humidity must be modelled) + Traulsen et al. 2011
   (temporal baseline, sustained threshold). A pixel's own rolling median is its
   reference, so an ambient swing that moves the whole field is not a fever.
   Zones are connected components of the deviation field, so the output is
   "which part of the pen is hot" instead of "the pen's hottest pixel".

Pure NumPy + stdlib. No SciPy, no OpenCV, no pandas.
"""

from __future__ import annotations

import math
import time
from collections import deque
from dataclasses import dataclass, field as dc_field
from typing import Optional, Sequence

import numpy as np

# --- Geometry ---------------------------------------------------------------
W, H, N = 32, 24, 768

# --- Constants --------------------------------------------------------------
T_ZERO_K = 273.15

# Soerensen et al. 2014: pig ear base emissivity. Only used by the *forward*
# model and by the diagnostics; the live correction is owned by the driver.
EPS_EAR_BASE = 0.978
# Reflected-temperature offset. Mirrors config.TA_SHIFT (ESP: MLX_TA_SHIFT 8.0).
# The MLX90640's internal thermopile sees the scene at Ta - TA_SHIFT, which the
# driver turns into the taTr term.
DEFAULT_TA_SHIFT = 8.0

# MLX90640D110 field of view (the specified part — see CANON.md).
#
# NOTE / correction: the "6 x 5 cm pixel at 2 m" figure elsewhere in the project
# belongs to the 55 deg (D55) variant. At 110 deg horizontal / 75 deg vertical
# the on-axis footprint at 2 m is 17.9 x 12.8 cm, exactly as the
# 2026-11-02 source audit recorded.
HFOV_DEG_D110 = 110.0
VFOV_DEG_D110 = 75.0
HFOV_DEG_D55 = 55.0
VFOV_DEG_D55 = 35.0


# =============================================================================
# 1. Radiometry
# =============================================================================
def c2k(t_c):
    """Celsius -> Kelvin (scalar or array)."""
    return np.asarray(t_c, dtype=np.float64) + T_ZERO_K


def k2c(t_k):
    """Kelvin -> Celsius (scalar or array)."""
    return np.asarray(t_k, dtype=np.float64) - T_ZERO_K


def blackbody_equivalent(t_obj_c, eps: float = EPS_EAR_BASE,
                         t_refl_c: float = 30.0):
    """
    Forward model: true object temperature -> apparent (blackbody-equivalent)
    temperature a perfect-emissivity radiometer would report.

        T_meas = [ eps*T_obj^4 + (1-eps)*T_refl^4 ]^(1/4)
    """
    to = c2k(t_obj_c)
    tr = c2k(t_refl_c)
    return k2c((eps * to ** 4 + (1.0 - eps) * tr ** 4) ** 0.25)


def true_temperature(t_meas_c, eps: float = EPS_EAR_BASE,
                     t_refl_c: float = 30.0, mode: str = "full"):
    """
    Inverse radiometric model.

    mode="full"        full Eq. with the reflected-temperature term  <- correct
    mode="kelvin_div"  T_meas / eps^0.25 in Kelvin   (the T_refl = 0 K case)
    mode="celsius_div" T_meas / eps^0.25 in Celsius  (the legacy project code)

    The last two are only kept as diagnostics: they answer "how far off is the
    shortcut at this operating point". Do not use them to correct live data.
    """
    tm = c2k(t_meas_c)
    if mode == "full":
        tr = c2k(t_refl_c)
        arg = (tm ** 4 - (1.0 - eps) * tr ** 4) / eps
        # Non-physical input (T_meas below the reflected floor) would otherwise
        # raise a complex/NaN out of the fractional power. Clamp instead.
        arg = np.maximum(arg, 1.0)
        return k2c(arg ** 0.25)
    if mode == "kelvin_div":
        return k2c(tm / eps ** 0.25)
    if mode == "celsius_div":
        return np.asarray(t_meas_c, dtype=np.float64) / eps ** 0.25
    raise ValueError(f"unknown mode {mode!r}")


def emissivity_diagnostic(t_meas_c: float = 38.5, eps: float = EPS_EAR_BASE,
                          t_refl_c: float = 30.0) -> dict:
    """
    Quantify the three candidate corrections at one operating point.
    Returns a plain dict so it can go straight into a report or a log line.
    """
    full = float(true_temperature(t_meas_c, eps, t_refl_c, "full"))
    kdiv = float(true_temperature(t_meas_c, eps, t_refl_c, "kelvin_div"))
    cdiv = float(true_temperature(t_meas_c, eps, t_refl_c, "celsius_div"))
    return {
        "t_meas_c": t_meas_c,
        "eps": eps,
        "t_refl_c": t_refl_c,
        "full_c": round(full, 4),
        "full_delta_c": round(full - t_meas_c, 4),
        "kelvin_div_c": round(kdiv, 4),
        "kelvin_div_delta_c": round(kdiv - t_meas_c, 4),
        "celsius_div_c": round(cdiv, 4),
        "celsius_div_delta_c": round(cdiv - t_meas_c, 4),
    }


def double_correction_error_c(t_meas_c: float = 38.5, eps: float = 0.95,
                              t_refl_c: float = 30.0) -> float:
    """
    Error injected by correcting for emissivity TWICE: once in the driver
    (as mlx_reader.py does via dev.emissivity) and again in Python using the
    `T_meas / eps^0.25` shortcut.

    Both corrections push the reading the same way, so the errors add. At the
    configured eps = 0.95 this is several degrees — an order of magnitude larger
    than the 1.5 C fever discrimination band.
    """
    once = float(true_temperature(t_meas_c, eps, t_refl_c, "kelvin_div"))
    twice = float(true_temperature(once, eps, t_refl_c, "kelvin_div"))
    return twice - once


def pixel_footprint_m(distance_m: float, hfov_deg: float = HFOV_DEG_D110,
                      vfov_deg: float = VFOV_DEG_D110,
                      w: int = W, h: int = H) -> tuple[float, float]:
    """
    On-axis linear size of one pixel at `distance_m` (rectilinear projection).

    This is the SMALLEST pixel in the frame; off-axis pixels are stretched by
    ~1/cos^2(theta). Honest use: quote it as a lower bound and say so.
    """
    px_w = 2.0 * distance_m * math.tan(math.radians(hfov_deg) / 2.0) / w
    px_h = 2.0 * distance_m * math.tan(math.radians(vfov_deg) / 2.0) / h
    return px_w, px_h


# =============================================================================
# 2. Drift compensation
# =============================================================================
def default_reference_mask(rows: int = 3, shape: tuple[int, int] = (H, W),
                           side_cols: int = 0) -> np.ndarray:
    """
    A frame-border reference region assumed to be thermally stable (barn wall /
    ceiling above the pen). The whole compensation rests on that assumption —
    if the reference region is inside the pen, or lit by sun, this is wrong and
    the caller must supply a real blackbody or a known-stable patch instead.
    """
    mask = np.zeros(shape, dtype=bool)
    mask[:rows, :] = True
    if side_cols:
        mask[:, :side_cols] = True
        mask[:, -side_cols:] = True
    return mask


class ReferenceDriftCompensator:
    """
    Internal-calibration drift removal (Jiao et al. 2022).

    Tracks the median of a reference region. The median is used rather than the
    mean so a pig crossing the reference region does not lurch the correction.

    Two modes:
      anchored  — ref_true_c is a known temperature (blackbody / thermocouple).
      frozen    — no truth available: the first `calib_frames` medians define the
                  zero point, and only DRIFT away from it is removed.

    The method cannot separate sensor drift from real change in the scene, so it
    must not be trusted to do so on its own. Two guards make it fail safe:
      clamp_c  bounds the correction to the plausible self-heating magnitude.
               Sensor self-heating settles within a few degrees; a clamp set at
               the scale of the ambient swing (it was 6.0) silently transfers
               the day's weather onto every pig. Measured: 3.0 C absorbed, pigs
               read 3.5 C low, and a healthy pen alarmed.
      the caller is told refRawBiasC every frame: when the reference region
               moves, the correction is absorbing scene change, and that is the
               honest limit of the method — not something to hide behind a
               larger clamp.
    """

    def __init__(self, ref_mask: Optional[np.ndarray] = None,
                 ref_true_c: Optional[float] = None,
                 alpha: float = 0.2, calib_frames: int = 8,
                 clamp_c: float = 2.5, enabled: bool = True):
        self.ref_mask = default_reference_mask() if ref_mask is None else np.asarray(ref_mask, bool)
        self.ref_true_c = ref_true_c
        self.alpha = float(alpha)
        self.calib_frames = int(calib_frames)
        self.clamp_c = float(clamp_c)
        self.enabled = bool(enabled)
        self._frozen_ref: Optional[float] = None
        self._calib: list[float] = []
        self.bias_c = 0.0
        self.ready = False
        self.history: list[tuple[float, float]] = []   # (t_s, bias_c)

    def reference_median(self, frame_c: np.ndarray) -> float:
        vals = frame_c[self.ref_mask]
        return float(np.median(vals)) if vals.size else 0.0

    def update(self, frame_c: np.ndarray, t_s: float = 0.0
               ) -> tuple[np.ndarray, dict]:
        if not self.enabled or not self.ref_mask.any():
            return frame_c, {"driftBiasC": 0.0, "driftReady": False,
                             "driftMode": "off"}

        med = self.reference_median(frame_c)

        if self.ref_true_c is not None:
            mode = "anchored"
            raw_bias = med - float(self.ref_true_c)
            self.ready = True
        else:
            mode = "frozen"
            if len(self._calib) < self.calib_frames:
                self._calib.append(med)
                self._frozen_ref = float(np.median(self._calib))
                return frame_c, {"driftBiasC": 0.0, "driftReady": False,
                                 "driftMode": "calibrating",
                                 "calibProgress": f"{len(self._calib)}/{self.calib_frames}"}
            raw_bias = med - float(self._frozen_ref)
            self.ready = True

        raw_bias = max(-self.clamp_c, min(self.clamp_c, raw_bias))
        self.bias_c = self.alpha * raw_bias + (1.0 - self.alpha) * self.bias_c
        self.history.append((float(t_s), self.bias_c))
        return frame_c - self.bias_c, {
            "driftBiasC": round(self.bias_c, 4),
            "driftReady": self.ready,
            "driftMode": mode,
            # Diagnostics for the reference region itself. If refMedianC moves on
            # its own, the reference is not thermally stable and the correction is
            # absorbing real scene change rather than sensor drift (measured at up
            # to 3.5 C in the ambient_swing_open_air scenario). A deployment should
            # watch this number; it is the honest limit of the method.
            "refMedianC": round(med, 4),
            "refRawBiasC": round(raw_bias, 4),
        }


class ShutterSettlingModel:
    """
    Exponential self-heating model:  d(t) = A * (1 - exp(-t / tau)).

    Fitted by grid search over tau with a closed-form least-squares amplitude —
    no SciPy needed. Feed it the bias series from ReferenceDriftCompensator to
    get a predictive correction for the first minutes after power-on, when the
    in-frame reference has not yet settled either.
    """

    def __init__(self, tau_candidates: Optional[Sequence[float]] = None):
        self.tau_grid = tuple(tau_candidates) if tau_candidates else tuple(
            float(x) for x in np.logspace(math.log10(3.0), math.log10(900.0), 120)
        )
        self.A = 0.0
        self.tau = 60.0
        self.r2 = 0.0
        self.fitted = False

    def fit(self, times_s: Sequence[float], biases_c: Sequence[float]) -> "ShutterSettlingModel":
        t = np.asarray(times_s, dtype=np.float64)
        d = np.asarray(biases_c, dtype=np.float64)
        if t.size < 4 or float(np.ptp(d)) == 0.0:
            self.fitted = False
            return self

        # Search t0 as well: the drift clock starts when the sensor powers up,
        # not necessarily at the first sample we kept.
        best = (-1.0, 0.0, 60.0, 0.0)
        for tau in self.tau_grid:
            for t0 in (0.0, float(t.min())):
                e = 1.0 - np.exp(-np.maximum(t - t0, 0.0) / tau)
                denom = float(np.dot(e, e))
                if denom < 1e-12:
                    continue
                a = float(np.dot(d, e)) / denom
                resid = d - a * e
                ss_tot = float(np.dot(d - d.mean(), d - d.mean()))
                r2 = 1.0 - float(np.dot(resid, resid)) / ss_tot if ss_tot > 0 else 0.0
                if r2 > best[0]:
                    best = (r2, a, tau, t0)
        self.r2, self.A, self.tau, self._t0 = best
        self.fitted = self.r2 > 0.5
        return self

    def predict(self, t_s: float) -> float:
        if not self.fitted:
            return 0.0
        return self.A * (1.0 - math.exp(-max(t_s - self._t0, 0.0) / self.tau))


# =============================================================================
# 3. Zone segmentation and baseline
# =============================================================================
def label_zones(mask: np.ndarray) -> np.ndarray:
    """
    4-connected component labelling, NumPy only.

    Iterative max-propagation: each cell takes the maximum label of itself and
    its 4 neighbours until the field stops changing. On 32x24 this converges in
    well under 40 sweeps, i.e. microseconds — cheaper than pulling in SciPy.
    """
    mask = np.asarray(mask, dtype=bool)
    if not mask.any():
        return np.zeros(mask.shape, dtype=np.int32)

    h, w = mask.shape
    seeds = (np.arange(h * w, dtype=np.int32).reshape(h, w) + 1)
    lab = np.where(mask, seeds, 0).astype(np.int32)

    while True:
        m = lab.copy()
        m[:-1, :] = np.maximum(m[:-1, :], lab[1:, :])
        m[1:, :] = np.maximum(m[1:, :], lab[:-1, :])
        m[:, :-1] = np.maximum(m[:, :-1], lab[:, 1:])
        m[:, 1:] = np.maximum(m[:, 1:], lab[:, :-1])
        m = np.where(mask, m, 0)
        if np.array_equal(m, lab):
            return lab
        lab = m


def _compact_labels(lab: np.ndarray) -> list[np.ndarray]:
    """Group a raw label field into a list of coordinate arrays."""
    ids = np.unique(lab)
    ids = ids[ids > 0]
    return [np.argwhere(lab == i) for i in ids]


def extract_zones(field_map: np.ndarray, threshold: float,
                  baseline: Optional[np.ndarray] = None,
                  roi: Optional[np.ndarray] = None,
                  min_area_px: int = 6,
                  max_area_px: Optional[int] = 600,
                  top_k: int = 3,
                  distance_m: float = 2.0,
                  hfov_deg: float = HFOV_DEG_D110,
                  vfov_deg: float = VFOV_DEG_D110,
                  streak_map: Optional[np.ndarray] = None) -> list[dict]:
    """
    Connected components of `field_map >= threshold`, filtered and summarised.

    min_area_px guards against the single-pixel spikes a 768-pixel thermopile
    array throws; the old 3x3 hotspot scan had no such guard.
    """
    field_map = np.asarray(field_map, dtype=np.float64)
    if field_map.shape != (H, W):
        raise ValueError(f"expected {(H, W)} field, got {field_map.shape}")

    mask = field_map >= threshold
    if roi is not None:
        mask = mask & np.asarray(roi, bool)
    if not mask.any():
        return []

    px_w, px_h = pixel_footprint_m(distance_m, hfov_deg, vfov_deg)
    zones: list[dict] = []

    for coords in _compact_labels(label_zones(mask)):
        area = int(coords.shape[0])
        if area < min_area_px:
            continue
        if max_area_px is not None and area > max_area_px:
            continue

        vals = field_map[coords[:, 0], coords[:, 1]]
        order = np.argsort(vals)[::-1]
        k = min(top_k, area)
        peak_idx = order[0]
        peak_r, peak_c = int(coords[peak_idx, 0]), int(coords[peak_idx, 1])
        peak = float(vals[peak_idx])
        topk_mean = float(vals[order[:k]].mean())

        delta = None
        if baseline is not None:
            delta = round(peak - float(baseline[peak_r, peak_c]), 4)

        streak = 0
        if streak_map is not None:
            streak = int(np.median(streak_map[coords[:, 0], coords[:, 1]]))

        rows = int(coords[:, 0].max() - coords[:, 0].min() + 1)
        cols = int(coords[:, 1].max() - coords[:, 1].min() + 1)

        zones.append({
            "areaPx": area,
            "centroidRow": round(float(coords[:, 0].mean()), 2),
            "centroidCol": round(float(coords[:, 1].mean()), 2),
            "peakRow": peak_r,
            "peakCol": peak_c,
            "peakC": round(peak, 4),
            "topKMeanC": round(topk_mean, 4),
            "meanC": round(float(vals.mean()), 4),
            "deltaC": delta,
            "streakFrames": streak,
            # Physical extent of the zone at the given distance. Lower bound:
            # on-axis pixel size, so off-axis zones are larger in reality.
            "spanWidthCm": round(cols * px_w * 100.0, 2),
            "spanHeightCm": round(rows * px_h * 100.0, 2),
        })

    zones.sort(key=lambda z: z["peakC"], reverse=True)
    for i, z in enumerate(zones):
        z["zoneId"] = i
    return zones


class PixelBaseline:
    """
    Rolling per-pixel median background model.

    This is the open-air answer: a pig's fever is a departure from THAT PIXEL's
    own recent history, so a 10-15 C ambient swing that lifts the entire field
    is not a fever. The median (not the mean) means a pig standing in a pixel
    for part of the window does not drag the baseline up with it.
    """

    def __init__(self, window: int = 30, warmup: int = 10):
        self.window = int(window)
        self.warmup = int(warmup)
        self._buf: deque[np.ndarray] = deque(maxlen=self.window)
        self.frames_seen = 0

    def push(self, frame_c: np.ndarray) -> bool:
        self._buf.append(np.asarray(frame_c, dtype=np.float32).copy())
        self.frames_seen += 1
        return self.ready

    @property
    def ready(self) -> bool:
        return len(self._buf) >= self.warmup

    def baseline(self) -> Optional[np.ndarray]:
        if not self._buf:
            return None
        return np.median(np.stack(self._buf, axis=0), axis=0).astype(np.float64)

    def reset(self) -> None:
        self._buf.clear()
        self.frames_seen = 0


# =============================================================================
# 4. Pipeline
# =============================================================================
def _load_project_config() -> dict:
    """Use the live thermal-pi config when importable, else safe duplicates."""
    out = {
        "emissivity": 0.95,
        "ta_shift": DEFAULT_TA_SHIFT,
        "normal_min": 38.5,
        "normal_max": 39.5,
        "fever": 40.0,
        "hyperthermia": 41.0,
    }
    try:                       # pragma: no cover - depends on cwd
        import config as _cfg     # type: ignore
        out["emissivity"] = float(getattr(_cfg, "EMISSIVITY", out["emissivity"]))
        out["ta_shift"] = float(getattr(_cfg, "TA_SHIFT", out["ta_shift"]))
        out["normal_min"] = float(getattr(_cfg, "PIG_TEMP_NORMAL_MIN", out["normal_min"]))
        out["normal_max"] = float(getattr(_cfg, "PIG_TEMP_NORMAL_MAX", out["normal_max"]))
        out["fever"] = float(getattr(_cfg, "PIG_TEMP_FEVER", out["fever"]))
        out["hyperthermia"] = float(getattr(_cfg, "PIG_TEMP_HYPERTHERMIA", out["hyperthermia"]))
    except Exception:
        pass
    return out


@dataclass
class PipelineConfig:
    # --- correction ownership ------------------------------------------------
    eps_driver: float = 0.95      # what mlx_reader.py hands the Melexis driver
    eps_here: float = 1.0         # MUST be 1.0; the driver already corrected
    ta_shift_c: float = DEFAULT_TA_SHIFT

    # --- zone detection ------------------------------------------------------
    delta_suspect_c: float = 1.0
    delta_fever_c: float = 1.5
    min_area_px: int = 6
    max_area_px: int = 600
    sustain_frames: int = 5
    absolute_fever_floor_c: float = 40.0   # independent of the baseline

    # --- cross-sectional (herd) reference ------------------------------------
    # Pixels this far above the frame median are taken to be animal tissue. The
    # median of those pixels is the herd reference: what "normal" looks like in
    # THIS frame, THIS ambient, THIS distance. Needs 2+ animals to be meaningful.
    animal_offset_c: float = 3.0
    herd_min_animals: int = 3
    # Below this, no pixel can be a pig: barn floor, wall and air all read far
    # lower. Environment-relative tests (deviation from the pixel's own history)
    # are gated on it, because a fast ambient swing moves those surfaces by more
    # than the fever band.
    animal_floor_c: float = 34.0

    # --- baseline ------------------------------------------------------------
    baseline_window: int = 30
    baseline_warmup: int = 10

    # --- drift ---------------------------------------------------------------
    drift_enabled: bool = True
    drift_alpha: float = 0.2
    drift_calib_frames: int = 8

    # --- optics --------------------------------------------------------------
    distance_m: float = 2.0
    hfov_deg: float = HFOV_DEG_D110
    vfov_deg: float = VFOV_DEG_D110

    # --- region of interest --------------------------------------------------
    # Row range that may contain animals. Everything above is wall/ceiling and
    # is excluded so a sun-baked wall cannot masquerade as a pig.
    roi_row_min: int = 4


class ZoneFeverPipeline:
    """
    frame (768 floats, already radiometrically corrected by the driver)
        -> drift compensation
        -> per-pixel rolling baseline
        -> deviation field -> connected zones
        -> classification (baseline-relative AND absolute floor)

    `update()` returns a dict that is a strict superset of the telemetry payload
    thermal_publish.py emits today, so it can be dropped into that call site
    without breaking the app.
    """

    def __init__(self, cfg: Optional[PipelineConfig] = None,
                 ref_mask: Optional[np.ndarray] = None,
                 ref_true_c: Optional[float] = None,
                 project: Optional[dict] = None):
        self.cfg = cfg or PipelineConfig()
        proj = project if project is not None else _load_project_config()
        self.proj = proj

        # Contract guard: refuse a configuration that double-corrects.
        if abs(self.cfg.eps_here - 1.0) > 1e-9:
            raise ValueError(
                "eps_here must be 1.0: the MLX90640 driver (dev.emissivity in "
                "mlx_reader.py) already performs the emissivity correction. "
                f"Correcting again here would DOUBLE-correct and add ~"
                f"{double_correction_error_c(38.5, self.cfg.eps_here, 30.0):+.2f} C "
                "of bias — larger than the whole fever band."
            )

        self.drift = ReferenceDriftCompensator(
            ref_mask=ref_mask, ref_true_c=ref_true_c,
            alpha=self.cfg.drift_alpha, calib_frames=self.cfg.drift_calib_frames,
            enabled=self.cfg.drift_enabled)
        self.baseline = PixelBaseline(self.cfg.baseline_window, self.cfg.baseline_warmup)
        self.streak = np.zeros((H, W), dtype=np.int32)
        self._roi = np.ones((H, W), dtype=bool)
        self._roi[: self.cfg.roi_row_min, :] = False
        self.settling = ShutterSettlingModel()
        self.samples = 0

    # -- internals ----------------------------------------------------------
    def _candidate_threshold(self, corrected: np.ndarray) -> float:
        """
        Absolute-domain candidate threshold for one frame.

        Take the lower of:
          * the clinical fever floor (a 40.2 C pig is a candidate regardless of
            how hot the rest of the pen is), and
          * this frame's median + delta_fever, so a pen that is uniformly warm
            does not put every pig above an absolute threshold.
        """
        frame_relative = float(np.median(corrected)) + self.cfg.delta_fever_c
        return min(self.cfg.absolute_fever_floor_c, frame_relative)

    @staticmethod
    def _local_maxima(field: np.ndarray, size: int = 5) -> np.ndarray:
        """Elementwise 5x5 max, numpy only — no scipy on the deployment target."""
        half = size // 2
        padded = np.pad(field, half, mode="edge")
        mx = np.full(field.shape, -np.inf)
        for dr in range(-half, half + 1):
            for dc in range(-half, half + 1):
                mx = np.maximum(mx, padded[half + dr:half + dr + H,
                                           half + dc:half + dc + W])
        return mx

    def _animal_peaks(self, corrected: np.ndarray) -> list[tuple[int, int, float]]:
        """
        One entry per ANIMAL, as (row, col, core_temp).

        Counting animals by connected zone does not work: at the candidate
        threshold (frame median + 1.5 C) the Gaussian fringes of animals a few
        pixels apart merge, so a pen of five produced a single 271 px zone —
        measured, not hypothetical. `herd_min_animals` then saw one animal, the
        reference was never built, and the cross-sectional layer was dead code
        in every scenario.

        A local maximum of the field is one animal, merged or not: each animal
        contributes exactly one core, and fringes cannot be local maxima of
        their own blob. Peaks above frame median + animal_offset_c are animals;
        below that they are floor, wall or noise.
        """
        med = float(np.median(corrected))
        thr = med + self.cfg.animal_offset_c
        is_peak = (corrected >= self._local_maxima(corrected)) & \
                  (corrected >= thr) & self._roi

        rows, cols = np.nonzero(is_peak)
        cand = sorted(((int(r), int(c), float(corrected[r, c]))
                       for r, c in zip(rows, cols)),
                      key=lambda t: -t[2])
        # Plateaus and fringe shoulders yield several maxima per animal; keep
        # the brightest and suppress everything within one blob radius.
        keep: list[tuple[int, int, float]] = []
        for r, c, v in cand:
            if all((r - kr) ** 2 + (c - kc) ** 2 > 9 for kr, kc, _ in keep):
                keep.append((r, c, v))
        return keep

    def _herd_reference(self, peaks: list[tuple[int, int, float]]) -> float | None:
        """
        Median core temperature of the animals visible in this frame.

        "What a normal pig reads as, right now, at this ambient, from this
        distance" — the baseline that needs no history, so it is available on
        frame one.

        Returns None when fewer than herd_min_animals animals are found: with one
        animal there is nothing to compare against, and with two a single
        febrile pig moves the median halfway, halving its apparent excess to
        ~0.9 C and dropping it below the 1.5 C band. The caller then falls back
        to the temporal and absolute tests alone.
        """
        if len(peaks) < self.cfg.herd_min_animals:
            return None
        return float(np.median([v for _, _, v in peaks]))

    def _classify(self, zone: dict, baseline_ready: bool,
                  herd_ref_c: float | None = None) -> tuple[str, float]:
        peak = zone["peakC"]
        delta = zone["deltaC"] if zone["deltaC"] is not None else 0.0
        d_herd = zone.get("deltaHerdC")
        sustained = zone["streakFrames"] >= self.cfg.sustain_frames

        if peak >= self.proj["hyperthermia"]:
            zone["reason"] = "absolute_hyperthermia"
            return "HYPERTHERMIA", 1.0
        if peak >= self.cfg.absolute_fever_floor_c:
            # Layer 1, absolute floor: catches a zone both other tests would
            # learn away or miss (a pig feverish since power-on; every pig
            # febrile at once). Works on frame one, needs no history.
            zone["reason"] = "absolute_floor"
            return "FEVER", 0.95
        # Cross-sectional test: hot relative to the pennates, same frame.
        # No lag, no reliance on a stable reference region, no warm-up needed.
        if d_herd is not None and d_herd >= self.cfg.delta_fever_c:
            excess = d_herd - self.cfg.delta_fever_c
            zone["reason"] = "herd_relative"
            return "FEVER", round(min(0.99, 0.55 + 0.1 * excess), 3)

        # Temporal test: hot relative to this pixel's own history. Catches the
        # whole herd rising together, which the cross-sectional test cannot see.
        if not baseline_ready:
            zone["reason"] = "warmup"
            return "WARMUP", 0.0
        if delta >= self.cfg.delta_fever_c and sustained:
            span = self.cfg.delta_fever_c - self.cfg.delta_suspect_c
            base = min(1.0, (delta - self.cfg.delta_suspect_c) / max(span, 1e-6))
            area_factor = min(1.0, zone["areaPx"] / 12.0)
            zone["reason"] = "temporal_baseline"
            return "FEVER", round(0.6 * base + 0.4 * area_factor, 3)
        if d_herd is not None and d_herd >= self.cfg.delta_suspect_c:
            zone["reason"] = "suspect_herd"
            return "SUSPECT", round(min(0.7, 0.4 + 0.1 * d_herd), 3)
        if delta >= self.cfg.delta_suspect_c:
            zone["reason"] = "suspect_temporal"
            return "SUSPECT", round(min(0.6, 0.3 + 0.1 * zone["streakFrames"]), 3)
        if self.proj["normal_min"] <= peak <= self.proj["normal_max"]:
            zone["reason"] = "normal_band"
            return "NORMAL", 1.0
        zone["reason"] = "out_of_band"
        return "UNKNOWN", 0.0

    # -- public -------------------------------------------------------------
    def update(self, frame_c: Sequence[float] | np.ndarray,
               t_s: float = 0.0,
               ambient_c: float = 25.0) -> dict:
        """
        One pipeline tick. `frame_c` may be a 768 list (the format the rest of
        thermal-pi uses) or a (24, 32) array.
        """
        arr = np.asarray(frame_c, dtype=np.float64).reshape(H, W)

        corrected, drift_info = self.drift.update(arr, t_s)
        t_refl_c = float(ambient_c) - self.cfg.ta_shift_c

        base = self.baseline.baseline()
        ready = self.baseline.ready
        deviation = (corrected - base) if base is not None else np.zeros((H, W))

        # The current frame is scored against the baseline that EXCLUDES it (so a
        # frame cannot vote its own hot pixel into the background) and only then
        # joins the window. Omitting this line silently disables the entire
        # baseline-relative path: no zone is ever compared with its own history
        # and every verdict falls back to the absolute test. Guarded by
        # test_baseline_is_actually_fed.
        self.baseline.push(corrected)

        # Sustained-deviation accumulator. Spatial and ID-free, so it survives
        # zones splitting and merging between frames.
        hot_now = deviation >= self.cfg.delta_suspect_c
        self.streak = np.where(hot_now, self.streak + 1, 0).astype(np.int32)

        # Candidates come from two fields, each covering the other's blind spot:
        #   absolute  — obvious fever must be visible on frame ONE, before any
        #               baseline exists. Threshold = the lower of the clinical
        #               fever floor and (frame median + delta_fever), so it stays
        #               meaningful in a pen that is uniformly hot or uniformy cool.
        #   deviation — sees a 1-2 C anomaly that the absolute scale hides.
        zones = extract_zones(
            corrected, self._candidate_threshold(corrected), baseline=base,
            roi=self._roi, min_area_px=self.cfg.min_area_px,
            max_area_px=self.cfg.max_area_px, distance_m=self.cfg.distance_m,
            hfov_deg=self.cfg.hfov_deg, vfov_deg=self.cfg.vfov_deg,
            streak_map=self.streak)

        herd_ref_c: float | None = None
        peaks: list[tuple[int, int, float]] = []
        if ready:
            for z in extract_zones(
                    deviation, self.cfg.delta_suspect_c, baseline=None,
                    roi=self._roi, min_area_px=self.cfg.min_area_px,
                    max_area_px=self.cfg.max_area_px, distance_m=self.cfg.distance_m,
                    hfov_deg=self.cfg.hfov_deg, vfov_deg=self.cfg.vfov_deg,
                    streak_map=self.streak):
                z = dict(z)
                # On the deviation field "peakC" is a delta; restore the real
                # absolute temperature and record the delta explicitly.
                z["deltaC"] = round(z["peakC"], 4)
                z["peakC"] = round(float(base[z["peakRow"], z["peakCol"]]) + z["deltaC"], 4)
                z["topKMeanC"] = round(z["peakC"] - (z["deltaC"] - z["topKMeanC"]), 4)
                # A deviation blob that is not animal-warm is the environment
                # moving (ambient swing, draught), not a pig heating up.
                if z["peakC"] < self.cfg.animal_floor_c:
                    continue
                if not any(abs(z["peakRow"] - o["peakRow"]) <= 1 and
                           abs(z["peakCol"] - o["peakCol"]) <= 1 for o in zones):
                    zones.append(z)
            zones.sort(key=lambda z: z["peakC"], reverse=True)

            # Cross-sectional reference: the median CORE temperature of the
            # animals in this frame — the median of the per-animal peaks, NOT
            # the median of all animal-like pixels. A blob's Gaussian fringe
            # drags a pixel-median ~2.5 C below the animals' cores, which makes
            # every healthy animal look "1.5 C above the herd" and alarms on
            # every frame (measured: 90/90 false alarms in a healthy pen).
            # Anchored on local maxima, not zones, because a pen of five merges
            # into one zone and the reference would never form.
            peaks = self._animal_peaks(corrected)
            herd_ref_c = self._herd_reference(peaks)
            for i, z in enumerate(zones):
                z["zoneId"] = i

        if not ready:
            # The census needs no history: report it during warm-up too.
            peaks = self._animal_peaks(corrected)
        for z in zones:
            z["deltaHerdC"] = (None if herd_ref_c is None
                               else round(z["peakC"] - herd_ref_c, 4))
            verdict, conf = self._classify(z, ready, herd_ref_c)
            z["classification"] = verdict
            z["confidence"] = conf

        alerting = [z for z in zones
                    if z["classification"] in ("FEVER", "HYPERTHERMIA")]
        suspect = [z for z in zones if z["classification"] == "SUSPECT"]

        # --- pixel-level guarantees -------------------------------------------
        # Every test above runs on ZONES, and zones are filtered by geometry:
        # extract_zones drops any component above max_area_px, so a pen whose
        # animals all merge into one big cluster (or a camera looking at a warm
        # wall) produces NO zones and therefore no verdict at all — the alarm
        # goes silent exactly when the scene is most abnormal. These two tests
        # read the raw field, so no geometry threshold can suppress them.
        roi_vals = np.where(self._roi, corrected, -np.inf)
        pr, pc = np.unravel_index(int(np.argmax(roi_vals)), (H, W))
        roi_peak_c = float(corrected[pr, pc])

        dev_vals = np.where(self._roi, deviation, -np.inf)
        dr, dc = np.unravel_index(int(np.argmax(dev_vals)), (H, W))
        dev_peak_c = float(deviation[dr, dc])
        dev_area_px = 0
        pixel_reason = None
        if not alerting:
            if roi_peak_c >= self.cfg.absolute_fever_floor_c:
                # Absolute, so no locality question: a pixel at the clinical
                # fever floor is a finding wherever it is. This is the test that
                # survives a pen whose animals all merge into one oversize
                # cluster, which extract_zones drops.
                pixel_reason = "pixel_floor"
            elif (ready and dev_peak_c >= self.cfg.delta_fever_c
                  and int(self.streak[dr, dc]) >= self.cfg.sustain_frames
                  and float(corrected[dr, dc]) >= self.cfg.animal_floor_c):
                # ...the pixel is warm enough to be an animal, and the blob it
                # sits in is the size of an animal. A drift correction or an
                # ambient swing ramps every surface at once, so its deviation
                # blob covers the frame; a fever covers a pig. Rejecting the
                # oversize blob is what keeps this test from being a
                # frame-wide-bias detector.
                lab = label_zones((deviation >= self.cfg.delta_fever_c) & self._roi)
                cid = int(lab[dr, dc])
                if cid > 0:
                    dev_area_px = int(np.count_nonzero(lab == cid))
                if self.cfg.min_area_px <= dev_area_px <= self.cfg.max_area_px:
                    pixel_reason = "pixel_temporal"
        if pixel_reason:
            pixel_zone = self._pixel_zone(
                (pr, pc) if pixel_reason == "pixel_floor" else (dr, dc),
                corrected, base, self.streak, pixel_reason)
            zones = [pixel_zone] + zones
            alerting = [pixel_zone]

        if alerting:
            worst = max(alerting, key=lambda z: z["peakC"])
            verdict, flags = worst["classification"], 0x01
            if worst["classification"] == "HYPERTHERMIA":
                flags |= 0x02
        elif suspect:
            worst = max(suspect, key=lambda z: z["peakC"])
            verdict, flags = "SUSPECT", 0
        else:
            worst = zones[0] if zones else None
            verdict, flags = ("NORMAL" if ready else "WARMUP"), 0

        self.samples += 1
        hot = float(corrected.max())
        mn = float(corrected.min())
        candidate_px = int(((corrected >= self._candidate_threshold(corrected))
                            & self._roi).sum())
        zoned_px = int(sum(z["areaPx"] for z in zones))
        payload = {
            # --- mirror thermal_publish.py's existing keys exactly -----------
            "temperature": round(float(corrected.mean()), 2),
            "center": round(float(worst["peakC"]) if worst else hot, 2),
            "hotspot": round(float(worst["topKMeanC"]) if worst else hot, 2),
            "max": round(hot, 2),
            "min": round(mn, 2),
            "ambient": round(float(ambient_c), 2),
            "status": verdict,
            "alerts": flags,
            "verdict": verdict,
            # --- new, additive ----------------------------------------------
            "zoneCount": len(zones),
            "zones": zones,
            "hottestZoneId": worst["zoneId"] if worst else None,
            "baselineReady": bool(ready),
            "baselineFrames": self.baseline.frames_seen,
            "herdRefC": (None if herd_ref_c is None else round(herd_ref_c, 3)),
            "driftBiasC": drift_info.get("driftBiasC", 0.0),
            "driftMode": drift_info.get("driftMode", "off"),
            "driftAbsorbedC": drift_info.get("refRawBiasC", 0.0),
            "refMedianC": drift_info.get("refMedianC"),
            "reflectedTempC": round(t_refl_c, 2),
            "emissivityOwner": "driver (mlx_reader.dev.emissivity)",
            "doubleCorrectionGuard": True,
            # --- observability: is the geometry layer throwing data away? -----
            "roiPeakC": round(roi_peak_c, 2),
            "roiPeakRow": int(pr),
            "roiPeakCol": int(pc),
            "animalCount": len(peaks),
            "candidatePx": candidate_px,
            "zonedPx": zoned_px,
            "devBlobPx": dev_area_px,
            "devPeakC": round(dev_peak_c, 2),
            # < 1.0 means zones represent less of the hot scene than the field
            # says is there: merging, min_area_px, or an oversize drop.
            "pixelCoverage": (round(zoned_px / candidate_px, 3)
                              if candidate_px else None),
        }
        if drift_info.get("calibProgress"):
            payload["driftCalibProgress"] = drift_info["calibProgress"]
        return payload

    def _pixel_zone(self, rc: tuple[int, int], corrected: np.ndarray,
                    base: Optional[np.ndarray], streak: np.ndarray,
                    reason: str) -> dict:
        """
        A zone-shaped record for an alarm raised on a single pixel, so the
        payload schema does not fork and the app can still point at a location.
        Scored on the 3x3 neighbourhood: the MLX90640's 55 deg variant spans
        ~5 cm per pixel at 2 m, so one pixel is not a robust sample of an
        animal, but the neighbourhood's mean is.
        """
        r, c = rc
        r0, r1 = max(0, r - 1), min(H, r + 2)
        c0, c1 = max(0, c - 1), min(W, c + 2)
        patch = corrected[r0:r1, c0:c1]
        peak = float(corrected[r, c])
        delta = (None if base is None else round(peak - float(base[r, c]), 4))
        return {
            "areaPx": int(patch.size), "zoneId": 0,
            "centroidRow": float(r), "centroidCol": float(c),
            "peakRow": int(r), "peakCol": int(c),
            "peakC": round(peak, 4), "topKMeanC": round(float(patch.mean()), 4),
            "meanC": round(float(patch.mean()), 4), "deltaC": delta,
            "streakFrames": int(streak[r, c]), "deltaHerdC": None,
            "spanWidthCm": round(pixel_footprint_m(
                self.cfg.distance_m, self.cfg.hfov_deg, self.cfg.vfov_deg)[0]
                * 100.0, 2),
            "spanHeightCm": round(pixel_footprint_m(
                self.cfg.distance_m, self.cfg.hfov_deg, self.cfg.vfov_deg)[1]
                * 100.0, 2),
            "classification": "FEVER", "confidence": 0.9, "reason": reason,
        }

    # -- diagnostics ---------------------------------------------------------
    def fit_settling(self) -> ShutterSettlingModel:
        """Fit the self-heating model to the drift series seen so far."""
        if len(self.drift.history) >= 4:
            t = [h[0] for h in self.drift.history]
            d = [h[1] for h in self.drift.history]
            self.settling.fit(t, d)
        return self.settling


# =============================================================================
# 5. Backwards-compatible summary for the existing publish path
# =============================================================================
def to_telemetry_payload(payload: dict, device_id: str, pig_id: str = "unassigned",
                         timestamp_ms: Optional[int] = None) -> dict:
    """
    Wrap a ZoneFeverPipeline result in the exact shape thermal_publish.py sends,
    keeping every legacy field and appending the zone fields under stable names.
    """
    ts = int(time.time() * 1000) if timestamp_ms is None else int(timestamp_ms)
    return {
        "deviceId": device_id,
        "timestamp": ts,
        "pigId": pig_id,
        "bodyTemp": payload["center"],
        "temperature": payload["temperature"],
        "center": payload["center"],
        "hotspot": payload["hotspot"],
        "max": payload["max"],
        "min": payload["min"],
        "ambient": payload["ambient"],
        "status": payload["status"],
        "alerts": payload["alerts"],
        "verdict": payload["verdict"],
        # additive
        "zoneCount": payload["zoneCount"],
        "hottestZoneId": payload["hottestZoneId"],
        "zones": payload["zones"],
        "baselineReady": payload["baselineReady"],
        "driftBiasC": payload["driftBiasC"],
        "reflectedTempC": payload["reflectedTempC"],
    }
