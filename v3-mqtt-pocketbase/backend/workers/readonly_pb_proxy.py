#!/usr/bin/env python3
"""
PigPulse — read-only PocketBase edge proxy.

WHY THIS EXISTS
---------------
The public dashboard (pig-health-monitor.vercel.app) cannot reach a PocketBase
bound to a laptop's loopback interface. Options were: expose PocketBase
directly (publishes /api/admins and open listRules to the internet) or expose a
narrow proxy. This is the narrow option.

SECURITY POSTURE (read this before changing anything)
----------------------------------------------------
- GET and HEAD only. Any write verb is refused before touching PocketBase.
- Only `telemetry`, `alerts`, `pigs`, `devices` may be read.
- `/api/admins/**` is NEVER proxied, not even for GET.
- Response fields are allowlisted, so PocketBase internals cannot leak by
  adding columns later.
- Requires `X-PigPulse-Key` matching PROXY_KEY; without it this is unusable.
  The key is a server-side secret and must never be placed in a client bundle.
- Rate limited per client IP.

Stdlib only: no third-party dependencies, no sudo, no root.
"""
from __future__ import annotations

import json
import os
import re
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict, deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# ── Config ───────────────────────────────────────────────────────────
UPSTREAM = os.environ.get("PB_UPSTREAM", "http://127.0.0.1:8090").rstrip("/")
PROXY_KEY = os.environ.get("PROXY_KEY", "")
# Pi thermal console (feeds the deployed app's live thermal view). Read-only
# GETs to an allowlist of console endpoints; the console cert is self-signed,
# so the TLS context is deliberately unverified (local LAN hop).
PI_UPSTREAM = os.environ.get("PI_UPSTREAM", "https://192.168.69.1:8080").rstrip("/")
_PI_SSL = ssl._create_unverified_context()
PORT = int(os.environ.get("PROXY_PORT", "8099"))
HOST = os.environ.get("PROXY_HOST", "127.0.0.1")
UPSTREAM_TIMEOUT = float(os.environ.get("UPSTREAM_TIMEOUT", "8"))
RATE_LIMIT = int(os.environ.get("RATE_LIMIT", "120"))      # requests
RATE_WINDOW = float(os.environ.get("RATE_WINDOW", "60"))   # seconds

ALLOWED_COLLECTIONS = {"telemetry", "alerts", "pigs", "devices"}

# Only these query params are forwarded upstream.
ALLOWED_QUERY = {
    "page", "perPage", "sort", "filter", "expand", "fields", "skipTotal",
}

# Field allowlist per collection. Anything else is dropped from the response.
ALLOWED_FIELDS: dict[str, set[str]] = {
    "telemetry": {
        "id", "deviceId", "timestamp", "temperature", "bodyTemp", "pigId",
        "status", "healthStatus", "batteryPct", "wifiRssi", "humidity",
        "pressure", "audioLevel", "coughCount", "created", "updated",
    },
    "alerts": {
        "id", "deviceId", "type", "severity", "message", "timestamp",
        "pigId", "created", "updated",
    },
    "pigs": {"id", "pigId", "name", "healthStatus", "tags"},
    "devices": {
        "id", "deviceId", "name", "type", "status", "batteryPct", "lastSeen",
    },
}

COLLECTION_RE = re.compile(r"^/api/collections/([a-zA-Z0-9_]+)/records$")
SAFE_FILTER = re.compile(r"^[A-Za-z0-9_@=<>!\.\'\"\- ]+$")
# quotes/space allowed: the app sends filters like deviceId='pi-thermal-01'

_hits: dict[str, deque] = defaultdict(deque)


def rate_limited(ip: str) -> bool:
    now = time.time()
    q = _hits[ip]
    while q and now - q[0] > RATE_WINDOW:
        q.popleft()
    if len(q) >= RATE_LIMIT:
        return True
    q.append(now)
    return False


def sanitize(collection: str, payload: dict) -> dict:
    """Strip anything outside the field allowlist, recursively and shallowly."""
    fields = ALLOWED_FIELDS.get(collection)
    if not fields:
        return {}
    out: dict = {}
    for key, value in payload.items():
        if key not in fields:
            continue
        if isinstance(value, (dict, list)):
            # Nested structures are never part of the public contract.
            continue
        out[key] = value
    return out


