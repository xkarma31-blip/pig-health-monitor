#!/usr/bin/env python3
"""
PigPulse v3 — Health Check (verified 2026-09-02)

Checks: PocketBase, Mosquitto, ValKey, Bridge, OpenResty, Thermal-WS, PB records, MQTT round-trip.
Usage:
  python3 scripts/health_check.py           # human table
  python3 scripts/health_check.py --json    # JSON for AI parsing
"""
import os, sys, json, socket, time, subprocess, http.client, urllib.request, urllib.error, shutil

PB_URL="http://127.0.0.1:8090"
# No default on purpose: a hard-coded admin password in source is how
# admin123 ended up in git in the first place. Export PB_EMAIL/PB_PASSWORD,
# or let the PB checks report "skipped: no credentials".
PB_ADMIN_EMAIL=os.environ.get("PB_EMAIL","")
PB_ADMIN_PASS=os.environ.get("PB_PASSWORD","")
HAVE_PB_CREDS=bool(PB_ADMIN_EMAIL and PB_ADMIN_PASS)

def _is_pi():
    """Pi rig has no Docker/AP overlap with the laptop rig (2026-09-28)."""
    try: return b"Raspberry" in open("/proc/device-tree/model","rb").read()
    except Exception: return False
ON_PI = _is_pi()

def listen_ports():
    """LISTEN TCP ports read from /proc — NEVER connects.

    Used for :9090 because that port accepts a single client (the ESP);
    probing it would kick the live audio stream.
    """
    out=set()
    for p in ("/proc/net/tcp","/proc/net/tcp6"):
        try: lines=open(p).read().splitlines()[1:]
        except OSError: continue
        for ln in lines:
            f=ln.split()
            if len(f)>=4 and f[3]=="0A": out.add(int(f[1].rpartition(":")[2],16))
    return out

def wlan0_ip():
    try:
        out=subprocess.check_output(["ip","-o","-4","addr","show","wlan0"],
                                    stderr=subprocess.DEVNULL, timeout=3).decode()
        for tok in out.split():
            if "/" in tok and tok[0].isdigit(): return tok.split("/")[0]
    except Exception: pass
    return ""

def http_get(host, port, path, headers=None, timeout=3):
    try:
        conn=http.client.HTTPConnection(host, port, timeout=timeout)
        conn.request("GET", path, headers=headers or {})
        r=conn.getresponse()
        body=r.read()
        conn.close()
        return r.status, body, dict(r.getheaders())
    except Exception as e:
        return None, str(e).encode(), {}

def tcp_ping(host, port, timeout=2):
    s=socket.socket()
    s.settimeout(timeout)
    try:
        s.connect((host, port))
        s.close()
        return True, "open"
    except Exception as e:
        return False, str(e)

def systemctl_active(unit):
    try:
        out=subprocess.check_output(["systemctl","is-active",unit], stderr=subprocess.DEVNULL, timeout=3).decode().strip()
        return out=="active"
    except: return False

def docker_running(name):
    try:
        out=subprocess.check_output(["docker","inspect","-f","{{.State.Running}}",name], stderr=subprocess.DEVNULL, timeout=3).decode().strip()
        return out=="true"
    except: return False

def check_pb():
    st, body, _ = http_get("127.0.0.1",8090,"/api/health")
    if st==200: return True, f"OK {body[:80].decode(errors='ignore')}"
    return False, f"status={st} body={body[:120]}"

def check_pb_auth():
    try:
        import urllib.request, json as j
        data=j.dumps({"identity":PB_ADMIN_EMAIL,"password":PB_ADMIN_PASS}).encode()
        req=urllib.request.Request(f"{PB_URL}/api/admins/auth-with-password", data=data, headers={"Content-Type":"application/json"})
        with urllib.request.urlopen(req, timeout=4) as r:
            if r.status==200: return True, "auth ok"
            return False, f"status {r.status}"
    except Exception as e:
        return False, str(e)[:120]

def check_pb_tables():
    try:
        import requests
        tok=requests.post(f"{PB_URL}/api/admins/auth-with-password", json={"identity":PB_ADMIN_EMAIL,"password":PB_ADMIN_PASS}, timeout=4).json()["token"]
        hdr={"Authorization":f"Bearer {tok}"}
        cols=requests.get(f"{PB_URL}/api/collections", headers=hdr, timeout=4).json()
        names=[c["name"] for c in cols.get("items",[])]
        # count records
        info={}
        for nm in ["telemetry","alerts","devices","pigs","audio_events"]:
            try:
                r=requests.get(f"{PB_URL}/api/collections/{nm}/records?perPage=1", headers=hdr, timeout=4).json()
                info[nm]=r.get("totalItems",0)
            except: info[nm]="?"
        return True, f"collections={names} counts={info}"
    except ImportError as e:
        # Pi venv may lack `requests` — that is a skip, not a data failure
        return None, f"skip: {e}"
    except Exception as e:
        return False, str(e)[:180]

