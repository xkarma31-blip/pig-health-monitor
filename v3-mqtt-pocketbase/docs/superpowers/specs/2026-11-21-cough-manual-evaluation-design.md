# Design — Manual cough evaluation, reset semantics, and provenance-separated statistics

- **Date:** 2026-11-21
- **Status:** Approved for spec review; implementation has not started.
- **Canonical scope:** `v3-mqtt-pocketbase/backend/cough/` and the Pi dashboard surfaces.
- **Canon note:** this file lives under `v3-mqtt-pocketbase/docs/` because repository-root `docs/` is frozen reference material (`CANON.md §3.1`).

---

## 1. Problem

The cough classifier exposes a live 60-second verdict and a hard-coded model-card paragraph, but no way to run a labeled test through the dashboard and no explicit reset. A previous HIGH verdict can remain visible until the 60-second window ages out. The UI also presents precision/recall without saying which dataset or threshold produced them, and it does not distinguish measured labeled evaluation from unlabeled live observation or manual experiments.

This change adds:

1. a LAN-only dashboard action to score an existing Pi clip after the operator labels it;
2. a session-only Reset that clears the active result immediately;
3. a committed provenance manifest separating labeled dataset metrics from live, manual, and historical observations;
4. an RSS display reusing the classifier's existing memory readout.

It does **not** change firmware, retrain the model, delete audit history, or expose write endpoints publicly.

---

## 2. Approved decisions

| Decision | Choice |
|---|---|
| Meaning of “Run” | Score an existing Pi clip that the operator labels before scoring. |
| Label timing | Before scoring; the score cannot bias the label. |
| Clip source | Existing Pi clip archive exposed by `/api/clips`. No upload path. |
| Reset scope | Test-session only: manual counts, last result, session ID, current 60-second verdict, and alert-cooldown latch. |
| Reset must not do | Change `enabled`; delete `windows.jsonl`, WAV clips, alerts, lifetime counters, or evaluation data. |
| Memory scope | Show existing classifier RSS in the Pi cough card and manual panel. No threshold or alert. |
| Exposure | Controls are **Pi-dashboard controls, not authenticated operator controls**. The public proxy stays read-only; any client that can reach the Pi HTTPS server can currently POST through `/cough/*`. |

---

## 3. Current flow and root cause

- `State.windows` is a 60-second in-memory deque. `aggregate()` derives `verdict` from it.
- `State.load_state()` / `save_state()` persist only `enabled` and `toggle_ts` in `state.json`.
- `WINDOWS_LOG` (`windows.jsonl`) and `CLIPS_DIR` are append-only audit artifacts. They do not drive the verdict.
- `GET /api/status` already exposes `runtime.rss_mb`, read from `/proc/self/status` `VmRSS`.
- The full `/cough` page already displays RSS. The small Pi dashboard cough card does not.
- The embedded page hard-codes precision `0.41` and recall `0.50` with no dataset label or confusion counts.
- The Pi web server proxies every `/cough*` request to `127.0.0.1:8096`; the public read-only proxy allows only `GET /cough/api/status`.

The lingering HIGH is therefore caused by the in-memory deque, not by disk state.

---

## 4. Architecture

Three result streams stay separate at every layer.

| Stream | Source | Mutated by | Accuracy claims allowed |
|---|---|---|---|
| **Live** | Current barn mic, 60-second deque | Live scorer only | No. Verdict only. |
| **Manual** | Operator-labeled Pi clip | `POST /api/manual/run` and `/api/manual/reset` | Yes, for that session only, explicitly “operator-labeled Pi clips, not field accuracy”. |
| **Labeled evaluation** | Committed manifest derived from aSwine/MAP-DA feature artifacts | Nothing at runtime | Yes, with dataset, threshold, counts, and provenance. |

Manual runs use the existing `embed()` → `cough_prob()` code path and the existing ONNX session. They must not append to `State.windows`, write `windows.jsonl`, save a clip, publish MQTT alerts, or increment `runtime.windows_scored`.

---

## 5. API contract

All routes remain on `127.0.0.1:8096` and are reachable through the Pi dashboard's `/cough/*` proxy.

### 5.1 `POST /api/manual/run`

Request:

```json
{ "file": "20261121_101530_p0.1234.wav", "label": "cough" }
```

Rules:

- `label` is required and must be exactly `cough` or `other`.
- `file` is resolved under `CLIPS_DIR` and rejected if it escapes that root.
- The WAV must be mono, 16-bit PCM, 16 kHz, and exactly `WINDOW_N` samples (80,000 / 5 s).
- The classifier does not need to be enabled for a manual run.
- The operator label is ground truth. Prediction is `cough` when `p >= THRESH`.

Response:

```json
{
  "ok": true,
  "session_id": "uuid",
  "result": {
    "file": "20261121_101530_p0.1234.wav",
    "label": "cough",
    "p": 0.1234,
    "predicted": "other",
    "correct": false,
    "threshold": 0.2061,
    "ts": 1760000000.0
  },
  "session": {
    "windows": 1,
    "tp": 0,
    "fp": 0,
    "fn": 1,
    "tn": 0,
    "accuracy": 0.0,
    "precision": null,
    "recall": 0.0,
    "false_positive_rate": null
  }
}
```

