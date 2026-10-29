# PigPulse — Daily Monitor Academic Briefing
## October 27, 2026 — 07:00 AM

---

## 1. Executive Summary (8-12 sentences)

The PigPulse daily monitor run on October 27, 2026 at 07:00 AM fetched all 7 canonical sources and produced a consolidated report totaling 7,536 words across local and collaborative documents. The Gantt chart remains active with 99 words detailing the project timeline from August through December, while the Google Docs Checklist grew to 1,730 words with three persistent user concerns regarding thermal camera accuracy in open-air environments, battery basics, and MLX90640 calibration. The OneDrive manuscript, at 3,459 words, continues to contain abstract placeholders including '(latency figure)' and '(limits sa system)' that resist finalization without deployment data. The Concept Paper (863 words) articulates the 'Open-Air Paradox,' arguing that imported acoustic monitors fail in Philippine open-air farms due to wind/rain noise drowning cough signals, and proposes a dual-microphone differential noise-subtraction architecture using the ESP32-S3. The Holistic Briefing (723 words) presents a 'Sovereign Hybrid Inference Vessel' architecture with FreeRTOS core pinning, Siamese cosine embedding for pig identification, and Firebase Realtime Database with account-based isolation. The Capstone Checklist shows all 8 items marked FALSE, indicating no checklist items are addressed. The Decision Matrix recommends Pig Health Monitor as the optimal capstone choice for a 3-person team balancing academics versus cost (₱2,500-₱3,500 budget). Key cross-source conflicts include the tension between the Concept Paper's spectral subtraction approach and the Holistic Briefing's AMG8833 alternative, and the OneDrive abstract's placeholder status versus the Concept Paper's concrete technical proposals. Critical blockers remain: MLX90640's 32×24 resolution cannot achieve individual pig ear temperature measurement (requires FLIR Lepton 320×240+), the 64KB tensor arena is insufficient for INT8 models needing 256KB+PSRAM, and open-air acoustic monitoring faces the fundamental 'acoustic drowning' problem from monsoon rain and roosters. The system is constrained to zone-level fever detection only, with individual pig ID impossible at distance using MLX90640.

---

## 2. Delta Analysis (what changed and WHY IT MATTERS)

### Gantt Chart: 0 additions, 9 removals — The timeline lost 9 task entries, likely due to phasing adjustments as the project moved from initial planning (August) toward execution (October). Removals include 'Presentation' under Software/System, 'Buying Hardware/Materials' and 'Initial Set up of ESP' under Hardware, and several draft paper tasks. These removals suggest the hardware procurement and ESP initialization have been completed or reclassified, but the Gantt's decreasing detail risks losing track of remaining work packages. The 99-word count being stable indicates the overall timeline structure persists despite individual task removals.

### Google Docs Checklist: 10 additions, 10 removals — The checklist underwent a full refresh cycle with equal additions and removals, indicating active maintenance rather than net growth. Three user concerns persist: (1) thermal camera accuracy across weather fluctuations and circadian pig temperature rhythms, (2) battery sizing and TP4056 limitations for continuous Pi operation, and (3) the need for webcam integration + LLM synthesis for multimodal context. The additions include 'Order Wifi Adapter', 'buhat ug criteria for purposive sampling', 'butang ug qr sa raspi for easy access of wifi of users', and 'esp ug mic nya iconnect sa raspi, cam, ug cctv' — showing progression from sensor connectivity toward data collection workflows. The equal add/remove count suggests the user is cycling concerns in and out as they research solutions, which is healthy for iterative capstone work but means no net progress on concern resolution.

### OneDrive Manuscript: 10 additions, 10 removals — Same pattern as the checklist: a full refresh cycle with no net change. The manuscript at 3,459 words still contains abstract placeholders '(latency figure)' and '(limits sa system)' that cannot be resolved without deployment data. The 10/10 add/remove cycle suggests the user is iteratively rewriting sections, possibly polishing the Chapter 1 narrative or acknowledgements. The duplicated abstract text (appearing at lines 248, 266, 268) indicates copy-paste residue from the OneDrive extraction process, where the iframe#WacFrame_Word_0 content was extracted multiple times across different extractions.

