# 📊 PigPulse — Daily Update

**September 26, 2026 — 08:38 AM**

---

**Total:** 8,111 words | 57,945 chars

## 🔄 Changes Since Last Run

- **📊 Gantt Chart**: 0 additions, 9 removals
- **📝 Google Docs Checklist**: 10 additions, 10 removals
- **✅ Capstone Checklist**: 0 additions, 9 removals
- **📕 OneDrive Manuscript**: 10 additions, 10 removals
- **📄 Concept Paper**: 10 additions, 3 removals
- **📄 Holistic Briefing**: 10 additions, 3 removals
- **📄 Decision Matrix**: 10 additions, 3 removals

---

## 📊 Gantt Chart

🔗 **Live:** [https://docs.google.com/spreadsheets/d/1D2RJ_avG1Dneyzgk04l2utfCH4hh84lrdqCAdSN5esM/edit](https://docs.google.com/spreadsheets/d/1D2RJ_avG1Dneyzgk04l2utfCH4hh84lrdqCAdSN5esM/edit)

📊 **Stats:** 99 words | 1,430 chars

### Content:

Group 5,,,,,,,,,,,,,,,,,,,,,,
PigPulse Gantt Chart,,,,,,,,,,,,,,,,,,,,,,Color Legend:
MONTH,August,,,,September,,,,October,,,,November,,,,December,,,,,Planning
Task/Phasing,W1,W2,W3,W4,W1,W2,W3,W4,W1,W2,W3,W4,W1,W2,W3,W4,W1,W2,W3,W4,,Developing System
SOFTWARE/SYSTEM,,,,,,,,,,,,,,,,,,,,,,Building Hardware
Plan System Design,,,,,,,,,,,,,,,,,,,,,,Presentation
Gather Initial Set of Data ,,,,,,,,,,,,,,,,,,,,,,Buying Hardware/Materials
Train using initial sets of Data,,,,,,,,,,,,,,,,,,,,,,Drafting/Making Papers
Make Landing Page,,,,,,,,,,,,,,,,,,,,,,Testing/Deployment
Expo App Development,,,,,,,,,,,,,,,,,,,,,,Improvements and Finalization
Re-Evaluate The System Design ,,,,,,,,,,,,,,,,,,,,,,
3D Prototype,,,,,,,,,,,,,,,,,,,,,,
Setting-Up Backend,,,,,,,,,,,,,,,,,,,,,,
Gather All of the Necessary Data ,,,,,,,,,,,,,,,,,,,,,,
Fine Tuning of The Model ,,,,,,,,,,,,,,,,,,,,,,
,,,,,,,,,,,,,,,,,,,,,,
,,,,,,,,,,,,,,,,,,,,,,
HARDWARE,,,,,,,,,,,,,,,,,,,,,,
Buy First Set Hardware ,,,,,,,,,,,,,,,,,,,,,,
Initial Set up of ESP,,,,,,,,,,,,,,,,,,,,,,
Initial Start in Making the Hardware,,,,,,,,,,,,,,,,,,,,,,
Buy all the Necessary Components,,,,,,,,,,,,,,,,,,,,,,
Deployment,,,,,,,,,,,,,,,,,,,,,,
PAPERS,,,,,,,,,,,,,,,,,,,,,,
Draft Capstone Papers,,,,CHPTR1,,CHPTR2,,,CHPTR3,,,,,,,,,,,,,
Chapter 4 and 5,,,,,,,,,,,,,,,4 & 5,,,,,,,
Pre-Oral Defense,,,,,,,,,,,,,,,,,,,,,,
Revisions ,,,,,,,,,,,,,,,,,,,,,,
Final Defense,,,,,,,,,,,,,,,,,,,,,,

### 🔄 Changes:
  - ### Content:
  - ### 🔄 Changes:
  - - ### Content:
  - - ### 🔄 Changes:
  - - - ### Content:

---

## 📝 Google Docs Checklist

🔗 **Live:** [https://docs.google.com/document/d/1gIoC2biR0HfDfn-PDwc7xcxRnLEFokpEpp2YSPoy-ug/edit](https://docs.google.com/document/d/1gIoC2biR0HfDfn-PDwc7xcxRnLEFokpEpp2YSPoy-ug/edit)

📊 **Stats:** 1,730 words | 10,331 chars

### Content:

﻿Tab 1
PANGUTANA / CONCERNS: 


1. Saon pagkaaccurate og basa sa thermal cam sa fever ? basin nya dala ra sa panahon ang kainit?
* So ako idea kay basahon always ang current temperature nya base sa fluctuations ma gauge ang effect sa panahon…. Murag i compare ang reading sa panahon og sa temperature sa baboy….. Naa man sad gyud nay circadian rhythm ang baboy pud so ang temperature gyud nila naturally mofluctuate, usa pud ang oras, gabie ,bugnaw gtyd na sila. So dapat aware ka sa surroundings usa ijudge …. Base sa  ako naresearch, ang best spot sa pagkuha sa reading kay ang dawnggan sa baboy nya naa poy datasets ara sa TIRPigear… nya naa pud toy research nga makaapekto daw sa reading mlx90640 ang iyang kaulingong paginit… basin mad rana og thermal paste? If mahal basin mada rag monitor sa kainiton pud sa cam nya tungod kay multimodal …. Nya raspi na, basin magamit ako webcam makita ang lighthing nya basin magpunog LLM para sybthesis sa mga readings sa mga sensor…ug kita ang webcam nga kato na baboy kay igo kaayo sa init  then i apill na niya sa context nya irecalculate…inita ana, di guro na hilinat….. Wa pagyud kaayo na polish ang idea kay murag high accuracy man and dunggan sa baboy…. Mura mag less affected sa changes sa environment and more so sa  iya man gyud sya gipamati…. Di ko sure nya og naa pay pangutana, simpayi lang ni.
2. **Here’s a clear, grounded answer to all your points**, organized by topic so it’s usable.
3. 4. ### 1. MLX90640 Thermal Camera Discrepancy + Thermal Paste
5. Yes, heat from a HAT (or the Pi itself) can increase error on the MLX90640 because the sensor is sensitive to its own temperature and nearby heat sources.
6. 7. - Thermal paste **helps a bit** if you put a small heatsink on the sensor or isolate it thermally from the main board/HAT.
8. - Better solutions:
9.   - Physically distance the thermal camera from the Pi/HAT (short cable).
10.   - Add a small shield or foam barrier.
11.   - Do software calibration (offset correction against a known temperature reference).
12.   - Keep refresh rate ≤ 8 Hz (higher rates add noise).
13. 14. Thermal paste alone is not a complete fix, but it can reduce the error.
15. 16. ### 2. Battery Basics (Voltage → Amps → Watts)
17. - Sellers usually only show **voltage** (e.g. 3.7V).
18. - **Watts = Volts × Amps**.
19. - To know capacity: look for **mAh** or **Wh**.  
20.   Example: 3.7V 5000mAh = 18.5 Wh.
21. - **Stacking LiPo / Li-ion**:
22.   - Parallel (same voltage, higher capacity) → possible if cells are matched.
23.   - Series (higher voltage) → needs proper BMS + balance charger. Do **not** just stack with TP4056.
24. - **TP4056**:
25.   - Good for single-cell (3.7V) charging only.
26.   - Max ~1A. Not enough alone for a Raspberry Pi under load.
27.   - You still need a **boost converter** (to 5V) + protection circuit.
28.   - Not ideal as the main charger for continuous Pi use.
29. 30. ### 3. Raspberry Pi Longevity & Built-in Battery
31. - Pi itself has **no built-in battery or

... *(showing first 3,000 of 10,331 chars)*

### 🔄 Changes:
  + * buhat ug criteria for purposive sampling
  + * butang ug qr sa raspi for easy access of wifi of users
  + * deploy sa cctv para kuha data na ifeed model
  + * esp ug mic nya iconnect sa raspi, cam, ug cctv
  + * extract ug process sa mic
  - ### Content:
  - ### 🔄 Changes:
  - + 100. - Graphics/video card (via PCIe) improves parallel compute and some vision workloads, but adds cost, power, and c
  - + 101. 102. ### 13. Final Feasibility Check
  - + 103. Your plan is **possible** on Raspberry Pi 5, especially with AI HAT.

---

## ✅ Capstone Checklist

🔗 **Live:** [https://docs.google.com/spreadsheets/d/1dhQRgKIwlTv7lFyXgfo84VtOYLvDgXWa4heh-6D_-EM/edit](https://docs.google.com/spreadsheets/d/1dhQRgKIwlTv7lFyXgfo84VtOYLvDgXWa4heh-6D_-EM/edit)

📊 **Stats:** 121 words | 712 chars

### Content:

CHECKLIST FOR THE CAPSTONE										
										
HARDWARE RELATED 			SOFTWARE RELATED			PAPERS			CONCERNS/PANGUTANA	ADDRESSED OR NOT 
TO DO LIST 	STATUS 		TO DO LIST 	STATUS		TO DO LIST	STATUS			
Solve the concern about how to accurately read the body temp of the pigs through the thermal cam	FALSE		Tiwas sa 3D sa Prototype	FALSE		Tiwas sa abstract when done na gather sa data	FALSE		1. Unsaon pag categorize sa tingog if kita na ang mo gather sa raw data, and unsaon nato pag identify? 	FALSE
Sugod na ug buhat sa sa protoype if ma abot na ang parts	FALSE		Mamalit sa mga necessary nga components	FALSE		Sa SOP ma finalize na ang tanan gamiton	FALSE			
			Gather sa mga needed nga data para sa model	FALSE						

### 🔄 Changes:
  - ### Content:
  - ### 🔄 Changes:
  - - ### Content:
  - - ### 🔄 Changes:
  - - - ### Content:

---

## 📕 OneDrive Manuscript

🔗 **Live:** [https://1drv.ms/w/c/9272348ac87b5645/IQCEtQsZDLghS7v1TAh9S8D2AWTQ6GaFFxaCBOuRiKOsEpw?e=mBIrJ7](https://1drv.ms/w/c/9272348ac87b5645/IQCEtQsZDLghS7v1TAh9S8D2AWTQ6GaFFxaCBOuRiKOsEpw?e=mBIrJ7)

📊 **Stats:** 4,034 words | 31,356 chars

### 📋 Document Structure:
- **2**
- **3**
- **4**
- **iii**
- **v**
- **vi**
- **1: The Problem and Its Setting**
- **1**
- **2: Review of Related Literatures**
- **3: Methodology**
- **1**
- **Swine farming plays a vital role in Philippine agriculture, contributing to household income, food security, and local economic activity. For many small-scale producers, swine farming represents an accessible source of income that can support the household needs. While a portion of the industry consists of large-scale commercial operations, a substantial majority comes from small backyard production systems. According to Philippine Statistics Authority's Swine Situation Report, backyard or small farms accounted for 67.5% of the country's total swine inventory as of the quarter of 2023, reaffirming that open-air, low-technology operations continue to dominate the local how industry despite of the growth of commercial farms. In local communities, many households raise pigs to generate and earn income. This shows that swine farming continuous to play an important role in strengthening household income and sustaining rural livelihoods in the Philippines.**

### 📝 Chapter Progress (latest content from each):

**CHAPTER 1**
>...(earlier content)...

regularities across a group of pigs without isolating or restraining individual pigs.  


PigPulse – This refers to the multimodal, TinyML based safeguard system developed in this study to detect sound irregularities and fever in pigs. In this study, it refers to the complete prototype system, including its hardware, software, and mobile or web-based alert application. 


Sound Classification – This refers to the process of identifying and labeling different types of sounds using a trained model. In this study, it refers to the ESP32 based model used to detect irregular vocalization. 


Thermal Imaging – This refers to a method of capturing temperature information from a surface using infrared sensing rather than direct contact. In this study, it refers to the MLX 90640 thermal camera used to detect pig body temperature at the pen level.  


TinyML – This refers to the practice of running machine learning models on small, lower power embedded devices. In this study, it refers to the model 

18

deployed on the ESP32 and Raspberry Pi to process sound and thermal data directly on the hardware. 


Vocalization Irregularity – This refers to a sound pattern from an animal that differs from its normal or expected vocal behavior. In this study, it refers to abnormal pig sounds detected by PigPulse as a possible early sign of distress or illness.  


Latency - refers to the amount of time, including delays, for data to travel from one given point to another. 



**CHAPTER 2**
>...(earlier content)...

mitted and determined despite difficulties encountered along the way. 

 

 

 

ABSTRACT 

3

Keywords: TinyML, swine health monitoring, sound classification, thermal imaging, edge computing, smart farming. 

 

 

 

 

 

TABLE OF CONTENTS 

                    

4

APPROVAL SHEET 
                                                               ii 

ACKNOWLEDGEMENT 
                                                              iii 

ABSTRACT 
                                                               v 

TABLE OF CONTENTS                                                                                            vi 

LIST OF TABLES                                                                                                        ix 

LIST OF FIGURES                                                                                        x 

 

Chapter 1: The Problem and Its Setting 

  

 

Introduction 

 

1 

  

 

Statement of the Problem 

 

1 

  

 

Objectives of the Study 

 

7 

  

 

Significance of the Study 

 

43 

  

 

Scope of the Study 

 

43 

  

 

Definition of Terms 

 

44 

Chapter 2: Review of Related Literatures 

 

 

Related Literature 

 

1 

5

Research Study 

 

 

System Overview 

 

1 

 

 

Setting and Participants 

 

1 

  

 

Description of Experiments 

 

7 

  

 

 

 

43 

  

 

 

 

43 

  

 

 

 

44 

 

 

 

 

 

 

 

 

 

 

 

 

6

LIST OF TABLES 

 

 

 

 

 

 

 

 

 

 

 

 

 

 

 

 

7

### Content:

for Open-Air Swine Farming 

A Capstone project in  

CPE-4425 

Presented to the Faculty of Computer Engineering Department 

Cebu Technological Campus – Sabang Danao City, Philippines  

In partial Fulfillment  

of the Requirements for the Degree 

BACHELOR OF SCIENCE IN COMPUTER ENGINEERING 

By 

Capuno, Kharl Angelo A. 

Bejoc, Rainier R. 

Gomez, AG M. 

 

 

CHONA R. DAGATAN, MSME, MEng’gEd-CPE 

ADVISER 

AUGUST 2026 

APPROVAL SHEET 

1

This thesis is entitled “Multimodal TinyML-Based Sound and Fever Detection Safeguard for Open-Air Swine Farming” prepared and submitted by Kharl Angelo A. Capuno, Rainier R. Bejoc, and AG M. Gomez in partial fulfillment of the requirements in Capstone Design Project for the Degree of Bachelor of Science in Computer Engineering has been examined and is recommended for approval and acceptance.  

CHONA R. DAGATAN, MSME, MEng’gEd-CpE 

Thesis Adviser 

 

 

HENRY C. DANLAG, CoE  
 
 
 
JESTONI P. TAN, MSEE 

Panel Member  
 
 
 
       
       
Panel Member 

 

 

 

HANNYLYN CABULINAS, CPE 
 
 
 
   JOEL JR. YPIL, CPE 

Panel Member 
     
 
 
 
 
 
Panel Member 

 

 

CHONA R. DAGATAN, MSME, MEng’gEd-CPE 

Panel Member 

 

APPROVED by tribunal at the Oral Examination with the grade of _______. 

Date: __________________ 

CHONA R. DAGATAN, MSME, MEng’gEd-CPE 

Chairman, BS Computer Engineering 

 

TOMASHITA P. ARENAS, MEng’Ed-CPE 

Dean, College of Engineering 

ACKNOWLEDGEMENT 

2

The researchers would like to express their deepest gratitude to the Almighty Father for His constant guidance, strength, and blessing throughout the conduct of this study. His wisdom gave researchers clarity, courage, and perseverance in overcoming the challenges encountered during the research process. In moments of uncertainty, His presence provided direction and hope, making the completion if this study possible. To him be all the glory, honor, and praise. 

The researchers also sincerely extend heartfelt appreciation to Engr. Chona Dagatan, their research adviser, for her invaluable guidance, unwavering support, and insightful recommendations throughout the development of this study. Her expertise, encouragement, and constructive feedback greatly contributed to the refinement and successful completion of this research. Likewise, the researchers express sincere gratitude to Engr. Henry Danlag for effectively integrating the Embedded Systems subject with the research topic, which enriched the study through the application of both theoretical and knowledge and practical skills. 

The researchers would also like to acknowledge the unwavering support of their families, friends, and relatives, whose encouragement, patience and understanding served as constant source of motivation throughout this undertaking. Their moral support helped the researchers remain committed and determined despite difficulties encountered along the way. 

 

 

 

ABSTRACT 

3

This study developed PigPulse, a multimodal TinyML-based safeguard system for open-air swine farming that detects irregularities in pig vocalization patterns and pen-level fever using thermal imaging. It was designed to monitor pig health in real time using sound sensing an MLX 90640 thermal camera, (i suwat dayon diri kung unsay gi gamit, ras pi ba, esp, etc.) -based processing, and a companion mobile/web application for farmer alerts. The system was tested (asa na deploy and pila ka adlaw) to assess vocalization irregularitiy detection, fever detection accuracy, system latency, and overall reliability. The results showed that PigPulse successfully detected (unsay results nga nakuha pag deployment)  and identified elevated body temperature at the pig pen. (Diri kay mag hisgot siya about sa accuracy and precision sa sound detection). (Diri kay ang fever detection accuracy and thermal results). The system achieved (latency figure) latency for real-time alerts. However, (testing/deployment) revealed limitations such as (limits sa system). Overall, PigPulse proved to be functional prototype for early illness detection in open-air swine farming, though improvements in (accuracy and individual pig tracking noise filtering) is still needed.  

Keywords: TinyML, swine health monitoring, sound classification, thermal imaging, edge computing, smart farming. 

 

 

 

 

 

TABLE OF CONTENTS 

                    

4

Multimodal TinyML-Based Sound and Fever Detection Safeguard 

for Open-Air Swine Farming 

A Capstone project in  

CPE-4425 

Presented to the Faculty of Computer Engineering Department 

Cebu Technological Campus – Sabang Danao City, Philippines  

In partial Fulfillment  

of the Requirements for the Degree 

By 

Capuno, Kharl Angelo A. 

Bejoc, Rainier R. 

Gomez, AG M. 

 

 

CHONA R. DAGATAN, MSME, MEng’gEd-CPE 

ADVISER 

AUGUST 2026 

APPROVAL SHEET 

1

COVER PAGE             
                       i 

APPROVAL SHEET 
                                                               ii 

ACKNOWLEDGEMENT 
                                                              iii 

ABSTRACT 
                                                               v 

TABLE OF CONTENTS                                                                                            vi 

LIST OF TABLES                                                                                                        ix 

LIST OF FIGURES                                                                                        x 

 

Chapter 1: The Problem and Its Setting 

  

	

Introduction 

	

1 




  

	

Statement of the Problem 

	

1 




  

	

Objectives of the Study 

	

7 




  

	

Significance of the Study 

	

43 




  

	

Scope of the Study 

	

43 




  

	

Definition of Terms 

	

44 




Chapter 2: Review of Related Literatures 

 

	

Related Literature 

	

1 



5

Chapter 3: Methodology 

  Research Study 

 

	

System Overview 

	

1 




 

	

Setting and Participants 

	

1 




  

	

Description of Experiments 

	

7 




  

	

 

	

43 




  

	

 

	

43 




  

	

 

	

44 




 

 

 

 

 

 

 

 

 

 

 

 

6

LIST OF TABLES 

 

 

 

 

 

 

 

 

 

 

 

 

 

 

 

 

 

7

LIST OF FIGURES 

 

 

 

 

 

 

 

 

 

 

 

 

 

 

 

 

 

 

8

CHAPTER 1 

Introduction 

Swine farming plays a vital role in Philippine agriculture, contributing to household income, food security, and local economic activity. For many small-scale producers, swine farming represents an accessible source of income that can support the household needs. While a portion of the industry consists of large-scale commercial operations, a substantial majority comes from small backyard production systems. According to Philippine Statistics Authority's Swine Situation Report, backyard or small farms accounted for 67.5% of the country's total swine inventory as of the quarter of 2023, reaffirming that open-air, low-technology operations continue to dominate the local how industry despite of the growth of commercial farms. In local communities, many households raise pigs to generate and earn income. This shows that swine farming continuous to play an important role in strengthening household income and sustaining rural livelihoods in the Philippines. 

Despite their importance, open-air and backyard swine farms face persistent challenges in disease surveillance and biosecurity. Backyard operations have been identified as high-risk, low-biosecurity sources of infection that are difficult to monitor and control compared to enclosed commercial farms. In the Philippine setting specifically, a large share of backyard farms remain informal and resource-limited, with weak compliance to biosecurity protocols, a gap that continues to be cited as a major 

9

obstacle to effective African Swine Fever containment and general disease management at the smallholder level (Portugaliza, 2025). 

 

Monitoring pig health and welfare in open-air conditions also presents accuracy and practicality challe

... *(showing first 8,000 of 31,356 chars — continues through later chapters)*

### 🔄 Changes:
  + 1. How effective is PigPulse in providing real time health monitoring of pigs in an open-air pen in terms of:
  + 1.1 detection of vocalization irregularities;
  + 1.2 pen level fever detection using thermal imaging; and
  + 1.3 accuracy of readings and system latency?
  + 2. How well does the TinyML component of PigPulse perform in terms of:
  - ### Content:
  - ### 📋 Document Structure:
  - ### 📝 Chapter Progress (latest content from each):
  - ### 🔄 Changes:
  - **CHAPTER 1**

---

## 📄 Concept Paper

📄 **Path:** `/home/solrahk/pigpulse/docs/research/pig_health_monitor_concept_paper.md`

📊 **Stats:** 863 words | 5,796 chars

### Content:

# Project Pig Health Monitor: Concept Rationale & Innovation Defense

**Project Title:** *Multimodal TinyML Acoustic Safeguard for Open-Air Swine Farming*
**Focus:** Precision Livestock Farming (PLF) / Edge AI

---

## 1. The Problem: "Why is this a Crisis?"

### The Economic Threat (The "Why")
Respiratory diseases (specifically *Swine Enzootic Pneumonia*) are the "Silent Killer" of the Philippine swine industry.
*   **Impact:** They account for up to **40-50% of mortality rates** in backyard farms (**Alawneh et al., 2014; Baluyut, 2019**).
*   **The Price Tag:** Studies (**Frontiers in Vet. Sci., 2023**) estimate a direct economic loss of **PHP 350 to PHP 800 per pig** due to slowed growth (17.4% lower ADG) and wasted feed (14% worse FCR).
*   **The Invisible Loss:** A "Coughing Pig" is burning money. The industry loses **PHP 6 Billion annually** to these invisible inefficiencies (**PCAARRD, 2022**). Early detection stops this cash bleed.

### The Technical Failure (The "How it Happens")
Why don't farmers use existing technology?
*   **The "Open-Air" Paradox:** Commercial acoustic monitors (like *SoundTalks*) are engineered for European climate-controlled barns (which are quiet and sealed).
*   **Acoustic Drowning:** In the Philippines, 70% of farms are **Open-Air**.
    *   **Wind & Rain:** Heavy monsoon rain creates broad-spectrum noise (60-80dB) that masks coughs (**Lagua & Ampode, 2023**).
    *   **Roosters & Machinery:** Sharp, transient noises trigger false positives in standard algorithms.
*   **Result:** Imported tech fails to work here. It flags "Rain" as "Coughing," rendering the data useless.

---

## 2. The Innovation: "How is this Unique?"

This project is **not** just a "Sound Recorder." It is a **Noise-Cancellation System** designed for the tropics.

### The Solution Architecture (The "How")
We implement a **Differential Noise-Subtraction** mechanism using a Dual-Microphone Array:
1.  **Mic A (The Target):** Pointed at the pig pen. (Records: *Cough + Rain + Rooster*)
2.  **Mic B (The Reference):** Pointed at the environment/roof. (Records: *Rain + Rooster*)
3.  **The Algorithm:** The ESP32-S3 performs **Spectral Subtraction** (`Mic A - Mic B`). This mathematically removes the "Rain" and "Rooster" signatures, leaving only the "Cough" isolated.
4.  **TinyML Inference:** The cleaned audio is then fed into a **MobileNetV2** model (trained on Edge Impulse) to classify "Healthy" vs. "Distressed" coughing with >90% accuracy.

### The Causality Link (The "Unique Factor")
We don't just detect the cough; we detect the **Cause**.
*   **Multimodal Sensing:** The system simultaneously performs **Non-Contact Thermal Imaging** using an AMG8833 IR Grid-EYE sensor with software bicubic upscaling (8x8 → 32x32).
*   **Why Unique?** If the **Cough Count** spikes AND **Thermal readings show elevated body temperature** (fever), the system alerts the farmer: *"Likely Viral Infection — Isolate Immediately."* If only **Cough** spikes with no fever, it al

... *(showing first 3,000 of 5,796 chars)*

### 🔄 Changes:
  + ## 1. The Problem: "Why is this a Crisis?"
  + ## 2. The Innovation: "How is this Unique?"
  + ## 3. Academic Defense (The Evidence)
  + ## 4. The "Defense Dojo" (Common Panel Questions)
  + ### The Causality Link (The "Unique Factor")
  - ### Content:
  - 📄 **Path:** `/home/solrahk/pigpulse/docs/research/pig_health_monitor_concept_paper.md`
  - 📊 **Stats:** 863 words | 5,796 chars

---

## 📄 Holistic Briefing

📄 **Path:** `/home/solrahk/pigpulse/docs/research/capstone_holistic_briefing.md`

📊 **Stats:** 723 words | 5,160 chars

### Content:

# 🐷 Pig Health Monitor — The Alpha-Omega Holistic Briefing (V3)
### IoT-Based Pig Health Monitoring System Using Multi-Modal Sensor Fusion & Edge AI
**Author:** Kharl Angelo Capunok  
**Version:** 3.0 (Full Power - No Gaps)  
**Security Level:** Encrypted (Sentinel Soul Auth)

---

## 🌌 1. THE ARCHITECTURAL PHILOSOPHY
This system is not merely a monitoring tool; it is a **Sovereign Hybrid Inference Vessel**. It bridges the gap between low-power Edge computing (ESP32-S3) and high-level Cloud intelligence (Firebase/Gemini), designed specifically for the harsh, high-noise, and low-connectivity environments of Philippine swine farms.

---

## 🧬 2. THE MATHEMATICAL CORE (NO GAPS)

### 2.1 Acoustic Signal Purification: Adaptive Spectral Subtraction
To isolate a cough in a 90dB barn, we utilize a dual-microphone differential analysis.
- **Input:** $Y(t)$ (Target Mic), $N(t)$ (Ambient Mic).
- **Transformation:** $Y(f) = \mathcal{F}\{Y(t)\}$, $N(f) = \mathcal{F}\{N(t)\}$ (512-point FFT).
- **Subtractive Formula:** 
  $|\hat{X}(f)|^2 = \max(|Y(f)|^2 - \alpha \cdot |N(f)|^2, \beta \cdot |N(f)|^2)$
  - $\alpha$ (Oversubtraction Factor): Set to **2.0** to eliminate "musical noise."
  - $\beta$ (Spectral Floor): Set to **0.02** to maintain signal continuity.
- **Classification:** Energy concentration is checked in the **600-1200Hz** band (infectious signature) vs. **1500-2500Hz** band (mechanical/dry).

### 2.2 Thermal Pig Identification: Siamese Cosine Embedding
Individual pigs are identified without physical tags using 768-pixel thermal distribution vectors.
- **Normalization:** $\vec{V}_{norm} = \frac{\vec{V} - \min(\vec{V})}{\max(\vec{V}) - \min(\vec{V})}$
- **Similarity Metric (Cosine Similarity):** 
  $S_c = \frac{\vec{A} \cdot \vec{B}}{\|\vec{A}\| \|\vec{B}\|}$
- **Logic:** If $S_c > 0.96$, identity is confirmed. If $S_c < 0.85$, a new pig profile is generated via the **Zero-Shot Enrollment Ritual**.

---

## 📡 3. THE INFRASTRUCTURE SIGNAL CHAIN

### 3.1 Edge Layer (Hardware-Software Synergy)
- **CPU Pinning (FreeRTOS):**
  - **Core 0 (Audio Master):** Handles I2S DMA interrupts, FFT processing, and Spectral Subtraction. Priority: **High**.
  - **Core 1 (Vision Master):** Handles I2C MLX90640 reads, Base64 encoding, and WiFi/Firebase TLS handshakes. Priority: **Normal**.
- **Memory Management:** Utilizing **8MB PSRAM** for the frame buffer and Siamese embedding cache. Internal SRAM is reserved for time-critical FFT operations.

### 3.2 Cloud Layer (The Multi-Tenant Vault)
Firebase Realtime Database is structured for **Account-Based Isolation (Grafting)**.
- **Schema:**
  ```json
  /users/$uid/
    /pigs/          ← Local Roster
    /telemetry/     ← Live Data (Temp, ID, Frame)
    /alerts/        ← Historical Records
    /settings/      ← Device Thresholds
  ```
- **Security Rules:** Cascading permissions ensure $User_A$ cannot view $User_B$'s pigs. Rules utilize `auth.uid` validation for every read/write operation.

---

## 🛡️ 4. THE SOVEREIGN HYBRID I

... *(showing first 3,000 of 5,160 chars)*

### 🔄 Changes:
  + ## 🌌 1. THE ARCHITECTURAL PHILOSOPHY
  + ## 📊 5. COMPARATIVE COMPETITIVE ANALYSIS
  + ## 📡 3. THE INFRASTRUCTURE SIGNAL CHAIN
  + ## 🚀 7. FINAL ROADMAP: TOWARD DEFENSE & PUBLICATION
  + ## 🛡️ 4. THE SOVEREIGN HYBRID INFERENCE PROTOCOL (SHIP)
  - ### Content:
  - 📄 **Path:** `/home/solrahk/pigpulse/docs/research/capstone_holistic_briefing.md`
  - 📊 **Stats:** 723 words | 5,160 chars

---

## 📄 Decision Matrix

📄 **Path:** `/home/solrahk/pigpulse/docs/reference/archive/capstone_decision_matrix.md`

📊 **Stats:** 541 words | 3,160 chars

### Content:

# ⚖️ The Decision Matrix: Picking Your Capstone

**Constraints:** Team of 3 | Budget: Low (<₱5k-8k) | Timeline: 6 Months | Goal: Panel Approval

---

## 1. The Comparison Table

| Feature | 🐷 **Pig Health Monitor** (Pig Cough) | 🏔️ **LIG-ON** (Landslide Mesh) | 🌊 **AGRI-RADAR** (Flood Siren) |
| :--- | :--- | :--- | :--- |
| **Hardware Core** | ESP32-S3 + Digital Mics | ESP32 + LoRa Modules (x3) | ESP32 + Radar Sensor + Siren |
| **Est. Budget** | **₱2,500 - ₱3,500** (Single Unit) | **₱4,500 - ₱6,000** (Need 3 Nodes) | **₱3,000 - ₱4,000** (Industrial Parts) |
| **Code Difficulty** | 🔥 **Hard** (TinyML + DSP) | 🟠 **Medium** (Mesh Networking) | 🟢 **Easy** (Logic is simple) |
| **Hardware Difficulty** | 🟠 **Medium** (Wiring is easy) | 🔥 **Hard** (Powering 3 remote nodes) | 🟠 **Medium** (Waterproofing) |
| **"Wow" Factor** | ⭐⭐⭐⭐⭐ (AI at the Edge) | ⭐⭐⭐⭐ (Mesh Tech) | ⭐⭐⭐ (Practicality) |
| **Panel Defense** | *"How is this accurate?"* | *"How do you power it?"* | *"Is this too simple?"* |

---

## 2. Analysis for Your Team (3 Members, 6 Months)

### 🥉 Option A: Pig Health Monitor (The "Magnum Opus")
*   **Why Pick It:** It is the most "Impressive" academically. TinyML is a hot topic. It fits a team of 3 perfectly (1 Hardware, 1 AI/Software, 1 Documentation).
*   **The Risk:** Training the AI takes time. You need to record actual pig sounds. If you can't get good data, the AI won't work.
*   **Financials:** Cheapest hardware checklist, but high effort.

### 🥈 Option B: LIG-ON (The "Reliable Engineer")
*   **Why Pick It:** Networking (LoRa) is respectable engineering. It solves a massive community problem (Carmen/Compostela).
*   **The Risk:** Buying 3-4 LoRa modules + Solar panels quickly eats the budget. Testing a "Landslide" is hard (you have to build a soil box model).
*   **Financials:** Most Expensive (Multiplying hardware by 3 nodes).

### 🥇 Option C: AGRI-RADAR (The "Safe Bet")
*   **Why Pick It:** It is **Doable in 3 Months**. The logic is simple. The impact (saving lives) is emotional and strong.
*   **The Risk:** It might be seen as "Too Simple" (just a sensor + siren).
*   **The Fix:** You **MUST** add the "Predictive Rate-of-Rise" algorithm and a Web Dashboard to make it "Capstone Worthy."
*   **Financials:** Moderate. Industrial sirens and big batteries cost a bit.

---

## 3. The Verdict

### 🏆 Recommendation: **Pig Health Monitor (Swine Monitor)**
*   **Why?** It has the best balance of **Academics vs. Cost**.
*   **For a Team of 3:**
    *   **Member 1 (HW):** Wiring the Mics & ESP32.
    *   **Member 2 (SW):** Training the Edge Impulse Model.
    *   **Member 3 (App):** Making the Firebase Dashboard.
*   **Budget:** You only need *one* prototype unit to prove it works. (Unlike LIG-ON where you need a network).

### 🥈 Runner Up: **LIG-ON (Landslide)**
*   **Why?** If your team is stronger in **Networking/Coding** than AI.
*   **Warning:** Only pick this if you have the budget for 3x LoRa LoPy or ESP32-LoRa modules.

### 🥉 Safety Net: 

... *(showing first 3,000 of 3,160 chars)*

### 🔄 Changes:
  + ## 1. The Comparison Table
  + ## 2. Analysis for Your Team (3 Members, 6 Months)
  + ## 3. The Verdict
  + ### 🏆 Recommendation: **Pig Health Monitor (Swine Monitor)**
  + ### 🥇 Option C: AGRI-RADAR (The "Safe Bet")
  - ### Content:
  - 📄 **Path:** `/home/solrahk/pigpulse/docs/reference/archive/capstone_decision_matrix.md`
  - 📊 **Stats:** 541 words | 3,160 chars

---

## 🎯 TLDR

1. **Gantt Chart**: 99 words — project timeline active
2. **Checklist**: 1730 words, 3 concerns noted
3. **Capstone Status**: 8 incomplete, 0 complete
4. **OneDrive Manuscript**: 4034 words — ⚠️ ABSTRACT STILL HAS PLACEHOLDERS
5. **Local Files**: 3/3 fetched successfully
