"""
🔥 Live Thermal Feed Simulator
Continuously pushes pig-shaped thermal frames to Firebase RTDB.
Pigs drift slowly each tick, simulating real MLX90640 behavior.
Run: python3 seed_live.py
"""
import json, time, math, random, base64, requests

DATABASE_URL = "https://studio-1248778633-99f62-default-rtdb.firebaseio.com"
API_KEY = "AIzaSyC7rpeo9XoXzg4WBoTP5-nWeTQUBroUsxc"
UID = "xgC6Hkq2a6XrNG5emkf5cuyjpiu2"

ROWS, COLS = 24, 32

def get_token():
    r = requests.post(
        f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={API_KEY}",
        json={"email": "admin@farm.local", "password": "357631", "returnSecureToken": True}
    )
    return r.json()["idToken"]

def generate_frame(pigs):
    """Generate a 32x24 thermal frame with pig-shaped blobs."""
    frame = bytearray(768)
    
    # Warm pen floor
    for i in range(768):
        frame[i] = random.randint(50, 65)
    
    # Bedding texture
    for _ in range(15):
        sx, sy = random.randint(0, 31), random.randint(0, 23)
        for dy in range(-1, 2):
            for dx in range(-1, 2):
                nx, ny = sx + dx, sy + dy
                if 0 <= nx < 32 and 0 <= ny < 24:
                    frame[ny * 32 + nx] = random.randint(60, 75)
    
    for pig in pigs:
        cx, cy = pig["cx"], pig["cy"]
        rx, ry = pig["rx"], pig["ry"]
        hx, hy = pig["hx"], pig["hy"]
        hr = pig["hr"]
        base_temp = pig["temp"]
        
        for row in range(24):
            for col in range(32):
                idx = row * 32 + col
                
                dx_b = (col - cx) / rx
                dy_b = (row - cy) / ry
                dist_b = math.sqrt(dx_b**2 + dy_b**2)
                
                dx_h = (col - hx) / hr
                dy_h = (row - hy) / hr
                dist_h = math.sqrt(dx_h**2 + dy_h**2)
                
                dist = min(dist_b, dist_h)
                
                if dist < 0.6:
                    heat = base_temp + int((0.6 - dist) * 50) + random.randint(-3, 3)
                    frame[idx] = min(255, max(0, heat))
                elif dist < 1.0:
                    falloff = (1.0 - dist) / 0.4
                    heat = int(120 + falloff * (base_temp - 120)) + random.randint(-4, 4)
                    frame[idx] = max(frame[idx], min(255, max(0, heat)))
                elif dist < 1.4:
                    falloff = (1.4 - dist) / 0.4
                    heat = int(70 + falloff * 55) + random.randint(-3, 3)
                    frame[idx] = max(frame[idx], min(255, max(0, heat)))
    
    return base64.b64encode(frame).decode("utf-8")

def drift_pig(pig):
    """Slightly move a pig each tick (random walk within bounds)."""
    dx = random.choice([-0.3, 0, 0, 0.3])
    dy = random.choice([-0.2, 0, 0, 0.2])
    
    pig["cx"] = max(pig["rx"] + 1, min(COLS - pig["rx"] - 1, pig["cx"] + dx))
    pig["cy"] = max(pig["ry"] + 1, min(ROWS - pig["ry"] - 1, pig["cy"] + dy))
    
    # Head follows body direction
    head_offset_x = pig["hx"] - pig["cx"]
    head_offset_y = pig["hy"] - pig["cy"]
    pig["hx"] = pig["cx"] + head_offset_x
    pig["hy"] = pig["cy"] + head_offset_y

def main():
    token = get_token()
    token_time = time.time()
    tick = 0
    
    # Two pigs with distinct shapes
    pigs = [
        {"name": "Peppa",    "cx": 10, "cy": 8,  "rx": 4.0, "ry": 2.5, "hx": 15, "hy": 8,  "hr": 1.8, "temp": 210},
        {"name": "Boss Hog", "cx": 23, "cy": 16, "rx": 4.5, "ry": 2.8, "hx": 18, "hy": 16, "hr": 2.0, "temp": 225},
    ]
    
    pig_names = ["Peppa", "Boss Hog", "Bacon-A1", "Babe"]
    
    print("🔥 Live Thermal Feed — Ctrl+C to stop")
    
    while True:
        tick += 1
        
        # Refresh token every 50 minutes
        if time.time() - token_time > 3000:
            token = get_token()
            token_time = time.time()
            print("\n🔑 Token refreshed")
        
        # Drift pigs
        for pig in pigs:
            drift_pig(pig)
        
        # Simulate fever event at ticks 60-120
        is_fever = 60 <= tick <= 120
        current_temp = 40.2 if is_fever else round(38.0 + random.random() * 1.0, 1)
        
        # Pick which pig is "identified" (cycles)
        identified = pig_names[(tick // 15) % len(pig_names)]
        
        # Use Peppa's position for the bounding box target
        peppa = pigs[0]
        
        payload = {
            "thermalFrame": generate_frame(pigs),
            "targetX": int(round(peppa["cx"])),
            "targetY": int(round(peppa["cy"])),
            "identifiedPig": identified,
            "temperature": current_temp,
            "timestamp": int(time.time() * 1000)
        }
        
        try:
            url = f"{DATABASE_URL}/users/{UID}/telemetry/esp32-s3-01.json?auth={token}"
            r = requests.put(url, json=payload)
            
            # Inject cough alert at tick 60
            if tick == 60:
                alert = {
                    "deviceId": "esp32-s3-01",
                    "type": "INFECTIOUS_COUGH",
                    "severity": "HIGH",
                    "message": f"Cough signature detected from {identified} (600Hz band). Vet check advised.",
                    "timestamp": int(time.time() * 1000)
                }
                requests.post(f"{DATABASE_URL}/users/{UID}/alerts.json?auth={token}", json=alert)
                print(f"\n🚨 COUGH ALERT: {identified}")
            
            status = "🔴 FEVER" if is_fever else "🟢 OK"
            print(f"\r📡 Tick {tick:04d} | {status} {current_temp}°C | 🐷 {identified} @ [{int(peppa['cx'])},{int(peppa['cy'])}]   ", end="", flush=True)
            
        except Exception as e:
            print(f"\n❌ {e}")
        
        time.sleep(1.5)

if __name__ == "__main__":
    main()
