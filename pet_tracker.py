"""2.9 - Pet detection & spatial proximity tracking (Phase 7).

Pretrained YOLOv8-nano (COCO pretrained: class 15=cat, class 16=dog).
Associates detected pets (dogs, cats) with nearby persons based on spatial
proximity (distance between person feet/body and pet center).

Hard constraint: no model training. Uses standard COCO weights.
To preserve 30 FPS, detection is throttled (every N frames) with temporal caching.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING

import numpy as np

from configs import CFG

if TYPE_CHECKING:
    from pipeline import PersonMeta


@dataclass
class PetDetection:
    """A detected pet in the current frame."""
    class_id: int              # 15: cat, 16: dog
    pet_type: str              # a value of ANIMALS: "dog", "cat", "bird", …
    confidence: float
    bbox: tuple[int, int, int, int]  # (x1, y1, x2, y2)
    owner_track_id: int | None = None  # track_id of closest person within proximity


# COCO class id -> the type string carried through PersonMeta / the API.
ANIMALS: dict[int, str] = {
    14: "bird",
    15: "cat",
    16: "dog",
    17: "horse",
    18: "sheep",
    19: "cow",
    20: "elephant",
    21: "bear",
    22: "zebra",
    23: "giraffe",
}
# Vietnamese names for captions and audience summaries.
ANIMAL_VI: dict[str, str] = {
    "bird": "chim", "cat": "mèo", "dog": "chó", "horse": "ngựa", "sheep": "cừu",
    "cow": "bò", "elephant": "voi", "bear": "gấu", "zebra": "ngựa vằn", "giraffe": "hươu cao cổ",
}
PET_NAMES = ANIMALS  # older name, kept for importers


class PetTracker:
    """Lightweight pet detector and companion matcher using YOLOv8 COCO."""

    def __init__(self, cfg=CFG):
        self.cfg = cfg
        self._model = None
        self._model_failed = False
        self._frame_count = 0
        self._cached_pets: list[PetDetection] = []

    def _ensure_model(self) -> bool:
        """Lazy-load the YOLOv8-nano model on first call."""
        if self._model is not None:
            return True
        if self._model_failed:
            return False

        # Falling back to the bare name lets ultralytics fetch the COCO weights
        # on first use. Keep it a bare name: a path that does not exist yet is
        # not a download target to ultralytics, it is a missing file.
        weights_path = Path(self.cfg.pet_weights)
        if not weights_path.exists():
            weights_path = Path("yolov8n.pt")

        try:
            from ultralytics import YOLO
            self._model = YOLO(str(weights_path))
            return True
        except Exception as e:
            print(f"[PetTracker] CẢNH BÁO: Không thể nạp mô hình YOLOv8 COCO ({e}). Bỏ qua nhận diện thú cưng.")
            self._model_failed = True
            return False

    def update(self, frame_bgr: np.ndarray, metas: list[PersonMeta]) -> list[PetDetection]:
        """Detect pets and link them to nearby people in `metas`."""
        if not self.cfg.pet_enabled:
            return []

        self._frame_count += 1
        should_detect = (self._frame_count % self.cfg.pet_detect_every_n == 0)

        if should_detect:
            if not self._ensure_model():
                return []
            self._cached_pets = self._detect(frame_bgr)

        # Match cached pets with current person tracks
        self._associate_companions(self._cached_pets, metas)
        return self._cached_pets

    def _detect(self, frame_bgr: np.ndarray) -> list[PetDetection]:
        """Run YOLO inference for the animal classes in cfg.pet_classes."""
        try:
            results = self._model(
                frame_bgr,
                classes=list(self.cfg.pet_classes),
                conf=self.cfg.pet_conf_threshold,
                imgsz=self.cfg.pet_imgsz,
                # One box per animal across classes. Per-class NMS let the same
                # cat come back as both "cat" and "dog" (woman_petting_cat:
                # cat 65% of frames, dog 44%); agnostic NMS keeps the likelier.
                agnostic_nms=True,
                verbose=False,
                device=self.cfg.device,
            )
        except Exception:
            return []

        if not results or results[0].boxes is None:
            return []

        detections: list[PetDetection] = []
        boxes = results[0].boxes
        xyxy = boxes.xyxy.float().cpu().numpy()
        confs = boxes.conf.float().cpu().numpy()
        classes = boxes.cls.int().cpu().numpy()

        for box, conf, cls_id in zip(xyxy, confs, classes):
            x1, y1, x2, y2 = (int(v) for v in box)
            pet_type = PET_NAMES.get(cls_id, "pet")
            detections.append(
                PetDetection(
                    class_id=cls_id,
                    pet_type=pet_type,
                    confidence=float(conf),
                    bbox=(x1, y1, x2, y2),
                )
            )
        return detections

    def _associate_companions(self, pets: list[PetDetection], metas: list[PersonMeta]) -> None:
        """Find the closest person for each pet within proximity threshold."""
        if not metas or not pets:
            return

        for pet in pets:
            px1, py1, px2, py2 = pet.bbox

            closest_person = None
            min_dist = float("inf")

            for person in metas:
                hx1, hy1, hx2, hy2 = person.bbox
                face_h = max(1.0, hy2 - hy1)
                # The body as a vertical segment from the face centre down to
                # the estimated feet. A pet held in the arms, sitting in a lap
                # or walking at heel is near some point of it; a pet only near
                # the feet was the old rule, which missed every close-up.
                body_x = (hx1 + hx2) / 2.0
                top_y = (hy1 + hy2) / 2.0
                feet_y = hy1 + face_h * self.cfg.pet_body_faces
                # Gap between that segment and the animal's box (0 when they
                # overlap), not its centre: a horse beside its rider has its
                # centre far from the body even while touching it (measured:
                # woman_petting_horse, horse in 81% of frames, linked in 0%).
                gap_x = max(px1 - body_x, 0.0, body_x - px2)
                gap_y = max(py1 - feet_y, 0.0, top_y - py2)
                # Measured in this person's face heights, so the same rule holds
                # for a face 30px tall across the street and 300px at the screen.
                dist = math.hypot(gap_x, gap_y) / face_h
                if dist < min_dist:
                    min_dist = dist
                    closest_person = person

            # If within proximity threshold, bind companion
            if closest_person is not None and min_dist <= self.cfg.pet_proximity_faces:
                pet.owner_track_id = closest_person.track_id
                closest_person.has_pet = True
                closest_person.pet_type = pet.pet_type
                closest_person.pet_box = pet.bbox
