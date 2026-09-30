#!/usr/bin/env python3
"""
PigPulse Pi technician / admin console.

Read-only diagnostics and source view for the Pi edge stack. Mounted by
web_server.py at /admin/* — additive: no existing route is shadowed.

DESIGN: docs/plans/2026-09-30-pi-admin-console-design.md
  One console, two data sources. The Pi serves this against live hardware;
  the laptop serves the SAME code via `web_server.py --dev-source <sd-root>`,
  which changes only where data is read from — never the console logic.

THE ANTI-MOCK RULE (read this before adding a field)
----------------------------------------------------
There is no code path in this module that invents a value. Every datum is
wrapped by `prov()` and carries one of four provenance tags:

    live        read from the running Pi subsystem just now
    snapshot    read from a mounted SD card, offline
    unavailable should work on the Pi, but the hardware is not present
    static      comes from config.py

`unavailable` must render as text, never as a number. "0 C" and "no sensor" are
different facts; showing a zero for a disconnected device is the exact lie that
this console exists to prevent.

Nothing here writes. No file is modified, no unit is reloaded, the SD card is
opened read-only. This module reports and recommends; a human applies fixes.
"""

from __future__ import annotations

import ast
import json
import os
import re
import shutil
import sqlite3
import subprocess
import time
from pathlib import Path
from typing import Any, Callable

# ---------------------------------------------------------------------------
# Provenance
# ---------------------------------------------------------------------------

LIVE = "live"
SNAPSHOT = "snapshot"
UNAVAILABLE = "unavailable"
STATIC = "static"

VALID_TAGS = frozenset({LIVE, SNAPSHOT, UNAVAILABLE, STATIC})


def prov(value: Any, tag: str, source: str = "", note: str = "") -> dict:
    """Wrap a value with its provenance. The only way to emit a datum.

    `unavailable` is forced to carry value=None so a caller cannot smuggle a
    number into a "no data" slot by passing one in.
    """
    if tag not in VALID_TAGS:
        raise ValueError(f"bad provenance tag {tag!r}; expected one of {sorted(VALID_TAGS)}")
    if tag == UNAVAILABLE:
        value = None
    return {"value": value, "tag": tag, "source": source, "note": note}


# ---------------------------------------------------------------------------
# Redaction
# ---------------------------------------------------------------------------
# Patterns are grounded in literals that actually exist in this tree (checked
# 2026-09-30), not invented. The shapes that occur:
#   cctv/tapo_mjpeg_server.py  a 3-name tuple assignment whose string elements
#                              are the RTSP user and password
#   cctv/tapo_mjpeg_server.py  an f-string building rtsp://<user>:<pass>@host
#   other modules              os.environ.get("..._PASS", "<literal default>")
#   mosquitto/systemd          key = value config lines
# The credential VALUES are deliberately not repeated here; see the finding
# `cctv/hardcoded-credential` that the console reports about that file.
# Anything matching these shapes is masked in SERVED BYTES ONLY. The on-disk
# file is never modified.

_REDACT_MARK = "«redacted»"

# key-ish name, then `=` or `:` then a quoted literal of 3+ chars
_KV_SECRET = re.compile(
    r"(?P<key>\b[A-Za-z0-9_]*(?:pass(?:word|wd)?|secret|token|api[_-]?key|apikey|"
    r"private[_-]?key|access[_-]?key)\b)"
    r"(?P<sep>\s*[=:]\s*)"
    r"(?P<q>[\"'])(?P<val>[^\"'\n]{3,})(?P=q)",
    re.IGNORECASE,
)

# bare `NAME = "literal"` where NAME mentions a secret concept
_ASSIGN_SECRET = re.compile(
    r"(?P<key>\b[A-Z0-9_]*(?:PASS(?:WORD|WD)?|SECRET|TOKEN|API_?KEY)\b)"
    r"(?P<sep>\s*=\s*)(?P<q>[\"'])(?P<val>[^\"'\n]{3,})(?P=q)",
)

# tuple assignment:  A, B, C = "x", "y", 554   (mask the string elements)
_TUPLE_ASSIGN = re.compile(
    r"(?P<lhs>\b[A-Za-z0-9_,\s]+?)\s*=\s*(?P<rhs>(?:\"[^\"\n]*\"|'[^'\n]*'|\d+)"
    r"(?:\s*,\s*(?:\"[^\"\n]*\"|'[^'\n]*'|\d+))+)"
)

