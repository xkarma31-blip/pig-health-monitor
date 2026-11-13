#!/usr/bin/env python3
"""Tests for the PigPulse evidence ledger validator."""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from evidence_ledger import validate_ledger, validate_file  # noqa: E402


def valid_claim(**overrides: object) -> dict[str, object]:
    claim: dict[str, object] = {
        "id": "MLX-001",
        "text": "MLX90640 supports zone-level thermal anomaly screening.",
        "claim_kind": "specification",
        "evidence_class": "official",
        "source_url": "https://www.melexis.com/en/documents/documentation/datasheets/datasheet-mlx90640",
        "source_locator": "Datasheet, features section",
        "retrieved_on": "2026-11-08",
        "status": "verified",
        "verification_basis": "Manufacturer datasheet supports the stated sensor capability.",
    }
    claim.update(overrides)
    return claim


class EvidenceLedgerTests(unittest.TestCase):
    def test_valid_ledger_has_no_errors(self) -> None:
        report = validate_ledger({"format_version": 1, "claims": [valid_claim()]})
        self.assertTrue(report.ok)
        self.assertEqual(report.summary["errors"], 0)

    def test_duplicate_ids_are_rejected_case_insensitively(self) -> None:
        duplicate = valid_claim(id="mlx-001")
        report = validate_ledger({"format_version": 1, "claims": [valid_claim(), duplicate]})
        self.assertFalse(report.ok)
        self.assertIn("duplicate_id", {item.code for item in report.diagnostics})

    def test_estimate_cannot_be_labeled_verified_hardware_performance(self) -> None:
        estimate = valid_claim(
            id="POWER-001",
            text="The node runs for seven days.",
            claim_kind="projection",
            evidence_class="design_estimate",
            status="verified",
            verification_basis="Wh calculation",
        )
        report = validate_ledger({"format_version": 1, "claims": [estimate]})
        self.assertFalse(report.ok)
        self.assertIn("unsupported_verified_status", {item.code for item in report.diagnostics})

    def test_field_measurement_requires_measurement_context(self) -> None:
        measured = valid_claim(
            id="FIELD-001",
            claim_kind="measurement",
            evidence_class="field_measurement",
            source_url="file:///evidence/pi-thermal-run.csv",
            source_locator="run 11",
            verification_basis="Bench run.",
        )
        report = validate_ledger({"format_version": 1, "claims": [measured]})
        self.assertFalse(report.ok)
        self.assertIn("missing_measurement_context", {item.code for item in report.diagnostics})

    def test_future_retrieval_date_is_rejected(self) -> None:
        future = valid_claim(retrieved_on=(date.today() + timedelta(days=1)).isoformat())
        report = validate_ledger({"format_version": 1, "claims": [future]})
        self.assertFalse(report.ok)
        self.assertIn("future_retrieval_date", {item.code for item in report.diagnostics})

    def test_retrieval_date_requires_extended_iso_format(self) -> None:
        compact = valid_claim(retrieved_on="20261108")
        report = validate_ledger({"format_version": 1, "claims": [compact]})
        self.assertFalse(report.ok)
        self.assertIn("invalid_retrieval_date", {item.code for item in report.diagnostics})

    def test_file_validation_reports_invalid_json_without_crashing(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "broken.json"
            path.write_text("{bad", encoding="utf-8")
            report = validate_file(path)
        self.assertFalse(report.ok)
        self.assertEqual(report.diagnostics[0].code, "invalid_json")

    def test_json_report_is_machine_readable(self) -> None:
        report = validate_ledger({"format_version": 1, "claims": [valid_claim()]})
        parsed = json.loads(report.to_json())
        self.assertEqual(parsed["summary"]["claims"], 1)
        self.assertTrue(parsed["ok"])

    def test_cli_returns_one_for_policy_error(self) -> None:
        from evidence_ledger import main

        invalid = valid_claim(
            id="POWER-001",
            claim_kind="projection",
            evidence_class="design_estimate",
            status="verified",
        )
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "invalid.json"
            path.write_text(json.dumps({"format_version": 1, "claims": [invalid]}), encoding="utf-8")
            self.assertEqual(main([str(path), "--json"]), 1)


if __name__ == "__main__":
    unittest.main(verbosity=2)
