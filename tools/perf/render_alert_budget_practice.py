"""Render the 800x1200 visual companion for today's PigPulse performance build."""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[3]
RESULT = json.loads(Path(__file__).with_name("alert_budget_benchmark_result.json").read_text())
OUTPUT = ROOT / ".hermes/cron/output/338018b9ac4a" / f"practice_{date.today():%Y-%m-%d}.png"
W, H = 800, 1200
BG, PANEL, INK, MUTED = "#08131f", "#10263a", "#f4fbff", "#a9c2d6"
TEAL, AMBER, RED, GREEN = "#47d7c7", "#ffc857", "#ff7777", "#77e39a"


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    name = "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"
    return ImageFont.truetype(f"/usr/share/fonts/truetype/dejavu/{name}", size)


def wrapped(draw: ImageDraw.ImageDraw, text: str, x: int, y: int, width: int, fnt: ImageFont.FreeTypeFont, fill: str) -> int:
    line = ""
    for word in text.split():
        candidate = f"{line} {word}".strip()
        if line and draw.textbbox((0, 0), candidate, font=fnt)[2] > width:
            draw.text((x, y), line, font=fnt, fill=fill)
            y = int(y + fnt.size + 7)
            line = word
        else:
            line = candidate
    if line:
        draw.text((x, y), line, font=fnt, fill=fill)
        y = int(y + fnt.size + 7)
    return y


def panel(draw: ImageDraw.ImageDraw, y: int, height: int, title: str, accent: str) -> None:
    draw.rounded_rectangle((32, y, 768, y + height), radius=18, fill=PANEL, outline="#24445d", width=2)
    draw.rounded_rectangle((32, y, 42, y + height), radius=5, fill=accent)
    draw.text((62, y + 19), title, font=font(24, True), fill=accent)


def main() -> None:
    image = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, W, 125), fill="#0d3148")
    draw.text((34, 23), "PIGPULSE PERFORMANCE BUILD", font=font(30, True), fill=INK)
    draw.text((35, 72), "Bounded alert budget for zone-level thermal screening", font=font(18), fill=TEAL)

    panel(draw, 149, 184, "PROBLEM + CONSTRAINTS", RED)
    wrapped(draw, "A thermal dashboard can waste CPU by rescanning every recent MLX90640 reading to recompute min, max, mean, fever count, and alert state.", 62, 199, 654, font(19), INK)
    draw.text((62, 286), "Constraints: bounded memory • streaming input • explainable zone alerts", font=font(16, True), fill=AMBER)

    panel(draw, 357, 220, "SOLUTION", TEAL)
    wrapped(draw, "AlertBudgetMonitor uses a FIFO deque, monotonic min/max deques, a running sum, and a fever counter. A WATCH or URGENT label comes from the fever ratio within the active window.", 62, 407, 650, font(19), INK)
    draw.text((62, 520), "Update and snapshot: amortized O(1). Storage: O(window size).", font=font(16, True), fill=GREEN)

    panel(draw, 601, 215, "CODE HIGHLIGHT", AMBER)
    code = "ratio = fever_samples / count\nlevel = \"URGENT\" if ratio >= urgent else\n        \"WATCH\" if ratio >= watch else \"HEALTHY\"\n\nwhile minimums and minimums[-1] > value:\n    minimums.pop()"
    draw.rounded_rectangle((61, 651, 739, 785), radius=10, fill="#071018")
    draw.multiline_text((78, 666), code, font=font(16), fill="#d9f4ff", spacing=7)

    panel(draw, 840, 242, "MEASURED RESULT", GREEN)
    draw.text((62, 890), f"{RESULT['samples']:,} samples | {RESULT['window']}-sample window | median of {RESULT['repeats']} runs", font=font(16), fill=MUTED)
    draw.text((63, 932), f"Naive rescan: {RESULT['naive_ms']:.3f} ms", font=font(25, True), fill=RED)
    draw.text((63, 974), f"Bounded monitor: {RESULT['optimized_ms']:.3f} ms", font=font(25, True), fill=TEAL)
    draw.text((63, 1017), f"{RESULT['speedup']:.2f}x faster | parity: {RESULT['parity']}", font=font(24, True), fill=GREEN)
    draw.text((62, 1054), "4 behavioral tests passed: state levels, de-escalation, statistics, invalid input.", font=font(15), fill=INK)

    draw.text((34, 1140), "Safety boundary: this is a zone anomaly prioritizer, not individual-pig fever diagnosis.", font=font(15, True), fill=TEAL)
    draw.text((34, 1171), "Research basis: Python documentation for deque and perf_counter_ns.", font=font(15), fill=MUTED)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    image.save(OUTPUT)
    print(OUTPUT)


if __name__ == "__main__":
    main()