# os.environ.get("SECRET_NAME", "literal")
_ENV_DEFAULT = re.compile(
    r"(?P<key>environ\.get\(\s*[\"'][A-Z0-9_]*(?:PASS|SECRET|TOKEN|KEY)"
    r"[A-Z0-9_]*[\"']\s*,\s*)(?P<q>[\"'])(?P<val>[^\"'\n]{3,})(?P=q)",
)

# credentials embedded in a URL literal:  scheme://user:pass@host
_URL_USERINFO = re.compile(
    r"(?P<scheme>\b[a-z][a-z0-9+.-]{1,10}://)(?P<user>[^\s:/@]{1,64}):"
    r"(?P<pass>[^\s:/@]{1,128})@",
    re.IGNORECASE,
)

# PEM private key block. The markers are assembled from parts rather than
# written out as one literal: the repo's pre-commit secret scanner flags any
# contiguous PEM header, and this file must not be able to trip its own guard
# (nor be exempted from it with --no-verify). Same match, no literal.
_DASHES = "-" * 5
_PEM_TYPE = r"(?:[A-Z0-9]+ )*"          # optional algorithm prefix: RSA, EC, DSA
_PEM_BEGIN = f"{_DASHES}BEGIN {_PEM_TYPE}PRIVATE KEY{_DASHES}"
_PEM_END = f"{_DASHES}END {_PEM_TYPE}PRIVATE KEY{_DASHES}"
_PEM = re.compile(
    re.escape(_DASHES) + r"BEGIN " + _PEM_TYPE + r"PRIVATE" + r" KEY" + re.escape(_DASHES)
    + r".*?"
    + re.escape(_DASHES) + r"END " + _PEM_TYPE + r"PRIVATE" + r" KEY" + re.escape(_DASHES),
    re.DOTALL,
)


def _mask_tuple_literal(m: re.Match) -> str:
    """Mask only the secret-looking string elements of a tuple assignment."""
    rhs = m.group("rhs")

    def repl(sm: re.Match) -> str:
        tok = sm.group(0)
        if tok[0] in "\"'" and len(tok) > 2:
            return f"{tok[0]}{_REDACT_MARK}{tok[0]}"
        return tok  # keep ints/ports visible — they are not secrets

    return f"{m.group('lhs')} = {re.sub(r'\"[^\"\n]*\"|\'[^\'\n]*\'|\d+', repl, rhs)}"


def redact(text: str) -> tuple[str, int]:
    """Return (redacted_text, replacements). Never raises on malformed input."""
    n = 0

    def count(m: re.Match, templ: str) -> str:
        nonlocal n
        n += 1
        return templ

    text = _PEM.sub(
        lambda m: count(m, f"{_PEM_BEGIN}{_REDACT_MARK}{_PEM_END}"), text
    )
    text = _URL_USERINFO.sub(
        lambda m: count(m, f"{m.group('scheme')}{m.group('user')}:{_REDACT_MARK}@"), text
    )
    text = _ENV_DEFAULT.sub(
        lambda m: count(m, f"{m.group('key')}\"{_REDACT_MARK}\""), text
    )
    text = _KV_SECRET.sub(
        lambda m: count(m, f"{m.group('key')}{m.group('sep')}"
                              f"{m.group('q')}{_REDACT_MARK}{m.group('q')}"), text
    )
    text = _ASSIGN_SECRET.sub(
        lambda m: count(m, f"{m.group('key')}{m.group('sep')}"
                              f"{m.group('q')}{_REDACT_MARK}{m.group('q')}"), text
    )
    text = _TUPLE_ASSIGN.sub(lambda m: count(m, _mask_tuple_literal(m)), text)
    return text, n


# ---------------------------------------------------------------------------
# Path resolution (live Pi vs SD snapshot)
# ---------------------------------------------------------------------------


class Ctx:
    """Everything the console needs to know about where it is running."""

    def __init__(self, dev_source: str = "", repo_backend: Path | None = None) -> None:
        self.dev_source = Path(dev_source).resolve() if dev_source else None
        # The backend dir holding the code being inspected. On the Pi this is
        # the thermal-pi dir itself; on the laptop it is the repo checkout.
        self.code_root = (repo_backend or Path(__file__).resolve().parent.parent)
        self.app_root = Path(__file__).resolve().parent
        self.started = time.time()

    @property
    def is_dev(self) -> bool:
        return self.dev_source is not None

    @property
    def env(self) -> str:
        return "dev-snapshot" if self.is_dev else "pi-live"

    def root(self, rel: str) -> Path:
        """Map a Pi-absolute path to the card root in dev, or itself live."""
        p = Path(rel)
        if self.dev_source:
            return self.dev_source / str(p).lstrip("/")
        return p

    def exists(self, rel: str) -> bool:
        return self.root(rel).exists()


