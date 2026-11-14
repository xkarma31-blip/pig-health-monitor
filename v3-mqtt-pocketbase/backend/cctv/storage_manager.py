#!/usr/bin/env python3
"""Smart CCTV storage manager: index, alert pinning, time-based retention.

The RTSP recorder keeps a disk-floor rotation (delete oldest when free space
drops below REC_FLOOR_MB). That alone prevents overflow, but it has three gaps
this script closes:

  1. ALERT PINNING - a segment that overlaps an alert is moved to recs/pinned/
     so rotation can never delete the footage of an event a vet will want.
     The recorder globs recs/seg_*.mp4 only, so files under recs/pinned/ are
     invisible to its rotation (they are safe) while still being indexed.

  2. TIME INDEX - every segment is written to recs/index.json with its start /
     end epoch, size and pinned flag, so the app can answer "what was recorded
     at 03:14?" and jump straight to that segment instead of guessing by name.

  3. MAX AGE - unpinned segments older than REC_RETENTION_H are deleted even
     when the disk is not full. Without this, a Pi that gains internet (and so
     stops rotating) would grow the archive without bound until the disk fills.

Designed for a systemd timer. Missing PB or camera is never fatal: it prints
one line and exits 0 so the timer never spams failures. --dry-run reports the
plan without changing anything.

Env:
  REC_DIR                 segment dir            (default /home/pigpulse/cctv/recs)
  POCKETBASE_URL          PB base URL            (default http://192.168.69.1:8090)
  REC_RETENTION_H         unpinned max age hours (default 48)
  REC_PIN_RETENTION_D     pinned max age days    (default 30)
  REC_PIN_MARGIN_S        alert overlap margin s (default 120)
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import sys
import time
import urllib.request

OUTDIR = os.environ.get("REC_DIR", "/home/pigpulse/cctv/recs")
PINNED = os.path.join(OUTDIR, "pinned")
INDEX = os.path.join(OUTDIR, "index.json")
SEG_SECONDS = int(os.environ.get("REC_SEG_SECONDS", "900"))
RETENTION_H = float(os.environ.get("REC_RETENTION_H", "48"))
PIN_RETENTION_D = int(os.environ.get("REC_PIN_RETENTION_D", "30"))
PIN_MARGIN_S = int(os.environ.get("REC_PIN_MARGIN_S", "120"))
PB_URL = os.environ.get("POCKETBASE_URL", "http://192.168.69.1:8090").rstrip("/")


def log(msg: str) -> None:
    print("STORAGE [%s] %s" % (time.strftime("%H:%M:%S"), msg), flush=True)


def seg_start(name: str) -> float | None:
    """Epoch seconds from seg_YYYYMMDD_HHMMSS.mp4, or None if unparseable."""
    try:
        return time.mktime(time.strptime(name[4:17], "%Y%m%d_%H%M%S"))
    except (ValueError, IndexError):
        return None


def fetch_alert_times() -> list[float]:
    """Epoch seconds of every alert in PB (empty list on any failure)."""
    try:
        url = f"{PB_URL}/api/collections/alerts/records?perPage=1000&sort=-timestamp"
        with urllib.request.urlopen(url, timeout=6) as r:
            data = json.load(r)
    except Exception as e:  # network/PB down is not fatal
        log(f"alert fetch failed ({e}); pinning skipped this run")
        return []
    out: list[float] = []
    for it in data.get("items", []):
        ts = it.get("timestamp")
        if ts is None:
            continue
        try:
            v = float(ts)
        except (TypeError, ValueError):
            continue
        # Mixed writers: seeds store epoch seconds, the bridge stores ms.
        if v > 1e12:
            v /= 1000.0
        out.append(v)
    return out


def newest_path() -> str | None:
    files = sorted(glob.glob(os.path.join(OUTDIR, "seg_*.mp4")))
    return files[-1] if files else None


def main() -> int:
    ap = argparse.ArgumentParser(description="PigPulse CCTV storage manager")
    ap.add_argument("--dry-run", action="store_true", help="report only, change nothing")
    args = ap.parse_args()

    os.makedirs(OUTDIR, exist_ok=True)
    if not args.dry_run:
        os.makedirs(PINNED, exist_ok=True)

    alerts = fetch_alert_times()
    now = time.time()
    newest = newest_path()  # never pin/delete the segment ffmpeg is writing

    index: dict[str, dict] = {}
    pinned_n = deleted_n = 0

    for path in sorted(glob.glob(os.path.join(OUTDIR, "seg_*.mp4"))):
        name = os.path.basename(path)
        start = seg_start(name)
        if start is None:
            continue
        end = start + SEG_SECONDS
        try:
            size = os.path.getsize(path)
        except OSError:
            continue
        overlaps = any(start - PIN_MARGIN_S <= a <= end + PIN_MARGIN_S for a in alerts)
        record = {"start": int(start), "end": int(end), "size": size,
                  "pinned": False, "file": name}

        if path == newest:
            # leave the live segment exactly where it is
            index[name] = record
            continue

        if overlaps:
            dest = os.path.join(PINNED, name)
            record["pinned"] = True
            if not args.dry_run and not os.path.exists(dest):
                os.rename(path, dest)
                pinned_n += 1
            elif args.dry_run:
                log(f"would pin {name}")
            index[name] = record
            index[name]["file"] = os.path.join("pinned", name)
        elif now - end > RETENTION_H * 3600:
            if args.dry_run:
                log(f"would delete {name} (age {(now - end) / 3600:.1f}h)")
            else:
                try:
                    os.remove(path)
                    deleted_n += 1
                except OSError:
                    pass
            record["deleted"] = True
            index[name] = record
        else:
            index[name] = record

    # prune pinned older than the pin retention
    for path in glob.glob(os.path.join(PINNED, "seg_*.mp4")):
        name = os.path.basename(path)
        start = seg_start(name)
        if start is None:
            continue
        if now - start > PIN_RETENTION_D * 86400:
            if args.dry_run:
                log(f"would unpin+delete {name} (pinned age {(now - start) / 86400:.1f}d)")
            else:
                try:
                    os.remove(path)
                    deleted_n += 1
                except OSError:
                    pass
            index[name] = {"start": int(start), "end": int(start + SEG_SECONDS),
                           "size": 0, "pinned": False, "deleted": True,
                           "file": os.path.join("pinned", name)}
        else:
            try:
                size = os.path.getsize(path)
            except OSError:
                size = 0
            index[name] = {"start": int(start), "end": int(start + SEG_SECONDS),
                           "size": size, "pinned": True,
                           "file": os.path.join("pinned", name)}

    doc = {"generated": int(now), "segSeconds": SEG_SECONDS,
           "retentionH": RETENTION_H, "pinRetentionD": PIN_RETENTION_D,
           "segments": index}
    if not args.dry_run:
        tmp = INDEX + ".tmp"
        with open(tmp, "w") as f:
            json.dump(doc, f, indent=2)
        os.replace(tmp, INDEX)

    log(f"{'DRY-RUN ' if args.dry_run else ''}segments={len(index)} "
        f"pinned={pinned_n} deleted={deleted_n} alerts={len(alerts)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())