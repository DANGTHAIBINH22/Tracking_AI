"""Main pipeline: glue every stage into `process(frame) -> list[PersonMeta]`.

This is the single seam the app layer will call later (NestJS / on-device). The app
never needs to know what's inside.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, asdict

import numpy as np

from concurrent.futures import ThreadPoolExecutor
from configs import CFG
from preprocess import preprocess, to_rgb
from crop import crop_face
from tracker import FaceTracker
from head_pose import HeadPoseEstimator, HeadPose
from age_gender import AgeGender, AgeGenderEstimator, map_age_group
from attention import DwellTracker, is_attentive
from scene_vlm import SceneVLM, SceneContext
from pet_tracker import PetTracker, PetDetection
from clothing_tracker import ClothingTracker, ClothingDetection


@dataclass
class PersonMeta:
    track_id: int
    bbox: tuple[int, int, int, int]
    age: float | None = None
    age_group: str | None = None
    gender: str | None = None
    yaw: float | None = None
    pitch: float | None = None
    roll: float | None = None
    attention: int = 0
    dwell_time: float = 0.0
    has_pet: bool = False
    pet_type: str | None = None       # "dog" | "cat"
    pet_box: tuple[int, int, int, int] | None = None
    clothing_color: str | None = None # e.g. "Black", "White", "Blue", "Red"
    clothing_style: str | None = None # "Formal" | "Sport" | "Casual"

    def as_row(self) -> dict:
        return asdict(self)


@dataclass
class TrackingFrameResult:
    """Consolidated result for a single processed frame (Single Source of Truth)."""
    metas: list[PersonMeta]
    pets: list[PetDetection]
    context: SceneContext
    processed_frame: np.ndarray | None = None


class Pipeline:
    """Assembles the real-time branch. Stages are enabled as phases land."""

    def __init__(self, cfg=CFG):
        self.cfg = cfg
        self.tracker = FaceTracker()                 # Phase 2
        self.head_pose = HeadPoseEstimator()         # Phase 3
        self.age_gender = AgeGenderEstimator()       # Phase 4
        self.dwell = DwellTracker()                  # Phase 5
        self.vlm = SceneVLM() if cfg.vlm_enabled else None  # Phase 6
        self.pet_tracker = PetTracker(cfg) if getattr(cfg, "pet_enabled", False) else None  # Phase 7
        self.clothing_tracker = ClothingTracker(cfg) if getattr(cfg, "clothing_enabled", False) else None  # Phase 8
        self.latest_pets: list[PetDetection] = []
        self._frame_idx = 0
        self._ag_samples: dict[int, list[AgeGender]] = {}   # track_id -> raw votes
        self._age_cache: dict[int, tuple[float | None, str | None, str | None]] = {}    # track_id -> (age, age_group, gender)
        self._clothing_cache: dict[int, tuple[str, str]] = {}  # track_id -> (color, style)
        self._track_frames: dict[int, int] = {}  # track_id -> frame_count
        self._last_seen: dict[int, float] = {}
        self._ag_executor = ThreadPoolExecutor(max_workers=1)
        self._ag_in_flight: set[int] = set()
        self._pose_cache: dict[int, HeadPose] = {}

    def reset(self) -> None:
        """Forget every per-track identity and start counting from scratch.

        Needed whenever the input switches to an unrelated stream (a new video, a
        reconnected camera): ByteTrack would otherwise try to associate the first
        frames of the new scene with the last frames of the old one.
        """
        self.tracker.reset()
        self.dwell = DwellTracker()
        self._frame_idx = 0
        self._ag_samples.clear()
        self._age_cache.clear()
        self._clothing_cache.clear()
        self._track_frames.clear()
        self._last_seen.clear()
        self._ag_in_flight.clear()
        self._pose_cache.clear()
        self.latest_pets.clear()

    def start(self):
        if self.vlm:
            self.vlm.start()

    def stop(self):
        if self.vlm:
            self.vlm.stop()
        if hasattr(self, "_ag_executor"):
            self._ag_executor.shutdown(wait=False)

    @property
    def latest_context(self):
        if self.vlm:
            return self.vlm.latest
        from scene_vlm import SceneContext
        return SceneContext()

    def _reduce_votes(self, samples: list[tuple[AgeGender, int]]) -> tuple[float | None, str | None, str | None]:
        """Collapse several noisy per-frame estimates into one answer.

        Gender by confidence-weighted vote over every sample; age by median over
        only the samples whose crop was big enough to be worth trusting.
        """
        if not samples:
            return None, None, None
        scores: dict[str, float] = {}
        for ag, _ in samples:
            scores[ag.gender] = scores.get(ag.gender, 0.0) + ag.gender_conf
        gender = max(scores, key=scores.__getitem__)

        if not self.cfg.age_enabled:
            return None, None, gender
        usable = [ag.age for ag, px in samples if px >= self.cfg.min_face_px_for_age]
        approx_age = round(float(np.median(usable)), 1) if usable else None
        age_group = map_age_group(approx_age) if approx_age is not None else None
        return approx_age, age_group, gender

    def _attribute_crop(self, frame_bgr: np.ndarray, source_frame: np.ndarray | None,
                        bbox: tuple[int, int, int, int]) -> np.ndarray:
        """Crop the face for age/gender from the sharpest frame we have.

        Detection runs on the CFG.process_long_side-downscaled frame for speed, but
        cropping the attribute face from that same frame throws away resolution the
        age model badly needs. When the caller hands us the original frame, scale
        the bbox back up and crop from there instead.
        """
        if source_frame is None or source_frame.shape == frame_bgr.shape:
            return crop_face(frame_bgr, bbox)
        sy = source_frame.shape[0] / frame_bgr.shape[0]
        sx = source_frame.shape[1] / frame_bgr.shape[1]
        x1, y1, x2, y2 = bbox
        return crop_face(source_frame, (int(x1 * sx), int(y1 * sy), int(x2 * sx), int(y2 * sy)))

    def _async_estimate(self, track_id: int, face_bgr: np.ndarray) -> None:
        """Run heavyweight MiVOLO ONNX inference in background worker thread."""
        try:
            ag = self.age_gender.estimate(face_bgr, track_id)
            if ag is not None:
                samples = self._ag_samples.setdefault(track_id, [])
                samples.append((ag, int(face_bgr.shape[0])))
                self._age_cache[track_id] = self._reduce_votes(samples)
        except Exception:
            pass
        finally:
            self._ag_in_flight.discard(track_id)

    def _age_gender_voted(self, track_id: int, face_bgr: np.ndarray) -> tuple[float | None, str | None, str | None]:
        """Sample age/gender asynchronously in background without blocking the real-time loop."""
        samples = self._ag_samples.setdefault(track_id, [])
        due = (
            not samples  # always get something on the frame a track first appears
            or (len(samples) < self.cfg.age_gender_samples
                and self._frame_idx % self.cfg.age_gender_every_n == 0)
        )
        if due and track_id not in self._ag_in_flight and face_bgr is not None and face_bgr.size > 0:
            self._ag_in_flight.add(track_id)
            self._ag_executor.submit(self._async_estimate, track_id, face_bgr.copy())

        return self._age_cache.get(track_id, (None, None, None))

    def _retire(self, live_ids: set[int], now: float) -> None:
        """Close gaze sessions for vanished tracks and expire their cached state.

        Live ids are stamped FIRST. The loop used to only visit keys already in
        `_last_seen`, and nothing else ever wrote to that dict — so it stayed
        empty for the whole run, no track ever expired, `_ag_samples` /
        `_age_cache` / the dwell dicts grew without bound, and a track_id
        recycled by ByteTrack inherited the previous person's dwell and
        demographics.
        """
        for track_id in live_ids:
            self._last_seen[track_id] = now

        for track_id in list(self._last_seen):
            if track_id in live_ids:
                continue
            self.dwell.close(track_id, now)
            if now - self._last_seen[track_id] > self.cfg.track_expiry_seconds:
                self._last_seen.pop(track_id)
                self._ag_samples.pop(track_id, None)
                self._age_cache.pop(track_id, None)
                self._ag_in_flight.discard(track_id)
                self._pose_cache.pop(track_id, None)
                self._clothing_cache.pop(track_id, None)
                self._track_frames.pop(track_id, None)
                self.dwell.forget(track_id)

    def process(self, frame_bgr: np.ndarray, now: float | None = None,
                source_frame: np.ndarray | None = None) -> list[PersonMeta]:
        """One frame -> per-person metadata using all active pipeline stages.

        `frame_bgr` is the preprocessed (downscaled) frame everything is detected
        and reported in — all bboxes come back in its coordinates.

        `now` is the frame's timestamp in seconds and drives dwell accounting.
        It defaults to the wall clock, which is right for a live camera. Offline
        video must pass frame_idx / fps instead — batch processing runs faster
        than real time, so the wall clock would under-report every dwell.

        `source_frame` is the original full-resolution frame, used only to cut a
        sharper face crop for age/gender. Pass it whenever you have it.
        """
        self._frame_idx += 1
        verbose = self.cfg.verbose
        
        # Bước 1: Phân tích bối cảnh VLM định kỳ (Async Thread)
        if self.vlm:
            if verbose:
                print(f"[Pipeline - Frame {self._frame_idx}] Bước 1: Gửi frame gốc sang luồng xử lý bối cảnh VLM")
            self.vlm.submit_frame(source_frame if source_frame is not None else frame_bgr)
            
        # Bước 2: Phát hiện & theo vết khuôn mặt (YOLO & ByteTrack)
        if verbose:
            print(f"[Pipeline - Frame {self._frame_idx}] Bước 2: Chạy dò tìm & theo vết khuôn mặt (YOLO/ByteTrack)")
        tracks = self.tracker.update(frame_bgr)

        now = time.time() if now is None else now
        self._retire({t.track_id for t in tracks}, now)

        metas = []
        if verbose:
            print(f"[Pipeline - Frame {self._frame_idx}] Phát hiện {len(tracks)} đối tượng khuôn mặt hoạt động")
        
        for idx, t in enumerate(tracks):
            if verbose:
                print(f"  --> Xử lý đối tượng {idx+1}/{len(tracks)} (Track ID: {t.track_id})")
            
            # Bước 3: Trích xuất face crop
            face_bgr = crop_face(frame_bgr, t.bbox)
            face_rgb = to_rgb(face_bgr) if face_bgr.size > 0 else None
            h_c, w_c = face_bgr.shape[:2] if face_bgr is not None else (0, 0)
            if verbose:
                print(f"      - Bước 3.1: Trích xuất Face Bounding Box {t.bbox} (Kích thước crop: {w_c}x{h_c})")

            # Bước 4: Ước lượng hướng xoay đầu 3D (solvePnP)
            # Throttle MediaPipe Face Mesh: chạy mỗi 2 frame cho track ổn định để tiết kiệm CPU
            pose = None
            if face_rgb is not None:
                due_pose = (t.track_id not in self._pose_cache) or (self._frame_idx % 2 == 0)
                if due_pose:
                    pose = self.head_pose.estimate(face_rgb)
                    if pose is not None:
                        self._pose_cache[t.track_id] = pose
                else:
                    pose = self._pose_cache.get(t.track_id)

            yaw_val = round(pose.yaw, 1) if pose else None
            pitch_val = round(pose.pitch, 1) if pose else None
            if verbose:
                print(f"      - Bước 3.2: Ước lượng góc đầu (Yaw: {yaw_val}°, Pitch: {pitch_val}°)")
            
            # Bước 5: Dự đoán tuổi & giới tính (MiVOLO / Caching Vote)
            approx_age, age_group, gender = self._age_gender_voted(
                t.track_id, self._attribute_crop(frame_bgr, source_frame, t.bbox)
            )
            gender_vn = "Nam" if gender == "M" else ("Nữ" if gender == "F" else "Chưa rõ")
            age_str = f"~{round(approx_age)} ({age_group})" if approx_age is not None else (age_group or "Chưa rõ")
            if verbose:
                print(f"      - Bước 3.3: Phân tích giới tính/tuổi: {gender_vn} ({age_str})")

            # Bước 5.5: Nhận diện màu sắc trang phục & phong cách (Clothing & Style - One-shot)
            clothing_color, clothing_style = None, None
            if self.clothing_tracker is not None:
                tid = t.track_id
                self._track_frames[tid] = self._track_frames.get(tid, 0) + 1
                if tid in self._clothing_cache:
                    clothing_color, clothing_style = self._clothing_cache[tid]
                elif self._track_frames[tid] >= getattr(self.cfg, "clothing_min_samples", 4):
                    anal_frame = source_frame if source_frame is not None else frame_bgr
                    det = self.clothing_tracker.analyze(anal_frame, t.bbox)
                    if det is not None:
                        clothing_color, clothing_style = det.color_name, det.style
                        self._clothing_cache[tid] = (clothing_color, clothing_style)
                        if verbose:
                            print(f"      - Bước 3.5: Nhận diện trang phục: Màu {clothing_color} (Phong cách: {clothing_style})")

            # Bước 6: Đánh giá trạng thái nhìn (Gaze Attention) & Dwell time
            attentive_now = is_attentive(pose) if pose is not None else False
            smoothed_att, dwell_time = self.dwell.update(t.track_id, attentive_now, now)
            if verbose:
                print(f"      - Bước 3.4: Trạng thái chú ý: {'Có nhìn' if smoothed_att else 'Không nhìn'} | Thời gian giữ mắt: {round(dwell_time, 2)} giây")

            metas.append(
                PersonMeta(
                    track_id=t.track_id,
                    bbox=t.bbox,
                    age=approx_age,
                    age_group=age_group,
                    gender=gender,
                    yaw=pose.yaw if pose else None,
                    pitch=pose.pitch if pose else None,
                    roll=pose.roll if pose else None,
                    attention=int(smoothed_att),
                    dwell_time=dwell_time,
                    clothing_color=clothing_color,
                    clothing_style=clothing_style,
                )
            )

        # Bước 7: Nhận diện & theo vết thú cưng (Pet Tracking & Spatial Proximity)
        if self.pet_tracker is not None:
            self.latest_pets = self.pet_tracker.update(frame_bgr, metas)
        else:
            self.latest_pets = []

        return metas

    def process_frame(
        self,
        frame: np.ndarray,
        now: float | None = None,
        source_frame: np.ndarray | None = None,
        verbose: bool = False,
    ) -> TrackingFrameResult:
        """High-level processing method that applies preprocessing and runs the entire AI pipeline.

        Args:
            frame: Input image (raw BGR, will be preprocessed to pipeline dimensions).
            now: Monotonic timestamp for dwell smoothing.
            source_frame: Optional higher-res frame for crops (e.g. MiVOLO / clothing).
            verbose: If True, prints stage logs.

        Returns:
            TrackingFrameResult encapsulating people metadata, detected pets, ambient scene context,
            and preprocessed frame.
        """
        frame_prep = preprocess(frame)
        src = source_frame if source_frame is not None else frame
        metas = self.process(frame_prep, now=now, source_frame=src)
        return TrackingFrameResult(
            metas=metas,
            pets=self.latest_pets,
            context=self.latest_context,
            processed_frame=frame_prep,
        )