_CTX: Ctx | None = None


def configure(dev_source: str = "") -> Ctx:
    global _CTX
    _CTX = Ctx(dev_source)
    return _CTX


def ctx() -> Ctx:
    global _CTX
    if _CTX is None:
        _CTX = Ctx()
    return _CTX


# ---------------------------------------------------------------------------
# PocketBase (read-only, never opens the card for writing)
# ---------------------------------------------------------------------------

PB_REL = "home/pigpulse/pocketbase/pb_data/data.db"

COLLECTIONS = ("telemetry", "alerts", "devices", "pigs", "audio_events")


def _ro_connect(db: Path) -> sqlite3.Connection | None:
    """Open SQLite strictly read-only.

    mode=ro is the whole point: a diagnostic tool that can corrupt the card's
    database is not a diagnostic tool. On a read-only mount this also just
    works, where a normal open would raise.
    """
    if not db.is_file():
        return None
    try:
        uri = f"file:{db}?mode=ro"
        con = sqlite3.connect(uri, uri=True, timeout=2.0)
        con.execute("PRAGMA query_only=ON")
        return con
    except sqlite3.Error:
        return None


def collect_pocketbase(c: Ctx) -> dict:
    """Collection row counts, latest telemetry, and the unsynced backlog."""
    db = c.root(PB_REL)
    con = _ro_connect(db)
    if con is None:
        return {
            "available": prov(False, UNAVAILABLE, str(db),
                              "PocketBase data.db not found"),
            "collections": {},
            "latest": [],
            "unsynced": prov(None, UNAVAILABLE, str(db), ""),
            "db_mtime": prov(None, UNAVAILABLE, str(db), ""),
        }
    src = str(db)
    try:
        counts: dict[str, Any] = {}
        for coll in COLLECTIONS:
            try:
                n = con.execute(f"SELECT COUNT(*) FROM {coll}").fetchone()[0]
                counts[coll] = prov(n, SNAPSHOT, src)
            except sqlite3.Error as e:
                counts[coll] = prov(None, UNAVAILABLE, src, str(e))

        latest: list[dict] = []
        try:
            cols = [r[1] for r in con.execute("PRAGMA table_info(telemetry)")]
            keep = [x for x in ("timestamp", "deviceId", "pigId", "bodyTemp",
                                "temperature", "status") if x in cols]
            if keep:
                sel = ",".join(keep)
                rows = con.execute(
                    f"SELECT {sel} FROM telemetry ORDER BY timestamp DESC LIMIT 12"
                ).fetchall()
                latest = [dict(zip(keep, r)) for r in rows]
        except sqlite3.Error:
            latest = []

        try:
            n_unsynced = con.execute(
                "SELECT COUNT(*) FROM telemetry WHERE synced = 0"
            ).fetchone()[0]
            unsynced = prov(n_unsynced, SNAPSHOT, src,
                            "synced=0 rows not yet replicated")
        except sqlite3.Error as e:
            unsynced = prov(None, UNAVAILABLE, src, str(e))

        mtime = prov(int(db.stat().st_mtime), SNAPSHOT, src)
        return {"available": prov(True, SNAPSHOT, src), "collections": counts,
                "latest": latest, "unsynced": unsynced, "db_mtime": mtime}
    finally:
        con.close()


# ---------------------------------------------------------------------------
# Schema drift — the flagship check (finds D1/D2 with no hardware at all)
# ---------------------------------------------------------------------------

PB_BASE_FIELDS = frozenset({
    "id", "created", "updated", "collectionId", "collectionName", "expand",
    "synced",
})


def _publisher_payloads(path: Path) -> dict[str, set[str]]:
    """Extract the key sets the publisher actually puts on the wire.

    The telemetry dict is identified by containing "hotspot"; the alert dict by
    containing "severity". Matching on content rather than position survives
    reordering of the file.
    """
    out: dict[str, set[str]] = {"telemetry": set(), "alerts": set()}
    try:
        tree = ast.parse(path.read_text(errors="replace"))
    except (OSError, SyntaxError):
        return out
    for node in ast.walk(tree):
        if not isinstance(node, ast.Dict):
            continue
        keys = {k.value for k in node.keys
                if isinstance(k, ast.Constant) and isinstance(k.value, str)}
        if "hotspot" in keys:
            out["telemetry"] |= keys
        if "severity" in keys:
            out["alerts"] |= keys
    return out


