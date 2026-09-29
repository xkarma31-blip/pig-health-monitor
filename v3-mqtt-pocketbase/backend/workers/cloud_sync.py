#!/usr/bin/env python3
"""
Cloud sync: Pi (source) -> cloud PocketBase (destination).

THE GAP THIS FILLS
------------------
`local_bridge.py` tags every record it writes with `synced: false`. Nothing
has ever read that flag. The Pi runs as a standalone access point with no
internet, so it collects thermal and mic data that the phone app — which
reads the laptop's PocketBase — never sees. That is why the capstone felt
broken while every individual service was green.

WHY IT RUNS ON THE LAPTOP, NOT THE PI
--------------------------------------
The Pi AP has no WAN (no router uplink), and Tailscale cannot help: every
node must reach the coordination server over the public internet, so a node
with no internet cannot enrol. So the Pi can only ever be the SERVER. The
laptop joins the PigPulse AP when it needs to sync and runs this.

DIRECTION OF TRAFFIC
-------------------
    laptop --(reads synced=false)--> Pi PocketBase
    laptop --(inserts)-----------> cloud PocketBase
    laptop --(marks source synced=true)-->

Idempotency: a record is only marked `synced=true` on the source AFTER the
cloud insert succeeds. A crash mid-batch therefore re-sends that batch rather
than losing it, which means at-least-once delivery — the destination may
briefly hold a duplicate. That is the correct trade for health telemetry; the
alternative (marking first) silently loses rows, which is the failure mode
that hid the original audio_events loss for days.

Usage:
    python3 cloud_sync.py --once          # single pass, then exit
    python3 cloud_sync.py                 # loop every SYNC_INTERVAL_S
    python3 cloud_sync.py --once --dry-run # report what WOULD be sent
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
import urllib.error
import urllib.request

# ---------------------------------------------------------------- config ---
# Source = the Pi. Reached over the PigPulse AP, so this is the AP address.
SOURCE_URL = os.environ.get("SYNC_SOURCE_URL", "http://192.168.69.1:8090")
# Destination = the cloud/laptop PocketBase.
DEST_URL = os.environ.get("SYNC_DEST_URL", "http://127.0.0.1:8090")

# Credentials come from the environment. There is deliberately no default:
# see CANON.md §5. The bridge already refuses to run without them.
SRC_EMAIL = os.environ.get("SYNC_SOURCE_EMAIL", "")
SRC_PASSWORD = os.environ.get("SYNC_SOURCE_PASSWORD", "")
DST_EMAIL = os.environ.get("SYNC_DEST_EMAIL", "")
DST_PASSWORD = os.environ.get("SYNC_DEST_PASSWORD", "")

# Only collections that actually carry a `synced` column. `devices` and `pigs`
# are reference data, not a stream, and re-sending them every cycle would be
# both wasteful and wrong (they are upserted by the bridge, not appended).
SYNCED_COLLECTIONS = ("telemetry", "alerts", "audio_events")

BATCH = int(os.environ.get("SYNC_BATCH", "200"))
INTERVAL_S = float(os.environ.get("SYNC_INTERVAL_S", "60"))
TIMEOUT = float(os.environ.get("SYNC_TIMEOUT_S", "10"))
# A record older than this is marked synced and dropped rather than uploaded
# forever. Without it an offline Pi accumulates a backlog that takes days to
# drain, and stale vitals are worse than no vitals.
MAX_AGE_DAYS = float(os.environ.get("SYNC_MAX_AGE_DAYS", "7"))

# Fields PocketBase generates; sending them back causes a validation error.
SERVER_FIELDS = {"id", "created", "updated", "collectionId", "collectionName",
                 "expand"}

log = logging.getLogger("cloud_sync")


# ------------------------------------------------------------------ pb ---
class PocketBase:
    """Minimal admin REST client. stdlib only — the Pi has no requests wheel
    guarantee, and this worker runs on the laptop where it definitely does."""

    def __init__(self, base: str, email: str, password: str, label: str):
        self.base = base.rstrip("/")
        self.email = email
        self.password = password
        self.label = label
        self.token: str | None = None
        self.expiry = 0.0

    def _req(self, method: str, path: str, body: dict | None = None,
             query: str = "", auth: bool = True) -> tuple[int, dict | str]:
        url = f"{self.base}{path}"
        if query:
            url = f"{url}?{query}"
        data = json.dumps(body).encode() if body is not None else None
        headers = {"Content-Type": "application/json"}
        if auth and self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                raw = r.read()
                return r.status, (json.loads(raw) if raw else {})
        except urllib.error.HTTPError as e:
            return e.code, e.read().decode(errors="replace")[:300]
        except Exception as e:  # unreachable, timeout, DNS, refused
            return 0, f"{type(e).__name__}: {e}"[:200]

    def login(self) -> bool:
        if not (self.email and self.password):
            log.error("%s: no credentials — set SYNC_%s_EMAIL / _PASSWORD",
                      self.label, self.label.upper())
            return False
        st, body = self._req(
            "POST", "/api/admins/auth-with-password",
            {"identity": self.email, "password": self.password}, auth=False)
        if st == 200 and isinstance(body, dict) and body.get("token"):
            self.token = body["token"]
            # PocketBase admin tokens default to 15 min. Re-login well before
            # that; a 401 path also invalidates and retries once.
            self.expiry = time.time() + 600
            log.info("%s: authenticated at %s", self.label, self.base)
            return True
        log.error("%s: auth failed (HTTP %s) %s", self.label, st, body)
        return False

    def ensure(self) -> bool:
        if self.token and time.time() < self.expiry:
            return True
        return self.login()

    def unsynced(self, collection: str) -> list[dict]:
        st, body = self._req(
            "GET", f"/api/collections/{collection}/records",
            query=f"filter=(synced=false)&sort=-timestamp&perPage={BATCH}")
        if st != 200 or not isinstance(body, dict):
            log.error("%s: fetch %s failed (HTTP %s) %s",
                      self.label, collection, st, body)
            return []
        return body.get("items", [])

    def mark_synced(self, collection: str, rec_id: str) -> bool:
        st, _ = self._req("PATCH", f"/api/collections/{collection}/records/{rec_id}",
                          {"synced": True})
        if st == 401:          # token rejected early — drop it, force re-login
            self.token = None
        return st == 200

    def insert(self, collection: str, data: dict) -> bool:
        st, body = self._req("POST", f"/api/collections/{collection}/records", data)
        if st == 401:
            self.token = None
        if st not in (200, 201):
            log.error("dest: insert into %s failed (HTTP %s) %s",
                      collection, st, body)
        return st in (200, 201)


def strip_server_fields(rec: dict) -> dict:
    return {k: v for k, v in rec.items() if k not in SERVER_FIELDS}


def is_too_old(rec: dict) -> bool:
    ts = rec.get("timestamp")
    if not isinstance(ts, (int, float)):
        return False
    age_days = (time.time() * 1000 - ts) / 86_400_000
    return age_days > MAX_AGE_DAYS


def sync_once(src: PocketBase, dst: PocketBase, dry_run: bool = False) -> dict:
    stats = {"sent": 0, "skipped_old": 0, "failed": 0, "per_collection": {}}
    for coll in SYNCED_COLLECTIONS:
        if not src.ensure():
            log.error("source unreachable — aborting this pass")
            return stats
        records = src.unsynced(coll)
        n = 0
        for rec in records:
            # A record that has been sitting unsynced for over a week is
            # almost certainly stale vitals. Upload it and it tells a story
            # about a moment that already passed; drop it honestly instead.
            if is_too_old(rec):
                stats["skipped_old"] += 1
                if not dry_run:
                    src.mark_synced(coll, rec["id"])
                continue
            payload = strip_server_fields(rec)
            payload["synced"] = True
            if dry_run:
                log.info("[dry-run] would send %s/%s: %s",
                         coll, rec["id"], json.dumps(payload)[:160])
                n += 1
                continue
            if not dst.ensure():
                log.error("destination unreachable — aborting this pass")
                return stats
            if dst.insert(coll, payload):
                # Only now mark the source. Marking first would lose rows on
                # any failure between the two calls.
                if src.mark_synced(coll, rec["id"]):
                    n += 1
                else:
                    stats["failed"] += 1
            else:
                stats["failed"] += 1
        stats["per_collection"][coll] = n
        stats["sent"] += n
        if n:
            log.info("%s: synced %d record(s)", coll, n)
    return stats


def main() -> int:
    ap = argparse.ArgumentParser(description="PigPulse Pi -> cloud sync")
    ap.add_argument("--once", action="store_true", help="single pass, then exit")
    ap.add_argument("--dry-run", action="store_true",
                    help="report what would be sent; change nothing")
    ap.add_argument("--interval", type=float, default=INTERVAL_S)
    ap.add_argument("--source", default=SOURCE_URL)
    ap.add_argument("--dest", default=DEST_URL)
    args = ap.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [sync] [%(levelname)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    src = PocketBase(args.source, SRC_EMAIL, SRC_PASSWORD, "source")
    dst = PocketBase(args.dest, DST_EMAIL, DST_PASSWORD, "dest")

    log.info("sync %s -> %s  (collections: %s)",
             src.base, dst.base, ", ".join(SYNCED_COLLECTIONS))
    if args.dry_run:
        log.info("DRY RUN — nothing will be written")

    if args.once:
        st = sync_once(src, dst, dry_run=args.dry_run)
        log.info("result: %s", json.dumps(st))
        return 1 if st["failed"] else 0

    while True:
        try:
            st = sync_once(src, dst, dry_run=args.dry_run)
            if st["sent"] or st["failed"] or st["skipped_old"]:
                log.info("pass: %s", json.dumps(st))
        except Exception as e:  # a worker that dies on one bad batch is useless
            log.error("pass failed: %s", e, exc_info=True)
        for _ in range(max(1, int(args.interval))):
            time.sleep(1)


if __name__ == "__main__":
    sys.exit(main())
