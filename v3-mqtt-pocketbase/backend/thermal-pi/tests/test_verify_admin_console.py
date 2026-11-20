"""Safety regression tests for the technician-console verifier.

The verifier must not connect to the ESP32-S3 PCM listener on TCP :9090.
Its listener check must be passive so running the verification cannot evict
the single supported audio client.
"""

from __future__ import annotations

import ast
import importlib.util
import unittest
from pathlib import Path


THERMAL_PI = Path(__file__).resolve().parents[1]
VERIFIER = THERMAL_PI / "scripts" / "verify_admin_console.py"
GUARD = THERMAL_PI / "scripts" / "mic_port_guard.py"


def _load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise ImportError(f"cannot load {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class VerifyAdminConsoleSafetyTests(unittest.TestCase):
    def test_guard_module_exists_in_production_tree(self):
        self.assertTrue(GUARD.is_file(), f"missing production guard: {GUARD}")

    def test_guard_detects_constant_alias(self):
        guard = _load_module("mic_port_guard", GUARD)
        source = "ESP_PORT = 9090\nport_open(ESP_PORT)\n"

        self.assertEqual(guard.active_mic_connection_lines(source), [2])

    def test_guard_detects_hex_port_and_transitive_constant_alias(self):
        guard = _load_module("mic_port_guard", GUARD)
        source = (
            "ESP_PORT = 0x2382\n"
            "PROBE_PORT = ESP_PORT\n"
            "probe = port_open\n"
            "probe(PROBE_PORT)\n"
        )

        self.assertEqual(guard.active_mic_connection_lines(source), [4])

    def test_guard_detects_url_constant_alias(self):
        guard = _load_module("mic_port_guard", GUARD)
        source = (
            "ESP_PORT = 9090\n"
            'URL = f"http://127.0.0.1:{ESP_PORT}/"\n'
            "urlopen(URL)\n"
        )

        self.assertEqual(guard.active_mic_connection_lines(source), [3])

    def test_guard_detects_imported_call_aliases(self):
        guard = _load_module("mic_port_guard", GUARD)
        source = (
            "import urllib.request as request_module\n"
            "from http.client import HTTPConnection as MicConnection\n"
            'request_module.urlopen("http://127.0.0.1:9090/")\n'
            'MicConnection("127.0.0.1", 9090)\n'
        )

        self.assertEqual(guard.active_mic_connection_lines(source), [3, 4])

    def test_guard_detects_callable_alias_from_imported_module(self):
        guard = _load_module("mic_port_guard", GUARD)
        source = (
            "import urllib.request\n"
            "open_url = urllib.request.urlopen\n"
            'open_url("http://127.0.0.1:9090/")\n'
        )

        self.assertEqual(guard.active_mic_connection_lines(source), [3])

    def test_guard_ignores_comments_and_docstrings(self):
        guard = _load_module("mic_port_guard", GUARD)
        source = (
            '"""port_open(9090) and HTTPConnection(9090) are forbidden here."""\n'
            "# socket.create_connection(('127.0.0.1', 9090))\n"
            "x = 1\n"
        )

        self.assertEqual(guard.active_mic_connection_lines(source), [])

    def test_guard_detects_keyword_port(self):
        guard = _load_module("mic_port_guard", GUARD)
        self.assertEqual(guard.active_mic_connection_lines("port_open(port=9090)\n"), [1])

    def test_guard_detects_keyword_port_with_positional_host(self):
        guard = _load_module("mic_port_guard", GUARD)
        source = 'port_open("127.0.0.1", port=9090)\n'

        self.assertEqual(guard.active_mic_connection_lines(source), [1])

    def test_guard_detects_aliased_probe(self):
        guard = _load_module("mic_port_guard", GUARD)
        source = "probe = port_open\nprobe(9090)\n"

        self.assertEqual(guard.active_mic_connection_lines(source), [2])

    def test_guard_detects_transitive_probe_alias(self):
        guard = _load_module("mic_port_guard", GUARD)
        source = "probe = port_open\nprobe2 = probe\nprobe2(9090)\n"

        self.assertEqual(guard.active_mic_connection_lines(source), [3])

    def test_guard_detects_direct_socket_connect(self):
        guard = _load_module("mic_port_guard", GUARD)
        source = 'socket.create_connection(("127.0.0.1", 9090))\n'

        self.assertEqual(guard.active_mic_connection_lines(source), [1])

    def test_guard_detects_socket_connect_and_connect_ex(self):
        guard = _load_module("mic_port_guard", GUARD)
        source = (
            'sock.connect(("127.0.0.1", 9090))\n'
            'sock.connect_ex(("127.0.0.1", 9090))\n'
        )

        self.assertEqual(guard.active_mic_connection_lines(source), [1, 2])

    def test_guard_detects_string_socket_port(self):
        guard = _load_module("mic_port_guard", GUARD)
        source = 'socket.create_connection(("127.0.0.1", "9090"))\n'

        self.assertEqual(guard.active_mic_connection_lines(source), [1])

    def test_guard_detects_urllib_urlopen(self):
        guard = _load_module("mic_port_guard", GUARD)
        source = 'urllib.request.urlopen("http://127.0.0.1:9090/")\n'

        self.assertEqual(guard.active_mic_connection_lines(source), [1])

    def test_guard_detects_urlopen_with_port_constant(self):
        guard = _load_module("mic_port_guard", GUARD)
        source = (
            "ESP_PORT = 9090\n"
            'urlopen(f"http://127.0.0.1:{ESP_PORT}/")\n'
        )

        self.assertEqual(guard.active_mic_connection_lines(source), [2])

    def test_guard_detects_request_construction_targeting_mic(self):
        guard = _load_module("mic_port_guard", GUARD)
        source = (
            "from urllib.request import Request\n"
            'req = Request("http://127.0.0.1:9090/")\n'
        )

        self.assertEqual(guard.active_mic_connection_lines(source), [2])

    def test_guard_detects_keyword_url_target_on_request_alias(self):
        guard = _load_module("mic_port_guard", GUARD)
        source = (
            "from urllib.request import Request as MicRequest\n"
            'target = "http://127.0.0.1:9090/"\n'
            'req = MicRequest(url=target)\n'
        )

        self.assertEqual(guard.active_mic_connection_lines(source), [3])

    def test_guard_detects_keyword_url_target_on_urlopen_alias(self):
        guard = _load_module("mic_port_guard", GUARD)
        source = (
            "from urllib.request import urlopen as open_url\n"
            'target = "http://127.0.0.1:9090/"\n'
            "open_url(url=target)\n"
        )

        self.assertEqual(guard.active_mic_connection_lines(source), [3])

    def test_guard_detects_urlopen_with_request_alias(self):
        guard = _load_module("mic_port_guard", GUARD)
        source = (
            "from urllib.request import Request, urlopen\n"
            'req = Request("http://127.0.0.1:9090/")\n'
            "urlopen(req)\n"
        )

        self.assertEqual(guard.active_mic_connection_lines(source), [2, 3])

    def test_guard_detects_http_client_connection(self):
        guard = _load_module("mic_port_guard", GUARD)
        source = 'http.client.HTTPConnection("127.0.0.1", 9090)\n'

        self.assertEqual(guard.active_mic_connection_lines(source), [1])

    def test_guard_detects_https_client_connection(self):
        guard = _load_module("mic_port_guard", GUARD)
        source = 'http.client.HTTPSConnection("127.0.0.1", port=9090)\n'

        self.assertEqual(guard.active_mic_connection_lines(source), [1])

    def test_guard_does_not_flag_other_ports_or_bind_calls(self):
        guard = _load_module("mic_port_guard", GUARD)
        source = (
            'port_open(8085)\n'
            'socket.create_connection(("127.0.0.1", 8080))\n'
            'srv.bind(("0.0.0.0", 9090))\n'
            'srv.listen(1)\n'
        )

        self.assertEqual(guard.active_mic_connection_lines(source), [])

    def test_verifier_never_actively_connects_to_mic_port_9090(self):
        guard = _load_module("mic_port_guard", GUARD)

        self.assertEqual(
            guard.active_mic_connection_lines(
                VERIFIER.read_text(encoding="utf-8")
            ),
            [],
            "admin-console verification must not connect to the single-client mic port",
        )

    def test_verifier_self_checks_the_production_guard(self):
        source = VERIFIER.read_text(encoding="utf-8")

        self.assertGreaterEqual(
            source.count("active_mic_connection_lines("),
            2,
            "the verifier must scan both itself and the child source it launches",
        )

    def test_verifier_has_no_reachable_connect_ex_path(self):
        tree = ast.parse(VERIFIER.read_text(encoding="utf-8"))

        connect_ex_calls = [
            node.lineno
            for node in ast.walk(tree)
            if isinstance(node, ast.Call)
            and isinstance(node.func, ast.Attribute)
            and node.func.attr == "connect_ex"
        ]
        self.assertEqual(
            connect_ex_calls,
            [],
            "the verifier must not retain an active socket-probe path",
        )

    def test_verifier_readiness_is_passive_and_child_attributed(self):
        source = VERIFIER.read_text(encoding="utf-8")

        self.assertIn("child_listening_ports(", source)
        self.assertNotIn("port_open(", source)
        self.assertNotIn("connect_ex(", source)

    def test_verifier_samples_child_outbound_mic_connections(self):
        source = VERIFIER.read_text(encoding="utf-8")

        self.assertGreaterEqual(
            source.count("child_outbound_mic_connections("),
            2,
            "the verifier must sample /proc and attribute outbound :9090 rows to its child",
        )

    def test_current_child_source_has_no_active_mic_connection_path(self):
        guard = _load_module("mic_port_guard", GUARD)
        child_source = THERMAL_PI / "web_server.py"

        self.assertEqual(
            guard.active_mic_connection_lines(
                child_source.read_text(encoding="utf-8")
            ),
            [],
        )

    def test_verifier_uses_decoded_source_for_section_e(self):
        source = VERIFIER.read_text(encoding="utf-8")

        self.assertIn('payload.get("source")', source)
        self.assertIn("status == 200", source)
        self.assertNotIn('txt = raw.decode("utf-8", "replace")', source)

    def test_section_e_requires_successful_source_response(self):
        verifier = _load_module("verify_admin_console", VERIFIER)

        self.assertFalse(verifier.source_response_is_valid({}, "bridge/local_bridge.py"))
        self.assertFalse(
            verifier.source_response_is_valid(
                {"source": "print('ok')\n", "path": "wrong.py"}, "right.py"
            )
        )
        self.assertTrue(
            verifier.source_response_is_valid(
                {"source": "print('ok')\n", "path": "right.py"}, "right.py"
            )
        )

    def test_section_e_rejects_non_parseable_python_source(self):
        verifier = _load_module("verify_admin_console", VERIFIER)

        self.assertFalse(
            verifier.source_response_is_valid(
                {"source": "def broken(:\n", "path": "right.py"}, "right.py"
            )
        )

    def test_section_e_rejects_effectively_empty_python_source(self):
        verifier = _load_module("verify_admin_console", VERIFIER)

        for source in ("# only a comment\n", '"""only a docstring"""\n'):
            with self.subTest(source=source):
                self.assertFalse(
                    verifier.source_response_is_valid(
                        {"source": source, "path": "right.py"}, "right.py"
                    )
                )

    def test_section_e_literal_check_ignores_docstrings_and_comments(self):
        verifier = _load_module("verify_admin_console", VERIFIER)
        source = (
            '"""capstone admin123 in a docstring\n'
            'more prose here\n"""\n'
            '# admin123 in a comment\n'
            'x = 1  # admin123 in a trailing comment\n'
        )

        self.assertEqual(verifier.literal_leak_lines(source, "admin123"), [])
        self.assertEqual(verifier.literal_leak_lines(source, "capstone"), [])

    def test_section_e_literal_check_finds_executable_literals(self):
        verifier = _load_module("verify_admin_console", VERIFIER)
        source = 'PASSWORD = "admin123"\n'

        self.assertEqual(verifier.literal_leak_lines(source, "admin123"), [1])

    def test_section_e_literal_check_ignores_hash_inside_string(self):
        verifier = _load_module("verify_admin_console", VERIFIER)
        source = 'url = "http://h/#frag"; send("admin123")\n'

        self.assertEqual(verifier.literal_leak_lines(source, "admin123"), [1])

    def test_guard_has_no_network_client_imports(self):
        tree = ast.parse(GUARD.read_text(encoding="utf-8"))

        imported = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                imported.update(alias.name for alias in node.names)
            elif isinstance(node, ast.ImportFrom):
                imported.add(node.module or "")

        self.assertFalse(
            imported & {"socket", "urllib.request", "http.client"},
            "the static guard must never be able to open a network connection",
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
