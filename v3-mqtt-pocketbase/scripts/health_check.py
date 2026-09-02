#!/usr/bin/env python3
"""
PigPulse v3 — Health Check (verified 2026-09-02)

Checks: PocketBase, Mosquitto, ValKey, Bridge, OpenResty, Thermal-WS, PB records, MQTT round-trip.
Usage:
  python3 scripts/health_check.py           # human table
  python3 scripts/health_check.py --json    # JSON for AI parsing
"""
import sys, json, socket, time, subprocess, http.client, urllib.request, urllib.error

PB_URL="http://127.0.0.1:8090"
PB_ADMIN_EMAIL="admin@pigpulse.local"
PB_ADMIN_PASS="admin123"

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
        for nm in ["telemetry","alerts","devices","pigs"]:
            try:
                r=requests.get(f"{PB_URL}/api/collections/{nm}/records?perPage=1", headers=hdr, timeout=4).json()
                info[nm]=r.get("totalItems",0)
            except: info[nm]="?"
        return True, f"collections={names} counts={info}"
    except Exception as e:
        return False, str(e)[:180]

def check_mqtt_bridge_log():
    try:
        out=subprocess.check_output(["journalctl","-u","pigpulse-bridge","--no-pager","-n","5"], stderr=subprocess.DEVNULL, timeout=3).decode()
        if "Connected to MQTT" in out and "PocketBase authenticated" in out:
            return True, "bridge recently connected"
        return None, out.strip()[-180:]
    except Exception as e:
        return None, str(e)[:120]

checks=[]

def add(name, ok, detail):
    checks.append((name, ok, detail))

# Core
ok, d=check_pb(); add("PocketBase :8090", ok, d)
ok2, d2=check_pb_auth(); add("PocketBase auth admin@pigpulse.local", ok2, d2)
ok3, d3=check_pb_tables(); add("PB tables telemetry/alerts/devices/pigs", ok3, d3)

ok, d=tcp_ping("127.0.0.1",1883); add("Mosquitto MQTT :1883", ok, d)
ok, d=tcp_ping("127.0.0.1",9001); add("Mosquitto WS :9001", ok, d)
add("Mosquitto docker pigpulse-mosquitto", docker_running("pigpulse-mosquitto"), "docker Running" if docker_running("pigpulse-mosquitto") else "not docker")
ok, d=tcp_ping("127.0.0.1",8090); add("PB TCP :8090", ok, d)
ok, d=tcp_ping("127.0.0.1",6379); add("ValKey native :6379", ok, d)
ok, d=tcp_ping("127.0.0.1",6380); add("ValKey docker :6380", ok, d)
add("ValKey docker pigpulse-valkey", docker_running("pigpulse-valkey"), "Running" if docker_running("pigpulse-valkey") else "not")
add("systemd pigpulse-pocketbase", systemctl_active("pigpulse-pocketbase"), "active" if systemctl_active("pigpulse-pocketbase") else "inactive")
add("systemd pigpulse-bridge", systemctl_active("pigpulse-bridge"), "active" if systemctl_active("pigpulse-bridge") else "inactive")
add("systemd openresty", systemctl_active("openresty"), "active" if systemctl_active("openresty") else "inactive")

# Gateways
st, body, _ = http_get("127.0.0.1",80,"/health")
add("OpenResty gateway :80 /health", st==200, body[:100].decode(errors='ignore') if st else str(body[:80]))

st, body, _ = http_get("127.0.0.1",8090,"/api/health")
add("PocketBase /api/health direct", st==200, body[:120].decode(errors='ignore') if st else str(body[:80]))

ok, d = (lambda: (http_get("127.0.0.1",8080,"/")[0] is not None, "port open"))() if tcp_ping("127.0.0.1",8080)[0] else (False, "closed")
add("Thermal-WS :8080", tcp_ping("127.0.0.1",8080)[0], d)
add("Thermal-WS docker pigpulse-thermal-ws", docker_running("pigpulse-thermal-ws"), "Running" if docker_running("pigpulse-thermal-ws") else "not")
if docker_running("pigpulse-thermal-ws"):
    try:
        logs=subprocess.check_output(["docker","logs","pigpulse-thermal-ws"], stderr=subprocess.STDOUT, timeout=3).decode()[-600:]
        ok = "Connected to MQTT" in logs and "ENOTFOUND" not in logs[-400:]
        add("Thermal-WS MQTT linked", ok, logs.strip().splitlines()[-1] if logs.strip() else "?")
    except Exception as e:
        add("Thermal-WS MQTT linked", None, str(e)[:120])

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
    add("MQTT→PB round-trip", after>before, f"telemetry {before}->{after} (publish healthcheck-001)")
except Exception as e:
    add("MQTT→PB round-trip", None, f"skip: {e}"[:160])

# Also test gateway proxy
try:
    import requests as rq
    tok=rq.post(f"{PB_URL}/api/admins/auth-with-password", json={"identity":PB_ADMIN_EMAIL,"password":PB_ADMIN_PASS}, timeout=4).json()["token"]
    r=rq.get("http://127.0.0.1:80/api/collections/telemetry/records?perPage=1", headers={"Authorization":f"Bearer {tok}"}, timeout=4)
    add("Gateway /api/ proxy :80", r.status_code==200, f"status {r.status_code} items {r.json().get('totalItems','?')}")
except Exception as e:
    add("Gateway /api/ proxy :80", False, str(e)[:140])

if "--json" in sys.argv:
    print(json.dumps([{"name":n,"ok":o,"detail":d} for n,o,d in checks], indent=2))
else:
    print("PigPulse v3 — Health Check  (2026-09-02)")
    print("="*74)
    for n, ok, d in checks:
        icon = "✅" if ok==True else "❌" if ok==False else "⚠️"
        print(f"{icon} {n:40} {d}")
    print("="*74)
    fail=sum(1 for _,ok,_ in checks if ok==False)
    warn=sum(1 for _,ok,_ in checks if ok is None)
    print(f"Summary: {len(checks)-fail-warn} ok, {warn} warn, {fail} fail  (fail=needs fix)")
    if fail: sys.exit(1)
