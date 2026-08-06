"""2.1 - Preprocessing.

Normalise the incoming BGR frame so downstream models stay stable under lighting
changes (challenge #1: back-light / shifting light). Classic image processing only.
"""

from __future__ import annotations

import cv2
import numpy as np

from configs import CFG


def resize_long_side(frame: np.ndarray, long_side: int) -> np.ndarray:
    """Resize so the longer edge == `long_side`, preserving aspect ratio."""
    h, w = frame.shape[:2]
    scale = long_side / max(h, w)
    if scale >= 1.0:
        return frame
    return cv2.resize(frame, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)


def apply_clahe(frame_bgr: np.ndarray) -> np.ndarray:
    """CLAHE on the L channel of LAB — lifts detail in back-lit faces.

    This is the experiment toggled by CFG.use_clahe (compare detection with/without,
    see plan mucs 6).
    """
    lab = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=CFG.clahe_clip_limit, tileGridSize=CFG.clahe_tile_grid)
    l = clahe.apply(l)
    return cv2.cvtColor(cv2.merge((l, a, b)), cv2.COLOR_LAB2BGR)


def to_rgb(frame_bgr: np.ndarray) -> np.ndarray:
    """OpenCV is BGR; MediaPipe/MiVOLO expect RGB."""
    return cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)


def preprocess(frame_bgr: np.ndarray) -> np.ndarray:
    """Full preprocess step. Returns a BGR frame ready for detection."""
    out = resize_long_side(frame_bgr, CFG.process_long_side)
    if CFG.use_clahe:
        out = apply_clahe(out)
    return out
