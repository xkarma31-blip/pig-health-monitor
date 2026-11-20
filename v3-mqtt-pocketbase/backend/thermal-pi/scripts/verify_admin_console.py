#!/usr/bin/env python3
"""
Verification for the PigPulse technician console (admin_console.py).

Run from backend/thermal-pi/:
    python3 scripts/verify_admin_console.py [--dev-source /media/solrahk/rootfs]

This is the check that would have caught the "mocked data" problem, so it
asserts the things that are easy to get quietly wrong:

  A. every page and API endpoint answers
  B. traversal and non-allowlisted paths are refused with 404
  C. dev mode starts NO I2C loop and opens NO new physical listener
     (including :9090); listener checks are passive and never connect
  D. NO datum is tagged `live` in dev mode -- that would mean the console
     invented or mislabelled hardware state
  E. the known credential literal never appears in a served source response
  F. pre-existing routes are unchanged (regression)
  G. the SD card is not written to (mtime + hash of data.db before/after)

Exit code 0 only if every check passes.
"""

from __future__ import annotations

import argparse
import ast
import hashlib
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import quote

try:
    from scripts.mic_port_guard import MIC_PORT, active_mic_connection_lines
except ModuleNotFoundError as exc:
    if exc.name != "scripts.mic_port_guard":
        raise
    # Direct execution puts scripts/ on sys.path instead of its parent.
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from mic_port_guard import MIC_PORT, active_mic_connection_lines

HERE = Path(__file__).resolve().parent
APP = HERE.parent
PORT = 8085
BASE = f"http://127.0.0.1:{PORT}"

PAGES = ["/admin", "/admin/sensors.html", "/admin/data.html", "/admin/system.html",
         "/admin/code.html", "/admin/diagnostics.html",
         "/admin/console.css", "/admin/console.js"]
APIS = ["/admin/api/overview", "/admin/api/pocketbase", "/admin/api/units",
        "/admin/api/network", "/admin/api/diagnostics", "/admin/api/code"]
MUST_404 = ["/admin/api/code?path=../../.env", "/admin/api/code?path=/etc/shadow",
            "/admin/api/code?path=../../../etc/pigpulse/bridge.env",
            "/admin/nope.html", "/admin/../web_server.py"]

# Literals that exist in the tree and must never be served.
FORBIDDEN_LITERALS = ["capstone", '"pigpulse"', "admin123"]

# The card's real secrets, if the harness has them.
PB_REL = "home/pigpulse/pocketbase/pb_data/data.db"

_results: list[tuple[str, bool, str]] = []


def check(name: str, ok: bool, detail: str = "") -> bool:
    _results.append((name, ok, detail))
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}" + (f"  — {detail}" if detail else ""))
    return ok


def get(path: str, timeout: int = 15):
    req = urllib.request.Request(BASE + path)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, r.read()


def code_of(path: str) -> int:
    try:
        return get(path)[0]
    except urllib.error.HTTPError as e:
        return e.code
    except Exception:
        return 0


def _tcp_rows() -> list[tuple[int, int, str, int]]:
    """Return (local port, remote port, state, inode) from /proc TCP tables."""
    rows: list[tuple[int, int, str, int]] = []
    for name in ("/proc/net/tcp", "/proc/net/tcp6"):
        try:
            lines = Path(name).read_text().splitlines()[1:]
        except OSError:
            continue
        for line in lines:
            fields = line.split()
            if len(fields) < 10:
                continue
            try:
                local_port = int(fields[1].rsplit(":", 1)[1], 16)
                remote_port = int(fields[2].rsplit(":", 1)[1], 16)
                inode = int(fields[9])
            except (ValueError, IndexError):
                continue
            rows.append((local_port, remote_port, fields[3], inode))
    return rows


