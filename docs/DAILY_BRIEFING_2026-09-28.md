# 📊 PigPulse — Daily Academic Briefing
**September 28, 2026 — 06:02 AM**

━━━━━━━━━━━━━━━━━━━━ Executive Summary ━━━━━━━━━━━━━━━━━━━━

The PigPulse daily monitor completed across all seven sources with stable system state and no critical failures. The Gantt chart shows 99 words of timeline data with nine removals indicating task refinement rather than regression. The Google Docs Checklist documents three persistent technical concerns requiring attention: MLX90640 thermal accuracy in open-air farm environments, LiPo battery basics for embedded systems, and Raspberry Pi longevity without built-in power buffering. The Capstone Checklist remains largely incomplete with all items marked false but benefited from nine stale entry removals. The OneDrive manuscript gained 10 new additions but still contains abstract placeholders needing completion. All three local research files (Concept Paper, Holistic Briefing, Decision Matrix) showed net positive growth of 7 additions each, reinforcing the project's research momentum. No delivery failures were reported across any source.

**Executive Summary (TTS generated):** /home/solrahk/voice-memos/executive_summary_2026-09-28.mp3

━━━━━━━━━━━━━━━━━━━━ Per-Source Analysis ━━━━━━━━━━━━━━━━━━━━

## Collaborative Links

### Gantt Chart (Google Sheets)
- **URL:** https://docs.google.com/spreadsheets/d/1D2RJ_avG1Dneyzgk04l2utfCH4hh84lrdqCAdSN5esM/edit
- **Stats:** 99 words | 1,430 chars
- **Content:** 8-track Gantt with phases from Planning (Aug-Dec) through Deployment. Key tasks include System Design, Hardware procurement, Software training, Model fine-tuning, and Expo App Development. No new additions this run; 9 removals indicate task filtering/consolidation.

### Google Docs Checklist
- **URL:** https://docs.google.com/document/d/1gIoC2biR0HfDfn-PDwc7xcxRnLEFokpEpp2YSPoy-ug/edit
- **Stats:** 1,730 words | 10,332 chars
- **Content:** Three primary concerns documented: (1) MLX90640 thermal accuracy in open-air conditions with seasonal fluctuations and thermal paste mitigation; (2) LiPo battery basics (Watts = Volts × Amps, mAh/Wh rating, parallel/series stacking rules, TP4056 limitations); (3) Raspberry Pi longevity and built-in battery absence. The checklist also includes QR code deployment for Raspberry Pi access, CCTV data extraction, and microphone iconnection to Raspberry Pi.

### Capstone Checklist (Google Sheets)
- **URL:** https://docs.google.com/spreadsheets/d/1dhQRgKIwlTv7lFyXgfo84VtOYLvDgXWa4heh-6D_-EM/edit
- **Stats:** 121 words | 712 chars
- **Content:** Master checklist with HARDWARE, SOFTWARE, PAPERS, and CONCERNS/PANGUTANA categories. All items currently marked FALSE. Concerns include: accurate body temp reading through thermal camera, prototype build, component gathering, data categorization, and raw data identification. Nine stale entries removed this run.

### OneDrive Manuscript
- **URL:** https://1drv.ms/w/c/9272348ac87b5645/IQCEtQsZDLghS7v1TAh9S8D2AWTQ6GaFFxaCBOuRiKOsEpw?e=mBIrJ7
- **Stats:** 4,034 words | 31,356 chars
- **Content:** Full capstone manuscript in progress. Document structure includes front matter (pages ii-vi), Chapter 1 (Problem and Setting), Chapter 2 (Review of Related Literatures), Chapter 3 (Methodology). **⚠️ ABSTRACT STILL HAS PLACEHOLDERS** — key sections contain "[...]" and "[shown first N of M chars]" markers indicating incomplete writing. Chapter progress tracked across all chapters.

━━━━━━━━━━━━━━━━━━━━ Local Files ━━━━━━━━━━━━━━━━━━━━

