#!/usr/bin/env python3
"""
PigPulse MLX90640 web dashboard — Raspberry Pi 4B.

Endpoints (contract matches downloads/esp32-mlx90640-thermal-camera/thermal_image.ino):
  GET /        → static/index.html
  GET /data    → JSON frame + stats
  GET /csv     → 24×32 CSV download
  GET /health  → plain-text status (incl. i2c scan addrs)

ESP32-S3 barn mic (s3-mic-01) — the only audio source:
  GET /esp/status    → JSON ingest state (connected, nonzero%, signal)
  GET /esp/stream    → raw PCM S16LE stereo, read-until-close
  GET /esp/record?seconds=N → record N s → WAV download

CCTV (Tapo camera), proxied to keep the browser on one (HTTPS) origin:
  GET /cctv          → multipart/x-mixed-replace MJPEG

Usage:
  python3 web_server.py
  python3 web_server.py --port 8080
"""

from __future__ import annotations

import argparse
import json
import queue
import struct
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import config
import esp_audio_ingest
import i2c_scanDiag
import pigpulse_stats
import thermal_publish
from mlx_reader import MlxReader, averaged_reading

ROOT = Path(__file__).resolve().parent
STATIC = ROOT / config.STATIC_DIR
# Technician console pages. Kept out of STATIC/ because /static/ serves a
# flat one-segment allowlist, and the console is a multi-page tree.
ADMIN_STATIC = STATIC / "admin"

_CTYPE = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
    ".wav": "audio/wav",
}

# Local MJPEG feed (tapo_mjpeg_server.py). Proxied rather than embedded
# directly because this page is HTTPS and :8091 is plain HTTP.
_CCTV_HOST = "127.0.0.1"
_CCTV_PORT = 8091

# Hard cap for /esp/record?seconds= (WAV is built in memory: 60 s ~= 11 MB)
ESP_RECORD_MAX_S = 60

_reader = MlxReader()
_comp = pigpulse_stats.AmbientCompensator()
_lock = threading.Lock()
_frame_seq = 0
_last_ok = False
_read_ms = 0
_fps_ema = 0.0
_last_t = 0.0
_last_error = "starting"

# The technician console is an OPTIONAL, additive module. These two
# module-level names are the contract between main() (which decides whether
# the console could be imported) and Handler._admin() (which serves /admin).
# They MUST live at module scope: a Handler can run before, during or after
# main()'s import attempt, and a function-local would be invisible to it.
admin_console = None
_console_error: str | None = None
_cached: dict | None = None
_publisher = thermal_publish.ThermalPublisher()

# The I2C bus scan walks 112 addresses with an ioctl+write each. On a healthy
# bus that is milliseconds, but if a device holds SDA low every probe can burn a
# clock period -> ~1 s per /health hit, on a handler thread. The address map
# only changes when hardware is replugged, so cache it.
_i2c_cache: tuple[float, str] | None = None
I2C_SCAN_TTL_S = 30.0


def i2c_addrs_cached() -> str:
    global _i2c_cache
    now = time.monotonic()
    if _i2c_cache and now - _i2c_cache[0] < I2C_SCAN_TTL_S:
        return _i2c_cache[1]
    try:
        addrs = i2c_scanDiag.scan_bus(config.I2C_BUS)
        text = " ".join(f"0x{a:02X}" for a in addrs) or "(none)"
    except Exception as e:  # missing bus, permissions, bus wedged
        text = f"scan error: {e}"
    _i2c_cache = (now, text)
    return text


I2C_PROBE_BUSES = ("/dev/i2c-1", "/dev/i2c-0")
_i2c_probe_cache = None


