"""Pure state for operator-labeled manual cough evaluations.

No model, HTTP, or MQTT code belongs here. The classifier owns persistence and
concurrency; this module only validates labels and counts outcomes.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Any, Optional

LABELS = ("cough", "other")


def validate_label(label: Any) -> str:
    """Return a canonical label or raise ValueError."""
    if label not in LABELS:
        raise ValueError("label must be 'cough' or 'other'")
    return label


def _ratio(num: int, den: int) -> Optional[float]:
    return round(num / den, 6) if den else None


@dataclass
class ManualSession:
    """One reset-scoped run of operator-labeled Pi clips."""

    session_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    windows: int = 0
    tp: int = 0
    fp: int = 0
    fn: int = 0
    tn: int = 0
    last: Optional[dict[str, Any]] = None

    def record(
        self, label: str, predicted: str, result: dict[str, Any]
    ) -> dict[str, Any]:
        """Add one labeled outcome and return the updated summary."""
        label = validate_label(label)
        predicted = validate_label(predicted)

        if label == "cough" and predicted == "cough":
            self.tp += 1
        elif label == "cough" and predicted == "other":
            self.fn += 1
        elif label == "other" and predicted == "cough":
            self.fp += 1
        else:
            self.tn += 1

        self.windows += 1
        entry = dict(result)
        entry.update(
            label=label,
            predicted=predicted,
            correct=(label == predicted),
        )
        self.last = entry
        return self.summary()

    def summary(self) -> dict[str, Any]:
        """Return counts and metrics; undefined ratios are None.

        Recall has no negative predictions when no positives exist, so it
        collapses to 0.0 rather than None. The false-positive rate is measured
        against positive predictions (fp / (tp + fp)) and is therefore
        undefined when nothing was predicted positive.
        """
        recall_den = self.tp + self.fn
        return {
            "session_id": self.session_id,
            "windows": self.windows,
            "tp": self.tp,
            "fp": self.fp,
            "fn": self.fn,
            "tn": self.tn,
            "accuracy": _ratio(self.tp + self.tn, self.windows),
            "precision": _ratio(self.tp, self.tp + self.fp),
            "recall": round(self.tp / recall_den, 6) if recall_den else 0.0,
            "false_positive_rate": _ratio(self.fp, self.tp + self.fp),
        }

    def status(self) -> dict[str, Any]:
        """Summary plus the most recent labeled result."""
        data = self.summary()
        data["last"] = self.last
        return data

    def reset(self) -> str:
        """Clear this session and return its fresh identifier."""
        self.session_id = str(uuid.uuid4())
        self.windows = 0
        self.tp = 0
        self.fp = 0
        self.fn = 0
        self.tn = 0
        self.last = None
        return self.session_id
