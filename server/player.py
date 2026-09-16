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

    def load_state(self) -> None:
        """Restore operator switches from the database. Called once at startup."""
        row = db.query_one("SELECT value FROM app_state WHERE key = 'smart_targeting'")
        with self._lock:
            self._smart_targeting = bool(row and row["value"] == "1")

    @property
    def smart_targeting(self) -> bool:
        with self._lock:
            return self._smart_targeting

    @property
    def is_playing(self) -> bool:
        with self._lock:
            return self._playing

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

    def set_audience_ranking(self, ranked_ids: list[int]) -> None:
        """Take the engine's creatives ordered best-match-first for who is watching.

        A ranking rather than a single winner, because the boundary case needs a
        runner-up: when the best match is the advert just finishing, repeating it
        back to back is worse than showing the next most relevant one.
        We do not interrupt the currently playing creative mid-airing.
        The ranking is held and applied naturally when the current advert finishes.
        """
        if not ranked_ids:
            return
        with self._lock:
            if not self._smart_targeting or not self._playing:
                return
            self._ranking = list(ranked_ids)
            self._ranked_at = time.time()

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

    def playlist(self) -> list[dict]:
        """Creatives in the currently active playlist in play order."""
        active_pl = db.query_one("SELECT id FROM playlists WHERE is_active = TRUE LIMIT 1")
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
            )
            if items:
                return items
        # If there is no active playlist or it has no items, do NOT fall back
        # to playing all creatives from the library. Playlists are the sole
        # authority for what airs on screen.
        return []

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
            if not self._playing or self._creative is None:
                return {"playing": False, "airing_id": None, "creative": None,
                        "started_at": None, "elapsed": 0.0, "remaining": 0.0}
            elapsed = time.time() - self._started_at
            duration = float(self._creative["duration"])
            return {
                "playing": True,
                "airing_id": self._airing_id,
                "creative": dict(self._creative),
                "started_at": self._started_at,
                "elapsed": round(elapsed, 2),
                "remaining": round(max(0.0, duration - elapsed), 2),
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
        with self._lock:
            self._target_requested_id = creative_id
            if not self._playing:
                self._playing = True
                self._stop.clear()
                self._index = -1
                self._thread = threading.Thread(target=self._loop, daemon=True, name="playlist")
                self._thread.start()
            else:
                self._stop.set()
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
                    # A natural boundary, not a mid-airing cut: prefer the
                    # audience's match over the next slot in order. Advancing
                    # blindly here put the wrong advert on screen for the three
                    # seconds it took the cut-in to become allowed again.
                    previous_id = self._creative.get("id") if self._creative else None
                    targeted = self._fresh_preference(items, previous_id)
                    if targeted is not None:
                        self._index = items.index(targeted)

                if targeted is not None:
                    creative = targeted
                else:
                    self._index = (self._index + 1) % len(items)
                    creative = items[self._index]

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
