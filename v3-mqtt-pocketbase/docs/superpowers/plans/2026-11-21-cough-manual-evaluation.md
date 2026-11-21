# Manual Cough Evaluation Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Add LAN-only labeled-clip testing with session-only reset, provenance-separated statistics, and classifier RSS display to the PigPulse cough classifier and Pi dashboard.

**Architecture:** A pure helper owns manual confusion state and clip validation; the classifier exposes `/api/manual/run` and `/api/manual/reset` without touching live windows, audit logs, clips, alerts, or lifetime counters; a committed manifest supplies labeled dataset metrics. The Pi dashboard and embedded `/cough` page render live, manual, and labeled-evaluation results as three separate streams.

**Tech Stack:** Python 3 standard library (`unittest`, `wave`, `pathlib`, `uuid`), NumPy, ONNX Runtime via the existing classifier, plain HTML/JavaScript, `npm run ci:backend`.

---

## Ground rules for the implementer

- Run every command from `/home/solrahk/pig-health-monitor`.
- Do **not** stage or commit `v3-mqtt-pocketbase/frontend/mobile_app/deploy.tar.gz`.
- Existing uncommitted changes in `docs/REPORT_*.md`, `backend/thermal-pi/static/index.html`, firmware, and mobile files are user work. Preserve them.
- Do not change firmware, retrain the model, or touch the public proxy's write policy.
- Commit only the files named in each task.
- No new npm or Python dependencies.

---

### Task 1: Add the pure manual-session state helper with tests

**Objective:** Create a dependency-light helper that validates labels and accumulates TP/FP/FN/TN with correct undefined-denominator behavior.

**Files:**
- Create: `v3-mqtt-pocketbase/backend/cough/manual_session.py`
- Test: `v3-mqtt-pocketbase/backend/thermal-pi/tests/test_cough_manual_session.py`

**Step 1: Write the failing test**

```python
import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / "cough"))

from manual_session import ManualSession, validate_label  # noqa: E402


class TestValidateLabel(unittest.TestCase):
    def test_accepts_only_exact_labels(self):
        self.assertEqual(validate_label("cough"), "cough")
        self.assertEqual(validate_label("other"), "other")
        for bad in ("COUGH", "noise", "", None, 1):
            with self.assertRaises(ValueError):
                validate_label(bad)


class TestManualSession(unittest.TestCase):
    def test_counts_all_four_confusion_cells(self):
        s = ManualSession()
        s.record("cough", "cough", {"p": 0.9})
        s.record("cough", "other", {"p": 0.1})
        s.record("other", "cough", {"p": 0.8})
        s.record("other", "other", {"p": 0.2})
        summary = s.summary()
        self.assertEqual(summary["windows"], 4)
        self.assertEqual(summary["tp"], 1)
        self.assertEqual(summary["fp"], 1)
        self.assertEqual(summary["fn"], 1)
        self.assertEqual(summary["tn"], 1)
        self.assertEqual(summary["accuracy"], 0.5)
        self.assertEqual(summary["precision"], 0.5)
        self.assertEqual(summary["recall"], 0.5)
        self.assertEqual(summary["false_positive_rate"], 0.5)

    def test_undefined_metrics_are_null(self):
        s = ManualSession()
        s.record("other", "other", {"p": 0.01})
        summary = s.summary()
        self.assertIsNone(summary["precision"])
        self.assertEqual(summary["false_positive_rate"], 0.0)
        self.assertIsNone(summary["recall"])

    def test_last_result_carries_label_prediction_and_correctness(self):
        s = ManualSession()
        s.record("other", "cough", {"p": 0.7})
        self.assertEqual(s.last["label"], "other")
        self.assertEqual(s.last["predicted"], "cough")
        self.assertFalse(s.last["correct"])

    def test_reset_clears_everything_and_changes_session_id(self):
        s = ManualSession()
        old_id = s.session_id
        s.record("cough", "cough", {"p": 0.9})
        new_id = s.reset()
        self.assertNotEqual(new_id, old_id)
        self.assertEqual(new_id, s.session_id)
        self.assertEqual(s.summary()["windows"], 0)
        self.assertIsNone(s.last)


if __name__ == "__main__":
    unittest.main()
```

**Step 2: Run the test to verify failure**

Run:

```bash
python3 -m unittest discover -s v3-mqtt-pocketbase/backend/thermal-pi/tests -p 'test_cough_manual_session.py' -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'manual_session'`.

**Step 3: Write the minimal implementation**

Create `v3-mqtt-pocketbase/backend/cough/manual_session.py`:

```python
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
```

**Step 4: Run the test to verify pass**

Run:

```bash
python3 -m unittest discover -s v3-mqtt-pocketbase/backend/thermal-pi/tests -p 'test_cough_manual_session.py' -v
```

Expected: `Ran 6 tests ... OK`.

**Step 5: Commit**

```bash
git add v3-mqtt-pocketbase/backend/cough/manual_session.py v3-mqtt-pocketbase/backend/thermal-pi/tests/test_cough_manual_session.py
git commit -m "feat: add pure manual cough session state"
```

---

### Task 2: Add clip path validation and WAV window validation

**Objective:** Make manual clip input safe and strict before it reaches the model.

**Files:**
- Modify: `v3-mqtt-pocketbase/backend/cough/manual_session.py`
- Modify: `v3-mqtt-pocketbase/backend/thermal-pi/tests/test_cough_manual_session.py`

**Step 1: Append failing tests**

Append to the test file before `if __name__ == "__main__":`:

