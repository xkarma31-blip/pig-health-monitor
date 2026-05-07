import requests
import json
import base64
import random
import time

DATABASE_URL = "https://studio-1248778633-99f62-default-rtdb.firebaseio.com"
UID = "xgC6Hkq2a6XrNG5emkf5cuyjpiu2"
TOKEN = "eyJhbGciOiJSUzI1NiIsImtpZCI6Ijg2OGU0YWNlMGI2NTE2ZDM2YjlmNTZkZThjZTQ5Nzg4ZmNjZGFjNDMiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL3NlY3VyZXRva2VuLmdvb2dsZS5jb20vc3R1ZGlvLTEyNDg3Nzg2MzMtOTlmNjIiLCJhdWQiOiJzdHVkaW8tMTI0ODc3ODYzMy05OWY2MiIsImF1dGhfdGltZSI6MTc3ODE1NTAxNywidXNlcl9pZCI6InhnQzZIa3EyYTZYck5HNWVta2Y1Y3V5anBpdTIiLCJzdWIiOiJ4Z0M2SGtxMmE2WHJORzVlbWtmNWN1eWpwaXUyIiwiaWF0IjoxNzc4MTU1MDE3LCJleHAiOjE3NzgxNTg2MTcsImVtYWlsIjoiYWRtaW5AZmFybS5sb2NhbCIsImVtYWlsX3ZlcmlmaWVkIjpmYWxzZSwiZmlyZWJhc2UiOnsiaWRlbnRpdGllcyI6eyJlbWFpbCI6WyJhZG1pbkBmYXJtLmxvY2FsIl19LCJzaWduX2luX3Byb3ZpZGVyIjoicGFzc3dvcmQifX0.iozKwsrk9krBtHu7N8pBZ5HT0JQiXgS-Q9XR_gNOtH5ynvrS-FI5VVEbZ_ZR_YoZ7HSacjT3xTwy31qhu2YvsTyHOPPfxOjMdVbe_p5Um4nj-S6u3dp0gxfZIK3ApdGc9rAbIs0PSnT_onwe4ovUK-sgFQfUnBR4-Jo9NO6ACCTjegDa4iMzWV7oO1f6qcAh0wp9wogWIzmUFNanqjpPodGk3kuyhBmo4r1ubQJ0LwihggdWUZG0DVs3kp3cbl8alY2z3O-2_uf-wOMduV9-kbStHhFxAqScV4-GCzVitiS_FjP08V_5dolUnWqALTQVkRk8jj537_BffIuT6nZRbA"

def generate_thermal_frame():
    # 32x24 = 768 bytes
    frame = bytearray(768)
    for i in range(768):
        # Create a "heat blob" pattern
        row = i // 32
        col = i % 32
        dist = ((row - 12)**2 + (col - 16)**2)**0.5
        val = int(max(0, 255 - dist * 10))
        frame[i] = val
    return base64.b64encode(frame).decode('utf-8')

def seed():
    print("Seeding telemetry pulse...")
    
    # 1. Telemetry
    telemetry = {
        "thermalFrame": generate_thermal_frame(),
        "targetX": 16,
        "targetY": 12,
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
