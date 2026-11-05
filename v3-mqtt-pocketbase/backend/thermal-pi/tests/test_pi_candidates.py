"""Pi console resolution — the rig must survive being cabled differently.

Context (measured 2026-11-04): the proxy held ONE hardcoded Pi address
(`https://192.168.69.1:8080`, the Pi's own barn access point). When the Pi was
instead reached over a LAN cable / the home router, every public path 502'd —
`pi unreachable: URLError` in production — while the Pi was perfectly healthy.
The proxy now tries a candidate list and remembers whichever answered.

A second, self-inflicted bug is pinned here too: refactoring the Pi calls
dropped a catch-all, so a *read* that stalled mid-body escaped the request
handler and the client got no HTTP response at all (curl exit 7 / code 000)
instead of an honest 502. `pi_get` now folds any read failure into
PiUnreachable, and `_cctv_frame` keeps its own catch-all.

These are unit tests with a stubbed urlopen — no rig and no network needed.
"""

from __future__ import annotations

import importlib
import os
import re
import socket
import sys
import unittest
import urllib.error
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
THERMAL_PI = os.path.dirname(HERE)
REPO_BACKEND = os.path.dirname(THERMAL_PI)
WORKERS = os.path.join(REPO_BACKEND, "workers")
sys.path.insert(0, THERMAL_PI)
sys.path.insert(0, WORKERS)

import readonly_pb_proxy as proxy  # noqa: E402


def _reload(env: dict[str, str]):
    """Re-import the proxy with a given module-level environment."""
    with mock.patch.dict(os.environ, env, clear=False):
        for key in ("PI_UPSTREAM_BACKUP",):
            os.environ.pop(key, None)
        return importlib.reload(proxy)


class CandidateTests(unittest.TestCase):
    """The candidate list: order, de-duplication, environment parsing."""

    def tearDown(self):
        # Leave the module in its default state for other test modules.
        proxy._pi_current = None

    def test_primary_leads_when_nothing_has_answered_yet(self):
        mod = _reload(
            {
                "PI_UPSTREAM": "https://192.168.69.1:8080",
                "PI_UPSTREAM_FALLBACKS": "https://raspberrypi.local:8080,https://10.42.0.28:8080",
            }
        )
        mod._pi_current = None
        self.assertEqual(
            mod.pi_candidates(),
            [
                "https://192.168.69.1:8080",
                "https://raspberrypi.local:8080",
                "https://10.42.0.28:8080",
            ],
        )

    def test_the_candidate_that_answered_leads_next_time(self):
        mod = _reload(
            {
                "PI_UPSTREAM": "https://192.168.69.1:8080",
                "PI_UPSTREAM_FALLBACKS": "https://raspberrypi.local:8080",
            }
        )
        mod.pi_remember("https://raspberrypi.local:8080")
        # A cabled rig must not pay the dead barn-AP address on every request.
        self.assertEqual(mod.pi_candidates()[0], "https://raspberrypi.local:8080")
        # …and the remaining candidates are still tried if it goes away again.
        self.assertIn("https://192.168.69.1:8080", mod.pi_candidates())

    def test_blank_and_duplicate_entries_are_ignored(self):
        mod = _reload(
            {
                "PI_UPSTREAM": "https://192.168.69.1:8080/",
                "PI_UPSTREAM_FALLBACKS": " , https://192.168.69.1:8080 , ",
            }
        )
        mod._pi_current = None
        self.assertEqual(mod.pi_candidates(), ["https://192.168.69.1:8080"])

    def test_no_fallbacks_configured_still_yields_the_primary(self):
        mod = _reload({"PI_UPSTREAM": "https://192.168.69.1:8080", "PI_UPSTREAM_FALLBACKS": ""})
        mod._pi_current = None
        self.assertEqual(mod.pi_candidates(), ["https://192.168.69.1:8080"])


class _Resp:
    """A urlopen() result: read() either returns bytes or raises."""

    def __init__(self, payload: bytes = b"{}", read_error: Exception | None = None):
        self._payload = payload
        self._read_error = read_error

    def read(self, _n: int = -1) -> bytes:
        if self._read_error is not None:
            raise self._read_error
        return self._payload

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