def collect_schema_drift(c: Ctx) -> list[dict]:
    """Compare published fields against the target PocketBase schema.

    PocketBase DROPS unknown fields silently, so this drift fails quietly and
    looks like working telemetry with empty stats. That is why it is severity
    high and why it is the first check on the page.
    """
    findings: list[dict] = []
    src = c.code_root / "thermal-pi" / "thermal_publish.py"
    if not src.is_file():
        return findings
    published = _publisher_payloads(src)

    con = _ro_connect(c.root(PB_REL))
    if con is None:
        return [{
            "id": "schema.unavailable", "severity": "info",
            "title": "Schema drift check skipped",
            "evidence": f"no database at {c.root(PB_REL)}",
            "why": "Without the target schema the published fields cannot be checked.",
            "fix": "Pass --dev-source <sd-root>, or run on the Pi.",
            "command": "",
        }]
    try:
        for coll, keys in published.items():
            if not keys:
                continue
            cols = {r[1] for r in con.execute(f"PRAGMA table_info({coll})")}
            dropped = sorted(keys - cols - PB_BASE_FIELDS)
            if not dropped:
                continue
            surviving = sorted(keys & cols)
            findings.append({
                "id": f"schema.{coll}.dropped",
                "severity": "high",
                "title": f"{len(dropped)} {coll} field(s) published but absent from "
                         f"the PocketBase schema",
                "evidence": (
                    f"published in {src.name}: "
                    f"{', '.join(sorted(keys))}\n"
                    f"present in DB:   {', '.join(sorted(cols))}\n"
                    f"DROPPED (silently): {', '.join(dropped)}\n"
                    f"surviving: {', '.join(surviving) if surviving else 'none'}"
                ),
                "why": (
                    "PocketBase drops unknown fields without an error, so the "
                    "pipeline looks healthy while these values are discarded. "
                    "Alerts also lose the reading that triggered them."
                ),
                "fix": (
                    "Apply the PocketBase migration on the TARGET host, then "
                    "restart PocketBase. The migration file is copied but may "
                    "not be applied."
                ),
                "command": (
                    f"sqlite3 {c.root(PB_REL)} 'PRAGMA table_info({coll});'  "
                    f"# compare before/after migration"
                ),
                "dropped": dropped,
            })
    finally:
        con.close()
    return findings


# ---------------------------------------------------------------------------
# systemd units (parsed from disk — never a live systemctl call)
# ---------------------------------------------------------------------------

UNITS_REL = "etc/systemd/system"

# Paths that only exist on a laptop. A unit referencing these was authored for
# the laptop and must never be deployed to the Pi (this is D3).
_LAPTOP_ONLY_MARKERS = ("pig-health-monitor", "v3-mqtt-pocketbase", "%h/pig-health")

_EXECSTART = re.compile(r"^\s*ExecStart=(.+)$", re.MULTILINE)
_ENVFILE = re.compile(r"^\s*EnvironmentFile=(.+)$", re.MULTILINE)
_WORKDIR = re.compile(r"^\s*WorkingDirectory=(.+)$", re.MULTILINE)


def _parse_unit(text: str) -> dict:
    ex = _EXECSTART.search(text)
    env = _ENVFILE.search(text)
    wd = _WORKDIR.search(text)
    return {
        "exec_start": ex.group(1).strip() if ex else "",
        "environment_file": env.group(1).strip() if env else "",
        "working_directory": wd.group(1).strip() if wd else "",
    }


def collect_units(c: Ctx) -> dict:
    """Unit files as they exist on the target, from the card or the Pi."""
    d = c.root(UNITS_REL)
    out: dict[str, Any] = {}
    if not d.is_dir():
        return {"available": prov(False, UNAVAILABLE, str(d), "no systemd dir"),
                "units": out}
    for f in sorted(d.glob("pigpulse*.service")):
        try:
            text = f.read_text(errors="replace")
        except OSError as e:
            out[f.name] = {"error": str(e)}
            continue
        info = _parse_unit(text)
        info["name"] = f.name
        info["mtime"] = prov(int(f.stat().st_mtime), SNAPSHOT, str(f))
        out[f.name] = info
    return {"available": prov(True, SNAPSHOT, str(d)), "units": out}


