#!/usr/bin/env python3
"""pi_diag.py — one-shot diagnosis of the PigPulse Pi, run ON the Pi.

    python3 pi_diag.py            # human table
    python3 pi_diag.py --json     # machine readable

Ground rules baked in:
  * stdlib only (no curl / requests / iw required — extras used if present)
  * NEVER opens a socket to :9090 — that port serves exactly ONE client (the
    ESP); probing it would kick the live audio stream. 9090 is checked by
    reading /proc/net/tcp LISTEN state instead.
  * every claim it prints is measured here, nothing is assumed.

Provenance of the checks (2026-09-28 session):
  * /cctv proxy behaviour from backend/thermal-pi/web_server.py:310-335
  * MJPEG server from backend/cctv/tapo_mjpeg_server.py (binds 0.0.0.0:8091
    IMMEDIATELY — "listening" does NOT mean the camera works)
  * fusion.html gives up after 6 s (static/fusion.html CCTV watchdog)
  * camera lease expected: 18:69:45:fb:d4:be CCTV 192.168.69.2
  * ESP lease expected:    68:ee:8f:dd:31:3c  -> 192.168.69.x
"""
import json
import os
import shutil
import socket
import ssl
import subprocess
import sys
import time

CAMERA_MAC = "18:69:45:fb:d4:be"
ESP_MAC = "68:ee:8f:dd:31:3c"
UNITS = ["mosquitto", "pigpulse-mosquitto-bootstrap", "pigpulse-bridge",
         "pigpulse-pocketbase", "pigpulse-thermal", "pigpulse-cctv",
         "hostapd", "dnsmasq"]
# ports checked WITHOUT connecting (see header)
PORTS = [1883, 8080, 8090, 8091, 9001, 9090]
results = []
LAST_ERR = ""


def add(name, state, detail, nxt=""):
    """state: PASS | FAIL | WARN | INFO"""
    results.append({"name": name, "state": state, "detail": detail, "next": nxt})


def mosq_config_check():
    """Fatal duplicate options across the mosquitto config set.

    mosquitto 2.0 exits status 3 (BEFORE opening any port) when
    `persistence_location` appears twice, or when the identical
    `log_dest file ...` line appears twice — systemd Restart=on-failure
    then loops forever. That exact defect crash-looped the Pi's broker
    2026-09-23..28 while the ESP sat at rc=-2, and the journal was
    volatile, so nothing visible was left behind. Checked here statically
    so it can never hide again.
    """
    files = []
    main_conf = "/etc/mosquitto/mosquitto.conf"
    if os.path.isfile(main_conf):
        files.append(main_conf)
    try:
        files += sorted(
            os.path.join("/etc/mosquitto/conf.d", n)
            for n in os.listdir("/etc/mosquitto/conf.d") if n.endswith(".conf"))
    except OSError:
        pass
    if not files:
        add("mosquitto config duplicates", "WARN", "no mosquitto config found")
        return
    seen: dict = {}          # normalized ident -> "file:line" of first hit
    dups = []
    for path in files:
        try:
            with open(path, encoding="utf-8", errors="replace") as fh:
                lines = fh.read().splitlines()
        except OSError as e:
            add("mosquitto config duplicates", "WARN", f"{path}: {e}")
            return
        for i, raw in enumerate(lines, 1):
            s = raw.split("#", 1)[0].strip()
            if not s:
                continue
            parts = s.split(None, 1)
            key = parts[0]
            val = parts[1].strip() if len(parts) > 1 else ""
            if key == "persistence_location":
                ident = "persistence_location"          # ANY repeat is fatal
            elif key == "log_dest" and val.lower().startswith("file"):
                ident = " ".join(s.split())             # identical file dest is fatal
            else:
                continue
            if ident in seen:
                dups.append(f"{ident} at {path}:{i} duplicates {seen[ident]}")
            else:
                seen[ident] = f"{path}:{i}"
    if dups:
        add("mosquitto config duplicates", "FAIL", "; ".join(dups)[:300],
            nxt="mosquitto exits status=3 on this -> systemd crash loop -> "
                "ESP MQTT rc=-2. Delete the duplicate line from ONE file, "
                "then: sudo systemctl restart mosquitto && ss -lntp | grep 1883")
    else:
        add("mosquitto config duplicates", "PASS",
            f"clean across {len(files)} file(s)")