def check_mqtt_bridge_log():
    try:
        # -b + --grep: look since boot (server-side filter keeps output tiny).
        # The old "-n 5" window showed only recent inserts, so any traffic
        # hid the startup markers → false warn.
        out=subprocess.check_output(
            ["journalctl","-u","pigpulse-bridge","-b","--no-pager",
             "--grep","Connected to MQTT|PocketBase authenticated"],
            stderr=subprocess.DEVNULL, timeout=5).decode()
        if "Connected to MQTT" in out and "PocketBase authenticated" in out:
            return True, "bridge connected since boot"
        return None, out.strip()[-180:] or "no startup markers since boot"
    except Exception as e:
        return None, str(e)[:120]

checks=[]

def add(name, ok, detail):
    checks.append((name, ok, detail))

# Core
ok, d=check_pb(); add("PocketBase :8090", ok, d)
ok2, d2=check_pb_auth(); add("PocketBase auth admin@pigpulse.local", ok2, d2)
ok3, d3=check_pb_tables(); add("PB tables telemetry/alerts/devices/pigs/audio_events", ok3, d3)

ok, d=tcp_ping("127.0.0.1",1883); add("Mosquitto MQTT :1883 loopback", ok, d)
ok, d=tcp_ping("127.0.0.1",9001); add("Mosquitto WS :9001", ok, d)
ok, d=tcp_ping("127.0.0.1",8090); add("PB TCP :8090", ok, d)
if ON_PI:
    # --- Pi rig: the ESP dials the AP address, not loopback. A loopback-only
    #     broker bind used to pass every check while the ESP was refused.
    _wlan = wlan0_ip()
    if _wlan:
        ok, d = tcp_ping(_wlan, 1883)
        add(f"Mosquitto via wlan0 {_wlan} (ESP path)", ok, d)
    else:
        add("Mosquitto via wlan0 (ESP path)", None, "skip: no wlan0 IPv4")
    _l = listen_ports()
    add("ESP ingest :9090 LISTEN (no connect)", 9090 in _l,
        "listening (from /proc)" if 9090 in _l else "not listening")
    add("systemd pigpulse-thermal", systemctl_active("pigpulse-thermal"), "active" if systemctl_active("pigpulse-thermal") else "inactive")
    add("systemd hostapd (AP PigPulse)", systemctl_active("hostapd"), "active" if systemctl_active("hostapd") else "inactive")
    add("systemd dnsmasq (DHCP + CCTV lease)", systemctl_active("dnsmasq"), "active" if systemctl_active("dnsmasq") else "inactive")
    add("systemd pigpulse-cctv", systemctl_active("pigpulse-cctv"), "active" if systemctl_active("pigpulse-cctv") else "inactive")
    ok, d=tcp_ping("127.0.0.1",8091); add("CCTV mjpeg :8091", ok, d)
else:
    # --- laptop rig: docker stack + gateway (absent on the Pi) ---
    add("Mosquitto docker pigpulse-mosquitto", docker_running("pigpulse-mosquitto"), "docker Running" if docker_running("pigpulse-mosquitto") else "not docker")
    ok, d=tcp_ping("127.0.0.1",6379); add("ValKey native :6379", ok, d)
    ok, d=tcp_ping("127.0.0.1",6380); add("ValKey docker :6380", ok, d)
    add("ValKey docker pigpulse-valkey", docker_running("pigpulse-valkey"), "Running" if docker_running("pigpulse-valkey") else "not")
    add("systemd openresty", systemctl_active("openresty"), "active" if systemctl_active("openresty") else "inactive")
    st, body, _ = http_get("127.0.0.1",80,"/health")
    add("OpenResty gateway :80 /health", st==200, body[:100].decode(errors='ignore') if st else str(body[:80]))

# both rigs
add("systemd pigpulse-pocketbase", systemctl_active("pigpulse-pocketbase"), "active" if systemctl_active("pigpulse-pocketbase") else "inactive")
add("systemd pigpulse-bridge", systemctl_active("pigpulse-bridge"), "active" if systemctl_active("pigpulse-bridge") else "inactive")

st, body, _ = http_get("127.0.0.1",8090,"/api/health")
add("PocketBase /api/health direct", st==200, body[:120].decode(errors='ignore') if st else str(body[:80]))

