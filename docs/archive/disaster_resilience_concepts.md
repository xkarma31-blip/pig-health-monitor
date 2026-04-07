# Disaster Resilience Concept Papers: LIG-ON & AGRI-RADAR

**Objective:** Detailed Rationale and Technical Defense for the Disaster Resilience Tracks.
**Format:** Mirroring the Pig Health Monitor "Why & How" structure.

---

## 🏔️ Project LIG-ON: LoRa-Mesh Landslide Monitor

**Project Title:** *LIG-ON: Resilient LoRa-Mesh Landslide Integrity Monitor via Sensor Fusion for Mountain Communities*
**Focus:** Disaster Risk Reduction / IoT Mesh Networking

### 1. The Problem: "Why is this a Crisis?"
*   **The Blind Spot:** Mountain barangays (like in Carmen/Compostela) are effectively "Offline."
    *   **Signal Death:** When a typhoon hits, cellular towers lose power or signal is blocked by terrain. Standard GSM-based alarms *will not send the warning*.
    *   **The "Sensory" Gap:** Project NOAH gives rainfall warnings (Regional), but it cannot detect if the specific soil under a house is sliding.
*   **The Impact:** Residents rely on "hearing the rumble," which gives them 0 seconds to evacuate.

### 2. The Innovation: "How is this Unique?"
*   **Solution:** A "Self-Healing" Mesh Network that doesn't need Cellular signal at the source.
*   **Technical Uniqueness:**
    *   **LoRa Mesh Topology:** Node A (in the danger zone) talks to Node B (mid-slope), which talks to Node C (Barangay Hall). If Node B dies, A jumps to C.
    *   **Sensor Fusion (The "Check Engine" Light):** It doesn't just measure rain. It fuses **Soil Moisture (Saturation)** + **mpu6050 (Tilt)**.
    *   **Logic:** Moisture = "Risk Rising." Tilt = "Grounded Movement Detected."
*   **UVP (Unique Value Proposition):** "Zero-Cellular" Dependency for the Last Mile.

### 3. Academic Defense (Evidence)
*   **Sankhyan et al. (2025)** *“IoT-based Landslide Monitoring System using LoRa”* – Validates that Mesh networks are the *only* reliable solution for complex terrain where LTE fails.

---

## 🌊 Project AGRI-RADAR: Flash Flood Siren

**Project Title:** *AGRI-RADAR: Microwave-Based Flash Flood Siren for Riverside Agricultural Zones*
**Focus:** Agricultural Safety / Industrial IoT

### 1. The Problem: "Why is this a Crisis?"
*   **The Context (Tamiao Incident):** Poultry/Farm workers are often *transitory* (not locals). They don't know the river's behavior.
*   **The Technical Failure:** 
    *   **Ultrasonic Blindness:** Standard "Arduino Flood Projects" use HC-SR04 (Ultrasonic). In a typhoon, the heavy rain and wind create "acoustic noise" that scatters the sound waves. The sensor reads "0 distance" or random noise.
    *   **Notification Failure:** Sending an SMS to a farm worker who is busy hauling pigs in the rain is useless. They won't check their phone.

### 2. The Innovation: "How is this Unique?"
*   **Solution:** An "All-Weather" Local Alarm System.
*   **Technical Uniqueness:**
    *   **Radar (mmWave) Sensing:** Uses JSN-SR04T (Waterproof) or a 24GHz Radar Module. Radar waves pass through rain, fog, and plastic. It is immune to storm noise.
    *   **Predictive "Rate-of-Rise" Logic:** It calculates *how fast* the water is rising (cm/minute). If the rate > Threshold, it triggers *before* the flood hits the bank.
    *   **Actuation:** Triggers a **120dB Industrial Siren** on-site. It screams "EVACUATE" physically.
*   **UVP:** Designed for the **Worker**, not the Data Analyst.

### 3. Academic Defense (Evidence)
*   **Esposito et al. (2022)** *“Reliability of IoT Radar Sensors for Extreme Weather”* – Proves Radar is 98% reliable in storms vs. 60% for Ultrasonic.
