#!/usr/bin/env python3
"""Daily offload of the Tapo camera's SD recordings to this machine.

The camera records 24/7 to its own microSD (armed via tapo_record_setup.py).
That card is the only copy — a dead or corrupted card means lost footage.
This script copies each day's finished clips to local disk, idempotently:

  * already-downloaded clips (by startTime-endTime filename) are skipped
  * partial downloads land in a temp dir and are renamed only when complete
  * day folders older than --retention-days are pruned
  * aborts (exit 1) if free space drops below --min-free-gb

Designed for a systemd timer: if the camera is unreachable (this machine not
on the PigPulse AP) it prints one line and exits 0, so the timer never spams
failures. Credentials and auth mode come from the environment — the same
contract as tapo_record_setup.py (TAPO_USER/TAPO_PASS/TAPO_CLOUD_PASS/
TAPO_AUTH_MODE).

Storage: --dest defaults to backend/recordings/ which .gitignore already
covers (**/recordings/). Layout: recordings/YYYYMMDD/<startTime>-<endTime>.mp4
"""

import argparse
import asyncio
import os
import shutil
import sys
import tempfile
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tapo_record_setup import connect, probe_host  # noqa: E402

DEFAULT_DEST = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "recordings"
)


def log(msg):
    print(msg, flush=True)


def normalize_recordings(recordings):
    """pytapo's getRecordings shape has varied; accept the shapes seen in
    the wild: a list of {index: {startTime, endTime}} dicts, or a flat
    list/dict of clip dicts."""
    clips = []
    if isinstance(recordings, dict):
        recordings = list(recordings.values())
    if not isinstance(recordings, list):
        return clips
    for entry in recordings:
        if not isinstance(entry, dict):
            continue
        if "startTime" in entry and "endTime" in entry:
            clips.append(entry)
            continue
        for value in entry.values():
            if (
                isinstance(value, dict)
                and "startTime" in value
                and "endTime" in value
            ):
                clips.append(value)
    return clips


def parse_day_dirs(dest):
    days = []
    for name in os.listdir(dest):
        if len(name) == 8 and name.isdigit():
            try:
                days.append((datetime.strptime(name, "%Y%m%d").date(), name))
            except ValueError:
                continue
    return days


async def download_pending(tapo, time_correction, pending, dest):
    from pytapo.media_stream.downloader import Downloader

    saved = 0
    for day_dir, clip, final_path in pending:
        fname = os.path.basename(final_path)
        try:
            with tempfile.TemporaryDirectory(dir=dest) as tmp:
                downloader = Downloader(
                    tapo,
                    clip["startTime"],
                    clip["endTime"],
                    time_correction,
                    tmp,
                    None,
                    False,
                    None,
                    fileName=fname,
                )
                async for _status in downloader.download():
                    pass
                source = os.path.join(tmp, fname)
                if not os.path.exists(source):
                    log("MISS  %s/%s (camera sent no data)" % (day_dir, fname))
                    continue
                shutil.move(source, final_path)
                size_mb = os.path.getsize(final_path) / (1024 * 1024)
                log("SAVED %s/%s (%.1f MB)" % (day_dir, fname, size_mb))
                saved += 1
        except Exception as exc:
            log("FAIL  %s/%s: %r" % (day_dir, fname, exc))
    return saved


def main():
    parser = argparse.ArgumentParser(
        description="Offload Tapo camera SD recordings to this machine."
    )
    parser.add_argument("--days", type=int, default=2,
                        help="days to scan back, today included (default 2)")
    parser.add_argument("--dest", default=DEFAULT_DEST,
                        help="destination dir (default: backend/recordings/)")
    parser.add_argument("--retention-days", type=int, default=3,
                        help="prune day folders older than this (default 3;"
                        " measured C200C bitrate 1572 kbps ~ 17 GB/day, and"
                        " the target fs had 82 GB free — 7 days would not fit)")
    parser.add_argument("--min-free-gb", type=float, default=5.0,
                        help="abort if destination fs free space is below this")
    args = parser.parse_args()

    if probe_host() is None:
        log("tapo-backup: camera unreachable (not on PigPulse AP?) — skipping")
        return 0

    # Credential guard: the management API needs a cloud password the camera
    # will accept (Camera Account is rejected on this firmware). Until one is
    # configured, every run is a quiet no-op so the timer never fails.
    if not (os.environ.get("TAPO_CLOUD_PASS", "").strip()
            or (os.environ.get("TAPO_USER", "").strip()
                and os.environ.get("TAPO_PASS", "").strip())):
        log("tapo-backup: no camera credentials configured yet — "
            "waiting for TAPO_CLOUD_PASS in the env file (no-op run)")
        return 0

    tapo, auth = connect()
    log("Authenticated via %s" % auth)

    os.makedirs(args.dest, exist_ok=True)
    free_gb = shutil.disk_usage(args.dest).free / (1024 ** 3)
    if free_gb < args.min_free_gb:
        log(
            "tapo-backup: only %.1f GB free on %s (min %.1f GB) — aborting"
            % (free_gb, args.dest, args.min_free_gb)
        )
        return 1

    time_correction = tapo.getTimeCorrection()

    today = datetime.now().date()
    pending = []
    new_clips = 0
    for offset in range(args.days):
        day = today - timedelta(days=offset)
        day_str = day.strftime("%Y%m%d")
        day_dir = os.path.join(args.dest, day_str)
        os.makedirs(day_dir, exist_ok=True)
        try:
            clips = normalize_recordings(tapo.getRecordings(day_str))
        except Exception as exc:
            log("FAIL  listing %s: %r" % (day_str, exc))
            continue
        for clip in clips:
            fname = "%s-%s.mp4" % (clip["startTime"], clip["endTime"])
            final_path = os.path.join(day_dir, fname)
            if os.path.exists(final_path):
                continue
            pending.append((day_str, clip, final_path))
            new_clips += 1

    log("tapo-backup: %d new clip(s) to fetch (scanned %d day(s))"
        % (new_clips, args.days))

    saved = 0
    if pending:
        saved = asyncio.run(download_pending(
            tapo, time_correction, pending, args.dest
        ))

    # Retention: prune whole day folders past the window.
    cutoff = today - timedelta(days=args.retention_days)
    pruned = 0
    for day, name in parse_day_dirs(args.dest):
        if day < cutoff:
            shutil.rmtree(os.path.join(args.dest, name), ignore_errors=True)
            pruned += 1
    if pruned:
        log("tapo-backup: pruned %d day folder(s) older than %s"
            % (pruned, cutoff.isoformat()))

    free_gb = shutil.disk_usage(args.dest).free / (1024 ** 3)
    log("tapo-backup: done — %d saved, %.1f GB free" % (saved, free_gb))
    return 0 if saved == len(pending) else 1


if __name__ == "__main__":
    sys.exit(main())
