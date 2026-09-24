"""Read an uploaded advert and propose the audience tags a human would type.

Two independent readers, because no single one covers the range of adverts a
client sends:

    faces  - sample frames, detect faces, measure their age/gender/count with the
             same YOLOv8-face + MiVOLO pair that measures the real audience. Only
             speaks when people are on screen, and then it is measuring rather
             than guessing.
    vlm    - ask a hosted vision model what the advert is selling and who it is
             aimed at. Speaks for product shots, brand films and catalogues where
             nobody appears, at the cost of being a marketing judgement call.

Faces win wherever both speak: "these are the people in the film" is evidence,
"this looks like a lipstick advert so probably women" is inference.

Nothing here writes to the database. The result is a SUGGESTION - the operator
still confirms it in /ads - so an empty answer is always preferable to a
confident wrong one, and every field is allowed to come back None.

Runs off the request thread's own short-lived models, never the capture engine's
Pipeline: that one belongs to the capture thread alone (see server/engine.py).
"""

from __future__ import annotations

import base64
import json
import os
import statistics
from dataclasses import dataclass, field

import cv2
import numpy as np

from crop import crop_face
from server import audience

# The vocabulary the /ads form offers. Deliberately not taken from CFG.age_bins:
# some of those labels ("0-6", "55+") are spelt differently from the ones the
# form stores ("<6", ">55"), and a suggestion the form cannot represent is worse
# than no suggestion.
# The vocabulary lives in server.audience so the model's labels, the advert's
# target and the dropdown cannot drift apart again.
AGE_GROUPS = audience.AGE_GROUPS
GENDERS = ("M", "F", "all")
CROWDS = ("single", "group", "crowd", "all")
CATEGORIES = (
    "Chung",
    "Thời trang & Làm đẹp",
    "Thời trang Nam",
    "Thanh niên & Xu hướng",
    "Công nghệ & Gaming",
    "Thực phẩm & Đồ uống",
    "Gia đình & Đồ gia dụng",
    "Sức khỏe & Dưỡng sinh",
    "Đồ chơi & Trẻ em",
)

MAX_FRAMES = 12
VLM_FRAMES = 3
VLM_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-3-5-sonnet-20241022")


age_to_group = audience.age_to_group


def count_to_crowd(count: float) -> str:
    if count <= 1:
        return "single"
    if count <= 4:
        return "group"
    return "crowd"


@dataclass
class CreativeProfile:
    """A proposal for the /ads form. Every field may be None: unknown is a valid
    answer and the caller renders it as 'leave what the operator chose'."""
    target_age_group: str | None = None
    target_gender: str | None = None
    target_crowd: str | None = None
    category: str | None = None
    source: str = "none"          # faces | vlm | faces+vlm | none
    faces_found: int = 0
    frames_read: int = 0
    notes: list[str] = field(default_factory=list)


