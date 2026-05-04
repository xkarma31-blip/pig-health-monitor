import time
import random
import math

# ==========================================
# 🧠 Pig Health Monitor: The AI Logic Explainer
# 
# How does the AI know it's a cough?
# 1. It listens to a 1-second window (Slice).
# 2. It calculates the ENERGY (RMS) of that slice.
# 3. It looks for "Spikes" (Cough) vs "Constant Noise" (Rain).
# 4. It runs a detailed frequency check (Simulated here).
# ==========================================

def generate_noise_floor(length=20):
    """Simulates Rain - Constant low-level noise"""
    return [random.uniform(5, 15) for _ in range(length)]

def generate_cough_spike(length=20):
    """Simulates a Cough - Sudden burst of energy"""
    data = generate_noise_floor(length)
    mid = length // 2
    # Add a burst in the middle
    data[mid-1] += 50
    data[mid]   += 100 
    data[mid+1] += 50
    return data

def analyze_audio_slice(audio_data, label):
    """
    Step 1: Calculate Energy (Root Mean Square)
    Step 2: Check Variance (Spikiness)
    """
    # 1. Calculate Average Energy
    avg_energy = sum(audio_data) / len(audio_data)
    
    # 2. Calculate "Spikiness" (Max vs Avg)
    peak_energy = max(audio_data)
    spike_ratio = peak_energy / avg_energy

    # 3. Print the "Visual Wave"
    print(f"\n--- Analyzing Sound: {label} ---")
    print("Waveform:", end=" ")
    for sample in audio_data:
        if sample > 80: print("█", end="")      # High Energy
        elif sample > 40: print("▒", end="")    # Med Energy
        elif sample > 10: print("░", end="")    # Low Energy
        else: print(".", end="")
    print(f"\nAverage Energy: {avg_energy:.1f}")
    print(f"Peak Energy:    {peak_energy:.1f}")
    print(f"Spike Ratio:    {spike_ratio:.1f} (Higher = Cough)")

    # 4. The Decision Logic (Simulated Neural Net)
    print("🤖 AI Decision:", end=" ")
    
    if spike_ratio > 3.0:
        confidence = min(spike_ratio * 10, 99.9) # Fake confidence metric
        print(f"⚠️ COUGH DETECTED! ({confidence:.1f}% Confidence)")
        print("   -> Reason: High Energy Burst detected.")
    else:
        print(f"✅ Safe (Background Noise).")
        print("   -> Reason: Energy is consistent (Rain/Wind).")

def main():
    print("🐷 Pig Health Monitor AI: Theoretical Logic Test")
    print("========================================")
    
    # Case 1: Rain
    rain_audio = generate_noise_floor()
    analyze_audio_slice(rain_audio, "Heavy Rain (Constant Noise)")
    
    # Case 2: Cough
    cough_audio = generate_cough_spike()
    analyze_audio_slice(cough_audio, "Pig Cough (Sudden Burst)")
    
    # Case 3: Rooster (Sharp but different? - Simplified for demo)
    # Roosters are tricky, usually higher pitch, but simplified logic:
    rooster_audio = generate_noise_floor()
    rooster_audio[5] += 80 # Smaller spike
    analyze_audio_slice(rooster_audio, "Distant Rooster")

if __name__ == "__main__":
    main()