def listen_addrs(port):
    """Bind addresses of LISTEN sockets on `port`, read from /proc (no connect)."""
    out = set()
    want = f"{port:04X}"
    for path, v6 in (("/proc/net/tcp", False), ("/proc/net/tcp6", True)):
        try:
            lines = open(path).read().splitlines()[1:]
        except OSError:
            continue
        for ln in lines:
            f = ln.split()
            if len(f) < 4 or f[3] != "0A":        # 0A = LISTEN
                continue
            addr, _, p = f[1].rpartition(":")
            if p.upper() != want:
                continue
            out.add(decode_addr(addr, v6))
    return out


def decode_addr(hexaddr, v6):
    try:
        if not v6:
            b = bytes.fromhex(hexaddr)[::-1]                 # little-endian v4
            return socket.inet_ntop(socket.AF_INET, b)
        raw = bytes.fromhex(hexaddr)
        words = [raw[i:i + 4][::-1] for i in range(0, 16, 4)]  # 4x LE words
        return socket.inet_ntop(socket.AF_INET6, b"".join(words))
    except Exception:
        return hexaddr


def unit(name):
    try:
        return subprocess.run(["systemctl", "is-active", name],
                              capture_output=True, text=True, timeout=5).stdout.strip()
    except Exception as e:
        return f"err:{e}"


def http_headless_get(host, port, path, tls, timeout=6):
    """GET that returns as soon as data arrives (recv, not buffered read).

    Never raises: on any error returns b"" and records LAST_ERR.
    """
    global LAST_ERR
    LAST_ERR = ""
    try:
        ctx = ssl._create_unverified_context() if tls else None
        s = socket.create_connection((host, port), timeout=timeout)
        if ctx:
            s = ctx.wrap_socket(s, server_hostname="localhost")
        s.sendall(f"GET {path} HTTP/1.0\r\nHost: {host}\r\n"
                  f"Connection: close\r\n\r\n".encode())
        s.settimeout(timeout)
        buf = b""
        t0 = time.time()
        while time.time() - t0 < timeout:
            try:
                d = s.recv(65536)
            except socket.timeout:
                break
            if not d:
                break
            buf += d
            if b"\r\n\r\n" in buf and len(buf) > 4096:
                break
        try:
            s.close()
        except Exception:
            pass
        return buf
    except Exception as e:
        LAST_ERR = f"{type(e).__name__}: {e}"[:120]
        return b""


def status_line(buf):
    return buf.split(b"\r\n", 1)[0].decode(errors="replace") if buf else ""


