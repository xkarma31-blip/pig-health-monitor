#!/usr/bin/env python3
"""
PigPulse thermal statistics — direct port of sensors.cpp helpers.

Preserves:
  - hotspotClusterAvg (hottest 3×3)
  - center = max(hotspot, center-4px)
  - ambient_compensate (EMA + solar pull-down)
  - frame averaging (FRAME_AVERAGE_COUNT)
  - fever threshold evaluation
"""

from __future__ import annotations

import config

W = 32
H = 24
N = W * H  # 768


def hotspot_cluster_avg(image: list[float]) -> tuple[float, int, int]:
    """Hottest 3×3 cluster average. Returns (avg, center_x, center_y)."""
    best = -1000.0
    bx, by = 16, 12
    for y in range(H - 3 + 1):
        for x in range(W - 3 + 1):
            s = 0.0
            for dy in range(3):
                row = (y + dy) * W + x
                s += image[row] + image[row + 1] + image[row + 2]
            if s > best:
                best = s
                bx = x + 1
                by = y + 1
    return best / 9.0, bx, by


def center4(image: list[float]) -> float:
    # indices 367,368,399,400 — same as sensors.cpp / thermal_image.ino
    return (image[367] + image[368] + image[399] + image[400]) / 4.0


def frame_stats(image: list[float]) -> dict:
    if len(image) != N:
        raise ValueError(f"expected {N} pixels, got {len(image)}")
    mn = min(image)
    mx = max(image)
    avg = sum(image) / N
    mx_i = image.index(mx)
    mn_i = image.index(mn)
    hot, hx, hy = hotspot_cluster_avg(image)
    c4 = center4(image)
    # Primary pig-body estimate: hotter of 3×3 cluster vs optical center
    center = hot if hot > c4 else c4
    return {
        "min": mn,
        "max": mx,
        "avg": avg,
        "center": center,
        "center4": c4,
        "hotspot": hot,
        "maxX": mx_i % W,
        "maxY": mx_i // W,
        "minX": mn_i % W,
        "minY": mn_i // W,
        "hotspotX": hx,
        "hotspotY": hy,
    }


class AmbientCompensator:
    """ambient_compensate() from sensors.cpp."""

    def __init__(self, enabled: bool | None = None, alpha: float | None = None,
                 solar: float | None = None):
        self.enabled = config.AMBIENT_COMP_ENABLE if enabled is None else enabled
        self.alpha = config.AMBIENT_COMP_ALPHA if alpha is None else alpha
        self.solar = config.SOLAR_COMP_FACTOR if solar is None else solar
        self.ema = 25.0

    def apply(self, raw_temp: float, ambient: float) -> float:
        if not self.enabled:
            return raw_temp
        self.ema = self.alpha * ambient + (1.0 - self.alpha) * self.ema
        return raw_temp - (self.ema - 25.0) * self.solar


class FrameAverager:
    """Field-loop averaging: FRAME_AVERAGE_COUNT good frames."""

    def __init__(self, count: int | None = None):
        self.count = config.FRAME_AVERAGE_COUNT if count is None else count
        self.reset()

    def reset(self) -> None:
        self._center_sum = 0.0
        self._avg_sum = 0.0
        self._amb_sum = 0.0
        self._max = None
        self._min = None
        self._x = 0
        self._y = 0
        self.good = 0

    def add(self, image: list[float], ambient: float,
            compensator: AmbientCompensator) -> bool:
        st = frame_stats(image)
        c = compensator.apply(st["center"], ambient)
        self._center_sum += c
        self._avg_sum += st["avg"]
        self._amb_sum += ambient
        if self._max is None or st["max"] > self._max:
            self._max = st["max"]
        if self._min is None or st["min"] < self._min:
            self._min = st["min"]
        self._x, self._y = st["maxX"], st["maxY"]
        self.good += 1
        return self.good >= self.count

    @property
    def full(self) -> bool:
        return self.good >= self.count

    def result(self) -> dict | None:
        if self.good == 0:
            return None
        return {
            "center": self._center_sum / self.good,
            "max": self._max,
            "min": self._min,
            "avg": self._avg_sum / self.good,
            "ambient": self._amb_sum / self.good,
            "maxX": self._x,
            "maxY": self._y,
            "frames": self.good,
        }


def evaluate_alerts(center: float) -> int:
    """Port of evaluateAlerts() thermal path from esp32d0wd-pigpulse.ino.

    types.h: ALERT_FEVER=0x01, ALERT_HYPERTHERMIA=0x02.
    Independent ifs (both can be set when center >= 41.0), not elif.
    """
    flags = 0
    if center >= config.PIG_TEMP_FEVER:
        flags |= 0x01  # ALERT_FEVER
    if center >= config.PIG_TEMP_HYPERTHERMIA:
        flags |= 0x02  # ALERT_HYPERTHERMIA
    return flags


def verdict_text(center: float) -> str:
    if center >= config.PIG_TEMP_HYPERTHERMIA:
        return "HYPERTHERMIA"
    if center >= config.PIG_TEMP_FEVER:
        return "FEVER"
    if config.PIG_TEMP_NORMAL_MIN <= center <= config.PIG_TEMP_NORMAL_MAX:
        return "NORMAL"
    return "OUT_OF_BAND"