ok, d = (lambda: (http_get("127.0.0.1",8080,"/")[0] is not None, "port open"))() if tcp_ping("127.0.0.1",8080)[0] else (False, "closed")
add("Thermal-WS :8080", tcp_ping("127.0.0.1",8080)[0], d)
if shutil.which("docker"):
    add("Thermal-WS docker pigpulse-thermal-ws", docker_running("pigpulse-thermal-ws"), "Running" if docker_running("pigpulse-thermal-ws") else "not")
    if docker_running("pigpulse-thermal-ws"):
        # LIVE check: an ESTABLISHED TCP connection to broker :1883 (hex 075B,
        # st=01) inside the container's /proc/net/tcp. The old check grepped
        # `docker logs` history — once the log went stale it false-failed even
        # with a healthy live connection.
        try:
            out = subprocess.check_output(
                ["docker", "exec", "pigpulse-thermal-ws", "cat", "/proc/net/tcp"],
                stderr=subprocess.DEVNULL, timeout=4,
            ).decode()
            hits = [parts[2] for parts in (ln.split() for ln in out.splitlines()[1:])
                    if len(parts) >= 4 and parts[3] == "01" and parts[2].endswith(":075B")]
            add("Thermal-WS MQTT linked", bool(hits),
                f"ESTABLISHED -> {hits[0]}" if hits else "no established conn to :1883")
        except Exception as e:
            add("Thermal-WS MQTT linked", None, str(e)[:120])
else:
    add("Thermal-WS docker pigpulse-thermal-ws", None, "skip: no docker binary")

ok, d = check_mqtt_bridge_log()
add("Bridge journal", ok, d)

# MQTT publish round-trip (if paho available)
try:
    import paho.mqtt.client as mqtt, json as j, time as t, requests
    c=mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    c.connect("127.0.0.1",1883,60)
    c.loop_start(); t.sleep(0.6)
    # count before
    import requests as rq
    tok=rq.post(f"{PB_URL}/api/admins/auth-with-password", json={"identity":PB_ADMIN_EMAIL,"password":PB_ADMIN_PASS}, timeout=4).json()["token"]
    hdr={"Authorization":f"Bearer {tok}"}
    before=rq.get(f"{PB_URL}/api/collections/telemetry/records?perPage=1", headers=hdr, timeout=4).json().get("totalItems",0)
    payload=j.dumps({"temperature":38.5,"bodyTemp":38.5,"pigId":"healthcheck","status":"NORMAL","batteryPct":88,"wifiRssi":-45,"timestamp":int(t.time())})
    c.publish("pig/healthcheck-001/telemetry", payload); t.sleep(1.2)
    after=rq.get(f"{PB_URL}/api/collections/telemetry/records?perPage=1", headers=hdr, timeout=4).json().get("totalItems",0)
    c.loop_stop(); c.disconnect()
    # DELETE the probe record again. Leaving it behind meant every health
    # check permanently appended a fake "healthcheck" pig to production
    # telemetry, which is exactly the sort of thing that quietly poisons a
    # dataset nobody is looking at until much later.
    removed=0
    try:
        filt="pigId='healthcheck'"
        rs=rq.get(f"{PB_URL}/api/collections/telemetry/records?perPage=50&filter={filt}", headers=hdr, timeout=4).json()
        for it in rs.get("items",[]):
            d=rq.delete(f"{PB_URL}/api/collections/telemetry/records/{it['id']}", headers=hdr, timeout=4)
            if d.status_code==204: removed+=1
    except Exception as e:
        add("healthcheck probe cleanup", None, f"could not delete probe rows: {str(e)[:100]}")
    else:
        if removed: add("healthcheck probe cleanup", True, f"deleted {removed} probe row(s)")
    add("MQTT→PB round-trip", after>before, f"telemetry {before}->{after} (publish healthcheck-001, probe removed)")
except Exception as e:
    add("MQTT→PB round-trip", None, f"skip: {e}"[:160])

# Also test gateway proxy (laptop rig only — the Pi has no OpenResty on :80)
if not ON_PI:
    try:
        import requests as rq
        tok=rq.post(f"{PB_URL}/api/admins/auth-with-password", json={"identity":PB_ADMIN_EMAIL,"password":PB_ADMIN_PASS}, timeout=4).json()["token"]
        r=rq.get("http://127.0.0.1:80/api/collections/telemetry/records?perPage=1", headers={"Authorization":f"Bearer {tok}"}, timeout=4)
        add("Gateway /api/ proxy :80", r.status_code==200, f"status {r.status_code} items {r.json().get('totalItems','?')}")
    except Exception as e:
        add("Gateway /api/ proxy :80", False, str(e)[:140])
else:
    add("Gateway /api/ proxy :80", None, "skip: no OpenResty on Pi rig")

if "--json" in sys.argv:
    print(json.dumps([{"name":n,"ok":o,"detail":d} for n,o,d in checks], indent=2))
else:
    print(f"PigPulse v3 — Health Check  (2026-09-02, rig: {'pi' if ON_PI else 'laptop'})")
    print("="*74)
    for n, ok, d in checks:
        icon = "✅" if ok==True else "❌" if ok==False else "⚠️"
        print(f"{icon} {n:40} {d}")
    print("="*74)
    fail=sum(1 for _,ok,_ in checks if ok==False)
    warn=sum(1 for _,ok,_ in checks if ok is None)
    print(f"Summary: {len(checks)-fail-warn} ok, {warn} warn, {fail} fail  (fail=needs fix)")
    if fail: sys.exit(1)