Derived values are `null` when their denominator is zero.

POST request bodies must be JSON objects no larger than 16 KiB. Malformed JSON,
non-object JSON, missing/invalid `file`, and missing/invalid `label` return `400`;
an oversized body returns `413`. A reset that races an in-flight inference is
guarded by capturing the session generation before inference and verifying it
again under `ST.manual_lock` before recording, so an old result cannot land in a
newly reset session.

### 5.2 `POST /api/manual/reset`

Effect:

- create a new `session_id`;
- clear manual counts and `manual.last`;
- clear `State.windows`, making `aggregate()` return `NO DATA`;
- clear `State.last_cough_alert`;
- leave `enabled`, lifetime counters, `windows.jsonl`, WAV clips, alerts, and `evaluation.json` untouched.

Response:

```json
{ "ok": true, "session_id": "uuid", "ts": 1760000000.0 }
```

If a body is supplied it must be a valid JSON object within 16 KiB; otherwise
return `400` or `413` as above.

### 5.3 `GET /api/status`

Existing fields keep their names and meanings. Add:

- `manual`: the session object above plus `last`.
- `evaluation`: the contents of `evaluation.json`.
- `active_result_source`: `live` when `aggregate.windows > 0`, otherwise `manual` when `manual.last` exists, otherwise `none`.

The UI still renders live and manual panels separately; `active_result_source` is for assistive text only.

### 5.4 Existing `/api/clips`

The already-committed `/api/clips` endpoint is the clip source for the dashboard selector. No new upload endpoint is added.

---

## 6. State helper

`backend/cough/manual_session.py` is a pure helper with no model or HTTP imports. It owns:

- label validation;
- TP/FP/FN/TN accumulation;
- `windows`, `accuracy`, `precision`, `recall`, and `false_positive_rate`;
- reset to a fresh session with a new UUID.

The classifier holds a dedicated `manual_lock` around helper calls. No other state is shared.

---

## 7. Evaluation provenance

`backend/cough/evaluation.json` is committed and static at runtime. It contains generated metric records, not raw datasets.

### 7.1 Measured values from shipped artifacts

Computed 2026-11-21 by applying the shipped `head.json` threshold `0.2061` to the `features5s/` embeddings.

Artifact hashes:

- `head.json`: `d3d229593cd2a875c15fd7533dd7589140d87d440471615a019e15a3d1e22566`
- `features_aswine_test.npz`: `76f662490e40f47dc716b41c2d44e3040f9c102db471ee0d14f76f1df5cf59d2`
- `features_mapda_heldout_xspecies.npz`: `2be6516eec6dc598450c5c27342b0efcdbe7a250c0077f1a1bd95e4a01c35426`

| Record | n / positives | TP | FP | FN | TN | Accuracy | Precision | Recall | FP rate |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| aSwine holdout, same farm | 2,268 / 203 | 101 | 145 | 102 | 1,920 | 0.8911 | 0.4106 | 0.4975 | 0.0702 |
| MAP-DA held-out cross-species | 3,140 / 266 | 0 | 0 | 266 | 2,874 | 0.9153¹ | null | 0.0 | 0.0 |

¹ Vacuous: at the deployed threshold the model predicts no positives on MAP-DA. `roc_auc 0.8504` and `pr_auc 0.3811` describe ranking only. The documented `0.36` precision / `0.60` recall belongs to a different MAP-DA operating point at threshold `0.0`; it must not be presented as the deployed operating point.

aSwine ranking metrics at the deployed threshold set: `roc_auc 0.8079`, `pr_auc 0.4037`.

### 7.2 Dataset records

- **aSwine:** 154 files, 15.46 h, 10,979 weakly labeled 1-second intervals; file-level split 123 train / 31 holdout, zero overlap verified; train 627 cough / 8,084 other; holdout 203 cough / 2,065 other; CC BY-NC 4.0; interval labels mark a window containing a cough, not precise onset/offset.
- **MAP-DA:** 725 clips, 16.08 min, normalized 44.1 kHz stereo → 16 kHz mono; 266 cough, 211 ab, 200 metal, 48 excretion; held-out cross-species evaluation only because the deposit has no training split.
- **PANNs Cnn14_16k:** frozen AudioSet-pretrained feature extractor, `mAP 0.438`; not PigPulse-labeled data and not itself an accuracy result.
- **Live barn history:** 1,511 windows, 0 cough detections, mean `p 0.0105`, max `p 0.0687`; unlabeled live observation, not accuracy.
- **Manual Pi clips:** unlabeled until the operator assigns a label; session metrics are not field accuracy.

### 7.3 Manifest shape

Each record carries: `id`, `kind` (`labeled_evaluation`, `unlabeled_live`, `manual`, `model_artifact`), `dataset`, `role`, `n`, `positives`, `threshold` where applicable, `confusion` where applicable, `metrics`, `source_files`, `source_hash` where available, `generated`, and `note`. `kind` is rendered verbatim in the UI so provenance cannot be blurred.