### Concept Paper
- **Path:** `/home/solrahk/pigpulse/docs/research/pig_health_monitor_concept_paper.md`
- **Stats:** 863 words | 5,796 chars
- **Content:** Defines Project Pig Health Monitor as a "Multimodal TinyML Acoustic Safeguard for Open-Air Swine Farming." Details the economic threat of respiratory diseases (40-50% mortality in backyard farms, PHP 350-800 per pig loss, PHP 6 Billion annual industry loss). Innovation: dual-microphone differential noise-subtraction system (Mic A captures pig pen audio, Mic B captures ambient reference, ESP32-S3 performs spectral subtraction to isolate coughs), MobileNetV2 TinyML classification (>90% accuracy), and multimodal causality link (cough spike + fever spike = viral infection alert). Includes "Defense Dozo" section preparing for common panel questions about accuracy and feasibility.

### Holistic Briefing
- **Path:** `/home/solrahk/pigpulse/docs/research/capstone_holistic_briefing.md`
- **Stats:** 723 words | 5,160 chars
- **Content:** Version 3.0 "Full Power - No Gaps" briefing with four sections: (1) Architectural Philosophy — "Sovereign Hybrid Inference Vessel" bridging Edge (ESP32-S3) and Cloud (Firebase/Gemini); (2) Mathematical Core — adaptive spectral subtraction formula with α=2.0 oversubtraction factor and β=0.02 spectral floor, 600-1200Hz cough band vs 1500-2500Hz mechanical band; Siamese cosine embedding thermal identification (S_c > 0.96 confirms identity, < 0.85 generates new profile); (3) Infrastructure Signal Chain — FreeRTOS core pinning (Core 0: Audio Master with I2S DMA/FFT, Core 1: Vision Master with I2C MLX90640/Firebase TLS), 8MB PSRAM for frame buffer and embedding cache; (4) Sovereign Hybrid Inference Protocol (SHIP) architecture with Firebase Realtime Database structured for account-based isolation.

### Decision Matrix
- **Path:** `/home/solrahk/pigpulse/docs/reference/archive/capstone_decision_matrix.md`
- **Stats:** 541 words | 3,160 chars
- **Content:** Compares three capstone options: Pig Health Monitor (Pig Cough), LIG-ON (Landslide Mesh), and AGRI-RADAR (Flood Siren). Pig Health Monitor wins on academic-to-cost balance (₱2,500-₱3,500 budget, TinyML "wow factor," team-of-3 fit with HW/SW/App member distribution). Runner-up LIG-ON noted for networking strengths but higher cost multiplying hardware across 3 nodes. AGRI-RADAR deemed "safe bet" doable in 3 months but risking "too simple" perception without predictive rate-of-rise algorithm and web dashboard.

━━━━━━━━━━━━━━━━━━━━ Delta Analysis ━━━━━━━━━━━━━━━━━━━━

**Changes Since Last Run:**

| Source | Additions | Removals | Net Change |
|--------|-----------|----------|------------|
| Gantt Chart | 0 | 9 | -9 |
| Google Docs Checklist | 10 | 10 | 0 |
| Capstone Checklist | 0 | 9 | -9 |
| OneDrive Manuscript | 10 | 10 | 0 |
| Concept Paper | 10 | 3 | +7 |
| Holistic Briefing | 10 | 3 | +7 |
| Decision Matrix | 10 | 3 | +7 |

**Key Delta Observations:**

1. **Collaborative sources (4):** All four Google/OneDrive sources show either zero net change (Checklist, Gantt) or 10 additions / 10 removals (Manuscript), indicating active content turnover without overall growth — likely editing, restructuring, or placeholder replacement.

2. **Local research files (3):** All three local files show consistent +7 net growth from 10 additions and 3 removals each, indicating content expansion and refinement rather than just cleanup.

3. **Stale entry removal pattern:** Gantt Chart and Capstone Checklist both removed 9 stale entries, suggesting systematic cleanup of completed or superseded tasks. Google Docs Checklist removed 10 entries matching its 10 additions, indicating full content replacement cycle.

