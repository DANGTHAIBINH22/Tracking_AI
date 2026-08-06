"""Debug overlay: the fastest way to spot mistakes is to look at them.

Draw bbox + track_id, age/gender, a head-pose arrow, and colour the box by
attention (green = looking, grey = not).
"""

from __future__ import annotations

import cv2
import numpy as np

GREEN = (0, 200, 0)
GREY = (150, 150, 150)


def draw_head_pose_arrow(frame_bgr: np.ndarray, bbox: tuple[int, int, int, int], yaw: float, pitch: float, length: int = 50) -> None:
    """Draw a 2D projected arrow from face center indicating 3D gaze/head direction."""
    x1, y1, x2, y2 = bbox
    cx, cy = (x1 + x2) // 2, (y1 + y2) // 2

    # Project 3D angles (yaw, pitch) onto 2D image coordinates
    yaw_rad = np.radians(yaw)
    pitch_rad = np.radians(pitch)

    dx = int(length * np.sin(yaw_rad))
    dy = int(-length * np.sin(pitch_rad))

    end_point = (cx + dx, cy + dy)
    cv2.arrowedLine(frame_bgr, (cx, cy), end_point, (0, 255, 255), 2, tipLength=0.3)


def draw_person(frame_bgr: np.ndarray, meta) -> None:
    """Draw one PersonMeta onto the frame in place."""
    x1, y1, x2, y2 = meta.bbox
    colour = GREEN if meta.attention else GREY
    cv2.rectangle(frame_bgr, (x1, y1), (x2, y2), colour, 2)

    label_parts = [f"#{meta.track_id}"]
    if meta.age_group:
        label_parts.append(f"Age:{meta.age_group}")
    if meta.gender:
        label_parts.append(f"G:{meta.gender}")
    if meta.yaw is not None and meta.pitch is not None:
        label_parts.append(f"Y:{meta.yaw:.0f} P:{meta.pitch:.0f}")
    if meta.dwell_time:
        label_parts.append(f"{meta.dwell_time:.1f}s")

    label = " | ".join(label_parts)
    cv2.putText(frame_bgr, label, (x1, max(0, y1 - 8)),
                cv2.FONT_HERSHEY_SIMPLEX, 0.45, colour, 1, cv2.LINE_AA)

    if meta.yaw is not None and meta.pitch is not None:
        draw_head_pose_arrow(frame_bgr, meta.bbox, meta.yaw, meta.pitch)




def draw_detection(frame_bgr: np.ndarray, detection) -> None:
    """Draw a raw FaceDetector detection onto the frame."""
    x1, y1, x2, y2 = detection.bbox
    cv2.rectangle(frame_bgr, (x1, y1), (x2, y2), GREEN, 2)
    label = f"Face {detection.confidence:.2f}"
    cv2.putText(frame_bgr, label, (x1, max(0, y1 - 8)),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, GREEN, 1, cv2.LINE_AA)


def draw_fps(frame_bgr: np.ndarray, fps: float) -> None:
    cv2.putText(frame_bgr, f"{fps:.1f} FPS", (10, 24),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2, cv2.LINE_AA)
