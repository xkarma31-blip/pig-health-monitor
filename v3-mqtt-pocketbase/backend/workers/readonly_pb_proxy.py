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
PI_UPSTREAM = os.environ.get("PI_UPSTREAM", "https://raspberrypi.local:8080").rstrip("/")
# The Pi is reachable at different addresses depending on how it is attached:
# its own barn access point or a LAN cable into the operator's machine / the
# home router. The mDNS hostname leads because it resolves to whichever address
# is live — probing a hardcoded address first cost a full connect timeout on
# every request whenever the rig was cabled differently.
# A single hardcoded address also meant production silently 502'd the moment the
# attachment changed, even with a perfectly healthy Pi. So: try the candidates
# in order, remember the one that answered, and lead with that next time.
_DEFAULT_FALLBACKS = ["https://192.168.69.1:8080"]
PI_UPSTREAM_FALLBACKS = [
    u.strip().rstrip("/")
    for u in os.environ.get("PI_UPSTREAM_FALLBACKS", ",".join(_DEFAULT_FALLBACKS)).split(",")
    if u.strip()
]
# Last candidate that answered. Sticky so the working path is tried first.
_pi_current: str | None = None


def pi_candidates() -> list[str]:
    """Candidate Pi console bases, best-known first, de-duplicated."""
    out: list[str] = []
    for url in [_pi_current, PI_UPSTREAM, *PI_UPSTREAM_FALLBACKS]:
        if url and url not in out:
            out.append(url)
    return out


def pi_remember(url: str) -> None:
    """Record the candidate that just answered, so it leads next time."""
    global _pi_current
    _pi_current = url


class PiUnreachable(Exception):
    """No candidate Pi address answered. `reason` is safe to return publicly."""

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


def pi_open(suffix: str, *, timeout: float, accept: str):
    """Open a GET against the Pi console, trying every candidate address.

    Returns the open response — the caller owns it and must close it.
    Raises the Pi's own HTTPError unchanged (so its honest 503s pass through),
    or PiUnreachable when no candidate answered at all.
    """
    last = "unreachable"
    for base in pi_candidates():
        try:
            req = urllib.request.Request(f"{base}{suffix}", method="GET")
            if accept:
                req.add_header("Accept", accept)
            resp = urllib.request.urlopen(req, timeout=timeout, context=_PI_SSL)
            pi_remember(base)
            return resp
        except urllib.error.HTTPError:
            # The Pi answered: it is reachable, and this is its real status.
            pi_remember(base)
            raise
        except Exception as e:  # noqa: BLE001
            # Never echo the internal address into a public error body.
            last = type(e).__name__
    raise PiUnreachable(last)


def pi_get(suffix: str, *, timeout: float, accept: str) -> bytes:
    """Whole-body read from the Pi console, across every candidate address.

    A failure *during* the body read (a stalled socket, not just a failed
    connect) is folded into PiUnreachable, so every caller can answer 502 with
    a real reason instead of letting the exception escape the request handler.
    """
    try:
        with pi_open(suffix, timeout=timeout, accept=accept) as resp:
            return resp.read()
    except urllib.error.HTTPError:
        raise
    except PiUnreachable:
        raise
    except Exception as e:  # noqa: BLE001
        raise PiUnreachable(type(e).__name__) from e
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
        # Real sensor fields. `temperature`/`bodyTemp` are zeroed by the
        # thermal bridge, so scene temperature lives in `center` (with
        # `hotspot`/`max`/`min`/`ambient` alongside it) and the barn mic's
        # real signal level lives in `rms`/`peak` with its sample rate `sr`.
        # Without these the public read path silently returns zeros and the
        # web UI has to invent numbers.
        "center", "hotspot", "max", "min", "ambient",
        "rms", "peak", "sr", "mic", "alerts", "verdict", "synced",
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
# NOTE: JS `$` (telemetry.js) does NOT match before a trailing newline, while
# Python `$` does — so this uses \Z (absolute end) to keep the two validators
# character-identical in behaviour.
SAFE_FILTER = re.compile(r"^[A-Za-z0-9_@=<>!\.,()'\"&~:/\- ]+\Z")
# PocketBase's own filter syntax needs single quotes around string values
# (deviceId='pi-thermal-01') and `&&` to combine clauses
# (deviceId='pi-thermal-01'&&timestamp>=1793000000). The previous charset
# rejected `&`, so every compound filter was answered with HTTP 400 and the
# web read path could not scope a query to one device or one time window.
# Still no shell/URL metacharacters: only the characters PocketBase's filter
# grammar actually needs, and the value is re-encoded with urlencode() before
# it is forwarded upstream.
# NOTE: keep this identical to SAFE_FILTER in frontend/mobile_app/api/telemetry.js
# so the bridge's pre-check never rejects a filter the proxy would accept.