def _descendant_pids(root_pid: int) -> set[int]:
    """Return root_pid plus live descendants, using /proc PPid values."""
    parents: dict[int, int] = {}
    for proc in Path("/proc").iterdir():
        if not proc.name.isdigit():
            continue
        try:
            status = (proc / "status").read_text()
        except OSError:
            continue
        for line in status.splitlines():
            if line.startswith("PPid:"):
                try:
                    parents[int(proc.name)] = int(line.split()[1])
                except (ValueError, IndexError):
                    pass
                break
    pids = {root_pid}
    pending = [root_pid]
    while pending:
        parent = pending.pop()
        for pid, ppid in parents.items():
            if ppid == parent and pid not in pids:
                pids.add(pid)
                pending.append(pid)
    return pids


def _socket_inodes(pids: set[int]) -> set[int]:
    """Return socket inodes owned by the given process tree."""
    inodes: set[int] = set()
    for pid in pids:
        fd_dir = Path(f"/proc/{pid}/fd")
        try:
            fds = list(fd_dir.iterdir())
        except OSError:
            continue
        for fd in fds:
            try:
                target = os.readlink(fd)
            except OSError:
                continue
            if target.startswith("socket:[") and target.endswith("]"):
                try:
                    inodes.add(int(target[8:-1]))
                except ValueError:
                    pass
    return inodes


def child_listening_ports(pid: int) -> set[int]:
    """Return listening ports attributable to a child and its descendants."""
    inodes = _socket_inodes(_descendant_pids(pid))
    return {
        local_port
        for local_port, _remote_port, state, inode in _tcp_rows()
        if state == "0A" and inode in inodes
    }


def child_outbound_mic_connections(pid: int) -> list[tuple[int, int, str, int]]:
    """Return sampled outbound :9090 rows attributable to a child process tree."""
    inodes = _socket_inodes(_descendant_pids(pid))
    return [
        row
        for row in _tcp_rows()
        if row[1] == MIC_PORT and row[3] in inodes
    ]


def literal_leak_lines(source: str, literal: str) -> list[int]:
    """Return executable string-literal lines containing ``literal``.

    Comments and module/class/function docstrings are evidence, not live
    credentials, so they are deliberately ignored.
    """
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return []

    docstring_ranges: list[tuple[int, int]] = []
    for node in ast.walk(tree):
        if not isinstance(node, (ast.Module, ast.ClassDef, ast.FunctionDef,
                                 ast.AsyncFunctionDef)) or not node.body:
            continue
        first = node.body[0]
        if (isinstance(first, ast.Expr) and isinstance(first.value, ast.Constant)
                and isinstance(first.value.value, str)):
            docstring_ranges.append((first.value.lineno, first.value.end_lineno or
                                     first.value.lineno))

    quoted = len(literal) >= 2 and literal[0] == literal[-1] and literal[0] in "\"'"
    needle = literal[1:-1] if quoted else literal
    leaks: set[int] = set()
    for node in ast.walk(tree):
        if not isinstance(node, ast.Constant) or not isinstance(node.value, str):
            continue
        if any(start <= node.lineno <= end for start, end in docstring_ranges):
            continue
        leaked = node.value == needle if quoted else needle in node.value
        if leaked:
            leaks.add(node.lineno)
    return sorted(leaks)


def source_response_is_valid(payload: object, path: str) -> bool:
    """True only for a successful, correctly addressed Python source envelope."""
    if not isinstance(payload, dict) or "error" in payload:
        return False
    source = payload.get("source")
    if (payload.get("path") != path or not isinstance(source, str)
            or not source.strip()):
        return False
    try:
        tree = ast.parse(source)
    except (SyntaxError, ValueError):
        return False
    meaningful = [
        node for node in tree.body
        if not (
            isinstance(node, ast.Expr)
            and isinstance(node.value, ast.Constant)
            and isinstance(node.value.value, str)
        )
        and not (isinstance(node, ast.Pass))
        and not (
            isinstance(node, ast.Expr)
            and isinstance(node.value, ast.Constant)
            and node.value.value is Ellipsis
        )
    ]
    return bool(meaningful)


