# 📂 Capstone Master Dossier: The "Grand Ranking" Concepts

**Objective:** Detailed Rationale ("Why it's a Problem") and Technical Innovation ("How it's Unique") for the Top 5 Capstone Candidates.
**Target Audience:** Thesis Proposal Panel (defense-ready arguments).

---

## 🥇 Rank 1: Project "CACAO-SENSE"
**Title:** *IoT-Based Fermentation Profiler for Cacao Quality Assurance via VOC Fingerprinting*

### 1. The Problem (The "Why")
*   **The Economic Gap:** The Philippines (specifically Cebu/Bohol) targets the "Fine Flavor" chocolate export market. However, small farmers suffer from inconsistent quality.
*   **The Technical Failure:** Currently, farmers judge fermentation completion by **smell and color** (subjective).
    *   **Consequence:** A single "Under-Fermented" batch tastes like raw potato; "Over-Fermented" tastes like vinegar. This downgrades the crop from **Class A (Export)** to **Class C (Local Tablea)**, losing 50% profit.
*   **Existing Solutions:** Industrial Gas Chromatography (Lab equipment) costs millions and takes days. There is no field-deployable tool for small farmers.

### 2. The Innovation (The "How")
*   **Solution:** A portable "Electronic Nose" (E-Nose) box that monitors the fermentation crate in real-time.
*   **Technical Uniqueness:**
    *   **VOC Targeting:** Instead of just Temperature, it monitors **Acetic Acid** and **Ethanol** levels using an MQ-sensor array.
    *   **Edge-AI Profiling:** A TinyML model matches the sensor data to a "Ideal Flavor Curve." It alerts the farmer at the *exact hour* to stop fermentation.
    *   **Result:** Digitizes the "Art" of the Chocolatier.

### 3. Evidence (RRL)
*   **G. Tapia et al. (2022)** *“Electronic development of a cacao fermentation sensing system”* (IEEE ICSET) – Validates the use of E-Noses for fermentation but highlights the lack of field-ready devices.
*   *“Microbial and metabolite profiles of spontaneous cacao fermentation”* (2023).

---

## 🥈 Rank 2: Project "MOLT-GUARD"
**Title:** *Automated Mineral Buffer Dosing System for Low-Salinity Shrimp Farms*

### 1. The Problem (The "Why")
*   **The "Silent Killer":** *Vannamei* shrimp farming is shifting inland (low-salinity). The biggest mortality cause is **"Molt Death Syndrome" (MDS)**.
*   **The Technical Failure:** When shrimp molt (shed shells), they need massive amounts of Minerals (Magnesium/Potassium) *instantly*. In low-salinity water, there isn't enough.
    *   **Current Practice:** Farmers blindly throw mineral sacks *after* they see dead shrimp. It is too reactive.

### 2. The Innovation (The "How")
*   **Solution:** An Automated Dosing Node that predicts the molt.
*   **Technical Uniqueness:**
    *   **Predictive Dosing:** It monitors **Salinity & Temperature** trends to predict the "Molting Event."
    *   **Active Buffering:** It has peristaltic pumps that inject a concentrated **Mg/K Solution** *during* the vulnerable hours, creating a "Safe Buffer Zone."
    *   **Gap Filled:** Commercial RAS (Recirculating Aquaculture) is for rich farms. This is a "First Aid Node" for poor farmers.

### 3. Evidence (RRL)
*   **H.H. Truong et al. (2023)** *“Mineral nutrition in penaeid shrimp”* (Reviews in Aquaculture) – Confirms mineral imbalance in low-salinity water is the primary cause of Molt Death.
*   *“Performance of intensive vannamei shrimp farming in the Philippines”* (2021).

---

## 🥉 Rank 3: Project "Pig Health Monitor"
**Title:** *Multimodal TinyML Acoustic Safeguard for Open-Air Swine Farming*

### 1. The Problem (The "Why")
*   **The Gap:** Pneumonia kills backyard pigs. Early detection requires 24/7 listening.
*   **The Technical Failure:** Commercial monitors (*SoundTalks*) fail in PH because they assume **Quiet Barns**. In our **Open-Air Pens**, "Roosters" and "Rain" trigger false alarms, rendering the device useless.

### 2. The Innovation (The "How")
*   **Solution:** A "Noise-Cancelling" Cough Monitor.
*   **Technical Uniqueness:**
    *   **Differential Subtraction:** Uses **Mic A (Pen)** minus **Mic B (Ambient)** to mathematically delete rooster/rain noise.
    *   **Multimodal Logic:** Correlates **Cough Spikes** with **Thermal Imaging** (AMG8833 IR sensor w/ bicubic upscaling) to detect **Fever** — proving the cause is viral infection, not just environmental dust.

### 3. Evidence (RRL)
*   **Lagua & Ampode (2023)** (MDPI Animals) – Filipino authors confirming noise is the #1 limitation.
*   **Chae et al. (2024)** (MDPI Sensors) – Proves single-mic systems fail in noise.

---

## 🏅 Rank 4: Project "EYE-THERM v2"
**Title:** *Tropical-Calibrated Thermal Screening via Bicubic Super-Resolution*

