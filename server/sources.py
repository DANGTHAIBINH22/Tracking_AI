"""Where frames come from, behind one interface the engine can pull on.

Three sources, one contract:

    LocalCameraSource   cv2.VideoCapture — the API host's own webcam or a file
    PlaylistSource      several files back to back, for an unattended test run
    BrowserSource       JPEG frames pushed in from a browser over /ws/ingest

The point of the abstraction is that `AnalyticsEngine` keeps exactly one thread
pulling frames, whichever source is selected. The ingest websocket only decodes a
JPEG and drops the array in a slot; it never touches `Pipeline`. That is the same
invariant the engine has always had — two things feeding one Pipeline would
interleave two scenes into a single set of ByteTrack ids and quietly corrupt
every dwell time and unique count.

`read()` returns a tri-state so the engine can tell "nothing yet" from "over":

    (True,  frame)  a frame to process
    (True,  None)   nothing new right now — loop again (a browser between frames)
    (False, None)   the source is finished (end of a video file)
"""

from __future__ import annotations

import threading
import time

import cv2
import numpy as np

BROWSER_SOURCE = "browser"


def is_browser_source(spec: str | None) -> bool:
    return (spec or "").strip().lower() == BROWSER_SOURCE


class LocalCameraSource:
    """A webcam index ("0") or a video path/URL, read by OpenCV in-process.

    Live webcams run a background capture worker thread to continuously drain
    the OS buffer queue (crucial on macOS AVFoundation to avoid lag/delay accumulation).
    """

    def __init__(self, spec: str) -> None:
        self.spec = spec.strip()
        self.is_file = not self.spec.isdigit()
        self._cap: cv2.VideoCapture | None = None
        self._lock = threading.Lock()
        self._thread: threading.Thread | None = None
        self._running = False
        self._latest_frame: np.ndarray | None = None
        self._ok = False
        self._has_frame = threading.Event()

    def open(self) -> None:
        target: int | str = self.spec if self.is_file else int(self.spec)
        cap = cv2.VideoCapture(target)
        if not cap.isOpened():
            cap.release()
            raise RuntimeError(f"Không mở được nguồn video/camera: {self.spec!r}")
        if not self.is_file:
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
            cap.set(cv2.CAP_PROP_FPS, 30)
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            self._cap = cap
            self._running = True
            self._has_frame.clear()
            self._thread = threading.Thread(target=self._worker, daemon=True, name="cam-reader")
            self._thread.start()
            self._has_frame.wait(timeout=2.0)
        else:
            self._cap = cap

    def _worker(self) -> None:
        """Continuously read latest hardware frames and drop accumulated stale frames."""
        while self._running:
            if self._cap is None:
                break
            ok, frame = self._cap.read()
            if ok and frame is not None:
                with self._lock:
                    self._latest_frame = frame
                    self._ok = True
                self._has_frame.set()
            else:
                with self._lock:
                    self._ok = False
                time.sleep(0.01)
            time.sleep(0.001)

    @property
    def native_fps(self) -> float | None:
        if self._cap is None:
            return None
        fps = self._cap.get(cv2.CAP_PROP_FPS)
        return fps if fps and fps > 0 else None

    def read(self) -> tuple[bool, np.ndarray | None]:
        if self._cap is None:
            return False, None
        if self.is_file:
            ok, frame = self._cap.read()
            return (True, frame) if ok else (False, None)

        self._has_frame.wait(timeout=0.2)
        self._has_frame.clear()
        with self._lock:
            frame = self._latest_frame.copy() if self._latest_frame is not None else None
            return (self._ok, frame)

    def rewind(self) -> bool:
        """Restart a file source; a live camera has nothing to rewind to."""
        if self._cap is None or not self.is_file:
            return False
        self._cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
        return True

    def release(self) -> None:
        self._running = False
        if self._thread is not None:
            self._thread.join(timeout=1.0)
            self._thread = None
        if self._cap is not None:
            self._cap.release()
            self._cap = None
        self._latest_frame = None


