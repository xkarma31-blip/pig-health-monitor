#!/usr/bin/env python3
"""Audit / enable the Tapo camera's ON-DEVICE microSD recording — app-less.

Everything the Tapo app's Storage & Recording page does is exposed on the
camera's local HTTPS API. This tool drives it via pytapo so the camera can
record 24/7 to its own microSD: no app, no cloud, no external recorder.

Modes (default is a READ-ONLY audit — nothing is changed):

  (no args)        audit: model, SD card status, record plan, circular config
  --apply          arm 24/7 continuous recording + circular overwrite
  --with-audio     (with --apply) also store the camera mic's audio on SD
  --list DATE      list recordings on the card for DATE (YYYYMMDD)
  --format         wipe + initialize the card (IRREVERSIBLE, typed confirm)

Run from a device that can reach the camera. The camera lives on the PigPulse
AP (192.168.69.0/24, no WAN — see CANON.md), so use the laptop after joining
the PigPulse Wi-Fi. Credentials come from the environment, never from source:

  TAPO_HOST        camera IP (default: probe 192.168.69.2 then 192.168.69.83)
  TAPO_USER        Camera Account user  (app: Advanced Settings -> Camera Account)
  TAPO_PASS        Camera Account password
  TAPO_CLOUD_PASS  fallback: TP-Link cloud password (newer firmware SPAKE2+)

Install (on the machine you run this from):  python3 -m pip install pytapo
"""

import argparse
import json
import os
import socket
import sys

HOST_CANDIDATES = ["192.168.69.2", "192.168.69.83"]
# 24/7 continuous, as two contiguous segments (both shapes are the exact
# "HHMM-HHMM:mode" pattern pytapo documents; :1 = record continuously).
ALL_DAY_CONTINUOUS = ["0000-1200:1", "1200-2400:1"]
DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]


def banner(title):
    print("\n=== %s ===" % title)


def probe_host(timeout=2.0):
    host = os.environ.get("TAPO_HOST", "").strip()
    if host:
        return host
    for candidate in HOST_CANDIDATES:
        try:
            with socket.create_connection((candidate, 443), timeout=timeout):
                return candidate
        except OSError:
            continue
    return None


def connect():
    try:
        from pytapo import Tapo
    except ImportError:
        sys.exit("pytapo is not installed here. Run: python3 -m pip install pytapo")

    host = probe_host()
    if host is None:
        sys.exit(
            "No camera answering on %s. Is this machine on the PigPulse Wi-Fi?"
            % ", ".join(HOST_CANDIDATES)
        )
    print("Camera host: %s" % host)

    user = os.environ.get("TAPO_USER", "").strip()
    password = os.environ.get("TAPO_PASS", "").strip()
    cloud_password = os.environ.get("TAPO_CLOUD_PASS", "").strip()

    # TAPO_AUTH_MODE=cloud skips the Camera Account attempt entirely and goes
    # straight to SPAKE2+ (admin + TP-Link cloud password) — used on newer
    # firmware, and to avoid burning failed-login attempts on lockout-prone
    # cameras.
    if os.environ.get("TAPO_AUTH_MODE", "auto").strip().lower() == "cloud":
        if not cloud_password:
            sys.exit("TAPO_AUTH_MODE=cloud requires TAPO_CLOUD_PASS.")
        tapo = Tapo(host, "admin", cloud_password, cloudPassword=cloud_password)
        tapo.getBasicInfo()
        return tapo, "cloud password (SPAKE2+)"

    if not (user and password):
        sys.exit(
            "Set TAPO_USER + TAPO_PASS (Camera Account from the app) "
            "or TAPO_CLOUD_PASS (TP-Link account password)."
        )

    # Primary: the Camera Account the app creates. Fallback: newer firmware
    # dropped that login and wants admin + cloud password via SPAKE2+.
    try:
        tapo = Tapo(host, user, password)
        tapo.getBasicInfo()
        return tapo, "Camera Account"
    except Exception:
        if not cloud_password:
            raise
    tapo = Tapo(host, "admin", cloud_password, cloudPassword=cloud_password)
    tapo.getBasicInfo()
    return tapo, "cloud password (SPAKE2+)"


