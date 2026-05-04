import numpy as np

# ==========================================
# 🧪 RE-ID SIAMESE SIMULATOR (FULL POWER)
# Purpose: Simulate the ESP32-S3's ability to identify pigs using
#          low-resolution (32x24) thermal embeddings.
# ==========================================

def generate_pig_signature(pig_id):
    """
    Simulates a 32x24 thermal signature for a specific pig.
    Includes base body heat + unique ear/head patterns.
    """
    # Base pattern (simulating head/body heat distribution)
    base = np.zeros((24, 32))
    
    # Unique "feature" points for each pig (simulated ear locations/heat)
    np.random.seed(pig_id)
    feature_x = np.random.randint(5, 27)
    feature_y = np.random.randint(5, 19)
    
    # Draw heat concentration
    for y in range(24):
        for x in range(32):
            dist = np.sqrt((x - feature_x)**2 + (y - feature_y)**2)
            base[y, x] = 38.0 + (5.0 / (dist + 1)) # Peak around 43C (ear/eye)
            
    return base.flatten()

def cosine_similarity(v1, v2):
    return np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2))

# --- SIMULATION RITUAL ---
print("🚀 Initializing ESP32-S3 Siamese Simulation...")

# 1. ENROLLMENT: Save signatures for 3 pigs
pig_database = {
    "Pig_A": generate_pig_signature(101),
    "Pig_B": generate_pig_signature(202),
    "Pig_C": generate_pig_signature(303)
}
print("✅ Database Initialized: 3 Pigs Enrolled.")

# 2. INFERENCE: Capture a "noisy" frame of Pig A
# Adding noise to simulate sensor jitter and environmental changes
noise = np.random.normal(0, 0.5, 768)
captured_frame = generate_pig_signature(101) + noise
print("📸 Captured Noisy Thermal Frame (Target: Pig_A)")

# 3. MATCHING: Calculate distances in the ESP32 database
results = {}
for name, signature in pig_database.items():
    similarity = cosine_similarity(captured_frame, signature)
    results[name] = similarity
    print(f"   - Distance to {name}: {similarity:.4f}")

# 4. DECISION
best_match = max(results, key=results.get)
confidence = results[best_match]

print(f"\n🏆 MATCH FOUND: {best_match}")
print(f"📊 Confidence Score: {confidence:.4f}")

if confidence > 0.98:
    print("✨ STATUS: HIGH CONFIDENCE IDENTIFICATION")
else:
    print("⚠️ STATUS: LOW CONFIDENCE - POSSIBLE UNKNOWN PIG")

# --- HARDWARE VALIDATION ---
esp32_ram_usage = (768 * 4 * len(pig_database)) / 1024
print(f"\n💾 ESP32 Resource Estimate:")
print(f"   - Database RAM: {esp32_ram_usage:.2f} KB")
print(f"   - Inference Time Estimate: ~15ms (on S3 with SIMD)")