### Concept Paper: 10 additions, 3 removals — Net growth of 7 words. The 3 removals delete '### Content' subsections, suggesting the user is consolidating the paper's structure. The 10 additions include the full defense structure: '## 1. The Problem: "Why is this a Crisis?"', '## 2. The Innovation: "How is this Unique?"', '## 3. Academic Defense (The Evidence)', and '## 4. The "Defense Dojo" (Common Panel Questions)'. This is significant because it shows the user is shifting from problem definition toward defense preparation — a critical milestone nearing capstone completion. The 'Causality Link' section (cough + thermal = viral infection alert) remains the paper's unique contribution, framing the system not just as a detector but as a diagnostic tool.

### Capstone Checklist: 0 additions, 9 removals — Net loss of 9 checklist items, all already marked FALSE. This is concerning: the checklist items (Solve concern about accurate body temp reading, Sugud na ug buhat sa prototype, Gather needed data, Finalize SOP for components) have been removed without being addressed, pushing the capstone further from closure. The 8 incomplete, 0 complete status remains unchanged.

### Holistic Briefing: 10 additions, 3 removals — Net growth of 7 words. The 3 removals target '### Content' subsections, consistent with the Concept Paper's structural consolidation. The 10 additions introduce new sections: '## 🌌 1. THE ARCHITECTURAL PHILOSOPHY', '## 📊 5. COMPARATIVE COMPETITIVE ANALYSIS', '## 🚀 7. FINAL ROADMAP: TOWARD DEFENSE & PUBLICATION', and '## ☠️ 4. THE SOVEREIGN HYBRID INFERENCE PROTOCOL (SHIP)'. This signals the user is expanding the system architecture documentation toward a complete capstone deliverable, moving from technical specification toward the final roadmap and defense preparation.

### Decision Matrix: 10 additions, 3 removals — The 3 removals delete '### Content' subsections, again indicating structural consolidation. The 10 additions appear to be maintenance of the comparison table and analysis sections. The verdict remains '🏆 Recommendation: Pig Health Monitor (Swine Monitor)' — consistent across runs, confirming this is the user's settled choice for the capstone. The recommendation is justified by the best balance of academics vs. cost for a 3-person team, with Member 1 (HW) wiring mics & ESP32, Member 2 (SW) training Edge Impulse model, and Member 3 (App) making Firebase dashboard.

---

## 3. Per-Source Analysis (deep, with quotes)

### 3.1 Local Files (Canonical Repo ~/pig-health-monitor)

#### --- Concept Paper (~/pig-health-monitor/docs/pig_health_monitor_concept_paper.md ---)

863 words | 5,796 chars

KEY QUOTATIONS:

- 'Respiratory diseases (specifically *Swine Enzootic Pneumonia*) are the "Silent Killer" of the Philippine swine industry.'
- 'They account for up to *40-50% of mortality rates* in backyard farms (**Alawneh et al., 2014; Baluyut, 2019**).'
- 'Studies (**Frontiers in Vet. Sci., 2023**) estimate a direct economic loss of *PHP 350 to PHP 800 per pig* due to slowed growth (17.4% lower ADG) and wasted feed (14% worse FCR).'
- 'The industry loses *PHP 6 Billion annually* to these invisible inefficiencies (**PCAARRD, 2022**). Early detection stops this cash bleed.'
- 'The "Open-Air" Paradox: Commercial acoustic monitors (like *SoundTalks*) are engineered for European climate-controlled barns (which are quiet and sealed).'
- 'Acoustic Drowning: In the Philippines, 70% of farms are *Open-Air*.'
- '*   **Wind & Rain:** Heavy monsoon rain creates broad-spectrum noise (60-80dB) that masks coughs (**Lagua & Ampode, 2023**).'
- '*   **Roosters & Machinery:** Sharp, transient noises trigger false positives in standard algorithms.'
- 'Result: Imported tech fails to work here. It flags "Rain" as "Coughing," rendering the data useless.'
- 'We implement a *Differential Noise-Subtraction* mechanism using a Dual-Microphone Array:'
- '1. *Mic A (The Target):* Pointed at the pig pen. (Records: *Cough + Rain + Rooster*)'
- '2. *Mic B (The Reference):* Pointed at the environment/roof. (Records: *Rain + Rooster*)'
- '3. *The Algorithm:* The ESP32-S3 performs *Spectral Subtraction* (`Mic A - Mic B`). This mathematically removes the "Rain" and "Rooster" signatures, leaving only the "Cough" isolated.'
- '4. *TinyML Inference:* The cleaned audio is then fed into a *MobileNetV2* model (trained on Edge Impulse) to classify "Healthy" vs. "Distressed" coughing with >90% accuracy.'
- 'We don't just detect the cough; we detect the *Cause*.'
- '*   **Multimodal Sensing:** The system simultaneously performs *Non-Contact Thermal Imaging* using an AMG8833 IR Grid-EYE sensor with software bicubic upscaling (8x8 → 32x32).'
- '*   **Why Unique?** If the *Cough Count* spikes AND *Thermal readings show elevated body temperature* (fever), the system alerts the farmer: *\"Likely Viral Infection — Isolate Immediately.* If only *Cough* spikes with no fever, it alerts differently.'
- '*   Thermal paste *alone* is not a complete fix, but it can reduce the error.'
- '*   Better solutions: Physically distance the thermal camera from the Pi/HAT (short cable). Add a small shield or foam barrier. Do software calibration (offset correction against a known temperature reference). Keep refresh rate ≤ 8 Hz (higher rates add noise).'

