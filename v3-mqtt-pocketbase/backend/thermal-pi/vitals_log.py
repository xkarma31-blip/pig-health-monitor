"""Persistent Pi vitals log - the record that shows WHEN the power dropped.

Why this exists
---------------
A graph of the Pi's own health is only useful if it survives the event it is
meant to show. The barn lost power on 2026-11-15: the Pi died at ~05:01 and
came back at 19:51. An in-memory graph would have been wiped by the very
reboot we are trying to see. So the samples are APPENDED to a file on the
Pi's own card, and the boot id is recorded with each one, so a reboot shows
up as a discontinuity instead of a silent gap.

Everything here runs ON THE PI. The laptop is only ever a viewer.

Format: one JSON object per line (JSONL).

    {"t": 1794781234.5, "boot": "1789...", "v": 0.8563, "tc": 47.8,
     "th": "0x0", "l1": 0.21, "mp": 15.3, "dp": 36.0, "up": 12345.6}
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import threading
import time

DATA_DIR = os.environ.get("VITALS_DIR", "/home/pigpulse/thermal-pi/data")
PATH = os.path.join(DATA_DIR, "vitals.jsonl")
INTERVAL_S = float(os.environ.get("VITALS_INTERVAL_S", "10"))
MAX_BYTES = 5 * 1024 * 1024   # rotate at 5 MB (~2 days at 10 s sampling)
MAX_LINES = 4000              # how many samples a reader returns

_lock = threading.Lock()
_started = False
_boots_cache: dict = {"at": 0, "data": []}


def _run(cmd: list[str]) -> str:
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=4)
        return (out.stdout or "").strip()
    except Exception:
        return ""


def boot_id() -> str:
    """The kernel's boot time - a different value means a different boot."""
    try:
        with open("/proc/stat") as fh:
            for line in fh:
                if line.startswith("btime "):
                    return line.split()[1]
    except OSError:
        pass
    return "0"


def _voltage() -> float | None:
    raw = _run(["vcgencmd", "measure_volts"])
    try:
        return round(float(raw.split("=")[1].rstrip("V")), 4)
    except Exception:
        return None


def _cpu_temp() -> float | None:
    raw = _run(["cat", "/sys/class/thermal/thermal_zone0/temp"])
    try:
        return round(int(raw) / 1000.0, 1)
    except Exception:
        return None


def sample() -> dict:
    """One vitals record. Every field is measured, never assumed."""
    rec: dict = {"t": round(time.time(), 1), "boot": boot_id()}

    v = _voltage()
    if v is not None:
        rec["v"] = v
    tc = _cpu_temp()
    if tc is not None:
        rec["tc"] = tc

    th = _run(["cat", "/sys/devices/system/cpu/cpu0/thermal_throttle"])
    if th:
        rec["th"] = th

    try:
        rec["l1"] = round(os.getloadavg()[0], 2)
    except Exception:
        pass

    mem: dict[str, int] = {}
    try:
        with open("/proc/meminfo") as fh:
            for line in fh:
                key, _, val = line.partition(":")
                mem[key] = int(val.split()[0])
        total = mem.get("MemTotal", 0)
        if total:
            rec["mp"] = round(100 * (1 - mem.get("MemAvailable", 0) / total), 1)
    except Exception:
        pass

    disk = _run(["df", "-k", "/"])
    try:
        parts = disk.split()
        rec["dp"] = round(float(parts[4].rstrip("%")), 1)
    except Exception:
        pass

    try:
        with open("/proc/uptime") as fh:
            rec["up"] = round(float(fh.read().split()[0]), 1)
    except Exception:
        pass

    return rec


def _rotate_if_needed() -> None:
    try:
        if os.path.getsize(PATH) < MAX_BYTES:
            return
        os.replace(PATH, PATH + ".1")
    except OSError:
        pass


def append(rec: dict) -> None:
    os.makedirs(DATA_DIR, exist_ok=True)
    with _lock:
        _rotate_if_needed()
        try:
            with open(PATH, "a") as fh:
                fh.write(json.dumps(rec, separators=(",", ":")) + "\n")
        except OSError:
            pass


def read_recent(limit: int = MAX_LINES) -> list[dict]:
    """The most recent samples, oldest first."""
    try:
        with open(PATH) as fh:
            lines = fh.readlines()[-limit:]
    except OSError:
        return []
    out = []
    for line in lines:
        try:
            out.append(json.loads(line))
        except Exception:
            continue
    return out


