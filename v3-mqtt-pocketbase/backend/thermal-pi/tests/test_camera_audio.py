#!/usr/bin/env python3
"""Invariants for the camera-audio / barn-mic capture path — no hardware.

Three things are pinned here, because all three are easy to break silently
and hard to notice from the UI:

  1. `_patch_wav_sizes` — ffmpeg writes WAV to a pipe with 0xFFFFFFFF in both
     the RIFF and the `data` size field. The patcher must rewrite BOTH from
     the bytes actually received, must not touch the payload, must be
     idempotent, and must leave anything malformed exactly as it found it.

  2. The proxy's `seconds` parsing — TOTAL. A crafted non-ASCII digit makes
     `str.isdigit()` true but `int()` raise; an uncaught ValueError there
     aborts the request handler and the client gets ZERO responses instead of
     an error status.

  3. The timeout ladder — the Pi's own capture deadline must stay BELOW the
     proxy's budget, which must stay BELOW the bridge's abort. If any layer
     is reordered, a slow-but-alive capture is cut off early and reported as
     "unreachable" instead of the upstream's honest 503.

    cd backend/thermal-pi && python3 -m unittest tests.test_camera_audio -v
    # or
    python3 backend/thermal-pi/tests/test_camera_audio.py
"""

from __future__ import annotations

import os
import re
import struct
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
THERMAL_PI = os.path.dirname(HERE)
REPO_BACKEND = os.path.dirname(THERMAL_PI)
WORKERS = os.path.join(REPO_BACKEND, "workers")
sys.path.insert(0, THERMAL_PI)
sys.path.insert(0, WORKERS)

import web_server  # noqa: E402
import readonly_pb_proxy as proxy  # noqa: E402

PLACEHOLDER = 0xFFFFFFFF


def _wav(payload: bytes, riff_size: int = PLACEHOLDER, data_size: int = PLACEHOLDER) -> bytes:
    """A minimal WAV with the given (possibly placeholder) size fields."""
    fmt = b"fmt " + struct.pack("<IHHIIHH", 16, 1, 2, 48000, 48000 * 4, 4, 16)
    data = b"data" + struct.pack("<I", data_size) + payload
    return b"RIFF" + struct.pack("<I", riff_size) + b"WAVE" + fmt + data


class PatchWavSizesTests(unittest.TestCase):
    """_patch_wav_sizes must describe the payload it actually carries."""

    def test_patches_placeholder_sizes_to_the_real_payload(self):
        payload = b"\x01\x02\x03\x04" * 400
        out = web_server._patch_wav_sizes(_wav(payload))
        riff_size = struct.unpack("<I", out[4:8])[0]
        data_pos = out.index(b"data")
        data_size = struct.unpack("<I", out[data_pos + 4:data_pos + 8])[0]
        self.assertEqual(riff_size, len(out) - 8)
        self.assertEqual(data_size, len(payload))
        self.assertEqual(out[data_pos + 8:], payload, "payload bytes must not change")

    def test_patching_is_idempotent(self):
        out1 = web_server._patch_wav_sizes(_wav(b"\xaa" * 64))
        out2 = web_server._patch_wav_sizes(out1)
        self.assertEqual(out1, out2)

    def test_empty_buffer_is_untouched(self):
        self.assertEqual(web_server._patch_wav_sizes(b""), b"")

    def test_garbage_is_untouched(self):
        junk = b"this is not a wav file at all"
        self.assertEqual(web_server._patch_wav_sizes(junk), junk)

    def test_truncated_header_is_untouched(self):
        short = b"RIFF\x24\x00\x00\x00WAV"
        self.assertEqual(web_server._patch_wav_sizes(short), short)

    def test_wav_without_a_data_chunk_is_untouched(self):
        fmt = b"fmt " + struct.pack("<IHHIIHH", 16, 1, 2, 48000, 48000 * 4, 4, 16)
        no_data = b"RIFF" + struct.pack("<I", PLACEHOLDER) + b"WAVE" + fmt
        self.assertEqual(web_server._patch_wav_sizes(no_data), no_data)

    def test_unknown_size_chunk_before_data_stops_the_walk(self):
        """An unknown-size chunk makes the chunk list unsafe to walk."""
        fmt = b"fmt " + struct.pack("<IHHIIHH", 16, 1, 2, 48000, 48000 * 4, 4, 16)
        blob = b"LIST" + struct.pack("<I", PLACEHOLDER) + b"junkjunk"
        blob += b"data" + struct.pack("<I", PLACEHOLDER) + b"\x00\x01"
        src = b"RIFF" + struct.pack("<I", PLACEHOLDER) + b"WAVE" + fmt + blob
        self.assertEqual(web_server._patch_wav_sizes(src), src)


