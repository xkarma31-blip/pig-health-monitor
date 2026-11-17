#!/usr/bin/env python3
"""PigPulse local portal — the first page a phone sees on the Pi's Wi-Fi.

Plain HTTP on :80 with no certificate, no framework, no internet dependency.
Three jobs:

  1. ONBOARDING — list the venue's 2.4 GHz networks, take an SSID + password,
     hand the attempt to `pigpulse-portal-connect` (which owns hostapd and
     wpa_supplicant), and report the outcome after the phone reconnects.
  2. LANDING — the offline-first entry point: live dashboard, CCTV, admin.
  3. STATUS — one JSON blob the page polls.

Why this is separate from the thermal dashboard: that one is HTTPS with a
private CA, so a phone that has never seen the Pi gets a certificate warning
before it has any way to trust the cert. The first page has to be plain HTTP and
must work with the uplink completely down.

Security: the Pi is also a station on the venue LAN, so :80 is reachable from
there. Every request is checked against an allowlist (the AP subnet, the tether
subnet, loopback) and anything else gets 403. Mutations are POST-only.
"""

from __future__ import annotations

import ipaddress
import json
import os
import re
import shutil
import socket
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import local_app

VERSION = "1.0.0"

HERE = os.path.dirname(os.path.abspath(__file__))
PAGE = os.path.join(HERE, "portal.html")
RUN = "/run/pigpulse"
PENDING = os.path.join(RUN, "portal-pending.json")
RESULT = os.path.join(RUN, "portal-result.json")
STATUS_FILE = os.path.join(RUN, "wan-sta.status")
LEASES = "/var/lib/misc/dnsmasq.leases"
ENABLED = "/etc/pigpulse/wan-sta.enabled"
SKIPPED = "/etc/pigpulse/wan-sta.skipped"
FIRST_RUN = "/etc/pigpulse/portal-seen"
ALLOW5G = "/etc/pigpulse/wan-sta-allow-5g"

# --- radio identity -------------------------------------------------------
# The USB dongle and the built-in radio SWAP their kernel names across
# reboots, so "wlan0"/"wlan1" are NOT stable identities. Resolve by MAC.
#   BUILTIN  -> 5 GHz capable -> used as the WAN client
#   DONGLE   -> 2.4 GHz only  -> hosts the PigPulse AP (ESP32-S3 + Tapo)
WAN_RADIO_MAC = "dc:a6:32:87:63:a1"
AP_RADIO_MAC = "00:1f:05:6c:51:bc"


def _iface_for_mac(mac: str) -> str | None:
    """Primary netdev of the radio with this MAC (None if not present)."""
    base = "/sys/class/net"
    try:
        names = sorted(os.listdir(base))
    except OSError:
        return None
    for name in names:
        # A virtual station inherits its parent's MAC; skip those so we return
        # the radio's OWN interface, not the vif we attach to it.
        if name.endswith("sta"):
            continue
        try:
            with open(os.path.join(base, name, "address"), "r") as fh:
                if fh.read().strip().lower() == mac.lower():
                    return name
        except OSError:
            continue
    return None


def wan_iface() -> str | None:
    """Interface of the built-in radio (the WAN/STA side)."""
    return _iface_for_mac(WAN_RADIO_MAC)


def ap_iface() -> str | None:
    """Interface of the dongle radio (the PigPulse AP side)."""
    return _iface_for_mac(AP_RADIO_MAC)


def _own_radio_bssids() -> set[str]:
    """MACs of every local radio, so our own AP is never offered upstream."""
    out: set[str] = set()
    base = "/sys/class/net"
    try:
        names = os.listdir(base)
    except OSError:
        return out
    for name in names:
        if not os.path.isdir(os.path.join(base, name, "wireless")):
            continue
        try:
            with open(os.path.join(base, name, "address"), "r") as fh:
                out.add(fh.read().strip().lower())
        except OSError:
            continue
    return out
CONNECT = "/usr/local/sbin/pigpulse-portal-connect"
HOSTED = "https://pig-health-monitor.vercel.app"

ALLOW = [
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("192.168.69.0/24"),   # the Pi's own AP
    ipaddress.ip_network("10.42.0.0/24"),      # laptop tether (bench work)
]

SCAN24 = [
    2412, 2417, 2422, 2427, 2432, 2437, 2442,
    2447, 2452, 2457, 2462, 2467, 2472,
]
SCAN5 = [
    5180, 5200, 5220, 5240, 5260, 5280, 5300, 5320,
    5500, 5580, 5700, 5745, 5785, 5825,
]

_scan_lock = threading.Lock()
_scan_cache: tuple[float, list[dict]] = (0.0, [])
_net_cache = {"at": 0.0, "up": False}