class ReadFailureTests(unittest.TestCase):
    """A stalled body read must become an honest failure, never a dead handler."""

    def setUp(self):
        proxy.PI_UPSTREAM = "https://192.168.69.1:8080"
        proxy.PI_UPSTREAM_FALLBACKS = ["https://raspberrypi.local:8080"]
        proxy._pi_current = None

    def tearDown(self):
        proxy._pi_current = None

    def test_read_timeout_is_folded_into_pi_unreachable(self):
        with mock.patch.object(
            proxy.urllib.request, "urlopen", return_value=_Resp(read_error=socket.timeout("timed out"))
        ):
            with self.assertRaises(proxy.PiUnreachable) as ctx:
                proxy.pi_get("/cctv", timeout=5, accept="multipart/x-mixed-replace")
        # socket.timeout is an alias of TimeoutError on modern Python; the
        # reason we surface is the exception's own name.
        self.assertEqual(ctx.exception.reason, "TimeoutError")
        # The public error body must not leak an internal address.
        self.assertNotIn("192.168", str(ctx.exception))
        self.assertNotIn("raspberrypi", str(ctx.exception))

    def test_connect_failure_falls_through_to_the_next_candidate(self):
        calls: list[str] = []

        def fake_urlopen(req, **_kw):
            url = req.full_url if hasattr(req, "full_url") else str(req)
            calls.append(url)
            if "192.168.69.1" in url:
                raise urllib.error.URLError("no route to host")
            return _Resp(b'{"ok": true}')

        with mock.patch.object(proxy.urllib.request, "urlopen", side_effect=fake_urlopen):
            raw = proxy.pi_get("/data", timeout=6, accept="application/json")

        self.assertEqual(raw, b'{"ok": true}')
        self.assertEqual(len(calls), 2, "must try the fallback after the primary fails")
        self.assertIn("raspberrypi.local", calls[1])
        self.assertEqual(proxy._pi_current, "https://raspberrypi.local:8080")

    def test_the_pis_own_error_status_is_passed_through_untouched(self):
        """A 503 from the Pi is its honest answer, not an unreachable box."""
        err = urllib.error.HTTPError(
            "https://192.168.69.1:8080/camera-audio",
            503,
            "Service Unavailable",
            {},
            None,
        )
        with mock.patch.object(proxy.urllib.request, "urlopen", side_effect=err):
            with self.assertRaises(urllib.error.HTTPError) as ctx:
                proxy.pi_get("/camera-audio?seconds=3", timeout=30, accept="audio/wav")
        self.assertEqual(ctx.exception.code, 503)

    def test_all_candidates_down_raises_with_a_short_reason(self):
        with mock.patch.object(
            proxy.urllib.request, "urlopen", side_effect=urllib.error.URLError("unreachable")
        ):
            with self.assertRaises(proxy.PiUnreachable) as ctx:
                proxy.pi_get("/data", timeout=6, accept="application/json")
        self.assertEqual(ctx.exception.reason, "URLError")


class CinemaFrameTests(unittest.TestCase):
    """The CCTV path must answer 502 — never drop the connection."""

    def test_cctv_source_keeps_a_catch_all(self):
        with open(os.path.join(WORKERS, "readonly_pb_proxy.py"), encoding="utf-8") as fh:
            src = fh.read()
        start = src.index("def _cctv_frame")
        rest = src[start:]
        nxt = rest.find("\n    def ", 1)
        body = rest[:nxt] if nxt > 0 else rest
        # Without this, a mid-stream socket timeout escapes do_GET and the
        # client receives no HTTP response at all.
        self.assertIn("except Exception", body)
        self.assertIn("cctv unavailable", body)

    def test_capture_routes_are_still_head_refused_and_read_only(self):
        with open(os.path.join(WORKERS, "readonly_pb_proxy.py"), encoding="utf-8") as fh:
            src = fh.read()
        self.assertIn('"/esp/record", "/camera-audio", "/esp/stream"', src)
        # The refusal must name the methods that DO work, and it must sit
        # behind the key check (asserted in test_camera_audio.py).
        self.assertIn('self.send_header("Allow", "GET")', src)
        self.assertIn("def do_HEAD(self):", src)