def sample_frames(path: str, limit: int = MAX_FRAMES) -> list[np.ndarray]:
    """Frames spread evenly across the file, or the single frame of an image."""
    cap = cv2.VideoCapture(path)
    try:
        if not cap.isOpened():
            return []
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        if total <= 1:
            ok, frame = cap.read()
            return [frame] if ok and frame is not None else []

        step = max(1, total // limit)
        frames: list[np.ndarray] = []
        for idx in range(0, total, step):
            if len(frames) >= limit:
                break
            cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
            ok, frame = cap.read()
            if ok and frame is not None:
                frames.append(frame)
        return frames
    finally:
        cap.release()


def _read_faces(frames: list[np.ndarray], profile: CreativeProfile) -> None:
    """Measure the people appearing in the advert; fills profile in place."""
    from age_gender import AgeGenderEstimator
    from detector import FaceDetector

    detector = FaceDetector()
    estimator = AgeGenderEstimator()

    per_frame_counts: list[int] = []
    ages: list[float] = []
    genders: list[str] = []

    for frame in frames:
        detections = detector.detect(frame)
        per_frame_counts.append(len(detections))
        for i, det in enumerate(detections):
            face = crop_face(frame, det.bbox)
            if face.size == 0:
                continue
            # track_id only tags MiVOLO's internal cache; frames sampled minutes
            # apart share no identity, so a per-face index keeps them separate.
            result = estimator.estimate(face, track_id=i)
            if result is None:
                continue
            ages.append(result.age)
            genders.append(result.gender)

    profile.faces_found = len(ages)
    populated = [c for c in per_frame_counts if c > 0]
    if not populated:
        profile.notes.append("Không thấy khuôn mặt nào trong video.")
        return

    # Median over the frames that have people: one wide crowd shot in an
    # otherwise intimate advert should not decide the whole tag.
    profile.target_crowd = count_to_crowd(statistics.median(populated))
    profile.notes.append(
        f"Đo được {len(ages)} khuôn mặt, trung vị {statistics.median(populated):.0f} người/khung."
    )

    if ages:
        median_age = statistics.median(ages)
        profile.target_age_group = age_to_group(median_age)
        profile.notes.append(f"Tuổi trung vị của người trong video: ~{median_age:.0f}.")

    if genders:
        males = genders.count("M")
        share = males / len(genders)
        # A mixed cast is a real answer, not a tie to be broken: forcing M or F
        # onto a 50/50 advert would push the scorer to penalise half the audience.
        if share >= 0.65:
            profile.target_gender = "M"
        elif share <= 0.35:
            profile.target_gender = "F"
        else:
            profile.target_gender = "all"
        profile.notes.append(f"Tỷ lệ nam/nữ trong video: {males}/{len(genders) - males}.")


VLM_PROMPT = """Đây là các khung hình trích từ một video quảng cáo digital signage.

Hãy phân tích quảng cáo này nhắm đến đối tượng nào, rồi trả lời DUY NHẤT bằng một object JSON, không kèm giải thích nào khác:

{
  "category": một trong %(categories)s,
  "target_age_group": một trong %(age_groups)s,
  "target_gender": một trong ["M", "F", "all"],
  "target_crowd": một trong ["single", "group", "crowd", "all"],
  "product": mô tả ngắn sản phẩm/dịch vụ nhìn thấy, tối đa 10 từ,
  "confident": true nếu bạn thực sự nhận ra sản phẩm, false nếu chỉ đoán mò
}

Quy tắc:
- "target_crowd" nói về bối cảnh xem phù hợp: "single" cho sản phẩm cá nhân, "group" cho gia đình/nhóm, "crowd" cho thương hiệu đại chúng, "all" nếu không rõ.
- Nếu không đủ căn cứ cho một trường nào, hãy trả "all" cho trường đó thay vì đoán bừa.
"""


def _read_vlm(frames: list[np.ndarray], profile: CreativeProfile) -> dict | None:
    """Ask a hosted vision model who the advert is for.

    Silent and harmless without ANTHROPIC_API_KEY: this is the branch that costs
    money and leaves the machine, so it stays opt-in rather than degrading into
    a guess.
    """
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        profile.notes.append("Chưa cấu hình ANTHROPIC_API_KEY — bỏ qua phân tích nội dung.")
        return None
    if not frames:
        return None

    import httpx

    picks = frames[:: max(1, len(frames) // VLM_FRAMES)][:VLM_FRAMES]
    content: list[dict] = []
    for frame in picks:
        scale = 768 / max(frame.shape[:2])
        if scale < 1.0:
            frame = cv2.resize(frame, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
        ok, buf = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
        if not ok:
            continue
        content.append({
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": "image/jpeg",
                "data": base64.b64encode(buf.tobytes()).decode("ascii"),
            },
        })
    if not content:
        return None

    # The age list is interpolated rather than written out so it cannot drift
    # from AGE_GROUPS the way the /ads dropdown once did — a bracket the form
    # cannot store is worse than no suggestion.
    content.append({"type": "text", "text": VLM_PROMPT % {
        "categories": json.dumps(list(CATEGORIES), ensure_ascii=False),
        "age_groups": json.dumps(list(AGE_GROUPS) + [audience.ANY], ensure_ascii=False),
    }})

    try:
        response = httpx.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": VLM_MODEL,
                "max_tokens": 512,
                "messages": [{"role": "user", "content": content}],
            },
            timeout=60.0,
        )
        response.raise_for_status()
        text = "".join(
            block.get("text", "")
            for block in response.json().get("content", [])
            if block.get("type") == "text"
        )
        start, end = text.find("{"), text.rfind("}")
        if start < 0 or end <= start:
            profile.notes.append("VLM trả về nội dung không đọc được.")
            return None
        return json.loads(text[start : end + 1])
    except Exception as exc:
        # A failed suggestion must not fail the upload it was called about.
        profile.notes.append(f"Gọi VLM thất bại: {exc}")
        return None


def _pick(value, allowed: tuple[str, ...]) -> str | None:
    """Keep a model's answer only when it lands inside the form's vocabulary."""
    return value if isinstance(value, str) and value in allowed else None


def profile_creative(path: str) -> CreativeProfile:
    """Propose audience tags for the advert at `path`."""
    profile = CreativeProfile()
    frames = sample_frames(path)
    profile.frames_read = len(frames)
    if not frames:
        profile.notes.append("Không đọc được khung hình nào từ tệp.")
        return profile

    _read_faces(frames, profile)
    used_faces = profile.faces_found > 0

    vlm = _read_vlm(frames, profile)
    used_vlm = False
    if vlm:
        used_vlm = True
        product = vlm.get("product")
        if product:
            confident = "" if vlm.get("confident") else " (VLM không chắc chắn)"
            profile.notes.append(f"VLM nhận ra: {product}{confident}.")

        profile.category = _pick(vlm.get("category"), CATEGORIES) or profile.category
        # Faces measured the people; the VLM only inferred them. It fills the
        # gaps rather than overriding, and "all" from the VLM means "I could not
        # tell", which must not overwrite a real measurement either.
        for key, allowed in (
            ("target_age_group", AGE_GROUPS + ("all",)),
            ("target_gender", GENDERS),
            ("target_crowd", CROWDS),
        ):
            if getattr(profile, key) is None:
                setattr(profile, key, _pick(vlm.get(key), allowed))

    profile.source = (
        "faces+vlm" if used_faces and used_vlm
        else "faces" if used_faces
        else "vlm" if used_vlm
        else "none"
    )
    return profile
