"""Server-side settings. Distinct from configs.CFG on purpose.

`configs.CFG` tunes the vision stages (thresholds, model paths, device). This file
holds only what the SERVICE needs: where uploads live, what counts as a viewer,
how long an image creative stays on screen. Nothing here changes a model's
behaviour, so the two can be retuned independently.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

from configs import ROOT

_ENV_FILE = ROOT / ".env"
if _ENV_FILE.is_file():
    load_dotenv(_ENV_FILE)
else:
    load_dotenv()

MEDIA_DIR = Path(os.environ.get("SIGNAGE_MEDIA_DIR", ROOT / "media"))
# The database lives in server/db.py behind DATABASE_URL — it is a connection
# string, not a path, so it does not belong in this file.


@dataclass
class ServerSettings:
    # ---- capture ----
    # "0", "1", ... = webcam index; anything else is treated as a video path/URL.
    default_source: str = os.environ.get("SIGNAGE_SOURCE", "0")
    loop_video_source: bool = True  # rewind a file source at EOF (kiosk demo)
    capture_max_fps: float = 30.0  # cap the grab loop so a file source can't spin

    # ---- attribution ----
    # A track has to hold attention this long inside one airing before it counts as
    # an impression. Below this you are counting glances and tracker flicker.
    min_attention_seconds: float = 1.0
    # A track has to be visible this long at all before it is counted as a viewer.
    min_presence_seconds: float = 0.5

    # ---- playback ----
    default_image_seconds: float = 8.0  # how long a still image holds the screen

    # ---- browser ingest (getUserMedia) ----
    # Hints handed to the screen so the capture rate is tuned server-side rather
    # than baked into the page. 12 fps at 960px is enough for tracking a person
    # walking past and small enough to survive shop wifi.
    ingest_target_fps: float = 25.0
    ingest_max_width: int = 640
    ingest_jpeg_quality: float = 0.65
    # A publisher that has gone this long without a frame has lost its claim, so
    # a crashed tab cannot hold the screen hostage until someone restarts.
    ingest_stale_after: float = 5.0
    ingest_max_frame_bytes: int = 4_000_000

    # ---- streaming ----
    mjpeg_quality: int = 70
    stats_push_interval: float = 1.0  # seconds between websocket pushes

    cors_origins: tuple[str, ...] = ("http://localhost:3000", "http://127.0.0.1:3000")


SETTINGS = ServerSettings()
