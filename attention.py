"""2.8 + 2.9 - Attention rule + gaze-session / dwell-time management.

attention = 1 if (|yaw| < theta_yaw and |pitch| < theta_pitch) else 0.
Thresholds are CALIBRATED experimentally (Phase 3), not given constants.

Dwell: per track_id, a small state machine. attention 0->1 opens a session,
1->0 (or the track disappearing) closes it and accumulates dwell_time.
"""

from __future__ import annotations

import time
from collections import defaultdict, deque

from configs import CFG
from head_pose import HeadPose


def is_attentive(pose: HeadPose) -> bool:
    """Instantaneous attention from head angles."""
    return abs(pose.yaw) < CFG.yaw_threshold_deg and abs(pose.pitch) < CFG.pitch_threshold_deg


class DwellTracker:
    """Accumulates looking time per track_id with temporal smoothing."""

    def __init__(self, smooth_frames: int = CFG.attention_smooth_frames):
        self.smooth_frames = smooth_frames
        self._recent: dict[int, deque] = defaultdict(lambda: deque(maxlen=smooth_frames))
        self._session_start: dict[int, float | None] = defaultdict(lambda: None)
        self._dwell: dict[int, float] = defaultdict(float)

    def update(self, track_id: int, attentive_now: bool, now: float | None = None) -> tuple[bool, float]:
        """Feed one frame's attention for a track. Returns (smoothed_attention, dwell_time)."""
        now = time.time() if now is None else now
        rec = self._recent[track_id]
        rec.append(bool(attentive_now))
        smoothed = len(rec) == self.smooth_frames and all(rec)  # require N consecutive

        start = self._session_start[track_id]
        if smoothed and start is None:
            self._session_start[track_id] = now
        elif not smoothed and start is not None:
            self._dwell[track_id] += now - start
            self._session_start[track_id] = None
        return smoothed, self.current_dwell(track_id, now)

    def current_dwell(self, track_id: int, now: float | None = None) -> float:
        now = time.time() if now is None else now
        start = self._session_start[track_id]
        live = (now - start) if start is not None else 0.0
        return self._dwell[track_id] + live

    def close(self, track_id: int, now: float | None = None) -> None:
        """Track disappeared: close any open session. Idempotent."""
        now = time.time() if now is None else now
        start = self._session_start[track_id]
        if start is not None:
            self._dwell[track_id] += now - start
            self._session_start[track_id] = None
        self._recent[track_id].clear()  # restart smoothing when the track returns

    def forget(self, track_id: int) -> None:
        """Drop a track's state entirely, once it is gone for good.

        Without this the dicts grow for the whole run, and a track_id recycled by
        ByteTrack would inherit the previous person's accumulated dwell.
        """
        self._recent.pop(track_id, None)
        self._session_start.pop(track_id, None)
        self._dwell.pop(track_id, None)
