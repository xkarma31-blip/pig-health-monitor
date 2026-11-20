"""Offline regressions: python3 -m unittest discover -s backend/portal -v."""
import re
import json
import tempfile
import threading
import urllib.error
import urllib.request
import subprocess
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch

import portal


class StatusTests(unittest.TestCase):
    def status_for(self, link, address):
        def run(cmd, *_):
            return link if cmd[0] in ("iw", "/sbin/iw") else address

        with patch.object(portal, "run", side_effect=run), \
             patch.object(portal, "read", return_value="UP ip=192.168.254.194"), \
             patch.object(portal, "wan_iface", return_value="wan0"), \
             patch.object(portal, "internet_up", return_value=False), \
             patch.object(portal, "ap_info", return_value={}):
            return portal.status()

    def test_stale_up_without_association_is_down(self):
        result = self.status_for("Not connected.", "inet 169.254.1.2/16")
        self.assertEqual(result["state"], "DOWN link-lost")
        self.assertFalse(result["associated"])
        self.assertEqual(result["uplink_ip"], "")

    def test_association_without_dhcp_is_not_up(self):
        for addr in ("", "inet 169.254.1.2/16"):
            with self.subTest(address=addr):
                result = self.status_for("Connected to 00:11:22:33:44:55", addr)
                self.assertEqual(result["state"], "DOWN no-dhcp")
                self.assertEqual(result["uplink_ip"], "")

    def test_real_lease_is_up(self):
        result = self.status_for("Connected to 00:11:22:33:44:55",
                                 "inet 192.168.254.194/24")
        self.assertEqual(result["state"], "UP")
        self.assertEqual(result["uplink_ip"], "192.168.254.194")

    def test_remote_tunnel_url_is_reported(self):
        with patch.object(portal, "tailscale_ip", return_value="100.69.139.63"):
            result = self.status_for("Connected to 00:11:22:33:44:55",
                                     "inet 192.168.254.194/24")
        self.assertEqual(result["remote"], "http://100.69.139.63:8090")

    def test_radio_roles_match_measured_ap_and_managed_radios(self):
        self.assertEqual(portal.WAN_RADIO_MAC, "00:1f:05:6c:51:bc")
        self.assertEqual(portal.AP_RADIO_MAC, "dc:a6:32:87:63:a1")

    def test_scan_uses_absolute_iw_path(self):
        source = Path(portal.__file__).read_text()
        self.assertIn('"/sbin/iw", "dev", scan_if, "scan"', source)

    def test_portal_connect_resolves_wan_interface_by_mac(self):
        source = Path(__file__).with_name("pigpulse-portal-connect").read_text()
        self.assertIn("WAN_RADIO_MAC=00:1f:05:6c:51:bc", source)
        self.assertIn("AP_RADIO_MAC=dc:a6:32:87:63:a1", source)
        self.assertIn("WAN_IF=", source)
        self.assertNotIn("WAN_IF=${WAN_IF:-wlan0}", source)
        self.assertNotIn("AP_IF=${AP_IF:-wlan1}", source)
        self.assertNotIn("wlan0sta", source)

    def test_wan_sta_up_resolves_both_radios_by_mac(self):
        source = Path(__file__).parents[2].joinpath(
            "deploy/wan-apsta/pigpulse-wan-sta-up").read_text()
        self.assertIn("WAN_RADIO_MAC=00:1f:05:6c:51:bc", source)
        self.assertIn("AP_RADIO_MAC=dc:a6:32:87:63:a1", source)
        self.assertNotIn("STA=${STA:-wlan0}", source)
        self.assertNotIn("AP=${AP:-wlan1}", source)
        self.assertNotIn("STA=wlan0sta", source)
        self.assertNotIn("AP=wlan0", source)
        self.assertNotIn("render_ap_conf \"$PCH\"", source)

    def test_all_shell_radio_consumers_use_measured_role_mapping(self):
        consumers = {
            "pigpulse-portal-connect": {
                "WAN_RADIO_MAC": "00:1f:05:6c:51:bc",
                "AP_RADIO_MAC": "dc:a6:32:87:63:a1",
            },
            "pigpulse-ap-resolve": {
                "AP_RADIO_MAC": "dc:a6:32:87:63:a1",
            },
            "pigpulse-ap-static-ip": {
                "AP_RADIO_MAC": "dc:a6:32:87:63:a1",
            },
            "pigpulse-uplink-apply": {
                "WAN_RADIO_MAC": "00:1f:05:6c:51:bc",
                "AP_RADIO_MAC": "dc:a6:32:87:63:a1",
            },
            "pigpulse-wan-sta-up": {
                "WAN_RADIO_MAC": "00:1f:05:6c:51:bc",
                "AP_RADIO_MAC": "dc:a6:32:87:63:a1",
            },
        }
        for name, roles in consumers.items():
            source = (Path(__file__).with_name(name) if name != "pigpulse-wan-sta-up"
                      else Path(__file__).parents[2].joinpath(
                          "deploy/wan-apsta", name)).read_text()
            with self.subTest(consumer=name):
                for role, mac in roles.items():
                    self.assertIn(f"{role}={mac}", source)

    def test_shell_resolver_failures_are_visible_and_non_zero(self):
        consumers = {
            "pigpulse-portal-connect": 2,
            "pigpulse-ap-resolve": 1,
            "pigpulse-ap-static-ip": 1,
            "pigpulse-uplink-apply": 2,
            "pigpulse-wan-sta-up": 2,
        }
        strict_call = re.compile(
            r'/usr/local/sbin/pigpulse-wlan-iface\s+"\$\{?[A-Z_]+\}?"\)'
            r'\s*\|\|\s*\{[^\n}]*exit 1;'
        )
        fallback = re.compile(
            r'(?m)^\s*(?:IFACE|WAN_IF|AP_IF|STA|AP)\s*=\s*'
            r'(?:\$\{[^}]*:-\s*)?wlan[01]\b'
        )
        for name, expected_calls in consumers.items():
            source = (Path(__file__).with_name(name) if name != "pigpulse-wan-sta-up"
                      else Path(__file__).parents[2].joinpath(
                          "deploy/wan-apsta", name)).read_text()
            source_lines = source.splitlines()
            resolver_indexes = [
                index for index, line in enumerate(source_lines)
                if "pigpulse-wlan-iface" in line
            ]
            with self.subTest(consumer=name):
                self.assertEqual(len(strict_call.findall(source)), expected_calls)
                self.assertTrue(resolver_indexes)
                for index in resolver_indexes:
                    resolver_line = source_lines[index]
                    self.assertNotIn("2>/dev/null", resolver_line)
                    match = re.match(r"^\s*([A-Z_]+)=", resolver_line)
                    self.assertIsNotNone(match)
                    variable = match.group(1)
                    self.assertIn(index + 1, range(len(source_lines)))
                    guard = source_lines[index + 1]
                    self.assertIn(f'[ -n "${variable}" ]', guard)
                    self.assertIn("exit 1", guard)
                self.assertIsNone(fallback.search(source))

    def test_portal_uses_authoritative_interface_resolver(self):
        source = Path(portal.__file__).read_text()
        code = "\n".join(line for line in source.splitlines()
                         if not line.lstrip().startswith("#"))
        self.assertIn('"/usr/local/sbin/pigpulse-wlan-iface"', code)
        self.assertNotIn('"/sys/class/net"', code)
        self.assertIsNone(re.search(r'["\']wlan[01]["\']', code))

    def test_portal_resolver_failure_never_selects_an_interface(self):
        failed = subprocess.CompletedProcess(
            ["/usr/local/sbin/pigpulse-wlan-iface", "00:1f:05:6c:51:bc"],
            1, stdout="", stderr="radio not found\n",
        )
        with patch.object(portal.subprocess, "run", return_value=failed) as resolver:
            self.assertIsNone(portal._iface_for_mac("00:1f:05:6c:51:bc"))
        resolver.assert_called_once()
        self.assertEqual(
            resolver.call_args.args[0],
            ["/usr/local/sbin/pigpulse-wlan-iface", "00:1f:05:6c:51:bc"],
        )