4. **Abstract placeholder concern:** OneDrive manuscript continues to accumulate additions while retaining abstract placeholders, representing a persistent structural gap in the capstone deliverable.

5. **No critical failures:** Despite additions/removals across all sources, no source reported delivery failure or data corruption.

━━━━━━━━━━━━━━━━━━━━ Action Items ━━━━━━━━━━━━━━━━━━━━

## Priority P0 — Critical / Must Resolve

1. **OneDrive abstract completion** — The capstone manuscript abstract still contains placeholders ("[...]", "[shown first N of M chars]"). Must be replaced with completed abstract text before oral defense. **Owner:** Documentation team member. **Deadline:** Before next capstone milestone.

2. **MLX90640 thermal accuracy validation** — Three sources (Checklist, Concept Paper, Holistic Briefing) consistently flag MLX90640 limitations in open-air environments: seasonal temperature fluctuations, thermal paste efficacy, and sensor-to-pig distance constraints. Requires empirical testing with known-reference temperatures. **Owner:** Hardware/AI team. **Deadline:** Next experimentation cycle.

3. **Concept paper defense readiness** — The "Defense Dozo" section in the Concept Paper lists common panel questions but lacks verified answers. Must prepare evidence-based responses about cough detection accuracy in 70% open-air farms, thermal sensor feasibility, and TinyML model generalization. **Owner:** AI/Software team. **Deadline:** Before panel review date.

## Priority P1 — Should Resolve

4. **Capstone Checklist item resolution** — All 15 checklist items across HARDWARE, SOFTWARE, PAPERS, and CONCERNS categories remain marked FALSE. Priority items: prototype build initiation (SOFTWARE: "Mamalit sa mga necessary nga components"), data categorization system (SOFTWARE: "Unsaon pag categorize sa tingog"), and raw data identification (CONCERNS: "Unsaon nato pag identify?"). **Owner:** Team leads. **Deadline:** Next phase sprint.

5. **Google Docs Checklist concern resolution** — The three documented concerns need actionable solutions: (a) MLX90640 open-air calibration protocol, (b) LiPo battery sizing guide for ESP32-S3 systems, (c) Raspberry Pi longevity mitigation strategies (external UPS, hibernation strategies). **Owner:** Technical working groups. **Deadline:** Two weeks.

## Priority P2 — Nice to Resolve

6. **Holistic Briefing mathematical verification** — The spectral subtraction formula (α=2.0, β=0.02, 600-1200Hz band) and Siamese cosine embedding threshold (S_c > 0.96) should be validated against actual PigPulse sensor data. **Owner:** AI team. **Deadline:** Next data collection cycle.

7. **Decision Matrix recommendation reinforcement** — The Pig Health Monitor recommendation (Option A) should be cross-validated against team member skill profiles and available hardware inventory. **Owner:** Project lead. **Deadline:** Before phase planning session.

━━━━━━━━━━━━━━━━━━━━ Stats Summary ━━━━━━━━━━━━━━━━━━━━

| Source | Type | Words | Chars | Additions | Removals | Net |
|--------|------|-------|-------|-----------|----------|-----|
| Gantt Chart | Collaborative | 99 | 1,430 | 0 | 9 | -9 |
| Google Docs Checklist | Collaborative | 1,730 | 10,332 | 10 | 10 | 0 |
| Capstone Checklist | Collaborative | 121 | 712 | 0 | 9 | -9 |
| OneDrive Manuscript | Collaborative | 4,034 | 31,356 | 10 | 10 | 0 |
| Concept Paper | Local | 863 | 5,796 | 10 | 3 | +7 |
| Holistic Briefing | Local | 723 | 5,160 | 10 | 3 | +7 |
| Decision Matrix | Local | 541 | 3,160 | 10 | 3 | +7 |
| **TOTAL** | | **7,411** | **57,946** | **40** | **47** | **-7** |

━━━━━━━━━━━━━━━━━━━━ End of Briefing ━━━━━━━━━━━━━━━━━━━━