# --------------------------------------------------------------------- helpers
def run(cmd: list[str], timeout: float = 20) -> str:
    """Run a command, return stdout, never raise."""
    try:
        p = subprocess.run(
            cmd, capture_output=True, text=True, timeout=timeout, check=False
        )
        return p.stdout or ""
    except Exception:
        return ""


def read(path: str, default: str = "") -> str:
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as fh:
            return fh.read().strip()
    except OSError:
        return default


def internet_up(max_age: float = 20.0) -> bool:
    """Is there a real path out? Cheap TCP probe, cached."""
    now = time.time()
    if now - _net_cache["at"] < max_age:
        return bool(_net_cache["up"])
    up = False
    for host, port in (("1.1.1.1", 53), ("8.8.8.8", 53), ("9.9.9.9", 53)):
        try:
            with socket.create_connection((host, port), timeout=2):
                up = True
                break
        except OSError:
            continue
    _net_cache["at"], _net_cache["up"] = now, up
    return up


def ensure_station() -> tuple[str | None, bool]:
    """Pick the radio to scan with, and whether the AP must come down for it.

    Preference order:
      1. the WAN radio (its own interface) — the AP keeps beaconing, so the
         sensors never drop;
      2. the AP radio — only when the WAN radio is unusable (e.g. the USB
         dongle has failed). A radio cannot scan while it hosts the AP, so the
         AP is briefly stopped and restored afterwards.

    Returns (interface, stop_ap_first).
    """
    iface = wan_iface()
    if iface:
        run(["ip", "link", "set", iface, "up"], 8)
        return iface, False
    ap = ap_iface()
    if ap:
        return ap, True
    return None, False


def scan_networks(force: bool = False) -> list[dict]:
    """2.4 GHz networks the Pi can see, strongest first.

    Measured 2026-11-12: this works while hostapd is beaconing, so the phone
    keeps its link during the listing. Only the CONNECT step drops it.
    """
    global _scan_cache
    with _scan_lock:
        age = time.time() - _scan_cache[0]
        if not force and age < 12 and _scan_cache[1]:
            return _scan_cache[1]
        scan_if, stop_ap = ensure_station()
        if not scan_if:
            return []
        # A radio cannot scan while it hosts the AP, so the AP is briefly
        # stopped when we have to scan on the AP radio (the WAN radio being
        # unusable, e.g. a failed USB dongle). It is restored immediately after.
        ap_stopped = False
        if stop_ap:
            run(["systemctl", "stop", "hostapd"], 15)
            ap_stopped = True
            time.sleep(2)
        try:
            # Plain scan: `iw dev X scan freq <list>` returns EINVAL on these
            # drivers, so let the driver scan every band it supports.
            out = run(["iw", "dev", scan_if, "scan"], timeout=45)
        finally:
            if ap_stopped:
                run(["systemctl", "start", "hostapd"], 20)
                time.sleep(2)
        seen: dict[str, dict] = {}
        cur: dict | None = None
        for line in out.splitlines():
            if line.startswith("BSS "):
                mac = line.split()[1].split("(")[0]
                freq = 0
                try:
                    if "freq:" in line:
                        freq = int(float(line.split("freq:", 1)[1].split()[0]))
                except (ValueError, IndexError):
                    freq = 0
                band = "5G" if freq >= 4900 else "24"
                cur = {"bssid": mac, "band": band, "freq": freq}
            elif cur is None:
                continue
            elif line.strip().startswith("freq:"):
                try:
                    cur["freq"] = int(float(line.split(":")[1]))
                    cur["band"] = "5G" if cur["freq"] >= 4900 else "24"
                except (ValueError, IndexError):
                    pass
            elif line.strip().startswith("signal:"):
                try:
                    cur["signal"] = float(line.split(":")[1].split()[0])
                except (ValueError, IndexError):
                    pass
            elif line.strip().startswith("SSID:"):
                cur["ssid"] = line.split(":", 1)[1].strip()
                key = f"{cur.get('ssid')}|{cur.get('freq')}"
                prev = seen.get(key)
                if prev is None or cur.get("signal", -999) > prev.get("signal", -999):
                    seen[key] = dict(cur)
                cur = None
        own = _own_radio_bssids()
        nets = [
            n for n in seen.values()
            if n.get("ssid") and n.get("freq") and n["ssid"] != "\x00" * 32
            # Never offer OUR OWN AP as an upstream: picking it makes the WAN
            # client target this Pi itself ("connected", no internet, no error).
            and str(n.get("bssid", "")).lower() not in own
        ]
        nets.sort(key=lambda n: n.get("signal", -999), reverse=True)
        _scan_cache = (time.time(), nets)
        return nets


