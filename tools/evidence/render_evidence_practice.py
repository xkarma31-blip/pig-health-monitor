#!/usr/bin/env python3
"""Render the Sunday PigPulse evidence-ledger build card (800x1200)."""
from __future__ import annotations

from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

OUT = Path.home() / ".hermes/cron/output/338018b9ac4a/practice_2026-11-08.png"
W, H = 800, 1200
BG, PANEL, TEXT, MUTED = "#07111F", "#10243A", "#F5FAFF", "#B9CAE0"
CYAN, GREEN, AMBER, RED = "#38D9FF", "#58E39B", "#FFD166", "#FF6B6B"


def font(size: int, bold: bool = False):
    path = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
    return ImageFont.truetype(path, size)


def wrapped(draw: ImageDraw.ImageDraw, text: str, x: int, y: int, width: int, size: int, color: str, leading: int = 8):
    f = font(size)
    words, line, lines = text.split(), "", []
    for word in words:
        proposal = (line + " " + word).strip()
        if draw.textlength(proposal, font=f) <= width:
            line = proposal
        else:
            lines.append(line)
            line = word
    if line:
        lines.append(line)
    step = size + leading
    for item in lines:
        draw.text((x, y), item, font=f, fill=color)
        y += step
    return y


def block(draw, y, title, body, accent):
    draw.rounded_rectangle((32, y, 768, y + 190), radius=18, fill=PANEL, outline=accent, width=2)
    draw.rectangle((32, y, 42, y + 190), fill=accent)
    draw.text((62, y + 24), title, font=font(26, True), fill=accent)
    wrapped(draw, body, 62, y + 68, 660, 21, TEXT)


image = Image.new("RGB", (W, H), BG)
draw = ImageDraw.Draw(image)
draw.text((32, 36), "PIGPULSE · SUNDAY BUILD", font=font(23, True), fill=CYAN)
draw.text((32, 78), "Evidence Ledger Validator", font=font(39, True), fill=TEXT)
draw.text((32, 132), "Make research claims auditable before they enter the capstone.", font=font(20), fill=MUTED)
draw.line((32, 175, 768, 175), fill=CYAN, width=3)

block(draw, 205, "PROBLEM + CONSTRAINTS", "A valid-looking source can still overclaim: a design battery estimate may be reported as verified field performance. The tool must work offline, use only Python standard library, and keep a full JSON audit trail.", RED)
block(draw, 425, "SOLUTION", "Validate every claim's ID, source locator, ISO retrieval date, evidence class, lifecycle status, and verification basis. Policy gate: design_estimate plus verified is rejected; field measurements require reproducible context.", CYAN)
block(draw, 645, "CODE HIGHLIGHTS", "validate_ledger() aggregates deterministic diagnostics. validate_file() bounds input to 1 MB and handles bad JSON safely. main() produces readable text or canonical JSON with a nonzero exit code on policy failure.", AMBER)
block(draw, 865, "REAL TEST RESULTS", "8 of 8 unittest cases passed. Valid 3-claim ledger: PASS, 0 errors. Deliberately relabeling a battery projection as verified: rejected with unsupported_verified_status and exit code 1.", GREEN)

draw.text((32, 1092), "Scope boundary", font=font(21, True), fill=AMBER)
wrapped(draw, "Structural provenance validation only — it does not fetch URLs or certify scientific truth.", 32, 1128, 720, 19, MUTED, 6)
draw.text((32, 1170), "Python stdlib · unittest · JSON diagnostics · PigPulse v3", font=font(18, True), fill=CYAN)
OUT.parent.mkdir(parents=True, exist_ok=True)
image.save(OUT)
print(OUT)
