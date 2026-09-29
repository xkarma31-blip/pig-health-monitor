# CHAPTER 1

## The Problem and Its Setting

---

### 1.1 Background of the Study

Swine farming plays a vital role in Philippine agriculture, contributing to household income, food security, and local economic activity. For many small-scale producers, swine farming represents an accessible source of income that can support household needs. While a portion of the industry consists of large-scale commercial operations, a substantial majority comes from small backyard production systems. According to the Philippine Statistics Authority's Swine Situation Report, backyard or small farms accounted for 67.5% of the country's total swine inventory as of the quarter of 2023, reaffirming that open-air, low-technology operations continue to dominate the local industry despite the growth of commercial farms (Philippine Statistics Authority, 2023).

In local communities, many households raise pigs to generate and earn income. This shows that swine farming continues to play an important role in strengthening household income and sustaining rural livelihoods in the Philippines. However, respiratory diseases remain one of the most significant threats to swine production, causing economic losses through mortality, decreased growth rates, reduced feed conversion efficiency, and increased antibiotic usage (Food and Agriculture Organization, 2024). The Porcine Respiratory Disease Complex (PRDC), induced by pathogens such as Porcine Reproductive and Respiratory Syndrome Virus (PRRSv), *Mycoplasma hyopneumoniae* (MHP), and Porcine Circovirus type 2 (PCV2), continues to impact the industry through reduced productivity and increased medication costs (Animals, 2024).

Early detection of respiratory distress is critical for timely intervention. Coughing is one of the earliest and most evident clinical signs of respiratory infection in pigs. Research has confirmed that the frequency and duration of coughs are markedly higher in sick pigs than in healthy pigs, and these coughs exhibit distinct acoustic characteristics (Ferrari et al., 2008; Animals, 2026). Manual monitoring of pig coughs, however, is labor-intensive, subjective, and impractical for continuous 24-hour surveillance, especially in overnight hours when farmer presence is minimal (Berckmans et al., 2008).

Recent advances in Artificial Intelligence (AI) and the Internet of Things (IoT) have enabled automated acoustic monitoring systems for livestock health. SoundTalks NV (Leuven, Belgium) is a commercially available system that uses six MEMS microphones and cloud-based AI to quantify respiratory health through cough sound recognition, presenting a Respiratory Health Status (ReHS) score from 0 to 100 (SoundTalks, 2024). While effective, this system requires internet connectivity, costs approximately $500 per device plus subscription fees, and relies on proprietary algorithms that lack transparency. These barriers limit adoption among small-scale and backyard farmers in the Philippines and similar developing regions.

Simultaneously, advances in TinyML (Tiny Machine Learning) have made it possible to run neural network inference directly on low-cost microcontrollers. The ESP32-S3, a dual-core Xtensa LX7 microcontroller with vector instructions and optional PSRAM, has demonstrated capability for real-time audio classification tasks (Espressif Systems, 2024). Edge Impulse, a machine learning platform for embedded devices, has enabled developers to deploy pig cough detection models on Arduino Nano 33 BLE Sense microcontrollers with reported accuracies of 99.7% in controlled conditions (Oduor, 2021).

Thermal imaging offers another non-invasive modality for fever detection. The MLX90640, a 32×24 pixel infrared thermal array, can detect surface temperature variations associated with fever when targeted at the ear-base region-of-interest (ROI), which exhibits the highest correlation with core body temperature (Wang et al., 2025). Combining acoustic cough detection with thermal fever sensing at the edge presents a comprehensive, low-cost approach to respiratory health monitoring.

However, a critical challenge remains: **model generalization across varying environments**. Research has demonstrated that cough classification accuracy drops by approximately 27 percentage points when a model trained on one farm is deployed on another due to differences in background noise, acoustics, and recording conditions (Pessoa et al., 2024). Commercial systems address this through manual calibration periods, but this approach is impractical for non-technical farmers. Unsupervised domain adaptation—a technique proven effective for general audio classification across varying environments—offers a potential solution by enabling models to automatically adapt to new acoustic conditions without human-labeled data (Bollen et al., 2021; Kahl et al., 2021).

