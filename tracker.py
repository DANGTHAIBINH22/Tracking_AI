"""2.3 - Tracking / data association (ByteTrack, the backbone).

Turns per-frame boxes into stable identities across time so dwell time and unique
counts are meaningful. Uses ultralytics' built-in ByteTrack (IoU + Kalman filter +
Hungarian association) via model.track(persist=True).

Report vocabulary: IoU, Kalman filter, Hungarian algorithm, data association.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from configs import CFG


@dataclass
class Track:
    track_id: int
    bbox: tuple[int, int, int, int]
    confidence: float


class FaceTracker:
    """Detection + ByteTrack in one call, keeping identities persistent across frames."""

    def __init__(self, weights=CFG.face_weights, tracker_cfg: str = CFG.tracker_cfg, device: str = CFG.device):
        self.weights = weights
        self.tracker_cfg = tracker_cfg
        self.device = device
        self._model = None

    def _ensure_model(self):
        if self._model is None:
            from ultralytics import YOLO
            self._model = YOLO(str(self.weights))

    def update(self, frame_bgr: np.ndarray) -> list[Track]:
        """Advance the tracker by one frame; return live tracks with stable ids."""
        self._ensure_model()
        results = self._model.track(
            frame_bgr,
            persist=True,
            tracker=self.tracker_cfg,
            conf=CFG.conf_threshold,
            iou=CFG.iou_threshold,
            device=self.device,
            verbose=False,
        )

        tracks = []
        if len(results) > 0 and results[0].boxes is not None:
            boxes = results[0].boxes
            if boxes.id is not None:
                ids = boxes.id.cpu().numpy().astype(int)
                xyxy = boxes.xyxy.cpu().numpy()
                confs = boxes.conf.cpu().numpy()
                for track_id, box, conf in zip(ids, xyxy, confs):
                    x1, y1, x2, y2 = map(int, box)
                    tracks.append(Track(track_id=int(track_id), bbox=(x1, y1, x2, y2), confidence=float(conf)))

        return tracks

    def reset(self):
        """Reset the internal tracking state (useful when starting a new video)."""
        if self._model is not None and hasattr(self._model, "predictor") and self._model.predictor is not None:
            if hasattr(self._model.predictor, "trackers"):
                self._model.predictor.trackers = []