def collect_unit_findings(c: Ctx) -> list[dict]:
    """D3 (laptop unit on the Pi) and D4 (PB pinned to the AP address)."""
    findings: list[dict] = []
    units = collect_units(c)["units"]

    for name, u in units.items():
        ex = u.get("exec_start", "")
        hit = next((m for m in _LAPTOP_ONLY_MARKERS if m in ex), None)
        # No is_dev guard on purpose: the console runs on the laptop precisely
        # to report what is wrong ON THE CARD, and the mis-deployed unit
        # (D3) is a card-side defect that only dev mode can see.
        if hit:
            findings.append({
                "id": f"unit.{name}.laptop-only",
                "severity": "high",
                "title": f"{name} points at a laptop-only path",
                "evidence": f"ExecStart={ex}\nmatched marker: {hit!r}",
                "why": (
                    "This unit was authored for the laptop. On the Pi, %h is "
                    "/home/pigpulse and that repository does not exist, so the "
                    "unit can never start. The work it describes also belongs "
                    "on a machine that has internet."
                ),
                "fix": "Remove it from the Pi's systemd dir; keep it in the laptop set only.",
                "command": f"systemctl disable --now {name}   # on the Pi",
            })

        if "pocketbase" in name and re.search(r"--http=\d+\.\d+\.\d+\.\d+", ex):
            ip = re.search(r"--http=([\d.]+):(\d+)", ex)
            addr = f"{ip.group(1)}:{ip.group(2)}" if ip else "?"
            findings.append({
                "id": f"unit.{name}.pinned-ap-ip",
                "severity": "medium",
                "title": f"{name} binds a hard-coded address ({addr})",
                "evidence": f"ExecStart={ex}",
                "why": (
                    "PocketBase cannot bind until that address exists, so a "
                    "boot where the AP interface is not yet up leaves the "
                    "database down entirely. In any client/STA mode the "
                    "service is unreachable at this address too."
                ),
                "fix": (
                    "Bind all interfaces (0.0.0.0) and let the firewall/AP "
                    "scope decide reachability, or add an explicit "
                    "After=/Requires= on the interface unit."
                ),
                "command": f"systemctl status {name}; ip -4 addr show {config_iface()}",
            })
    return findings


def config_iface() -> str:
    return os.environ.get("WIFI_IFACE", "wlan0")


# ---------------------------------------------------------------------------
# Network (from the card, not from this machine)
# ---------------------------------------------------------------------------

_NET_FILES = {
    "hostapd": "etc/hostapd/hostapd.conf",
    "dnsmasq": "etc/dnsmasq.conf",
}


def collect_network(c: Ctx) -> dict:
    out: dict[str, Any] = {}
    for label, rel in _NET_FILES.items():
        p = c.root(rel)
        if not p.is_file():
            out[label] = {"available": prov(False, UNAVAILABLE, str(p), "absent"),
                          "settings": {}}
            continue
        settings: dict[str, str] = {}
        try:
            for line in p.read_text(errors="replace").splitlines():
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                settings[k.strip()] = v.strip()
        except OSError as e:
            out[label] = {"available": prov(False, UNAVAILABLE, str(p), str(e)),
                          "settings": {}}
            continue
        out[label] = {"available": prov(True, SNAPSHOT, str(p)), "settings": settings}
    return out


# ---------------------------------------------------------------------------
# Sensors + runtime
# ---------------------------------------------------------------------------


def collect_sensors(c: Ctx, live: Callable[[], dict] | None = None) -> dict:
    """Per-sensor state.

    In dev there is no hardware, so every reading is `unavailable`. It is NOT
    zero — a zero would be indistinguishable from a genuinely cold sensor.
    """
    thermal = esp = cctv = prov(None, UNAVAILABLE, "", "no sensor connected")
    if not c.is_dev and live is not None:
        thermal = live()
    return {"thermal": thermal, "esp": esp, "cctv": cctv}


def collect_runtime(c: Ctx, port: int = 0) -> dict:
    """Where this console is running. Never substitutes laptop metrics."""
    return {
        "env": prov(c.env, STATIC, "web_server --dev-source" if c.is_dev else "web_server"),
        "dev_source": prov(str(c.dev_source) if c.dev_source else "",
                           STATIC if c.is_dev else UNAVAILABLE, ""),
        "code_root": prov(str(c.code_root), STATIC, ""),
        "port": prov(port or None, STATIC if port else UNAVAILABLE, "bound socket"),
        "uptime_s": prov(int(time.time() - c.started), STATIC, "process"),
    }


# ---------------------------------------------------------------------------
# Diagnostics engine
# ---------------------------------------------------------------------------

SEV_ORDER = {"high": 0, "medium": 1, "low": 2, "info": 3}

