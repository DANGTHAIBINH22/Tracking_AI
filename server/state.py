"""Process-wide singletons.

One player and one engine per process. They are module-level for the same reason
`configs.CFG` is: there is exactly one screen and exactly one camera, and giving
each request its own Pipeline would mean each request had its own set of track
ids.
"""

from __future__ import annotations

from server.engine import AnalyticsEngine
from server.player import PlaylistPlayer

PLAYER = PlaylistPlayer()
ENGINE = AnalyticsEngine(PLAYER)
