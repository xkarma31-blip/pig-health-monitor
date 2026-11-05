"""Fault-injection tests for rig_diag.py — judgement without hardware.

The diagnostic's value is its *verdict*, so these tests stand up a simulated
rig (console + PocketBase + proxy + bridge) with one fault at a time and assert
that it names the right hop. Every threshold in rig_diag.py was measured on the
real rig on 2026-11-04/05; here the same thresholds are exercised against
synthetic payloads shaped exactly like the real ones.

This is "simulation close to reality", and it is explicitly NOT hardware-green:
passing here proves the reasoning, not that a camera or mic works. (The rig's
own PIGPULSE_AUDIO_MOCK=1 mode has the same caveat: mock-green ≠ hardware-green.)
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.dirname(os.path.dirname(HERE))  # …/v3-mqtt-pocketbase/backend
SCRIPTS = os.path.join(BACKEND, "scripts")
sys.path.insert(0, SCRIPTS)

import rig_diag  # noqa: E402

JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 64 + b"\xff\xd9"
WAV = (
    b"RIFF" + (36 + 64).to_bytes(4, "little") + b"WAVE"
    + b"fmt " + (16).to_bytes(4, "little")
    + (1).to_bytes(2, "little") + (2).to_bytes(2, "little")
    + (48000).to_bytes(4, "little") + (192000).to_bytes(4, "little")
    + (4).to_bytes(2, "little") + (16).to_bytes(2, "little")
    + b"data" + (64).to_bytes(4, "little") + (1000).to_bytes(2, "little") * 16
)


class _Quiet(BaseHTTPRequestHandler):
    def log_message(self, *a):  # noqa: D401 - silence the test servers
        return


def _serve(handler_cls) -> tuple[ThreadingHTTPServer, str]:
    srv = ThreadingHTTPServer(("127.0.0.1", 0), handler_cls)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, f"http://127.0.0.1:{srv.server_address[1]}"


class FakePi:
    """A simulated Pi console. Every mode mirrors a real failure seen in the field."""

    mode = "ok"
    fps = 2.0
    frame = 40000
    started = time.time()

    @classmethod
    def health(cls) -> str:
        if cls.mode == "console_down":
            return ""
        frame = cls.frame + int((time.time() - cls.started) * cls.fps)
        valid = "no" if cls.mode == "sensor_dead" else "yes"
        fps = cls.fps if cls.mode != "slow_frames" else 0.1
        return (
            "PigPulse Raspberry Pi 4B MLX90640 Thermal\n"
            f"Sensor ready: {'no' if cls.mode == 'sensor_dead' else 'yes'}\n"
            f"Frame valid: {valid}\n"
            f"Frame count: {frame}\n"
            f"Measured FPS: {fps:.2f}\n"
            "Read duration ms: 161\nI2C bus: /dev/i2c-1\n"
            f"Frame age s: {'45.0' if cls.mode == 'slow_frames' else '0.4'}\n"
            "ESP32-S3 mic: connected peer=192.168.69.15:52116 rate=48000Hz nonzero=99.9%\n"
            "Ambient (SHT45): live temp=32.04C hum=70.3% age=1.9s\n"
            "Local IPv4: 10.42.0.28, 192.168.69.1\n"
        )

    @classmethod
    def data(cls) -> str:
        frame = cls.frame + int((time.time() - cls.started) * cls.fps)
        return json.dumps({"frame": frame, "fps": cls.fps, "ok": True, "center": 40.42,
                           "min": 30.8, "max": 40.4, "pixels": [30.0] * 768})

    @classmethod
    def ambient(cls) -> str:
        if cls.mode == "mic_stale":
            return json.dumps({"state": "esp-offline", "ok": False, "micOnline": False,
                               "temperature": None, "humidity": None, "ageS": 900,
                               "mqttConnected": True})
        return json.dumps({"state": "live", "ok": True, "device": "s3-mic-01",
                           "micOnline": True, "temperature": 32.04, "humidity": 70.3,
                           "ageS": 0.2, "mqttConnected": True})

    @classmethod
    def esp(cls) -> str:
        if cls.mode == "mic_stale":
            return json.dumps({"connected": False, "socket": False, "stale": True,
                               "nonzeroPct": 0.0, "rate": 48000, "peer": None})
        if cls.mode == "mic_zero":
            return json.dumps({"connected": True, "socket": True, "stale": False,
                               "nonzeroPct": 0.0, "rate": 48000, "peer": "192.168.69.15:1"})
        return json.dumps({"connected": True, "socket": True, "stale": False,
                           "nonzeroPct": 99.9, "rate": 48000, "peer": "192.168.69.15:1"})


class FakePiHandler(_Quiet):
    def do_GET(self):  # noqa: N802
        path = self.path.split("?")[0]
        if path == "/health":
            if FakePi.mode == "console_down":
                self.send_response(500)
                self.end_headers()
                return
            body = FakePi.health().encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/plain")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if path == "/data":
            body = FakePi.data().encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if path == "/ambient":
            body = FakePi.ambient().encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if path == "/esp/status":
            body = FakePi.esp().encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if path == "/cctv":
            if FakePi.mode == "camera_absent":
                body = b"no frame from the camera - it is not sending video"
                self.send_response(503)
                self.send_header("Content-Type", "text/plain")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            if FakePi.mode == "camera_empty_200":
                # The defect the diagnostic exists to catch.
                self.send_response(200)
                self.send_header("Content-Type", "multipart/x-mixed-replace")
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
            self.send_response(200)
            self.send_header("Content-Type", "image/jpeg")
            self.send_header("Content-Length", str(len(JPEG)))
            self.end_headers()
            self.wfile.write(JPEG)
            return
        if path == "/esp/record":
            if FakePi.mode in ("mic_stale", "mic_zero"):
                body = b"ESP mic not connected - nothing to record"
                self.send_response(503)
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            self.send_response(200)
            self.send_header("Content-Type", "audio/wav")
            self.send_header("Content-Length", str(len(WAV)))
            self.end_headers()
            self.wfile.write(WAV)
            return
        self.send_response(404)
        self.end_headers()


class FakePBHandler(_Quiet):
    """PocketBase list API with a controllable row age."""

    age_s = 5.0
    dev = "pi-thermal-01"

    def do_GET(self):  # noqa: N802
        if "/api/collections/telemetry/records" not in self.path:
            self.send_response(404)
            self.end_headers()
            return
        ts = int(time.time() - FakePBHandler.age_s)
        body = json.dumps({"page": 1, "perPage": 1, "totalItems": 1, "totalPages": 1,
                           "items": [{"timestamp": ts, "center": 40.4, "rms": 0, "mic": False}]}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


class FakeProxyHandler(_Quiet):
    status = 200

    def do_GET(self):  # noqa: N802
        body = b'{"ok": true}'
        self.send_response(FakeProxyHandler.status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


class FakeBridgeHandler(_Quiet):
    """The deployed boundary: Pi passthrough, telemetry, and the app shell."""

    pi_status = 200
    telemetry_status = 200
    entry = "entry-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.js"
    age_s = 5.0

    def do_GET(self):  # noqa: N802
        path = self.path.split("?")[0]
        if path == "/api/pi":
            self.send_response(FakeBridgeHandler.pi_status)
            body = b"ok"
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if path == "/api/telemetry":
            if FakeBridgeHandler.telemetry_status != 200:
                self.send_response(FakeBridgeHandler.telemetry_status)
                self.end_headers()
                return
            ts = int(time.time() - FakeBridgeHandler.age_s)
            body = json.dumps({"items": [{"timestamp": ts}]}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if path == "/app/":
            body = f'<html><script src="/app/_expo/static/js/web/{FakeBridgeHandler.entry}"></script></html>'.encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        self.send_response(404)
        self.end_headers()


class RigDiagSimulationTests(unittest.TestCase):
    """One fault at a time: the verdict must name the hop that broke."""

    pi_srv = None
    pi_url = ""
    pb_srv = None
    pb_url = ""
    proxy_srv = None
    bridge_srv = None
    bridge_url = ""
    tmpdir = ""

    @classmethod
    def setUpClass(cls):
        cls.pi_srv, cls.pi_url = _serve(FakePiHandler)
        cls.pb_srv, cls.pb_url = _serve(FakePBHandler)
        cls.proxy_srv, proxy_url = _serve(FakeProxyHandler)
        cls.bridge_srv, cls.bridge_url = _serve(FakeBridgeHandler)
        cls.tmpdir = tempfile.mkdtemp(prefix="rigdiag-")
        # The proxy URL is a module constant; point it at the fake for the run.
        cls._orig_proxy_health = rig_diag.PROXY_HEALTH
        rig_diag.PROXY_HEALTH = f"{proxy_url}/health"
        # A local dist whose bundle name we control, for the deploy-drift check.
        entry = "entry-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.js"
        folder = os.path.join(cls.tmpdir, "dist", "_expo", "static", "js", "web")
        os.makedirs(folder, exist_ok=True)
        open(os.path.join(folder, entry), "w").close()
        cls.local_dist = os.path.join(cls.tmpdir, "dist")
        # A sync env file pointing at the fake Pi.
        cls.sync_env = os.path.join(cls.tmpdir, "sync.env")
        with open(cls.sync_env, "w", encoding="utf-8") as fh:
            fh.write("SYNC_SOURCE_URL=http://192.0.2.1:8090\n")
        cls.sync_unit = "rigdiag-no-such-unit.service"

    @classmethod
    def tearDownClass(cls):
        rig_diag.PROXY_HEALTH = cls._orig_proxy_health
        for srv in (cls.pi_srv, cls.pb_srv, cls.proxy_srv, cls.bridge_srv):
            srv.shutdown()

    def setUp(self):
        rig_diag.RESULTS.clear()
        FakePi.mode = "ok"
        FakePi.started = time.time()
        FakePBHandler.age_s = 5.0
        FakeProxyHandler.status = 200
        FakeBridgeHandler.pi_status = 200
        FakeBridgeHandler.telemetry_status = 200
        FakeBridgeHandler.entry = "entry-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.js"
        FakeBridgeHandler.age_s = 5.0

    def run_diag(self, **over) -> dict[str, Any]:
        argv = ["--candidates", self.pi_url, "--pb", self.pb_url, "--bridge", self.bridge_url,
                "--proxy-key", "test", "--local-dist", self.local_dist,
                "--pi-pb-port", str(self.pb_srv.server_address[1]),
                "--sync-unit", self.sync_unit, "--sync-env", self.sync_env, "--json"]
        for k, v in over.items():
            argv += [k, v]
        import io
        import contextlib
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            rig_diag.main(argv)
        return json.loads(buf.getvalue())

    # ── the healthy baseline ────────────────────────────────────────────────
    def test_healthy_rig_passes(self):
        # The mic layer is healthy; the sync worker check is expected to fail on
        # this simulated machine (the unit does not exist), which is itself the
        # honest state, so assert on the sensor layers instead of the verdict.
        out = self.run_diag()
        states = {(c["layer"], c["name"]): c["state"] for c in out["checks"]}
        self.assertEqual(states[("L1 console", "MLX90640")], "PASS")
        self.assertEqual(states[("L1 console", "frame freshness")], "PASS")
        self.assertEqual(states[("L1 console", "ambient")], "PASS")
        self.assertEqual(states[("L1 console", "barn mic")], "PASS")
        self.assertEqual(states[("L1 console", "cctv")], "PASS")
        self.assertEqual(states[("L3 data", "pi-thermal-01 rows")], "PASS")
        self.assertEqual(states[("L4 public", "deployed bridge")], "PASS")
        self.assertEqual(states[("L4 public", "public data")], "PASS")

    def test_camera_absent_is_a_warning_not_a_failure(self):
        FakePi.mode = "camera_absent"
        out = self.run_diag()
        cctv = next(c for c in out["checks"] if c["name"] == "cctv")
        self.assertEqual(cctv["state"], "WARN")
        self.assertIn("not sending video", cctv["detail"])
        self.assertIn("power", (cctv["next"] or "").lower())

    def test_empty_200_cctv_is_a_failure(self):
        """The exact defect fixed today: 200 OK with no frame."""
        FakePi.mode = "camera_empty_200"
        out = self.run_diag()
        cctv = next(c for c in out["checks"] if c["name"] == "cctv")
        self.assertEqual(cctv["state"], "FAIL")
        self.assertIn("EMPTY", cctv["detail"])

    def test_mic_stale_is_named_with_the_real_cause(self):
        FakePi.mode = "mic_stale"
        out = self.run_diag()
        mic = next(c for c in out["checks"] if c["name"] == "barn mic")
        self.assertEqual(mic["state"], "FAIL")
        self.assertIn("stale=True", mic["detail"])

    def test_zero_nonzero_percent_fails_the_mic(self):
        FakePi.mode = "mic_zero"
        out = self.run_diag()
        mic = next(c for c in out["checks"] if c["name"] == "barn mic")
        self.assertEqual(mic["state"], "FAIL")
        self.assertIn("zeros mean nothing is driving the line", (mic["next"] or ""))

    def test_dead_console_is_the_first_broken_hop(self):
        rig_diag.RESULTS.clear()
        # Point at a port nothing listens on: L0 must fail and name power/attachment.
        import io
        import contextlib
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            rig_diag.main(["--candidates", "http://127.0.0.1:9", "--pb", self.pb_url,
                           "--bridge", self.bridge_url, "--json"])
        out = json.loads(buf.getvalue())
        self.assertEqual(out["verdict"]["state"], "FAIL")
        self.assertTrue(out["verdict"]["headline"].startswith("L0 network"))
        self.assertIn("no candidate answered", out["verdict"]["detail"])

    def test_slow_frames_warns_and_says_why(self):
        FakePi.mode = "slow_frames"
        out = self.run_diag()
        fresh = next(c for c in out["checks"] if c["name"] == "frame freshness")
        self.assertIn(fresh["state"], ("WARN", "FAIL"))
        self.assertIn("starves", (fresh["next"] or "").lower())

    def test_sensor_dead_fails_the_mlx(self):
        FakePi.mode = "sensor_dead"
        out = self.run_diag()
        mlx = next(c for c in out["checks"] if c["name"] == "MLX90640")
        self.assertEqual(mlx["state"], "FAIL")
        self.assertIn("I2C", (mlx["next"] or ""))

    def test_stale_database_names_the_sync_hop_not_the_sensor(self):
        FakePBHandler.age_s = 40000
        out = self.run_diag()
        rows = next(c for c in out["checks"] if c["name"] == "pi-thermal-01 rows")
        self.assertEqual(rows["state"], "FAIL")
        self.assertIn("sync hop is broken, not the camera", rows["next"])
        # ...and the sensor layers stay green: a stale DB is not a stale sensor.
        mlx = next(c for c in out["checks"] if c["name"] == "MLX90640")
        self.assertEqual(mlx["state"], "PASS")

    def test_proxy_401_is_reported_as_a_key_problem(self):
        FakeProxyHandler.status = 401
        out = self.run_diag()
        proxy = next(c for c in out["checks"] if c["name"] == "read-only proxy")
        self.assertEqual(proxy["state"], "FAIL")
        self.assertIn("key does not match", proxy["detail"])

    def test_old_bridge_rejecting_quoted_filters_is_named_as_a_deploy_question(self):
        FakeBridgeHandler.telemetry_status = 400
        out = self.run_diag()
        pub = next(c for c in out["checks"] if c["name"] == "public data")
        self.assertEqual(pub["state"], "FAIL")
        self.assertIn("older than the filter fix", pub["next"])

    def test_deploy_drift_is_detected_from_the_artifacts(self):
        FakeBridgeHandler.entry = "entry-cccccccccccccccccccccccccccccccc.js"
        out = self.run_diag()
        dep = next(c for c in out["checks"] if c["name"] == "deploy")
        self.assertEqual(dep["state"], "FAIL")
        self.assertIn("public=entry-cccc", dep["detail"])
        self.assertIn("local=entry-bbbb", dep["detail"])
        self.assertIn("not deployed", dep["next"])

    def test_matching_deploy_is_reported_as_pass(self):
        FakeBridgeHandler.entry = "entry-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.js"
        out = self.run_diag()
        dep = next(c for c in out["checks"] if c["name"] == "deploy")
        self.assertEqual(dep["state"], "PASS")

    def test_every_check_states_a_readout(self):
        """No check may be a bare PASS with no evidence behind it."""
        out = self.run_diag()
        for c in out["checks"]:
            self.assertTrue(c["detail"].strip(), f"{c['layer']}/{c['name']} has no detail")


if __name__ == "__main__":
    unittest.main(verbosity=2)