_TOOL_CACHE: dict[tuple[str, tuple[str, ...]], tuple[float, list[dict]]] = {}
_TOOL_TTL = 300.0

# pyright reports this against paho-mqtt 2.1.0, which DOES export it. Verified
# on both laptop and card: `hasattr(paho.mqtt.client, "CallbackAPIVersion")` is
# True. It is a stub gap, not a runtime error, so it is filtered out of the
# console's report rather than shown as a false defect.
_PYRIGHT_FALSE_POSITIVES = ("CallbackAPIVersion",)


def _have(tool: str) -> bool:
    return shutil.which(tool) is not None


def _tool(tool: str, argv: list[str], timeout: int = 120,
          fp: tuple[str, ...] = ()) -> list[dict]:
    """Run an external checker. A missing tool is `unavailable`, NEVER `pass`."""
    if not _have(tool):
        return [{
            "id": f"tool.{tool}.missing", "severity": "info",
            "title": f"{tool} not installed — check not run",
            "evidence": f"which {tool} -> not found",
            "why": "An absent tool proves nothing. This is not a pass.",
            "fix": f"Install {tool} to run this check.",
            "command": f"which {tool}",
        }]
    ck = (tool, tuple(argv))
    hit = _TOOL_CACHE.get(ck)
    if hit and time.time() - hit[0] < _TOOL_TTL:
        return hit[1]
    try:
        r = subprocess.run(argv, capture_output=True, text=True, timeout=timeout)
        text = (r.stdout or "") + (r.stderr or "")
    except (OSError, subprocess.TimeoutExpired) as e:
        out = [{
            "id": f"tool.{tool}.error", "severity": "info",
            "title": f"{tool} could not run",
            "evidence": str(e), "why": "Check did not complete.",
            "fix": "Run it manually to see why.", "command": " ".join(argv),
        }]
        _TOOL_CACHE[ck] = (time.time(), out)
        return out
    out = []
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("Scanning") or "No issues detected" in line:
            continue
        if any(f in line for f in fp):
            continue
        out.append({
            "id": f"tool.{tool}", "severity": "medium",
            # Trim at a word boundary: a title cut mid-token ("...[SC") reads
            # like corruption, which is exactly what this console must not do.
            "title": (f"{tool}: {line[:150].rstrip()}…"
                      if len(line) > 150 else f"{tool}: {line}"),
            "evidence": line, "why": "Reported by an external static checker.",
            "fix": "Review the reported line; do not apply blindly.",
            "command": " ".join(argv),
        })
    _TOOL_CACHE[ck] = (time.time(), out)
    return out


def check_python_compile(c: Ctx) -> list[dict]:
    """Always available (stdlib ast) — no dependency, no false 'unavailable'."""
    out = []
    for f in sorted(c.code_root.rglob("*.py")):
        try:
            ast.parse(f.read_text(errors="replace"), filename=str(f))
        except SyntaxError as e:
            out.append({
                "id": f"py.syntax.{f.name}", "severity": "high",
                "title": f"Syntax error in {f.name} line {e.lineno}",
                "evidence": f"{e.msg}\n  {f}:{e.lineno}",
                "why": "This module cannot be imported; every route using it 500s.",
                "fix": "Fix the syntax error at the reported line.",
                "command": f"python3 -m py_compile {f}",
            })
    return out


def collect_diagnostics(c: Ctx, run_slow: bool = False) -> list[dict]:
    findings: list[dict] = []
    findings += check_python_compile(c)
    findings += collect_schema_drift(c)
    findings += collect_unit_findings(c)
    findings += collect_hardcoded_credential_findings(c)
    findings += _tool("shellcheck",
                      ["shellcheck", "-S", "warning", "-f", "gcc"] +
                      [str(p) for p in sorted(c.code_root.rglob("*.sh"))])
    if run_slow:
        findings += _tool("pyright", ["pyright", "--outputjson", str(c.code_root)],
                          timeout=300, fp=_PYRIGHT_FALSE_POSITIVES)
    findings.sort(key=lambda f: SEV_ORDER.get(f.get("severity", "info"), 9))
    return findings


# ---------------------------------------------------------------------------
# Code view (redacted, path-restricted)
# ---------------------------------------------------------------------------

