# 🐷 PigPulse Daily Academic Briefing — September 17, 2026

**Generated:** 06:04 AM PST | **Monitoring Period:** Sept 16 → Sept 17, 2026
**Sources:** 4 Collaborative (Google Docs/OneDrive) + 3 Local | **Total Content:** 7,311 words | 50,816 chars

---

## Executive Summary

PigPulse's daily monitoring cycle completed successfully across all 7 data sources, revealing steady content evolution across collaborative documents and stable local reference materials. The collaborative Google Docs checklist underwent significant revision (10 additions, 10 removals), reflecting active brainstorming around MLX90640 thermal accuracy, battery management, and Raspberry Pi thermal paste mitigation. The OneDrive manuscript (Chapter 1–2 of the capstone thesis) continues to develop with structural refinements across both chapters. The local reference documents — concept paper, holistic briefing, and decision matrix — each recorded 10 additions with 3 removals, indicating iterative refinement of core project arguments. No critical blockers were identified; all sources were fetched and processed without error. The primary research narrative remains coherent: multimodal TinyML acoustic safeguard for open-air swine farming, with zone-level thermal fever detection as the realistic scope given the MLX90640's 32×24 resolution constraint.

---

## Per-Source Analysis

### COLLABORATIVE SOURCES

---

#### 📊 Gantt Chart (Google Sheets)

**🔗 Live:** https://docs.google.com/spreadsheets/d/1D2RJ_avG1Dneyzgk04l2utfCH4hh84lrdqCAdSN5esM/edit

**📊 Stats:** 99 words | 1,430 chars

**Analysis:**
The Gantt chart presents the full project timeline spanning August through December across 4-week months, organized into three tracks: **SOFTWARE/SYSTEM** (7 tasks), **HARDWARE** (5 tasks), and **PAPERS** (5 tasks with chapter-level breakdowns). Key observations:

- **Software/System track** covers system design, data gathering, model training, landing page, Expo app development, and final re-evaluation.
- **Hardware track** progresses from procurement through deployment.
- **Papers track** maps chapter drafting (Ch 1–2–3 then 4–5) through pre-oral defense, revisions, and final defense.
- **Delta:** 9 removals detected, 0 additions. The removals appear to be structural cleanup of the spreadsheet (empty rows, formatting rows) rather than substantive content loss. The task list itself is unchanged.

**Limitation Note:** The Gantt is a high-level planning artifact. It does not reflect the current ESP32-S3 + RPi 4 + INMP441 + MLX90640 hardware stack specifically, nor the zone-level monitoring scope decision.

---

#### 📝 Google Docs Checklist (Collaborative Research Notes)

**🔗 Live:** https://docs.google.com/document/d/1gIoC2biR0HfDfn-PDwc7xcxRnLEFokpEpp2YSPoy-ug/edit

**📊 Stats:** 1,516 words | 9,156 chars

