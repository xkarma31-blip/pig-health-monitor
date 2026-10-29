#!/usr/bin/env python3
"""Offline, dependency-free preflight for PigPulse's root GitHub Actions CI.

Usage:
  python3 scripts/ci_preflight.py
  python3 scripts/ci_preflight.py --json

Exit status is non-zero only when the workflow is structurally unsafe or points
at a missing canonical path. It deliberately reports existing code-quality
failures without treating them as a configuration failure.
"""
from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = ROOT / ".github/workflows/ci.yml"
APP = ROOT / "v3-mqtt-pocketbase/frontend/mobile_app"


@dataclass
class Check:
    name: str
    status: str  # pass | warn | fail
    detail: str


def check(condition: bool, name: str, ok: str, bad: str, *, severity: str = "fail") -> Check:
    return Check(name, "pass" if condition else severity, ok if condition else bad)


def load_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true", help="emit machine-readable JSON")
    args = parser.parse_args()

    checks: list[Check] = []
    checks.append(check(WORKFLOW.is_file(), "root workflow", "Root workflow exists.",
                        ".github/workflows/ci.yml is missing."))
    checks.append(check(APP.is_dir(), "canonical Expo app", "Canonical app directory exists.",
                        "Canonical v3 Expo app directory is missing."))

    workflow = load_text(WORKFLOW) if WORKFLOW.is_file() else ""
    root_package = ROOT / "package.json"
    app_package = APP / "package.json"
    app_lock = APP / "package-lock.json"
    root_metadata = json.loads(root_package.read_text(encoding="utf-8")) if root_package.is_file() else {}
    root_scripts = root_metadata.get("scripts", {})
    # Parse the app manifest as part of the preflight's ownership check.
    package = json.loads(app_package.read_text(encoding="utf-8")) if app_package.is_file() else {}

    checks.extend([
        check("working-directory: v3-mqtt-pocketbase/frontend/mobile_app" in workflow,
              "canonical mobile path", "Mobile CI targets the canonical v3 Expo app.",
              "Mobile CI does not declare the canonical v3 Expo working directory."),
        check("cache-dependency-path: v3-mqtt-pocketbase/frontend/mobile_app/package-lock.json" in workflow,
              "npm cache path", "Node cache keys use the Expo app lockfile.",
              "Node cache does not explicitly key on the Expo app lockfile."),
        check(app_lock.is_file(), "Expo lockfile", "Expo package-lock.json is present.",
              "Expo package-lock.json is missing; npm ci cannot be reproducible."),
        check("npm ci" in workflow, "clean install", "Workflow uses npm ci.",
              "Workflow does not use npm ci for a deterministic dependency install."),
        check("npx eslint . --ext .ts,.tsx" in workflow, "mobile lint gate",
              "Workflow runs ESLint against the mobile source.",
              "Workflow does not run the mobile ESLint gate."),
        check("npx jest" in workflow, "mobile test gate", "Workflow invokes Jest.",
              "Workflow does not invoke Jest."),
        check("ci:backend" in root_scripts, "local backend parity", "Root package exposes a local backend syntax gate.",
              "Root package lacks a ci:backend convenience gate.", severity="warn"),
        check("permissions:" in workflow, "least-privilege token", "Workflow declares explicit GitHub token permissions.",
              "Workflow relies on repository-default GitHub token permissions.", severity="warn"),
        check("trufflesecurity/trufflehog@main" not in workflow, "immutable third-party actions",
              "Credential scanner is not pinned to a mutable main branch.",
              "Credential scanner references trufflesecurity/trufflehog@main; pin a reviewed commit SHA.", severity="warn"),
    ])

    # Tests are configured, but current package metadata must own the runner.
    lock_text = app_lock.read_text(encoding="utf-8") if app_lock.is_file() else ""
    checks.append(check('"node_modules/jest-expo"' in lock_text and '"node_modules/jest"' in lock_text,
                        "declared Jest toolchain", "Jest and jest-expo are locked for clean CI installs.",
                        "Jest config exists but jest/jest-expo are not locked in the app package; clean CI test runs can fail.",
                        severity="warn"))

    payload = {
        "project": "PigPulse",
        "workflow": str(WORKFLOW.relative_to(ROOT)),
        "checks": [asdict(item) for item in checks],
        "summary": {
            "pass": sum(item.status == "pass" for item in checks),
            "warn": sum(item.status == "warn" for item in checks),
            "fail": sum(item.status == "fail" for item in checks),
        },
    }
    if args.json:
        print(json.dumps(payload, indent=2))
    else:
        for item in checks:
            print(f"[{item.status.upper():4}] {item.name}: {item.detail}")
        print("Summary: " + ", ".join(f"{key}={value}" for key, value in payload["summary"].items()))

    return 1 if payload["summary"]["fail"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