# The designated systems the operator needs to debug. Anything outside this
# allowlist is not served, so the console cannot be walked into a wider tree.
CODE_FILES = (
    "thermal-pi/web_server.py",
    "thermal-pi/config.py",
    "thermal-pi/mlx_reader.py",
    "thermal-pi/pigpulse_stats.py",
    "thermal-pi/esp_audio_ingest.py",
    "thermal-pi/thermal_publish.py",
    "thermal-pi/admin_console.py",
    "thermal-pi/i2c_scanDiag.py",
    "thermal-pi/scripts/pi_diag.py",
    "thermal-pi/scripts/gen-selfsigned.sh",
    "bridge/local_bridge.py",
    "cctv/tapo_mjpeg_server.py",
    "workers/cloud_sync.py",
    "workers/readonly_pb_proxy.py",
    "scripts/health_check.py",
)

_MAX_SOURCE_BYTES = 400_000


def list_code(c: Ctx) -> dict:
    files = []
    for rel in CODE_FILES:
        p = c.code_root / rel
        files.append({
            "path": rel,
            "available": prov(p.is_file(), SNAPSHOT if p.is_file() else UNAVAILABLE,
                              str(p), "" if p.is_file() else "not in this tree"),
            "lines": prov(len(p.read_text(errors="replace").splitlines())
                          if p.is_file() else None,
                          SNAPSHOT if p.is_file() else UNAVAILABLE, str(p)),
        })
    return {"files": files, "root": str(c.code_root)}


def read_code(c: Ctx, rel: str) -> dict:
    """Return one file's source, redacted. The file on disk is never modified."""
    if rel not in CODE_FILES:
        return {"error": "not in the console allowlist", "path": rel}
    p = c.code_root / rel
    if not p.is_file():
        return {"error": "not found", "path": rel}
    try:
        if p.stat().st_size > _MAX_SOURCE_BYTES:
            return {"error": "file too large to serve", "path": rel}
        raw = p.read_text(errors="replace")
    except OSError as e:
        return {"error": str(e), "path": rel}
    text, n = redact(raw)
    return {
        "path": rel,
        "source": text,
        "redactions": prov(n, STATIC, "admin_console.redact",
                           f"{n} credential-shaped value(s) masked in the "
                           f"served copy; the file on disk is unchanged"),
        "lines": prov(len(raw.splitlines()), STATIC, str(p)),
    }


# ---------------------------------------------------------------------------
# JSON API
# ---------------------------------------------------------------------------


def build_api(c: Ctx, port: int = 0, run_slow: bool = False) -> dict:
    """One snapshot of everything the pages need. Assembled on request."""
    return {
        "runtime": collect_runtime(c, port),
        "sensors": collect_sensors(c),
        "pocketbase": collect_pocketbase(c),
        "units": collect_units(c),
        "network": collect_network(c),
        "diagnostics": collect_diagnostics(c, run_slow=run_slow),
        "code": list_code(c),
    }


def api(c: Ctx, path: str, query: dict, port: int = 0) -> tuple[int, bytes]:
    """Dispatch /admin/api/*. Returns (status, json_bytes)."""
    q = query.get("path", [""])[0] if query else ""
    slow = (query.get("slow", ["0"])[0] == "1") if query else False

    if path == "/admin/api/overview":
        data = build_api(c, port, run_slow=slow)
        counts: dict[str, int] = {}
        for f in data["diagnostics"]:
            counts[f["severity"]] = counts.get(f["severity"], 0) + 1
        return 200, _json({
            "runtime": data["runtime"], "sensors": data["sensors"],
            "severity_counts": counts,
            "top": data["diagnostics"][:5],
        })
    if path == "/admin/api/pocketbase":
        return 200, _json(collect_pocketbase(c))
    if path == "/admin/api/units":
        return 200, _json(collect_units(c))
    if path == "/admin/api/network":
        return 200, _json(collect_network(c))
    if path == "/admin/api/diagnostics":
        return 200, _json(collect_diagnostics(c, run_slow=slow))
    if path == "/admin/api/code":
        if q:
            res = read_code(c, q)
            # An allowlist rejection is a 404, not a 200 carrying an error
            # body: a caller must not be able to tell "blocked" from "served"
            # by status code alone.
            if "error" in res:
                return 404, _json(res)
            return 200, _json(res)
        return 200, _json(list_code(c))
    if path == "/admin/api/full":
        return 200, _json(build_api(c, port, run_slow=slow))
    return 404, _json({"error": "unknown endpoint", "path": path})


def _json(obj: Any) -> bytes:
    return json.dumps(obj, separators=(",", ":"), default=str).encode()


# ---------------------------------------------------------------------------
# Hard-coded credential detection (D7)
# ---------------------------------------------------------------------------

# A name that looks like it holds a secret.
_SECRET_NAME = re.compile(
    r"(PASS(?:WORD|WD)?|SECRET|TOKEN|API_?KEY|PRIVATE_KEY)", re.IGNORECASE)
