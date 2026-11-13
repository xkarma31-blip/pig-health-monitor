#!/usr/bin/env python3
"""Fail-closed metadata preflight for an Edge Impulse audio deployment.

This is a host-side estimator. It never claims model accuracy, flashability, or
hardware validation. To issue TARGET_MEASURED_PASS it needs a report captured
from the exact initialized ESP32-S3 build.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

MAX_HEADER_BYTES = 1_000_000
REQUIRED_MACROS = {
    "EI_CLASSIFIER_SLICES_PER_MODEL_WINDOW",
    "EI_CLASSIFIER_SLICE_SIZE",
    "EI_CLASSIFIER_RAW_SAMPLE_COUNT",
    "EI_CLASSIFIER_FREQUENCY",
}
DEFINE = re.compile(r"^\s*#define\s+([A-Za-z_][A-Za-z0-9_]*)\s+([0-9]+)\s*(?://.*)?$")
CAPABILITIES = {"internal", "spiram"}


class Reject(ValueError):
    """An input is unsafe, incomplete, or incompatible for an estimate."""


def positive_int(value: Any, name: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise Reject(f"{name} must be a positive integer")
    if value > 2**63 - 1:
        raise Reject(f"{name} exceeds supported range")
    return value


def align_16(value: int) -> int:
    return (value + 15) & ~15


def load_json(path: Path, label: str) -> dict[str, Any]:
    try:
        parsed = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise Reject(f"cannot read {label}: {error}") from error
    if not isinstance(parsed, dict):
        raise Reject(f"{label} must contain a JSON object")
    return parsed


def parse_header(path: Path) -> dict[str, int]:
    try:
        raw = path.read_bytes()
    except OSError as error:
        raise Reject(f"cannot read model header: {error}") from error
    if len(raw) > MAX_HEADER_BYTES:
        raise Reject("model header exceeds 1 MiB safety limit")
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as error:
        raise Reject("model header is not UTF-8 text") from error
    macros: dict[str, int] = {}
    for line in text.splitlines():
        match = DEFINE.match(line)
        if not match:
            continue
        name, raw_value = match.groups()
        if name not in REQUIRED_MACROS and name != "EI_CLASSIFIER_SENSOR_MICROPHONE":
            continue
        value = int(raw_value, 10)
        if name in macros and macros[name] != value:
            raise Reject(f"conflicting macro definitions for {name}")
        macros[name] = value
    missing = sorted(REQUIRED_MACROS - macros.keys())
    if missing:
        raise Reject("missing numeric macro(s): " + ", ".join(missing))
    for name in REQUIRED_MACROS:
        positive_int(macros[name], name)
    if macros.get("EI_CLASSIFIER_SENSOR_MICROPHONE") != 1:
        raise Reject("model header must declare EI_CLASSIFIER_SENSOR_MICROPHONE 1")
    return macros


def validate_contract(contract: dict[str, Any], macros: dict[str, int]) -> dict[str, Any]:
    for name in (
        "source_sample_rate_hz", "model_sample_rate_hz", "source_channels",
        "model_channels", "bytes_per_sample", "arena_bytes", "headroom_bytes",
    ):
        positive_int(contract.get(name), name)
    if contract.get("slice_unit") != "frames":
        raise Reject("slice_unit must be exactly 'frames'; ambiguous scalar/byte units are rejected")
    if contract.get("conversion_pipeline") not in ("none", "declared"):
        raise Reject("conversion_pipeline must be 'none' or 'declared'")
    if contract["source_sample_rate_hz"] != contract["model_sample_rate_hz"] and contract["conversion_pipeline"] != "declared":
        raise Reject("sample-rate mismatch requires a declared conversion pipeline")
    if contract["source_channels"] != contract["model_channels"] and contract["conversion_pipeline"] != "declared":
        raise Reject("channel-count mismatch requires a declared conversion pipeline")
    for key in ("arena_capability", "audio_capability"):
        if contract.get(key, "internal") not in CAPABILITIES:
            raise Reject(f"{key} must be 'internal' or 'spiram'")
    expected_window = macros["EI_CLASSIFIER_SLICE_SIZE"] * macros["EI_CLASSIFIER_SLICES_PER_MODEL_WINDOW"]
    if macros["EI_CLASSIFIER_RAW_SAMPLE_COUNT"] != expected_window:
        raise Reject("raw sample count does not equal slice size × slices per model window")
    if macros["EI_CLASSIFIER_FREQUENCY"] != contract["model_sample_rate_hz"]:
        raise Reject("model metadata frequency does not match model_sample_rate_hz")
    return contract


def assess_measurement(measurement: dict[str, Any], requirements: dict[str, int]) -> list[str]:
    provenance = measurement.get("provenance")
    heaps = measurement.get("heaps")
    if not isinstance(provenance, dict) or not isinstance(provenance.get("device"), str) or not provenance["device"].strip():
        raise Reject("memory measurement requires provenance.device")
    if not isinstance(provenance.get("firmware_digest"), str) or not provenance["firmware_digest"].strip():
        raise Reject("memory measurement requires provenance.firmware_digest")
    if provenance.get("capture_method") != "on_target_heap_caps":
        raise Reject("memory measurement must declare provenance.capture_method 'on_target_heap_caps'")
    if measurement.get("measurement_schema") != "pigpulse-edge-memory-v1":
        raise Reject("memory measurement must declare measurement_schema 'pigpulse-edge-memory-v1'")
    if not isinstance(heaps, dict):
        raise Reject("memory measurement requires heaps object")
    failures: list[str] = []
    for capability, required in requirements.items():
        if required == 0:
            continue
        heap = heaps.get(capability)
        if not isinstance(heap, dict):
            failures.append(f"missing measured {capability} heap")
            continue
        free = positive_int(heap.get("free_bytes"), f"heaps.{capability}.free_bytes")
        largest = positive_int(heap.get("largest_free_block_bytes"), f"heaps.{capability}.largest_free_block_bytes")
        if free < required:
            failures.append(f"{capability} free bytes {free} below required {required}")
        if largest < required:
            failures.append(f"{capability} largest free block {largest} below required {required}")
    return failures


def preflight(model_header: Path, audio_contract: Path, memory_measurement: Path | None) -> tuple[int, dict[str, Any]]:
    warnings = [
        "Host-side memory estimate only: it does not verify model accuracy, sensor wiring, flashability, or sustained real-time inference.",
        "Rolling DSP features, task stacks, DMA buffers, networking overhead, and conversion buffers must be separately measured on target.",
    ]
    try:
        macros = parse_header(model_header)
        contract = validate_contract(load_json(audio_contract, "audio contract"), macros)
        frame_bytes = contract["model_channels"] * contract["bytes_per_sample"]
        slice_pcm_bytes = macros["EI_CLASSIFIER_SLICE_SIZE"] * frame_bytes
        audio_double = align_16(2 * slice_pcm_bytes)
        requirements = {"internal": 0, "spiram": 0}
        requirements[contract.get("arena_capability", "internal")] += align_16(contract["arena_bytes"] + contract["headroom_bytes"])
        requirements[contract.get("audio_capability", "internal")] += audio_double
        result: dict[str, Any] = {
            "decision": "ESTIMATE_PASS_REQUIRES_TARGET_VALIDATION",
            "model_frequency_hz": macros["EI_CLASSIFIER_FREQUENCY"],
            "slice_frames": macros["EI_CLASSIFIER_SLICE_SIZE"],
            "slices_per_model_window": macros["EI_CLASSIFIER_SLICES_PER_MODEL_WINDOW"],
            "slice_duration_ms": macros["EI_CLASSIFIER_SLICE_SIZE"] * 1000 / contract["model_sample_rate_hz"],
            "slice_pcm_bytes": slice_pcm_bytes,
            "audio_double_buffer_bytes": audio_double,
            "requirements_by_capability": requirements,
            "warnings": warnings,
            "reasons": [],
        }
        if memory_measurement is not None:
            failures = assess_measurement(load_json(memory_measurement, "memory measurement"), requirements)
            if failures:
                result["decision"] = "HARD_REJECT"
                result["reasons"] = failures
                return 2, result
            result["decision"] = "TARGET_REPORTED_PASS_REQUIRES_SOAK"
            result["warnings"].append("The supplied report meets the memory policy, but its provenance is not cryptographically attestable here; capture-plus-inference soak testing on the named target remains mandatory.")
        else:
            result["warnings"].append("No target memory measurement supplied; this estimate is not hardware-verified.")
        return 0, result
    except Reject as error:
        return 2, {"decision": "HARD_REJECT", "reasons": [str(error)], "warnings": warnings}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model-header", type=Path, required=True)
    parser.add_argument("--audio-contract", type=Path, required=True)
    parser.add_argument("--memory-measurement", type=Path)
    parser.add_argument("--json", action="store_true", help="emit JSON (default output format)")
    args = parser.parse_args()
    code, result = preflight(args.model_header, args.audio_contract, args.memory_measurement)
    print(json.dumps(result, indent=2, sort_keys=True))
    return code


if __name__ == "__main__":
    raise SystemExit(main())
