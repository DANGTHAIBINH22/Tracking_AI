"""The playlist clock: which creative is on screen right now.

The BACKEND owns this, not the browser. Analytics attribute every measured face
to whatever `current_airing()` returns, so if the browser owned the schedule then
a reloaded tab, a paused video or a second screen would silently re-attribute
people to the wrong advert. The player page is a dumb renderer that asks what to
show; this class is the single source of truth.

It runs its own thread so the schedule keeps advancing when the camera is off —
a screen with no analytics still has to show adverts.
"""

from __future__ import annotations

import datetime
import threading
import time

from server import db


class PlaylistPlayer:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self._playing = False
        self._airing_id: int | None = None
        self._creative: dict | None = None
        self._started_at: float = 0.0
        self._index = -1
        self._smart_targeting = False
        self._target_requested_id: int | None = None
        # The engine's creatives ranked for the current audience, and when it
        # last said so. Consulted at natural boundaries; see `_fresh_preference`.
        self._ranking: list[int] = []
        self._ranked_at: float = 0.0
        self._cached_playlist: list[dict] = []
        self._cached_playlist_time: float = 0.0
        self._playlist_cache_ttl: float = 5.0  # seconds caching to prevent DB bottleneck
        self._ad_logs: list[dict] = []
        self._latest_context_info: dict | None = None

        # Dynamic Cut-in & Lookahead Pre-Decision settings
        self._cut_in_enabled: bool = True
        self._cut_in_min_playback: float = 3.0   # minimum seconds played before cut-in allowed
        self._lookahead_seconds: float = 3.0     # seconds before end of ad to pre-lock next ad
        self._precomputed_ranking: list[int] = []
        self._precomputed_context: dict | None = None
        self._precomputed_time: float = 0.0

        # Fair rotation tracking: creative_id -> last_played_timestamp
        self._last_played_times: dict[int, float] = {}

    def load_state(self) -> None:
        """Restore operator switches from the database. Called once at startup."""
        row = db.query_one("SELECT value FROM app_state WHERE key = 'smart_targeting'")
        with self._lock:
            self._smart_targeting = bool(row and row["value"] == "1")

        row_cut = db.query_one("SELECT value FROM app_state WHERE key = 'cut_in_enabled'")
        if row_cut:
            self._cut_in_enabled = (row_cut["value"] == "1")

        row_min = db.query_one("SELECT value FROM app_state WHERE key = 'cut_in_min_playback'")
        if row_min:
            try:
                self._cut_in_min_playback = float(row_min["value"])
            except (ValueError, TypeError):
                pass

        row_look = db.query_one("SELECT value FROM app_state WHERE key = 'lookahead_seconds'")
        if row_look:
            try:
                self._lookahead_seconds = float(row_look["value"])
            except (ValueError, TypeError):
                pass

    @property
    def smart_targeting(self) -> bool:
        with self._lock:
            return self._smart_targeting

    @property
    def cut_in_enabled(self) -> bool:
        with self._lock:
            return self._cut_in_enabled

    @property
    def cut_in_min_playback(self) -> float:
        with self._lock:
            return self._cut_in_min_playback

    @property
    def lookahead_seconds(self) -> float:
        with self._lock:
            return self._lookahead_seconds

    @property
    def is_playing(self) -> bool:
        with self._lock:
            return self._playing

    @property
    def ad_logs(self) -> list[dict]:
        with self._lock:
            return list(self._ad_logs)

    def set_smart_targeting(self, enabled: bool) -> None:
        with self._lock:
            self._smart_targeting = bool(enabled)
            if not enabled:
                self._target_requested_id = None
                self._ranking = []
        db.execute(
            "INSERT INTO app_state (key, value) VALUES ('smart_targeting', %s) "
            "ON CONFLICT (key) DO UPDATE SET value = excluded.value",
            ("1" if enabled else "0",),
        )

    def get_targeting_settings(self) -> dict:
        with self._lock:
            return {
                "smart_targeting": self._smart_targeting,
                "cut_in_enabled": self._cut_in_enabled,
                "cut_in_min_playback": self._cut_in_min_playback,
                "lookahead_seconds": self._lookahead_seconds,
            }

    def update_targeting_settings(
        self,
        smart_targeting: bool | None = None,
        cut_in_enabled: bool | None = None,
        cut_in_min_playback: float | None = None,
        lookahead_seconds: float | None = None,
    ) -> dict:
        with self._lock:
            if smart_targeting is not None:
                self._smart_targeting = bool(smart_targeting)
                db.execute(
                    "INSERT INTO app_state (key, value) VALUES ('smart_targeting', %s) "
                    "ON CONFLICT (key) DO UPDATE SET value = excluded.value",
                    ("1" if self._smart_targeting else "0",),
                )
            if cut_in_enabled is not None:
                self._cut_in_enabled = bool(cut_in_enabled)
                db.execute(
                    "INSERT INTO app_state (key, value) VALUES ('cut_in_enabled', %s) "
                    "ON CONFLICT (key) DO UPDATE SET value = excluded.value",
                    ("1" if self._cut_in_enabled else "0",),
                )
            if cut_in_min_playback is not None:
                self._cut_in_min_playback = max(1.0, min(30.0, float(cut_in_min_playback)))
                db.execute(
                    "INSERT INTO app_state (key, value) VALUES ('cut_in_min_playback', %s) "
                    "ON CONFLICT (key) DO UPDATE SET value = excluded.value",
                    (str(round(self._cut_in_min_playback, 1)),),
                )
            if lookahead_seconds is not None:
                self._lookahead_seconds = max(0.5, min(15.0, float(lookahead_seconds)))
                db.execute(
                    "INSERT INTO app_state (key, value) VALUES ('lookahead_seconds', %s) "
                    "ON CONFLICT (key) DO UPDATE SET value = excluded.value",
                    (str(round(self._lookahead_seconds, 1)),),
                )
            return self.get_targeting_settings()

    def set_audience_ranking(self, ranked_ids: list[int], context_info: dict | None = None) -> None:
        """Take the engine's creatives ordered best-match-first for who is watching.

        Evaluates Dynamic Cut-in if eligible, or pre-computes the next creative
        if within the Lookahead Pre-decision Window.
        """
        if not ranked_ids:
            return
        with self._lock:
            if not self._smart_targeting or not self._playing:
                return
            now = time.time()
            self._ranking = list(ranked_ids)
            self._ranked_at = now
            if context_info:
                self._latest_context_info = context_info

            # Check if an advert is currently playing
            if self._creative and self._started_at > 0:
                elapsed = now - self._started_at
                duration = float(self._creative.get("duration", 15.0))
                remaining = max(0.0, duration - elapsed)

                # Pre-lock next creative if within the Lookahead Pre-decision Window
                if remaining <= (self._lookahead_seconds + 0.5):
                    self._precomputed_ranking = list(ranked_ids)
                    self._precomputed_context = dict(context_info) if context_info else None
                    self._precomputed_time = now

                # Evaluate Dynamic Cut-in (interrupting mid-airing if urgent)
                if self._cut_in_enabled and elapsed >= self._cut_in_min_playback and remaining > 1.5:
                    top_id = ranked_ids[0]
                    curr_id = self._creative.get("id")
                    if top_id != curr_id:
                        has_pet = False
                        if context_info:
                            summ = (context_info.get("audience_summary") or "").lower()
                            reas = (context_info.get("reason") or "").lower()
                            has_pet = (
                                "thú cưng" in summ
                                or "chó" in summ
                                or "mèo" in summ
                                or "pet" in summ
                                or "thú cưng" in reas
                            )

                        tag_pet = (self._creative.get("target_pet") or "all").lower()
                        is_curr_pet = tag_pet in ("yes", "pet", "dog", "cat")
                        match_score = float(context_info.get("match_score") or 0.0) if context_info else 0.0

                        trigger = False
                        trigger_reason = ""
                        if has_pet and not is_curr_pet:
                            trigger = True
                            trigger_reason = "Khán giả dắt Thú cưng khi đang chiếu clip thông thường"
                        elif match_score >= 80.0:
                            trigger = True
                            trigger_reason = f"Độ tương thích mục tiêu vượt trội ({match_score}%)"

                        if trigger:
                            now_dt = datetime.datetime.now().strftime("%H:%M:%S")
                            print("\n" + "=" * 76)
                            print(f"⚡ [DYNAMIC CUT-IN] CẮT NGANG THÔNG MINH ĐỂ ĐỔI QUẢNG CÁO ƯU TIÊN")
                            print(f"⏱️  Thời gian: {now_dt} (clip đã phát {elapsed:.1f}s / {duration:.1f}s)")
                            print(f"📺  Clip đang chiếu: \"{self._creative.get('name')}\" (ID #{curr_id})")
                            print(f"🎯  Cắt sang Clip: \"{context_info.get('target_creative_name', top_id)}\"")
                            print(f"🐾  Lý do ngắt: {trigger_reason}")
                            print("=" * 76 + "\n", flush=True)
                            self._target_requested_id = top_id
                            self._stop.set()  # Wake the loop sleep immediately

    def _fresh_preference(self, items: list[dict], exclude_id: int | None) -> dict | None:
        """Best match for the current audience, skipping the advert just shown.

        Stale by age rather than by an explicit clear: the audience walking away,
        the camera stopping and the engine dying all look the same from here — no
        new ranking arriving — and all three should return the screen to plain
        rotation.
        """
        if not self._smart_targeting or not self._ranking:
            return None
        if time.time() - self._ranked_at > 3.0:
            return None
        by_id = {item["id"]: item for item in items}
        for creative_id in self._ranking:
            if creative_id != exclude_id and creative_id in by_id:
                return by_id[creative_id]
        return None

    # ---------- playlist ----------

    def invalidate_playlist_cache(self) -> None:
        """Invalidate in-memory cached playlist so next access re-queries database."""
        with self._lock:
            self._cached_playlist_time = 0.0

    def playlist(self, force_refresh: bool = False) -> list[dict]:
        """Creatives in the currently active playlist in play order with in-memory caching."""
        now = time.time()
        with self._lock:
            if not force_refresh and self._cached_playlist_time and (now - self._cached_playlist_time < self._playlist_cache_ttl):
                return list(self._cached_playlist)

        active_pl = db.query_one("SELECT id FROM playlists WHERE is_active = TRUE LIMIT 1")
        items = []
        if active_pl:
            items = db.query(
                """SELECT c.*, pi.id AS playlist_item_id, pi.position AS position,
                          COALESCE(pi.duration, c.duration) AS duration,
                          pi.playlist_id
                   FROM playlist_items pi
                   JOIN creatives c ON pi.creative_id = c.id
                   WHERE pi.playlist_id = %s
                   ORDER BY pi.position ASC, pi.id ASC""",
                (active_pl["id"],),
            ) or []

        with self._lock:
            self._cached_playlist = items
            self._cached_playlist_time = time.time()
            return list(self._cached_playlist)

    # ---------- lifecycle ----------

    def start(self) -> None:
        with self._lock:
            if self._playing:
                return
            self._playing = True
            self._stop.clear()
            self._index = -1
            self._thread = threading.Thread(target=self._loop, daemon=True, name="playlist")
            self._thread.start()

    def stop(self) -> None:
        with self._lock:
            if not self._playing:
                return
            self._playing = False
        self._stop.set()
        thread = self._thread
        if thread is not None:
            thread.join(timeout=2.0)
        self._close_airing()

    def skip(self) -> None:
        """Cut to the next creative immediately."""
        self._stop.set()   # wake the sleeping loop; it re-clears on the next pass

    # ---------- state ----------

    def current_airing(self) -> tuple[int | None, dict | None]:
        with self._lock:
            return self._airing_id, self._creative

    def snapshot(self) -> dict:
        with self._lock:
            base = {
                "smart_targeting": self._smart_targeting,
                "cut_in_enabled": self._cut_in_enabled,
                "cut_in_min_playback": self._cut_in_min_playback,
                "lookahead_seconds": self._lookahead_seconds,
            }
            if not self._playing or self._creative is None:
                return {
                    **base,
                    "playing": False,
                    "airing_id": None,
                    "creative": None,
                    "started_at": None,
                    "elapsed": 0.0,
                    "remaining": 0.0,
                    "ad_logs": list(self._ad_logs),
                }
            elapsed = time.time() - self._started_at
            duration = float(self._creative["duration"])
            return {
                **base,
                "playing": True,
                "airing_id": self._airing_id,
                "creative": dict(self._creative),
                "started_at": self._started_at,
                "elapsed": round(elapsed, 2),
                "remaining": round(max(0.0, duration - elapsed), 2),
                "ad_logs": list(self._ad_logs),
            }

    # ---------- internals ----------

    def _open_airing(self, creative: dict) -> int | None:
        """Put `creative` on air; return the airing it displaced, if any.

        The INSERT happens before the swap, and the swap is a single locked
        assignment, so `current_airing()` never reads None between two adverts.
        Closing first left a ~40ms hole per cut in which the engine attributed
        faces to no airing at all and threw those measurements away.
        """
        now = time.time()
        airing_id = db.insert(
            "INSERT INTO airings (creative_id, started_at) VALUES (%s, %s) RETURNING id",
            (creative["id"], now),
        )
        with self._lock:
            previous = self._airing_id
            self._airing_id = airing_id
            self._creative = creative
            self._started_at = now
            self._last_played_times[creative["id"]] = now
        return previous

    def _end_airing(self, airing_id: int | None) -> None:
        """Stamp an airing as finished. Runs after its successor is already on
        air, so consecutive airings overlap by one round-trip rather than
        leaving a gap — an overlap costs a millisecond of seconds-on-screen, a
        gap costs real viewers."""
        if airing_id is not None:
            db.execute("UPDATE airings SET ended_at = %s WHERE id = %s", (time.time(), airing_id))

    def _close_airing(self) -> None:
        """Take the screen off air entirely — stopping, or an empty playlist."""
        with self._lock:
            airing_id = self._airing_id
            self._airing_id = None
            self._creative = None
        self._end_airing(airing_id)

    def play_creative(self, creative_id: int) -> dict | None:
        """Immediately play a specific creative."""
        row = db.query_one("SELECT * FROM creatives WHERE id = %s", (creative_id,))
        if not row:
            return None
        now_dt = datetime.datetime.now().strftime("%H:%M:%S")
        ad_entry = {
            "timestamp": now_dt,
            "creative_id": row["id"],
            "creative_name": row["name"],
            "duration": round(float(row["duration"]), 1),
            "mode": "manual",
            "match_score": 100.0,
            "audience_summary": "Chỉ định thủ công từ Admin",
            "reason": "Người quản trị bấm 'Phát ngay' trên bảng điều khiển.",
        }
        with self._lock:
            self._ad_logs.insert(0, ad_entry)
            if len(self._ad_logs) > 30:
                self._ad_logs.pop()
            self._target_requested_id = creative_id
            if not self._playing:
                self._playing = True
                self._stop.clear()
                self._index = -1
                self._thread = threading.Thread(target=self._loop, daemon=True, name="playlist")
                self._thread.start()
            else:
                self._stop.set()
        print("\n" + "=" * 76)
        print(f"👉 [MANUAL OVERRIDE] PHÁT QUẢNG CÁO CHỈ ĐỊNH THỦ CÔNG")
        print(f"⏱️  Thời gian: {now_dt}")
        print(f"📺  Quảng cáo: \"{row['name']}\" (ID #{row['id']} · {ad_entry['duration']}s)")
        print(f"💡  Chế độ: Chọn phát thủ công từ Admin")
        print("=" * 76 + "\n", flush=True)
        return row

    def _loop(self) -> None:
        while self._playing:
            items = self.playlist()
            if not items:
                # Nothing to show. Idle without an open airing so no face gets
                # attributed to an advert that was never on screen.
                self._close_airing()
                self._stop.wait(1.0)
                self._stop.clear()
                continue

            with self._lock:
                targeted = None
                if self._target_requested_id:
                    matched = [c for c in items if c["id"] == self._target_requested_id]
                    if not matched:
                        single = db.query_one("SELECT * FROM creatives WHERE id = %s", (self._target_requested_id,))
                        if single:
                            matched = [single]
                    if matched:
                        targeted = matched[0]
                        if targeted in items:
                            self._index = items.index(targeted)
                    self._target_requested_id = None

                if targeted is None:
                    previous_id = self._creative.get("id") if self._creative else None
                    # 1. Check pre-computed target from Lookahead Pre-decision Window (-N seconds)
                    if (
                        self._smart_targeting
                        and self._precomputed_ranking
                        and (time.time() - self._precomputed_time) <= (self._lookahead_seconds + 3.0)
                    ):
                        by_id = {item["id"]: item for item in items}
                        for cid in self._precomputed_ranking:
                            if cid != previous_id and cid in by_id:
                                targeted = by_id[cid]
                                if self._precomputed_context:
                                    self._latest_context_info = dict(self._precomputed_context)
                                break
                        self._precomputed_ranking = []

                    # 2. Fall back to fresh preference if lookahead had none
                    if targeted is None:
                        targeted = self._fresh_preference(items, previous_id)

                    if targeted is not None:
                        self._index = items.index(targeted)

                if targeted is not None:
                    creative = targeted
                    is_targeted = True
                    if targeted in items:
                        self._index = items.index(targeted)
                else:
                    previous_id = self._creative.get("id") if self._creative else None
                    # Fair Rotation: Sort playlist items by last_played_time ascending (Least Recently Played).
                    # Items never played have timestamp 0.0, so they come first.
                    # Ties (e.g. at startup) preserve their original playlist order.
                    candidates = [c for c in items if c["id"] != previous_id] if len(items) > 1 else items
                    candidates_sorted = sorted(
                        candidates,
                        key=lambda c: (
                            self._last_played_times.get(c["id"], 0.0),
                            items.index(c)
                        )
                    )
                    creative = candidates_sorted[0]
                    self._index = items.index(creative)
                    is_targeted = False

            now_dt = datetime.datetime.now().strftime("%H:%M:%S")
            ad_entry = {
                "timestamp": now_dt,
                "creative_id": creative["id"],
                "creative_name": creative["name"],
                "duration": round(float(creative["duration"]), 1),
            }

            if is_targeted and self._latest_context_info:
                ctx = self._latest_context_info
                ad_entry.update({
                    "mode": "smart_targeting",
                    "match_score": ctx.get("match_score"),
                    "audience_summary": ctx.get("audience_summary"),
                    "reason": ctx.get("reason"),
                })
                print("\n" + "=" * 76)
                print(f"🎯 [AI SMART TARGETING] ĐÃ ĐỔI QUẢNG CÁO PHÙ HỢP KHÁN GIẢ")
                print(f"⏱️  Thời gian: {now_dt}")
                print(f"📺  Quảng cáo: \"{creative['name']}\" (ID #{creative['id']} · {ad_entry['duration']}s)")
                print(f"👀  Khán giả tracking: {ctx.get('audience_summary', 'N/A')}")
                if ctx.get("scene_weather"):
                    print(f"☀️  Bối cảnh môi trường: {ctx.get('scene_weather')}")
                print(f"📊  Độ tương thích mục tiêu: {ctx.get('match_score')}%")
                print(f"📋  Lý do AI chọn: {ctx.get('reason', 'N/A')}")
                print("=" * 76 + "\n", flush=True)
            else:
                ad_entry.update({
                    "mode": "rotation",
                    "match_score": None,
                    "audience_summary": "Tuần tự / Không có khán giả mục tiêu",
                    "reason": "Phát tuần tự theo danh sách playlist.",
                })
                print("\n" + "-" * 76)
                print(f"🔄 [PLAYLIST ROTATION] PHÁT QUẢNG CÁO THEO DANH SÁCH")
                print(f"⏱️  Thời gian: {now_dt}")
                print(f"📺  Quảng cáo: \"{creative['name']}\" (ID #{creative['id']} · {ad_entry['duration']}s)")
                print(f"💡  Chế độ: Tuần tự playlist (Playlist Rotation)")
                print("-" * 76 + "\n", flush=True)

            with self._lock:
                self._ad_logs.insert(0, ad_entry)
                if len(self._ad_logs) > 30:
                    self._ad_logs.pop()

            self._end_airing(self._open_airing(creative))

            total_duration = max(0.5, float(creative["duration"]))
            t_start = time.time()
            while self._playing and (time.time() - t_start) < total_duration:
                remaining = total_duration - (time.time() - t_start)
                self._stop.wait(timeout=min(0.5, remaining))
                if self._stop.is_set():
                    break

            if not self._playing:
                break
            self._stop.clear()

        self._close_airing()