# Camera-audio capture length accepted from the client (seconds). The Pi
# enforces the same range and clamps anything else.
CAMERA_AUDIO_MIN_S = 2
CAMERA_AUDIO_MAX_S = 8
CAMERA_AUDIO_DEFAULT_S = 4

# Barn-mic capture length accepted from the client (seconds).
ESP_RECORD_MIN_S = 1
ESP_RECORD_MAX_S = 10
ESP_RECORD_DEFAULT_S = 3


def _bounded_seconds(query: str, key: str, min_s: int, max_s: int, default: str) -> str:
    """Parse a bounded integer query parameter — TOTAL by design.

    The request line is decoded as latin-1, so a crafted raw byte can be a
    Unicode digit such as '²' (U+00B2). `str.isdigit()` is True for those but
    `int()` raises ValueError, and Python 3.11+ also raises on absurdly long
    digit strings. Either escape would abort the request handler and leave the
    client with ZERO responses instead of an error status — a direct breach of
    the "exactly one response per request" contract.

    So: ASCII digits only, bounded length, and the conversion is still guarded.
    Anything unusable falls back to the default.
    """
    for pair in (query or "").split("&"):
        k, _, value = pair.partition("=")
        if k != key:
            continue
        if not value.isascii() or not value.isdigit() or len(value) > 2:
            continue
        try:
            seconds = int(value)
        except ValueError:
            continue
        if min_s <= seconds <= max_s:
            return value
    return default


def camera_audio_seconds(query: str) -> str:
    """Camera-audio capture length in seconds (2–8), default 4."""
    return _bounded_seconds(
        query, "seconds", CAMERA_AUDIO_MIN_S, CAMERA_AUDIO_MAX_S, str(CAMERA_AUDIO_DEFAULT_S)
    )


def esp_record_seconds(query: str) -> str:
    """Barn-mic capture length in seconds (1–10), default 3."""
    return _bounded_seconds(
        query, "seconds", ESP_RECORD_MIN_S, ESP_RECORD_MAX_S, str(ESP_RECORD_DEFAULT_S)
    )


# Barn-mic live-stream shape accepted from the client.
#   16000  → s16le mono 16 kHz (0.26 Mbit/s) — the deployed app asks for this.
#   native → s16le stereo 48 kHz (1.54 Mbit/s), exactly as the ESP32-S3 sends
#            it. The barn→cloud leg measures ~0.8 Mbit/s, so `native` cannot
#            play in real time through this proxy; it is honoured for
#            completeness (a LAN caller), not for the phone.
# Absent → 16000: this proxy's only public consumer is the deployed app, and a
# silently-48k default would look like a broken stream rather than a busy one.
ESP_STREAM_RATE_DEFAULT = "16000"
ESP_STREAM_RATES = {"16000", "native"}