def i2c_probe_all_cached() -> str:
    """Scan every I2C bus, not just the configured one.

    A sensor wired to i2c-0 (GPIO0/1, header pins 27/28) instead of i2c-1
    (GPIO2/3, pins 3/5) produces a permanent Errno 121 on the configured bus
    while a single-bus scan reports "(none)" and never reveals where the device
    actually is. This answers that in one hit.
    """
    global _i2c_probe_cache
    now = time.monotonic()
    if _i2c_probe_cache and now - _i2c_probe_cache[0] < I2C_SCAN_TTL_S:
        return _i2c_probe_cache[1]
    parts = []
    for bus in I2C_PROBE_BUSES:
        try:
            addrs = i2c_scanDiag.scan_bus(bus)
            parts.append(f"{bus}=" + (" ".join(f"0x{a:02X}" for a in addrs) or "-"))
        except Exception as e:  # absent bus, no permission, wedged
            parts.append(f"{bus}=({type(e).__name__})")
    text = " ".join(parts)
    _i2c_probe_cache = (now, text)
    return text


_log_state: dict = {}


def _log(level: str, msg: str, every_s: float = 60.0) -> None:
    """Rate-limited logging so a persistent fault cannot flood the journal.

    First occurrence always logs. After that, an identical message logs at most
    once per `every_s`, with a repeat count. This is the difference between
    "the thermal feed died and I cannot tell why" and a usable journal.
    """
    now = time.monotonic()
    key = msg[:160]
    prev = _log_state.get(key)
    if prev is None:
        _log_state[key] = [now, 1]
        print(f"[web] {msg}", flush=True)
        return
    prev[1] += 1
    if now - prev[0] < every_s:
        return
    n = prev[1]
    prev[0] = now
    prev[1] = 1
    print(f"[web] {msg} (repeated {n}x)", flush=True)