def ap_info() -> dict:
    info = {"channel": None, "freq": None, "clients": 0, "ssid": None}
    out = run(["iw", "dev", ap_iface() or "wlan0", "info"], 6)
    m = re.search(r"channel (\d+) \((\d+) MHz\)", out)
    if m:
        info["channel"], info["freq"] = int(m.group(1)), int(m.group(2))
    out = run(["hostapd_cli", "-p", "/var/run/hostapd", "-i", ap_iface() or "wlan0", "status"], 6)
    for line in out.splitlines():
        # `status` reports ssid[0]=..., `get_config` reports ssid=...
        if line.startswith("ssid[0]=") or line.startswith("ssid="):
            info["ssid"] = line.split("=", 1)[1]
            break
    try:
        with open(LEASES, "r", encoding="utf-8", errors="replace") as fh:
            info["clients"] = sum(1 for ln in fh if ln.strip())
    except OSError:
        pass
    if not info["clients"]:
        out = run(["hostapd_cli", "-p", "/var/run/hostapd", "-i", ap_iface() or "wlan0", "all_sta"], 6)
        info["clients"] = sum(1 for ln in out.splitlines() if re.match(r"^[0-9a-f]{2}:", ln))
    return info


def associated() -> bool:
    """Is the uplink station associated RIGHT NOW?

    The status file is written once, when the uplink finishes. Nothing rewrites
    it if the link drops later, so a stale `UP` would claim internet that is not
    there — measured 2026-11-12: `wan-sta.status` said
    `UP ip=192.168.254.194` while `iw dev wlan0sta link` said
    `Not connected` and the interface held a 169.254 address.
    """
    return "Connected to" in run(["iw", "dev", wan_iface() or "wlan0", "link"], 5)


def tailscale_ip() -> str:
    """Return the Pi's Tailscale IPv4 address, or '' when the tunnel is down."""
    try:
        out = subprocess.check_output(
            ["ip", "-4", "-o", "addr", "show", "tailscale0"],
            text=True,
            timeout=2,
        )
        match = re.search(r"inet (\d+\.\d+\.\d+\.\d+)", out)
        return match.group(1) if match else ""
    except (OSError, subprocess.SubprocessError):
        return ""


def status() -> dict:
    raw = read(STATUS_FILE)
    state = raw.split(" ", 1)[0] if raw else "UNKNOWN"
    up = associated()
    if state == "UP" and not up:
        state = "DOWN link-lost"
    venue = {
        "ssid": read("/etc/pigpulse/wan-sta.ssid"),
        "bssid": read("/etc/pigpulse/wan-sta.bssid"),
        "freq": read("/etc/pigpulse/wan-sta.freq"),
    }
    if venue["freq"].isdigit():
        venue["freq"] = int(venue["freq"])
    ip = read_addr = ""
    out = run(["ip", "-4", "-o", "addr", "show", wan_iface() or "wlan0"], 5)
    m = re.search(r"inet (\d+\.\d+\.\d+\.\d+)", out)
    # A 169.254 address is not an uplink: it means DHCP failed. Reporting it as
    # the uplink IP is how the page came to show "UP · 169.254.134.112".
    if m and not m.group(1).startswith("169.254."):
        ip = read_addr = m.group(1)
    if state == "UP" and not ip:
        state = "DOWN no-dhcp"
    ts_ip = tailscale_ip()
    return {
        "version": VERSION,
        "state": state,
        "raw": raw,
        "associated": up,
        "venue": venue,
        "has_venue": bool(venue["ssid"] and venue["bssid"] and venue["freq"]),
        "mode_enabled": os.path.exists(ENABLED),
        "skipped": os.path.exists(SKIPPED),
        "uplink_ip": ip,
        "internet": internet_up(),
        "ap": ap_info(),
        "hosted": HOSTED,
        "remote": f"http://{ts_ip}:8090" if ts_ip else "",
        "allow_5g": True,
    }