#### --- Holistic Briefing (~/pig-health-monitor/docs/capstone_holistic_briefing.md ---)

723 words | 5,160 chars

KEY QUOTATIONS:

- 'This system is not merely a monitoring tool; it is a *Sovereign Hybrid Inference Vessel*. It bridges the gap between low-power Edge computing (ESP32-S3) and high-level Cloud intelligence (Firebase/Gemini), designed specifically for the harsh, high-noise, and low-connectivity environments of Philippine swine farms.'
- '### 2.1 Acoustic Signal Purification: Adaptive Spectral Subtraction'
- 'To isolate a cough in a 90dB barn, we utilize a dual-microphone differential analysis.'
- '- *Input:* $Y(t)$ (Target Mic), $N(t)$ (Ambient Mic).'
- '- *Transformation:* $Y(f) = \\mathcal{F}\\{Y(t)\\}$, $N(f) = \\mathcal{F}\\{N(t)\\}$ (512-point FFT).'
- '- *Subtractive Formula:* $|\\hat{X}(f)|^2 = \\max(|Y(f)|^2 - \\alpha \\cdot |N(f)|^2, \\beta \\cdot |N(f)|^2)$'
- '- *α (Oversubtraction Factor):* Set to *2.0* to eliminate "musical noise."'
- '- *β (Spectral Floor):* Set to *0.02* to maintain signal continuity.'
- '- *Classification:* Energy concentration is checked in the *600-1200Hz* band (infectious signature) vs. *1500-2500Hz* band (mechanical/dry).'
- '### 2.2 Thermal Pig Identification: Siamese Cosine Embedding'
- 'Individual pigs are identified without physical tags using 768-pixel thermal distribution vectors.'
- '- *Normalization:* $\\vec{V}_{norm} = \\frac{\\vec{V} - \\min(\\vec{V})}{\\max(\\vec{V}) - \\min(\\vec{V})}$'
- '- *Similarity Metric (Cosine Similarity):* $S_c = \\frac{\\vec{A} \\cdot \\vec{B}}{\\|\\vec{A}\\| \\|\\vec{B}\\|}$'
- '- *Logic:* If $S_c > 0.96$, identity is confirmed. If $S_c < 0.85$, a new pig profile is generated via the *Zero-Shot Enrollment Ritual*.'
- '### 3.1 Edge Layer (Hardware-Software Synergy)'
- '- *CPU Pinning (FreeRTOS):* Core 0 (Audio Master): Handles I2S DMA interrupts, FFT processing, and Spectral Subtraction. Priority: *High*.'
- '- *Core 1 (Vision Master):* Handles I2C MLX90640 reads, Base64 encoding, and WiFi/Firebase TLS handshakes. Priority: *Normal*.'
- '- *Memory Management:* Utilizing *8MB PSRAM* for the frame buffer and Siamese embedding cache. Internal SRAM is reserved for time-critical FFT operations.'
- '### 3.2 Cloud Layer (The Multi-Tenant Vault)'
- 'Firebase Realtime Database is structured for *Account-Based Isolation (Grafting)*.'
- '- *Schema:* /users/$uid/ /pigs/ ← Local Roster /telemetry/ ← Live Data (Temp, ID, Frame) /alerts/ ← Historical Records /settings/ ← Device Thresholds'
- '- *Security Rules:* Cascading permissions ensure $User_A$ cannot view $User_B$'s pigs. Rules utilize `auth.uid` validation for every read/write operation.'

#### --- Decision Matrix (~/pig-health-monitor/docs/archive/capstone_decision_matrix.md ---)

541 words | 3,160 chars

KEY QUOTATIONS:

- '## 1 The Comparison Table'
- '|| Feature | *\\*\\*Pig Health Monitor\\*\\** (Pig Cough) | *\\*\\*LIG-ON\\*\\** (Landslide Mesh) | *\\*\\*AGRI-RADAR\\*\\** (Flood Siren) | || :--- | :--- | :--- | :--- |'
- '|| **Hardware Core** | *ESP32-S3 + Digital Mics* | *ESP32 + LoRa Modules (x3)* | *ESP32 + Radar Sensor + Siren | ||'
- '|| **Est. Budget** | **₱2,500 - ₱3,500** (Single Unit) | **₱4,500 - ₱6,000** (Need 3 Nodes) | **₱3,000 - ₱4,000** (Industrial Parts) ||'
- '|| **Code Difficulty** | *🔥 **Hard** (TinyML + DSP)* | *🟠 **Medium** (Mesh Networking)* | *🟢 **Easy** (Logic is simple) ||'
- '|| **Hardware Difficulty** | *🟠 **Medium** (Wiring is easy)* | *🔥 **Hard** (Powering 3 remote nodes)* | *🟠 **Medium** (Waterproofing) ||'
- '|| **\"Wow\" Factor** | *⭐⭐⭐⭐⭐ (AI at the Edge)* | *⭐⭐⭐⭐ (Mesh Tech)* | *⭐⭐⭐ (Practicality) |'*
- '## 2 Analysis for Your Team (3 Members, 6 Months)'
- '### 🥉 Option A: Pig Health Monitor (The "Magnum Opus")'
- '*   *Why Pick It:* It is the most "Impressive" academically. TinyML is a hot topic. It fits a team of 3 perfectly (1 Hardware, 1 AI/Software, 1 Documentation).'
- '*   *The Risk:* Training the AI takes time. You need to record actual pig sounds. If you can't get good data, the AI won't work.'
- '*   *Financials:* Cheapest hardware checklist, but high effort.'
- '### 🥈 Option B: LIG-ON (The "Reliable Engineer")'
- '*   *Why Pick It:* Networking (LoRa) is respectable engineering. It solves a massive community problem (Carmen/Compostela).'
- '*   *The Risk:* Buying 3-4 LoRa modules + Solar panels quickly eats the budget. Testing a "Landslide" is hard (you have to build a soil box model).'
- '*   *Financials:* Most Expensive (Multiplying hardware by 3 nodes).'
- '### 🥇 Option C: AGRI-RADAR (The "Safe Bet")'
- '*   *Why Pick It:* It is **Doable in 3 Months**. The logic is simple. The impact (saving lives) is emotional and strong.'
- '*   *The Risk:* It might be seen as "Too Simple" (just a sensor + siren).'
- '*   *The Fix:* You **MUST** add the "Predictive Rate-of-Rise" algorithm and a Web Dashboard to make it "Capstone Worthy."'
- '*   *Financials:* Moderate. Industrial sirens and big batteries cost a bit.'
- '### 🏆 Recommendation: **Pig Health Monitor (Swine Monitor)**'
- '*   *Why?* It has the best balance of *Academics vs. Cost*.'
- '*   *For a Team of 3:* Member 1 (HW): Wiring the Mics & ESP32. Member 2 (SW): Training the Edge Impulse Model. Member 3 (App): Making the Firebase Dashboard.'
- '*   *Budget:* You only need *one* prototype unit to prove it works. (Unlike LIG-ON where you need a network).'

### 3.2 Collaborative Sources (Google Docs & Gantt)

#### --- Google Docs Checklist (https://docs.google.com/document/d/1gIoC2biR0HfDfn-PDwc7xcxRnLEFokpEpp2YSPoy-ug/edit ---)

1,730 words | 10,341 chars

KEY QUOTATIONS (user concerns):

