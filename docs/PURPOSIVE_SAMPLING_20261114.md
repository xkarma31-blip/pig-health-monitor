# Purposive Sampling Criteria — PigPulse (DRAFT for review)

**Created:** 2026-11-14 · **Why this file exists:** checklist item §19 ("criteria for purposive sampling") was ABSENT — no criteria document existed anywhere in the repo. This is the net-new draft.
**Status of contents:** grounded facts are source-tagged; design choices that need Master's decision are marked `PROPOSED`. Nothing here is yet approved.

---

## 1. Sampling design

- **Design:** purposive (criterion-based) sampling. Sites, pens, animals, and sessions are chosen because they satisfy the system's technical preconditions — not at random.
- **Unit of analysis (primary):** pig vocalization intervals (cough vs other) captured in tropical open-air grower/finisher pens.
- **Secondary units:** pens, farms, recording sessions, ground-truth observation sessions.

## 2. Site criteria (farm / pen)

| # | Criterion | Type | Basis |
|---|---|---|---|
| S1 | Open-sided or semi-open tropical housing (no climate control) | Include | ~70% of smallholder farms are open-air; this is the target deployment environment `[DOC academic_briefing_2026-10-15.md:7, citing Lagua & Ampode 2023; DAILY_BRIEFING_2026-09-28.md:83]` |
| S2 | Acoustic profile includes the known nuisance sources (rain, roosters, human speech) | Include | The noise the detector must survive `[DOC pig_health_monitor_concept_paper.md:31-34]` |
| S3 | Mechanical ventilation / closed barn | Exclude | Outside the studied environment `[PROPOSED]` |
| S4 | 2.4 GHz Wi-Fi feasible to the pen (AP `PigPulse`, ch 6) or recording can run offline on the Pi | Include | Deployment reality `[MEASURED 2026-11-13; DOC CANON.md]` |
| S5 | Camera and thermal sensor mountable at the assumed geometry (animal height; ≈2.0 m distance) | Include | System geometry `[CODE backend/thermal-pi/config.py; DOC CANON.md:640-652]` |
| S6 | Pen under 40 °C floor-gate conflicts (e.g. solar-loaded surfaces dominating the view) | Review | `absolute_fever_floor 40.0` + `solar 0.1` guard `[CODE radiometry.py, config.py]` |

## 3. Data (segment) criteria

| # | Criterion | Basis |
|---|---|---|
| D1 | 16 kHz mono normalization retained | Corpus standard `[DOC P0-CORPUS-STATUS.md]` |
| D2 | 5.0 s scored windows; windows with gaps beyond `GAP_TOLERANCE 1.25` are discarded, not patched | `[CODE backend/cough/cough_classifier.py]` |
| D3 | Weak interval labels acceptable if provenance is recorded (who labeled, when, from what cue) | aSwine precedent: `TosseEspirro` = interval contains event `[DOC P0-MANIFEST.md]` |
| D4 | Class balance target: keep the negative:positive ratio documented per batch (train set is `1 : 12.9`) | `[DOC P0-LABEL-TABLE.md:35]` |

## 4. Animal / session criteria (ground-truth capture)

| # | Criterion | Type | Basis |
|---|---|---|---|
| A1 | Grower/finisher pigs, housed in the monitored pen, visible to both thermal and CCTV arms | Include | `[PROPOSED]` |
| A2 | Health stratification: normal / respiratory-suspect (cough observed) / febrile (thermal-elevated) | Include | Directly grows the 627-positive bottleneck `[DOC RESULTS-5s.md "Grow the positive class"]` |
| A3 | Vet adjudication of "suspect" status | `NOT DECIDED` | No protocol exists; decision needed |
| A4 | Session length minimum | `NOT DECIDED` | Suggested anchor: enough windows to swamp the 1:12.9 imbalance per site; number to be set |
| A5 | Time-of-day × weather coverage matrix (day/night × dry/rain) | `PROPOSED` | Open-air variability flagged as P0 validation item `[DOC DAILY_BRIEFING_2026-09-28.md:81-83]` |
| A6 | Observer present during capture | `NOT IMPLEMENTED` | E4: no observer session documented anywhere |

## 5. Why purposive (not random)

- The system has hard physical limits: a single mic encodes zero spatial information; MLX optics-footprint limits individual attribution; CCTV cannot reliably re-identify unmarked same-breed pigs `[DOC CANON.md:659-661]`. Random sampling would pull in pens outside the operating envelope and confound evaluation.
- Cross-species transfer is already demonstrated (MAP-DA ROC-AUC `0.8504` unweighted `[DOC RESULTS-5s.md]`); the measured bottleneck is in-domain positives (627 weak cough intervals, `1 : 12.9` `[DOC P0-LABEL-TABLE.md:35]`). Purposive targeting of coughing pens attacks exactly that bottleneck.

## 6. Open decisions (for Master)

1. Named candidate farms/pens (the capstone's own barn vs partner farms).
2. Minimum positive count + session length (A4).
3. Vet adjudication protocol (A3).
4. Observer/labeling protocol (A6) — ties to checklist §19's "buhat ug criteria".
5. Whether S6 needs a second thermal guard for solar-loaded floors.

*End — draft, 2026-11-14.*