### 1. The Problem (The "Why")
*   **The Physics Trap:** Thermal cameras detect "Relative Heat." In a Philippine summer (36°C), a pig's skin (38-39°C) is almost the same temp as the air.
*   **The Technical Failure:** Cheap sensors (AMG8833 8x8 pixels) see a "Blurry Heat Cloud." They cannot find the **Inner Eye (Medial Canthus)**, which is the *only* true fever point.

### 2. The Innovation (The "How")
*   **Solution:** A Smart-Scanner that "Invents" resolution.
*   **Technical Uniqueness:**
    *   **Bicubic Super-Resolution:** Software upscales the 8x8 grid to 32x32 to find the Eye.
    *   **Ambient Offset:** It subtracts the real-time "Heat Index" from the reading to calculate the *True Fever Delta*, not just absolute temp.

### 3. Evidence (RRL)
*   **F.K. Wang et al. (2021)** *“Non-invasive cattle body temperature measurement using infrared thermography”* (Sensors) – Proves that ambient temperature degrades IRT accuracy, validating the need for your "Offset Algorithm."

---

## 🎖️ Rank 5: Project "SEA-SENTINEL"
**Title:** *Submersible Early-Warning Node for Seaweed 'Ice-Ice' Disease*

### 1. The Problem (The "Why")
*   **The Threat:** "Ice-Ice" disease (whitening) wipes out Seaweed farms in Cebu/Bohol. It is caused by stress (Hot/Salty water).
*   **The Technical Failure:** By the time a farmer sees the white spots, the plant is dead. There is no automated alarm.

### 2. The Innovation (The "How")
*   **Solution:** An underwater IoT buoy.
*   **Technical Uniqueness:**
    *   **Proximal RGB Sensing:** It uses a waterproof color sensor (TCS34725) pressed against a sample thallus. It detects "Micro-Whitening" (pigment loss) days before the human eye can.
    *   **Proactive Alert:** Tells the farmer to "Lower the Lines" (to cooler water) before the outbreak spreads.

### 3. Evidence (RRL)
*   **E. Alevizos et al. (2024)** *“Proximal Sensing for Characterising Seaweed Aquaculture... Detection of Ice-Ice Disease”* (Remote Sensing) – Proves optical sensing detects early disease signs.

---

## 🏔️ Rank 6: Project "LIG-ON" (Disaster Resilience)
**Title:** *LoRa-Mesh Landslide Integrity Monitor for Mountain Communities (Carmen/Compostela)*

### 1. The Problem (The "Why")
*   **The Threat:** MGB-7 identifies Carmen/Compostela as "High-Risk" for Rain-Induced Landslides (RIL).
*   **The Technical Failure:** 
    *   **Signal Death:** Standard GSM/SMS alarms fail in deep ravines/slopes where cellular signal is dead.
    *   **Project NOAH Gap:** NOAH monitors *rainfall*, but not the actual *soil movement* in a specific Sitio.
    *   **Reactive vs. Proactive:** Residents are warned only *after* the slide starts (noise), which is too late.

### 2. The Innovation (The "How")
*   **Solution:** A "Resilient Mesh" of Soil Sensors.
*   **Technical Uniqueness:**
    *   **LoRa Mesh Topology:** Unlike GSM, nodes talk to each other. If Node A (in the ravine) can't reach the center, it hops data to Node B (on the ridge).
    *   **Sensor Fusion:** Combines **Capacitive Soil Moisture** (Saturation) + **MPU6050 Accelerometer** (Tilt). It detects the "Pre-Slide Creep" (slow movement) before the collapse.
    *   **UVP:** "Zero-Cellular" Dependency.

### 3. Evidence (RRL)
*   **Sankhyan et al. (2025)** *“IoT-based Landslide Monitoring System using LoRa”* – Validates Mesh networks for disaster zones where LTE fails.

---

## 🌊 Rank 7: Project "AGRI-RADAR" (Flash Flood)
**Title:** *Radar-Based Flash Flood Siren for Riverside Agricultural Zones (Tamiao Solution)*

### 1. The Problem (The "Why")
*   **The Context (Tamiao Incident):** In Compostela, poultry farm workers were swept away because they were **non-residents** and didn't know the river's visual cues.
*   **The Technical Failure:** 
    *   **Ultrasonic Blindness:** Cheap sensors (HC-SR04) fail during storms because heavy rain/wind scatters the sound waves, causing "False Negatives."
    *   **Notification Gap:** SMS alerts are useless to a worker feeding chickens in heavy rain (can't hear phone).

### 2. The Innovation (The "How")
*   **Solution:** An Industrial-Grade "All-Weather" Alarm.
*   **Technical Uniqueness:**
    *   **Microwave Radar (mmWave):** Uses JSN-SR04T (Waterproof) or Radar module that "sees" through rain/fog/debris without interference.
    *   **Local Actuation:** Triggers a **120dB Industrial Siren + Strobe Light** on-site. It screams "GET OUT" in a language everyone understands.
    *   **UVP:** Designed specifically for **Noisy, Wet, Dirty** agricultural zones, not clean cities.

### 3. Evidence (RRL)
*   **Esposito et al. (2022)** *“Reliability of IoT Radar Sensors for Extreme Weather Flood Monitoring”* – Proves Radar outperforms Ultrasonic in storm conditions.