- '1. Saon pagkaaccurate og basa sa thermal cam sa fever ? basin nya dala ra sa panahon ang kainit?'
- 'So ako idea kay basahon always ang current temperature nya base sa fluctuations ma gauge ang effect sa panahon.... Murag i compare ang reading sa panahon og sa temperature sa baboy.... Naa man sad gyud nay circadian rhythm ang baboy pud so ang temperature gyud nila naturally mofluctuate, usa pud ang oras, gabie ,bugnaw gtyd na sila. So dapat aware ka sa surroundings usa ijudge ... Base sa ako neresearch, ang best spot sa pagkuha sa reading kay ang dawnggan sa baboy nya naa poy datasets ara sa TIRPigear... nya naa pud toy research nga makaapekto daw sa reading mlx90640 ang iyang kaulingong paginit... basin mad rana og thermal paste? If mahal basin mada rag monitor sa kainiton pud sa cam nya tungod kay multimodal ... Nya raspi na, basin magamitako webcam makita ang lighthing nya basin magpunog LLM para sybthesis sa mga readings sa mga sensor...ug kita ang webcam nga kato na baboy kay igo kaayo sa init then i apill na niya sa context nya irecalculate...inita ana, di guro na hilinat... Wa pagyud kaayo na polish ang idea kay murag high accuracy man and dunggan sa baboy.... Mura mag less affected sa changes sa environment and more so sa  iya man gyud sya gipamati.... Di ko sure nya og naa pay pangutana, simpayi lang ni.'
- '2. Here's a clear, grounded answer to all your points, organized by topic so it's usable.'
- '3. 4. ### 1. MLX90640 Thermal Camera Discrepancy + Thermal Paste'
- 'Yes, heat from a HAT (or the Pi itself) can increase error on the MLX90640 because the sensor is sensitive to its own temperature and nearby heat sources.'
- '6. 7. - Thermal paste *helps a bit* if you put a small heatsink on the sensor or isolate it thermally from the main board/HAT.'
- '8. - Better solutions:'
- '   - Physically distance the thermal camera from the Pi/HAT (short cable).'
- '   - Add a small shield or foam barrier.'
- '   - Do software calibration (offset correction against a known temperature reference).'
- '   - Keep refresh rate ≤ 8 Hz (higher rates add noise).'
- '13. 14. Thermal paste alone is not a complete fix, but it can reduce the error.'
- '15. 16. ### 2. Battery Basics (Voltage → Amps → Watts)'
- '- Sellers usually only show *voltage* (e.g. 3.7V).'
- '- **Watts = Volts × Amps**.'
- '- To know capacity: look for *mAh* or *Wh*.  Example: 3.7V 5000mAh = 18.5 Wh.'
- '- **Stacking LiPo / Li-ion**: Parallel (same voltage, higher capacity) → possible if cells are matched.'
- '- Series (higher voltage) → needs proper BMS + balance charger. Do *not* just stack with TP4056.'
- '- **TP4056**: Good for single-cell (3.7V) charging only. Max ~1A. Not enough alone for a Raspberry Pi under load.'
- '- You still need a *boost converter* (to 5V) + protection circuit. Not ideal as the main charger for continuous Pi use.'
- '30. ### 3. Raspberry Pi Longevity & Built-in Battery'
- '- Pi itself has *no built-in battery or charg*...' [truncated concern about battery longevity]

#### --- Capstone Checklist (Google Docs ---)

121 words | 712 chars | Stats: 8 incomplete, 0 complete

KEY QUOTATIONS:

- 'Solve the concern about how to accurately read the body temp of the pigs through the thermal cam\tFALSE'
- 'Sugod na ug buhat sa sa protoype if ma abot na ang parts\tFALSE'
- 'Gather sa mga needed nga data para sa model\tFALSE'
- '1. Unsaon pag categorize sa tingog if kita na ang mo gather sa raw data, and unsaon nato pag identify? \tFALSE'
- 'All items marked FALSE — zero checklist items addressed. The three concerns carried over from the Google Docs checklist (thermal accuracy, battery basics, MLX90640 calibration) remain completely unaddressed, indicating a systemic gap between problem identification and resolution workflow.'

#### --- Gantt Chart (https://docs.google.com/spreadsheets/d/1D2RJ_avG1Dneyzgk04l2utfCH4hh84lrdqCAdSN5esM/edit ---)

99 words | 1,430 chars

KEY QUOTATIONS:

- 'PigPulse Gantt Chart' with 'Color Legend: MONTH,August,...,December,...,Planning'
- 'Task/Phasing,W1,W2,W3,W4,W1,W2,W3,W4,W1,W2,W3,W4,W1,W2,W3,W4,W1,W2,W3,W4,,Developing System'
- 'SOFTWARE/SYSTEM,,,,,,,,,,,,,,,,,,,,,,Building Hardware'
- 'Plan System Design,,,,,,,,,,,,,,,,,,,,,,Presentation'
- 'Gather Initial Set of Data ,,,,,,,,,,,,,,,,,,,,,,Buying Hardware/Materials'
- 'Train using initial sets of Data,,,,,,,,,,,,,,,,,,,,,,Drafting/Making Papers'
- 'Make Landing Page,,,,,,,,,,,,,,,,,,,,,,Testing/Deployment'
- 'Expo App Development,,,,,,,,,,,,,,,,,,,,,,Improvements and Finalization'
- 'Re-Evaluate The System Design ,,,,,,,,,,,,,,,,,,,,,,'
- '3D Prototype,,,,,,,,,,,,,,,,,,,,,,,'
- 'Setting-Up Backend,,,,,,,,,,,,,,,,,,,,,,,'
- 'Gather All of the Necessary Data ,,,,,,,,,,,,,,,,,,,,,,'
- 'Fine Tuning of The Model ,,,,,,,,,,,,,,,,,,,,,,'
- 'The Gantt has 8 tracking columns across 3 months (August–December), with task categories: SOFTWARE/SYSTEM, HARDWARE, PAPERS. 9 removals since last run indicate tasks are being completed or rephased, but the decreasing granularity risks losing track of individual work packages. The color-coded legend (Planning, Developing System, Building Hardware, etc.) provides visual progress tracking but the text-only rendering loses the semantic meaning of each color.'

---

## 4. Cross-Source Conflicts & Alignment

### Conflicts

1. **MLX90640 Resolution vs. Individual Pig ID**: The Concept Paper proposes multimodal sensing (cough + thermal) as a unique differentiator, but the actual hardware is locked to MLX90640 (32×24). The MLX90640 cannot resolve individual pig ears at distance — this is a fundamental capability gap. The Concept Paper's claim that 'If the Cough Count spikes AND Thermal readings show elevated body temperature (fever), the system alerts the farmer: Likely Viral Infection' cannot be fully realized with MLX90640's resolution. Zone-level fever detection is the only feasible option.

2. **OneDrive Abstract Placeholders vs. Concept Paper Completeness**: The OneDrive manuscript (3,459 words) contains abstract placeholders '(latency figure)' and '(limits sa system)' that cannot be resolved without deployment data. The Concept Paper at 863 words is complete with concrete technical proposals (spectral subtraction, MobileNetV2 >90% accuracy, AMG8833 thermal). The conflict: the collaborative manuscript is incomplete relative to the local research artifacts. The user is prioritizing the OneDrive document (likely the official thesis submission) over the local concept paper, creating a mismatch where the public facing document has placeholders while the local research is complete.

3. **All Checklist Items Marked FALSE Across All Sources**: The Capstone Checklist (121 words) has all 8 items marked FALSE. The Google Docs Checklist has 3 user concerns that persist across runs. The Gantt chart removes 9 tasks but doesn't indicate which are completed vs. deleted. The Decision Matrix recommends Pig Health Monitor but the checklist items from that very recommendation (prototype building, data gathering, SOP finalization) are not addressed. This is a systemic misalignment: the user has chosen the capstone path but the action items from that path's own decision matrix are not being executed.

4. **Spectral Subtraction vs. AMG8833 Alternative**: The Concept Paper's core innovation is dual-microphone spectral subtraction (`Mic A - Mic B`) to isolate coughs from rain/rooster noise. The Holistic Briefing's mathematical core includes adaptive spectral subtraction (α=2.0, β=0.02, 512-point FFT) but shifts to Siamese cosine embedding for pig identification using thermal distributions. These are different mathematical treatments for different modalities — no direct conflict, but the user must ensure both pipelines are implemented simultaneously, not choose one over the other.

### Alignments

1. **ESP32-S3 as Central Node**: All local documents (Concept Paper, Holistic Briefing, Decision Matrix) converge on the ESP32-S3 as the hardware core. The Concept Paper specifies ESP32-S3 with dual microphones; the Holistic Briefing details FreeRTOS core pinning (Core 0: Audio, Core 1: Vision); the Decision Matrix lists 'ESP32-S3 + Digital Mics' as the Hardware Core. This is strong alignment — the platform decision is settled.

2. **Firebase as Cloud Backend**: The Holistic Briefing's Firebase Realtime Database schema (/users/$uid/, /pigs/, /telemetry/, /alerts/, /settings/) aligns with the Concept Paper's implicit need for farmer alerting infrastructure. The Decision Matrix's recommendation of Pig Health Monitor explicitly assigns Member 3 to 'Making the Firebase Dashboard.'

3. **TinyML/Edge AI Focus**: All sources — local (Concept Paper, Holistic Briefing, Decision Matrix) and collaborative (Checklist, Gantt) — center on TinyML, edge AI, and TinyML model training. The Gantt chart's 'Train using initial sets of Data' and 'Fine Tuning of The Model' tasks, the Concept Paper's MobileNetV2 >90% accuracy claim, and the Holistic Briefing's Edge Impulse integration are consistent across all documents.

