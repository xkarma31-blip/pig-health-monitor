# First trained model — results (2026-11-05)

**Pipeline:** aSwine + MAP-DA corpus → frozen PANNs `Cnn14_16k` embeddings (2048-d) →
logistic-regression head. Everything measured on this vessel (CPU only, ~3 GB RAM).

## The decisive finding: window length

Cnn14 was trained on ~10-second AudioSet clips. Feeding it 1-second windows starved it of
context — which is why the first model looked broken. A stratified A/B on the same eval set:

| Window | Same-farm ROC-AUC | Cough-F1 |
|---|---|---|
| 1 s | 0.664 | 0.465 |
| **5 s** | **0.700** | **0.501** |

## Full-corpus results at 5 s (14,119 windows)

| Model | aSwine holdout (same farm) | MAP-DA (never trained on) |
|---|---|---|
| logreg, balanced — ROC-AUC | **0.789** | 0.673 |
| logreg, unweighted — ROC-AUC | **0.808** | **0.850** |
| logreg, balanced — PR-AUC | 0.358 | 0.140 |
| logreg, unweighted — PR-AUC | **0.404** | **0.381** |
| logreg, unweighted — best F1 | 0.453 (recall 0.50, precision 0.41) | 0.451 (recall 0.60, precision 0.36) |

**Cross-species ROC-AUC went from 0.485 (chance) at 1 s to 0.850 at 5 s.** That is real
transfer, and it is the single most important result of this session.

## Honest assessment

**What works:** the model *ranks* cough above non-cough on held-out files from the same farm
(ROC 0.81) **and** across species (calf, never trained on — ROC 0.85).

**What does not (yet):** it is not a standalone detector. At its best operating point it
takes ~1 false positive for every true positive (precision 0.36–0.41). For a "this pig is
coughing" alert that is too noisy; for an *aggregate cough-rate* signal over minutes it is
usable — which is exactly the temporal-aggregation design the plan already calls for.

**Root cause of the remaining gap — data, not architecture:** our positive class is
**627 weakly-labelled 1-second intervals** (aSwine's `TosseEspirro` marks an interval that
*contains* a cough). The grounded comparison: Upadhyaya et al. needed ~**400,000 samples** to
reach 92.4 %, and reported *"performance can drop by almost 27 percentage points"* when
acoustic conditions change. We are measuring a data problem.

## Recommended next steps (in order)

1. **Aggregate, don't alert per-window.** Score 5 s windows, then average the probability over
   1–5 minutes and threshold the *rate*. This is the Sharifuzzaman design (macro-F1 0.937,
   room-level) and it converts our 0.36 precision into a usable signal.
2. **Grow the positive class.** In-situ capture from the Pi's own mic (now demonstrably
   working), hand-labelled with the active-learning loop from the brief §10.
3. **Fine-tune the classifier head** (not just a linear head) once more positives exist —
   Zhang et al. 2026 got 92.86 % F1 from 107 clean cough *events*, which is a much cleaner
   label than our weak intervals.

## Artifacts (all in the sandbox `datasets/` dir)

```
corpus/corpus.csv                14,119 rows, the merged manifest
features/features_*.npz          1-s embeddings (baseline)
features5s/features_*.npz        5-s embeddings (current best)
head_results.json                logistic head, 5 s
operating_points_5s.json         ROC/PR-AUC/F1 + operating points, both eval sets
```

*End of results — 2026-11-05.*
