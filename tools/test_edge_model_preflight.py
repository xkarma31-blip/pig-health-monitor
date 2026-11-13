#!/usr/bin/env python3
"""Executable behavior tests for the Edge Impulse deployment preflight."""
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
TOOL = HERE / "edge_model_preflight.py"

VALID_HEADER = """
#define EI_CLASSIFIER_SLICES_PER_MODEL_WINDOW 4
#define EI_CLASSIFIER_SLICE_SIZE 12000
#define EI_CLASSIFIER_RAW_SAMPLE_COUNT 48000
#define EI_CLASSIFIER_FREQUENCY 48000
#define EI_CLASSIFIER_SENSOR_MICROPHONE 1
"""


def run_tool(header: str, contract: dict, measurement: dict | None = None):
    with tempfile.TemporaryDirectory() as temp_dir:
        temp = Path(temp_dir)
        header_path = temp / "model_metadata.h"
        contract_path = temp / "audio_contract.json"
        header_path.write_text(header, encoding="utf-8")
        contract_path.write_text(json.dumps(contract), encoding="utf-8")
        command = [sys.executable, str(TOOL), "--model-header", str(header_path),
                   "--audio-contract", str(contract_path), "--json"]
        if measurement is not None:
            measurement_path = temp / "memory_measurement.json"
            measurement_path.write_text(json.dumps(measurement), encoding="utf-8")
            command.extend(["--memory-measurement", str(measurement_path)])
        completed = subprocess.run(command, text=True, capture_output=True, check=False)
        return completed.returncode, json.loads(completed.stdout)


class EdgeModelPreflightTests(unittest.TestCase):
    def test_valid_metadata_is_estimate_only_without_hardware_measurement(self):
        code, result = run_tool(VALID_HEADER, {
            "source_sample_rate_hz": 48000,
            "model_sample_rate_hz": 48000,
            "source_channels": 1,
            "model_channels": 1,
            "bytes_per_sample": 2,
            "conversion_pipeline": "none",
            "slice_unit": "frames",
            "arena_bytes": 131072,
            "headroom_bytes": 16384,
        })
        self.assertEqual(code, 0)
        self.assertEqual(result["decision"], "ESTIMATE_PASS_REQUIRES_TARGET_VALIDATION")
        self.assertEqual(result["audio_double_buffer_bytes"], 48000)
        self.assertTrue(any("not hardware-verified" in item.lower() for item in result["warnings"]))

    def test_rate_mismatch_without_conversion_is_rejected(self):
        code, result = run_tool(VALID_HEADER, {
            "source_sample_rate_hz": 48000,
            "model_sample_rate_hz": 16000,
            "source_channels": 1,
            "model_channels": 1,
            "bytes_per_sample": 2,
            "conversion_pipeline": "none",
            "slice_unit": "frames",
            "arena_bytes": 131072,
            "headroom_bytes": 16384,
        })
        self.assertEqual(code, 2)
        self.assertEqual(result["decision"], "HARD_REJECT")
        self.assertIn("sample-rate mismatch", " ".join(result["reasons"]).lower())

    def test_fragmented_measurement_is_rejected_even_when_total_free_is_large(self):
        code, result = run_tool(VALID_HEADER, {
            "source_sample_rate_hz": 48000,
            "model_sample_rate_hz": 48000,
            "source_channels": 1,
            "model_channels": 1,
            "bytes_per_sample": 2,
            "conversion_pipeline": "none",
            "slice_unit": "frames",
            "arena_bytes": 131072,
            "headroom_bytes": 16384,
            "arena_capability": "spiram",
            "audio_capability": "internal",
        }, {
            "measurement_schema": "pigpulse-edge-memory-v1",
            "provenance": {"device": "esp32-s3-test", "firmware_digest": "abc", "capture_method": "on_target_heap_caps"},
            "heaps": {
                "spiram": {"free_bytes": 500000, "largest_free_block_bytes": 120000},
                "internal": {"free_bytes": 100000, "largest_free_block_bytes": 100000}
            }
        })
        self.assertEqual(code, 2)
        self.assertEqual(result["decision"], "HARD_REJECT")
        self.assertIn("largest free block", " ".join(result["reasons"]).lower())

    def test_missing_microphone_marker_is_rejected(self):
        code, result = run_tool(VALID_HEADER.replace("#define EI_CLASSIFIER_SENSOR_MICROPHONE 1\n", ""), {
            "source_sample_rate_hz": 48000,
            "model_sample_rate_hz": 48000,
            "source_channels": 1,
            "model_channels": 1,
            "bytes_per_sample": 2,
            "conversion_pipeline": "none",
            "slice_unit": "frames",
            "arena_bytes": 131072,
            "headroom_bytes": 16384,
        })
        self.assertEqual(code, 2)
        self.assertIn("SENSOR_MICROPHONE", " ".join(result["reasons"]))

    def test_unmarked_memory_report_is_rejected_not_target_pass(self):
        code, result = run_tool(VALID_HEADER, {
            "source_sample_rate_hz": 48000,
            "model_sample_rate_hz": 48000,
            "source_channels": 1,
            "model_channels": 1,
            "bytes_per_sample": 2,
            "conversion_pipeline": "none",
            "slice_unit": "frames",
            "arena_bytes": 131072,
            "headroom_bytes": 16384,
        }, {
            "provenance": {"device": "unverified-host-json", "firmware_digest": "unbound"},
            "heaps": {"internal": {"free_bytes": 500000, "largest_free_block_bytes": 500000}}
        })
        self.assertEqual(code, 2)
        self.assertEqual(result["decision"], "HARD_REJECT")
        self.assertIn("capture_method", " ".join(result["reasons"]))

    def test_ambiguous_slice_unit_is_rejected(self):
        code, result = run_tool(VALID_HEADER, {
            "source_sample_rate_hz": 48000,
            "model_sample_rate_hz": 48000,
            "source_channels": 1,
            "model_channels": 1,
            "bytes_per_sample": 2,
            "conversion_pipeline": "none",
            "slice_unit": "unknown",
            "arena_bytes": 131072,
            "headroom_bytes": 16384,
        })
        self.assertEqual(code, 2)
        self.assertEqual(result["decision"], "HARD_REJECT")
        self.assertIn("slice_unit", " ".join(result["reasons"]))


if __name__ == "__main__":
    unittest.main(verbosity=2)
