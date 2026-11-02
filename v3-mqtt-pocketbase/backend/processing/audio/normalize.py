#!/usr/bin/env python3
"""PigPulse audio normalizer — one shared schema for every audio source.

Every audio source on the farm speaks a different dialect:

  * ESP32-S3 INMP441 mic  — 48 kHz, s16le, 2 channels (TCP :9090)
  * Tapo C200 camera      — A-law, 8 kHz, 1 channel (RTSP + SD-card MP4)
  * Anything recorded for later analysis — whatever the device happened to emit

They are all normalized to ONE on-disk format:

    16 000 Hz, mono, signed 16-bit little-endian PCM, RIFF/WAVE

That is the whole point. The cough classifier must not care which microphone
produced a clip — only that the format is identical. ffmpeg does the
resampling and channel mixing (a hand-rolled resampler would be slower and
wrong); this script adds no dependency.

Usage
-----
    normalize.py clip.mp4 -o clip.wav
    normalize.py mic.pcm --raw-format s16le --raw-rate 48000 --raw-channels 2 -o mic.wav
    normalize.py rtsp://host:554/stream1 --duration 10 -o live.wav
    normalize.py clip.mp4 --probe          # source stream facts, no re-encode
    normalize.py --selftest
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import wave
from array import array
from pathlib import Path

TARGET_RATE = 16000
TARGET_CHANNELS = 1
TARGET_SAMPLE_WIDTH = 2  # bytes — signed 16-bit


def ffmpeg_bin() -> str:
    return os.getenv("FFMPEG_BIN", "ffmpeg") or "ffmpeg"


def ffprobe_bin() -> str:
    return os.getenv("FFPROBE_BIN", "ffprobe") or "ffprobe"


def source_args(
    src: str,
    raw_format: str | None = None,
    raw_rate: int | None = None,
    raw_channels: int | None = None,
) -> list[str]:
    """ffmpeg *input* arguments for `src`.

    Raw PCM has no header, so the format/rate/channel count must be supplied
    by the caller. RTSP uses TCP transport: the barn AP is lossy and UDP
    would silently drop frames that the VAD would then read as gaps.
    """
    if raw_format:
        args = ["-f", raw_format]
        if raw_rate:
            args += ["-ar", str(raw_rate)]
        if raw_channels:
            args += ["-ac", str(raw_channels)]
        return args + ["-i", src]
    if src.startswith("rtsp://"):
        return ["-rtsp_transport", "tcp", "-i", src]
    return ["-i", src]


def probe_source(path: str) -> dict:
    """Source stream facts via ffprobe — the measurement that proves an audio
    track exists at all (the Tapo C200 carries A-law, not AAC)."""
    cmd = [
        ffprobe_bin(), "-v", "error", "-select_streams", "a:0",
        "-show_entries",
        "stream=codec_name,sample_rate,channels,bits_per_sample,bit_rate",
        "-show_entries", "format=duration,format_name",
        "-of", "json", str(path),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if proc.returncode != 0:
        return {"error": proc.stderr.strip()[-400:], "path": str(path)}
    data = json.loads(proc.stdout or "{}")
    stream = (data.get("streams") or [{}])[0]
    fmt = data.get("format") or {}
    rate = stream.get("sample_rate")
    dur = fmt.get("duration")
    return {
        "path": str(path),
        "codec": stream.get("codec_name"),
        "sample_rate": int(rate) if rate else None,
        "channels": stream.get("channels"),
        "bits_per_sample": stream.get("bits_per_sample"),
        "bit_rate": stream.get("bit_rate"),
        "format_name": fmt.get("format_name"),
        "duration_s": round(float(dur), 3) if dur else None,
    }


def probe_wav(path: str) -> dict:
    """Facts about a normalized WAV, read with the stdlib `wave` module."""
    with wave.open(str(path), "rb") as w:
        frames = w.getnframes()
        rate = w.getframerate()
        return {
            "path": str(path),
            "rate": rate,
            "channels": w.getnchannels(),
            "sample_width_bytes": w.getsampwidth(),
            "frames": frames,
            "duration_s": round(frames / rate, 3) if rate else 0.0,
        }


def normalize(
    src: str,
    out_path: str,
    *,
    raw_format: str | None = None,
    raw_rate: int | None = None,
    raw_channels: int | None = None,
    duration: float | None = None,
    timeout: int = 600,
) -> dict:
    """Convert `src` to 16 kHz mono s16 WAV at `out_path`. Returns its facts."""
    cmd = [ffmpeg_bin(), "-hide_banner", "-nostdin", "-y", "-loglevel", "error"]
    cmd += source_args(src, raw_format, raw_rate, raw_channels)
    cmd += ["-vn", "-sn", "-dn"]
    if duration:
        cmd += ["-t", str(duration)]
    cmd += [
        "-ac", str(TARGET_CHANNELS),
        "-ar", str(TARGET_RATE),
        "-c:a", "pcm_s16le",
        "-f", "wav",
        str(out_path),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if proc.returncode != 0:
        raise RuntimeError(
            f"ffmpeg failed ({proc.returncode}) for {src}: "
            f"{proc.stderr.strip()[-500:]}"
        )
    return probe_wav(out_path)


# ---------------------------------------------------------------- self test

def _write_test_wav(path: Path, rate: int, channels: int, seconds: float) -> None:
    """A 440 Hz tone, phase-shifted on the right channel (stdlib only)."""
    import math

    n = int(rate * seconds)
    buf = array("h")
    for i in range(n):
        t = i / rate
        left = int(0.4 * 32767 * math.sin(2 * math.pi * 440 * t))
        right = int(0.3 * 32767 * math.sin(2 * math.pi * 440 * t + 0.7))
        buf.append(left)
        if channels == 2:
            buf.append(right)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(channels)
        w.setsampwidth(TARGET_SAMPLE_WIDTH)
        w.setframerate(rate)
        w.writeframes(buf.tobytes())


def selftest() -> int:
    import tempfile

    tmp = Path(tempfile.mkdtemp(prefix="pigpulse-norm-"))
    failures: list[str] = []

    def check(cond: bool, msg: str) -> None:
        if not cond:
            failures.append(msg)

    try:
        # 1. container input (the Tapo SD-card shape: 48 kHz stereo container)
        src = tmp / "container.wav"
        _write_test_wav(src, 48000, 2, 0.5)
        out = tmp / "container.norm.wav"
        facts = normalize(str(src), str(out))
        check(facts["rate"] == TARGET_RATE, f"rate {facts['rate']} != {TARGET_RATE}")
        check(facts["channels"] == TARGET_CHANNELS,
              f"channels {facts['channels']} != {TARGET_CHANNELS}")
        check(facts["sample_width_bytes"] == TARGET_SAMPLE_WIDTH,
              f"width {facts['sample_width_bytes']} != {TARGET_SAMPLE_WIDTH}")
        expect = 0.5 * TARGET_RATE
        check(abs(facts["frames"] - expect) < expect * 0.02,
              f"frames {facts['frames']} not within 2% of {expect:.0f}")

        # the tone must survive the resample (not silence)
        with wave.open(str(out), "rb") as w:
            data = array("h", w.readframes(w.getnframes()))
        peak = max(abs(v) for v in data) / 32768.0
        check(peak > 0.2, f"normalized peak {peak:.3f} too low (silent output?)")

        # 2. raw PCM input (the ESP32-S3 shape: headerless s16le 48 kHz stereo)
        raw = tmp / "mic.pcm"
        _write_test_wav(src, 48000, 2, 0.5)
        raw.write_bytes(Path(src).read_bytes())  # same samples, header stripped
        out2 = tmp / "mic.norm.wav"
        facts2 = normalize(
            str(raw), str(out2),
            raw_format="s16le", raw_rate=48000, raw_channels=2,
        )
        check(facts2["rate"] == TARGET_RATE, "raw: rate not normalized")
        check(facts2["channels"] == TARGET_CHANNELS, "raw: channels not mixed down")
        check(abs(facts2["frames"] - expect) < expect * 0.02, "raw: frame count off")

        # 3. source probe reports the ORIGINAL format (evidence, not guesswork)
        probe = probe_source(str(src))
        check(probe.get("sample_rate") == 48000,
              f"probe sample_rate {probe.get('sample_rate')} != 48000")
        check(probe.get("channels") == 2,
              f"probe channels {probe.get('channels')} != 2")
    finally:
        for f in tmp.glob("*"):
            try:
                f.unlink()
            except OSError:
                pass
        try:
            tmp.rmdir()
        except OSError:
            pass

    if failures:
        print("NORMALIZE SELFTEST FAILED:")
        for f in failures:
            print("  -", f)
        return 1
    print("normalize selftest OK "
          f"(container + raw PCM -> {TARGET_RATE} Hz mono s16 WAV)")
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("source", nargs="?", help="file or rtsp:// URL to normalize")
    ap.add_argument("-o", "--output", help="output .wav (default: <stem>.16k-mono.wav)")
    ap.add_argument("--raw-format", help="input PCM format, e.g. s16le (headerless input)")
    ap.add_argument("--raw-rate", type=int, help="input sample rate for raw PCM")
    ap.add_argument("--raw-channels", type=int, help="input channel count for raw PCM")
    ap.add_argument("--duration", type=float, help="only take the first N seconds")
    ap.add_argument("--probe", action="store_true",
                    help="report the source stream format and exit")
    ap.add_argument("--json", action="store_true", help="print the result as JSON")
    ap.add_argument("--selftest", action="store_true", help="run the built-in checks")
    args = ap.parse_args(argv)

    if args.selftest:
        return selftest()
    if not args.source:
        ap.error("source is required (or use --selftest)")

    if args.probe:
        print(json.dumps(probe_source(args.source), indent=2))
        return 0

    out = args.output or (str(Path(args.source).stem) + ".16k-mono.wav")
    facts = normalize(
        args.source, out,
        raw_format=args.raw_format,
        raw_rate=args.raw_rate,
        raw_channels=args.raw_channels,
        duration=args.duration,
    )
    if args.json:
        print(json.dumps(facts, indent=2))
    else:
        print(
            f"normalized -> {facts['path']} "
            f"({facts['rate']} Hz, {facts['channels']} ch, "
            f"{facts['duration_s']} s, {facts['frames']} frames)"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
