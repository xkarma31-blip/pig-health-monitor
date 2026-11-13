"""Benchmark the bounded PigPulse telemetry aggregator against naive rescanning."""

from __future__ import annotations

import json
from collections import deque
from pathlib import Path
from random import Random
from statistics import median
from time import perf_counter_ns

from rolling_telemetry import RollingTelemetry

WINDOW = 300
SAMPLES = 30_000
REPEATS = 5
THRESHOLD_C = 39.5


def telemetry_samples(count: int) -> list[float]:
    rng = Random(90640)
    return [38.7 + rng.uniform(-1.4, 1.8) for _ in range(count)]


def naive(samples: list[float]) -> tuple[int, float, float, float, int]:
    values: deque[float] = deque(maxlen=WINDOW)
    last = (0, 0.0, 0.0, 0.0, 0)
    for temperature_c in samples:
        values.append(temperature_c)
        last = (
            len(values),
            min(values),
            max(values),
            sum(values) / len(values),
            sum(value >= THRESHOLD_C for value in values),
        )
    return last


def optimized(samples: list[float]) -> tuple[int, float, float, float, int]:
    stream = RollingTelemetry(WINDOW, THRESHOLD_C)
    for temperature_c in samples:
        stream.add(temperature_c)
    snapshot = stream.snapshot()
    assert snapshot.minimum_c is not None
    assert snapshot.maximum_c is not None
    assert snapshot.mean_c is not None
    return (
        snapshot.sample_count,
        snapshot.minimum_c,
        snapshot.maximum_c,
        snapshot.mean_c,
        snapshot.fever_samples,
    )


def measure(function, samples: list[float]) -> int:
    started = perf_counter_ns()
    function(samples)
    return perf_counter_ns() - started


def main() -> None:
    samples = telemetry_samples(SAMPLES)
    expected = naive(samples)
    actual = optimized(samples)
    assert actual[0] == expected[0]
    assert actual[1] == expected[1]
    assert actual[2] == expected[2]
    assert abs(actual[3] - expected[3]) < 1e-12
    assert actual[4] == expected[4]

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
        "final_samples": actual[0],
        "final_mean_c": round(actual[3], 3),
        "final_fever_samples": actual[4],
    }
    output = Path(__file__).with_name("benchmark_result.json")
    output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