def esp_stream_rate(query: str) -> str | None:
    """Parse `rate` for /esp/stream; None means 'refuse, the caller asked for
    something the Pi does not offer'. Never silently substitutes a different
    shape than the one requested."""
    value: str | None = None
    for pair in (query or "").split("&"):
        k, _, v = pair.partition("=")
        if k == "rate":
            value = v
    if value is None or value == "":
        return ESP_STREAM_RATE_DEFAULT
    if value not in ESP_STREAM_RATES:
        return None
    return value

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
        # A HEAD response carries the same headers as GET but no body.
        if self.command != "HEAD":
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

    # Routes that trigger a REAL capture on the Pi (ffmpeg RTSP pull / mic
    # record) or hold a live subscription (the barn-mic stream). A HEAD must
    # never burn a capture slot or open a stream — the Pi allows one capture at
    # a time and a stream blocks waiting for the first mic chunk, so a stray
    # health probe or link prefetcher would delay a legitimate GET.
    PI_CAPTURE_ROUTES = {"/esp/record", "/camera-audio", "/esp/stream"}

    def do_HEAD(self):
        # Auth FIRST. The capture-route refusal below answers 405, which would
        # otherwise tell an unauthenticated caller that the route exists before
        # the key was ever checked.
        if not self._authorized():
            self._json(401, {"error": "unauthorized"})
            return
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"
        if path.startswith("/pi/"):
            target_path = path[3:] or "/"
            if target_path in self.PI_CAPTURE_ROUTES:
                # Honest answer: this route only exists as a GET. No capture
                # is started, and no false success is reported.
                self.send_response(405)
                self.send_header("Allow", "GET")
                self.send_header("Content-Type", "application/json")
                body = json.dumps({"error": "capture route requires GET"}).encode()
                self.send_header("Content-Length", str(len(body)))
                self.send_header("Cache-Control", "no-store")
                self.send_header("X-Content-Type-Options", "nosniff")
                self.end_headers()
                return
        self.do_GET()

    # Read-only passthrough to the Pi thermal console (the deployed app's live
    # thermal view rides this). Key gate applies like everything else.
    PI_ROUTES = {"/data", "/ambient", "/esp/status", "/health"}

    def _proxy_pi(self, path: str, query: str) -> None:
        target_path = path[3:] or "/"
        if target_path == "/esp/record":
            self._esp_record(query)
            return
        if target_path == "/camera-audio":
            self._camera_audio(query)
            return
        if target_path == "/esp/stream":
            self._esp_stream(query)
            return
        if target_path not in self.PI_ROUTES:
            self._json(404, {"error": "pi endpoint not allowed"})
            return
        if query and len(query) > 120:
            query = ""
        try:
            raw = pi_get(target_path + (("?" + query) if query else ""), timeout=6, accept="application/json")
        except urllib.error.HTTPError as e:
            # The Pi answered with its own status — forward it rather than
            # pretending the box is unreachable.
            body = e.read() if hasattr(e, "read") else b""
            self._send(e.code, body or b'{"error": "pi error"}')
            return
        except PiUnreachable as e:
            self._json(502, {"error": f"pi unreachable: {e.reason}"})
            return
        self._send(200, raw)

    def _esp_record(self, query: str) -> None:
        """Bounded WAV capture from the barn mic (seconds=1..10, default 3).

        Forwards the Pi's honest 503 when the mic stream is stale — the app
        shows "no audio" rather than pretending.
        """
        seconds = esp_record_seconds(query)
        try:
            # The Pi answers within `seconds + ESP_RECORD_GRACE_S` (30 s for
            # the 10 s cap this proxy allows). The timeout must exceed that,
            # otherwise a slow-but-alive mic is cut off here and reported as
            # "mic unreachable" instead of the Pi's honest 503.
            raw = pi_get(f"/esp/record?seconds={seconds}", timeout=35, accept="audio/wav")
            self._send(200, raw, ctype="audio/wav")
        except urllib.error.HTTPError as e:
            body = e.read() if hasattr(e, "read") else b""
            self._send(e.code, body or b"mic unavailable", ctype="text/plain")
        except PiUnreachable as e:
            self._json(502, {"error": f"mic unreachable: {e.reason}"})

    def _camera_audio(self, query: str) -> None:
        """Forward the Pi's camera-audio capture (WAV).

        Capture happens on the Pi (ffmpeg against the camera's RTSP stream2),
        so this path never depends on the laptop: there is deliberately no
        local-capture fallback here. The Pi's honest status is passed through
        unchanged — 503 when the camera is offline, so the app can say so
        instead of showing a mute that is really a dead camera.
        """
        seconds = camera_audio_seconds(query)
        try:
            # The Pi's ffmpeg capture is bounded by `seconds + 15` (23 s at the
            # 8 s cap) plus HTTP overhead, so this budget must stay above it —
            # otherwise a recovering capture is aborted here and misreported as
            # "camera audio unreachable" instead of the Pi's honest 503.
            raw = pi_get(f"/camera-audio?seconds={seconds}", timeout=30, accept="audio/wav")
            self._send(200, raw, ctype="audio/wav")
        except urllib.error.HTTPError as e:
            body = e.read() if hasattr(e, "read") else b""
            self._send(e.code, body or b"camera audio unavailable", ctype="text/plain")
        except PiUnreachable as e:
            self._json(502, {"error": f"camera audio unreachable: {e.reason}"})

    # Read timeout for the stream's own socket. The Pi waits up to 2 s for the
    # first mic chunk before answering 503, then the ESP pushes continuously;
    # 15 s tolerates a reconnect pause without holding a dead socket forever.
    ESP_STREAM_TIMEOUT = 15.0

    def _esp_stream(self, query: str) -> None:
        """Live barn-mic PCM, relayed through — not buffered.

        `_send()` cannot be used here: it needs the whole body up front, and
        this body never ends. Instead the upstream response is framed with
        `Connection: close` and relayed chunk by chunk, so the phone hears
        audio while it is still being recorded.

        The Pi's own headers ride through unchanged, `X-Stream-Ts` included
        (epoch ms of the first sample) — that is the anchor the client uses to
        place this audio on the same clock as thermal and CCTV. The Pi's
        honest 503 ("mic is not sending audio") and 400 (bad rate) are
        forwarded verbatim so the app can say "no audio" instead of playing
        silence.
        """
        rate = esp_stream_rate(query)
        if rate is None:
            self._json(400, {"error": "rate must be native or 16000"})
            return
        try:
            resp = pi_open(f"/esp/stream?rate={rate}",
                           timeout=self.ESP_STREAM_TIMEOUT,
                           accept="application/octet-stream")
        except urllib.error.HTTPError as e:
            body = e.read() if hasattr(e, "read") else b""
            self._send(e.code, body or b"mic stream unavailable", ctype="text/plain")
            return
        except PiUnreachable as e:
            self._json(502, {"error": f"mic stream unreachable: {e.reason}"})
            return
        except Exception as e:  # noqa: BLE001
            self._json(502, {"error": f"mic stream unavailable: {type(e).__name__}"})
            return
        try:
            self.send_response(200)
            self.send_header("Content-Type", "application/octet-stream")
            # Exactly the facts the client needs to schedule playback.
            for h in ("X-Audio-Format", "X-Audio-Rate", "X-Audio-Channels",
                      "X-Stream-Ts"):
                v = resp.headers.get(h)
                if v:
                    self.send_header(h, v)
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            # An endless body has no Content-Length; connection close is how
            # the client learns it ended (Pi idle-exit or ESP disconnect),
            # which the app treats as "reconnect", never as "still live".
            self.send_header("Connection", "close")
            self.end_headers()
            self.close_connection = True
            if self.command == "HEAD":  # belt and braces; do_HEAD refuses first
                return
            while True:
                chunk = resp.read(8192)
                if not chunk:
                    break
                self.wfile.write(chunk)
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass  # listener closed the tab / navigated away
        except OSError as e:
            # A stalled socket mid-stream: end this response the same way a
            # natural close does. The client reconnects; nothing is claimed.
            print(f"[pi/esp/stream] relay ended: {type(e).__name__}", flush=True)
        finally:
            try:
                resp.close()
            except OSError:
                pass

    def _cctv_frame(self) -> None:
        """One timestamped JPEG from the Pi (`/cctv?snapshot=1`).

        The Pi answers only once a COMPLETE frame is in hand (503 after ~5 s of
        camera silence) and stamps `X-Frame-Ts` — Pi-clock epoch ms when the
        frame finished arriving there. Forwarding that header is what lets the
        app put CCTV on the same presentation clock as thermal and audio: an
        un-stamped frame cannot be aligned, and an endless MJPEG stream cannot
        be buffered to `now − lag`, which is why the app polls this shape.

        Honest caveat, forwarded as-is: the camera exposes no capture
        timestamp, so the frame is AT LEAST as old as `X-Frame-Ts` says — the
        camera's own encode/delivery lag is not included.
        """
        try:
            # The Pi itself waits up to _CCTV_FIRST_FRAME_S (5 s) before
            # answering 503 "no frame from the camera". This budget must sit
            # above that, or the proxy times out first and reports a network
            # failure instead of the camera's real state.
            with pi_open("/cctv?snapshot=1", timeout=8, accept="image/jpeg") as resp:
                frame = resp.read()
                frame_ts = str(resp.headers.get("X-Frame-Ts", "") or "").strip()
        except urllib.error.HTTPError as e:
            body = e.read() if hasattr(e, "read") else b""
            self._send(e.code, body or b"cctv unavailable", ctype="text/plain")
            return
        except PiUnreachable as e:
            self._json(502, {"error": f"cctv unreachable: {e.reason}"})
            return
        except Exception as e:  # noqa: BLE001
            # A stalled socket: the console answered but never completed a
            # frame. Report it honestly instead of letting the handler die
            # with no response at all.
            self._json(502, {"error": f"cctv unavailable: {type(e).__name__}"})
            return
        if not frame.startswith(b"\xff\xd8") or not frame.endswith(b"\xff\xd9"):
            self._json(502, {"error": "no complete frame"})
            return
        self.send_response(200)
        self.send_header("Content-Type", "image/jpeg")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Access-Control-Allow-Origin", "*")
        if frame_ts.isdigit():
            self.send_header("X-Frame-Ts", frame_ts)
        self.send_header("Content-Length", str(len(frame)))
        self.end_headers()
        if self.command == "HEAD":
            return
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
                # Never drop a parameter silently. A dropped `filter` would widen
                # the row scope to every device; a dropped `fields` widens the
                # columns; a dropped `sort`/`page` changes the order the caller
                # asked for. Refuse instead of answering a different question.
                self._json(400, {"error": f"{key} too long"})
                return
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
