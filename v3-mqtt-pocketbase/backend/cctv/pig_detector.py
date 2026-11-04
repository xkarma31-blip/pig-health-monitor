#!/usr/bin/env python3
"""Pig detection + track-ID preparation — NOT WIRED IN (2026-11-04).

Status: scaffold only, by design. The Tapo CCTV feed was offline as of
2026-11-04 ("no camera answering on any candidate", pigpulse-cctv.service)
and the Pi has no inference stack installed (device readout: no ultralytics,
cv2, ncnn or torch — numpy only). This module is import-safe with none of
those present, does nothing unless PIGPULSE_PIGDETECT=1, and exists so the
"fix CCTV, then add YOLO + IDs" step is a wiring job, not a design job.

Capability ceiling per CANON §2.7 (peer-reviewed / Pi-4B bounds):
  - YOLOv8n via NCNN ≈ 2–3 FPS inference on Pi 4B — enough for pen-level
    detection and counting; NOT for 30 FPS anything.
  - Deep SORT-P tracking ≈ 89.6% MOTA over minutes of video.
  - NO long-term re-ID for same-breed pigs exists: track IDs below are
    SESSION-LOCAL. Stable cross-day identity needs paint marks or RFID+CV.
  - Fusion with the MLX90640 must be position-level late fusion (thermal
    blobs ↔ detected pigs via a calibrated homography). Pixel-level fusion
    of 32×24 thermal with 1080p visible is meaningless.

Wiring plan for tapo_mjpeg_server.py (commented out on purpose — enable
only after the camera is answering and a model exists on the Pi):

    # from pig_detector import PigDetector          # same directory
    # detector = PigDetector()                      # reads PIGPULSE_PIGDETECT
    #
    # Inside the frame pump, time-gated (Pi ceiling: run 1–2 Hz, never
    # per frame — the pump must never block on inference):
    #   if detector.available and now - last_run > 0.5:
    #       dets = detector.detect_jpeg(jpeg_bytes)
    #       # dets: [{id, conf, box:[x,y,w,h] in pixels}] — annotate the
    #       # frame or publish {pig_count, track_ids} to telemetry.

Model (when we get there): a pig-finetuned YOLOv8n. Export paths in order
of preference on Pi 4B: 1) Ultralytics NCNN export, 2) OpenCV DNN with a
yolov8n.onnx. Both lazy-imported — nothing is required to import this file.

Env:
  PIGPULSE_PIGDETECT=1    enable detection (default: off)
  PIGDETECT_MODEL         model path (default: ./models/pig_yolov8n)
  PIGDETECT_CONF          confidence threshold (default: 0.25)
"""
from __future__ import annotations

import json
import math
import os
from dataclasses import dataclass, field

ENABLE_ENV = "PIGPULSE_PIGDETECT"


@dataclass
class Detection:
    """One detected pig in one frame. `id` is a session-local track ID."""

    track_id: int
    conf: float
    box: tuple[int, int, int, int]          # x, y, w, h in pixels
    centroids: list[tuple[float, float]] = field(default_factory=list)


class CentroidTracker:
    """Minimal nearest-centroid tracker so IDs exist without Deep SORT.

    Prep, not a replacement: Deep SORT-P (89.6% MOTA per CANON §2.7) is the
    upgrade path once we have video worth tracking. This exists so the
    interface — detections come OUT with stable-ish integer IDs — is settled
    today and callers never have to change when the tracker improves.

    Matching is greedy nearest-neighbour in normalized distance; a track is
    dropped after `max_lost` consecutive misses (at 1–2 Hz that is ~15–30 s,
    long enough for a pig to walk out of frame and back).
    """

    def __init__(self, max_lost: int = 30, max_jump: float = 0.35):
        self.max_lost = max_lost
        self.max_jump = max_jump            # fraction of frame diagonal
        self._tracks: dict[int, tuple[float, float, int]] = {}  # id -> (cx, cy, lost)
        self._next_id = 1

    def update(self, boxes: list[tuple[int, int, int, int]]) -> dict[int, int]:
        """Feed this frame's boxes; get box-index -> track-id."""
        frame_w = max((b[0] + b[2] for b in boxes), default=1)
        frame_h = max((b[1] + b[3] for b in boxes), default=1)
        diag = math.hypot(frame_w, frame_h) or 1.0
        centers = [(b[0] + b[2] / 2, b[1] + b[3] / 2) for b in boxes]

        assigned: dict[int, int] = {}
        used_tracks: set[int] = set()
        for i, (cx, cy) in enumerate(centers):
            best, best_d = None, self.max_jump
            for tid, (tx, ty, _lost) in self._tracks.items():
                if tid in used_tracks:
                    continue
                d = math.hypot(cx - tx, cy - ty) / diag
                if d < best_d:
                    best, best_d = tid, d
            if best is not None:
                assigned[i] = best
                used_tracks.add(best)
                self._tracks[best] = (cx, cy, 0)
            else:
                assigned[i] = self._next_id
                self._tracks[self._next_id] = (cx, cy, 0)
                self._next_id += 1

        # Age out tracks that no box matched this frame.
        for tid in list(self._tracks):
            if tid not in used_tracks:
                cx, cy, lost = self._tracks[tid]
                if lost + 1 > self.max_lost:
                    del self._tracks[tid]
                else:
                    self._tracks[tid] = (cx, cy, lost + 1)
        return assigned