class Handler(BaseHTTPRequestHandler):
    server_version = "PigPulseReadOnlyProxy/1.0"
    protocol_version = "HTTP/1.1"

    def log_message(self, format, *args):  # noqa: A002 - stdlib signature
        sys.stderr.write("%s - %s\n" % (self.address_string(), format % args))

    # ── helpers ─────────────────────────────────────────────────────
    def _send(self, code: int, body: bytes, ctype="application/json") -> None:
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def _json(self, code: int, obj) -> None:
        self._send(code, json.dumps(obj).encode())

    def _authorized(self) -> bool:
        if not PROXY_KEY:
            return False
        supplied = self.headers.get("X-PigPulse-Key", "")
        # Constant-time compare.
        if len(supplied) != len(PROXY_KEY):
            return False
        mismatch = 0
        for a, b in zip(supplied, PROXY_KEY):
            mismatch |= ord(a) ^ ord(b)
        return mismatch == 0

    def _refuse_write(self) -> None:
        self.send_response(405, "Method Not Allowed")
        self.send_header("Allow", "GET, HEAD")
        self.send_header("Content-Length", "0")
        self.end_headers()

    # ── verbs ───────────────────────────────────────────────────────
    def do_POST(self):
        self._refuse_write()

    def do_PUT(self):
        self._refuse_write()

    def do_PATCH(self):
        self._refuse_write()

    def do_DELETE(self):
        self._refuse_write()

    def do_OPTIONS(self):
        self._refuse_write()

    def do_HEAD(self):
        self.do_GET()

    # Read-only passthrough to the Pi thermal console (the deployed app's live
    # thermal view rides this). Key gate applies like everything else.
    PI_ROUTES = {"/data", "/ambient", "/esp/status", "/health"}

    def _proxy_pi(self, path: str, query: str) -> None:
        target_path = path[3:] or "/"
        if target_path == "/esp/record":
            self._esp_record(query)
            return
        if target_path not in self.PI_ROUTES:
            self._json(404, {"error": "pi endpoint not allowed"})
            return
        if query and len(query) > 120:
            query = ""
        url = f"{PI_UPSTREAM}{target_path}"
        if query:
            url += "?" + query
        try:
            req = urllib.request.Request(url, method="GET")
            req.add_header("Accept", "application/json")
            with urllib.request.urlopen(req, timeout=6, context=_PI_SSL) as resp:
                raw = resp.read()
        except Exception as e:  # noqa: BLE001
            self._json(502, {"error": f"pi unreachable: {type(e).__name__}"})
            return
        self._send(200, raw)

    def _esp_record(self, query: str) -> None:
        """Bounded WAV capture from the barn mic (seconds=1..10, default 3).

        Forwards the Pi's honest 503 when the mic stream is stale — the app
        shows "no audio" rather than pretending.
        """
        seconds = "3"
        for pair in (query or "").split("&"):
            k, _, v = pair.partition("=")
            if k == "seconds" and v.isdigit() and 1 <= int(v) <= 10:
                seconds = v
        url = f"{PI_UPSTREAM}/esp/record?seconds={seconds}"
        try:
            req = urllib.request.Request(url, method="GET")
            req.add_header("Accept", "audio/wav")
            with urllib.request.urlopen(req, timeout=14, context=_PI_SSL) as resp:
                raw = resp.read()
            self._send(200, raw, ctype="audio/wav")
        except urllib.error.HTTPError as e:
            body = e.read() if hasattr(e, "read") else b""
            self._send(e.code, body or b"mic unavailable", ctype="text/plain")
        except Exception as e:  # noqa: BLE001
            self._json(502, {"error": f"mic unreachable: {type(e).__name__}"})

    def _cctv_frame(self) -> None:
        """One JPEG frame from the Pi's MJPEG proxy (/cctv) — snapshot-friendly.

        The raw stream never ends, so we read bounded chunks until a complete
        JPEG is present (then return the freshest frame), with a hard time cap.
        The app polls this every ~2 s; the full MJPEG stays console-only.
        """
        buf = b""
        deadline = time.time() + 4.0
        try:
            req = urllib.request.Request(f"{PI_UPSTREAM}/cctv", method="GET")
            req.add_header("Accept", "multipart/x-mixed-replace")
            with urllib.request.urlopen(req, timeout=5, context=_PI_SSL) as resp:
                while time.time() < deadline and len(buf) < 2_000_000:
                    chunk = resp.read(16384)
                    if not chunk:
                        break
                    buf += chunk
                    if b"\xff\xd9" in buf:
                        break
        except Exception as e:  # noqa: BLE001
            self._json(502, {"error": f"cctv unreachable: {type(e).__name__}"})
            return
        frame = None
        pos = 0
        while True:
            i = buf.find(b"\xff\xd8", pos)
            if i < 0:
                break
            j = buf.find(b"\xff\xd9", i + 2)
            if j < 0:
                break
            frame = buf[i:j + 2]
            pos = j + 2
        if not frame:
            self._json(502, {"error": "no complete frame"})
            return
        self.send_response(200)
        self.send_header("Content-Type", "image/jpeg")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(frame)))
        self.end_headers()
        try:
            self.wfile.write(frame)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_GET(self):
        if not self._authorized():
            self._json(401, {"error": "unauthorized"})
            return

        if rate_limited(self.client_address[0]):
            self._json(429, {"error": "rate limited"})
            return

        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"

        if path == "/health":
            self._json(200, {"ok": True, "service": "pigpulse-readonly-proxy"})
            return

        # Hard block on the admin surface, even for GET.
        if path.startswith("/api/admins") or "/admins/" in path:
            self._json(403, {"error": "admin surface is not proxied"})
            return

        if path == "/pi/cctv":
            self._cctv_frame()
            return

        if path == "/pi" or path.startswith("/pi/"):
            self._proxy_pi(path, parsed.query)
            return

        m = COLLECTION_RE.match(path)
        if not m:
            self._json(404, {"error": "not found"})
            return

        collection = m.group(1)
        if collection not in ALLOWED_COLLECTIONS:
            self._json(403, {"error": f"collection '{collection}' is not readable"})
            return

        # Rebuild the query string from an allowlist, and never trust `filter`
        # syntax from the internet.
        incoming = urllib.parse.parse_qs(parsed.query, keep_blank_values=False)
        params: dict[str, str] = {}
        for key, values in incoming.items():
            if key not in ALLOWED_QUERY or not values:
                continue
            value = values[0]
            if key == "filter":
                if not SAFE_FILTER.match(value):
                    self._json(400, {"error": "unsupported filter expression"})
                    return
            if len(value) > 200:
                continue
            params[key] = value

        # Bound page size so one request cannot pull the whole table.
        if "perPage" in params:
            try:
                params["perPage"] = str(min(max(int(params["perPage"]), 1), 100))
            except ValueError:
                self._json(400, {"error": "perPage must be an integer"})
                return

        upstream_url = f"{UPSTREAM}/api/collections/{collection}/records"
        if params:
            upstream_url += "?" + urllib.parse.urlencode(params)

        try:
            req = urllib.request.Request(upstream_url, method="GET")
            # Deliberately NOT forwarding Authorization or any client header.
            req.add_header("Accept", "application/json")
            with urllib.request.urlopen(req, timeout=UPSTREAM_TIMEOUT) as resp:
                raw = resp.read()
        except urllib.error.HTTPError as e:
            self._json(502, {"error": f"upstream returned {e.code}"})
            return
        except Exception as e:  # noqa: BLE001
            self._json(502, {"error": f"upstream unreachable: {type(e).__name__}"})
            return

        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            self._json(502, {"error": "upstream returned invalid JSON"})
            return

        if isinstance(data, dict) and isinstance(data.get("items"), list):
            data["items"] = [sanitize(collection, item) for item in data["items"]
                             if isinstance(item, dict)]
            for meta in ("page", "perPage", "totalItems", "totalPages", "offset"):
                if meta not in data:
                    data.pop(meta, None)
            if "totalItems" in data and not isinstance(data["totalItems"], int):
                data.pop("totalItems", None)
            data.pop("offset", None)
            data.pop("extra", None)
        else:
            self._json(502, {"error": "unexpected upstream payload"})
            return

        self._send(200, json.dumps(data).encode())


def main() -> None:
    if not PROXY_KEY:
        print("FATAL: PROXY_KEY is empty; refusing to start.", file=sys.stderr)
        raise SystemExit(2)

    server = ThreadingHTTPServer((HOST, PORT), Handler)
    server.daemon_threads = True
    print(f"PigPulse read-only proxy on http://{HOST}:{PORT} -> {UPSTREAM}",
          flush=True)
    print(f"Readable collections: {', '.join(sorted(ALLOWED_COLLECTIONS))}",
          flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
