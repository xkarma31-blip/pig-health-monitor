"""Bounded, explainable thermal-alert state for a PigPulse zone."""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass
import math


@dataclass(frozen=True)
class AlertBudgetSnapshot:
    sample_count: int
    minimum_c: float | None
    maximum_c: float | None
    mean_c: float | None
    fever_samples: int
    fever_ratio: float
    level: str


class AlertBudgetMonitor:
    """Track a finite zone-temperature window with amortized O(1) updates."""

    def __init__(
        self,
        window_size: int,
        fever_threshold_c: float = 39.5,
        watch_ratio: float = 0.5,
        urgent_ratio: float = 0.75,
    ) -> None:
        if isinstance(window_size, bool) or not isinstance(window_size, int) or window_size <= 0:
            raise ValueError("window_size must be a positive integer")
        if not math.isfinite(fever_threshold_c):
            raise ValueError("fever_threshold_c must be finite")
        if not 0.0 <= watch_ratio <= urgent_ratio <= 1.0:
            raise ValueError("ratios must satisfy 0 <= watch_ratio <= urgent_ratio <= 1")
        self._window_size = window_size
        self._fever_threshold_c = fever_threshold_c
        self._watch_ratio = watch_ratio
        self._urgent_ratio = urgent_ratio
        self._values: deque[float] = deque()
        self._minimums: deque[float] = deque()
        self._maximums: deque[float] = deque()
        self._sum = 0.0
        self._fever_samples = 0

    def add(self, temperature_c: float) -> None:
        if not math.isfinite(temperature_c):
            raise ValueError("temperature_c must be finite")
        if len(self._values) == self._window_size:
            expired = self._values.popleft()
            self._sum -= expired
            self._fever_samples -= expired >= self._fever_threshold_c
            if self._minimums[0] == expired:
                self._minimums.popleft()
            if self._maximums[0] == expired:
                self._maximums.popleft()
        self._values.append(temperature_c)
        self._sum += temperature_c
        self._fever_samples += temperature_c >= self._fever_threshold_c
        while self._minimums and self._minimums[-1] > temperature_c:
            self._minimums.pop()
        self._minimums.append(temperature_c)
        while self._maximums and self._maximums[-1] < temperature_c:
            self._maximums.pop()
        self._maximums.append(temperature_c)

    def snapshot(self) -> AlertBudgetSnapshot:
        count = len(self._values)
        if not count:
            return AlertBudgetSnapshot(0, None, None, None, 0, 0.0, "HEALTHY")
        ratio = self._fever_samples / count
        level = "URGENT" if ratio >= self._urgent_ratio else "WATCH" if ratio >= self._watch_ratio else "HEALTHY"
        return AlertBudgetSnapshot(
            count, self._minimums[0], self._maximums[0], self._sum / count,
            self._fever_samples, ratio, level,
        )