```python
import tempfile
import wave

from manual_session import resolve_clip, read_wav_window  # noqa: E402


class TestClipValidation(unittest.TestCase):
    def _write_wav(self, path, frames=80000, rate=16000, channels=1, width=2):
        with wave.open(str(path), "wb") as wf:
            wf.setnchannels(channels)
            wf.setsampwidth(width)
            wf.setframerate(rate)
            wf.writeframes(b"\x00" * frames * channels * width)

    def test_valid_clip_resolves_and_loads_float_window(self):
        with tempfile.TemporaryDirectory() as td:
            root = pathlib.Path(td)
            clip = root / "ok.wav"
            self._write_wav(clip)
            resolved = resolve_clip("ok.wav", root)
            self.assertEqual(resolved, clip)
            w = read_wav_window(resolved)
            self.assertEqual(w.shape, (80000,))
            self.assertEqual(float(w.max()), 0.0)

    def test_traversal_is_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            root = pathlib.Path(td) / "clips"
            root.mkdir()
            outside = pathlib.Path(td) / "outside.wav"
            self._write_wav(outside)
            with self.assertRaises(ValueError):
                resolve_clip("../outside.wav", root)

    def test_wrong_rate_channels_width_or_length_is_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            root = pathlib.Path(td)
            bad_rate = root / "rate.wav"
            bad_ch = root / "ch.wav"
            bad_len = root / "len.wav"
            self._write_wav(bad_rate, rate=8000)
            self._write_wav(bad_ch, channels=2)
            self._write_wav(bad_len, frames=40000)
            for path in (bad_rate, bad_ch, bad_len):
                with self.assertRaises(ValueError):
                    read_wav_window(path)

    def test_missing_clip_is_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            with self.assertRaises(ValueError):
                resolve_clip("missing.wav", pathlib.Path(td))
```

**Step 2: Run the tests to verify failure**

Run:

```bash
python3 -m unittest discover -s v3-mqtt-pocketbase/backend/thermal-pi/tests -p 'test_cough_manual_session.py' -v
```

Expected: FAIL with `ImportError: cannot import name 'resolve_clip'`.

**Step 3: Add the implementation**

Append to `manual_session.py`:

```python
import wave
from pathlib import Path

import numpy as np


def resolve_clip(name: Any, clips_dir: Any) -> Path:
    """Resolve a clip name inside clips_dir; reject escapes and missing files."""
    if not isinstance(name, str) or not name or name.startswith(("/", "\\")):
        raise ValueError("invalid clip name")
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
    """Read one exact mono PCM window as float64 in [-1, 1]."""
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
    return np.frombuffer(raw, dtype="<i2").astype(np.float64) / 32768.0
```

**Step 4: Run the tests to verify pass**

Run:

```bash
python3 -m unittest discover -s v3-mqtt-pocketbase/backend/thermal-pi/tests -p 'test_cough_manual_session.py' -v
```

Expected: `Ran 10 tests ... OK`.

**Step 5: Commit**

```bash
git add v3-mqtt-pocketbase/backend/cough/manual_session.py v3-mqtt-pocketbase/backend/thermal-pi/tests/test_cough_manual_session.py
git commit -m "feat: validate manual cough clip inputs"
```

---

### Task 3: Add a dedicated npm script for the helper tests

**Objective:** Make the new tests runnable with one documented command.

**Files:**
- Modify: `package.json:4-16`

**Step 1: Write the failing check**

Run:

```bash
npm run test:cough
```

Expected: FAIL with `Missing script: "test:cough"`.

**Step 2: Add the script**

In `package.json`, add after `"test:backend"`:

```json
    "test:cough": "python3 -m unittest discover -s v3-mqtt-pocketbase/backend/thermal-pi/tests -p 'test_cough_manual_session.py' -v",
```

**Step 3: Verify**

Run:

```bash
npm run test:cough
```

Expected: `Ran 10 tests ... OK`.

**Step 4: Commit**

```bash
git add package.json
git commit -m "chore: add cough helper test script"
```

---

### Task 4: Wire the manual session into classifier state and status

**Objective:** Expose manual session state through `/api/status` without adding endpoints yet.

**Files:**
- Modify: `v3-mqtt-pocketbase/backend/cough/cough_classifier.py` (imports near line 37; `State.__init__` near line 216; `status()` near line 513)

**Step 1: Add imports**

Near the existing imports, add:

```python
from manual_session import ManualSession, resolve_clip, read_wav_window, validate_label
```

**Step 2: Add state fields**

In `State.__init__`, after `self.scored = 0`, add:

```python
        self.manual = ManualSession()
        self.manual_lock = threading.RLock()
```

**Step 3: Expose status**

In `status()`, compute the manual snapshot before acquiring `ST.lock`:

```python
    with ST.manual_lock:
        manual = ST.manual.status()
```

Then add to the returned dict, after `"aggregate": agg,`:

```python
            "manual": manual,
            "active_result_source": (
                "live" if agg.get("windows", 0) > 0
                else "manual" if manual.get("last") is not None
                else "none"
            ),
```

**Step 4: Verify syntax and no import failure in tests**

Run:

```bash
python3 -m py_compile v3-mqtt-pocketbase/backend/cough/cough_classifier.py
npm run test:cough
```

Expected: compile succeeds silently; 10 tests OK.

**Step 5: Commit**

```bash
git add v3-mqtt-pocketbase/backend/cough/cough_classifier.py
git commit -m "feat: expose manual cough session in status"
```

---

### Task 5: Add the manual run and reset endpoints

**Objective:** Score a labeled Pi clip without contaminating live state, and clear the session on Reset.

**Files:**
- Modify: `v3-mqtt-pocketbase/backend/cough/cough_classifier.py` (`do_POST` near line 829)

**Step 1: Add scoring and reset helpers**

Insert after `aggregate()` and before `status()`:

