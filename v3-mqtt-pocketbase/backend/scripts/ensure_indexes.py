#!/usr/bin/env python3
"""Ensure the query indexes exist on a PocketBase instance (idempotent).

Why this exists: both PocketBase instances ran with ZERO indexes on
telemetry / alerts / audio_events, so every read was a full table scan.
Measured on live data (2026-11-16):

    Pi PocketBase (726k telemetry rows, on SD card)
      filter=(synced=false)&sort=-timestamp    ->  507.7 ms  ->   27.7 ms
      sort=-timestamp&perPage=5                 -> 4099.5 ms  ->  246.0 ms
      deviceId='..'&&timestamp>=.. (analytics)  ->  582.4 ms  ->   15.9 ms
    Laptop PocketBase (737k rows, NVMe)
      filter=(synced=false)&sort=-timestamp    ->   86.3 ms  ->    0.8 ms
      sort=-timestamp&perPage=5                 ->  352.6 ms  ->   32.3 ms
      deviceId='..'&&timestamp>=.. (analytics)  ->   87.5 ms  ->    0.9 ms

The same work is also in a PocketBase migration
(deploy/pocketbase/bin/pb_migrations/1799600000_add_query_indexes.js).
This script is the operational path: it works against a live instance without
a restart, and it verifies the result.

PocketBase 0.22 takes the index list as an ARRAY OF SQL STATEMENTS
(PATCH /api/collections/{id} with {"indexes": [...]}) - not the 0.23+
{"name":..., "columns":[...]} shape.

Usage:
  python3 ensure_indexes.py --url http://127.0.0.1:8090 --email ... --password ...
  python3 ensure_indexes.py --url http://192.168.69.1:8090 --email ... --password ... --check
"""
import argparse
import json
import sys
import time
import urllib.error
import urllib.request

INDEXES = {
    "telemetry": [
        "CREATE INDEX `idx_telemetry_synced_ts` ON `telemetry` (`synced`, `timestamp`)",
        "CREATE INDEX `idx_telemetry_timestamp` ON `telemetry` (`timestamp`)",
        "CREATE INDEX `idx_telemetry_deviceid_ts` ON `telemetry` (`deviceId`, `timestamp`)",
    ],
    "alerts": [
        "CREATE INDEX `idx_alerts_synced_ts` ON `alerts` (`synced`, `timestamp`)",
        "CREATE INDEX `idx_alerts_timestamp` ON `alerts` (`timestamp`)",
        "CREATE INDEX `idx_alerts_deviceid_ts` ON `alerts` (`deviceId`, `timestamp`)",
    ],
    "audio_events": [
        "CREATE INDEX `idx_audio_synced_ts` ON `audio_events` (`synced`, `timestamp`)",
        "CREATE INDEX `idx_audio_timestamp` ON `audio_events` (`timestamp`)",
        "CREATE INDEX `idx_audio_deviceid_ts` ON `audio_events` (`deviceId`, `timestamp`)",
    ],
}

PROBE = [
    ("sync query", "/api/collections/telemetry/records?filter=(synced=false)&sort=-timestamp&perPage=500"),
    ("app realtime", "/api/collections/telemetry/records?sort=-timestamp&perPage=5"),
    ("app analytics", "/api/collections/telemetry/records?filter=(deviceId='esp32-s3-01')&sort=-timestamp&perPage=200"),
]


def call(method, url, data=None, token=None):
    body = json.dumps(data).encode() if data is not None else None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=300) as resp:
            raw = resp.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        raise SystemExit("%s %s -> HTTP %s %s" % (method, url, exc.code, exc.read().decode()[:200]))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", required=True)
    ap.add_argument("--email", required=True)
    ap.add_argument("--password", required=True)
    ap.add_argument("--check", action="store_true", help="only report, change nothing")
    args = ap.parse_args()
    base = args.url.rstrip("/")

    tok = call("POST", base + "/api/admins/auth-with-password",
               {"identity": args.email, "password": args.password})["token"]

    print("== current indexes ==")
    missing = {}
    for coll, wanted in INDEXES.items():
        cur = call("GET", f"{base}/api/collections/{coll}", token=tok)
        have = {i.get("name", "?") if isinstance(i, dict) else i for i in cur.get("indexes", [])}
        want_names = {w.split("`")[1] for w in wanted}
        absent = want_names - have
        print("  %-14s %d index(es), missing: %s" % (coll, len(have), sorted(absent) or "none"))
        if absent:
            missing[coll] = [w for w in wanted if w.split("`")[1] in absent]

    if missing and not args.check:
        for coll, sqls in missing.items():
            t0 = time.time()
            call("PATCH", f"{base}/api/collections/{coll}", {"indexes": sqls}, token=tok)
            print("  created %d index(es) on %s in %.1f s" % (len(sqls), coll, time.time() - t0))
    elif missing:
        print("  (--check: nothing changed)")
    else:
        print("  nothing to do")

    print("\n== measured latency ==")
    for label, path in PROBE:
        ts = []
        for _ in range(3):
            t0 = time.perf_counter()
            call("GET", base + path, token=tok)
            ts.append(time.perf_counter() - t0)
        print("  %-14s %8.1f ms" % (label, min(ts) * 1000))


if __name__ == "__main__":
    main()
