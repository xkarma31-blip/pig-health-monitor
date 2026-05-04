import time
import random

# ==========================================
# 🐷 Pig Health Monitor: Mock Data Generator
# Purpose: Simulates the ESP32 sending data to the cloud/app.
# Use this to test your App's dashboard without the hardware.
# ==========================================

def get_random_status():
    """Simulates AI Classification"""
    event = random.choices(
        population=["SILENCE", "NOISE_RAIN", "NOISE_ROOSTER", "COUGH_HEALTHY", "COUGH_SICK"],
        weights=[0.6, 0.2, 0.1, 0.08, 0.02], # Most likely silence
        k=1
    )[0]
    return event

def get_sensor_readings():
    """Simulates sensor fusion data"""
    ammonia_ppm = round(random.uniform(5.0, 50.0), 1) # Normal range 5-25ppm
    temp_c = round(random.uniform(28.0, 34.0), 1)     # Tropical ambient temp
    humidity = round(random.uniform(60.0, 90.0), 1)   # High humidity
    return ammonia_ppm, temp_c, humidity

def main():
    print("🐷 Pig Health Monitor Simulator: Connecting to 'Cloud'...")
    time.sleep(1)
    print("Started. Press Ctrl+C to stop.")
    
    while True:
        event = get_random_status()
        nh3, temp, hum = get_sensor_readings()
        
        # Logic: If Ammonia is high (>25), increase chance of Sick Cough
        if nh3 > 30.0 and event == "COUGH_HEALTHY":
            event = "COUGH_SICK" # Bad air causes sick coughs
        
        # JSON Output Format (This is what the App will receive)
        payload = {
            "timestamp": time.time(),
            "status": event,
            "sensors": {
                "ammonia_ppm": nh3,
                "temperature": temp,
                "humidity": hum
            }
        }
        
        print(f"📡 Sending: {payload}")
        
        # In real life, you would push this to Firebase here
        # firebase.push(payload)
        
        time.sleep(2) # Send every 2 seconds

if __name__ == "__main__":
    main()