def _loop() -> None:
    global _frame_seq, _last_ok, _read_ms, _fps_ema, _last_t, _last_error, _cached
    # Boot: try init, retry every 10s like the ESP loop.
    #
    # 2026-09-30: this loop used to fail in COMPLETE SILENCE. A dead sensor left
    # systemd reporting "active", the dashboard showed a bare "Sensor not ready",
    # and the reason existed only inside a global — so a regression that stopped
    # the thermal feed entirely left no evidence anywhere. Log it, rate-limited so
    # a permanently dead sensor cannot flood the journal.
    _log("warn", "thermal: initialising MLX90640 ...")
    while not _reader.init():
        with _lock:
            _last_error = _reader.last_error or "init retrying"
            _last_ok = False
        _log("error",
             f"thermal: MLX90640 init failed: {_last_error} "
             f"(retrying every 10s; check 3V3/GND, SDA=pin3, SCL=pin5, "
             f"4.7k pull-ups, expected ACK at 0x33)")
        time.sleep(10)

    live_every = 0.5  # ESP live sample cadence
    _first_frame_logged = False
    while True:
        t0 = time.monotonic()
        img: list[float] = []
        amb: list[float] = []
        ok = _reader.read_frame(img, amb)
        t1 = time.monotonic()
        with _lock:
            _read_ms = int((t1 - t0) * 1000)
            if ok:
                st = pigpulse_stats.frame_stats(img)
                # use shared compensator
                center_c = _comp.apply(st["center"], amb[0])
                st["center"] = center_c
                st["ambient"] = amb[0]
                st["center_compensated"] = center_c
                st["verdict"] = pigpulse_stats.verdict_text(center_c)
                st["alerts"] = pigpulse_stats.evaluate_alerts(center_c)
                st["pixels"] = [round(x, 2) for x in img]
                st["frame"] = _frame_seq + 1
                st["readMs"] = _read_ms
                dt = t1 - _last_t if _last_t else 0
                inst = (1.0 / dt) if dt > 0 else 0.0
                _fps_ema = inst if _fps_ema <= 0.01 else 0.75 * _fps_ema + 0.25 * inst
                st["fps"] = round(_fps_ema, 2)
                st["ok"] = True
                _cached = st
                _frame_seq += 1
                _last_ok = True
                # 2026-09-30: log the transition back to life once, so a
                # recovered sensor is visible in the journal rather than just
                # silently becoming normal again.
                if not _first_frame_logged:
                    _first_frame_logged = True
                    print(f"[web] thermal: first frame OK "
                          f"(center={st.get('center', 0):.2f} C, "
                          f"ambient={st.get('ambient', 0):.2f} C) — feed live",
                          flush=True)
                _last_error = "OK"
                _last_t = t1
                # Publish to MQTT so the thermal data joins the normal
                # pipeline. Rate-limited inside the publisher, and it never
                # raises into this loop — a broker outage must not stop the
                # dashboard from drawing.
                try:
                    _publisher.publish_frame(st, _frame_seq)
                except Exception as e:  # noqa: BLE001
                    print(f"[web] thermal publish error: {e}", flush=True)
            else:
                _last_ok = False
                _last_error = _reader.last_error
                # 2026-09-30: this branch was silent. A sensor that initialised
                # and then stopped answering produced no log at all, which is
                # indistinguishable from "working" in journalctl.
                _log("error",
                     f"thermal: frame read failed: {_last_error or 'unknown'} "
                     f"(is the I2C cable still seated?)")
                if not _reader.ready:
                    _log("warn", "thermal: reader not ready, re-initialising")
                    _reader.init()
        time.sleep(max(0.0, live_every - (time.monotonic() - t0)))


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format: str, *args) -> None:
        pass  # quiet

    def _send(self, code: int, ctype: str, body: bytes,
              extra: dict[str, str] | None = None) -> None:
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        if extra:
            for k, v in extra.items():
                self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        url = urlparse(self.path)
        path = url.path
        query = parse_qs(url.query)
        if path in ("/", "/index.html"):
            index = STATIC / "index.html"
            if index.is_file():
                self._send(200, "text/html; charset=utf-8", index.read_bytes())
            else:
                self._send(500, "text/plain", b"missing static/index.html")
            return
        if path == "/data":
            with _lock:
                if not _last_ok or _cached is None:
                    payload = {"ok": False, "error": _last_error}
                else:
                    payload = dict(_cached)
                    payload["ok"] = True
            body = json.dumps(payload, separators=(",", ":")).encode()
            self._send(200, "application/json", body)
            return
        if path == "/cctv":
            self._stream_cctv()
            return
        if path == "/esp/record":
            self._record_esp(query)
            return
        if path == "/esp/status":
            body = json.dumps(esp_audio_ingest.get().status(),
                              separators=(",", ":")).encode()
            self._send(200, "application/json", body)
            return
        if path == "/esp/stream":
            self._stream_esp()
            return
        if path == "/csv":
            with _lock:
                pixels = _cached.get("pixels") if _cached else None
            if not pixels:
                self._send(503, "text/plain", b"no frame")
                return
            rows = []
            for r in range(24):
                row = pixels[r * 32:(r + 1) * 32]
                rows.append(",".join(f"{p:.2f}" for p in row))
            body = ("\n".join(rows) + "\n").encode()
            self._send(
                200, "text/csv", body,
                {"Content-Disposition": "attachment; filename=mlx90640_frame.csv"},
            )
            return
        if path == "/health":
            addr_s = i2c_addrs_cached().replace("\n", " ")
            # Network provenance (client vs AP) — read-only, no nmcli needed
            net_mode = getattr(config, "NETWORK_MODE", "ap")
            local_ips: list[str] = []
            try:
                import subprocess
                out = subprocess.check_output(
                    ["hostname", "-I"], text=True, timeout=1
                )
                seen = {t for t in out.split() if t.count(".") == 3}
                non_loop = sorted(ip for ip in seen if not ip.startswith("127."))
                local_ips = non_loop or sorted(seen)
            except Exception:
                pass
            # Read the port the socket ACTUALLY bound, not config.WEB_PORT —
            # --port can override it, and a wrong URL in /health sends the
            # operator to a dead address.
            _sa = self.server.server_address
            port = int(_sa[1]) if isinstance(_sa, tuple) else config.WEB_PORT
            if net_mode == "ap":
                url_hint = f"https://{getattr(config, 'AP_IP', '192.168.69.1')}:{port}/"
            elif local_ips:
                url_hint = f"https://{local_ips[0]}:{port}/"
            else:
                url_hint = f"https://<this-host-ip>:{port}/"
            esp = esp_audio_ingest.get().status()
            esp_state = (
                f"connected peer={esp['peer']} rate={esp['rate']}Hz "
                f"nonzero={esp['nonzeroPct']}%"
                if esp["connected"] else
                f"NOT connected (bindError={esp['bindError']})"
            )
            lines = [
                "PigPulse Raspberry Pi 4B MLX90640 Thermal",
                f"Sensor ready: {'yes' if _reader.is_ready() else 'no'}",
                f"Frame valid: {'yes' if _last_ok else 'no'}",
                f"Frame count: {_reader.frames()}",
                f"Measured FPS: {_fps_ema:.2f}",
                f"Read duration ms: {_read_ms}",
                f"I2C bus: {config.I2C_BUS}",
                f"I2C clock Hz (kernel config): {config.I2C_CLOCK_HZ}",
                f"Refresh setting: {config.REFRESH_HZ} Hz",
                f"Address: 0x{config.MLX90640_ADDR:02X}",
                f"Emissivity: {config.EMISSIVITY}",
                f"Frame age s: {_reader.frame_age_s():.1f}",
                f"I2C addrs (configured bus): {addr_s}",
                f"I2C all buses: {i2c_probe_all_cached()}",
                f"Network mode: {net_mode}",
                f"Local IPv4: {', '.join(local_ips) or 'unknown'}",
                f"Dashboard URL: {url_hint}",
                f"ESP32-S3 mic: {esp_state}",
                f"Thermal MQTT: {_publisher.status()}",
                "",
                f"Last error: {_last_error}",
            ]
            self._send(200, "text/plain; charset=utf-8", ("\n".join(lines) + "\n").encode())
            return
        if path in ("/audio", "/audio/status", "/audio/stream", "/audio/record",
                    "/audio/recordings", "/audio/file"):
            # Explicit tombstones rather than a bare 404: the phone and the
            # dashboard used to link here, and a 410 explains itself in the
            # browser instead of looking like a typo in the URL.
            self._send(410, "text/plain",
                       b"Gone: the Pi GPIO mic (INMP441 on the 40-pin header) "
                       b"was removed 2026-09-29. It needed a Google Voice HAT "
                       b"codec that this board does not have.\n"
                       b"Audio now comes from the ESP32-S3 barn mic: "
                       b"/esp/stream  /esp/status  /esp/record\n")
            return
        # --- Technician console (admin_console.py) -------------------------
        # Additive and unreachable from every branch above: "/admin" and
        # "/admin/..." match none of them, so no existing route can be
        # shadowed. Imported lazily so the Pi pays the import cost only when
        # an operator actually opens the console.
        if path == "/admin" or path.startswith("/admin/"):
            self._admin(path, query)
            return
        if path.startswith("/static/"):
            self._serve_static(path[len("/static/"):])
            return
        self._send(404, "text/plain", b"Not found")

    def _admin(self, path: str, query: dict) -> None:
        # 2026-09-30: this import was OUTSIDE the try block below, so a
        # missing admin_console.py raised straight out of do_GET and killed
        # the connection with a traceback. Now it degrades to a 503 that
        # names the actual cause, so "no console" can never be mistaken for
        # "no sensor data" and the thermal tier keeps serving.
        if admin_console is None:
            self._send(
                503,
                "text/plain; charset=utf-8",
                (
                    "The technician console is not available on this device.\n\n"
                    f"Reason: {_console_error or 'admin_console unavailable'}\n\n"
                    "This does NOT affect sensor data. /data, /health, the\n"
                    "ESP :9090 ingest and MQTT publishing are all still live.\n"
                    "To restore /admin, deploy admin_console.py next to\n"
                    "web_server.py in /home/pigpulse/thermal-pi/ and restart\n"
                    "pigpulse-thermal.service.\n"
                ).encode(),
            )
            return

        c = admin_console.ctx()
        if path.startswith("/admin/api/"):
            try:
                _sa = self.server.server_address
                port = int(_sa[1]) if isinstance(_sa, tuple) else config.WEB_PORT
                code, body = admin_console.api(c, path, query, port)
            except Exception as e:  # noqa: BLE001
                body = json.dumps({"error": str(e)}).encode()
                code = 500
            self._send(code, "application/json", body)
            return

        # /admin/  ->  Overview; everything else is a page shell from static/admin/
        rel = "index.html" if path in ("/admin", "/admin/") else path[len("/admin/"):]
        if not rel or ".." in rel or rel.startswith("/") or "\\" in rel:
            self._send(404, "text/plain", b"Not found")
            return
        f = ADMIN_STATIC / rel
        if not f.is_file():
            self._send(404, "text/plain", b"Not found")
            return
        self._send(200, _CTYPE.get(f.suffix.lower(), "text/html; charset=utf-8"),
                   f.read_bytes())

    def _serve_static(self, rel: str) -> None:
        """Flat whitelist: one path segment under static/ (no traversal)."""
        if not rel or "/" in rel or "\\" in rel or rel.startswith("."):
            self._send(404, "text/plain", b"Not found")
            return
        f = STATIC / rel
        if not f.is_file():
            self._send(404, "text/plain", b"Not found")
            return
        self._send(200, _CTYPE.get(f.suffix.lower(), "application/octet-stream"),
                   f.read_bytes())

    def _stream_cctv(self) -> None:
        """Proxy the local MJPEG feed over THIS origin (HTTPS :8080).

        The MJPEG server listens on plain HTTP :8091 — pointing <img> straight
        at it would be blocked as mixed content. Piping it through here keeps
        the browser on one origin, and means CCTV comes up as soon as the
        camera does (the MJPEG server retries on its own).
        """
        import socket as _socket

        try:
            up = _socket.create_connection((_CCTV_HOST, _CCTV_PORT), timeout=4)
            up.settimeout(60)
        except OSError as e:
            self._send(503, "text/plain",
                       f"CCTV unavailable ({e})".encode())
            return
        try:
            up.sendall(
                b"GET / HTTP/1.0\r\nHost: localhost\r\nConnection: close\r\n\r\n"
            )
            hdr = b""
            while b"\r\n\r\n" not in hdr:
                chunk = up.recv(4096)
                if not chunk:
                    raise OSError("camera closed before sending a header")
                hdr += chunk
                if len(hdr) > 8192:
                    raise OSError("camera header too large")
            status_line = hdr.split(b"\r\n", 1)[0]
            if b"200" not in status_line:
                raise OSError(status_line.decode(errors="replace"))
            ctype = "multipart/x-mixed-replace; boundary=frame"
            for line in hdr.split(b"\r\n")[1:]:
                if line.lower().startswith(b"content-type:"):
                    ctype = line.split(b":", 1)[1].strip().decode(errors="replace")
            body = hdr.split(b"\r\n\r\n", 1)[1]

            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Cache-Control",
                             "no-store, no-cache, must-revalidate, max-age=0")
            self.send_header("Pragma", "no-cache")
            self.end_headers()
            if body:
                self.wfile.write(body)
            while True:
                chunk = up.recv(65536)
                if not chunk:
                    break
                self.wfile.write(chunk)
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass  # browser navigated away
        except OSError as e:
            if self.wfile.closed:
                pass
            else:
                # Header already sent? nothing useful left to say.
                print(f"[cctv] stream ended: {e}", flush=True)
        finally:
            try:
                up.close()
            except OSError:
                pass

    def _stream_esp(self) -> None:
        """Raw ESP32-S3 mic over the browser: S16LE stereo 16 kHz, read-until-close.

        Source is TCP :9090 (esp_audio_ingest) — the firmware pushes S16LE
        stereo (48 kHz, L/R duplicated on the ESP); we normalize per chunk and
        let mic.js resample to the AudioContext.
        """
        esp = esp_audio_ingest.get()
        q = esp.subscribe()
        try:
            self.send_response(200)
            self.send_header("Content-Type", "application/octet-stream")
            self.send_header("X-Audio-Format",
                             f"s16le/2ch/{esp_audio_ingest.ESP_RATE}")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            idle = 0
            while True:
                try:
                    chunk = q.get(timeout=1.0)
                except queue.Empty:
                    idle += 1
                    # ESP reconnects every 3 s; tolerate a long gap, then end
                    # the stream so the browser button resets instead of lying.
                    if idle >= 20 and not esp.status()["connected"]:
                        break
                    continue
                idle = 0
                pcm = esp_audio_ingest.to_pcm(chunk)
                if pcm:
                    self.wfile.write(pcm)
                    self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass  # browser navigated away
        finally:
            esp.unsubscribe(q)

    def _record_esp(self, query: dict) -> None:
        """Record N seconds of ESP audio to an in-memory WAV download.

        Same primitives as _stream_esp (subscribe -> to_pcm), so the file is
        byte-identical to what the browser hears. This is the ESP barn mic's
        counterpart to /audio/record, which only covers the Pi GPIO mic.
        """
        try:
            seconds = int(query.get("seconds", ["10"])[0])
        except (ValueError, IndexError, TypeError):
            self._send(400, "text/plain", b"seconds must be an integer")
            return
        seconds = max(1, min(seconds, ESP_RECORD_MAX_S))

        esp = esp_audio_ingest.get()
        if not esp.status()["connected"]:
            self._send(503, "text/plain",
                       b"ESP mic not connected - nothing to record")
            return

        rate = esp_audio_ingest.ESP_RATE
        want = seconds * rate * 4          # s16le stereo = 4 bytes per frame
        buf = bytearray()
        q = esp.subscribe()
        try:
            idle = 0
            while len(buf) < want:
                try:
                    chunk = q.get(timeout=1.0)
                except queue.Empty:
                    idle += 1
                    if idle >= 25:           # this link delivers chunks slowly
                        break
                    continue
                idle = 0
                pcm = esp_audio_ingest.to_pcm(chunk)
                if pcm:
                    buf += pcm
        finally:
            esp.unsubscribe(q)

        if len(buf) < rate * 4:             # less than 1 frame: nothing usable
            self._send(503, "text/plain", b"no audio captured")
            return

        nframes = len(buf) // 4
        hdr = b"RIFF" + struct.pack("<I", 36 + nframes * 4) + b"WAVEfmt "
        hdr += struct.pack("<IHHIIHH", 16, 1, 2, rate, rate * 4, 4, 16)
        hdr += b"data" + struct.pack("<I", nframes * 4)
        name = f"esp-{time.strftime('%Y%m%d-%H%M%S')}-{seconds}s.wav"
        self._send(200, "audio/wav", bytes(hdr) + bytes(buf),
                   {"Content-Disposition": f'attachment; filename="{name}"'})


