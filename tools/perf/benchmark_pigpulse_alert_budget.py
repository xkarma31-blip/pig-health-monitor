"""Benchmark bounded PigPulse alert monitoring against naive rescanning."""

from __future__ import annotations

import json
from collections import deque
from pathlib import Path
from random import Random
from statistics import median
from time import perf_counter_ns

from pigpulse_alert_budget import AlertBudgetMonitor

WINDOW = 300
SAMPLES = 60_000
REPEATS = 7
THRESHOLD_C = 39.5
WATCH_RATIO = 0.50
URGENT_RATIO = 0.75


def thermal_samples(count: int) -> list[float]:
    rng = Random(90640)
    return [38.7 + rng.uniform(-1.4, 1.8) for _ in range(count)]


def naive(samples: list[float]) -> tuple[int, float, float, float, int, float, str]:
    values: deque[float] = deque(maxlen=WINDOW)
    result = (0, 0.0, 0.0, 0.0, 0, 0.0, "HEALTHY")
    for value in samples:
        values.append(value)
        count = len(values)
        fever_samples = sum(reading >= THRESHOLD_C for reading in values)
        fever_ratio = fever_samples / count
        level = "URGENT" if fever_ratio >= URGENT_RATIO else "WATCH" if fever_ratio >= WATCH_RATIO else "HEALTHY"
        result = (count, min(values), max(values), sum(values) / count, fever_samples, fever_ratio, level)
    return result


def optimized(samples: list[float]) -> tuple[int, float, float, float, int, float, str]:
    monitor = AlertBudgetMonitor(WINDOW, THRESHOLD_C, WATCH_RATIO, URGENT_RATIO)
    for value in samples:
        monitor.add(value)
    snapshot = monitor.snapshot()
    assert snapshot.minimum_c is not None and snapshot.maximum_c is not None and snapshot.mean_c is not None
    return (snapshot.sample_count, snapshot.minimum_c, snapshot.maximum_c, snapshot.mean_c, snapshot.fever_samples, snapshot.fever_ratio, snapshot.level)


def measure(function, samples: list[float]) -> int:
    start = perf_counter_ns()
    function(samples)
    return perf_counter_ns() - start


def main() -> None:
    samples = thermal_samples(SAMPLES)
    expected, actual = naive(samples), optimized(samples)
    assert expected[0] == actual[0]
    assert expected[1] == actual[1]
    assert expected[2] == actual[2]
    assert abs(expected[3] - actual[3]) < 1e-12
    assert expected[4] == actual[4]
    assert abs(expected[5] - actual[5]) < 1e-12
    assert expected[6] == actual[6]
    naive_ns = median(measure(naive, samples) for _ in range(REPEATS))
    optimized_ns = median(measure(optimized, samples) for _ in range(REPEATS))
    result = {
        "window": WINDOW,
        "samples": SAMPLES,
        "repeats": REPEATS,
        "naive_ms": round(naive_ns / 1_000_000, 3),
        "optimized_ms": round(optimized_ns / 1_000_000, 3),
        "speedup": round(naive_ns / optimized_ns, 2),
        "parity": True,
        "final_mean_c": round(actual[3], 3),
        "final_fever_samples": actual[4],
        "final_fever_ratio": round(actual[5], 3),
        "final_level": actual[6],
    }
    Path(__file__).with_name("alert_budget_benchmark_result.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
