import json
import pathlib
import struct
import sys
import tempfile
import threading
import types
import unittest
import urllib.error
import urllib.request
import wave
from unittest import mock

import numpy as np

fake_ort = types.ModuleType("onnxruntime")
fake_ort.SessionOptions = lambda: types.SimpleNamespace()
fake_ort.GraphOptimizationLevel = types.SimpleNamespace(ORT_ENABLE_ALL=1)
# The HTTP route calls score_manual_clip() with the default embed(), which runs
# the session: return a stub whose run() yields a head-shaped (1, 2048) embedding
# so this path exercises real routing without loading the 304 MB ONNX body.
fake_ort.InferenceSession = lambda *a, **k: types.SimpleNamespace(
    run=lambda outputs, feed: [np.zeros((1, 2048), dtype=np.float32)])
fake_ort.CPUExecutionProvider = "CPU"
sys.modules.setdefault("onnxruntime", fake_ort)

BACKEND = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(BACKEND / "cough"))
import cough_classifier as cc  # noqa: E402


class ManualHttpTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.tmp.name)
        self.clips = self.root / "clips"
        self.clips.mkdir()
        self.log = self.root / "windows.jsonl"
        self.log.touch()
        self.patches = [
            mock.patch.object(cc, "CLIPS_DIR", self.clips),
            mock.patch.object(cc, "WINDOWS_LOG", self.log),
        ]
        for p in self.patches:
            p.start()
        cc.ST.manual.reset()
        cc.ST.windows.clear()
        cc.ST.scored = 0
        cc.ST.infer_ms.clear()
        cc.ST.last_cough_alert = 0.0

    def tearDown(self):
        for p in reversed(self.patches):
            p.stop()
        self.tmp.cleanup()

    def _write_clip(self, name="clip.wav"):
        path = self.clips / name
        with wave.open(str(path), "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(16000)
            wf.writeframes(b"\x00" * 80000 * 2)
        return name

    def test_manual_run_has_no_live_or_durable_side_effects(self):
        name = self._write_clip()
        before_log = self.log.read_bytes()
        before_clips = sorted(str(p) for p in self.clips.iterdir())
        with mock.patch.object(cc, "capture_frame", side_effect=AssertionError), \
             mock.patch.object(cc.subprocess, "run", side_effect=AssertionError):
            out = cc.score_manual_clip(
                name, "cough",
                embed_fn=lambda w: [0.0] * 2048,
                prob_fn=lambda e: 0.7,
            )
        self.assertTrue(out["ok"])
        self.assertEqual(out["result"]["predicted"], "cough")
        self.assertTrue(out["result"]["correct"])
        self.assertEqual(out["session"]["tp"], 1)
        self.assertEqual(len(cc.ST.windows), 0)
        self.assertEqual(cc.ST.scored, 0)
        self.assertEqual(self.log.read_bytes(), before_log)
        self.assertEqual(sorted(str(p) for p in self.clips.iterdir()), before_clips)

    def test_reset_clears_only_test_session_state(self):
        cc.ST.windows.append({"ts": 1, "p": 0.9, "above": True})
        cc.ST.last_cough_alert = 123.0
        cc.ST.scored = 9
        cc.ST.enabled = True
        old = cc.ST.manual.session_id
        sid = cc.reset_manual_session()
        self.assertNotEqual(sid, old)
        self.assertEqual(len(cc.ST.windows), 0)
        self.assertEqual(cc.ST.last_cough_alert, 0.0)
        self.assertEqual(cc.ST.scored, 9)
        self.assertTrue(cc.ST.enabled)
        self.assertEqual(cc.aggregate()["verdict"], "NO DATA")

    def test_reset_during_inference_rejects_stale_result(self):
        name = self._write_clip()
        def embed_then_reset(w):
            cc.reset_manual_session()
            return [0.0] * 2048
        with self.assertRaises(ValueError):
            cc.score_manual_clip(name, "cough", embed_fn=embed_then_reset,
                                 prob_fn=lambda e: 0.7)
        self.assertEqual(cc.ST.manual.summary()["windows"], 0)

    def _post(self, path, payload=b"{}", content_type="application/json"):
        srv = cc.ThreadingHTTPServer(("127.0.0.1", 0), cc.Handler)
        thread = threading.Thread(target=srv.serve_forever, daemon=True)
        thread.start()
        try:
            req = urllib.request.Request(
                f"http://127.0.0.1:{srv.server_address[1]}{path}",
                data=payload, method="POST",
                headers={"Content-Type": content_type})
            with urllib.request.urlopen(req, timeout=5) as r:
                return r.status, r.read()
        except urllib.error.HTTPError as e:
            return e.code, e.read()
        finally:
            srv.shutdown()
            srv.server_close()
            thread.join(timeout=5)

    def test_post_routes_and_limits(self):
        name = self._write_clip()
        ok = json.dumps({"file": name, "label": "other"}).encode()
        code, body = self._post("/api/manual/run", ok)
        self.assertEqual(code, 200)
        j = json.loads(body)
        self.assertIn("session_id", j)
        self.assertIn("result", j)
        self.assertIn("session", j)

        code, _ = self._post("/api/manual/run", b'{"file":"x","label":"COUGH"}')
        self.assertEqual(code, 400)
        code, _ = self._post("/api/manual/run", b"[]")
        self.assertEqual(code, 400)
        code, _ = self._post("/api/manual/run", b"x" * (16 * 1024 + 1))
        self.assertEqual(code, 413)
        code, _ = self._post("/api/manual/reset")
        self.assertEqual(code, 200)
        code, _ = self._post("/api/does-not-exist")
        self.assertEqual(code, 404)


if __name__ == "__main__":
    unittest.main()