class ProxySecondsParsingTests(unittest.TestCase):
    """The proxy's seconds parsing must be total — never raise, never hang."""

    def test_valid_range_is_accepted(self):
        for n in range(proxy.CAMERA_AUDIO_MIN_S, proxy.CAMERA_AUDIO_MAX_S + 1):
            self.assertEqual(proxy.camera_audio_seconds(f"seconds={n}"), str(n))

    def test_out_of_range_falls_back_to_the_default(self):
        default = str(proxy.CAMERA_AUDIO_DEFAULT_S)
        for bad in ("0", "1", "9", "10", "99", "-1", "+3", "3.5", "", "abc"):
            self.assertEqual(proxy.camera_audio_seconds(f"seconds={bad}"), default, bad)

    def test_missing_parameter_falls_back_to_the_default(self):
        self.assertEqual(proxy.camera_audio_seconds(""), "4")
        self.assertEqual(proxy.camera_audio_seconds("other=2"), "4")

    def test_non_ascii_digits_do_not_raise(self):
        """'²' is str.isdigit() True but int() raises — the classic trap."""
        default = str(proxy.CAMERA_AUDIO_DEFAULT_S)
        for bad in ("\u00b2", "\u00b3", "\u00b9", "\u0662", "\u06f2"):
            self.assertEqual(proxy.camera_audio_seconds(f"seconds={bad}"), default, bad)

    def test_absurdly_long_digit_string_does_not_raise(self):
        default = str(proxy.CAMERA_AUDIO_DEFAULT_S)
        self.assertEqual(proxy.camera_audio_seconds("seconds=" + "9" * 5000), default)

    def test_esp_record_parser_is_total_too(self):
        default = str(proxy.ESP_RECORD_DEFAULT_S)
        self.assertEqual(proxy.esp_record_seconds("seconds=3"), "3")
        self.assertEqual(proxy.esp_record_seconds("seconds=10"), "10")
        self.assertEqual(proxy.esp_record_seconds("seconds=11"), default)
        self.assertEqual(proxy.esp_record_seconds("seconds=\u00b2"), default)
        self.assertEqual(proxy.esp_record_seconds("seconds=" + "9" * 5000), default)


def _method_source(source: str, name: str) -> str:
    """The source text of one method (same-indent `def` boundaries)."""
    start = source.index(f"def {name}")
    rest = source[start:]
    nxt = re.search(r"\n    def ", rest)
    return rest[: nxt.start()] if nxt else rest


class TimeoutLadderTests(unittest.TestCase):
    """Pi deadline < proxy budget < bridge abort — for every long read."""

    def setUp(self):
        with open(os.path.join(WORKERS, "readonly_pb_proxy.py"), encoding="utf-8") as fh:
            proxy_src = fh.read()
        with open(
            os.path.join(REPO_BACKEND, "..", "frontend", "mobile_app", "api", "pi.js"),
            encoding="utf-8",
        ) as fh:
            bridge_src = fh.read()
        self.proxy_camera = float(
            re.search(r"timeout=(\d+)", _method_source(proxy_src, "_camera_audio")).group(1)
        )
        self.proxy_mic = float(
            re.search(r"timeout=(\d+)", _method_source(proxy_src, "_esp_record")).group(1)
        )
        self.proxy_cctv = float(
            re.search(r"timeout=(\d+)", _method_source(proxy_src, "_cctv_frame")).group(1)
        )
        self.bridge_camera = float(
            re.search(r"'camera-audio':\s*(\d+)", bridge_src).group(1)
        ) / 1000
        self.bridge_mic = float(re.search(r"'esp/record':\s*(\d+)", bridge_src).group(1)) / 1000
        self.bridge_cctv = float(re.search(r"cctv:\s*(\d+)", bridge_src).group(1)) / 1000

    def test_camera_audio_ladder(self):
        # Pi: ffmpeg is bounded by `seconds + 15`; at the 8 s cap that is 23 s.
        pi_max = web_server.CAMERA_AUDIO_MAX_S + 15
        self.assertLess(pi_max, self.proxy_camera)
        self.assertLess(self.proxy_camera, self.bridge_camera)
        self.assertLess(self.bridge_camera, 300, "must fit the Vercel Hobby function limit")

    def test_esp_record_ladder(self):
        # Pi: the capture gives up after `seconds + ESP_RECORD_GRACE_S`; at the
        # 10 s cap this proxy allows that is 30 s.
        pi_max = proxy.ESP_RECORD_MAX_S + web_server.ESP_RECORD_GRACE_S
        self.assertLess(pi_max, self.proxy_mic)
        self.assertLess(self.proxy_mic, self.bridge_mic)
        self.assertLess(self.bridge_mic, 300)

    def test_cctv_ladder(self):
        self.assertLess(self.proxy_cctv, self.bridge_cctv)
        self.assertLess(self.bridge_cctv, 300)


