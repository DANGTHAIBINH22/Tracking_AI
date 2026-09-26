"""The analytics engine: one capture thread turning frames into per-advert numbers.

    frame source -> preprocess -> Pipeline.process -> PersonMeta[]
                                                   -> live snapshot (websocket / MJPEG)
                                                   -> impressions (postgres, per airing)

The frame source is either the API host's own camera or a browser pushing JPEGs
in over /ws/ingest (see `server/sources.py`); the loop below cannot tell which,
and neither can anything downstream of it.

Only ONE thread ever touches the Pipeline. That is not a convenience — the
tracker holds ultralytics' ByteTrack state behind `model.track(persist=True)`,
which is a single mutable association history. Two threads pushing frames into it
would interleave two scenes into one set of track ids and quietly corrupt every
dwell time and unique count the dashboard reports.
"""

from __future__ import annotations

import asyncio
from concurrent.futures import ThreadPoolExecutor
import threading
import time
from dataclasses import dataclass, field

import cv2
import numpy as np

from configs import CFG
from pipeline import Pipeline, PersonMeta
from server import db
from server.audience import AGE_GROUPS, normalize_age_group, target_covers
from server.player import PlaylistPlayer
from server.settings import SETTINGS
from server.sources import BROWSER_SOURCE, BrowserSource, LocalCameraSource, PlaylistSource, is_browser_source
from viz import draw_tracking_hud

# How many per-person rows one session may carry in `tracks_json`. A busy
# hour is a few hundred; the cap only stops a runaway source turning one
# TEXT column into megabytes.
_SESSION_TRACKS_CAP = 2000


@dataclass
class _TrackState:
    """What we know about one person while they are still in frame."""
    track_id: int
    airing_id: int | None
    first_seen: float
    last_seen: float
    dwell_at_entry: float          # pipeline dwell when this (track, airing) began
    dwell_latest: float
    age_group: str | None = None
    gender: str | None = None

    @property
    def presence(self) -> float:
        return max(0.0, self.last_seen - self.first_seen)

    @property
    def attention(self) -> float:
        # Pipeline dwell is cumulative for the LIFE of the track. The share that
        # belongs to this airing is the delta since the airing started, which is
        # why entry is snapshotted rather than reading dwell_time directly.
        return max(0.0, self.dwell_latest - self.dwell_at_entry)





