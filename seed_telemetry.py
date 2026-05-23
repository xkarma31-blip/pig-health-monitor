import requests
import json
import base64
import random
import time

DATABASE_URL = "https://studio-1248778633-99f62-default-rtdb.firebaseio.com"
UID = "xgC6Hkq2a6XrNG5emkf5cuyjpiu2"
TOKEN = "eyJhbGciOiJSUzI1NiIsImtpZCI6Ijg2OGU0YWNlMGI2NTE2ZDM2YjlmNTZkZThjZTQ5Nzg4ZmNjZGFjNDMiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL3NlY3VyZXRva2VuLmdvb2dsZS5jb20vc3R1ZGlvLTEyNDg3Nzg2MzMtOTlmNjIiLCJhdWQiOiJzdHVkaW8tMTI0ODc3ODYzMy05OWY2MiIsImF1dGhfdGltZSI6MTc3ODM3NzUyNywidXNlcl9pZCI6InhnQzZIa3EyYTZYck5HNWVta2Y1Y3V5anBpdTIiLCJzdWIiOiJ4Z0M2SGtxMmE2WHJORzVlbWtmNWN1eWpwaXUyIiwiaWF0IjoxNzc4Mzc3NTI3LCJleHAiOjE3NzgzODExMjcsImVtYWlsIjoiYWRtaW5AZmFybS5sb2NhbCIsImVtYWlsX3ZlcmlmaWVkIjpmYWxzZSwiZmlyZWJhc2UiOnsiaWRlbnRpdGllcyI6eyJlbWFpbCI6WyJhZG1pbkBmYXJtLmxvY2FsIl19LCJzaWduX2luX3Byb3ZpZGVyIjoicGFzc3dvcmQifX0.wLJPCc11HL1qf0gA2xrKxWI7VQkVMWvct1NhKpEG2RMelr2r7s9ZuwSel0YHgXQ1hdqd6ajp8HhOXdlIEaInosNVkVt7Bm1g84gAlS34YBfRUuhwdWyFxinur5po3jza9FRhdeWcB6fTlrad-6y-nyQkkugaFxdJzfGa6hDQglQz4af8Y_G9o-bislB8p6kO1ghSy1sDrD5b30i6pumrslN5lhpvZRcMPKe8UmlMzxKUFHHjzqiJI1jc7DkRNTlziBFp9bQH_h3SBAmzmHKAsgFfQnh0yX1NPgdNbb293rfg1Oc3uaRDrh_HTJlOoq84K0UcCEywvUPk0pFQLPWNIA"

def generate_thermal_frame():
    """Generate a 32x24 thermal frame simulating MLX90640 top-down view.
    Demo-optimized: 2 clearly visible pig-shaped heat signatures for 
    the Title Defense presentation."""
    import math
    frame = bytearray(768)
    
    # Warm pen floor: ~25°C → pixel value 55-70
    for i in range(768):
        frame[i] = random.randint(50, 65)
    
    # Subtle warm bedding patches for realism
    for _ in range(20):
        sx, sy = random.randint(0, 31), random.randint(0, 23)
        for dy in range(-1, 2):
            for dx in range(-1, 2):
                nx, ny = sx + dx, sy + dy
                if 0 <= nx < 32 and 0 <= ny < 24:
                    frame[ny * 32 + nx] = random.randint(62, 78)
    
    # Pig definitions: body ellipse + head circle
    # Each pig spans ~10px wide × 5px tall — clearly visible as a distinct shape
    pigs = [
        # Peppa: upper-left area, facing right
        {"cx": 10, "cy": 8,  "rx": 4.0, "ry": 2.5, "hx": 15, "hy": 8,  "hr": 1.8, "temp": 210},
        # Boss Hog: lower-right area, facing left (bigger pig)
        {"cx": 23, "cy": 16, "rx": 4.5, "ry": 2.8, "hx": 18, "hy": 16, "hr": 2.0, "temp": 225},
    ]
    
    for pig in pigs:
        cx, cy = pig["cx"], pig["cy"]
        rx, ry = pig["rx"], pig["ry"]
        hx, hy = pig["hx"], pig["hy"]
        hr = pig["hr"]
        base_temp = pig["temp"]
        
        for row in range(24):
            for col in range(32):
                idx = row * 32 + col
                
                # Body ellipse
                dx_b = (col - cx) / rx
                dy_b = (row - cy) / ry
                dist_b = math.sqrt(dx_b**2 + dy_b**2)
                
                # Head circle
                dx_h = (col - hx) / hr
                dy_h = (row - hy) / hr
                dist_h = math.sqrt(dx_h**2 + dy_h**2)
                
                dist = min(dist_b, dist_h)
                
                if dist < 0.6:
                    # Hot core (spine/back area)
                    heat = base_temp + int((0.6 - dist) * 50) + random.randint(-3, 3)
                    frame[idx] = min(255, max(0, heat))
                elif dist < 1.0:
                    # Main body warmth
                    falloff = (1.0 - dist) / 0.4
                    heat = int(120 + falloff * (base_temp - 120)) + random.randint(-4, 4)
                    frame[idx] = max(frame[idx], min(255, max(0, heat)))
                elif dist < 1.4:
                    # Warm edge (skin boundary + radiated heat)
                    falloff = (1.4 - dist) / 0.4
                    heat = int(70 + falloff * 55) + random.randint(-3, 3)
                    frame[idx] = max(frame[idx], min(255, max(0, heat)))
    
    return base64.b64encode(frame).decode('utf-8')

def seed():
    print("Seeding telemetry pulse...")
    
    # 1. Telemetry
    telemetry = {
        "thermalFrame": generate_thermal_frame(),
        "targetX": 10,
        "targetY": 8,
        "identifiedPig": "Peppa",
        "temperature": 38.5,
        "timestamp": int(time.time() * 1000)
    }
    
    url_tele = f"{DATABASE_URL}/users/{UID}/telemetry/esp32-s3-01.json?auth={TOKEN}"
    requests.put(url_tele, json=telemetry)
    
    # 2. Sensors (to trigger 'isLive')
    sensors = {
        "esp32-s3-01": {
            "type": "thermal",
            "label": "Main Pen Thermal",
            "value": 38.5,
            "unit": "°C",
            "status": "normal",
            "lastUpdated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        },
        "acoustic-01": {
            "type": "acoustic",
            "label": "Pen A Audio",
            "value": 45,
            "unit": "dB",
            "status": "normal",
            "lastUpdated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        }
    }
    
    url_sensors = f"{DATABASE_URL}/users/{UID}/sensors.json?auth={TOKEN}"
    requests.put(url_sensors, json=sensors)
    
    print("Telemetry seed complete.")

if __name__ == "__main__":
    seed()
