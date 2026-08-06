"""2.2 - Face detection (YOLOv8-face via ultralytics).

Standalone detector used for per-frame boxes AND for the detection eval (mucs 6).
Tracking (2.3) lives in tracker.py and drives its own model in .track() mode; this
class exposes plain .detect() so each stage stays testable in isolation.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from configs import CFG


@dataclass
class Detection:
    bbox: tuple[int, int, int, int]  # x1, y1, x2, y2
    confidence: float


class FaceDetector:
    """Thin wrapper around an ultralytics YOLO face model."""

    def __init__(self, weights=CFG.face_weights, device: str = CFG.device):
        self.weights = weights
        self.device = device
        self._model = None  # lazy-loaded in Phase 1

    def _ensure_model(self):
        if self._model is None:
            from ultralytics import YOLO
            self._model = YOLO(str(self.weights))

    def detect(self, frame_bgr: np.ndarray) -> list[Detection]:
        """Return face detections for a single (already preprocessed) frame."""
        self._ensure_model()
        results = self._model.predict(
            frame_bgr,
            conf=CFG.conf_threshold,
            iou=CFG.iou_threshold,
            device=self.device,
            verbose=False,
        )

        detections = []
        if len(results) > 0 and results[0].boxes is not None:
            boxes = results[0].boxes
            for box in boxes:
                xyxy = box.xyxy[0].cpu().numpy()
                x1, y1, x2, y2 = map(int, xyxy)
                conf = float(box.conf[0].cpu().item())
                detections.append(Detection(bbox=(x1, y1, x2, y2), confidence=conf))

        return detections
