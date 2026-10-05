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
            # Without this ultralytics letterboxes every frame back down to its
            # default 640, throwing away the resolution process_long_side bought.
            imgsz=CFG.process_long_side,
            device=self.device,
            verbose=False,
        )

        tracks = []
        if len(results) > 0 and results[0].boxes is not None:
            boxes = results[0].boxes
            if boxes.id is not None:
                ids = boxes.id.int().cpu().numpy()
                xyxy = boxes.xyxy.float().cpu().numpy()
                confs = boxes.conf.float().cpu().numpy()
                for track_id, box, conf in zip(ids, xyxy, confs):
                    x1, y1, x2, y2 = map(int, box)
                    tracks.append(Track(track_id=int(track_id), bbox=(x1, y1, x2, y2), confidence=float(conf)))

        return tracks

    def reset(self):
        """Reset the internal tracking state (useful when starting a new video).

        Reset each tracker IN PLACE (BYTETracker.reset: tracks, Kalman filter,
        frame counter, id counter). Do not delete `predictor.trackers` or empty
        the list:
          - emptied, on_predict_start sees the attribute, skips rebuilding, and
            the next .track() dies on `predictor.trackers[0]` with IndexError;
          - deleted, model.track() re-registers its tracking callbacks on top of
            the old ones, so every later frame runs through ByteTrack twice.
            The second pass drops the one-frame-old unconfirmed track of anyone
            who just walked in, so after the first reset() nobody new was ever
            tracked — only whoever was already there. Measured: tracker
            frame_id counted 70 for 35 frames, and a second face at conf 0.85
            never got an id.
        """
        predictor = getattr(self._model, "predictor", None) if self._model is not None else None
        for tracker in getattr(predictor, "trackers", None) or []:
            tracker.reset()
