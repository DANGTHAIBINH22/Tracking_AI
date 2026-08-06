"""2.4 - Crop & align the face region.

Expand the bbox by CFG.face_margin (MiVOLO was trained on head-and-shoulders, not
tight faces) while clamping to image bounds. Optional eye-level alignment.
"""

from __future__ import annotations

import numpy as np

from configs import CFG


def crop_face(frame_bgr: np.ndarray, bbox: tuple[int, int, int, int],
              margin: float = CFG.face_margin) -> np.ndarray:
    """Crop with margin, clamped to [0, W] x [0, H]."""
    h, w = frame_bgr.shape[:2]
    x1, y1, x2, y2 = bbox
    bw, bh = x2 - x1, y2 - y1
    x1 = max(0, int(x1 - bw * margin))
    y1 = max(0, int(y1 - bh * margin))
    x2 = min(w, int(x2 + bw * margin))
    y2 = min(h, int(y2 + bh * margin))
    return frame_bgr[y1:y2, x1:x2]


def align_by_eyes(face_bgr: np.ndarray, left_eye, right_eye) -> np.ndarray:
    """Optional: rotate so the eyes are horizontal. Not required for a first pass."""
    raise NotImplementedError("Optional (Phase 3+): rotate face to eye-level using landmarks.")
