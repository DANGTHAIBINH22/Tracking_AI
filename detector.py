"""2.2 - Face detection (YOLOv8-face via ultralytics).

Standalone detector used for per-frame boxes AND for the detection eval (mucs 6).
Tracking (2.3) lives in tracker.py and drives its own model in .track() mode; this
class exposes plain .detect() so each stage stays testable in isolation.
"""

from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np

from configs import CFG


@dataclass
class Detection:
    bbox: tuple[int, int, int, int]  # x1, y1, x2, y2
    confidence: float


class FaceDetector:
    """Thin wrapper around an ultralytics YOLO face model with MediaPipe Fallback."""

    def __init__(self, weights=CFG.face_weights, device: str = CFG.device):
        self.weights = weights
        self.device = device
        self._model = None
        self.use_fallback = False
        self.mp_face = None

    def _ensure_model(self):
        if self._model is not None or self.use_fallback:
            return
            
        try:
            from ultralytics import YOLO
            self._model = YOLO(str(self.weights))
            print(f"[Detector] Đã tải mô hình YOLOv8-face: {self.weights}")
        except Exception as e:
            print(f"[Detector] Lỗi tải YOLOv8-face ({e}). Chuyển sang sử dụng MediaPipe làm bộ dò dự phòng.")
            self.use_fallback = True
            
        if self.use_fallback:
            import mediapipe as mp
            self.mp_face = mp.solutions.face_detection.FaceDetection(
                model_selection=0,
                min_detection_confidence=CFG.conf_threshold
            )

    def detect(self, frame_bgr: np.ndarray) -> list[Detection]:
        """Return face detections for a single (already preprocessed) frame."""
        self._ensure_model()
        detections = []
        h, w = frame_bgr.shape[:2]
        
        if not self.use_fallback and self._model is not None:
            try:
                results = self._model.predict(
                    frame_bgr,
                    conf=CFG.conf_threshold,
                    iou=CFG.iou_threshold,
                    device=self.device,
                    verbose=False,
                )

                if len(results) > 0 and results[0].boxes is not None:
                    boxes = results[0].boxes
                    for box in boxes:
                        xyxy = box.xyxy[0].cpu().numpy()
                        x1, y1, x2, y2 = map(int, xyxy)
                        conf = float(box.conf[0].cpu().item())
                        detections.append(Detection(bbox=(x1, y1, x2, y2), confidence=conf))
            except Exception as e:
                print(f"[Detector] Lỗi suy luận YOLOv8-face ({e}). Chuyển sang chạy MediaPipe.")
                self.use_fallback = True
                self._ensure_model()
                
        if self.use_fallback:
            # MediaPipe expects RGB
            rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
            results = self.mp_face.process(rgb)
            if results.detections:
                for detection in results.detections:
                    score = detection.score[0]
                    if score >= CFG.conf_threshold:
                        bbox = detection.location_data.relative_bounding_box
                        x1 = max(0, int(bbox.xmin * w))
                        y1 = max(0, int(bbox.ymin * h))
                        x2 = min(w, x1 + int(bbox.width * w))
                        y2 = min(h, y1 + int(bbox.height * h))
                        detections.append(Detection(bbox=(x1, y1, x2, y2), confidence=float(score)))

        return detections