class GatewayParityTests(unittest.TestCase):
    """The bridge and the proxy must answer identically about a filter.

    They are separate implementations in different languages, so a divergence
    means one edge accepts what the other refuses — the caller then sees a 502
    from a "successful" pre-check, or a query their pre-check would have
    stopped. The charsets are compared after removing escape backslashes
    (Python writes `\\.`/`"`, JS writes `.`/`"` — same set), and the anchors
    are checked separately because `\\Z` and a non-multiline `$` are the
    cross-language equivalent.
    """

    def setUp(self):
        with open(
            os.path.join(
                REPO_BACKEND, "..", "frontend", "mobile_app", "api", "telemetry.js"
            ),
            encoding="utf-8",
        ) as fh:
            self.bridge_src = fh.read()

    def test_charsets_are_the_same_character_set(self):
        js = re.search(r"const SAFE_FILTER = (/.*?/);", self.bridge_src).group(1)
        js_charset = re.search(r"\^\[(.*?)\]\+", js).group(1)
        py_charset = re.search(r"\[(.*?)\]\+", proxy.SAFE_FILTER.pattern).group(1)
        self.assertEqual(
            py_charset.replace("\\", ""),
            js_charset.replace("\\", ""),
            "the two filter charsets have drifted apart",
        )

    def test_both_anchors_are_absolute_end_of_string(self):
        # Python `$` also matches before a trailing newline; JS `$` (without /m)
        # does not. Using \Z is what makes the two identical.
        self.assertTrue(proxy.SAFE_FILTER.pattern.endswith("\\Z"))
        self.assertFalse("\\n" in proxy.SAFE_FILTER.pattern)

    def test_injection_shaped_filters_are_refused(self):
        for hostile in (
            "deviceId='x'||1==1",
            "deviceId='x'\n",
            "deviceId='x';rm -rf /",
            "deviceId='x'`id`",
            "deviceId='x'$(id)",
            "a|b",
            "a\\b",
            "",
        ):
            self.assertIsNone(proxy.SAFE_FILTER.match(hostile), hostile)

    def test_the_real_compound_filter_still_passes(self):
        for legit in (
            "deviceId='pi-thermal-01'&&timestamp>=1793000000&&timestamp<1793100000",
            "timestamp>=1793000000",
            "deviceId!='s3-mic-01'",
        ):
            self.assertIsNotNone(proxy.SAFE_FILTER.match(legit), legit)


class LengthCapTests(unittest.TestCase):
    """No parameter may be silently dropped — that forwards a different query."""

    def test_every_droppable_param_is_refused_instead_of_dropped(self):
        with open(os.path.join(WORKERS, "readonly_pb_proxy.py"), encoding="utf-8") as fh:
            py_src = fh.read()
        with open(
            os.path.join(
                REPO_BACKEND, "..", "frontend", "mobile_app", "api", "telemetry.js"
            ),
            encoding="utf-8",
        ) as fh:
            js_src = fh.read()
        for name, src in (("proxy", py_src), ("bridge", js_src)):
            with self.subTest(edge=name):
                # An over-long filter used to be dropped → the request went out
                # unfiltered (every device) and still answered 200.
                self.assertNotIn("if name === 'filter') return fail", src)
                self.assertRegex(src, r"too long")
                self.assertNotIn("if (raw.length > 200) continue;", src)

    def test_perpage_is_a_strict_integer_on_the_bridge(self):
        # parseInt("50abc") === 50, so the bridge used to clamp a malformed
        # value the proxy would have rejected with 400 — a pre-check that
        # disagrees with the thing it is pre-checking.
        self.assertNotIn("Number.parseInt(raw, 10)", self.bridge_src_text())

    @staticmethod
    def bridge_src_text():
        with open(
            os.path.join(
                REPO_BACKEND, "..", "frontend", "mobile_app", "api", "telemetry.js"
            ),
            encoding="utf-8",
        ) as fh:
            return fh.read()


if __name__ == "__main__":
    unittest.main(verbosity=2)
