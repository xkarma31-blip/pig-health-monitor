#!/usr/bin/env python3
"""
PigPulse v3 — PocketBase Mock Seeder (replaces Firebase seed_*.py for v3)

Seeds via PocketBase REST API (admin auth):
  - pigs (4 default: Peppa, Boss Hog, Babe, Wilbur)
  - devices (2: esp32-001, esp32-002)
  - telemetry (N per pig, time-series with fever spikes)
  - alerts (fever + cough cluster)

Usage:
  python3 backend/setup/seed_pocketbase.py --clean --pigs 4 --telemetry 40 --alerts 6
  python3 backend/setup/seed_pocketbase.py --host http://127.0.0.1:8090

Idempotent when --clean not used (appends). With --clean, wipes telemetry/alerts/pigs/devices first.
"""
import argparse, time, random, base64, math, sys
import requests

PB_URL_DEFAULT="http://127.0.0.1:8090"
PB_EMAIL="admin@pigpulse.local"
PB_PASSWORD="admin123"

PIG_NAMES=["Peppa","Boss Hog","Babe","Wilbur","Hamlet","Daisy","Coco","Bessie"]
DEVICE_IDS=["esp32-001","esp32-002"]

def auth(url):
    r=requests.post(f"{url}/api/admins/auth-with-password", json={"identity":PB_EMAIL,"password":PB_PASSWORD}, timeout=8)
    r.raise_for_status()
    return r.json()["token"]

def list_records(url, token, collection, per_page=50):
    hdr={"Authorization":f"Bearer {token}"}
    r=requests.get(f"{url}/api/collections/{collection}/records?perPage={per_page}", headers=hdr, timeout=8)
    r.raise_for_status()
    return r.json().get("items",[])

def delete_all(url, token, collection):
    hdr={"Authorization":f"Bearer {token}"}
    items=list_records(url, token, collection, per_page=200)
    for it in items:
        requests.delete(f"{url}/api/collections/{collection}/records/{it['id']}", headers=hdr, timeout=8)
    return len(items)

def create(url, token, collection, data):
    hdr={"Authorization":f"Bearer {token}","Content-Type":"application/json"}
    r=requests.post(f"{url}/api/collections/{collection}/records", headers=hdr, json=data, timeout=8)
    if r.status_code not in (200,201):
        print(f"  ❌ {collection} create failed {r.status_code} {r.text[:200]}", file=sys.stderr)
        return None
    return r.json()

