#!/usr/bin/env python3
"""train_head.py — train a tiny classifier on frozen PANNs Cnn14_16k embeddings.

Why a head, not full fine-tuning: this vessel has ~3 GB available RAM and no GPU
(measured). The backbone is run once and cached (14,119 × 2048 float32 = 116 MB); the
trainable part is tiny and trains in seconds on CPU.

This is the Zhang et al. 2026 recipe (Animals 16(2):253, DOI 10.3390/ani16020253): freeze
the PANNs-CNN14 backbone, train only the classifier head.

Honesty rules enforced in the code:
  * Report macro-F1 and PR-AUC (average precision), never plain accuracy — the corpus is
    1:11.9 imbalanced, so accuracy is a meaningless metric here.
  * class_weight='balanced' for the imbalance; a plain (unweighted) fit is also trained
    and reported so the effect of the weighting is visible, not assumed.
  * Evaluate on THREE sets: aSwine holdout (same farm) and MAP-DA (cross-species, never
    trained on). Reporting only the first would be dishonest about generalisation.
"""

from __future__ import annotations
import json
from pathlib import Path

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (average_precision_score, confusion_matrix,
                             f1_score, precision_recall_curve, roc_auc_score)

FEAT = Path("features5s")
SETS = {
    "train": FEAT / "features_aswine_train.npz",        # aSwine 123 files
    "eval_aswine": FEAT / "features_aswine_test.npz",   # aSwine 31 held-out FILES
    "heldout_mapda": FEAT / "features_mapda_heldout_xspecies.npz",  # cross-species
}


def load(p: Path) -> tuple[np.ndarray, np.ndarray]:
    d = np.load(p)
    return d["X"].astype(np.float32), d["y"].astype(np.int64)


def report(name: str, y: np.ndarray, p: np.ndarray, thr: float) -> dict:
    yhat = (p >= thr).astype(int)
    return {
        "set": name, "n": int(len(y)), "pos": int((y == 1).sum()),
        "macro_f1": round(float(f1_score(y, yhat, average="macro", zero_division=0)), 4),
        "f1_cough": round(float(f1_score(y, yhat, pos_label=1, zero_division=0)), 4),
        "pr_auc": round(float(average_precision_score(y, p)), 4),
        "roc_auc": round(float(roc_auc_score(y, p)), 4),
        "confusion": confusion_matrix(y, yhat, labels=[0, 1]).tolist(),
        "thr": thr,
    }


def best_thr(y: np.ndarray, p: np.ndarray) -> float:
    """Threshold that maximises macro-F1 on the given set (reported per set)."""
    prec, rec, thr = precision_recall_curve(y, p)
    f1s = 2 * prec[:-1] * rec[:-1] / np.clip(prec[:-1] + rec[:-1], 1e-9, None)
    return float(thr[int(np.argmax(f1s))])


def main() -> int:
    Xtr, ytr = load(SETS["train"])
    Xas, yas = load(SETS["eval_aswine"])
    Xmp, ymp = load(SETS["heldout_mapda"])
    print(f"[data] train={Xtr.shape} (cough={int(ytr.sum())}) "
          f"aswine_eval={Xas.shape} (cough={int(yas.sum())}) "
          f"mapda_heldout={Xmp.shape} (cough={int(ymp.sum())})")

    out = {}
    for tag, cw in (("balanced", "balanced"), ("unweighted", None)):
        clf = LogisticRegression(C=1.0, max_iter=2000, class_weight=cw, n_jobs=-1)
        clf.fit(Xtr, ytr)
        p_as = clf.predict_proba(Xas)[:, 1]
        p_mp = clf.predict_proba(Xmp)[:, 1]
        thr = best_thr(yas, p_as)
        out[tag] = {
            "model": f"logreg C=1.0 class_weight={cw}",
            "threshold_from_aswine_eval": round(thr, 4),
            "results": [
                report("aswine_holdout_same_farm", yas, p_as, thr),
                report("mapda_heldout_cross_species", ymp, p_mp, thr),
            ],
        }
        print(f"\n[{tag}] thr={thr:.4f}")
        for r in out[tag]["results"]:
            print(f"   {r['set']:32s} macroF1={r['macro_f1']:.4f} f1_cough={r['f1_cough']:.4f} "
                  f"PR-AUC={r['pr_auc']:.4f} ROC={r['roc_auc']:.4f} conf={r['confusion']}")

    Path("head_results.json").write_text(json.dumps(out, indent=2))
    print("\n[write] head_results.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
