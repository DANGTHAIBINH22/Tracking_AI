"""WebSocket push of the live audience snapshot.

Polling /api/analytics/live at 1 Hz would work, but the dashboard wants the
counter to move with the people in front of the camera, and the player page needs
to know the instant an advert changes so it can cut to the next creative without
a round trip.
"""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from server.routes.player import _now_playing
from server.settings import SETTINGS
from server.state import ENGINE

router = APIRouter(tags=["live"])


@router.websocket("/ws/live")
async def live_ws(ws: WebSocket) -> None:
    await ws.accept()
    try:
        while True:
            payload = ENGINE.snapshot()
            payload["now_playing"] = _now_playing().model_dump()
            await ws.send_json(payload)
            await asyncio.sleep(SETTINGS.stats_push_interval)
    except WebSocketDisconnect:
        return
    except Exception:
        # A client that vanished mid-send is normal; nothing to recover.
        return
