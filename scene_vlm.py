"""3 - Periodic scene understanding via VLM (Moondream2). OPTIONAL, Phase 6.

Runs in its own thread every 1-2 minutes; never blocks the real-time loop. The main
loop reads the latest result through a lock/shared-state, without waiting.

Core risk: free-form VLM captions are brittle to parse. Mitigation = closed VQA:
    "Is it raining? Answer yes or no."
    "How many people are in the image? Answer a number."
Validate on 10-15 target-like images BEFORE designing the parser (biggest risk).

Dependencies for this branch are intentionally NOT in the base env; install from
requirements-vlm.txt when you reach Phase 6.
"""

from __future__ import annotations

import threading
from dataclasses import dataclass, field

from configs import CFG


@dataclass
class SceneContext:
    weather: str | None = None
    crowd_activity: str | None = None
    objects: list[str] = field(default_factory=list)


class SceneVLM:
    """Background Moondream worker exposing the latest SceneContext."""

    def __init__(self, period_seconds: float = CFG.vlm_period_seconds):
        self.period_seconds = period_seconds
        self._latest = SceneContext()
        self._lock = threading.Lock()
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self._model = None  # lazy-loaded in Phase 6

    @property
    def latest(self) -> SceneContext:
        with self._lock:
            return self._latest

    def submit_frame(self, frame_bgr) -> None:
        """Hand the newest full frame to the worker (downscaled inside)."""
        raise NotImplementedError("Phase 6: stash frame for the worker thread.")

    def start(self) -> None:
        raise NotImplementedError("Phase 6: spawn worker thread running the VQA loop.")

    def stop(self) -> None:
        self._stop.set()