```python
MAX_POST_BYTES = 16 * 1024


def score_manual_clip(name: str, label: str,
                      embed_fn=None, prob_fn=None) -> dict[str, Any]:
    """Score one operator-labeled archive clip. No side effects outside manual state.

    embed_fn/prob_fn are injectable so HTTP tests never need the 304 MB ONNX body.
    The generation guard prevents a reset during inference from accepting a stale
    result into the newly reset session.
    """
    label = validate_label(label)
    path = resolve_clip(name, CLIPS_DIR)
    w = read_wav_window(path, sample_rate=SR, samples=WINDOW_N)
    with ST.manual_lock:
        generation = ST.manual.session_id

    e = (embed_fn or embed)(w)
    p = (prob_fn or cough_prob)(e)
    predicted = "cough" if p >= THRESH else "other"
    result = {
        "file": name,
        "p": round(float(p), 6),
        "predicted": predicted,
        "threshold": THRESH,
        "ts": time.time(),
    }
    with ST.manual_lock:
        if ST.manual.session_id != generation:
            raise ValueError("session changed during scoring; rerun")
        ST.manual.record(label, predicted, result)
        session = ST.manual.status()
        return {
            "ok": True,
            "session_id": session["session_id"],
            "result": ST.manual.last,
            "session": session,
        }


def reset_manual_session() -> str:
    """Clear manual state and the live 60 s verdict; keep all durable state."""
    with ST.manual_lock:
        session_id = ST.manual.reset()
    with ST.lock:
        ST.windows.clear()
        ST.last_cough_alert = 0.0
    return session_id
```

Add `from typing import Any` to the imports if not already present.

**Step 2: Extend POST routing with strict parsing**

Replace the current `do_POST` body with:

```python
    def _read_json_body(self):  # noqa: N802
        try:
            n = int(self.headers.get("Content-Length") or 0)
        except (TypeError, ValueError):
            return None, 400
        if n < 0 or n > MAX_POST_BYTES:
            return None, 413
        raw = self.rfile.read(n) if n else b"{}"
        try:
            payload = json.loads(raw.decode("utf-8") or "{}")
        except Exception:  # noqa: BLE001
            return None, 400
        if not isinstance(payload, dict):
            return None, 400
        return payload, None

    def do_POST(self):  # noqa: N802
        path = self.path.split("?", 1)[0]
        payload, err = self._read_json_body()
        if err:
            self._json(err, {"ok": False, "error":
                              "oversized body" if err == 413 else "bad json"})
            return

        if path == "/api/toggle":
            try:
                want = bool(payload.get("enabled"))
            except Exception as e:  # noqa: BLE001
                self._json(400, {"ok": False, "error": f"bad json: {e}"})
                return
            ST.set_enabled(want)
            print(f"[cough] classification {'ENABLED' if want else 'disabled'}",
                  flush=True)
            self._json(200, {"ok": True, "enabled": ST.enabled,
                             "ts": ST.toggle_ts})
            return

        if path == "/api/manual/run":
            name = payload.get("file")
            label = payload.get("label")
            if not isinstance(name, str) or not name:
                self._json(400, {"ok": False, "error": "file is required"})
                return
            try:
                response = score_manual_clip(name, label)
            except (ValueError, OSError, wave.Error) as e:
                self._json(400, {"ok": False, "error": str(e)})
                return
            self._json(200, response)
            return

        if path == "/api/manual/reset":
            sid = reset_manual_session()
            self._json(200, {"ok": True, "session_id": sid,
                             "ts": time.time()})
            return

        self._json(404, {"ok": False, "error": "not found", "path": path})
```

**Step 3: Verify syntax and helper tests**

Run:

```bash
python3 -m py_compile v3-mqtt-pocketbase/backend/cough/cough_classifier.py
npm run test:cough
```

Expected: compile succeeds; 10 tests OK.

**Step 4: Manual smoke test on the Pi only**

On the Pi dashboard, select a clip and `other`, press Run, then Reset. Expected: a result appears; Reset makes the verdict `NO DATA` and clears the manual counts. Do not perform this step on the laptop because the 304 MB ONNX body is not committed.

**Step 5: Commit**

```bash
git add v3-mqtt-pocketbase/backend/cough/cough_classifier.py
git commit -m "feat: add manual cough run and reset endpoints"
```

---

### Task 6: Add the evaluation provenance manifest

**Objective:** Provide fixed, labeled dataset metrics with explicit provenance and no runtime recomputation.

**Files:**
- Create: `v3-mqtt-pocketbase/backend/cough/evaluation.json`
- Modify: `v3-mqtt-pocketbase/backend/cough/cough_classifier.py` (near `HEAD` load, line 116)

**Step 1: Create the manifest**