This study aims to develop **PigPulse**, a self-calibrating edge AI system that combines acoustic cough detection and thermal fever sensing on a low-cost ESP32-S3 platform for open-air swine farming. By leveraging unsupervised domain adaptation for automatic calibration, the system seeks to eliminate the need for farmer intervention during deployment while maintaining detection accuracy across varying environmental conditions.

---

### 1.2 Statement of the Problem

Despite the availability of commercial respiratory monitoring systems for swine, several gaps remain unaddressed, particularly for small-scale and open-air farming operations in the Philippines:

**First, cost and accessibility.** Commercial systems such as SoundTalks require significant capital investment ($500+ per device plus subscription) and reliable internet connectivity, placing them beyond the reach of backyard farmers who constitute 67.5% of the Philippine swine industry (PSA, 2023).

**Second, calibration complexity.** Current systems require manual calibration periods upon deployment—SoundTalks reports approximately one day for self-calibration (SoundTalks, 2024). This process assumes a level of technical literacy that may not exist among target end-users. No published research has demonstrated a **fully automatic, farmer-proof calibration protocol** for pig cough detection systems in open-air environments.

**Third, environmental generalization.** Research confirms that cough classification models experience significant performance degradation (up to 27 percentage point drop) when deployed on farms with acoustic conditions differing from training data (Pessoa et al., 2024). Unsupervised domain adaptation has proven effective for general audio tasks (Bollen et al., 2021; Sound-Adapter, 2021; Kahl et al., 2021) but **has not been applied specifically to pig cough detection in open-air farms**.

**Fourth, single-modality limitation.** Existing systems rely primarily on acoustic monitoring alone. Multi-modal fusion of acoustic cough detection with thermal fever sensing at the edge has not been explored for pig respiratory monitoring, despite evidence that combining modalities improves health assessment robustness (Possagnolo et al., 2024).

This study seeks to answer the question: **Can an edge AI system with unsupervised domain adaptation automatically calibrate to new pig farms without farmer intervention, maintaining cough detection accuracy across varying open-air environments?**

---

### 1.3 Research Questions

**Primary Research Question:**

How can unsupervised domain adaptation enable a low-cost edge device to automatically calibrate to new pig farms, maintaining cough detection accuracy across varying open-air environments without farmer intervention?

**Secondary Research Questions:**

1. How does band-wise feature normalization affect cross-farm cough detection accuracy in open-air environments?
2. Can relative thermal thresholding (±1.5°C from rolling baseline) detect fever without absolute temperature calibration?
3. What is the minimum duration of ambient noise recording required for effective unsupervised domain adaptation?
4. How does multi-modal fusion of acoustic cough rate and thermal fever probability compare to single-modal health scoring in terms of correlation with expected health outcomes?

---

### 1.4 Objectives of the Study

**General Objective:**

To develop and evaluate a self-calibrating edge AI system (PigPulse) for respiratory health monitoring in open-air pig farming that combines acoustic cough detection and thermal fever sensing with unsupervised domain adaptation for automatic farm-specific calibration.

**Specific Objectives:**

1. **To develop an acoustic cough detection pipeline** using a pre-trained PANNs-CNN14 model fine-tuned on public pig cough datasets (Figshare 546, Thai 49) and quantized to INT8 for ESP32-S3 deployment.

2. **To implement unsupervised domain adaptation via band-wise feature normalization** that automatically adjusts the model to new farms using 24-hour ambient noise recordings without farmer intervention.

3. **To develop a thermal fever detection pipeline** using MLX90640 ear-base ROI identification with sensor-level drift compensation and relative thresholding against a 7-day rolling baseline.

4. **To design a multi-modal fusion algorithm** combining acoustic cough rate (z-score) and thermal fever deviation (z-score) into a unified health score (0-100) comparable to SoundTalks ReHS.

