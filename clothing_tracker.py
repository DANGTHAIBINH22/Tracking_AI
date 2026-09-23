"""Lightweight clothing color extraction & style classification (Non-VLM).

Why this design:
Instead of loading a heavyweight 1.6GB VLM or 350MB CLIP model which degrades
real-time FPS down to 2-3 frames/s, this module uses classic computer vision:
1. Geometry-based upper-body torso cropping below the face bbox.
2. OpenCV K-Means clustering (k=3) on the HSV/RGB color space (< 1ms, 0 MB memory).
3. Color-texture homogeneity heuristics for style classification:
   - "Formal": Solid, neutral tones (Black, White, Grey, Navy) with high color dominance.
   - "Sport": Vibrant, high-saturation athletic tones (Red, Orange, Yellow, Neon).
   - "Casual": Mixed and everyday lifestyle palettes.
"""

from __future__ import annotations

from dataclasses import dataclass
from collections import Counter
import cv2
import numpy as np


@dataclass
class ClothingDetection:
    color_name: str                   # e.g., "Black", "White", "Blue", "Red", "Grey"
    style: str                        # "Formal" | "Sport" | "Casual"
    bgr_color: tuple[int, int, int]   # Dominant color in BGR format
    confidence: float = 1.0


class ClothingTracker:
    """Extracts dominant clothing color and style for an attentive person track."""

    def __init__(self, cfg=None):
        self.cfg = cfg

    @staticmethod
    def _extract_torso(frame_bgr: np.ndarray, face_bbox: tuple[int, int, int, int]) -> np.ndarray | None:
        """Crops upper-body torso based on face dimensions."""
        x1, y1, x2, y2 = face_bbox
        w = x2 - x1
        h = y2 - y1

        # Torso starts slightly below chin (0.15*h) to avoid beard/neck shadows
        torso_y1 = int(y2 + 0.15 * h)
        torso_y2 = int(y2 + 2.2 * h)

        # Torso is wider than face to capture shoulder garment area
        torso_x1 = int(x1 - 0.4 * w)
        torso_x2 = int(x2 + 0.4 * w)

        ih, iw = frame_bgr.shape[:2]
        torso_x1 = max(0, min(iw - 1, torso_x1))
        torso_x2 = max(0, min(iw, torso_x2))
        torso_y1 = max(0, min(ih - 1, torso_y1))
        torso_y2 = max(0, min(ih, torso_y2))

        if torso_x2 - torso_x1 < 16 or torso_y2 - torso_y1 < 16:
            return None

        crop = frame_bgr[torso_y1:torso_y2, torso_x1:torso_x2]
        return crop if crop.size > 0 else None

    @staticmethod
    def _bgr_to_color_name(b: int, g: int, r: int) -> tuple[str, int, int]:
        """Maps BGR color to human-readable name and returns (name, S, V)."""
        pixel_bgr = np.uint8([[[b, g, r]]])
        pixel_hsv = cv2.cvtColor(pixel_bgr, cv2.COLOR_BGR2HSV)[0][0]
        h_val, s_val, v_val = int(pixel_hsv[0]), int(pixel_hsv[1]), int(pixel_hsv[2])

        # Achromatic tones (Black, White, Grey)
        if v_val < 50:
            return "Black", s_val, v_val
        if s_val < 38 and v_val > 175:
            return "White", s_val, v_val
        if s_val < 42:
            return "Grey", s_val, v_val

        # Chromatic tones (Hue range in OpenCV is [0, 180])
        if h_val < 11 or h_val >= 168:
            return "Red", s_val, v_val
        if 11 <= h_val < 25:
            return "Orange", s_val, v_val
        if 25 <= h_val < 35:
            return "Yellow", s_val, v_val
        if 35 <= h_val < 85:
            return "Green", s_val, v_val
        if 85 <= h_val < 130:
            return "Blue", s_val, v_val
        if 130 <= h_val < 155:
            return "Purple", s_val, v_val
        if 155 <= h_val < 168:
            return "Pink", s_val, v_val

        return "Mixed", s_val, v_val

    @staticmethod
    def _determine_style(color_name: str, dominant_weight: float, s_val: int) -> str:
        """Heuristic classification for lifestyle and clothing style."""
        # Solid, dark or neutral colors with high area dominance reflect office/formal
        if color_name in ("Black", "White", "Grey", "Blue") and dominant_weight >= 0.50:
            return "Formal"
        # Highly saturated or bright colors reflect athletic/sportswear
        if s_val > 115 or color_name in ("Red", "Orange", "Yellow", "Green", "Pink"):
            return "Sport"
        # Default casual lifestyle
        return "Casual"

    def analyze(self, frame_bgr: np.ndarray, face_bbox: tuple[int, int, int, int]) -> ClothingDetection | None:
        """Analyzes upper-body torso to return dominant clothing color and style."""
        torso = self._extract_torso(frame_bgr, face_bbox)
        if torso is None:
            return None

        # Downsample torso crop to 64x64 for instant k-means (< 0.5 ms)
        small_torso = cv2.resize(torso, (64, 64), interpolation=cv2.INTER_AREA)
        pixels = small_torso.reshape(-1, 3).astype(np.float32)

        k = 3
        criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 10, 1.0)
        _, labels, centers = cv2.kmeans(pixels, k, None, criteria, 3, cv2.KMEANS_PP_CENTERS)

        # Find the dominant cluster
        counts = Counter(labels.flatten())
        total_pixels = len(labels.flatten())
        top_cluster, top_count = counts.most_common(1)[0]
        dominant_weight = top_count / float(total_pixels)

        dom_b, dom_g, dom_r = [int(v) for v in centers[top_cluster]]
        color_name, s_val, _ = self._bgr_to_color_name(dom_b, dom_g, dom_r)
        style = self._determine_style(color_name, dominant_weight, s_val)

        return ClothingDetection(
            color_name=color_name,
            style=style,
            bgr_color=(dom_b, dom_g, dom_r),
            confidence=round(dominant_weight, 2),
        )
