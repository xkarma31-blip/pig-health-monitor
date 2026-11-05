#!/usr/bin/env python3
"""soak_collect.py — PigPulse Pi 4B edge soak collector.

Samples the Pi edge rig every ``--interval`` seconds into a local SQLite
database (default /home/pigpulse/soak/soak.db) so that a ~24 h hardware soak
can be replayed and graphed afterwards: temperature timeline, throttling,
disconnects, data rates, and processing performance.

Run by ``pigpulse-soak.service`` (User=pigpulse) on the Pi. The contract —
schema, event formats, CLI — lives in ``v3-mqtt-pocketbase/docs/SOAK_CONTRACT.md``
and this file implements it; if they disagree, fix the contract.

Modes:
  default          sample every interval, write to --db (systemd service mode)
  --stream         sample every interval, print one JSON line per sample to
                   stdout (or append to --stream-file PATH). Never touches
                   the DB — safe to run beside the service. Used by soak_live.
  --once           one sample to stdout, exit (deploy verification)
  --selftest       functional self-test into a temp DB, exit 0=PASS / 2=FAIL

stdlib only. Python 3.9+.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import signal
import sqlite3
import ssl
import subprocess
import sys
import tempfile
import time
import urllib.request

SCHEMA_VERSION = "1"
DEFAULT_DB = "/home/pigpulse/soak/soak.db"
DEFAULT_THERMAL_HOST = "127.0.0.1:8080"
DEFAULT_DISK_LOW_MB = 3000.0

SVC_UNITS = [
    "mosquitto",
    "pigpulse-bridge",
    "pigpulse-pocketbase",
    "pigpulse-cctv",
    "pigpulse-rtsp-recorder",
    "pigpulse-thermal",
    "pigpulse-soak",
]

PB_DB = "/home/pigpulse/pocketbase/pb_data/data.db"
VCGENCMD = "/usr/bin/vcgencmd"
IW = "/usr/sbin/iw"                 # NOT in PATH on the Pi
JOURNALCTL = "/usr/bin/journalctl"

THERMAL_ZONE = "/sys/class/thermal/thermal_zone0/temp"
CPU_FREQ = "/sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq"
ETH_OPER = "/sys/class/net/eth1/operstate"
WLAN_OPER = "/sys/class/net/wlan0/operstate"
BOOT_ID = "/proc/sys/kernel/random/boot_id"

HTTP_TIMEOUT_S = 3.0
JOURNAL_SCAN_S = 60.0
JOURNAL_SCAN_TIMEOUT_S = 15.0
ERROR_EVENT_MIN_S = 60.0            # rate limit for collector_error events

DDL = """
CREATE TABLE IF NOT EXISTS samples (
  ts REAL PRIMARY KEY,
  boot_id TEXT,
  cpu_temp_c REAL,
  cpu_freq_mhz REAL,
  throttle_hex TEXT,
  uv_now INTEGER, freqcap_now INTEGER, thr_now INTEGER, softlim_now INTEGER,
  uv_ever INTEGER, freqcap_ever INTEGER, thr_ever INTEGER, softlim_ever INTEGER,
  cpu_pct REAL,
  load1 REAL, load5 REAL, load15 REAL,
  mem_used_mb REAL, mem_total_mb REAL, swap_used_mb REAL,
  disk_free_mb REAL,
  sd_wr_mb_delta REAL, sd_wr_mb_total REAL,
  eth_oper TEXT, wlan_oper TEXT, wifi_clients INTEGER,
  th_ok INTEGER, th_frame INTEGER, th_fps REAL, th_read_ms INTEGER,
  th_center REAL, th_ambient REAL, th_alerts INTEGER, th_verdict TEXT,
  th_animals INTEGER, th_drift REAL,
  amb_state TEXT, amb_temp_c REAL, amb_rh REAL, amb_thi REAL, amb_age_s REAL,
  esp_conn INTEGER, esp_stale INTEGER, esp_last_ms INTEGER, esp_bytes INTEGER,
  esp_chunks INTEGER, esp_accepted INTEGER, esp_nonzero_pct REAL, esp_uptime_s INTEGER,
  pb_max_rowid INTEGER, pb_new_total INTEGER, pb_new_json TEXT,
  own_cpu_pct REAL, own_rss_mb REAL,
  svc TEXT,
  j_err_total INTEGER
);
CREATE TABLE IF NOT EXISTS events (
  ts REAL NOT NULL,
  type TEXT NOT NULL,
  detail TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
CREATE TABLE IF NOT EXISTS journal (
  ts REAL NOT NULL,
  unit TEXT NOT NULL,
  count INTEGER NOT NULL,
  err INTEGER NOT NULL,
  last TEXT
);
CREATE INDEX IF NOT EXISTS idx_journal_unit_ts ON journal(unit, ts);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
"""

# Column order for samples — must match DDL above (report/live rely on names).
SAMPLES_COLS = [
    "ts", "boot_id",
    "cpu_temp_c", "cpu_freq_mhz", "throttle_hex",
    "uv_now", "freqcap_now", "thr_now", "softlim_now",
    "uv_ever", "freqcap_ever", "thr_ever", "softlim_ever",
    "cpu_pct", "load1", "load5", "load15",
    "mem_used_mb", "mem_total_mb", "swap_used_mb",
    "disk_free_mb", "sd_wr_mb_delta", "sd_wr_mb_total",
    "eth_oper", "wlan_oper", "wifi_clients",
    "th_ok", "th_frame", "th_fps", "th_read_ms",
    "th_center", "th_ambient", "th_alerts", "th_verdict",
    "th_animals", "th_drift",
    "amb_state", "amb_temp_c", "amb_rh", "amb_thi", "amb_age_s",
    "esp_conn", "esp_stale", "esp_last_ms", "esp_bytes",
    "esp_chunks", "esp_accepted", "esp_nonzero_pct", "esp_uptime_s",
    "pb_max_rowid", "pb_new_total", "pb_new_json",
    "own_cpu_pct", "own_rss_mb",
    "svc", "j_err_total",
]

_STOP = {"flag": False, "signal": None}

_htz = None


def _hz() -> float:
    global _htz
    if _htz is None:
        try:
            _htz = float(os.sysconf("SC_CLK_TCK"))
        except (ValueError, OSError):
            _htz = 100.0
    return _htz


def _read_text(path: str):
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as fh:
            return fh.read().strip()
    except OSError:
        return None


def _read_float(path: str):
    txt = _read_text(path)
    if txt is None:
        return None
    try:
        return float(txt)
    except ValueError:
        return None


def _fl(v):
    """float-or-None, rejecting NaN/Inf (JSON and plots must stay finite)."""
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    if f != f or f in (float("inf"), float("-inf")):
        return None
    return f


def _int(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def _b(v):
    """bool-or-None -> 1/0/None."""
    if v is None:
        return None
    return 1 if v else 0


_SSL_CTX = ssl.create_default_context()
_SSL_CTX.check_hostname = False
_SSL_CTX.verify_mode = ssl.CERT_NONE


class _JournalScanError(Exception):
    pass


class Sampler:
    """Stateful sampler: one ``sample()`` call produces one full row + events."""

    def __init__(self, thermal_host: str, disk_low_mb: float, interval: float,
                 scheme: str = "https"):
        self.thermal_host = thermal_host
        self.disk_low_mb = disk_low_mb
        self.interval = interval
        self.scheme = scheme
        self._prev = {}
        self._last = {}
        self._init_done = False
        self._last_ts = None
        self._last_scan_ts = time.time()   # first journal scan at +60 s
        self._j_err_cum = None
        self._err_last = {}

    # ------------------------------------------------------------ helpers

    def _note_error(self, source: str, exc: Exception, events: list):
        now = time.time()
        last = self._err_last.get(source)
        if last is None or (now - last) >= ERROR_EVENT_MIN_S:
            self._err_last[source] = now
            events.append({
                "event_type": "collector_error",
                "detail": "%s: %s" % (source, exc),
            })

    def _emit(self, events: list, etype: str, detail: str):
        events.append({"event_type": etype, "detail": detail})

    def _trans(self, key: str, newval, events: list, etype: str, make_detail):
        """Record a state transition -> event, but stay quiet on first sample."""
        old = self._last.get(key)
        if old != newval:
            if self._init_done:
                self._emit(events, etype, make_detail(old, newval))
            self._last[key] = newval
        elif self._init_done is False and key not in self._last:
            self._last[key] = newval

    # ----------------------------------------------------------- sources

    def _read_cpu(self, row: dict):
        t = _read_float(THERMAL_ZONE)
        row["cpu_temp_c"] = round(t / 1000.0, 2) if t is not None else None
        f = _read_float(CPU_FREQ)
        row["cpu_freq_mhz"] = round(f / 1000.0, 1) if f is not None else None
        row["boot_id"] = _read_text(BOOT_ID)

    def _read_throttle(self, row: dict, events: list):
        out = subprocess.run(
            [VCGENCMD, "get_throttled"],
            capture_output=True, text=True, timeout=5,
        ).stdout.strip()
        if "=" not in out:
            raise RuntimeError("unexpected vcgencmd output: %r" % out)
        hexv = out.split("=", 1)[1].strip()
        val = int(hexv, 16)
        row["throttle_hex"] = hexv
        for name, bit in (("uv_now", 0), ("freqcap_now", 1), ("thr_now", 2),
                          ("softlim_now", 3), ("uv_ever", 16), ("freqcap_ever", 17),
                          ("thr_ever", 18), ("softlim_ever", 19)):
            row[name] = 1 if (val >> bit) & 1 else 0
        self._trans(
            "throttle_hex", hexv, events, "throttle_change",
            lambda o, n: "%s->%s" % (o if o is not None else "?", n),
        )

    def _read_stat_load(self, row: dict):
        txt = _read_text("/proc/stat")
        if txt:
            first = txt.splitlines()[0].split()
            vals = [int(x) for x in first[1:9]]  # user..steal (8 fields)
            total = sum(vals)
            busy = total - vals[3] - vals[4]     # non-idle, non-iowait
            prev = self._prev.get("cpu_stat")
            if prev is not None:
                dtot = total - prev[0]
                dbusy = busy - prev[1]
                row["cpu_pct"] = (round(100.0 * dbusy / dtot, 1)
                                  if dtot > 0 and dbusy >= 0 else None)
            else:
                row["cpu_pct"] = None
            self._prev["cpu_stat"] = (total, busy)
        else:
            row["cpu_pct"] = None
        lav = _read_text("/proc/loadavg")
        if lav:
            parts = lav.split()
            row["load1"] = _fl(parts[0])
            row["load5"] = _fl(parts[1])
            row["load15"] = _fl(parts[2])

    def _read_mem_disk(self, row: dict):
        mem = {}
        txt = _read_text("/proc/meminfo")
        if txt:
            for line in txt.splitlines():
                k, _, v = line.partition(":")
                if k in ("MemTotal", "MemAvailable", "SwapTotal", "SwapFree"):
                    try:
                        mem[k] = float(v.strip().split()[0])  # kB
                    except (ValueError, IndexError):
                        pass
        total = mem.get("MemTotal")
        avail = mem.get("MemAvailable")
        st, sf = mem.get("SwapTotal"), mem.get("SwapFree")
        row["mem_total_mb"] = round(total / 1024.0, 1) if total is not None else None
        row["mem_used_mb"] = (round(max(0.0, total - avail) / 1024.0, 1)
                              if total is not None and avail is not None else None)
        row["swap_used_mb"] = (round(max(0.0, st - sf) / 1024.0, 1)
                               if st is not None and sf is not None else None)
        try:
            vfs = os.statvfs("/")
            row["disk_free_mb"] = round(vfs.f_bavail * vfs.f_frsize / 1e6, 1)
        except OSError:
            row["disk_free_mb"] = None

    def _read_diskstats(self, row: dict):
        txt = _read_text("/proc/diskstats")
        sectors = None
        if txt:
            for line in txt.splitlines():
                parts = line.split()
                if len(parts) >= 10 and parts[2] == "mmcblk0":
                    sectors = int(parts[9])      # sectors written (awk field 10)
                    break
        if sectors is None:
            return
        total_mb = sectors * 512 / 1e6
        row["sd_wr_mb_total"] = round(total_mb, 2)
        prev = self._prev.get("disk_sectors")
        row["sd_wr_mb_delta"] = (round((sectors - prev) * 512 / 1e6, 3)
                                 if prev is not None and sectors >= prev else None)
        self._prev["disk_sectors"] = sectors

    def _read_net(self, row: dict, events: list):
        eth = _read_text(ETH_OPER)
        wlan = _read_text(WLAN_OPER)
        row["eth_oper"] = eth
        row["wlan_oper"] = wlan
        changed = []
        if eth is not None:
            old = self._last.get("eth_oper")
            if old != eth:
                if self._init_done:
                    changed.append("eth1 %s->%s" % (old, eth))
                self._last["eth_oper"] = eth
        if wlan is not None:
            old = self._last.get("wlan_oper")
            if old != wlan:
                if self._init_done:
                    changed.append("wlan0 %s->%s" % (old, wlan))
                self._last["wlan_oper"] = wlan
        if changed:
            self._emit(events, "link_change", ",".join(changed))

    def _read_wifi_clients(self, row: dict):
        out = subprocess.run(
            [IW, "dev", "wlan0", "station", "dump"],
            capture_output=True, text=True, timeout=10,
        ).stdout
        count = 0
        for line in out.splitlines():
            if line.strip().startswith("Station"):
                count += 1
        row["wifi_clients"] = count

    def _fetch_json(self, path: str) -> dict:
        other = "http" if self.scheme == "https" else "https"
        last_exc = None
        for sch in (self.scheme, other):
            url = "%s://%s%s" % (sch, self.thermal_host, path)
            try:
                req = urllib.request.Request(
                    url, headers={"User-Agent": "pigpulse-soak/1.0"})
                with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT_S,
                                            context=_SSL_CTX) as resp:
                    body = resp.read(262144)
                obj = json.loads(body.decode("utf-8", "replace"))
                self.scheme = sch
                return obj
            except Exception as e:  # noqa: BLE001 - report both schemes' failure
                last_exc = e
        raise RuntimeError("endpoint %s unreachable (%s)" % (path, last_exc))

    def _read_thermal(self, row: dict, events: list):
        try:
            obj = self._fetch_json("/data")
        except Exception as e:  # noqa: BLE001
            self._note_error("thermal:/data", e, events)
            row["th_ok"] = 0
            self._trans(
                "th_ok", 0, events, "th_ok_change",
                lambda o, n: "%s->%s: %s" % (o, n, e))
            return
        ok = obj.get("ok") is True
        row["th_ok"] = 1 if ok else 0
        if ok:
            row["th_frame"] = _int(obj.get("frame"))
            row["th_fps"] = _fl(obj.get("fps"))
            row["th_read_ms"] = _int(obj.get("readMs"))
            row["th_center"] = _fl(obj.get("center"))
            row["th_ambient"] = _fl(obj.get("ambient"))
            row["th_alerts"] = _int(obj.get("alerts"))
            row["th_verdict"] = obj.get("verdict") if isinstance(obj.get("verdict"), str) else None
            rad = obj.get("radiometry") if isinstance(obj.get("radiometry"), dict) else {}
            row["th_animals"] = _int(rad.get("animalCount"))
            row["th_drift"] = _fl(rad.get("driftBiasC"))
            detail_err = None
        else:
            detail_err = str(obj.get("error") or "unknown")
        self._trans(
            "th_ok", row["th_ok"], events, "th_ok_change",
            lambda o, n: "%s->%s%s" % (o if o is not None else "?",
                                       n, (": %s" % detail_err) if detail_err else ""))

    def _read_esp(self, row: dict, events: list):
        obj = self._fetch_json("/esp/status")   # raises -> outer guard
        conn = obj.get("connected")
        stale = obj.get("stale")
        row["esp_conn"] = _b(conn)
        row["esp_stale"] = _b(stale)
        row["esp_last_ms"] = _int(obj.get("lastMs"))
        row["esp_bytes"] = _int(obj.get("bytes"))
        row["esp_chunks"] = _int(obj.get("chunks"))
        row["esp_accepted"] = _int(obj.get("accepted"))
        row["esp_nonzero_pct"] = _fl(obj.get("nonzeroPct"))
        row["esp_uptime_s"] = _int(obj.get("uptimeS"))
        ckey = (row["esp_conn"], row["esp_stale"])
        old = self._last.get("esp_key")
        if old != ckey:
            if self._init_done:
                last_ms = row.get("esp_last_ms")
                self._emit(events, "esp_change", "connected %s->%s stale %s->%s (lastMs=%s)"
                           % (old[0] if old else "?", ckey[0],
                              old[1] if old else "?", ckey[1], last_ms))
            self._last["esp_key"] = ckey

    def _read_ambient(self, row: dict, events: list):
        obj = self._fetch_json("/ambient")      # raises -> outer guard
        row["amb_state"] = obj.get("state") if isinstance(obj.get("state"), str) else None
        row["amb_temp_c"] = _fl(obj.get("temperature"))
        row["amb_rh"] = _fl(obj.get("humidity"))
        row["amb_thi"] = _fl(obj.get("thi"))
        row["amb_age_s"] = _fl(obj.get("ageS"))
        self._trans(
            "amb_state", row["amb_state"], events, "amb_state_change",
            lambda o, n: "%s->%s" % (o, n))

    def _read_svc(self, row: dict, events: list):
        p = subprocess.run(
            ["systemctl", "is-active"] + SVC_UNITS,
            capture_output=True, text=True, timeout=10,
        )
        lines = p.stdout.strip().splitlines()
        states = {}
        for i, unit in enumerate(SVC_UNITS):
            states[unit] = lines[i].strip() if i < len(lines) and lines[i].strip() else "unknown"
        svc = ",".join("%s=%s" % (u, states[u]) for u in SVC_UNITS)
        row["svc"] = svc
        old = self._last.get("svc")
        if old != svc:
            if self._init_done:
                old_d = dict(kv.split("=", 1) for kv in old.split(",") if "=" in kv)
                parts = ["%s: %s->%s" % (u, old_d.get(u, "?"), states[u])
                         for u in SVC_UNITS if old_d.get(u) != states[u]]
                self._emit(events, "svc_change", ",".join(parts) or "changed")
            self._last["svc"] = svc

    def _read_pb(self, row: dict):
        uri = "file:%s?mode=ro" % PB_DB
        con = sqlite3.connect(uri, uri=True, timeout=5)
        try:
            cur = con.execute("SELECT MAX(rowid) FROM telemetry")
            maxrow = cur.fetchone()[0]
            if maxrow is None:
                maxrow = 0
            maxrow = int(maxrow)
            prev = self._prev.get("pb_max")
            if prev is None:
                new_json, new_total = {}, 0
            elif maxrow >= prev:
                new_json, new_total = {}, 0
                for dev, cnt in con.execute(
                        "SELECT deviceId, COUNT(*) FROM telemetry "
                        "WHERE rowid > ? GROUP BY deviceId", (prev,)):
                    new_json[str(dev)] = int(cnt)
                    new_total += int(cnt)
            else:  # DB replaced / rotated — reset baseline, no negative rate
                new_json, new_total = None, None
            row["pb_max_rowid"] = maxrow
            row["pb_new_total"] = new_total
            row["pb_new_json"] = json.dumps(new_json, separators=(",", ":")) \
                if new_json is not None else None
            self._prev["pb_max"] = maxrow
        finally:
            con.close()

    def _read_own(self, row: dict):
        txt = _read_text("/proc/self/stat")
        if txt:
            rest = txt.rsplit(")", 1)[1].split()
            ticks = int(rest[11]) + int(rest[12])   # utime + stime
            now_m = time.monotonic()
            prev = self._prev.get("own_ticks")
            if prev is not None:
                dt = now_m - prev[1]
                row["own_cpu_pct"] = (round(100.0 * (ticks - prev[0]) / _hz() / dt, 1)
                                      if dt > 0 and ticks >= prev[0] else None)
            self._prev["own_ticks"] = (ticks, now_m)
        status = _read_text("/proc/self/status")
        if status:
            m = re.search(r"^VmRSS:\s+(\d+)\s+kB", status, re.M)
            row["own_rss_mb"] = round(int(m.group(1)) / 1024.0, 1) if m else None

    def _journal_scan(self, ts: float) -> dict:
        since = int(self._last_scan_ts)
        args = [JOURNALCTL, "--no-pager", "-o", "json",
                "--output-fields=MESSAGE,PRIORITY,_SYSTEMD_UNIT",
                "--since=@%d" % since]
        for u in SVC_UNITS:
            args += ["-u", u]
        p = subprocess.run(args, capture_output=True, text=True,
                           timeout=JOURNAL_SCAN_TIMEOUT_S)
        per = {}
        for line in p.stdout.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                ent = json.loads(line)
            except ValueError:
                continue
            unit = str(ent.get("_SYSTEMD_UNIT") or "unknown")
            if unit.endswith(".service"):
                unit = unit[:-len(".service")]
            try:
                prio = int(ent.get("PRIORITY", 6))
            except (TypeError, ValueError):
                prio = 6
            msg = ent.get("MESSAGE", "")
            if isinstance(msg, list):
                try:
                    msg = bytes(msg).decode("utf-8", "replace")
                except Exception:  # noqa: BLE001
                    msg = str(msg)
            d = per.setdefault(unit, {"count": 0, "err": 0, "last": ""})
            d["count"] += 1
            if prio <= 3:
                d["err"] += 1
            if msg:
                d["last"] = str(msg)[:300]
        for u in SVC_UNITS:   # always emit a row per unit (count may be 0)
            per.setdefault(u, {"count": 0, "err": 0, "last": ""})
        return per

    # ------------------------------------------------------------- cycle

    def sample(self):
        """Return (row: dict, events: list, journal_rows: dict|None)."""
        ts = time.time()
        row = {}
        events = []
        journal_rows = None

        # sample_miss detection (suspend / clock jump / SIGSTOP)
        if self._last_ts is not None:
            gap = ts - self._last_ts
            if gap > 2.5 * self.interval:
                self._emit(events, "sample_miss",
                           "gap %.1fs (expected %.1fs)" % (gap, self.interval))
        self._last_ts = ts

        # journal scan (every 60 s) runs first so j_err_total is current
        if ts - self._last_scan_ts >= JOURNAL_SCAN_S:
            try:
                journal_rows = self._journal_scan(ts)
                window_err = sum(d["err"] for d in journal_rows.values())
                self._j_err_cum = (window_err if self._j_err_cum is None
                                   else self._j_err_cum + window_err)
                self._last_scan_ts = ts
            except Exception as e:  # noqa: BLE001
                self._note_error("journal", e, events)
        row["j_err_total"] = self._j_err_cum

        for name, fn, want_events in (
            ("cpu", self._read_cpu, False),
            ("throttle", self._read_throttle, True),
            ("stat", self._read_stat_load, False),
            ("mem", self._read_mem_disk, False),
            ("diskstats", self._read_diskstats, False),
            ("net", self._read_net, True),
            ("wifi", self._read_wifi_clients, False),
            ("thermal", self._read_thermal, True),
            ("esp", self._read_esp, True),
            ("ambient", self._read_ambient, True),
            ("svc", self._read_svc, True),
            ("pb", self._read_pb, False),
            ("own", self._read_own, False),
        ):
            try:
                if want_events:
                    fn(row, events)
                else:
                    fn(row)
            except Exception as e:  # noqa: BLE001
                self._note_error(name, e, events)

        # disk low/ok crossings
        free = row.get("disk_free_mb")
        if free is not None:
            low = free < self.disk_low_mb
            old = self._last.get("disk_low")
            if old is None:
                self._last["disk_low"] = low
            elif low and not old:
                self._emit(events, "disk_low",
                           "free %.0f MB < %.0f MB" % (free, self.disk_low_mb))
                self._last["disk_low"] = low
            elif not low and old:
                self._emit(events, "disk_ok", "free %.0f MB" % free)
                self._last["disk_low"] = low

        self._init_done = True
        for col in SAMPLES_COLS:
            row.setdefault(col, None)
        row["ts"] = round(ts, 3)
        return row, events, journal_rows


# ---------------------------------------------------------------- storage

def open_db(path: str) -> sqlite3.Connection:
    con = sqlite3.connect(path, timeout=5)
    con.execute("PRAGMA busy_timeout=5000")
    con.execute("PRAGMA journal_mode=WAL")
    con.executescript(DDL)
    con.commit()
    return con


def meta_get(con, key):
    try:
        cur = con.execute("SELECT value FROM meta WHERE key=?", (key,))
        r = cur.fetchone()
        return r[0] if r else None
    except sqlite3.Error:
        return None


def meta_set(con, key, value):
    con.execute("INSERT OR REPLACE INTO meta (key, value) VALUES (?,?)", (key, value))


def insert_sample(con, row: dict):
    cols = [c for c in SAMPLES_COLS if c in row]
    sql = "INSERT OR REPLACE INTO samples (%s) VALUES (%s)" % (
        ",".join(cols), ",".join("?" * len(cols)))
    con.execute(sql, [row[c] for c in cols])


def insert_events(con, ts: float, events: list):
    for e in events:
        con.execute("INSERT INTO events (ts, type, detail) VALUES (?,?,?)",
                    (ts, e["event_type"], e["detail"]))


def insert_journal(con, ts: float, jrows: dict):
    for unit in sorted(jrows):
        d = jrows[unit]
        con.execute("INSERT INTO journal (ts, unit, count, err, last) VALUES (?,?,?,?,?)",
                    (ts, unit, d["count"], d["err"], d["last"]))


def prune(con, retention_days: float, ts: float):
    cutoff = ts - retention_days * 86400.0
    for table in ("samples", "events", "journal"):
        con.execute("DELETE FROM %s WHERE ts < ?" % table, (cutoff,))


def startup(con, interval: float, db_path: str):
    cur_boot = _read_text(BOOT_ID)
    old_boot = meta_get(con, "last_boot_id")
    now = time.time()
    if cur_boot:
        if old_boot and old_boot != cur_boot:
            con.execute("INSERT INTO events (ts, type, detail) VALUES (?,?,?)",
                        (now, "reboot", "%s -> %s" % (old_boot, cur_boot)))
        meta_set(con, "last_boot_id", cur_boot)
    meta_set(con, "schema_version", SCHEMA_VERSION)
    con.execute("INSERT INTO events (ts, type, detail) VALUES (?,?,?)",
                (now, "collector_start",
                 "schema=%s interval=%s db=%s" % (SCHEMA_VERSION, _fmt_interval(interval), db_path)))
    con.commit()


def _fmt_interval(v: float) -> str:
    return str(int(v)) if float(v).is_integer() else ("%.3f" % v).rstrip("0")


def emit_stream(out, row: dict, events: list):
    lines = []
    payload = dict(row)
    payload["type"] = "sample"
    try:
        lines.append(json.dumps(payload, separators=(",", ":"), allow_nan=False))
        for e in events:
            lines.append(json.dumps({"type": "event",
                                     "event_type": e["event_type"],
                                     "detail": e["detail"]},
                                    separators=(",", ":"), allow_nan=False))
    except (ValueError, TypeError) as exc:   # never kill a 24 h stream on one row
        lines = [json.dumps({"type": "sample_error", "error": str(exc)})]
    for line in lines:
        out.write(line + "\n")
    out.flush()


def _install_signals():
    def handler(signum, _frame):
        _STOP["flag"] = True
        _STOP["signal"] = signum
    signal.signal(signal.SIGTERM, handler)
    signal.signal(signal.SIGINT, handler)


def _sleep_until(t0: float, interval: float):
    while not _STOP["flag"]:
        remaining = (t0 + interval) - time.monotonic()
        if remaining <= 0:
            return
        time.sleep(min(0.25, remaining))


def parse_args(argv):
    ap = argparse.ArgumentParser(
        description="PigPulse Pi edge soak collector (see docs/SOAK_CONTRACT.md)")
    ap.add_argument("--db", default=DEFAULT_DB)
    ap.add_argument("--interval", type=float, default=10.0)
    ap.add_argument("--thermal-url", default=DEFAULT_THERMAL_HOST,
                    help="HOST:PORT of the thermal dashboard (default %(default)s)")
    ap.add_argument("--stream", action="store_true",
                    help="JSONL to stdout, no DB access")
    ap.add_argument("--stream-file", default=None,
                    help="append JSONL to PATH ('-' = stdout)")
    ap.add_argument("--once", action="store_true",
                    help="one sample to stdout, exit")
    ap.add_argument("--disk-low-mb", type=float, default=DEFAULT_DISK_LOW_MB)
    ap.add_argument("--retention-days", type=float, default=0.0,
                    help="0 = keep everything")
    ap.add_argument("--selftest", action="store_true")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args(argv)
    if args.interval < 1.0:
        ap.error("--interval must be >= 1.0 s")
    if args.disk_low_mb <= 0:
        ap.error("--disk-low-mb must be > 0")
    return args


def _build_sampler(args):
    host, scheme = args.thermal_url, "https"
    if host.startswith("https://"):
        host = host[len("https://"):]
    elif host.startswith("http://"):
        host, scheme = host[len("http://"):], "http"
    host = host.rstrip("/")
    return Sampler(host, args.disk_low_mb, args.interval, scheme=scheme)


def selftest() -> int:
    with tempfile.TemporaryDirectory() as td:
        db = os.path.join(td, "soak.db")
        sampler = _build_sampler(argparse.Namespace(
            thermal_url="127.0.0.1:9", disk_low_mb=DEFAULT_DISK_LOW_MB, interval=1.0))
        con = open_db(db)
        startup(con, 1.0, db)
        n = 0
        for _ in range(3):
            row, events, jrows = sampler.sample()
            insert_sample(con, row)
            insert_events(con, row["ts"], events)
            if jrows:
                insert_journal(con, row["ts"], jrows)
            con.commit()
            n += 1
            if n < 3:
                time.sleep(1.0)
        con.execute("INSERT INTO events (ts, type, detail) VALUES (?,?,?)",
                    (time.time(), "collector_stop", "selftest"))
        con.commit()
        rows = con.execute("SELECT COUNT(*) FROM samples").fetchone()[0]
        types = {r[0] for r in con.execute("SELECT DISTINCT type FROM events")}
        ok = rows >= 3 and "collector_start" in types and "collector_stop" in types
        th_ok_vals = [r[0] for r in con.execute("SELECT th_ok FROM samples")]
        ok = ok and all(v == 0 for v in th_ok_vals)   # dead endpoint -> honest 0
        con.close()
        print("PASS selftest: samples=%d events=%s" % (rows, sorted(types))
              if ok else
              "FAIL selftest: samples=%d events=%s th_ok=%s" % (rows, sorted(types), th_ok_vals))
        return 0 if ok else 2


def main(argv=None) -> int:
    args = parse_args(argv)
    if args.selftest:
        return selftest()

    sampler = _build_sampler(args)

    if args.once:
        row, events, _ = sampler.sample()
        emit_stream(sys.stdout, row, events)
        return 0

    stream_out = None
    if args.stream_file is not None:
        if args.stream_file == "-":
            stream_out = sys.stdout
        else:
            stream_out = open(args.stream_file, "a", encoding="utf-8")
    elif args.stream:
        stream_out = sys.stdout

    con = None
    if stream_out is None:
        con = open_db(args.db)
        startup(con, args.interval, args.db)

    _install_signals()
    cycle = 0
    try:
        while not _STOP["flag"]:
            t0 = time.monotonic()
            row, events, jrows = sampler.sample()
            if con is not None:
                insert_sample(con, row)
                insert_events(con, row["ts"], events)
                if jrows:
                    insert_journal(con, row["ts"], jrows)
                cycle += 1
                if args.retention_days > 0 and cycle % 360 == 1:
                    prune(con, args.retention_days, row["ts"])
                con.commit()
            if stream_out is not None:
                emit_stream(stream_out, row, events)
            if args.verbose:
                print("[soak] ts=%.0f cpu=%s thr=%s th_ok=%s esp=%s svc_ok=%s" % (
                    row["ts"], row.get("cpu_temp_c"), row.get("throttle_hex"),
                    row.get("th_ok"), row.get("esp_conn"),
                    "yes" if row.get("svc") and "failed" not in row["svc"]
                    and "unknown" not in row["svc"] else "no"), file=sys.stderr)
            _sleep_until(t0, args.interval)
    finally:
        if con is not None:
            try:
                reason = ("signal %s" % _STOP["signal"]
                          if _STOP["signal"] is not None else "clean exit")
                con.execute("INSERT INTO events (ts, type, detail) VALUES (?,?,?)",
                            (time.time(), "collector_stop", reason))
                con.commit()
            except sqlite3.Error:
                pass
            con.close()
        if stream_out is not None and stream_out is not sys.stdout:
            stream_out.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