```json
{
  "generated": "2026-11-21",
  "method": "shipped head.json threshold applied to features5s embeddings; recomputed from artifacts on 2026-11-21",
  "threshold": 0.2061,
  "records": [
    {
      "id": "aswine_holdout",
      "kind": "labeled_evaluation",
      "dataset": "aSwine",
      "role": "same-farm holdout, 31 files never used in training",
      "n": 2268,
      "positives": 203,
      "threshold": 0.2061,
      "confusion": {"tp": 101, "fp": 145, "fn": 102, "tn": 1920},
      "metrics": {
        "accuracy": 0.8911,
        "precision": 0.4106,
        "recall": 0.4975,
        "f1": 0.4499,
        "false_positive_rate": 0.0702,
        "roc_auc": 0.8079,
        "pr_auc": 0.4037
      },
      "source_files": [
        "sandbox/ai-output/capstone-research/datasets/features5s/features_aswine_test.npz",
        "backend/cough/head.json"
      ],
      "source_hash": "76f662490e40f47dc716b41c2d44e3040f9c102db471ee0d14f76f1df5cf59d2 + d3d229593cd2a875c15fd7533dd7589140d87d440471615a019e15a3d1e22566",
      "note": "Labels are weak 1 s intervals containing a cough, not event-level onsets. This is labeled evaluation, not live field accuracy."
    },
    {
      "id": "mapda_cross_species",
      "kind": "labeled_evaluation",
      "dataset": "MAP-DA",
      "role": "held-out cross-species evaluation; deposit has no training split",
      "n": 3140,
      "positives": 266,
      "threshold": 0.2061,
      "confusion": {"tp": 0, "fp": 0, "fn": 266, "tn": 2874},
      "metrics": {
        "accuracy": 0.9153,
        "accuracy_is_vacuous": true,
        "precision": null,
        "recall": 0.0,
        "f1": 0.0,
        "false_positive_rate": 0.0,
        "roc_auc": 0.8504,
        "pr_auc": 0.3811
      },
      "source_files": [
        "sandbox/ai-output/capstone-research/datasets/features5s/features_mapda_heldout_xspecies.npz",
        "backend/cough/head.json"
      ],
      "source_hash": "2be6516eec6dc598450c5c27342b0efcdbe7a250c0077f1a1bd95e4a01c35426 + d3d229593cd2a875c15fd7533dd7589140d87d440471615a019e15a3d1e22566",
      "note": "At the deployed threshold the model predicts no positives. The published 0.36 precision / 0.60 recall is a different threshold-0.0 operating point and must not be shown as deployed."
    },
    {
      "id": "aswine_corpus",
      "kind": "dataset_inventory",
      "dataset": "aSwine",
      "role": "primary training source",
      "n": 10979,
      "positives": 830,
      "note": "154 files, 15.46 h, 10,979 weakly labeled 1 s intervals in the aSwine train+holdout splits only; file-level split 123 train / 31 holdout; train 627 cough / 8084 other; holdout 203 / 2065; CC BY-NC 4.0. The 14,119/1,096 figures in the merged feature corpus include MAP-DA and belong to the whole corpus, not aSwine alone."
    },
    {
      "id": "mapda_corpus",
      "kind": "dataset_inventory",
      "dataset": "MAP-DA",
      "role": "held-out cross-species source",
      "n": 725,
      "positives": 266,
      "note": "725 clips, 16.08 min, 44.1 kHz stereo normalized to 16 kHz mono; cough 266, ab 211, metal 200, excretion 48."
    },
    {
      "id": "panns_backbone",
      "kind": "model_artifact",
      "dataset": "AudioSet",
      "role": "frozen feature extractor",
      "note": "PANNs Cnn14_16k, mAP 0.438. Not PigPulse-labeled audio and not an accuracy result."
    },
    {
      "id": "live_barn_history",
      "kind": "unlabeled_live",
      "dataset": "PigPulse barn",
      "role": "historical observation",
      "n": 1511,
      "positives": null,
      "note": "0 cough detections, mean p 0.0105, max p 0.0687, observed 2026-11-13. Unlabeled live observation, not accuracy."
    },
    {
      "id": "manual_session",
      "kind": "manual",
      "dataset": "Pi clip archive",
      "role": "operator-labeled manual runs",
      "note": "Dynamic session counts come from /api/status.manual. Clips are unlabeled until the operator labels them; results are not field accuracy."
    }
  ]
}
```

**Step 2: Load it at startup**

After the `META = HEAD["meta"]` line, add:

```python
EVALUATION_FILE = HERE / "evaluation.json"
try:
    EVALUATION = json.loads(EVALUATION_FILE.read_text())
except Exception as exc:  # pragma: no cover - fail visibly, never fabricate
    EVALUATION = {"records": [], "error": f"evaluation manifest unavailable: {exc}"}
```

In `status()`, add beside `"manual": manual,`:

```python
            "evaluation": EVALUATION,
```

**Step 3: Verify the JSON and syntax**

Run:

```bash
python3 -m json.tool v3-mqtt-pocketbase/backend/cough/evaluation.json >/dev/null
python3 -m py_compile v3-mqtt-pocketbase/backend/cough/cough_classifier.py
npm run test:cough
```

Expected: all succeed silently except unittest output `Ran 10 tests ... OK`.

**Step 4: Commit**

```bash
git add v3-mqtt-pocketbase/backend/cough/evaluation.json v3-mqtt-pocketbase/backend/cough/cough_classifier.py
git commit -m "feat: add cough evaluation provenance manifest"
```

---

### Task 7: Add the manual panel to the embedded `/cough` page

**Objective:** Give the full classifier page Run/Reset controls and provenance-labeled model statistics.

**Files:**
- Modify: `v3-mqtt-pocketbase/backend/cough/cough_classifier.py` (`PAGE` string, lines 571-763)

**Step 1: Add the HTML card**

After the verdict card closing `</div>` (the card beginning `<div class="card"><h2>Verdict &mdash; last 60 seconds</h2>`), insert:

```html
<div class="card"><h2>Manual evaluation &mdash; labeled Pi clip</h2>
  <div class="row">
    <select id="manualClip" aria-label="Saved clip"><option value="">Loading clips…</option></select>
    <select id="manualLabel" aria-label="Operator label">
      <option value="">Select label...</option>
      <option value="cough">cough</option>
      <option value="other">other</option>
    </select>
    <button id="manualRun" class="btn-on" disabled>Run</button>
    <button id="manualReset" class="btn-off">Reset</button>
  </div>
  <div class="sub" id="manualResult" style="margin-top:12px">No manual run yet.</div>
  <div class="grid" style="margin-top:14px" id="manualStats"></div>
</div>
```

Add to the CSS:

```css
select{font:inherit;font-size:16px;padding:10px;border-radius:9px;
       background:#2e2e55;color:#f2f6ff;border:1px solid #3a3a66}
```

**Step 2: Add the JavaScript**

Before `async function refresh()`:

```javascript
let coughClips = [];

async function manualLoadClips() {
  try {
    const r = await fetch(BASE + '/api/clips', {cache:'no-store'});
    const j = await r.json();
    coughClips = j.clips || [];
    const sel = $('manualClip');
    sel.replaceChildren();
    if (!coughClips.length) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'No saved clips';
      sel.append(opt);
    } else {
      const first = document.createElement('option');
      first.value = '';
      first.textContent = 'Select clip...';
      sel.append(first);
      for (const c of coughClips) {
        const opt = document.createElement('option');
        opt.value = c.file;
        opt.textContent = c.file;
        sel.append(opt);
      }
    }
    manualEnableRun();
  } catch (e) {
    const sel = $('manualClip');
    sel.replaceChildren();
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'Clip list unavailable';
    sel.append(opt);
    manualEnableRun();
  }
}

function manualEnableRun() {
  const clip = $('manualClip').value;
  const label = $('manualLabel').value;
  $('manualRun').disabled = !(clip && (label === 'cough' || label === 'other'));
}

function manualRender(m) {
  const stats = $('manualStats');
  if (!m || !m.windows) {
    stats.innerHTML = '';
    $('manualResult').textContent = 'No manual run yet.';
    return;
  }
  const cells = [
    ['Windows', m.windows], ['TP', m.tp], ['FP', m.fp], ['FN', m.fn], ['TN', m.tn],
    ['Accuracy', m.accuracy === null ? '-' : (100 * m.accuracy).toFixed(1) + ' %'],
    ['Precision', m.precision === null ? '-' : m.precision.toFixed(3)],
    ['Recall', m.recall === null ? '-' : m.recall.toFixed(3)],
    ['FP rate', m.false_positive_rate === null ? '-' : m.false_positive_rate.toFixed(3)],
  ];
  stats.innerHTML = cells.map(([k,v]) =>
    '<div><div class="k">'+k+'</div><div class="mono">'+v+'</div></div>').join('');
  const last = m.last || {};
  $('manualResult').textContent = last.file
    ? last.file + ' · label ' + last.label + ' · p ' + Number(last.p).toFixed(4)
      + ' · predicted ' + last.predicted + ' · ' + (last.correct ? 'CORRECT' : 'WRONG')
    : 'No manual run yet.';
}

async function manualRunClick() {
  const btn = $('manualRun');
  btn.disabled = true;
  try {
    const r = await fetch(BASE + '/api/manual/run', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({file:$('manualClip').value, label:$('manualLabel').value})});
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'run failed');
    manualRender(j.session);
  } catch (e) {
    $('manualResult').textContent = 'Run failed: ' + e.message;
  } finally {
    manualEnableRun();
  }
}

async function manualResetClick() {
  $('manualReset').disabled = true;
  try {
    const r = await fetch(BASE + '/api/manual/reset', {method:'POST'});
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'reset failed');
    await refresh();
  } catch (e) {
    $('manualResult').textContent = 'Reset failed: ' + e.message;
  } finally {
    $('manualReset').disabled = false;
  }
}

$('manualRun').onclick = manualRunClick;
$('manualReset').onclick = manualResetClick;
$('manualClip').onchange = manualEnableRun;
$('manualLabel').onchange = manualEnableRun;
manualLoadClips();
```

In `render(s)`, after the model-grid block, add:

```javascript
  manualRender(s.manual);
  const evalRec = (s.evaluation && s.evaluation.records || [])
    .find(r => r.id === 'aswine_holdout');
  if (evalRec) {
    const c = evalRec.confusion, m = evalRec.metrics;
    $('modelNote').innerHTML =
      '<b>Labeled evaluation — aSwine holdout, not live accuracy.</b> '+
      'TP '+c.tp+' · FP '+c.fp+' · FN '+c.fn+' · TN '+c.tn+
      ' · accuracy '+(100*m.accuracy).toFixed(1)+' %'+
      ' · precision '+m.precision.toFixed(3)+
      ' · recall '+m.recall.toFixed(3)+
      ' · false-positive rate '+m.false_positive_rate.toFixed(3)+
      '. MAP-DA at this threshold predicts no positives; its ROC-AUC '+
      m.roc_auc+' is ranking only.';
  }
```

Remove the old hard-coded paragraph beginning `'<b>It ranks, it does not detect.</b> At the operating threshold...'`.

**Step 3: Verify**

Run:

```bash
python3 -m py_compile v3-mqtt-pocketbase/backend/cough/cough_classifier.py
npm run test:cough
```

Expected: compile succeeds; 10 tests OK.

**Step 4: Commit**

```bash
git add v3-mqtt-pocketbase/backend/cough/cough_classifier.py
git commit -m "feat: add manual evaluation panel to cough page"
```

---

### Task 8: Add Run/Reset and RSS to the Pi dashboard cough card

**Objective:** Expose the same controls and existing RSS readout on the compact Pi dashboard while preserving the user's uncommitted mic-staleness edits.

**Files:**
- Modify: `v3-mqtt-pocketbase/backend/thermal-pi/static/index.html` (cough card near lines 312-348; JS near lines 1341-1429)

**Step 1: Add the controls**

Inside the cough card, after the line containing `<div class="q sp">Ranks, does not detect:`, insert before that line:

```html
            <div class="row sp" style="gap:10px; align-items:center;">
              <select id="coughClip" aria-label="Saved cough clip" style="max-width:240px;"><option value="">Loading clips…</option></select>
              <select id="coughManualLabel" aria-label="Label for selected clip">
                <option value="">Select label...</option>
                <option value="cough">cough</option>
                <option value="other">other</option>
              </select>
              <button id="coughRun" class="btnOn" style="width:auto;padding:11px 16px;" disabled>Run</button>
              <button id="coughReset" class="btnOff" style="width:auto;padding:11px 16px;">Reset</button>
            </div>
            <div class="cardSub" id="coughManualResult">No manual run yet.</div>
```

Change the drops stat label from `Gaps dropped · CPU` to `Gaps dropped · CPU · RSS` and keep id `coughDrops`.

