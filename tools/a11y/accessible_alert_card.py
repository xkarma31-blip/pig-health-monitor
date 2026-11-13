#!/usr/bin/env python3
"""Accessible, zone-level PigPulse alert-card contract.

The MLX90640 reports a zone thermal anomaly, not an individual diagnosis.  This
small formatter keeps that physical limit visible while making each state usable
without colour: symbol + plain-language label + recommended action + screen
reader sentence.
"""

from __future__ import annotations

import argparse
import json
from typing import Any

DARK = (13, 13, 26)
WHITE = (240, 240, 240)


def _linear(channel: int) -> float:
    value = channel / 255
    return value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4


def contrast_ratio(foreground: tuple[int, int, int], background: tuple[int, int, int]) -> float:
    """WCAG relative-luminance ratio; no rounded value is used for decisions."""
    def luminance(rgb: tuple[int, int, int]) -> float:
        r, g, b = (_linear(channel) for channel in rgb)
        return 0.2126 * r + 0.7152 * g + 0.0722 * b

    lighter, darker = sorted((luminance(foreground), luminance(background)), reverse=True)
    return (lighter + 0.05) / (darker + 0.05)


def _words(value: int) -> str:
    names = ("zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten")
    return names[value] if 0 <= value < len(names) else str(value)


def _validate(zone: str, thermal_delta_c: float, coughs_10m: int, baseline_coughs_10m: int) -> None:
    if not isinstance(zone, str) or not zone.strip():
        raise ValueError("zone must be a non-empty string")
    if thermal_delta_c < 0:
        raise ValueError("thermal_delta_c must be zero or greater")
    if coughs_10m < 0 or baseline_coughs_10m < 0:
        raise ValueError("cough counts must be zero or greater")


def build_alert_card(
    zone: str, thermal_delta_c: float, coughs_10m: int, baseline_coughs_10m: int
) -> dict[str, Any]:
    """Return a UI-independent alert contract for app cards, SMS, or speech.

    Urgent requires both a sustained relative thermal elevation and a material
    cough increase. This conservative fusion prevents a single noisy modality
    from being worded as a health emergency.
    """
    _validate(zone, thermal_delta_c, coughs_10m, baseline_coughs_10m)
    zone = zone.strip()
    cough_increase = max(0, coughs_10m - baseline_coughs_10m)
    urgent = thermal_delta_c >= 1.0 and cough_increase >= 3
    watch = thermal_delta_c >= 0.5 or cough_increase >= 2
    ratio = contrast_ratio(WHITE, DARK)

    safe_zone = zone.replace(" / ", ", ").replace("/", ", ")
    if urgent:
        return {
            "severity": "urgent",
            "symbol": "!!",
            "label": f"URGENT — inspect {zone} now",
            "action": "Inspect this zone now.",
            "spoken": (
                f"Urgent health alert. {safe_zone}. Thermal reading is {thermal_delta_c:.1f} degrees Celsius "
                f"above its zone baseline. {_words(coughs_10m).capitalize()} cough events were detected in ten minutes, compared "
                f"with a baseline of {_words(baseline_coughs_10m)}. Inspect this zone now."
            ),
            "aria_live": "assertive",
            "contrast_ratio": ratio,
        }
    if watch:
        return {
            "severity": "watch",
            "symbol": "!",
            "label": f"WATCH — recheck {zone} within 30 minutes",
            "action": "Recheck this zone within 30 minutes.",
            "spoken": (
                f"Watch alert. {safe_zone}. Thermal reading is {thermal_delta_c:.1f} degrees Celsius above its "
                f"zone baseline. {coughs_10m} cough events were detected in ten minutes, compared with a baseline "
                f"of {baseline_coughs_10m}. Recheck this zone within 30 minutes."
            ),
            "aria_live": "polite",
            "contrast_ratio": ratio,
        }
    return {
        "severity": "normal",
        "symbol": "OK",
        "label": f"NORMAL — {zone} is within its zone baseline",
        "action": "Continue routine monitoring.",
        "spoken": (
            f"Normal zone check. {safe_zone} is within its zone baseline. Thermal elevation is "
            f"{thermal_delta_c:.1f} degrees Celsius and cough activity is {coughs_10m} events in ten minutes. "
            "Continue routine monitoring."
        ),
        "aria_live": "off",
        "contrast_ratio": ratio,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Format an accessible PigPulse zone alert.")
    parser.add_argument("--zone", default="Pen A / Zone 2")
    parser.add_argument("--thermal-delta", type=float, default=1.4)
    parser.add_argument("--coughs", type=int, default=6)
    parser.add_argument("--baseline-coughs", type=int, default=1)
    args = parser.parse_args()
    print(json.dumps(build_alert_card(args.zone, args.thermal_delta, args.coughs, args.baseline_coughs), indent=2))


if __name__ == "__main__":
    main()
