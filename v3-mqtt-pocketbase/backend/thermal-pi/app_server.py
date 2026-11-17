#!/usr/bin/env python3
"""Serve the PigPulse web app from the Pi (the no-internet path) + proxy /api.

Why this exists
---------------
The Expo web build is a static SPA. On web the app calls same-origin `/api/*`
(see frontend/mobile_app/src/utils/pocketbase.ts — `Platform.OS === 'web'` →
base `''`). So serving the SPA alone is not enough: without a `/api` proxy the
app has no data. This server therefore does two jobs on ONE origin:

  1. serve the static export (index.html fallback for client-side routes), so
     the app loads with no internet and no app-store install;
  2. reverse-proxy `/api/*` to PocketBase, so the same-origin calls the SPA
     makes actually reach the database.

Bind is 0.0.0.0 so it is reachable on the Pi AP (192.168.69.1), the home LAN
(if the uplink is up) and tailscale — the farmer needs no internet at all.

Env:
  APP_ROOT   directory holding the web export   (default /home/pigpulse/thermal-pi/app)
  PB_URL     PocketBase base URL to proxy to     (default http://127.0.0.1:8090)
  APP_PORT   listen port                         (default 8082)
"""
from __future__ import annotations

import http.server
import os
import socketserver
import urllib.error
import urllib.request

ROOT = os.path.abspath(os.environ.get("APP_ROOT", "/home/pigpulse/thermal-pi/app"))
PB = os.environ.get("PB_URL", "http://127.0.0.1:8090").rstrip("/")
PORT = int(os.environ.get("APP_PORT", "8082"))

CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".map": "application/json; charset=utf-8",
    ".wasm": "application/wasm",
    # The offline installer: the farmer downloads the APK straight from the Pi.
    ".apk": "application/vnd.android.package-archive",
}


class Handler(http.server.BaseHTTPRequestHandler):
    server_version = "PigPulseApp/1.0"

    # --- helpers -----------------------------------------------------------
    def _send(self, code: int, body: bytes, ctype: str, extra=None):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _resolve(self, path: str) -> str | None:
        """Map a URL path to a file under ROOT, or None if it would escape."""
        rel = path.split("?", 1)[0].split("#", 1)[0].lstrip("/")
        full = os.path.abspath(os.path.join(ROOT, rel))
        if not (full == ROOT or full.startswith(ROOT + os.sep)):
            return None
        return full

    # --- /api proxy --------------------------------------------------------
    def _proxy_api(self):
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length) if length else None
        url = PB + self.path  # self.path starts with /api/
        req = urllib.request.Request(url, data=body, method=self.command)
        for h in ("Content-Type", "Authorization", "Accept"):
            if self.headers.get(h):
                req.add_header(h, h)
        try:
            with urllib.request.urlopen(req, timeout=20) as resp:
                data = resp.read()
                self._send(resp.status, data,
                           resp.headers.get("Content-Type", "application/json"))
        except urllib.error.HTTPError as e:
            self._send(e.code, e.read() or b"", "application/json")
        except Exception as e:  # PB down / unreachable
            self._send(502, ('{"error":"PocketBase unreachable: %s"}' % e).encode(),
                       "application/json")

    # --- static / SPA ------------------------------------------------------
    def _serve(self):
        path = self.path.split("?", 1)[0]
        full = self._resolve(path)
        if full and os.path.isfile(full):
            ctype = CONTENT_TYPES.get(os.path.splitext(full)[1].lower(),
                                      "application/octet-stream")
            with open(full, "rb") as f:
                self._send(200, f.read(), ctype)
            return
        # SPA fallback: any non-file route gets index.html
        index = os.path.join(ROOT, "index.html")
        if os.path.isfile(index):
            with open(index, "rb") as f:
                self._send(200, f.read(), "text/html; charset=utf-8")
        else:
            self._send(404, b"web export not found; run: expo export -p web",
                       "text/plain; charset=utf-8")

    # --- verbs -------------------------------------------------------------
    def do_GET(self):
        if self.path.startswith("/api/"):
            self._proxy_api()
        else:
            self._serve()

    def do_HEAD(self):
        self.do_GET()

    def do_POST(self):
        self._proxy_api()

    def do_PUT(self):
        self._proxy_api()

    def do_PATCH(self):
        self._proxy_api()

    def do_DELETE(self):
        self._proxy_api()

    def log_message(self, fmt, *args):  # quieter journal
        # self.path is only set once parse_request() succeeds. A malformed
        # request line makes parse_request() call send_error() -> log_error()
        # -> log_message() BEFORE any path exists, so self.path raised
        # AttributeError and the request died with a traceback in the journal
        # (seen 2026-11-16 01:03, from a client on 10.42.0.1).
        if not getattr(self, "path", "").startswith("/api/"):
            return
        print("APP [%s] %s" % (self.log_date_time_string(), fmt % args), flush=True)


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def main():
    os.makedirs(ROOT, exist_ok=True)
    httpd = Server(("0.0.0.0", PORT), Handler)
    print(f"APP server on 0.0.0.0:{PORT} root={ROOT} pb={PB}", flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()