5. **To evaluate system performance** in terms of:
   - Cough detection accuracy (precision, recall, F1-score)
   - Thermal fever detection accuracy (±2°C)
   - Latency per inference (<50ms target)
   - Power consumption and battery life (2-5 day target)
   - Calibration effectiveness (with vs. without domain adaptation)

---

### 1.5 Significance of the Study

This study contributes to multiple stakeholders:

**For farmers and livestock producers:**
The PigPulse system offers a low-cost (approximately $30 BOM) alternative to commercial respiratory monitoring systems. By eliminating the need for technical calibration, internet connectivity, or recurring subscription fees, the system democratizes access to precision livestock farming tools for small-scale and backyard farmers who dominate the Philippine swine industry.

**For researchers:**
This study represents the **first application of unsupervised domain adaptation specifically to pig cough detection**. While domain adaptation is proven for general audio, bird soundscapes, and domestic environments, its effectiveness for livestock monitoring in open-air farms remains untested. The results will establish whether these proven techniques generalize to agricultural acoustic monitoring.

**For the swine industry:**
By combining acoustic cough detection with thermal fever sensing on a single edge device, this study explores multi-modal fusion at the resource-constrained edge—an approach not yet published for pig health monitoring. The open-source, reproducible methodology provides a transparent alternative to proprietary black-box commercial systems.

**For veterinary practice:**
The system enables objective, continuous respiratory health monitoring that can alert farmers to potential outbreaks earlier than manual observation alone, supporting timely veterinary intervention and reducing antibiotic misuse.

---

### 1.6 Scope and Limitations of the Study

**Scope:**

This study focuses on the development and evaluation of a self-calibrating edge AI system for respiratory health monitoring in **open-air pig farming** in the Philippines. Specifically, the system:

- Targets **pen-level monitoring** (not individual pig identification)
- Operates on a **single ESP32-S3 device** per pen with INMP441 microphone and MLX90640 thermal camera
- Performs **binary cough classification** (cough vs. non-cough) without distinguishing productive vs. non-productive cough types
- Uses **24-hour automatic calibration** via unsupervised ambient noise profiling
- Detects fever via **relative thermal thresholding** (±1.5°C deviation from 7-day baseline)
- Operates **fully offline** with PocketBase data logging and Expo mobile alerts
- Targets deployment in **Cebu Technological University – Sabang Danao City** swine facilities or similar open-air operations

**Limitations:**

The following limitations apply to this study:

1. **Cough detection accuracy:** The system targets 85-90% accuracy, acknowledging that open-air environments introduce non-stationary noise (wind, rain, machinery) that may degrade performance compared to controlled indoor studies reporting >94% accuracy.

2. **Thermal accuracy:** The MLX90640 sensor has a specified accuracy of ±2°C in compensated mode. While sufficient for fever detection via relative thresholding, the system cannot provide medical-grade absolute temperature readings.

3. **No individual pig identification:** The system monitors pen-level health, not individual pigs. Individual identification via computer vision requires GPU-class hardware (Jetson/RPi 5) and represents a separate research track.

4. **No pathogen differentiation:** The system detects respiratory distress symptoms (cough rate, fever) but cannot distinguish between specific pathogens (PRRSv, MHP, PCV2, IAV-S). Laboratory testing remains necessary for definitive diagnosis.

5. **Single-location validation:** Initial deployment and validation occurs at a single farm. Cross-farm generalization claims are limited to the effectiveness of the domain adaptation protocol rather than extensive multi-farm trials.

6. **Binary cough classification only:** The system does not classify cough types (productive vs. non-productive) or attempt to distinguish between pathogen-induced and environmentally-induced coughing.

7. **Calibration period:** While automatic, the system requires a 24-hour ambient noise recording period before full monitoring accuracy is achieved.

---

### 1.7 Assumptions and Delimitations

**Assumptions:**

1. The public pig cough datasets (Figshare 546, Thai 49) used for initial model training contain representative acoustic features of pig coughs applicable to Philippine swine breeds.

2. The ear-base region-of-interest (ROI) of the thermal image correlates sufficiently with core body temperature to enable fever detection, as supported by Wang et al. (2025).