**Step 2: Add the JavaScript**

Inside `coughRender(s)`, replace the `dropsEl.textContent` line with:

```javascript
  const rss = (s.runtime && s.runtime.rss_mb !== undefined) ? s.runtime.rss_mb.toFixed(0) : '-';
  dropsEl.textContent = drops + ' · ' +
    (rt.cpu_pct_now !== undefined ? rt.cpu_pct_now.toFixed(0) : '-') + '% · ' + rss + ' MB';
```

After `coughStrip(rows, thr);`, add:

```javascript
  const m = s.manual || {};
  const res = document.getElementById('coughManualResult');
  if (!m.windows) {
    res.textContent = 'No manual run yet.';
  } else {
    const last = m.last || {};
    res.textContent = 'Manual: ' + (last.file || '') +
      ' · label ' + (last.label || '') + ' · p ' +
      (last.p === undefined ? '-' : Number(last.p).toFixed(4)) +
      ' · ' + (last.correct ? 'correct' : 'wrong') +
      ' · TP/FP/FN/TN ' + m.tp + '/' + m.fp + '/' + m.fn + '/' + m.tn;
  }
  coughUpdateRunButton();
```

Add this helper once, before `coughRender`:

```javascript
function coughUpdateRunButton() {
  const clip = document.getElementById('coughClip').value;
  const label = document.getElementById('coughManualLabel').value;
  document.getElementById('coughRun').disabled =
    !(clip && (label === 'cough' || label === 'other'));
}
```

Before `document.getElementById('coughBtn').addEventListener('click', coughToggle);`, add:

```javascript
async function coughLoadClips() {
  const sel = document.getElementById('coughClip');
  try {
    const r = await fetch('/cough/api/clips', {cache:'no-store'});
    const j = await r.json();
    const clips = j.clips || [];
    sel.replaceChildren();
    const first = document.createElement('option');
    first.value = '';
    first.textContent = clips.length ? 'Select clip...' : 'No saved clips';
    sel.append(first);
    for (const c of clips) {
      const opt = document.createElement('option');
      opt.value = c.file;
      opt.textContent = c.file;
      sel.append(opt);
    }
  } catch (e) {
    sel.replaceChildren();
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'Clip list unavailable';
    sel.append(opt);
  }
  coughUpdateRunButton();
}

async function coughManualRun() {
  const btn = document.getElementById('coughRun');
  btn.disabled = true;
  try {
    const r = await fetch('/cough/api/manual/run', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        file: document.getElementById('coughClip').value,
        label: document.getElementById('coughManualLabel').value})});
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'run failed');
    await coughRefresh();
  } catch (e) {
    document.getElementById('coughManualResult').textContent = 'Run failed: ' + e.message;
    btn.disabled = false;
  }
}

async function coughManualReset() {
  const btn = document.getElementById('coughReset');
  btn.disabled = true;
  try {
    const r = await fetch('/cough/api/manual/reset', {method:'POST'});
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'reset failed');
    await coughRefresh();
  } catch (e) {
    document.getElementById('coughManualResult').textContent = 'Reset failed: ' + e.message;
  } finally {
    btn.disabled = false;
  }
}

document.getElementById('coughRun').addEventListener('click', coughManualRun);
document.getElementById('coughReset').addEventListener('click', coughManualReset);
document.getElementById('coughClip').addEventListener('change', coughUpdateRunButton);
document.getElementById('coughManualLabel').addEventListener('change', coughUpdateRunButton);
coughLoadClips();
```

**Step 3: Verify no syntax damage**

Run:

```bash
node --check <(sed -n '/<script>/,/<\/script>/p' v3-mqtt-pocketbase/backend/thermal-pi/static/index.html | sed '1d;$d')
```

Expected: no output. If process substitution is unavailable on the target shell, extract the script to `/tmp/opencode/cough-dashboard.js` with `sed` and run `node --check /tmp/opencode/cough-dashboard.js`.

**Step 4: Commit only this file**

```bash
git add v3-mqtt-pocketbase/backend/thermal-pi/static/index.html
git commit -m "feat: add manual cough controls and RSS to Pi dashboard"
```

Do not use `git add -A`; the same file has unrelated uncommitted mic-staleness changes that are part of this commit only if they are present in the working tree. If those changes are still unstaged and unrelated, stage only the new hunks with `git add -p`.

---

### Task 9: Update documentation and proxy comments

**Objective:** Document semantics, make the read-only boundary explicit, and harden the Pi HTTPS proxy's cough POST surface with an allowlist and body limit.

**Files:**
- Modify: `v3-mqtt-pocketbase/backend/cough/README.md`
- Modify: `v3-mqtt-pocketbase/backend/thermal-pi/web_server.py` (`do_POST` docstring and cough POST routing near lines 1139-1153)
- Modify: `v3-mqtt-pocketbase/backend/workers/readonly_pb_proxy.py` (comment near line 383)

**Step 1: README section**

Append:

```md
## Manual evaluation (2026-11-21)

The dashboard can score a saved 5 s clip after an operator labels it `cough` or
`other` **before** the score is shown. `POST /api/manual/run` uses the same
embedding and logistic head as live audio. It does not append to `windows.jsonl`,
save a clip, publish a cough alert, or increment `runtime.windows_scored`.

`POST /api/manual/reset` clears the manual session, the current 60 s verdict, and
the alert cooldown latch. It does not switch classification off and never deletes
history. Manual statistics are operator-labeled Pi-clip results, **not field
accuracy**. Labeled evaluation numbers live in `evaluation.json` and are labeled
by dataset, threshold, and confusion counts.
```

**Step 2: Harden the Pi HTTPS proxy cough POST surface**

Near the other module constants in `web_server.py`, add:

```python
COUGH_POST_ROUTES = {"/api/toggle", "/api/manual/run", "/api/manual/reset"}
COUGH_MAX_POST_BYTES = 16 * 1024
```

In `Handler.do_POST`, replace the cough branch with:

```python
        if url.path == "/cough" or url.path.startswith("/cough/"):
            target = url.path[len("/cough"):] or "/"
            if target not in COUGH_POST_ROUTES:
                self._send(405, "text/plain",
                           b"POST not allowed for this cough route")
                return
            try:
                length = int(self.headers.get("Content-Length") or 0)
            except (TypeError, ValueError):
                self._send(400, "text/plain", b"Bad Content-Length")
                return
            if length < 0 or length > COUGH_MAX_POST_BYTES:
                self._send(413, "text/plain", b"Request body too large")
                return
            self._proxy_cough(url, "POST")
            return
```

Keep `GET /cough*` unchanged and keep `/announce` unchanged.

**Step 3: Proxy comments**

In `web_server.py`, change the `do_POST` docstring first sentence to:

```python
        """Cough toggle, manual run, and manual reset accept POST; others 405.
```

In `readonly_pb_proxy.py`, append to the `PI_ROUTES` comment:

```python
    # Manual run/reset POSTs stay on the Pi dashboard; this public proxy
    # deliberately forwards only /cough/api/status as a GET.
```

**Step 4: Verify**

Run:

```bash
python3 -m py_compile v3-mqtt-pocketbase/backend/thermal-pi/web_server.py v3-mqtt-pocketbase/backend/workers/readonly_pb_proxy.py
npm run ci:backend
```

Expected: `backend OK`.

**Step 5: Commit**

```bash
git add v3-mqtt-pocketbase/backend/cough/README.md v3-mqtt-pocketbase/backend/thermal-pi/web_server.py v3-mqtt-pocketbase/backend/workers/readonly_pb_proxy.py
git commit -m "docs: document manual cough evaluation boundaries"
```

---

### Task 10: Add lazy model seam and HTTP integration tests

**Objective:** Let tests import the classifier without the uncommitted 304 MB ONNX body, then prove manual runs and Reset do not contaminate live state or durable artifacts.

**Files:**
- Modify: `v3-mqtt-pocketbase/backend/cough/cough_classifier.py` (model load near lines 122-129, `embed()` near line 148, `main()` near line 846)
- Create: `v3-mqtt-pocketbase/backend/thermal-pi/tests/test_cough_manual_http.py`
- Modify: `package.json` (add `test:cough:http`)

**Step 1: Add the lazy model seam**

Replace the module-level ONNX session construction with:

```python
SESS = None


def load_model():
    """Create the ONNX session once, on first real inference or at startup."""
    global SESS
    if SESS is None:
        _so = ort.SessionOptions()
        _so.intra_op_num_threads = ORT_THREADS
        _so.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        SESS = ort.InferenceSession(
            str(HERE / "cnn14_16k_body.onnx"), _so,
            providers=["CPUExecutionProvider"])
    return SESS
```

In `embed()`, use `session = SESS or load_model()` before `session.run(...)`. In `main()`, call `load_model()` before starting the audio and scorer threads. Production behavior is unchanged; import no longer requires the ONNX file.

**Step 2: Write failing HTTP/side-effect tests**

Create `test_cough_manual_http.py`. Stub `onnxruntime` before importing the classifier, then point module globals at temporary paths:

```python
import pathlib
import sys
import tempfile
import threading
import types
import unittest
import urllib.request
import wave
from unittest import mock

fake_ort = types.ModuleType("onnxruntime")
fake_ort.SessionOptions = lambda: types.SimpleNamespace()
fake_ort.GraphOptimizationLevel = types.SimpleNamespace(ORT_ENABLE_ALL=1)
fake_ort.InferenceSession = lambda *a, **k: None
fake_ort.CPUExecutionProvider = "CPU"
sys.modules.setdefault("onnxruntime", fake_ort)

BACKEND = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(BACKEND / "cough"))
import cough_classifier as cc  # noqa: E402


class ManualHttpTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.tmp.name)
        self.clips = self.root / "clips"
        self.clips.mkdir()
        self.log = self.root / "windows.jsonl"
        self.log.touch()
        self.patches = [
            mock.patch.object(cc, "CLIPS_DIR", self.clips),
            mock.patch.object(cc, "WINDOWS_LOG", self.log),
        ]
        for p in self.patches:
            p.start()
        cc.ST.manual.reset()
        cc.ST.windows.clear()
        cc.ST.scored = 0
        cc.ST.infer_ms.clear()
        cc.ST.last_cough_alert = 0.0

    def tearDown(self):
        for p in reversed(self.patches):
            p.stop()
        self.tmp.cleanup()

    def _write_clip(self, name="clip.wav"):
        path = self.clips / name
        with wave.open(str(path), "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(16000)
            wf.writeframes(b"\x00" * 80000 * 2)
        return name

    def test_manual_run_has_no_live_or_durable_side_effects(self):
        name = self._write_clip()
        before_log = self.log.read_bytes()
        before_clips = sorted(str(p) for p in self.clips.iterdir())
        with mock.patch.object(cc, "capture_frame", side_effect=AssertionError), \
             mock.patch.object(cc.subprocess, "run", side_effect=AssertionError):
            out = cc.score_manual_clip(
                name, "cough",
                embed_fn=lambda w: [0.0] * 2048,
                prob_fn=lambda e: 0.7,
            )
        self.assertTrue(out["ok"])
        self.assertEqual(out["result"]["predicted"], "cough")
        self.assertTrue(out["result"]["correct"])
        self.assertEqual(out["session"]["tp"], 1)
        self.assertEqual(cc.ST.windows, cc.ST.windows.__class__(maxlen=720))
        self.assertEqual(cc.ST.scored, 0)
        self.assertEqual(self.log.read_bytes(), before_log)
        self.assertEqual(sorted(str(p) for p in self.clips.iterdir()), before_clips)

    def test_reset_clears_only_test_session_state(self):
        cc.ST.windows.append({"ts": 1, "p": 0.9, "above": True})
        cc.ST.last_cough_alert = 123.0
        cc.ST.scored = 9
        cc.ST.enabled = True
        old = cc.ST.manual.session_id
        sid = cc.reset_manual_session()
        self.assertNotEqual(sid, old)
        self.assertEqual(len(cc.ST.windows), 0)
        self.assertEqual(cc.ST.last_cough_alert, 0.0)
        self.assertEqual(cc.ST.scored, 9)
        self.assertTrue(cc.ST.enabled)
        self.assertEqual(cc.aggregate()["verdict"], "NO DATA")

    def test_reset_during_inference_rejects_stale_result(self):
        name = self._write_clip()
        def embed_then_reset(w):
            cc.reset_manual_session()
            return [0.0] * 2048
        with self.assertRaises(ValueError):
            cc.score_manual_clip(name, "cough", embed_fn=embed_then_reset,
                                 prob_fn=lambda e: 0.7)
        self.assertEqual(cc.ST.manual.summary()["windows"], 0)
```

