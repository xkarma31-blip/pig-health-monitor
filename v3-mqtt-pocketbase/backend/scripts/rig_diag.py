#!/usr/bin/env python3
"""rig_diag.py — end-to-end PigPulse diagnosis, run from the OPERATOR side.

`pi_diag.py` answers "is this Pi healthy?" *on* the Pi. This answers the harder
question the app actually depends on: **which hop between the pig and the phone
is broken?** Every check below names its hop, cites the readout it saw, and
suggests the next action. Nothing is assumed and nothing is called "confirmed"
without the value that proves it.

    python3 rig_diag.py                 # human report
    python3 rig_diag.py --json          # machine readable
    python3 rig_diag.py --html out.html # shareable, phone-friendly report
    python3 rig_diag.py --deep          # also capture 2 s of mic audio
    python3 rig_diag.py --ssh pigpulse@raspberrypi.local   # + Pi host layer

WHY THE THRESHOLDS BELOW ARE THESE NUMBERS (measured 2026-11-04/05):
  * console FPS 2.00, frame age 0.3 s, ambient age 0.1-2.1 s   → healthy
  * mic nonzeroPct 99.9, rate 48000, channels 2                → healthy
  * Pi clock vs laptop: 1 s apart (the Pi has NO RTC, so this is NTP doing it)
  * vcgencmd get_throttled 0x0, temp 72.0'C, disk 33 %, load1/cores 1.48
  * Pi PocketBase newest row 51122 s old while the console was live → the
    real failure this script exists to catch: a fresh sensor chain feeding a
    stale database, because the Pi's PocketBase binds ONLY to its barn-AP
    address and the operator machine was cabled instead.

GROUND RULES (from .agents/skills/thermal-pi-edge):
  * Never open a socket to :9090 — that port serves exactly ONE client (the
    ESP) and probing it would evict the live audio stream. Never used here.
  * Zeros are a null source, not a quiet room. A zero RMS FAILS; a low-but-real
    RMS is reported as a number, not a verdict.
  * The Pi AP has no WAN, so cloud sync runs on the operator machine. If the
    database is stale while the console is live, the hop to name is the sync
    path, not the sensor.
  * stdlib only. TLS to the console is self-signed by design → unverified.

EXIT CODES: 0 all good · 1 something FAILED · 2 only WARNings · 3 the script
itself could not run (bad arguments, no candidates configured).
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import shutil
import socket
import ssl
import struct
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

# ── Grounded thresholds (see the docstring for the measurements behind them) ──
FPS_OK, FPS_WARN = 1.0, 0.2
FRAME_AGE_OK_S, FRAME_AGE_WARN_S = 5.0, 30.0
AMBIENT_AGE_OK_S, AMBIENT_AGE_WARN_S = 15.0, 120.0
MIC_NONZERO_OK, MIC_NONZERO_WARN = 95.0, 50.0
MIC_RMS_ZERO = 0.0          # bit-exact silence == nothing driving the line
PB_AGE_OK_S, PB_AGE_WARN_S = 120.0, 3600.0
CLOCK_DRIFT_OK_S, CLOCK_DRIFT_WARN_S = 5.0, 120.0
TEMP_OK_C, TEMP_WARN_C = 80.0, 85.0
DISK_OK_PCT, DISK_WARN_PCT = 85.0, 95.0
LOAD_OK, LOAD_WARN = 1.0, 2.0
BOOTS_WARN_24H = 3

DEFAULT_CANDIDATES = (
    "https://raspberrypi.local:8080",
    "https://192.168.69.1:8080",
    "https://10.42.0.28:8080",
)
DEFAULT_BRIDGE = "https://pig-health-monitor.vercel.app"
PROXY_ENV = "/etc/pigpulse/readonly-proxy.env"
PROXY_HEALTH = "http://127.0.0.1:8099/health"
PB_DEFAULT = "http://127.0.0.1:8090"
TELEMETRY_DEVICES = ("pi-thermal-01", "s3-mic-01")

_SSL = ssl._create_unverified_context()
RESULTS: list[dict[str, Any]] = []


def add(layer: str, name: str, state: str, detail: str, nxt: str = "") -> None:
    """Record one check. state: PASS | WARN | FAIL | INFO."""
    RESULTS.append({"layer": layer, "name": name, "state": state, "detail": detail, "next": nxt})


def worst(states: list[str]) -> str:
    for s in ("FAIL", "WARN", "INFO", "PASS"):
        if s in states:
            return s
    return "PASS"


def http_get(url: str, timeout: float = 4.0, headers: dict[str, str] | None = None,
             want_bytes: bool = False) -> tuple[int, Any, float]:
    """GET with a hard timeout. Returns (status, body, seconds). status 0 = no answer."""
    req = urllib.request.Request(url, method="GET")
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    started = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=_SSL) as resp:
            raw = resp.read(1_000_000 if not want_bytes else 4_000_000)
            body = raw if want_bytes else raw.decode("utf-8", "replace")
            return resp.getcode() or 200, body, time.time() - started
    except urllib.error.HTTPError as e:
        try:
            body = e.read(200_000)
            if not want_bytes:
                body = body.decode("utf-8", "replace")
        except Exception:  # noqa: BLE001
            body = ""
        return e.code, body, time.time() - started
    except Exception:  # noqa: BLE001 — DNS, TLS, refused, timeout
        return 0, "", time.time() - started


def probe(host: str, port: int, timeout: float = 4.0) -> float | None:
    """TCP connect latency in seconds, or None. Used for PB and the proxy."""
    started = time.time()
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return time.time() - started
    except OSError:
        return None


# ── Layer 0: how is the rig attached, and which address answers? ─────────────
def layer_network(candidates: list[str]) -> tuple[str | None, dict[str, Any]]:
    # Parallel: a dead candidate costs a full timeout, and knowing every address
    # that answers is useful — it names how the rig is attached.
    import concurrent.futures as _cf

    def one(base: str) -> tuple[str, int, float]:
        status, _body, took = http_get(f"{base}/health", timeout=5.0)
        return base, status, took

    chosen: str | None = None
    chosen_latency = 0.0
    tried: list[str] = []
    with _cf.ThreadPoolExecutor(max_workers=len(candidates)) as pool:
        for base, status, took in pool.map(one, candidates):
            host = base.rsplit("//", 1)[-1]
            tried.append(f"{host}={'ok' if status == 200 else f'no({status or 'timeout'})'}")
            if status == 200 and chosen is None:
                chosen, chosen_latency = base, took
    detail = " · ".join(tried)
    if chosen:
        add("L0 network", "console reachable", "PASS",
            f"{chosen} in {chosen_latency * 1000:.0f} ms · tried: {detail}")
    else:
        add("L0 network", "console reachable", "FAIL",
            f"no candidate answered: {detail}",
            "check the rig's power and how it is attached (AP vs cable); "
            "the Pi has no WAN of its own, so nothing else can reach it")
    return chosen, {"chosen": chosen, "latency": chosen_latency, "tried": detail}


# ── Layer 1: the Pi console (sensors, mic, camera semantics) ────────────────
def parse_health(text: str) -> dict[str, Any]:
    out: dict[str, Any] = {}
    patterns = {
        "sensor_ready": r"Sensor ready:\s*(\w+)",
        "frame_valid": r"Frame valid:\s*(\w+)",
        "frame_count": r"Frame count:\s*(\d+)",
        "fps_reported": r"Measured FPS:\s*([\d.]+)",
        "frame_age_s": r"Frame age s:\s*([\d.]+)",
        "temp_c": r"(?:temp|temperature)[=:]\s*([\d.]+)",
        "mic_connected": r"ESP32-S3 mic:\s*(\w+)",
        "mic_nonzero": r"nonzero=([\d.]+)%",
        "ambient_state": r"Ambient \(SHT45\):\s*(\w+)",
        "ambient_age": r"age=([\d.]+)s",
        "local_ipv4": r"Local IPv4:\s*([\d., ]+)",
    }
    for key, pat in patterns.items():
        m = re.search(pat, text)
        if m:
            out[key] = m.group(1).strip()
    return out


def layer_console(base: str, deep: bool) -> dict[str, Any]:
    facts: dict[str, Any] = {}

    status, body, took = http_get(f"{base}/health", timeout=6.0)
    if status != 200:
        add("L1 console", "/health", "FAIL", f"HTTP {status or 'timeout'} in {took:.1f}s",
            "the console process is down; check `systemctl status pigpulse-thermal` on the Pi")
        return facts
    h = parse_health(body)
    facts.update(h)
    ready = h.get("sensor_ready") == "yes"
    valid = h.get("frame_valid") == "yes"
    add("L1 console", "MLX90640", "PASS" if ready and valid else "FAIL",
        f"sensor ready={h.get('sensor_ready')} frame valid={h.get('frame_valid')} "
        f"count={h.get('frame_count')} i2c={re.search(r'I2C bus: (\S+)', body).group(1) if 'I2C bus:' in body else '?'}",
        "" if ready and valid else "check the I2C wiring/address (0x33 on /dev/i2c-1)")

    fps = float(h.get("fps_reported", 0) or 0)
    age = float(h.get("frame_age_s", 999) or 999)
    state = "PASS" if fps >= FPS_OK and age <= FRAME_AGE_OK_S else (
        "WARN" if fps >= FPS_WARN and age <= FRAME_AGE_WARN_S else "FAIL")
    add("L1 console", "frame freshness", state,
        f"{fps:.2f} FPS self-reported, newest frame {age:.1f}s old",
        "" if state == "PASS" else "a live-but-slow camera starves the thermal view; check Pi load and the MLX refresh setting")

    # /data twice, 2 s apart: a MEASURED fps, independent of what /health claims.
    s1, b1, _ = http_get(f"{base}/data", timeout=5.0)
    time.sleep(2.0)
    s2, b2, _ = http_get(f"{base}/data", timeout=5.0)
    if s1 == 200 and s2 == 200:
        try:
            f1 = json.loads(b1).get("frame")
            f2 = json.loads(b2).get("frame")
            measured = (f2 - f1) / 2.0 if isinstance(f1, int) and isinstance(f2, int) else None
            facts["fps_measured"] = measured
            agree = measured is not None and fps > 0 and abs(measured - fps) / fps <= 0.5
            add("L1 console", "frame rate (measured)", "PASS" if agree else "WARN",
                f"{measured:.2f} FPS measured over 2 s vs {fps:.2f} reported",
                "" if agree else "the self-reported rate disagrees with the frames actually produced")
        except (ValueError, TypeError) as e:
            add("L1 console", "frame rate (measured)", "WARN", f"could not compare frames: {e}")
    else:
        add("L1 console", "/data", "FAIL", f"HTTP {s1}/{s2}",
            "the console answers /health but not /data — the thermal worker is wedged")

    # Ambient (SHT45 via the ESP32-S3).
    status, body, _ = http_get(f"{base}/ambient", timeout=5.0)
    if status != 200:
        add("L1 console", "ambient", "FAIL", f"HTTP {status or 'timeout'}",
            "the ESP32-S3 is the only ambient source; it must be powered and associated")
    else:
        try:
            a = json.loads(body)
            age_s = float(a.get("ageS", 9999))
            mic_online = bool(a.get("micOnline"))
            state = "PASS" if age_s <= AMBIENT_AGE_OK_S and mic_online else (
                "WARN" if age_s <= AMBIENT_AGE_WARN_S else "FAIL")
            add("L1 console", "ambient", state,
                f"state={a.get('state')} {a.get('temperature')}C {a.get('humidity')}% "
                f"age={age_s:.1f}s micOnline={mic_online} mqtt={a.get('mqttConnected')}",
                "" if state == "PASS" else "no fresh SHT45 reading: check the ESP's power and its association with the PigPulse AP")
            facts["ambient_age_s"] = age_s
            facts["ambient_temp"] = a.get("temperature")
        except ValueError:
            add("L1 console", "ambient", "WARN", "unparseable /ambient payload")

    # Mic socket state — read, never opened (see the ground rules).
    status, body, _ = http_get(f"{base}/esp/status", timeout=5.0)
    if status != 200:
        add("L1 console", "barn mic", "FAIL", f"HTTP {status or 'timeout'}",
            "the ingest service is not answering; check pigpulse-thermal")
    else:
        try:
            e = json.loads(body)
            nz = float(e.get("nonzeroPct", 0))
            ok = bool(e.get("connected")) and bool(e.get("socket")) and not e.get("stale")
            state = "PASS" if ok and nz >= MIC_NONZERO_OK else (
                "WARN" if ok and nz >= MIC_NONZERO_WARN else "FAIL")
            add("L1 console", "barn mic", state,
                f"connected={e.get('connected')} socket={e.get('socket')} stale={e.get('stale')} "
                f"nonzero={nz:.1f}% rate={e.get('rate')} peer={e.get('peer')}",
                "" if state == "PASS" else
                "zeros mean nothing is driving the line, not a quiet room — check the ESP32-S3 power and its I2S mic")
            facts["mic_nonzero"] = nz
            facts["mic_peer"] = e.get("peer")
        except ValueError:
            add("L1 console", "barn mic", "WARN", "unparseable /esp/status payload")

    # CCTV: an empty 200 is a LIE, a 503 with a reason is honest.
    status, body, took = http_get(f"{base}/cctv", timeout=9.0, want_bytes=True)
    if status == 200 and isinstance(body, bytes) and body[:2] == b"\xff\xd8":
        add("L1 console", "cctv", "PASS", f"real JPEG frame, {len(body)}B in {took:.1f}s")
    elif status == 503:
        reason = body.decode("utf-8", "replace").strip() if isinstance(body, bytes) else str(body).strip()
        add("L1 console", "cctv", "WARN", f"503 in {took:.1f}s: {reason or 'no reason given'}",
            "the camera is not sending video. That is a power/cable fact, not a code bug")
    elif status == 200:
        add("L1 console", "cctv", "FAIL",
            f"200 OK with an EMPTY body after {took:.1f}s — the handler promises a stream it cannot deliver",
            "clients cannot tell this from a slow camera and will wait out their own timeout")
    else:
        add("L1 console", "cctv", "WARN", f"HTTP {status or 'timeout'} in {took:.1f}s",
            "the Pi's MJPEG proxy is unreachable")

    if deep:
        status, body, took = http_get(f"{base}/esp/record?seconds=2", timeout=25.0, want_bytes=True)
        if status == 200 and isinstance(body, bytes) and body[:4] == b"RIFF":
            rms, peak, frames = wav_levels(body)
            state = "PASS" if rms > MIC_RMS_ZERO else "FAIL"
            add("L1 console", "mic capture", state,
                f"{len(body)}B WAV, {frames} frames, rms={rms:.1f} peak={peak} in {took:.1f}s",
                "" if state == "PASS" else "bit-exact silence: nothing is driving the line")
            facts["mic_rms"] = rms
        elif status == 503:
            reason = body.decode("utf-8", "replace").strip() if isinstance(body, bytes) else ""
            add("L1 console", "mic capture", "WARN", f"503: {reason or 'no audio available'}")
        else:
            add("L1 console", "mic capture", "WARN", f"HTTP {status or 'timeout'}")
    return facts


def wav_levels(wav: bytes) -> tuple[float, int, int]:
    """RMS, peak and frame count of a PCM16 WAV. Standard library only."""
    idx = wav.find(b"data")
    if idx < 0 or len(wav) < idx + 8:
        return 0.0, 0, 0
    size = struct.unpack("<I", wav[idx + 4:idx + 8])[0]
    pcm = wav[idx + 8: idx + 8 + size]
    n = len(pcm) // 2
    if n == 0:
        return 0.0, 0, 0
    samples = struct.unpack(f"<{n}h", pcm[: n * 2])
    peak = max(abs(s) for s in samples)
    rms = math.sqrt(sum(s * s for s in samples) / n)
    return rms, peak, n // 2


# ── Layer 2: the Pi host (power, thermals, clock, boot history) ─────────────
def layer_host(target: str) -> None:
    script = (
        "echo MODEL=$(cat /proc/device-tree/model 2>/dev/null | tr -d '\\0');"
        "echo KERNEL=$(uname -r);"
        "echo BOOT=$(uptime -s);"
        "echo UP=$(cut -d. -f1 /proc/uptime);"
        "echo EPOCH=$(date +%s);"
        "echo THROTTLED=$(vcgencmd get_throttled 2>/dev/null | cut -d= -f2);"
        "echo TEMP=$(vcgencmd measure_temp 2>/dev/null | tr -dc '0-9.' );"
        "echo DISK=$(df -P / | awk 'NR==2{gsub(\"%\",\"\",$5); print $5}');"
        "echo MEMFREE=$(awk '/MemAvailable/{print $2}' /proc/meminfo);"
        "echo MEMTOTAL=$(awk '/MemTotal/{print $2}' /proc/meminfo);"
        "echo LOAD1=$(cut -d' ' -f1 /proc/loadavg);"
        "echo CORES=$(nproc);"
        "echo BOOTS24=$(journalctl --since '-24h' --list-boots --no-pager 2>/dev/null | wc -l);"
        "journalctl -b -1 --no-pager 2>/dev/null | tail -1"
    )
    # Password auth is available only through sshpass (never hardcoded): if the
    # operator exported SSHPASS, use it; otherwise this needs a key.
    cmd = ["ssh", "-o", "ConnectTimeout=8", "-o", "StrictHostKeyChecking=accept-new", target, script]
    use_pass = bool(os.environ.get("SSHPASS")) and shutil.which("sshpass") is not None
    if use_pass:
        cmd = ["sshpass", "-e"] + cmd
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=40)
    except (subprocess.TimeoutExpired, FileNotFoundError) as e:
        add("L2 host", "ssh", "WARN", f"{type(e).__name__}: {e}",
            "host-layer checks need SSH; the sensor layers above are unaffected")
        return
    if out.returncode != 0:
        err = (out.stderr or out.stdout or "ssh failed").strip()
        if re.search(r"permission denied|askpass|host key", err, re.I):
            add("L2 host", "ssh", "WARN", f"authentication failed for {target}",
                "host-layer checks need key auth; or run with SSHPASS=... (sshpass) set")
        else:
            add("L2 host", "ssh", "WARN", err.splitlines()[0][:140],
                "host-layer checks need SSH; the sensor layers above are unaffected")
        return
    kv: dict[str, str] = {}
    tail = ""
    for line in out.stdout.splitlines():
        if "=" in line and not line.startswith(" "):
            k, _, v = line.partition("=")
            kv[k.strip()] = v.strip()
        elif line.strip():
            tail = line.strip()
    add("L2 host", "board", "INFO", f"{kv.get('MODEL', '?')} · kernel {kv.get('KERNEL', '?')} · up {int(float(kv.get('UP', 0)) // 60)} min")

    # Clock drift: the Pi has no RTC, so this reveals NTP state, not hardware.
    try:
        drift = abs(int(kv.get("EPOCH", "0")) - int(time.time()))
        state = "PASS" if drift <= CLOCK_DRIFT_OK_S else ("WARN" if drift <= CLOCK_DRIFT_WARN_S else "FAIL")
        add("L2 host", "clock drift", state, f"{drift}s apart from this machine",
            "" if state == "PASS" else "no RTC: a wrong clock mis-stamps telemetry; check systemd-timesyncd")
    except ValueError:
        pass

    # Throttle bits, decoded exactly as the Raspberry Pi docs define them.
    thr = (kv.get("THROTTLED") or "").strip()
    if thr:
        try:
            bits = int(thr, 16)
            now_flags = [n for b, n in ((0x1, "under-voltage"), (0x2, "arm-capped"),
                                        (0x4, "throttled"), (0x8, "soft-temp-limit")) if bits & b]
            past_flags = [n for b, n in ((0x10000, "under-voltage"), (0x20000, "arm-capped"),
                                         (0x40000, "throttled"), (0x80000, "soft-temp-limit")) if bits & b]
            if now_flags:
                add("L2 host", "power", "FAIL", f"{thr} — ACTIVE: {', '.join(now_flags)}",
                    "fix power, not software: official 5V/3A supply, shorter/thicker cable, shed USB load")
            elif past_flags:
                add("L2 host", "power", "WARN", f"{thr} — occurred earlier: {', '.join(past_flags)}",
                    "it recovered, but undervoltage likely explains any earlier reboot or AP drop")
            else:
                add("L2 host", "power", "PASS", f"{thr} — no undervoltage, no throttling")
        except ValueError:
            add("L2 host", "power", "WARN", f"unparseable get_throttled: {thr!r}")

    try:
        temp = float(kv.get("TEMP", "0") or 0)
        state = "PASS" if temp < TEMP_OK_C else ("WARN" if temp < TEMP_WARN_C else "FAIL")
        add("L2 host", "temperature", state, f"{temp:.1f}C",
            "" if state == "PASS" else "add cooling: sustained >=80C throttles the SoC")
    except ValueError:
        pass

    try:
        disk = float(kv.get("DISK", "0"))
        state = "PASS" if disk < DISK_OK_PCT else ("WARN" if disk < DISK_WARN_PCT else "FAIL")
        add("L2 host", "disk", state, f"{disk:.0f}% used",
            "" if state == "PASS" else "PocketBase and logs grow without bound; free space before it wedges")
    except ValueError:
        pass

    try:
        load = float(kv.get("LOAD1", "0"))
        cores = float(kv.get("CORES", "1") or 1)
        ratio = load / cores
        state = "PASS" if ratio < LOAD_OK else ("WARN" if ratio < LOAD_WARN else "FAIL")
        add("L2 host", "load", state, f"{load:.2f} on {cores:.0f} cores ({ratio:.2f}x)",
            "" if state == "PASS" else "the mic stream and thermal read compete for CPU; a busy Pi drops frames")
    except ValueError:
        pass

    try:
        free_mb = float(kv.get("MEMFREE", "0")) / 1024
        total_mb = float(kv.get("MEMTOTAL", "1")) / 1024
        pct = 100 * (1 - free_mb / total_mb) if total_mb else 0
        state = "PASS" if pct < 90 else "WARN"
        add("L2 host", "memory", state, f"{free_mb:.0f} MB free of {total_mb:.0f} MB ({pct:.0f}% used)")
    except ValueError:
        pass

    try:
        boots = int(kv.get("BOOTS24", "0") or 0)
        state = "PASS" if boots <= BOOTS_WARN_24H else "WARN"
        add("L2 host", "boot stability", state, f"{boots} boots recorded in 24 h",
            "" if state == "PASS" else "repeated reboots: check power first (get_throttled), then the SD card")
    except ValueError:
        pass

    # The known 5-day outage signature: mosquitto exits 3 before binding.
    if re.search(r"persistence_location|log_dest", tail or "", re.I):
        add("L2 host", "mosquitto config", "WARN", f"journal tail mentions a config option: {tail[:90]}",
            "duplicate persistence_location / log_dest makes mosquitto exit 3 before binding any port")
    else:
        add("L2 host", "mosquitto config", "INFO", "no duplicate-config signature in the previous boot's tail")


# ── Layer 3: data — is the database as fresh as the sensors? ────────────────
def layer_data(pb_url: str, candidates: list[str], facts: dict[str, Any],
               pi_pb_port: int = 8090, sync_unit: str = "pigpulse-cloud-sync.service",
               sync_env_paths: tuple[str, ...] = ()) -> None:
    base = pb_url.rstrip("/")
    latency = probe(urllib.parse.urlparse(base).hostname or "127.0.0.1",
                    urllib.parse.urlparse(base).port or 8090, timeout=4.0)
    if latency is None:
        add("L3 data", "PocketBase", "FAIL", f"{base} refused/no answer",
            "the app reads PocketBase, not the Pi console: without it every chart is frozen at the last row")
        return
    add("L3 data", "PocketBase", "PASS", f"{base} answering in {latency * 1000:.0f} ms")

    now = time.time()
    for dev in TELEMETRY_DEVICES:
        url = (f"{base}/api/collections/telemetry/records?perPage=1&sort=-timestamp"
               f"&fields=timestamp,center,rms,mic&filter={urllib.parse.quote(f"deviceId='{dev}'")}")
        status, body, _ = http_get(url, timeout=6.0)
        if status != 200:
            add("L3 data", f"{dev} rows", "FAIL", f"HTTP {status}",
                "PocketBase answered TCP but not the API — check its process and the collection schema")
            continue
        try:
            items = json.loads(body).get("items") or []
            if not items:
                add("L3 data", f"{dev} rows", "WARN", "no rows at all")
                continue
            age = now - float(items[0].get("timestamp") or 0)
            state = "PASS" if age <= PB_AGE_OK_S else ("WARN" if age <= PB_AGE_WARN_S else "FAIL")
            add("L3 data", f"{dev} rows", state,
                f"newest row {age:.0f}s old · center={items[0].get('center')} "
                f"rms={items[0].get('rms')} mic={items[0].get('mic')}",
                "" if state == "PASS" else
                "the sensors are fine but the database is stale — the sync hop is broken, not the camera")
            facts[f"pb_age_{dev}"] = age
        except (ValueError, TypeError):
            add("L3 data", f"{dev} rows", "WARN", "unparseable PocketBase payload")

    # Why might it be stale? Name the actual cause, not a guess.
    stale = any(v > PB_AGE_WARN_S for k, v in facts.items() if k.startswith("pb_age_"))
    if stale:
        unit = subprocess.run(["systemctl", "is-active", sync_unit],
                              capture_output=True, text=True).stdout.strip() or "unknown"
        source = ""
        for path in (sync_env_paths or (
                     "/etc/pigpulse/sync.env",
                     os.path.expanduser("~/.config/pigpulse/sync.env"),
                     "/home/solrahk/.config/pigpulse/sync.env")):
            if os.path.isfile(path):
                try:
                    with open(path, encoding="utf-8") as fh:
                        m = re.search(r"^SYNC_SOURCE_URL=(\S+)", fh.read(), re.M)
                        if m:
                            source = m.group(1)
                            break
                except OSError:
                    pass
        state = "PASS" if unit == "active" else "FAIL"
        detail = f"sync unit={unit}" + (f" · source={source}" if source else " · no sync.env found")
        nxt = ""
        if unit != "active":
            nxt = "start/enable the sync worker — nothing is copying the Pi's rows to this database"
        elif source:
            host = urllib.parse.urlparse(source).hostname or ""
            if host and probe(host, 8090, timeout=3.0) is None:
                nxt = (f"the worker cannot reach its configured source {host}:8090 — "
                       f"on a cabled rig the Pi's PocketBase binds only its AP address")
        add("L3 data", "sync worker", state, detail, nxt)

        # Why can't the worker read the Pi? Prove it: probe the Pi's PocketBase
        # on every address that answered for the console. Binding to the AP
        # address alone is invisible until the rig is cabled differently.
        hosts: list[str] = []
        for base in candidates:
            host = urllib.parse.urlparse(base).hostname or ""
            if host and host not in hosts:
                hosts.append(host)
        reachable = [(h, probe(h, pi_pb_port, timeout=3.0)) for h in hosts]
        answering = [h for h, ms in reachable if ms is not None]
        if answering:
            add("L3 data", "Pi PocketBase bind", "PASS",
                "reachable on: " + ", ".join(answering))
        else:
            add("L3 data", "Pi PocketBase bind", "FAIL",
                "the Pi's PocketBase answers on NONE of: " + ", ".join(hosts),
                "it binds only its barn-AP address, so a cabled or re-addressed rig "
                "cannot be read; bind it to the interface actually in use")


# ── Layer 4: the public path the phone actually uses ────────────────────────
def layer_public(bridge: str, proxy_key: str, local_dist: str | None = None) -> None:
    status, body, took = http_get(PROXY_HEALTH, timeout=3.0,
                                  headers={"X-PigPulse-Key": proxy_key} if proxy_key else None)
    if status == 200:
        add("L4 public", "read-only proxy", "PASS", f"127.0.0.1:8099 in {took * 1000:.0f} ms")
    elif status == 401:
        add("L4 public", "read-only proxy", "FAIL", "401 — the key does not match",
            f"read PROXY_KEY from {PROXY_ENV} (root-only) and pass it via --proxy-key")
    else:
        add("L4 public", "read-only proxy", "FAIL", f"HTTP {status or 'timeout'}",
            "without the proxy the deployed app cannot read anything")

    if not bridge:
        add("L4 public", "deployed bridge", "INFO", "skipped (no --bridge)")
        return
    status, body, took = http_get(f"{bridge.rstrip('/')}/api/pi?ep=health", timeout=15.0)
    state = "PASS" if status == 200 else "FAIL"
    add("L4 public", "deployed bridge", state, f"/api/pi?ep=health → HTTP {status} in {took:.1f}s",
        "" if state == "PASS" else
        f"the public boundary is down; the proxy above may be fine — check {bridge} env (PB_PROXY_URL/PB_PROXY_KEY)")

    # Deploy drift: does the public app serve the build that is on disk? This is
    # the question "did my work actually ship?" — answered from the artifacts.
    if local_dist:
        want = local_entry(local_dist)
        status, body, _ = http_get(f"{bridge.rstrip('/')}/app/", timeout=10.0)
        live = re.search(r"entry-[a-f0-9]+\.js", body) if status == 200 and isinstance(body, str) else None
        if want and live:
            same = want == live.group(0)
            add("L4 public", "deploy", "PASS" if same else "FAIL",
                f"public={live.group(0)} local={want}",
                "" if same else "the live site is serving an older build; the code is committed but not deployed")
        else:
            add("L4 public", "deploy", "INFO",
                f"public={live.group(0) if live else 'unknown'} local={want or 'no local build'}")

    # The quoted filter proves the bridge and the proxy agree on PocketBase syntax.
    q = urllib.parse.quote("deviceId='pi-thermal-01'")
    url = f"{bridge.rstrip('/')}/api/telemetry?collection=telemetry&perPage=1&sort=-timestamp&filter={q}"
    status, body, took = http_get(url, timeout=20.0)
    if status == 200:
        try:
            age = time.time() - float((json.loads(body).get("items") or [{}])[0].get("timestamp") or 0)
            state = "PASS" if age <= PB_AGE_OK_S else ("WARN" if age <= PB_AGE_WARN_S else "FAIL")
            add("L4 public", "public data", state, f"newest row {age:.0f}s old via the bridge in {took:.1f}s")
        except (ValueError, TypeError):
            add("L4 public", "public data", "WARN", "bridge answered unparseable JSON")
    elif status == 400:
        add("L4 public", "public data", "FAIL",
            "HTTP 400 — the deployed bridge rejects a quoted PocketBase filter",
            "prod is running a build older than the filter fix; that is a deploy question, not a code one")
    else:
        add("L4 public", "public data", "FAIL", f"HTTP {status or 'timeout'}")


# ── Verdict + rendering ─────────────────────────────────────────────────────
# What a person should act on FIRST. Sensors before the data path, and both
# before host health: a busy Pi still delivers data, while a broken data path
# means every screen is frozen no matter how healthy the host looks.
ACT_RANK = {"L0": 0, "L1": 1, "L3": 2, "L4": 3, "L2": 4}


def _rank(row: dict[str, Any]) -> int:
    return ACT_RANK.get(row["layer"][:2], 9)


def verdict() -> dict[str, Any]:
    fails = sorted((r for r in RESULTS if r["state"] == "FAIL"), key=_rank)
    warns = sorted((r for r in RESULTS if r["state"] == "WARN"), key=_rank)
    if fails:
        first = fails[0]
        return {"state": "FAIL",
                "headline": f"{first['layer']}: {first['name']} failed",
                "detail": first["detail"], "action": first["next"],
                "counts": {"fail": len(fails), "warn": len(warns),
                           "pass": sum(1 for r in RESULTS if r["state"] == "PASS")}}
    if warns:
        first = warns[0]
        return {"state": "WARN",
                "headline": f"{first['layer']}: {first['name']} needs attention",
                "detail": first["detail"], "action": first["next"],
                "counts": {"fail": 0, "warn": len(warns),
                           "pass": sum(1 for r in RESULTS if r["state"] == "PASS")}}
    return {"state": "PASS", "headline": "every hop is healthy",
            "detail": f"{len(RESULTS)} checks passed",
            "action": "", "counts": {"fail": 0, "warn": 0, "pass": len(RESULTS)}}


def render_text(v: dict[str, Any]) -> str:
    icon = {"PASS": "PASS", "WARN": "WARN", "FAIL": "FAIL", "INFO": "info"}
    lines = [f"RIG DIAGNOSIS — {v['state']}: {v['headline']}", "=" * 72]
    if v["detail"]:
        lines.append(f"  {v['detail']}")
    if v["action"]:
        lines.append(f"  next: {v['action']}")
    layer = None
    for r in RESULTS:
        if r["layer"] != layer:
            layer = r["layer"]
            lines.append("")
            lines.append(f"{layer}")
        lines.append(f"  [{icon[r['state']]:4}] {r['name']:<24} {r['detail']}")
        if r["next"] and r["state"] in ("FAIL", "WARN"):
            lines.append(f"         next: {r['next']}")
    lines.append("")
    c = v["counts"]
    lines.append(f"{c['pass']} pass · {c['warn']} warn · {c['fail']} fail")
    return "\n".join(lines)


HTML_SHELL = """<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>PigPulse rig diagnosis</title><style>
:root{--ink:#12211a;--muted:#42584a;--bg:#f4f8f4;--card:#fff;--line:#d6e2d5;
--ok:#156c3a;--warn:#7a5000;--bad:#9c2118;--badbg:#fbe9e7;--chip:#eef4ee}
*{box-sizing:border-box}body{margin:0;padding:18px;background:var(--bg);color:var(--ink);
font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
h1{font-size:21px;margin:0 0 2px}.sub{color:var(--muted);margin:0 0 16px;font-size:16px}
.verdict{border-radius:14px;padding:16px;margin:0 0 16px;background:var(--card)}
.verdict.ok{border-left:10px solid var(--ok)}.verdict.warn{border-left-color:var(--warn);border-left:10px solid var(--warn)}
.verdict.bad{border-left:10px solid var(--bad);background:var(--badbg)}
.verdict h2{margin:0 0 6px;font-size:20px}.verdict p{margin:0;font-size:16px}
.pill{display:inline-block;font-weight:800;font-size:14px;letter-spacing:.06em;
text-transform:uppercase;padding:6px 12px;border-radius:999px;margin-bottom:10px}
.pill.ok{background:#d8efdf;color:var(--ok)}.pill.warn{background:#f7e6c2;color:var(--warn)}
.pill.bad{background:#f6d3cf;color:var(--bad)}
.chips{display:flex;gap:10px;flex-wrap:wrap;margin:0 0 16px}
.chip{flex:1 1 140px;background:var(--card);border:1px solid var(--line);border-radius:12px;
padding:12px 14px;min-height:64px}
.chip .k{font-size:16px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);font-weight:700}
.chip .v{font-size:19px;font-weight:800;margin-top:2px}
.chip.ok .v{color:var(--ok)}.chip.warn .v{color:var(--warn)}.chip.bad .v{color:var(--bad)}
.bad{border-color:#e7b4ae}
section{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 16px;margin:0 0 12px}
section h3{margin:0 0 10px;font-size:16px;letter-spacing:.04em;text-transform:uppercase;color:var(--muted)}
details{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:0;margin:0 0 10px}
details>summary{list-style:none;cursor:pointer;padding:16px 16px;min-height:52px;display:flex;
align-items:center;gap:12px;font-weight:700;font-size:16px}
details>summary::-webkit-details-marker{display:none}
details>summary .t{flex:1}
details[open]>summary{border-bottom:1px solid var(--line)}
.row{display:flex;gap:12px;padding:10px 16px;border-top:1px solid var(--line)}
.row:first-of-type{border-top:0}
.state{flex:0 0 60px;font-weight:800;font-size:14px;letter-spacing:.05em}
.state.PASS{color:var(--ok)}.state.WARN{color:var(--warn)}.state.FAIL{color:var(--bad)}.state.INFO{color:var(--muted)}
.name{flex:0 0 30%;font-weight:700}.detail{flex:1}
.next{color:var(--muted);font-size:16px;margin-top:2px}
.counts{color:var(--muted);margin-top:8px}
.hop{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 16px;margin:0 0 16px}
.hop .k{font-size:14px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);font-weight:700}
.hop .v{font-size:17px;font-weight:700;margin-top:4px}
@media(max-width:520px){.row{flex-wrap:wrap}.name{flex:1 1 100%}.state{flex:0 0 60px}}
</style></head><body>
<h1>PigPulse rig diagnosis</h1>
<p class="sub">__STAMP__ · every line is a readout, not an assumption</p>
__VERDICT__
__BODY__
<p class="counts">__COUNTS__</p>
</body></html>"""

GROUP_OF = {"L0": "Sensors", "L1": "Sensors", "L2": "Pi host", "L3": "Data", "L4": "Public"}

# The four questions actually asked of this rig, in the order they are asked.
# The first A/B showed that layer-level rollups leave "is the mic working?"
# 1145 px below the fold, so each chip names a real thing and carries its state.
KEY_CHIPS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("Thermal", ("MLX90640", "frame freshness")),
    ("Barn mic", ("barn mic",)),
    ("Camera", ("cctv",)),
    ("Data", ("pi-thermal-01 rows", "s3-mic-01 rows", "sync worker")),
)


def _chip_facts() -> list[tuple[str, str, str]]:
    """(label, state, one-line value) for the four headline facts."""
    by_name = {r["name"]: r for r in RESULTS}
    out: list[tuple[str, str, str]] = []
    for label, names in KEY_CHIPS:
        rows = [by_name[n] for n in names if n in by_name]
        if not rows:
            out.append((label, "INFO", "not checked"))
            continue
        state = worst([r["state"] for r in rows])
        lead = next((r for r in rows if r["state"] == state), rows[0])
        # Keep the chip to one scannable line: the first clause of the detail.
        short = lead["detail"].split(" · ")[0].split(", ")[0].strip()
        if len(short) > 46:
            short = short[:43].rstrip() + "…"
        out.append((label, state, short))
    return out


def _groups() -> list[tuple[str, str, list[dict[str, Any]]]]:
    order: list[str] = []
    buckets: dict[str, list[dict[str, Any]]] = {}
    for r in RESULTS:
        g = GROUP_OF.get(r["layer"][:2], r["layer"])
        if g not in buckets:
            buckets[g] = []
            order.append(g)
        buckets[g].append(r)
    return [(g, worst([r["state"] for r in buckets[g]]), buckets[g]) for g in order]


def _fill(shell: str, verdict_html: str, body_html: str, counts: str) -> str:
    """Token replacement, not str.format: the stylesheet is full of braces."""
    return (shell.replace("__STAMP__", time.strftime("%Y-%m-%d %H:%M:%S"))
                 .replace("__VERDICT__", verdict_html)
                 .replace("__BODY__", body_html)
                 .replace("__COUNTS__", counts))


def render_variant(v: dict[str, Any], variant: str = "b") -> str:
    """Two presentations of the same facts, for an honest A/B comparison.

    A — the dense checklist: every check visible, grouped by layer.
    B — verdict first: the state, then one rollup chip per group, then the first
        broken hop, with the evidence folded into <details>.
    """
    cls = {"PASS": "ok", "WARN": "warn", "FAIL": "bad"}[v["state"]]
    vblock = (f'<div class="verdict {cls}"><span class="pill {cls}">{v["state"]}</span>'
              f'<h2>{v["headline"]}</h2><p>{v["detail"]}</p>'
              + (f'<p class="next">Next: {v["action"]}</p>' if v["action"] else "") + "</div>")
    c = v["counts"]
    counts = f"{c['pass']} pass · {c['warn']} warn · {c['fail']} fail"

    if variant == "a":
        parts: list[str] = []
        for group, gstate, rows in _groups():
            body = "".join(
                f'<div class="row"><div class="state {r["state"]}">{r["state"]}</div>'
                f'<div class="name">{r["name"]}</div><div class="detail">{r["detail"]}'
                + (f'<div class="next">Next: {r["next"]}</div>'
                   if r["next"] and r["state"] in ("FAIL", "WARN") else "")
                + "</div></div>"
                for r in rows
            )
            parts.append(f"<section><h3>{group} — {gstate}</h3>{body}</section>")
        return _fill(HTML_SHELL, vblock, "\n".join(parts), counts)

    # Variant B
    chips = "".join(
        f'<div class="chip {state.lower() if state != "PASS" else "ok"}">'
        f'<div class="k">{label}</div>'
        f'<div class="v">{state}</div>'
        f'<div class="k" style="text-transform:none;letter-spacing:0;font-weight:500;font-size:16px;'
        f'margin-top:2px">{short}</div></div>'
        for label, state, short in _chip_facts()
    )
    first = next((r for r in RESULTS if r["state"] == "FAIL"), None) or \
            next((r for r in RESULTS if r["state"] == "WARN"), None)
    hop = ""
    if first:
        hop = (f'<div class="hop"><div class="k">first broken hop</div>'
               f'<div class="v">{first["layer"]} · {first["name"]}</div>'
               f'<p style="margin:6px 0 0">{first["detail"]}</p>'
               + (f'<p class="next" style="margin:6px 0 0">Next: {first["next"]}</p>'
                  if first["next"] else "") + "</div>")
    folded: list[str] = []
    for group, gstate, rows in _groups():
        inner = "".join(
            f'<div class="row"><div class="state {r["state"]}">{r["state"]}</div>'
            f'<div class="name">{r["name"]}</div><div class="detail">{r["detail"]}'
            + (f'<div class="next">Next: {r["next"]}</div>'
               if r["next"] and r["state"] in ("FAIL", "WARN") else "")
            + "</div></div>"
            for r in rows
        )
        opened = " open" if gstate in ("FAIL", "WARN") else ""
        folded.append(f'<details{opened}><summary><span class="state {gstate}">{gstate}</span>'
                      f'<span class="t">{group}</span><span aria-hidden="true">▾</span></summary>'
                      f"{inner}</details>")
    return _fill(HTML_SHELL, vblock, f'<div class="chips">{chips}</div>{hop}' + "".join(folded), counts)


def render_html(v: dict[str, Any], variant: str = "b") -> str:
    return render_variant(v, variant)


def local_entry(dist: str) -> str | None:
    """The entry-*.js filename of a local Expo web build, for drift checks."""
    folder = os.path.join(dist, "_expo", "static", "js", "web")
    try:
        names = [n for n in os.listdir(folder) if re.fullmatch(r"entry-[a-f0-9]+\.js", n)]
    except OSError:
        return None
    return sorted(names)[0] if names else None


def read_proxy_key() -> str:
    try:
        with open(PROXY_ENV, encoding="utf-8") as fh:
            m = re.search(r"^PROXY_KEY=(.+)$", fh.read(), re.M)
            return m.group(1).strip() if m else ""
    except OSError:
        return ""


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="End-to-end PigPulse diagnosis (operator side).")
    ap.add_argument("--json", action="store_true", help="machine-readable output")
    ap.add_argument("--html", metavar="PATH", help="write a shareable HTML report")
    ap.add_argument("--variant", choices=("a", "b"), default=os.environ.get("RIGDIAG_VARIANT", "b"),
                    help="report layout: a = dense checklist, b = verdict first (default)")
    ap.add_argument("--html-ab", metavar="PATH",
                    help="write BOTH layouts (PATH = win, PATH.a.html / .b.html) for an A/B")
    ap.add_argument("--deep", action="store_true", help="also capture 2 s of mic audio")
    ap.add_argument("--ssh", metavar="USER@HOST", help="add the Pi host layer (power, clock, boots)")
    ap.add_argument("--candidates", default=os.environ.get("PI_CANDIDATES", ",".join(DEFAULT_CANDIDATES)))
    ap.add_argument("--pb", default=os.environ.get("PB_URL", PB_DEFAULT))
    ap.add_argument("--bridge", default=os.environ.get("BRIDGE_URL", DEFAULT_BRIDGE))
    ap.add_argument("--proxy-key", default=read_proxy_key())
    ap.add_argument("--pi-pb-port", type=int, default=8090,
                    help="port the Pi's PocketBase should be listening on (test injection)")
    ap.add_argument("--sync-unit", default="pigpulse-cloud-sync.service")
    ap.add_argument("--sync-env", action="append", metavar="PATH",
                    help="sync worker env file to inspect (repeatable)")
    ap.add_argument("--local-dist", metavar="DIR",
                    default=os.environ.get("LOCAL_DIST", ""),
                    help="local Expo web build to compare with what is deployed")
    args = ap.parse_args(argv)

    candidates = [c.strip().rstrip("/") for c in args.candidates.split(",") if c.strip()]
    if not candidates:
        print("no Pi candidates configured", file=sys.stderr)
        return 3

    started = time.time()
    base, net = layer_network(candidates)
    facts: dict[str, Any] = {"network": net}
    if base:
        facts.update(layer_console(base, args.deep))
    if args.ssh:
        layer_host(args.ssh)
    layer_data(args.pb, candidates, facts, args.pi_pb_port, args.sync_unit,
               tuple(args.sync_env) if args.sync_env else ())
    layer_public(args.bridge, args.proxy_key, args.local_dist)

    v = verdict()
    v["elapsed_s"] = round(time.time() - started, 1)
    v["generated"] = time.strftime("%Y-%m-%dT%H:%M:%S%z")

    if args.html or args.html_ab:
        target = args.html or args.html_ab
        try:
            if args.html_ab:
                for variant in ("a", "b"):
                    path = f"{args.html_ab}.{variant}.html"
                    with open(path, "w", encoding="utf-8") as fh:
                        fh.write(render_html(v, variant))
                v["html_ab"] = [f"{args.html_ab}.a.html", f"{args.html_ab}.b.html"]
            if args.html:
                with open(target, "w", encoding="utf-8") as fh:
                    fh.write(render_html(v, args.variant))
                v["html"] = target
        except OSError as e:
            print(f"could not write the report: {e}", file=sys.stderr)

    if args.json:
        print(json.dumps({"verdict": v, "checks": RESULTS}, indent=2, default=str))
    else:
        print(render_text(v))
        if v.get("html"):
            print(f"\nHTML report: {v['html']}")

    return {"PASS": 0, "WARN": 2, "FAIL": 1}[v["state"]]


if __name__ == "__main__":
    sys.exit(main())