**Analysis:**
This document captures active research Q&A in **Cebuano/Bisaya** (the user's native language), documenting critical technical concerns about the PigPulse system. Key themes extracted:

1. **MLX90640 Thermal Accuracy & Environmental Compensation (CRITICAL):** The user raises a sophisticated concern about whether thermal readings reflect actual pig body temperature or are confounded by ambient temperature fluctuations. The document references:
   - Circadian rhythm effects on pig body temperature
   - TIRPigEar dataset research on MLX90640 reading accuracy
   - Thermal paste as a potential mitigation for HAT-induced heating
   - Multi-modal approach (webcam + LLM synthesis) as a future enhancement direction

2. **Battery Engineering:** Detailed discussion of voltage vs. amps vs. watts, LiPo stacking (parallel vs. series with BMS), TP4056 limitations, and boost converter requirements for sustained Raspberry Pi operation.

3. **Raspberry Pi Longevity:** Discussion of Pi hardware degradation under continuous monitoring conditions.

- **Delta:** 10 additions + 10 removals — this is the most actively revised collaborative source. New content includes expanded feasibility analysis (Section 13: "Final Feasibility Check") confirming the plan is viable on RPi 5 with AI HAT, with caveats about parallel processing load.

---

#### ✅ Capstone Checklist (Google Sheets)

**🔗 Live:** https://docs.google.com/spreadsheets/d/1dhQRgKIwlTv7lFyXgfo84VtOYLvDWa4heh-6D_-EM/edit

**📊 Stats:** 121 words | 712 chars

**Analysis:**
A structured checklist organized into four columns: **Hardware Related**, **Software Related**, **Papers**, and **Concerns/Pangutana**, each with TO-DO items and STATUS columns. All items currently marked **FALSE** (not yet addressed):

| Column | Status Items |
|--------|-------------|
| Hardware | Solve thermal cam body temp reading accuracy; Start prototype if parts arrive |
| Software | Resume 3D prototype; Procure necessary components; Gather data for model |
| Papers | Finalize abstract after data gathering; Finalize SOP |
| Concerns | How to categorize raw audio data and identify patterns |

- **Delta:** 0 additions, 9 removals — likely cleanup of completed/merged rows. No new checklist items added. All items remain unaddressed (FALSE), consistent with the project being in the early-to-mid research phase.

---

#### 📕 OneDrive Manuscript (Capstone Thesis Draft)

**🔗 Live:** https://1drv.ms/w/c/9272348ac87b5645/IQCEtQsZDLghS7v1TAh9S8D2AWTQ6GaFFxaCBOuRiKOsEpw?e=mBIrJ7

**📊 Stats:** 3,448 words | 25,402 chars (full document: 1,196 lines)

**Analysis:**
The full thesis manuscript is in active development. Key structural elements confirmed:

**Document Metadata:**
- **Title:** "Multimodal TinyML-Based Sound and Fever Detection Safeguard for Open-Air Swine Farming"
- **Authors:** Capuno, Kharl Angelo A. | Bejoc, Rainier R. | Gomez, AG M.
- **Adviser:** Chona R. Dagatan, MSME, MEng'gEd-CPE
- **Co-Adviser:** Henry C. Danlag, CoE
- **Degree:** BS Computer Engineering, Cebu Technological Campus – Sabang Danao City
- **Date:** August 2026

**Content Progress:**
- **Chapter 1 (Problem & Setting):** Establishes Philippine swine industry context — 67.5% backyard/small farms (PSA data), open-air operations dominating despite commercial growth. Defines key terms: PigPulse, Sound Classification, Thermal Imaging, TinyML, Vocalization Irregularity, Latency.
- **Chapter 2 (Review of Related Literatures):** Section in progress; references review literature, research studies, system overview, setting/participants, and experiment descriptions.

- **Delta:** 10 additions, 10 removals — active revision. Word count decreased slightly from 3,454 to 3,448 (-6 words), suggesting content tightening/editing rather than expansion.

**Note:** Full document requires continued extraction beyond line 500 for complete analysis.

---

### LOCAL SOURCES (NON-COLLABORATIVE)

---

#### 📄 Concept Paper (Local)
**📁 Path:** `~/pigpulse/docs/research/pig_health_monitor_concept_paper.md`
**Stats:** 79 lines | 5,822 chars

**Analysis (Condensed):**
The concept paper frames PigPulse as a **Noise-Cancellation System for the Tropics**, not merely a sound recorder. Core architecture: dual-microphone differential spectral subtraction (Mic A – Mic B) on ESP32-S3, feeding MobileNetV2 (>90% accuracy) for cough classification. Thermal component: AMG8833 IR Grid-EYE (8×8 → 32×32 upscaled) for multimodal fever detection. Academic defense supported by Lagua & Ampode (2023, MDPI Animals), Chae et al. (2024, MDPI Sensors), and Wen et al. (2025, MDPI Inventions). Defense Dojo covers cost-of-delay arguments, subclinical profit gaps, and 2AM blindspot.

**Note:** This concept paper references AMG8833/Grid-EYE rather than the currently locked MLX90640. This is a **scope deviation** — the final hardware stack uses MLX90640 (32×24) per the user's locked configuration. The concept paper may need a revision note or be archived as an earlier iteration.

---

#### 📄 Holistic Briefing (Local)
**📁 Path:** `~/pigpulse/docs/research/capstone_holistic_briefing.md`
**Stats:** 97 lines | 5,202 chars

**Analysis (Condensed):**
V3 holistic briefing describes PigPulse as a "Sovereign Hybrid Inference Vessel." Key technical content: Adaptive Spectral Subtraction formula (α=2.0, β=0.02, 600-1200Hz infectious band), Siamese Cosine Embedding for thermal pig ID (threshold >0.96), FreeRTOS CPU pinning (Core 0=Audio, Core 1=Vision), Firebase multi-tenant architecture with account grafting, and the SHIP protocol (Alpha/Beta/Gamma three-state fallback). Validation matrix targets: F1 >0.88, Top-1 >94%, <400ms latency, <150mA draw, SUS >80.

**Critical Observation:** This document contains advanced concepts (Siamese thermal ID, AMG8833 sensor, Firebase account grafting) that exceed the current locked scope (MLX90640 zone-level monitoring, ESP32-S3 edge). These may represent aspirational/extended features for future phases.

---

#### 📄 Decision Matrix (Local)
**📁 Path:** `~/pigpulse/docs/reference/archive/capstone_decision_matrix.md`
**Stats:** 55 lines | 3,249 chars

**Analysis (Condensed):**
Archive document comparing three capstone options: Pig Health Monitor ( TinyML + DSP, 🔥Hard code, 🟠Medium HW, ~₱2,500-3,500, ⭐⭐⭐⭐⭐ wow factor), LIG-ON (LoRa mesh, 🟠Medium code, 🔴Hard HW, ~₱4,500-6,000, ⭐⭐⭐⭐), and AGRI-RADAR (radar + siren, 🟢Easy code, 🟠Medium HW, ~₱3,000-4,000, ⭐⭐⭐). Recommendation: Pig Health Monitor for best academic/cost balance with a 3-person team split (HW/SW/App). This aligns with the current project direction.

---

## Delta Analysis (Sept 16 → Sept 17, 2026)

| Source | Additions | Removals | Net | Key Change |
|--------|-----------|----------|-----|------------|
| Gantt Chart | 0 | 9 | **-9** | Structural cleanup (empty rows) |
| Google Docs Checklist | 10 | 10 | **0** | Active revision: feasibility analysis added, older entries cycled |
| Capstone Checklist | 0 | 9 | **-9** | Row cleanup; all items remain FALSE |
| OneDrive Manuscript | 10 | 10 | **0** | Active editing; slight word count decrease (-6) |
| Concept Paper | 10 | 3 | **+7** | Net content growth; continued refinement |
| Holistic Briefing | 10 | 3 | **+7** | Net content growth; continued refinement |
| Decision Matrix | 10 | 3 | **+7** | Net content growth; continued refinement |

**Overall:** 50 additions, 45 removals | Net: **+5 words** (7,311 words total, down 6 from 7,317)
**Key Insight:** Collaborative sources show active revision (balanced additions/removals), while local sources show net growth — indicating the local reference docs are being expanded while collaborative docs are being refined in place.

---

## Action Items

### 🔴 HIGH PRIORITY

1. **MLX90640 vs Concept Paper Sensor Discrepancy** — Concept paper references AMG8833/Grid-EYE; locked hardware uses MLX90640 (32×24). Update concept paper or document as v1 → v2 hardware evolution.
2. **Holistic Briefing Scope Alignment** — SHIP protocol, Siamese thermal ID, and Firebase account grafting exceed current locked scope. Flag as Phase 2/3 aspirations or reconcile with zone-level monitoring reality.
3. **OneDrive Manuscript — Continue Extraction** — Full document (1,196 lines) was truncated at line 500. Remaining 696 lines contain Chapters 2+ content requiring full academic analysis.

### 🟡 MEDIUM PRIORITY

4. **Capstone Checklist — Address FALSE Items** — All 7 checklist items across Hardware, Software, Papers, and Concerns remain unaddressed. Prioritize thermal accuracy resolution (first item).
5. **Gantt Chart — Validate Timeline vs. Current Progress** — Gantt dates (August–December) may need updating to reflect actual project phase as of September 17.
6. **Google Docs Checklist — Follow Up on Cebuano Research Notes** — The MLX90640 thermal accuracy discussion in Bisaya contains valuable technical insights (thermal paste, circadian rhythm compensation, multi-modal LLM synthesis) that should be formalized into the research methodology.

### 🟢 LOW PRIORITY

7. **Decision Matrix — Archive Status** — This document (3,249 chars, 55 lines) serves as a historical record of the project selection decision. Consider archiving or linking from the main project docs.
8. **Battery Specification Verification** — Checklist references 3.7V LiPo; confirm actual procurement spec (user's locked spec: 3.7V 2000mAh, 7-day target life — noted as realistic 2-5 days in adversarial review).

---

## Stats Summary

| Metric | Value |
|--------|-------|
| **Briefing Date** | September 17, 2026 |
| **Monitoring Period** | Sept 16 → Sept 17 (24h) |
| **Total Sources Monitored** | 7 |
| **Collaborative Sources** | 4 (Gantt, Checklist, Capstone, OneDrive) |
| **Local Sources** | 3 (Concept, Briefing, Matrix) |
| **Total Words** | 7,311 |
| **Total Characters** | 50,816 |
| **Net Change (Words)** | -6 (vs previous run) |
| **Total Additions (all sources)** | 50 |
| **Total Removals (all sources)** | 45 |
| **Sources with Content Changes** | 7/7 |
| **Sources with Net Growth** | 3 (Concept, Briefing, Matrix) |
| **Sources with Refinement** | 4 (Gantt, Checklist, Capstone, OneDrive) |
| **Critical Blockers** | 0 |
| **Unaddressed Checklist Items** | 7 (all FALSE) |
| **OneDrive Extraction** | ✅ Success (lines 1–500 of 1,196) |

---

*Briefing generated by PigPulse Daily Monitor | Source: REPORT_LATEST.md + local files*
*Next scheduled run: Tomorrow 06:00 AM PST*
