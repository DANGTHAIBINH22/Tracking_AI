"""2.5 - Age & gender estimation (MiVOLO). Phase 4.

Pretrained MiVOLO (paper: arXiv:2307.04616, github.com/WildChlamydia/MiVOLO,
Apache-2.0). Two loaders, tried in that order: an ONNX export if one is on disk,
otherwise the .pth.tar checkpoint through the vendored `mivolo/` package.

The checkpoint is chosen in configs.py, and which one it is matters more than
anything in this file. The default is MiVOLO v2 (Lagenda, ages 0-122). It
replaced the v1 IMDB-cleaned checkpoint because IMDB-WIKI is celebrity photos
with almost no subject under 15: v1 read infants as 5-8 and primary-school
children as 10-12, i.e. children came out at roughly double their age while
adults were fine. On eval/age_kids, children only, that is MAE 5.83y -> 2.05y.
Neither the face-only/face+body choice nor CFG.face_margin moved it measurably;
it was the training distribution, not the plumbing.

A checkpoint declares its own shape and this module follows it, rather than
assuming one variant:
  - `meta.with_persons_model` — dual-stream (face+body, 6 channels) vs face-only
    (3). This pipeline never has a body crop, so a dual-stream model gets a
    normalised zero image for the body half, which is what MiVOLO's body dropout
    trained against. Hardcoding the 6-channel concat made every face-only
    checkpoint fail with "expected input[1, 6, ...] to have 3 channels".
  - `meta.only_age` — a `no_gender` checkpoint emits one column, not three.
    `AgeGender.gender` is then None, and the pipeline's vote degrades to
    "gender unknown" rather than reading an age value as a gender logit.

The ONNX path (no such file is shipped; see CFG.mivolo_weights) expects a graph
that does its own post-processing: an INPUT_SIZE letterboxed RGB crop in,
[age_years, p_male, p_female] out — no raw logits or bucket midpoints to unscale
here, unlike the GoogLeNet/Adience pair this replaced. The .pth.tar path does
unscale, with the checkpoint's own min/max/avg_age.

Why the swap: the previous age_onnx.onnx (GoogLeNet, ONNX model zoo, Adience
buckets) was measured broken — it tracks crop sharpness, not age. The same face
read (8-12) at 48px, (25-32) at 148px, and (60-100) at 446px, a 44-year swing,
and no preprocessing variant (RGB/BGR, mean choice) fixed it without breaking
gender. MiVOLO on the same crops stayed within ~2-6 years across every
resolution tested (16px-295px). See CFG.min_face_px_for_age / age_enabled in
configs.py for how the pipeline guards against crops too small to trust.

Honest limitations for the report, with v2 in place:
  - The 2.05y figure is measured against age bands read off the footage by eye,
    not birth dates — stock clips carry none. It is good enough to show the v1
    bias is gone; it is not a publishable MAE. See eval/age_kids/README.md.
  - Far-field is still unreliable. At 35-45px a 7-10 year old reads ~26 and a
    family at distance reads ~29. CFG.min_face_px_for_age (24) is well below
    where the age head is actually trustworthy; treat anything under ~60px as
    footfall, not demographics.
  - Group boundaries still flip near a bucket edge, so evaluate with age-group
    accuracy plus a confusion matrix, not a single scalar.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from configs import CFG


@dataclass
class AgeGender:
    # Whole years. The model regresses a continuous value, but its residual
    # error on this footage is ~2 years, so a tenth of a year is noise dressed
    # as precision — "7.4 tuổi" reads like a measurement and is not one.
    # Rounding here rather than at each display keeps every consumer (CSV, live
    # table, recommendation banner, the shop-window screen) saying the same
    # number.
    age: int
    age_group: str
    gender: str | None   # "M" | "F", or None for a no_gender ("only_age") checkpoint
    gender_conf: float


def map_age_group(age: float) -> str:
    """Continuous age -> discrete bucket per CFG.age_bins."""
    for upper, label in CFG.age_bins:
        if age < upper:
            return label
    return CFG.age_bins[-1][1]


GENDER_LIST = ["M", "F"]

INPUT_SIZE = 384
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
    def __init__(self, weights=CFG.mivolo_weights, ckpt=getattr(CFG, "mivolo_ckpt", None)):
        self.weights = weights
        self.ckpt = ckpt
        self._sess = None
        self._torch_model = None
        self._input_name = None
        self._input_size = INPUT_SIZE
        self._model_failed = False
        self._mode = None  # "onnx" or "torch"

    def _ensure_model(self):
        if self._sess is not None or self._torch_model is not None or self._model_failed:
            return
        from pathlib import Path
        # A falsy path means "no ONNX for this instance" and must short-circuit
        # before Path(): Path("") is Path("."), the current directory, which
        # exists — so an empty string used to reach onnxruntime and fail there
        # with a confusing constructor error instead of falling through.
        weights_path = Path(self.weights) if self.weights else None
        ckpt_path = Path(self.ckpt) if self.ckpt else None

        # 1. Check ONNX weights
        if weights_path is not None and weights_path.exists():
            try:
                import onnxruntime as ort
                opts = ort.SessionOptions()
                opts.log_severity_level = 3
                self._sess = ort.InferenceSession(str(self.weights), opts, providers=["CPUExecutionProvider"])
                inp = self._sess.get_inputs()[0]
                self._input_name = inp.name
                side = inp.shape[-1] if isinstance(inp.shape[-1], int) else None
                self._input_size = side or INPUT_SIZE
                self._mode = "onnx"
                print(f"[AgeGender] Đã nạp thành công mô hình MiVOLO ONNX từ: {self.weights}")
                return
            except Exception as e:
                print(f"[AgeGender] CẢNH BÁO: Lỗi khởi tạo mô hình MiVOLO ONNX ({e}). Thử nạp PyTorch checkpoint...")

        # 2. Check PyTorch checkpoint (.pth.tar)
        if ckpt_path and ckpt_path.exists():
            try:
                import torch
                from mivolo.model.mi_volo import MiVOLO
                dev = CFG.device if hasattr(CFG, "device") else ("mps" if torch.backends.mps.is_available() else "cpu")
                self._torch_model = MiVOLO(str(ckpt_path), device=dev, half=(dev != "cpu"))
                self._mode = "torch"
                self._input_size = self._torch_model.input_size
                print(f"[AgeGender] Đã nạp thành công mô hình MiVOLO PyTorch SOTA từ: {ckpt_path} (Device: {dev})")
                return
            except Exception as e:
                print(f"[AgeGender] CẢNH BÁO: Lỗi khởi tạo MiVOLO PyTorch ({e}).")

        print(f"[AgeGender] CẢNH BÁO: Không tìm thấy weights MiVOLO ({self.weights} hoặc {self.ckpt}). Bỏ qua ước lượng tuổi/giới tính.")
        self._model_failed = True

    def estimate(self, face_bgr: np.ndarray, track_id: int = 0) -> AgeGender | None:
        """Estimate age/gender from a cropped face image."""
        if face_bgr is None or face_bgr.size == 0:
            return None

        h, w = face_bgr.shape[:2]
        if h == 0 or w == 0:
            return None

        self._ensure_model()
        if self._mode is None:
            if not CFG.allow_mock_attributes:
                return None
            import random
            rng = random.Random(track_id)
            age = rng.randint(18, 60)
            return AgeGender(
                age=age,
                age_group=map_age_group(age),
                gender=rng.choice(["M", "F"]),
                gender_conf=0.85 + (track_id % 15) / 100.0,
            )

        if self._mode == "torch" and self._torch_model is not None:
            try:
                import torch
                from mivolo.data.misc import prepare_classification_images
                meta = self._torch_model.meta
                dev = self._torch_model.device
                cfgd = self._torch_model.data_config
                face_input = prepare_classification_images(
                    [face_bgr], self._input_size, cfgd["mean"], cfgd["std"], device=dev
                )
                if meta.with_persons_model:
                    # Dual-stream checkpoint: the graph's first conv takes 6 channels, so
                    # the body half has to be there even though this pipeline never has a
                    # body crop. prepare_classification_images turns None into a normalised
                    # zero image, which is what MiVOLO's own body dropout trained against.
                    body_input = prepare_classification_images(
                        [None], self._input_size, cfgd["mean"], cfgd["std"], device=dev
                    )
                    model_input = torch.cat((face_input, body_input), dim=1)
                else:
                    # Face-only checkpoint: 3 channels. Concatenating a blank body here
                    # raises "expected input[1, 6, ...] to have 3 channels".
                    model_input = face_input
                out = self._torch_model.inference(model_input)

                if meta.only_age:
                    # no_gender checkpoint: one output column, no gender logits to read.
                    gender, gender_conf = None, 0.0
                    age_raw = out[0, 0].item()
                else:
                    gender_probs = out[:, :2].softmax(-1)
                    gender_idx = 0 if gender_probs[0, 0] >= gender_probs[0, 1] else 1
                    gender = GENDER_LIST[gender_idx]
                    gender_conf = float(gender_probs[0, gender_idx].item())
                    age_raw = out[0, 2].item()

                # max(0, ...) because a Lagenda checkpoint has min_age 0 and the
                # regression can undershoot past it on an infant — a negative
                # age is never an answer worth reporting.
                age = max(0, round(age_raw * (meta.max_age - meta.min_age) + meta.avg_age))
                return AgeGender(age=age, age_group=map_age_group(age), gender=gender, gender_conf=gender_conf)
            except Exception as e:
                print(f"[AgeGender] CẢNH BÁO: Lỗi suy luận MiVOLO PyTorch ({e}).")
                return None

        # ONNX mode
        import cv2

        letterboxed = _letterbox(face_bgr, self._input_size)
        rgb = cv2.cvtColor(letterboxed, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
        normed = (rgb - IMAGENET_MEAN) / IMAGENET_STD
        blob = np.transpose(normed, (2, 0, 1))[np.newaxis, ...].astype(np.float32)

        try:
            age, p_male, p_female = self._sess.run(None, {self._input_name: blob})[0][0]
        except Exception as e:
            print(f"[AgeGender] CẢNH BÁO: Lỗi suy luận MiVOLO ONNX ({e}).")
            self._sess = None
            self._model_failed = True
            return None
        age = max(0, round(float(age)))
        gender_idx = 0 if p_male >= p_female else 1
        gender = GENDER_LIST[gender_idx]
        gender_conf = float(p_male if gender_idx == 0 else p_female)

        return AgeGender(age=age, age_group=map_age_group(age), gender=gender, gender_conf=gender_conf)