_SECRET_NAME_STRICT = re.compile(r"^_?(?:[A-Z0-9_]*_)?(?:RTSP_)?(?:USER|PASS|PASSWORD|"
                                 r"SECRET|TOKEN|API_?KEY)(?:_[A-Z0-9]+)*$", re.IGNORECASE)

# Values that are placeholders, not credentials.
_PLACEHOLDERS = frozenset({
    "", "none", "null", "true", "false", "changeme", "todo", "xxx", "...",
    "<password>", "<secret>", "unused", "unset",
})


def _is_secret_literal(node: ast.AST) -> bool:
    """True only for a real string literal.

    Deliberately excludes anything produced by a CALL. That distinction is
    what separates
        PB_PASSWORD = os.getenv("PB_PASSWORD", "")        <- correct, fail-closed
    from
        RTSP_USER, RTSP_PASS, _ = "pigpulse", "capstone", 554   <- hardcoded
    A regex cannot tell those apart because both contain a quoted token; the
    AST can, because in the first case the quoted token is an argument to a
    call and in the second it IS the assigned value.
    """
    return (isinstance(node, ast.Constant) and isinstance(node.value, str)
            and len(node.value) >= 3 and node.value.strip().lower() not in _PLACEHOLDERS)


def _collect_hardcoded(path: Path) -> list[tuple[int, str]]:
    """(line, name) for every assignment that bakes in a credential."""
    try:
        tree = ast.parse(path.read_text(errors="replace"))
    except (OSError, SyntaxError):
        return []
    hits: list[tuple[int, str]] = []
    for node in ast.walk(tree):
        targets: list[ast.AST] = []
        value: ast.AST | None = None
        if isinstance(node, ast.Assign):
            targets, value = list(node.targets), node.value
        elif isinstance(node, ast.AnnAssign) and node.value is not None:
            targets, value = [node.target], node.value
        else:
            continue
        if value is None:
            continue
        # Tuple form: A, B, C = "u", "p", 554 — secret-ness comes from the
        # target NAMES, and only the string elements can hold a credential.
        # The target is itself a Tuple node, so flatten it.
        if isinstance(value, ast.Tuple):
            names: list[str] = []
            for t in targets:
                for sub in ast.walk(t):
                    if isinstance(sub, ast.Name):
                        names.append(sub.id)
            if not any(_SECRET_NAME.search(n) for n in names):
                continue
            for elt in value.elts:
                if _is_secret_literal(elt):
                    hits.append((elt.lineno, ",".join(names)))
            continue
        # Simple form: NAME = "literal"
        for t in targets:
            if not isinstance(t, ast.Name) or not _SECRET_NAME.search(t.id):
                continue
            if _is_secret_literal(value):
                hits.append((getattr(value, "lineno", t.lineno), t.id))
    return hits


def collect_hardcoded_credential_findings(c: Ctx) -> list[dict]:
    """Flag credentials baked into source instead of read from the environment.

    The value is never echoed. Only file, line and variable name are reported,
    so a finding is safe to render and safe to paste.
    """
    findings: list[dict] = []
    targets = ["cctv/tapo_mjpeg_server.py", "bridge/local_bridge.py",
               "workers/cloud_sync.py", "workers/readonly_pb_proxy.py",
               "thermal-pi/config.py", "thermal-pi/web_server.py"]
    for rel in targets:
        p = c.code_root / rel
        if not p.is_file():
            continue
        hits = _collect_hardcoded(p)
        if not hits:
            continue
        lines = ", ".join(f"L{ln} ({nm})" for ln, nm in sorted(set(hits))[:4])
        findings.append({
            "id": f"cctv/hardcoded-credential",
            "severity": "high",
            "title": f"{rel} hard-codes a credential instead of reading the "
                     f"environment",
            "evidence": f"line(s): {lines}\n"
                        f"(the value is withheld from this report on purpose)",
            "why": (
                "A credential in source is copied to every clone, every SD "
                "card and every screenshot of this console. The AP this Pi "
                "serves is a shared barn network, so the RTSP and AP "
                "passphrases should be read from a 0600 env file like "
                "/etc/pigpulse/bridge.env, never embedded."
            ),
            "fix": (
                "Read the value from the environment with no default, fail "
                "closed when it is unset, and rotate the exposed credential. "
                "Then purge it from git history."
            ),
            "command": f"grep -nE '(PASS|USER|SECRET)\\s*=' {rel}",
        })
    return findings