3. Ambient noise profiles remain relatively stable within a 24-hour cycle, enabling effective single-period calibration.

4. Farmers will maintain the hardware (battery charging, sensor cleaning) but will not be required to perform any technical configuration.

**Delimitations:**

The following are explicitly excluded from the scope of this study:

1. **Individual pig identification via CCTV:** While top-down camera tracking with YOLOv8 + DeepSORT is feasible, it requires GPU-class hardware and represents a distinct research contribution. Excluded to maintain focus on the core multi-modal health monitoring contribution.

2. **NH3 and CO2 environmental sensors:** While ammonia correlates with respiratory health, adding gas sensors increases hardware complexity and represents a separate environmental monitoring study.

3. **Raspberry Pi 5 or gateway device:** The ESP32-S3 operates standalone without fog computing layers. Future work may explore Pi-based gateways for multi-pen aggregation.

4. **Citric acid cough challenge:** Controlled cough induction via citric acid aerosol requires IACUC approval and adds months to the timeline. Excluded to focus on natural cough monitoring.

5. **Productive vs. non-productive cough classification:** The Chiang Mai study (2025) showed only marginal AI improvement over farmers for this task (κ=0.79 for *M. hyo* correlation). Excluded as a low-return research direction.

6. **Cross-farm validation at scale:** Extensive multi-farm trials (14+ farms like SoundTalks) are beyond the scope of this capstone. Domain adaptation effectiveness is evaluated at a single deployment site with pre-post adaptation comparison.

---

### 1.8 Definition of Terms

For clarity, the following terms are defined as used in this study:

| Term | Definition |
|------|------------|
| **Edge AI** | Artificial intelligence algorithms that process data locally on hardware devices (microcontrollers or single-board computers) without requiring cloud connectivity. |
| **TinyML** | A subset of Edge AI specifically targeting resource-constrained microcontrollers (typically <1MB RAM, <1MB flash). |
| **Unsupervised Domain Adaptation** | A machine learning technique that adjusts a model trained on one data distribution (source domain) to perform well on a different distribution (target domain) without requiring labeled data from the target domain. |
| **Band-wise Feature Normalization** | A specific unsupervised adaptation technique that matches the mean and variance of each frequency band in the target domain to the statistics of the source training data. |
| **ReHS (Respiratory Health Status)** | A 0-100 metric developed by SoundTalks NV indicating herd respiratory health, where 60-100 is green (normal), 40-59 is yellow (warning), and 0-39 is red (alert). |
| **RDI (Respiratory Distress Index)** | The average number of coughs per pig within a 24-hour period, used as a quantitative health indicator. |
| **ROI (Region of Interest)** | In thermal imaging, the specific area of the image analyzed for temperature measurement. For this study, the ear-base ROI (center-bottom 5×5 pixels of the MLX90640 frame). |
| **INT8 Quantization** | A model optimization technique that converts 32-bit floating-point weights and activations to 8-bit integers, reducing model size by 4× and accelerating inference on microcontrollers. |
| **PANNs-CNN14** | Pre-trained Audio Neural Network with 14 convolutional layers, pre-trained on Google's AudioSet dataset containing 2 million audio clips across 527 sound classes. |
| **ESP32-S3** | A dual-core Xtensa LX7 microcontroller by Espressif Systems, operating at 240MHz with 512KB SRAM, optional 8MB PSRAM, and vector instructions for neural network acceleration. |
| **INMP441** | A high-performance omnidirectional MEMS microphone with I2S digital output, 61dB SNR, and frequency response of 60Hz-15kHz, suitable for pig cough acquisition. |
| **MLX90640** | A 32×24 pixel infrared thermal array by Melexis, with 110°×75° field of view, ±2°C accuracy (compensated), and I2C digital output. |
| **BME280** | A combined temperature, humidity, and pressure sensor by Bosch, used for ambient environmental compensation. |
| **Drift Compensation** | A mathematical correction applied to thermal sensor readings using the sensor's internal die temperature reference to account for self-heating effects. |
| **Spectral Subtraction** | A noise reduction technique that estimates the noise spectrum from non-signal frames and subtracts it from the signal spectrum. (Note: Research shows mixed results for deep learning pipelines.) |
| **Edge Impulse** | A cloud-based machine learning platform for developing and deploying embedded ML models, supporting automated feature extraction, model training, and microcontroller-optimized export. |
| **PocketBase** | An open-source backend platform providing REST API, real-time subscriptions, and user authentication, used for local data storage and mobile app backend. |
| **Expo** | A React Native development framework used to build the cross-platform mobile application for farmer alerts and data visualization. |
| **Open-Air Housing** | A pig farming system where pigs are raised in open-sided or open-top structures with natural ventilation, as opposed to climate-controlled confined housing. Common in tropical regions including the Philippines. |

