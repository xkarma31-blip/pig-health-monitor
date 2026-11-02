#!/usr/bin/env python3
"""PigPulse cough / VAD clip extractor — offline, numpy only.

Takes the normalized 16 kHz mono WAVs produced by `normalize.py` and cuts
them into candidate event clips, then writes a JSON index the corpus builder
and the future classifier can both read.

Pipeline
--------
1. frame the signal (20 ms) and compute per-frame RMS
2. adaptive VAD: threshold = max(noise floor + rise, absolute floor), with
   short gaps merged so one cough is not split in two
3. per-segment features: crest factor, local rise over the background,
   high-frequency energy ratio, spectral flatness
4. label: `cough_candidate` when the segment is short, transient, loud
   against its own background and broadband; otherwise `noise_burst`
   (short but not transient enough) or `voice_like` (too long to be a cough)

Everything here runs on recorded files. No device is touched.

Usage
-----
    extract_clips.py clip.wav --out-dir clips/ --index clips/index.json
    extract_clips.py a.wav b.wav --out-dir clips/ --index clips/index.json
    extract_clips.py --selftest
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import wave
from array import array
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

# ------------------------------------------------------------------ tuning
FRAME_MS = 20            # analysis frame
NOISE_PERCENTILE = 20    # percentile of frame dBFS treated as background
RISE_DB = 8.0            # how far above the background a frame must sit
MIN_DBFS = -45.0         # absolute floor (silence never triggers VAD)
MIN_SEG_S = 0.08         # shorter than this is a click, not an event
MERGE_GAP_S = 0.25       # gaps shorter than this do not split a segment

COUGH_MAX_S = 0.80       # a cough is short
COUGH_CREST = 2.0        # peak/rms — transience
COUGH_RISE_DB = 8.0      # loudness above the local background
COUGH_HF_RATIO = 0.10    # share of energy above 1 kHz (broadband)
COUGH_SCORE_MIN = 0.35


def read_wav_mono(path: str) -> tuple[np.ndarray, int]:
    """Read a normalized WAV into float32 in [-1, 1]."""
    with wave.open(str(path), "rb") as w:
        if w.getnchannels() != 1:
            raise ValueError(f"{path}: expected mono, got {w.getnchannels()} ch")
        if w.getsampwidth() != 2:
            raise ValueError(f"{path}: expected 16-bit, got {w.getsampwidth() * 8}-bit")
        rate = w.getframerate()
        raw = w.readframes(w.getnframes())
    x = np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0
    return x, rate


def frame_rms(x: np.ndarray, frame_len: int) -> np.ndarray:
    n = len(x) // frame_len
    if n == 0:
        return np.zeros(0, dtype=np.float64)
    frames = x[: n * frame_len].reshape(n, frame_len).astype(np.float64)
    return np.sqrt(np.mean(frames * frames, axis=1))


def _dbfs(v: float | np.ndarray) -> float | np.ndarray:
    return 20.0 * np.log10(np.maximum(v, 1e-9))


def detect_segments(
    x: np.ndarray,
    rate: int,
    *,
    frame_ms: int = FRAME_MS,
    rise_db: float = RISE_DB,
    min_dbfs: float = MIN_DBFS,
    min_seg_s: float = MIN_SEG_S,
    merge_gap_s: float = MERGE_GAP_S,
) -> tuple[list[tuple[float, float]], float, float]:
    """Adaptive VAD. Returns (segments, threshold_dbfs, noise_dbfs)."""
    frame_len = max(1, int(rate * frame_ms / 1000))
    rms = frame_rms(x, frame_len)
    if rms.size == 0:
        return [], min_dbfs, min_dbfs
    dbfs = _dbfs(rms)
    noise_db = float(np.percentile(dbfs, NOISE_PERCENTILE))
    thr = max(noise_db + rise_db, min_dbfs)
    active = dbfs > thr

    runs: list[tuple[int, int]] = []
    i = 0
    while i < active.size:
        if active[i]:
            j = i
            while j + 1 < active.size and active[j + 1]:
                j += 1
            runs.append((i, j))
            i = j + 1
        else:
            i += 1

    gap_frames = int(merge_gap_s * 1000 / frame_ms)
    merged: list[tuple[int, int]] = []
    for r in runs:
        if merged and r[0] - merged[-1][1] - 1 <= gap_frames:
            merged[-1] = (merged[-1][0], r[1])
        else:
            merged.append(r)

    total_s = len(x) / rate
    segs: list[tuple[float, float]] = []
    for a, b in merged:
        start_s = a * frame_len / rate
        end_s = min((b + 1) * frame_len / rate, total_s)
        if end_s - start_s < min_seg_s:
            continue
        segs.append((start_s, end_s))
    return segs, thr, noise_db


def segment_features(
    x: np.ndarray, rate: int, start_s: float, end_s: float
) -> dict:
    """Transient / spectral / level features for one segment."""
    a = max(0, int(start_s * rate))
    b = min(len(x), int(end_s * rate))
    seg = x[a:b]
    if seg.size == 0:
        return {}
    seg64 = seg.astype(np.float64)
    peak = float(np.max(np.abs(seg64)))
    rms = float(np.sqrt(np.mean(seg64 * seg64)))
    crest = peak / rms if rms > 0 else 0.0

    # Local background: the 0.5 s of the FULL signal immediately before the
    # segment. (Slicing the segment itself would always yield an empty or
    # nonsense background and collapse rise_db to 0.)
    bg_start = max(0, a - int(0.5 * rate))
    bg = x[bg_start:a].astype(np.float64)
    if bg.size:
        bg_rms = float(np.sqrt(np.mean(bg * bg)))
    else:
        bg_rms = rms
    rise_db = float(_dbfs(rms) - _dbfs(bg_rms))

    # spectrum: broadband-ness (share of energy above 1 kHz) and flatness
    n = min(seg.size, 4096)
    win = seg64[:n] * np.hanning(n)
    power = np.abs(np.fft.rfft(win)) ** 2
    freqs = np.fft.rfftfreq(n, 1.0 / rate)
    total = float(power.sum())
    hf_ratio = float(power[freqs >= 1000].sum() / total) if total > 0 else 0.0
    if total > 0 and power.size > 1:
        p = power[power > 0]
        flatness = float(np.exp(np.mean(np.log(p))) / np.mean(p))
    else:
        flatness = 0.0

    return {
        "rms_dbfs": round(float(_dbfs(rms)), 2),
        "peak_dbfs": round(float(_dbfs(peak)), 2),
        "crest": round(crest, 3),
        "rise_db": round(rise_db, 2),
        "hf_ratio": round(hf_ratio, 4),
        "flatness": round(flatness, 5),
    }


def classify(feat: dict, dur_s: float) -> tuple[str, float]:
    """Label one segment. Returns (label, score in 0..1)."""
    if dur_s > COUGH_MAX_S:
        return "voice_like", 0.0
    if feat.get("crest", 0) < COUGH_CREST or feat.get("rise_db", 0) < COUGH_RISE_DB:
        return "noise_burst", 0.0
    if feat.get("hf_ratio", 0) < COUGH_HF_RATIO:
        return "voice_like", 0.0
    crest_score = min(1.0, (feat["crest"] - COUGH_CREST) / 8.0)
    rise_score = min(1.0, (feat["rise_db"] - COUGH_RISE_DB) / 18.0)
    hf_score = min(1.0, feat["hf_ratio"] / 0.30)
    score = 0.35 * crest_score + 0.40 * rise_score + 0.25 * hf_score
    if score < COUGH_SCORE_MIN:
        return "noise_burst", round(score, 3)
    return "cough_candidate", round(score, 3)


def write_clip(x: np.ndarray, rate: int, start_s: float, end_s: float, out: Path) -> None:
    a = max(0, int(start_s * rate))
    b = min(len(x), int(end_s * rate))
    samples = np.clip(x[a:b], -1.0, 1.0)
    pcm = array("h", (int(v * 32767) for v in samples))
    with wave.open(str(out), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm.tobytes())


def analyze_file(path: str, *, out_dir: Path | None = None) -> dict:
    """Run the whole detector over one normalized WAV."""
    x, rate = read_wav_mono(path)
    segs, thr, noise_db = detect_segments(x, rate)
    stem = Path(path).stem
    clips: list[dict] = []
    for i, (start_s, end_s) in enumerate(segs):
        feat = segment_features(x, rate, start_s, end_s)
        dur = end_s - start_s
        label, score = classify(feat, dur)
        clip = {
            "id": f"{stem}_{i:04d}",
            "source": str(path),
            "start_s": round(start_s, 3),
            "end_s": round(end_s, 3),
            "duration_s": round(dur, 3),
            "label": label,
            "score": score,
            **feat,
        }
        if out_dir is not None:
            out_dir.mkdir(parents=True, exist_ok=True)
            clip_path = out_dir / f"{clip['id']}.wav"
            write_clip(x, rate, start_s, end_s, clip_path)
            clip["clip_path"] = str(clip_path)
        clips.append(clip)
    return {
        "path": str(path),
        "rate": rate,
        "duration_s": round(len(x) / rate, 3),
        "noise_dbfs": round(noise_db, 2),
        "threshold_dbfs": round(thr, 2),
        "segments": len(segs),
        "clips": clips,
    }


# ---------------------------------------------------------------- self test

def _write_wav(path: Path, samples: np.ndarray, rate: int) -> None:
    pcm = array("h", (int(np.clip(v, -1.0, 1.0) * 32767) for v in samples))
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm.tobytes())


def _synthetic(rate: int = 16000, seconds: float = 3.0, cough_at: float | None = 1.0) -> np.ndarray:
    """Barn-ish background (steady low noise) plus an optional cough burst."""
    rng = np.random.default_rng(20261102)
    n = int(rate * seconds)
    t = np.arange(n) / rate
    bg = 0.01 * rng.standard_normal(n)
    bg += 0.004 * np.sin(2 * math.pi * 120 * t)      # steady fan/vent hum
    if cough_at is not None:
        start = int(cough_at * rate)
        length = int(0.30 * rate)
        env = np.exp(-np.arange(length) / (0.06 * rate))
        burst = rng.standard_normal(length) * env * 0.45
        # broadband, like a real cough
        burst += 0.12 * env * rng.standard_normal(length)
        bg[start:start + length] += burst
    return bg.astype(np.float32)


def selftest() -> int:
    import tempfile

    tmp = Path(tempfile.mkdtemp(prefix="pigpulse-vad-"))
    failures: list[str] = []

    def check(cond: bool, msg: str) -> None:
        if not cond:
            failures.append(msg)

    try:
        # 1. background only -> no cough candidates
        quiet = tmp / "quiet.wav"
        _write_wav(quiet, _synthetic(cough_at=None), 16000)
        res_q = analyze_file(str(quiet))
        coughs_q = [c for c in res_q["clips"] if c["label"] == "cough_candidate"]
        check(not coughs_q, f"background-only produced {len(coughs_q)} cough candidates")

        # 2. one cough at 1.0 s -> exactly one candidate, correctly placed
        noisy = tmp / "noisy.wav"
        _write_wav(noisy, _synthetic(cough_at=1.0), 16000)
        res_n = analyze_file(str(noisy))
        coughs = [c for c in res_n["clips"] if c["label"] == "cough_candidate"]
        check(len(coughs) == 1, f"expected 1 cough candidate, got {len(coughs)}")
        if coughs:
            c = coughs[0]
            check(abs(c["start_s"] - 1.0) < 0.20,
                  f"cough start {c['start_s']} not within 0.2 s of 1.0")
            check(0.10 <= c["duration_s"] <= COUGH_MAX_S,
                  f"cough duration {c['duration_s']} outside the cough range")
            check(c["rise_db"] >= COUGH_RISE_DB,
                  f"cough rise_db {c['rise_db']} below threshold")
            check(c["hf_ratio"] >= COUGH_HF_RATIO,
                  f"cough hf_ratio {c['hf_ratio']} below threshold")

        # 3. clip export writes a readable mono 16 kHz WAV
        out_dir = tmp / "clips"
        res_e = analyze_file(str(noisy), out_dir=out_dir)
        if res_e["clips"]:
            p = res_e["clips"][0]["clip_path"]
            x, rate = read_wav_mono(p)
            check(rate == 16000, f"exported clip rate {rate} != 16000")
            check(x.size > 0, "exported clip is empty")
    finally:
        for f in tmp.rglob("*"):
            if f.is_file():
                try:
                    f.unlink()
                except OSError:
                    pass
        for d in sorted(tmp.glob("*"), reverse=True):
            try:
                d.rmdir()
            except OSError:
                pass
        try:
            tmp.rmdir()
        except OSError:
            pass

    if failures:
        print("VAD SELFTEST FAILED:")
        for f in failures:
            print("  -", f)
        return 1
    print("extract_clips selftest OK "
          "(quiet background -> 0 candidates, injected cough -> 1 at 1.0 s)")
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("inputs", nargs="*", help="normalized 16 kHz mono WAV files")
    ap.add_argument("--out-dir", help="write each detected clip as a WAV here")
    ap.add_argument("--index", help="write the JSON index here")
    ap.add_argument("--selftest", action="store_true", help="run the built-in checks")
    args = ap.parse_args(argv)

    if args.selftest:
        return selftest()
    if not args.inputs:
        ap.error("at least one input WAV is required (or use --selftest)")

    out_dir = Path(args.out_dir) if args.out_dir else None
    sources = []
    all_clips: list[dict] = []
    for src in args.inputs:
        res = analyze_file(src, out_dir=out_dir)
        sources.append({k: v for k, v in res.items() if k != "clips"})
        all_clips.extend(res["clips"])

    index = {
        "schema": "pigpulse-audio-clips/1",
        "generated_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "normalizer": "16 kHz mono s16le WAV",
        "sources": sources,
        "clips": all_clips,
        "counts": {
            "sources": len(sources),
            "clips": len(all_clips),
            "cough_candidates": sum(1 for c in all_clips if c["label"] == "cough_candidate"),
        },
    }
    text = json.dumps(index, indent=2)
    if args.index:
        p = Path(args.index)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text + "\n")
        print(f"index -> {p} ({index['counts']})")
    else:
        print(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