def generate_thermal_b64():
    # Minimal pig blobs 32x24 -> base64 (same as seed_telemetry.py but lighter)
    frame=bytearray(768)
    for i in range(768): frame[i]=random.randint(50,65)
    for _ in range(12):
        sx,sy=random.randint(0,31), random.randint(0,23)
        for dy in (-1,0,1):
            for dx in (-1,0,1):
                nx,ny=sx+dx, sy+dy
                if 0<=nx<32 and 0<=ny<24: frame[ny*32+nx]=random.randint(62,78)
    pigs=[{"cx":10,"cy":8,"rx":4.0,"ry":2.5,"hx":15,"hy":8,"hr":1.8,"temp":210},
          {"cx":23,"cy":16,"rx":4.5,"ry":2.8,"hx":18,"hy":16,"hr":2.0,"temp":225}]
    for pig in pigs:
        cx,cy,rx,ry,hx,hy,hr,temp=pig["cx"],pig["cy"],pig["rx"],pig["ry"],pig["hx"],pig["hy"],pig["hr"],pig["temp"]
        for row in range(24):
            for col in range(32):
                idx=row*32+col
                dx_b=(col-cx)/rx; dy_b=(row-cy)/ry; dist_b=math.sqrt(dx_b*dx_b+dy_b*dy_b)
                dx_h=(col-hx)/hr; dy_h=(row-hy)/hr; dist_h=math.sqrt(dx_h*dx_h+dy_h*dy_h)
                dist=min(dist_b,dist_h)
                if dist<0.6:
                    heat=temp+int((0.6-dist)*50)+random.randint(-3,3)
                    frame[idx]=min(255,max(0,heat))
                elif dist<1.0:
                    falloff=(1.0-dist)/0.4
                    heat=int(120+falloff*(temp-120))+random.randint(-4,4)
                    frame[idx]=max(frame[idx], min(255,max(0,heat)))
    return base64.b64encode(frame).decode()

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--host", default=PB_URL_DEFAULT, help="PocketBase URL")
    ap.add_argument("--clean", action="store_true", help="wipe telemetry/alerts/pigs/devices before seeding")
    ap.add_argument("--pigs", type=int, default=4)
    ap.add_argument("--telemetry", type=int, default=40)
    ap.add_argument("--alerts", type=int, default=6)
    args=ap.parse_args()
    url=args.host.rstrip("/")
    print(f"🔐 Auth {url} as {PB_EMAIL}...")
    token=auth(url)
    print("  ✅ auth ok")

    if args.clean:
        for col in ["telemetry","alerts","devices","pigs"]:
            n=delete_all(url, token, col)
            print(f"  🧹 {col}: deleted {n}")

    # devices
    print(f"📡 Seeding devices ({len(DEVICE_IDS)})...")
    for did in DEVICE_IDS[:max(1, min(2, args.pigs//2+1))]:
        create(url, token, "devices", {"deviceId":did,"name":f"Node {did}","type":"esp32","status":"online","batteryPct":random.randint(62,94),"lastSeen":int(time.time())})
    print("  ✅ devices")

    # pigs
    pigs=PIG_NAMES[:args.pigs]
    print(f"🐷 Seeding pigs ({len(pigs)})...")
    for i, name in enumerate(pigs):
        pid=f"pig-{i+1:03d}"
        create(url, token, "pigs", {"pigId":pid,"name":name,"healthStatus": random.choice(["NORMAL","NORMAL","NORMAL","FEVER"]) if i==3 else "NORMAL","tags":{"breed":random.choice(["Yorkshire","Duroc","Landrace"]),"age":random.randint(6,14)}})
    print("  ✅ pigs")

    # telemetry: time-series per pig
    print(f"🌡️ Seeding telemetry ({args.telemetry} records)...")
    now=int(time.time())
    for idx in range(args.telemetry):
        did=random.choice(DEVICE_IDS)
        pig=random.choice(pigs)
        # fever spike every 15
        is_fever=(idx%15==7)
        temp=round(40.1+random.uniform(-0.2,0.3),1) if is_fever else round(38.2+random.uniform(-0.4,0.6),1)
        status="CRITICAL" if temp>=40.0 else "WARNING" if temp>=39.5 else "NORMAL"
        # Occasionally include extra fields conceptually but only send schema-allowed fields
        rec={"deviceId":did,"timestamp":now - (args.telemetry-idx)*150,"temperature":temp,"bodyTemp":temp,"pigId":pig,"status":status,"batteryPct":random.randint(68,96),"wifiRssi":random.randint(-62,-38)}
        create(url, token, "telemetry", rec)
    print("  ✅ telemetry")

    # alerts
    print(f"🚨 Seeding alerts ({args.alerts})...")
    for i in range(args.alerts):
        typ=random.choice(["FEVER","FEVER","COUGH_CLUSTER","LOW_BATTERY"])
        sev="CRITICAL" if typ=="FEVER" and i%2==0 else random.choice(["WARNING","CRITICAL"])
        create(url, token, "alerts", {"deviceId":random.choice(DEVICE_IDS),"type":typ,"severity":sev,"message":f"{typ} — {random.choice(pigs)} — {sev} — seeded {i+1}/{args.alerts}","timestamp":now - random.randint(0,3600)})
    print("  ✅ alerts")

    # summary via count
    for col in ["pigs","devices","telemetry","alerts"]:
        items=list_records(url, token, col, per_page=1)
        # need totalItems via raw
        hdr={"Authorization":f"Bearer {token}"}
        r=requests.get(f"{url}/api/collections/{col}/records?perPage=1", headers=hdr, timeout=8).json()
        print(f"  {col}: totalItems={r.get('totalItems')}")

    print(f"\n✅ Seed done @ {url}")
    print(f"   View: {url}/_  (admin: {PB_EMAIL} / {PB_PASSWORD})")
    print(f"   API:  {url}/api/collections/telemetry/records?sort=-timestamp")

if __name__=="__main__":
    main()
