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
  GET /esp/stream    → raw PCM, read-until-close
                       ?rate=native (default) s16le/2ch/48k
                       ?rate=16000           s16le/1ch/16k (0.26 Mbit/s)
                       X-Stream-Ts = Pi epoch ms of the first sample
  GET /esp/record?seconds=N → record N s → WAV download

Ambient (SHT45 on the ESP32-S3) — observed over MQTT, never polled:
  GET /ambient       → JSON ambient state (temperature, humidity, age, state)

CCTV (Tapo camera), proxied to keep the browser on one (HTTPS) origin:
  GET /cctv          → multipart/x-mixed-replace MJPEG
  GET /cctv?snapshot=1 → one JPEG + X-Frame-Ts (Pi epoch ms, see handler)

Camera audio (Tapo), grabbed straight from the Pi:
  GET /camera-audio?seconds=N → WAV chunk from the camera's own mic (stream2)

Usage:
  python3 web_server.py
  python3 web_server.py --port 8080
"""

from __future__ import annotations

import argparse
import json
import os
import queue
import struct
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, urlparse

import ambient_ingest
import config
import esp_audio_ingest
import i2c_scanDiag
import pcm_downmix
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
# How long /cctv waits for the camera's FIRST frame before answering 503.
# Without a bound, the route returned 200 with an empty body whenever the
# camera was unpowered and every client hung until its own timeout.
_CCTV_FIRST_FRAME_S = 5.0

# Hard cap for /esp/record?seconds= (WAV is built in memory: 60 s ~= 11 MB)
ESP_RECORD_MAX_S = 60

# How long /esp/stream waits for the mic's first chunk before answering 503.
# Opening a stream that never carries audio would make the UI claim playback
# over silence; the mic pushes every ~40 ms, so 2 s is already generous.
ESP_STREAM_FIRST_CHUNK_S = 2.0

# Wall-clock grace added on top of the requested duration before
# /esp/record gives up. The idle counter inside the capture loop only catches
# a *silent* link; this catches a link that trickles chunks but never reaches
# the requested length. Both end on the same honest 503, and the endpoint
# therefore always answers within `seconds + ESP_RECORD_GRACE_S`.
ESP_RECORD_GRACE_S = 20

CAMERA_AUDIO_MAX_S = 8
CAMERA_AUDIO_MIN_S = 2
CAMERA_AUDIO_DEFAULT_S = 4

# Only one camera-audio capture may run at a time. The Tapo camera exposes a
# small, finite number of RTSP client slots; a second concurrent ffmpeg would
# evict the MJPEG feed (or the capture itself) instead of adding capacity.
_camera_audio_lock = threading.Lock()


def _last_jpeg(buf: bytes) -> bytes | None:
    """Newest complete JPEG in `buf` (SOI … EOI), or None if still partial.

    The camera writes whole frames, but a socket read can split one anywhere, so
    callers keep reading until this returns something.
    """
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
    return frame


def _patch_wav_sizes(wav: bytes) -> bytes:
    """Rewrite ffmpeg's placeholder RIFF/data size fields with real lengths.

    When ffmpeg writes WAV to a pipe it cannot know the payload size
    upfront, so it emits 0xFFFFFFFF in both the RIFF and the `data` size
    field. The stream still plays, but the header then misdescribes the
    payload. Walk the chunk list and patch both fields from the bytes we
    actually received. A malformed/short buffer is returned untouched.
    """
    if len(wav) < 12 or wav[:4] != b"RIFF" or wav[8:12] != b"WAVE":
        return wav
    out = bytearray(wav)
    pos = 12
    while pos + 8 <= len(out):
        cid = bytes(out[pos:pos + 4])
        size = struct.unpack("<I", out[pos + 4:pos + 8])[0]
        body = pos + 8
        if cid == b"data":
            payload = len(out) - body
            if payload < 0:
                return wav
            struct.pack_into("<I", out, pos + 4, payload)
            # All-or-nothing: only claim a corrected RIFF size once the
            # payload length is known and the data chunk has been patched.
            struct.pack_into("<I", out, 4, len(out) - 8)
            return bytes(out)
        if size == 0xFFFFFFFF:
            # Unknown-size chunk: cannot walk past it safely.
            break
        pos = body + size + (size & 1)
    # No data chunk found -> leave the buffer exactly as ffmpeg wrote it.
    return wav

# Tapo RTSP credentials — env-only, no committed defaults (fail closed).
# The Pi-side systemd drop-in 20-cctv-audio.conf loads /etc/pigpulse/cctv.env.
TAPO_RTSP_USER = os.environ.get("TAPO_RTSP_USER", "").strip()
TAPO_RTSP_PASS = os.environ.get("TAPO_RTSP_PASS", "").strip()
TAPO_RTSP_HOST = os.environ.get("TAPO_RTSP_HOST", "").strip()
TAPO_RTSP_PORT = os.environ.get("TAPO_RTSP_PORT", "554").strip()

_reader = MlxReader()
_comp = pigpulse_stats.AmbientCompensator()

# Radiometric correction chain (radiometry.ZoneFeverPipeline): drift
# compensation, per-pixel baseline and zone-level fever logic. It consumes the
# SAME driver-compensated 768-float frames — emissivity ownership stays with
# the driver (the pipeline enforces eps_here=1.0, so a double correction is
# impossible by construction). Kill switch: PIGPULSE_RADIOMETRY=0 restores the
# legacy scalar path below, byte-for-byte.
_radiometry = None
if os.environ.get("PIGPULSE_RADIOMETRY", "1") != "0":
    try:
        from radiometry import ZoneFeverPipeline
        _radiometry = ZoneFeverPipeline()
        print("[web] radiometry correction chain ENABLED "
              "(drift + baseline + zones; ambient from SHT45 when live)",
              flush=True)
    except Exception as e:  # noqa: BLE001 - must never take the sensor tier down
        print(f"[web] radiometry unavailable ({e}) — legacy compensation in use",
              flush=True)
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
        # Wall clock for THIS frame, taken at the same instant as t1. A monotonic
        # clock cannot be compared across machines; the app needs a shared epoch
        # to line this frame up with timestamped audio and CCTV.
        t1_wall = time.time()
        with _lock:
            _read_ms = int((t1 - t0) * 1000)
            if ok:
                # --- Ambient source: SHT45 (ambient_ingest) over internal Ta ---
                # The driver's internal Ta (amb[0]) tracks the sensor die, not
                # the air: measured 2026-11-04 at 43.6 C while the SHT45 beside
                # the rig read 31.1 C — a ~12 C self-heat gap. Feeding that Ta
                # into the ambient compensation over-pulled every reading by
                # (43.6 - 31.1) * SOLAR_COMP_FACTOR ~= 1.25 C. state == "live"
                # means the SHT value is <= LIVE_S (15 s) old; anything else
                # falls back to the internal Ta, and the payload says which
                # source was used.
                amb_src = ambient_ingest.get().snapshot()
                sht_c = (amb_src.get("temperature")
                         if amb_src.get("state") == "live" else None)
                ambient_c = sht_c if sht_c is not None else amb[0]

                st = pigpulse_stats.frame_stats(img)
                if _radiometry is not None:
                    # Correction chain: drift compensation (clamped, reference
                    # region), per-pixel rolling baseline, zone classification.
                    res = _radiometry.update(img, t1, ambient_c)
                    bias = float(res.get("driftBiasC", 0.0))
                    corrected = [x - bias for x in img]
                    # Legacy dashboard/publisher keys, recomputed on the
                    # drift-corrected frame so the heatmap, hotspot marker and
                    # alert message positions all stay consistent.
                    st.update(pigpulse_stats.frame_stats(corrected))
                    # Pipeline verdicts replace the legacy scalar ones; the
                    # alert flags keep the same 0x01/0x02 semantics.
                    for k in ("center", "hotspot", "max", "min", "ambient",
                              "status", "alerts", "verdict"):
                        st[k] = res[k]
                    st["center_compensated"] = st["center"]
                    st["pixels"] = [round(x, 2) for x in corrected]
                    st["ambientSrc"] = ("sht45" if sht_c is not None
                                        else "mlx-internal")
                    st["radiometry"] = {
                        "zoneCount": res.get("zoneCount"),
                        "baselineReady": res.get("baselineReady"),
                        "baselineFrames": res.get("baselineFrames"),
                        "herdRefC": res.get("herdRefC"),
                        "animalCount": res.get("animalCount"),
                        "driftBiasC": res.get("driftBiasC"),
                        "driftMode": res.get("driftMode"),
                        "refMedianC": res.get("refMedianC"),
                        "driftAbsorbedC": res.get("driftAbsorbedC"),
                        "reflectedTempC": res.get("reflectedTempC"),
                        "roiPeakC": res.get("roiPeakC"),
                    }
                else:
                    # Legacy path (PIGPULSE_RADIOMETRY=0 or import failure):
                    # exactly as before this change.
                    center_c = _comp.apply(st["center"], amb[0])
                    st["center"] = center_c
                    st["ambient"] = amb[0]
                    st["center_compensated"] = center_c
                    st["verdict"] = pigpulse_stats.verdict_text(center_c)
                    st["alerts"] = pigpulse_stats.evaluate_alerts(center_c)
                    st["pixels"] = [round(x, 2) for x in img]
                    st["ambientSrc"] = "mlx-internal"
                st["frame"] = _frame_seq + 1
                st["readMs"] = _read_ms
                # Pi-clock epoch ms of THIS frame's capture. The app needs it to
                # place thermal, CCTV and audio on one presentation clock: the
                # network adds seconds of variable delay per channel, so arrival
                # time alone cannot tell you which barn moment a panel shows.
                st["ts"] = int(round(t1_wall * 1000))
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
            self._stream_cctv(query)
            return
        if path == "/esp/record":
            self._record_esp(query)
            return
        if path == "/camera-audio":
            self._camera_audio(query)
            return
        if path == "/esp/status":
            body = json.dumps(esp_audio_ingest.get().status(),
                              separators=(",", ":")).encode()
            self._send(200, "application/json", body)
            return
        if path == "/ambient":
            body = json.dumps(ambient_ingest.get().snapshot(),
                              separators=(",", ":")).encode()
            self._send(200, "application/json", body)
            return
        if path == "/esp/stream":
            self._stream_esp(query)
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
            amb = ambient_ingest.get().snapshot()
            if amb["temperature"] is None and amb["humidity"] is None:
                amb_state = f"{amb['state']} (no SHT45 reading in telemetry)"
            else:
                amb_state = (
                    f"{amb['state']} temp={amb['temperature']}C "
                    f"hum={amb['humidity']}% age={amb['ambientAgeS']}s"
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
                f"Ambient (SHT45): {amb_state}",
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

    def _stream_cctv(self, query: dict) -> None:
        """Proxy the local MJPEG feed over THIS origin (HTTPS :8080).

        The MJPEG server listens on plain HTTP :8091 — pointing <img> straight
        at it would be blocked as mixed content. Piping it through here keeps
        the browser on one origin, and means CCTV comes up as soon as the
        camera does (the MJPEG server retries on its own).

        `?snapshot=1` answers with a single JPEG (plus `X-Frame-Ts`) instead of
        an endless stream. The deployed app polls that shape: an MJPEG stream
        cannot be buffered or aligned to a presentation clock, but a stamped
        snapshot can.
        """
        import socket as _socket

        snapshot = str(query.get("snapshot", ["0"])[0]).strip().lower() \
            not in ("", "0", "false", "no")
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
            # Wait for the FIRST frame before promising a stream. Without this,
            # a camera that is powered off still got "200 OK" with an empty
            # body: the <img> showed nothing and every client waited out its own
            # timeout instead of being told the truth.
            deadline = time.time() + _CCTV_FIRST_FRAME_S
            # The upstream socket carries a 60 s streaming timeout; while we are
            # waiting for the FIRST frame that must be the short deadline,
            # otherwise recv() blocks past it and the client sees nothing at all.
            up.settimeout(_CCTV_FIRST_FRAME_S)
            while time.time() < deadline:
                if snapshot:
                    # A snapshot must be COMPLETE, not merely started: half a
                    # JPEG renders as nothing and cannot be aligned.
                    if _last_jpeg(body) is not None:
                        break
                elif b"\xff\xd8" in body:
                    break
                try:
                    chunk = up.recv(65536)
                except _socket.timeout:
                    break
                if not chunk:
                    break
                body += chunk

            if snapshot:
                frame = _last_jpeg(body)
                if frame is None:
                    self._send(503, "text/plain",
                               b"no complete frame from the camera - it is not "
                               b"sending video")
                    return
                self._send(200, "image/jpeg", frame, extra={
                    # Pi-clock epoch ms at which this frame finished arriving at
                    # the Pi. The camera exposes no capture timestamp, so its own
                    # encode/delivery lag is NOT included: the picture is at
                    # least this old. Say so rather than implying exactness.
                    "X-Frame-Ts": str(int(time.time() * 1000)),
                })
                return

            if b"\xff\xd8" not in body:
                self._send(503, "text/plain",
                           b"no frame from the camera - it is not sending video")
                return
            up.settimeout(60)

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

    def _stream_esp(self, query: dict) -> None:
        """Raw ESP32-S3 mic over the browser, read-until-close.

        Source is TCP :9090 (esp_audio_ingest) — the firmware pushes S16LE
        stereo at 48 kHz. Two output shapes are offered:

          ?rate=native (default) → S16LE stereo 48 kHz, exactly what the ESP
              sent (the technician console's mic.js resamples in-browser).
          ?rate=16000            → S16LE mono 16 kHz, 32 KB/s rather than
              192 KB/s. The deployed app asks for this: the barn→cloud leg
              measures ~100 KB/s, so 48 kHz can never play in real time.

        `X-Stream-Ts` carries the Pi's epoch ms for the first sample emitted.
        A client maps sample N to capture time `ts + N/rate`, which is what puts
        the audio on the same clock as the timestamped thermal frame and CCTV
        snapshot instead of guessing from arrival times.
        """
        esp = esp_audio_ingest.get()
        rate_raw = (query.get("rate", ["native"])[0] or "native").strip().lower()
        if rate_raw in ("", "native"):
            out_rate = esp_audio_ingest.ESP_RATE
        else:
            try:
                out_rate = int(rate_raw)
            except (TypeError, ValueError):
                self._send(400, "text/plain",
                           b"rate must be an integer or 'native'")
                return
        if out_rate not in (esp_audio_ingest.ESP_RATE, 16000):
            self._send(400, "text/plain",
                       b"rate must be native (48000) or 16000")
            return
        downmix = out_rate != esp_audio_ingest.ESP_RATE
        mixer = (pcm_downmix.Downmixer(esp_audio_ingest.ESP_RATE, out_rate)
                 if downmix else None)
        channels = 1 if downmix else 2

        q = esp.subscribe()
        try:
            # Wait for the first chunk BEFORE promising a stream. Without this an
            # idle ESP got "200 OK" with a body that never carried audio, and the
            # UI claimed to be playing over silence.
            try:
                chunk = q.get(timeout=ESP_STREAM_FIRST_CHUNK_S)
            except queue.Empty:
                self._send(503, "text/plain",
                           b"ESP mic is not sending audio - nothing to stream")
                return

            self.send_response(200)
            self.send_header("Content-Type", "application/octet-stream")
            self.send_header("X-Audio-Format", f"s16le/{channels}ch/{out_rate}")
            self.send_header("X-Audio-Rate", str(out_rate))
            self.send_header("X-Audio-Channels", str(channels))
            # Same clock as /data `ts` and /cctv `X-Frame-Ts`. Back-date by the
            # first chunk's own duration: its earliest sample was captured that
            # long before this header is written (one 8 KiB chunk = 43 ms).
            lead_ms = (len(chunk) // 4) * 1000.0 / esp_audio_ingest.ESP_RATE
            self.send_header("X-Stream-Ts",
                             str(int(round((time.time() - lead_ms / 1000.0) * 1000))))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()

            idle = 0
            while True:
                if chunk is None:
                    try:
                        chunk = q.get(timeout=1.0)
                    except queue.Empty:
                        idle += 1
                        # End the stream after a short idle, unconditionally.
                        #
                        # Why unconditional: the stream frame carries no marker
                        # for a gap, so `X-Stream-Ts` would keep mapping sample N
                        # as ts + N/rate *through* the silence — a gap mid-stream
                        # silently drifts the client's clock by the gap length.
                        # Ending the stream makes every connection exactly one
                        # continuous audio run; each reconnect gets a fresh,
                        # exact `X-Stream-Ts` anchor. Waiting on
                        # `not connected` alone is not enough: a half-open ESP
                        # socket can stay "connected" forever while no bytes move.
                        #
                        # Why 5 s: a healthy ESP delivers 8 KiB parcels every
                        # ~21 ms with max 131 ms between parcels (measured, 145 s
                        # window), so 5 s of silence is a disconnect, not jitter.
                        # The client shows "reconnecting" instead of pretending
                        # the stream is alive.
                        if idle >= 5:
                            break
                        continue
                idle = 0
                pcm = esp_audio_ingest.to_pcm(chunk)
                chunk = None
                if pcm and mixer is not None:
                    pcm = mixer.process(pcm, channels=2)
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
        # Wall-clock cap: the link may deliver chunks slowly forever, so the
        # idle counter alone is not a bound. This one is.
        deadline = time.monotonic() + seconds + ESP_RECORD_GRACE_S
        try:
            idle = 0
            while len(buf) < want:
                if time.monotonic() >= deadline:
                    break
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
        # Trim to whole frames so the header's data size ALWAYS equals the
        # bytes we send (s16le stereo = 4 bytes/frame). A partial trailing
        # frame would otherwise be described but not delivered.
        payload = bytes(buf[:nframes * 4])
        hdr = b"RIFF" + struct.pack("<I", 36 + nframes * 4) + b"WAVEfmt "
        hdr += struct.pack("<IHHIIHH", 16, 1, 2, rate, rate * 4, 4, 16)
        hdr += b"data" + struct.pack("<I", nframes * 4)
        # Name the file after what was ACTUALLY captured, not what was asked
        # for: a short/truncated capture must not claim the full duration.
        actual_s = nframes / float(rate)
        name = f"esp-{time.strftime('%Y%m%d-%H%M%S')}-{actual_s:.1f}s.wav"
        self._send(200, "audio/wav", bytes(hdr) + payload,
                   {"Content-Disposition": f'attachment; filename="{name}"'})

    def _camera_audio(self, query: dict) -> None:
        """Grab N seconds of the Tapo camera's own audio track (WAV).

        Runs ffmpeg on the Pi against the camera's RTSP stream2 (SD profile),
        which carries the camera mic on A-law. Captured directly on the Pi so it
        works even when the laptop is off or on a different network.
        """
        if not (TAPO_RTSP_USER and TAPO_RTSP_PASS and TAPO_RTSP_HOST):
            self._send(503, "text/plain",
                       b"camera RTSP credentials are not configured")
            return
        try:
            seconds = int(query.get("seconds", [str(CAMERA_AUDIO_DEFAULT_S)])[0])
        except (ValueError, IndexError, TypeError):
            seconds = CAMERA_AUDIO_DEFAULT_S
        seconds = max(CAMERA_AUDIO_MIN_S, min(seconds, CAMERA_AUDIO_MAX_S))
        # Percent-encode the credentials: a password containing '@', '/' or ':'
        # would otherwise be parsed as part of the host and break the RTSP URL.
        user = quote(TAPO_RTSP_USER, safe="")
        password = quote(TAPO_RTSP_PASS, safe="")
        url = (f"rtsp://{user}:{password}@"
               f"{TAPO_RTSP_HOST}:{TAPO_RTSP_PORT}/stream2")
        cmd = [
            "ffmpeg", "-nostdin", "-loglevel", "error",
            "-rtsp_transport", "tcp",
            "-i", url,
            "-vn", "-t", str(seconds), "-ac", "1", "-ar", "16000",
            "-f", "wav", "pipe:1",
        ]
        # One capture at a time (see _camera_audio_lock).
        if not _camera_audio_lock.acquire(blocking=False):
            self._send(503, "text/plain",
                       b"camera audio busy - another capture in progress")
            return
        try:
            proc = subprocess.run(cmd, capture_output=True,
                                  timeout=seconds + 15, check=False)
        except subprocess.TimeoutExpired:
            self._send(502, "text/plain", b"camera audio capture timed out")
            return
        except Exception as e:  # noqa: BLE001
            self._send(502, "text/plain",
                       f"camera audio failed: {type(e).__name__}".encode())
            return
        finally:
            _camera_audio_lock.release()
        if proc.returncode != 0 or len(proc.stdout) < 44:
            self._send(503, "text/plain", b"camera audio unavailable")
            return
        self._send(200, "audio/wav", _patch_wav_sizes(proc.stdout))


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
        # Ambient SHT45 (on the ESP32-S3) — subscribe over MQTT, never poll:
        # TCP :9090 is single-client, so asking the ESP would evict the mic.
        print("[web] starting ambient MQTT watcher (pig/+/telemetry)...")
        ambient_ingest.ensure_started()
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
