#!/usr/bin/env python3
"""PigPulse research data export — one bundle with everything a researcher needs.

Runs on the LAPTOP (it has the route to the Pi and the cloud PocketBase).
Read-only: it never writes to the Pi or PocketBase. Output is a tar.gz with:

  telemetry_<device>.csv      last N days of telemetry (per device)
  alerts.csv                  all alerts
  cough_windows.jsonl         classifier audit log
  cough_clips/                WAV clips (p >= threshold)
  soak_samples.csv            Pi hardware counters (last N days)
  MANIFEST.json               row counts, date range, sha256

Usage: pigpulse_research_export.py [--days 7] [--out DIR]
Then scp the tar.gz off the Pi/laptop for analysis.
"""
import argparse
import csv
import hashlib
import io
import json
import os
import subprocess
import tarfile
import time
from datetime import datetime, timezone
from pathlib import Path

PI = "192.168.69.1"
PI_PB = f"http://{PI}:8090"
SSH = ["ssh", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new",
       f"pigpulse@{PI}"]


def pb_records(collection: str, per_page=500, max_pages=200):
    """Page through PocketBase records (read-only, no auth needed for these)."""
    out = []
    page = 1
    while page <= max_pages:
        url = f"{PI_PB}/api/collections/{collection}/records?perPage={per_page}&page={page}&sort=-timestamp"
        try:
            import urllib.request
            with urllib.request.urlopen(url, timeout=15) as r:
                d = json.load(r)
        except Exception as e:
            print(f"  {collection} page {page} failed: {e}")
            break
        items = d.get("items", [])
        out.extend(items)
        if page >= d.get("totalPages", 1):
            break
        page += 1
    return out


def write_csv(path, rows, cols):
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
        w.writeheader()
        for r in rows:
            w.writerow(r)


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=7)
    ap.add_argument("--out", default="/tmp/opencode/research-export")
    args = ap.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    since = int((time.time() - args.days * 86400))

    manifest = {"generated": datetime.now(timezone.utc).isoformat(), "days": args.days, "files": {}}

    # telemetry per device
    print("Fetching telemetry…")
    tel = pb_records("telemetry", per_page=500, max_pages=400)
    by_dev = {}
    for r in tel:
        by_dev.setdefault(r.get("deviceId", "unknown"), []).append(r)
    for dev, rows in by_dev.items():
        cols = sorted({k for r in rows for k in r})
        p = out / f"telemetry_{dev}.csv"
        write_csv(p, rows, cols)
        manifest["files"][p.name] = {"rows": len(rows), "sha256": sha256(p)}

    # alerts
    print("Fetching alerts…")
    alerts = pb_records("alerts", per_page=500, max_pages=50)
    if alerts:
        cols = sorted({k for r in alerts for k in r})
        p = out / "alerts.csv"
        write_csv(p, alerts, cols)
        manifest["files"][p.name] = {"rows": len(alerts), "sha256": sha256(p)}

    # cough windows + clips (from the Pi)
    print("Fetching classifier data…")
    try:
        windows = subprocess.run(SSH + ["cat ~/cough/windows.jsonl"], capture_output=True, text=True, timeout=30).stdout
        if windows.strip():
            p = out / "cough_windows.jsonl"
            p.write_text(windows)
            manifest["files"][p.name] = {"lines": len(windows.splitlines()), "sha256": sha256(p)}
        clips = subprocess.run(SSH + ["tar czf - -C ~/cough clips"], capture_output=True, timeout=120)
        if clips.returncode == 0 and clips.stdout:
            p = out / "cough_clips.tar.gz"
            p.write_bytes(clips.stdout)
            manifest["files"][p.name] = {"bytes": len(clips.stdout), "sha256": sha256(p)}
    except Exception as e:
        print(f"  classifier export failed: {e}")

    # soak db (last N days) — copy the whole DB is big; export a CSV via python on Pi
    print("Fetching soak samples…")
    try:
        py = (
            "import sqlite3, csv, sys, time\n"
            "c=sqlite3.connect('/home/pigpulse/soak/soak.db')\n"
            f"since=int(time.time())-{args.days}*86400\n"
            "rows=c.execute('select * from samples where ts>=?', (since,)).fetchall()\n"
            "cols=[d[0] for d in c.execute('select * from samples limit 1').description]\n"
            "w=csv.writer(sys.stdout); w.writerow(cols)\n"
            "for r in rows: w.writerow(r)\n"
        )
        p = subprocess.run(SSH + ["python3 -c " + json.dumps(py)],
                           capture_output=True, timeout=180)
        if p.returncode == 0 and p.stdout:
            (out / "soak_samples.csv").write_bytes(p.stdout)
            manifest["files"]["soak_samples.csv"] = {"bytes": len(p.stdout), "sha256": sha256(out / "soak_samples.csv")}
        else:
            print("  soak export failed:", p.stderr[:200])
    except Exception as e:
        print(f"  soak export failed: {e}")

    (out / "MANIFEST.json").write_text(json.dumps(manifest, indent=2))

    # tar it
    tar_path = out / f"pigpulse_research_{datetime.now().strftime('%Y%m%d')}.tar.gz"
    with tarfile.open(tar_path, "w:gz") as t:
        for f in out.iterdir():
            if f != tar_path:
                t.add(f, arcname=f.name)
    print(f"\nBundle: {tar_path} ({tar_path.stat().st_size//1024} KB)")
    print(json.dumps(manifest, indent=2)[:800])


if __name__ == "__main__":
    main()