def reboots(samples: list[dict]) -> list[dict]:
    """Where the boot id changed - i.e. where the Pi restarted.

    A reboot inside the window is usually a power event: the gap before it is
    the downtime. The label says how long the Pi was down, because "the graph
    stops here for 14 h" is the answer to "at what point did the power go".
    """
    marks: list[dict] = []
    for i in range(1, len(samples)):
        prev, cur = samples[i - 1], samples[i]
        if prev.get("boot") == cur.get("boot"):
            continue
        down_s = float(cur.get("t", 0)) - float(prev.get("t", 0))
        marks.append({
            "t": cur.get("t"),
            "label": "reboot",
            "down_s": round(down_s, 1),
        })
    return marks


def journal_reboots(max_age_s: int = 600) -> list[dict]:
    """Past reboots reconstructed from the systemd journal.

    The persistent log only starts when this sampler does, but the journal
    goes back to the first boot. This is what makes the ORIGINAL event
    visible: on 2026-11-15 the Pi's last journal entry before the power cut
    is 05:01:20, and the next boot starts at 19:51 - a 14 h hole.

    Caveat, stated because it is real: the Pi has no battery-backed RTC, so
    the first timestamps after a boot can be skewed until NTP lands. A
    negative gap is reported as clock skew rather than as a negative outage.
    """
    global _boots_cache
    now = time.time()
    if _boots_cache["at"] and (now - _boots_cache["at"]) < max_age_s:
        return _boots_cache["data"]

    out = _run(["journalctl", "--list-boots", "--no-pager", "-o", "short-iso"])
    boots: list[dict] = []
    for line in out.splitlines():
        m = re.match(
            r"\s*(-?\d+)\s+\S+\s+\w{3}\s+(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\s+\S+\s+"
            r"\w{3}\s+(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})",
            line,
        )
        if not m:
            continue
        try:
            first = time.mktime(time.strptime(m.group(2), "%Y-%m-%d %H:%M:%S"))
            last = time.mktime(time.strptime(m.group(3), "%Y-%m-%d %H:%M:%S"))
        except ValueError:
            continue
        boots.append({"idx": int(m.group(1)), "first": first, "last": last})

    # The Pi has no battery-backed RTC, so the FIRST journal entry of a boot
    # can be skewed by hours (the clock starts from the last known time and
    # jumps when NTP lands). The current boot's true start is exact, though:
    # now - /proc/uptime. Using it makes the most recent outage - the one that
    # matters - come out right (2026-11-15: 05:01:20 -> 19:51:27, 14.8 h).
    try:
        with open("/proc/uptime") as fh:
            uptime_s = float(fh.read().split()[0])
        now = time.time()
        for b in boots:
            if b["idx"] == 0:
                b["first"] = now - uptime_s
    except Exception:
        pass

    marks: list[dict] = []
    for i in range(1, len(boots)):
        prev, cur = boots[i - 1], boots[i]
        down = cur["first"] - prev["last"]
        if down < 0:
            # Clock skew at boot, not a real interval. Say so.
            marks.append({
                "t": prev["last"],
                "label": "boot %d -> %d (clock skew at boot)" % (prev["idx"], cur["idx"]),
                "down_s": 0,
                "skew": True,
            })
            continue
        marks.append({
            "t": prev["last"],
            "label": "power cut? (%s down)" % _hms(down),
            "down_s": round(down, 1),
        })
    _boots_cache = {"at": now, "data": marks}
    return marks


def _hms(seconds: float) -> str:
    seconds = int(seconds)
    if seconds < 90:
        return "%d s" % seconds
    if seconds < 5400:
        return "%d min" % round(seconds / 60)
    return "%.1f h" % (seconds / 3600)


def _loop() -> None:
    while True:
        try:
            append(sample())
        except Exception:
            pass
        time.sleep(INTERVAL_S)


def start() -> None:
    """Start the sampler once. Safe to call repeatedly."""
    global _started
    with _lock:
        if _started:
            return
        _started = True
    threading.Thread(target=_loop, name="vitals-log", daemon=True).start()


def payload(limit: int = MAX_LINES) -> dict:
    samples = read_recent(limit)
    marks = reboots(samples)
    return {
        "intervalS": INTERVAL_S,
        "path": PATH,
        "count": len(samples),
        "samples": samples,
        # Live reboots (from this log) + past ones (from the journal), so the
        # graph shows both the current gap and the historic power cuts.
        "reboots": marks + journal_reboots(),
    }
