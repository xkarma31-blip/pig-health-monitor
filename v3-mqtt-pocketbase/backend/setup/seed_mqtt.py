#!/usr/bin/env python3
"""
PigPulse v3 — MQTT Mock Publisher (replaces Firebase seed_live.py for v3)

Publishes to:
  pig/{deviceId}/telemetry  → picked up by backend/bridge/mqtt_bridge.py → PocketBase
  pig/{deviceId}/alerts     → same
  pig/{deviceId}/thermal/live → picked up by deploy/thermal-ws/thermal-ws.js → WS broadcast

Usage:
  python3 backend/setup/seed_mqtt.py --once
  python3 backend/setup/seed_mqtt.py --loop --interval 5 --device esp32-001
  python3 backend/setup/seed_mqtt.py --loop --host 127.0.0.1 --port 1883
"""
import argparse, json, time, random, math, base64
try:
    import paho.mqtt.client as mqtt
except ImportError:
    raise SystemExit("pip install paho-mqtt requests")

def generate_frame():
    ROWS,COLS=24,32
    frame=bytearray(768)
    for i in range(768): frame[i]=random.randint(50,65)
    for _ in range(15):
        sx,sy=random.randint(0,31), random.randint(0,23)
        for dy in (-1,0,1):
            for dx in (-1,0,1):
                nx,ny=sx+dx, sy+dy
                if 0<=nx<32 and 0<=ny<24: frame[ny*32+nx]=random.randint(60,75)
    pigs=[{"cx":10,"cy":8,"rx":4.0,"ry":2.5,"hx":15,"hy":8,"hr":1.8,"temp":210},
          {"cx":23,"cy":16,"rx":4.5,"ry":2.8,"hx":18,"hy":16,"hr":2.0,"temp":225}]
    for pig in pigs:
        cx,cy,rx,ry,hx,hy,hr,temp=pig["cx"],pig["cy"],pig["rx"],pig["ry"],pig["hx"],pig["hy"],pig["hr"],pig["temp"]
        for row in range(ROWS):
            for col in range(COLS):
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
                elif dist<1.4:
                    falloff=(1.4-dist)/0.4
                    heat=int(70+falloff*55)+random.randint(-3,3)
                    frame[idx]=max(frame[idx], min(255,max(0,heat)))
    return base64.b64encode(frame).decode()

def drift(p):
    dx=random.choice([-0.3,0,0,0.3]); dy=random.choice([-0.2,0,0,0.2])
    p["cx"]=max(p["rx"]+1, min(32-p["rx"]-1, p["cx"]+dx))
    p["cy"]=max(p["ry"]+1, min(24-p["ry"]-1, p["cy"]+dy))
    head_offset_x=p["hx"]-p["cx"]+dx*0.2
    # keep head relative
    p["hx"]=p["cx"]+ (p["hx"]-p["cx"]) 
    p["hy"]=p["cy"]+ (p["hy"]-p["cy"])

def publish_once(client, device, tick, pigs_state):
    for p in pigs_state: 
        # tiny drift
        p["cx"]+=random.uniform(-0.15,0.15)
        p["cy"]+=random.uniform(-0.1,0.1)
        p["cx"]=max(p["rx"]+1, min(31-p["rx"], p["cx"]))
        p["cy"]=max(p["ry"]+1, min(23-p["ry"], p["cy"]))
    is_fever= 60 <= tick <= 120
    temp= 40.2 if is_fever else round(38.0+random.random()*1.0,1)
    pig_names=["Peppa","Boss Hog","Bacon-A1","Babe"]
    identified=pig_names[(tick//15)%len(pig_names)]
    peppa=pigs_state[0]
    telemetry={
        "temperature": temp,
        "bodyTemp": temp,
        "pigId": identified,
        "targetX": int(round(peppa["cx"])),
        "targetY": int(round(peppa["cy"])),
        "thermalFrame": generate_frame(),
        "coughRate": random.randint(0,3) if tick%10==0 else 0,
        "coughCluster": False,
        "healthTrend": "CLUSTER" if is_fever else "STABLE",
        "batteryPct": round(75+random.uniform(-5,10),1),
        "batteryV": round(3.7+random.uniform(-0.05,0.05),2),
        "powerState": "NORMAL",
        "wifiRssi": random.randint(-58,-42),
        "status": "CRITICAL" if temp>=40.0 else "WARNING" if temp>=39.5 else "NORMAL",
        "timestamp": int(time.time())
    }
    # Bridge will store only schema fields but we publish full payload to test dropping behaviour
    client.publish(f"pig/{device}/telemetry", json.dumps(telemetry))
    print(f"📤 telemetry {device} temp={temp} pig={identified} status={telemetry['status']}")
    # thermal live
    client.publish(f"pig/{device}/thermal/live", json.dumps({"thermalFrame": telemetry["thermalFrame"],"targetX":telemetry["targetX"],"targetY":telemetry["targetY"],"pigId":identified,"temperature":temp,"timestamp":telemetry["timestamp"]}))
    # inject alert at tick 60
    if tick==60:
        alert={"type":"INFECTIOUS_COUGH","severity":"HIGH","pigId":identified,"message":f"Cough signature from {identified} (600Hz band). Vet check advised.","timestamp":int(time.time())}
        client.publish(f"pig/{device}/alerts", json.dumps(alert))
        print(f"🚨 alert COUGH {identified}")
    if is_fever and tick%12==0:
        alert={"type":"FEVER","severity":"CRITICAL" if temp>=40.0 else "WARNING","pigId":identified,"value":temp,"threshold":39.5,"message":f"Fever {temp}°C — {identified}","timestamp":int(time.time())}
        client.publish(f"pig/{device}/alerts", json.dumps(alert))
        print(f"🚨 alert FEVER {temp}°C")

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=1883)
    ap.add_argument("--device", default="esp32-001")
    ap.add_argument("--once", action="store_true", help="publish one tick and exit")
    ap.add_argument("--loop", action="store_true", help="continuous")
    ap.add_argument("--interval", type=float, default=5.0)
    args=ap.parse_args()
    c=mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    c.connect(args.host, args.port, 60)
    c.loop_start(); time.sleep(0.5)
    pigs_state=[{"cx":10,"cy":8,"rx":4.0,"ry":2.5,"hx":15,"hy":8,"hr":1.8},
                {"cx":23,"cy":16,"rx":4.5,"ry":2.8,"hx":18,"hy":16,"hr":2.0}]
    tick=0
    print(f"🔌 MQTT {args.host}:{args.port} device={args.device}")
    if args.once:
        publish_once(c, args.device, tick, pigs_state)
        time.sleep(0.8)
    elif args.loop:
        try:
            while True:
                publish_once(c, args.device, tick, pigs_state)
                tick+=1
                time.sleep(args.interval)
        except KeyboardInterrupt:
            print("\n🛑 stopped")
    else:
        publish_once(c, args.device, tick, pigs_state)
        time.sleep(0.8)
    c.loop_stop(); c.disconnect()

if __name__=="__main__":
    main()
