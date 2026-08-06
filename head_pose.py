"""2.6 + 2.7 - Face landmarks (MediaPipe Face Mesh) + head pose (solvePnP).

Head pose is GEOMETRY, not ML: we know 2D image points (from MediaPipe) and the
matching 3D points on a reference face model, and solve back the head rotation via
Perspective-n-Point.

Report vocabulary: Face Mesh (468 pts), Perspective-n-Point, solvePnP, Rodrigues,
Euler angles, camera intrinsics.
"""

from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np


# 3D reference face model (mm), 6 stable points. Standard values shared across
# solvePnP head-pose implementations: nose tip, chin, eye corners, mouth corners.
MODEL_POINTS_3D = np.array([
    (0.0, 0.0, 0.0),          # nose tip
    (0.0, -330.0, -65.0),     # chin
    (-225.0, 170.0, -135.0),  # left eye outer corner
    (225.0, 170.0, -135.0),   # right eye outer corner
    (-150.0, -150.0, -125.0), # left mouth corner
    (150.0, -150.0, -125.0),  # right mouth corner
], dtype=np.float64)

# MediaPipe Face Mesh indices matching the 6 model points above.
LANDMARK_IDS = {"nose": 1, "chin": 199, "l_eye": 33, "r_eye": 263, "l_mouth": 61, "r_mouth": 291}


@dataclass
class HeadPose:
    yaw: float    # left-right
    pitch: float  # up-down
    roll: float   # tilt


def camera_matrix(frame_w: int, frame_h: int) -> np.ndarray:
    """Approximate intrinsics from image size (no calibration)."""
    f = float(frame_w)
    cx, cy = frame_w / 2.0, frame_h / 2.0
    return np.array([[f, 0, cx], [0, f, cy], [0, 0, 1]], dtype=np.float64)


def fold_euler(angle: float) -> float:
    """Fold an Euler angle reported near +-180 back towards 0.

    MODEL_POINTS_3D has +Y up while image coordinates grow downwards, so the
    rotation solvePnP recovers carries an extra 180 deg flip about X. A frontal
    face then decomposes to pitch/roll ~ +-180 instead of ~0, and a pure roll can
    push yaw to 180 as well — so all three angles go through this. Verified
    against synthetic projections of known rotations: frontal -> 0, pitch 15 -> 15.
    """
    if angle > 90:
        return angle - 180
    if angle < -90:
        return angle + 180
    return angle


class HeadPoseEstimator:
    def __init__(self):
        self._mesh = None

    def _ensure_mesh(self):
        if self._mesh is None:
            import mediapipe as mp
            # static_image_mode=True: we are fed an independent, already-detected
            # face crop per track each frame, not a continuous single-face video.
            # In tracking mode the one shared mesh would thrash between tracks.
            self._mesh = mp.solutions.face_mesh.FaceMesh(
                static_image_mode=True,
                max_num_faces=1,
                refine_landmarks=True,
                min_detection_confidence=0.5,
            )

    def landmarks(self, face_rgb: np.ndarray):
        """Return 468 normalised (x, y, z) landmarks, or None if no face."""
        self._ensure_mesh()
        results = self._mesh.process(face_rgb)
        if not results.multi_face_landmarks:
            return None
        return results.multi_face_landmarks[0].landmark

    def estimate(self, face_rgb: np.ndarray) -> HeadPose | None:
        """Landmarks -> solvePnP -> Rodrigues -> Euler angles (yaw, pitch, roll)."""
        lms = self.landmarks(face_rgb)
        if lms is None:
            return None

        h, w = face_rgb.shape[:2]
        if h == 0 or w == 0:
            return None

        # Pick 2D landmark coordinates matching 3D model points
        pts2d = []
        for key in ["nose", "chin", "l_eye", "r_eye", "l_mouth", "r_mouth"]:
            idx = LANDMARK_IDS[key]
            lm = lms[idx]
            pts2d.append((lm.x * w, lm.y * h))
        pts2d = np.array(pts2d, dtype=np.float64)

        K = camera_matrix(w, h)
        dist = np.zeros((4, 1), dtype=np.float64)

        ok, rvec, tvec = cv2.solvePnP(MODEL_POINTS_3D, pts2d, K, dist, flags=cv2.SOLVEPNP_ITERATIVE)
        if not ok:
            return None

        R, _ = cv2.Rodrigues(rvec)

        # Decompose rotation matrix R to Euler angles (yaw, pitch, roll)
        # Using standard RQDecomp3x3 decomposition
        proj_matrix = np.hstack((R, tvec))
        _, _, _, _, _, _, euler = cv2.decomposeProjectionMatrix(proj_matrix)

        pitch = fold_euler(float(euler[0, 0]))
        yaw = fold_euler(float(euler[1, 0]))
        roll = fold_euler(float(euler[2, 0]))

        return HeadPose(yaw=yaw, pitch=pitch, roll=roll)

