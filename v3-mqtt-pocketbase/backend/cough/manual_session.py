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
        """Return counts and metrics; undefined ratios are None."""
        return {
            "session_id": self.session_id,
            "windows": self.windows,
            "tp": self.tp,
            "fp": self.fp,
            "fn": self.fn,
            "tn": self.tn,
            "accuracy": _ratio(self.tp + self.tn, self.windows),
            "precision": _ratio(self.tp, self.tp + self.fp),
            "recall": _ratio(self.tp, self.tp + self.fn),
            "false_positive_rate": _ratio(self.fp, self.fp + self.tn),
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


import wave
from pathlib import Path

import numpy as np


def resolve_clip(name: Any, clips_dir: Any) -> Path:
    """Resolve a clip name inside clips_dir; reject escapes and non-files.

    Uses resolved containment, not string prefixes, so a sibling directory such
    as ``clips_evil`` cannot pass by sharing a prefix with ``clips``.
    """
    if not isinstance(name, str) or not name:
        raise ValueError("invalid clip name")
    if Path(name).is_absolute() or name.startswith(("/", "\\")):
        raise ValueError("absolute clip path is not allowed")
    root = Path(clips_dir).resolve()
    candidate = (root / name).resolve()
    try:
        candidate.relative_to(root)
    except ValueError as exc:
        raise ValueError("clip path escapes the archive") from exc
    if not candidate.is_file():
        raise ValueError("clip not found")
    return candidate


def read_wav_window(
    path: Any, sample_rate: int = 16000, samples: int = 80000
) -> np.ndarray:
    """Read one exact mono 16-bit PCM window as float64 in [-1, 1]."""
    try:
        with wave.open(str(path), "rb") as wf:
            if wf.getnchannels() != 1:
                raise ValueError("clip must be mono")
            if wf.getsampwidth() != 2:
                raise ValueError("clip must be 16-bit PCM")
            if wf.getframerate() != sample_rate:
                raise ValueError(f"clip must be {sample_rate} Hz")
            if wf.getnframes() != samples:
                raise ValueError(
                    f"clip must be exactly {samples / sample_rate:g} s "
                    f"({samples} samples)"
                )
            raw = wf.readframes(samples)
    except (wave.Error, OSError) as exc:
        raise ValueError(f"unreadable WAV: {exc}") from exc
    arr = np.frombuffer(raw, dtype="<i2")
    if arr.size != samples:
        raise ValueError("clip has an incomplete sample buffer")
    return arr.astype(np.float64) / 32768.0
