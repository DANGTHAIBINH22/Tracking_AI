"""2.5 - Age & gender estimation (MiVOLO). Phase 4.

Pretrained face-only volo_d1 (IMDB-cleaned, MiVOLO paper: arXiv:2307.04616,
github.com/WildChlamydia/MiVOLO, Apache-2.0), exported to ONNX so this project
only needs onnxruntime, not torch/timm at runtime. Reported: age MAE 4.22,
gender accuracy 99.38%.

The exported graph does the post-processing itself: a 224x224 letterboxed RGB
crop in, [age_years, p_male, p_female] out — no raw logits or bucket midpoints
to unscale here, unlike the GoogLeNet/Adience pair this replaced.

Why the swap: the previous age_onnx.onnx (GoogLeNet, ONNX model zoo, Adience
buckets) was measured broken — it tracks crop sharpness, not age. The same face
read (8-12) at 48px, (25-32) at 148px, and (60-100) at 446px, a 44-year swing,
and no preprocessing variant (RGB/BGR, mean choice) fixed it without breaking
gender. MiVOLO on the same crops stayed within ~2-6 years across every
resolution tested (16px-295px). See CFG.min_face_px_for_age / age_enabled in
configs.py for how the pipeline guards against crops too small to trust.

Honest limitation for the report: MAE 4.22 is in-domain (IMDB-cleaned); expect
cross-domain MAE 5-8y on your own footage, and group boundaries will still flip
near a bucket edge. Evaluate with age-group accuracy + a confusion matrix.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from configs import CFG


@dataclass
class AgeGender:
    age: float
    age_group: str
    gender: str          # "M" | "F"
    gender_conf: float


def map_age_group(age: float) -> str:
    """Continuous age -> discrete bucket per CFG.age_bins."""
    for upper, label in CFG.age_bins:
        if age < upper:
            return label
    return CFG.age_bins[-1][1]


GENDER_LIST = ["M", "F"]

INPUT_SIZE = 224
# ImageNet normalisation (MiVOLO backbone is ImageNet-pretrained VOLO), applied to
# an RGB [0,1] image - NOT the Caffe BGR mean the old GoogLeNet pair used.
IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
IMAGENET_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)


def _letterbox(img: np.ndarray, size: int = INPUT_SIZE) -> np.ndarray:
    """Resize keeping aspect ratio and pad to a square with black borders.

    Matches mivolo.data.misc.class_letterbox exactly (same rounding), since the
    ONNX weights were calibrated against crops preprocessed that way — a plain
    stretch-to-square resize would shift the input distribution the model saw
    in training.
    """
    import cv2

    h, w = img.shape[:2]
    r = min(size / h, size / w)
    nw, nh = int(round(w * r)), int(round(h * r))
    resized = cv2.resize(img, (nw, nh), interpolation=cv2.INTER_LINEAR)
    dw, dh = (size - nw) / 2, (size - nh) / 2
    top, bottom = int(round(dh - 0.1)), int(round(dh + 0.1))
    left, right = int(round(dw - 0.1)), int(round(dw + 0.1))
    return cv2.copyMakeBorder(resized, top, bottom, left, right, cv2.BORDER_CONSTANT, value=(0, 0, 0))


class AgeGenderEstimator:
    def __init__(self, weights=CFG.mivolo_weights):
        self.weights = weights
        self._sess = None
        self._input_name = None

    def _ensure_model(self):
        if self._sess is not None:
            return
        import onnxruntime as ort

        opts = ort.SessionOptions()
        opts.log_severity_level = 3
        # ~100MB VOLO backbone but still runs per-track at most every
        # CFG.age_gender_every_n frames, so CPU is plenty; ORT has no MPS
        # provider to steer CFG.device at.
        self._sess = ort.InferenceSession(str(self.weights), opts, providers=["CPUExecutionProvider"])
        self._input_name = self._sess.get_inputs()[0].name

    def estimate(self, face_bgr: np.ndarray) -> AgeGender | None:
        """Estimate age/gender from a cropped face image."""
        if face_bgr is None or face_bgr.size == 0:
            return None

        h, w = face_bgr.shape[:2]
        if h == 0 or w == 0:
            return None

        self._ensure_model()
        import cv2

        letterboxed = _letterbox(face_bgr, INPUT_SIZE)
        rgb = cv2.cvtColor(letterboxed, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
        normed = (rgb - IMAGENET_MEAN) / IMAGENET_STD
        blob = np.transpose(normed, (2, 0, 1))[np.newaxis, ...].astype(np.float32)

        age, p_male, p_female = self._sess.run(None, {self._input_name: blob})[0][0]
        age = float(age)
        gender_idx = 0 if p_male >= p_female else 1
        gender = GENDER_LIST[gender_idx]
        gender_conf = float(p_male if gender_idx == 0 else p_female)

        return AgeGender(age=age, age_group=map_age_group(age), gender=gender, gender_conf=gender_conf)