---

## 8. UI behavior

### 8.1 Pi dashboard cough card

Add to the existing card:

- clip selector populated from `/api/clips`;
- label selector with an empty `Select label...` placeholder plus exactly `cough` / `other`;
- **Run** button, disabled until both a clip and an explicit valid label are selected, controlled by one shared enable helper;
- clip options are created with DOM APIs and `textContent`, never interpolated into `innerHTML`;
- **Reset** button;
- result line: clip, operator label, score, prediction, correct/incorrect;
- session line: windows, TP, FP, FN, TN, accuracy, precision, recall, FP rate;
- existing drops/CPU line extended with **RSS** from `status.runtime.rss_mb`.

Buttons meet the repository's high-contrast and ≥44 px touch-target rules. After Reset the live verdict reads `NO DATA` and the manual session line is empty.

### 8.2 Full `/cough` page

- Replace the hard-coded precision/recall paragraph with values loaded from `evaluation.json`, explicitly labeled **“Labeled evaluation — aSwine holdout, not live accuracy.”**
- Add a Manual session panel with the same controls and metrics.
- Keep the live verdict panel separate from both.
- Keep the existing RSS display; no duplicate collector.

### 8.3 Mobile app

No functional change. `CoughClassifierCard` remains read-only and does not show manual controls. The public proxy continues to allow only `GET /cough/api/status`, so manual run/reset are not reachable from the hosted app.

---

## 9. Security and safety

- Clip path is confined to `CLIPS_DIR`; absolute paths and `..` traversal are rejected.
- No upload, no arbitrary dataset path, no shell invocation, no new dependency.
- Manual runs never publish MQTT alerts.
- Reset never deletes files or changes `enabled`.
- POST routes are Pi-dashboard controls, not authenticated operator controls. The classifier listens only on loopback, but the Pi HTTPS server accepts any client that can reach it; the public proxy still refuses writes. Do not describe this as an authorization boundary.
- Firmware is untouched; no serial fault log is required because no flashing occurs.

---

## 10. Testing

- Pure helper tests: label validation, confusion accumulation, undefined-denominator `null`, reset/new session ID.
- Validator tests: path traversal, missing file, wrong channel count/rate/width, wrong sample count, absolute paths, sibling-prefix paths, and symlink escapes.
- A lazy `load_model()` seam and injected `embed_fn` / `prob_fn` let HTTP tests import the classifier without the uncommitted 304 MB ONNX body. Production behavior is unchanged: `main()` calls `load_model()` before starting threads.
- Integration checks: manual run does not add to `State.windows`, `windows.jsonl`, clips, alerts, or lifetime counters.
- HTTP checks: strict JSON-object parsing, 16 KiB body limit with `413`, `400` for invalid inputs, top-level `session_id`, and generation guard when Reset races inference.
- Reset checks: verdict becomes `NO DATA`, cooldown latch clears, `enabled` and durable artifacts are unchanged.
- Backend gate: `npm run ci:backend` plus focused Python tests.
- Browser check: select clip + label → Run shows a result; Reset clears it; RSS remains visible; no alert is published.

---

## 11. Files expected to change

- `backend/cough/cough_classifier.py`
- `backend/cough/manual_session.py` (new)
- `backend/cough/evaluation.json` (new)
- `backend/thermal-pi/tests/test_cough_manual_session.py` (new)
- `backend/thermal-pi/tests/test_cough_manual_http.py` (new)
- `backend/thermal-pi/static/index.html`
- `backend/cough/README.md`
- `backend/thermal-pi/web_server.py` (POST allowlist and body limit)
- `backend/workers/readonly_pb_proxy.py` comment only if needed
- root `package.json` (test script)

---

## 12. Out of scope

- Model retraining or threshold changes.
- Copying labeled datasets onto the Pi.
- Browser uploads.
- Public/manual write access through Expo Hosting.
- Memory warning thresholds or alerts.
- Deleting historical audit artifacts.
- Any firmware or hardware change.

---

## 13. Acceptance criteria

1. Run requires a clip and a pre-assigned label and returns a fresh per-run result.
2. Reset immediately clears the live verdict and manual session, with no file deletion.
3. Manual results cannot enter live verdicts, audit logs, alerts, or labeled dataset metrics.
4. The UI shows labeled evaluation, manual session, and live verdict as three distinct things.
5. The aSwine numbers are shown with dataset, threshold, confusion counts, and the “not live accuracy” qualifier.
6. MAP-DA is not presented as having a usable positive-prediction operating point at `0.2061`.
7. Classifier RSS is visible in the Pi cough card.
8. Manual routes are described as Pi-dashboard controls, not authenticated operator controls; the public proxy refuses writes.
9. HTTP tests run without the 304 MB ONNX body via the lazy-model injection seam.
10. All backend and browser gates pass; no independent provider is retried after HTTP 429.