class PigDetector:
    """Lazy-loading detector shell. Safe to construct with nothing installed.

    Backends, in preference order, both deferred to first use:
      "ultralytics" — Ultralytics YOLO (NCNN export recommended on the Pi)
      "none"        — flag off or no stack installed; detect_* returns []
    """

    def __init__(self, model_path: str | None = None, conf: float | None = None):
        self.enabled = os.getenv(ENABLE_ENV, "0").strip() == "1"
        self.model_path = (model_path or os.getenv("PIGDETECT_MODEL", "")
                           or "./models/pig_yolov8n")
        self.conf = float(conf or os.getenv("PIGDETECT_CONF", "0.25"))
        self.tracker = CentroidTracker()
        self._model = None
        self._backend = "none"
        if self.enabled:
            self._load()

    # -- backend loading ----------------------------------------------------
    def _load(self) -> None:
        try:
            from ultralytics import YOLO  # noqa: deferred import, optional dep
            self._model = YOLO(self.model_path)
            self._backend = "ultralytics"
        except Exception:
            self._model = None
            self._backend = "none"

    @property
    def available(self) -> bool:
        return self.enabled and self._backend != "none"

    def status(self) -> dict:
        return {
            "enabled": self.enabled,
            "backend": self._backend,
            "available": self.available,
            "model": self.model_path,
            "conf": self.conf,
            "note": ("scaffold only — not wired into the MJPEG feed; "
                     "see module docstring for the wiring plan"
                     if not self.available else "ready"),
        }

    # -- inference ----------------------------------------------------------
    def detect_jpeg(self, jpeg_bytes: bytes) -> list[Detection]:
        """Detect pigs in one JPEG frame; returns [] when not available."""
        if not self.available or not jpeg_bytes:
            return []
        import cv2  # deferred: only reached when ultralytics imported fine
        frame = cv2.imdecode(
            __import__("numpy").frombuffer(jpeg_bytes, dtype="uint8"),
            cv2.IMREAD_COLOR,
        )
        if frame is None:
            return []
        result = self._model.predict(frame, conf=self.conf, verbose=False)[0]
        boxes = [(int(x1), int(y1), int(x2 - x1), int(y2 - y1))
                 for x1, y1, x2, y2 in result.boxes.xyxy.tolist()] \
            if result.boxes is not None else []
        confs = result.boxes.conf.tolist() if result.boxes is not None else []
        ids = self.tracker.update(boxes)
        return [Detection(track_id=ids[i], conf=round(confs[i], 3),
                          box=boxes[i]) for i in range(len(boxes))]


if __name__ == "__main__":
    # Smoke test — must pass on a stock Pi/laptop with zero ML deps.
    d = PigDetector()
    assert d.detect_jpeg(b"") == []
    t = CentroidTracker()
    a = t.update([(10, 10, 50, 50), (200, 10, 50, 50)])
    b = t.update([(12, 12, 50, 50), (198, 10, 50, 50)])
    assert a[0] == b[0] and a[1] == b[1], "IDs must persist across small moves"
    assert a[0] != a[1], "distinct objects must get distinct IDs"
    print(json.dumps(d.status(), indent=2))
    print("tracker OK: ids persisted", a, "->", b)