class AnalyticsEngine:
    def __init__(self, player: PlaylistPlayer) -> None:
        self.player = player
        self._lock = threading.RLock()
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self._running = False
        self._source: str | None = None
        self._error: str | None = None
        # Owned here rather than in `state`, so there is one obvious answer to
        # "who is allowed to push frames": whoever the running engine is reading.
        self.browser = BrowserSource(
            stale_after=SETTINGS.ingest_stale_after,
            max_bytes=SETTINGS.ingest_max_frame_bytes,
        )

        self._pipeline: Pipeline | None = None
        self._states: dict[int, _TrackState] = {}
        self._unique_ids: set[int] = set()
        self._latest_metas: list[PersonMeta] = []
        self._latest_jpeg: bytes | None = None
        self._frame_cond = threading.Condition()
        self._frame_seq = 0
        self._stream_subscribers: set[asyncio.Queue] = set()
        self._event_loop: asyncio.AbstractEventLoop | None = None
        self._fps = 0.0
        self._frame_index = 0
        # The live source object, so snapshot() can ask a PlaylistSource which
        # clip it is on. _source stays the whole queue; this is the cursor.
        self._active_source: object | None = None
        self._latest_recommendation: dict | None = None
        self._last_rec_computed_time: float = 0.0
        self._db_executor: ThreadPoolExecutor | None = None

        # Session tracking per device
        self._current_session_id: int | None = None
        self._current_session_code: str | None = None
        self._session_device_id: str = "host"
        self._session_screen_id: int | None = None
        self._session_unique_tracks: set[int] = set()
        self._session_attentive_tracks: set[int] = set()
        self._session_peak_people: int = 0
        # track_id -> one row per PERSON seen in this session. The single source
        # of truth for every session demographic: gender, age and dwell are all
        # derived from here, so nothing is counted once per frame.
        self._session_tracks: dict[int, dict] = {}
        self._session_last_update_time: float = 0.0

    # ---------- lifecycle ----------

    def start(
        self,
        source: str | None = None,
        device_id: str | None = None,
        screen_id: int | None = None,
        notes: str = "",
    ) -> None:
        with self._lock:
            if self._running:
                return
            if self._db_executor is None:
                self._db_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="engine-db")
            self._source = source or SETTINGS.default_source
            self._error = None
            self._running = True
            self._stop.clear()

            # Initialize session parameters
            self._session_device_id = str(device_id) if device_id is not None else ("host" if not is_browser_source(self._source) else "browser")
            self._session_screen_id = screen_id
            self._session_unique_tracks.clear()
            self._session_attentive_tracks.clear()
            self._session_tracks.clear()
            self._session_peak_people = 0

            # Create session in database
            now = time.time()
            import datetime, random
            date_prefix = datetime.datetime.fromtimestamp(now).strftime("%Y%m%d-%H%M%S")
            rand_suffix = random.randint(100, 999)
            self._current_session_code = f"SES-{date_prefix}-{rand_suffix}"
            try:
                row = db.query_one(
                    """INSERT INTO tracking_sessions
                       (session_code, device_id, screen_id, source, started_at, status, notes)
                       VALUES (%s, %s, %s, %s, %s, 'active', %s) RETURNING id""",
                    (self._current_session_code, self._session_device_id, self._session_screen_id, self._source, now, notes),
                )
                self._current_session_id = row["id"] if row else None
            except Exception as e:
                print(f"[Tracking Session] Lỗi tạo session trong DB: {e}")
                self._current_session_id = None

            # Clear old frame cache and metadata so new source starts fresh
            with self._frame_cond:
                self._latest_jpeg = None
                self._frame_seq += 1
                self._frame_cond.notify_all()
            self._latest_metas = []
            self._latest_recommendation = None

            self._thread = threading.Thread(target=self._loop, daemon=True, name="analytics")
            self._thread.start()

    def stop(self) -> None:
        with self._lock:
            if not self._running:
                return
            self._running = False
            self._latest_metas = []
            self._latest_recommendation = None
        self._stop.set()
        with self._frame_cond:
            self._latest_jpeg = None
            self._frame_seq += 1
            self._frame_cond.notify_all()
        thread = self._thread
        if thread is not None:
            thread.join(timeout=5.0)
        now = time.time()
        self._flush_all(now)
        self._finalize_session(now)
        if self._db_executor is not None:
            self._db_executor.shutdown(wait=False)
            self._db_executor = None

    def _session_digest(self) -> tuple[dict, list[dict]]:
        """Roll the per-track ledger up into the numbers a session report needs.

        Everything here is counted per `track_id`, never per frame: someone who
        stands in front of the camera for 600 frames is ONE man in his thirties,
        not 600 of them. Counting frames instead is what made `demographics_json`
        and `avg_dwell_time` scale with frame rate rather than with people.
        """
        tracks = sorted(self._session_tracks.values(), key=lambda t: t["first_seen"])

        genders = {"Nam": 0, "Nữ": 0, "unknown": 0}
        ages = {group: 0 for group in AGE_GROUPS}
        ages["unknown"] = 0
        age_values: list[int] = []
        dwell_total = 0.0
        presence_total = 0.0

        for t in tracks:
            gender = t["gender"] or "unknown"
            group = t["age_group"] or "unknown"
            genders[gender] = genders.get(gender, 0) + 1
            ages[group] = ages.get(group, 0) + 1
            if t["age"] is not None:
                age_values.append(int(t["age"]))
            dwell_total += float(t["dwell_seconds"])
            presence_total += float(t["presence_seconds"])

        n = max(1, len(tracks))
        pet_owners = sum(1 for t in tracks if t.get("has_pet"))
        clothing_styles = {"Formal": 0, "Sport": 0, "Casual": 0, "unknown": 0}
        for t in tracks:
            st = t.get("clothing_style") or "unknown"
            clothing_styles[st] = clothing_styles.get(st, 0) + 1

        demographics = {
            "genders": genders,
            "ages": ages,
            "unique_tracks": len(tracks),
            "attentive_tracks": len(self._session_attentive_tracks),
            "pet_owners": pet_owners,
            "clothing_styles": clothing_styles,
            # Whole years, like the per-person ages it averages: a mean of
            # values the estimator rounded off cannot be more precise than
            # they are.
            "avg_age": round(sum(age_values) / len(age_values)) if age_values else None,
            "avg_presence_seconds": round(presence_total / n, 2),
            "total_dwell_seconds": round(dwell_total, 2),
            # The API reads this to tell a per-person row apart from a legacy
            # per-frame one, instead of guessing from the magnitudes.
            "counted_per": "track",
        }
        return demographics, tracks

    def _update_session(self, now: float, completed: bool = False) -> None:
        if not self._current_session_id:
            return
        footfall = len(self._session_unique_tracks)
        impressions = len(self._session_attentive_tracks)
        rate = round((impressions / max(1, footfall)) * 100.0, 1)
        import json

        demographics, tracks = self._session_digest()
        avg_dwell = round(
            sum(float(t["dwell_seconds"]) for t in tracks) / max(1, len(tracks)), 2
        )
        status = "completed" if completed else "active"
        try:
            db.execute(
                """UPDATE tracking_sessions
                   SET ended_at = %s,
                       status = %s,
                       total_footfall = %s,
                       total_impressions = %s,
                       attention_rate = %s,
                       avg_dwell_time = %s,
                       peak_people = %s,
                       demographics_json = %s,
                       tracks_json = %s
                   WHERE id = %s""",
                (
                    now,
                    status,
                    footfall,
                    impressions,
                    rate,
                    avg_dwell,
                    self._session_peak_people,
                    json.dumps(demographics, ensure_ascii=False),
                    json.dumps(tracks[:_SESSION_TRACKS_CAP], ensure_ascii=False),
                    self._current_session_id,
                ),
            )
        except Exception as e:
            print(f"[Tracking Session] Lỗi cập nhật session: {e}")

    def _finalize_session(self, now: float) -> None:
        if self._current_session_id:
            self._update_session(now, completed=True)
            self._current_session_id = None

    @property
    def running(self) -> bool:
        with self._lock:
            return self._running

    @property
    def mode(self) -> str:
        """"browser" or "server" — cheap enough to call per received frame,
        unlike snapshot(), which serialises every track."""
        with self._lock:
            return "browser" if is_browser_source(self._source) else "server"

    # ---------- live state for the API ----------

    def _compute_recommendation(self, metas: list) -> dict | None:
        if not metas:
            return None

        people_count = len(metas)
        if people_count == 1:
            crowd_context = "single"
            crowd_str = "1 khán giả"
        elif 2 <= people_count <= 4:
            crowd_context = "group"
            crowd_str = f"Nhóm {people_count} người"
        else:
            crowd_context = "crowd"
            crowd_str = f"Đám đông {people_count} người"

        # Prioritize attentive viewers, then longest dwell time
        attentive = [m for m in metas if getattr(m, "attention", 0)]
        candidates = attentive if attentive else metas
        priority_viewer = max(candidates, key=lambda m: getattr(m, "dwell_time", 0.0))

        # Translate the pipeline's bin label ("0-6", "55+") into the spelling
        # an advert's target is stored in ("<6", ">55"). Comparing them raw
        # inverted the score at both ends: an advert aimed at children was
        # penalised whenever a child was the one watching.
        v_age_grp = normalize_age_group(priority_viewer.age_group)
        v_gender = priority_viewer.gender
        v_age = getattr(priority_viewer, "age", None)

        # Score over exactly what the player can put on screen — the active
        # playlist. Querying `creatives WHERE enabled` instead silently returned
        # zero candidates once playlist membership moved to `playlist_items`,
        # which killed every recommendation, and could otherwise recommend a
        # creative that is not in rotation at all.
        try:
            creatives = self.player.playlist()
        except Exception:
            return None

        if not creatives:
            return None

        # The "C" in CARE: ambient scene context from the async VLM branch
        # (scene_vlm.py). Empty/None fields mean the branch is disabled or has
        # not completed a pass yet — those never penalise a creative, they just
        # take the dimension out of scoring.
        scene = self._pipeline.latest_context if self._pipeline is not None else None
        scene_weather = getattr(scene, "weather", None)
        scene_objects = [o.lower() for o in (getattr(scene, "objects", None) or []) if o and o != "none"]

        # Pet context from pet_tracker
        v_has_pet = getattr(priority_viewer, "has_pet", False)
        v_pet_type = getattr(priority_viewer, "pet_type", None)
        scene_pets = [p.pet_type for p in getattr(self._pipeline, "latest_pets", [])] if self._pipeline is not None else []
        has_any_pet = v_has_pet or bool(scene_pets)
        effective_pet_type = v_pet_type or (scene_pets[0] if scene_pets else None)

        # Clothing context from clothing_tracker
        v_clothing_color = getattr(priority_viewer, "clothing_color", None)
        v_clothing_style = getattr(priority_viewer, "clothing_style", None)

        best_c = None
        best_score = -1.0
        scored: list[tuple[float, int]] = []

        for c in creatives:
            score = 20.0
            tag_age = c.get("target_age_group") or "all"
            tag_gen = c.get("target_gender") or "all"
            tag_crowd = c.get("target_crowd") or "all"
            tag_weather = c.get("target_weather") or "all"

            # Crowd context scoring (Bối cảnh số lượng người)
            if tag_crowd == crowd_context:
                score += 35.0
            elif tag_crowd == "all":
                score += 15.0
            else:
                score -= 15.0

            # Age score
            if v_age_grp:
                # target_covers, not ==: an advert saved before `<18` was split
                # into `<6` / `6-13` / `13-18` still targets all three, and an
                # equality test would penalise it in front of its own audience.
                if target_covers(tag_age, v_age_grp):
                    score += 30.0
                elif tag_age == "all":
                    score += 10.0
                else:
                    score -= 10.0

            # Gender score
            if v_gender:
                if tag_gen == v_gender:
                    score += 25.0
                elif tag_gen == "all":
                    score += 10.0
                else:
                    score -= 10.0

            # Weather score (Bối cảnh thời tiết, từ VLM)
            if scene_weather:
                if tag_weather == scene_weather:
                    score += 20.0
                elif tag_weather == "all":
                    score += 5.0
                else:
                    score -= 10.0

            # Ambient-object score: keyword match between what the VLM saw
            # (shopping bags, laptops, food/beverage, ...) and this creative's
            # free-text category/description. Same rule-based approach as
            # `suggest_target` — no model, just a fixed vocabulary.
            if scene_objects:
                cat_txt = f"{c.get('category') or ''} {c.get('description') or ''}".lower()
                obj_txt = " ".join(scene_objects)
                if ("food" in obj_txt or "beverage" in obj_txt) and (
                    "thực phẩm" in cat_txt or "đồ uống" in cat_txt
                ):
                    score += 10.0
                if ("shopping bag" in obj_txt or "bag" in obj_txt) and (
                    "thời trang" in cat_txt or "làm đẹp" in cat_txt
                ):
                    score += 10.0
                if "laptop" in obj_txt and ("công nghệ" in cat_txt or "gaming" in cat_txt):
                    score += 10.0

            # Pet score (Thú cưng đi cùng)
            tag_pet = (c.get("target_pet") or "all").lower()
            cat_desc_pet = f"{c.get('category') or ''} {c.get('description') or ''}".lower()
            is_pet_ad = tag_pet in ("yes", "pet", "dog", "cat") or any(
                k in cat_desc_pet for k in ("thú cưng", "pet", "chó", "mèo", "pate")
            )

            if is_pet_ad:
                if has_any_pet:
                    # Khán giả có thú cưng -> Ưu tiên rất cao!
                    if tag_pet == effective_pet_type:
                        score += 45.0  # Khớp chính xác loại pet (ví dụ chó gặp quảng cáo chó)
                    else:
                        score += 40.0  # Có pet nói chung
                else:
                    # Chỉ phạt điểm khi module Pet Detection đang thực sự hoạt động.
                    # Nếu module bị tắt hoặc lỗi, không phạt để bảo vệ quảng cáo thú cưng (graceful degradation).
                    if getattr(CFG, "pet_enabled", False):
                        score -= 30.0
            else:
                if tag_pet == "none":
                    if not has_any_pet:
                        score += 10.0
                    else:
                        score -= 10.0

            # Clothing & Style score (Trang phục và phong cách)
            tag_clothing = (c.get("target_clothing") or "all").lower()
            tag_style = (c.get("target_style") or "all").lower()
            cat_desc = f"{c.get('category') or ''} {c.get('description') or ''}".lower()

            if v_clothing_style and tag_style != "all":
                if tag_style == v_clothing_style.lower():
                    score += 15.0
                else:
                    score -= 5.0
            elif v_clothing_style:
                if v_clothing_style == "Formal" and any(k in cat_desc for k in ("công sở", "xe", "bất động sản", "tài chính", "đồng hồ", "suit")):
                    score += 15.0
                elif v_clothing_style == "Sport" and any(k in cat_desc for k in ("thể thao", "sport", "gym", "fitness", "năng lượng", "giày")):
                    score += 15.0

            if v_clothing_color and tag_clothing != "all":
                if tag_clothing == v_clothing_color.lower():
                    score += 10.0

            score = max(10.0, min(99.0, score))
            scored.append((score, c["id"]))
            if score > best_score:
                best_score = score
                best_c = c

        if best_c is None:
            return None

        g_str = "Nam" if v_gender == "M" else "Nữ" if v_gender == "F" else "Khán giả"
        age_str = f"~{v_age} tuổi" if v_age is not None else (v_age_grp or "")
        att_str = "đang chú ý nhìn màn hình" if priority_viewer.attention else "đang đứng trước màn hình"
        cat_str = best_c.get("category") or "Sản phẩm"
        target_crowd_display = (
            "mọi quy mô" if best_c.get("target_crowd") == "all"
            else "1 người (cá nhân)" if best_c.get("target_crowd") == "single"
            else "nhóm 2-4 người" if best_c.get("target_crowd") == "group"
            else "đám đông ≥ 5 người"
        )

        weather_vi = {"sunny": "trời nắng", "cloudy": "trời nhiều mây", "rainy": "trời mưa"}.get(scene_weather)
        weather_clause = f", {weather_vi}" if weather_vi else ""

        pet_str = ""
        if has_any_pet:
            pet_kind = "chó" if effective_pet_type == "dog" else "mèo" if effective_pet_type == "cat" else "thú cưng"
            pet_str = f", có dắt theo {pet_kind}"

        clothing_str = ""
        if v_clothing_color:
            style_clause = f" ({v_clothing_style})" if v_clothing_style else ""
            clothing_str = f", mặc áo {v_clothing_color}{style_clause}"

        reason = f"{crowd_str} ({g_str} {age_str}) {att_str}{weather_clause}{pet_str}{clothing_str} — phù hợp bối cảnh {target_crowd_display} và {cat_str}."

        # Hand over the whole ranking and audience summary to the player
        if getattr(self.player, "smart_targeting", False):
            audience_summary = f"{g_str} {age_str}{clothing_str}{pet_str}, {crowd_str}".strip(", ")
            context_summary = {
                "target_creative_id": best_c["id"],
                "target_creative_name": best_c["name"],
                "match_score": round(best_score, 1),
                "audience_summary": audience_summary,
                "reason": reason,
                "scene_weather": scene_weather,
                "scene_objects": scene_objects,
            }
            self.player.set_audience_ranking(
                [cid for _, cid in sorted(scored, reverse=True)],
                context_info=context_summary,
            )

        return {
            "target_creative_id": best_c["id"],
            "target_creative_name": best_c["name"],
            "target_creative_url": f"/media/{best_c['filename']}",
            "category": cat_str,
            "match_score": round(best_score, 1),
            "viewer_age_group": v_age_grp,
            "viewer_gender": v_gender,
            "viewer_approx_age": v_age,
            "crowd_context": crowd_context,
            "people_count": people_count,
            "scene_weather": scene_weather,
            "scene_objects": scene_objects,
            "has_pet": has_any_pet,
            "pet_type": effective_pet_type,
            "scene_pets": scene_pets,
            "clothing_color": v_clothing_color,
            "clothing_style": v_clothing_style,
            "reason": reason,
        }

    def snapshot(self) -> dict:
        with self._lock:
            metas = list(self._latest_metas)
            rec = self._latest_recommendation
            if rec is None and metas:
                rec = self._compute_recommendation(metas)
            scene = self._pipeline.latest_context if self._pipeline is not None else None
            return {
                "running": self._running,
                "source": self._source,
                "mode": "browser" if is_browser_source(self._source) else "server",
                # Only differs from `source` while a queue is running.
                "source_now": getattr(self._active_source, "current_spec", None) or self._source,
                "queue": getattr(self._active_source, "specs", None),
                "fps": round(self._fps, 1),
                "frame_index": self._frame_index,
                "people_now": len(metas),
                "attentive_now": sum(1 for m in metas if m.attention),
                "unique_viewers_session": len(self._unique_ids),
                "error": self._error,
                "recommendation": rec,
                "ambient_context": {
                    "weather": getattr(scene, "weather", None),
                    "crowd_activity": getattr(scene, "crowd_activity", None),
                    "objects": getattr(scene, "objects", []) or [],
                } if scene is not None else None,
                "smart_targeting": getattr(self.player, "smart_targeting", False),
                "pets": [
                    {
                        "type": p.pet_type,
                        "confidence": round(p.confidence, 2),
                        "bbox": tuple(p.bbox),
                        "owner_track_id": p.owner_track_id,
                    }
                    for p in getattr(self._pipeline, "latest_pets", [])
                ] if self._pipeline is not None else [],
                "tracks": [
                    {
                        "track_id": m.track_id,
                        "bbox": tuple(m.bbox),
                        "age": getattr(m, "age", None),
                        # Normalised like every other age_group leaving this
                        # module. Raw, the live table showed the pipeline's
                        # spelling ("0-6", "55+") while the session ledger and
                        # the reports beside it showed the app's ("<6", ">55") —
                        # the same viewer under two names on one screen.
                        "age_group": normalize_age_group(m.age_group) or m.age_group,
                        "gender": m.gender,
                        "yaw": None if m.yaw is None else round(m.yaw, 1),
                        "pitch": None if m.pitch is None else round(m.pitch, 1),
                        "attention": m.attention,
                        "dwell_time": round(m.dwell_time, 2),
                        "has_pet": getattr(m, "has_pet", False),
                        "pet_type": getattr(m, "pet_type", None),
                        "clothing_color": getattr(m, "clothing_color", None),
                        "clothing_style": getattr(m, "clothing_style", None),
                    }
                    for m in metas
                ],
            }

    def set_event_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._event_loop = loop

    def subscribe_stream(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=2)
        with self._lock:
            self._stream_subscribers.add(q)
        return q

    def unsubscribe_stream(self, q: asyncio.Queue) -> None:
        with self._lock:
            self._stream_subscribers.discard(q)

    def next_jpeg(self, last_seq: int, timeout: float = 1.0) -> tuple[int, bytes | None]:
        """Condition-variable-based wait: multiple clients never steal each other's wake-up."""
        with self._frame_cond:
            if self._frame_seq == last_seq and self._running:
                self._frame_cond.wait_for(lambda: self._frame_seq != last_seq or not self._running, timeout=timeout)
            return self._frame_seq, self._latest_jpeg

    def latest_jpeg(self, timeout: float = 1.0) -> bytes | None:
        """Block briefly for the next annotated frame (MJPEG streaming fallback)."""
        with self._frame_cond:
            if self._running and self._latest_jpeg is None:
                self._frame_cond.wait(timeout)
            return self._latest_jpeg

    # ---------- attribution ----------

    def _observe(self, metas: list[PersonMeta], now: float) -> None:
        airing_id, _ = self.player.current_airing()
        live_ids = set()

        for m in metas:
            live_ids.add(m.track_id)
            self._unique_ids.add(m.track_id)
            state = self._states.get(m.track_id)

            # A new airing starts a NEW impression for a person who is still
            # standing there: the same viewer can see three adverts in a row and
            # each one earned its own measurement.
            if state is not None and state.airing_id != airing_id:
                self._flush(state, now)
                state = None

            if state is None:
                state = _TrackState(
                    track_id=m.track_id,
                    airing_id=airing_id,
                    first_seen=now,
                    last_seen=now,
                    dwell_at_entry=m.dwell_time,
                    dwell_latest=m.dwell_time,
                )
                self._states[m.track_id] = state

            state.last_seen = now
            state.dwell_latest = m.dwell_time
            if m.age_group:
                state.age_group = normalize_age_group(m.age_group) or m.age_group
            if m.gender:
                state.gender = m.gender

        for track_id in [t for t in self._states if t not in live_ids]:
            state = self._states.pop(track_id)
            self._flush(state, now)

        # Update the session ledger: one row per person, updated in place while
        # they are in frame. Age and gender are overwritten rather than tallied —
        # the pipeline refines its estimate for a track over time, so the last
        # reading is the best one, and tallying would count the person per frame.
        for m in metas:
            self._session_unique_tracks.add(m.track_id)
            attentive = bool(getattr(m, "attention", 0))
            if attentive:
                self._session_attentive_tracks.add(m.track_id)

            entry = self._session_tracks.get(m.track_id)
            if entry is None:
                entry = {
                    "track_id": int(m.track_id),
                    "first_seen": now,
                    "last_seen": now,
                    "presence_seconds": 0.0,
                    "dwell_seconds": 0.0,
                    "frames": 0,
                    "attentive_frames": 0,
                    "gender": None,
                    "age": None,
                    "age_group": None,
                    "has_pet": False,
                    "pet_type": None,
                    "clothing_color": None,
                    "clothing_style": None,
                }
                self._session_tracks[m.track_id] = entry

            entry["last_seen"] = now
            entry["presence_seconds"] = round(max(0.0, now - entry["first_seen"]), 2)
            entry["frames"] += 1
            if attentive:
                entry["attentive_frames"] += 1
            # Pipeline dwell is already cumulative for the life of the track, so
            # the latest reading is the total — adding it up would square it.
            entry["dwell_seconds"] = round(
                max(entry["dwell_seconds"], float(getattr(m, "dwell_time", 0.0))), 2
            )
            if m.gender:
                entry["gender"] = "Nam" if m.gender.lower() in ("nam", "male", "m") else "Nữ"
            if m.age is not None:
                entry["age"] = int(m.age)
            if m.age_group:
                entry["age_group"] = normalize_age_group(m.age_group) or m.age_group
            if getattr(m, "has_pet", False):
                entry["has_pet"] = True
                if getattr(m, "pet_type", None):
                    entry["pet_type"] = m.pet_type
            if getattr(m, "clothing_color", None):
                entry["clothing_color"] = m.clothing_color
            if getattr(m, "clothing_style", None):
                entry["clothing_style"] = m.clothing_style

        if len(metas) > self._session_peak_people:
            self._session_peak_people = len(metas)

        # Periodic update to session in DB every 5 seconds (asynchronous background task)
        if self._current_session_id and (now - self._session_last_update_time > 5.0):
            self._session_last_update_time = now
            if self._db_executor:
                self._db_executor.submit(self._update_session, now, False)
            else:
                self._update_session(now, completed=False)

    def _flush(self, state: _TrackState, now: float) -> None:
        """Persist one (airing, track) measurement, if it clears the noise floor."""
        if state.airing_id is None:
            return  # nothing was on screen; there is no advert to credit
        if state.presence < SETTINGS.min_presence_seconds:
            return  # a one-frame flicker from the tracker, not a person
        if self._db_executor:
            self._db_executor.submit(
                self._do_flush,
                state.track_id, state.first_seen, state.last_seen,
                state.presence, state.attention, state.age_group,
                state.gender, state.airing_id,
            )
        else:
            self._do_flush(
                state.track_id, state.first_seen, state.last_seen,
                state.presence, state.attention, state.age_group,
                state.gender, state.airing_id,
            )

    def _do_flush(self, track_id: int, first_seen: float, last_seen: float,
                  presence: float, attention: float, age_group: str | None,
                  gender: str | None, airing_id: int) -> None:
        try:
            db.execute(
                """
                INSERT INTO impressions
                    (airing_id, creative_id, track_id, first_seen, last_seen,
                     presence_seconds, attention_seconds, age_group, gender)
                SELECT a.id, a.creative_id, %s, %s, %s, %s, %s, %s, %s
                FROM airings a WHERE a.id = %s
                ON CONFLICT (airing_id, track_id) DO UPDATE SET
                    last_seen         = excluded.last_seen,
                    presence_seconds  = excluded.presence_seconds,
                    attention_seconds = excluded.attention_seconds,
                    age_group         = COALESCE(excluded.age_group, impressions.age_group),
                    gender            = COALESCE(excluded.gender, impressions.gender)
                """,
                (track_id, first_seen, last_seen, presence,
                 attention, age_group, gender, airing_id),
            )
        except Exception as exc:
            with self._lock:
                self._error = f"Không ghi được lượt xem: {exc}"

    def _flush_all(self, now: float) -> None:
        for state in list(self._states.values()):
            self._flush(state, now)
        self._states.clear()

    # ---------- capture loop ----------

    def _open_source(self) -> LocalCameraSource | PlaylistSource | BrowserSource:
        if is_browser_source(self._source):
            src = self.browser
            src.open()
            return src
        spec = self._source or "0"
        # A separator in the spec means several clips queued back to back. It
        # travels as one string so `_source` stays a single value everywhere it
        # is already used — the session row, the snapshot, and the "is this a
        # different source?" check in /api/capture/start.
        src: LocalCameraSource | PlaylistSource
        if PlaylistSource.SEPARATOR in spec:
            src = PlaylistSource(spec.split(PlaylistSource.SEPARATOR))
        else:
            src = LocalCameraSource(spec)
        src.open()
        return src

    def _loop(self) -> None:
        source = None
        try:
            source = self._open_source()
            self._active_source = source
            from_browser = isinstance(source, BrowserSource)

            self._pipeline = Pipeline()
            self._pipeline.start()
            frame_idx = 0
            last_tick = time.perf_counter()
            min_dt = 1.0 / SETTINGS.capture_max_fps

            while not self._stop.is_set():
                t_frame = time.perf_counter()
                ok, frame = source.read()

                if frame is None:
                    if ok:
                        # Nothing new yet. A browser between frames, not an
                        # ending: keep the engine up so a reloading screen
                        # rejoins instead of finding the pipeline torn down.
                        continue
                    if source.rewind() and SETTINGS.loop_video_source:
                        # Kiosk demo: replay the file, but reset the tracker so
                        # frame 0 of the rewind is not associated with the last
                        # frame of the previous pass.
                        self._flush_all(time.time())
                        self._pipeline.reset()
                        continue
                    break

                now = time.time()
                res = self._pipeline.process_frame(frame, now=now, source_frame=frame)
                metas = res.metas
                prep = res.processed_frame
                self._observe(metas, now)

                # Throttled recommendation computation: run at most once every 1.0s or on new presence
                rec = self._latest_recommendation
                now_rec = time.time()
                should_compute_rec = (
                    metas and (
                        (self._latest_recommendation is None)
                        or (now_rec - self._last_rec_computed_time > 1.0)
                    )
                )
                if should_compute_rec:
                    self._last_rec_computed_time = now_rec
                    rec = self._compute_recommendation(metas)
                    self._latest_recommendation = rec
                elif not metas:
                    self._latest_recommendation = None
                    rec = None

                elapsed = max(time.perf_counter() - last_tick, 1e-6)
                last_tick = time.perf_counter()
                fps = 1.0 / elapsed

                self._render(prep, metas, fps)
                with self._lock:
                    self._latest_metas = metas
                    self._latest_recommendation = rec
                    self._fps = fps
                    self._frame_index = frame_idx
                frame_idx += 1

                # Never let a file source race ahead of real time — dwell is
                # measured on the wall clock, so a 300 FPS decode would report
                # everyone as a 0.1-second glance. Browser frames need no pacing
                # at all: they arrive at the rate the screen chose to send them,
                # and read() already blocked for them.
                if from_browser:
                    continue
                native = source.native_fps
                budget = (1.0 / native) if (source.is_file and native) else min_dt
                spare = budget - (time.perf_counter() - t_frame)
                if spare > 0:
                    self._stop.wait(spare)

        except Exception as exc:  # a dead camera must not take the API down
            import traceback
            traceback.print_exc()
            with self._lock:
                self._error = str(exc)
        finally:
            if source is not None:
                # Only the local source owns an OS handle; the browser source is
                # a shared mailbox that outlives any one run, so it is emptied
                # rather than closed.
                if isinstance(source, BrowserSource):
                    source.release_frames()
                else:
                    source.release()
            if self._pipeline is not None:
                self._pipeline.stop()
                self._pipeline = None
            with self._lock:
                self._running = False
                self._latest_metas = []
                # Released above; leaving the reference would make snapshot()
                # keep reporting the last clip of a run that has ended.
                self._active_source = None

    def _render(self, frame_bgr: np.ndarray, metas: list[PersonMeta], fps: float) -> None:
        canvas = frame_bgr.copy()
        pets = getattr(self._pipeline, "latest_pets", []) if self._pipeline else []
        scene = getattr(self._pipeline, "latest_context", None) if self._pipeline else None

        draw_tracking_hud(canvas, metas=metas, pets=pets, context=scene, fps=fps)

        ok, buf = cv2.imencode(".jpg", canvas, [int(cv2.IMWRITE_JPEG_QUALITY), SETTINGS.mjpeg_quality])
        if ok:
            jpeg_bytes = buf.tobytes()
            with self._frame_cond:
                self._latest_jpeg = jpeg_bytes
                self._frame_seq += 1
                self._frame_cond.notify_all()

            with self._lock:
                subs = list(self._stream_subscribers)
                loop = self._event_loop

            if subs and loop is not None and loop.is_running():
                def _distribute():
                    for q in subs:
                        if q.full():
                            try:
                                q.get_nowait()
                            except Exception:
                                pass
                        try:
                            q.put_nowait(jpeg_bytes)
                        except Exception:
                            pass
                loop.call_soon_threadsafe(_distribute)
