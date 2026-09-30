#!/usr/bin/env python3
"""
Verification for the PigPulse technician console (admin_console.py).

Run from backend/thermal-pi/:
    python3 scripts/verify_admin_console.py [--dev-source /media/solrahk/rootfs]

This is the check that would have caught the "mocked data" problem, so it
asserts the things that are easy to get quietly wrong:

  A. every page and API endpoint answers
  B. traversal and non-allowlisted paths are refused with 404
  C. dev mode starts NO I2C loop, NO :9090 listener, NO MQTT publisher
  D. NO datum is tagged `live` in dev mode -- that would mean the console
     invented or mislabelled hardware state
  E. the known credential literal never appears in a served source response
  F. pre-existing routes are unchanged (regression)
  G. the SD card is not written to (mtime + hash of data.db before/after)

Exit code 0 only if every check passes.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

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


def port_open(port: int, host: str = "127.0.0.1") -> bool:
    with socket.socket() as s:
        s.settimeout(1.0)
        return s.connect_ex((host, port)) == 0


def listening_ports() -> set[int]:
    """Every TCP port currently in LISTEN, via /proc (no external tools)."""
    ports: set[int] = set()
    for name in ("/proc/net/tcp", "/proc/net/tcp6"):
        try:
            lines = Path(name).read_text().splitlines()[1:]
        except OSError:
            continue
        for ln in lines:
            f = ln.split()
            if len(f) > 3 and f[3] == "0A":       # 0A = TCP_LISTEN
                try:
                    ports.add(int(f[1].split(":")[1], 16))
                except (ValueError, IndexError):
                    pass
    return ports


def literal_is_only_in_comments(text: str, literal: str) -> bool:
    """True if every occurrence of `literal` sits on a comment line.

    Distinguishes a live credential from a maintainer warning. `local_bridge.py`
    says "admin123 shipped in this file for months" as a comment explaining
    the purge — that is history, not a secret, and masking it would destroy
    the warning. A literal in executable position IS a leak.
    """
    for line in text.splitlines():
        if literal not in line:
            continue
        stripped = line.lstrip()
        if stripped.startswith("#"):
            continue                      # whole-line comment
        if stripped.startswith(('"""', "'''")) or stripped.startswith(("r\"\"\"", "r'''")):
            continue                      # docstring line
        # Trailing comment: everything after an unquoted '#' is prose. Only
        # accept it when the literal sits after that marker.
        hash_at = line.find("#")
        if hash_at != -1 and line.index(literal) > hash_at:
            continue
        return False
    return True


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
    before_ports = listening_ports()
    print(f"  (pre-existing listeners on this host: {sorted(before_ports)})\n")

    srv = subprocess.Popen(
        [sys.executable, "-u", "web_server.py", "--dev-source", str(root),
         "--host", "127.0.0.1", "--port", str(PORT)],
        cwd=APP, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
    )
    try:
        for _ in range(60):
            if port_open(PORT):
                break
            if srv.poll() is not None:
                print("server exited early:\n" + (srv.stdout.read() if srv.stdout else ""))
                return 2
            time.sleep(0.25)
        if not port_open(PORT):
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
        check("no ESP listener on :9090", not port_open(9090))
        # Do NOT assert "port 8080 is free": on this laptop :8080 is held by
        # docker-proxy regardless of anything the console does. The honest
        # question is whether the dev server opened any listener AT ALL
        # beyond the one port it was told to bind, so compare the full
        # listening set captured before launch against the set now.
        now_ports = listening_ports()
        new_ports = sorted(now_ports - before_ports)
        check("no new listener opened beyond the requested port",
              set(new_ports) <= {PORT}, f"new: {new_ports or 'none'}")
        check("only :8085 is bound by this process",
              PORT in now_ports and now_ports - before_ports == {PORT},
              f"listening: {sorted(now_ports)}")

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
        for path in ("cctv/tapo_mjpeg_server.py", "bridge/local_bridge.py",
                     "thermal-pi/config.py", "workers/cloud_sync.py",
                     "thermal-pi/web_server.py", "thermal-pi/admin_console.py"):
            from urllib.parse import quote
            st, raw = get("/admin/api/code?path=" + quote(path))
            txt = raw.decode("utf-8", "replace")
            leaks = [lit for lit in FORBIDDEN_LITERALS
                     if lit in txt and not literal_is_only_in_comments(txt, lit)]
            note = ", ".join(leaks) if leaks else (
                "mentions exist but only inside comments/docstrings" if any(
                    lit in txt for lit in FORBIDDEN_LITERALS) else "no literal present")
            check(f"no live secret in {path}", not leaks, note)
        st, raw = get("/admin/api/code?path=" + "cctv%2Ftapo_mjpeg_server.py")
        d = json.loads(raw)
        check("redaction count reported to the operator",
              isinstance(d.get("redactions"), dict) and
              d["redactions"].get("value", 0) > 0,
              f"{d.get('redactions', {}).get('value')} redactions")

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