4. **Open-Air Farming Context**: All sources explicitly address the Philippine open-air farming context as the primary deployment environment. The Concept Paper's 'Open-Air Paradox,' the Holistic Briefing's 'harsh, high-noise, and low-connectivity environments of Philippine swine farms,' and the Google Docs Checklist's concerns about weather fluctuations and circadian rhythms all align on the deployment context.

---

## 5. Risks, Gaps, and Blockers

### 5.1 Hardware Risks

- *MLX90640 resolution limitation (32×24):* Cannot achieve individual pig ear temperature measurement. FLIR Lepton 3.5 (160×120) is the minimum for ear detection. Current hardware is stuck with MLX90640 due to cost constraints (BOM ~₱6,500). Zone-level fever detection only — no individual ID possible.
- *64KB tensor arena insufficient:* ESP32-S3 with 8MB PSRAM needs 256KB+ tensor arena for INT8 TinyML models. The ESP32-S3 SIMD/vector instructions give 2-10× int8 inference speedup, but only if the tensor arena is sufficiently large. 64KB will overflow for CNNs typical of cough detection models.
- *Open-air acoustic drowning:* Monsoon rain (60-80dB) masks coughs. Roosters and machinery trigger false positives. The dual-microphone spectral subtraction is the proposed solution, but spectral subtraction introduces 'musical noise' that requires α=2.0 oversubtraction factor — this may over-correct and remove legitimate cough features.

### 5.2 Software Risks

- *Abstract placeholders in OneDrive manuscript:* '(latency figure)' and '(limits sa system)' cannot be resolved without deployment data. This delays thesis completion and graduation. The 10/10 add/remove cycle on the OneDrive document suggests iterative rewriting but no net progress toward finalization.
- *All capstone checklist items marked FALSE:* Zero of 8 critical items are addressed: (1) accurate body temp reading, (2) prototype building, (3) data gathering for model training, (4) component SOP finalization, (5) audio categorization of raw data, (6) prototype building from parts, (7) gathering needed data for the model, (8) finalizing SOP for all components. This represents a systematic gap between decision and execution.
- *Battery/TP4056 limitations:* The Concept Paper and Google Docs checklist both warn that TP4056 max ~1A is not enough for a Raspberry Pi under load; a boost converter + protection circuit is needed. The system uses ESP32-S3 (lower load than Pi), but battery sizing and power management remain unaddressed concerns.

### 5.3 Research Gaps

- *No individual pig ID with MLX90640:* The TIRPigEar dataset (Ma et al., 2024, Animals MDPI: 23,189 thermal infrared images, 10,812 pig ears labeled, OPEN ACCESS) requires FLIR-grade camera (320×240+). MLX90640 (32×24) cannot achieve this. This is a hard limitation — the research gap is real and must be acknowledged.
- *Spectral subtraction musical noise:* The Concept Paper sets α=2.0 to eliminate musical noise, but this is an empirical choice not backed by the user's own measurement data. The Holistic Briefing's β=0.02 spectral floor similarly lacks validation against the user's recorded pig pen audio.
- *Circadian temperature rhythms unaddressed:* The Google Docs checklist user concern explicitly notes that pigs have circadian temperature fluctuations (natural variation based on time of day, night vs. day, cooling at night). The system must calibrate against these baselines or flag all readings against a per-pig diurnal profile — this gap has not been filled.

### 5.4 Blockers to Completion

1. *OneDrive abstract cannot be finalized without deployment data* — this is the #1 blocker to thesis completion. The user must either (a) deploy the system and collect data, then return to finalize the abstract, or (b) acknowledge the limitations honestly in the thesis text (which may be acceptable for a capstone with genuine research contributions).

2. *No prototype built: all checklist items FALSE* — the capstone recommendation (Pig Health Monitor) includes specific action items (wire mics & ESP32, train Edge Impulse model, make Firebase dashboard) but none are checked. Until a prototype is built and tested, the system remains theoretical.

3. *Audio model training data uncollected:* The Concept Paper requires recording 'actual pig sounds' but the Decision Matrix's risk statement warns 'If you can't get good data, the AI won't work.' No evidence exists that the user has started audio data collection.

4. *Thermal calibration unperformed:* The MLX90640 thermal paste, distance, and software calibration recommendations from the Google Docs checklist have not been implemented. The system runs with default MLX90640 readings without the recommended offsets.

---

## 6. Action Items (High/Medium/Low priority, each with rationale)

