"""Central configuration: thresholds, model paths, camera source, compute device.

Everything tunable lives here so experiments (mucs 6/7 in the plan) only touch one
file. Import `CFG` elsewhere: `from configs import CFG`.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent
MODELS_DIR = ROOT / "models"  # weights (git-ignored)
DATA_DIR = ROOT / "data"  # test videos/images (git-ignored)
OUTPUTS_DIR = ROOT / "outputs"  # CSV / rendered videos (git-ignored)


def pick_device() -> str:
    """Return the best available torch device string: 'mps' on Apple Silicon, else 'cpu'.

    MediaPipe runs on its own CPU/GPU backend regardless of this value; this only
    steers the YOLO/torch models (detector, MiVOLO).
    """
    import os

    forced = os.environ.get("CV_DEVICE")
    if forced:
        return forced
    try:
        import torch

        if torch.backends.mps.is_available():
            return "mps"
    except Exception:
        pass
    return "cpu"


@dataclass
class Config:
    # ---- input source ----
    camera_index: int = 0  # webcam id for run_webcam.py
    process_long_side: int = 640  # 2.1 resize target for the long edge

    # ---- 2.1 preprocessing ----
    use_clahe: bool = False  # toggle for the CLAHE experiment (mucs 6)
    clahe_clip_limit: float = 2.0
    clahe_tile_grid: tuple[int, int] = (8, 8)

    # ---- 2.2 detection (YOLOv8-face via ultralytics) ----
    face_weights: Path = MODELS_DIR / "yolov8n-face.pt"
    conf_threshold: float = 0.5
    iou_threshold: float = 0.5  # NMS

    # ---- 2.3 tracking (ByteTrack, ultralytics built-in) ----
    tracker_cfg: str = "bytetrack.yaml"
    detect_every_n: int = 1  # >1 = run detection every N frames (mucs 4 FPS opt)
    track_expiry_seconds: float = 5.0  # drop a vanished track's cached state after this

    # ---- 2.4 crop & align ----
    face_margin: float = 0.30  # expand bbox 30% each side for MiVOLO
    min_face_px_for_pose: int = 16  # MediaPipe's ImageToTensor hard-fails below this

    # ---- 2.5 age/gender (MiVOLO, Phase 4) ----
    # Face-only volo_d1 (IMDB-cleaned), exported to ONNX from the official
    # checkpoint — see age_gender.py's module docstring for why this replaced
    # the original GoogLeNet/Adience ONNX pair (age_onnx.onnx / gender_onnx.onnx,
    # both still on disk but unused: measured resolution-unstable, up to a
    # 44-year swing on the same face).
    mivolo_weights: Path = MODELS_DIR / "mivolo_age_gender.onnx"
    mivolo_ckpt: Path = MODELS_DIR / "model_imdb_cross_person_4.22_99.46.pth.tar"
    age_enabled: bool = True
    age_gender_every_n: int = 5  # re-estimate every N frames while collecting votes
    age_gender_samples: int = 3  # votes to collect per track before the answer settles
    # MiVOLO stayed within ~2-6 years of truth from 16px to 295px in testing (vs.
    # the old net's 44-year swing), so this floor only screens out degenerate
    # slivers of a crop, not "small but usable" faces.
    min_face_px_for_age: int = 24
    age_bins: tuple[tuple[int, str], ...] = (
        (18, "0-18"),
        (35, "18-35"),
        (55, "35-55"),
        (200, "55+"),
    )

    # ---- 2.8 attention rule (calibrate in Phase 3) ----
    yaw_threshold_deg: float = 22.0
    pitch_threshold_deg: float = 17.0
    attention_smooth_frames: int = 3  # temporal smoothing window

    # ---- 3 periodic VLM branch (Phase 6, optional) ----
    vlm_enabled: bool = field(
        default_factory=lambda: os.environ.get("ENABLE_VLM", "true").strip().lower() in ("true", "1", "yes")
    )
    vlm_period_seconds: float = 30.0
    verbose: bool = False  # Toggle pipeline stage logging

    # ---- 2.9 pet tracking (Phase 7: Pet & Animal Association) ----
    pet_enabled: bool = True
    pet_weights: Path = MODELS_DIR / "yolov8n.pt"
    pet_conf_threshold: float = 0.35
    pet_detect_every_n: int = 3       # run pet detector every 3 frames to preserve 30 FPS
    pet_proximity_px: float = 350.0   # max distance (pixels) between person and pet center
    pet_classes: tuple[int, ...] = (15, 16)  # COCO: 15=cat, 16=dog

    # ---- 2.10 clothing & style tracking (Phase 8: Lightweight Apparel) ----
    clothing_enabled: bool = True
    clothing_min_samples: int = 2     # stable frames before triggering 1-shot color extraction


    # ---- honesty switches ----
    # When a model's weights are missing, stages report None rather than inventing a
    # value. Flip this on ONLY for UI smoke tests: it makes age/gender and the scene
    # context synthetic, and nothing downstream can tell synthetic from measured.
    allow_mock_attributes: bool = False

    # ---- compute ----
    device: str = field(default_factory=pick_device)


CFG = Config()