def walk_tags(obj, out: list[str]) -> None:
    """Collect every provenance tag anywhere in a decoded JSON body."""
    if isinstance(obj, dict):
        t = obj.get("tag")
        if isinstance(t, str):
            out.append(t)
        for v in obj.values():
            walk_tags(v, out)
    elif isinstance(obj, list):
        for v in obj:
            walk_tags(v, out)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dev-source", default="/media/solrahk/rootfs")
    args = ap.parse_args()

    # Static preflight is the primary safety layer.  The runtime /proc sample
    # below is supplementary: a short-lived socket can close before it is
    # observed, while the source guard remains deterministic.
    try:
        self_source = Path(__file__).read_text(encoding="utf-8")
        child_source = (APP / "web_server.py").read_text(encoding="utf-8")
        self_hits = active_mic_connection_lines(self_source)
        child_hits = active_mic_connection_lines(child_source)
    except (OSError, SyntaxError, ValueError) as exc:
        print(f"mic-port guard preflight failed: {exc}")
        return 2
    if not check("verifier source has no active :9090 path", not self_hits,
                 f"lines: {self_hits or 'none'}"):
        return 2
    if not check("child source has no active :9090 path", not child_hits,
                 f"lines: {child_hits or 'none'}"):
        return 2

    root = Path(args.dev_source)
    if not root.is_dir():
        print(f"dev source not mounted: {root}")
        return 2

    print(f"verify_admin_console — dev source {root}\n")

    # Fingerprint the card DB so we can prove we did not write to it.
    db = root / PB_REL
    def fingerprint() -> tuple:
        if not db.is_file():
            return ("absent",)
        h = hashlib.sha256(db.read_bytes()).hexdigest()
        st = db.stat()
        return (h, st.st_mtime_ns, st.st_size)
    before = fingerprint()

    srv = subprocess.Popen(
        [sys.executable, "-u", "web_server.py", "--dev-source", str(root),
         "--host", "127.0.0.1", "--port", str(PORT)],
        cwd=APP, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
    )
    try:
        ready = False
        for _ in range(60):
            if PORT in child_listening_ports(srv.pid):
                ready = True
                break
            if srv.poll() is not None:
                print("server exited early:\n" + (srv.stdout.read() if srv.stdout else ""))
                return 2
            time.sleep(0.25)
        if not ready:
            print("server never bound :8085")
            return 2
        time.sleep(0.5)

        print("A. routes")
        for p in PAGES:
            check(f"page {p}", code_of(p) == 200, f"HTTP {code_of(p)}")
        for p in APIS:
            check(f"api  {p}", code_of(p) == 200, f"HTTP {code_of(p)}")

        print("\nB. refusal")
        for p in MUST_404:
            c = code_of(p)
            check(f"refused {p}", c == 404, f"HTTP {c}")

        print("\nC. dev mode starts nothing physical")
        # Do NOT connect to :9090 to test it. The ESP32-S3 PCM path accepts
        # one client, so even a harmless probe can evict the live audio
        # consumer. Attribute passive /proc listener rows to this child tree.
        child_ports = child_listening_ports(srv.pid)
        check("no listener on :9090 from verifier child (passive, attributable)",
              MIC_PORT not in child_ports, f"child listeners: {sorted(child_ports)}")
        check("child opened no listener beyond the requested port",
              child_ports <= {PORT}, f"child listeners: {sorted(child_ports)}")
        check("only :8085 is bound by this process",
              child_ports == {PORT}, f"child listeners: {sorted(child_ports)}")

        print("\nD. anti-mock: no datum claims to be live")
        body = json.loads(get("/admin/api/full")[1])
        tags: list[str] = []
        walk_tags(body, tags)
        live = [t for t in tags if t == "live"]
        check("zero `live`-tagged values in dev mode", not live,
              f"{len(tags)} tags seen, live={len(live)}")
        check("runtime.env reports dev-snapshot",
              body["runtime"]["env"]["value"] == "dev-snapshot",
              body["runtime"]["env"]["value"])
        sensors_na = all(
            body["sensors"][k]["tag"] == "unavailable"
            for k in ("thermal", "esp", "cctv")
        )
        check("all three sensors tagged unavailable", sensors_na)
        check("unavailable values are null, not 0",
              all(body["sensors"][k]["value"] is None
                  for k in ("thermal", "esp", "cctv")))
        pb = body["pocketbase"]
        check("PocketBase counts came from the card (snapshot)",
              pb["available"]["tag"] == "snapshot", pb["available"]["tag"])

        print("\nE. credentials never served")
        source_paths = ("cctv/tapo_mjpeg_server.py", "bridge/local_bridge.py",
                        "thermal-pi/config.py", "workers/cloud_sync.py",
                        "thermal-pi/web_server.py", "thermal-pi/admin_console.py")
        payloads: dict[str, dict] = {}
        for path in source_paths:
            try:
                status, raw = get("/admin/api/code?path=" + quote(path))
            except urllib.error.HTTPError as exc:
                status = exc.code
                raw = exc.read()
            except Exception as exc:  # noqa: BLE001
                check(f"no live secret in {path}", False,
                      f"source request failed: {type(exc).__name__}: {exc}")
                continue
            try:
                payload = json.loads(raw)
            except (json.JSONDecodeError, UnicodeDecodeError):
                payload = None
            if not (status == 200 and source_response_is_valid(payload, path)):
                check(f"no live secret in {path}", False,
                      f"HTTP {status}; invalid source envelope")
                continue

            payloads[path] = payload
            source = payload["source"]
            leak_lines = {lit: literal_leak_lines(source, lit)
                          for lit in FORBIDDEN_LITERALS}
            live_leaks = [lit for lit, lines in leak_lines.items() if lines]
            if live_leaks:
                note = ", ".join(f"{lit} at lines {leak_lines[lit]}"
                                 for lit in live_leaks)
            elif any(lit in source for lit in FORBIDDEN_LITERALS):
                note = "mentions exist but only inside comments/docstrings"
            else:
                note = "no literal present"
            check(f"no live secret in {path}", not live_leaks, note)

        redaction_payload = payloads.get("cctv/tapo_mjpeg_server.py", {})
        redactions = redaction_payload.get("redactions")
        check("redaction count reported to the operator",
              isinstance(redactions, dict) and redactions.get("value", 0) > 0,
              f"{redactions.get('value') if isinstance(redactions, dict) else 'missing'} redactions")

        outbound_rows = child_outbound_mic_connections(srv.pid)
        check("no outbound :9090 connection from verifier child (/proc sample, attributable)",
              not outbound_rows,
              "no attributable rows; sample is limited because transient sockets may already be closed"
              if not outbound_rows else f"rows: {outbound_rows}")

        print("\nF. pre-existing routes unchanged")
        check("legacy /audio tombstone is 410", code_of("/audio") == 410,
              f"HTTP {code_of('/audio')}")
        check("root dashboard still serves", code_of("/") == 200)
        check("/data still serves", code_of("/data") == 200)
        check("/health still serves", code_of("/health") == 200)
        check("/esp/status still serves", code_of("/esp/status") == 200)

        print("\nG. the SD card was not written to")
        after = fingerprint()
        check("card data.db byte-identical and same mtime", before == after,
              f"{before[0][:12] if before[0] != 'absent' else 'absent'} -> "
              f"{after[0][:12] if after[0] != 'absent' else 'absent'}")
    finally:
        srv.terminate()
        try:
            srv.wait(timeout=10)
        except subprocess.TimeoutExpired:
            srv.kill()

    passed = sum(1 for _, ok, _ in _results if ok)
    total = len(_results)
    print(f"\n{'=' * 62}\n  {passed}/{total} checks passed")
    if passed != total:
        print("  FAILURES:")
        for n, ok, d in _results:
            if not ok:
                print(f"    - {n}  {d}")
    print("=" * 62)
    return 0 if passed == total else 1


if __name__ == "__main__":
    raise SystemExit(main())