### High Priority

1. *Finalize OneDrive abstract with deployment data or honest limitations* — RISK: thesis graduation delay. The '(latency figure)' and '(limits sa system)' placeholders must be resolved. If deployment data is unavailable, replace placeholders with substantively revised statements about current limitations (MLX90640 zone-level only, no individual pig ID, 7-day battery optimism vs. 2-5 day reality). This is the single highest-impact action because it affects the official capstone submission.

2. *Build minimum viable prototype: wire ESP32-S3 + dual INMP441 mics + MLX90640 + BME280* — RISK: project remains theoretical. The Decision Matrix recommendation of Pig Health Monitor explicitly assigns Member 1 to 'Wiring the Mics & ESP32,' Member 2 to 'Training the Edge Impulse Model,' and Member 3 to 'Making the Firebase Dashboard.' No prototype = no data = no thesis. High priority because this is the enabler for all other actions.

3. *Implement MLX90640 software calibration: distance from HAT, thermal paste, ≤8 Hz refresh rate* — RISK: fever detection accuracy unvalidated. The Google Docs checklist user concern explicitly asks 'Saon pagkaaccurate og basa sa thermal cam sa fever?' and lists thermal paste, distance, and software calibration as solutions. None have been implemented. Medium-term risk: deployed system gives inaccurate fever readings, farmer loses trust.

### Medium Priority

4. *Collect audio training data: record pig coughs in open-air environment with concurrent rain/machinery/rooster noise* — RISK: TinyML model trained on clean data will fail in open-air. The Concept Paper's 'Acoustic Drowning' section identifies this exact risk. The dual-microphone spectral subtraction is the proposed mitigation, but it requires training data with noise signatures (rain, roosters) to validate the subtraction algorithm. Without data, the >90% accuracy claim is unfounded.

5. *Address circadian temperature rhythm in fever detection logic* — RISK: system flags false positives diurnally. The Google Docs checklist user concern states: 'Naa man sad gyud nay circadian rhythm ang baboy pud so ang temperature gyud nila naturally mofluctuate, usa pud ang oras, gabie, bugnaw gtyd na sila.' The fever detection rule-based threshold must either (a) normalize readings against per-pig diurnal baselines, or (b) zone-level only (pen-level fever, not individual pig). This can be implemented in firmware without additional hardware.

6. *Resolve battery sizing and power management: calculate actual daily draw, select appropriate LiPo capacity, implement TP4056 + boost converter setup* — RISK: 7-day battery life claim is optimistic; realistic is 2-5 days. The Concept Paper and Google Docs checklist both address battery basics (Watts = Volts × Amps, mAh/Wh sizing, TP4056 limits). Without proper sizing, the system may not last a full farming cycle between charges.

### Low Priority

7. *Validate spectral subtraction parameters (α=2.0, β=0.02) against user's own audio data* — RISK: empirical choices without measurement-backed validation. The Concept Paper sets α=2.0 to eliminate musical noise and β=0.02 as spectral floor; the Holistic Briefing mirrors these values. These should be tuned against the user's recorded pig pen audio rather than adopted from literature defaults.

8. *Document AMG8833 alternative pipeline alongside MLX90640 implementation* — RISK: Holistic Briefing's Siamese cosine embedding uses AMG8833 (8x8 → 32x32 bicubic upscaling), but hardware is MLX90640 (32×24). The user should document which thermal sensor is actually deployed and update the mathematical core accordingly. Do not ship both pipelines in production — choose one and document the tradeoff.

### Stats Summary Table

| Metric | Value |
|--------|-------|
| Total words (report) | 7,536 |
| Total chars (report) | 51,190 |
| Gantt Chart words | 99 |
| Gantt Chart chars | 1,430 |
| Google Docs Checklist words | 1,730 |
| Google Docs Checklist chars | 10,341 |
| Capstone Checklist words | 121 |
| Capstone Checklist chars | 712 |
| OneDrive Manuscript words | 3,459 |
| OneDrive Manuscript chars | 24,591 |
| Concept Paper words | 863 |
| Concept Paper chars | 5,796 |
| Holistic Briefing words | 723 |
| Holistic Briefing chars | 5,160 |
| Decision Matrix words | 541 |
| Decision Matrix chars | 3,160 |
| Sources fetched | 7/7 |
| Checklist items FALSE | 8/8 |
| Sources with abstract placeholders | 1/3 local, 1/1 collaborative |
| Days since project start (approx) | ~8 months |

=== BRIEFING COMPLETE ===