**Step 3: Add route-level checks**

Append to the same class:

```python
    def _post(self, path, payload=b"{}", content_type="application/json"):
        srv = cc.ThreadingHTTPServer(("127.0.0.1", 0), cc.Handler)
        thread = threading.Thread(target=srv.serve_forever, daemon=True)
        thread.start()
        try:
            req = urllib.request.Request(
                f"http://127.0.0.1:{srv.server_address[1]}{path}",
                data=payload, method="POST",
                headers={"Content-Type": content_type})
            with urllib.request.urlopen(req, timeout=5) as r:
                return r.status, r.read()
        except urllib.error.HTTPError as e:
            return e.code, e.read()
        finally:
            srv.shutdown()
            srv.server_close()
            thread.join(timeout=5)

    def test_post_routes_and_limits(self):
        name = self._write_clip()
        import json
        ok = json.dumps({"file": name, "label": "other"}).encode()
        code, body = self._post("/api/manual/run", ok)
        self.assertEqual(code, 200)
        j = json.loads(body)
        self.assertIn("session_id", j)
        self.assertIn("result", j)
        self.assertIn("session", j)

        code, _ = self._post("/api/manual/run", b'{"file":"x","label":"COUGH"}')
        self.assertEqual(code, 400)
        code, _ = self._post("/api/manual/run", b"[]")
        self.assertEqual(code, 400)
        code, _ = self._post("/api/manual/run", b"x" * (16 * 1024 + 1))
        self.assertEqual(code, 413)
        code, _ = self._post("/api/manual/reset")
        self.assertEqual(code, 200)
        code, _ = self._post("/api/does-not-exist")
        self.assertEqual(code, 404)


if __name__ == "__main__":
    unittest.main()
```

Add `import urllib.error` near the other imports.

**Step 4: Add the npm script**

In `package.json`, add after `test:cough`:

```json
    "test:cough:http": "python3 -m unittest discover -s v3-mqtt-pocketbase/backend/thermal-pi/tests -p 'test_cough_manual_http.py' -v",
```

**Step 5: Verify**

Run:

```bash
npm run test:cough:http
npm run ci:backend
```

Expected: all HTTP/side-effect tests pass; `backend OK`.

**Step 6: Commit**

```bash
git add v3-mqtt-pocketbase/backend/cough/cough_classifier.py v3-mqtt-pocketbase/backend/thermal-pi/tests/test_cough_manual_http.py package.json
git commit -m "test: add manual cough HTTP isolation tests"
```

---

### Task 11: Full verification and handoff

**Objective:** Prove the gates pass and that no stream was contaminated.

**Files:** none.

**Step 1: Backend gates**

Run:

```bash
npm run ci:backend
npm run test:cough
npm run test:cough:http
npm run test:backend
```

Expected:

- `backend OK`
- helper tests OK
- HTTP/side-effect tests OK
- existing thermal backend suite passes with the same count as baseline.

**Step 2: JSON and diff checks**

Run:

```bash
python3 -m json.tool v3-mqtt-pocketbase/backend/cough/evaluation.json >/dev/null
git diff --check
git status --short
```

Expected: no JSON error, no whitespace errors, and `deploy.tar.gz` still untracked/excluded.

**Step 3: Browser verification on the Pi**

Open `https://<pi>:8080/cough` and the Pi dashboard:

1. Select a saved clip and label `other`; press Run.
2. Assert a result line shows clip, label, score, prediction, and correct/wrong.
3. Assert manual TP/FP/FN/TN appear and live `windows_scored` did **not** increase.
4. Press Reset.
5. Assert live verdict reads `NO DATA`, manual counts clear, RSS remains visible.
6. Assert no `COUGH` alert was published during the manual run.

**Step 4: Final commit if browser fixes were needed**

```bash
git add <only-the-files-you-fixed>
git commit -m "fix: manual cough browser verification follow-ups"
```

If no fixes were needed, make no commit.

---

## Completion criteria

- `npm run ci:backend`, `npm run test:cough`, and `npm run test:backend` pass.
- Manual runs produce a fresh, labeled result each time.
- Reset clears the active result without deleting history or disabling classification.
- Labeled evaluation, manual session, and live verdict are visually and structurally separate.
- aSwine numbers show dataset, threshold, confusion counts, and “not live accuracy”.
- MAP-DA is not presented as a usable positive-prediction operating point at `0.2061`.
- Classifier RSS is visible in the Pi cough card.
- No firmware change, no upload endpoint, no public write endpoint, no dependency change.
- Failed independent providers remain un-retried after HTTP 429.