def audit(tapo):
    banner("Device")
    try:
        info = tapo.getBasicInfo()
        for key in ("model", "device_model", "sw_version", "hw_version"):
            if isinstance(info, dict) and info.get(key):
                print("%-14s %s" % (key + ":", info[key]))
        if isinstance(info, dict) and not any(
            info.get(k) for k in ("model", "device_model")
        ):
            print(json.dumps(info, indent=2)[:2000])
    except Exception as exc:
        print("basic info unavailable: %r" % (exc,))

    banner("microSD card (read-only)")
    try:
        print(json.dumps(tapo.getSDCard(), indent=2, default=str))
    except Exception as exc:
        print("getSDCard failed: %r" % (exc,))

    banner("Record plan (current)")
    try:
        print(json.dumps(tapo.getRecordPlan(), indent=2, default=str))
    except Exception as exc:
        print("getRecordPlan failed: %r" % (exc,))

    banner("Circular recording (current)")
    try:
        print(json.dumps(tapo.getCircularRecordingConfig(), indent=2, default=str))
    except Exception as exc:
        print("circular config failed: %r" % (exc,))

    print(
        "\nNothing was changed. To arm 24/7 continuous recording + circular"
        "\noverwrite, re-run with --apply"
    )


def apply(tapo, with_audio):
    banner("Applying: 24/7 continuous + circular overwrite")
    kwargs = {day: ALL_DAY_CONTINUOUS for day in DAYS}
    result = tapo.setRecordPlan(True, **kwargs)
    print("setRecordPlan -> %s" % json.dumps(result, default=str))

    result = tapo.setCircularRecordingConfig(True)
    print("setCircularRecordingConfig -> %s" % json.dumps(result, default=str))

    if with_audio:
        result = tapo.setRecordAudio(True)
        print("setRecordAudio -> %s" % json.dumps(result, default=str))

    # Evidence before assertions: read every value back and check it stuck.
    banner("Verification (read-back)")
    ok = True
    plan = tapo.getRecordPlan()
    if str(plan.get("enabled", "")).lower() != "on":
        ok = False
        print("FAIL: plan enabled = %r (expected on)" % plan.get("enabled"))
    for day in DAYS:
        stored = plan.get(day, "")
        try:
            periods = json.loads(stored) if isinstance(stored, str) else stored
        except (TypeError, ValueError):
            periods = stored
        if list(periods or []) != ALL_DAY_CONTINUOUS:
            ok = False
            print("FAIL: %s = %r" % (day, stored))
    print("record plan 24/7 continuous: %s" % ("PASS" if ok else "FAIL"))
    print("circular: %s" % json.dumps(tapo.getCircularRecordingConfig(), default=str))
    if with_audio:
        print("audio: %s" % json.dumps(tapo.getRecordAudio(), default=str))
    if not ok:
        sys.exit("Verification FAILED — camera did not accept the 24/7 plan as set.")

    print(
        "\nARMED. The camera now records continuously to its own microSD."
        "\nCard fill rate depends on capacity (see audit); circular overwrite"
        "\nkeeps it bounded by deleting the oldest footage when full."
        "\nIn a few hours, prove it with: --list <today as YYYYMMDD>"
    )


def list_recordings(tapo, date):
    banner("Recordings on card for %s" % date)
    listing = tapo.getRecordingsList(start_date=date, end_date=date)
    print(json.dumps(listing, indent=2, default=str))
    total = 0
    if isinstance(listing, list):
        for day in listing:
            if isinstance(day, dict):
                total += int(day.get("totalNumber", 0) or 0)
    print("total clips reported: %s" % (total if total else "see raw output above"))


def format_card(tapo):
    banner("FORMAT microSD card")
    print("This IRREVERSIBLY WIPES everything on the card.")
    answer = input("Type YES (capital letters) to continue: ").strip()
    if answer != "YES":
        sys.exit("Aborted — card untouched.")
    result = tapo.format()
    print("format -> %s" % json.dumps(result, default=str))
    print("Card formatted. Re-run the audit to confirm the fresh state.")


def main():
    parser = argparse.ArgumentParser(
        description="Audit or enable the Tapo camera's on-device microSD recording."
    )
    parser.add_argument("--apply", action="store_true", help="arm 24/7 recording")
    parser.add_argument(
        "--with-audio", action="store_true", help="also store camera-mic audio"
    )
    parser.add_argument("--list", metavar="YYYYMMDD", help="list a day's recordings")
    parser.add_argument("--format", action="store_true", help="wipe the card")
    args = parser.parse_args()

    tapo, auth = connect()
    print("Authenticated via: %s" % auth)

    if args.format:
        format_card(tapo)
        return
    if args.list:
        list_recordings(tapo, args.list)
        return
    if args.apply:
        apply(tapo, args.with_audio)
        return
    audit(tapo)


if __name__ == "__main__":
    main()