def main() -> None:
    global _cached, admin_console, _console_error
    ap = argparse.ArgumentParser(description="PigPulse MLX90640 web (Pi 4B)")
    ap.add_argument("--host", default=config.WEB_HOST)
    ap.add_argument("--port", type=int, default=config.WEB_PORT)
    ap.add_argument(
        "--once",
        action="store_true",
        help="run one averaged field sample (CLI smoke test) and exit",
    )
    ap.add_argument(
        "--dev-source",
        default="",
        metavar="SD_ROOT",
        help=(
            "serve the /admin console against a mounted Pi SD card (e.g. "
            "/media/solrahk/rootfs) instead of live hardware. Changes ONLY "
            "where data is read from -- the console code is identical to what "
            "runs on the Pi. Starts no I2C loop, no ESP listener on :9090 and "
            "no MQTT publisher."
        ),
    )
    ap.add_argument(
        "--dev-allow-any",
        action="store_true",
        help="permit a non-loopback bind in --dev-source mode (dev only)",
    )
    args = ap.parse_args()

    if args.once:
        if not _reader.init():
            print(f"INIT FAIL: {_reader.last_error}")
            raise SystemExit(1)
        reading = averaged_reading(_reader, _comp)
        print(json.dumps(reading, indent=2))
        return

    # The technician console is OPTIONAL. It must never be able to take down
    # the sensor tier.
    #
    # 2026-09-30: this was a bare `import admin_console`, unconditional. The
    # SD card carried a web_server.py that imported it but did NOT ship the
    # file, so the process died with ModuleNotFoundError at startup, hit
    # Restart=on-failure / RestartSec=5, and crash-looped forever -- taking
    # the MLX90640 loop, the ESP :9090 ingest and the MQTT publisher down
    # with it. The dashboard, the alarm path and the whole barn monitoring
    # product died because a read-only console module was absent.
    #
    # /admin now degrades to 503 instead. Missing console == no admin UI,
    # never "no sensor data".
    # Module-scope globals (declared at line ~77 and rebound here via the
    # `global` statement) -- do NOT re-annotate, Python forbids an annotated
    # global declaration.
    admin_console = None
    _console_error = None
    try:
        import admin_console as _admin_console_mod

        admin_console = _admin_console_mod
        ctx = admin_console.configure(args.dev_source)
    except ModuleNotFoundError as exc:
        _console_error = f"admin_console not importable: {exc}"
        print(f"[web] WARNING: {_console_error}", flush=True)
        print("[web] continuing WITHOUT /admin console -- sensors, ESP "
              "ingest and MQTT publishing are unaffected", flush=True)
        print("[web] fix by deploying admin_console.py alongside "
              "web_server.py to /home/pigpulse/thermal-pi/", flush=True)
    except Exception as exc:  # noqa: BLE001 - console must never be fatal
        _console_error = f"admin_console failed to configure: {exc}"
        print(f"[web] WARNING: {_console_error}", flush=True)

    dev_root: Path | None = getattr(
        getattr(admin_console, "ctx", lambda: None)(), "dev_source", None
    ) if admin_console is not None else None
    if dev_root is not None:
        print(f"[web] DEV-SNAPSHOT mode: console data source = {dev_root}")
        if not dev_root.is_dir():
            print(f"[web] --dev-source path does not exist: {dev_root}")
            raise SystemExit(2)
        if args.host not in ("127.0.0.1", "localhost", "::1") and not args.dev_allow_any:
            # A dev preview exposes a source browser, config and unit files.
            # Refuse to put that on a network by accident.
            print(f"[web] refusing to bind {args.host} in dev mode without "
                  f"--dev-allow-any", flush=True)
            raise SystemExit(2)
        print("[web] skipping I2C loop, ESP ingest (:9090) and MQTT publisher")
    else:
        print(f"[web] init reader...")
        # Kick background loop
        threading.Thread(target=_loop, daemon=True).start()
        # ESP32-S3 barn mic — the only audio source; firmware pushes PCM to TCP :9090
        print("[web] starting ESP mic ingest (tcp :9090)...")
        esp_audio_ingest.ensure_started()
        # Publish thermal readings over MQTT so the Pi is a pipeline node
        _publisher.start()
        # Brief wait for first frame so / isn't empty on first hit
        for _ in range(40):
            if _cached:
                break
            time.sleep(0.1)

    tls_cert = getattr(config, "TLS_CERT", "")
    tls_key = getattr(config, "TLS_KEY", "")
    if tls_cert and tls_key and Path(tls_cert).is_file():
        import ssl
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.minimum_version = ssl.TLSVersion.TLSv1_2
        ctx.load_cert_chain(tls_cert, tls_key)
        from tls_server import ThreadedTLSServer
        httpd = ThreadedTLSServer((args.host, args.port), Handler, ctx)
        print(f"[web] HTTPS on https://{args.host}:{args.port}/  (Ctrl+C to stop)")
    else:
        httpd = ThreadingHTTPServer((args.host, args.port), Handler)
        print(f"[web] http://{args.host}:{args.port}/  (TLS_CERT unset)")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[web] bye")


if __name__ == "__main__":
    main()