class _FakeHead(proxy.Handler):
    """A Handler with just enough surface to exercise do_HEAD.

    do_GET is replaced so the test can tell "delegated to GET" from
    "short-circuited", without needing a socket or an upstream. The key is
    optional because do_HEAD checks auth BEFORE it refuses a capture route —
    an unauthenticated HEAD must get 401, not a 405 that would disclose that
    the route exists.
    """

    def __init__(self, path: str, key: str | None = None):
        self.path = path
        self.command = "HEAD"
        self.client_address = ("127.0.0.1", 54321)
        self.headers = {} if key is None else {"X-PigPulse-Key": key}
        self.status = None
        self.sent_headers: dict[str, str] = {}
        self.get_called = False

    def send_response(self, code, message=None):  # noqa: D102 - test stub
        self.status = code

    def send_header(self, key, value):  # noqa: D102 - test stub
        self.sent_headers[key] = value

    def end_headers(self):  # noqa: D102 - test stub
        pass

    def do_GET(self):  # noqa: D102 - test stub
        self.get_called = True


class HeadDoesNotBurnACaptureTests(unittest.TestCase):
    """A HEAD must never start a real capture on the Pi.

    The Pi allows one capture at a time, so a stray HEAD from a health probe
    or a link prefetcher would occupy the capture slot and delay a legitimate
    GET. HEAD on a capture route must be refused without touching upstream.

    Auth is checked FIRST: an unauthenticated caller must not be able to
    learn which routes exist by reading a 405 instead of a 401.
    """

    TEST_KEY = "test-proxy-key-0123456789"

    def setUp(self):
        self._saved_key = proxy.PROXY_KEY
        proxy.PROXY_KEY = self.TEST_KEY

    def tearDown(self):
        proxy.PROXY_KEY = self._saved_key

    def test_head_on_camera_audio_is_refused_without_a_capture(self):
        h = _FakeHead("/pi/camera-audio", key=self.TEST_KEY)
        h.do_HEAD()
        self.assertEqual(h.status, 405)
        self.assertFalse(h.get_called, "HEAD must not delegate to GET")
        self.assertEqual(h.sent_headers.get("Allow"), "GET")

    def test_head_on_esp_record_is_refused_without_a_capture(self):
        h = _FakeHead("/pi/esp/record", key=self.TEST_KEY)
        h.do_HEAD()
        self.assertEqual(h.status, 405)
        self.assertFalse(h.get_called, "HEAD must not delegate to GET")

    def test_head_on_a_plain_pi_route_still_delegates(self):
        h = _FakeHead("/pi/data", key=self.TEST_KEY)
        h.do_HEAD()
        self.assertTrue(h.get_called, "non-capture routes keep their GET semantics")

    def test_head_on_a_capture_route_with_a_query_is_still_refused(self):
        h = _FakeHead("/pi/camera-audio?seconds=4", key=self.TEST_KEY)
        h.do_HEAD()
        self.assertEqual(h.status, 405)
        self.assertFalse(h.get_called)

    def test_unauthenticated_head_on_a_capture_route_is_401_not_405(self):
        """A 405 would disclose that the route exists before auth was checked."""
        h = _FakeHead("/pi/camera-audio")
        h.do_HEAD()
        self.assertEqual(h.status, 401)
        self.assertFalse(h.get_called)
        self.assertNotIn("Allow", h.sent_headers, "a 401 must not describe the route")

    def test_wrong_key_head_on_a_capture_route_is_401_not_405(self):
        h = _FakeHead("/pi/esp/record", key="not-the-right-key")
        h.do_HEAD()
        self.assertEqual(h.status, 401)
        self.assertFalse(h.get_called)


if __name__ == "__main__":
    unittest.main(verbosity=2)