def read_result() -> dict | None:
    if not os.path.exists(RESULT):
        return None
    try:
        with open(RESULT, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return None


def valid_psk(psk: str) -> bool:
    if len(psk) == 64 and re.fullmatch(r"[0-9a-fA-F]{64}", psk):
        return True
    return 8 <= len(psk) <= 63 and all(32 <= ord(c) <= 126 for c in psk)


# ---------------------------------------------------------------------- server
class Portal(BaseHTTPRequestHandler):
    server_version = "PigPulsePortal/" + VERSION
    protocol_version = "HTTP/1.0"
    timeout = 30

    # -- plumbing ---------------------------------------------------------
    def log_message(self, fmt: str, *args) -> None:  # noqa: A003
        print("%s %s" % (self.address_string(), fmt % args), flush=True)

    def allowed(self) -> bool:
        try:
            addr = ipaddress.ip_address(self.client_address[0])
        except ValueError:
            return False
        return any(addr in net for net in ALLOW)

    def send_json(self, obj: dict, code: int = 200) -> None:
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self._write(body)

    def send_page(self, path: str) -> None:
        try:
            with open(path, "rb") as fh:
                body = fh.read()
        except OSError:
            self.send_json({"error": "page missing"}, 500)
            return
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self._write(body)

    def _write(self, body: bytes) -> None:
        # The phone drops its Wi-Fi mid-response on connect; never traceback on it.
        try:
            self.wfile.write(body)
            self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass

    def body_json(self) -> dict:
        try:
            n = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            return {}
        if n <= 0 or n > 8192:
            return {}
        try:
            return json.loads(self.rfile.read(n) or b"{}")
        except ValueError:
            return {}

    # -- routes -----------------------------------------------------------
    def do_GET(self) -> None:  # noqa: N802
        if not self.allowed():
            self.send_json({"error": "not allowed"}, 403)
            return
        path = self.path.split("?", 1)[0]
        if local_app.get(self):
            return
        if path in ("/", "/index.html", "/portal.html"):
            self.send_page(PAGE)
        elif path == "/api/status":
            self.send_json(status())
        elif path == "/api/scan":
            force = "force=1" in self.path
            self.send_json({"networks": scan_networks(force=force), "at": int(time.time())})
        elif path == "/api/connect-result":
            self.send_json({"result": read_result()})
        elif path == "/api/config":
            self.send_json({"hosted": HOSTED, "version": VERSION})
        elif path == "/favicon.ico":
            self.send_response(204)
            self.end_headers()
        else:
            self.send_json({"error": "not found"}, 404)

    def do_POST(self) -> None:  # noqa: N802
        if not self.allowed():
            self.send_json({"error": "not allowed"}, 403)
            return
        path = self.path.split("?", 1)[0]
        if path == "/api/chat":
            self.send_json({"error": "Cloud advisor needs internet; use the optional hosted site. Local monitoring still works."}, 503)
            return
        if path == "/api/scan":
            self.send_json({"networks": scan_networks(force=True), "at": int(time.time())})
            return
        if path == "/api/skip":
            try:
                with open(SKIPPED, "w", encoding="utf-8") as fh:
                    fh.write(time.strftime("%F %T\n"))
                os.chmod(SKIPPED, 0o644)
            except OSError as exc:
                self.send_json({"error": str(exc)}, 500)
                return
            self.send_json({"ok": True, "skipped": True})
            return
        if path == "/api/connect":
            self.handle_connect()
            return
        self.send_json({"error": "not found"}, 404)

    def handle_connect(self) -> None:
        data = self.body_json()
        ssid = str(data.get("ssid") or "").strip()
        psk = str(data.get("psk") or "")
        bssid = str(data.get("bssid") or "").strip().lower()
        try:
            freq = int(data.get("freq") or 0)
        except (TypeError, ValueError):
            freq = 0

        if not ssid or len(ssid.encode()) > 32 or any(c in ssid for c in "\r\n\t\0"):
            self.send_json({"error": "invalid ssid"}, 400)
            return
        if not valid_psk(psk):
            self.send_json({"error": "invalid password (8-63 characters, or 64 hex)"}, 400)
            return
        if not re.fullmatch(r"([0-9a-f]{2}:){5}[0-9a-f]{2}", bssid):
            self.send_json({"error": "invalid bssid"}, 400)
            return
        if not (2412 <= freq <= 2472 or (os.path.exists(ALLOW5G) and 4900 <= freq <= 5900)):
            self.send_json({"error": "invalid frequency"}, 400)
            return
        if os.path.exists(PENDING):
            try:
                if time.time() - os.path.getmtime(PENDING) < 90:
                    self.send_json({"error": "an attempt is already running"}, 409)
                    return
            except OSError:
                pass

        os.makedirs(RUN, exist_ok=True)
        tmp = PENDING + ".tmp"
        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump({"ssid": ssid, "psk": psk, "bssid": bssid, "freq": freq}, fh)
        os.replace(tmp, PENDING)
        try:
            os.unlink(RESULT)
        except OSError:
            pass
        try:
            with open(FIRST_RUN, "a", encoding="utf-8"):
                pass
        except OSError:
            pass

        # Detached: the reply must reach the phone before the radio moves.
        subprocess.Popen(
            [CONNECT],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
            close_fds=True,
        )
        self.send_json(
            {
                "accepted": True,
                "note": "the Wi-Fi will drop for about 15 seconds while the Pi "
                        "switches channel; this page comes back on its own",
            },
            202,
        )


def main() -> None:
    if not shutil.which("iw") and not os.path.exists("/usr/sbin/iw"):
        print("warning: iw not found; scanning will return nothing", flush=True)
    os.makedirs(RUN, exist_ok=True)
    httpd = ThreadingHTTPServer(("0.0.0.0", 80), Portal)
    httpd.daemon_threads = True
    print(f"pigpulse portal {VERSION} on :80 (page={PAGE})", flush=True)
    httpd.serve_forever()


if __name__ == "__main__":
    main()
