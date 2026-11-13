#!/usr/bin/env python3
"""PigPulse accessibility (a11y) contrast toolkit — standard library only.

OWNER DECISION — 2026-11-13 — THE `audit` FAILs ARE KNOWN AND ACCEPTED.
The light palette currently reports twelve FAILs (the five badge labels, two
row glyphs, muted label on card, thermal value, card hairline boundary, input
border on bg, body small / secondary label). Master was shown the exact
computed fixes and **declined them**: the theme is to stay as it is. Do not
apply the `fix` suggestions to `src/theme/theme.ts` without a fresh explicit
instruction from him. This module is a measurement tool and a record of what
it found — it is not a to-do list. The audit output is the evidence that the
state was checked and accepted, not a defect report awaiting repair.

Why this exists
---------------
Master reads PigPulse on a laptop and a phone with low vision, and a farmer reads
the same alerts outdoors under midday sun. Both are hard cases for contrast. This
module answers three questions about the PigPulse design system with arithmetic
rather than opinion:

  1. WCAG 2.2  — does this foreground/background pair pass AA (4.5:1) or AAA (7:1)?
  2. APCA      — is the pair readable at the *actual* size and weight it is drawn at?
  3. CVD       — after protan/deutan/tritan simulation, do two status colours collapse?

...and then fixes what fails by walking OKLab lightness, preserving hue.

Algorithm sources (implemented, not guessed)
--------------------------------------------
* WCAG 2.2 SC 1.4.3 / 1.4.6 / 1.4.11 relative luminance:
  L = 0.2126 R + 0.7152 G + 0.0722 B over piecewise-linearised sRGB;
  ratio = (Lmax + 0.05) / (Lmin + 0.05).
* APCA 0.1.9 (SAPC-8, G-4g constants), Myndex / W3 licensed source:
  https://github.com/Myndex/apca-w3  ->  sRGBtoY() + APCAcontrast().
  Polarity-sensitive: negative Lc = light text on dark background.
* APCA font-lookup table v0.1.7 (May 2022) for size/weight thresholds.
* Viénot, Brettel & Mollon (1999) dichromat simulation built from its published
  primitives — IEC 61966-2-1 linearisation, the sRGB/Judd-Vos XYZ matrix, the
  Smith & Pokorny LMS matrix, and the black-white-blue-yellow projection plane.
  Matrices cross-checked against DaltonLens' worked example.

Usage
-----
    python3 pigpulse_a11y.py audit            # scorecard for the live theme
    python3 pigpulse_a11y.py audit --json     # machine-readable
    python3 pigpulse_a11y.py simulate '#A9762E' '#F1DFC0'
    python3 pigpulse_a11y.py fix  '#9CA89D' '#FFFFFF' --target 4.5
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Iterable, Sequence

# ─────────────────────────────────────────────────────────────────────────────
# Colour primitives
# ─────────────────────────────────────────────────────────────────────────────

def hex_to_rgb(value: str) -> tuple[int, int, int]:
    """'#1E8449' or '1e8449' -> (30, 132, 73). Raises on anything else."""
    if not isinstance(value, str):
        raise TypeError(f"hex must be a string, got {type(value).__name__}")
    text = value.strip().lstrip("#")
    if len(text) == 3:
        text = "".join(ch * 2 for ch in text)
    if len(text) != 6 or not re.fullmatch(r"[0-9a-fA-F]{6}", text):
        raise ValueError(f"not a 6-digit hex colour: {value!r}")
    return int(text[0:2], 16), int(text[2:4], 16), int(text[4:6], 16)


def rgb_to_hex(rgb: Sequence[float]) -> str:
    return "#" + "".join(f"{max(0, min(255, round(c))):02X}" for c in rgb)


def _srgb_to_linear(channel: float) -> float:
    """IEC 61966-2-1 electro-optical transfer. channel in 0..1."""
    return channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4


def _linear_to_srgb(channel: float) -> float:
    """Inverse EOTF; clamps so out-of-gamut values stay representable."""
    c = max(0.0, min(1.0, channel))
    return c * 12.92 if c <= 0.0031308 else 1.055 * (c ** (1 / 2.4)) - 0.055


def linear_rgb(rgb: Sequence[float]) -> tuple[float, float, float]:
    r, g, b = rgb
    return _srgb_to_linear(r / 255.0), _srgb_to_linear(g / 255.0), _srgb_to_linear(b / 255.0)


def encode_srgb(lin: Sequence[float]) -> tuple[int, int, int]:
    return tuple(round(_linear_to_srgb(c) * 255) for c in lin)  # type: ignore[return-value]


# ─────────────────────────────────────────────────────────────────────────────
# Tiny 3x3 linear algebra (keeps the module dependency-free)
# ─────────────────────────────────────────────────────────────────────────────

Matrix = tuple[tuple[float, float, float], ...]


def mat_mul(a: Matrix, b: Matrix) -> Matrix:
    return tuple(
        tuple(sum(a[i][k] * b[k][j] for k in range(3)) for j in range(3))
        for i in range(3)
    )


def mat_vec(m: Matrix, v: Sequence[float]) -> tuple[float, float, float]:
    v0, v1, v2 = v[0], v[1], v[2]
    return (
        m[0][0] * v0 + m[0][1] * v1 + m[0][2] * v2,
        m[1][0] * v0 + m[1][1] * v1 + m[1][2] * v2,
        m[2][0] * v0 + m[2][1] * v1 + m[2][2] * v2,
    )


def mat_inv(m: Matrix) -> Matrix:
    (a, b, c), (d, e, f), (g, h, i) = m
    det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g)
    if abs(det) < 1e-12:
        raise ValueError("singular matrix")
    return (
        ((e * i - f * h) / det, (c * h - b * i) / det, (b * f - c * e) / det),
        ((f * g - d * i) / det, (a * i - c * g) / det, (c * d - a * f) / det),
        ((d * h - e * g) / det, (b * g - a * h) / det, (a * e - b * d) / det),
    )


# ─────────────────────────────────────────────────────────────────────────────
# WCAG 2.2 relative luminance and contrast ratio
# ─────────────────────────────────────────────────────────────────────────────

_WCAG_COEF = (0.2126, 0.7152, 0.0722)


def wcag_luminance(rgb: Sequence[float]) -> float:
    lin = linear_rgb(rgb)
    return sum(coef * chan for coef, chan in zip(_WCAG_COEF, lin))


def wcag_ratio(fg: Sequence[float], bg: Sequence[float]) -> float:
    l1, l2 = wcag_luminance(fg), wcag_luminance(bg)
    hi, lo = max(l1, l2), min(l1, l2)
    return (hi + 0.05) / (lo + 0.05)


# WCAG 2.2 SC 1.4.3 (AA), 1.4.6 (AAA), 1.4.11 (non-text) thresholds.
AA_TEXT, AAA_TEXT, AA_LARGE, AA_NONTEXT = 4.5, 7.0, 3.0, 3.0


def wcag_verdict(ratio: float, size_px: float, weight: int, non_text: bool = False) -> str:
    """Large text per WCAG: >=24px regular, or >=18.66px bold."""
    if non_text:
        return "AA" if ratio >= AA_NONTEXT else "Fail"
    large = size_px >= 24 or (size_px >= 18.66 and weight >= 700)
    if ratio >= AAA_TEXT:
        return "AAA"
    if ratio >= AA_TEXT:
        return "AA"
    if large and ratio >= AA_LARGE:
        return "AA-large"
    return "Fail"


# ─────────────────────────────────────────────────────────────────────────────
# APCA 0.1.9 — Accessible Perceptual Contrast Algorithm (SAPC-8, G-4g)
# ─────────────────────────────────────────────────────────────────────────────

SA98G = {
    "mainTRC": 2.4,
    "sRco": 0.2126729,
    "sGco": 0.7151522,
    "sBco": 0.0721750,
    "normBG": 0.56,
    "normTXT": 0.57,
    "revTXT": 0.62,
    "revBG": 0.65,
    "blkThrs": 0.022,
    "blkClmp": 1.414,
    "scaleBoW": 1.14,
    "scaleWoB": 1.14,
    "loBoWoffset": 0.027,
    "loWoBoffset": 0.027,
    "deltaYmin": 0.0005,
    "loClip": 0.1,
}


def apca_y(rgb: Sequence[float]) -> float:
    """APCA sRGBtoY: simple 2.4 exponent on each channel (not the IEC piecewise)."""
    r, g, b = (chan / 255.0 for chan in rgb)
    exp = SA98G["mainTRC"]
    return (
        SA98G["sRco"] * (r ** exp)
        + SA98G["sGco"] * (g ** exp)
        + SA98G["sBco"] * (b ** exp)
    )


def apca_lc(text_rgb: Sequence[float], bg_rgb: Sequence[float]) -> float:
    """Signed Lc. Negative => light text on dark background (WoB polarity)."""
    txt_y, bg_y = apca_y(text_rgb), apca_y(bg_rgb)
    if any(math.isnan(y) for y in (txt_y, bg_y)) or min(txt_y, bg_y) < 0 or max(txt_y, bg_y) > 1.1:
        return 0.0

    blk_thrs, blk_clmp = SA98G["blkThrs"], SA98G["blkClmp"]
    txt_y = txt_y if txt_y > blk_thrs else txt_y + (blk_thrs - txt_y) ** blk_clmp
    bg_y = bg_y if bg_y > blk_thrs else bg_y + (blk_thrs - bg_y) ** blk_clmp

    if abs(bg_y - txt_y) < SA98G["deltaYmin"]:
        return 0.0

    if bg_y > txt_y:  # normal polarity — dark text, light background
        sapc = (bg_y ** SA98G["normBG"] - txt_y ** SA98G["normTXT"]) * SA98G["scaleBoW"]
        out = 0.0 if sapc < SA98G["loClip"] else sapc - SA98G["loBoWoffset"]
    else:  # reverse polarity — light text, dark background
        sapc = (bg_y ** SA98G["revBG"] - txt_y ** SA98G["revTXT"]) * SA98G["scaleWoB"]
        out = 0.0 if sapc > -SA98G["loClip"] else sapc + SA98G["loWoBoffset"]
    return out * 100.0


# APCA font-size lookup table v0.1.7 (May 2022). Row = [Lc, size@100 … size@900].
# Sentinels: 999 prohibited, 777 non-text/spot only, 666 spot text only.
_APCA_FONT_TABLE: tuple[tuple[float, ...], ...] = (
    (0, 999, 999, 999, 999, 999, 999, 999, 999, 999),
    (10, 999, 999, 999, 999, 999, 999, 999, 999, 999),
    (15, 777, 777, 777, 777, 777, 777, 777, 777, 777),
    (20, 777, 777, 777, 777, 777, 777, 777, 777, 777),
    (25, 777, 777, 777, 120, 120, 108, 96, 96, 96),
    (30, 777, 777, 120, 108, 108, 96, 72, 72, 72),
    (35, 777, 120, 108, 96, 72, 60, 48, 48, 48),
    (40, 120, 108, 96, 60, 48, 42, 32, 32, 32),
    (45, 108, 96, 72, 42, 32, 28, 24, 24, 24),
    (50, 96, 72, 60, 32, 28, 24, 21, 21, 21),
    (55, 80, 60, 48, 28, 24, 21, 18, 18, 18),
    (60, 72, 48, 42, 24, 21, 18, 16, 16, 18),
    (65, 68, 46, 32, 21.75, 19, 17, 15, 16, 18),
    (70, 64, 44, 28, 19.5, 18, 16, 14.5, 16, 18),
    (75, 60, 42, 24, 18, 16, 15, 14, 16, 18),
    (80, 56, 38.25, 23, 17.25, 15.81, 14.81, 14, 16, 18),
    (85, 52, 34.5, 22, 16.5, 15.625, 14.625, 14, 16, 18),
    (90, 48, 32, 21, 16, 15.5, 14.5, 14, 16, 18),
    (95, 45, 28, 19.5, 15.5, 15, 14, 13.5, 16, 18),
    (100, 42, 26.5, 18.5, 15, 14.5, 13.5, 13, 16, 18),
    (105, 39, 25, 18, 14.5, 14, 13, 12, 16, 18),
    (110, 36, 24, 18, 14, 13, 12, 11, 16, 18),
    (115, 34.5, 22.5, 17.25, 12.5, 11.875, 11.25, 10.625, 14.5, 16.5),
    (120, 33, 21, 16.5, 11, 10.75, 10.5, 10.25, 13, 15),
    (125, 32, 20, 16, 10, 10, 10, 10, 12, 14),
)
_SENTINELS = {999, 777, 666}


def apca_min_lc(size_px: float, weight: int) -> float:
    """Smallest Lc at which a given size/weight is permitted by the APCA table.

    Inverts the published lookup: each cell is the *minimum* font size usable at
    that Lc for that weight. Interpolates between 5-Lc rows. Returns +inf when the
    table lists no readable size (sentinels), i.e. the text is not permitted.
    """
    col = 1 + max(0, min(8, (int(round(weight / 100.0)) - 1)))  # weight 100..900 -> col 1..9
    prev_lc, prev_size = None, None
    for row in _APCA_FONT_TABLE:
        lc, size = float(row[0]), float(row[col])
        if size in _SENTINELS:
            prev_lc, prev_size = lc, None
            continue
        if size <= size_px:
            if prev_size is None or prev_lc is None:
                return lc
            # linear interpolation between (prev_lc, prev_size) and (lc, size)
            span = prev_size - size
            if span <= 0:
                return lc
            frac = (prev_size - size_px) / span
            return round(prev_lc + frac * (lc - prev_lc), 2)
        prev_lc, prev_size = lc, size
    return float("inf")


def apca_verdict(lc: float, size_px: float, weight: int) -> str:
    need = apca_min_lc(size_px, weight)
    if need == float("inf"):
        return "Fail"
    return "Pass" if abs(lc) >= need else "Fail"


# ─────────────────────────────────────────────────────────────────────────────
# OKLab / OKLCh  (Björn Ottosson, 2020) — used by the remediation walk
# ─────────────────────────────────────────────────────────────────────────────

def oklab_from_linear(lin: Sequence[float]) -> tuple[float, float, float]:
    r, g, b = lin
    l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
    m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
    s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
    l_, m_, s_ = (math.copysign(abs(v) ** (1 / 3), v) for v in (l, m, s))
    return (
        0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
        1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
        0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
    )


def linear_from_oklab(lab: Sequence[float]) -> tuple[float, float, float]:
    L, a, b = lab
    l_ = L + 0.3963377774 * a + 0.2158037573 * b
    m_ = L - 0.1055613458 * a - 0.0638541728 * b
    s_ = L - 0.0894841775 * a - 1.2914855480 * b
    l, m, s = l_ ** 3, m_ ** 3, s_ ** 3
    return (
        +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
    )


def oklch(rgb: Sequence[float]) -> tuple[float, float, float]:
    L, a, b = oklab_from_linear(linear_rgb(rgb))
    return L, math.hypot(a, b), math.degrees(math.atan2(b, a)) % 360.0


def from_oklch(L: float, C: float, h_deg: float) -> tuple[int, int, int]:
    """OKLCh -> sRGB, reducing chroma as little as possible to stay in gamut."""
    rad = math.radians(h_deg)
    chroma = C
    for _ in range(48):
        lin = linear_from_oklab((L, chroma * math.cos(rad), chroma * math.sin(rad)))
        if all(-1e-6 <= c <= 1 + 1e-6 for c in lin):
            return encode_srgb(lin)
        chroma *= 0.94
        if chroma < 1e-4:
            break
    return encode_srgb(linear_from_oklab((L, 0.0, 0.0)))


def remediate(
    fg: Sequence[float],
    bg: Sequence[float],
    target: float = AA_TEXT,
    step: float = 0.0008,
    preserve_hue: bool = True,
) -> tuple[int, int, int]:
    """Nearest colour to `fg` (same OKLCh hue) that clears `target` WCAG ratio
    against `bg`. Walks lightness toward whichever end the background allows."""
    if wcag_ratio(fg, bg) >= target:
        return tuple(int(round(c)) for c in fg)  # already fine

    L0, C0, h0 = oklch(fg)
    bg_is_light = wcag_luminance(bg) >= 0.5
    direction = -1.0 if bg_is_light else 1.0

    best: tuple[int, int, int] | None = None
    L = L0
    for _ in range(int(1.0 / step) + 2):
        L += direction * step
        if not 0.0 <= L <= 1.0:
            break
        candidate = from_oklch(L, C0 if preserve_hue else 0.0, h0)
        if wcag_ratio(candidate, bg) >= target:
            best = candidate
            break
    if best is None:  # fall back to pure black/white, which always maximises ratio
        best = (0, 0, 0) if bg_is_light else (255, 255, 255)
    return best


# ─────────────────────────────────────────────────────────────────────────────
# Colour-vision-deficiency simulation — Viénot, Brettel & Mollon (1999)
# ─────────────────────────────────────────────────────────────────────────────

_XYZ_FROM_LINEAR_RGB: Matrix = (
    (0.409568, 0.355041, 0.179167),
    (0.213389, 0.706743, 0.079868),
    (0.0186297, 0.11462, 0.912367),
)
_LMS_FROM_XYZ: Matrix = (  # Smith & Pokorny (1975), recommended by Viénot 1999
    (0.15514, 0.54312, -0.03286),
    (-0.15514, 0.45684, 0.03286),
    (0.0, 0.0, 0.01608),
)
_LMS_FROM_LINEAR_RGB: Matrix = mat_mul(_LMS_FROM_XYZ, _XYZ_FROM_LINEAR_RGB)
_LINEAR_RGB_FROM_LMS: Matrix = mat_inv(_LMS_FROM_LINEAR_RGB)

# Projection onto the black-white-blue-yellow plane (protan/deutan) and the
# black-white-red-cyan plane (tritan single-plane approximation).
_H_PROTAN: Matrix = ((0.0, 2.02344377, -2.52580405), (0.0, 1.0, 0.0), (0.0, 0.0, 1.0))
_H_DEUTAN: Matrix = ((1.0, 0.0, 0.0), (0.49420696, 0.0, 1.24826995), (0.0, 0.0, 1.0))
_H_TRITAN: Matrix = ((1.0, 0.0, 0.0), (0.0, 1.0, 0.0), (-0.01224491, 0.07203435, 0.0))

CVD_MATRICES: dict[str, Matrix] = {
    "protan": mat_mul(mat_mul(_LINEAR_RGB_FROM_LMS, _H_PROTAN), _LMS_FROM_LINEAR_RGB),
    "deutan": mat_mul(mat_mul(_LINEAR_RGB_FROM_LMS, _H_DEUTAN), _LMS_FROM_LINEAR_RGB),
    "tritan": mat_mul(mat_mul(_LINEAR_RGB_FROM_LMS, _H_TRITAN), _LMS_FROM_LINEAR_RGB),
}

# raw LMS-space projections, kept for the reference-value test
_H_PROTAN_LMS_APPLIED = mat_mul(_H_PROTAN, _LMS_FROM_LINEAR_RGB)

CVD_PREVALENCE = {  # approximate population frequency, for weighting findings
    "protan": 0.010,   # ~1 in 100 males
    "deutan": 0.011,   # ~1 in 100 males, the most common
    "tritan": 0.0001,  # ~1 in 10,000, both sexes
}


def simulate_cvd(rgb: Sequence[float], kind: str) -> tuple[int, int, int]:
    """Full dichromacy simulation: sRGB -> linear -> LMS plane projection -> sRGB."""
    if kind not in CVD_MATRICES:
        raise ValueError(f"unknown CVD kind {kind!r}; expected one of {sorted(CVD_MATRICES)}")
    projected = mat_vec(CVD_MATRICES[kind], linear_rgb(rgb))
    return encode_srgb(projected)  # encode_srgb clamps to gamut


def oklab_distance(a: Sequence[float], b: Sequence[float]) -> float:
    """Perceptual distance in OKLab, scaled to roughly 0-100. Public formula."""
    la, lb = oklab_from_linear(linear_rgb(a)), oklab_from_linear(linear_rgb(b))
    return 100.0 * math.sqrt(sum((x - y) ** 2 for x, y in zip(la, lb)))


def cvd_pair_distinction(a: Sequence[float], b: Sequence[float]) -> dict[str, float]:
    """Do two colours stay *distinguishable* to a dichromat? 1.0 = no loss.

    Deliberately measured in OKLab distance, not contrast ratio. APCA contrast is
    a lightness-only quantity, so a red/green pair can collapse in hue yet retain
    its Lc — reporting that as "no CVD problem" would be wrong. Perceptual
    distance is what actually determines whether a farmer can tell two status
    colours apart.
    """
    base = oklab_distance(a, b)
    if base < 1e-6:
        return {kind: 1.0 for kind in CVD_MATRICES}
    return {
        kind: round(oklab_distance(simulate_cvd(a, kind), simulate_cvd(b, kind)) / base, 3)
        for kind in CVD_MATRICES
    }


def cvd_readability_retention(fg: Sequence[float], bg: Sequence[float]) -> dict[str, float]:
    """Does *text* on a chip stay readable for a dichromat? |Lc| after / |Lc| before.

    This one legitimately uses APCA — the question here is legibility against a
    background, which is exactly what APCA measures.
    """
    base = abs(apca_lc(fg, bg))
    if base < 1e-6:
        return {kind: 1.0 for kind in CVD_MATRICES}
    return {
        kind: round(abs(apca_lc(simulate_cvd(fg, kind), simulate_cvd(bg, kind))) / base, 3)
        for kind in CVD_MATRICES
    }


# Status colours are the app's actual alarm vocabulary; a healthy pig and a sick
# pig must never look alike to a colour-blind farmer.
STATUS_TOKENS = ("healthy", "watch", "alert", "info")
DISTINCTION_FLOOR = 0.60  # below this the pair is treated as collapsed


def status_confusion(tokens: dict[str, str]) -> list[dict]:
    """Every status-colour pairing, scored for how much CVD erases the difference."""
    rows: list[dict] = []
    for i, first in enumerate(STATUS_TOKENS):
        for second in STATUS_TOKENS[i + 1:]:
            if first not in tokens or second not in tokens:
                continue
            a, b = hex_to_rgb(tokens[first]), hex_to_rgb(tokens[second])
            loss = cvd_pair_distinction(a, b)
            worst = min(loss, key=lambda k: loss[k])
            rows.append(
                {
                    "pair": f"{first} vs {second}",
                    "a": tokens[first].upper(),
                    "b": tokens[second].upper(),
                    "delta_e": round(oklab_distance(a, b), 1),
                    **loss,
                    "worst": worst,
                    "collapsed": loss[worst] < DISTINCTION_FLOOR,
                }
            )
    return rows


# ─────────────────────────────────────────────────────────────────────────────
# Theme-token parsing — reads the *live* PigPulse theme.ts, no hard-coded palette
# ─────────────────────────────────────────────────────────────────────────────

# 2026-11-13: this used to be Path.home() / "pig-health-monitor/...". That
# breaks for any account other than the one the repo happened to live under
# (Path.home() is /root when root runs it, and the repo is under /home/solrahk),
# so the theme lookup raised FileNotFoundError. Resolve the repo root from
# this file instead: tools/a11y/<file> -> parents[2] is the repo root.
REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_THEME = (
    REPO_ROOT
    / "v3-mqtt-pocketbase/frontend/mobile_app/src/theme/theme.ts"
)
# .../mobile_app/src — handy for tests that need to assert on the components
# which consume these tokens.
APP_SRC = DEFAULT_THEME.parents[1]

_PALETTE_RE = re.compile(r"const\s+(lightColors|darkColors)\s*:\s*ThemeColors\s*=\s*\{(.*?)\n\};", re.S)
_TOKEN_RE = re.compile(r"^\s*([A-Za-z][A-Za-z0-9_]*)\s*:\s*'(#[0-9a-fA-F]{6})'\s*,", re.M)
_HC_RE = re.compile(r"export\s+const\s+highContrastTheme\s*:\s*Theme\s*=\s*\{\s*colors:\s*\{(.*?)\n\s*\},", re.S)


def parse_theme(path: Path = DEFAULT_THEME) -> dict[str, dict[str, str]]:
    """Extract light / dark / high-contrast token maps straight from theme.ts."""
    source = path.read_text(encoding="utf-8")

    palettes: dict[str, dict[str, str]] = {}
    for name, body in _PALETTE_RE.findall(source):
        palettes[name.replace("Colors", "")] = {
            key: value for key, value in _TOKEN_RE.findall(body)
        }
    if "dark" in palettes:
        high = dict(palettes["dark"])
        high_match = _HC_RE.search(source)
        if high_match:
            high.update({key: value for key, value in _TOKEN_RE.findall(high_match.group(1))})
        palettes["high"] = high
    if not palettes:
        raise ValueError(f"no colour palettes found in {path}")
    return palettes


# ─────────────────────────────────────────────────────────────────────────────
# The pairs PigPulse actually paints
# ─────────────────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class Pair:
    label: str
    fg: str
    bg: str
    fg_token: str
    bg_token: str
    size_px: float
    weight: int
    non_text: bool = False


# Sizes and weights are copied from typography{} in theme.ts, and the status pairs
# are the exact foreground/background combinations statusColor() returns. Two of
# them matter more than the rest: Badge.tsx paints its label with typography.label
# (11px / weight 600), and ListRow/StatRow paint the status colour straight onto the
# row background. Both are audited at the size they are really drawn at.
PAIRS: tuple[Pair, ...] = (
    Pair("screen body copy",        "textPrimary", "bg",            "textPrimary", "bg",            14.0, 400),
    Pair("card body copy",          "textPrimary", "surface",       "textPrimary", "surface",       14.0, 400),
    Pair("body small",              "textSecondary", "surface",     "textSecondary", "surface",     13.0, 400),
    Pair("secondary label",         "textSecondary", "surface",     "textSecondary", "surface",     12.5, 600),
    Pair("muted label on card",     "textMuted",   "surface",       "textMuted",   "surface",       12.5, 600),
    Pair("screen title",            "textPrimary", "bg",            "textPrimary", "bg",            20.0, 700),
    Pair("stat readout",            "textPrimary", "surface",       "textPrimary", "surface",       26.0, 700),
    Pair("primary button label",    "onAccent",    "accent",        "onAccent",    "accent",        14.0, 600),
    Pair("accent link text",        "accent",      "surface",       "accent",      "surface",       14.0, 400),
    Pair("badge label — healthy",   "healthy",     "healthySoft",   "healthy",     "healthySoft",   11.0, 600),
    Pair("badge label — watch",     "watch",       "watchSoft",     "watch",       "watchSoft",     11.0, 600),
    Pair("badge label — alert",     "alert",       "alertSoft",     "alert",       "alertSoft",     11.0, 600),
    Pair("badge label — info",      "info",        "infoSoft",      "info",        "infoSoft",      11.0, 600),
    Pair("badge label — neutral",   "textMuted",   "divider",       "textMuted",   "divider",       11.0, 600),
    Pair("row glyph — healthy",     "healthy",     "surface",       "healthy",     "surface",       11.0, 600),
    Pair("row glyph — watch",       "watch",       "surface",       "watch",       "surface",       11.0, 600),
    Pair("row glyph — alert",       "alert",       "surface",       "alert",       "surface",       11.0, 600),
    Pair("thermal value",           "thermal",     "surface",       "thermal",     "surface",       26.0, 700),
    Pair("card hairline boundary",  "divider",     "surface",       "divider",     "surface",        1.0, 400, True),
    Pair("input border on bg",      "divider",     "bg",            "divider",     "bg",             1.0, 400, True),
)

# Status colours are drawn as both a pill fill and a row glyph, so the floor for
# "can a colour-blind farmer still tell these two states apart" is the worse of
# the two renderings. Badge.tsx always prints its `label`, so hue is never the
# sole carrier — but the label still has to be legible, which is the audit below.


@dataclass
class Finding:
    palette: str
    label: str
    fg: str
    bg: str
    ratio: float
    lc: float
    wcag: str
    apca: str
    apca_needed: float | str
    cvd: dict[str, float]
    suggested_fg: str | None
    severity: str

    def as_dict(self) -> dict:
        return asdict(self)


def _severity(wcag: str, apca: str, non_text: bool) -> str:
    if non_text:
        return "ok" if wcag == "AA" else "fail"
    # WCAG "AAA" must never be graded as a failure: the two models answer
    # different questions, so a pair can be WCAG-AAA yet still sit below APCA's
    # size/weight guidance. That is a warning worth surfacing, not a defect.
    wcag_ok = wcag in ("AA", "AAA", "AA-large")
    if apca == "Pass" and wcag in ("AA", "AAA"):
        return "ok"
    if apca == "Pass" or wcag_ok:
        return "warn"
    return "fail"


def audit(palettes: dict[str, dict[str, str]]) -> dict[str, list[Finding]]:
    results: dict[str, list[Finding]] = {}
    for palette_name, tokens in palettes.items():
        rows: list[Finding] = []
        for pair in PAIRS:
            fg_hex, bg_hex = tokens.get(pair.fg_token), tokens.get(pair.bg_token)
            if fg_hex is None or bg_hex is None:
                continue
            fg, bg = hex_to_rgb(fg_hex), hex_to_rgb(bg_hex)
            ratio = wcag_ratio(fg, bg)
            lc = apca_lc(fg, bg)
            verdict_a = apca_verdict(lc, pair.size_px, pair.weight)
            verdict_w = wcag_verdict(ratio, pair.size_px, pair.weight, pair.non_text)
            need = apca_min_lc(pair.size_px, pair.weight)
            sev = _severity(verdict_w, verdict_a, pair.non_text)
            target = AA_NONTEXT if pair.non_text else (AAA_TEXT if pair.size_px >= 18 else AA_TEXT)
            suggested = None
            if sev != "ok":
                fixed = remediate(fg, bg, target=target if not pair.non_text else AA_NONTEXT)
                if rgb_to_hex(fixed) != rgb_to_hex(fg):
                    suggested = rgb_to_hex(fixed)
            rows.append(
                Finding(
                    palette=palette_name,
                    label=pair.label,
                    fg=fg_hex.upper(),
                    bg=bg_hex.upper(),
                    ratio=round(ratio, 2),
                    lc=round(lc, 1),
                    wcag=verdict_w,
                    apca=verdict_a,
                    apca_needed=("none" if need == float("inf") else need),
                    cvd=cvd_readability_retention(fg, bg),
                    suggested_fg=suggested,
                    severity=sev,
                )
            )
        results[palette_name] = rows
    return results


def scorecard(results: dict[str, list[Finding]]) -> dict:
    card = {}
    for palette, rows in results.items():
        fails = [r for r in rows if r.severity == "fail"]
        warns = [r for r in rows if r.severity == "warn"]
        cvd_risks = [r for r in rows if min(r.cvd.values()) < 0.6]
        card[palette] = {
            "pairs": len(rows),
            "pass": len(rows) - len(fails) - len(warns),
            "warn": len(warns),
            "fail": len(fails),
            "wcag_aa_rate": round(100 * sum(r.wcag in ("AA", "AAA", "AA-large") for r in rows) / max(1, len(rows)), 1),
            "apca_rate": round(100 * sum(r.apca == "Pass" for r in rows) / max(1, len(rows)), 1),
            "cvd_collapse_pairs": len(cvd_risks),
        }
    return card


# ─────────────────────────────────────────────────────────────────────────────
# CLI
# ─────────────────────────────────────────────────────────────────────────────

_SEV_MARK = {"ok": "PASS", "warn": "WARN", "fail": "FAIL"}


def _render_table(results: dict[str, list[Finding]]) -> str:
    lines: list[str] = []
    lines.append(
        "KNOWN AND ACCEPTED — Master was shown these fixes on 2026-11-13 and "
        "declined them;\nthe theme stays as it is. Do not apply the 'fix' column "
        "without a fresh explicit instruction."
    )
    for palette, rows in results.items():
        lines.append(f"\n=== palette: {palette} ===")
        lines.append(f"{'result':6} {'pair':24} {'fg':8} {'bg':8} {'WCAG':9} {'Lc':>7} {'need':>6}  CVD(min)  fix")
        lines.append("-" * 108)
        for r in rows:
            need = r.apca_needed if isinstance(r.apca_needed, str) else f"{r.apca_needed:g}"
            cvd_min = min(r.cvd.values())
            lines.append(
                f"{_SEV_MARK[r.severity]:6} {r.label:24} {r.fg:8} {r.bg:8} "
                f"{r.wcag:9} {r.lc:>7.1f} {need:>6}  {cvd_min:>6.2f}    {r.suggested_fg or '-'}"
            )
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="PigPulse accessibility contrast toolkit")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_audit = sub.add_parser("audit", help="score the live theme.ts palettes")
    p_audit.add_argument("--theme", type=Path, default=DEFAULT_THEME)
    p_audit.add_argument("--json", action="store_true")

    p_sim = sub.add_parser("simulate", help="show a colour pair through each dichromacy")
    p_sim.add_argument("fg")
    p_sim.add_argument("bg")

    p_fix = sub.add_parser("fix", help="suggest the nearest compliant foreground")
    p_fix.add_argument("fg")
    p_fix.add_argument("bg")
    p_fix.add_argument("--target", type=float, default=AA_TEXT)

    args = parser.parse_args(argv)

    if args.cmd == "audit":
        palettes = parse_theme(args.theme)
        results = audit(palettes)
        card = scorecard(results)
        confusion = {name: status_confusion(tokens) for name, tokens in palettes.items()}
        if args.json:
            print(json.dumps(
                {
                    "scorecard": card,
                    "findings": {k: [r.as_dict() for r in v] for k, v in results.items()},
                    "status_confusion": confusion,
                },
                indent=2,
            ))
            return 0
        print(_render_table(results))
        print("\n=== status colours under dichromacy (1.0 = no loss, <0.60 = collapsed) ===")
        for name, rows in confusion.items():
            for row in rows:
                flag = "COLLAPSED" if row["collapsed"] else "ok"
                print(
                    f"{name:6} {row['pair']:18} dE={row['delta_e']:5.1f}  "
                    f"protan={row['protan']:.2f} deutan={row['deutan']:.2f} "
                    f"tritan={row['tritan']:.2f}  {flag}"
                )
        print("\n=== scorecard ===")
        for palette, stats in card.items():
            print(
                f"{palette:6} pairs={stats['pairs']:2} pass={stats['pass']:2} warn={stats['warn']:2} "
                f"fail={stats['fail']:2}  WCAG-AA {stats['wcag_aa_rate']:5.1f}%  "
                f"APCA {stats['apca_rate']:5.1f}%  CVD-collapse pairs={stats['cvd_collapse_pairs']}"
            )
        return 0

    if args.cmd == "simulate":
        fg, bg = hex_to_rgb(args.fg), hex_to_rgb(args.bg)
        base = abs(apca_lc(fg, bg))
        print(f"original  fg={rgb_to_hex(fg)} bg={rgb_to_hex(bg)}  Lc={base:.1f}  ratio={wcag_ratio(fg, bg):.2f}:1")
        for kind in CVD_MATRICES:
            sf, sb = simulate_cvd(fg, kind), simulate_cvd(bg, kind)
            sim = abs(apca_lc(sf, sb))
            print(
                f"{kind:7}   fg={rgb_to_hex(sf)} bg={rgb_to_hex(sb)}  Lc={sim:5.1f}  "
                f"ratio={wcag_ratio(sf, sb):5.2f}:1  retention={0 if base < 1e-6 else sim / base:.2f}"
            )
        return 0

    if args.cmd == "fix":
        fg, bg = hex_to_rgb(args.fg), hex_to_rgb(args.bg)
        fixed = remediate(fg, bg, target=args.target)
        print(
            f"{rgb_to_hex(fg)} on {rgb_to_hex(bg)}: {wcag_ratio(fg, bg):.2f}:1 "
            f"-> {rgb_to_hex(fixed)}: {wcag_ratio(fixed, bg):.2f}:1 (target {args.target})"
        )
        return 0

    return 1


if __name__ == "__main__":
    sys.exit(main())
