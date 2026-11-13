"""Bounded O(1) rolling telemetry statistics for PigPulse sensor streams."""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass
import math


@dataclass(frozen=True)
class TelemetrySnapshot:
    sample_count: int
    minimum_c: float | None
    maximum_c: float | None
    mean_c: float | None
    fever_samples: int
    fever_ratio: float


class RollingTelemetry:
    """Maintain a fixed-size temperature window without rescanning history."""

    def __init__(self, window_size: int, fever_threshold_c: float = 39.5) -> None:
        if isinstance(window_size, bool) or not isinstance(window_size, int) or window_size <= 0:
            raise ValueError("window_size must be a positive integer")
        if not math.isfinite(fever_threshold_c):
            raise ValueError("fever_threshold_c must be finite")
        self._window_size = window_size
        self._fever_threshold_c = fever_threshold_c
        self._values: deque[float] = deque()
        self._minimums: deque[float] = deque()
        self._maximums: deque[float] = deque()
        self._sum = 0.0
        self._fever_samples = 0

    def add(self, temperature_c: float) -> None:
        """Add one finite sample; evict the oldest sample when the window is full."""
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

    def snapshot(self) -> TelemetrySnapshot:
        """Return current summary values in O(1), with no copy or rescan."""
        count = len(self._values)
        if count == 0:
            return TelemetrySnapshot(0, None, None, None, 0, 0.0)
        return TelemetrySnapshot(
            sample_count=count,
            minimum_c=self._minimums[0],
            maximum_c=self._maximums[0],
            mean_c=self._sum / count,
            fever_samples=self._fever_samples,
            fever_ratio=self._fever_samples / count,
        )