def main():
    as_json = "--json" in sys.argv

    # ---------------- 1. systemd units ----------------
    for u in UNITS:
        st = unit(u)
        if st == "active":
            add(f"unit {u}", "PASS", "active")
        elif st in ("inactive", "failed", "activating"):
            add(f"unit {u}", "FAIL", st,
                nxt=f"sudo systemctl status {u} --no-pager -l; "
                    f"sudo journalctl -u {u} -n 30 --no-pager")
        else:
            add(f"unit {u}", "WARN", st)

    # ---------------- 1b. mosquitto config (the 2026-09-23..28 crash loop) ------
    mosq_config_check()

    # ---------------- 2. listening ports (no connect!) ----------------
    for p in PORTS:
        addrs = listen_addrs(p)
        if not addrs:
            hint = ("sudo ss -lntp | grep 9090   # ingest lives inside "
                    "pigpulse-thermal" if p == 9090 else
                    "nothing is LISTENING here")
            add(f"listen :{p}", "FAIL", "not listening", nxt=hint)
        else:
            add(f"listen :{p}", "PASS", ", ".join(sorted(addrs)))

    # ---------------- 3. THE mosquitto binding question ----------------
    # ESP connects to <wlan0 ip>:1883. If the broker only binds 127.0.0.1,
    # localhost checks stay green while the ESP gets refused (rc=-2).
    wlan0_ip = "192.168.69.1"
    try:
        out = subprocess.run(["ip", "-o", "-4", "addr", "show", "wlan0"],
                             capture_output=True, text=True, timeout=5).stdout
        for tok in out.split():
            if "/" in tok and tok[0].isdigit():
                wlan0_ip = tok.split("/")[0]
                break
    except Exception:
        pass
    a1883 = listen_addrs(1883)
    if a1883:
        loopbacks = {"127.0.0.1", "::1"}
        if any(a not in loopbacks for a in a1883):
            add("mqtt reachable from ESP?", "PASS",
                f"bound to {sorted(a1883)} (non-loopback present)")
        else:
            add("mqtt reachable from ESP?", "FAIL",
                f"ONLY loopback {sorted(a1883)} — ESP is refused on "
                f"{wlan0_ip}:1883 while localhost checks stay green",
                nxt="printf 'listener 1883\\nallow_anonymous true\\n' | "
                    "sudo tee /etc/mosquitto/conf.d/10-listen.conf && "
                    "sudo systemctl restart mosquitto")

    # ---------------- 4. raw TCP: loopback vs AP address ----------------
    for label, host in (("loopback", "127.0.0.1"), ("AP ip", wlan0_ip)):
        try:
            s = socket.create_connection((host, 1883), timeout=2)
            s.close()
            add(f"mqtt tcp {label} {host}", "PASS", "accepts")
        except Exception as e:
            add(f"mqtt tcp {label} {host}", "FAIL", str(e)[:60],
                nxt="systemctl is-active mosquitto && journalctl -u mosquitto "
                    "-n 30 --no-pager")

    # ---------------- 5. DHCP leases (camera + ESP) ----------------
    try:
        leases = open("/var/lib/misc/dnsmasq.leases").read().splitlines()
    except Exception as e:
        leases = []
        add("dnsmasq leases", "WARN", str(e)[:60])
    cam = [l for l in leases if CAMERA_MAC in l]
    esp = [l for l in leases if ESP_MAC in l]
    add("camera lease (CCTV)", "PASS" if cam else "FAIL",
        cam[0] if cam else f"no lease for {CAMERA_MAC}",
        nxt=("" if cam else "camera not on the AP — check the Tapo cam power/2.4GHz "
             "and `iw dev wlan0 station dump`"))
    add("ESP lease (mic)", "PASS" if esp else "FAIL",
        esp[0] if esp else f"no lease for {ESP_MAC}")

    # ---------------- 6. AP clients actually attached ----------------
    try:
        sd = subprocess.run(["iw", "dev", "wlan0", "station", "dump"],
                            capture_output=True, text=True, timeout=5)
        if sd.returncode == 0:
            stations = [l.split()[1] for l in sd.stdout.splitlines()
                        if l.startswith("Station ")]
            add("AP clients (iw station dump)", "PASS" if stations else "WARN",
                f"{len(stations)} attached: {', '.join(stations) or 'none'}")
        else:
            add("AP clients (iw station dump)", "WARN", "iw present but failed")
    except FileNotFoundError:
        add("AP clients (iw station dump)", "WARN", "iw not installed — "
            "use: cat /var/lib/misc/dnsmasq.leases")

    # ---------------- 7. ESP ingest status ----------------
    buf = http_headless_get("127.0.0.1", 8080, "/esp/status", tls=True, timeout=5)
    if "200" in status_line(buf):
        body = buf.split(b"\r\n\r\n", 1)[-1]
        try:
            st = json.loads(body)
            detail = (f"connected={st.get('connected')} rate={st.get('rate')} "
                      f"nonzeroPct={st.get('nonzeroPct')} peer={st.get('peer')}")
            ok = st.get("connected") and (st.get("nonzeroPct") or 0) > 50
            add("ESP ingest /esp/status", "PASS" if ok else "WARN", detail,
                nxt=("" if ok else "connected=False means the ESP stream is not "
                     "arriving — check the laptop serial log"))
        except Exception:
            add("ESP ingest /esp/status", "WARN",
                body[:120].decode(errors="replace"))
    else:
        add("ESP ingest /esp/status", "FAIL",
            status_line(buf) or f"no reply ({LAST_ERR})",
            nxt="sudo systemctl restart pigpulse-thermal")

    # ---------------- 8. CCTV chain (proxy -> mjpeg -> camera) ----------------
    buf = http_headless_get("127.0.0.1", 8080, "/cctv", tls=True, timeout=8)
    head = status_line(buf)
    if not buf:
        add("CCTV /cctv proxy", "FAIL", f"no reply from :8080 ({LAST_ERR})",
            nxt="sudo systemctl status pigpulse-thermal")
    elif "503" in head:
        add("CCTV /cctv proxy", "FAIL",
            "503 CCTV unavailable -> 127.0.0.1:8091 not accepting",
            nxt="sudo systemctl status pigpulse-cctv; sudo journalctl -u "
                "pigpulse-cctv -n 30 --no-pager")
    elif "200" in head:
        if b"\xff\xd8" in buf:
            add("CCTV frames", "PASS", "JPEG data flowing end-to-end")
        else:
            add("CCTV frames", "WARN",
                "proxy accepted (mjpeg server IS listening) but no JPEG in 8s "
                "-> camera not delivering",
                nxt="journalctl -u pigpulse-cctv -f  # look for: 'no camera "
                    "answering on any candidate'; verify lease above + "
                    "`which ffmpeg`")
    else:
        add("CCTV /cctv proxy", "FAIL", head[:60])

    # ---------------- 9. fusion page + PocketBase ----------------
    buf = http_headless_get("127.0.0.1", 8080, "/static/fusion.html",
                            tls=True, timeout=5)
    add("fusion page /static/fusion.html",
        "PASS" if "200" in status_line(buf) else "FAIL",
        status_line(buf) or f"no reply ({LAST_ERR})")

    buf = http_headless_get("127.0.0.1", 8090, "/api/health", tls=False, timeout=5)
    add("PocketBase /api/health",
        "PASS" if "200" in status_line(buf) else "FAIL",
        status_line(buf) or f"no reply ({LAST_ERR})")

    # ---------------- 10. ffmpeg (silent failure source) ----------------
    ff = shutil.which("ffmpeg")
    add("ffmpeg", "PASS" if ff else "FAIL", ff or "not installed",
        nxt=("" if ff else "sudo apt-get install -y ffmpeg"))

    # ---------------- 11. journal tails ----------------
    for u in ("pigpulse-cctv", "mosquitto"):
        try:
            j = subprocess.run(
                ["journalctl", "-u", u, "-n", "3", "--no-pager", "-q"],
                capture_output=True, text=True, timeout=6)
            tail = " | ".join(l.strip() for l in j.stdout.splitlines() if l.strip())
            add(f"journal {u}", "INFO", tail[-220:] or "(empty)")
        except Exception as e:
            add(f"journal {u}", "INFO", f"unavailable: {e}"[:80])

    # ---------------- report ----------------
    if as_json:
        print(json.dumps(results, indent=2))
        return
    print("PigPulse PI DIAG  (run on the Pi)")
    print("=" * 78)
    for r in results:
        mark = {"PASS": "OK  ", "FAIL": "FAIL", "WARN": "WARN", "INFO": "info"}[r["state"]]
        print(f"[{mark}] {r['name']:34} {r['detail']}")
        if r["next"] and r["state"] in ("FAIL", "WARN"):
            print(f"       NEXT: {r['next']}")
    print("=" * 78)
    nf = sum(1 for r in results if r["state"] == "FAIL")
    nw = sum(1 for r in results if r["state"] == "WARN")
    print(f"FAIL={nf}  WARN={nw}  "
          f"(PASS={sum(1 for r in results if r['state']=='PASS')})")
    sys.exit(1 if nf else 0)


if __name__ == "__main__":
    main()