class PlaylistSource:
    """Several video files played back to back, behind the single-source contract.

    Same shape as LocalCameraSource, so the engine cannot tell the difference —
    which is the point: one capture thread, one Pipeline, whatever is feeding it.

    The trick is `rewind()`. The engine already calls it at end-of-file and, when
    it returns True, flushes the open impressions and calls `Pipeline.reset()`
    before continuing. That reset is exactly what a clip change needs and is not
    optional: ByteTrack associates across frames, so without it the last person
    in clip A and the first person in clip B become one track id, merging two
    strangers into one viewer with a nonsense dwell time. So advancing the
    playlist here rides on the existing rewind path rather than adding a second
    one the engine would have to know about.

    Wraps around at the end. A finite queue that stops would leave the engine
    idle with `running` still true, which looks identical to a camera that has
    frozen.
    """

    SEPARATOR = "|"

    def __init__(self, specs: list[str]) -> None:
        self.specs = [s.strip() for s in specs if s and s.strip()]
        if not self.specs:
            raise ValueError("PlaylistSource cần ít nhất một đường dẫn video")
        self.spec = self.SEPARATOR.join(self.specs)
        self.is_file = True
        self._index = 0
        self._current: LocalCameraSource | None = None

    @property
    def current_spec(self) -> str:
        return self.specs[self._index]

    def open(self) -> None:
        self._open_current()

    def _open_current(self) -> None:
        if self._current is not None:
            self._current.release()
        self._current = LocalCameraSource(self.specs[self._index])
        self._current.open()

    @property
    def native_fps(self) -> float | None:
        return self._current.native_fps if self._current else None

    def read(self) -> tuple[bool, np.ndarray | None]:
        if self._current is None:
            return False, None
        return self._current.read()

    def rewind(self) -> bool:
        """Advance to the next clip. Named for the contract, not the behaviour."""
        self._index = (self._index + 1) % len(self.specs)
        try:
            self._open_current()
        except RuntimeError:
            # One unreadable clip must not end the run: skip past it. Every clip
            # failing would spin, so give up once we are back where we started.
            start = self._index
            while True:
                self._index = (self._index + 1) % len(self.specs)
                if self._index == start:
                    return False
                try:
                    self._open_current()
                    return True
                except RuntimeError:
                    continue
        return True

    def release(self) -> None:
        if self._current is not None:
            self._current.release()
            self._current = None


class BrowserSource:
    """A one-slot mailbox filled by the browser over /ws/ingest.

    Exactly one publisher at a time, on purpose. Two screens pushing their own
    webcam into one engine would mix two rooms into one set of track ids — the
    same corruption two capture threads would cause. A newcomer is refused while
    the incumbent is still sending, and takes over once the incumbent has gone
    quiet for `stale_after` (which is how a hard-crashed tab releases its claim
    without anyone restarting the server).
    """

    def __init__(self, stale_after: float = 5.0, max_bytes: int = 4_000_000) -> None:
        self._lock = threading.Lock()
        self._arrival = threading.Event()
        self._stale_after = stale_after
        self._max_bytes = max_bytes

        self._frame: np.ndarray | None = None
        self._publisher: str | None = None
        self._since = 0.0
        self._last_frame_at = 0.0
        self._frames = 0
        self._dropped = 0
        self._fps = 0.0

    # ---------- publisher registration ----------

    def claim(self, client: str) -> bool:
        with self._lock:
            live = (
                self._publisher is not None
                and self._publisher != client
                and (time.time() - self._last_frame_at) < self._stale_after
            )
            if live:
                return False
            self._publisher = client
            self._since = time.time()
            self._last_frame_at = time.time()
            self._frames = 0
            self._dropped = 0
            self._fps = 0.0
            return True

    def release(self, client: str) -> None:
        """Give up the claim — but only the holder may, so a rejected latecomer
        disconnecting cannot knock the live screen off the air."""
        with self._lock:
            if self._publisher == client:
                self._publisher = None
                self._frame = None
                self._fps = 0.0
        self._arrival.set()

    # ---------- producer side (websocket thread) ----------

    def publish(self, client: str, jpeg: bytes) -> bool:
        if len(jpeg) > self._max_bytes:
            with self._lock:
                self._dropped += 1
            return False
        frame = cv2.imdecode(np.frombuffer(jpeg, np.uint8), cv2.IMREAD_COLOR)
        if frame is None:
            with self._lock:
                self._dropped += 1
            return False

        now = time.time()
        with self._lock:
            if self._publisher != client:
                return False
            gap = now - self._last_frame_at
            if 0 < gap < 5.0:
                # Smoothed so one hiccup on the wifi does not read as a stall in
                # the admin page.
                self._fps = (
                    (1.0 / gap) if self._fps == 0.0 else 0.8 * self._fps + 0.2 / gap
                )
            self._frame = frame  # newest wins; a late frame is worthless
            self._last_frame_at = now
            self._frames += 1
        self._arrival.set()
        return True

    # ---------- consumer side (analytics thread) ----------

    def open(self) -> None:
        self._arrival.clear()

    def read(self, timeout: float = 0.5) -> tuple[bool, np.ndarray | None]:
        self._arrival.wait(timeout)
        self._arrival.clear()
        with self._lock:
            frame, self._frame = self._frame, None
        # Never (False, None): a screen that is reloading is not a finished
        # source, so the engine waits for it rather than shutting itself down.
        return True, frame

    def release_frames(self) -> None:
        with self._lock:
            self._frame = None

    # ---------- introspection ----------

    @property
    def connected(self) -> bool:
        with self._lock:
            return (
                self._publisher is not None
                and (time.time() - self._last_frame_at) < self._stale_after
            )

    def status(self) -> dict:
        with self._lock:
            age = (time.time() - self._last_frame_at) if self._publisher else None
            return {
                "connected": self._publisher is not None
                and (age or 0) < self._stale_after,
                "client": self._publisher,
                "frames": self._frames,
                "dropped": self._dropped,
                "fps": round(self._fps, 1),
                "last_frame_age": None if age is None else round(age, 2),
                "since": self._since or None,
            }

    def rewind(self) -> bool:
        """Nothing to rewind — a browser stream has no beginning to go back to."""
        return False
