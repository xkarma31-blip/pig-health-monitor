#!/usr/bin/env python3
"""Validate PigPulse evidence-ledger provenance without network access.

This is intentionally an offline structural gate. It validates evidence policy,
not whether a source URL is reachable or whether a scientific claim is true.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import asdict, dataclass
from datetime import date
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

FORMAT_VERSION = 1
MAX_BYTES = 1_000_000
MAX_CLAIMS = 500
VALID_KINDS = {"specification", "measurement", "projection", "requirement"}
VALID_EVIDENCE = {"official", "design_estimate", "field_measurement"}
VALID_STATUS = {"verified", "unverified", "retired"}
ID_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,63}\Z")


@dataclass(frozen=True)
class Diagnostic:
    severity: str
    code: str
    path: str
    message: str


@dataclass(frozen=True)
class ValidationReport:
    ok: bool
    summary: dict[str, int]
    diagnostics: list[Diagnostic]

    def to_json(self) -> str:
        return json.dumps(
            {
                "ok": self.ok,
                "validator_version": "1.0",
                "summary": self.summary,
                "diagnostics": [asdict(item) for item in self.diagnostics],
            },
            indent=2,
            sort_keys=True,
        )

    def to_text(self) -> str:
        header = (
            f"Evidence ledger: {'PASS' if self.ok else 'FAIL'} | "
            f"claims={self.summary['claims']} errors={self.summary['errors']} "
            f"warnings={self.summary['warnings']}"
        )
        lines = [header]
        lines.extend(
            f"{item.severity.upper():7} {item.path}: {item.code} — {item.message}"
            for item in self.diagnostics
        )
        return "\n".join(lines)


def _report(claims: int, diagnostics: list[Diagnostic]) -> ValidationReport:
    errors = sum(item.severity == "error" for item in diagnostics)
    warnings = sum(item.severity == "warning" for item in diagnostics)
    return ValidationReport(not errors, {"claims": claims, "errors": errors, "warnings": warnings}, diagnostics)


def _error(diagnostics: list[Diagnostic], code: str, path: str, message: str) -> None:
    diagnostics.append(Diagnostic("error", code, path, message))


def _nonempty_string(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _valid_source_url(value: str) -> bool:
    parsed = urlparse(value)
    return (parsed.scheme in {"https", "http"} and bool(parsed.netloc)) or (
        parsed.scheme == "file" and bool(parsed.path)
    )


def _validate_claim(index: int, claim: Any, diagnostics: list[Diagnostic]) -> str | None:
    path = f"claims[{index}]"
    if not isinstance(claim, dict):
        _error(diagnostics, "invalid_claim", path, "claim must be a JSON object")
        return None

    required = (
        "id", "text", "claim_kind", "evidence_class", "source_url", "source_locator",
        "retrieved_on", "status", "verification_basis",
    )
    for field in required:
        if not _nonempty_string(claim.get(field)):
            _error(diagnostics, "missing_or_invalid_field", f"{path}.{field}", "must be a non-empty string")

    identifier = claim.get("id")
    if not isinstance(identifier, str) or not ID_RE.fullmatch(identifier):
        _error(diagnostics, "invalid_id", f"{path}.id", "use 1–64 ASCII letters, digits, dot, underscore, or hyphen")
        return None

    kind = claim.get("claim_kind")
    evidence = claim.get("evidence_class")
    status = claim.get("status")
    if kind not in VALID_KINDS:
        _error(diagnostics, "invalid_claim_kind", f"{path}.claim_kind", f"choose one of {sorted(VALID_KINDS)}")
    if evidence not in VALID_EVIDENCE:
        _error(diagnostics, "invalid_evidence_class", f"{path}.evidence_class", f"choose one of {sorted(VALID_EVIDENCE)}")
    if status not in VALID_STATUS:
        _error(diagnostics, "invalid_status", f"{path}.status", f"choose one of {sorted(VALID_STATUS)}")

    source_url = claim.get("source_url")
    if isinstance(source_url, str) and not _valid_source_url(source_url):
        _error(diagnostics, "invalid_source_url", f"{path}.source_url", "use an http(s) URL or file:/// evidence reference")

    retrieved = claim.get("retrieved_on")
    if isinstance(retrieved, str):
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", retrieved):
            _error(diagnostics, "invalid_retrieval_date", f"{path}.retrieved_on", "must be an ISO-8601 date (YYYY-MM-DD)")
        else:
            try:
                retrieved_date = date.fromisoformat(retrieved)
                if retrieved_date > date.today():
                    _error(diagnostics, "future_retrieval_date", f"{path}.retrieved_on", "cannot be later than today")
            except ValueError:
                _error(diagnostics, "invalid_retrieval_date", f"{path}.retrieved_on", "must be an ISO-8601 date (YYYY-MM-DD)")

    if evidence == "design_estimate" and status == "verified":
        _error(
            diagnostics,
            "unsupported_verified_status",
            f"{path}.status",
            "a design estimate is a projection; mark it unverified until field measurement evidence exists",
        )
    if evidence == "field_measurement" and not isinstance(claim.get("measurement_context"), dict):
        _error(
            diagnostics,
            "missing_measurement_context",
            f"{path}.measurement_context",
            "field measurements require a JSON object with device, method, conditions, and sample_count",
        )
    if status == "retired" and not _nonempty_string(claim.get("retired_reason")):
        _error(diagnostics, "missing_retired_reason", f"{path}.retired_reason", "retired claims require a reason")
    return identifier.casefold()


def validate_ledger(ledger: Any) -> ValidationReport:
    """Return all structural/policy diagnostics for an already-decoded ledger."""
    diagnostics: list[Diagnostic] = []
    if not isinstance(ledger, dict):
        return _report(0, [Diagnostic("error", "invalid_ledger", "$", "ledger must be a JSON object")])
    if ledger.get("format_version") != FORMAT_VERSION:
        _error(diagnostics, "unsupported_format_version", "format_version", f"must equal {FORMAT_VERSION}")
    claims = ledger.get("claims")
    if not isinstance(claims, list):
        _error(diagnostics, "invalid_claims", "claims", "must be an array")
        return _report(0, diagnostics)
    if len(claims) > MAX_CLAIMS:
        _error(diagnostics, "too_many_claims", "claims", f"limit is {MAX_CLAIMS}")

    seen: set[str] = set()
    for index, claim in enumerate(claims):
        identifier = _validate_claim(index, claim, diagnostics)
        if identifier is not None:
            if identifier in seen:
                _error(diagnostics, "duplicate_id", f"claims[{index}].id", "claim IDs must be unique, case-insensitively")
            seen.add(identifier)
    return _report(len(claims), diagnostics)


def validate_file(path: Path) -> ValidationReport:
    """Safely load a bounded UTF-8 JSON ledger and validate it."""
    try:
        if path.stat().st_size > MAX_BYTES:
            return _report(0, [Diagnostic("error", "file_too_large", "$", f"limit is {MAX_BYTES} bytes")])
        with path.open("r", encoding="utf-8") as handle:
            ledger = json.load(handle)
    except FileNotFoundError:
        return _report(0, [Diagnostic("error", "file_not_found", "$", f"not found: {path}")])
    except UnicodeDecodeError:
        return _report(0, [Diagnostic("error", "invalid_encoding", "$", "file must be UTF-8")])
    except json.JSONDecodeError as exc:
        return _report(0, [Diagnostic("error", "invalid_json", "$", f"{exc.msg} at line {exc.lineno}, column {exc.colno}")])
    return validate_ledger(ledger)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Offline PigPulse evidence-ledger validator")
    parser.add_argument("ledger", type=Path)
    parser.add_argument("--json", action="store_true", dest="as_json", help="emit canonical JSON diagnostics")
    args = parser.parse_args(argv)
    report = validate_file(args.ledger)
    print(report.to_json() if args.as_json else report.to_text())
    return 0 if report.ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
