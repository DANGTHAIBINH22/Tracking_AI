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
    # See age_gender.py's module docstring for why MiVOLO replaced the original
    # GoogLeNet/Adience ONNX pair (age_onnx.onnx / gender_onnx.onnx, both still
    # on disk but unused: measured resolution-unstable, up to a 44-year swing on
    # the same face).
    #
    # mivolo_ckpt is MiVOLO v2, trained on Lagenda (min_age 0, max_age 122) —
    # get it with `uv run python fetch_mivolo_v2.py`. It replaced the v1
    # IMDB-cleaned checkpoint because IMDB-WIKI is celebrity photos and contains
    # almost nobody under 15, so v1 read children at roughly twice their age
    # (infants as 5-8, primary-schoolers as 10-12). Measured on eval/age_kids,
    # children only: MAE 5.83y (v1) -> 2.05y (v2), with adults unchanged.
    # In the terms the app actually reports — which age_bins bracket a viewer
    # lands in — that is 70% -> 91% over the 33 scored clips. Re-measure with
    # `PYTHONPATH=. uv run python eval/age_kids/run_eval.py --ckpt <path>`.
    # The old checkpoints still load — point this at one to reproduce:
    #   model_imdb_cross_person_4.22_99.46.pth.tar  v1, dual-stream face+body
    #   volo_d1_age_gender_imdb_faceonly.pth.tar    v1, face-only (3 channels)
    # The two UTKFace checkpoints in MiVOLO's README are NOT alternatives: both
    # are min_age 21 / max_age 60, the paper's adult-only UTK split.
    #
    # Precedence: AgeGenderEstimator tries mivolo_weights (ONNX) first and only
    # falls back to mivolo_ckpt. The ONNX in README.md was exported from the v1
    # checkpoint, so generating it would silently put the child bias back —
    # re-export from v2 or leave the file absent.
    mivolo_weights: Path = MODELS_DIR / "mivolo_age_gender.onnx"
    mivolo_ckpt: Path = MODELS_DIR / "mivolo_v2_lagenda.pth.tar"
    age_enabled: bool = True
    age_gender_every_n: int = 5  # re-estimate every N frames while collecting votes
    age_gender_samples: int = 3  # votes to collect per track before the answer settles
    # MiVOLO stayed within ~2-6 years of truth from 16px to 295px in testing (vs.
    # the old net's 44-year swing), so this floor only screens out degenerate
    # slivers of a crop, not "small but usable" faces.
    min_face_px_for_age: int = 24
    # Exclusive upper bound -> label. The under-18 range is split three ways
    # because a signage advert for nappies, for toys and for a game console are
    # aimed at three different people, and one "0-18" bucket reported them as
    # one. Splitting only became worth doing once the age head could tell them
    # apart: the v1 checkpoint read every child as 10-12 regardless.
    # The 0-6 boundary is the shakiest — v2's residual error on children is
    # ~2 years, so a 5-to-7-year-old will flip between the first two buckets.
    # server/audience.py maps these onto the app's own spellings by the numeric
    # bound, so renaming a label here is safe but moving a bound is not.
    age_bins: tuple[tuple[int, str], ...] = (
        (6, "0-6"),
        (13, "6-13"),
        (18, "13-18"),
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
