"""Render the 800x1200 visual companion for the telemetry performance build."""

from __future__ import annotations

import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[3]
RESULT = json.loads((Path(__file__).with_name("benchmark_result.json")).read_text())
OUTPUT = ROOT / ".hermes/cron/output/338018b9ac4a/practice_2026-11-05.png"
W, H = 800, 1200
BG, PANEL, INK, MUTED = "#08131f", "#10263a", "#f4fbff", "#a9c2d6"
TEAL, AMBER, RED, GREEN = "#47d7c7", "#ffc857", "#ff7777", "#77e39a"


def font(size: int, bold: bool = False):
    path = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
    return ImageFont.truetype(path, size)


def wrapped(draw: ImageDraw.ImageDraw, text: str, xy: tuple[int, int], width: int, fnt, fill: str, gap: int = 7) -> int:
    x, y = xy
    words, line = text.split(), ""
    for word in words:
        proposed = f"{line} {word}".strip()
        if draw.textbbox((0, 0), proposed, font=fnt)[2] > width and line:
            draw.text((x, y), line, font=fnt, fill=fill)
            y += fnt.size + gap
            line = word
        else:
            line = proposed
    if line:
        draw.text((x, y), line, font=fnt, fill=fill)
        y += fnt.size + gap
    return y


def panel(draw: ImageDraw.ImageDraw, y: int, height: int, title: str, accent: str) -> None:
    draw.rounded_rectangle((32, y, 768, y + height), radius=18, fill=PANEL, outline="#24445d", width=2)
    draw.rounded_rectangle((32, y, 42, y + height), radius=5, fill=accent)
    draw.text((62, y + 20), title, font=font(25, True), fill=accent)


def main() -> None:
    image = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, W, 126), fill="#0d3148")
    draw.text((34, 25), "PIGPULSE PERFORMANCE BUILD", font=font(31, True), fill=INK)
    draw.text((35, 73), "Bounded rolling thermal telemetry, measured not guessed", font=font(18), fill=TEAL)

    panel(draw, 150, 182, "THE BOTTLENECK", RED)
    wrapped(draw, "A dashboard that rescans its whole recent thermal window for every MLX90640 sample repeatedly computes min, max, mean, and fever count.", (62, 200), 665, font(20), INK)
    draw.text((62, 286), "Constraint: fixed memory, streaming input, no dependencies.", font=font(18, True), fill=AMBER)

    panel(draw, 356, 228, "SOLUTION", TEAL)
    wrapped(draw, "RollingTelemetry keeps one FIFO value deque, two monotonic deques for min and max, a running sum, and a fever counter.", (62, 406), 650, font(20), INK)
    draw.text((62, 506), "Each insert: expire one value -> update four summaries -> snapshot in O(1).", font=font(17, True), fill=GREEN)
    draw.text((62, 544), "Update cost is amortized O(1); storage is O(window size).", font=font(17), fill=MUTED)

    panel(draw, 610, 204, "CODE HIGHLIGHT", AMBER)
    code = "while minimums and minimums[-1] > value:\n    minimums.pop()\nminimums.append(value)\n\nmean_c = running_sum / sample_count"
    draw.rounded_rectangle((61, 660, 731, 782), radius=10, fill="#071018")
    draw.multiline_text((79, 675), code, font=font(18), fill="#d9f4ff", spacing=8)

    panel(draw, 840, 244, "MEASURED RESULT", GREEN)
    draw.text((62, 890), f"{RESULT['samples']:,} samples | {RESULT['window']}-sample window | median of {RESULT['repeats']} runs", font=font(17), fill=MUTED)
    draw.text((63, 932), f"Naive rescan: {RESULT['naive_ms']:.3f} ms", font=font(26, True), fill=RED)
    draw.text((63, 974), f"Bounded stream: {RESULT['optimized_ms']:.3f} ms", font=font(26, True), fill=TEAL)
    draw.text((63, 1020), f"{RESULT['speedup']:.2f}x faster | parity: {RESULT['parity']}", font=font(25, True), fill=GREEN)
    draw.text((62, 1055), "6 behavioral tests passed: eviction, extrema, threshold, empty, invalid input.", font=font(16), fill=INK)

    draw.text((34, 1142), "AGUA principle: preserve enough history to act, never waste cycles rediscovering it.", font=font(16, True), fill=TEAL)
    draw.text((34, 1171), "Research basis: Python docs for deque and perf_counter_ns.", font=font(15), fill=MUTED)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    image.save(OUTPUT)
    print(OUTPUT)


if __name__ == "__main__":
    main()