class WorkerTests(unittest.TestCase):
    def test_waits_for_link_lease_and_route_after_ap_restart(self):
        source = Path(__file__).with_name("pigpulse-portal-connect").read_text()
        match = re.search(r"^wait_uplink\(\) \{.*?^\}", source, re.M | re.S)
        self.assertIsNotNone(match, "worker needs a bounded live recovery check")
        # Run only the real helper, replacing hardware commands with a replay
        # of the measured carrier/DHCP blip. No root, networking or real sleeps.
        harness = r'''
n=0
sleep() { n=$((n + 1)); }
iw() { [ "$n" -ge 1 ] && echo 'Connected to 00:11:22:33:44:55'; }
ip() {
  if [[ "$*" == *addr* ]]; then
    if [ "$n" -ge 2 ]; then echo '6: wlan0sta inet 192.168.254.194/24';
    else echo '6: wlan0sta inet 169.254.1.2/16'; fi
  elif [ "$n" -ge 3 ]; then
    echo 'default via 192.168.254.254 dev wlan0sta metric 200'
  fi
}
wait_uplink 5 || exit 11
[ "$n" -eq 3 ] || exit 12
n=0
wait_uplink 2 && exit 13
[ "$n" -le 2 ] || exit 14
exit 0
'''
        result = subprocess.run(["bash", "-c", match.group(0) + harness],
                                capture_output=True, text=True, timeout=5)
        self.assertEqual(result.returncode, 0, result.stderr)


class LocalAppTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        (root / "index.html").write_text('<html>FULL LOCAL APP</html>')
        (root / "bundle.js").write_text('console.log("local");')
        # Must never be served, even when an operator accidentally copies it.
        (root / ".env").write_text('PRIVATE')
        self.root_patch = patch.object(portal.local_app, "APP_ROOT", root)
        self.root_patch.start()
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), portal.Portal)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base = f"http://127.0.0.1:{self.server.server_port}"

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.root_patch.stop()
        self.tmp.cleanup()

    def get(self, path):
        try:
            return urllib.request.urlopen(self.base + path, timeout=3)
        except urllib.error.HTTPError as exc:
            return exc

    def test_app_and_deep_routes_are_local(self):
        for path in ('/app/', '/app/tabs', '/app/web/dashboard'):
            with self.get(path) as response:
                self.assertEqual(response.status, 200)
                self.assertIn(b'FULL LOCAL APP', response.read())
        with self.get('/app/bundle.js') as response:
            self.assertIn('javascript', response.headers['Content-Type'])

    def test_monitor_page_is_served(self):
        with self.get('/monitor') as response:
            self.assertEqual(response.status, 200)
            body = response.read()
            self.assertIn(b'PigPulse remote monitor', body)
            self.assertIn(b'/api/status', body)

    def test_traversal_secrets_and_missing_assets_are_not_spa(self):
        for path in ('/app/%2e%2e/portal.py', '/app/.env', '/app/missing.js'):
            with self.get(path) as response:
                self.assertIn(response.status, (403, 404))
                self.assertNotIn(b'FULL LOCAL APP', response.read())

    def test_collection_and_pi_endpoint_allowlists(self):
        for path in ('/api/telemetry?collection=_superusers',
                     '/api/pi?ep=../../admin', '/api/pi?ep=https://evil.invalid'):
            with self.get(path) as response:
                self.assertEqual(response.status, 400)

    def test_local_telemetry_contract(self):
        with patch.object(portal.local_app, 'proxy',
                          side_effect=lambda h, *_: h.send_json({'items': []})) as proxy:
            with self.get('/api/telemetry?collection=telemetry&perPage=1'):
                pass
            self.assertEqual(proxy.call_args.args[1], 'pocketbase')
            self.assertEqual(proxy.call_args.args[2],
                             '/api/collections/telemetry/records?perPage=1')

    def test_health_probe_uses_local_pocketbase(self):
        with patch.object(portal.local_app, 'proxy',
                          side_effect=lambda h, *_: h.send_json({'code': 200})) as proxy:
            with self.get('/api/health') as response:
                self.assertEqual(response.status, 200)
            self.assertEqual(proxy.call_args.args[1:], ('pocketbase', '/api/health'))

    def test_cloud_advisor_fails_honestly(self):
        req = urllib.request.Request(self.base + '/api/chat', data=b'{}',
                                     headers={'Content-Type': 'application/json'})
        with self.assertRaises(urllib.error.HTTPError) as caught:
            urllib.request.urlopen(req, timeout=3)
        self.assertEqual(caught.exception.code, 503)
        self.assertIn('internet', json.load(caught.exception)['error'])


if __name__ == "__main__":
    unittest.main()