---

### 1.9 Conceptual Framework

The conceptual framework of this study is structured around three interconnected layers: **Sensing**, **Intelligence**, and **Action**.

**Sensing Layer:**
The system acquires two primary data modalities from the pig pen environment:
1. **Acoustic data** via the INMP441 microphone, capturing pig vocalizations including coughs, grunts, screams, and environmental noise.
2. **Thermal data** via the MLX90640 sensor, capturing 32×24 pixel thermal images of the pen for ear-base temperature detection.
3. **Ambient data** via the BME280 sensor, capturing temperature and humidity for environmental compensation.

**Intelligence Layer:**
Processing occurs on the ESP32-S3 microcontroller through two parallel pipelines:
1. **Acoustic Pipeline:** Raw audio → Band-wise normalization (auto-calibrated) → MFCC feature extraction → PANNs-CNN14 INT8 inference → Binary cough classification → Cough rate calculation (coughs per 24h)
2. **Thermal Pipeline:** Raw thermal frame → Sensor drift compensation → Emissivity correction → Ear-base ROI extraction → Temperature calculation → Relative threshold comparison (vs. 7-day baseline)

The two modalities are fused via a weighted z-score combination:
> **Health Score** = (0.6 × Z_cough_rate) + (0.4 × Z_fever_deviation)

Scaled to 0-100, this score is comparable to the SoundTalks ReHS metric.

**Action Layer:**
The computed health score triggers tiered alerts:
- **Green (60-100):** Normal respiratory health. No action required.
- **Yellow (40-59):** Potential respiratory issue. Farmer notified via mobile app.
- **Red (0-39):** High probability of respiratory distress. Immediate farmer alert with recommendation for veterinary consultation.

Data is transmitted via MQTT to the PocketBase backend and displayed in the Expo mobile application for real-time monitoring and historical trend analysis.

**Calibration Layer (Unsupervised):**
Upon deployment, the system automatically:
1. Records 24 hours of ambient noise
2. Computes per-frequency-band statistics (mean, variance)
3. Calculates correction factors to match training data distribution
4. Applies corrections to all subsequent audio before inference
5. Learns thermal baseline over 7 days using rolling average per time-of-day

---

### 1.10 Organization of the Study

This capstone project is organized into five chapters:

**Chapter 1: The Problem and Its Setting** — Introduces the research context, identifies the research gap, states the research questions and objectives, defines scope and limitations, and establishes the conceptual framework.

**Chapter 2: Review of Related Literature** — Reviews existing research on pig vocalization acoustics, machine learning for cough detection, domain adaptation techniques, thermal imaging for livestock, multi-modal sensor fusion, and commercial monitoring systems.

**Chapter 3: Methodology** — Details the hardware design, software architecture, data collection procedures, model development pipeline, calibration protocol, fusion algorithm, and evaluation methodology.

**Chapter 4: Results and Discussion** — Presents the experimental results including cough detection accuracy, thermal fever detection accuracy, calibration effectiveness, latency measurements, power consumption, and comparison with expected outcomes.

**Chapter 5: Summary, Conclusions, and Recommendations** — Summarizes findings, states conclusions based on research objectives, acknowledges limitations, and provides recommendations for future research and system improvement.

---

*End of Chapter 1*