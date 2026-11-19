#!/usr/bin/env python3
"""Audio-quality gate for the PigPulse cough classifier.

Reads a short RAW window from the SAME loopback endpoint the classifier uses
(`/esp/stream?rate=16000&raw=1`) and decides whether the mic is fit to feed the
model. It never connects to TCP :9090 (single client; that would evict the mic).

The gate exists because `pigpulse-cough.service` is guarded by
`ConditionPathExists=/run/pigpulse/audio-ok`: the classifier must not run on
zeros, a constant line, or a clipped signal. Zeros mean nothing is driving the
input — NOT a quiet room.

Usage:
  audio_gate.py              # measure only; print JSON + PASS/FAIL, exit 0/1
  audio_gate.py --enforce    # also write/remove /run/pigpulse/audio-ok
                             # (must run as root) and stop a running classifier
                             # on a transition to bad audio.
"""

from __future__ import annotations

import argparse
import array
import json
import math
import ssl
import sys
import urllib.request

URL = "https://127.0.0.1:8080/esp/stream?rate=16000&raw=1"
FLAG = "/run/pigpulse/audio-ok"
SAMPLE_RATE = 16000
WINDOW_S = 2.0
BYTES = int(SAMPLE_RATE * WINDOW_S) * 2  # s16le mono after downmix

# Thresholds are deliberately coarse: they reject null/dead/constant/clipped
# input, not "quiet but real" barn audio. Tune only with a measured capture.
MIN_NONZERO_PCT = 50.0
MIN_RMS = 20.0
MAX_ABS_DC = 800.0
MAX_CLIP_PCT = 1.0
MIN_DIFF_MEAN = 3.0


def fetch() -> array.array:
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    with urllib.request.urlopen(URL, timeout=10, context=ctx) as r:
        data = r.read(BYTES)
    if len(data) < BYTES // 2:
        raise ValueError(f"short read: {len(data)} of {BYTES} bytes")
    a = array.array("h")
    a.frombytes(data[: BYTES - (BYTES % 2)])
    if sys.byteorder != "little":
        a.byteswap()
    return a


def measure(a: array.array) -> dict:
    n = len(a)
    if not n:
        return {"samples": 0, "pass": False, "reason": "empty stream"}
    total = sum(a)
    mean = total / n
    rms = math.sqrt(sum(float(v) * v for v in a) / n)
    nonzero = 100.0 * sum(1 for v in a if v != 0) / n
    clip = 100.0 * sum(1 for v in a if abs(v) >= 32700) / n
    diff = sum(abs(a[i + 1] - a[i]) for i in range(n - 1)) / max(1, n - 1)
    m = {
        "samples": n, "rms": round(rms, 2), "dc": round(mean, 2),
        "nonzero_pct": round(nonzero, 2), "clip_pct": round(clip, 3),
        "diff_mean": round(diff, 2),
    }
    reasons = []
    if nonzero < MIN_NONZERO_PCT:
        reasons.append("null_or_sparse")
    if rms < MIN_RMS:
        reasons.append("below_level")
    if abs(mean) > MAX_ABS_DC:
        reasons.append("dc_offset")
    if clip > MAX_CLIP_PCT:
        reasons.append("clipping")
    if diff < MIN_DIFF_MEAN:
        reasons.append("constant_line")
    m["reason"] = ",".join(reasons) if reasons else "ok"
    m["pass"] = not reasons
    return m


def enforce(good: bool, result: dict) -> None:
    import os
    import subprocess
    from pathlib import Path
    flag = Path(FLAG)
    existed = flag.exists()
    if good:
        flag.parent.mkdir(parents=True, exist_ok=True)
        flag.touch(mode=0o644, exist_ok=True)
    elif existed:
        flag.unlink(missing_ok=True)
        # Only stop on a transition to bad; a service that was never started
        # by the gate needs no action.
        subprocess.run(["systemctl", "stop", "pigpulse-cough.service"],
                       capture_output=True, timeout=15)
    if not good and not existed:
        return
    os.chmod(FLAG, 0o644) if good else None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--enforce", action="store_true",
                    help="write/remove the audio-ok flag (root only)")
    args = ap.parse_args()
    try:
        result = measure(fetch())
    except Exception as e:
        result = {"pass": False, "reason": f"fetch_error: {type(e).__name__}: {e}"}
        print(json.dumps(result))
        if args.enforce:
            enforce(False, result)
        return 1
    print(json.dumps(result, sort_keys=True))
    if args.enforce:
        try:
            enforce(result["pass"], result)
        except Exception as e:
            print(json.dumps({"enforce_error": f"{type(e).__name__}: {e}"}))
            return 2
    return 0 if result["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
